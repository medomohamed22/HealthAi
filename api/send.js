import { TransactionBuilder, Operation, Memo, BASE_FEE, StrKey } from '@stellar/stellar-sdk';
import { cors, json, requireAdmin, server, getDistributor, getAsset, validAmount, NETWORK_PASSPHRASE, errorMessage } from './_config.js';
export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  if (!requireAdmin(req, res)) return;
  try {
    const amount = validAmount(req.body?.amount); const asset = getAsset(); const distributor = getDistributor();
    const recipients = [...new Set((req.body?.recipients || []).map(x => String(x).trim()))];
    if (!recipients.length || recipients.length > 50) throw new Error('اختر من 1 إلى 50 عنوانًا.');
    for (const address of recipients) if (!StrKey.isValidEd25519PublicKey(address)) throw new Error(`عنوان غير صالح: ${address}`);
    const checks = await Promise.all(recipients.map(async address => {
      const a = await server.loadAccount(address); const line = a.balances.find(b => b.asset_code === asset.code && b.asset_issuer === asset.issuer);
      return { address, valid: Boolean(line && line.is_authorized !== false) };
    }));
    const invalid = checks.filter(x => !x.valid).map(x => x.address); if (invalid.length) throw new Error(`لا يوجد Trustline صالح للعناوين: ${invalid.join(', ')}`);
    const source = await server.loadAccount(distributor.publicKey());
    let builder = new TransactionBuilder(source, { fee: String(Number(BASE_FEE) * recipients.length), networkPassphrase: NETWORK_PASSPHRASE });
    for (const destination of recipients) builder = builder.addOperation(Operation.payment({ destination, asset, amount }));
    const tx = builder.addMemo(Memo.text(String(req.body?.memo || 'Token reward').slice(0, 28))).setTimeout(90).build();
    tx.sign(distributor); const result = await server.submitTransaction(tx);
    json(res, 200, { ok: true, hash: result.hash, amountEach: amount, recipients: recipients.length });
  } catch (e) { json(res, 400, { error: errorMessage(e) }); }
}
