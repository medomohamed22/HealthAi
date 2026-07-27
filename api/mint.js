import { TransactionBuilder, Operation, Memo } from '@stellar/stellar-sdk';
import { cors, json, requireAdmin, server, getIssuer, getDistributor, getAsset, validAmount, NETWORK_PASSPHRASE, errorMessage, getDynamicBaseFee } from './_config.js';
export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  if (!requireAdmin(req, res)) return;
  try {
    const amount = validAmount(req.body?.amount); const issuer = getIssuer(); const distributor = getDistributor(); const asset = getAsset();
    const distAccount = await server.loadAccount(distributor.publicKey());
    if (!distAccount.balances.some(b => b.asset_code === asset.code && b.asset_issuer === asset.issuer)) throw new Error('حساب التوزيع لا يملك Trustline لهذا التوكن.');
    const [source, fee] = await Promise.all([server.loadAccount(issuer.publicKey()), getDynamicBaseFee()]);
    const tx = new TransactionBuilder(source, { fee, networkPassphrase: NETWORK_PASSPHRASE })
      .addOperation(Operation.payment({ destination: distributor.publicKey(), asset, amount }))
      .addMemo(Memo.text(String(req.body?.memo || 'Token issuance').slice(0, 28))).setTimeout(60).build();
    tx.sign(issuer); const result = await server.submitTransaction(tx);
    json(res, 200, { ok: true, hash: result.hash, amount, destination: distributor.publicKey() });
  } catch (e) { json(res, 400, { error: errorMessage(e) }); }
}
