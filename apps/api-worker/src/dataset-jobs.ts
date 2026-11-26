import { extractJoinDatasetToken, runDatasetJoinQuery, runDatasetQuery } from "./query-engine";
import { aggregateCategoryRows, type ChartAggregation } from "./bi-aggregation";
import { canAnalyzeDataset, canCancelDatasetJob } from "./role-policy";
type Role="OWNER"|"MANAGER"|"LEADER"|"ANALYST";
type Msg={jobId:string};
type Env={DB:D1Database;DATASETS:KVNamespace;DATASET_JOBS:Queue<Msg>};
const json=(v:unknown,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
const userFor=async(req:Request,env:Env)=>{const c=req.headers.get("Cookie")||"",sid=c.split(";").map(x=>x.trim()).find(x=>x.startsWith("hub.sid="))?.slice(8);if(!sid)return null;return env.DB.prepare("SELECT u.id,u.account_status FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.expires_at>unixepoch()").bind(decodeURIComponent(sid)).first<{id:string;account_status:string}>();};
const canRun=(r:Role)=>canAnalyzeDataset(r);
const hasDatasetAccess=async(env:Env,datasetId:string,orgId:string,userId:string,role:Role)=>{
 if(role==="OWNER"||role==="MANAGER")return true;
 if(role==="ANALYST")return !!(await env.DB.prepare("SELECT id FROM dataset_handoffs WHERE dataset_id=? AND assigned_to=? AND status<>'REVOKED' LIMIT 1").bind(datasetId,userId).first());
 if(role==="LEADER")return !!(await env.DB.prepare("SELECT h.id FROM dataset_handoffs h WHERE h.dataset_id=? AND h.status<>'REVOKED' AND (h.assigned_to=? OR EXISTS (SELECT 1 FROM team_members tm JOIN teams t ON t.id=tm.team_id WHERE tm.user_id=h.assigned_to AND t.organization_id=? AND t.leader_user_id=?)) LIMIT 1").bind(datasetId,userId,orgId,userId).first());
 return false;
};
const view=(r:any)=>({id:r.id,datasetId:r.dataset_id,type:r.job_type,status:r.status,progress:r.progress,stage:r.stage,result:r.result_json?JSON.parse(r.result_json):null,error:r.error_code?{code:r.error_code,message:r.error_message}:null,attemptCount:r.attempt_count,createdAt:r.created_at,updatedAt:r.updated_at,completedAt:r.completed_at});
export async function handleDatasetJobs(req:Request,env:Env,path:string):Promise<Response|null>{
 if(!path.startsWith("/api/datasets/")&&!path.startsWith("/api/dataset-jobs/"))return null;
 const user=await userFor(req,env);if(!user)return json({error:"Authentication required."},401);if(user.account_status==="SUSPENDED")return json({error:"This account has been suspended."},403);
 const create=path.match(/^\/api\/datasets\/([^/]+)\/jobs$/);
 if(create&&req.method==="POST"){
  const ds=await env.DB.prepare("SELECT id,organization_id,file_size,columns_json FROM datasets WHERE id=?").bind(create[1]).first<{id:string;organization_id:string;file_size:number;columns_json:string}>();
  if(!ds)return json({error:"Dataset not found."},404);
  const m=await env.DB.prepare("SELECT role FROM memberships WHERE organization_id=? AND user_id=? AND membership_status='ACTIVE'").bind(ds.organization_id,user.id).first<{role:Role}>();
  if(!m||!canRun(m.role))return json({error:"Insufficient organization permissions."},403);
  if(!await hasDatasetAccess(env,ds.id,ds.organization_id,user.id,m.role))return json({error:"This dataset has not been assigned to your workspace role."},403);
  if(ds.file_size>10*1024*1024)return json({error:"Dataset exceeds the current 10 MiB background-job safety limit."},413);
  let body:any={};try{body=await req.json();}catch{return json({error:"Invalid job request."},400);}
  if(body.type!=="PROFILE"&&body.type!=="SQL")return json({error:"Supported background job types are PROFILE and SQL."},400);
  let jobType:"PROFILE"|"SQL"=body.type;
  let payload:{analysis?:{categoryColumn:string;measureColumn:string;filter:string;aggregation:ChartAggregation};sql?:string;joinDatasetId?:string}={};
  if(jobType==="SQL"){
   if(typeof body.sql!=="string"||!body.sql.trim()||body.sql.length>12000)return json({error:"SQL query must be a string up to 12,000 characters."},400);
   const joinToken=extractJoinDatasetToken(body.sql);
   let joinDatasetId:string|undefined;
   if(joinToken){
    const joined=await env.DB.prepare("SELECT id,file_size FROM datasets WHERE replace(id,'-','')=? AND organization_id=?").bind(joinToken,ds.organization_id).first<{id:string;file_size:number}>();
    if(!joined)return json({error:"The JOIN dataset must exist in the same organization."},404);
    if(joined.id===ds.id)return json({error:"JOIN requires a second dataset."},400);
     if(!await hasDatasetAccess(env,joined.id,ds.organization_id,user.id,m.role))return json({error:"You do not have access to the joined dataset."},403);
    if(joined.file_size>10*1024*1024)return json({error:"The joined dataset exceeds the 10 MiB background SQL safety limit."},413);
    joinDatasetId=joined.id;
   }
   payload={sql:body.sql,joinDatasetId};
  }
  if(jobType==="PROFILE"&&body.analysis!==undefined){
   if(!body.analysis||typeof body.analysis!=="object"||Array.isArray(body.analysis))return json({error:"Analysis configuration is invalid."},400);
   let columns:string[]=[];try{columns=JSON.parse(ds.columns_json||"[]");}catch{return json({error:"Dataset column metadata is invalid."},500);}
   const categoryColumn=typeof body.analysis.categoryColumn==="string"?body.analysis.categoryColumn:"";
   const measureColumn=typeof body.analysis.measureColumn==="string"?body.analysis.measureColumn:"";
   const filter=typeof body.analysis.filter==="string"?body.analysis.filter.trim():"";
   const aggregation=typeof body.analysis.aggregation==="string"?body.analysis.aggregation.toUpperCase() as ChartAggregation:"SUM";
   if(!["SUM","AVG","COUNT","MIN","MAX"].includes(aggregation))return json({error:"Aggregation must be SUM, AVG, COUNT, MIN or MAX."},400);
   if(!columns.includes(categoryColumn)||!columns.includes(measureColumn)||filter.length>120)return json({error:"Choose valid analysis columns and a filter up to 120 characters."},400);
   payload={analysis:{categoryColumn,measureColumn,filter,aggregation}};
  }
  const id=crypto.randomUUID();
  await env.DB.prepare("INSERT INTO dataset_jobs (id,organization_id,dataset_id,requested_by,job_type,status,progress,stage,payload_json,max_attempts) VALUES (?,?,?,?,?,'QUEUED',0,'QUEUED',?,3)").bind(id,ds.organization_id,ds.id,user.id,jobType,JSON.stringify(payload)).run();
  try{await env.DATASET_JOBS.send({jobId:id});await env.DB.prepare("UPDATE dataset_jobs SET updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(id).run();}
  catch{await env.DB.prepare("UPDATE dataset_jobs SET status='FAILED',stage='QUEUE_UNAVAILABLE',error_code='QUEUE_SEND_FAILED',error_message='The queue is temporarily unavailable.',completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(id).run();return json({error:"The job could not be queued. Please try again later."},503);}
  await env.DB.prepare("INSERT INTO audit_logs (organization_id,actor_user_id,action,target_type,target_id,metadata) VALUES (?,?,?,'DATASET_JOB',?,?)").bind(ds.organization_id,user.id,"DATASET_JOB_QUEUED",id,JSON.stringify({type:jobType,datasetId:ds.id,analysis:payload.analysis||null,joinDatasetId:payload.joinDatasetId||null})).run();
  return json({job:{id,type:jobType,status:"QUEUED",progress:0,stage:"QUEUED"}},202);
 }
 const list=path.match(/^\/api\/datasets\/([^/]+)\/jobs$/);
 if(list&&req.method==="GET"){
  const ds=await env.DB.prepare("SELECT organization_id FROM datasets WHERE id=?").bind(list[1]).first<{organization_id:string}>();
  if(!ds)return json({error:"Dataset not found."},404);
  const m=await env.DB.prepare("SELECT role FROM memberships WHERE organization_id=? AND user_id=? AND membership_status='ACTIVE'").bind(ds.organization_id,user.id).first();
  if(!m)return json({error:"Insufficient organization permissions."},403);
  if(!await hasDatasetAccess(env,list[1],ds.organization_id,user.id,m.role as Role))return json({error:"This dataset has not been assigned to your workspace role."},403);
  const {results}=await env.DB.prepare("SELECT * FROM dataset_jobs WHERE dataset_id=? ORDER BY created_at DESC LIMIT 50").bind(list[1]).all();
  return json({jobs:results.map(view)});
 }
 const match=path.match(/^\/api\/dataset-jobs\/([^/]+)(?:\/(cancel))?$/);if(!match)return null;
 const job=await env.DB.prepare("SELECT * FROM dataset_jobs WHERE id=?").bind(match[1]).first<any>();if(!job)return json({error:"Dataset job not found."},404);
 const m=await env.DB.prepare("SELECT role FROM memberships WHERE organization_id=? AND user_id=? AND membership_status='ACTIVE'").bind(job.organization_id,user.id).first<{role:Role}>();
 if(!m)return json({error:"Insufficient organization permissions."},403);
 if(!await hasDatasetAccess(env,job.dataset_id,job.organization_id,user.id,m.role))return json({error:"This dataset is outside your assigned workspace scope."},403);
 if(!match[2]&&req.method==="GET")return json({job:view(job)});
 if(match[2]==="cancel"&&req.method==="POST"){
  if(!canCancelDatasetJob(m.role,job.requested_by,user.id))return json({error:"You cannot cancel this job."},403);
  if(["COMPLETED","FAILED","CANCELLED"].includes(job.status))return json({error:"This job can no longer be cancelled."},409);
  await env.DB.prepare("UPDATE dataset_jobs SET status='CANCELLED',stage='CANCELLED',completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('QUEUED','RUNNING','RETRYING')").bind(job.id).run();
  const updated=await env.DB.prepare("SELECT * FROM dataset_jobs WHERE id=?").bind(job.id).first<any>();return json({job:view(updated)});
 }
 return json({error:"Method not allowed."},405);
}
async function runSqlJob(msg:Msg,env:Env){
 const job=await env.DB.prepare("SELECT * FROM dataset_jobs WHERE id=?").bind(msg.jobId).first<any>();if(!job||["COMPLETED","FAILED","CANCELLED"].includes(job.status))return;
 const claim=await env.DB.prepare("UPDATE dataset_jobs SET status='RUNNING',stage='LOADING_SOURCE',progress=10,attempt_count=attempt_count+1,started_at=COALESCE(started_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('QUEUED','RETRYING')").bind(job.id).run();if(!claim.meta.changes)return;
 try{
  const ds=await env.DB.prepare("SELECT name,storage_path,file_size FROM datasets WHERE id=? AND organization_id=?").bind(job.dataset_id,job.organization_id).first<any>();if(!ds)throw new Error("DATASET_NOT_FOUND");if(ds.file_size>10*1024*1024)throw new Error("DATASET_TOO_LARGE");
  const payload=JSON.parse(job.payload_json||"{}");if(typeof payload.sql!=="string"||payload.sql.length>12000)throw new Error("INVALID_SQL_PAYLOAD");
  const source=await env.DATASETS.get(ds.storage_path,"text");if(source===null)throw new Error("SOURCE_FILE_MISSING");
  const {parse}=await import("csv-parse/sync");const parsed=parse(source,{columns:true,skip_empty_lines:true,bom:true,trim:true,relax_column_count:false}) as Record<string,unknown>[];
  if(!parsed.length)throw new Error("EMPTY_DATASET");
  const columns=Object.keys(parsed[0]);if(!columns.length||columns.length>200)throw new Error("INVALID_HEADERS");
  const rows=parsed.map(row=>Object.fromEntries(columns.map(column=>[column,String(row[column]??"")])));
  await env.DB.prepare("UPDATE dataset_jobs SET progress=45,stage='EXECUTING_SQL',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='RUNNING'").bind(job.id).run();
  let result:any;
  if(payload.joinDatasetId){
   const right=await env.DB.prepare("SELECT storage_path,file_size FROM datasets WHERE id=? AND organization_id=?").bind(payload.joinDatasetId,job.organization_id).first<any>();
   if(!right||right.file_size>10*1024*1024)throw new Error("JOIN_DATASET_UNAVAILABLE");
   const rightSource=await env.DATASETS.get(right.storage_path,"text");if(rightSource===null)throw new Error("JOIN_SOURCE_MISSING");
   const rightParsed=parse(rightSource,{columns:true,skip_empty_lines:true,bom:true,trim:true,relax_column_count:false}) as Record<string,unknown>[];
   const rightColumns=rightParsed.length?Object.keys(rightParsed[0]):[];
   if(!rightColumns.length||rightColumns.length>200)throw new Error("INVALID_JOIN_HEADERS");
   const rightRows=rightParsed.map(row=>Object.fromEntries(rightColumns.map(column=>[column,String(row[column]??"")])));
   result=runDatasetJoinQuery(payload.sql,rows,columns,rightRows,rightColumns);
  }else result=runDatasetQuery(payload.sql,rows,columns);
  const resultJson=JSON.stringify({ ...result, scope:"FULL_DATASET",datasetId:job.dataset_id,name:ds.name });
  if(resultJson.length>600000)throw new Error("RESULT_TOO_LARGE");
  const completed=await env.DB.prepare("UPDATE dataset_jobs SET status='COMPLETED',progress=100,stage='COMPLETED',result_json=?,completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP,error_code=NULL,error_message=NULL WHERE id=? AND status='RUNNING'").bind(resultJson,job.id).run();
  if(completed.meta.changes)await env.DB.prepare("INSERT INTO notifications (id,user_id,organization_id,type,title,message,href) VALUES (?,?,?,'DATASET_JOB','SQL query completed',?,?)").bind(crypto.randomUUID(),job.requested_by,job.organization_id,"Background SQL query for "+ds.name+" is ready.","/workspace/analytics").run();
 }catch(e){
  const code=e instanceof Error?e.message:"SQL_PROCESSING_FAILED";const latest=await env.DB.prepare("SELECT attempt_count,max_attempts,status FROM dataset_jobs WHERE id=?").bind(job.id).first<any>();if(latest?.status==="CANCELLED")return;
  const retry=!!latest&&latest.attempt_count<latest.max_attempts;await env.DB.prepare("UPDATE dataset_jobs SET status=?,stage=?,error_code=?,error_message=?,updated_at=CURRENT_TIMESTAMP,completed_at=? WHERE id=? AND status='RUNNING' AND status='RUNNING'").bind(retry?"RETRYING":"FAILED",retry?"RETRYING":"FAILED",code,"The background SQL job could not be completed.",retry?null:new Date().toISOString(),job.id).run();if(retry)throw e;
 }
}
async function runProfile(msg:Msg,env:Env){
 const job=await env.DB.prepare("SELECT * FROM dataset_jobs WHERE id=?").bind(msg.jobId).first<any>();if(!job||["COMPLETED","FAILED","CANCELLED"].includes(job.status))return;
 const claim=await env.DB.prepare("UPDATE dataset_jobs SET status='RUNNING',stage='LOADING_SOURCE',progress=10,attempt_count=attempt_count+1,started_at=COALESCE(started_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('QUEUED','RETRYING')").bind(job.id).run();if(!claim.meta.changes)return;
 try{
  const ds=await env.DB.prepare("SELECT name,storage_path,file_size FROM datasets WHERE id=? AND organization_id=?").bind(job.dataset_id,job.organization_id).first<any>();if(!ds)throw new Error("DATASET_NOT_FOUND");if(ds.file_size>10*1024*1024)throw new Error("DATASET_TOO_LARGE");
  const source=await env.DATASETS.get(ds.storage_path,"text");if(source===null)throw new Error("SOURCE_FILE_MISSING");
  const {parse}=await import("csv-parse/sync");const rows=parse(source,{columns:true,skip_empty_lines:true,bom:true,trim:true,relax_column_count:false}) as Record<string,unknown>[];if(!rows.length)throw new Error("EMPTY_DATASET");
  const columns=Object.keys(rows[0]);if(!columns.length||columns.length>200)throw new Error("INVALID_HEADERS");
  const profile=columns.map(name=>{const vals=rows.map((r:any)=>String(r[name]??"").trim()),present=vals.filter((v:string)=>v!==""),nums=present.map(Number).filter(Number.isFinite),numeric=present.length>0&&nums.length/present.length>=.9,sum=nums.reduce((a:number,b:number)=>a+b,0);return {name,type:!present.length?"EMPTY":numeric?"NUMERIC":"TEXT",total:vals.length,missing:vals.length-present.length,distinct:new Set(present).size,...(numeric?{count:nums.length,sum:Number(sum.toFixed(3)),min:nums.reduce((a:number,b:number)=>Math.min(a,b),Infinity),max:nums.reduce((a:number,b:number)=>Math.max(a,b),-Infinity),mean:Number((sum/nums.length).toFixed(3))}:{})};});
  let missingCells=0,duplicateRows=0;const seen=new Set<string>();
  for(const item of profile)missingCells+=item.missing;
  for(const row of rows){const key=JSON.stringify(columns.map(column=>String(row[column]??"")));if(seen.has(key))duplicateRows++;else seen.add(key);}
  const numericStats=profile.filter(item=>item.type==="NUMERIC").map((item:any)=>({column:item.name,count:Number(item.count||0),sum:Number(item.sum||0),mean:Number(item.mean||0),min:Number(item.min||0),max:Number(item.max||0)}));
  const payload=JSON.parse(job.payload_json||"{}"),analysis=payload.analysis||{},categoryColumn=columns.includes(analysis.categoryColumn)?analysis.categoryColumn:"",measureColumn=columns.includes(analysis.measureColumn)?analysis.measureColumn:"",filter=typeof analysis.filter==="string"?analysis.filter.trim().toLocaleLowerCase():"",aggregation=(["SUM","AVG","COUNT","MIN","MAX"].includes(analysis.aggregation)?analysis.aggregation:"SUM") as ChartAggregation;
  const {chartRows}=categoryColumn&&measureColumn?aggregateCategoryRows(rows,categoryColumn,measureColumn,filter,aggregation):{chartRows:[]};
  const summary={rowCount:rows.length,columnCount:columns.length,missingCells,duplicateRows,numericColumns:numericStats.length};
  const insights=[rows.length.toLocaleString()+" records analysed across the full dataset",missingCells.toLocaleString()+" missing cells",duplicateRows.toLocaleString()+" duplicate rows detected",numericStats.length+" numeric columns detected"];
  if(numericStats.length){const top=numericStats.slice().sort((a,b)=>b.sum-a.sum)[0];insights.push(top.column+" has the largest numeric total ("+top.sum.toLocaleString()+")");}
  if(chartRows.length)insights.push("Top category by "+aggregation+" of "+measureColumn+": "+chartRows[0].label+" ("+chartRows[0].value.toLocaleString()+")");
  const result={datasetId:job.dataset_id,name:ds.name,rowCount:rows.length,columnCount:columns.length,columns:profile,summary,numericStats,chartRows,insights,aggregation,scope:"FULL_DATASET"};
  const completed=await env.DB.prepare("UPDATE dataset_jobs SET status='COMPLETED',progress=100,stage='COMPLETED',result_json=?,completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP,error_code=NULL,error_message=NULL WHERE id=? AND status='RUNNING'").bind(JSON.stringify(result),job.id).run();
  if(completed.meta.changes)await env.DB.prepare("INSERT INTO notifications (id,user_id,organization_id,type,title,message,href) VALUES (?,?,?,'DATASET_JOB','Dataset profiling completed',?,?)").bind(crypto.randomUUID(),job.requested_by,job.organization_id,"Profiling for "+ds.name+" is ready.","/workspace/data").run();
 }catch(e){
  const code=e instanceof Error?e.message:"PROCESSING_FAILED";const latest=await env.DB.prepare("SELECT attempt_count,max_attempts,status FROM dataset_jobs WHERE id=?").bind(job.id).first<any>();if(latest?.status==="CANCELLED")return;
  const retry=!!latest&&latest.attempt_count<latest.max_attempts;await env.DB.prepare("UPDATE dataset_jobs SET status=?,stage=?,error_code=?,error_message=?,updated_at=CURRENT_TIMESTAMP,completed_at=? WHERE id=?").bind(retry?"RETRYING":"FAILED",retry?"RETRYING":"FAILED",code,"The background job could not be completed.",retry?null:new Date().toISOString(),job.id).run();if(retry)throw e;
 }
}
const consumer={async queue(batch:MessageBatch<Msg>,env:Env){for(const msg of batch.messages){try{const type=await env.DB.prepare("SELECT job_type FROM dataset_jobs WHERE id=?").bind(msg.body.jobId).first<{job_type:string}>();if(type?.job_type==="SQL")await runSqlJob(msg.body,env);else await runProfile(msg.body,env);msg.ack();}catch{if(msg.attempts>=3){await env.DB.prepare("UPDATE dataset_jobs SET status='FAILED',stage='RETRY_EXHAUSTED',error_code='QUEUE_RETRIES_EXHAUSTED',error_message='The background queue exhausted its retry attempts.',completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('QUEUED','RUNNING','RETRYING')").bind(msg.body.jobId).run();msg.ack();}else{await env.DB.prepare("UPDATE dataset_jobs SET status='RETRYING',stage='RETRYING',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('QUEUED','RUNNING')").bind(msg.body.jobId).run();msg.retry({delaySeconds:30});}}}}};
export default consumer;
