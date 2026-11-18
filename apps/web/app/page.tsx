'use client';

import { FormEvent, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function Home() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice('');
    setBusy(true);
    try {
      const response = await fetch(`${API}/api/auth/${mode}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Hub-Request': '1' },
        body: JSON.stringify(mode === 'login' ? { email, password } : { fullName, email, password })
      });
      const result = await response.json();
      setNotice(result.message || result.error || 'Something went wrong.');
      if (response.ok && mode === 'login') window.location.href = '/workspace';
      if (response.ok && mode === 'register') {
        setMode('login');
        setPassword('');
      }
    } catch {
      setNotice('Unable to connect to NEXUS. Check the API URL and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <nav className="topbar">
        <a className="brand" href="#"><span className="brand-mark">N</span><span>NEXUS<span className="brand-light"> ANALYTICS</span></span></a>
        <div className="top-meta"><span className="status-dot" /> SECURE WORKSPACE <span className="top-divider" /> V 0.1</div>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><span /> THE ENTERPRISE ANALYTICS HUB</div>
          <h1>Turn complex data<br />into <em>clear direction.</em></h1>
          <p className="intro">A connected workspace for teams to organize projects, prepare trusted data and turn analysis into decisions.</p>
          <div className="feature-list">
            <div><span className="feature-icon">01</span><span><b>One team workspace</b><small>Projects, people and permissions in one place.</small></span></div>
            <div><span className="feature-icon">02</span><span><b>Governed data workflows</b><small>Traceable datasets, analysis and reporting.</small></span></div>
            <div><span className="feature-icon">03</span><span><b>Decisions with confidence</b><small>Insights designed to move work forward.</small></span></div>
          </div>
          <div className="hero-foot"><span>BUILT FOR COLLABORATIVE INTELLIGENCE</span><span>01 — 03</span></div>
        </div>

        <div className="auth-side">
          <div className="auth-card">
            <div className="card-kicker">YOUR WORKSPACE AWAITS</div>
            <h2>{mode === 'login' ? 'Welcome back.' : 'Create your account.'}</h2>
            <p className="card-sub">{mode === 'login' ? 'Sign in to continue to your organization.' : 'Join NEXUS. Your access will be reviewed.'}</p>
            <div className="tabs">
              <button className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setNotice(''); }}>Sign in</button>
              <button className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setNotice(''); }}>Create account</button>
            </div>
            <form onSubmit={submit}>
              {mode === 'register' && <label>FULL NAME<input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your full name" minLength={2} maxLength={120} required /></label>}
              <label>WORK EMAIL<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@company.com" autoComplete="email" required /></label>
              <label>PASSWORD<input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 12 characters" minLength={12} maxLength={128} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required /></label>
              <button className="submit" type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in to NEXUS' : 'Submit registration'} <span>↗</span></button>
            </form>
            {notice && <div className="notice" role="status">{notice}</div>}
            <div className="auth-note"><span className="lock">⌑</span> Protected access · Organization-level permissions</div>
          </div>
          <div className="auth-bottom"><span>NEED AN INVITATION?</span><span>Ask your organization manager.</span></div>
        </div>
      </section>
      <footer><span>© 2026 NEXUS ANALYTICS</span><span>DATA • PEOPLE • PROGRESS</span><span>DESIGNED FOR BETTER DECISIONS</span></footer>
    </main>
  );
}