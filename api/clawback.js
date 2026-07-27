import { TransactionBuilder, Operation, Memo, StrKey } from '@stellar/stellar-sdk';
import { cors, json, requireAdmin, server, getIssuer, getAsset, validAmount, findTrustline, availableBalance, NETWORK_PASSPHRASE, errorMessage, getDynamicBaseFee } from './_config.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  if (!requireAdmin(req, res)) return;
  try {
    const from = String(req.body?.from || '').trim();
    if (!StrKey.isValidEd25519PublicKey(from)) throw new Error('عنوان الحامل غير صالح.');
    const amount = validAmount(req.body?.amount);
    const issuer = getIssuer(); const asset = getAsset();
    if (from === issuer.publicKey()) throw new Error('لا يمكن تنفيذ Clawback من حساب Issuer.');
    const [source, holder, fee] = await Promise.all([server.loadAccount(issuer.publicKey()), server.loadAccount(from), getDynamicBaseFee()]);
    if (!source.flags?.auth_clawback_enabled || !source.flags?.auth_revocable) throw new Error('Clawback أو Revocable غير مفعّل على حساب Issuer.');
    const line = findTrustline(holder, asset);
    if (!line) throw new Error('الحساب لا يملك Trustline لهذا التوكن.');
    if (!line.is_clawback_enabled) throw new Error('Trustline الحالية غير قابلة للـClawback؛ غالبًا أُنشئت قبل تفعيل الخاصية.');
    const available = availableBalance(line);
    if (Number(amount) > available + 1e-9) throw new Error(`الكمية المتاحة للسحب ${available.toFixed(7)} فقط بعد خصم التزامات البيع.`);
    const tx = new TransactionBuilder(source, { fee, networkPassphrase: NETWORK_PASSPHRASE })
      .addOperation(Operation.clawback({ asset, from, amount }))
      .addMemo(Memo.text(String(req.body?.memo || 'Token clawback').slice(0, 28)))
      .setTimeout(60)
      .build();
    tx.sign(issuer);
    const result = await server.submitTransaction(tx);
    json(res, 200, { ok: true, hash: result.hash, from, clawedBack: amount, burned: true });
  } catch (e) { json(res, 400, { error: errorMessage(e) }); }
}
