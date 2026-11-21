import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { pool } from '../db.js';
import { audit } from '../audit.js';
import { requireAuth, requireActiveUser, requireRole } from '../middleware.js';
import { notifyUser } from './notifications.js';

const router=Router();
router.use(requireAuth,requireActiveUser);

router.get('/organizations/:orgId/projects',requireRole('OWNER','MANAGER','LEADER','ANALYST'),async(req,res,next)=>{
  try{
    const [rows]=await pool.execute(
      'SELECT p.id,p.name,p.description,p.status,p.priority,p.start_date AS startDate,p.due_date AS dueDate,p.created_at AS createdAt,u.full_name AS createdByName FROM projects p JOIN users u ON u.id=p.created_by WHERE p.organization_id=? ORDER BY p.updated_at DESC',
      [req.params.orgId]
    );
    res.json({projects:rows});
  }catch(e){next(e);}
});

router.post('/organizations/:orgId/projects',requireRole('OWNER'),async(req,res,next)=>{
  try{
    const input=z.object({name:z.string().trim().min(2).max(160),description:z.string().trim().max(2000).optional().default(''),priority:z.enum(['LOW','MEDIUM','HIGH','URGENT']).default('MEDIUM'),dueDate:z.string().date().optional()}).parse(req.body);
    const id=randomUUID();
    await pool.execute('INSERT INTO projects (id,organization_id,name,description,status,priority,due_date,created_by) VALUES (?,?,?,?,"PLANNING",?,?,?)',[id,req.params.orgId,input.name,input.description,input.priority,input.dueDate||null,req.user.id]);
    await audit({orgId:req.params.orgId,actorId:req.user.id,action:'PROJECT_CREATED',targetType:'PROJECT',targetId:id,metadata:{name:input.name},ip:req.ip});
    res.status(201).json({project:{id,...input,status:'PLANNING'}});
  }catch(e){next(e);}
});

router.get('/projects/:projectId/tasks',async(req,res,next)=>{
  try{
    const [scope]=await pool.execute('SELECT organization_id FROM projects WHERE id=? LIMIT 1',[req.params.projectId]);
    if(!scope.length)return res.status(404).json({error:'Project not found.'});
    const orgId=scope[0].organization_id;
    const [members]=await pool.execute("SELECT role FROM memberships WHERE organization_id=? AND user_id=? AND membership_status='ACTIVE'",[orgId,req.user.id]);
    if(!members.length)return res.status(403).json({error:'Insufficient organization permissions.'});
    const role=members[0].role;
    let sql='SELECT t.id,t.title,t.description,t.status,t.priority,t.due_date AS dueDate,t.assignee_id AS assigneeId,u.full_name AS assigneeName,t.team_id AS teamId,t.assigned_by AS assignedBy,t.created_at AS createdAt FROM tasks t LEFT JOIN users u ON u.id=t.assignee_id WHERE t.project_id=?';
    const params=[req.params.projectId];
    if(role==='LEADER'){sql+=' AND t.team_id IN (SELECT id FROM teams WHERE organization_id=? AND leader_user_id=?)';params.push(orgId,req.user.id);}
    else if(role==='ANALYST'){sql+=' AND t.assignee_id=?';params.push(req.user.id);}
    else if(!['OWNER','MANAGER'].includes(role))return res.status(403).json({error:'Insufficient permissions.'});
    sql+=' ORDER BY t.created_at DESC';
    const [rows]=await pool.execute(sql,params);
    res.json({tasks:rows.map(task=>({...task,canUpdate:['OWNER','LEADER'].includes(role)||task.assigneeId===req.user.id}))});
  }catch(e){next(e);}
});

router.post('/projects/:projectId/tasks',async(req,res,next)=>{
  try{
    const input=z.object({title:z.string().trim().min(2).max(180),description:z.string().trim().max(2000).optional().default(''),priority:z.enum(['LOW','MEDIUM','HIGH','URGENT']).default('MEDIUM'),dueDate:z.string().date().optional(),assigneeId:z.string().uuid().nullable().optional(),teamId:z.string().uuid()}).parse(req.body);
    const [scope]=await pool.execute('SELECT organization_id FROM projects WHERE id=? LIMIT 1',[req.params.projectId]);
    if(!scope.length)return res.status(404).json({error:'Project not found.'});
    const orgId=scope[0].organization_id;
    const [members]=await pool.execute("SELECT role FROM memberships WHERE organization_id=? AND user_id=? AND membership_status='ACTIVE'",[orgId,req.user.id]);
    if(!members.length||!['OWNER','LEADER'].includes(members[0].role))return res.status(403).json({error:'Only the Owner or a Team Leader can create and assign project tasks.'});
    const role=members[0].role;
    const [teams]=await pool.execute('SELECT id,leader_user_id FROM teams WHERE id=? AND organization_id=? AND status="ACTIVE" LIMIT 1',[input.teamId,orgId]);
    if(!teams.length)return res.status(400).json({error:'Choose an active team in this organization.'});
    if(role==='LEADER'&&teams[0].leader_user_id!==req.user.id)return res.status(403).json({error:'A Leader can create tasks only for their own team.'});
    if(input.assigneeId){
      const [assignee]=await pool.execute("SELECT m.role FROM memberships m JOIN team_members tm ON tm.user_id=m.user_id AND tm.team_id=? WHERE m.organization_id=? AND m.user_id=? AND m.membership_status='ACTIVE' LIMIT 1",[input.teamId,orgId,input.assigneeId]);
      if(!assignee.length||!['ANALYST','LEADER'].includes(assignee[0].role))return res.status(400).json({error:'Assignee must be an active member of the selected team.'});
      if(assignee[0].role==='LEADER'&&input.assigneeId!==teams[0].leader_user_id)return res.status(400).json({error:'Only the designated team Leader can self-own Leader tasks.'});
    }
    const id=randomUUID();
    const conn=await pool.getConnection();
    try{
      await conn.beginTransaction();
      await conn.execute('INSERT INTO tasks (id,project_id,title,description,status,priority,due_date,assignee_id,created_by,team_id,assigned_by) VALUES (?,?,?,?,"TODO",?,?,?,?,?,?)',[id,req.params.projectId,input.title,input.description,input.priority,input.dueDate||null,input.assigneeId||null,req.user.id,input.teamId,req.user.id]);
      if(input.assigneeId)await conn.execute('INSERT INTO task_assignment_history (id,organization_id,team_id,project_id,task_id,previous_assignee_id,new_assignee_id,assigned_by,reason) VALUES (?,?,?,?,?,NULL,?,?,?)',[randomUUID(),orgId,input.teamId,req.params.projectId,id,input.assigneeId,req.user.id,'Initial task assignment']);
      await conn.commit();
    }catch(e){await conn.rollback();throw e;}finally{conn.release();}
    await audit({orgId,actorId:req.user.id,action:'TASK_CREATED_AND_ASSIGNED',targetType:'TASK',targetId:id,metadata:{teamId:input.teamId,assigneeId:input.assigneeId||null},ip:req.ip});
    if(input.assigneeId&&input.assigneeId!==req.user.id)await notifyUser({userId:input.assigneeId,organizationId:orgId,type:'TASK_ASSIGNED',title:'A task was assigned to you',message:'You have a new task in your team.',href:'/workspace/projects'});
    res.status(201).json({task:{id,...input,status:'TODO',assignedBy:req.user.id}});
  }catch(e){next(e);}
});

router.patch('/tasks/:taskId',async(req,res,next)=>{
  try{
    const input=z.object({status:z.enum(['TODO','IN_PROGRESS','BLOCKED','DONE']).optional(),priority:z.enum(['LOW','MEDIUM','HIGH','URGENT']).optional(),assigneeId:z.string().uuid().nullable().optional()}).refine(v=>Object.keys(v).length>0).parse(req.body);
    const [rows]=await pool.execute('SELECT t.project_id,t.assignee_id,t.team_id,t.assigned_by,p.organization_id FROM tasks t JOIN projects p ON p.id=t.project_id WHERE t.id=? LIMIT 1',[req.params.taskId]);
    if(!rows.length)return res.status(404).json({error:'Task not found.'});
    const task=rows[0],orgId=task.organization_id;
    const [members]=await pool.execute("SELECT role FROM memberships WHERE organization_id=? AND user_id=? AND membership_status='ACTIVE'",[orgId,req.user.id]);
    if(!members.length)return res.status(403).json({error:'Insufficient organization permissions.'});
    const role=members[0].role;
    const [teamRows]=await pool.execute('SELECT leader_user_id FROM teams WHERE id=? AND organization_id=? LIMIT 1',[task.team_id,orgId]);
    const isTeamLeader=role==='LEADER'&&teamRows[0]?.leader_user_id===req.user.id;
    const canReassign=role==='OWNER'||isTeamLeader;
    if((input.assigneeId!==undefined||input.priority!==undefined)&&!canReassign)return res.status(403).json({error:'Only the Owner or the task’s own Team Leader can reassign work or change priority.'});
    if(input.status!==undefined&&!canReassign&&!(role==='ANALYST'&&task.assignee_id===req.user.id))return res.status(403).json({error:'Only the assigned Analyst, team Leader or Owner can update task status.'});
    if(role==='MANAGER')return res.status(403).json({error:'Manager access is read-only. Request Owner approval for changes.'});
    if(role==='LEADER'&&!isTeamLeader)return res.status(403).json({error:'A Leader can modify tasks only inside their own team.'});
    if(input.assigneeId){
      const [assignee]=await pool.execute("SELECT m.role FROM memberships m JOIN team_members tm ON tm.user_id=m.user_id AND tm.team_id=? WHERE m.organization_id=? AND m.user_id=? AND m.membership_status='ACTIVE' LIMIT 1",[task.team_id,orgId,input.assigneeId]);
      if(!assignee.length||!['ANALYST','LEADER'].includes(assignee[0].role))return res.status(400).json({error:'Assignee must belong to this task’s team.'});
    }
    const conn=await pool.getConnection();
    try{
      await conn.beginTransaction();
      const sets=[],values=[];
      for(const key of ['status','priority','assigneeId'])if(input[key]!==undefined){sets.push(key==='assigneeId'?'assignee_id = ?':key+' = ?');values.push(input[key]);}
      values.push(req.params.taskId);
      await conn.execute('UPDATE tasks SET '+sets.join(', ')+', updated_at=NOW() WHERE id=?',values);
      if(input.assigneeId!==undefined&&input.assigneeId!==task.assignee_id){
        await conn.execute('UPDATE tasks SET assigned_by=? WHERE id=?',[req.user.id,req.params.taskId]);
        await conn.execute('INSERT INTO task_assignment_history (id,organization_id,team_id,project_id,task_id,previous_assignee_id,new_assignee_id,assigned_by,reason) VALUES (?,?,?,?,?,?,?,?,?)',[randomUUID(),orgId,task.team_id,task.project_id,req.params.taskId,task.assignee_id,input.assigneeId,req.user.id,'Task reassigned']);
      }
      await conn.commit();
    }catch(e){await conn.rollback();throw e;}finally{conn.release();}
    await audit({orgId,actorId:req.user.id,action:'TASK_UPDATED',targetType:'TASK',targetId:req.params.taskId,metadata:input,ip:req.ip});
    if(input.assigneeId&&input.assigneeId!==task.assignee_id&&input.assigneeId!==req.user.id)await notifyUser({userId:input.assigneeId,organizationId:orgId,type:'TASK_ASSIGNED',title:'A task was assigned to you',message:'A task in your team was assigned to you.',href:'/workspace/projects'});
    res.json({message:'Task updated.'});
  }catch(e){next(e);}
});

export default router;
