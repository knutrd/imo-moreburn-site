// ============================================================
//  /api/stats.js
//  - On authorized cron: calls WEEX, saves daily snapshot + live cache
//  - On visitors: reads live cache from Blob (fast, no WEEX call)
//  - Falls back to live WEEX API if cache is missing
// ============================================================

import { put, list } from '@vercel/blob';
import { callWeex, countAffiliates, aggregatePerUser } from './_weex.js';

const COMMISSION_RATE = parseFloat(process.env.COMMISSION_RATE) || 0.0002827;
const TOP_N = 10;
const LIVE_CACHE_PATH = 'live/current.json';

// ---------- Blob: daily snapshot (existing) ----------

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

// ---------- Blob: live cache (NEW) ----------
// Stores the latest WEEX aggregation so visitor-facing endpoints don't
// need to call WEEX themselves. Overwritten every 15 min by the cron.

async function saveLiveCache(payload) {
  try {
    await put(LIVE_CACHE_PATH, JSON.stringify(payload), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 30
    });
    return { saved: true };
  } catch (err) {
    return { saved: false, error: err.message };
  }
}

async function readLiveCache() {
  try {
    const result = await list({ prefix: LIVE_CACHE_PATH, limit: 1 });
    if (!result.blobs || result.blobs.length === 0) return null;
    const blob = result.blobs[0];
    const r = await fetch(blob.url, { cache: 'no-store' });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
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

// ---------- Main aggregation (heavy, only run on cron) ----------

async function fetchFullStats() {
  const [accountsResult, perUserResult] = await Promise.allSettled([
    countAffiliates(),
    aggregatePerUser()
  ]);

  const accounts = accountsResult.status === 'fulfilled' ? accountsResult.value : 0;
  const users = perUserResult.status === 'fulfilled' ? perUserResult.value : [];
  const totalVolume = users.reduce((sum, u) => sum + u.totalVolume, 0);

  // Pre-compute the top N for the leaderboard
  const top = users.slice(0, TOP_N).map((u, i) => ({
    rank: i + 1,
    uid: u.uid,
    spotVolume: Math.round(u.spotVolume),
    futuresVolume: Math.round(u.futuresVolume),
    totalVolume: Math.round(u.totalVolume)
  }));

  return {
    accounts,
    totalVolume,
    top,
    totalTraders: users.length
  };
}

// Format the public-facing response from raw stats
function formatResponse(stats) {
  return {
    success: true,
    updatedAt: new Date().toISOString(),
    weex: {
      accounts: String(stats.accounts),
      volume48h: '$' + Math.round(stats.totalVolume).toLocaleString('en-US'),
      commissionsPending: '$' + (stats.totalVolume * COMMISSION_RATE).toFixed(2),
    },
    commissionRate: COMMISSION_RATE
  };
}

// ---------- HTTP handler ----------

export default async function handler(req, res) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers['authorization'];
  const isAuthorizedCron = cronSecret && authHeader === `Bearer ${cronSecret}`;
  const isRefreshRequest = req.query?.refresh === 'true';
  const isDebugRequest = req.query?.debug === 'true' && req.query?.secret === cronSecret;

  // ---- Debug mode ----
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

  // ---- Unauthorized refresh attempts are rejected ----
  if (isRefreshRequest && !isAuthorizedCron) {
    return res.status(401).json({ success: false, error: 'Unauthorized refresh request' });
  }

  res.setHeader('Content-Type', 'application/json');

  // ---- Cron path: fetch from WEEX, update caches, return fresh data ----
  if (isAuthorizedCron) {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const stats = await fetchFullStats();

      // Persist both the daily snapshot and the live cache
      const [snapshot, liveCache] = await Promise.all([
        saveDailySnapshot({ accounts: stats.accounts, totalVolume: stats.totalVolume }),
        saveLiveCache({
          updatedAt: new Date().toISOString(),
          accounts: stats.accounts,
          totalVolume: stats.totalVolume,
          totalTraders: stats.totalTraders,
          top: stats.top
        })
      ]);

      const response = formatResponse(stats);
      response.snapshot = snapshot;
      response.liveCache = liveCache;
      return res.status(200).json(response);
    } catch (err) {
      return res.status(200).json({
        success: false,
        error: err.message,
        updatedAt: new Date().toISOString(),
        weex: null
      });
    }
  }

  // ---- Visitor path: read live cache from Blob (fast, no WEEX call) ----
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=900');

  const cache = await readLiveCache();
  if (cache) {
    return res.status(200).json({
      success: true,
      updatedAt: cache.updatedAt,
      weex: {
        accounts: String(cache.accounts),
        volume48h: '$' + Math.round(cache.totalVolume).toLocaleString('en-US'),
        commissionsPending: '$' + (cache.totalVolume * COMMISSION_RATE).toFixed(2),
      },
      commissionRate: COMMISSION_RATE,
      source: 'cache'
    });
  }

  // ---- Cache miss fallback: try live WEEX (slower but degrades gracefully) ----
  try {
    const stats = await fetchFullStats();
    const response = formatResponse(stats);
    response.source = 'live-fallback';
    return res.status(200).json(response);
  } catch (err) {
    return res.status(200).json({
      success: false,
      error: err.message,
      updatedAt: new Date().toISOString(),
      weex: null
    });
  }
}
