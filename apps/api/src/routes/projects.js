import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { pool } from '../db.js';
import { audit } from '../audit.js';
import { requireAuth, requireActiveUser, requireRole } from '../middleware.js';

const router=Router();
router.use(requireAuth,requireActiveUser);

router.get('/organizations/:orgId/projects',requireRole('OWNER','ADMIN','MANAGER','ANALYST','VIEWER'),async(req,res,next)=>{
  try{
    const [rows]=await pool.execute(
      'SELECT p.id,p.name,p.description,p.status,p.priority,p.start_date AS startDate,p.due_date AS dueDate,p.created_at AS createdAt, u.full_name AS createdByName FROM projects p JOIN users u ON u.id=p.created_by WHERE p.organization_id=? ORDER BY p.updated_at DESC',
      [req.params.orgId]
    );
    res.json({projects:rows});
  }catch(e){next(e);}
});

router.post('/organizations/:orgId/projects',requireRole('OWNER','ADMIN','MANAGER'),async(req,res,next)=>{
  try{
    const input=z.object({
      name:z.string().trim().min(2).max(160),
      description:z.string().trim().max(2000).optional().default(''),
      priority:z.enum(['LOW','MEDIUM','HIGH','URGENT']).default('MEDIUM'),
      dueDate:z.string().date().optional()
    }).parse(req.body);
    const id=randomUUID();
    await pool.execute(
      'INSERT INTO projects (id,organization_id,name,description,status,priority,due_date,created_by) VALUES (?,?,?,?,"PLANNING",?,?,?)',
      [id,req.params.orgId,input.name,input.description,input.priority,input.dueDate||null,req.user.id]
    );
    await audit({orgId:req.params.orgId,actorId:req.user.id,action:'PROJECT_CREATED',targetType:'PROJECT',targetId:id,metadata:{name:input.name},ip:req.ip});
    res.status(201).json({project:{id,...input,status:'PLANNING'}});
  }catch(e){next(e);}
});

router.get('/projects/:projectId/tasks',async(req,res,next)=>{
  try{
    const [scope]=await pool.execute('SELECT organization_id FROM projects WHERE id=? LIMIT 1',[req.params.projectId]);
    if(!scope.length)return res.status(404).json({error:'Project not found.'});
    const [members]=await pool.execute("SELECT role FROM memberships WHERE organization_id=? AND user_id=? AND membership_status='ACTIVE'",[scope[0].organization_id,req.user.id]);
    if(!members.length)return res.status(403).json({error:'Insufficient organization permissions.'});
    const [rows]=await pool.execute(
      'SELECT t.id,t.title,t.description,t.status,t.priority,t.due_date AS dueDate,t.assignee_id AS assigneeId,u.full_name AS assigneeName,t.created_at AS createdAt FROM tasks t LEFT JOIN users u ON u.id=t.assignee_id WHERE t.project_id=? ORDER BY t.created_at DESC',
      [req.params.projectId]
    );
    res.json({tasks:rows});
  }catch(e){next(e);}
});

router.post('/projects/:projectId/tasks',async(req,res,next)=>{
  try{
    const input=z.object({title:z.string().trim().min(2).max(180),description:z.string().trim().max(2000).optional().default(''),priority:z.enum(['LOW','MEDIUM','HIGH','URGENT']).default('MEDIUM'),dueDate:z.string().date().optional(),assigneeId:z.string().uuid().optional()}).parse(req.body);
    const [scope]=await pool.execute('SELECT organization_id FROM projects WHERE id=? LIMIT 1',[req.params.projectId]);
    if(!scope.length)return res.status(404).json({error:'Project not found.'});
    const orgId=scope[0].organization_id;
    const [members]=await pool.execute("SELECT role FROM memberships WHERE organization_id=? AND user_id=? AND membership_status='ACTIVE'",[orgId,req.user.id]);
    if(!members.length||!['OWNER','ADMIN','MANAGER','ANALYST'].includes(members[0].role))return res.status(403).json({error:'Insufficient organization permissions.'});
    if(input.assigneeId){
      const [assignee]=await pool.execute("SELECT id FROM memberships WHERE organization_id=? AND user_id=? AND membership_status='ACTIVE'",[orgId,input.assigneeId]);
      if(!assignee.length)return res.status(400).json({error:'Assignee must be an active member of this organization.'});
    }
    const id=randomUUID();
    await pool.execute('INSERT INTO tasks (id,project_id,title,description,status,priority,due_date,assignee_id,created_by) VALUES (?,?,?,?,"TODO",?,?,?,?)',[id,req.params.projectId,input.title,input.description,input.priority,input.dueDate||null,input.assigneeId||null,req.user.id]);
    await audit({orgId,actorId:req.user.id,action:'TASK_CREATED',targetType:'TASK',targetId:id,ip:req.ip});
    res.status(201).json({task:{id,...input,status:'TODO'}});
  }catch(e){next(e);}
});

router.patch('/tasks/:taskId',async(req,res,next)=>{
  try{
    const input=z.object({status:z.enum(['TODO','IN_PROGRESS','BLOCKED','DONE']).optional(),priority:z.enum(['LOW','MEDIUM','HIGH','URGENT']).optional(),assigneeId:z.string().uuid().nullable().optional()}).refine(v=>Object.keys(v).length>0).parse(req.body);
    const [rows]=await pool.execute('SELECT t.project_id,t.assignee_id,p.organization_id FROM tasks t JOIN projects p ON p.id=t.project_id WHERE t.id=? LIMIT 1',[req.params.taskId]);
    if(!rows.length)return res.status(404).json({error:'Task not found.'});
    const orgId=rows[0].organization_id;
    const [members]=await pool.execute("SELECT role FROM memberships WHERE organization_id=? AND user_id=? AND membership_status='ACTIVE'",[orgId,req.user.id]);
    if(!members.length)return res.status(403).json({error:'Insufficient organization permissions.'});
    const role=members[0].role;
    const manager=['OWNER','ADMIN','MANAGER'].includes(role);
    if(!manager && (input.assigneeId!==undefined || input.priority!==undefined)) return res.status(403).json({error:'Only managers can change task assignments or priority.'});
    if(!manager && rows[0].assignee_id!==req.user.id) return res.status(403).json({error:'Only managers or the assigned member can update this task.'});
    if(input.assigneeId){
      const [assignee]=await pool.execute("SELECT id FROM memberships WHERE organization_id=? AND user_id=? AND membership_status='ACTIVE'",[orgId,input.assigneeId]);
      if(!assignee.length)return res.status(400).json({error:'Assignee must be an active organization member.'});
    }
    const sets=[],values=[];
    for(const key of ['status','priority','assigneeId'])if(input[key]!==undefined){sets.push(key==='assigneeId'?'assignee_id = ?':key+' = ?');values.push(input[key]);}
    values.push(req.params.taskId);
    await pool.execute('UPDATE tasks SET '+sets.join(', ')+', updated_at=NOW() WHERE id=?',values);
    await audit({orgId,actorId:req.user.id,action:'TASK_UPDATED',targetType:'TASK',targetId:req.params.taskId,metadata:input,ip:req.ip});
    res.json({message:'Task updated.'});
  }catch(e){next(e);}
});

export default router;
