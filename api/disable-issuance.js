import { TransactionBuilder, Operation, Memo, BASE_FEE } from '@stellar/stellar-sdk';
import { cors, json, requireAdmin, server, getIssuer, NETWORK_PASSPHRASE, errorMessage } from './_config.js';
export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  if (!requireAdmin(req, res)) return;
  try {
    if (req.body?.confirmation !== 'DISABLE ISSUANCE FOREVER') throw new Error('اكتب عبارة التأكيد المطلوبة بالضبط.');
    const issuer = getIssuer(); const source = await server.loadAccount(issuer.publicKey());
    const extras = source.signers.filter(s => s.key !== issuer.publicKey() && Number(s.weight) > 0);
    let builder = new TransactionBuilder(source, { fee: String(Number(BASE_FEE) * (extras.length + 1)), networkPassphrase: NETWORK_PASSPHRASE });
    for (const signer of extras) {
      if (signer.type !== 'ed25519_public_key') throw new Error('يوجد signer غير Ed25519. أزله يدويًا قبل التعطيل النهائي.');
      builder = builder.addOperation(Operation.setOptions({ signer: { ed25519PublicKey: signer.key, weight: 0 } }));
    }
    builder = builder.addOperation(Operation.setOptions({ masterWeight: 0 }));
    const tx = builder.addMemo(Memo.text('Issuance disabled forever')).setTimeout(60).build();
    tx.sign(issuer); const result = await server.submitTransaction(tx);
    json(res, 200, { ok: true, hash: result.hash, irreversible: true, removedSigners: extras.length });
  } catch (e) { json(res, 400, { error: errorMessage(e) }); }
}
