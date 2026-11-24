type Role="OWNER"|"MANAGER"|"LEADER"|"ANALYST";
type Msg={jobId:string};
type Env={DB:D1Database;DATASETS:KVNamespace;DATASET_JOBS:Queue<Msg>};
const json=(v:unknown,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
const userFor=async(req:Request,env:Env)=>{const c=req.headers.get("Cookie")||"",sid=c.split(";").map(x=>x.trim()).find(x=>x.startsWith("hub.sid="))?.slice(8);if(!sid)return null;return env.DB.prepare("SELECT u.id,u.account_status FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.expires_at>unixepoch()").bind(decodeURIComponent(sid)).first<{id:string;account_status:string}>();};
const canRun=(r:Role)=>["OWNER","LEADER","ANALYST"].includes(r);
const view=(r:any)=>({id:r.id,datasetId:r.dataset_id,type:r.job_type,status:r.status,progress:r.progress,stage:r.stage,result:r.result_json?JSON.parse(r.result_json):null,error:r.error_code?{code:r.error_code,message:r.error_message}:null,attemptCount:r.attempt_count,createdAt:r.created_at,updatedAt:r.updated_at,completedAt:r.completed_at});
export async function handleDatasetJobs(req:Request,env:Env,path:string):Promise<Response|null>{
 if(!path.startsWith("/api/datasets/")&&!path.startsWith("/api/dataset-jobs/"))return null;
 const user=await userFor(req,env);if(!user)return json({error:"Authentication required."},401);if(user.account_status==="SUSPENDED")return json({error:"This account has been suspended."},403);
 const create=path.match(/^\/api\/datasets\/([^/]+)\/jobs$/);
 if(create&&req.method==="POST"){
  const ds=await env.DB.prepare("SELECT id,organization_id,file_size FROM datasets WHERE id=?").bind(create[1]).first<{id:string;organization_id:string;file_size:number}>();
  if(!ds)return json({error:"Dataset not found."},404);
  const m=await env.DB.prepare("SELECT role FROM memberships WHERE organization_id=? AND user_id=? AND membership_status='ACTIVE'").bind(ds.organization_id,user.id).first<{role:Role}>();
  if(!m||!canRun(m.role))return json({error:"Insufficient organization permissions."},403);
  if(ds.file_size>10*1024*1024)return json({error:"Dataset exceeds the current 10 MiB background-job safety limit."},413);
  let body:any={};try{body=await req.json();}catch{return json({error:"Invalid job request."},400);}
  if(body.type!=="PROFILE")return json({error:"PROFILE is currently the only enabled background job type."},400);
  const id=crypto.randomUUID();
  await env.DB.prepare("INSERT INTO dataset_jobs (id,organization_id,dataset_id,requested_by,job_type,status,progress,stage,payload_json,max_attempts) VALUES (?,?,?,?,'PROFILE','QUEUED',0,'QUEUED','{}',3)").bind(id,ds.organization_id,ds.id,user.id).run();
  try{await env.DATASET_JOBS.send({jobId:id});await env.DB.prepare("UPDATE dataset_jobs SET updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(id).run();}
  catch{await env.DB.prepare("UPDATE dataset_jobs SET status='FAILED',stage='QUEUE_UNAVAILABLE',error_code='QUEUE_SEND_FAILED',error_message='The queue is temporarily unavailable.',completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(id).run();return json({error:"The job could not be queued. Please try again later."},503);}
  await env.DB.prepare("INSERT INTO audit_logs (organization_id,actor_user_id,action,target_type,target_id,metadata) VALUES (?,?,?,'DATASET_JOB',?,?)").bind(ds.organization_id,user.id,"DATASET_JOB_QUEUED",id,JSON.stringify({type:"PROFILE",datasetId:ds.id})).run();
  return json({job:{id,type:"PROFILE",status:"QUEUED",progress:0,stage:"QUEUED"}},202);
 }
 const list=path.match(/^\/api\/datasets\/([^/]+)\/jobs$/);
 if(list&&req.method==="GET"){
  const ds=await env.DB.prepare("SELECT organization_id FROM datasets WHERE id=?").bind(list[1]).first<{organization_id:string}>();
  if(!ds)return json({error:"Dataset not found."},404);
  const m=await env.DB.prepare("SELECT role FROM memberships WHERE organization_id=? AND user_id=? AND membership_status='ACTIVE'").bind(ds.organization_id,user.id).first();
  if(!m)return json({error:"Insufficient organization permissions."},403);
  const {results}=await env.DB.prepare("SELECT * FROM dataset_jobs WHERE dataset_id=? ORDER BY created_at DESC LIMIT 50").bind(list[1]).all();
  return json({jobs:results.map(view)});
 }
 const match=path.match(/^\/api\/dataset-jobs\/([^/]+)(?:\/(cancel))?$/);if(!match)return null;
 const job=await env.DB.prepare("SELECT * FROM dataset_jobs WHERE id=?").bind(match[1]).first<any>();if(!job)return json({error:"Dataset job not found."},404);
 const m=await env.DB.prepare("SELECT role FROM memberships WHERE organization_id=? AND user_id=? AND membership_status='ACTIVE'").bind(job.organization_id,user.id).first<{role:Role}>();
 if(!m)return json({error:"Insufficient organization permissions."},403);
 if(!match[2]&&req.method==="GET")return json({job:view(job)});
 if(match[2]==="cancel"&&req.method==="POST"){
  if(m.role!=="OWNER"&&job.requested_by!==user.id)return json({error:"You cannot cancel this job."},403);
  if(["COMPLETED","FAILED","CANCELLED"].includes(job.status))return json({error:"This job can no longer be cancelled."},409);
  await env.DB.prepare("UPDATE dataset_jobs SET status='CANCELLED',stage='CANCELLED',completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('QUEUED','RUNNING','RETRYING')").bind(job.id).run();
  const updated=await env.DB.prepare("SELECT * FROM dataset_jobs WHERE id=?").bind(job.id).first<any>();return json({job:view(updated)});
 }
 return json({error:"Method not allowed."},405);
}
async function runProfile(msg:Msg,env:Env){
 const job=await env.DB.prepare("SELECT * FROM dataset_jobs WHERE id=?").bind(msg.jobId).first<any>();if(!job||["COMPLETED","FAILED","CANCELLED"].includes(job.status))return;
 const claim=await env.DB.prepare("UPDATE dataset_jobs SET status='RUNNING',stage='LOADING_SOURCE',progress=10,attempt_count=attempt_count+1,started_at=COALESCE(started_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('QUEUED','RETRYING')").bind(job.id).run();if(!claim.meta.changes)return;
 try{
  const ds=await env.DB.prepare("SELECT name,storage_path,file_size FROM datasets WHERE id=? AND organization_id=?").bind(job.dataset_id,job.organization_id).first<any>();if(!ds)throw new Error("DATASET_NOT_FOUND");if(ds.file_size>10*1024*1024)throw new Error("DATASET_TOO_LARGE");
  const source=await env.DATASETS.get(ds.storage_path,"text");if(source===null)throw new Error("SOURCE_FILE_MISSING");
  const {parse}=await import("csv-parse/sync");const rows=parse(source,{columns:true,skip_empty_lines:true,bom:true,trim:true,relax_column_count:false}) as Record<string,unknown>[];if(!rows.length)throw new Error("EMPTY_DATASET");
  const columns=Object.keys(rows[0]);if(!columns.length||columns.length>200)throw new Error("INVALID_HEADERS");
  const profile=columns.map(name=>{const vals=rows.map((r:any)=>String(r[name]??"").trim()),present=vals.filter((v:string)=>v!==""),nums=present.map(Number).filter(Number.isFinite),numeric=present.length>0&&nums.length/present.length>=.9;return {name,type:!present.length?"EMPTY":numeric?"NUMERIC":"TEXT",total:vals.length,missing:vals.length-present.length,distinct:new Set(present).size,...(numeric?{min:Math.min(...nums),max:Math.max(...nums),mean:Number((nums.reduce((a:number,b:number)=>a+b,0)/nums.length).toFixed(3))}:{})};});
  const result={datasetId:job.dataset_id,name:ds.name,rowCount:rows.length,columnCount:columns.length,columns:profile};
  await env.DB.prepare("UPDATE dataset_jobs SET status='COMPLETED',progress=100,stage='COMPLETED',result_json=?,completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP,error_code=NULL,error_message=NULL WHERE id=? AND status='RUNNING'").bind(JSON.stringify(result),job.id).run();
  await env.DB.prepare("INSERT INTO notifications (id,user_id,organization_id,type,title,message,href) VALUES (?,?,?,'DATASET_JOB','Dataset profiling completed',?,?)").bind(crypto.randomUUID(),job.requested_by,job.organization_id,"Profiling for "+ds.name+" is ready.","/workspace/data").run();
 }catch(e){
  const code=e instanceof Error?e.message:"PROCESSING_FAILED";const latest=await env.DB.prepare("SELECT attempt_count,max_attempts,status FROM dataset_jobs WHERE id=?").bind(job.id).first<any>();if(latest?.status==="CANCELLED")return;
  const retry=!!latest&&latest.attempt_count<latest.max_attempts;await env.DB.prepare("UPDATE dataset_jobs SET status=?,stage=?,error_code=?,error_message=?,updated_at=CURRENT_TIMESTAMP,completed_at=? WHERE id=?").bind(retry?"RETRYING":"FAILED",retry?"RETRYING":"FAILED",code,"The background job could not be completed.",retry?null:new Date().toISOString(),job.id).run();if(retry)throw e;
 }
}
const consumer={async queue(batch:MessageBatch<Msg>,env:Env){for(const msg of batch.messages){try{await runProfile(msg.body,env);msg.ack();}catch{if(msg.attempts>=3){await env.DB.prepare("UPDATE dataset_jobs SET status='FAILED',stage='RETRY_EXHAUSTED',error_code='QUEUE_RETRIES_EXHAUSTED',error_message='The background queue exhausted its retry attempts.',completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('QUEUED','RUNNING','RETRYING')").bind(msg.body.jobId).run();msg.ack();}else{await env.DB.prepare("UPDATE dataset_jobs SET status='RETRYING',stage='RETRYING',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('QUEUED','RUNNING')").bind(msg.body.jobId).run();msg.retry({delaySeconds:30});}}}}};
export default consumer;
