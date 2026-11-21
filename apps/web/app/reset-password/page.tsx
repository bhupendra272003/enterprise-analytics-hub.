'use client';
import {FormEvent,useEffect,useState} from 'react';
const API=process.env.NEXT_PUBLIC_API_URL ?? (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:4000');
export default function ResetPasswordPage(){
 const [token,setToken]=useState(''),[password,setPassword]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>setToken(new URLSearchParams(window.location.search).get('token')||''),[]);
 async function submit(e:FormEvent){e.preventDefault();setBusy(true);try{const r=await fetch(API+'/api/auth/reset-password',{method:'POST',headers:{'Content-Type':'application/json','X-Hub-Request':'1'},body:JSON.stringify({token,password})});const d=await r.json();setMessage(d.message||d.error||'Request completed.');}catch{setMessage('Unable to connect to BHUPENDRA'S VYRON.');}finally{setBusy(false);}}
 return <main className="access-shell"><section className="access-card"><a className="brand" href="/"><span className="brand-mark">B</span><span>BHUPENDRA'S BHUPENDRA'S VYRON</span></a><div className="eyebrow"><span/> ACCOUNT RECOVERY</div><h1>Choose a new <em>password.</em></h1><p>Use at least 12 characters. Your reset link expires after one hour.</p><form onSubmit={submit}><label>NEW PASSWORD<input type="password" minLength={12} maxLength={128} required value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 12 characters"/></label><button className="primary-action" disabled={busy||!token}>{busy?'Updating…':'Update password ↗'}</button></form>{message&&<div className="team-notice">{message}</div>}<a className="back-link" href="/">Back to sign in</a></section></main>;
}
