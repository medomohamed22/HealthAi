import { sendJson } from './_config.js';
export default async function handler(req,res){
  if(req.method!=='POST') return sendJson(res,405,{ok:false,error:'Method not allowed'});
  const token=String(req.body?.accessToken||'').trim();
  if(!token) return sendJson(res,400,{ok:false,error:'Missing access token'});
  try{
    const r=await fetch('https://api.minepi.com/v2/me',{headers:{Authorization:`Bearer ${token}`}});
    const data=await r.json();
    if(!r.ok) return sendJson(res,r.status,{ok:false,error:data?.error||'Pi authentication failed'});
    return sendJson(res,200,{ok:true,user:data});
  }catch(e){return sendJson(res,500,{ok:false,error:e.message});}
}
