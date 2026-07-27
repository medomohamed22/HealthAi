import * as StellarSdk from '@stellar/stellar-sdk';
import {
  NETWORK_PASSPHRASE,
  getServer,
  getWalletKeypair,
  normalizeError,
  requireAdmin,
  requirePost,
  sendJson
} from './_config.js';

const ADDRESS_RE = /^G[A-Z2-7]{55}$/;
const AMOUNT_RE = /^\d+(?:\.\d{1,7})?$/;

function parseBody(req) {
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  return req.body || {};
}

export default async function handler(req, res) {
  if (!requirePost(req, res) || !requireAdmin(req, res)) return;

  try {
    const body = parseBody(req);
    const rawAddresses = Array.isArray(body.addresses) ? body.addresses : [];
    const addresses = [...new Set(rawAddresses.map((x) => String(x).trim().toUpperCase()))];
    const amount = String(body.amount ?? '').trim();
    const memo = String(body.memo ?? '').trim();

    if (addresses.length < 1 || addresses.length > 10) {
      return sendJson(res, 400, { ok: false, error: 'Choose between 1 and 10 unique addresses.' });
    }
    if (addresses.some((address) => !ADDRESS_RE.test(address))) {
      return sendJson(res, 400, { ok: false, error: 'One or more wallet addresses are invalid.' });
    }
    if (!AMOUNT_RE.test(amount) || Number(amount) <= 0) {
      return sendJson(res, 400, { ok: false, error: 'Amount must be positive with at most 7 decimals.' });
    }
    if (memo.length > 28) {
      return sendJson(res, 400, { ok: false, error: 'Text memo must not exceed 28 UTF-8 bytes.' });
    }
    if (Buffer.byteLength(memo, 'utf8') > 28) {
      return sendJson(res, 400, { ok: false, error: 'Memo exceeds the 28-byte network limit.' });
    }

    const server = getServer();
    const keypair = getWalletKeypair();
    if (addresses.includes(keypair.publicKey())) {
      return sendJson(res, 400, { ok: false, error: 'The sender wallet cannot be one of the recipients.' });
    }

    const source = await server.loadAccount(keypair.publicKey());
    const fee = await server.fetchBaseFee();
    const timebounds = await server.fetchTimebounds(120);
    let builder = new StellarSdk.TransactionBuilder(source, {
      fee: String(fee),
      networkPassphrase: NETWORK_PASSPHRASE,
      timebounds
    });

    for (const destination of addresses) {
      builder = builder.addOperation(StellarSdk.Operation.payment({
        destination,
        asset: StellarSdk.Asset.native(),
        amount
      }));
    }
    if (memo) builder = builder.addMemo(StellarSdk.Memo.text(memo));

    const transaction = builder.build();
    transaction.sign(keypair);
    const result = await server.submitTransaction(transaction);

    return sendJson(res, 200, {
      ok: true,
      hash: result.hash || result.id,
      ledger: result.ledger,
      recipients: addresses.length,
      amountEach: amount,
      totalAmount: (Number(amount) * addresses.length).toFixed(7).replace(/0+$/, '').replace(/\.$/, ''),
      memo
    });
  } catch (error) {
    const normalized = normalizeError(error);
    return sendJson(res, 500, { ok: false, error: normalized.message, resultCodes: normalized.resultCodes });
  }
}
