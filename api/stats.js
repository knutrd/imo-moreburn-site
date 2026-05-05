// ============================================================
//  /api/stats.js
//  - Returns aggregated WEEX stats (accounts, volume, commissions)
//  - On authorized cron call, also persists a daily snapshot to Blob
// ============================================================

import { put } from '@vercel/blob';
import { callWeex, countAffiliates, aggregatePerUser } from './_weex.js';

// Commission rate: configurable via Vercel env var COMMISSION_RATE
// (decimal, e.g. "0.000353" for 0.0353%). Falls back to current observed value.
// To update: Vercel Dashboard > Settings > Environment Variables.
const COMMISSION_RATE = parseFloat(process.env.COMMISSION_RATE) || 0.0002827;

// ---------- Daily snapshot to Blob ----------

async function saveDailySnapshot({ accounts, totalVolume }) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return { saved: false, reason: 'BLOB_READ_WRITE_TOKEN missing' };
  }

  const today = new Date().toISOString().slice(0, 10);
  const pathname = `snapshots/${today}.json`;
  const payload = {
    date: today,
    accounts,
    volume: Math.round(totalVolume),
    capturedAt: new Date().toISOString()
  };

  try {
    await put(pathname, JSON.stringify(payload), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 60
    });
    return { saved: true, pathname };
  } catch (err) {
    return { saved: false, error: err.message };
  }
}

// ---------- Debug helper ----------

async function fetchAffiliateRaw() {
  const now = Date.now();
  const ninetyAgo = now - 90 * 24 * 60 * 60 * 1000;
  const out = {};

  try { out.uidsNoFilter = await callWeex('/api/v3/rebate/affiliate/getAffiliateUIDs?page=1&pageSize=100'); }
  catch (e) { out.uidsNoFilterError = e.message; }
  try { out.tradeData = await callWeex(`/api/v3/rebate/affiliate/getChannelUserTradeAndAsset?startTime=${ninetyAgo}&endTime=${now}&page=1&pageSize=100`); }
  catch (e) { out.tradeDataError = e.message; }
  try { out.commissions = await callWeex(`/api/v2/rebate/affiliate/getAffiliateCommission?startTime=${ninetyAgo}&endTime=${now}&page=1&pageSize=100`); }
  catch (e) { out.commissionsError = e.message; }

  return out;
}

// ---------- Main aggregation ----------

async function fetchAffiliateStats() {
  const [accountsResult, perUserResult] = await Promise.allSettled([
    countAffiliates(),
    aggregatePerUser()
  ]);

  const accounts = accountsResult.status === 'fulfilled' ? accountsResult.value : 0;
  const users = perUserResult.status === 'fulfilled' ? perUserResult.value : [];
  const totalVolume = users.reduce((sum, u) => sum + u.totalVolume, 0);

  return { accounts, totalVolume };
}

// ---------- HTTP handler ----------

export default async function handler(req, res) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers['authorization'];
  const isAuthorizedCron = cronSecret && authHeader === `Bearer ${cronSecret}`;
  const isRefreshRequest = req.query?.refresh === 'true';
  const isDebugRequest = req.query?.debug === 'true' && req.query?.secret === cronSecret;

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
    return res.status(401).json({ success: false, error: 'Unauthorized refresh request' });
  }

  if (isAuthorizedCron) {
    res.setHeader('Cache-Control', 'no-store');
  } else {
    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=86400');
  }
  res.setHeader('Content-Type', 'application/json');

  try {
    const { accounts, totalVolume } = await fetchAffiliateStats();

    let snapshot = null;
    if (isAuthorizedCron) {
      snapshot = await saveDailySnapshot({ accounts, totalVolume });
    }

    return res.status(200).json({
      success: true,
      updatedAt: new Date().toISOString(),
      weex: {
        accounts: String(accounts),
        volume48h: '$' + Math.round(totalVolume).toLocaleString('en-US'),
        commissionsPending: '$' + (totalVolume * COMMISSION_RATE).toFixed(2),
      },
      commissionRate: COMMISSION_RATE,
      snapshot
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
