import {Router} from 'express';
import bcrypt from 'bcryptjs';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {pool} from '../db.js';
import {audit} from '../audit.js';
import {sendEmail} from '../mailer.js';
import {config} from '../config.js';
import {requireAuth,loadUser} from '../middleware.js';
const router=Router();
const registerSchema=z.object({fullName:z.string().trim().min(2).max(120),email:z.string().trim().email().max(254).transform(v=>v.toLowerCase()),password:z.string().min(12).max(128)});
const tokenHash=token=>createHash('sha256').update(token).digest('hex');
const tokenUrl=(path,token)=>config.appOrigin+path+'?token='+encodeURIComponent(token);
async function createToken(userId,purpose){
 await pool.execute('UPDATE auth_tokens SET used_at=NOW() WHERE user_id=? AND purpose=? AND used_at IS NULL',[userId,purpose]);
 const token=randomBytes(32).toString('hex');
 await pool.execute('INSERT INTO auth_tokens (id,user_id,token_hash,purpose,expires_at) VALUES (?,?,?,?,?)',[randomUUID(),userId,tokenHash(token),purpose,purpose==='EMAIL_VERIFY'?new Date(Date.now()+24*60*60*1000):new Date(Date.now()+60*60*1000)]);
 return token;
}
router.post('/register',async(req,res,next)=>{
 try{
  if(config.nodeEnv==='production'&&!config.smtpHost)return res.status(503).json({error:'Account registration is temporarily unavailable because email delivery is not configured.'});
  const input=registerSchema.parse(req.body);
  const [existing]=await pool.execute('SELECT id FROM users WHERE email=?',[input.email]);
  if(existing.length)return res.status(409).json({error:'An account with this email already exists.'});
  const id=randomUUID(),hash=await bcrypt.hash(input.password,12);
  await pool.execute("INSERT INTO users (id,full_name,email,password_hash,account_status) VALUES (?,?,?,?,'PENDING')",[id,input.fullName,input.email,hash]);
  const token=await createToken(id,'EMAIL_VERIFY');
  const verificationUrl=tokenUrl('/verify-email',token);
  const sent=await sendEmail({to:input.email,subject:'Verify your NEXUS Analytics email',text:'Hello '+input.fullName+',\n\nVerify your email to continue: '+verificationUrl+'\n\nThis link expires in 24 hours.'});
  await audit({actorId:id,action:'USER_REGISTERED',targetType:'USER',targetId:id,ip:req.ip});
  res.status(201).json({message:sent?'Registration received. Check your email to verify your account before signing in.':'Registration received. Verify your email using the development link below.',userId:id,...(!sent&&config.nodeEnv!=='production'?{verificationUrl}:{})});
 }catch(err){next(err);}
});
router.post('/verify-email',async(req,res,next)=>{
 const conn=await pool.getConnection();
 try{
  const {token}=z.object({token:z.string().min(32).max(256)}).parse(req.body);
  await conn.beginTransaction();
  const [rows]=await conn.execute("SELECT id,user_id FROM auth_tokens WHERE token_hash=? AND purpose='EMAIL_VERIFY' AND used_at IS NULL AND expires_at>NOW() FOR UPDATE",[tokenHash(token)]);
  if(!rows.length){await conn.rollback();return res.status(400).json({error:'Verification link is invalid or expired.'});}
  const item=rows[0];
  await conn.execute('UPDATE users SET email_verified_at=COALESCE(email_verified_at,NOW()) WHERE id=?',[item.user_id]);
  await conn.execute('UPDATE auth_tokens SET used_at=NOW() WHERE id=?',[item.id]);
  await conn.commit();
  await audit({actorId:item.user_id,action:'EMAIL_VERIFIED',targetType:'USER',targetId:item.user_id,ip:req.ip});
  res.json({message:'Email verified. You can now sign in; organization access may still require approval.'});
 }catch(err){await conn.rollback().catch(()=>{});next(err);}finally{conn.release();}
});
router.post('/resend-verification',async(req,res,next)=>{
 try{
  const email=z.string().trim().email().max(254).parse(req.body.email).toLowerCase();
  const [rows]=await pool.execute('SELECT id,full_name,email_verified_at FROM users WHERE email=? LIMIT 1',[email]);
  if(!rows.length||rows[0].email_verified_at)return res.json({message:'If the account needs verification, a new link has been sent.'});
  if(config.nodeEnv==='production'&&!config.smtpHost)return res.status(503).json({error:'Email delivery is not configured.'});
  const token=await createToken(rows[0].id,'EMAIL_VERIFY'),url=tokenUrl('/verify-email',token);
  const sent=await sendEmail({to:email,subject:'Your NEXUS verification link',text:'Verify your email: '+url+'\n\nThis link expires in 24 hours.'});
  res.json({message:sent?'If the account needs verification, a new link has been sent.':'Development verification link generated.',...(!sent&&config.nodeEnv!=='production'?{verificationUrl:url}:{})});
 }catch(err){next(err);}
});
router.post('/login',async(req,res,next)=>{
 try{
  const email=String(req.body.email||'').trim().toLowerCase(),password=String(req.body.password||'');
  const [rows]=await pool.execute('SELECT id,password_hash,account_status,email_verified_at FROM users WHERE email=? LIMIT 1',[email]);
  const user=rows[0];
  if(!user||!(await bcrypt.compare(password,user.password_hash)))return res.status(401).json({error:'Invalid email or password.'});
  if(user.account_status==='SUSPENDED')return res.status(403).json({error:'This account has been suspended.'});
  if(!user.email_verified_at)return res.status(403).json({error:'Verify your email before signing in. You can request a new verification link.'});
  req.session.regenerate(err=>{
   if(err)return next(err);
   req.session.userId=user.id;
   req.session.save(async saveErr=>{
    if(saveErr)return next(saveErr);
    try{await audit({actorId:user.id,action:'USER_LOGIN',targetType:'USER',targetId:user.id,ip:req.ip});res.json({message:'Login successful.'});}
    catch(e){next(e);}
   });
  });
 }catch(err){next(err);}
});
router.post('/forgot-password',async(req,res,next)=>{
 try{
  const email=z.string().trim().email().max(254).parse(req.body.email).toLowerCase();
  const [rows]=await pool.execute('SELECT id FROM users WHERE email=? LIMIT 1',[email]);
  if(!rows.length)return res.json({message:'If an account exists for that email, a reset link has been sent.'});
  if(config.nodeEnv==='production'&&!config.smtpHost)return res.status(503).json({error:'Password recovery email is not configured.'});
  const token=await createToken(rows[0].id,'PASSWORD_RESET'),url=tokenUrl('/reset-password',token);
  const sent=await sendEmail({to:email,subject:'Reset your NEXUS Analytics password',text:'Reset your password: '+url+'\n\nThis link expires in 1 hour. If you did not request this, ignore this email.'});
  res.json({message:'If an account exists for that email, a reset link has been sent.',...(!sent&&config.nodeEnv!=='production'?{resetUrl:url}:{})});
 }catch(err){next(err);}
});
router.post('/reset-password',async(req,res,next)=>{
 const conn=await pool.getConnection();
 try{
  const input=z.object({token:z.string().min(32).max(256),password:z.string().min(12).max(128)}).parse(req.body);
  await conn.beginTransaction();
  const [rows]=await conn.execute("SELECT id,user_id FROM auth_tokens WHERE token_hash=? AND purpose='PASSWORD_RESET' AND used_at IS NULL AND expires_at>NOW() FOR UPDATE",[tokenHash(input.token)]);
  if(!rows.length){await conn.rollback();return res.status(400).json({error:'Password reset link is invalid or expired.'});}
  const item=rows[0],hash=await bcrypt.hash(input.password,12);
  await conn.execute('UPDATE users SET password_hash=? WHERE id=?',[hash,item.user_id]);
  await conn.execute('DELETE FROM sessions WHERE data LIKE ?',['%'+item.user_id+'%']);
  await conn.execute("UPDATE auth_tokens SET used_at=NOW() WHERE user_id=? AND purpose='PASSWORD_RESET' AND used_at IS NULL",[item.user_id]);
  await conn.commit();
  await audit({actorId:item.user_id,action:'PASSWORD_RESET',targetType:'USER',targetId:item.user_id,ip:req.ip});
  res.json({message:'Password updated. Sign in with your new password.'});
 }catch(err){await conn.rollback().catch(()=>{});next(err);}finally{conn.release();}
});
router.post('/logout',requireAuth,async(req,res,next)=>{
 const userId=req.session.userId;
 try{await audit({actorId:userId,action:'USER_LOGOUT',targetType:'USER',targetId:userId,ip:req.ip});req.session.destroy(err=>{if(err)return next(err);res.clearCookie('hub.sid');res.json({message:'Logged out.'});});}
 catch(err){next(err);}
});
router.get('/me',requireAuth,loadUser,async(req,res,next)=>{
 try{
  const [memberships]=await pool.execute("SELECT o.id AS organizationId,o.name AS organizationName,m.role FROM memberships m JOIN organizations o ON o.id=m.organization_id WHERE m.user_id=? AND m.membership_status='ACTIVE'",[req.user.id]);
  res.json({user:{id:req.user.id,fullName:req.user.full_name,email:req.user.email,status:req.user.account_status,emailVerified:!!req.user.email_verified_at},organizations:memberships});
 }catch(err){next(err);}
});
export default router;
