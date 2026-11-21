'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import PeoplePanel from './people-panel';

const API = process.env.NEXT_PUBLIC_API_URL ?? (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:4000');
type Org = { id: string; name: string; slug: string; role: string };
type InviteResult = { message: string; invitationUrl?: string };

export default function TeamPage() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [selected, setSelected] = useState('');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('ANALYST');
  const [industry, setIndustry] = useState('BFSI');
  const [inviteUrl, setInviteUrl] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const activeOrg = useMemo(() => orgs.find(o => o.id === selected), [orgs, selected]);
  const canInvite = activeOrg && ['OWNER', 'ADMIN'].includes(activeOrg.role);

  async function request(path: string, options: RequestInit = {}) {
    const response = await fetch(`${API}${path}`, {
      ...options, credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-Hub-Request': '1', ...(options.headers || {}) }
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Request failed.');
    return data;
  }

  async function loadOrganizations() {
    try {
      const data = await request('/api/organizations');
      setOrgs(data.organizations || []);
      if (data.organizations?.length) setSelected(current => current || data.organizations[0].id);
    } catch (e) { setNotice(e instanceof Error ? e.message : 'Could not load organizations.'); }
  }

  useEffect(() => { loadOrganizations(); }, []);

  async function createOrganization(event: FormEvent) {
    event.preventDefault(); setBusy(true); setNotice('');
    try {
      const cleanSlug = (slug || name).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const data = await request('/api/organizations', { method: 'POST', body: JSON.stringify({ name, slug: cleanSlug, industry }) });
      setOrgs(current => [...current, data.organization]);
      setSelected(data.organization.id); setName(''); setSlug(''); setShowCreate(false);
      setNotice('Organization created. You are its owner.');
    } catch (e) { setNotice(e instanceof Error ? e.message : 'Organization could not be created.'); }
    finally { setBusy(false); }
  }

  async function sendInvite(event: FormEvent) {
    event.preventDefault(); if (!selected) return;
    setBusy(true); setNotice(''); setInviteUrl('');
    try {
      const data: InviteResult = await request(`/api/invitations/organizations/${selected}/invitations`, {
        method: 'POST', body: JSON.stringify({ email, role })
      });
      setInviteUrl(data.invitationUrl || ''); setEmail('');
      setNotice(data.message);
    } catch (e) { setNotice(e instanceof Error ? e.message : 'Invitation could not be created.'); }
    finally { setBusy(false); }
  }

  async function copyInvite() {
    if (!inviteUrl) return;
    try { await navigator.clipboard.writeText(inviteUrl); setNotice('Invitation link copied. Share it only with the invited person.'); }
    catch { setNotice('Copy was blocked by the browser. Select and copy the invitation link manually.'); }
  }

  return <main className="team-shell">
    <aside className="team-sidebar">
      <a className="brand" href="/workspace"><span className="brand-mark">V</span><span>BHUPENDRA'S VYRON</span></a>
      <div className="side-label">WORKSPACE</div>
      <a className="side-link" href="/workspace"><span>▦</span> Overview</a>
      <a className="side-link selected" href="/workspace/team"><span>♧</span> Team & access</a>
      <div className="side-label side-bottom-label">WORK MANAGEMENT</div>
      <a className="side-link" href="/workspace/projects"><span>◫</span> Projects & tasks</a>
      <a className="side-link" href="/workspace/data"><span>◈</span> Data workspace</a>
      <a className="side-link" href="/workspace/reports"><span>▤</span> Reports</a>
      <a className="side-link" href="/workspace/audit"><span>⌑</span> Audit activity</a>
      <div className="sidebar-footer"><span className="online-dot" /> SYSTEM ONLINE<br/><small>IDENTITY MODULE · 01</small></div>
    </aside>

    <section className="team-main">
      <header className="team-header"><div><span className="breadcrumb">VYRON / WORKSPACE /</span><b> TEAM & ACCESS</b></div><a href="/workspace" className="back-link">← Overview</a></header>
      <div className="team-content">
        <div className="team-heading"><div><div className="eyebrow"><span/> PEOPLE & PERMISSIONS</div><h1>Build your <em>team.</em></h1><p>Bring the right people into the right workspace, with access that makes sense.</p></div><button className="primary-action" onClick={() => setShowCreate(v => !v)}>＋ New organization</button></div>

        <div className="team-stats">
          <article><small>YOUR ORGANIZATIONS</small><strong>{orgs.length.toString().padStart(2, '0')}</strong><span>Workspaces you belong to</span></article>
          <article><small>ACTIVE WORKSPACE</small><strong className="stat-text">{activeOrg?.name || 'Not selected'}</strong><span>{activeOrg?.role || 'Create or join an organization'}</span></article>
          <article><small>ACCESS MODEL</small><strong className="stat-text">Role-based</strong><span>Permissions are enforced by the API</span></article>
        </div>

        {showCreate && <form className="panel create-panel" onSubmit={createOrganization}>
          <div className="panel-title"><div><small>START A NEW WORKSPACE</small><h2>Create organization</h2></div><button type="button" className="close-button" onClick={() => setShowCreate(false)}>×</button></div>
          <div className="form-grid"><label>INDUSTRY / BUSINESS DOMAIN<select value={industry} onChange={e => setIndustry(e.target.value)} required><option value="BFSI">BFSI · Banking, Finance & Insurance</option><option value="ECOMMERCE">E-commerce</option><option value="LOGISTICS">Logistics & Supply Chain</option><option value="HOTELS">Hotels & Hospitality</option></select></label><label>ORGANIZATION NAME<input value={name} onChange={e => { setName(e.target.value); if (!slug) setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')); }} placeholder="e.g. Northstar Analytics" required minLength={2}/></label><label>WORKSPACE SLUG<input value={slug} onChange={e => setSlug(e.target.value)} placeholder="northstar-analytics" required pattern="[a-z0-9-]{3,180}"/></label></div>
          <button className="primary-action" disabled={busy}>{busy ? 'Creating…' : 'Create workspace ↗'}</button>
        </form>}

        <div className="team-layout">
          <section className="panel org-panel"><div className="panel-title"><div><small>WORKSPACES</small><h2>Your organizations</h2></div><span className="count-chip">{orgs.length} TOTAL</span></div>
            {orgs.length ? <div className="org-options">{orgs.map(org => <button key={org.id} className={selected === org.id ? 'org-option active' : 'org-option'} onClick={() => { setSelected(org.id); setInviteUrl(''); setNotice(''); }}><span className="org-avatar">{org.name.slice(0,1).toUpperCase()}</span><span className="org-name"><b>{org.name}</b><small>{org.slug}</small></span><span className="org-role">{org.role}</span><span className="org-arrow">›</span></button>)}</div> : <div className="empty-team"><span>◈</span><b>No organization yet</b><p>Create your first workspace to start inviting your team.</p><button onClick={() => setShowCreate(true)}>Create organization</button></div>}
          </section>

          <section className="panel invite-panel"><div className="panel-title"><div><small>GROW YOUR TEAM</small><h2>Invite a member</h2></div><span className="invite-icon">↗</span></div>
            {canInvite ? <form onSubmit={sendInvite}><label>MEMBER EMAIL<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="colleague@company.com" required/></label><label>ASSIGN ROLE<select value={role} onChange={e => setRole(e.target.value)}><option value="MANAGER">Team Leader</option><option value="ANALYST">Analyst</option><option value="VIEWER">Viewer</option><option value="ADMIN">Admin</option></select></label><div className="role-hint"><b>{role}</b><span>{role === 'ADMIN' ? 'Can manage members and organization settings.' : role === 'MANAGER' ? 'Can coordinate projects, assign tasks and guide analysts.' : role === 'ANALYST' ? 'Can work with assigned data and analysis.' : 'Can view resources shared with them.'}</span></div><button className="primary-action full-action" disabled={busy}>{busy ? 'Creating invitation…' : 'Generate invitation ↗'}</button></form> : <div className="permission-state"><span>⌑</span><b>Manager access required</b><p>Only organization owners and admins can create member invitations. Select a workspace where you have the right permissions.</p></div>}
            {inviteUrl && <div className="invite-result"><small>ONE-TIME INVITATION LINK</small><div className="invite-url">{inviteUrl}</div><button onClick={copyInvite}>Copy link</button><p>Expires in 7 days. Share privately with the invited email address.</p></div>}
          </section>
        </div>
        {activeOrg && <PeoplePanel organizationId={activeOrg.id} role={activeOrg.role} />}
        {notice && <div className="team-notice" role="status"><span>✳</span>{notice}</div>}
        <div className="security-note"><span>⌑</span><div><b>Access is enforced server-side</b><small>Changing a visible role or URL does not grant permissions. Every organization action is checked by the API.</small></div></div>
      </div>
      <footer className="team-footer"><span>© 2026 BHUPENDRA'S VYRON</span><span>PEOPLE • PERMISSIONS • PROGRESS</span></footer>
    </section>
  </main>;
}