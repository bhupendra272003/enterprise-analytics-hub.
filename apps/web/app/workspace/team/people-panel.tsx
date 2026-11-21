'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
type Member = { id:string; fullName:string; email:string; accountStatus:string; role:string; membershipStatus:string; joinedAt:string };
type AccessRequest = { id:string; userId:string; fullName:string; email:string; requestedAt:string };

export default function PeoplePanel({ organizationId, role }: { organizationId:string; role:string }) {
  const [members,setMembers]=useState<Member[]>([]);
  const [requests,setRequests]=useState<AccessRequest[]>([]);
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState('');
  const [draftRoles,setDraftRoles]=useState<Record<string,string>>({});
  const [search,setSearch]=useState('');
  const [roleFilter,setRoleFilter]=useState('ALL');
  const [statusFilter,setStatusFilter]=useState('ALL');
  const [refreshing,setRefreshing]=useState(false);
  const canReview=role==='OWNER';
  const canManageMembers=canReview;
  const canView=['OWNER','MANAGER'].includes(role);

  const load=useCallback(async()=>{
    if(!organizationId || !canView) return;
    setRefreshing(true);
    try {
      const headers={'X-Hub-Request':'1'};
      const m=await fetch(`${API}/api/organizations/${organizationId}/members`,{credentials:'include',headers});
      const md=await m.json();
      if(!m.ok) throw new Error(md.error||'Could not load members.');
      setMembers(md.members||[]);
      if(canReview){
        const r=await fetch(`${API}/api/organizations/${organizationId}/requests`,{credentials:'include',headers});
        const rd=await r.json();
        if(!r.ok) throw new Error(rd.error||'Could not load access requests.');
        setRequests(rd.requests||[]);
      } else setRequests([]);
    } catch(e) { setNotice(e instanceof Error?e.message:'Could not load people.'); }
    finally { setRefreshing(false); }
  },[organizationId,canView,canReview]);

  useEffect(()=>{load();},[load]);

  const filteredMembers=useMemo(()=>{
    const q=search.trim().toLowerCase();
    return members.filter(member=>{
      const matchesSearch=!q || member.fullName.toLowerCase().includes(q) || member.email.toLowerCase().includes(q);
      const matchesRole=roleFilter==='ALL' || member.role===roleFilter;
      const matchesStatus=statusFilter==='ALL' || member.membershipStatus===statusFilter;
      return matchesSearch && matchesRole && matchesStatus;
    });
  },[members,search,roleFilter,statusFilter]);

  const activeCount=members.filter(m=>m.membershipStatus==='ACTIVE').length;
  const suspendedCount=members.filter(m=>m.membershipStatus==='SUSPENDED').length;

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
    <div className="panel-title people-heading">
      <div><small>ORGANIZATION DIRECTORY</small><h2>People & access</h2><p className="people-subtitle">Manage workspace membership, roles and access requests.</p></div>
      <div className="people-heading-actions"><span className="count-chip">{members.length} MEMBERS</span><button className="directory-refresh" onClick={load} disabled={refreshing} aria-label="Refresh member directory">{refreshing?'Refreshing…':'↻ Refresh'}</button></div>
    </div>
    <div className="people-metrics">
      <article><small>TOTAL MEMBERS</small><b>{members.length}</b><span>In this organization</span></article>
      <article><small>ACTIVE ACCESS</small><b>{activeCount}</b><span>Can access the workspace</span></article>
      <article><small>SUSPENDED</small><b>{suspendedCount}</b><span>Access currently paused</span></article>
      <article><small>WAITING FOR REVIEW</small><b>{requests.length}</b><span>Pending access requests</span></article>
    </div>
    {notice&&<div className="team-notice" role="status">{notice}</div>}
    <div className="directory-toolbar">
      <label className="directory-search"><span>SEARCH PEOPLE</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by name or work email…" /></label>
      <label><span>ROLE</span><select value={roleFilter} onChange={e=>setRoleFilter(e.target.value)}><option value="ALL">All roles</option><option value="OWNER">Owner</option><option value="MANAGER">Manager</option><option value="LEADER">Team Leader</option><option value="ANALYST">Analyst</option></select></label>
      <label><span>MEMBERSHIP</span><select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="ALL">All statuses</option><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option></select></label>
      {(search||roleFilter!=='ALL'||statusFilter!=='ALL')&&<button className="directory-clear" onClick={()=>{setSearch('');setRoleFilter('ALL');setStatusFilter('ALL');}}>Clear filters</button>}
    </div>
    <div className="directory-result-count">Showing <b>{filteredMembers.length}</b> of <b>{members.length}</b> members</div>
    <div className="people-table-wrap"><table className="people-table"><thead><tr><th>MEMBER</th><th>ROLE</th><th>ACCOUNT</th><th>MEMBERSHIP</th>{canManageMembers&&<th>ACTIONS</th>}</tr></thead><tbody>
      {filteredMembers.map(member=><tr key={member.id}>
        <td><div className="directory-member"><span className="directory-avatar">{member.fullName.trim().slice(0,1).toUpperCase()}</span><span><b>{member.fullName}</b><small>{member.email}</small></span></div></td>
        <td><span className="role-pill">{member.role}</span></td>
        <td><span className="directory-status">{member.accountStatus}</span></td>
        <td><span className={member.membershipStatus==='ACTIVE'?'membership-badge active':'membership-badge suspended'}><i/>{member.membershipStatus}</span></td>
        {canManageMembers&&<td>{member.role!=='OWNER'&&!(role==='ADMIN'&&member.role==='ADMIN')?<div className="member-actions"><select aria-label={`Role for ${member.fullName}`} value={draftRoles[member.id]||member.role} onChange={e=>setDraftRoles(v=>({...v,[member.id]:e.target.value}))}>{role==='OWNER'&&<option value="ADMIN">Admin</option>}<option value="MANAGER">Manager</option><option value="ANALYST">Analyst</option><option value="VIEWER">Viewer</option></select><button disabled={!!busy||((draftRoles[member.id]||member.role)===member.role)} onClick={()=>updateMember(member,{role:draftRoles[member.id]||member.role})}>{busy===member.id?'…':'Save'}</button><button className="member-status-button" disabled={!!busy} onClick={()=>updateMember(member,{membershipStatus:member.membershipStatus==='ACTIVE'?'SUSPENDED':'ACTIVE'})}>{member.membershipStatus==='ACTIVE'?'Suspend':'Restore'}</button></div>:<span className="people-empty">Protected</span>}</td>}
      </tr>)}
      {!filteredMembers.length&&<tr><td colSpan={canManageMembers?5:4} className="people-empty">{members.length?'No members match these filters.':'No members found in this workspace.'}</td></tr>}
    </tbody></table></div>
    <div className="panel-title requests-title"><div><small>REVIEW QUEUE</small><h2>Pending access requests</h2></div><span className="count-chip">{requests.length} PENDING</span></div>
    {requests.length?requests.map(item=><article className="request-card" key={item.id}>
      <div className="request-person"><span className="org-avatar">{item.fullName.slice(0,1).toUpperCase()}</span><span><b>{item.fullName}</b><small>{item.email}</small></span></div>
      {canReview?<div className="request-actions"><select aria-label={`Role for ${item.fullName}`} id={`role-${item.id}`} defaultValue="ANALYST"><option value="ANALYST">Analyst</option><option value="MANAGER">Manager</option><option value="LEADER">Team Leader</option></select><button disabled={!!busy} onClick={()=>{const el=document.getElementById(`role-${item.id}`) as HTMLSelectElement|null;decide(item.id,'APPROVE',el?.value||'ANALYST')}}>{busy===item.id?'…':'Approve'}</button><button className="reject-button" disabled={!!busy} onClick={()=>decide(item.id,'REJECT')}>Reject</button></div>:<span className="role-pill">Awaiting Owner review</span>}
    </article>):<div className="people-empty">You're all caught up. No pending access requests.</div>}
  </section>;
}
