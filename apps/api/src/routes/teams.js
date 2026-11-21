import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { pool } from '../db.js';
import { audit } from '../audit.js';
import { requireAuth, requireActiveUser } from '../middleware.js';

const router=Router();
router.use(requireAuth,requireActiveUser);

router.get('/organizations/:orgId/teams',async(req,res,next)=>{
  try{
    const [memberships]=await pool.execute("SELECT role FROM memberships WHERE organization_id=? AND user_id=? AND membership_status='ACTIVE' LIMIT 1",[req.params.orgId,req.user.id]);
    if(!memberships.length)return res.status(403).json({error:'Organization membership required.'});
    const role=memberships[0].role;
    let sql=`SELECT t.id,t.name,t.description,t.status,t.leader_user_id AS leaderId,u.full_name AS leaderName
      FROM teams t LEFT JOIN users u ON u.id=t.leader_user_id WHERE t.organization_id=?`;
    const params=[req.params.orgId];
    if(role==='LEADER'){sql+=' AND t.leader_user_id=?';params.push(req.user.id);}
    else if(role==='ANALYST'){sql+=' AND EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id=t.id AND tm.user_id=?)';params.push(req.user.id);}
    else if(!['OWNER','MANAGER'].includes(role))return res.status(403).json({error:'Insufficient permissions.'});
    sql+=' ORDER BY t.name';
    const [teams]=await pool.execute(sql,params);
    const [roster]=await pool.execute(
      `SELECT tm.team_id AS teamId,u.id AS userId,u.full_name AS fullName,m.role
       FROM team_members tm JOIN teams t ON t.id=tm.team_id JOIN users u ON u.id=tm.user_id
       JOIN memberships m ON m.organization_id=t.organization_id AND m.user_id=u.id
       WHERE t.organization_id=? AND m.membership_status='ACTIVE' ORDER BY u.full_name`,
      [req.params.orgId]
    );
    res.json({teams:teams.map(t=>({...t,members:roster.filter(m=>m.teamId===t.id)}))});
  }catch(e){next(e);}
});

router.post('/organizations/:orgId/teams',async(req,res,next)=>{
  const conn=await pool.getConnection();
  try{
    const [owners]=await conn.execute("SELECT role FROM memberships WHERE organization_id=? AND user_id=? AND membership_status='ACTIVE' LIMIT 1",[req.params.orgId,req.user.id]);
    if(!owners.length||owners[0].role!=='OWNER')return res.status(403).json({error:'Only the Owner can create teams and designate Leaders.'});
    const input=z.object({name:z.string().trim().min(2).max(120),description:z.string().trim().max(500).optional().default(''),leaderUserId:z.string().uuid()}).parse(req.body);
    const [leader]=await conn.execute("SELECT id FROM memberships WHERE organization_id=? AND user_id=? AND role='LEADER' AND membership_status='ACTIVE' LIMIT 1",[req.params.orgId,input.leaderUserId]);
    if(!leader.length)return res.status(400).json({error:'The designated Leader must be an active LEADER in this organization.'});
    const id=randomUUID();
    await conn.beginTransaction();
    await conn.execute("INSERT INTO teams (id,organization_id,name,description,leader_user_id,created_by) VALUES (?,?,?,?,?,?)",[id,req.params.orgId,input.name,input.description,input.leaderUserId,req.user.id]);
    await conn.execute("INSERT INTO team_members (team_id,user_id,added_by) VALUES (?,?,?)",[id,input.leaderUserId,req.user.id]);
    await conn.commit();
    await audit({orgId:req.params.orgId,actorId:req.user.id,action:'TEAM_CREATED',targetType:'TEAM',targetId:id,metadata:{name:input.name,leaderUserId:input.leaderUserId},ip:req.ip});
    res.status(201).json({team:{id,...input,status:'ACTIVE'}});
  }catch(e){try{await conn.rollback();}catch{}next(e);}finally{conn.release();}
});

router.post('/teams/:teamId/members',async(req,res,next)=>{
  try{
    const input=z.object({userId:z.string().uuid()}).parse(req.body);
    const [teams]=await pool.execute('SELECT id,organization_id FROM teams WHERE id=? LIMIT 1',[req.params.teamId]);
    if(!teams.length)return res.status(404).json({error:'Team not found.'});
    const team=teams[0];
    const [owner]=await pool.execute("SELECT role FROM memberships WHERE organization_id=? AND user_id=? AND membership_status='ACTIVE' LIMIT 1",[team.organization_id,req.user.id]);
    if(!owner.length||owner[0].role!=='OWNER')return res.status(403).json({error:'Only the Owner can add or move team members.'});
    const [analyst]=await pool.execute("SELECT id FROM memberships WHERE organization_id=? AND user_id=? AND role='ANALYST' AND membership_status='ACTIVE' LIMIT 1",[team.organization_id,input.userId]);
    if(!analyst.length)return res.status(400).json({error:'Only an active ANALYST can be added to a team.'});
    const [existing]=await pool.execute('SELECT tm.team_id FROM team_members tm JOIN teams t ON t.id=tm.team_id WHERE t.organization_id=? AND tm.user_id=? LIMIT 1',[team.organization_id,input.userId]);
    if(existing.length)return res.status(409).json({error:'This Analyst already belongs to a team. Remove them from the current team before moving them.'});
    await pool.execute('INSERT INTO team_members (team_id,user_id,added_by) VALUES (?,?,?)',[team.id,input.userId,req.user.id]);
    await audit({orgId:team.organization_id,actorId:req.user.id,action:'TEAM_MEMBER_ADDED',targetType:'TEAM',targetId:team.id,metadata:{userId:input.userId},ip:req.ip});
    res.status(201).json({message:'Analyst added to team.'});
  }catch(e){next(e);}
});

export default router;
