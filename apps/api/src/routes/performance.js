import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { pool } from '../db.js';
import { audit } from '../audit.js';
import { requireAuth, requireActiveUser } from '../middleware.js';

const router = Router();
router.use(requireAuth, requireActiveUser);

// Owner and Manager get the organization-wide view. A Leader may only inspect their own team.
router.get('/organizations/:orgId/performance', async (req, res, next) => {
  try {
    const [membership] = await pool.execute(
      "SELECT role FROM memberships WHERE organization_id=? AND user_id=? AND membership_status='ACTIVE' LIMIT 1",
      [req.params.orgId, req.user.id]
    );
    if (!membership.length || !['OWNER','MANAGER'].includes(membership[0].role)) {
      return res.status(403).json({ error: 'Only the Owner or Manager can view organization-wide performance.' });
    }
    const [teams] = await pool.execute(
      `SELECT t.id,t.name,t.leader_user_id AS leaderId,lu.full_name AS leaderName,t.status,
        COUNT(DISTINCT tm.user_id) AS memberCount,
        COUNT(DISTINCT CASE WHEN tk.id IS NOT NULL THEN tk.id END) AS taskCount,
        COUNT(DISTINCT CASE WHEN tk.status='DONE' THEN tk.id END) AS completedTasks,
        COUNT(DISTINCT CASE WHEN tk.due_date IS NOT NULL AND tk.due_date<CURDATE() AND tk.status<>'DONE' THEN tk.id END) AS overdueTasks
       FROM teams t
       LEFT JOIN users lu ON lu.id=t.leader_user_id
       LEFT JOIN team_members tm ON tm.team_id=t.id
       LEFT JOIN tasks tk ON tk.team_id=t.id
       WHERE t.organization_id=?
       GROUP BY t.id,t.name,t.leader_user_id,lu.full_name,t.status
       ORDER BY t.name`,
      [req.params.orgId]
    );
    const [members] = await pool.execute(
      `SELECT tm.team_id AS teamId, u.id AS userId,u.full_name AS fullName,m.role,
        COUNT(DISTINCT tk.id) AS assignedTasks,
        COUNT(DISTINCT CASE WHEN tk.status='DONE' THEN tk.id END) AS completedTasks,
        COUNT(DISTINCT CASE WHEN tk.status='BLOCKED' THEN tk.id END) AS blockedTasks,
        COUNT(DISTINCT CASE WHEN tk.due_date IS NOT NULL AND tk.due_date<CURDATE() AND tk.status<>'DONE' THEN tk.id END) AS overdueTasks,
        COUNT(DISTINCT CASE WHEN tk.due_date IS NOT NULL AND tk.status='DONE' AND DATE(tk.updated_at)<=tk.due_date THEN tk.id END) AS onTimeTasks,
        SUM(CASE WHEN tk.id IS NOT NULL AND tk.created_by=u.id THEN 1 ELSE 0 END) AS selfCreatedTasks
       FROM team_members tm
       JOIN teams t ON t.id=tm.team_id AND t.organization_id=?
       JOIN users u ON u.id=tm.user_id
       JOIN memberships m ON m.organization_id=t.organization_id AND m.user_id=u.id AND m.membership_status='ACTIVE'
       LEFT JOIN tasks tk ON tk.team_id=t.id AND tk.assignee_id=u.id
       GROUP BY tm.team_id,u.id,u.full_name,m.role
       ORDER BY tm.team_id,u.full_name`,
      [req.params.orgId]
    );
    const [leaderWork] = await pool.execute(
      `SELECT t.id AS teamId,t.leader_user_id AS leaderId,
        COUNT(DISTINCT CASE WHEN tk.assigned_by=t.leader_user_id THEN tk.id END) AS tasksAssignedByLeader,
        COUNT(DISTINCT CASE WHEN tk.assignee_id=t.leader_user_id THEN tk.id END) AS tasksPersonallyOwnedByLeader,
        COUNT(DISTINCT CASE WHEN tk.assignee_id=t.leader_user_id AND tk.status='DONE' THEN tk.id END) AS leaderCompletedOwnTasks
       FROM teams t LEFT JOIN tasks tk ON tk.team_id=t.id
       WHERE t.organization_id=? GROUP BY t.id,t.leader_user_id`,
      [req.params.orgId]
    );
    const [allocationHistory] = await pool.execute(
      `SELECT team_id AS teamId,new_assignee_id AS userId,
        COUNT(*) AS assignmentEvents,COUNT(DISTINCT task_id) AS distinctTasksAssigned,
        COUNT(DISTINCT assigned_by) AS distinctAssigners,MAX(created_at) AS lastAssignedAt
       FROM task_assignment_history WHERE organization_id=? AND new_assignee_id IS NOT NULL
       GROUP BY team_id,new_assignee_id`,
      [req.params.orgId]
    );
    const [leaderAssignmentHistory] = await pool.execute(
      `SELECT team_id AS teamId,assigned_by AS leaderId,COUNT(*) AS assignmentEvents,
        COUNT(DISTINCT new_assignee_id) AS distinctRecipients,
        COUNT(DISTINCT task_id) AS distinctTasksTouched
       FROM task_assignment_history WHERE organization_id=? GROUP BY team_id,assigned_by`,
      [req.params.orgId]
    );
    const teamReports = teams.map(team => {
      const roster = members.filter(member => member.teamId === team.id).map(member => ({...member,...(allocationHistory.find(row=>row.teamId===team.id&&row.userId===member.userId)||{assignmentEvents:0,distinctTasksAssigned:0,distinctAssigners:0,lastAssignedAt:null})}));
      const counts = roster.map(member => Number(member.assignedTasks));
      const historyCounts = roster.map(member => Number(member.assignmentEvents));
      const max = counts.length ? Math.max(...counts) : 0;
      const min = counts.length ? Math.min(...counts) : 0;
      const leader = {...(leaderWork.find(row => row.teamId === team.id) || {}),...(leaderAssignmentHistory.find(row=>row.teamId===team.id&&row.leaderId===team.leaderId)||{assignmentEvents:0,distinctRecipients:0,distinctTasksTouched:0})};
      const signals = [];
      if (roster.length > 1 && Number(team.taskCount) > 0 && roster.some(member => Number(member.assignedTasks) === 0)) signals.push('MEMBER_WITH_NO_ASSIGNED_TASKS');
      if (roster.length > 1 && min > 0 && max >= min * 2 && max - min >= 2) signals.push('POSSIBLE_WORKLOAD_IMBALANCE');
      if (roster.length > 1 && historyCounts.some(value=>value===0) && Math.max(...historyCounts)>0) signals.push('POSSIBLE_ASSIGNMENT_EXCLUSION');
      if (roster.length > 1 && Math.min(...historyCounts)>0 && Math.max(...historyCounts)>=Math.min(...historyCounts)*2 && Math.max(...historyCounts)-Math.min(...historyCounts)>=2) signals.push('ASSIGNMENT_HISTORY_IMBALANCE');
      if (Number(leader.tasksAssignedByLeader || 0) > 0 && Number(leader.tasksPersonallyOwnedByLeader || 0) === 0) signals.push('LEADER_HAS_NO_PERSONAL_TASK_OWNERSHIP');
      return { ...team, members: roster, leaderWork: leader, allocationSignals: signals };
    });
    res.json({ teams: teamReports, methodology: {
      note: 'Signals are prompts for human review, not proof of favoritism or misconduct. Compare task complexity, availability, leave, skills and agreed workload before drawing conclusions.',
      taskCounts: 'Current task counts are paired with auditable assignment-history events, distinct tasks and distinct assigners. Compare task complexity, member capacity, leave and skill fit before deciding whether distribution is unfair.'
    }});
  } catch (err) { next(err); }
});

// Individual members can inspect only their own contribution record; Leaders can inspect their own team.
router.get('/organizations/:orgId/teams/:teamId/performance', async (req, res, next) => {
  try {
    const [membership] = await pool.execute(
      "SELECT role FROM memberships WHERE organization_id=? AND user_id=? AND membership_status='ACTIVE' LIMIT 1",
      [req.params.orgId, req.user.id]
    );
    if (!membership.length) return res.status(403).json({ error: 'Organization membership required.' });
    const role = membership[0].role;
    const [teamRows] = await pool.execute(
      'SELECT id,leader_user_id AS leaderId FROM teams WHERE id=? AND organization_id=? LIMIT 1',
      [req.params.teamId, req.params.orgId]
    );
    if (!teamRows.length) return res.status(404).json({ error: 'Team not found.' });
    const team = teamRows[0];
    if (role === 'LEADER' && team.leaderId !== req.user.id) return res.status(403).json({ error: 'Leaders can view only their own team.' });
    if (role === 'ANALYST') {
      const [roster] = await pool.execute('SELECT user_id FROM team_members WHERE team_id=? AND user_id=?', [team.id, req.user.id]);
      if (!roster.length) return res.status(403).json({ error: 'You can view only your own contribution.' });
    } else if (!['OWNER','MANAGER','LEADER'].includes(role)) {
      return res.status(403).json({ error: 'Insufficient permissions.' });
    }
    const subjectId = role === 'ANALYST' ? req.user.id : null;
    const [rows] = await pool.execute(
      `SELECT u.id AS userId,u.full_name AS fullName,m.role,
        COUNT(tk.id) AS assignedTasks,
        SUM(tk.status='DONE') AS completedTasks,
        SUM(tk.status='BLOCKED') AS blockedTasks,
        SUM(tk.due_date IS NOT NULL AND tk.due_date<CURDATE() AND tk.status<>'DONE') AS overdueTasks,
        SUM(tk.due_date IS NOT NULL AND tk.status='DONE' AND DATE(tk.updated_at)<=tk.due_date) AS onTimeTasks
       FROM team_members tm JOIN users u ON u.id=tm.user_id
       JOIN memberships m ON m.organization_id=? AND m.user_id=u.id AND m.membership_status='ACTIVE'
       LEFT JOIN tasks tk ON tk.team_id=tm.team_id AND tk.assignee_id=u.id
       WHERE tm.team_id=? AND (? IS NULL OR u.id=?)
       GROUP BY u.id,u.full_name,m.role ORDER BY u.full_name`,
      [req.params.orgId, team.id, subjectId, subjectId]
    );
    res.json({ teamId: team.id, members: rows });
  } catch (err) { next(err); }
});

// Members can request correction/context for their own performance evidence.
router.post('/organizations/:orgId/performance/corrections', async (req, res, next) => {
  try {
    const input = z.object({ taskId: z.string().uuid().optional(), reason: z.string().trim().min(10).max(2000) }).parse(req.body);
    const [member] = await pool.execute(
      "SELECT id FROM memberships WHERE organization_id=? AND user_id=? AND membership_status='ACTIVE' LIMIT 1",
      [req.params.orgId, req.user.id]
    );
    if (!member.length) return res.status(403).json({ error: 'Organization membership required.' });
    if (input.taskId) {
      const [task] = await pool.execute(
        'SELECT t.id FROM tasks t JOIN projects p ON p.id=t.project_id WHERE t.id=? AND p.organization_id=? AND (t.assignee_id=? OR t.created_by=?) LIMIT 1',
        [input.taskId, req.params.orgId, req.user.id, req.user.id]
      );
      if (!task.length) return res.status(404).json({ error: 'Task not found in your contribution history.' });
    }
    const id = randomUUID();
    await pool.execute(
      "INSERT INTO performance_corrections (id,organization_id,subject_user_id,requested_by,task_id,reason) VALUES (?,?,?,?,?,?)",
      [id, req.params.orgId, req.user.id, req.user.id, input.taskId || null, input.reason]
    );
    await audit({ orgId: req.params.orgId, actorId: req.user.id, action: 'PERFORMANCE_CORRECTION_REQUESTED', targetType: 'PERFORMANCE_CORRECTION', targetId: id, ip: req.ip });
    res.status(201).json({ id, status: 'OPEN', message: 'Your correction request was submitted for review.' });
  } catch (err) { next(err); }
});


router.get('/organizations/:orgId/performance/corrections', async (req,res,next)=>{
  try{
    const [membership]=await pool.execute("SELECT role FROM memberships WHERE organization_id=? AND user_id=? AND membership_status='ACTIVE' LIMIT 1",[req.params.orgId,req.user.id]);
    if(!membership.length||membership[0].role!=='OWNER')return res.status(403).json({error:'Only the Owner can review performance correction requests.'});
    const [rows]=await pool.execute(
      `SELECT c.id,c.subject_user_id AS subjectUserId,s.full_name AS subjectName,c.requested_by AS requestedBy,r.full_name AS requesterName,c.task_id AS taskId,c.reason,c.status,c.reviewer_note AS reviewerNote,c.created_at AS createdAt,c.reviewed_at AS reviewedAt
       FROM performance_corrections c JOIN users s ON s.id=c.subject_user_id JOIN users r ON r.id=c.requested_by
       WHERE c.organization_id=? ORDER BY c.created_at DESC LIMIT 100`,
      [req.params.orgId]
    );
    res.json({corrections:rows});
  }catch(err){next(err);}
});

router.patch('/organizations/:orgId/performance/corrections/:correctionId', async (req,res,next)=>{
  try{
    const input=z.object({status:z.enum(['ACCEPTED','DECLINED']),reviewerNote:z.string().trim().max(1000).optional().default('')}).parse(req.body);
    const [membership]=await pool.execute("SELECT role FROM memberships WHERE organization_id=? AND user_id=? AND membership_status='ACTIVE' LIMIT 1",[req.params.orgId,req.user.id]);
    if(!membership.length||membership[0].role!=='OWNER')return res.status(403).json({error:'Only the Owner can decide correction requests.'});
    const [result]=await pool.execute("UPDATE performance_corrections SET status=?,reviewed_by=?,reviewer_note=?,reviewed_at=NOW() WHERE id=? AND organization_id=? AND status='OPEN'",[input.status,req.user.id,input.reviewerNote,req.params.correctionId,req.params.orgId]);
    if(!result.affectedRows)return res.status(404).json({error:'Open correction request not found.'});
    await audit({orgId:req.params.orgId,actorId:req.user.id,action:'PERFORMANCE_CORRECTION_REVIEWED',targetType:'PERFORMANCE_CORRECTION',targetId:req.params.correctionId,metadata:{status:input.status},ip:req.ip});
    res.json({message:'Performance correction request reviewed.',status:input.status});
  }catch(err){next(err);}
});

export default router;
