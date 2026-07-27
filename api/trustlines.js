import { cors, json, requireAdmin, getAsset, getDistributor, getAdminReceiverAddress, horizonJson, findTrustline, availableBalance, errorMessage } from './_config.js';

function compareAddress(a, b) { return a.address.localeCompare(b.address); }

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  if (!requireAdmin(req, res)) return;
  try {
    const asset = getAsset();
    const distributor = getDistributor().publicKey();
    const adminReceiver = getAdminReceiverAddress();
    const excluded = new Set([asset.issuer, distributor, adminReceiver]);
    let url = `/accounts?asset=${encodeURIComponent(`${asset.code}:${asset.issuer}`)}&order=asc&limit=200`;
    const records = [];
    let pages = 0;

    while (url) {
      const page = await horizonJson(url, 30000);
      pages++;
      const accounts = page?._embedded?.records || [];
      for (const account of accounts) {
        const line = findTrustline(account, asset);
        if (!line || excluded.has(account.account_id)) continue;
        records.push({
          address: account.account_id,
          balance: line.balance,
          available: availableBalance(line).toFixed(7),
          sellingLiabilities: line.selling_liabilities || '0.0000000',
          limit: line.limit,
          authorized: line.is_authorized !== false,
          clawbackEnabled: Boolean(line.is_clawback_enabled),
          lastModifiedLedger: account.last_modified_ledger
        });
      }
      const next = page?._links?.next?.href;
      url = accounts.length === 200 && next ? next : null;
    }

    records.sort(compareAddress);
    json(res, 200, {
      records,
      count: records.length,
      pagesScanned: pages,
      excludedAddresses: [...excluded],
      note: 'تم جلب جميع Trustlines الحالية عبر كل صفحات Horizon، مع استبعاد محافظ الإصدار والتوزيع واستلام الأدمن من قائمة المكافآت.'
    });
  } catch (e) { json(res, 500, { error: errorMessage(e) }); }
}
