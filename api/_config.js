import { Horizon, Keypair, Asset } from '@stellar/stellar-sdk';

export const HORIZON_URL = String(process.env.PI_HORIZON_URL || 'https://api.testnet.minepi.com').replace(/\/$/, '');
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
export function getAdminReceiverAddress() {
  const configured = String(process.env.ADMIN_RECEIVER_ADDRESS || '').trim();
  if (configured) return configured;
  return getDistributor().publicKey();
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
export function findTrustline(account, asset) {
  return account?.balances?.find(b => b.asset_code === asset.code && b.asset_issuer === asset.issuer);
}
export function availableBalance(line) {
  return Math.max(0, Number(line?.balance || 0) - Number(line?.selling_liabilities || 0));
}
export async function horizonJson(urlOrPath, timeoutMs = 15000) {
  const url = /^https?:\/\//i.test(urlOrPath) ? urlOrPath : `${HORIZON_URL}${urlOrPath}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.detail || data?.title || `Horizon HTTP ${response.status}`);
    return data;
  } finally { clearTimeout(timer); }
}

export async function getDynamicBaseFee() {
  // TransactionBuilder expects a per-operation maximum fee in stroops.
  // Pi Testnet can raise the accepted fee above Stellar SDK's static BASE_FEE.
  const candidates = [];
  try {
    const fetched = Number(await server.fetchBaseFee());
    if (Number.isFinite(fetched) && fetched > 0) candidates.push(fetched);
  } catch {}
  try {
    const stats = await horizonJson('/fee_stats', 10000);
    const charged = stats?.fee_charged || {};
    const maxFee = stats?.max_fee || {};
    for (const value of [
      stats?.last_ledger_base_fee,
      charged.mode, charged.p90, charged.p95, charged.p99, charged.max,
      maxFee.mode, maxFee.p90, maxFee.p95, maxFee.p99
    ]) {
      const n = Number(value);
      if (Number.isFinite(n) && n > 0) candidates.push(n);
    }
  } catch {}
  const observed = candidates.length ? Math.max(...candidates) : 100000;
  // 2x headroom avoids tx_insufficient_fee during temporary fee pressure.
  return String(Math.max(100000, Math.ceil(observed * 2)));
}

export function errorMessage(error) {
  const result = error?.response?.data?.extras?.result_codes;
  if (result) return `${error.message}: ${JSON.stringify(result)}`;
  if (error?.name === 'AbortError') return 'انتهت مهلة الاتصال بـ Horizon.';
  return error?.message || 'خطأ غير معروف';
}
