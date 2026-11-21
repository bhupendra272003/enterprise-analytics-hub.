type Msg={jobId:string};
type Env={DB:D1Database;DATASETS:KVNamespace;GENERATION_JOBS:Queue<Msg>};
const BATCH_ROWS=1000,MAX_FILE_BYTES=10*1024*1024;
async function clearChunks(env:Env,job:any){const count=Math.ceil(Number(job.requested_rows)/BATCH_ROWS);for(let i=0;i<count;i++)await env.DATASETS.delete("generation:"+job.id+":chunk:"+i);}
const schemas:any={
 BFSI:{name:"Synthetic Banking Transactions",filename:"synthetic_transactions.csv",columns:["transaction_id","account_id","transaction_date","amount","transaction_type","channel","status","branch_id","city"]},
 ECOMMERCE:{name:"Synthetic E-commerce Orders",filename:"synthetic_orders.csv",columns:["order_id","customer_id","order_date","product_id","quantity","unit_price","discount_pct","payment_method","status","city"]},
 LOGISTICS:{name:"Synthetic Logistics Shipments",filename:"synthetic_shipments.csv",columns:["shipment_id","order_id","dispatch_date","delivery_date","origin_city","destination_city","transport_mode","distance_km","delivery_status","shipping_cost"]},
 HOTELS:{name:"Synthetic Hotel Bookings",filename:"synthetic_bookings.csv",columns:["booking_id","guest_id","booking_date","check_in","check_out","room_type","nights","booking_channel","amount","status"]}
};
const csv=(v:unknown)=>{const s=String(v??"");return /[",\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
const rng=(seed:string)=>{let x=0x811c9dc5;for(let i=0;i<seed.length;i++){x^=seed.charCodeAt(i);x=Math.imul(x,0x01000193);}return ()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296;};};
const pick=(r:()=>number,a:string[])=>a[Math.floor(r()*a.length)];
const cities=["Udaipur","Jaipur","Delhi","Mumbai","Pune","Bengaluru","Hyderabad","Ahmedabad","Chennai","Kolkata","Lucknow","Indore"];
const fmtDate=(r:()=>number,start:number,end:number)=>new Date(start+Math.floor(r()*(end-start))).toISOString().slice(0,10);
function makeRow(industry:string,index:number,seed:string){
 const r=rng(seed+":"+index),id=(p:string)=>p+"-"+String(index+1).padStart(8,"0"),start=Date.UTC(2024,0,1),end=Date.now();
 if(industry==="BFSI")return [id("TXN"),"ACC-"+(1000+Math.floor(r()*9000)),fmtDate(r,start,end),(100+Math.floor(r()*999900))/100,pick(r,["DEBIT","CREDIT","TRANSFER","ATM"]),pick(r,["UPI","CARD","NET_BANKING","ATM","BRANCH"]),pick(r,["SUCCESS","SUCCESS","SUCCESS","FAILED","PENDING"]),"BR-"+String(1+Math.floor(r()*80)).padStart(3,"0"),pick(r,cities)];
 if(industry==="ECOMMERCE")return [id("ORD"),"CUS-"+(10000+Math.floor(r()*90000)),fmtDate(r,start,end),"PRD-"+(100+Math.floor(r()*9900)),1+Math.floor(r()*8),(199+Math.floor(r()*49900))/100,Math.floor(r()*31),pick(r,["UPI","CARD","COD","NET_BANKING","WALLET"]),pick(r,["DELIVERED","DELIVERED","SHIPPED","CANCELLED","RETURNED"]),pick(r,cities)];
 if(industry==="LOGISTICS"){const dispatch=fmtDate(r,start,end),delivery=new Date(new Date(dispatch+"T00:00:00Z").getTime()+(1+Math.floor(r()*8))*86400000).toISOString().slice(0,10);return [id("SHP"),"ORD-"+(100000+Math.floor(r()*900000)),dispatch,delivery,pick(r,cities),pick(r,cities),pick(r,["ROAD","RAIL","AIR"]),20+Math.floor(r()*2500),pick(r,["ON_TIME","ON_TIME","DELAYED","IN_TRANSIT","RETURNED"]),(250+Math.floor(r()*50000))/100];}
 const booking=fmtDate(r,start,end),checkIn=fmtDate(r,new Date(booking+"T00:00:00Z").getTime(),end),nights=1+Math.floor(r()*12),checkOut=new Date(new Date(checkIn+"T00:00:00Z").getTime()+nights*86400000).toISOString().slice(0,10);
 return [id("BKG"),"GST-"+(10000+Math.floor(r()*90000)),booking,checkIn,checkOut,pick(r,["STANDARD","DELUXE","SUITE","FAMILY"]),nights,pick(r,["WEBSITE","OTA","WALK_IN","CORPORATE"]),(1500+Math.floor(r()*25000))*nights,pick(r,["CONFIRMED","CONFIRMED","CHECKED_IN","CANCELLED","CHECKED_OUT"])];
}
async function finalize(job:any,env:Env,schema:any){
 const chunks=Math.ceil(job.requested_rows/BATCH_ROWS),parts:string[]=[];
 for(let i=0;i<chunks;i++){const part=await env.DATASETS.get("generation:"+job.id+":chunk:"+i,"text");if(part===null)throw new Error("GENERATION_CHUNK_MISSING");parts.push(part);}
 const header=schema.columns.map(csv).join(",");
 const content=header+"\n"+parts.join("\n");
 const bytes=new TextEncoder().encode(content).byteLength;
 if(bytes>MAX_FILE_BYTES){await env.DB.prepare("UPDATE generation_jobs SET status='FAILED',error_message='Generated CSV exceeded the 10 MiB safe file limit. Reduce the requested row count and try again.',completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(job.id).run();await clearChunks(env,job);return;}
 const datasetId=job.id,storagePath="datasets/"+job.organization_id+"/"+datasetId+"/v1.csv";
 await env.DATASETS.put(storagePath,content,{metadata:{organizationId:job.organization_id,datasetId,rowCount:job.requested_rows,synthetic:true}});
 const preview=Array.from({length:Math.min(5,job.requested_rows)},(_,i)=>Object.fromEntries(schema.columns.map((key:string,j:number)=>[key,makeRow(job.industry,i,job.seed)[j]])));
 await env.DB.batch([
  env.DB.prepare("INSERT OR IGNORE INTO datasets (id,organization_id,name,original_filename,storage_path,file_size,row_count,column_count,columns_json,preview_json,uploaded_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(datasetId,job.organization_id,schema.name+" · "+job.id.slice(0,6),schema.filename,storagePath,bytes,job.requested_rows,schema.columns.length,JSON.stringify(schema.columns),JSON.stringify(preview),job.requested_by),
  env.DB.prepare("INSERT OR IGNORE INTO dataset_versions (id,dataset_id,version_number,storage_path,file_size,row_count,column_count,columns_json,preview_json,uploaded_by,change_note) VALUES (?,?,1,?,?,?,?,?,?,?,?)").bind(datasetId+"-v1",datasetId,storagePath,bytes,job.requested_rows,schema.columns.length,JSON.stringify(schema.columns),JSON.stringify(preview),job.requested_by,"Owner-triggered synthetic dataset generation"),
  env.DB.prepare("UPDATE generation_jobs SET status='COMPLETED',generated_rows=requested_rows,result_json=?,completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status<>'CANCELLED'").bind(JSON.stringify({datasetId,storagePath,rowCount:job.requested_rows,fileSize:bytes,synthetic:true,projectId:job.project_id,teamId:job.team_id}),job.id)
 ]);
 await env.DB.prepare("INSERT INTO audit_logs (organization_id,actor_user_id,action,target_type,target_id,metadata) VALUES (?,?,?,'DATASET',?,?)").bind(job.organization_id,job.requested_by,"SYNTHETIC_DATASET_GENERATED",datasetId,JSON.stringify({industry:job.industry,rows:job.requested_rows,fileSize:bytes,projectId:job.project_id,teamId:job.team_id})).run();
 await env.DB.prepare("INSERT INTO notifications (id,user_id,organization_id,type,title,message,href) VALUES (?,?,?,'DATASET_GENERATED','Synthetic dataset is ready',?,'/workspace/data')").bind(crypto.randomUUID(),job.requested_by,job.organization_id,schema.name+" · "+job.requested_rows.toLocaleString()+" rows").run();
 for(let i=0;i<chunks;i++)await env.DATASETS.delete("generation:"+job.id+":chunk:"+i);
}
async function process(jobId:string,env:Env){
 const job=await env.DB.prepare("SELECT * FROM generation_jobs WHERE id=?").bind(jobId).first<any>();
 if(!job)return;if(job.status==="CANCELLED"){await clearChunks(env,job);return;}if(["COMPLETED","FAILED","PAUSED"].includes(job.status))return;
 const schema=schemas[job.industry];if(!schema)throw new Error("UNSUPPORTED_INDUSTRY");
 const context=await env.DB.prepare("SELECT o.industry,EXISTS(SELECT 1 FROM projects p WHERE p.id=? AND p.organization_id=o.id AND p.status IN ('ACTIVE','PLANNING')) AS project_active,EXISTS(SELECT 1 FROM teams t WHERE t.id=? AND t.organization_id=o.id AND t.status='ACTIVE' AND EXISTS (SELECT 1 FROM memberships lm WHERE lm.organization_id=o.id AND lm.user_id=t.leader_user_id AND lm.role='LEADER' AND lm.membership_status='ACTIVE') AND EXISTS (SELECT 1 FROM team_members tm JOIN memberships am ON am.user_id=tm.user_id AND am.organization_id=o.id WHERE tm.team_id=t.id AND am.role='ANALYST' AND am.membership_status='ACTIVE')) AS team_active FROM organizations o WHERE o.id=?").bind(job.project_id,job.team_id,job.organization_id).first<any>();
 if(!context||context.industry!==job.industry||!context.project_active||!context.team_active){await env.DB.prepare("UPDATE generation_jobs SET status='FAILED',error_message='Generation stopped because its linked project or team no longer has an active Leader and Analyst.',completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status NOT IN ('COMPLETED','CANCELLED')").bind(job.id).run();await clearChunks(env,job);return;}
 if(job.generated_rows>=job.requested_rows){await finalize(job,env,schema);return;}
 const start=Number(job.generated_rows),count=Math.min(BATCH_ROWS,Number(job.requested_rows)-start),index=Math.floor(start/BATCH_ROWS);
 const rows=Array.from({length:count},(_,i)=>makeRow(job.industry,start+i,job.seed).map(csv).join(","));
 await env.DATASETS.put("generation:"+job.id+":chunk:"+index,rows.join("\n"));
 const next=start+count;
 const update=await env.DB.prepare("UPDATE generation_jobs SET status='RUNNING',generated_rows=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND generated_rows=? AND status IN ('QUEUED','RUNNING')").bind(next,job.id,start).run();
 if(!update.meta.changes){const latest=await env.DB.prepare("SELECT status FROM generation_jobs WHERE id=?").bind(job.id).first<{status:string}>();if(latest?.status==="CANCELLED")await clearChunks(env,job);return;}
 if(next>=job.requested_rows){
  const latest=await env.DB.prepare("SELECT * FROM generation_jobs WHERE id=?").bind(job.id).first<any>();
  if(latest&&["QUEUED","RUNNING"].includes(latest.status))await finalize(latest,env,schema);
 }else await env.GENERATION_JOBS.send({jobId:job.id});
}
export default {async queue(batch:MessageBatch<Msg>,env:Env){for(const msg of batch.messages){try{await process(msg.body.jobId,env);msg.ack();}catch(e){if(msg.attempts>=3){const job=await env.DB.prepare("SELECT * FROM generation_jobs WHERE id=?").bind(msg.body.jobId).first<any>();await env.DB.prepare("UPDATE generation_jobs SET status='FAILED',error_message='The generation worker exhausted its retry attempts.',completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status NOT IN ('COMPLETED','CANCELLED')").bind(msg.body.jobId).run();if(job)await clearChunks(env,job);msg.ack();}else msg.retry({delaySeconds:30});}}}};
