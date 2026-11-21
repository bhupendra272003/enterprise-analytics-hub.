type Env = { DB: D1Database; APP_ORIGIN: string; MAIL_API_KEY?: string; MAIL_FROM?: string };
type User = { id:string; email:string; account_status:string };
type Role = "OWNER"|"MANAGER"|"LEADER"|"ANALYST";
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
const getUser=async(req:Request,env:Env):Promise<User|null>=>{
 const cookie=req.headers.get("Cookie")||"";
 const sid=cookie.split(";").map(v=>v.trim()).find(v=>v.startsWith("hub.sid="))?.slice(8);
 if(!sid)return null;
 return env.DB.prepare("SELECT u.id,u.email,u.account_status FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.expires_at>unixepoch()").bind(decodeURIComponent(sid)).first<User>();
};
const member=async(env:Env,orgId:string,userId:string)=>env.DB.prepare("SELECT role FROM memberships WHERE organization_id=? AND user_id=? AND membership_status='ACTIVE'").bind(orgId,userId).first<{role:Role}>();
const audit=(env:Env,orgId:string,userId:string,action:string,id:string,metadata?:unknown)=>env.DB.prepare("INSERT INTO audit_logs (organization_id,actor_user_id,action,target_type,target_id,metadata) VALUES (?,?,?,'INVITATION',?,?)").bind(orgId,userId,action,id,metadata===undefined?null:JSON.stringify(metadata)).run();
const hash=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)))).map(v=>v.toString(16).padStart(2,"0")).join("");
const hashPassword=async(password:string)=>{
 const salt=crypto.getRandomValues(new Uint8Array(16));
 const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveBits"]);
 const bits=new Uint8Array(await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt,iterations:100000},key,256));
 const hex=(v:Uint8Array)=>Array.from(v,b=>b.toString(16).padStart(2,"0")).join("");
 return `pbkdf2-sha256$100000$${hex(salt)}$${hex(bits)}`;
};
const validEmail=(v:unknown):v is string=>typeof v==="string"&&v.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
async function sendInvite(env:Env,to:string,url:string){
 if(!env.MAIL_API_KEY||!env.MAIL_FROM)return false;
 const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"authorization":"Bearer "+env.MAIL_API_KEY,"content-type":"application/json"},body:JSON.stringify({from:env.MAIL_FROM,to,subject:"You are invited to NEXUS Analytics",text:"You have been invited to join a NEXUS Analytics workspace. Accept your invitation here: "+url+"\n\nThis one-time link expires in 7 days."})});
 return response.ok;
}
export async function handleInvitations(req:Request,env:Env,path:string):Promise<Response|null>{
 const user=await getUser(req,env);
 if(path==="/api/invitations/accept"&&req.method==="POST"){
  if(!user)return json({error:"Authentication required."},401);
  if(user.account_status==="SUSPENDED")return json({error:"This account has been suspended."},403);
  let body:any;try{body=await req.json();}catch{return json({error:"Invalid JSON body."},400);}
  if(typeof body.token!=="string"||body.token.length<32||body.token.length>256)return json({error:"Invalid invitation token."},400);
  const tokenHash=await hash(body.token);
  const invite=await env.DB.prepare("SELECT id,organization_id,email,role,invited_by FROM invitations WHERE token_hash=? AND accepted_at IS NULL AND expires_at>datetime('now')").bind(tokenHash).first<{id:string;organization_id:string;email:string;role:Role;invited_by:string}>();
  if(!invite||invite.email.toLowerCase()!==user.email.toLowerCase())return json({error:"Invitation is invalid, expired, or belongs to another email."},400);
  try{
   await env.DB.batch([
    env.DB.prepare("INSERT INTO memberships (id,organization_id,user_id,role,membership_status) VALUES (?,?,?,?,'ACTIVE') ON CONFLICT(organization_id,user_id) DO UPDATE SET role=excluded.role,membership_status='ACTIVE'").bind(crypto.randomUUID(),invite.organization_id,user.id,invite.role),
    env.DB.prepare("UPDATE invitations SET accepted_at=datetime('now') WHERE id=? AND accepted_at IS NULL").bind(invite.id),
    env.DB.prepare("INSERT INTO notifications (id,user_id,organization_id,type,title,message,href) VALUES (?,?,?,'INVITATION_ACCEPTED','Invitation accepted','Your organization invitation was accepted.','/workspace/team')").bind(crypto.randomUUID(),invite.invited_by,invite.organization_id)
   ]);
  }catch{return json({error:"Invitation could not be accepted. It may already have been used."},409);}
  await audit(env,invite.organization_id,user.id,"INVITATION_ACCEPTED",invite.id);
  return json({message:"Invitation accepted."});
 }
 if(path==="/api/invitations/accept-signup"&&req.method==="POST"){
  let body:any;try{body=await req.json();}catch{return json({error:"Invalid JSON body."},400);}
  const token=body.token,fullName=typeof body.fullName==="string"?body.fullName.trim():"",password=body.password;
  if(typeof token!=="string"||token.length<32||token.length>256||fullName.length<2||fullName.length>120||typeof password!=="string"||password.length<12||password.length>128)return json({error:"Enter a valid invitation, full name, and password (12–128 characters)."},400);
  const tokenHash=await hash(token);
  const invite=await env.DB.prepare("SELECT id,organization_id,email,role,invited_by FROM invitations WHERE token_hash=? AND accepted_at IS NULL AND expires_at>datetime('now')").bind(tokenHash).first<{id:string;organization_id:string;email:string;role:Role;invited_by:string}>();
  if(!invite)return json({error:"Invitation is invalid or expired."},400);
  const existing=await env.DB.prepare("SELECT id FROM users WHERE email=?").bind(invite.email.toLowerCase()).first();
  if(existing)return json({error:"An account already exists for this email. Sign in first, then accept the invitation."},409);
  const passwordHash=await hashPassword(password);
  const userId=crypto.randomUUID(),sessionId=crypto.randomUUID();
  try{
   await env.DB.batch([
    env.DB.prepare("INSERT INTO users (id,full_name,email,password_hash,account_status,email_verified_at) VALUES (?,?,?,?,'ACTIVE',datetime('now'))").bind(userId,fullName,invite.email.toLowerCase(),passwordHash),
    env.DB.prepare("INSERT INTO memberships (id,organization_id,user_id,role,membership_status) VALUES (?,?,?,?,'ACTIVE')").bind(crypto.randomUUID(),invite.organization_id,userId,invite.role),
    env.DB.prepare("UPDATE invitations SET accepted_at=datetime('now') WHERE id=? AND accepted_at IS NULL").bind(invite.id),
    env.DB.prepare("INSERT INTO sessions (id,user_id,expires_at) VALUES (?,?,?)").bind(sessionId,userId,Math.floor(Date.now()/1000)+28800),
    env.DB.prepare("INSERT INTO notifications (id,user_id,organization_id,type,title,message,href) VALUES (?,?,?,'INVITATION_ACCEPTED','Invitation accepted','Your organization invitation was accepted.','/workspace/team')").bind(crypto.randomUUID(),invite.invited_by,invite.organization_id)
   ]);
  }catch{return json({error:"Account could not be created. This invitation may already have been used."},409);}
  await audit(env,invite.organization_id,userId,"INVITATION_ACCEPTED_WITH_SIGNUP",invite.id);
  const headers=new Headers({"content-type":"application/json; charset=utf-8","cache-control":"no-store","set-cookie":"hub.sid="+encodeURIComponent(sessionId)+"; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=28800"});
  return new Response(JSON.stringify({message:"Account created and invitation accepted."}),{status:201,headers});
 }
 const create=path.match(/^\/api\/organizations\/([^/]+)\/invitations$/);
 if(create&&req.method==="POST"){
  if(!user)return json({error:"Authentication required."},401);
  if(user.account_status!=="ACTIVE")return json({error:"An active account is required."},403);
  const orgId=create[1],m=await member(env,orgId,user.id);
  if(!m||m.role!=="OWNER")return json({error:"Only the Owner can invite members and assign organization roles."},403);
  let body:any;try{body=await req.json();}catch{return json({error:"Invalid JSON body."},400);}
  const email=typeof body.email==="string"?body.email.trim().toLowerCase():"",role=body.role;
  if(!validEmail(email)||!["MANAGER","LEADER","ANALYST"].includes(role))return json({error:"Enter a valid email and choose Manager, Leader or Analyst."},400);
  const org=await env.DB.prepare("SELECT name FROM organizations WHERE id=?").bind(orgId).first<{name:string}>();
  if(!org)return json({error:"Organization not found."},404);
  const token=Array.from(crypto.getRandomValues(new Uint8Array(32))).map(v=>v.toString(16).padStart(2,"0")).join("");
  const id=crypto.randomUUID(),tokenHash=await hash(token);
  await env.DB.prepare("INSERT INTO invitations (id,organization_id,email,role,token_hash,invited_by,expires_at) VALUES (?,?,?,?,?,?,datetime('now','+7 days'))").bind(id,orgId,email,role,tokenHash,user.id).run();
  await audit(env,orgId,user.id,"INVITATION_CREATED",id,{email,role});
  const existing=await env.DB.prepare("SELECT id FROM users WHERE email=?").bind(email).first<{id:string}>();
  if(existing)await env.DB.prepare("INSERT INTO notifications (id,user_id,organization_id,type,title,message,href) VALUES (?,?,?,'INVITATION','You have a workspace invitation','An organization administrator invited you to join a workspace.','/workspace')").bind(crypto.randomUUID(),existing.id,orgId).run();
  const invitationUrl=env.APP_ORIGIN.replace(/\/$/,"")+"/accept-invite?token="+encodeURIComponent(token);
  let emailSent=false;try{emailSent=await sendInvite(env,email,invitationUrl);}catch{}
  return json({message:emailSent?"Invitation email sent successfully.":"Invitation created. Share this one-time link privately.",...(!emailSent?{invitationUrl}:{})},201);
 }
 return null;
}
