'use client';

import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function AcceptInvite() {
  const [token, setToken] = useState('');
  const [status, setStatus] = useState('Checking invitation…');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get('token') || '';
    setToken(value);
    setStatus(value.length >= 32 ? 'Invitation link detected. Sign in with the invited email address, then accept access.' : 'This invitation link is missing its token.');
  }, []);

  async function accept() {
    setBusy(true); setStatus('');
    try {
      const response = await fetch(`${API}/api/invitations/accept`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Hub-Request': '1' },
        body: JSON.stringify({ token })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Invitation could not be accepted.');
      setDone(true); setStatus(data.message || 'Invitation accepted.');
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Could not accept invitation.');
    } finally { setBusy(false); }
  }

  return <main className="invite-accept-shell">
    <div className="invite-accept-card">
      <a className="brand" href="/"><span className="brand-mark">N</span><span>NEXUS<span className="brand-light"> ANALYTICS</span></span></a>
      <div className="accept-symbol">{done ? '✓' : '↗'}</div>
      <div className="eyebrow"><span/> ORGANIZATION ACCESS</div>
      <h1>{done ? 'You’re on the team.' : 'Your team is waiting.'}</h1>
      <p>{done ? 'Your invitation has been accepted. You can now open your NEXUS workspace.' : 'Accept your invitation to join an organization workspace and collaborate with your team.'}</p>
      <div className="accept-status" role="status">{status}</div>
      {!done && <button className="submit" onClick={accept} disabled={busy || token.length < 32}>{busy ? 'Verifying invitation…' : 'Accept invitation ↗'}</button>}
      {done && <a className="submit accept-link" href="/workspace">Open workspace ↗</a>}
      <a className="accept-back" href="/">Return to sign in</a>
      <small className="accept-foot">INVITATIONS ARE PRIVATE · LINKS EXPIRE AFTER 7 DAYS</small>
    </div>
  </main>;
}