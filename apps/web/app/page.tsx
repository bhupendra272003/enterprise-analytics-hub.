'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';

function NeuralBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    let raf = 0, width = 0, height = 0, scroll = 0, mx = 0, my = 0, hidden = document.hidden;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const nodes: {x:number;y:number;z:number;phase:number}[] = [];
    const resize=()=>{width=canvas.clientWidth;height=canvas.clientHeight;canvas.width=Math.round(width*Math.min(devicePixelRatio||1,2));canvas.height=Math.round(height*Math.min(devicePixelRatio||1,2));ctx.setTransform(canvas.width/width,0,0,canvas.height/height,0,0);nodes.length=0;const count=width<650?36:76;for(let i=0;i<count;i++)nodes.push({x:Math.random()*width,y:Math.random()*height,z:Math.random(),phase:Math.random()*6.28});};
    const move=(e:MouseEvent)=>{if(reduced)return;mx=(e.clientX/innerWidth-.5)*22;my=(e.clientY/innerHeight-.5)*18;};
    const scrollMove=()=>{scroll=window.scrollY*.08;};
    const visibility=()=>{hidden=document.hidden;};
    resize();window.addEventListener('resize',resize);window.addEventListener('mousemove',move);window.addEventListener('scroll',scrollMove,{passive:true});document.addEventListener('visibilitychange',visibility);
    let time=0;const draw=()=>{if(hidden){raf=requestAnimationFrame(draw);return;}time+=reduced?0:.006;ctx.clearRect(0,0,width,height);
      const pts=nodes.map(n=>({x:n.x+mx*(1-n.z)+Math.sin(time+n.phase)*8,y:(n.y-scroll*(1-n.z)+my*(1-n.z)+height)%height,z:n.z}));
      for(let i=0;i<pts.length;i++)for(let j=i+1;j<pts.length;j++){const a=pts[i],b=pts[j],d=Math.hypot(a.x-b.x,a.y-b.y);if(d<width*.16){ctx.strokeStyle='rgba(34,211,238,'+(0.12*(1-d/(width*.16)))+')';ctx.lineWidth=.6;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}}
      pts.forEach((p,i)=>{ctx.fillStyle=i%5===0?'rgba(244,114,182,.75)':'rgba(34,211,238,.75)';ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=8;ctx.beginPath();ctx.arc(p.x,p.y,1.4+p.z*1.8,0,Math.PI*2);ctx.fill();});ctx.shadowBlur=0;
      if(!reduced){ctx.strokeStyle='rgba(139,92,246,.12)';ctx.lineWidth=1;const horizon=height*.72;ctx.beginPath();ctx.moveTo(0,horizon);ctx.lineTo(width,horizon);for(let i=0;i<24;i++){const x=i*width/23;ctx.moveTo(x,horizon);ctx.lineTo(width/2+(x-width/2)*2,horizon+height*.32);}for(let y=0;y<12;y++){const yy=horizon+Math.pow(y/11,2)*height*.3;ctx.moveTo(0,yy);ctx.lineTo(width,yy);}ctx.stroke();}
      if(!reduced)raf=requestAnimationFrame(draw);};draw();return()=>{cancelAnimationFrame(raf);window.removeEventListener('resize',resize);window.removeEventListener('mousemove',move);window.removeEventListener('scroll',scrollMove);document.removeEventListener('visibilitychange',visibility);};
  },[]);
  return <canvas ref={canvasRef} aria-hidden="true" className="neural-canvas"/>;
}


// Production requests use the same-origin Next.js rewrite to avoid browser CORS.
const API = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:4000';

export default function Home() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [notice, setNotice] = useState('');
  const [verificationUrl, setVerificationUrl] = useState('');
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
      setNotice([result.message || result.error || 'Something went wrong.', result.diagnostic ? `Diagnostic: ${result.diagnostic}` : ''].filter(Boolean).join(' '));
      setVerificationUrl(result.verificationUrl || '');
      if (response.ok && mode === 'login') window.location.href = '/workspace';
      if (response.ok && mode === 'register') {
        setMode('login');
        setPassword('');
      }
    } catch (error) {
      const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      setNotice(`Connection diagnostic: ${detail}. API: ${API || '(empty API URL)'}`);
    } finally {
      setBusy(false);
    }
  }

  async function resendVerification() {
    if (!email) { setNotice('Enter your work email first.'); return; }
    setBusy(true);
    try {
      const r = await fetch(`${API}/api/auth/resend-verification`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-Hub-Request': '1' }, body: JSON.stringify({ email }) });
      const d = await r.json(); setNotice(d.message || d.error || 'Request completed.'); setVerificationUrl(d.verificationUrl || '');
    } catch { setNotice("Unable to connect to BHUPENDRA'S VYRON."); } finally { setBusy(false); }
  }

  return (
    <main className="shell landing-shell"><NeuralBackdrop/><div className="landing-content">
      <nav className="topbar">
        <a className="brand" href="#"><span className="brand-mark">V</span><span>BHUPENDRA'S VYRON</span></a>
        <div className="top-meta"><span className="status-dot" /> SECURE WORKSPACE <span className="top-divider" /> V 0.1</div>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><span /> THE ENTERPRISE INTELLIGENCE PLATFORM</div>
          <h1>Turn complex data<br />into <em>clear direction.</em></h1>
          <p className="intro">A connected workspace for teams to organize projects, prepare trusted data and turn analysis into decisions.</p>
          <div className="feature-list">
            <div><span className="feature-icon">01</span><span><b>One team workspace</b><small>Projects, people and permissions in one place.</small></span></div>
            <div><span className="feature-icon">02</span><span><b>Governed data workflows</b><small>Traceable datasets, analysis and reporting.</small></span></div>
            <div><span className="feature-icon">03</span><span><b>Decisions with confidence</b><small>Insights designed to move work forward.</small></span></div>
          </div>
          <a className="auth-action-link" href="/showcase">Explore the live project showcase ↗</a>
          <div className="hero-foot"><span>BUILT FOR COLLABORATIVE INTELLIGENCE</span><span>01 — 03</span></div>
        </div>

        <div className="auth-side">
          <div className="auth-card">
            <div className="card-kicker">YOUR WORKSPACE AWAITS</div>
            <h2>{mode === 'login' ? 'Welcome back.' : 'Create your account.'}</h2>
            <p className="card-sub">{mode === 'login' ? 'Sign in to continue to your organization.' : "Join BHUPENDRA'S VYRON. Your access will be reviewed."}</p>
            <div className="tabs">
              <button className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setNotice(''); }}>Sign in</button>
              <button className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setNotice(''); }}>Create account</button>
            </div>
            <form onSubmit={submit}>
              {mode === 'register' && <label>FULL NAME<input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your full name" minLength={2} maxLength={120} required /></label>}
              <label>WORK EMAIL<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@company.com" autoComplete="email" required /></label>
              <label>PASSWORD<input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 12 characters" minLength={12} maxLength={128} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required /></label>
              <button className="submit" type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in to VYRON' : 'Submit registration'} <span>↗</span></button>
            </form>
            {notice && <div className="notice" role="status">{notice}</div>}
            {verificationUrl && <a className="auth-action-link" href={verificationUrl}>Verify email ↗</a>}
            {mode === 'login' && <div className="auth-help-links"><a href="/forgot-password">Forgot password?</a><button type="button" onClick={resendVerification} disabled={busy}>Resend verification email</button></div>}
            <div className="auth-note"><span className="lock">⌑</span> Protected access · Organization-level permissions</div>
          </div>
          <div className="auth-bottom"><span>NEED AN INVITATION?</span><span>Ask your organization manager.</span></div>
        </div>
      </section>
      <footer><span>© 2026 BHUPENDRA'S VYRON</span><span>DATA • PEOPLE • PROGRESS</span><span>DESIGNED FOR BETTER DECISIONS</span></footer>
    </div></main>
  );
}