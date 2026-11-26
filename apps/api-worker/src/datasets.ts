import { parse } from "csv-parse/sync";
import { runDatasetJoinQuery, runDatasetQuery } from "./query-engine";
import { applyDatasetCellEdits } from "./dataset-edits";
import { aggregateCategoryRows, type ChartAggregation } from "./bi-aggregation";
type Env={DB:D1Database;DATASETS:KVNamespace};
const readStored=async(env:Env,key:string):Promise<{arrayBuffer:()=>Promise<ArrayBuffer>}|null>=>{const bytes=await env.DATASETS.get(key,"arrayBuffer");return bytes?{arrayBuffer:async()=>bytes}:null;};
const MAX_SYNC_CSV_BYTES=256*1024;
const MAX_UPLOAD_CSV_BYTES=10*1024*1024;
const syncLimitError=()=>json({error:"This dataset exceeds the 256 KiB synchronous-processing limit. Background profiling and SQL jobs support datasets up to 10 MiB; this operation does not have background processing yet. Use the relevant background action or a smaller dataset."},413);
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
const parseCsv=(buffer:ArrayBuffer,maxBytes=MAX_SYNC_CSV_BYTES,trimValues=true)=>{
 if(buffer.byteLength>maxBytes)throw new Error("TOO_LARGE");
 const records=parse(new TextDecoder().decode(new Uint8Array(buffer)),{columns:true,skip_empty_lines:true,bom:true,trim:trimValues,relax_column_count:false,skip_records_with_error:false}) as Record<string,unknown>[];
 if(!records.length)throw new Error("EMPTY");
 const columns=Object.keys(records[0]);
 if(!columns.length||columns.length>200||columns.some(c=>!c.trim()))throw new Error("HEADERS");
 return {records,columns,preview:records.slice(0,10).map((row:any)=>Object.fromEntries(columns.map(c=>[c,String(row[c]??"").slice(0,500)])))};
};
import { canAnalyzeDataset, canUploadSourceDataset } from "./role-policy";
const allowed=(role:Role)=>canAnalyzeDataset(role);
const ownerOnly=(role:Role)=>canUploadSourceDataset(role);
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
  let sql="SELECT d.id,d.name,d.original_filename AS originalFilename,d.file_size AS fileSize,d.row_count AS rowCount,d.column_count AS columnCount,d.created_at AS createdAt,u.full_name AS uploadedBy FROM datasets d JOIN users u ON u.id=d.uploaded_by WHERE d.organization_id=?";
  const params:unknown[]=[orgId];
  if(m.role==="ANALYST"){sql+=" AND EXISTS (SELECT 1 FROM dataset_handoffs h WHERE h.dataset_id=d.id AND h.assigned_to=? AND h.status<>'REVOKED')";params.push(user.id);}
  else if(m.role==="LEADER"){sql+=" AND EXISTS (SELECT 1 FROM dataset_handoffs h WHERE h.dataset_id=d.id AND h.status<>\'REVOKED\' AND (h.assigned_to=? OR EXISTS (SELECT 1 FROM team_members tm JOIN teams t ON t.id=tm.team_id WHERE tm.user_id=h.assigned_to AND t.organization_id=d.organization_id AND t.leader_user_id=?)))";params.push(user.id,user.id);}
  sql+=" ORDER BY d.created_at DESC";
  const {results}=await env.DB.prepare(sql).bind(...params).all();
  return json({datasets:results});
 }
 if(orgList&&req.method==="POST"){
  const orgId=orgList[1],m=await membership(env,orgId,user.id);if(!m)return json({error:"Insufficient organization permissions."},403);
  if(!ownerOnly(m.role))return ownerRequired();
  let form:FormData;try{form=await req.formData();}catch{return json({error:"Choose a CSV file to upload."},400);}
  const file=form.get("file"),name=typeof form.get("name")==="string"?(form.get("name") as string).trim():"";
  if(!(file instanceof File)||!file.size||!file.name.toLowerCase().endsWith(".csv"))return json({error:"Choose a valid CSV file."},400);
  if(file.size>MAX_UPLOAD_CSV_BYTES)return json({error:"CSV uploads are limited to 10 MiB while background processing is being expanded."},413);
  if(name.length<2||name.length>120)return json({error:"Dataset name must be 2–120 characters."},400);
  let bytes:ArrayBuffer;try{bytes=await file.arrayBuffer();}catch{return json({error:"The CSV file could not be read."},400);}
  let parsed;try{parsed=parseCsv(bytes,MAX_UPLOAD_CSV_BYTES);}catch(e){if(e instanceof Error&&e.message==="TOO_LARGE")return syncLimitError();return json({error:e instanceof Error&&e.message==="EMPTY"?"The CSV contains a header but no data rows.":"The CSV file is invalid. Check its header and row structure."},400);}
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
 if(m.role==="ANALYST"){
  const grant=await env.DB.prepare("SELECT id FROM dataset_handoffs WHERE dataset_id=? AND assigned_to=? AND status<>'REVOKED' LIMIT 1").bind(datasetId,user.id).first();
  if(!grant)return json({error:"This dataset has not been assigned to you. Ask the Owner or your Team Leader for access."},403);
 }else if(m.role==="LEADER"){
  const grant=await env.DB.prepare("SELECT h.id FROM dataset_handoffs h WHERE h.dataset_id=? AND h.status<>'REVOKED' AND (h.assigned_to=? OR EXISTS (SELECT 1 FROM team_members tm JOIN teams t ON t.id=tm.team_id WHERE tm.user_id=h.assigned_to AND t.organization_id=? AND t.leader_user_id=?)) LIMIT 1").bind(datasetId,user.id,dataset.organization_id,user.id).first();
  if(!grant)return json({error:"This dataset is outside your assigned team scope."},403);
 }
 if(["clean","edits","profile","validate","anomalies","quality-dashboard","compare","insights","query"].includes(sub)&&Number(dataset.file_size)>MAX_SYNC_CSV_BYTES)return syncLimitError();
 if(sub==="dashboards"&&req.method==="GET"){
  const {results}=await env.DB.prepare("SELECT id,title,config_json AS configJson,created_by AS createdBy,created_at AS createdAt,updated_at AS updatedAt FROM analytics_dashboards WHERE organization_id=? AND dataset_id=? ORDER BY updated_at DESC").bind(dataset.organization_id,datasetId).all();
  return json({dashboards:(results||[]).map((item:any)=>({...item,canDelete:m.role==="OWNER"||item.createdBy===user.id,config:JSON.parse(String(item.configJson||"{}"))}))});
 }
 if(sub==="dashboards"&&req.method==="POST"){
  if(!allowed(m.role))return json({error:"Only OWNER, LEADER and ANALYST can save dashboards."},403);
  let body:any;try{body=await req.json();}catch{return json({error:"Send a dashboard title and configuration."},400);}
  const title=typeof body.title==="string"?body.title.trim():"",config=body.config;
  if(title.length<2||title.length>100)return json({error:"Dashboard title must be 2–100 characters."},400);
  if(!config||typeof config!=="object"||Array.isArray(config))return json({error:"Dashboard configuration is invalid."},400);
  const columns:string[]=JSON.parse(dataset.columns_json||"[]");
  const categoryColumn=typeof config.categoryColumn==="string"?config.categoryColumn:"",measureColumn=typeof config.measureColumn==="string"?config.measureColumn:"";
  const filter=typeof config.filter==="string"?config.filter.slice(0,120):"";
  const aggregation=typeof config.aggregation==="string"?config.aggregation.toUpperCase():"SUM";
  if(!["SUM","AVG","COUNT","MIN","MAX"].includes(aggregation))return json({error:"Choose SUM, AVG, COUNT, MIN or MAX for the dashboard aggregation."},400);
  if(!columns.includes(categoryColumn)||!columns.includes(measureColumn))return json({error:"Choose valid dataset columns for the dashboard."},400);
  const safeConfig={categoryColumn,measureColumn,filter,aggregation};
  const id=crypto.randomUUID();
  await env.DB.prepare("INSERT INTO analytics_dashboards (id,organization_id,dataset_id,title,config_json,created_by) VALUES (?,?,?,?,?,?)").bind(id,dataset.organization_id,datasetId,title,JSON.stringify(safeConfig),user.id).run();
  await audit(env,dataset.organization_id,user.id,"ANALYTICS_DASHBOARD_SAVED",id,{datasetId,title});
  return json({dashboard:{id,title,config:safeConfig,createdBy:user.id}},201);
 }
 const dashboardDelete=sub.match(/^dashboards\/([^/]+)$/);
 if(dashboardDelete&&req.method==="DELETE"){
  const dashboard=await env.DB.prepare("SELECT id,created_by FROM analytics_dashboards WHERE id=? AND dataset_id=? AND organization_id=?").bind(dashboardDelete[1],datasetId,dataset.organization_id).first<{id:string;created_by:string}>();
  if(!dashboard)return json({error:"Saved dashboard not found."},404);
  if(m.role!=="OWNER"&&(!allowed(m.role)||dashboard.created_by!==user.id))return json({error:"Only the owner or dashboard creator can delete this dashboard."},403);
  await env.DB.prepare("DELETE FROM analytics_dashboards WHERE id=?").bind(dashboard.id).run();
  await audit(env,dataset.organization_id,user.id,"ANALYTICS_DASHBOARD_DELETED",dashboard.id,{datasetId});
  return json({deleted:true});
 }
 if(sub==="query"&&req.method==="POST"){
  if(!allowed(m.role))return json({error:"SQL analysis is available to OWNER, LEADER and ANALYST roles. MANAGER is read-only."},403);
  if(Number(dataset.file_size)>MAX_SYNC_CSV_BYTES)return syncLimitError();
  let body:any;try{body=await req.json();}catch{return json({error:"Send a valid SQL query."},400);}
  if(typeof body.sql!=="string"||body.sql.length>12000)return json({error:"SQL query must be a string up to 12,000 characters."},400);
  const joinToken=body.sql.match(/\bJOIN\s+dataset_([a-f0-9]{32})\b/i)?.[1]?.toLowerCase();
  let rightRows:Record<string,string>[]|null=null,rightColumns:string[]=[];
  if(joinToken){
   const right=await env.DB.prepare("SELECT id,storage_path,file_size FROM datasets WHERE replace(id,'-','')=? AND organization_id=?").bind(joinToken,dataset.organization_id).first<any>();
   if(!right)return json({error:"The JOIN dataset must exist in the same organization."},404);
    if(m.role==="ANALYST"&&!await env.DB.prepare("SELECT id FROM dataset_handoffs WHERE dataset_id=? AND assigned_to=? AND status<>'REVOKED' LIMIT 1").bind(right.id,user.id).first())return json({error:"You do not have access to the joined dataset."},403);
    if(m.role==="LEADER"&&!await env.DB.prepare("SELECT h.id FROM dataset_handoffs h WHERE h.dataset_id=? AND h.status<>\'REVOKED\' AND (h.assigned_to=? OR EXISTS (SELECT 1 FROM team_members tm JOIN teams t ON t.id=tm.team_id WHERE tm.user_id=h.assigned_to AND t.organization_id=? AND t.leader_user_id=?)) LIMIT 1").bind(right.id,user.id,dataset.organization_id,user.id).first())return json({error:"The joined dataset is outside your assigned team scope."},403);
   if(right.id===dataset.id)return json({error:"JOIN requires a second dataset."},400);
   if(Number(right.file_size)>MAX_SYNC_CSV_BYTES)return syncLimitError();
   const rightSource=await readStored(env,right.storage_path);if(!rightSource)return json({error:"Joined dataset file is missing."},500);
   let rightParsed;try{rightParsed=parseCsv(await rightSource.arrayBuffer());}catch{return json({error:"The joined CSV could not be parsed."},400);}
   rightColumns=rightParsed.columns;
   rightRows=rightParsed.records.map((row:Record<string,unknown>)=>Object.fromEntries(rightColumns.map((column:string)=>[column,String(row[column]??"")])));
  }
  const source=await readStored(env,dataset.storage_path);if(!source)return json({error:"Stored dataset file is missing."},500);
  let parsed;try{parsed=parseCsv(await source.arrayBuffer());}catch{return json({error:"The stored CSV could not be parsed."},400);}
  const rows=parsed.records.map((row:Record<string,unknown>)=>Object.fromEntries(parsed.columns.map((column:string)=>[column,String(row[column]??"")])));
  try{
   const result=joinToken&&rightRows?runDatasetJoinQuery(body.sql,rows,parsed.columns,rightRows,rightColumns):runDatasetQuery(body.sql,rows,parsed.columns);
   await audit(env,dataset.organization_id,user.id,"DATASET_SQL_QUERY",datasetId,{returnedRows:result.rowCount,matchedRows:result.matchedRows,join:!!joinToken});
   return json({result,dataset:{id:dataset.id,name:dataset.name}});
  }catch(error){return json({error:error instanceof Error?error.message:"SQL query could not be executed."},400);}
 }

if(sub==="edits"&&req.method==="POST"){
  if(!allowed(m.role))return json({error:"Only OWNER, LEADER and ANALYST roles can edit assigned dataset cells."},403);
  if(Number(dataset.file_size)>MAX_SYNC_CSV_BYTES)return syncLimitError();
  let body:any={};try{body=await req.json();}catch{return json({error:"Invalid cell edit request."},400);}
  const source=await readStored(env,dataset.storage_path);if(!source)return json({error:"Stored dataset file is missing."},500);
  let parsed;try{parsed=parseCsv(await source.arrayBuffer(),MAX_SYNC_CSV_BYTES,false);}catch{return json({error:"The stored CSV is invalid and cannot be edited."},400);}
  let edited;try{edited=applyDatasetCellEdits(parsed.records,parsed.columns,body.changes);}catch(e){return json({error:e instanceof Error?e.message:"Cell edits are invalid."},400);}
  const output=csvEncode(edited.rows,parsed.columns),bytes=new TextEncoder().encode(output);
  if(bytes.byteLength>MAX_SYNC_CSV_BYTES)return syncLimitError();
  const key=dataset.organization_id+"/"+datasetId+"/edited-"+crypto.randomUUID()+".csv";
  const preview=edited.rows.slice(0,10).map(row=>Object.fromEntries(parsed.columns.map(column=>[column,String(row[column]??"").slice(0,500)])));
  await env.DATASETS.put(key,bytes);
  try{await env.DB.batch([
   env.DB.prepare("INSERT INTO dataset_versions (id,dataset_id,version_number,storage_path,file_size,row_count,column_count,columns_json,preview_json,uploaded_by,change_note) SELECT ?,?,COALESCE(MAX(version_number),0)+1,?,?,?,?,?,?,?,? FROM dataset_versions WHERE dataset_id=?").bind(crypto.randomUUID(),datasetId,key,bytes.length,edited.rows.length,parsed.columns.length,JSON.stringify(parsed.columns),JSON.stringify(preview),user.id,(typeof body.changeNote==="string"?body.changeNote:"Spreadsheet cell edits").slice(0,500),datasetId),
   env.DB.prepare("UPDATE datasets SET storage_path=?,file_size=?,row_count=?,column_count=?,columns_json=?,preview_json=?,uploaded_by=? WHERE id=?").bind(key,bytes.length,edited.rows.length,parsed.columns.length,JSON.stringify(parsed.columns),JSON.stringify(preview),user.id,datasetId)
  ]);}catch{await env.DATASETS.delete(key);return json({error:"Edited dataset version could not be saved."},500);}
  const savedVersion=await env.DB.prepare("SELECT version_number AS versionNumber FROM dataset_versions WHERE dataset_id=? AND storage_path=?").bind(datasetId,key).first<{versionNumber:number}>();
  if(!savedVersion)return json({error:"Edited dataset version was saved but its version number could not be read."},500);
  const version=Number(savedVersion.versionNumber);
  await audit(env,dataset.organization_id,user.id,"DATASET_CELLS_EDITED",datasetId,{versionNumber:version,editedCells:edited.applied});
  return json({version:{versionNumber:version,rowCount:edited.rows.length,columnCount:parsed.columns.length,columns:parsed.columns,preview},editedCells:edited.applied},201);
}
if(sub==="clean"&&req.method==="POST"){
  if(!allowed(m.role))return json({error:"Only OWNER, LEADER and ANALYST roles can create cleaned dataset versions."},403);
  let body:any={};try{body=await req.json();}catch{return json({error:"Invalid cleaning options."},400);}
  const trimWhitespace=body.trimWhitespace!==false,removeDuplicates=body.removeDuplicates!==false,fillMissing=body.fillMissing??"none";
  if(!["none","zero","mean","median","mode"].includes(fillMissing))return json({error:"Unsupported missing-value strategy."},400);
  const source=await readStored(env,dataset.storage_path);if(!source)return json({error:"Stored dataset file is missing."},500);
  let parsed;try{parsed=parseCsv(await source.arrayBuffer());}catch{return json({error:"The stored CSV is invalid."},400);}
  let columns: string[]=parsed.columns.slice();const sourceColumns=columns.slice();const rows:Record<string,string>[]=parsed.records.map((r:Record<string,unknown>)=>Object.fromEntries(columns.map(k=>[k,String(r[k]??"")])));
  const before=quality(rows,columns);
  const filterSpec=body.rowFilter&&typeof body.rowFilter==="object"?body.rowFilter:null;
  let filteredRows=0;
  if(filterSpec){
   const column=typeof filterSpec.column==="string"?filterSpec.column:"",operator=typeof filterSpec.operator==="string"?filterSpec.operator:"",value=filterSpec.value===undefined?"":String(filterSpec.value);
   if(!columns.includes(column)||!["equals","not_equals","contains","greater_than","less_than","is_empty","not_empty"].includes(operator)||value.length>500)return json({error:"Row filter is invalid. Choose a current column and a supported operator."},400);
   const beforeFilter=rows.length;
   const keep=(raw:string)=>{const current=String(raw??"");if(operator==="is_empty")return !current.trim();if(operator==="not_empty")return !!current.trim();if(operator==="equals")return current===value;if(operator==="not_equals")return current!==value;if(operator==="contains")return current.toLocaleLowerCase().includes(value.toLocaleLowerCase());if(!isNum(current)||!isNum(value))return false;return operator==="greater_than"?Number(current)>Number(value):Number(current)<Number(value);};
   for(let i=rows.length-1;i>=0;i--)if(!keep(rows[i][column]))rows.splice(i,1);
   filteredRows=beforeFilter-rows.length;
  }
  const normalizeHeaders=body.normalizeHeaders===true,dropEmptyRows=body.dropEmptyRows===true;
  const requestedNumeric:string[]=Array.isArray(body.numericColumns)?body.numericColumns.filter((v:unknown):v is string=>typeof v==="string"):[];
  if(requestedNumeric.some(k=>!columns.includes(k)))return json({error:"Choose numeric columns from the current dataset."},400);
  if(trimWhitespace)for(const row of rows)for(const k of columns)row[k]=row[k].trim();
  let normalizedHeaders:Record<string,string>={};
  if(normalizeHeaders){
   const used=new Set<string>(),next=columns.map(old=>{const base=old.trim().toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"")||"column";let name=base,n=2;while(used.has(name))name=base+"_"+n++;used.add(name);normalizedHeaders[old]=name;return name;});
   for(const row of rows){const renamed:Record<string,string>={};for(const old of columns)renamed[normalizedHeaders[old]]=row[old];for(const key of Object.keys(row))delete row[key];Object.assign(row,renamed);}
   columns=next;
  }
  const renameInput=body.renameColumns&&typeof body.renameColumns==="object"&&!Array.isArray(body.renameColumns)?body.renameColumns:{};
  const renameEntries=Object.entries(renameInput) as [string,unknown][];
  if(renameEntries.length>200||renameEntries.some(([oldName,newName])=>!columns.includes(normalizeHeaders?normalizedHeaders[oldName]:oldName)||typeof newName!=="string"||!newName.trim()||newName.trim().length>200))return json({error:"Column rename instructions are invalid. Use existing source column names and new names up to 200 characters."},400);
  const renameMap:Record<string,string>={};
  for(const [oldName,newName] of renameEntries)renameMap[normalizeHeaders?normalizedHeaders[oldName]:oldName]=(newName as string).trim();
  const renamedColumns=columns.map(name=>renameMap[name]||name);
  if(new Set(renamedColumns).size!==renamedColumns.length)return json({error:"Renamed columns must remain unique."},400);
  if(renameEntries.length){for(const row of rows){const renamed:Record<string,string>={};for(const oldName of columns)renamed[renameMap[oldName]||oldName]=row[oldName];for(const key of Object.keys(row))delete row[key];Object.assign(row,renamed);}columns=renamedColumns;}
  const dropInput=Array.isArray(body.dropColumns)?body.dropColumns:[];
  if(dropInput.length>200||dropInput.some((name:unknown)=>typeof name!=="string"||!columns.includes(normalizeHeaders?normalizedHeaders[name]:name)))return json({error:"Choose source columns that exist in the current dataset to remove."},400);
  const dropColumns=[...new Set((dropInput as string[]).map(name=>normalizeHeaders?normalizedHeaders[name]:name))];
  if(dropColumns.length>=columns.length)return json({error:"At least one column must remain after transformation."},400);
  if(dropColumns.length){columns=columns.filter(name=>!dropColumns.includes(name));for(const row of rows)for(const name of dropColumns)delete row[name];}
  const numericTargets=requestedNumeric.map(k=>{const normalized=normalizeHeaders?normalizedHeaders[k]:k;return renameMap[normalized]||normalized;}).filter(k=>columns.includes(k));

  let removedEmptyRows=0;
  if(dropEmptyRows){for(let i=rows.length-1;i>=0;i--)if(columns.every(k=>!String(rows[i][k]??"").trim())){rows.splice(i,1);removedEmptyRows++;}}
  let convertedNumericColumns:string[]=[];
  for(const column of numericTargets){const invalid=rows.some(row=>row[column].trim()!==""&&!isNum(row[column]));if(invalid)return json({error:"Column "+column+" contains non-numeric values; it was not converted."},400);for(const row of rows)if(row[column].trim()!=="")row[column]=String(Number(row[column]));convertedNumericColumns.push(column);}
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
  if(!rows.length)return json({error:"These transformations would remove every data row. No version was saved."},400);
  const after=quality(rows,columns),outliersByColumn:Record<string,number>={};
  for(const k of columns){const nonempty=rows.map(r=>r[k]).filter(v=>v.trim()),nums=nonempty.filter(isNum).map(Number);if(nums.length>=4&&nums.length/Math.max(1,nonempty.length)>=.9){const s=nums.slice().sort((a,b)=>a-b),median=(a:number[])=>{const n=Math.floor(a.length/2);return a.length%2?a[n]:(a[n-1]+a[n])/2;},middle=Math.floor(s.length/2),q1=median(s.slice(0,middle)),q3=median(s.slice(s.length%2?middle+1:middle)),iqr=q3-q1,count=nums.filter(v=>v<q1-1.5*iqr||v>q3+1.5*iqr).length;if(count)outliersByColumn[k]=count;}}
  const latest=await env.DB.prepare("SELECT COALESCE(MAX(version_number),0) AS v FROM dataset_versions WHERE dataset_id=?").bind(datasetId).first<{v:number}>(),version=Number(latest?.v||0)+1,key=dataset.organization_id+"/"+datasetId+"/v"+version+"-cleaned.csv",output=csvEncode(rows,columns),bytes=new TextEncoder().encode(output);
  await env.DATASETS.put(key,bytes);
  const report={before,after,removedDuplicates,removedEmptyRows,filteredRows,filledCells,fillStrategy:fillMissing,normalizedHeaders,convertedNumericColumns,outliersByColumn,columnsBefore:sourceColumns,columns,preview:rows.slice(0,10)};
  try{await env.DB.batch([
   env.DB.prepare("INSERT INTO dataset_versions (id,dataset_id,version_number,storage_path,file_size,row_count,column_count,columns_json,preview_json,uploaded_by,change_note) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),datasetId,version,key,bytes.length,rows.length,columns.length,JSON.stringify(columns),JSON.stringify(report.preview),user.id,"Cloudflare cleaning · quality score "+before.qualityScore+" → "+after.qualityScore),
   env.DB.prepare("UPDATE datasets SET storage_path=?,file_size=?,row_count=?,column_count=?,columns_json=?,preview_json=?,uploaded_by=? WHERE id=?").bind(key,bytes.length,rows.length,columns.length,JSON.stringify(columns),JSON.stringify(report.preview),user.id,datasetId)
  ]);}catch{await env.DATASETS.delete(key);return json({error:"Cleaned dataset version could not be saved."},500);}
  await audit(env,dataset.organization_id,user.id,"DATASET_CLEANED",datasetId,{versionNumber:version,beforeScore:before.qualityScore,afterScore:after.qualityScore,removedDuplicates,removedEmptyRows,filteredRows,filledCells});
  return json({versionNumber:version,report},201);
 }
 if(sub==="insights"&&req.method==="GET"){
  if(Number(dataset.file_size)>MAX_SYNC_CSV_BYTES)return syncLimitError();
  const source=await readStored(env,dataset.storage_path);if(!source)return json({error:"Stored dataset file is missing."},500);
  let parsed;try{parsed=parseCsv(await source.arrayBuffer());}catch{return json({error:"The stored CSV could not be parsed for full-dataset insights."},400);}
  const category=url.searchParams.get("category")||"",measure=url.searchParams.get("measure")||"",filter=(url.searchParams.get("filter")||"").trim().slice(0,120).toLocaleLowerCase(),aggregation=(url.searchParams.get("aggregation")||"SUM").toUpperCase() as ChartAggregation;
  if(!["SUM","AVG","COUNT","MIN","MAX"].includes(aggregation))return json({error:"Aggregation must be SUM, AVG, COUNT, MIN or MAX."},400);
  if(category&&!parsed.columns.includes(category))return json({error:"Choose a valid category column."},400);
  if(measure&&!parsed.columns.includes(measure))return json({error:"Choose a valid measure column."},400);
  const rows=parsed.records as Record<string,unknown>[],rowCount=rows.length,columnCount=parsed.columns.length;
  let missingCells=0,duplicateRows=0;const seen=new Set<string>();
  const numericStats:any[]=[];
  for(const column of parsed.columns){
   const values=rows.map(row=>String(row[column]??"").trim());missingCells+=values.filter(v=>!v).length;
   const present=values.filter(Boolean),numbers=present.map(Number).filter(Number.isFinite);
   if(present.length&&numbers.length/present.length>=.9){
    const sum=numbers.reduce((a,b)=>a+b,0),sorted=numbers.slice().sort((a,b)=>a-b);
    numericStats.push({column,count:numbers.length,mean:Number((sum/numbers.length).toFixed(3)),sum:Number(sum.toFixed(3)),min:sorted[0],max:sorted[sorted.length-1]});
   }
  }
  for(const row of rows){const key=JSON.stringify(parsed.columns.map(c=>String(row[c]??"")));if(seen.has(key))duplicateRows++;else seen.add(key);}
  let numericCount=0,numericSum=0,numericMin=Infinity,numericMax=-Infinity;
  if(category&&measure){for(const row of rows){const label=String(row[category]??"").trim()||"(blank)";if(filter&&!label.toLocaleLowerCase().includes(filter))continue;const raw=String(row[measure]??"").trim(),value=Number(raw);if(raw!==""&&Number.isFinite(value)){numericCount++;numericSum+=value;numericMin=Math.min(numericMin,value);numericMax=Math.max(numericMax,value);}}}
  const {chartRows}=category&&measure?aggregateCategoryRows(rows,category,measure,filter,aggregation):{chartRows:[]};
  await audit(env,dataset.organization_id,user.id,"DATASET_INSIGHTS_VIEWED",datasetId,{scope:"FULL_DATASET",rowCount,category:category||null,measure:measure||null,aggregation,filterApplied:!!filter});
  const insights=[rowCount.toLocaleString()+" records analysed across the full dataset",missingCells.toLocaleString()+" missing cells ("+Number((missingCells/(Math.max(1,rowCount*columnCount))*100).toFixed(2))+"% of all cells)",duplicateRows.toLocaleString()+" duplicate rows detected",numericStats.length+" numeric columns detected"];
  if(numericStats.length){const top=numericStats.slice().sort((a,b)=>b.sum-a.sum)[0];insights.push(top.column+" has the largest numeric total ("+top.sum.toLocaleString()+")");}
  if(chartRows.length)insights.push("Top "+chartRows.length+" category groups by "+aggregation+" of "+measure+": "+chartRows[0].label+" leads with "+chartRows[0].value.toLocaleString());
  return json({summary:{rowCount,columnCount,missingCells,duplicateRows,numericColumns:numericStats.length,chartValueCount:numericCount,chartTotal:Number(numericSum.toFixed(3)),chartMin:numericCount?numericMin:null,chartMax:numericCount?numericMax:null},numericStats,chartRows,insights,aggregation,scope:"FULL_DATASET"});
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
 if(sub==="rows"&&req.method==="GET"){
  if(Number(dataset.file_size)>MAX_SYNC_CSV_BYTES)return syncLimitError();
  const source=await readStored(env,dataset.storage_path);
  if(!source)return json({error:"Stored dataset file is missing."},500);
  let parsed;try{parsed=parseCsv(await source.arrayBuffer(),MAX_SYNC_CSV_BYTES,false);}catch(e){return e instanceof Error&&e.message==="TOO_LARGE"?syncLimitError():json({error:"The stored CSV could not be read."},400);}
  const pageRaw=Number(url.searchParams.get("page")||1),sizeRaw=Number(url.searchParams.get("pageSize")||50);
  const page=Number.isInteger(pageRaw)?Math.max(1,pageRaw):1,pageSize=[25,50,100,200].includes(sizeRaw)?sizeRaw:50;
  const q=(url.searchParams.get("q")||"").trim().slice(0,200).toLocaleLowerCase();
  const sort=(url.searchParams.get("sort")||"").trim(),direction=url.searchParams.get("direction")==="desc"?-1:1;
  if(sort&&!parsed.columns.includes(sort))return json({error:"Choose a valid dataset column to sort."},400);
  let rows=parsed.records.map((sourceRow:any,sourceIndex:number)=>({values:Object.fromEntries(parsed.columns.map(c=>[c,String(sourceRow[c]??"")])),sourceIndex}));
  if(q)rows=rows.filter(item=>parsed.columns.some(c=>String(item.values[c]??"").toLocaleLowerCase().includes(q)));
  if(sort)rows.sort((a,b)=>String(a.values[sort]??"").localeCompare(String(b.values[sort]??""),undefined,{numeric:true,sensitivity:"base"})*direction);
  const totalRows=rows.length,totalPages=Math.max(1,Math.ceil(totalRows/pageSize)),safePage=Math.min(page,totalPages),start=(safePage-1)*pageSize,pageItems=rows.slice(start,start+pageSize);
  return json({datasetId:datasetId,page:safePage,pageSize,totalRows,totalPages,columns:parsed.columns,rows:pageItems.map(item=>item.values),rowIndexes:pageItems.map(item=>item.sourceIndex)});
 }
 if(sub==="results"&&req.method==="POST"){
  if(!allowed(m.role))return json({error:"Only OWNER, LEADER and assigned ANALYST roles can save internal result datasets."},403);
  let body:any;try{body=await req.json();}catch{return json({error:"Send result dataset details."},400);}
  const name=typeof body.name==="string"?body.name.trim():"";
  const columns=Array.isArray(body.columns)?body.columns:[];
  const rows=Array.isArray(body.rows)?body.rows:[];
  const sourceHandoffId=typeof body.sourceHandoffId==="string"?body.sourceHandoffId:"";
  const note=typeof body.changeNote==="string"?body.changeNote.trim():"Saved from an internal Vyron analysis";
  if(name.length<2||name.length>120||!columns.length||columns.length>200||columns.some((c:any)=>typeof c!=="string"||!c.trim()||c.length>200)||new Set(columns).size!==columns.length)return json({error:"Give the result a name and 1–200 unique valid columns."},400);
  if(!rows.length||rows.length>100000||rows.some((row:any)=>!row||typeof row!=="object"||Array.isArray(row)))return json({error:"Internal result datasets must contain 1–100,000 rows."},400);
  if(rows.some((row:any)=>columns.some((column:string)=>row[column]!==undefined&&row[column]!==null&&typeof row[column]==="object")))return json({error:"Nested result values are not supported in CSV datasets."},400);
  let assignedBy=user.id,stage:"CLEANING"|"SQL_REVIEW"|"DASHBOARD"|"RECONCILIATION"="RECONCILIATION",handoffNote="Internal result created by "+user.id;
  if(sourceHandoffId){
   const sourceHandoff=await env.DB.prepare("SELECT id,assigned_to,assigned_by,stage,status FROM dataset_handoffs WHERE id=? AND dataset_id=?").bind(sourceHandoffId,datasetId).first<any>();
   if(!sourceHandoff||sourceHandoff.assigned_to!==user.id||!["IN_PROGRESS","RETURNED","ASSIGNED"].includes(sourceHandoff.status))return json({error:"The selected work handoff is not assigned to you or is no longer editable."},403);
   assignedBy=sourceHandoff.assigned_by;stage=sourceHandoff.stage;handoffNote="Internal output from "+dataset.name+" · "+note;
  }
  const normalizedRows=rows.map((row:any)=>Object.fromEntries(columns.map((column:string)=>[column,String(row[column]??"")])));
  const csv=csvEncode(normalizedRows,columns),bytes=new TextEncoder().encode(csv);
  if(bytes.byteLength>MAX_UPLOAD_CSV_BYTES)return json({error:"This internal result is larger than the current 10 MiB workspace storage limit."},413);
  let parsed:any;try{parsed=parseCsv(bytes.buffer,MAX_UPLOAD_CSV_BYTES);}catch{return json({error:"The result could not be converted into a valid internal CSV dataset."},400);}
  const resultId=crypto.randomUUID(),key=dataset.organization_id+"/"+resultId+"/v1.csv";
  const preview=parsed.preview;
  const fileName=name.replace(/[^a-z0-9-_]+/gi,"_").slice(0,180)+".csv";
  await env.DATASETS.put(key,bytes);
  try{
   const statements=[
    env.DB.prepare("INSERT INTO datasets (id,organization_id,name,original_filename,storage_path,file_size,row_count,column_count,columns_json,preview_json,uploaded_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(resultId,dataset.organization_id,name,fileName,key,bytes.byteLength,parsed.records.length,parsed.columns.length,JSON.stringify(parsed.columns),JSON.stringify(preview),user.id),
    env.DB.prepare("INSERT INTO dataset_versions (id,dataset_id,version_number,storage_path,file_size,row_count,column_count,columns_json,preview_json,uploaded_by,change_note) VALUES (?,?,1,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),resultId,key,bytes.byteLength,parsed.records.length,parsed.columns.length,JSON.stringify(parsed.columns),JSON.stringify(preview),user.id,note.slice(0,500))
   ];
   if(m.role==="ANALYST")statements.push(env.DB.prepare("INSERT INTO dataset_handoffs (id,organization_id,dataset_id,stage,status,assigned_to,assigned_by,input_version,handoff_note,result_json) VALUES (?,?,?,?,'SUBMITTED',?,?,1,?,?)").bind(crypto.randomUUID(),dataset.organization_id,resultId,stage,user.id,assignedBy,handoffNote.slice(0,1000),JSON.stringify({sourceDatasetId:datasetId,sourceHandoffId:sourceHandoffId||null,internalResult:true})));
   await env.DB.batch(statements);
  }catch(error){await env.DATASETS.delete(key);return json({error:"Internal result dataset could not be registered. No downloadable file was created."},500);}
  await audit(env,dataset.organization_id,user.id,"DATASET_INTERNAL_RESULT_SAVED",resultId,{sourceDatasetId:datasetId,sourceHandoffId:sourceHandoffId||null,rowCount:parsed.records.length,columnCount:parsed.columns.length,storage:"private-workspace"});
  return json({dataset:{id:resultId,name,originalFilename:fileName,rowCount:parsed.records.length,columnCount:parsed.columns.length,columns:parsed.columns,preview,storage:"private-workspace",handoffStatus:sourceHandoffId?"SUBMITTED":"INTERNAL"}},201);
 }
 if(sub==="handoffs"&&req.method==="GET"){
  let scope="h.assigned_to=?";
  const params:unknown[]=[datasetId,user.id];
  if(m.role==="OWNER"||m.role==="MANAGER"){scope="1=1";params.splice(1,1);}
  else if(m.role==="LEADER"){scope="EXISTS (SELECT 1 FROM team_members tm JOIN teams t ON t.id=tm.team_id WHERE h.status<>'REVOKED' AND t.organization_id=h.organization_id AND t.leader_user_id=? AND tm.user_id=h.assigned_to)";}
  else if(m.role==="ANALYST")scope="(h.status<>'REVOKED' AND (h.assigned_to=? OR (h.status='APPROVED' AND h.stage IN ('SQL_REVIEW','RECONCILIATION'))))";
  else return json({error:"Insufficient permissions."},403);
  const sql="SELECT h.id,h.stage,h.status,h.assigned_to AS assignedTo,h.assigned_by AS assignedBy,h.input_version AS inputVersion,h.output_version AS outputVersion,h.handoff_note AS handoffNote,h.review_note AS reviewNote,h.result_json AS resultJson,h.created_at AS createdAt,h.updated_at AS updatedAt,u.full_name AS assigneeName,a.full_name AS assignedByName FROM dataset_handoffs h JOIN users u ON u.id=h.assigned_to JOIN users a ON a.id=h.assigned_by WHERE h.dataset_id=? AND "+scope+" ORDER BY h.created_at DESC";
  const {results}=await env.DB.prepare(sql).bind(...params).all<any>();
  return json({handoffs:results.map((h:any)=>({...h,result:h.resultJson?JSON.parse(String(h.resultJson)):null,canUpdate:h.assignedTo===user.id,canReview:m.role==="OWNER"||m.role==="LEADER",canRevoke:m.role==="OWNER"||m.role==="LEADER"}))});
 }
 if(sub==="handoffs"&&req.method==="POST"){
  if(m.role!=="OWNER"&&m.role!=="LEADER")return json({error:"Only the Owner or the assigned Team Leader can create handoffs."},403);
  let body:any;try{body=await req.json();}catch{return json({error:"Send valid handoff details."},400);}
  const stage=String(body.stage||""),assignedTo=String(body.assignedTo||""),handoffNote=typeof body.handoffNote==="string"?body.handoffNote.trim():"";
  if(!["CLEANING","SQL_REVIEW","DASHBOARD","RECONCILIATION"].includes(stage)||!/^[0-9a-f-]{36}$/i.test(assignedTo)||handoffNote.length>1000)return json({error:"Choose a valid stage, Analyst and handoff note."},400);
  const assignee=await env.DB.prepare("SELECT u.full_name,m.role FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.organization_id=? AND m.user_id=? AND m.membership_status='ACTIVE'").bind(dataset.organization_id,assignedTo).first<any>();
  if(!assignee||assignee.role!=="ANALYST")return json({error:"Handoffs must be assigned to an active Analyst in this organization."},400);
  if(m.role==="LEADER"){
   const team=await env.DB.prepare("SELECT tm.user_id FROM teams t JOIN team_members tm ON tm.team_id=t.id WHERE t.organization_id=? AND t.leader_user_id=? AND tm.user_id=? LIMIT 1").bind(dataset.organization_id,user.id,assignedTo).first();
   if(!team)return json({error:"A Leader can assign work only to Analysts in their own team."},403);
  }
  const latest=await env.DB.prepare("SELECT version_number AS versionNumber FROM dataset_versions WHERE dataset_id=? ORDER BY version_number DESC LIMIT 1").bind(datasetId).first<{versionNumber:number}>();
  const inputVersion=Number(body.inputVersion||latest?.versionNumber||0);
  const version=await env.DB.prepare("SELECT id FROM dataset_versions WHERE dataset_id=? AND version_number=?").bind(datasetId,inputVersion).first();
  if(!version)return json({error:"The selected input dataset version does not exist."},400);
  const id=crypto.randomUUID();
  await env.DB.prepare("INSERT INTO dataset_handoffs (id,organization_id,dataset_id,stage,status,assigned_to,assigned_by,input_version,handoff_note) VALUES (?,?,?,?,'ASSIGNED',?,?,?,?)").bind(id,dataset.organization_id,datasetId,stage,assignedTo,user.id,inputVersion,handoffNote).run();
  await audit(env,dataset.organization_id,user.id,"DATASET_HANDOFF_ASSIGNED",id,{datasetId,stage,assignedTo,inputVersion});
  return json({handoff:{id,stage,status:"ASSIGNED",assignedTo,inputVersion,handoffNote,assigneeName:assignee.full_name}},201);
 }
 const handoffMatch=sub.match(/^handoffs\/([^/]+)$/);
 if(handoffMatch&&req.method==="PATCH"){
  let body:any;try{body=await req.json();}catch{return json({error:"Send a valid handoff status."},400);}
  const status=String(body.status||""),outputVersion=Number(body.outputVersion||0),reviewNote=typeof body.reviewNote==="string"?body.reviewNote.trim():"";
  let resultJson:string|null=null;
  if(body.result!==undefined){if(!body.result||typeof body.result!=="object"||Array.isArray(body.result))return json({error:"The shared result must be a JSON object."},400);resultJson=JSON.stringify(body.result);if(resultJson.length>50000)return json({error:"Shared query results are limited to 50 KB. Reduce rows or columns."},413);const columns=body.result.columns,rows=body.result.rows;if(!Array.isArray(columns)||columns.length>50||!Array.isArray(rows)||rows.length>100||columns.some((v:any)=>typeof v!=="string"||v.length>200))return json({error:"Shared results may contain up to 50 columns and 100 rows."},400);}
  if(!["IN_PROGRESS","SUBMITTED","APPROVED","RETURNED","REVOKED"].includes(status)||reviewNote.length>1000)return json({error:"Choose a valid status and review note."},400);
  if((status==="APPROVED"||status==="RETURNED")&&!reviewNote)return json({error:status==="APPROVED"?"A review note is required to approve this handoff.":"A review note is required to return this handoff."},400);
  const handoff=await env.DB.prepare("SELECT * FROM dataset_handoffs WHERE id=? AND dataset_id=?").bind(handoffMatch[1],datasetId).first<any>();
  if(!handoff)return json({error:"Handoff not found."},404);
  if(status==="REVOKED"){
   let canRevoke=m.role==="OWNER";
   if(m.role==="LEADER"){
    const team=await env.DB.prepare("SELECT t.id FROM teams t JOIN team_members tm ON tm.team_id=t.id WHERE t.organization_id=? AND t.leader_user_id=? AND tm.user_id=? LIMIT 1").bind(dataset.organization_id,user.id,handoff.assigned_to).first();
    canRevoke=!!team;
   }
   if(!canRevoke||handoff.status==="REVOKED")return json({error:"Only the Owner or the assigned Team Leader can revoke this handoff."},403);
  }else if(status==="IN_PROGRESS"||status==="SUBMITTED"){
   if(handoff.assigned_to!==user.id||!["ASSIGNED","IN_PROGRESS","RETURNED"].includes(handoff.status))return json({error:"Only the assigned Analyst can start or submit this handoff."},403);
   if(status==="SUBMITTED"){
    if((handoff.stage==="SQL_REVIEW"||handoff.stage==="RECONCILIATION")&&!resultJson)return json({error:"Attach the internal SQL/QA result JSON before submitting this stage."},400);
    if(outputVersion>0){const version=await env.DB.prepare("SELECT id FROM dataset_versions WHERE dataset_id=? AND version_number=?").bind(datasetId,outputVersion).first();if(!version)return json({error:"The submitted output version does not exist."},400);}
    if(outputVersion<1&&!resultJson)return json({error:"Submit an internally saved dataset version or a structured result."},400);
   }
  }else{
   let reviewer=m.role==="OWNER";
   if(m.role==="LEADER"){
    const team=await env.DB.prepare("SELECT t.id FROM teams t JOIN team_members tm ON tm.team_id=t.id WHERE t.organization_id=? AND t.leader_user_id=? AND tm.user_id=? LIMIT 1").bind(dataset.organization_id,user.id,handoff.assigned_to).first();
    reviewer=!!team;
   }
   if(!reviewer||handoff.status!=="SUBMITTED")return json({error:"Only an Owner or the assigned Team Leader can review a submitted handoff."},403);
  }
  await env.DB.prepare("UPDATE dataset_handoffs SET status=?,output_version=CASE WHEN ?>0 THEN ? ELSE output_version END,result_json=COALESCE(?,result_json),review_note=CASE WHEN ?<>'' THEN ? ELSE review_note END,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(status,outputVersion,outputVersion,resultJson,reviewNote,reviewNote,handoffMatch[1]).run();
  await audit(env,dataset.organization_id,user.id,"DATASET_HANDOFF_"+status,handoffMatch[1],{datasetId,stage:handoff.stage,outputVersion:outputVersion||null,reviewNote});
  return json({message:"Handoff updated.",status});
 }
 if(sub==="download"&&req.method==="GET"){
  await audit(env,dataset.organization_id,user.id,"DATASET_EXPORT_DENIED",datasetId,{role:m.role,policy:"NO_DEVICE_DOWNLOADS"});
  return json({error:"Device downloads are disabled for every role. Use private internal datasets and handoffs inside Vyron."},403);
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
 if(sub.match(/^versions\/\d+\/preview$/)&&req.method==="GET"){
  const versionNumber=Number(sub.split("/")[1]);
  if(!Number.isInteger(versionNumber)||versionNumber<1)return json({error:"Invalid version number."},400);
  const version=await env.DB.prepare("SELECT version_number AS versionNumber,row_count AS rowCount,column_count AS columnCount,columns_json AS columnsJson,preview_json AS previewJson,change_note AS changeNote,created_at AS createdAt FROM dataset_versions WHERE dataset_id=? AND version_number=?").bind(datasetId,versionNumber).first<any>();
  if(!version)return json({error:"Dataset version not found."},404);
  return json({version:{versionNumber:version.versionNumber,rowCount:version.rowCount,columnCount:version.columnCount,columns:JSON.parse(version.columnsJson||"[]"),preview:JSON.parse(version.previewJson||"[]"),changeNote:version.changeNote,createdAt:version.createdAt}});
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
