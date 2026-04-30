// ============================================================
//  /api/stats.js
//  Vercel serverless function — fetches WEEX affiliate data,
//  aggregates and returns it as JSON.
//
//  Called by:
//   - cron-job.org every 15 minutes (with Bearer auth + ?refresh=true)
//   - Vercel cron daily as backup (with Bearer auth + ?refresh=true)
//   - visitors on every page load (no auth, served from CDN cache)
// ============================================================

import crypto from 'crypto';

const WEEX_API = 'https://api-spot.weex.com';

// WEEX requires HMAC SHA256 signing of every request
function signRequest(timestamp, method, requestPath, body, secret) {
  const message = timestamp + method.toUpperCase() + requestPath + (body || '');
  return crypto.createHmac('sha256', secret).update(message).digest('base64');
}

async function callWeex(path, method = 'GET', body = '') {
  const apiKey = process.env.WEEX_API_KEY;
  const apiSecret = process.env.WEEX_API_SECRET;
  const passphrase = process.env.WEEX_API_PASSPHRASE;

  if (!apiKey || !apiSecret || !passphrase) {
    throw new Error('WEEX API credentials missing in environment variables');
  }

  const timestamp = Date.now().toString();
  const sign = signRequest(timestamp, method, path, body, apiSecret);

  const response = await fetch(`${WEEX_API}${path}`, {
    method,
    headers: {
      'ACCESS-KEY': apiKey,
      'ACCESS-SIGN': sign,
      'ACCESS-PASSPHRASE': passphrase,
      'ACCESS-TIMESTAMP': timestamp,
      'Content-Type': 'application/json',
      'locale': 'en-US'
    },
    body: method !== 'GET' ? body : undefined
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`WEEX API ${path} ${response.status}: ${errorText.substring(0, 200)}`);
  }

  return response.json();
}

// Helper: aggregate volume + commission from getChannelUserTradeAndAsset.
// WEEX caps the query window to 90 days; we slide a window across the last
// year (365 days) to approximate "lifetime" totals.
async function aggregateTradingData() {
  const now = Date.now();
  const ninetyDays = 90 * 24 * 60 * 60 * 1000;
  let totalVolume = 0;
  let totalCommission = 0;

  // Slide 4 windows of 90 days back = up to 360 days of history
  for (let i = 0; i < 4; i++) {
    const endTime = now - i * ninetyDays;
    const startTime = endTime - ninetyDays + 1;
    let page = 1;
    while (true) {
      const path = `/api/v3/rebate/affiliate/getChannelUserTradeAndAsset?startTime=${startTime}&endTime=${endTime}&page=${page}&pageSize=100`;
      let resp;
      try {
        resp = await callWeex(path);
      } catch (err) {
        // Window failed (rate limit or no data) — skip rather than fail the whole call
        break;
      }
      const records = resp?.records || resp?.data?.records || [];
      if (records.length === 0) break;
      for (const r of records) {
        totalVolume += parseFloat(r.spotTradingAmount || 0) + parseFloat(r.futuresTradingAmount || 0);
        totalCommission += parseFloat(r.commission || 0);
      }
      const totalPages = resp?.pages || resp?.data?.pages || 1;
      if (page >= totalPages) break;
      page += 1;
    }
  }

  return { totalVolume, totalCommission };
}

// Helper: count total registered referrals via getAffiliateUIDs (lifetime via 1y window)
async function countAffiliates() {
  const now = Date.now();
  const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;
  // First call: just to get the `total` field
  const path = `/api/v3/rebate/affiliate/getAffiliateUIDs?startTime=${oneYearAgo}&endTime=${now}&page=1&pageSize=1`;
  const resp = await callWeex(path);
  return resp?.total ?? resp?.data?.total ?? 0;
}

async function fetchAffiliateStats() {
  // Run both calls in parallel for speed
  const [accountsResult, tradingResult] = await Promise.allSettled([
    countAffiliates(),
    aggregateTradingData()
  ]);

  const accounts = accountsResult.status === 'fulfilled' ? accountsResult.value : 0;
  const trading = tradingResult.status === 'fulfilled'
    ? tradingResult.value
    : { totalVolume: 0, totalCommission: 0 };

  return {
    accounts: String(accounts),
    volume48h: '$' + Math.round(trading.totalVolume).toLocaleString('en-US'),
    commissionsPending: '$' + trading.totalCommission.toFixed(2),
  };
}

export default async function handler(req, res) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers['authorization'];
  const isAuthorizedCron = cronSecret && authHeader === `Bearer ${cronSecret}`;
  const isRefreshRequest = req.query?.refresh === 'true';

  // Reject unauthorized refresh attempts
  if (isRefreshRequest && !isAuthorizedCron) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized refresh request'
    });
  }

  // CDN cache strategy:
  //  - Public reads: serve cached version for 15 min, allow stale for up to 24h
  //  - Cron refresh: bypass cache and write a fresh value
  if (isAuthorizedCron) {
    res.setHeader('Cache-Control', 'no-store');
  } else {
    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=86400');
  }
  res.setHeader('Content-Type', 'application/json');

  try {
    const weexStats = await fetchAffiliateStats();

    return res.status(200).json({
      success: true,
      updatedAt: new Date().toISOString(),
      weex: weexStats
    });
  } catch (err) {
    return res.status(200).json({
      success: false,
      error: err.message,
      updatedAt: new Date().toISOString(),
      weex: null
    });
  }
}
