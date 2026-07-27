import { sendJson } from './_config.js';
export default async function handler(req,res){
  if(req.method!=='POST') return sendJson(res,405,{ok:false,error:'Method not allowed'});
  const id=String(req.body?.paymentId||'').trim(),txid=String(req.body?.txid||'').trim(),key=process.env.PI_API_KEY;
  if(!id||!txid) return sendJson(res,400,{ok:false,error:'Missing paymentId or txid'});
  if(!key) return sendJson(res,500,{ok:false,error:'PI_API_KEY is not configured'});
  try{const r=await fetch(`https://api.minepi.com/v2/payments/${encodeURIComponent(id)}/complete`,{method:'POST',headers:{Authorization:`Key ${key}`,'Content-Type':'application/json'},body:JSON.stringify({txid})});const d=await r.json();return sendJson(res,r.status,r.ok?{ok:true,payment:d}:{ok:false,error:d?.error||'Completion failed',details:d});}catch(e){return sendJson(res,500,{ok:false,error:e.message});}
}
