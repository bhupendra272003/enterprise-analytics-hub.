type Env={DB:D1Database};
type User={id:string;account_status:string};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
const getUser=async(req:Request,env:Env):Promise<User|null>=>{
 const raw=req.headers.get("Cookie")||"",sid=raw.split(";").map(v=>v.trim()).find(v=>v.startsWith("hub.sid="))?.slice(8);
 if(!sid)return null;
 return env.DB.prepare("SELECT u.id,u.account_status FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.expires_at>unixepoch()").bind(decodeURIComponent(sid)).first<User>();
};
export async function handleNotifications(req:Request,env:Env,path:string):Promise<Response|null>{
 if(path!=="/api/notifications"&&!path.startsWith("/api/notifications/"))return null;
 const user=await getUser(req,env);
 if(!user)return json({error:"Authentication required."},401);
 if(user.account_status==="SUSPENDED")return json({error:"This account has been suspended."},403);
 if(path==="/api/notifications"&&req.method==="GET"){
  const {results}=await env.DB.prepare("SELECT id,organization_id AS organizationId,type,title,message,href,read_at AS readAt,created_at AS createdAt FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100").bind(user.id).all();
  const count=await env.DB.prepare("SELECT COUNT(*) AS unreadCount FROM notifications WHERE user_id=? AND read_at IS NULL").bind(user.id).first<{unreadCount:number}>();
  return json({notifications:results,unreadCount:Number(count?.unreadCount||0)});
 }
 if(path==="/api/notifications/read-all"&&req.method==="PATCH"){
  await env.DB.prepare("UPDATE notifications SET read_at=CURRENT_TIMESTAMP WHERE user_id=? AND read_at IS NULL").bind(user.id).run();
  return json({message:"All notifications marked as read."});
 }
 const match=path.match(/^\/api\/notifications\/([^/]+)\/read$/);
 if(match&&req.method==="PATCH"){
  const result=await env.DB.prepare("UPDATE notifications SET read_at=COALESCE(read_at,CURRENT_TIMESTAMP) WHERE id=? AND user_id=?").bind(match[1],user.id).run();
  if(!result.meta.changes)return json({error:"Notification not found."},404);
  return json({message:"Notification marked as read."});
 }
 return json({error:"Not found."},404);
}
