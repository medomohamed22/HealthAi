import { TransactionBuilder, Operation, Memo, AuthClawbackEnabledFlag, AuthRevocableFlag } from '@stellar/stellar-sdk';
import { cors, json, requireAdmin, server, getIssuer, NETWORK_PASSPHRASE, errorMessage, getDynamicBaseFee } from './_config.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  if (!requireAdmin(req, res)) return;
  try {
    if (req.body?.confirmation !== 'ENABLE CLAWBACK') throw new Error('اكتب ENABLE CLAWBACK للتأكيد.');
    const issuer = getIssuer();
    const source = await server.loadAccount(issuer.publicKey());
    const fee = await getDynamicBaseFee();
    if (source.flags?.auth_immutable) throw new Error('حساب Issuer عليه AUTH_IMMUTABLE؛ لا يمكن تعديل صلاحياته.');
    if (source.flags?.auth_clawback_enabled && source.flags?.auth_revocable) {
      return json(res, 200, { ok: true, alreadyEnabled: true, flags: source.flags });
    }
    const master = source.signers.find(s => s.key === issuer.publicKey());
    if (!master || Number(master.weight) < Number(source.thresholds.med_threshold)) throw new Error('مفتاح Issuer لا يملك الوزن المطلوب لتنفيذ Set Options.');
    const tx = new TransactionBuilder(source, { fee, networkPassphrase: NETWORK_PASSPHRASE })
      .addOperation(Operation.setOptions({ setFlags: AuthRevocableFlag | AuthClawbackEnabledFlag }))
      .addMemo(Memo.text('Enable asset clawback'))
      .setTimeout(60)
      .build();
    tx.sign(issuer);
    const result = await server.submitTransaction(tx);
    json(res, 200, {
      ok: true,
      hash: result.hash,
      futureTrustlinesOnly: true,
      message: 'تم تفعيل Revocable وClawback. خطوط الثقة الجديدة فقط سترث قابلية السحب تلقائيًا.'
    });
  } catch (e) { json(res, 400, { error: errorMessage(e) }); }
}
