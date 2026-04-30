// ============================================================
//  /api/stats.js
//  Vercel serverless function — fetches WEEX affiliate data,
//  aggregates and returns it as JSON.
//
//  Called by:
//   - cron-job.org every 15 minutes (with Bearer auth + ?refresh=true)
//   - Vercel cron daily as backup (with Bearer auth + ?refresh=true)
//   - visitors on every page load (no auth, served from CDN cache)
//
//  Debug mode (auth required):
//   - /api/stats?debug=true&secret=<CRON_SECRET>
//     Returns raw WEEX responses for troubleshooting.
// ============================================================

import crypto from 'crypto';

const WEEX_API = 'https://api-spot.weex.com';

// Estimated commission rate:
//   futures fee ≈ 0.06% (taker)
//   affiliate rebate share = 75%
//   so commission ≈ volume × 0.06% × 0.75 = volume × 0.00045
const COMMISSION_RATE = 0.0006 * 0.75;

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

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`WEEX API ${path} ${response.status}: ${text.substring(0, 300)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`WEEX API ${path} returned non-JSON: ${text.substring(0, 300)}`);
  }
}

// Total registered affiliates (lifetime cumulative)
async function countAffiliates() {
  try {
    const resp = await callWeex('/api/v3/rebate/affiliate/getAffiliateUIDs?page=1&pageSize=1');
    const total = resp?.total ?? resp?.data?.total;
    if (typeof total === 'number') return total;
    const list = resp?.channelUserInfoItemList || resp?.data?.channelUserInfoItemList || [];
    return list.length;
  } catch (err) {
    return 0;
  }
}

// Sum spot + futures volume across all referrals.
// WEEX caps the query window to 90 days; we slide 4 windows to cover the last 360 days.
async function aggregateVolume() {
  const now = Date.now();
  const windowSize = 90 * 24 * 60 * 60 * 1000;
  let totalVolume = 0;

  for (let i = 0; i < 4; i++) {
    const endTime = now - i * windowSize;
    const startTime = endTime - windowSize + 1;
    let page = 1;

    while (true) {
      const path = `/api/v3/rebate/affiliate/getChannelUserTradeAndAsset?startTime=${startTime}&endTime=${endTime}&page=${page}&pageSize=100`;
      let resp;
      try {
        resp = await callWeex(path);
      } catch {
        break;
      }
      const records = resp?.records || resp?.data?.records || [];
      if (records.length === 0) break;
      for (const r of records) {
        totalVolume += parseFloat(r.spotTradingAmount || 0) + parseFloat(r.futuresTradingAmount || 0);
      }
      const totalPages = resp?.pages || resp?.data?.pages || 1;
      if (page >= totalPages) break;
      page += 1;
    }
  }

  return totalVolume;
}

// Debug-only: return raw WEEX responses for troubleshooting
async function fetchAffiliateRaw() {
  const now = Date.now();
  const ninetyAgo = now - 90 * 24 * 60 * 60 * 1000;
  const out = {};

  try {
    out.uidsNoFilter = await callWeex('/api/v3/rebate/affiliate/getAffiliateUIDs?page=1&pageSize=100');
  } catch (e) {
    out.uidsNoFilterError = e.message;
  }

  try {
    out.tradeData = await callWeex(`/api/v3/rebate/affiliate/getChannelUserTradeAndAsset?startTime=${ninetyAgo}&endTime=${now}&page=1&pageSize=100`);
  } catch (e) {
    out.tradeDataError = e.message;
  }

  try {
    out.commissions = await callWeex(`/api/v2/rebate/affiliate/getAffiliateCommission?startTime=${ninetyAgo}&endTime=${now}&page=1&pageSize=100`);
  } catch (e) {
    out.commissionsError = e.message;
  }

  return out;
}

async function fetchAffiliateStats() {
  const [accountsResult, volumeResult] = await Promise.allSettled([
    countAffiliates(),
    aggregateVolume()
  ]);

  const accounts = accountsResult.status === 'fulfilled' ? accountsResult.value : 0;
  const totalVolume = volumeResult.status === 'fulfilled' ? volumeResult.value : 0;

  // Estimated commissions: volume × 0.06% × 75%
  const estimatedCommission = totalVolume * COMMISSION_RATE;

  return {
    accounts: String(accounts),
    volume48h: '$' + Math.round(totalVolume).toLocaleString('en-US'),
    commissionsPending: '$' + estimatedCommission.toFixed(2),
  };
}

export default async function handler(req, res) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers['authorization'];
  const isAuthorizedCron = cronSecret && authHeader === `Bearer ${cronSecret}`;
  const isRefreshRequest = req.query?.refresh === 'true';
  const isDebugRequest = req.query?.debug === 'true' && req.query?.secret === cronSecret;

  // Debug mode: dump raw WEEX responses
  if (isDebugRequest) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    try {
      const raw = await fetchAffiliateRaw();
      return res.status(200).json({ debug: true, raw });
    } catch (err) {
      return res.status(200).json({ debug: true, error: err.message });
    }
  }

  if (isRefreshRequest && !isAuthorizedCron) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized refresh request'
    });
  }

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
