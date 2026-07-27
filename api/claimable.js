import { TransactionBuilder, Operation, Memo, StrKey, Keypair, Claimant } from '@stellar/stellar-sdk';
import { cors, json, requireAdmin, server, getDistributor, getAsset, validAmount, findTrustline, availableBalance, NETWORK_PASSPHRASE, errorMessage, getDynamicBaseFee } from './_config.js';

function validBalanceId(value) {
  const id = String(value || '').trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(id)) throw new Error('معرّف الرصيد القابل للمطالبة يجب أن يكون 64 خانة hex.');
  return id;
}
function unlockTimestamp(value) {
  const ms = Date.parse(String(value || ''));
  if (!Number.isFinite(ms)) throw new Error('وقت الاستلام غير صالح.');
  const seconds = Math.floor(ms / 1000);
  if (seconds <= Math.floor(Date.now() / 1000) + 30) throw new Error('وقت الاستلام يجب أن يكون بعد الوقت الحالي بأكثر من 30 ثانية.');
  return String(seconds);
}
function claimantCanClaimAfter(destination, unixSeconds) {
  return new Claimant(destination, Claimant.predicateNot(Claimant.predicateBeforeAbsoluteTime(unixSeconds)));
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  const action = String(req.method === 'GET' ? req.query?.action || 'list' : req.body?.action || '').trim().toLowerCase();
  try {
    if (req.method === 'POST' && action === 'create') {
      if (!requireAdmin(req, res)) return;
      const destination = String(req.body?.destination || '').trim();
      if (!StrKey.isValidEd25519PublicKey(destination)) throw new Error('عنوان المحفظة المستلمة غير صالح.');
      const amount = validAmount(req.body?.amount);
      const unlockAt = unlockTimestamp(req.body?.unlockAt);
      const distributor = getDistributor(); const asset = getAsset();
      const [source, recipient, fee] = await Promise.all([
        server.loadAccount(distributor.publicKey()), server.loadAccount(destination), getDynamicBaseFee()
      ]);
      const line = findTrustline(recipient, asset);
      if (!line || line.is_authorized === false) throw new Error('المحفظة المستلمة لا تملك Trustline صالحًا لهذا التوكن.');
      const sourceLine = findTrustline(source, asset);
      if (!sourceLine || Number(amount) > availableBalance(sourceLine) + 1e-9) throw new Error('رصيد الموزع المتاح غير كافٍ.');
      const tx = new TransactionBuilder(source, { fee, networkPassphrase: NETWORK_PASSPHRASE })
        .addOperation(Operation.createClaimableBalance({ asset, amount, claimants: [claimantCanClaimAfter(destination, unlockAt)] }))
        .addMemo(Memo.text(String(req.body?.memo || 'Delayed token').slice(0, 28))).setTimeout(90).build();
      tx.sign(distributor);
      const result = await server.submitTransaction(tx);
      json(res, 200, { ok: true, hash: result.hash, destination, amount, unlockAt: new Date(Number(unlockAt) * 1000).toISOString() });
      return;
    }

    if (req.method === 'POST' && action === 'claim') {
      const secret = String(req.body?.claimantSecret || '').trim();
      let claimant;
      try { claimant = Keypair.fromSecret(secret); } catch { throw new Error('المفتاح السري للمستلم غير صالح.'); }
      const balanceId = validBalanceId(req.body?.balanceId);
      const [source, fee] = await Promise.all([server.loadAccount(claimant.publicKey()), getDynamicBaseFee()]);
      const tx = new TransactionBuilder(source, { fee, networkPassphrase: NETWORK_PASSPHRASE })
        .addOperation(Operation.claimClaimableBalance({ balanceId }))
        .addMemo(Memo.text('Claim delayed token')).setTimeout(60).build();
      tx.sign(claimant);
      const result = await server.submitTransaction(tx);
      json(res, 200, { ok: true, hash: result.hash, claimant: claimant.publicKey(), balanceId });
      return;
    }

    if (req.method === 'GET' && action === 'list') {
      const claimant = String(req.query?.claimant || '').trim();
      if (!StrKey.isValidEd25519PublicKey(claimant)) throw new Error('عنوان المطالب غير صالح.');
      const asset = getAsset();
      const page = await server.claimableBalances().claimant(claimant).limit(200).order('desc').call();
      const records = page.records.filter(x => x.asset === `${asset.code}:${asset.issuer}`).map(x => ({
        id: x.id, amount: x.amount, asset: x.asset, sponsor: x.sponsor || null,
        lastModifiedTime: x.last_modified_time, claimants: x.claimants
      }));
      json(res, 200, { ok: true, claimant, count: records.length, records });
      return;
    }

    json(res, 405, { error: 'استخدم POST مع action=create أو action=claim، أو GET مع action=list.' });
  } catch (e) { json(res, 400, { error: errorMessage(e) }); }
}
