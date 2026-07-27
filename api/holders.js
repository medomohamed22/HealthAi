import { cors, json, requireAdmin, getAsset, horizonJson, findTrustline, availableBalance, errorMessage } from './_config.js';

function compareDecimalDesc(a, b) { return Number(b.balance) - Number(a.balance); }
export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  if (!requireAdmin(req, res)) return;
  try {
    const asset = getAsset();
    const maxPages = Math.min(Math.max(Number(req.query?.pages || 5), 1), 50);
    let url = `/accounts?asset=${encodeURIComponent(`${asset.code}:${asset.issuer}`)}&order=asc&limit=200`;
    const holders = []; let pages = 0;
    while (url && pages < maxPages) {
      const page = await horizonJson(url); pages++;
      for (const account of page?._embedded?.records || []) {
        if (account.account_id === asset.issuer) continue;
        const line = findTrustline(account, asset);
        if (!line) continue;
        holders.push({
          address: account.account_id,
          balance: line.balance,
          buyingLiabilities: line.buying_liabilities || '0.0000000',
          sellingLiabilities: line.selling_liabilities || '0.0000000',
          available: availableBalance(line).toFixed(7),
          limit: line.limit,
          authorized: line.is_authorized !== false,
          authorizedToMaintainLiabilities: Boolean(line.is_authorized_to_maintain_liabilities),
          clawbackEnabled: Boolean(line.is_clawback_enabled),
          lastModifiedLedger: account.last_modified_ledger
        });
      }
      const next = page?._links?.next?.href;
      const records = page?._embedded?.records || [];
      url = records.length === 200 && next ? next : null;
    }
    holders.sort(compareDecimalDesc);
    json(res, 200, {
      records: holders,
      count: holders.length,
      pagesScanned: pages,
      truncated: Boolean(url),
      note: 'مرتبة حسب الرصيد من الأكبر إلى الأصغر. المتاح للسحب يستبعد Selling Liabilities.'
    });
  } catch (e) { json(res, 500, { error: errorMessage(e) }); }
}
