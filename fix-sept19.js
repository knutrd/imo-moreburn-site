// ============================================================
//  /api/fix-sept19.js  (TEMPORARY — DELETE AFTER USE)
//
//  The 2026-09-19 daily snapshot recorded an inflated lifetime
//  volume total (a one-off noisy recomputation from re-summing
//  ~360 days of WEEX history from scratch on every cron run —
//  small % swings between runs are expected and normally harmless,
//  but this one happened to land inside a daily snapshot, showing
//  up as a fake $9.4M single-day spike in the volume chart).
//
//  Fix: overwrite that one day with a value linearly interpolated
//  between the two known-good snapshots on either side of it
//  (2026-09-17: 148,931,214 and 2026-09-21: 150,520,095).
//
//  Auth: ?secret=<CRON_SECRET>
//  Usage (call once):
//    https://www.imo-moreburn.com/api/fix-sept19?secret=YOUR_CRON_SECRET
//
//  DELETE THIS FILE FROM THE REPO once you've confirmed the chart
//  looks right.
// ============================================================

import { put } from '@vercel/blob';

const GOOD_BEFORE = { date: '2026-09-17', volume: 148931214 };
const GOOD_AFTER  = { date: '2026-09-21', volume: 150520095 };
const TARGET_DATE = '2026-09-19'; // exactly halfway between the two above

// Linear interpolation at the halfway point.
const INTERPOLATED_VOLUME = Math.round(
  GOOD_BEFORE.volume + (GOOD_AFTER.volume - GOOD_BEFORE.volume) * 0.5
);

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

  const pathname = `snapshots/${TARGET_DATE}.json`;
  const payload = {
    date: TARGET_DATE,
    accounts: 377,
    volume: INTERPOLATED_VOLUME,
    monthVolume: 0, // not used by the volume chart
    month: '2026-09',
    capturedAt: new Date().toISOString(),
    note: 'interpolated-fix-for-noisy-recompute-spike'
  };

  try {
    await put(pathname, JSON.stringify(payload), {
      access: 'public', contentType: 'application/json',
      addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 3600
    });
    return res.status(200).json({ success: true, pathname, payload });
  } catch (err) {
    return res.status(200).json({ success: false, error: err.message });
  }
}
