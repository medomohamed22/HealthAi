import { Horizon, Keypair, Networks, Asset } from '@stellar/stellar-sdk';

export const HORIZON_URL = process.env.PI_HORIZON_URL || 'https://api.testnet.minepi.com';
export const NETWORK_PASSPHRASE = process.env.PI_NETWORK_PASSPHRASE || 'Pi Testnet';
export const TOKEN_CODE = String(process.env.TOKEN_CODE || '').trim().toUpperCase();
export const server = new Horizon.Server(HORIZON_URL);

export function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
export function cors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(204).end(); return true; }
  return false;
}
export function requireAdmin(req, res) {
  const expected = process.env.ADMIN_TOKEN;
  const supplied = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!expected || supplied !== expected) {
    json(res, 401, { error: 'رمز الإدارة غير صحيح.' });
    return false;
  }
  return true;
}
export function getIssuer() {
  if (!process.env.TOKEN_ISSUER_SECRET) throw new Error('TOKEN_ISSUER_SECRET غير مضبوط.');
  return Keypair.fromSecret(process.env.TOKEN_ISSUER_SECRET);
}
export function getDistributor() {
  if (!process.env.TOKEN_DISTRIBUTOR_SECRET) throw new Error('TOKEN_DISTRIBUTOR_SECRET غير مضبوط.');
  return Keypair.fromSecret(process.env.TOKEN_DISTRIBUTOR_SECRET);
}
export function getAsset() {
  if (!TOKEN_CODE || !/^[A-Z0-9]{1,12}$/.test(TOKEN_CODE)) throw new Error('TOKEN_CODE غير صالح.');
  return new Asset(TOKEN_CODE, getIssuer().publicKey());
}
export function validAmount(value) {
  const s = String(value ?? '').trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,7})?$/.test(s) || Number(s) <= 0) throw new Error('الكمية يجب أن تكون موجبة وبحد أقصى 7 منازل عشرية.');
  return s;
}
export function errorMessage(error) {
  const result = error?.response?.data?.extras?.result_codes;
  return result ? `${error.message}: ${JSON.stringify(result)}` : (error?.message || 'خطأ غير معروف');
}
