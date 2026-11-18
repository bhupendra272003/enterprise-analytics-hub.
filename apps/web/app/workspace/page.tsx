'use client';

import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

type Profile = {
  user: { id: string; fullName: string; email: string; status: string };
  organizations: { organizationId: string; organizationName: string; role: string }[];
};

export default function Workspace() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('Loading your secure workspace…');

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

  async function logout() {
    await fetch(`${API}/api/auth/logout`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-Hub-Request': '1' }
    });
    window.location.href = '/';
  }

  return <main className="workspace-shell">
    <header className="workspace-top">
      <a className="brand" href="/"><span className="brand-mark">N</span><span>NEXUS<span className="brand-light"> ANALYTICS</span></span></a>
      <button className="logout" onClick={logout}>Sign out ↗</button>
    </header>
    {profile ? <section className="workspace-content">
      <div className="eyebrow"><span /> SECURE WORKSPACE</div>
      <p className="welcome-label">YOUR ORGANIZATION</p>
      <h1>Welcome, <em>{profile.user.fullName.split(' ')[0]}.</em></h1>
      <p className="workspace-intro">Your NEXUS workspace is ready. Your access is governed by your organization role.</p>
      <div className="workspace-grid">
        <article className="workspace-card"><small>ACCOUNT STATUS</small><strong>{profile.user.status}</strong><span>Identity verification state</span></article>
        <article className="workspace-card"><small>ORGANIZATIONS</small><strong>{profile.organizations.length}</strong><span>Active organization memberships</span></article>
        <article className="workspace-card"><small>WORK EMAIL</small><strong className="email-value">{profile.user.email}</strong><span>Signed-in account</span></article>
      </div>
      <div className="workspace-section-head"><h2>Your organizations</h2><div className="workspace-actions"><a className="manage-team-link" href="/workspace/team">Manage team & access ↗</a><a className="manage-team-link" href="/workspace/projects">Projects & tasks ↗</a>{profile.user.status === "PENDING" && <a className="manage-team-link" href="/workspace/access">Request organization access ↗</a>}{profile.organizations.some(org => ["OWNER", "ADMIN"].includes(org.role)) && <a className="manage-team-link" href="/workspace/audit">Audit activity ↗</a>}</div></div>
      {profile.organizations.length ? <div className="org-list">{profile.organizations.map(org => <div className="org-row" key={org.organizationId}><span className="org-symbol">◈</span><span><b>{org.organizationName}</b><small>Organization workspace</small></span><span className="role-pill">{org.role}</span></div>)}</div> : <div className="empty-state"><span>◈</span><b>No active organization yet</b><p>Ask your manager for an invitation, or wait for an organization administrator to approve your access.</p></div>}
      <div className="coming-soon"><span>THE NEXT CHAPTER</span><b>Projects, governed datasets and analytics dashboards</b><small>Workspace modules are being built and will appear here as they become available.</small></div>
    </section> : <div className="workspace-error"><div className="loader-mark">N</div><h1>Workspace access</h1><p>{error}</p><a href="/">Return to sign in</a></div>}
    <footer><span>© 2026 NEXUS ANALYTICS</span><span>DATA • PEOPLE • PROGRESS</span></footer>
  </main>;
}