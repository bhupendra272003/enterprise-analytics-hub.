'use client';

import { useCallback, useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
type Member = { id:string; fullName:string; email:string; accountStatus:string; role:string; membershipStatus:string; joinedAt:string };
type AccessRequest = { id:string; userId:string; fullName:string; email:string; requestedAt:string };

export default function PeoplePanel({ organizationId, role }: { organizationId:string; role:string }) {
  const [members,setMembers]=useState<Member[]>([]);
  const [requests,setRequests]=useState<AccessRequest[]>([]);
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState('');
  const [draftRoles,setDraftRoles]=useState<Record<string,string>>({});
  const canReview=['OWNER','ADMIN'].includes(role);
  const canManageMembers=canReview;
  const canView=['OWNER','ADMIN','MANAGER'].includes(role);
  const load=useCallback(async()=>{
    if(!organizationId || !canView) return;
    try {
      const headers={'X-Hub-Request':'1'};
      const [m,r]=await Promise.all([
        fetch(`${API}/api/organizations/${organizationId}/members`,{credentials:'include',headers}),
        fetch(`${API}/api/organizations/${organizationId}/requests`,{credentials:'include',headers})
      ]);
      const md=await m.json(); const rd=await r.json();
      if(!m.ok) throw new Error(md.error||'Could not load members.');
      if(!r.ok) throw new Error(rd.error||'Could not load access requests.');
      setMembers(md.members||[]); setRequests(rd.requests||[]);
    } catch(e) { setNotice(e instanceof Error?e.message:'Could not load people.'); }
  },[organizationId,canView]);
  useEffect(()=>{load();},[load]);
  async function decide(requestId:string,decision:'APPROVE'|'REJECT',assignedRole='ANALYST'){
    setBusy(requestId);setNotice('');
    try{
      const response=await fetch(`${API}/api/organizations/${organizationId}/requests/${requestId}`,{
        method:'PATCH',credentials:'include',
        headers:{'Content-Type':'application/json','X-Hub-Request':'1'},
        body:JSON.stringify({decision,...(decision==='APPROVE'?{role:assignedRole}:{})})
      });
      const data=await response.json();if(!response.ok)throw new Error(data.error||'Action failed.');
      setNotice(data.message);await load();
    }catch(e){setNotice(e instanceof Error?e.message:'Action failed.');}
    finally{setBusy('');}
  }
  async function updateMember(member:Member,change:{role?:string;membershipStatus?:string}){
    setBusy(member.id);setNotice('');
    try{
      const response=await fetch(`${API}/api/organizations/${organizationId}/members/${member.id}`,{
        method:'PATCH',credentials:'include',headers:{'Content-Type':'application/json','X-Hub-Request':'1'},body:JSON.stringify(change)
      });
      const data=await response.json();if(!response.ok)throw new Error(data.error||'Member update failed.');
      setNotice(data.message);await load();
    }catch(e){setNotice(e instanceof Error?e.message:'Member update failed.');}
    finally{setBusy('');}
  }
  if(!canView) return null;
  return <section className="panel people-panel">
    <div className="panel-title"><div><small>ORGANIZATION DIRECTORY</small><h2>People & access</h2></div><span className="count-chip">{members.length} MEMBERS</span></div>
    {notice&&<div className="team-notice" role="status">{notice}</div>}
    <div className="people-table-wrap"><table className="people-table"><thead><tr><th>MEMBER</th><th>ROLE</th><th>ACCOUNT</th><th>MEMBERSHIP</th>{canManageMembers&&<th>ACTIONS</th>}</tr></thead><tbody>
      {members.map(member=><tr key={member.id}><td><b>{member.fullName}</b><small>{member.email}</small></td><td><span className="role-pill">{member.role}</span></td><td>{member.accountStatus}</td><td>{member.membershipStatus}</td>{canManageMembers&&<td>{member.role!=='OWNER'&&!(role==='ADMIN'&&member.role==='ADMIN')?<div className="member-actions"><select aria-label={`Role for ${member.fullName}`} value={draftRoles[member.id]||member.role} onChange={e=>setDraftRoles(v=>({...v,[member.id]:e.target.value}))}>{role==='OWNER'&&<option value="ADMIN">Admin</option>}<option value="MANAGER">Manager</option><option value="ANALYST">Analyst</option><option value="VIEWER">Viewer</option></select><button disabled={!!busy||((draftRoles[member.id]||member.role)===member.role)} onClick={()=>updateMember(member,{role:draftRoles[member.id]||member.role})}>Save</button><button className="member-status-button" disabled={!!busy} onClick={()=>updateMember(member,{membershipStatus:member.membershipStatus==='ACTIVE'?'SUSPENDED':'ACTIVE'})}>{member.membershipStatus==='ACTIVE'?'Suspend':'Restore'}</button></div>:<span className="people-empty">Protected</span>}</td>}</tr>)}
      {!members.length&&<tr><td colSpan={canManageMembers?5:4} className="people-empty">No members found in this workspace.</td></tr>}
    </tbody></table></div>
    <div className="panel-title requests-title"><div><small>REVIEW QUEUE</small><h2>Pending access requests</h2></div><span className="count-chip">{requests.length} PENDING</span></div>
    {requests.length?requests.map(item=><article className="request-card" key={item.id}>
      <div className="request-person"><span className="org-avatar">{item.fullName.slice(0,1).toUpperCase()}</span><span><b>{item.fullName}</b><small>{item.email}</small></span></div>
      {canReview?<div className="request-actions"><select aria-label="Assign role" id={`role-${item.id}`} defaultValue="ANALYST"><option value="ANALYST">Analyst</option><option value="MANAGER">Manager</option><option value="VIEWER">Viewer</option></select><button disabled={!!busy} onClick={()=>{const el=document.getElementById(`role-${item.id}`) as HTMLSelectElement|null;decide(item.id,'APPROVE',el?.value||'ANALYST')}}>{busy===item.id?'…':'Approve'}</button><button className="reject-button" disabled={!!busy} onClick={()=>decide(item.id,'REJECT')}>Reject</button></div>:<span className="role-pill">Awaiting admin review</span>}
    </article>):<div className="people-empty">You're all caught up. No pending access requests.</div>}
  </section>;
}
