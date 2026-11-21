type Env={DB:D1Database;DATASETS:KVNamespace;GENERATION_JOBS:Queue<{jobId:string}>};
type Role="OWNER"|"MANAGER"|"LEADER"|"ANALYST";
type User={id:string;account_status:string};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
const userFor=async(req:Request,env:Env):Promise<User|null>=>{const raw=req.headers.get("Cookie")||"",sid=raw.split(";").map(v=>v.trim()).find(v=>v.startsWith("hub.sid="))?.slice(8);if(!sid)return null;return env.DB.prepare("SELECT u.id,u.account_status FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.expires_at>unixepoch()").bind(decodeURIComponent(sid)).first<User>();};
const templates:any={
 BFSI:{key:"transactions",label:"Synthetic Banking Transactions",columns:["transaction_id","account_id","transaction_date","amount","transaction_type","channel","status","branch_id","city"]},
 ECOMMERCE:{key:"orders",label:"Synthetic E-commerce Orders",columns:["order_id","customer_id","order_date","product_id","quantity","unit_price","discount_pct","payment_method","status","city"]},
 LOGISTICS:{key:"shipments",label:"Synthetic Logistics Shipments",columns:["shipment_id","order_id","dispatch_date","delivery_date","origin_city","destination_city","transport_mode","distance_km","delivery_status","shipping_cost"]},
 HOTELS:{key:"bookings",label:"Synthetic Hotel Bookings",columns:["booking_id","guest_id","booking_date","check_in","check_out","room_type","nights","booking_channel","amount","status"]}
};
const csv=(v:unknown)=>{const s=String(v??"");return /[",\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
const seeded=(seed:string)=>{let x=0x811c9dc5;for(let i=0;i<seed.length;i++){x^=seed.charCodeAt(i);x=Math.imul(x,0x01000193);}return ()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296;};};
const pick=(r:()=>number,a:string[])=>a[Math.floor(r()*a.length)];
const date=(r:()=>number,start:number,end:number)=>new Date(start+Math.floor(r()*(end-start))).toISOString().slice(0,10);
const cities=["Udaipur","Jaipur","Delhi","Mumbai","Pune","Bengaluru","Hyderabad","Ahmedabad","Chennai","Kolkata","Lucknow","Indore"];
function rowFor(industry:string,index:number,seed:string){
 const r=seeded(seed+":"+index),id=(prefix:string)=>prefix+"-"+String(index+1).padStart(8,"0");
 const start=Date.UTC(2024,0,1),end=Date.now();
 if(industry==="BFSI")return [id("TXN"),"ACC-"+String(1000+Math.floor(r()*9000)),date(r,start,end),(100+Math.floor(r()*999900))/100,pick(r,["DEBIT","CREDIT","TRANSFER","ATM"]),pick(r,["UPI","CARD","NET_BANKING","ATM","BRANCH"]),pick(r,["SUCCESS","SUCCESS","SUCCESS","FAILED","PENDING"]),"BR-"+String(1+Math.floor(r()*80)).padStart(3,"0"),pick(r,cities)];
 if(industry==="ECOMMERCE")return [id("ORD"),"CUS-"+String(10000+Math.floor(r()*90000)),date(r,start,end),"PRD-"+String(100+Math.floor(r()*9900)),1+Math.floor(r()*8),(199+Math.floor(r()*49900))/100,Math.floor(r()*31),pick(r,["UPI","CARD","COD","NET_BANKING","WALLET"]),pick(r,["DELIVERED","DELIVERED","SHIPPED","CANCELLED","RETURNED"]),pick(r,cities)];
 if(industry==="LOGISTICS"){const dispatch=date(r,start,end),delivery=new Date(new Date(dispatch+"T00:00:00Z").getTime()+(1+Math.floor(r()*8))*86400000).toISOString().slice(0,10);return [id("SHP"),"ORD-"+String(100000+Math.floor(r()*900000)),dispatch,delivery,pick(r,cities),pick(r,cities),pick(r,["ROAD","RAIL","AIR"]),20+Math.floor(r()*2500),pick(r,["ON_TIME","ON_TIME","DELAYED","IN_TRANSIT","RETURNED"]),(250+Math.floor(r()*50000))/100];}
 const booking=date(r,start,end),checkIn=date(r,new Date(booking+"T00:00:00Z").getTime(),end),nights=1+Math.floor(r()*12),checkOut=new Date(new Date(checkIn+"T00:00:00Z").getTime()+nights*86400000).toISOString().slice(0,10);
 return [id("BKG"),"GST-"+String(10000+Math.floor(r()*90000)),booking,checkIn,checkOut,pick(r,["STANDARD","DELUXE","SUITE","FAMILY"]),nights,pick(r,["WEBSITE","OTA","WALK_IN","CORPORATE"]),(1500+Math.floor(r()*25000))*nights,pick(r,["CONFIRMED","CONFIRMED","CHECKED_IN","CANCELLED","CHECKED_OUT"])];
}
const activeContext=async(env:Env,orgId:string)=>env.DB.prepare("SELECT o.industry,(SELECT COUNT(*) FROM projects p WHERE p.organization_id=o.id AND p.status IN ('ACTIVE','PLANNING')) AS projects,(SELECT p.id FROM projects p WHERE p.organization_id=o.id AND p.status IN ('ACTIVE','PLANNING') ORDER BY p.created_at LIMIT 1) AS project_id,(SELECT p.name FROM projects p WHERE p.organization_id=o.id AND p.status IN ('ACTIVE','PLANNING') ORDER BY p.created_at LIMIT 1) AS project_name,(SELECT t.id FROM teams t WHERE t.organization_id=o.id AND t.status='ACTIVE' AND EXISTS (SELECT 1 FROM memberships lm WHERE lm.organization_id=o.id AND lm.user_id=t.leader_user_id AND lm.role='LEADER' AND lm.membership_status='ACTIVE') AND EXISTS (SELECT 1 FROM team_members tm JOIN memberships am ON am.user_id=tm.user_id AND am.organization_id=o.id WHERE tm.team_id=t.id AND am.role='ANALYST' AND am.membership_status='ACTIVE') ORDER BY t.created_at LIMIT 1) AS team_id,(SELECT t.name FROM teams t WHERE t.organization_id=o.id AND t.status='ACTIVE' AND EXISTS (SELECT 1 FROM memberships lm WHERE lm.organization_id=o.id AND lm.user_id=t.leader_user_id AND lm.role='LEADER' AND lm.membership_status='ACTIVE') AND EXISTS (SELECT 1 FROM team_members tm JOIN memberships am ON am.user_id=tm.user_id AND am.organization_id=o.id WHERE tm.team_id=t.id AND am.role='ANALYST' AND am.membership_status='ACTIVE') ORDER BY t.created_at LIMIT 1) AS team_name,(SELECT COUNT(*) FROM teams t JOIN team_members tm ON tm.team_id=t.id JOIN memberships m ON m.organization_id=o.id AND m.user_id=tm.user_id WHERE t.organization_id=o.id AND t.status='ACTIVE' AND m.role='ANALYST' AND m.membership_status='ACTIVE' AND EXISTS (SELECT 1 FROM memberships lm WHERE lm.organization_id=o.id AND lm.user_id=t.leader_user_id AND lm.role='LEADER' AND lm.membership_status='ACTIVE')) AS active_analysts FROM organizations o WHERE o.id=?").bind(orgId).first<{industry:string|null;projects:number;project_id:string|null;project_name:string|null;team_id:string|null;team_name:string|null;active_analysts:number}>();
async function ownerContext(req:Request,env:Env,orgId:string){const user=await userFor(req,env);if(!user)return {error:json({error:"Authentication required."},401)};if(user.account_status==="SUSPENDED")return {error:json({error:"This account has been suspended."},403)};const m=await env.DB.prepare("SELECT role FROM memberships WHERE organization_id=? AND user_id=? AND membership_status='ACTIVE'").bind(orgId,user.id).first<{role:Role}>();if(!m||m.role!=="OWNER")return {error:json({error:"Only the Owner can configure or start synthetic data generation."},403)};return {user};}
export async function handleGenerator(req:Request,env:Env,path:string):Promise<Response|null>{
 const orgMatch=path.match(/^\/api\/organizations\/([^/]+)\/generator(?:\/(settings|preview|jobs))?$/);
 const jobMatch=path.match(/^\/api\/generator\/jobs\/([^/]+)(?:\/(cancel))?$/);
 if(!orgMatch&&!jobMatch)return null;
 if(orgMatch){
  const orgId=orgMatch[1],action=orgMatch[2]||"overview";
  if(action==="overview"&&req.method==="GET"){
   const user=await userFor(req,env);if(!user)return json({error:"Authentication required."},401);
   const m=await env.DB.prepare("SELECT role FROM memberships WHERE organization_id=? AND user_id=? AND membership_status='ACTIVE'").bind(orgId,user.id).first<{role:Role}>();if(!m||!["OWNER","MANAGER"].includes(m.role))return json({error:"Only the Owner and Manager can view generator status."},403);
   const settings=await env.DB.prepare("SELECT enabled,per_dataset_row_cap AS perDatasetRowCap,per_job_row_cap AS perJobRowCap,updated_at AS updatedAt FROM generator_settings WHERE organization_id=?").bind(orgId).first<any>();
   const {results:jobs}=await env.DB.prepare("SELECT g.id,g.project_id AS projectId,p.name AS projectName,g.team_id AS teamId,t.name AS teamName,g.industry,g.dataset_key AS datasetKey,g.requested_rows AS requestedRows,g.generated_rows AS generatedRows,g.status,g.created_at AS createdAt,g.completed_at AS completedAt,g.error_message AS errorMessage FROM generation_jobs g LEFT JOIN projects p ON p.id=g.project_id LEFT JOIN teams t ON t.id=g.team_id WHERE g.organization_id=? ORDER BY g.created_at DESC LIMIT 20").bind(orgId).all();
   const context=await activeContext(env,orgId);
   return json({settings:settings||{enabled:0,perDatasetRowCap:0,perJobRowCap:0},context,jobs,manualTriggerOnly:true});
  }
  const ctx=await ownerContext(req,env,orgId);if(ctx.error)return ctx.error;const user=ctx.user!;
  if(action==="settings"&&req.method==="PUT"){
   let body:any;try{body=await req.json();}catch{return json({error:"Invalid generator settings."},400);}
   const enabled=body.enabled===true?1:body.enabled===false?0:null;
   const old=await env.DB.prepare("SELECT per_dataset_row_cap,per_job_row_cap FROM generator_settings WHERE organization_id=?").bind(orgId).first<any>();
   const perDataset=body.perDatasetRowCap===undefined?Number(old?.per_dataset_row_cap||0):Number(body.perDatasetRowCap);
   const perJob=body.perJobRowCap===undefined?Number(old?.per_job_row_cap||0):Number(body.perJobRowCap);
   if(enabled===null||!Number.isInteger(perDataset)||!Number.isInteger(perJob)||perDataset<1||perDataset>100000||perJob<1||perJob>perDataset)return json({error:"Set valid row caps: per-dataset 1–100,000 and per-job 1–per-dataset. The platform hard cap is 100,000 rows per generated dataset."},400);
   await env.DB.prepare("INSERT INTO generator_settings (organization_id,enabled,per_dataset_row_cap,per_job_row_cap,updated_by,updated_at) VALUES (?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(organization_id) DO UPDATE SET enabled=excluded.enabled,per_dataset_row_cap=excluded.per_dataset_row_cap,per_job_row_cap=excluded.per_job_row_cap,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP").bind(orgId,enabled,perDataset,perJob,user.id).run();
   await env.DB.prepare("INSERT INTO audit_logs (organization_id,actor_user_id,action,target_type,target_id,metadata) VALUES (?,?,?,'GENERATOR_SETTINGS',?,?)").bind(orgId,user.id,"GENERATOR_SETTINGS_UPDATED",orgId,JSON.stringify({enabled:!!enabled,perDatasetRowCap:perDataset,perJobRowCap:perJob})).run();
   return json({message:"Generator settings saved. Generation remains manual and Owner-triggered.",settings:{enabled,perDatasetRowCap:perDataset,perJobRowCap:perJob}});
  }
  if((action==="preview"||action==="jobs")&&req.method==="POST"){
   let body:any={};try{body=await req.json();}catch{return json({error:"Invalid generation request."},400);}
   const settings=await env.DB.prepare("SELECT enabled,per_dataset_row_cap,per_job_row_cap FROM generator_settings WHERE organization_id=?").bind(orgId).first<any>();
   const context=await activeContext(env,orgId);const industry=context?.industry;if(!industry||!templates[industry])return json({error:"Choose a supported industry for this organization before generating data."},409);
   if(!context.projects||!context.active_analysts||!context.project_id||!context.team_id)return json({error:"Generation is unavailable until this industry has an active project, an active team and at least one active Analyst. No unused-industry data will be generated."},409);
   const rows=Number(body.rows);
   if(!Number.isInteger(rows)||rows<1)return json({error:"Enter a positive whole-number row count."},400);
   if(!settings||!settings.enabled||!settings.per_dataset_row_cap||!settings.per_job_row_cap)return json({error:"The Owner must enable the generator and configure row caps first."},409);
   if(rows>settings.per_job_row_cap||rows>settings.per_dataset_row_cap)return json({error:"Requested rows exceed the Owner-configured per-job or per-dataset limit."},400);
   const template=templates[industry];
   if(action==="preview"){
    const preview=Array.from({length:Math.min(rows,5)},(_,i)=>rowFor(industry,i,typeof body.seed==="string"?body.seed:"vyron-preview")).map((r:any)=>Object.fromEntries(template.columns.map((k:string,i:number)=>[k,r[i]])));
    return json({industry,datasetKey:template.key,datasetName:template.label,requestedRows:rows,limits:{perDatasetRowCap:settings.per_dataset_row_cap,perJobRowCap:settings.per_job_row_cap,platformHardCap:100000},estimatedBytes:rows*150,estimatedSeconds:Math.max(2,Math.ceil(rows/5000)),preview,association:{projectId:context.project_id,projectName:context.project_name,teamId:context.team_id,teamName:context.team_name},manualConfirmationRequired:true});
   }
   const id=crypto.randomUUID(),seed=typeof body.seed==="string"&&body.seed.length<=80?body.seed:crypto.randomUUID();
   await env.DB.prepare("INSERT INTO generation_jobs (id,organization_id,requested_by,project_id,team_id,industry,dataset_key,requested_rows,seed,status) VALUES (?,?,?,?,?,?,?,?,?,'QUEUED')").bind(id,orgId,user.id,context.project_id,context.team_id,industry,template.key,rows,seed).run();
   try{await env.GENERATION_JOBS.send({jobId:id});}catch{await env.DB.prepare("UPDATE generation_jobs SET status='FAILED',error_message='The generation queue is unavailable.',completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(id).run();return json({error:"Generation could not be queued. No data was generated."},503);}
   await env.DB.prepare("INSERT INTO audit_logs (organization_id,actor_user_id,action,target_type,target_id,metadata) VALUES (?,?,?,'GENERATION_JOB',?,?)").bind(orgId,user.id,"SYNTHETIC_GENERATION_STARTED",id,JSON.stringify({industry,datasetKey:template.key,rows})).run();
   return json({job:{id,industry,datasetKey:template.key,requestedRows:rows,status:"QUEUED"},message:"Generation queued after explicit Owner action."},202);
  }
  return json({error:"Method not allowed."},405);
 }
 if(jobMatch&&req.method==="POST"&&jobMatch[2]==="cancel"){
  const job=await env.DB.prepare("SELECT organization_id,status FROM generation_jobs WHERE id=?").bind(jobMatch[1]).first<{organization_id:string;status:string}>();if(!job)return json({error:"Generation job not found."},404);
  const ctx=await ownerContext(req,env,job.organization_id);if(ctx.error)return ctx.error;
  if(["COMPLETED","FAILED","CANCELLED"].includes(job.status))return json({error:"This generation job can no longer be cancelled."},409);
  await env.DB.prepare("UPDATE generation_jobs SET status='CANCELLED',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(jobMatch[1]).run();
  await env.DB.prepare("INSERT INTO audit_logs (organization_id,actor_user_id,action,target_type,target_id) VALUES (?,?,?,'GENERATION_JOB',?)").bind(job.organization_id,ctx.user!.id,"SYNTHETIC_GENERATION_CANCELLED",jobMatch[1]).run();
  return json({message:"Generation cancellation requested."});
 }
 if(jobMatch&&req.method==="GET"){
  const job=await env.DB.prepare("SELECT organization_id FROM generation_jobs WHERE id=?").bind(jobMatch[1]).first<{organization_id:string}>();if(!job)return json({error:"Generation job not found."},404);
  const user=await userFor(req,env);if(!user)return json({error:"Authentication required."},401);
  const m=await env.DB.prepare("SELECT role FROM memberships WHERE organization_id=? AND user_id=? AND membership_status='ACTIVE'").bind(job.organization_id,user.id).first<{role:Role}>();if(!m||!["OWNER","MANAGER"].includes(m.role))return json({error:"Only the Owner and Manager can view generator jobs."},403);
  const row=await env.DB.prepare("SELECT g.id,g.project_id AS projectId,p.name AS projectName,g.team_id AS teamId,t.name AS teamName,g.industry,g.dataset_key AS datasetKey,g.requested_rows AS requestedRows,g.generated_rows AS generatedRows,g.status,g.result_json AS result,g.error_message AS errorMessage,g.created_at AS createdAt,g.completed_at AS completedAt FROM generation_jobs g LEFT JOIN projects p ON p.id=g.project_id LEFT JOIN teams t ON t.id=g.team_id WHERE g.id=?").bind(jobMatch[1]).first<any>();
  return json({job:row?{...row,result:row.result?JSON.parse(row.result):null}:null});
 }
 return null;
}
