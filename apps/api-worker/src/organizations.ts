type Env = { DB: D1Database };
import { canCreateOrganization } from "./role-policy";
type SessionUser = { id: string; full_name: string; email: string; account_status: string; email_verified_at: string | null };
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const getUser = async (request: Request, env: Env): Promise<SessionUser | null> => {
  const cookie = request.headers.get("Cookie") || "";
  const sid = cookie.split(";").map(v => v.trim()).find(v => v.startsWith("hub.sid="))?.slice(8);
  if (!sid) return null;
  return await env.DB.prepare("SELECT u.id,u.full_name,u.email,u.account_status,u.email_verified_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.expires_at>unixepoch()").bind(decodeURIComponent(sid)).first<SessionUser>();
};
const membership = async (env: Env, orgId: string, userId: string) =>
  env.DB.prepare("SELECT role FROM memberships WHERE organization_id=? AND user_id=? AND membership_status='ACTIVE'").bind(orgId,userId).first<{role:string}>();
const audit = async (env: Env, orgId: string, actor: string, action: string, targetType: string, targetId: string, metadata?: unknown) =>
  env.DB.prepare("INSERT INTO audit_logs (organization_id,actor_user_id,action,target_type,target_id,metadata) VALUES (?,?,?,?,?,?)").bind(orgId,actor,action,targetType,targetId,metadata ? JSON.stringify(metadata) : null).run();

export async function handleOrganizations(request: Request, env: Env, path: string): Promise<Response | null> {
  if (path === "/api/organizations/directory" && request.method === "GET") {
    const {results}=await env.DB.prepare("SELECT id,name,slug FROM organizations ORDER BY name LIMIT 200").all();
    return reply({organizations:results});
  }
  const user = await getUser(request,env);
  if (!user) return reply({error:"Authentication required."},401);
  if (user.account_status === "SUSPENDED") return reply({error:"This account has been suspended."},403);

  const requestAccessMatch=path.match(/^\/api\/organizations\/([^/]+)\/request-access$/);
  if(requestAccessMatch && request.method==="POST") {
    const orgId=requestAccessMatch[1];
    if(!user.email_verified_at) return reply({error:"Verify your email before requesting organization access."},403);
    const org=await env.DB.prepare("SELECT id FROM organizations WHERE id=?").bind(orgId).first();
    if(!org) return reply({error:"Organization not found."},404);
    const active=await env.DB.prepare("SELECT id FROM memberships WHERE organization_id=? AND user_id=? AND membership_status='ACTIVE'").bind(orgId,user.id).first();
    if(active) return reply({error:"You are already an active member of this organization."},409);
    const pending=await env.DB.prepare("SELECT id FROM organization_access_requests WHERE organization_id=? AND user_id=? AND status='PENDING'").bind(orgId,user.id).first();
    if(pending) return reply({error:"Your access request is already pending."},409);
    const id=crypto.randomUUID();
    try {
      await env.DB.batch([
        env.DB.prepare("INSERT INTO organization_access_requests (id,organization_id,user_id,status) VALUES (?,?,?,'PENDING')").bind(id,orgId,user.id),
        env.DB.prepare("INSERT INTO audit_logs (organization_id,actor_user_id,action,target_type,target_id) VALUES (?,?, 'ACCESS_REQUEST_SUBMITTED','ACCESS_REQUEST',?)").bind(orgId,user.id,id)
      ]);
    } catch {
      return reply({error:"Your access request is already pending."},409);
    }
    const {results:admins}=await env.DB.prepare("SELECT user_id FROM memberships WHERE organization_id=? AND role IN ('OWNER','MANAGER') AND membership_status='ACTIVE'").bind(orgId).all<{user_id:string}>();
    for(const admin of admins) await env.DB.prepare("INSERT INTO notifications (id,user_id,organization_id,type,title,message,href) VALUES (?,?,?,'ACCESS_REQUEST','New access request','A user requested to join your organization.','/workspace/team')").bind(crypto.randomUUID(),admin.user_id,orgId).run();
    return reply({message:"Access request submitted. An organization administrator can now review it."},201);
  }

  if (path === "/api/organizations" && request.method === "GET") {
    // One-time, owner-scoped legacy workspace rename. Keep the existing ID and
    // slug intact so memberships, invitations, projects and saved links survive.
    const {results:legacyOwned} = await env.DB.prepare("SELECT o.id FROM organizations o JOIN memberships m ON m.organization_id=o.id WHERE m.user_id=? AND m.role='OWNER' AND m.membership_status='ACTIVE' AND o.name COLLATE NOCASE='Vyron'").bind(user.id).all<{id:string}>();
    for (const org of legacyOwned) {
      await env.DB.batch([
        env.DB.prepare("UPDATE organizations SET name=? WHERE id=? AND name COLLATE NOCASE='Vyron'").bind("Bhupendra's Vyron",org.id),
        env.DB.prepare("INSERT INTO audit_logs (organization_id,actor_user_id,action,target_type,target_id,metadata) VALUES (?,?, 'ORGANIZATION_RENAMED','ORGANIZATION',?,?)").bind(org.id,user.id,org.id,JSON.stringify({from:"Vyron",to:"Bhupendra's Vyron"}))
      ]);
    }
    const {results} = await env.DB.prepare("SELECT o.id,o.name,o.slug,o.industry,m.role FROM organizations o JOIN memberships m ON m.organization_id=o.id WHERE m.user_id=? AND m.membership_status='ACTIVE' ORDER BY o.name").bind(user.id).all();
    return reply({organizations:results});
  }

  if (path === "/api/organizations" && request.method === "POST") {
    const platformAdmin = await env.DB.prepare("SELECT 1 AS allowed FROM platform_admins WHERE user_id=? AND role='SUPER_ADMIN' LIMIT 1").bind(user.id).first();
    const ownerMembership = await env.DB.prepare("SELECT 1 AS allowed FROM memberships WHERE user_id=? AND role='OWNER' AND membership_status='ACTIVE' LIMIT 1").bind(user.id).first();
    if (!canCreateOrganization(!!platformAdmin,!!ownerMembership)) return reply({error:"Only organization owners can create a new organization."},403);
    if (!user.email_verified_at) return reply({error:"Verify your email before creating a workspace."},403);
    let body: any; try { body=await request.json(); } catch { return reply({error:"Invalid JSON body."},400); }
    const name=typeof body.name==="string"?body.name.trim():"";
    const slug=typeof body.slug==="string"?body.slug.trim().toLowerCase():"";
    const industry=typeof body.industry==="string"?body.industry.trim().toUpperCase():"";
    if(name.length<2||name.length>160||!/^[a-z0-9-]{3,180}$/.test(slug)||!["BFSI","ECOMMERCE","LOGISTICS","HOTELS"].includes(industry)) return reply({error:"Enter a valid workspace name, URL slug and industry."},400);
    const id=crypto.randomUUID();
    try {
      await env.DB.batch([
        env.DB.prepare("INSERT INTO organizations (id,name,slug,created_by,industry) VALUES (?,?,?,?,?)").bind(id,name,slug,user.id,industry),
        env.DB.prepare("INSERT INTO memberships (id,organization_id,user_id,role,membership_status) VALUES (?,?,?,'OWNER','ACTIVE')").bind(crypto.randomUUID(),id,user.id),
        env.DB.prepare("INSERT INTO audit_logs (organization_id,actor_user_id,action,target_type,target_id) VALUES (?,?, 'ORGANIZATION_CREATED','ORGANIZATION',?)").bind(id,user.id,id)
      ]);
    } catch { return reply({error:"Workspace could not be created. The URL slug may already be in use."},409); }
    return reply({organization:{id,name,slug,industry,role:"OWNER"}},201);
  }

  const profileMatch=path.match(/^\\/api\\/organizations\\/([^/]+)\\/profile$/);
  if(profileMatch) {
    const orgId=profileMatch[1], m=await membership(env,orgId,user.id);
    if(!m) return reply({error:"Active organization membership required."},403);
    const org=await env.DB.prepare("SELECT id,name,slug,industry,profile_json FROM organizations WHERE id=?").bind(orgId).first<any>();
    if(!org) return reply({error:"Organization not found."},404);
    let currentProfile:any={};try{currentProfile=JSON.parse(String(org.profile_json||"{}"));}catch{currentProfile={};}
    if(request.method==="GET") return reply({organization:{id:org.id,name:org.name,slug:org.slug,industry:org.industry||"BFSI",profile:currentProfile,role:m.role}});
    if(request.method==="PATCH") {
      if(m.role!=="OWNER") return reply({error:"Only the organization Owner can edit company profile and branding."},403);
      let body:any;try{body=await request.json();}catch{return reply({error:"Invalid JSON body."},400);}
      const name=body.name===undefined?String(org.name):typeof body.name==="string"?body.name.trim():"";
      const industry=body.industry===undefined?String(org.industry||"BFSI"):typeof body.industry==="string"?body.industry.trim().toUpperCase():"";
      const tagline=body.tagline===undefined?String(currentProfile.tagline||""):typeof body.tagline==="string"?body.tagline.trim():"";
      const description=body.description===undefined?String(currentProfile.description||""):typeof body.description==="string"?body.description.trim():"";
      const primaryColor=body.primaryColor===undefined?String(currentProfile.primaryColor||"#D6C49C"):typeof body.primaryColor==="string"?body.primaryColor.trim():"";
      const accentColor=body.accentColor===undefined?String(currentProfile.accentColor||"#8FB7E8"):typeof body.accentColor==="string"?body.accentColor.trim():"";
      if(name.length<2||name.length>160||![ "BFSI","ECOMMERCE","LOGISTICS","HOTELS" ].includes(industry)||tagline.length>140||description.length>600||!/^#[0-9a-fA-F]{6}$/.test(primaryColor)||!/^#[0-9a-fA-F]{6}$/.test(accentColor)) return reply({error:"Check the organization name, industry, tagline, description and six-digit brand colors."},400);
      const profile={tagline,description,primaryColor,accentColor};
      await env.DB.batch([
        env.DB.prepare("UPDATE organizations SET name=?,industry=?,profile_json=? WHERE id=?").bind(name,industry,JSON.stringify(profile),orgId),
        env.DB.prepare("INSERT INTO audit_logs (organization_id,actor_user_id,action,target_type,target_id,metadata) VALUES (?,?, 'ORGANIZATION_PROFILE_UPDATED','ORGANIZATION',?,?)").bind(orgId,user.id,orgId,JSON.stringify({industry,brandingUpdated:true}))
      ]);
      return reply({message:"Company profile and branding saved.",organization:{id:orgId,name,slug:org.slug,industry,profile,role:m.role}});
    }
    return reply({error:"Method not allowed."},405);
  }

  const activityMatch=path.match(/^\\/api\\/organizations\\/([^/]+)\\/activity$/);
  if(activityMatch && request.method==="GET") {
    const orgId=activityMatch[1],m=await membership(env,orgId,user.id);
    if(!m) return reply({error:"Active organization membership required."},403);
    const requested=Number(new URL(request.url).searchParams.get("limit")||"40");
    const limit=Number.isFinite(requested)?Math.max(1,Math.min(100,Math.floor(requested))):40;
    const {results}=await env.DB.prepare("SELECT a.id,a.action,a.target_type AS targetType,a.target_id AS targetId,a.metadata,u.full_name AS actorName,u.email AS actorEmail,a.created_at AS createdAt FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_user_id WHERE a.organization_id=? AND (? IN ('OWNER','MANAGER') OR a.actor_user_id=? OR (?='LEADER' AND a.target_type='TEAM' AND a.target_id IN (SELECT id FROM teams WHERE organization_id=? AND leader_user_id=?)) OR (?='LEADER' AND a.target_type='TASK' AND a.target_id IN (SELECT t.id FROM tasks t JOIN teams tm ON tm.id=t.team_id WHERE tm.organization_id=? AND tm.leader_user_id=?)) OR (?='ANALYST' AND a.target_type='TASK' AND a.target_id IN (SELECT id FROM tasks WHERE assignee_id=?))) ORDER BY a.id DESC LIMIT ?").bind(orgId,m.role,user.id,m.role,orgId,user.id,m.role,orgId,user.id,m.role,user.id,limit).all<any>();
    return reply({events:results.map((event:any)=>{let metadata:any=null;try{metadata=event.metadata?JSON.parse(event.metadata):null;}catch{}return {...event,metadata};})});
  }

  const auditMatch=path.match(/^\\/api\\/organizations\\/([^/]+)\\/audit$/);
  if(auditMatch && request.method==="GET") {
    const orgId=auditMatch[1],m=await membership(env,orgId,user.id);
    if(!m||m.role!=="OWNER") return reply({error:"Audit activity is available to the organization Owner."},403);
    const requested=Number(new URL(request.url).searchParams.get("limit")||"100");
    const limit=Number.isFinite(requested)?Math.max(1,Math.min(200,Math.floor(requested))):100;
    const {results}=await env.DB.prepare("SELECT a.id,a.action,a.target_type AS targetType,a.target_id AS targetId,a.metadata,u.full_name AS actorName,u.email AS actorEmail,a.created_at AS createdAt,a.ip_address AS ipAddress FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_user_id WHERE a.organization_id=? ORDER BY a.id DESC LIMIT ?").bind(orgId,limit).all<any>();
    return reply({events:results.map((event:any)=>{let metadata:any=null;try{metadata=event.metadata?JSON.parse(event.metadata):null;}catch{}return {...event,metadata};})});
  }

  const memberMatch=path.match(/^\/api\/organizations\/([^/]+)\/members$/);
  if(memberMatch && request.method==="GET") {
    const orgId=memberMatch[1], m=await membership(env,orgId,user.id);
    if(!m||!["OWNER","MANAGER"].includes(m.role)) return reply({error:"Insufficient organization permissions."},403);
    const {results}=await env.DB.prepare("SELECT u.id,u.full_name AS fullName,u.email,u.account_status AS accountStatus,m.role,m.membership_status AS membershipStatus,m.created_at AS joinedAt FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.organization_id=? ORDER BY m.created_at DESC").bind(orgId).all();
    return reply({members:results});
  }

  const updateMatch=path.match(/^\/api\/organizations\/([^/]+)\/members\/([^/]+)$/);
  if(updateMatch && request.method==="PATCH") {
    const [,orgId,targetId]=updateMatch, m=await membership(env,orgId,user.id);
    if(!m||m.role!=="OWNER") return reply({error:"Insufficient organization permissions."},403);
    if(targetId===user.id) return reply({error:"You cannot change your own membership here."},400);
    let body:any; try { body=await request.json(); } catch { return reply({error:"Invalid JSON body."},400); }
    const role=body.role, status=body.membershipStatus;
    if((role!==undefined&&!["MANAGER","LEADER","ANALYST"].includes(role))||(status!==undefined&&!["ACTIVE","SUSPENDED"].includes(status))||(role===undefined&&status===undefined)) return reply({error:"Invalid membership update."},400);
    const target=await env.DB.prepare("SELECT role FROM memberships WHERE organization_id=? AND user_id=?").bind(orgId,targetId).first<{role:string}>();
    if(!target) return reply({error:"Organization member not found."},404);
    if(target.role==="OWNER") return reply({error:"The organization owner cannot be modified here."},403);
    await env.DB.prepare("UPDATE memberships SET role=COALESCE(?,role),membership_status=COALESCE(?,membership_status) WHERE organization_id=? AND user_id=?").bind(role??null,status??null,orgId,targetId).run();
    await audit(env,orgId,user.id,"MEMBERSHIP_UPDATED","MEMBERSHIP",targetId,{role:role??null,membershipStatus:status??null});
    await env.DB.prepare("INSERT INTO notifications (id,user_id,organization_id,type,title,message,href) VALUES (?,?,?,'MEMBERSHIP_UPDATED','Your workspace access changed','Your organization role or membership status was updated.','/workspace')").bind(crypto.randomUUID(),targetId,orgId).run();
    return reply({message:"Member access updated."});
  }

  const accessMatch=path.match(/^\/api\/organizations\/([^/]+)\/requests$/);
  if(accessMatch && request.method==="GET") {
    const orgId=accessMatch[1], m=await membership(env,orgId,user.id);
    if(!m||!["OWNER","MANAGER"].includes(m.role)) return reply({error:"Insufficient organization permissions."},403);
    const {results}=await env.DB.prepare("SELECT r.id,r.status,r.created_at AS requestedAt,u.id AS userId,u.full_name AS fullName,u.email FROM organization_access_requests r JOIN users u ON u.id=r.user_id WHERE r.organization_id=? AND r.status='PENDING' ORDER BY r.created_at").bind(orgId).all();
    return reply({requests:results});
  }

  const decideMatch=path.match(/^\/api\/organizations\/([^/]+)\/requests\/([^/]+)$/);
  if(decideMatch && request.method==="PATCH") {
    const [,orgId,requestId]=decideMatch, m=await membership(env,orgId,user.id);
    if(!m||m.role!=="OWNER") return reply({error:"Insufficient organization permissions."},403);
    let body:any; try { body=await request.json(); } catch { return reply({error:"Invalid JSON body."},400); }
    if(!["APPROVE","REJECT"].includes(body.decision)|| (body.decision==="APPROVE"&&!["MANAGER","LEADER","ANALYST"].includes(body.role))) return reply({error:"Choose a valid decision and role."},400);
    const access=await env.DB.prepare("SELECT id,user_id,status FROM organization_access_requests WHERE id=? AND organization_id=?").bind(requestId,orgId).first<{id:string;user_id:string;status:string}>();
    if(!access||access.status!=="PENDING") return reply({error:"Pending access request not found."},404);
    if(body.decision==="APPROVE") {
      await env.DB.batch([
        env.DB.prepare("INSERT INTO memberships (id,organization_id,user_id,role,membership_status) VALUES (?,?,?,?,'ACTIVE') ON CONFLICT(organization_id,user_id) DO UPDATE SET role=excluded.role,membership_status='ACTIVE'").bind(crypto.randomUUID(),orgId,access.user_id,body.role)
      ]);
    }
    await env.DB.batch([
      env.DB.prepare("UPDATE organization_access_requests SET status=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=?").bind(body.decision==="APPROVE"?"APPROVED":"REJECTED",user.id,requestId),
      env.DB.prepare("INSERT INTO audit_logs (organization_id,actor_user_id,action,target_type,target_id,metadata) VALUES (?,?,?,?,?,?)").bind(orgId,user.id,body.decision==="APPROVE"?"ACCESS_REQUEST_APPROVED":"ACCESS_REQUEST_REJECTED","ACCESS_REQUEST",requestId,JSON.stringify({role:body.role??null})),
      env.DB.prepare("INSERT INTO notifications (id,user_id,organization_id,type,title,message,href) VALUES (?,?,?,'ACCESS_REVIEW',?,?, '/workspace')").bind(crypto.randomUUID(),access.user_id,orgId,body.decision==="APPROVE"?"Access approved":"Access request declined",body.decision==="APPROVE"?"Your organization access is now active.":"Your organization access request was not approved.")
    ]);
    return reply({message:body.decision==="APPROVE"?"Access request approved.":"Access request rejected."});
  }
  return null;
}
