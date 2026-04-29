// ============================================================
//  /api/stats.js
//  Vercel serverless function - fetches WEEX affiliate data,
//  aggregates and returns it as JSON.
//
//  This is called:
//   - Every 15 minutes by cron-job.org (free, with Bearer auth)
//   - Once daily by Vercel cron as backup (also Bearer auth)
//   - On every page load by visitors (served from CDN cache, no auth)
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
    throw new Error(`WEEX API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function fetchAffiliateStats() {
  const referralsData = await callWeex('/api/v3/rebate/affiliate/getChannelUserTradeAndAsset?pageNum=1&pageSize=100');
  const referrals = referralsData?.data?.records || [];

  const totalAccounts = referralsData?.data?.total || referrals.length;
  let totalVolume = 0;
  let totalCommission = 0;

  for (const r of referrals) {
    totalVolume += parseFloat(r.spotTradingAmount || 0) + parseFloat(r.futuresTradingAmount || 0);
    totalCommission += parseFloat(r.commission || 0);
  }

  return {
    accounts: totalAccounts.toString(),
    volume48h: '$' + Math.round(totalVolume).toLocaleString('en-US'),
    commissionsPending: '$' + totalCommission.toFixed(2),
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
  //  - Cron refresh: bypass cache and write new fresh value
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
    // If WEEX API fails, return empty stats so the site falls back to data.js values.
    return res.status(200).json({
      success: false,
      error: err.message,
      updatedAt: new Date().toISOString(),
      weex: null
    });
  }
}
