import { parse } from "csv-parse/sync";
type Env={DB:D1Database;DATASETS:R2Bucket};
type User={id:string;account_status:string};
type Role="OWNER"|"ADMIN"|"MANAGER"|"ANALYST"|"VIEWER";
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
const getUser=async(req:Request,env:Env):Promise<User|null>=>{
 const raw=req.headers.get("Cookie")||"",sid=raw.split(";").map(v=>v.trim()).find(v=>v.startsWith("hub.sid="))?.slice(8);
 if(!sid)return null;
 return env.DB.prepare("SELECT u.id,u.account_status FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.expires_at>unixepoch()").bind(decodeURIComponent(sid)).first<User>();
};
const membership=async(env:Env,orgId:string,userId:string)=>env.DB.prepare("SELECT role FROM memberships WHERE organization_id=? AND user_id=? AND membership_status='ACTIVE'").bind(orgId,userId).first<{role:Role}>();
const audit=(env:Env,orgId:string,userId:string,action:string,id:string,metadata?:unknown)=>env.DB.prepare("INSERT INTO audit_logs (organization_id,actor_user_id,action,target_type,target_id,metadata) VALUES (?,?,?,'DATASET',?,?)").bind(orgId,userId,action,id,metadata===undefined?null:JSON.stringify(metadata)).run();
const parseCsv=(buffer:ArrayBuffer)=>{
 const records=parse(new TextDecoder().decode(new Uint8Array(buffer)),{columns:true,skip_empty_lines:true,bom:true,trim:true,relax_column_count:false,skip_records_with_error:false});
 if(!records.length)throw new Error("EMPTY");
 const columns=Object.keys(records[0]);
 if(!columns.length||columns.length>200||columns.some(c=>!c.trim()))throw new Error("HEADERS");
 return {records,columns,preview:records.slice(0,10).map((row:any)=>Object.fromEntries(columns.map(c=>[c,String(row[c]??"").slice(0,500)])))};
};
const allowed=(role:Role)=>["OWNER","ADMIN","MANAGER","ANALYST"].includes(role);
const isNum=(v:string)=>v.trim()!==""&&Number.isFinite(Number(v));
const csvEncode=(rows:Record<string,string>[],columns:string[])=>[columns,...rows.map(r=>columns.map(k=>r[k]??""))].map(row=>row.map(v=>{const s=String(v);return /[",\\r\\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}).join(",")).join("\\r\\n")+"\\r\\n";
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
  const orgId=orgList[1],m=await membership(env,orgId,user.id);if(!m||!allowed(m.role))return json({error:"Insufficient organization permissions."},403);
  let form:FormData;try{form=await req.formData();}catch{return json({error:"Choose a CSV file to upload."},400);}
  const file=form.get("file"),name=typeof form.get("name")==="string"?(form.get("name") as string).trim():"";
  if(!(file instanceof File)||!file.size||file.size>15*1024*1024||!file.name.toLowerCase().endsWith(".csv"))return json({error:"Choose a CSV file up to 15 MB."},400);
  if(name.length<2||name.length>120)return json({error:"Dataset name must be 2–120 characters."},400);
  let parsed;try{parsed=parseCsv(await file.arrayBuffer());}catch(e){return json({error:e instanceof Error&&e.message==="EMPTY"?"The CSV contains a header but no data rows.":"The CSV file is invalid. Check its header and row structure."},400);}
  const id=crypto.randomUUID(),key=orgId+"/"+id+"/v1.csv",bytes=await file.arrayBuffer();
  await env.DATASETS.put(key,bytes,{httpMetadata:{contentType:"text/csv"},customMetadata:{organizationId:orgId,datasetId:id,version:"1"}});
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
 if(sub==="clean"&&req.method==="POST"){
  if(!allowed(m.role))return json({error:"Your role cannot create cleaned dataset versions."},403);
  let body:any={};try{body=await req.json();}catch{return json({error:"Invalid cleaning options."},400);}
  const trimWhitespace=body.trimWhitespace!==false,removeDuplicates=body.removeDuplicates!==false,fillMissing=body.fillMissing??"none";
  if(!["none","zero","mean","median","mode"].includes(fillMissing))return json({error:"Unsupported missing-value strategy."},400);
  const source=await env.DATASETS.get(dataset.storage_path);if(!source)return json({error:"Stored dataset file is missing."},500);
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
  await env.DATASETS.put(key,bytes,{httpMetadata:{contentType:"text/csv"},customMetadata:{organizationId:dataset.organization_id,datasetId,version:String(version),cleaned:"true"}});
  const report={before,after,removedDuplicates,filledCells,fillStrategy:fillMissing,outliersByColumn,columns,preview:rows.slice(0,10)};
  try{await env.DB.batch([
   env.DB.prepare("INSERT INTO dataset_versions (id,dataset_id,version_number,storage_path,file_size,row_count,column_count,columns_json,preview_json,uploaded_by,change_note) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),datasetId,version,key,bytes.length,rows.length,columns.length,JSON.stringify(columns),JSON.stringify(report.preview),user.id,"Cloudflare cleaning · quality score "+before.qualityScore+" → "+after.qualityScore),
   env.DB.prepare("UPDATE datasets SET storage_path=?,file_size=?,row_count=?,column_count=?,columns_json=?,preview_json=?,uploaded_by=? WHERE id=?").bind(key,bytes.length,rows.length,columns.length,JSON.stringify(columns),JSON.stringify(report.preview),user.id,datasetId)
  ]);}catch{await env.DATASETS.delete(key);return json({error:"Cleaned dataset version could not be saved."},500);}
  await audit(env,dataset.organization_id,user.id,"DATASET_CLEANED",datasetId,{versionNumber:version,beforeScore:before.qualityScore,afterScore:after.qualityScore,removedDuplicates,filledCells});
  return json({versionNumber:version,report},201);
 }
 if(sub==="preview"&&req.method==="GET")return json({dataset:{id:dataset.id,name:dataset.name,columns:JSON.parse(dataset.columns_json),preview:JSON.parse(dataset.preview_json)}});
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
  if(!allowed(m.role))return json({error:"You do not have permission to upload a dataset version."},403);
  let form:FormData;try{form=await req.formData();}catch{return json({error:"Choose a CSV file for the new version."},400);}
  const file=form.get("file"),note=typeof form.get("changeNote")==="string"?(form.get("changeNote") as string).trim():"Source file updated";
  if(!(file instanceof File)||!file.size||file.size>15*1024*1024||!file.name.toLowerCase().endsWith(".csv"))return json({error:"Choose a CSV file up to 15 MB."},400);
  let parsed;try{parsed=parseCsv(await file.arrayBuffer());}catch{return json({error:"The CSV file is invalid. Check its header and row structure."},400);}
  const latest=await env.DB.prepare("SELECT COALESCE(MAX(version_number),0) AS v FROM dataset_versions WHERE dataset_id=?").bind(datasetId).first<{v:number}>();
  const version=Number(latest?.v||0)+1,key=dataset.organization_id+"/"+datasetId+"/v"+version+".csv",bytes=await file.arrayBuffer();
  await env.DATASETS.put(key,bytes,{httpMetadata:{contentType:"text/csv"},customMetadata:{organizationId:dataset.organization_id,datasetId,version:String(version)}});
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
  if(!allowed(m.role))return json({error:"You do not have permission to restore dataset versions."},403);
  const version=Number(sub.split("/")[1]);if(!Number.isInteger(version)||version<1)return json({error:"Invalid version number."},400);
  const source=await env.DB.prepare("SELECT * FROM dataset_versions WHERE dataset_id=? AND version_number=?").bind(datasetId,version).first<any>();
  if(!source)return json({error:"Version not found."},404);
  const latest=await env.DB.prepare("SELECT COALESCE(MAX(version_number),0) AS v FROM dataset_versions WHERE dataset_id=?").bind(datasetId).first<{v:number}>();
  const next=Number(latest?.v||0)+1,key=dataset.organization_id+"/"+datasetId+"/v"+next+".csv";
  const object=await env.DATASETS.get(source.storage_path);if(!object)return json({error:"Stored dataset version is missing."},500);
  await env.DATASETS.put(key,object.body,{httpMetadata:{contentType:"text/csv"},customMetadata:{organizationId:dataset.organization_id,datasetId,version:String(next)}});
  await env.DB.batch([
   env.DB.prepare("INSERT INTO dataset_versions (id,dataset_id,version_number,storage_path,file_size,row_count,column_count,columns_json,preview_json,uploaded_by,change_note) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),datasetId,next,key,source.file_size,source.row_count,source.column_count,source.columns_json,source.preview_json,user.id,"Restored from version "+version),
   env.DB.prepare("UPDATE datasets SET storage_path=?,file_size=?,row_count=?,column_count=?,columns_json=?,preview_json=?,uploaded_by=? WHERE id=?").bind(key,source.file_size,source.row_count,source.column_count,source.columns_json,source.preview_json,user.id,datasetId)
  ]);
  await audit(env,dataset.organization_id,user.id,"DATASET_VERSION_RESTORED",datasetId,{restoredFrom:version,newVersion:next});
  return json({restoredFrom:version,newVersion:next},201);
 }
 return null;
}
