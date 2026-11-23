'use client';

import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:4000');

type Profile = {
  user: { id: string; fullName: string; email: string; status: string; platformRole?: string };
  organizations: { organizationId: string; organizationName: string; role: string }[];
};

export default function Workspace() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('Loading your secure workspace…');
  const [orgName, setOrgName] = useState('');
  const [orgSlug, setOrgSlug] = useState('');
  const [orgIndustry, setOrgIndustry] = useState('BFSI');
  const [orgBusy, setOrgBusy] = useState(false);
  const [orgNotice, setOrgNotice] = useState('');
  const canCreateOrganization = profile?.user.platformRole === 'SUPER_ADMIN' || profile?.organizations.some(org => org.role === 'OWNER') === true;

  useEffect(() => {
    fetch(`${API}/api/auth/me`, { credentials: 'include' })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Your session could not be verified.');
        setProfile(data);
        setError('');
      })
      .catch(err => setError(err.message || 'Unable to connect to the API.'));
  }, []);

  async function createOrganization(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOrgBusy(true); setOrgNotice('');
    try {
      const response = await fetch(`${API}/api/organizations`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-Hub-Request': '1' }, body: JSON.stringify({ name: orgName.trim(), slug: orgSlug.trim().toLowerCase(), industry: orgIndustry }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Workspace could not be created.');
      setOrgNotice('Organization created. You are the OWNER. Refreshing workspace…');
      window.location.reload();
    } catch (err) { setOrgNotice(err instanceof Error ? err.message : 'Workspace creation failed.'); }
    finally { setOrgBusy(false); }
  }

  async function logout() {
    await fetch(`${API}/api/auth/logout`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-Hub-Request': '1' }
    });
    window.location.href = '/';
  }

  return <main className="workspace-shell">
    <header className="workspace-top">
      <a className="brand" href="/"><span className="brand-mark">V</span><span>BHUPENDRA'S VYRON</span></a>
      <button className="logout" onClick={logout}>Sign out ↗</button>
    </header>
    {profile ? <section className="workspace-content">
      <div className="eyebrow"><span /> SECURE WORKSPACE</div>
      <p className="welcome-label">{profile.user.platformRole === "SUPER_ADMIN" ? "FOUNDER · PLATFORM CONTROL" : "YOUR WORKSPACE"}</p>
      <h1>Welcome, <em>{profile.user.fullName.split(' ')[0]}.</em></h1>
      <p className="workspace-intro">Your BHUPENDRA'S VYRON workspace is ready. Your access is governed by your organization role.</p>
      <div className="workspace-grid">
        <article className="workspace-card"><small>PLATFORM ROLE</small><strong>{profile.user.platformRole === "SUPER_ADMIN" ? "SUPER ADMIN" : "MEMBER"}</strong><span>{profile.user.platformRole === "SUPER_ADMIN" ? "Founder-level platform access" : "Standard platform access"}</span></article>
        <article className="workspace-card"><small>ORGANIZATIONS</small><strong>{profile.organizations.length}</strong><span>Active organization memberships</span></article>
        <article className="workspace-card"><small>WORK EMAIL</small><strong className="email-value">{profile.user.email}</strong><span>Signed-in account</span></article>
      </div>
      <div className="workspace-section-head"><h2>Your organizations</h2><div className="workspace-actions"><a className="manage-team-link" href="/workspace/blueprint">Project blueprint ↗</a>{canCreateOrganization && <a className="manage-team-link" href="/workspace/team">＋ New organization</a>}<a className="manage-team-link" href="/workspace/team">Manage team & access ↗</a><a className="manage-team-link" href="/workspace/projects">Projects & tasks ↗</a><a className="manage-team-link" href="/workspace/teams">Team structure ↗</a><a className="manage-team-link" href="/workspace/performance">Team performance ↗</a>{profile.organizations.some(org => ["OWNER","MANAGER"].includes(org.role)) && <a className="manage-team-link" href="/workspace/generator">Synthetic data generator ↗</a>}<a className="manage-team-link" href="/workspace/analytics">Analytics Studio ↗</a><a className="manage-team-link" href="/workspace/data">Data workspace ↗</a><a className="manage-team-link" href="/workspace/financial-analytics">Financial Analytics ↗</a><a className="manage-team-link" href="/workspace/reports">Reports ↗</a><a className="manage-team-link" href="/workspace/notifications">Notifications ↗</a>{profile.user.status === "PENDING" && <a className="manage-team-link" href="/workspace/access">Request organization access ↗</a>}{profile.organizations.some(org => org.role === "OWNER") && <a className="manage-team-link" href="/workspace/audit">Audit activity ↗</a>}</div></div>
      {profile.organizations.length ? <div className="org-list">{profile.organizations.map(org => <div className="org-row" key={org.organizationId}><span className="org-symbol">◈</span><span><b>{org.organizationName}</b><small>Organization workspace</small></span><span className="role-pill">{org.role}</span></div>)}</div> : <div className="empty-state"><span>◈</span><b>No active organization yet</b><p>{canCreateOrganization ? "Create your owner workspace, or request access to an existing organization." : "Your account does not have owner permissions yet. Request access to an existing organization and an owner can assign your role."}</p>{canCreateOrganization && <form className="org-create-form" onSubmit={createOrganization}><label>INDUSTRY<select value={orgIndustry} onChange={e => setOrgIndustry(e.target.value)}><option value="BFSI">BFSI</option><option value="ECOMMERCE">E-commerce</option><option value="LOGISTICS">Logistics</option><option value="HOTELS">Hotels</option></select></label><label>ORGANIZATION NAME<input value={orgName} onChange={e => setOrgName(e.target.value)} minLength={2} maxLength={160} placeholder="Bhupendra's Vyron" required /></label><label>WORKSPACE URL SLUG<input value={orgSlug} onChange={e => setOrgSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} pattern="[a-z0-9-]{3,180}" minLength={3} maxLength={180} placeholder="e.g. bhupendras-vyron" required /></label><button className="manage-team-link" type="submit" disabled={orgBusy}>{orgBusy ? 'Creating…' : 'Create owner workspace ↗'}</button><p role="status">{orgNotice}</p></form>}<a className="manage-team-link" href="/workspace/access">Request access to an existing organization ↗</a></div>}
      <div className="coming-soon"><span>YOUR ANALYTICS WORKSPACE</span><b>Projects, team access and governed data</b><small>Choose a module above to manage delivery, members and analytical work.</small></div>
    </section> : <div className="workspace-error"><div className="loader-mark">B</div><h1>Workspace access</h1><p>{error}</p><a href="/">Return to sign in</a></div>}
    <footer><span>© 2026 BHUPENDRA'S VYRON</span><span>DATA • PEOPLE • PROGRESS</span></footer>
  </main>;
}