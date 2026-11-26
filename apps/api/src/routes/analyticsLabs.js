import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { pool } from '../db.js';
import { audit } from '../audit.js';
import { requireAuth, requireActiveUser } from '../middleware.js';

const router=Router();
router.use(requireAuth,requireActiveUser);
const templates=['python-analytics','sql-analytics','excel-powerbi-basics'];

router.get('/organizations/:orgId/labs',async(req,res,next)=>{
 try{
  const [m]=await pool.execute("SELECT role FROM memberships WHERE organization_id=? AND user_id=? AND membership_status='ACTIVE' LIMIT 1",[req.params.orgId,req.user.id]);
  if(!m.length)return res.status(403).json({error:'Active organization membership required.'});
  const role=m[0].role;
  let sql='SELECT l.id,l.lab_name AS name,l.template,l.status,l.provider,l.project_id AS projectId,l.task_id AS taskId,l.created_at AS createdAt,l.updated_at AS updatedAt FROM analytics_labs l WHERE l.organization_id=?';
  const args=[req.params.orgId];
  if(role==='ANALYST'){sql+=' AND (l.owner_user_id=? OR EXISTS(SELECT 1 FROM analytics_lab_access a WHERE a.lab_id=l.id AND a.user_id=? AND a.revoked_at IS NULL))';args.push(req.user.id,req.user.id);}
  else if(role==='LEADER'){sql+=' AND (l.owner_user_id=? OR l.project_id IN (SELECT p.id FROM projects p JOIN tasks t ON t.project_id=p.id JOIN teams tm ON tm.id=t.team_id WHERE tm.organization_id=? AND tm.leader_user_id=?))';args.push(req.user.id,req.params.orgId,req.user.id);}
  else if(!['OWNER','MANAGER','ADMIN'].includes(role))return res.status(403).json({error:'Insufficient permissions.'});
  sql+=' ORDER BY l.updated_at DESC LIMIT 100';
  const [labs]=await pool.execute(sql,args);res.json({labs});
 }catch(e){next(e);}
});

router.post('/organizations/:orgId/labs',async(req,res,next)=>{
 try{
  const [m]=await pool.execute("SELECT role FROM memberships WHERE organization_id=? AND user_id=? AND membership_status='ACTIVE' LIMIT 1",[req.params.orgId,req.user.id]);
  if(!m.length||m[0].role!=='OWNER')return res.status(403).json({error:'Only the organization Owner may request lab provisioning.'});
  const input=z.object({name:z.string().trim().min(2).max(160),template:z.enum(templates),projectId:z.string().uuid().optional(),taskId:z.string().uuid().optional()}).parse(req.body);
  if(input.projectId){const [p]=await pool.execute('SELECT id FROM projects WHERE id=? AND organization_id=? LIMIT 1',[input.projectId,req.params.orgId]);if(!p.length)return res.status(400).json({error:'Project must belong to this organization.'});}
  if(input.taskId){const [t]=await pool.execute('SELECT t.id,t.project_id FROM tasks t JOIN projects p ON p.id=t.project_id WHERE t.id=? AND p.organization_id=? LIMIT 1',[input.taskId,req.params.orgId]);if(!t.length)return res.status(400).json({error:'Task must belong to this organization.'});if(input.projectId&&t[0].project_id!==input.projectId)return res.status(400).json({error:'Task must belong to the selected project.'});}
  const [quota]=await pool.execute("SELECT COUNT(*) AS n FROM analytics_labs WHERE organization_id=? AND status IN ('REQUESTED','PROVISIONING','RUNNING')",[req.params.orgId]);
  if(Number(quota[0].n)>=3)return res.status(409).json({error:'Organization lab request limit reached (3 active or pending labs).'});
  const id=randomUUID();
  await pool.execute("INSERT INTO analytics_labs (id,organization_id,project_id,task_id,owner_user_id,lab_name,provider,status,template,resource_policy_json) VALUES (?,?,?,?,?,?,'pending','REQUESTED',?,?)",[id,req.params.orgId,input.projectId||null,input.taskId||null,req.user.id,input.name,input.template,JSON.stringify({cpu:2,memoryMb:2048,diskMb:8192,expiresInHours:24})]);
  await audit({orgId:req.params.orgId,actorId:req.user.id,action:'ANALYTICS_LAB_REQUESTED',targetType:'ANALYTICS_LAB',targetId:id,metadata:{template:input.template,projectId:input.projectId||null,taskId:input.taskId||null},ip:req.ip});
  res.status(201).json({lab:{id,name:input.name,template:input.template,status:'REQUESTED',provider:'pending'},message:'Request recorded. Runtime provisioning is not yet connected.'});
 }catch(e){next(e);}
});

router.get('/labs/:labId',async(req,res,next)=>{
 try{
  const [rows]=await pool.execute('SELECT l.*,l.lab_name AS name,l.project_id AS projectId,l.task_id AS taskId,l.owner_user_id AS ownerUserId,l.created_at AS createdAt,l.updated_at AS updatedAt FROM analytics_labs l WHERE l.id=? LIMIT 1',[req.params.labId]);
  if(!rows.length)return res.status(404).json({error:'Lab not found.'});
  const lab=rows[0];
  const [members]=await pool.execute("SELECT role FROM memberships WHERE organization_id=? AND user_id=? AND membership_status='ACTIVE' LIMIT 1",[lab.organization_id,req.user.id]);
  if(!members.length)return res.status(403).json({error:'Active organization membership required.'});
  const role=members[0].role;
  let allowed=['OWNER','MANAGER','ADMIN'].includes(role);
  if(role==='ANALYST'){
    const [access]=await pool.execute('SELECT 1 FROM analytics_lab_access WHERE lab_id=? AND user_id=? AND revoked_at IS NULL LIMIT 1',[lab.id,req.user.id]);
    allowed=lab.ownerUserId===req.user.id||access.length>0;
  }
  if(role==='LEADER'){
    const [scope]=await pool.execute('SELECT 1 FROM tasks t JOIN teams tm ON tm.id=t.team_id WHERE t.id=? AND tm.organization_id=? AND tm.leader_user_id=? LIMIT 1',[lab.task_id,lab.organization_id,req.user.id]);
    allowed=scope.length>0;
  }
  if(!allowed)return res.status(403).json({error:'Insufficient permissions.'});
  delete lab.provider_instance_id;delete lab.storage_ref;delete lab.resource_policy_json;
  res.json({lab});
 }catch(e){next(e);}
});

router.get('/labs/:labId/events',async(req,res,next)=>{
 try{
  const [labs]=await pool.execute('SELECT id,organization_id,owner_user_id,task_id FROM analytics_labs WHERE id=? LIMIT 1',[req.params.labId]);
  if(!labs.length)return res.status(404).json({error:'Lab not found.'});
  const lab=labs[0];
  const [members]=await pool.execute("SELECT role FROM memberships WHERE organization_id=? AND user_id=? AND membership_status='ACTIVE' LIMIT 1",[lab.organization_id,req.user.id]);
  if(!members.length)return res.status(403).json({error:'Active organization membership required.'});
  const role=members[0].role;let allowed=['OWNER','MANAGER','ADMIN'].includes(role);
  if(role==='ANALYST'){
   const [access]=await pool.execute('SELECT 1 FROM analytics_lab_access WHERE lab_id=? AND user_id=? AND revoked_at IS NULL LIMIT 1',[lab.id,req.user.id]);
   allowed=lab.owner_user_id===req.user.id||access.length>0;
  }
  if(role==='LEADER'){
   const [scope]=await pool.execute('SELECT 1 FROM tasks t JOIN teams tm ON tm.id=t.team_id WHERE t.id=? AND tm.organization_id=? AND tm.leader_user_id=? LIMIT 1',[lab.task_id,lab.organization_id,req.user.id]);
   allowed=scope.length>0;
  }
  if(!allowed)return res.status(403).json({error:'Insufficient permissions.'});
  const [events]=await pool.execute('SELECT event_type AS eventType,details_json AS details,created_at AS createdAt FROM analytics_lab_events WHERE lab_id=? ORDER BY created_at DESC LIMIT 100',[lab.id]);
  res.json({events});
 }catch(e){next(e);}
});

export default router;
