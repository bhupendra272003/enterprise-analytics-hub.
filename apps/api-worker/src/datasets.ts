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
 const records=parse(new Uint8Array(buffer),{columns:true,skip_empty_lines:true,bom:true,trim:true,relax_column_count:false,skip_records_with_error:false});
 if(!records.length)throw new Error("EMPTY");
 const columns=Object.keys(records[0]);
 if(!columns.length||columns.length>200||columns.some(c=>!c.trim()))throw new Error("HEADERS");
 return {records,columns,preview:records.slice(0,10).map((row:any)=>Object.fromEntries(columns.map(c=>[c,String(row[c]??"").slice(0,500)])))};
};
const allowed=(role:Role)=>["OWNER","ADMIN","MANAGER","ANALYST"].includes(role);
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
