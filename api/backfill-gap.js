// ============================================================
//  /api/backfill-gap.js  (TEMPORARY — DELETE AFTER USE)
//
//  Two fixes in one, both writing the same corrected flat total
//  (148,931,214) directly into Blob-stored daily snapshots:
//
//  1. Fills the missing daily snapshots between 2026-09-04 and
//     2026-09-16 (inclusive) — the period during which the cron
//     was stuck on a frozen cache and never wrote a snapshot.
//
//  2. Overwrites 2026-09-01 to 2026-09-03 — the snapshot(s)
//     responsible for the fake "$27.7M traded on 02/09/2026" bar
//     in the volume chart. That figure came from the OLD, buggy
//     aggregation code (the one that produced the inflated
//     175,267,272 lifetime total we later corrected) — the user
//     confirmed no such volume actually traded that day. Setting
//     these days to the same corrected total as their neighbors
//     makes their delta 0, removing the fake spike entirely
//     instead of just visually pushing it aside.
//
//  Auth: ?secret=<CRON_SECRET> (same convention as /api/stats?debug=true)
//
//  Usage (call once):
//    https://www.imo-moreburn.com/api/backfill-gap?secret=YOUR_CRON_SECRET
//
//  DELETE THIS FILE FROM THE REPO once you've confirmed the chart
//  looks right — it writes to fixed, hardcoded dates so re-running
//  it is harmless, but it has no reason to stay in the codebase.
// ============================================================

import { put } from '@vercel/blob';

const CORRECTED_LIFETIME_VOLUME = 148931214; // the corrected total as of the Sept 17 fix
const CORRECTED_ACCOUNTS = 377;
const MONTH_LABEL = '2026-09';

const GAP_DATES = [
  // Overwrite the source of the fake spike, plus the day before it
  // for safety (in case the jump actually straddles two entries).
  '2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03',
  // Fill the real gap left by the frozen cron.
  '2026-09-04', '2026-09-05', '2026-09-06', '2026-09-07',
  '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11',
  '2026-09-12', '2026-09-13', '2026-09-14', '2026-09-15',
  '2026-09-16'
];

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
    const pathname = `snapshots/${date}.json`;
    const payload = {
      date,
      accounts: CORRECTED_ACCOUNTS,
      volume: CORRECTED_LIFETIME_VOLUME,
      monthVolume: 0, // unknown for these backfilled days; not used by the volume chart
      month: MONTH_LABEL,
      capturedAt: new Date().toISOString(),
      note: 'backfilled-gap-flat-value'
    };
    try {
      await put(pathname, JSON.stringify(payload), {
        access: 'public', contentType: 'application/json',
        addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 3600
      });
      results.push({ date, saved: true });
    } catch (err) {
      results.push({ date, saved: false, error: err.message });
    }
  }

  return res.status(200).json({ success: true, results });
}
