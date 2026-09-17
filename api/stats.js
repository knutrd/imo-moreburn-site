// ============================================================
//  /api/stats.js
//  - Computes "volume of the current month" (not lifetime cumul)
//  - Caches everything in Blob for visitors (no WEEX call on read)
//  - Tracks registered accounts as a persistent, ever-growing UID
//    set (accounts can only be added, never disappear)
//  - On authorized cron: refreshes cache + daily snapshot
// ============================================================

import { put, list } from '@vercel/blob';
import { callWeex, countAffiliates, aggregatePerUser } from './_weex.js';

const COMMISSION_RATE = parseFloat(process.env.COMMISSION_RATE) || 0.0002827;
const TOP_N = 10;
const LIVE_CACHE_PATH = 'live/current.json';

// Returns the UTC timestamp of the 1st of the current month at 00:00
function getCurrentMonthStartMs() {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0);
}

function getCurrentMonthLabel() {
  const now = new Date();
  return now.toISOString().slice(0, 7);  // "2026-05"
}

// ---------- Blob helpers ----------

async function saveDailySnapshot({ accounts, totalVolume, monthVolume }) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return { saved: false, reason: 'no token' };

  const today = new Date().toISOString().slice(0, 10);
  const pathname = `snapshots/${today}.json`;
  const payload = {
    date: today,
    accounts,
    volume: Math.round(totalVolume),         // lifetime cumulative (kept for history charts)
    monthVolume: Math.round(monthVolume),    // volume of the current month only
    month: getCurrentMonthLabel(),
    capturedAt: new Date().toISOString()
  };

  try {
    await put(pathname, JSON.stringify(payload), {
      access: 'public', contentType: 'application/json',
      addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60
    });
    return { saved: true, pathname };
  } catch (err) {
    console.error('[saveDailySnapshot] Blob write failed:', err.message);
    return { saved: false, error: err.message };
  }
}

async function saveLiveCache(payload) {
  try {
    await put(LIVE_CACHE_PATH, JSON.stringify(payload), {
      access: 'public', contentType: 'application/json',
      addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 30
    });
    return { saved: true };
  } catch (err) {
    console.error('[saveLiveCache] Blob write failed:', err.message);
    return { saved: false, error: err.message };
  }
}

async function readLiveCache() {
  try {
    const result = await list({ prefix: LIVE_CACHE_PATH, limit: 1 });
    if (!result.blobs?.length) return null;
    const r = await fetch(result.blobs[0].url, { cache: 'no-store' });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

// ---------- Debug ----------

async function fetchAffiliateRaw() {
  const now = Date.now();
  const ninetyAgo = now - 90 * 24 * 60 * 60 * 1000;
  const out = {};
  try { out.uidsNoFilter = await callWeex('/api/v3/rebate/affiliate/getAffiliateUIDs?page=1&pageSize=100'); }
  catch (e) { out.uidsNoFilterError = e.message; }
  try { out.tradeData = await callWeex(`/api/v3/rebate/affiliate/getChannelUserTradeAndAsset?startTime=${ninetyAgo}&endTime=${now}&page=1&pageSize=100`); }
  catch (e) { out.tradeDataError = e.message; }
  return out;
}

// ---------- Main aggregation ----------
// Computes both lifetime totals AND current-month totals in one go,
// using a single batched call to keep WEEX load minimal.

async function fetchFullStats() {
  const monthStartMs = getCurrentMonthStartMs();
  const monthLabel = getCurrentMonthLabel();

  const [accountsResult, lifetimeResult, monthResult] = await Promise.allSettled([
    countAffiliates(),
    aggregatePerUser({ label: 'lifetime' }),                                            // lifetime
    aggregatePerUser({ fromMs: monthStartMs, toMs: Date.now(), label: `month-${monthLabel}` }),  // current month only
  ]);

  // Log failures loudly instead of silently falling back to empty arrays.
  // Previously a rejected promise here silently fell back to an empty
  // array, which made lifetimeVolume/monthVolume collapse to ~0 and
  // permanently tripped the anti-regression guard below — freezing the
  // cache with no visible error anywhere.
  if (accountsResult.status === 'rejected') {
    console.error('[fetchFullStats] countAffiliates failed:', accountsResult.reason);
  }
  if (lifetimeResult.status === 'rejected') {
    console.error('[fetchFullStats] lifetime aggregation failed:', lifetimeResult.reason);
  }
  if (monthResult.status === 'rejected') {
    console.error('[fetchFullStats] month aggregation failed:', monthResult.reason);
  }

  // If the core WEEX calls failed, stop here instead of continuing with
  // empty data. The caller's catch block will surface this clearly
  // (success:false + error message) instead of a silent no-op.
  if (lifetimeResult.status === 'rejected' || monthResult.status === 'rejected') {
    throw new Error(
      `WEEX aggregation failed (lifetime=${lifetimeResult.status}, month=${monthResult.status}): ` +
      `${lifetimeResult.reason?.message || monthResult.reason?.message || 'unknown error'}`
    );
  }

  const accountsCount = accountsResult.status === 'fulfilled' ? accountsResult.value : null;
  const lifetimeUsers = lifetimeResult.value;
  const monthUsers = monthResult.value;

  const lifetimeVolume = lifetimeUsers.reduce((s, u) => s + u.totalVolume, 0);
  const monthVolume = monthUsers.reduce((s, u) => s + u.totalVolume, 0);

  // Leaderboard ranked by LIFETIME cumulative volume (since launch)
  const top = lifetimeUsers.slice(0, TOP_N).map((u, i) => ({
    rank: i + 1,
    uid: u.uid,
    spotVolume: Math.round(u.spotVolume),
    futuresVolume: Math.round(u.futuresVolume),
    totalVolume: Math.round(u.totalVolume)
  }));

  return {
    accounts: accountsCount,   // may be null if countAffiliates() itself threw — handled by caller
    lifetimeVolume,
    monthVolume,
    monthLabel: getCurrentMonthLabel(),
    top,
    totalTraders: lifetimeUsers.length,
    totalLifetimeTraders: lifetimeUsers.length
  };
}

function formatResponse(stats) {
  return {
    success: true,
    updatedAt: new Date().toISOString(),
    weex: {
      accounts: String(stats.accounts),
      volume48h: '$' + Math.round(stats.monthVolume).toLocaleString('en-US'),
      volumeLifetime: '$' + Math.round(stats.lifetimeVolume).toLocaleString('en-US'),
      commissionsPending: '$' + (stats.monthVolume * COMMISSION_RATE).toFixed(2),
    },
    month: stats.monthLabel,
    commissionRate: COMMISSION_RATE
  };
}

// ---------- HTTP handler ----------

export default async function handler(req, res) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers['authorization'];
  const vercelCronHeader = req.headers['x-vercel-cron'];
  // Accept any of:
  //  - Vercel native cron (sends x-vercel-cron header from internal infra)
  //  - external cron with Bearer CRON_SECRET (e.g. cron-job.org, curl tests)
  //  - a plain browser URL with ?secret=... (handy for manually triggering
  //    a refresh, e.g. after a known-legitimate WEEX data correction)
  const isAuthorizedCron = (cronSecret && authHeader === `Bearer ${cronSecret}`)
                        || Boolean(vercelCronHeader)
                        || (cronSecret && req.query?.secret === cronSecret);
  const isRefreshRequest = req.query?.refresh === 'true';
  const isDebugRequest = req.query?.debug === 'true' && req.query?.secret === cronSecret;
  // One-off escape hatch: only usable by an already-authorized caller,
  // for cases like a legitimate WEEX-side data correction that would
  // otherwise be (correctly, normally) rejected by the regression guard.
  const overrideRegressionGuard = isAuthorizedCron && req.query?.override === 'true';

  if (isDebugRequest) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    try { return res.status(200).json({ debug: true, raw: await fetchAffiliateRaw() }); }
    catch (err) { return res.status(200).json({ debug: true, error: err.message }); }
  }

  if (isRefreshRequest && !isAuthorizedCron) {
    return res.status(401).json({ success: false, error: 'Unauthorized refresh request' });
  }

  res.setHeader('Content-Type', 'application/json');

  // ---- Cron path: fetch from WEEX, update caches ----
  if (isAuthorizedCron) {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const stats = await fetchFullStats();

      // Sanity check: lifetime volume can only grow, never shrink.
      // If today's WEEX response gives us LESS than what's in the cache,
      // the API probably partially failed. Refuse to overwrite.
      const previousCache = await readLiveCache();
      const previousLifetime = previousCache?.lifetimeVolume || 0;
      const previousMonth = previousCache?.monthVolume || 0;
      const previousAccounts = previousCache?.accounts || 0;
      const looksRegressed = stats.lifetimeVolume < previousLifetime * 0.9
                          && previousLifetime > 100000;
      const monthRegressed = stats.monthVolume < previousMonth * 0.9
                          && previousMonth > 50000
                          && stats.monthLabel === previousCache?.month;

      if ((looksRegressed || monthRegressed) && !overrideRegressionGuard) {
        console.warn('[stats] volume regression guard triggered — cache NOT updated', {
          previousLifetime, previousMonth,
          fetchedLifetime: stats.lifetimeVolume, fetchedMonth: stats.monthVolume
        });
        return res.status(200).json({
          success: false,
          skipped: 'volume-regression-detected',
          previous: { lifetime: previousLifetime, month: previousMonth },
          fetched: { lifetime: stats.lifetimeVolume, month: stats.monthVolume },
          updatedAt: new Date().toISOString()
        });
      }
      if ((looksRegressed || monthRegressed) && overrideRegressionGuard) {
        console.warn('[stats] volume regression guard BYPASSED via ?override=true — writing anyway', {
          previousLifetime, previousMonth,
          fetchedLifetime: stats.lifetimeVolume, fetchedMonth: stats.monthVolume
        });
      }

      // Accounts: never let the reported number go backwards, whatever
      // resolveAccountCount() returned (extra safety net on top of the
      // persistent UID set itself).
      const accounts = Math.max(stats.accounts ?? 0, previousAccounts);

      const [snapshot, liveCache] = await Promise.all([
        saveDailySnapshot({
          accounts,
          totalVolume: stats.lifetimeVolume,
          monthVolume: stats.monthVolume
        }),
        saveLiveCache({
          updatedAt: new Date().toISOString(),
          accounts,
          lifetimeVolume: stats.lifetimeVolume,
          monthVolume: stats.monthVolume,
          month: stats.monthLabel,
          totalTraders: stats.totalTraders,
          top: stats.top
        })
      ]);

      const response = formatResponse({ ...stats, accounts });
      response.snapshot = snapshot;
      response.liveCache = liveCache;
      return res.status(200).json(response);
    } catch (err) {
      console.error('[stats] cron run failed:', err);
      return res.status(200).json({
        success: false, error: err.message,
        updatedAt: new Date().toISOString(), weex: null
      });
    }
  }

  // ---- Visitor path: read cache ----
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=900');

  const cache = await readLiveCache();
  // Cache is valid only if it has the monthly fields (new format).
  // Old cache entries without monthVolume are ignored so we fall through
  // to a fresh fetch and overwrite them on the next cron tick.
  const isCacheValid = cache
    && typeof cache.monthVolume === 'number'
    && !Number.isNaN(cache.monthVolume);

  if (isCacheValid) {
    const monthVol = cache.monthVolume;
    const lifetimeVol = typeof cache.lifetimeVolume === 'number' ? cache.lifetimeVolume : 0;
    return res.status(200).json({
      success: true,
      updatedAt: cache.updatedAt,
      weex: {
        accounts: String(cache.accounts ?? 0),
        volume48h: '$' + Math.round(monthVol).toLocaleString('en-US'),
        volumeLifetime: '$' + Math.round(lifetimeVol).toLocaleString('en-US'),
        commissionsPending: '$' + (monthVol * COMMISSION_RATE).toFixed(2),
      },
      month: cache.month,
      commissionRate: COMMISSION_RATE,
      source: 'cache'
    });
  }

  // ---- Cache miss fallback ----
  try {
    const stats = await fetchFullStats();
    const response = formatResponse(stats);
    response.source = 'live-fallback';
    return res.status(200).json(response);
  } catch (err) {
    console.error('[stats] visitor fallback fetch failed:', err);
    return res.status(200).json({
      success: false, error: err.message,
      updatedAt: new Date().toISOString(), weex: null
    });
  }
}
