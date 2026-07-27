import { getServer, sendJson } from './_config.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { ok: false, error: 'Method not allowed' });
  }

  try {
    const server = getServer();
    const page = await server.payments().order('desc').limit(100).call();
    const seen = new Set();
    const addresses = [];

    for (const record of page.records) {
      if (!['payment', 'create_account', 'path_payment_strict_receive', 'path_payment_strict_send'].includes(record.type)) continue;
      const candidates = [record.from, record.to, record.account, record.funder].filter(Boolean);
      for (const address of candidates) {
        if (!/^G[A-Z2-7]{55}$/.test(address) || seen.has(address)) continue;
        seen.add(address);
        addresses.push({
          address,
          operationType: record.type,
          createdAt: record.created_at,
          transactionHash: record.transaction_hash || null,
          pagingToken: record.paging_token
        });
        if (addresses.length === 10) break;
      }
      if (addresses.length === 10) break;
    }

    return sendJson(res, 200, {
      ok: true,
      network: 'Pi Testnet',
      horizon: 'https://api.testnet.minepi.com',
      addresses
    });
  } catch (error) {
    return sendJson(res, 502, { ok: false, error: error?.message || 'Could not read Pi Testnet.' });
  }
}
