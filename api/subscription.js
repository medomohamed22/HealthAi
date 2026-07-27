import { sendJson } from './_config.js';
const RPC=process.env.PI_RPC_URL||'https://rpc.testnet.minepi.com';
const CONTRACT='CCUF75B6W3HRJTJD6O7OXNI72HGJ7DERZ5MUNOMFMSK23ME5GUIKPFYV';
async function rpc(method,params={}){const r=await fetch(RPC,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});const d=await r.json();if(!r.ok||d.error)throw new Error(d.error?.message||`RPC ${r.status}`);return d.result;}
export default async function handler(req,res){
 if(req.method!=='GET') return sendJson(res,405,{ok:false,error:'Method not allowed'});
 try{const health=await rpc('getHealth');let ledger=null;try{ledger=await rpc('getLatestLedger')}catch{}return sendJson(res,200,{ok:true,rpc:RPC,contractId:CONTRACT,networkPassphrase:'Pi Testnet',health,ledger,notice:'PiRC2 is experimental Testnet software. User contract calls require a Soroban-capable wallet/CLI signature; Pi Apps SDK does not currently expose that signer.'});}catch(e){return sendJson(res,502,{ok:false,error:e.message,rpc:RPC,contractId:CONTRACT});}
}
