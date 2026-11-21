type Env={DB:D1Database};
type Role="OWNER"|"MANAGER"|"LEADER"|"ANALYST";
type User={id:string;account_status:string};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
const userFor=async(req:Request,env:Env):Promise<User|null>=>{const raw=req.headers.get("Cookie")||"",sid=raw.split(";").map(v=>v.trim()).find(v=>v.startsWith("hub.sid="))?.slice(8);if(!sid)return null;return env.DB.prepare("SELECT u.id,u.account_status FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.expires_at>unixepoch()").bind(decodeURIComponent(sid)).first<User>();};
export async function handlePerformance(req:Request,env:Env,path:string):Promise<Response|null>{
 const match=path.match(/^\/api\/organizations\/([^/]+)\/performance$/);if(!match)return null;
 if(req.method!=="GET")return json({error:"Method not allowed."},405);
 const user=await userFor(req,env);if(!user)return json({error:"Authentication required."},401);if(user.account_status==="SUSPENDED")return json({error:"This account has been suspended."},403);
 const orgId=match[1],membership=await env.DB.prepare("SELECT role FROM memberships WHERE organization_id=? AND user_id=? AND membership_status='ACTIVE'").bind(orgId,user.id).first<{role:Role}>();
 if(!membership||!["OWNER","MANAGER"].includes(membership.role))return json({error:"Only the Owner and Manager can view organization-wide performance."},403);
 const {results:teams}=await env.DB.prepare("SELECT t.id,t.name,t.leader_user_id AS leaderId,u.full_name AS leaderName FROM teams t JOIN users u ON u.id=t.leader_user_id WHERE t.organization_id=? AND t.status<>'ARCHIVED' ORDER BY t.name").bind(orgId).all<any>();
 const {results:members}=await env.DB.prepare("SELECT tm.team_id AS teamId,u.id AS userId,u.full_name AS fullName,m.role FROM team_members tm JOIN teams t ON t.id=tm.team_id JOIN users u ON u.id=tm.user_id JOIN memberships m ON m.organization_id=t.organization_id AND m.user_id=u.id WHERE t.organization_id=? AND m.membership_status='ACTIVE' ORDER BY u.full_name").bind(orgId).all<any>();
 const {results:tasks}=await env.DB.prepare("SELECT t.id,t.team_id AS teamId,t.title,t.description,t.status,t.priority,t.due_date AS dueDate,t.assignee_id AS assigneeId,a.full_name AS assigneeName,t.created_by AS createdBy,c.full_name AS createdByName,t.assigned_by AS assignedBy,b.full_name AS assignedByName,t.created_at AS createdAt,t.updated_at AS updatedAt,t.completed_at AS completedAt FROM tasks t JOIN projects p ON p.id=t.project_id LEFT JOIN users a ON a.id=t.assignee_id LEFT JOIN users c ON c.id=t.created_by LEFT JOIN users b ON b.id=t.assigned_by WHERE p.organization_id=? AND t.team_id IS NOT NULL ORDER BY t.created_at DESC").bind(orgId).all<any>();
 const {results:history}=await env.DB.prepare("SELECT h.id,h.team_id AS teamId,h.task_id AS taskId,h.assigned_by AS assignedBy,by_user.full_name AS assignedByName,h.previous_assignee_id AS previousAssigneeId,prev.full_name AS previousAssigneeName,h.new_assignee_id AS newAssigneeId,next.full_name AS newAssigneeName,h.reason,h.created_at AS createdAt FROM task_assignment_history h JOIN teams t ON t.id=h.team_id LEFT JOIN users by_user ON by_user.id=h.assigned_by LEFT JOIN users prev ON prev.id=h.previous_assignee_id JOIN users next ON next.id=h.new_assignee_id WHERE h.organization_id=? ORDER BY h.created_at DESC LIMIT 5000").bind(orgId).all<any>();
 const {results:events}=await env.DB.prepare("SELECT e.id,e.team_id AS teamId,e.task_id AS taskId,e.actor_user_id AS actorId,u.full_name AS actorName,e.event_type AS eventType,e.metadata,e.created_at AS createdAt FROM work_events e JOIN users u ON u.id=e.actor_user_id WHERE e.organization_id=? ORDER BY e.created_at DESC LIMIT 5000").bind(orgId).all<any>();
 const now=Date.now(),due=(v:string|null)=>!!v&&new Date(v+"T23:59:59").getTime()<now;
 const byTeam=teams.map(team=>{
  const teamMembers=members.filter(m=>m.teamId===team.id);
  const teamTasks=tasks.filter(t=>t.teamId===team.id);
  const teamHistory=history.filter(h=>h.teamId===team.id);
  const teamEvents=events.filter(e=>e.teamId===team.id);
  const memberStats=teamMembers.map(m=>{
   const mine=teamTasks.filter(t=>t.assigneeId===m.userId), completed=mine.filter(t=>t.status==="DONE"), overdue=mine.filter(t=>t.status!=="DONE"&&due(t.dueDate));
   return {...m,metrics:{assigned:mine.length,completed:completed.length,inProgress:mine.filter(t=>t.status==="IN_PROGRESS").length,blocked:mine.filter(t=>t.status==="BLOCKED").length,overdue:overdue.length,onTimeCompleted:completed.filter(t=>!due(t.dueDate)).length},tasks:mine};
  });
  const leaderAssignments=teamHistory.filter(h=>h.assignedBy===team.leaderId);
  const leaderOwnTasks=teamTasks.filter(t=>t.assigneeId===team.leaderId);
  const counts=memberStats.map(m=>m.metrics.assigned);
  const positive=counts.filter(n=>n>0),avg=counts.length?counts.reduce((a,b)=>a+b,0)/counts.length:0;
  const max=counts.length?Math.max(...counts):0,min=counts.length?Math.min(...counts):0;
  const signals:any[]=[];
  if(teamTasks.length&&memberStats.some(m=>m.role==="ANALYST"&&m.metrics.assigned===0)&&positive.length)signals.push({type:"MEMBER_WITHOUT_ASSIGNMENTS",severity:"REVIEW",message:"One or more active Analysts have no assigned team tasks. Check availability, skills and whether work was distributed outside the system."});
  if(positive.length>=2&&max>Math.max(3,avg*2.5))signals.push({type:"ASSIGNMENT_CONCENTRATION",severity:"REVIEW",message:"Task counts are concentrated among a small number of members. Compare task effort, complexity and capacity before drawing conclusions."});
  if(leaderAssignments.length>0&&leaderOwnTasks.length===0)signals.push({type:"LEADER_NO_OWN_TASKS",severity:"REVIEW",message:"The Leader has assigned work but has no tasks assigned to themself in this team. Review their non-task contributions and workload expectations."});
  if(leaderAssignments.length>0&&new Set(leaderAssignments.map(h=>h.newAssigneeId)).size<Math.min(2,teamMembers.filter(m=>m.role==="ANALYST").length)&&teamMembers.filter(m=>m.role==="ANALYST").length>1)signals.push({type:"NARROW_RECIPIENT_PATTERN",severity:"REVIEW",message:"Recent recorded assignments went to a narrow set of recipients. Check skill fit, availability and assignment reasons."});
  return {team:{id:team.id,name:team.name,leaderId:team.leaderId,leaderName:team.leaderName},summary:{members:teamMembers.length,tasks:teamTasks.length,completed:teamTasks.filter(t=>t.status==="DONE").length,inProgress:teamTasks.filter(t=>t.status==="IN_PROGRESS").length,blocked:teamTasks.filter(t=>t.status==="BLOCKED").length,overdue:teamTasks.filter(t=>t.status!=="DONE"&&due(t.dueDate)).length},leaderAccountability:{tasksAssignedByLeader:leaderAssignments.length,uniqueRecipients:new Set(leaderAssignments.map(h=>h.newAssigneeId)).size,ownTasks:leaderOwnTasks.length,ownTasksCompleted:leaderOwnTasks.filter(t=>t.status==="DONE").length},allocation:{averageTasksPerMember:Number(avg.toFixed(2)),maxAssigned:max,minAssigned:min},signals,members:memberStats,tasks:teamTasks,assignmentHistory:teamHistory,events:teamEvents};
 });
 return json({organizationId:orgId,visibility:"OWNER_AND_MANAGER",generatedAt:new Date().toISOString(),methodology:{window:"All recorded team task history; latest 5,000 assignment records and 5,000 work events are returned.",fairness:"Signals are review prompts only. Task effort, skills, availability, leave, capacity and work performed outside Vyron must be considered. No automated misconduct conclusion is made.",limitations:["Task counts do not represent task complexity or effort.","Work outside the platform is not automatically measurable.","Availability and approved leave are not yet modeled."]},teams:byTeam});
}
