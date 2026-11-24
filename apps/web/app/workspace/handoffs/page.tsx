'use client';

import { useEffect, useMemo, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:4000');
type Org = {id:string;name:string;role:string};
type Dataset = {id:string;name:string;rowCount:number;columnCount:number};
type Member = {userId:string;fullName:string;role:string};
type Version = {versionNumber:number;rowCount:number;uploadedBy:string;changeNote:string|null};
type Handoff = {id:string;stage:string;status:string;assignedTo:string;assigneeName:string;assignedByName:string;inputVersion:number;outputVersion:number|null;handoffNote:string;reviewNote:string|null;createdAt:string};
async function call(path:string, options:RequestInit={}) {
  const response = await fetch(API+path,{...options,credentials:'include',headers:{'X-Hub-Request':'1','Content-Type':'application/json',...(options.headers||{})}});
  const data = await response.json();
  if(!response.ok) throw new Error(data.error||'Request failed.');
  return data;
}
const stages = [
  {value:'CLEANING',label:'Data cleaning'},
  {value:'SQL_REVIEW',label:'SQL validation'},
  {value:'DASHBOARD',label:'Dashboard preparation'},
  {value:'RECONCILIATION',label:'Dashboard reconciliation'}
];
export default function HandoffsPage(){
  const [orgs,setOrgs]=useState<Org[]>([]);
  const [org,setOrg]=useState('');
  const [datasets,setDatasets]=useState<Dataset[]>([]);
  const [dataset,setDataset]=useState('');
  const [versions,setVersions]=useState<Version[]>([]);
  const [handoffs,setHandoffs]=useState<Handoff[]>([]);
  const [members,setMembers]=useState<Member[]>([]);
  const [stage,setStage]=useState('CLEANING');
  const [assignee,setAssignee]=useState('');
  const [inputVersion,setInputVersion]=useState('1');
  const [note,setNote]=useState('');
  const [reviewNotes,setReviewNotes]=useState<Record<string,string>>({});
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('Loading secure handoff workspace…');
  const active=orgs.find(item=>item.id===org);
  const canAssign=active?.role==='OWNER'||active?.role==='LEADER';
  const latestVersion=useMemo(()=>Math.max(0,...versions.map(v=>v.versionNumber)),[versions]);
  async function refreshDataset(id:string){
    if(!id)return;
    const [v,h]=await Promise.all([call('/api/datasets/'+id+'/versions'),call('/api/datasets/'+id+'/handoffs')]);
    setVersions(v.versions||[]);
    setHandoffs(h.handoffs||[]);
    const latest=Math.max(1,...(v.versions||[]).map((x:Version)=>x.versionNumber));
    setInputVersion(String(latest));
  }
  useEffect(()=>{
    call('/api/organizations').then(data=>{
      const list:Org[]=data.organizations||[];
      setOrgs(list);
      if(list.length)setOrg(list[0].id);
      setNotice(list.length?'':'Join an organization to use internal handoffs.');
    }).catch(error=>setNotice(error.message));
  },[]);
  useEffect(()=>{
    if(!org)return;
    call('/api/organizations/'+org+'/datasets').then(data=>{
      const list:Dataset[]=data.datasets||[];
      setDatasets(list);
      setDataset(current=>list.some(x=>x.id===current)?current:(list[0]?.id||''));
    }).catch(error=>setNotice(error.message));
    call('/api/organizations/'+org+'/teams').then(data=>{
      const roster:Member[]=(data.teams||[]).flatMap((team:any)=>team.members||[]);
      setMembers(roster.filter(member=>member.role==='ANALYST'));
      setAssignee(current=>roster.some(member=>member.userId===current&&member.role==='ANALYST')?current:(roster.find(member=>member.role==='ANALYST')?.userId||''));
    }).catch(()=>setMembers([]));
  },[org]);
  useEffect(()=>{
    if(!dataset)return;
    refreshDataset(dataset).then(()=>setNotice('Internal handoffs loaded. Files remain in private dataset storage.')).catch(error=>setNotice(error.message));
  },[dataset]);
  async function assign(event:React.FormEvent){
    event.preventDefault();
    if(!dataset||!assignee)return;
    setBusy(true);
    try{
      await call('/api/datasets/'+dataset+'/handoffs',{method:'POST',body:JSON.stringify({stage,assignedTo:assignee,inputVersion:Number(inputVersion),handoffNote:note})});
      setNote('');
      await refreshDataset(dataset);
      setNotice('Work assigned. The recipient receives an internal dataset-version reference, not a file download.');
    }catch(error){setNotice(error instanceof Error?error.message:'Could not assign work.');}
    finally{setBusy(false);}
  }
  async function update(handoff:Handoff,status:string){
    setBusy(true);
    try{
      const body:any={status,reviewNote:reviewNotes[handoff.id]||''};
      if(status==='SUBMITTED')body.outputVersion=latestVersion;
      await call('/api/datasets/'+dataset+'/handoffs/'+handoff.id,{method:'PATCH',body:JSON.stringify(body)});
      await refreshDataset(dataset);
      setNotice('Handoff status updated.');
    }catch(error){setNotice(error instanceof Error?error.message:'Could not update handoff.');}
    finally{setBusy(false);}
  }
  const role=active?.role||'MEMBER';
  return <main className="team-shell">
    <aside className="team-sidebar"><a className="brand" href="/workspace"><span className="brand-mark">V</span><span>BHUPENDRA'S VYRON</span></a><div className="side-label">WORKSPACE</div><a className="side-link" href="/workspace">▦ Overview</a><a className="side-link" href="/workspace/data">◈ Data workspace</a><a className="side-link" href="/workspace/analytics">⌘ Analytics Studio</a><a className="side-link selected" href="/workspace/handoffs">⇄ Data handoffs</a><a className="side-link" href="/workspace/projects">◫ Projects & tasks</a><a className="side-link" href="/workspace/reports">▤ Reports</a><a className="side-link" href="/workspace/audit">⌑ Audit activity</a><div className="sidebar-footer"><span className="online-dot"/> PRIVATE WORKSPACE<br/><small>DATA HANDOFFS</small></div></aside>
    <section className="team-main"><header className="team-header"><div>BHUPENDRA'S VYRON / WORKSPACE / <b>DATA HANDOFFS</b></div><a className="back-link" href="/workspace">← Overview</a></header>
      <div className="team-content">
        <div className="team-heading"><div><div className="eyebrow"><span/> CONTROLLED COLLABORATION</div><h1>Work together, <em>securely.</em></h1><p>Assign cleaning, SQL review, dashboard preparation and reconciliation against private dataset versions.</p></div><select value={org} onChange={e=>setOrg(e.target.value)} aria-label="Organization">{orgs.map(item=><option key={item.id} value={item.id}>{item.name} · {item.role}</option>)}</select></div>
        <div className="team-stats"><article><small>DATASETS</small><strong>{datasets.length.toString().padStart(2,'0')}</strong><span>In this organization</span></article><article><small>ACTIVE HANDOFFS</small><strong>{handoffs.filter(h=>!['APPROVED'].includes(h.status)).length.toString().padStart(2,'0')}</strong><span>Assigned, working or awaiting review</span></article><article><small>YOUR ROLE</small><strong className="stat-text">{role}</strong><span>Server-enforced permissions</span></article></div>
        <section className="panel" style={{padding:22,marginBottom:18}}>
          <div className="panel-title"><div><small>01 · PRIVATE DATASET</small><h2>Select shared dataset</h2></div><span className="role-pill">No file transfer</span></div>
          <label>DATASET<select value={dataset} onChange={e=>setDataset(e.target.value)}>{datasets.map(item=><option key={item.id} value={item.id}>{item.name} · {item.rowCount.toLocaleString()} rows</option>)}</select></label>
          <p className="upload-hint">Collaborators receive permission-checked references to versions stored by Vyron. Source files are not attached to handoffs.</p>
        </section>
        {canAssign&&<form className="panel" style={{padding:22,marginBottom:18}} onSubmit={assign}>
          <div className="panel-title"><div><small>02 · ASSIGN WORK</small><h2>Create a handoff</h2></div><span className="role-pill">Owner / Leader</span></div>
          <div className="form-grid"><label>WORK STAGE<select value={stage} onChange={e=>setStage(e.target.value)}>{stages.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label>ASSIGNED ANALYST<select required value={assignee} onChange={e=>setAssignee(e.target.value)}><option value="">Select an Analyst</option>{members.map(item=><option key={item.userId} value={item.userId}>{item.fullName}</option>)}</select></label><label>INPUT VERSION<select value={inputVersion} onChange={e=>setInputVersion(e.target.value)}>{versions.map(item=><option key={item.versionNumber} value={item.versionNumber}>Version {item.versionNumber} · {item.rowCount.toLocaleString()} rows</option>)}</select></label><label>HANDOFF INSTRUCTIONS<input value={note} onChange={e=>setNote(e.target.value)} maxLength={1000} placeholder="What should the analyst complete?"/></label></div>
          <button className="primary-action" disabled={busy||!dataset||!assignee||!versions.length}>{busy?'Saving…':'Assign internal work ↗'}</button>
        </form>}
        <div className="panel" style={{padding:22}}>
          <div className="panel-title"><div><small>03 · WORK QUEUE</small><h2>Dataset workflow</h2></div><span className="role-pill">{handoffs.length} handoffs</span></div>
          {!handoffs.length?<div className="empty-team"><span>⇄</span><b>No handoffs yet</b><p>Once work is assigned, the recipient will see it here with its input version and review status.</p></div>:<div className="report-grid">{handoffs.map(item=><article className="panel report-card" key={item.id}>
            <div className="report-brand">{stages.find(s=>s.value===item.stage)?.label||item.stage}<span>{item.status}</span></div>
            <h2>{item.assigneeName}</h2><p>Input version {item.inputVersion}{item.outputVersion?' · Output version '+item.outputVersion:''}</p>
            <small>Assigned by {item.assignedByName} · {new Date(item.createdAt).toLocaleString()}</small>
            {item.handoffNote&&<p>{item.handoffNote}</p>}
            {item.reviewNote&&<p className="upload-hint">Review: {item.reviewNote}</p>}
            {item.assignedTo===undefined?null:null}
            {item.status==='ASSIGNED'&&item.assignedTo&&<button className="manage-team-link" disabled={busy} onClick={()=>update(item,'IN_PROGRESS')}>Start work</button>}
            {['ASSIGNED','IN_PROGRESS','RETURNED'].includes(item.status)&&item.assignedTo&&<button className="manage-team-link" disabled={busy||!latestVersion} onClick={()=>update(item,'SUBMITTED')}>Submit latest saved version</button>}
            {item.status==='SUBMITTED'&&canAssign&&<div className="form-grid"><label>REVIEW NOTE<input value={reviewNotes[item.id]||''} onChange={e=>setReviewNotes(old=>({...old,[item.id]:e.target.value}))} maxLength={1000} placeholder="Review feedback"/></label><div><button className="manage-team-link" disabled={busy} onClick={()=>update(item,'APPROVED')}>Approve</button> <button className="manage-team-link" disabled={busy} onClick={()=>update(item,'RETURNED')}>Return for changes</button></div></div>}
          </article>)}</div>}
        </div>
        {notice&&<div className="team-notice" role="status">✳ {notice}</div>}
        <div className="security-note"><span>⌑</span><div><b>Private version-based sharing</b><small>Handoffs store dataset and version references only. Analyst roles cannot download full source files. Every assignment and status change is written to the organization audit log.</small></div></div>
      </div><footer className="team-footer">© 2026 BHUPENDRA'S VYRON <span>CONTROLLED DATA COLLABORATION</span></footer>
    </section>
  </main>;
}
