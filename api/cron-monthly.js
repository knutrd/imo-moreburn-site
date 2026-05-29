// ============================================================
//  /api/cron-monthly.js
//  Runs daily. On the 1st of the month, archives the previous
//  month into Blob: months/YYYY-MM.json
//
//  Auth: Bearer CRON_SECRET (same secret as /api/stats refresh)
//  Force a run anytime: ?force=true&month=YYYY-MM
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
  d.setUTCDate(0);  // last day of previous month
  return toIsoMonth(d);
}

// Range in ms for a YYYY-MM string
function monthRangeMs(monthStr) {
  const [year, m] = monthStr.split('-').map(Number);
  const startMs = Date.UTC(year, m - 1, 1, 0, 0, 0);
  const endMs = Date.UTC(year, m, 1, 0, 0, 0) - 1;  // last ms of the month
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
  const isFirstOfMonth = now.getUTCDate() === 1;
  const forceRun = req.query?.force === 'true';

  if (!isFirstOfMonth && !forceRun) {
    return res.status(200).json({
      success: true, action: 'skipped',
      reason: 'Not the 1st of the month', today: toIsoDate(now)
    });
  }

  try {
    const targetMonth = req.query?.month || previousMonth(now);  // YYYY-MM
    const archivePath = `months/${targetMonth}.json`;
    const { startMs, endMs } = monthRangeMs(targetMonth);

    // Fetch per-user data for ONLY that month from WEEX
    let monthUsers = [];
    let totalAccountsNow = 0;
    try {
      monthUsers = await aggregatePerUser({ fromMs: startMs, toMs: endMs });
    } catch {}
    try {
      totalAccountsNow = await countAffiliates();
    } catch {}

    const monthVolume = monthUsers.reduce((s, u) => s + u.totalVolume, 0);
    const monthCommissions = monthVolume * COMMISSION_RATE;

    // Top 10 of that month
    const topMonth = monthUsers.slice(0, 10).map((u, i) => ({
      rank: i + 1,
      uid: u.uid,                            // kept for internal use
      uidMasked: maskUid(u.uid),
      label: KNOWN_TRADERS[u.uid] || null,
      totalVolume: Math.round(u.totalVolume)
    }));

    // Account snapshots at month boundaries (best effort from daily snapshots)
    const [year, mNum] = targetMonth.split('-').map(Number);
    const monthEnd = new Date(Date.UTC(year, mNum, 0));
    const baselineDate = new Date(Date.UTC(year, mNum - 1, 0));  // last day of previous month
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
        endSnapshot: endSnap?.date || null,
        baselineSnapshot: startSnap?.date || null
      }
    };

    await put(archivePath, JSON.stringify(payload, null, 2), {
      access: 'public', contentType: 'application/json',
      addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 3600
    });

    return res.status(200).json({
      success: true, action: 'archived',
      pathname: archivePath, payload
    });
  } catch (err) {
    return res.status(200).json({
      success: false, error: err.message,
      capturedAt: now.toISOString()
    });
  }
}
