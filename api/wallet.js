import { getServer, getWalletKeypair, requireAdmin, sendJson } from './_config.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { ok: false, error: 'Method not allowed' });
  }
  if (!requireAdmin(req, res)) return;

  try {
    const keypair = getWalletKeypair();
    const account = await getServer().loadAccount(keypair.publicKey());
    const native = account.balances.find((b) => b.asset_type === 'native');
    return sendJson(res, 200, {
      ok: true,
      publicKey: keypair.publicKey(),
      balance: native?.balance || '0'
    });
  } catch (error) {
    return sendJson(res, 500, { ok: false, error: error?.message || 'Could not load wallet.' });
  }
}
