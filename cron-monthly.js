// ============================================================
//  /api/cron-monthly.js
//  Two modes:
//  - AUTO mode (default): runs from cron, archives previous month
//    by querying WEEX. Skips if not the 1st of the month (unless ?force=true).
//  - MANUAL mode (?mode=manual): archives a month using values you
//    pass via query params. Useful when cron-job.org was down, or
//    to backfill historical months.
//
//  Auth: Bearer CRON_SECRET in either case.
//
//  Manual example:
//    GET /api/cron-monthly?mode=manual&month=2026-05&volume=67558531
//        &commissions=21105.75&traders=44&newAccounts=324&accountsEnd=354
// ============================================================

import { put, list } from '@vercel/blob';
import { aggregatePerUser, countAffiliates, maskUid } from './_weex.js';
import { KNOWN_TRADERS } from './_known-traders.js';

const COMMISSION_RATE = parseFloat(process.env.COMMISSION_RATE) || 0.0002827;

function toIsoDate(d) { return d.toISOString().slice(0, 10); }
function toIsoMonth(d) { return d.toISOString().slice(0, 7); }

function previousMonth(ref) {
  const d = new Date(ref);
  d.setUTCDate(1);
  d.setUTCDate(0);
  return toIsoMonth(d);
}

function monthRangeMs(monthStr) {
  const [year, m] = monthStr.split('-').map(Number);
  const startMs = Date.UTC(year, m - 1, 1, 0, 0, 0);
  const endMs = Date.UTC(year, m, 1, 0, 0, 0) - 1;
  return { startMs, endMs };
}

async function findSnapshotForDate(targetDate) {
  try {
    const result = await list({ prefix: `snapshots/${targetDate}`, limit: 5 });
    if (!result.blobs?.length) return null;
    const r = await fetch(result.blobs[0].url);
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

async function findNearestSnapshot(targetDate, maxLookback = 7) {
  let cursor = new Date(targetDate + 'T00:00:00Z');
  for (let i = 0; i < maxLookback; i++) {
    const snap = await findSnapshotForDate(toIsoDate(cursor));
    if (snap) return snap;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return null;
}

async function saveArchive(targetMonth, payload) {
  const archivePath = `months/${targetMonth}.json`;
  await put(archivePath, JSON.stringify(payload, null, 2), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 3600
  });
  return archivePath;
}

// ---------- MANUAL mode ----------
// Builds an archive from query-supplied values, no WEEX call.

function isValidMonth(s) {
  return typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

async function handleManualMode(req, res, now) {
  const q = req.query || {};
  const month = q.month;
  if (!isValidMonth(month)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid or missing "month" param (expected YYYY-MM)'
    });
  }

  const volume = parseFloat(q.volume);
  if (!Number.isFinite(volume) || volume < 0) {
    return res.status(400).json({
      success: false,
      error: 'Invalid or missing "volume" param (number, >= 0)'
    });
  }

  // Optional fields: fall back to computed/zero when not provided
  const commissionsParam = parseFloat(q.commissions);
  const commissions = Number.isFinite(commissionsParam) ? commissionsParam : volume * COMMISSION_RATE;
  const traders = Number.isFinite(parseInt(q.traders, 10)) ? parseInt(q.traders, 10) : 0;
  const newAccounts = Number.isFinite(parseInt(q.newAccounts, 10)) ? parseInt(q.newAccounts, 10) : 0;
  const accountsEnd = Number.isFinite(parseInt(q.accountsEnd, 10)) ? parseInt(q.accountsEnd, 10) : 0;

  const payload = {
    month,
    capturedAt: now.toISOString(),
    stats: {
      monthVolume: Math.round(volume),
      commissionsGenerated: Math.round(commissions * 100) / 100,
      totalTradersActive: traders,
      accountsAtMonthEnd: accountsEnd,
      accountsAddedThisMonth: newAccounts,
      topTraders: []
    },
    sources: {
      mode: 'manual',
      note: 'Constructed manually from WEEX dashboard values'
    }
  };

  try {
    const pathname = await saveArchive(month, payload);
    return res.status(200).json({
      success: true,
      action: 'archived-manual',
      pathname,
      payload
    });
  } catch (err) {
    return res.status(200).json({
      success: false,
      error: err.message
    });
  }
}

// ---------- AUTO mode ----------
// Reads from WEEX to build the archive for the previous month.

async function handleAutoMode(req, res, now) {
  const targetMonth = req.query?.month || previousMonth(now);
  if (!isValidMonth(targetMonth)) {
    return res.status(400).json({ success: false, error: 'Invalid month param' });
  }

  const { startMs, endMs } = monthRangeMs(targetMonth);

  let monthUsers = [];
  let totalAccountsNow = 0;
  try { monthUsers = await aggregatePerUser({ fromMs: startMs, toMs: endMs }); } catch {}
  try { totalAccountsNow = await countAffiliates(); } catch {}

  const monthVolume = monthUsers.reduce((s, u) => s + u.totalVolume, 0);
  const monthCommissions = monthVolume * COMMISSION_RATE;

  const topMonth = monthUsers.slice(0, 10).map((u, i) => ({
    rank: i + 1,
    uid: u.uid,
    uidMasked: maskUid(u.uid),
    label: KNOWN_TRADERS[u.uid] || null,
    totalVolume: Math.round(u.totalVolume)
  }));

  const [year, mNum] = targetMonth.split('-').map(Number);
  const monthEnd = new Date(Date.UTC(year, mNum, 0));
  const baselineDate = new Date(Date.UTC(year, mNum - 1, 0));
  const endSnap = await findNearestSnapshot(toIsoDate(monthEnd));
  const startSnap = await findNearestSnapshot(toIsoDate(baselineDate));

  const accountsEndOfMonth = endSnap?.accounts ?? totalAccountsNow;
  const accountsStartOfMonth = startSnap?.accounts ?? 0;
  const accountsAdded = Math.max(0, accountsEndOfMonth - accountsStartOfMonth);

  const payload = {
    month: targetMonth,
    capturedAt: now.toISOString(),
    stats: {
      monthVolume: Math.round(monthVolume),
      commissionsGenerated: Math.round(monthCommissions * 100) / 100,
      totalTradersActive: monthUsers.length,
      accountsAtMonthEnd: accountsEndOfMonth,
      accountsAddedThisMonth: accountsAdded,
      topTraders: topMonth
    },
    sources: {
      mode: 'auto',
      endSnapshot: endSnap?.date || null,
      baselineSnapshot: startSnap?.date || null
    }
  };

  try {
    const pathname = await saveArchive(targetMonth, payload);
    return res.status(200).json({
      success: true,
      action: 'archived',
      pathname,
      payload
    });
  } catch (err) {
    return res.status(200).json({
      success: false,
      error: err.message
    });
  }
}

// ---------- HTTP handler ----------

export default async function handler(req, res) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers['authorization'];
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(500).json({ success: false, error: 'BLOB_READ_WRITE_TOKEN missing' });
  }

  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');

  const now = new Date();
  const mode = req.query?.mode;

  // ---- Manual mode ----
  if (mode === 'manual') {
    return await handleManualMode(req, res, now);
  }

  // ---- Auto mode (default): only act on the 1st or with force=true ----
  const isFirstOfMonth = now.getUTCDate() === 1;
  const forceRun = req.query?.force === 'true';
  if (!isFirstOfMonth && !forceRun) {
    return res.status(200).json({
      success: true, action: 'skipped',
      reason: 'Not the 1st of the month', today: toIsoDate(now)
    });
  }

  return await handleAutoMode(req, res, now);
}
