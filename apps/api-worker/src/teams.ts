type Env={DB:D1Database};
type Role="OWNER"|"MANAGER"|"LEADER"|"ANALYST";
type User={id:string;account_status:string};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
const userFor=async(req:Request,env:Env):Promise<User|null>=>{const raw=req.headers.get("Cookie")||"",sid=raw.split(";").map(v=>v.trim()).find(v=>v.startsWith("hub.sid="))?.slice(8);if(!sid)return null;return env.DB.prepare("SELECT u.id,u.account_status FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.expires_at>unixepoch()").bind(decodeURIComponent(sid)).first<User>();};
const member=async(env:Env,orgId:string,userId:string)=>env.DB.prepare("SELECT role FROM memberships WHERE organization_id=? AND user_id=? AND membership_status='ACTIVE'").bind(orgId,userId).first<{role:Role}>();
const audit=async(env:Env,orgId:string,userId:string,action:string,type:string,id:string,metadata?:unknown)=>env.DB.prepare("INSERT INTO audit_logs (organization_id,actor_user_id,action,target_type,target_id,metadata) VALUES (?,?,?,?,?,?)").bind(orgId,userId,action,type,id,metadata===undefined?null:JSON.stringify(metadata)).run();
const event=async(env:Env,orgId:string,teamId:string|null,taskId:string|null,actor:string,type:string,metadata:unknown={})=>env.DB.prepare("INSERT INTO work_events (id,organization_id,team_id,task_id,actor_user_id,event_type,metadata) VALUES (?,?,?,?,?,?,?)").bind(crypto.randomUUID(),orgId,teamId,taskId,actor,type,JSON.stringify(metadata)).run();
const activeUser=async(env:Env,orgId:string,userId:string,role:Role)=>env.DB.prepare("SELECT id FROM memberships WHERE organization_id=? AND user_id=? AND role=? AND membership_status='ACTIVE'").bind(orgId,userId,role).first();
export async function handleTeams(req:Request,env:Env,path:string):Promise<Response|null>{
 if(!path.startsWith("/api/teams/")&&!(/^\/api\/organizations\/[^/]+\/teams$/.test(path))&&!(/^\/api\/tasks\/[^/]+$/.test(path)))return null;
 const user=await userFor(req,env);if(!user)return json({error:"Authentication required."},401);if(user.account_status==="SUSPENDED")return json({error:"This account has been suspended."},403);
 const orgMatch=path.match(/^\/api\/organizations\/([^/]+)\/teams$/);
 if(orgMatch&&req.method==="GET"){
  const orgId=orgMatch[1],m=await member(env,orgId,user.id);if(!m)return json({error:"Organization membership required."},403);
  let sql="SELECT t.id,t.name,t.description,t.status,t.leader_user_id AS leaderId,u.full_name AS leaderName FROM teams t JOIN users u ON u.id=t.leader_user_id WHERE t.organization_id=? AND t.status<>'ARCHIVED'";
  const params:unknown[]=[orgId];
  if(m.role==="LEADER"){sql+=" AND t.leader_user_id=?";params.push(user.id);}
  else if(m.role==="ANALYST"){sql+=" AND EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id=t.id AND tm.user_id=?)";params.push(user.id);}
  else if(!["OWNER","MANAGER"].includes(m.role))return json({error:"Insufficient permissions."},403);
  sql+=" ORDER BY t.name";
  const {results:teams}=await env.DB.prepare(sql).bind(...params).all<any>();
  const ids=teams.map(t=>t.id);
  let roster:any[]=[];
  if(ids.length){
   const marks=ids.map(()=>"?").join(",");
   let rosterSql=`SELECT tm.team_id AS teamId,u.id AS userId,u.full_name AS fullName,m.role FROM team_members tm JOIN teams t ON t.id=tm.team_id JOIN users u ON u.id=tm.user_id JOIN memberships m ON m.organization_id=t.organization_id AND m.user_id=u.id WHERE tm.team_id IN (${marks}) AND m.membership_status='ACTIVE'`;
   const rosterParams:unknown[]=[...ids];
   if(m.role==="ANALYST"){rosterSql+=" AND tm.user_id=?";rosterParams.push(user.id);}
   rosterSql+=" ORDER BY u.full_name";
   roster=(await env.DB.prepare(rosterSql).bind(...rosterParams).all()).results;
  }
  return json({teams:teams.map(t=>({...t,members:roster.filter(m=>m.teamId===t.id)}))});
 }
 if(orgMatch&&req.method==="POST"){
  const orgId=orgMatch[1],m=await member(env,orgId,user.id);if(!m||m.role!=="OWNER")return json({error:"Only the Owner can create teams and designate a Team Leader."},403);
  let body:any;try{body=await req.json();}catch{return json({error:"Invalid JSON body."},400);}
  const name=typeof body.name==="string"?body.name.trim():"",description=typeof body.description==="string"?body.description.trim():"",leaderId=body.leaderUserId;
  if(name.length<2||name.length>120||description.length>500||typeof leaderId!=="string")return json({error:"Enter a valid team name, description and Leader."},400);
  if(!await activeUser(env,orgId,leaderId,"LEADER"))return json({error:"The Team Leader must be an active LEADER in this organization."},400);
  const id=crypto.randomUUID();
  try{
   await env.DB.batch([
    env.DB.prepare("INSERT INTO teams (id,organization_id,name,description,leader_user_id,created_by) VALUES (?,?,?,?,?,?)").bind(id,orgId,name,description,leaderId,user.id),
    env.DB.prepare("INSERT INTO team_members (team_id,user_id,added_by) VALUES (?,?,?)").bind(id,leaderId,user.id)
   ]);
  }catch{return json({error:"This Leader may already lead a team, or the team could not be created."},409);}
  await audit(env,orgId,user.id,"TEAM_CREATED","TEAM",id,{name,leaderUserId:leaderId});
  await event(env,orgId,id,null,user.id,"WORK_NOTE_ADDED",{action:"TEAM_CREATED",leaderUserId:leaderId});
  return json({team:{id,name,description,leaderId,status:"ACTIVE"}},201);
 }
 const addMember=path.match(/^\/api\/teams\/([^/]+)\/members$/);
 if(addMember&&req.method==="POST"){
  const team=await env.DB.prepare("SELECT id,organization_id FROM teams WHERE id=? AND status='ACTIVE'").bind(addMember[1]).first<{id:string;organization_id:string}>();if(!team)return json({error:"Team not found."},404);
  const m=await member(env,team.organization_id,user.id);if(!m||m.role!=="OWNER")return json({error:"Only the Owner can add or move Analysts between teams."},403);
  let body:any;try{body=await req.json();}catch{return json({error:"Invalid JSON body."},400);}
  if(typeof body.userId!=="string"||!await activeUser(env,team.organization_id,body.userId,"ANALYST"))return json({error:"Only an active Analyst in this organization can be added."},400);
  const exists=await env.DB.prepare("SELECT team_id FROM team_members WHERE user_id=? LIMIT 1").bind(body.userId).first();
  if(exists)return json({error:"This Analyst already belongs to a team. Remove them from the existing team first."},409);
  await env.DB.prepare("INSERT INTO team_members (team_id,user_id,added_by) VALUES (?,?,?)").bind(team.id,body.userId,user.id).run();
  await audit(env,team.organization_id,user.id,"TEAM_MEMBER_ADDED","TEAM",team.id,{userId:body.userId});
  return json({message:"Analyst added to team."},201);
 }
 const createTask=path.match(/^\/api\/teams\/([^/]+)\/tasks$/);
 if(createTask&&req.method==="POST"){
  const team=await env.DB.prepare("SELECT id,organization_id,leader_user_id FROM teams WHERE id=? AND status='ACTIVE'").bind(createTask[1]).first<{id:string;organization_id:string;leader_user_id:string}>();if(!team)return json({error:"Team not found."},404);
  const m=await member(env,team.organization_id,user.id);if(!m||!["OWNER","LEADER"].includes(m.role))return json({error:"Only the Owner or this team's Leader can create team tasks."},403);
  if(m.role==="LEADER"&&team.leader_user_id!==user.id)return json({error:"Leaders can create tasks only in their own team."},403);
  let body:any;try{body=await req.json();}catch{return json({error:"Invalid JSON body."},400);}
  const title=typeof body.title==="string"?body.title.trim():"",description=typeof body.description==="string"?body.description.trim():"",priority=body.priority??"MEDIUM",dueDate=body.dueDate??null,assigneeId=body.assigneeId??(m.role==="LEADER"?user.id:null),projectId=body.projectId;
  if(title.length<2||title.length>180||description.length>2000||!["LOW","MEDIUM","HIGH","URGENT"].includes(priority)||(dueDate!==null&&(typeof dueDate!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(dueDate))))return json({error:"Enter valid task details."},400);
  if(typeof projectId!=="string")return json({error:"A project in this organization is required for every team task."},400);
  const project=await env.DB.prepare("SELECT id FROM projects WHERE id=? AND organization_id=?").bind(projectId,team.organization_id).first();if(!project)return json({error:"Project not found in this organization."},400);
  if(typeof assigneeId!=="string")return json({error:"Choose a team Analyst or assign the task to yourself."},400);
  const isLeaderSelf=assigneeId===user.id&&m.role==="LEADER"&&team.leader_user_id===user.id;
  const isAnalyst=!!await env.DB.prepare("SELECT 1 FROM team_members tm JOIN memberships m ON m.user_id=tm.user_id JOIN teams t ON t.id=tm.team_id WHERE tm.team_id=? AND tm.user_id=? AND m.organization_id=t.organization_id AND m.role='ANALYST' AND m.membership_status='ACTIVE'").bind(team.id,assigneeId).first();
  if(!isLeaderSelf&&!isAnalyst)return json({error:"Tasks may be assigned only to an Analyst in this team or to the Leader themself."},400);
  const id=crypto.randomUUID();
  await env.DB.batch([
   env.DB.prepare("INSERT INTO tasks (id,project_id,title,description,status,priority,due_date,assignee_id,created_by,team_id,assigned_by) VALUES (?,?,?,?,'TODO',?,?,?,?,?,?)").bind(id,projectId,title,description,priority,dueDate,assigneeId,user.id,team.id,user.id),
   env.DB.prepare("INSERT INTO task_assignment_history (id,organization_id,team_id,task_id,assigned_by,previous_assignee_id,new_assignee_id,reason) VALUES (?,?,?,?,?,NULL,?,?)").bind(crypto.randomUUID(),team.organization_id,team.id,id,user.id,assigneeId,typeof body.reason==="string"?body.reason.slice(0,500):null),
   env.DB.prepare("INSERT INTO work_events (id,organization_id,team_id,task_id,actor_user_id,event_type,metadata) VALUES (?,?,?,?,?,'TASK_CREATED',?)").bind(crypto.randomUUID(),team.organization_id,team.id,id,user.id,JSON.stringify({assigneeId,title})),
   env.DB.prepare("INSERT INTO work_events (id,organization_id,team_id,task_id,actor_user_id,event_type,metadata) VALUES (?,?,?,?,?,'TASK_ASSIGNED',?)").bind(crypto.randomUUID(),team.organization_id,team.id,id,user.id,JSON.stringify({assigneeId}))
  ]);
  await env.DB.prepare("INSERT INTO notifications (id,user_id,organization_id,type,title,message,href) VALUES (?,?,?,'TASK_ASSIGNED','A team task was assigned',?,'/workspace/projects')").bind(crypto.randomUUID(),assigneeId,team.organization_id,"You have been assigned: "+title).run();
  await audit(env,team.organization_id,user.id,"TEAM_TASK_CREATED","TASK",id,{teamId:team.id,assigneeId});
  return json({task:{id,teamId:team.id,projectId,title,description,priority,dueDate,assigneeId,status:"TODO"}},201);
 }
 const taskMatch=path.match(/^\/api\/tasks\/([^/]+)$/);
 if(taskMatch&&req.method==="PATCH"){
  let body:any;try{body=await req.json();}catch{return json({error:"Invalid task update."},400);}
  if(!body||typeof body!=="object"||Array.isArray(body)||Object.keys(body).some(k=>k!=="status"&&k!=="note")||!["TODO","IN_PROGRESS","BLOCKED","DONE"].includes(body.status))return json({error:"Only task status and an optional work note can be updated."},400);
  const task=await env.DB.prepare("SELECT t.id,t.team_id,t.assignee_id,t.status,t.title,p.organization_id FROM tasks t JOIN projects p ON p.id=t.project_id WHERE t.id=?").bind(taskMatch[1]).first<any>();if(!task||!task.team_id)return json({error:"Team task not found."},404);
  const m=await member(env,task.organization_id,user.id);if(!m)return json({error:"Organization membership required."},403);
  const team=await env.DB.prepare("SELECT leader_user_id FROM teams WHERE id=?").bind(task.team_id).first<{leader_user_id:string}>();
  const canUpdate=(m.role==="LEADER"&&team?.leader_user_id===user.id&&task.assignee_id===user.id)||(m.role==="ANALYST"&&task.assignee_id===user.id);
  if(!canUpdate)return json({error:"You can update only your assigned work or work in your own team."},403);
  if(!canUpdate)return json({error:"Only the assigned Analyst or a Leader working on their own task can update progress."},403);
  const completedAt=body.status==="DONE"?"CURRENT_TIMESTAMP":"NULL";
  await env.DB.prepare("UPDATE tasks SET status=?,completed_at="+completedAt+",updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(body.status,task.id).run();
  const eventType=body.status==="IN_PROGRESS"?"TASK_STARTED":body.status==="BLOCKED"?"TASK_BLOCKED":body.status==="DONE"?"TASK_SUBMITTED":"TASK_STATUS_CHANGED";
  await event(env,task.organization_id,task.team_id,task.id,user.id,eventType,{from:task.status,to:body.status,note:typeof body.note==="string"?body.note.slice(0,1000):""});
  await audit(env,task.organization_id,user.id,"TASK_STATUS_UPDATED","TASK",task.id,{from:task.status,to:body.status});
  return json({message:"Task progress updated."});
 }
 return null;
}
