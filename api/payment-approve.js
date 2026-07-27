import { sendJson } from './_config.js';
export default async function handler(req,res){
  if(req.method!=='POST') return sendJson(res,405,{ok:false,error:'Method not allowed'});
  const id=String(req.body?.paymentId||'').trim(), key=process.env.PI_API_KEY;
  if(!id) return sendJson(res,400,{ok:false,error:'Missing paymentId'});
  if(!key) return sendJson(res,500,{ok:false,error:'PI_API_KEY is not configured'});
  try{const r=await fetch(`https://api.minepi.com/v2/payments/${encodeURIComponent(id)}/approve`,{method:'POST',headers:{Authorization:`Key ${key}`}});const d=await r.json();return sendJson(res,r.status,r.ok?{ok:true,payment:d}:{ok:false,error:d?.error||'Approval failed',details:d});}catch(e){return sendJson(res,500,{ok:false,error:e.message});}
}
