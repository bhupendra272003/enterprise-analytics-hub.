'use client';
import {useEffect,useState} from 'react';
const API=process.env.NEXT_PUBLIC_API_URL ?? (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:4000');
export default function VerifyEmailPage(){
 const [message,setMessage]=useState('Verifying your email…');
 useEffect(()=>{const token=new URLSearchParams(window.location.search).get('token');if(!token){setMessage('Verification token is missing.');return;}fetch(API+'/api/auth/verify-email',{method:'POST',headers:{'Content-Type':'application/json','X-Hub-Request':'1'},body:JSON.stringify({token})}).then(async r=>{const d=await r.json();setMessage(d.message||d.error||'Verification could not be completed.');}).catch(()=>setMessage('Unable to connect to NEXUS.'));},[]);
 return <main className="access-shell"><section className="access-card"><a className="brand" href="/"><span className="brand-mark">N</span><span>NEXUS<span className="brand-light"> ANALYTICS</span></span></a><div className="eyebrow"><span/> ACCOUNT SECURITY</div><h1>Email <em>verification.</em></h1><p>{message}</p><a className="primary-action auth-action-button" href="/">Continue to sign in ↗</a></section></main>;
}
