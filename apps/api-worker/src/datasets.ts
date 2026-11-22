import { parse } from "csv-parse/sync";
type Env={DB:D1Database;DATASETS:KVNamespace};
const readStored=async(env:Env,key:string):Promise<{arrayBuffer:()=>Promise<ArrayBuffer>}|null>=>{const bytes=await env.DATASETS.get(key,"arrayBuffer");return bytes?{arrayBuffer:async()=>bytes}:null;};
const MAX_SYNC_CSV_BYTES=256*1024;
const syncLimitError=()=>json({error:"This CSV is larger than the current synchronous processing limit (256 KB). Background CSV jobs are being prepared; please use a smaller CSV for now."},413);
type User={id:string;account_status:string};
type Role="OWNER"|"MANAGER"|"LEADER"|"ANALYST";
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
const getUser=async(req:Request,env:Env):Promise<User|null>=>{
 const raw=req.headers.get("Cookie")||"",sid=raw.split(";").map(v=>v.trim()).find(v=>v.startsWith("hub.sid="))?.slice(8);
 if(!sid)return null;
 return env.DB.prepare("SELECT u.id,u.account_status FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.expires_at>unixepoch()").bind(decodeURIComponent(sid)).first<User>();
};
const membership=async(env:Env,orgId:string,userId:string)=>env.DB.prepare("SELECT role FROM memberships WHERE organization_id=? AND user_id=? AND membership_status='ACTIVE'").bind(orgId,userId).first<{role:Role}>();
const audit=(env:Env,orgId:string,userId:string,action:string,id:string,metadata?:unknown)=>env.DB.prepare("INSERT INTO audit_logs (organization_id,actor_user_id,action,target_type,target_id,metadata) VALUES (?,?,?,'DATASET',?,?)").bind(orgId,userId,action,id,metadata===undefined?null:JSON.stringify(metadata)).run();
const parseCsv=(buffer:ArrayBuffer)=>{
 if(buffer.byteLength>MAX_SYNC_CSV_BYTES)throw new Error("TOO_LARGE");
 const records=parse(new TextDecoder().decode(new Uint8Array(buffer)),{columns:true,skip_empty_lines:true,bom:true,trim:true,relax_column_count:false,skip_records_with_error:false});
 if(!records.length)throw new Error("EMPTY");
 const columns=Object.keys(records[0]);
 if(!columns.length||columns.length>200||columns.some(c=>!c.trim()))throw new Error("HEADERS");
 return {records,columns,preview:records.slice(0,10).map((row:any)=>Object.fromEntries(columns.map(c=>[c,String(row[c]??"").slice(0,500)])))};
};
const allowed=(role:Role)=>["OWNER","LEADER","ANALYST"].includes(role);
const ownerOnly=(role:Role)=>role==="OWNER";
const ownerRequired=()=>json({error:"Only the organization owner can change or replace original source data."},403);
const isNum=(v:string)=>v.trim()!==""&&Number.isFinite(Number(v));
const csvEncode=(rows:Record<string,string>[],columns:string[])=>[columns,...rows.map(r=>columns.map(k=>r[k]??""))].map(row=>row.map(v=>{const s=String(v);return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}).join(",")).join("\r\n")+"\r\n";
const quality=(rows:Record<string,string>[],columns:string[])=>{
 const cells=rows.length*columns.length,missing=rows.reduce((n,r)=>n+columns.filter(k=>!String(r[k]??"").trim()).length,0);
 const unique=new Set(rows.map(r=>JSON.stringify(columns.map(k=>r[k]??"")))).size;
 let numericCells=0,validNumeric=0;
 for(const k of columns){const values=rows.map(r=>String(r[k]??"").trim()).filter(Boolean);if(values.length&&values.filter(isNum).length/values.length>=.5){numericCells+=values.length;validNumeric+=values.filter(isNum).length;}}
 const completeness=cells?(cells-missing)/cells*100:100,uniqueness=rows.length?unique/rows.length*100:100,validity=numericCells?validNumeric/numericCells*100:100;
 return {rows:rows.length,cells,missingCells:missing,duplicateRows:rows.length-unique,completeness:Number(completeness.toFixed(2)),uniqueness:Number(uniqueness.toFixed(2)),validity:Number(validity.toFixed(2)),qualityScore:Number((completeness*.5+uniqueness*.3+validity*.2).toFixed(2))};
};

export async function handleDatasets(req:Request,env:Env,path:string,url:URL):Promise<Response|null>{
 if(!path.startsWith("/api/organizations/")&&!path.startsWith("/api/datasets/"))return null;
 const user=await getUser(req,env);
 if(!user)return json({error:"Authentication required."},401);
 if(user.account_status==="SUSPENDED")return json({error:"This account has been suspended."},403);

 const orgList=path.match(/^\/api\/organizations\/([^/]+)\/datasets$/);
 if(orgList&&req.method==="GET"){
  const orgId=orgList[1],m=await membership(env,orgId,user.id);if(!m)return json({error:"Insufficient organization permissions."},403);
  const {results}=await env.DB.prepare("SELECT d.id,d.name,d.original_filename AS originalFilename,d.file_size AS fileSize,d.row_count AS rowCount,d.column_count AS columnCount,d.created_at AS createdAt,u.full_name AS uploadedBy FROM datasets d JOIN users u ON u.id=d.uploaded_by WHERE d.organization_id=? ORDER BY d.created_at DESC").bind(orgId).all();
  return json({datasets:results});
 }
 if(orgList&&req.method==="POST"){
  const orgId=orgList[1],m=await membership(env,orgId,user.id);if(!m)return json({error:"Insufficient organization permissions."},403);
  if(!ownerOnly(m.role))return ownerRequired();
  let form:FormData;try{form=await req.formData();}catch{return json({error:"Choose a CSV file to upload."},400);}
  const file=form.get("file"),name=typeof form.get("name")==="string"?(form.get("name") as string).trim():"";
  if(!(file instanceof File)||!file.size||!file.name.toLowerCase().endsWith(".csv"))return json({error:"Choose a valid CSV file."},400);
  if(file.size>MAX_SYNC_CSV_BYTES)return syncLimitError();
  if(name.length<2||name.length>120)return json({error:"Dataset name must be 2–120 characters."},400);
  let bytes:ArrayBuffer;try{bytes=await file.arrayBuffer();}catch{return json({error:"The CSV file could not be read."},400);}
  let parsed;try{parsed=parseCsv(bytes);}catch(e){if(e instanceof Error&&e.message==="TOO_LARGE")return syncLimitError();return json({error:e instanceof Error&&e.message==="EMPTY"?"The CSV contains a header but no data rows.":"The CSV file is invalid. Check its header and row structure."},400);}
  const id=crypto.randomUUID(),key=orgId+"/"+id+"/v1.csv";
  await env.DATASETS.put(key,bytes);
  try{
   await env.DB.batch([
    env.DB.prepare("INSERT INTO datasets (id,organization_id,name,original_filename,storage_path,file_size,row_count,column_count,columns_json,preview_json,uploaded_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(id,orgId,name,file.name.split(/[\\/]/).pop()!.slice(0,255),key,file.size,parsed.records.length,parsed.columns.length,JSON.stringify(parsed.columns),JSON.stringify(parsed.preview),user.id),
    env.DB.prepare("INSERT INTO dataset_versions (id,dataset_id,version_number,storage_path,file_size,row_count,column_count,columns_json,preview_json,uploaded_by,change_note) VALUES (?,?,1,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),id,key,file.size,parsed.records.length,parsed.columns.length,JSON.stringify(parsed.columns),JSON.stringify(parsed.preview),user.id,"Initial source upload")
   ]);
  }catch{await env.DATASETS.delete(key);return json({error:"Dataset could not be saved."},500);}
  await audit(env,orgId,user.id,"DATASET_UPLOADED",id,{name,rowCount:parsed.records.length,columnCount:parsed.columns.length});
  return json({dataset:{id,name,rowCount:parsed.records.length,columnCount:parsed.columns.length,columns:parsed.columns,preview:parsed.preview}},201);
 }
 const idMatch=path.match(/^\/api\/datasets\/([^/]+)(?:\/(.*))?$/);
 if(!idMatch)return null;
 const datasetId=idMatch[1],sub=idMatch[2]||"";
 const dataset=await env.DB.prepare("SELECT id,organization_id,name,original_filename,storage_path,file_size,row_count,column_count,columns_json,preview_json FROM datasets WHERE id=?").bind(datasetId).first<any>();
 if(!dataset)return json({error:"Dataset not found."},404);
 const m=await membership(env,dataset.organization_id,user.id);if(!m)return json({error:"Insufficient organization permissions."},403);
 if(["clean","profile","validate","anomalies","quality-dashboard","compare"].includes(sub)&&Number(dataset.file_size)>MAX_SYNC_CSV_BYTES)return syncLimitError();
 if(sub==="clean"&&req.method==="POST"){
  if(!ownerOnly(m.role))return ownerRequired();
  let body:any={};try{body=await req.json();}catch{return json({error:"Invalid cleaning options."},400);}
  const trimWhitespace=body.trimWhitespace!==false,removeDuplicates=body.removeDuplicates!==false,fillMissing=body.fillMissing??"none";
  if(!["none","zero","mean","median","mode"].includes(fillMissing))return json({error:"Unsupported missing-value strategy."},400);
  const source=await readStored(env,dataset.storage_path);if(!source)return json({error:"Stored dataset file is missing."},500);
  let parsed;try{parsed=parseCsv(await source.arrayBuffer());}catch{return json({error:"The stored CSV is invalid."},400);}
  const columns: string[]=parsed.columns,rows:Record<string,string>[]=parsed.records.map((r:Record<string,unknown>)=>Object.fromEntries(columns.map(k=>[k,String(r[k]??"")])));
  const before=quality(rows,columns);
  if(trimWhitespace)for(const row of rows)for(const k of columns)row[k]=row[k].trim();
  let removedDuplicates=0;
  if(removeDuplicates){const seen=new Set<string>();for(let i=rows.length-1;i>=0;i--){const sig=JSON.stringify(columns.map(k=>rows[i][k]));if(seen.has(sig)){rows.splice(i,1);removedDuplicates++;}else seen.add(sig);}rows.reverse();}
  let filledCells=0;
  if(fillMissing!=="none")for(const k of columns){
   const values=rows.map(r=>r[k]).filter(v=>v!=="");if(!values.length)continue;
   const numeric=values.every(isNum);let replacement="";
   if(fillMissing==="zero")replacement="0";
   else if(fillMissing==="mode"){const counts=new Map<string,number>();for(const v of values)counts.set(v,(counts.get(v)||0)+1);replacement=[...counts.entries()].sort((a,b)=>b[1]-a[1])[0][0];}
   else if(numeric&&fillMissing==="mean")replacement=String(Number((values.reduce((s,v)=>s+Number(v),0)/values.length).toFixed(6)));
   else if(numeric&&fillMissing==="median"){const sorted=values.map(Number).sort((a,b)=>a-b),mid=Math.floor(sorted.length/2);replacement=String(Number((sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2).toFixed(6)));}
   if(replacement!=="")for(const row of rows)if(row[k]===""){row[k]=replacement;filledCells++;}
  }
  const after=quality(rows,columns),outliersByColumn:Record<string,number>={};
  for(const k of columns){const nonempty=rows.map(r=>r[k]).filter(v=>v.trim()),nums=nonempty.filter(isNum).map(Number);if(nums.length>=4&&nums.length/Math.max(1,nonempty.length)>=.9){const s=nums.slice().sort((a,b)=>a-b),median=(a:number[])=>{const n=Math.floor(a.length/2);return a.length%2?a[n]:(a[n-1]+a[n])/2;},q1=median(s.slice(0,Math.ceil(s.length/2))),q3=median(s.slice(Math.floor(s.length/2))),iqr=q3-q1,count=nums.filter(v=>v<q1-1.5*iqr||v>q3+1.5*iqr).length;if(count)outliersByColumn[k]=count;}}
  const latest=await env.DB.prepare("SELECT COALESCE(MAX(version_number),0) AS v FROM dataset_versions WHERE dataset_id=?").bind(datasetId).first<{v:number}>(),version=Number(latest?.v||0)+1,key=dataset.organization_id+"/"+datasetId+"/v"+version+"-cleaned.csv",output=csvEncode(rows,columns),bytes=new TextEncoder().encode(output);
  await env.DATASETS.put(key,bytes);
  const report={before,after,removedDuplicates,filledCells,fillStrategy:fillMissing,outliersByColumn,columns,preview:rows.slice(0,10)};
  try{await env.DB.batch([
   env.DB.prepare("INSERT INTO dataset_versions (id,dataset_id,version_number,storage_path,file_size,row_count,column_count,columns_json,preview_json,uploaded_by,change_note) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),datasetId,version,key,bytes.length,rows.length,columns.length,JSON.stringify(columns),JSON.stringify(report.preview),user.id,"Cloudflare cleaning · quality score "+before.qualityScore+" → "+after.qualityScore),
   env.DB.prepare("UPDATE datasets SET storage_path=?,file_size=?,row_count=?,column_count=?,columns_json=?,preview_json=?,uploaded_by=? WHERE id=?").bind(key,bytes.length,rows.length,columns.length,JSON.stringify(columns),JSON.stringify(report.preview),user.id,datasetId)
  ]);}catch{await env.DATASETS.delete(key);return json({error:"Cleaned dataset version could not be saved."},500);}
  await audit(env,dataset.organization_id,user.id,"DATASET_CLEANED",datasetId,{versionNumber:version,beforeScore:before.qualityScore,afterScore:after.qualityScore,removedDuplicates,filledCells});
  return json({versionNumber:version,report},201);
 }
 if(sub==="profile"&&req.method==="GET"){
  const source=await readStored(env,dataset.storage_path);if(!source)return json({error:"Stored dataset file is missing."},500);
  let parsed;try{parsed=parseCsv(await source.arrayBuffer());}catch{return json({error:"The stored CSV is invalid."},400);}
  const columns=parsed.columns.map(name=>{
   const values:string[]=parsed.records.map((r:any)=>String(r[name]??"").trim()),present=values.filter((v:string)=>v!==""),numeric=present.map(Number).filter((v:number)=>Number.isFinite(v)),numericType=present.length>0&&numeric.length/present.length>=.9,distinct=new Set(present).size;
   return {name,type:present.length===0?"EMPTY":numericType?"NUMERIC":"TEXT",total:values.length,missing:values.length-present.length,distinct,...(numericType?{min:numeric.reduce((a:number,b:number)=>Math.min(a,b),Infinity),max:numeric.reduce((a:number,b:number)=>Math.max(a,b),-Infinity),mean:Number((numeric.reduce((a:number,b:number)=>a+b,0)/numeric.length).toFixed(3))}:{})};
  });
  return json({profile:{datasetId:dataset.id,name:dataset.name,rowCount:parsed.records.length,columnCount:parsed.columns.length,columns}});
 }
 if(sub==="validate"&&req.method==="POST"){
  if(!allowed(m.role))return json({error:"Your role cannot run dataset validation."},403);
  let body:any={};try{body=await req.json();}catch{return json({error:"Invalid validation rules."},400);}
  const rules=body.rules??{},required=Array.isArray(rules.required)?rules.required:[],types=rules.types&&typeof rules.types==="object"?rules.types:{},allowedValues=rules.allowedValues&&typeof rules.allowedValues==="object"?rules.allowedValues:{},numericRanges=rules.numericRanges&&typeof rules.numericRanges==="object"?rules.numericRanges:{},uniqueColumns=Array.isArray(rules.uniqueColumns)?rules.uniqueColumns:[];
  if(required.length>200||uniqueColumns.length>200||Object.keys(types).length>200||Object.keys(allowedValues).length>200||Object.keys(numericRanges).length>200)return json({error:"Validation rules exceed the supported limit."},400);
  if(Object.values(types).some((v:any)=>!["TEXT","NUMBER","DATE","BOOLEAN"].includes(v)))return json({error:"Unsupported column data type."},400);
  const configured=[...new Set([...required,...Object.keys(types),...Object.keys(allowedValues),...Object.keys(numericRanges),...uniqueColumns])];
  if(configured.some((v:any)=>typeof v!=="string"||v.length>200))return json({error:"Invalid column name in validation rules."},400);
  const versionNumber=body.versionNumber===undefined?null:Number(body.versionNumber);
  if(versionNumber!==null&&(!Number.isInteger(versionNumber)||versionNumber<1))return json({error:"Invalid dataset version."},400);
  const version=await env.DB.prepare("SELECT version_number,storage_path,columns_json FROM dataset_versions WHERE dataset_id=? AND version_number=COALESCE(?,(SELECT MAX(version_number) FROM dataset_versions WHERE dataset_id=?))").bind(datasetId,versionNumber,datasetId).first<any>();
  if(!version)return json({error:"Dataset version not found."},404);
  const columns=JSON.parse(version.columns_json),unknown=configured.filter((x:string)=>!columns.includes(x));if(unknown.length)return json({error:"Rules reference columns that do not exist: "+unknown.join(", ")},400);
  for(const [column,range] of Object.entries(numericRanges) as [string,any][])if((range.min!==undefined&&typeof range.min!=="number")||(range.max!==undefined&&typeof range.max!=="number")||(range.min!==undefined&&range.max!==undefined&&range.min>range.max))return json({error:"Invalid numeric range for "+column+"."},400);
  const obj=await readStored(env,version.storage_path);if(!obj)return json({error:"Stored dataset version is missing."},500);
  let records:any[];try{records=parseCsv(await obj.arrayBuffer()).records;}catch{return json({error:"The selected CSV version is invalid."},400);}
  const issueCounts:Record<string,number>={REQUIRED:0,TYPE:0,ALLOWED_VALUE:0,MIN_MAX:0,UNIQUE:0},samples:any[]=[],seen=new Map<string,Set<string>>(uniqueColumns.map((k:string)=>[k,new Set<string>()]));
  const add=(rowNumber:number,column:string,rule:string,value:unknown,message:string)=>{issueCounts[rule]++;if(samples.length<100)samples.push({rowNumber,column,rule,value:String(value??"").slice(0,160),message});};
  const validDate=(v:string)=>v.length===10&&v[4]==="-"&&v[7]==="-"&&!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
  records.forEach((record:any,index:number)=>{
   const row=index+2;
   for(const k of required)if(!String(record[k]??"").trim())add(row,k,"REQUIRED",record[k],"Required value is missing.");
   for(const [k,type] of Object.entries(types) as [string,string][]) {const v=String(record[k]??"");if(v.trim()==="")continue;const t=v.trim(),ok=type==="TEXT"||type==="NUMBER"&&Number.isFinite(Number(t))||type==="DATE"&&validDate(t)||type==="BOOLEAN"&&["true","false","1","0","yes","no"].includes(t.toLowerCase());if(!ok)add(row,k,"TYPE",v,"Expected "+type.toLowerCase()+" value.");}
   for(const [k,values] of Object.entries(allowedValues) as [string,string[]][]) {const v=String(record[k]??"").trim();if(v&&Array.isArray(values)&&values.length&&!values.includes(v))add(row,k,"ALLOWED_VALUE",v,"Value is not in the approved list.");}
   for(const [k,range] of Object.entries(numericRanges) as [string,any][]) {const raw=String(record[k]??"").trim();if(!raw||!Number.isFinite(Number(raw)))continue;const v=Number(raw);if((range.min!==undefined&&v<range.min)||(range.max!==undefined&&v>range.max))add(row,k,"MIN_MAX",raw,"Value is outside the configured numeric range.");}
   for(const k of uniqueColumns){const v=String(record[k]??"").trim();if(!v)continue;const set=seen.get(k)!;if(set.has(v))add(row,k,"UNIQUE",v,"Duplicate value in a column marked unique.");else set.add(v);}
  });
  const issueCount=Object.values(issueCounts).reduce((a,b)=>a+b,0),result={versionNumber:Number(version.version_number),rowCount:records.length,checkedColumns:configured.length,issueCount,passed:issueCount===0,issueCounts,sampleLimit:100,samples};
  await env.DB.prepare("INSERT INTO dataset_validation_runs (id,dataset_id,version_number,executed_by,rules_json,result_json,status,issue_count) VALUES (?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),datasetId,version.version_number,user.id,JSON.stringify({required,types,allowedValues,numericRanges,uniqueColumns}),JSON.stringify(result),result.passed?"PASSED":"FAILED",issueCount).run();
  await audit(env,dataset.organization_id,user.id,"DATASET_VALIDATED",datasetId,{versionNumber:result.versionNumber,issueCount,passed:result.passed});
  return json({result},201);
 }
 if(sub==="validation-runs"&&req.method==="GET"){
  const {results}=await env.DB.prepare("SELECT r.id,r.version_number AS versionNumber,r.status,r.issue_count AS issueCount,r.rules_json AS rulesJson,r.created_at AS createdAt,u.full_name AS executedBy FROM dataset_validation_runs r JOIN users u ON u.id=r.executed_by WHERE r.dataset_id=? ORDER BY r.created_at DESC LIMIT 20").bind(datasetId).all<any>();
  return json({runs:results.map((r:any)=>({...r,rules:JSON.parse(r.rulesJson)}))});
 }
 if(sub==="quality-dashboard"&&req.method==="GET"){
  const {results}=await env.DB.prepare("SELECT id,version_number AS versionNumber,status,issue_count AS issueCount,result_json AS resultJson,created_at AS createdAt FROM dataset_validation_runs WHERE dataset_id=? ORDER BY created_at DESC LIMIT 30").bind(datasetId).all<any>();
  const runs=results.map((r:any)=>{const result=JSON.parse(r.resultJson),denominator=Number(result.rowCount||0)*Number(result.checkedColumns||0),score=denominator>0?Math.max(0,Number((100-Number(r.issueCount)/denominator*100).toFixed(2))):null;return {id:r.id,versionNumber:Number(r.versionNumber),status:r.status,issueCount:Number(r.issueCount),rowCount:Number(result.rowCount||0),checkedColumns:Number(result.checkedColumns||0),score,issueCounts:result.issueCounts||{},createdAt:r.createdAt};});
  const scored=runs.filter((r:any)=>r.score!==null),passed=runs.filter((r:any)=>r.status==="PASSED").length,issueBreakdown:Record<string,number>={REQUIRED:0,TYPE:0,ALLOWED_VALUE:0,MIN_MAX:0,UNIQUE:0};
  for(const run of runs)for(const [k,v] of Object.entries(run.issueCounts))issueBreakdown[k]=(issueBreakdown[k]||0)+Number(v||0);
  return json({summary:{totalRuns:runs.length,passedRuns:passed,failedRuns:runs.length-passed,passRate:runs.length?Number((passed/runs.length*100).toFixed(1)):0,averageScore:scored.length?Number((scored.reduce((s:number,r:any)=>s+r.score,0)/scored.length).toFixed(1)):null,totalIssues:runs.reduce((s:number,r:any)=>s+r.issueCount,0)},issueBreakdown,trend:runs.slice().reverse()});
 }
 if(sub==="preview"&&req.method==="GET")return json({dataset:{id:dataset.id,name:dataset.name,columns:JSON.parse(dataset.columns_json),preview:JSON.parse(dataset.preview_json)}});
 if(sub==="anomalies"&&req.method==="POST"){
  if(!allowed(m.role))return json({error:"Insufficient organization permissions."},403);
  const from=Number(url.searchParams.get("from")),to=Number(url.searchParams.get("to"));
  if(!Number.isInteger(from)||!Number.isInteger(to)||from<1||to<1||from===to)return json({error:"Choose two different valid versions."},400);
  const [a,b]=await Promise.all([env.DB.prepare("SELECT storage_path,columns_json FROM dataset_versions WHERE dataset_id=? AND version_number=?").bind(datasetId,from).first<any>(),env.DB.prepare("SELECT storage_path,columns_json FROM dataset_versions WHERE dataset_id=? AND version_number=?").bind(datasetId,to).first<any>()]);
  if(!a||!b)return json({error:"Dataset or selected version not found."},404);
  const [oa,ob]=await Promise.all([readStored(env,a.storage_path),readStored(env,b.storage_path)]);if(!oa||!ob)return json({error:"A stored dataset version is missing."},500);
  let oldRows:any[],newRows:any[];try{oldRows=parseCsv(await oa.arrayBuffer()).records;newRows=parseCsv(await ob.arrayBuffer()).records;}catch{return json({error:"A stored CSV version is invalid and cannot be scanned."},400);}
  const oldCols:string[]=JSON.parse(a.columns_json),newCols:string[]=JSON.parse(b.columns_json),common=oldCols.filter(k=>newCols.includes(k)),anomalies:any[]=[];
  const rate=(n:number,total:number)=>total?n/total:0,add=(type:string,column:string|null,severity:string,title:string,description:string,metric:any,sample:any[]=[])=>(anomalies.push({type,column,severity,title,description,metric,sample:sample.slice(0,8)}));
  const median=(values:number[])=>{const n=Math.floor(values.length/2);return values.length%2?values[n]:(values[n-1]+values[n])/2;};
  for(const column of common){
   const oldValues=oldRows.map(r=>String(r[column]??"").trim()),newValues=newRows.map(r=>String(r[column]??"").trim()),oldMissing=oldValues.filter(v=>!v).length,newMissing=newValues.filter(v=>!v).length,oldMissingRate=rate(oldMissing,oldValues.length),newMissingRate=rate(newMissing,newValues.length);
   if(newMissing-oldMissing>=3&&newMissingRate-oldMissingRate>=.1){const delta=Number(((newMissingRate-oldMissingRate)*100).toFixed(1));add("MISSINGNESS",column,delta>=25?"HIGH":"MEDIUM","Missing values increased","Missing rate rose from "+(oldMissingRate*100).toFixed(1)+"% to "+(newMissingRate*100).toFixed(1)+"%.",{before:oldMissing,after:newMissing,deltaPercentagePoints:delta},newValues.map((v,i)=>!v?{row:i+2}:null).filter(Boolean));}
   const oldPresent=oldValues.filter(Boolean),newPresent=newValues.filter(Boolean),oldNumeric=oldPresent.map(Number).filter(Number.isFinite),newNumeric=newPresent.map(Number).filter(Number.isFinite),oldRatio=rate(oldNumeric.length,oldPresent.length),newRatio=rate(newNumeric.length,newPresent.length);
   if(oldNumeric.length>=8&&newNumeric.length>=8&&oldRatio>=.8&&newRatio>=.8){
    const sorted=oldNumeric.slice().sort((x,y)=>x-y),q1=median(sorted.slice(0,Math.floor(sorted.length/2))),q3=median(sorted.slice(Math.ceil(sorted.length/2))),iqr=q3-q1;
    if(iqr>0){const low=q1-1.5*iqr,high=q3+1.5*iqr,oldOut=oldNumeric.filter(v=>v<low||v>high).length,current=newNumeric.filter(v=>v<low||v>high),oldRate=rate(oldOut,oldNumeric.length),currentRate=rate(current.length,newNumeric.length);
     const extremeLow=q1-3*iqr,extremeHigh=q3+3*iqr,oldExtreme=oldNumeric.filter(v=>v<extremeLow||v>extremeHigh).length,currentExtreme=current.filter(v=>v<extremeLow||v>extremeHigh),regularShift=current.length>=3&&currentRate>=.05&&currentRate-oldRate>=.03,extremeSignal=currentExtreme.length>=1&&currentExtreme.length>oldExtreme;if(regularShift||extremeSignal){const delta=Number(((currentRate-oldRate)*100).toFixed(1));add("NUMERIC_OUTLIERS",column,currentExtreme.length?"HIGH":currentRate>=.15?"HIGH":"MEDIUM",currentExtreme.length?"Extreme numeric value detected":"Unusual numeric values detected",currentExtreme.length?currentExtreme.length+" value(s) crossed the stricter 3×IQR extreme fence ("+extremeLow.toFixed(2)+" to "+extremeHigh.toFixed(2)+").":current.length+" values fall outside the earlier version IQR bounds ("+low.toFixed(2)+" to "+high.toFixed(2)+").",{beforeRate:Number((oldRate*100).toFixed(1)),afterRate:Number((currentRate*100).toFixed(1)),deltaPercentagePoints:delta,bounds:{low:Number(low.toFixed(4)),high:Number(high.toFixed(4)),extremeLow:Number(extremeLow.toFixed(4)),extremeHigh:Number(extremeHigh.toFixed(4))},extremeCount:currentExtreme.length},(currentExtreme.length?currentExtreme:current).slice(0,8).map(value=>({value})));}}
   }else if(oldRatio<.8&&newRatio<.8&&oldPresent.length>=20&&newPresent.length>=20){
    const count=(values:string[])=>{const map=new Map<string,number>();for(const v of values)map.set(v,(map.get(v)||0)+1);return map;},oc=count(oldPresent),nc=count(newPresent);
    if(oc.size<=50&&nc.size<=50){const cats=new Set([...oc.keys(),...nc.keys()]),distance=[...cats].reduce((sum,v)=>sum+Math.abs(rate(oc.get(v)||0,oldPresent.length)-rate(nc.get(v)||0,newPresent.length)),0)/2;
     if(distance>=.08){const changed=[...cats].map(value=>({value,before:Number((rate(oc.get(value)||0,oldPresent.length)*100).toFixed(1)),after:Number((rate(nc.get(value)||0,newPresent.length)*100).toFixed(1))})).sort((x,y)=>Math.abs(y.after-y.before)-Math.abs(x.after-x.before)).slice(0,5);add("CATEGORY_SHIFT",column,distance>=.25?"HIGH":"MEDIUM","Category distribution shifted","Category mix changed substantially (total variation distance "+(distance*100).toFixed(1)+"%).",{distance:Number(distance.toFixed(3)),topChanges:changed},changed);}}
   }
  }
  const rowDelta=oldRows.length?(newRows.length-oldRows.length)/oldRows.length:0;
  if(Math.abs(rowDelta)>=.2)add("ROW_COUNT_CHANGE",null,Math.abs(rowDelta)>=.5?"HIGH":"MEDIUM",rowDelta>0?"Dataset row count increased":"Dataset row count decreased","Rows changed from "+oldRows.length.toLocaleString()+" to "+newRows.length.toLocaleString()+" ("+(rowDelta>0?"+":"")+(rowDelta*100).toFixed(1)+"%).",{before:oldRows.length,after:newRows.length,changePercentage:Number((rowDelta*100).toFixed(1))});
  const duplicate=(rows:any[])=>{const seen=new Set<string>();let n=0;for(const row of rows){const sig=JSON.stringify(Object.keys(row).sort().map(k=>row[k]??""));if(seen.has(sig))n++;else seen.add(sig);}return {count:n,rate:rate(n,rows.length)};},od=duplicate(oldRows),nd=duplicate(newRows);
  if(nd.count-od.count>=3&&nd.rate-od.rate>=.05)add("DUPLICATE_SPIKE",null,nd.rate>=.15?"HIGH":"MEDIUM","Duplicate rows increased","Duplicate-row rate rose from "+(od.rate*100).toFixed(1)+"% to "+(nd.rate*100).toFixed(1)+"%.",{before:od.count,after:nd.count,beforeRate:Number((od.rate*100).toFixed(1)),afterRate:Number((nd.rate*100).toFixed(1))});
  const order={HIGH:0,MEDIUM:1,LOW:2};anomalies.sort((x,y)=>order[x.severity as keyof typeof order]-order[y.severity as keyof typeof order]);
  const report={fromVersion:from,toVersion:to,fromRows:oldRows.length,toRows:newRows.length,columnsAnalyzed:common.length,anomalyCount:anomalies.length,highCount:anomalies.filter(x=>x.severity==="HIGH").length,mediumCount:anomalies.filter(x=>x.severity==="MEDIUM").length,anomalies,methodology:{numeric:"Flag a new value beyond a 3×IQR extreme fence immediately; otherwise flag at least 3 values outside 1.5×IQR fences with a 3 percentage-point outlier-rate increase.",missingness:"Flag at least 3 additional missing cells and a 10 percentage-point missing-rate increase.",category:"Total variation distance ≥0.08 for low-cardinality text columns with at least 20 populated values; newly introduced categories are included.",rowCount:"Flag an absolute row-count change of at least 20%.",duplicates:"Flag at least 3 additional duplicate rows and a 5 percentage-point duplicate-rate increase."}};
  await env.DB.prepare("INSERT INTO dataset_anomaly_runs (id,dataset_id,from_version,to_version,executed_by,anomaly_count,high_count,medium_count,result_json) VALUES (?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),datasetId,from,to,user.id,report.anomalyCount,report.highCount,report.mediumCount,JSON.stringify(report)).run();
  await audit(env,dataset.organization_id,user.id,"DATASET_ANOMALY_SCANNED",datasetId,{fromVersion:from,toVersion:to,anomalyCount:report.anomalyCount,highCount:report.highCount});
  return json({report},201);
 }
 if(sub==="anomaly-runs"&&req.method==="GET"){
  const {results}=await env.DB.prepare("SELECT r.id,r.from_version AS fromVersion,r.to_version AS toVersion,r.anomaly_count AS anomalyCount,r.high_count AS highCount,r.medium_count AS mediumCount,r.result_json AS resultJson,r.created_at AS createdAt,u.full_name AS executedBy FROM dataset_anomaly_runs r JOIN users u ON u.id=r.executed_by WHERE r.dataset_id=? ORDER BY r.created_at DESC LIMIT 20").bind(datasetId).all<any>();
  return json({runs:results.map((r:any)=>({...r,result:JSON.parse(r.resultJson)}))});
 }
 if(sub==="versions/compare/rows"&&req.method==="GET"){
  const from=Number(url.searchParams.get("from")),to=Number(url.searchParams.get("to")),key=(url.searchParams.get("key")||"").trim();
  if(!Number.isInteger(from)||!Number.isInteger(to)||from<1||to<1||from===to)return json({error:"Choose two different valid version numbers."},400);
  if(!key||key.length>200)return json({error:"Choose a valid key column."},400);
  const [a,b]=await Promise.all([env.DB.prepare("SELECT storage_path,columns_json FROM dataset_versions WHERE dataset_id=? AND version_number=?").bind(datasetId,from).first<any>(),env.DB.prepare("SELECT storage_path,columns_json FROM dataset_versions WHERE dataset_id=? AND version_number=?").bind(datasetId,to).first<any>()]);
  if(!a||!b)return json({error:"Dataset or selected version not found."},404);
  const oldColumns=JSON.parse(a.columns_json),newColumns=JSON.parse(b.columns_json);
  if(!oldColumns.includes(key)||!newColumns.includes(key))return json({error:"The selected key column must exist in both versions."},400);
  const [oldObj,newObj]=await Promise.all([readStored(env,a.storage_path),readStored(env,b.storage_path)]);
  if(!oldObj||!newObj)return json({error:"A stored dataset version is missing."},500);
  let oldRows:any[],newRows:any[];try{oldRows=parseCsv(await oldObj.arrayBuffer()).records;newRows=parseCsv(await newObj.arrayBuffer()).records;}catch{return json({error:"A stored CSV version is invalid and cannot be compared."},400);}
  const index=(rows:any[],label:string)=>{const map=new Map<string,any>();for(const row of rows){const value=String(row[key]??"").trim();if(!value)return {error:label+" contains blank values in the selected key column."};if(map.has(value))return {error:label+" contains duplicate values in the selected key column. Choose a unique identifier."};map.set(value,row);}return {map};};
  const oldIndex=index(oldRows,"The earlier version"),newIndex=index(newRows,"The later version");
  if("error" in oldIndex)return json({error:oldIndex.error},400);if("error" in newIndex)return json({error:newIndex.error},400);
  const added:any[]=[],removed:any[]=[],modified:any[]=[];let addedCount=0,removedCount=0,modifiedCount=0;
  for(const [value,row] of newIndex.map){if(!oldIndex.map.has(value)){addedCount++;if(added.length<20)added.push({key:value,record:row});continue;}const before=oldIndex.map.get(value),changed=[...new Set([...Object.keys(before),...Object.keys(row)])].filter(k=>String(before[k]??"")!==String(row[k]??""));if(changed.length){modifiedCount++;if(modified.length<20)modified.push({key:value,changedColumns:changed,before:Object.fromEntries(changed.map(k=>[k,before[k]??""])),after:Object.fromEntries(changed.map(k=>[k,row[k]??""]))});}}
  for(const [value,row] of oldIndex.map)if(!newIndex.map.has(value)){removedCount++;if(removed.length<20)removed.push({key:value,record:row});}
  return json({rowComparison:{fromVersion:from,toVersion:to,keyColumn:key,fromRows:oldRows.length,toRows:newRows.length,addedCount,removedCount,modifiedCount,unchangedCount:Math.max(0,oldRows.length-removedCount-modifiedCount),sampleLimit:20,added,removed,modified}});
 }
 if(sub==="versions"&&req.method==="GET"){
  const {results}=await env.DB.prepare("SELECT v.id,v.version_number AS versionNumber,v.file_size AS fileSize,v.row_count AS rowCount,v.column_count AS columnCount,v.change_note AS changeNote,v.created_at AS createdAt,u.full_name AS uploadedBy FROM dataset_versions v JOIN users u ON u.id=v.uploaded_by WHERE v.dataset_id=? ORDER BY v.version_number DESC").bind(datasetId).all();
  return json({versions:results});
 }
 if(sub==="versions/compare"&&req.method==="GET"){
  const from=Number(url.searchParams.get("from")),to=Number(url.searchParams.get("to"));
  if(!Number.isInteger(from)||!Number.isInteger(to)||from<1||to<1||from===to)return json({error:"Choose two different valid version numbers."},400);
  const [a,b]=await Promise.all([env.DB.prepare("SELECT row_count,column_count,columns_json FROM dataset_versions WHERE dataset_id=? AND version_number=?").bind(datasetId,from).first<any>(),env.DB.prepare("SELECT row_count,column_count,columns_json FROM dataset_versions WHERE dataset_id=? AND version_number=?").bind(datasetId,to).first<any>()]);
  if(!a||!b)return json({error:"Dataset or selected version not found."},404);
  const oldCols=JSON.parse(a.columns_json),newCols=JSON.parse(b.columns_json);
  return json({comparison:{fromVersion:from,toVersion:to,fromRows:a.row_count,toRows:b.row_count,rowDelta:b.row_count-a.row_count,fromColumns:a.column_count,toColumns:b.column_count,addedColumns:newCols.filter((x:string)=>!oldCols.includes(x)),removedColumns:oldCols.filter((x:string)=>!newCols.includes(x)),unchangedColumns:oldCols.filter((x:string)=>newCols.includes(x))}});
 }
 if(sub==="versions"&&req.method==="POST"){
  if(!ownerOnly(m.role))return ownerRequired();
  let form:FormData;try{form=await req.formData();}catch{return json({error:"Choose a CSV file for the new version."},400);}
  const file=form.get("file"),note=typeof form.get("changeNote")==="string"?(form.get("changeNote") as string).trim():"Source file updated";
  if(!(file instanceof File)||!file.size||!file.name.toLowerCase().endsWith(".csv"))return json({error:"Choose a valid CSV file."},400);
  if(file.size>MAX_SYNC_CSV_BYTES)return syncLimitError();
  let bytes:ArrayBuffer;try{bytes=await file.arrayBuffer();}catch{return json({error:"The CSV file could not be read."},400);}
  let parsed;try{parsed=parseCsv(bytes);}catch(e){if(e instanceof Error&&e.message==="TOO_LARGE")return syncLimitError();return json({error:"The CSV file is invalid. Check its header and row structure."},400);}
  const latest=await env.DB.prepare("SELECT COALESCE(MAX(version_number),0) AS v FROM dataset_versions WHERE dataset_id=?").bind(datasetId).first<{v:number}>();
  const version=Number(latest?.v||0)+1,key=dataset.organization_id+"/"+datasetId+"/v"+version+".csv";
  await env.DATASETS.put(key,bytes);
  try{
   await env.DB.batch([
    env.DB.prepare("INSERT INTO dataset_versions (id,dataset_id,version_number,storage_path,file_size,row_count,column_count,columns_json,preview_json,uploaded_by,change_note) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),datasetId,version,key,file.size,parsed.records.length,parsed.columns.length,JSON.stringify(parsed.columns),JSON.stringify(parsed.preview),user.id,note.slice(0,500)),
    env.DB.prepare("UPDATE datasets SET original_filename=?,storage_path=?,file_size=?,row_count=?,column_count=?,columns_json=?,preview_json=?,uploaded_by=? WHERE id=?").bind(file.name.split(/[\\/]/).pop()!.slice(0,255),key,file.size,parsed.records.length,parsed.columns.length,JSON.stringify(parsed.columns),JSON.stringify(parsed.preview),user.id,datasetId)
   ]);
  }catch{await env.DATASETS.delete(key);return json({error:"Dataset version could not be saved."},500);}
  await audit(env,dataset.organization_id,user.id,"DATASET_VERSION_UPLOADED",datasetId,{versionNumber:version,rowCount:parsed.records.length,columnCount:parsed.columns.length});
  return json({version:{versionNumber:version,rowCount:parsed.records.length,columnCount:parsed.columns.length,columns:parsed.columns,preview:parsed.preview}},201);
 }
 if(sub==="versions/compare/rows"&&req.method==="GET")return json({error:"Row-level comparison is being migrated and is not available yet."},501);
 if(sub==="versions/restore"&&req.method==="POST"){
  return json({error:"Use the version-specific restore endpoint after migration is complete."},501);
 }
 if(sub.startsWith("versions/")&&sub.endsWith("/restore")&&req.method==="POST"){
  if(!ownerOnly(m.role))return ownerRequired();
  const version=Number(sub.split("/")[1]);if(!Number.isInteger(version)||version<1)return json({error:"Invalid version number."},400);
  const source=await env.DB.prepare("SELECT * FROM dataset_versions WHERE dataset_id=? AND version_number=?").bind(datasetId,version).first<any>();
  if(!source)return json({error:"Version not found."},404);
  const latest=await env.DB.prepare("SELECT COALESCE(MAX(version_number),0) AS v FROM dataset_versions WHERE dataset_id=?").bind(datasetId).first<{v:number}>();
  const next=Number(latest?.v||0)+1,key=dataset.organization_id+"/"+datasetId+"/v"+next+".csv";
  const object=await readStored(env,source.storage_path);if(!object)return json({error:"Stored dataset version is missing."},500);
  await env.DATASETS.put(key,await object.arrayBuffer());
  await env.DB.batch([
   env.DB.prepare("INSERT INTO dataset_versions (id,dataset_id,version_number,storage_path,file_size,row_count,column_count,columns_json,preview_json,uploaded_by,change_note) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),datasetId,next,key,source.file_size,source.row_count,source.column_count,source.columns_json,source.preview_json,user.id,"Restored from version "+version),
   env.DB.prepare("UPDATE datasets SET storage_path=?,file_size=?,row_count=?,column_count=?,columns_json=?,preview_json=?,uploaded_by=? WHERE id=?").bind(key,source.file_size,source.row_count,source.column_count,source.columns_json,source.preview_json,user.id,datasetId)
  ]);
  await audit(env,dataset.organization_id,user.id,"DATASET_VERSION_RESTORED",datasetId,{restoredFrom:version,newVersion:next});
  return json({restoredFrom:version,newVersion:next},201);
 }
 return null;
}
