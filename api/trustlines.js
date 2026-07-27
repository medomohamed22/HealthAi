import { cors, json, server, getAsset, errorMessage } from './_config.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  try {
    const asset = getAsset();
    const found = new Map();
    let page = await server.operations().order('desc').limit(200).call();
    for (let pass = 0; pass < 12 && found.size < 10; pass++) {
      for (const op of page.records) {
        if (op.type !== 'change_trust' || op.asset_code !== asset.code || op.asset_issuer !== asset.issuer || String(op.limit) === '0.0000000') continue;
        const address = op.source_account;
        if (!found.has(address)) found.set(address, { address, createdAt: op.created_at, operationId: op.id, limit: op.limit });
        if (found.size >= 20) break;
      }
      if (found.size >= 10 || !page.records.length) break;
      page = await page.next();
    }
    const checked = [];
    for (const item of found.values()) {
      try {
        const account = await server.loadAccount(item.address);
        const line = account.balances.find(b => b.asset_code === asset.code && b.asset_issuer === asset.issuer);
        if (line) checked.push({ ...item, balance: line.balance, authorized: line.is_authorized !== false, clawbackEnabled: Boolean(line.is_clawback_enabled) });
      } catch {}
      if (checked.length >= 10) break;
    }
    json(res, 200, { records: checked, note: 'مرتبة حسب أحدث عملية Change Trust الظاهرة في سجل Horizon، مع استبعاد خطوط الثقة المحذوفة حاليًا.' });
  } catch (e) { json(res, 500, { error: errorMessage(e) }); }
}
