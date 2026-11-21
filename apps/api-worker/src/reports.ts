type Env={DB:D1Database};
type User={id:string;account_status:string};
type Role="OWNER"|"MANAGER"|"LEADER"|"ANALYST";
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
const getUser=async(req:Request,env:Env):Promise<User|null>=>{
 const raw=req.headers.get("Cookie")||"",sid=raw.split(";").map(v=>v.trim()).find(v=>v.startsWith("hub.sid="))?.slice(8);
 if(!sid)return null;
 return env.DB.prepare("SELECT u.id,u.account_status FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.expires_at>unixepoch()").bind(decodeURIComponent(sid)).first<User>();
};
const membership=async(env:Env,orgId:string,userId:string)=>env.DB.prepare("SELECT role FROM memberships WHERE organization_id=? AND user_id=? AND membership_status='ACTIVE'").bind(orgId,userId).first<{role:Role}>();
const audit=(env:Env,orgId:string,userId:string,action:string,id:string,metadata?:unknown)=>env.DB.prepare("INSERT INTO audit_logs (organization_id,actor_user_id,action,target_type,target_id,metadata) VALUES (?,?,?,'REPORT',?,?)").bind(orgId,userId,action,id,metadata===undefined?null:JSON.stringify(metadata)).run();
const canManage=(role:Role)=>["OWNER","ADMIN","MANAGER"].includes(role);
const validReportUrl=(value:string)=>{try{const u=new URL(value);return u.protocol==="https:"&&["app.powerbi.com","app.powerbi.de","app.powerbigov.us"].includes(u.hostname);}catch{return false;}};
export async function handleReports(req:Request,env:Env,path:string):Promise<Response|null>{
 if(!path.startsWith("/api/reports/")&&!(/^\/api\/organizations\/[^/]+\/reports$/.test(path)))return null;
 const user=await getUser(req,env);if(!user)return json({error:"Authentication required."},401);
 if(user.account_status==="SUSPENDED")return json({error:"This account has been suspended."},403);
 const orgMatch=path.match(/^\/api\/organizations\/([^/]+)\/reports$/);
 if(orgMatch&&req.method==="GET"){
  const orgId=orgMatch[1],m=await membership(env,orgId,user.id);if(!m)return json({error:"Insufficient organization permissions."},403);
  const {results}=await env.DB.prepare("SELECT r.id,r.title,r.description,r.report_url AS reportUrl,r.created_at AS createdAt,u.full_name AS createdBy FROM reports r JOIN users u ON u.id=r.created_by WHERE r.organization_id=? AND r.status='ACTIVE' ORDER BY r.created_at DESC").bind(orgId).all();
  return json({reports:results});
 }
 if(orgMatch&&req.method==="POST"){
  const orgId=orgMatch[1],m=await membership(env,orgId,user.id);if(!m||!canManage(m.role))return json({error:"Insufficient organization permissions."},403);
  let body:any={};try{body=await req.json();}catch{return json({error:"Invalid report details."},400);}
  const title=typeof body.title==="string"?body.title.trim():"",description=typeof body.description==="string"?body.description.trim():"",reportUrl=typeof body.reportUrl==="string"?body.reportUrl.trim():"";
  if(title.length<2||title.length>160||description.length>1000||reportUrl.length>2048||!validReportUrl(reportUrl))return json({error:"Enter a valid title and secure Power BI report URL."},400);
  const id=crypto.randomUUID();
  await env.DB.batch([
   env.DB.prepare("INSERT INTO reports (id,organization_id,title,description,report_url,created_by) VALUES (?,?,?,?,?,?)").bind(id,orgId,title,description,reportUrl,user.id),
   env.DB.prepare("INSERT INTO notifications (id,user_id,organization_id,type,title,message,href) SELECT lower(hex(randomblob(16))),user_id,?,'REPORT_ADDED','New Power BI report','A new report was added to your organization workspace.','/workspace/reports' FROM memberships WHERE organization_id=? AND membership_status='ACTIVE' AND user_id<>?").bind(orgId,orgId,user.id)
  ]);
  await audit(env,orgId,user.id,"REPORT_REGISTERED",id,{title});
  return json({report:{id,title,description,reportUrl}},201);
 }
 const archiveMatch=path.match(/^\/api\/reports\/([^/]+)\/archive$/);
 if(archiveMatch&&req.method==="PATCH"){
  const report=await env.DB.prepare("SELECT organization_id FROM reports WHERE id=? AND status='ACTIVE'").bind(archiveMatch[1]).first<{organization_id:string}>();
  if(!report)return json({error:"Report not found."},404);
  const m=await membership(env,report.organization_id,user.id);if(!m||!canManage(m.role))return json({error:"Insufficient organization permissions."},403);
  await env.DB.prepare("UPDATE reports SET status='ARCHIVED',updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=? AND status='ACTIVE'").bind(archiveMatch[1],report.organization_id).run();
  await audit(env,report.organization_id,user.id,"REPORT_ARCHIVED",archiveMatch[1]);
  return json({message:"Report archived."});
 }
 return null;
}
