type Env = { DB: D1Database };
type User = { id: string; account_status: string };
type Member = { role: "OWNER"|"ADMIN"|"MANAGER"|"ANALYST"|"VIEWER" };

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});
const userFromRequest = async (request: Request, env: Env): Promise<User|null> => {
  const raw = request.headers.get("Cookie") || "";
  const sid = raw.split(";").map(v=>v.trim()).find(v=>v.startsWith("hub.sid="))?.slice(8);
  if (!sid) return null;
  return env.DB.prepare("SELECT u.id,u.account_status FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.expires_at>unixepoch()")
    .bind(decodeURIComponent(sid)).first<User>();
};
const memberOf = (env: Env, orgId: string, userId: string) =>
  env.DB.prepare("SELECT role FROM memberships WHERE organization_id=? AND user_id=? AND membership_status='ACTIVE'")
    .bind(orgId,userId).first<Member>();
const audit = (env: Env, orgId: string, userId: string, action: string, type: string, id: string, metadata?: unknown) =>
  env.DB.prepare("INSERT INTO audit_logs (organization_id,actor_user_id,action,target_type,target_id,metadata) VALUES (?,?,?,?,?,?)")
    .bind(orgId,userId,action,type,id,metadata===undefined?null:JSON.stringify(metadata)).run();
const roles = ["OWNER","ADMIN","MANAGER","ANALYST","VIEWER"];
const priorities = ["LOW","MEDIUM","HIGH","URGENT"];
const statuses = ["TODO","IN_PROGRESS","BLOCKED","DONE"];
const isDate = (v: unknown): v is string => typeof v==="string" && /^\\d{4}-\\d{2}-\\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

export async function handleProjects(request: Request, env: Env, path: string): Promise<Response|null> {
  const user=await userFromRequest(request,env);
  if(!user) return json({error:"Authentication required."},401);
  if(user.account_status==="SUSPENDED") return json({error:"This account has been suspended."},403);

  const orgProjects=path.match(/^\/api\/organizations\/([^/]+)\/projects$/);
  if(orgProjects && request.method==="GET") {
    const orgId=orgProjects[1], member=await memberOf(env,orgId,user.id);
    if(!member) return json({error:"Insufficient organization permissions."},403);
    const {results}=await env.DB.prepare("SELECT p.id,p.name,p.description,p.status,p.priority,p.start_date AS startDate,p.due_date AS dueDate,p.created_at AS createdAt,u.full_name AS createdByName FROM projects p JOIN users u ON u.id=p.created_by WHERE p.organization_id=? ORDER BY p.updated_at DESC")
      .bind(orgId).all();
    return json({projects:results});
  }
  if(orgProjects && request.method==="POST") {
    const orgId=orgProjects[1], member=await memberOf(env,orgId,user.id);
    if(!member||!["OWNER","ADMIN","MANAGER"].includes(member.role)) return json({error:"Insufficient organization permissions."},403);
    let body: any; try{body=await request.json();}catch{return json({error:"Invalid JSON body."},400);}
    const name=typeof body.name==="string"?body.name.trim():"";
    const description=typeof body.description==="string"?body.description.trim():"";
    const priority=body.priority??"MEDIUM";
    const dueDate=body.dueDate;
    if(name.length<2||name.length>160||description.length>2000||!priorities.includes(priority)||(dueDate!==undefined&&!isDate(dueDate)))
      return json({error:"Enter valid project details."},400);
    const id=crypto.randomUUID();
    await env.DB.prepare("INSERT INTO projects (id,organization_id,name,description,status,priority,due_date,created_by) VALUES (?,?,?,?,'PLANNING',?,?,?)")
      .bind(id,orgId,name,description,priority,dueDate??null,user.id).run();
    await audit(env,orgId,user.id,"PROJECT_CREATED","PROJECT",id,{name});
    return json({project:{id,name,description,priority,dueDate:dueDate??null,status:"PLANNING"}},201);
  }

  const projectTasks=path.match(/^\/api\/projects\/([^/]+)\/tasks$/);
  if(projectTasks && request.method==="GET") {
    const projectId=projectTasks[1];
    const project=await env.DB.prepare("SELECT organization_id FROM projects WHERE id=?").bind(projectId).first<{organization_id:string}>();
    if(!project) return json({error:"Project not found."},404);
    const member=await memberOf(env,project.organization_id,user.id);
    if(!member) return json({error:"Insufficient organization permissions."},403);
    const {results}=await env.DB.prepare("SELECT t.id,t.title,t.description,t.status,t.priority,t.due_date AS dueDate,t.assignee_id AS assigneeId,u.full_name AS assigneeName,t.created_at AS createdAt FROM tasks t LEFT JOIN users u ON u.id=t.assignee_id WHERE t.project_id=? ORDER BY t.created_at DESC")
      .bind(projectId).all<{assigneeId:string|null}>();
    const manager=["OWNER","ADMIN","MANAGER"].includes(member.role);
    return json({tasks:results.map((task:any)=>({...task,canUpdate:manager||task.assigneeId===user.id}))});
  }
  if(projectTasks && request.method==="POST") {
    const projectId=projectTasks[1];
    const project=await env.DB.prepare("SELECT organization_id FROM projects WHERE id=?").bind(projectId).first<{organization_id:string}>();
    if(!project) return json({error:"Project not found."},404);
    const orgId=project.organization_id, member=await memberOf(env,orgId,user.id);
    if(!member||!["OWNER","ADMIN","MANAGER","ANALYST"].includes(member.role)) return json({error:"Insufficient organization permissions."},403);
    let body:any; try{body=await request.json();}catch{return json({error:"Invalid JSON body."},400);}
    const title=typeof body.title==="string"?body.title.trim():"";
    const description=typeof body.description==="string"?body.description.trim():"";
    const priority=body.priority??"MEDIUM", dueDate=body.dueDate, assigneeId=body.assigneeId;
    if(title.length<2||title.length>180||description.length>2000||!priorities.includes(priority)||(dueDate!==undefined&&!isDate(dueDate))||(assigneeId!==undefined&&typeof assigneeId!=="string"))
      return json({error:"Enter valid task details."},400);
    if(assigneeId && !["OWNER","ADMIN","MANAGER"].includes(member.role)) return json({error:"Only managers can assign tasks."},403);
    if(assigneeId){
      const assignee=await memberOf(env,orgId,assigneeId);
      if(!assignee) return json({error:"Assignee must be an active member of this organization."},400);
    }
    const id=crypto.randomUUID();
    await env.DB.prepare("INSERT INTO tasks (id,project_id,title,description,status,priority,due_date,assignee_id,created_by) VALUES (?,?,?,?,'TODO',?,?,?,?)")
      .bind(id,projectId,title,description,priority,dueDate??null,assigneeId??null,user.id).run();
    await audit(env,orgId,user.id,"TASK_CREATED","TASK",id);
    if(assigneeId&&assigneeId!==user.id) await env.DB.prepare("INSERT INTO notifications (id,user_id,organization_id,type,title,message,href) VALUES (?,?,?,'TASK_ASSIGNED','A task was assigned to you','You have a new task in an organization project.','/workspace/projects')")
      .bind(crypto.randomUUID(),assigneeId,orgId).run();
    return json({task:{id,title,description,priority,dueDate:dueDate??null,assigneeId:assigneeId??null,status:"TODO"}},201);
  }

  const taskMatch=path.match(/^\/api\/tasks\/([^/]+)$/);
  if(taskMatch && request.method==="PATCH") {
    const taskId=taskMatch[1];
    let body:any; try{body=await request.json();}catch{return json({error:"Invalid JSON body."},400);}
    const allowed=new Set(["status","priority","assigneeId"]);
    if(!body||typeof body!=="object"||Array.isArray(body)||Object.keys(body).length===0||Object.keys(body).some(k=>!allowed.has(k)))
      return json({error:"Invalid task update."},400);
    if(body.status!==undefined&&!statuses.includes(body.status)) return json({error:"Invalid task status."},400);
    if(body.priority!==undefined&&!priorities.includes(body.priority)) return json({error:"Invalid task priority."},400);
    if(body.assigneeId!==undefined&&body.assigneeId!==null&&typeof body.assigneeId!=="string") return json({error:"Invalid assignee."},400);
    const task=await env.DB.prepare("SELECT t.project_id,t.assignee_id,p.organization_id FROM tasks t JOIN projects p ON p.id=t.project_id WHERE t.id=?")
      .bind(taskId).first<{project_id:string;assignee_id:string|null;organization_id:string}>();
    if(!task) return json({error:"Task not found."},404);
    const member=await memberOf(env,task.organization_id,user.id);
    if(!member) return json({error:"Insufficient organization permissions."},403);
    const manager=["OWNER","ADMIN","MANAGER"].includes(member.role);
    if(!manager&&(body.assigneeId!==undefined||body.priority!==undefined)) return json({error:"Only managers can change task assignments or priority."},403);
    if(!manager&&task.assignee_id!==user.id) return json({error:"Only managers or the assigned member can update this task."},403);
    if(body.assigneeId){
      const assignee=await memberOf(env,task.organization_id,body.assigneeId);
      if(!assignee) return json({error:"Assignee must be an active organization member."},400);
    }
    const sets:string[]=[], values:unknown[]=[];
    if(body.status!==undefined){sets.push("status=?");values.push(body.status);}
    if(body.priority!==undefined){sets.push("priority=?");values.push(body.priority);}
    if(body.assigneeId!==undefined){sets.push("assignee_id=?");values.push(body.assigneeId);}
    sets.push("updated_at=CURRENT_TIMESTAMP");
    values.push(taskId);
    await env.DB.prepare("UPDATE tasks SET "+sets.join(",")+" WHERE id=?").bind(...values).run();
    await audit(env,task.organization_id,user.id,"TASK_UPDATED","TASK",taskId,body);
    if(body.assigneeId&&body.assigneeId!==task.assignee_id&&body.assigneeId!==user.id)
      await env.DB.prepare("INSERT INTO notifications (id,user_id,organization_id,type,title,message,href) VALUES (?,?,?,'TASK_ASSIGNED','A task was assigned to you','A task in your organization was assigned to you.','/workspace/projects')")
        .bind(crypto.randomUUID(),body.assigneeId,task.organization_id).run();
    return json({message:"Task updated."});
  }
  return null;
}
