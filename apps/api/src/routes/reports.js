import {Router} from 'express';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {pool} from '../db.js';
import {audit} from '../audit.js';
import {requireAuth,requireActiveUser,requireRole} from '../middleware.js';
import {notifyOrganizationRoles} from './notifications.js';
const router=Router();
router.use(requireAuth,requireActiveUser);
const reportInput=z.object({title:z.string().trim().min(2).max(160),description:z.string().trim().max(1000).optional().default(''),reportUrl:z.string().url().refine(value=>{try{const u=new URL(value);return u.protocol==='https:'&&['app.powerbi.com','app.powerbi.de','app.powerbigov.us'].includes(u.hostname);}catch{return false;}},'Use a secure Power BI report URL.')});
router.get('/organizations/:orgId/reports',requireRole('OWNER','ADMIN','MANAGER','ANALYST','VIEWER'),async(req,res,next)=>{
 try{const [rows]=await pool.execute("SELECT r.id,r.title,r.description,r.report_url AS reportUrl,r.created_at AS createdAt,u.full_name AS createdBy FROM reports r JOIN users u ON u.id=r.created_by WHERE r.organization_id=? AND r.status='ACTIVE' ORDER BY r.created_at DESC",[req.params.orgId]);res.json({reports:rows});}catch(e){next(e);}
});
router.post('/organizations/:orgId/reports',requireRole('OWNER','ADMIN','MANAGER'),async(req,res,next)=>{
 try{const input=reportInput.parse(req.body);const id=randomUUID();await pool.execute("INSERT INTO reports (id,organization_id,title,description,report_url,created_by) VALUES (?,?,?,?,?,?)",[id,req.params.orgId,input.title,input.description,input.reportUrl,req.user.id]);await audit({orgId:req.params.orgId,actorId:req.user.id,action:'REPORT_REGISTERED',targetType:'REPORT',targetId:id,metadata:{title:input.title},ip:req.ip});await notifyOrganizationRoles({organizationId:req.params.orgId,roles:['OWNER','ADMIN','MANAGER','ANALYST','VIEWER'],excludeUserId:req.user.id,type:'REPORT_ADDED',title:'New Power BI report',message:'A new report was added to your organization workspace.',href:'/workspace/reports'});res.status(201).json({report:{id,...input}});}catch(e){next(e);}
});
router.patch('/reports/:reportId/archive',async(req,res,next)=>{
 try{const [rows]=await pool.execute('SELECT organization_id FROM reports WHERE id=? AND status=? LIMIT 1',[req.params.reportId,'ACTIVE']);if(!rows.length)return res.status(404).json({error:'Report not found.'});const orgId=rows[0].organization_id;const [membership]=await pool.execute("SELECT role FROM memberships WHERE organization_id=? AND user_id=? AND membership_status='ACTIVE'",[orgId,req.user.id]);if(!membership.length||!['OWNER','ADMIN','MANAGER'].includes(membership[0].role))return res.status(403).json({error:'Insufficient organization permissions.'});await pool.execute("UPDATE reports SET status='ARCHIVED' WHERE id=?",[req.params.reportId]);await audit({orgId,actorId:req.user.id,action:'REPORT_ARCHIVED',targetType:'REPORT',targetId:req.params.reportId,ip:req.ip});res.json({message:'Report archived.'});}catch(e){next(e);}
});
export default router;
