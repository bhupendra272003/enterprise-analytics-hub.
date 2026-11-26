type Env = { DB: D1Database; DATASETS: KVNamespace };
type Role = "OWNER" | "MANAGER" | "LEADER" | "ANALYST";
type User = { id: string; account_status: string };
type NodeRow = { id: string; organization_id: string; parent_id: string | null; node_type: "FOLDER" | "FILE"; name: string; mime_type: string | null; storage_key: string | null; file_size: number; created_by: string; updated_by: string; created_at: string; updated_at: string };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_PREVIEW_BYTES = 100 * 1024;
const writable = (role: Role) => role !== "MANAGER";
const cleanName = (value: unknown) => typeof value === "string" ? value.replace(/[\\/]/g, "_").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 255) : "";
async function userFromRequest(request: Request, env: Env): Promise<User | null> {
  const cookie = request.headers.get("Cookie") || "";
  const raw = cookie.split(";").map(v => v.trim()).find(v => v.startsWith("hub.sid="))?.slice(8);
  if (!raw) return null;
  let sid: string; try { sid = decodeURIComponent(raw); } catch { return null; }
  return env.DB.prepare("SELECT u.id,u.account_status FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.expires_at>unixepoch() LIMIT 1").bind(sid).first<User>();
}
async function membership(env: Env, orgId: string, userId: string) {
  return env.DB.prepare("SELECT role FROM memberships WHERE organization_id=? AND user_id=? AND membership_status='ACTIVE'").bind(orgId,userId).first<{role:Role}>();
}
async function getNode(env: Env, id: string) {
  return env.DB.prepare("SELECT * FROM workspace_files WHERE id=?").bind(id).first<NodeRow>();
}
async function validParent(env: Env, orgId: string, parentId: string | null) {
  if (!parentId) return true;
  const parent = await env.DB.prepare("SELECT id FROM workspace_files WHERE id=? AND organization_id=? AND node_type='FOLDER'").bind(parentId,orgId).first();
  return !!parent;
}
async function audit(env: Env, orgId: string, userId: string, action: string, id: string, metadata?: unknown) {
  await env.DB.prepare("INSERT INTO audit_logs (organization_id,actor_user_id,action,target_type,target_id,metadata) VALUES (?,?,?,'FILE',?,?)").bind(orgId,userId,action,id,metadata===undefined?null:JSON.stringify(metadata)).run();
}
const isConflict = (error: unknown) => error instanceof Error && /UNIQUE constraint failed/i.test(error.message);
const nodeShape = (n: NodeRow) => ({ id:n.id, parentId:n.parent_id, type:n.node_type, name:n.name, mimeType:n.mime_type, fileSize:n.file_size, createdAt:n.created_at, updatedAt:n.updated_at });
export async function handleWorkspaceFiles(request: Request, env: Env, path: string, url: URL): Promise<Response | null> {
  const orgMatch = path.match(/^\/api\/organizations\/([^/]+)\/files(?:\/(.*))?$/);
  if (!orgMatch && !path.startsWith("/api/files/")) return null;
  const user = await userFromRequest(request,env);
  if (!user) return json({error:"Authentication required."},401);
  if (user.account_status === "SUSPENDED") return json({error:"This account has been suspended."},403);
  if (orgMatch) {
    const orgId=orgMatch[1], sub=orgMatch[2]||"", member=await membership(env,orgId,user.id);
    if (!member) return json({error:"Insufficient organization permissions."},403);
    if (request.method==="GET" && !sub) {
      const parentId=url.searchParams.get("parentId");
      if (parentId && !await validParent(env,orgId,parentId)) return json({error:"Folder not found."},404);
      const nodes=parentId
        ? await env.DB.prepare("SELECT * FROM workspace_files WHERE organization_id=? AND parent_id=? ORDER BY node_type DESC,name COLLATE NOCASE").bind(orgId,parentId).all<NodeRow>()
        : await env.DB.prepare("SELECT * FROM workspace_files WHERE organization_id=? AND parent_id IS NULL ORDER BY node_type DESC,name COLLATE NOCASE").bind(orgId).all<NodeRow>();
      const breadcrumbs: {id:string;name:string}[]=[];
      if(parentId){
        const trail=await env.DB.prepare("WITH RECURSIVE trail(id,parent_id,name,depth) AS (SELECT id,parent_id,name,0 FROM workspace_files WHERE id=? AND organization_id=? AND node_type='FOLDER' UNION ALL SELECT p.id,p.parent_id,p.name,t.depth+1 FROM workspace_files p JOIN trail t ON p.id=t.parent_id WHERE p.organization_id=? AND p.node_type='FOLDER' AND t.depth<50) SELECT id,name,depth FROM trail ORDER BY depth DESC").bind(parentId,orgId,orgId).all<{id:string;name:string;depth:number}>();
        breadcrumbs.push(...trail.results.map(({id,name})=>({id,name})));
      }
      if(url.searchParams.get("allFolders")==="1"){
        const all=await env.DB.prepare("SELECT id,name,parent_id AS parentId FROM workspace_files WHERE organization_id=? AND node_type='FOLDER' ORDER BY name COLLATE NOCASE LIMIT 1000").bind(orgId).all<{id:string;name:string;parentId:string|null}>();
        return json({nodes:nodes.results.map(nodeShape),breadcrumbs,folders:all.results});
      }
      return json({nodes:nodes.results.map(nodeShape),breadcrumbs});
    }
    if(sub==="folders" && request.method==="POST"){
      if(!writable(member.role))return json({error:"This role is read-only."},403);
      let body:any;try{body=await request.json();}catch{return json({error:"Invalid JSON body."},400);}
      const name=cleanName(body?.name),parentId=typeof body?.parentId==="string"&&body.parentId?body.parentId:null;
      if(!name||name==="."||name===".."||name.length>120||/[\\/]/.test(name))return json({error:"Folder name must be 1–120 characters and cannot contain path separators."},400);
      if(!await validParent(env,orgId,parentId))return json({error:"Parent folder not found."},404);
      const id=crypto.randomUUID();
      try{await env.DB.prepare("INSERT INTO workspace_files (id,organization_id,parent_id,node_type,name,mime_type,storage_key,file_size,created_by,updated_by) VALUES (?,?,?,'FOLDER',?,NULL,NULL,0,?,?)").bind(id,orgId,parentId,name,user.id,user.id).run();}
      catch(e){if(isConflict(e))return json({error:"A folder with that name already exists here."},409);return json({error:"Folder could not be created."},500);}
      await audit(env,orgId,user.id,"FILE_FOLDER_CREATED",id,{name,parentId});
      return json({folder:{id,parentId,type:"FOLDER",name,fileSize:0}},201);
    }
    if(sub==="upload" && request.method==="POST"){
      if(!writable(member.role))return json({error:"This role is read-only."},403);
      let form:FormData;try{form=await request.formData();}catch{return json({error:"Upload form is invalid."},400);}
      const file=form.get("file"),parentRaw=form.get("parentId");
      const parentId=typeof parentRaw==="string"&&parentRaw?parentRaw:null;
      if(!(file instanceof File)||file.size<1)return json({error:"Choose a non-empty file."},400);
      if(file.size>MAX_FILE_BYTES)return json({error:"Files are limited to 5 MB per upload."},413);
      const name=cleanName(file.name);
      if(!name||name==="."||name==="..")return json({error:"Invalid file name."},400);
      if(!await validParent(env,orgId,parentId))return json({error:"Parent folder not found."},404);
      const id=crypto.randomUUID(),storageKey="workspace/"+orgId+"/"+id;
      const mime=typeof file.type==="string"&&file.type.length<128&&!/[\\r\\n]/.test(file.type)?file.type:"application/octet-stream";
      const bytes=await file.arrayBuffer();
      try{await env.DATASETS.put(storageKey,bytes);}
      catch{return json({error:"File storage is unavailable."},503);}
      try{await env.DB.prepare("INSERT INTO workspace_files (id,organization_id,parent_id,node_type,name,mime_type,storage_key,file_size,created_by,updated_by) VALUES (?,?,?,'FILE',?,?,?,?,?,?)").bind(id,orgId,parentId,name,mime,storageKey,file.size,user.id,user.id).run();}
      catch(e){await env.DATASETS.delete(storageKey);if(isConflict(e))return json({error:"A file with that name already exists here."},409);return json({error:"File metadata could not be saved."},500);}
      await audit(env,orgId,user.id,"FILE_UPLOADED",id,{name,size:file.size,mime,parentId});
      return json({file:{id,parentId,type:"FILE",name,mimeType:mime,fileSize:file.size}},201);
    }
  }
  const fileMatch=path.match(/^\/api\/files\/([^/]+)(?:\/(preview|download|copy))?$/);
  if(!fileMatch)return null;
  const id=fileMatch[1],sub=fileMatch[2]||"",node=await getNode(env,id);
  if(!node)return json({error:"File or folder not found."},404);
  const member=await membership(env,node.organization_id,user.id);
  if(!member)return json({error:"Insufficient organization permissions."},403);
  if(sub==="preview" && request.method==="GET"){
    if(node.node_type!=="FILE")return json({error:"Folders cannot be previewed."},400);
    if(node.file_size>MAX_PREVIEW_BYTES)return json({error:"Preview is limited to 100 KB. Download the file instead."},413);
    const textPreview=["text/plain","text/csv","text/markdown","application/json","application/xml","text/xml","text/sql"].includes(node.mime_type||"")||/\.(txt|csv|md|json|xml|sql|log)$/i.test(node.name);
    if(!textPreview)return json({error:"Preview is available only for text, CSV, JSON, Markdown, XML and SQL files."},415);
    const bytes=await env.DATASETS.get(node.storage_key!,"arrayBuffer");
    if(!bytes)return json({error:"Stored file is unavailable."},410);
    return new Response(new TextDecoder().decode(bytes),{headers:{"content-type":"text/plain; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});
  }
  if(sub==="download" && request.method==="GET"){
    if(node.node_type!=="FILE")return json({error:"Folders cannot be downloaded."},400);
    const bytes=await env.DATASETS.get(node.storage_key!,"arrayBuffer");
    if(!bytes)return json({error:"Stored file is unavailable."},410);
    const name=node.name.replace(/["\\\\]/g,"_");
    return new Response(bytes,{headers:{"content-type":node.mime_type||"application/octet-stream","content-disposition":"attachment; filename=\""+name+"\"; filename*=UTF-8''"+encodeURIComponent(node.name),"content-length":String(node.file_size),"cache-control":"no-store","x-content-type-options":"nosniff"}});
  }
  if(sub==="copy" && request.method==="POST"){
    if(!writable(member.role))return json({error:"This role is read-only."},403);
    if(node.node_type!=="FILE")return json({error:"Folder copy is not supported yet. Copy files only."},400);
    let body:any={};try{body=await request.json();}catch{return json({error:"Invalid JSON body."},400);}
    const name=cleanName(body?.name)||cleanName(node.name+" (copy)");
    const parentId=body?.parentId===undefined?node.parent_id:(typeof body.parentId==="string"&&body.parentId?body.parentId:null);
    if(!name||name==="."||name===".."||name.length>255)return json({error:"Invalid copy name."},400);
    if(!await validParent(env,node.organization_id,parentId))return json({error:"Parent folder not found."},404);
    const bytes=await env.DATASETS.get(node.storage_key!,"arrayBuffer");if(!bytes)return json({error:"Stored file is unavailable."},410);
    const copyId=crypto.randomUUID(),key="workspace/"+node.organization_id+"/"+copyId;
    try{await env.DATASETS.put(key,bytes);}catch{return json({error:"File storage is unavailable."},503);}
    try{await env.DB.prepare("INSERT INTO workspace_files (id,organization_id,parent_id,node_type,name,mime_type,storage_key,file_size,created_by,updated_by) VALUES (?,?,?,'FILE',?,?,?,?,?,?)").bind(copyId,node.organization_id,parentId,name,node.mime_type,key,node.file_size,user.id,user.id).run();}
    catch(e){await env.DATASETS.delete(key);if(isConflict(e))return json({error:"A file with that name already exists here."},409);return json({error:"File copy could not be saved."},500);}
    await audit(env,node.organization_id,user.id,"FILE_COPIED",copyId,{sourceId:id,name,parentId});
    return json({file:{id:copyId,parentId,type:"FILE",name,mimeType:node.mime_type,fileSize:node.file_size}},201);
  }
  if(request.method==="PATCH"){
    if(!writable(member.role))return json({error:"This role is read-only."},403);
    let body:any;try{body=await request.json();}catch{return json({error:"Invalid JSON body."},400);}
    const name=body?.name===undefined?node.name:cleanName(body.name);
    const parentId=body?.parentId===undefined?node.parent_id:(typeof body.parentId==="string"&&body.parentId?body.parentId:null);
    if(!name||name==="."||name===".."||name.length>255||/[\\/]/.test(name))return json({error:"Invalid name."},400);
    if(!await validParent(env,node.organization_id,parentId))return json({error:"Parent folder not found."},404);
    if(node.node_type==="FOLDER"&&parentId){
      const descendant=await env.DB.prepare("WITH RECURSIVE descendants(id) AS (SELECT id FROM workspace_files WHERE id=? UNION ALL SELECT f.id FROM workspace_files f JOIN descendants d ON f.parent_id=d.id WHERE f.node_type='FOLDER') SELECT id FROM descendants WHERE id=? LIMIT 1").bind(node.id,parentId).first<{id:string}>();
      if(descendant)return json({error:"A folder cannot be moved into itself or one of its descendants."},400);
    }
    try{await env.DB.prepare("UPDATE workspace_files SET name=?,parent_id=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(name,parentId,user.id,id).run();}
    catch(e){if(isConflict(e))return json({error:"An item with that name already exists in the destination."},409);return json({error:"File or folder could not be updated."},500);}
    await audit(env,node.organization_id,user.id,"FILE_RENAMED_OR_MOVED",id,{name,parentId});
    return json({node:{id,parentId,type:node.node_type,name,mimeType:node.mime_type,fileSize:node.file_size}});
  }
  if(request.method==="DELETE"){
    if(!writable(member.role))return json({error:"This role is read-only."},403);
    if(node.node_type==="FOLDER"){
      const count=await env.DB.prepare("SELECT COUNT(*) AS count FROM workspace_files WHERE parent_id=?").bind(id).first<{count:number}>();
      if(Number(count?.count||0)>0)return json({error:"Folder is not empty. Move or delete its contents first."},409);
    }else await env.DATASETS.delete(node.storage_key!);
    await env.DB.prepare("DELETE FROM workspace_files WHERE id=?").bind(id).run();
    await audit(env,node.organization_id,user.id,"FILE_DELETED",id,{name:node.name,type:node.node_type});
    return json({message:"Item deleted."});
  }
  return json({error:"Not found."},404);
}
