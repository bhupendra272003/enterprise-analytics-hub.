import {Router} from 'express';
import {randomUUID} from 'node:crypto';
import {pool} from '../db.js';
import {requireAuth,requireActiveUser} from '../middleware.js';
const router=Router();
router.use(requireAuth,requireActiveUser);
export async function notifyUser({userId,organizationId=null,type,title,message,href=null}){
 try{await pool.execute('INSERT INTO notifications (id,user_id,organization_id,type,title,message,href) VALUES (?,?,?,?,?,?,?)',[randomUUID(),userId,organizationId,type,title,message,href]);}
 catch(error){console.error('Notification delivery failed:',error.message);}
}
export async function notifyOrganizationRoles({organizationId,roles,title,message,type='WORKSPACE_UPDATE',href=null,excludeUserId=null}){
 try{
  const slots=roles.map(()=>'?').join(',');
  const sql="SELECT user_id FROM memberships WHERE organization_id=? AND membership_status='ACTIVE' AND role IN ("+slots+")"+(excludeUserId?' AND user_id <> ?':'');
  const [users]=await pool.execute(sql,excludeUserId?[organizationId,...roles,excludeUserId]:[organizationId,...roles]);
  await Promise.all(users.map(row=>notifyUser({userId:row.user_id,organizationId,type,title,message,href})));
 }catch(error){console.error('Organization notification failed:',error.message);}
}
router.get('/',async(req,res,next)=>{
 try{const [rows]=await pool.execute('SELECT id,organization_id AS organizationId,type,title,message,href,read_at AS readAt,created_at AS createdAt FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100',[req.user.id]);const [count]=await pool.execute('SELECT COUNT(*) AS unreadCount FROM notifications WHERE user_id=? AND read_at IS NULL',[req.user.id]);res.json({notifications:rows,unreadCount:Number(count[0].unreadCount)});}catch(e){next(e);}
});
router.patch('/read-all',async(req,res,next)=>{
 try{await pool.execute('UPDATE notifications SET read_at=NOW() WHERE user_id=? AND read_at IS NULL',[req.user.id]);res.json({message:'All notifications marked as read.'});}catch(e){next(e);}
});
router.patch('/:notificationId/read',async(req,res,next)=>{
 try{const [result]=await pool.execute('UPDATE notifications SET read_at=COALESCE(read_at,NOW()) WHERE id=? AND user_id=?',[req.params.notificationId,req.user.id]);if(!result.affectedRows)return res.status(404).json({error:'Notification not found.'});res.json({message:'Notification marked as read.'});}catch(e){next(e);}
});
export default router;
