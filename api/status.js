import { cors, json, server, getIssuer, getDistributor, getAsset, TOKEN_CODE, HORIZON_URL, NETWORK_PASSPHRASE, errorMessage } from './_config.js';

function tokenBalance(account, asset) {
  return account.balances.find(b => b.asset_code === asset.code && b.asset_issuer === asset.issuer)?.balance || '0.0000000';
}
export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  try {
    const issuer = getIssuer(); const distributor = getDistributor(); const asset = getAsset();
    const [issuerAccount, distributorAccount, assetPage] = await Promise.all([
      server.loadAccount(issuer.publicKey()), server.loadAccount(distributor.publicKey()),
      server.assets().forCode(TOKEN_CODE).forIssuer(issuer.publicKey()).call()
    ]);
    const issuerCanSign = issuerAccount.signers.some(s => s.key === issuer.publicKey() && Number(s.weight) >= Number(issuerAccount.thresholds.med_threshold));
    json(res, 200, {
      network: NETWORK_PASSPHRASE, horizon: HORIZON_URL,
      asset: { code: asset.code, issuer: asset.issuer },
      issuer: { address: issuer.publicKey(), signers: issuerAccount.signers.length, masterWeight: issuerAccount.signers.find(s => s.key === issuer.publicKey())?.weight ?? 0, canIssue: issuerCanSign },
      distributor: { address: distributor.publicKey(), balance: tokenBalance(distributorAccount, asset), hasTrustline: distributorAccount.balances.some(b => b.asset_code === asset.code && b.asset_issuer === asset.issuer) },
      holders: assetPage.records[0]?.num_accounts ?? '0', amount: assetPage.records[0]?.amount ?? '0.0000000', flags: assetPage.records[0]?.flags || {}
    });
  } catch (e) { json(res, 500, { error: errorMessage(e) }); }
}
