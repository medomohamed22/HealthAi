import {
  Asset, TransactionBuilder, Operation, Memo, LiquidityPoolAsset,
  LiquidityPoolFeeV18, getLiquidityPoolId
} from '@stellar/stellar-sdk';
import {
  cors, json, requireAdmin, server, getDistributor, getAsset, validAmount,
  NETWORK_PASSPHRASE, HORIZON_URL, horizonJson, errorMessage, getDynamicBaseFee,
  availableBalance, findTrustline
} from './_config.js';

const NATIVE = Asset.native();
const FEE_RATE = 0.003;
const STROOP = 1e-7;

function fixed(value) { return Math.max(0, Number(value || 0)).toFixed(7); }
function validPercent(value, fallback = 1) {
  const n = value === undefined || value === '' ? fallback : Number(value);
  if (!Number.isFinite(n) || n < 0.01 || n > 20) throw new Error('Slippage يجب أن يكون بين 0.01% و20%.');
  return n;
}
function orderedAssets(token) {
  const poolAsset = new LiquidityPoolAsset(NATIVE, token, LiquidityPoolFeeV18);
  return { poolAsset, id: getLiquidityPoolId('constant_product', poolAsset.getLiquidityPoolParameters()).toString('hex') };
}
function reserveFor(pool, kind, token) {
  return (pool?.reserves || []).find(r => kind === 'native'
    ? r.asset === 'native'
    : r.asset === `${token.code}:${token.issuer}`);
}
function poolSnapshot(pool, token, account) {
  if (!pool) return null;
  const pi = Number(reserveFor(pool, 'native', token)?.amount || 0);
  const tok = Number(reserveFor(pool, 'token', token)?.amount || 0);
  const totalShares = Number(pool.total_shares || 0);
  const shareLine = account?.balances?.find(b => b.asset_type === 'liquidity_pool_shares' && b.liquidity_pool_id === pool.id);
  const userShares = Number(shareLine?.balance || 0);
  const sharePercent = totalShares > 0 ? userShares / totalShares * 100 : 0;
  const spot = tok > 0 ? pi / tok : 0;
  return {
    id: pool.id, feeBp: pool.fee_bp, nativeReserve: fixed(pi), tokenReserve: fixed(tok),
    totalShares: fixed(totalShares), yourShares: fixed(userShares), yourSharePercent: sharePercent.toFixed(6),
    currentPricePiPerToken: spot.toFixed(7), tokenPerPi: pi > 0 ? (tok / pi).toFixed(7) : '0.0000000',
    totalLiquidityPi: fixed(pi * 2), lowLiquidity: pi < Number(process.env.LOW_LIQUIDITY_PI || 100),
    lowLiquidityThresholdPi: String(process.env.LOW_LIQUIDITY_PI || 100),
    onChain: true,
    walletIndexing: 'unknown',
    walletIndexingMessage: 'الحوض مؤكد على البلوكشين. لا توفر Horizon إشارة رسمية تؤكد اكتمال فهرسته داخل واجهة Pi Wallet.'
  };
}
async function getPoolAndAccount() {
  const token = getAsset(); const distributor = getDistributor();
  const { id, poolAsset } = orderedAssets(token);
  const accountPromise = server.loadAccount(distributor.publicKey());
  let pool = null;
  try { pool = await horizonJson(`/liquidity_pools/${id}`, 20000); } catch (e) {
    if (!/404|not found|Resource Missing/i.test(e.message)) throw e;
  }
  return { token, distributor, id, poolAsset, pool, account: await accountPromise };
}
function quote(pool, token, direction, amount, slippage) {
  if (!pool) throw new Error('الحوض غير موجود بعد. أضف السيولة أولًا لإنشائه.');
  const pi = Number(reserveFor(pool, 'native', token)?.amount || 0);
  const tok = Number(reserveFor(pool, 'token', token)?.amount || 0);
  const input = Number(validAmount(amount));
  const buy = direction === 'buy';
  const x = buy ? pi : tok; const y = buy ? tok : pi;
  if (x <= 0 || y <= 0) throw new Error('احتياطيات الحوض غير كافية.');
  const effective = input * (1 - FEE_RATE);
  const output = y * effective / (x + effective);
  const minOutput = output * (1 - slippage / 100);
  const spotRate = y / x;
  const executionRate = output / input;
  const priceImpact = Math.max(0, (1 - executionRate / spotRate) * 100);
  return {
    direction, input: fixed(input), expectedOutput: fixed(output), minimumOutput: fixed(minOutput),
    priceImpactPercent: priceImpact.toFixed(4), slippagePercent: slippage.toFixed(2), feePercent: '0.30',
    sendAsset: buy ? 'Test-Pi' : token.code, receiveAsset: buy ? token.code : 'Test-Pi'
  };
}
async function buildAndSubmit(sourceAccount, signer, operations, memo) {
  const fee = await getDynamicBaseFee();
  let builder = new TransactionBuilder(sourceAccount, { fee, networkPassphrase: NETWORK_PASSPHRASE });
  for (const operation of operations) builder = builder.addOperation(operation);
  const tx = builder.addMemo(Memo.text(String(memo || 'Liquidity action').slice(0, 28))).setTimeout(120).build();
  tx.sign(signer); return server.submitTransaction(tx);
}
function ratioBounds(price, slippage) {
  const min = price * (1 - slippage / 100); const max = price * (1 + slippage / 100);
  const scale = 10000000;
  return { minPrice: { n: Math.max(1, Math.floor(min * scale)), d: scale }, maxPrice: { n: Math.max(1, Math.ceil(max * scale)), d: scale } };
}
async function history(id) {
  if (!id) return [];
  try {
    const page = await horizonJson(`/liquidity_pools/${id}/operations?order=desc&limit=100`, 25000);
    return (page?._embedded?.records || []).map(r => ({
      id: r.id, type: r.type, createdAt: r.created_at, source: r.source_account,
      transactionHash: r.transaction_hash,
      amounts: r.reserves_deposited || r.reserves_received || r.reserves_max || null,
      shares: r.shares_received || r.shares || null
    }));
  } catch { return []; }
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (!['GET', 'POST'].includes(req.method)) return json(res, 405, { error: 'Method not allowed' });
  if (!requireAdmin(req, res)) return;
  try {
    const action = String(req.method === 'GET' ? req.query?.action || 'status' : req.body?.action || '').toLowerCase();
    const { token, distributor, id, poolAsset, pool, account } = await getPoolAndAccount();
    const snapshot = poolSnapshot(pool, token, account);
    if (action === 'status') {
      const native = account.balances.find(b => b.asset_type === 'native');
      const line = findTrustline(account, token);
      return json(res, 200, {
        exists: Boolean(pool), poolId: id, asset: { code: token.code, issuer: token.issuer }, pool: snapshot,
        wallet: { address: distributor.publicKey(), availablePi: fixed(availableBalance(native)), availableToken: fixed(availableBalance(line)) },
        history: await history(id), horizon: HORIZON_URL
      });
    }
    const slippage = validPercent(req.body?.slippage, 1);
    if (action === 'preview-swap') return json(res, 200, { preview: quote(pool, token, req.body?.direction, req.body?.amount, slippage) });
    if (action === 'preview-deposit') {
      const piAmount = Number(validAmount(req.body?.piAmount)); const tokenAmount = Number(validAmount(req.body?.tokenAmount));
      const proposedPrice = piAmount / tokenAmount;
      const currentPrice = snapshot ? Number(snapshot.currentPricePiPerToken) : proposedPrice;
      const ratioDifference = currentPrice ? Math.abs(proposedPrice / currentPrice - 1) * 100 : 0;
      return json(res, 200, { preview: {
        piAmount: fixed(piAmount), tokenAmount: fixed(tokenAmount), proposedPricePiPerToken: proposedPrice.toFixed(7),
        currentPricePiPerToken: currentPrice.toFixed(7), ratioDifferencePercent: ratioDifference.toFixed(4),
        createsPool: !pool, slippagePercent: slippage.toFixed(2), warning: pool && ratioDifference > slippage
          ? 'نسبة الإيداع بعيدة عن نسبة الحوض الحالية وقد تُرفض. استخدم النسبة الحالية.' : null
      }});
    }
    if (action === 'preview-withdraw') {
      if (!snapshot) throw new Error('الحوض غير موجود.');
      const shares = Number(validAmount(req.body?.shares)); const owned = Number(snapshot.yourShares);
      if (shares > owned + STROOP) throw new Error('عدد LP Shares المطلوب أكبر من حصتك.');
      const ratio = shares / Number(snapshot.totalShares || 1);
      return json(res, 200, { preview: { shares: fixed(shares), expectedPi: fixed(Number(snapshot.nativeReserve) * ratio), expectedToken: fixed(Number(snapshot.tokenReserve) * ratio), slippagePercent: slippage.toFixed(2) } });
    }
    if (action === 'deposit') {
      const piAmount = validAmount(req.body?.piAmount); const tokenAmount = validAmount(req.body?.tokenAmount);
      const proposedPrice = Number(piAmount) / Number(tokenAmount);
      if (pool) {
        const current = Number(snapshot.currentPricePiPerToken);
        const difference = Math.abs(proposedPrice / current - 1) * 100;
        if (difference > slippage + 0.0001) throw new Error(`نسبة الإيداع تختلف ${difference.toFixed(2)}% عن الحوض، وتتجاوز Slippage.`);
      }
      if (Number(piAmount) > availableBalance(account.balances.find(b => b.asset_type === 'native'))) throw new Error('رصيد Test-Pi المتاح غير كافٍ مع مراعاة الالتزامات.');
      if (Number(tokenAmount) > availableBalance(findTrustline(account, token))) throw new Error(`رصيد ${token.code} المتاح غير كافٍ.`);
      const bounds = ratioBounds(proposedPrice, slippage);
      const hasPoolShareTrustline = account.balances.some(b => b.asset_type === 'liquidity_pool_shares' && b.liquidity_pool_id === id);
      const operations = [];
      if (!hasPoolShareTrustline) operations.push(Operation.changeTrust({ asset: poolAsset }));
      operations.push(Operation.liquidityPoolDeposit({ liquidityPoolId: id, maxAmountA: piAmount, maxAmountB: tokenAmount, ...bounds }));
      const result = await buildAndSubmit(account, distributor, operations, req.body?.memo || 'Add liquidity');
      return json(res, 200, { ok: true, hash: result.hash, poolId: id });
    }
    if (action === 'withdraw') {
      if (!snapshot) throw new Error('الحوض غير موجود.');
      const shares = validAmount(req.body?.shares); const owned = Number(snapshot.yourShares);
      if (Number(shares) > owned + STROOP) throw new Error('عدد LP Shares المطلوب أكبر من حصتك.');
      const ratio = Number(shares) / Number(snapshot.totalShares || 1);
      const minA = fixed(Number(snapshot.nativeReserve) * ratio * (1 - slippage / 100));
      const minB = fixed(Number(snapshot.tokenReserve) * ratio * (1 - slippage / 100));
      const result = await buildAndSubmit(account, distributor, [Operation.liquidityPoolWithdraw({ liquidityPoolId: id, amount: shares, minAmountA: minA, minAmountB: minB })], req.body?.memo || 'Remove liquidity');
      return json(res, 200, { ok: true, hash: result.hash, minimumPi: minA, minimumToken: minB });
    }
    if (action === 'swap') {
      const q = quote(pool, token, req.body?.direction, req.body?.amount, slippage);
      if (Number(q.priceImpactPercent) > Number(process.env.MAX_SWAP_PRICE_IMPACT || 15)) throw new Error(`Price Impact هو ${q.priceImpactPercent}% ويتجاوز حد الأمان.`);
      const buy = q.direction === 'buy';
      const sendAsset = buy ? NATIVE : token; const destAsset = buy ? token : NATIVE;
      const result = await buildAndSubmit(account, distributor, [Operation.pathPaymentStrictSend({ sendAsset, sendAmount: q.input, destination: distributor.publicKey(), destAsset, destMin: q.minimumOutput, path: [] })], req.body?.memo || 'Pool swap');
      return json(res, 200, { ok: true, hash: result.hash, quote: q });
    }
    throw new Error('إجراء السيولة غير معروف.');
  } catch (e) { json(res, 400, { error: errorMessage(e) }); }
}
