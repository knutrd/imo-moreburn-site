// ============================================================
//  /api/backfill-gap-v2.js  (TEMPORARY — DELETE AFTER USE)
//
//  Replaces the flat-zero backfill: for each day in the gap
//  (2026-08-31 through 2026-09-16), queries WEEX directly for
//  that SPECIFIC day's real volume (same method as the dayVolume
//  fix in stats.js) and writes it into the snapshot's dayVolume
//  field. This restores the small real bumps of activity that
//  did happen during the frozen-cache period, instead of showing
//  a hard flat line.
//
//  The cumulative "volume" field is left at the flat corrected
//  total (148,931,214) for these days — harmless, since the chart
//  now prefers dayVolume when present and only falls back to
//  diffing cumulative volume when dayVolume is missing.
//
//  Auth: ?secret=<CRON_SECRET>
//  Usage (call once):
//    https://www.imo-moreburn.com/api/backfill-gap-v2?secret=YOUR_CRON_SECRET
//
//  Runs sequentially with a short delay between days to be gentle
//  on the WEEX API. With 17 days to query it may take ~30-60s —
//  the response streams back once everything is done.
//
//  DELETE THIS FILE FROM THE REPO once you've confirmed the chart
//  looks right.
// ============================================================

import { put } from '@vercel/blob';
import { aggregatePerUser } from './_weex.js';

const CORRECTED_LIFETIME_VOLUME = 148931214;
const CORRECTED_ACCOUNTS = 377;

const GAP_DATES = [
  '2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03',
  '2026-09-04', '2026-09-05', '2026-09-06', '2026-09-07',
  '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11',
  '2026-09-12', '2026-09-13', '2026-09-14', '2026-09-15',
  '2026-09-16'
];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.query?.secret !== cronSecret) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(500).json({ success: false, error: 'BLOB_READ_WRITE_TOKEN missing' });
  }

  const results = [];

  for (const date of GAP_DATES) {
    const [y, m, d] = date.split('-').map(Number);
    const startMs = Date.UTC(y, m - 1, d, 0, 0, 0);
    const endMs = Date.UTC(y, m - 1, d + 1, 0, 0, 0) - 1;
    const month = date.slice(0, 7);

    let dayVolume = null;
    try {
      const users = await aggregatePerUser({ fromMs: startMs, toMs: endMs, label: `backfill-${date}` });
      dayVolume = Math.round(users.reduce((s, u) => s + u.totalVolume, 0));
    } catch (err) {
      results.push({ date, saved: false, error: `WEEX query failed: ${err.message}` });
      await sleep(200);
      continue;
    }

    const pathname = `snapshots/${date}.json`;
    const payload = {
      date,
      accounts: CORRECTED_ACCOUNTS,
      volume: CORRECTED_LIFETIME_VOLUME,
      monthVolume: 0,
      dayVolume,
      month,
      capturedAt: new Date().toISOString(),
      note: 'backfilled-real-day-volume'
    };

    try {
      await put(pathname, JSON.stringify(payload), {
        access: 'public', contentType: 'application/json',
        addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 3600
      });
      results.push({ date, saved: true, dayVolume });
    } catch (err) {
      results.push({ date, saved: false, error: err.message });
    }

    await sleep(200);
  }

  return res.status(200).json({ success: true, results });
}
