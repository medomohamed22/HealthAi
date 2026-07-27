import { TransactionBuilder, Operation, Memo } from '@stellar/stellar-sdk';
import { cors, json, requireAdmin, server, getIssuer, getDistributor, getAsset, validAmount, NETWORK_PASSPHRASE, errorMessage, getDynamicBaseFee } from './_config.js';
export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  if (!requireAdmin(req, res)) return;
  try {
    const amount = validAmount(req.body?.amount); const issuer = getIssuer(); const distributor = getDistributor(); const asset = getAsset();
    const [source, fee] = await Promise.all([server.loadAccount(distributor.publicKey()), getDynamicBaseFee()]);
    const balance = Number(source.balances.find(b => b.asset_code === asset.code && b.asset_issuer === asset.issuer)?.balance || 0);
    if (Number(amount) > balance) throw new Error('رصيد حساب التوزيع غير كافٍ للحرق.');
    const tx = new TransactionBuilder(source, { fee, networkPassphrase: NETWORK_PASSPHRASE })
      .addOperation(Operation.payment({ destination: issuer.publicKey(), asset, amount }))
      .addMemo(Memo.text(String(req.body?.memo || 'Token burn').slice(0, 28))).setTimeout(60).build();
    tx.sign(distributor); const result = await server.submitTransaction(tx);
    json(res, 200, { ok: true, hash: result.hash, burned: amount });
  } catch (e) { json(res, 400, { error: errorMessage(e) }); }
}
