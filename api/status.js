import { cors, json, server, getIssuer, getDistributor, getAdminReceiverAddress, getAsset, TOKEN_CODE, HORIZON_URL, NETWORK_PASSPHRASE, horizonJson, findTrustline, errorMessage } from './_config.js';
function tokenBalance(account, asset) { return account?.balances?.find(b => b.asset_code === asset.code && b.asset_issuer === asset.issuer)?.balance || '0.0000000'; }
export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  try {
    const issuer = getIssuer(); const distributor = getDistributor(); const asset = getAsset();
    const adminReceiverAddress = getAdminReceiverAddress();
    const accountAddresses = [...new Set([issuer.publicKey(), distributor.publicKey(), adminReceiverAddress])];
    const [accounts, assetPage] = await Promise.all([
      Promise.all(accountAddresses.map(async address => {
        try { return [address, await server.loadAccount(address)]; } catch { return [address, null]; }
      })),
      server.assets().forCode(TOKEN_CODE).forIssuer(issuer.publicKey()).call()
    ]);
    const accountMap = new Map(accounts);
    const issuerAccount = accountMap.get(issuer.publicKey());
    const distributorAccount = accountMap.get(distributor.publicKey());
    const adminReceiverAccount = accountMap.get(adminReceiverAddress);
    if (!issuerAccount || !distributorAccount) throw new Error('تعذر تحميل محفظة الإصدار أو التوزيع.');

    const excludedAddresses = new Set([issuer.publicKey(), distributor.publicKey(), adminReceiverAddress]);
    let url = `/accounts?asset=${encodeURIComponent(`${asset.code}:${asset.issuer}`)}&order=asc&limit=200`;
    let trustlines = 0; let pagesScanned = 0; let externalTotal = 0; let allTrustlineTotal = 0;
    while (url) {
      const page = await horizonJson(url, 30000); pagesScanned++;
      const records = page?._embedded?.records || [];
      for (const account of records) {
        const line = findTrustline(account, asset);
        if (!line) continue;
        trustlines++;
        const balance = Number(line.balance || 0);
        allTrustlineTotal += balance;
        if (!excludedAddresses.has(account.account_id)) externalTotal += balance;
      }
      const next = page?._links?.next?.href;
      url = records.length === 200 && next ? next : null;
    }

    const master = issuerAccount.signers.find(s => s.key === issuer.publicKey());
    const issuerCanSign = Number(master?.weight || 0) >= Number(issuerAccount.thresholds.med_threshold);
    const assetRecord = assetPage.records[0] || {};
    const excludedBalances = allTrustlineTotal - externalTotal;
    json(res, 200, {
      network: NETWORK_PASSPHRASE, horizon: HORIZON_URL,
      asset: { code: asset.code, issuer: asset.issuer },
      issuer: {
        address: issuer.publicKey(), signers: issuerAccount.signers.length,
        masterWeight: master?.weight ?? 0, canIssue: issuerCanSign,
        flags: issuerAccount.flags || {},
        clawbackEnabled: Boolean(issuerAccount.flags?.auth_clawback_enabled),
        revocable: Boolean(issuerAccount.flags?.auth_revocable),
        immutable: Boolean(issuerAccount.flags?.auth_immutable)
      },
      distributor: {
        address: distributor.publicKey(), balance: tokenBalance(distributorAccount, asset),
        hasTrustline: distributorAccount.balances.some(b => b.asset_code === asset.code && b.asset_issuer === asset.issuer)
      },
      adminReceiver: { address: adminReceiverAddress, balance: tokenBalance(adminReceiverAccount, asset) },
      holders: String(trustlines),
      trustlines: String(trustlines),
      amount: assetRecord.amount ?? allTrustlineTotal.toFixed(7),
      externalAmount: externalTotal.toFixed(7),
      excludedBalances: Math.max(0, excludedBalances).toFixed(7),
      excludedAddresses: [...excludedAddresses],
      pagesScanned,
      flags: assetRecord.flags || {}
    });
  } catch (e) { json(res, 500, { error: errorMessage(e) }); }
}
