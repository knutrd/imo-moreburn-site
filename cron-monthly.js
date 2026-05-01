// ============================================================
//  /api/cron-monthly.js
//  Builds a monthly archive snapshot of all key stats.
//
//  Run daily by cron (cron-job.org). Only acts if today is the 1st of the month.
//  On the 1st, it archives the PREVIOUS month into months/YYYY-MM.json on Blob.
//
//  Auth: requires Bearer CRON_SECRET (same secret as /api/stats refresh).
// ============================================================

import { put, list } from '@vercel/blob';
import { aggregatePerUser, countAffiliates, maskUid } from './_weex.js';

const COMMISSION_RATE = 0.0007088 * 0.75;  // observed WEEX fee 0.0709% × 75% rebate

// Format a Date as YYYY-MM-DD (UTC)
function toIsoDate(d) {
  return d.toISOString().slice(0, 10);
}

// Format a Date as YYYY-MM (UTC)
function toIsoMonth(d) {
  return d.toISOString().slice(0, 7);
}

// Get the previous month string (YYYY-MM) given a reference date.
function previousMonth(ref) {
  const d = new Date(ref);
  d.setUTCDate(1);                    // first day of current month
  d.setUTCDate(0);                    // last day of previous month
  return toIsoMonth(d);
}

// Fetch all daily snapshots from Blob and find the value for a given date.
// Returns { accounts, volume } or null if not found.
async function findSnapshotForDate(targetDate) {
  try {
    const result = await list({ prefix: `snapshots/${targetDate}`, limit: 5 });
    if (!result.blobs || result.blobs.length === 0) return null;
    const blob = result.blobs[0];
    const r = await fetch(blob.url);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

// Find the daily snapshot CLOSEST to a given date (looking backward).
// Useful if no snapshot was taken exactly on that day (e.g., cron failure).
async function findNearestSnapshot(targetDate, maxLookbackDays = 7) {
  let cursor = new Date(targetDate + 'T00:00:00Z');
  for (let i = 0; i < maxLookbackDays; i++) {
    const iso = toIsoDate(cursor);
    const snap = await findSnapshotForDate(iso);
    if (snap) return snap;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return null;
}

export default async function handler(req, res) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers['authorization'];
  const isAuthorized = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isAuthorized) {
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

  // Skip silently on non-archival days
  if (!isFirstOfMonth && !forceRun) {
    return res.status(200).json({
      success: true,
      action: 'skipped',
      reason: 'Not the 1st of the month',
      today: toIsoDate(now)
    });
  }

  try {
    // Determine which month we're archiving
    const targetMonth = req.query?.month || previousMonth(now);  // YYYY-MM
    const archivePath = `months/${targetMonth}.json`;

    // Get start and end dates of the target month
    const [year, monthNum] = targetMonth.split('-').map(Number);
    const monthStart = new Date(Date.UTC(year, monthNum - 1, 1));
    const monthEnd = new Date(Date.UTC(year, monthNum, 0));  // last day of target month

    // Fetch the daily snapshot for the LAST day of the target month
    const endSnapshot = await findNearestSnapshot(toIsoDate(monthEnd));
    // Fetch the daily snapshot from the LAST day of the PREVIOUS month (= start baseline)
    const baselineDate = new Date(monthStart);
    baselineDate.setUTCDate(0);  // last day of previous-previous month
    const startSnapshot = await findNearestSnapshot(toIsoDate(baselineDate));

    // Compute month-only deltas
    const totalAccounts = endSnapshot?.accounts ?? 0;
    const totalVolume = endSnapshot?.volume ?? 0;
    const startAccounts = startSnapshot?.accounts ?? 0;
    const startVolume = startSnapshot?.volume ?? 0;

    const monthVolume = Math.max(0, totalVolume - startVolume);
    const monthAccountsAdded = Math.max(0, totalAccounts - startAccounts);
    const monthCommissions = monthVolume * COMMISSION_RATE;

    // Get the current top traders (best we can do retrospectively without time-windowed API)
    let topTraders = [];
    let totalTraders = 0;
    try {
      const allUsers = await aggregatePerUser();
      totalTraders = allUsers.length;
      topTraders = allUsers.slice(0, 10).map((u, i) => ({
        rank: i + 1,
        uidMasked: maskUid(u.uid),
        totalVolume: Math.round(u.totalVolume)
      }));
    } catch (err) {
      // Non-blocking: archive without top traders if WEEX API fails
    }

    const payload = {
      month: targetMonth,
      capturedAt: now.toISOString(),
      stats: {
        totalAccounts,
        accountsAddedThisMonth: monthAccountsAdded,
        totalVolume,
        monthVolume,
        commissionsGenerated: Math.round(monthCommissions * 100) / 100,
        totalTraders,
        topTraders
      },
      sources: {
        endSnapshot: endSnapshot?.date || null,
        baselineSnapshot: startSnapshot?.date || null
      }
    };

    await put(archivePath, JSON.stringify(payload, null, 2), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 3600
    });

    return res.status(200).json({
      success: true,
      action: 'archived',
      pathname: archivePath,
      payload
    });
  } catch (err) {
    return res.status(200).json({
      success: false,
      error: err.message,
      capturedAt: now.toISOString()
    });
  }
}
