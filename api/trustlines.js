import { cors, json, requireAdmin, getAsset, horizonJson, server, findTrustline, errorMessage } from './_config.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  if (!requireAdmin(req, res)) return;
  try {
    const asset = getAsset();
    const candidates = new Map();
    let url = '/operations?order=desc&limit=200&include_failed=false';
    let pages = 0; let scanned = 0;
    while (url && pages < 12 && candidates.size < 40) {
      const page = await horizonJson(url); pages++;
      const records = page?._embedded?.records || [];
      scanned += records.length;
      for (const op of records) {
        if (op.type !== 'change_trust') continue;
        if (op.asset_code !== asset.code || op.asset_issuer !== asset.issuer) continue;
        if (Number(op.limit || 0) <= 0) continue;
        const address = op.source_account;
        if (address && !candidates.has(address)) candidates.set(address, {
          address, createdAt: op.created_at, operationId: op.id, pagingToken: op.paging_token, limitAtOperation: op.limit
        });
      }
      const next = page?._links?.next?.href;
      url = records.length === 200 && next ? next : null;
    }
    const checked = [];
    for (const item of candidates.values()) {
      try {
        const account = await server.loadAccount(item.address);
        const line = findTrustline(account, asset);
        if (line) checked.push({
          ...item,
          balance: line.balance,
          sellingLiabilities: line.selling_liabilities || '0.0000000',
          authorized: line.is_authorized !== false,
          clawbackEnabled: Boolean(line.is_clawback_enabled)
        });
      } catch { /* account may have been merged */ }
      if (checked.length >= 10) break;
    }
    json(res, 200, {
      records: checked,
      diagnostics: { pagesScanned: pages, operationsScanned: scanned, candidatesFound: candidates.size },
      pagesScanned: pages, operationsScanned: scanned, candidatesFound: candidates.size,
      note: checked.length
        ? 'تم جلب أحدث Change Trust مطابقة ثم التحقق أن كل Trustline ما زالت موجودة حاليًا.'
        : 'لم نجد Change Trust مطابقة داخل النطاق المفحوص. استخدم قائمة الحاملين لرؤية جميع Trustlines الحالية.'
    });
  } catch (e) { json(res, 500, { error: errorMessage(e) }); }
}
