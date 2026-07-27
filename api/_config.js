import * as StellarSdk from '@stellar/stellar-sdk';

export const HORIZON_URL = process.env.PI_HORIZON_URL || 'https://api.testnet.minepi.com';
export const NETWORK_PASSPHRASE = process.env.PI_NETWORK_PASSPHRASE || 'Pi Testnet';

export function getServer() {
  return new StellarSdk.Horizon.Server(HORIZON_URL);
}

export function sendJson(res, status, data) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.end(JSON.stringify(data));
}

export function requirePost(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { ok: false, error: 'Method not allowed' });
    return false;
  }
  return true;
}

export function requireAdmin(req, res) {
  const expected = process.env.ADMIN_TOKEN;
  const supplied = req.headers['x-admin-token'];
  if (!expected) {
    sendJson(res, 500, { ok: false, error: 'ADMIN_TOKEN is not configured on the server.' });
    return false;
  }
  if (!supplied || supplied !== expected) {
    sendJson(res, 401, { ok: false, error: 'Invalid admin token.' });
    return false;
  }
  return true;
}

export function getWalletKeypair() {
  const secret = process.env.PI_WALLET_SECRET;
  if (!secret) throw new Error('PI_WALLET_SECRET is not configured.');
  const keypair = StellarSdk.Keypair.fromSecret(secret.trim());
  return keypair;
}

export function normalizeError(error) {
  const data = error?.response?.data;
  const resultCodes = data?.extras?.result_codes;
  return {
    message: data?.detail || data?.title || error?.message || 'Unexpected server error',
    resultCodes: resultCodes || null
  };
}
