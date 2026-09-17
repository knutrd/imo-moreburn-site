// ============================================================
//  /api/history.js
//  Returns the full historical timeline of WEEX stats
//  (one entry per day, accumulated by /api/stats cron snapshots)
//
//  Public endpoint, cached 5 min.
// ============================================================

import { list } from '@vercel/blob';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=86400');
  res.setHeader('Content-Type', 'application/json');

  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return res.status(200).json({
        success: false,
        error: 'Blob storage not configured',
        snapshots: []
      });
    }

    // List all blobs under "snapshots/"
    const all = [];
    let cursor;
    do {
      const result = await list({ cursor, prefix: 'snapshots/', limit: 1000 });
      for (const blob of result.blobs) {
        all.push(blob);
      }
      cursor = result.cursor;
    } while (cursor);

    // Fetch JSON content of each snapshot in parallel
    const snapshots = await Promise.all(all.map(async blob => {
      try {
        const r = await fetch(blob.url);
        if (!r.ok) return null;
        return await r.json();
      } catch {
        return null;
      }
    }));

    // Filter out nulls and sort by date ascending
    const valid = snapshots
      .filter(s => s && s.date && typeof s.accounts === 'number')
      .sort((a, b) => a.date.localeCompare(b.date));

    // FIX: "accounts" (registered WEEX affiliates) can only ever grow.
    // A handful of past snapshots recorded a lower value than the day
    // before, caused by a transient WEEX API read glitch. Rather than
    // rewriting the stored blobs, apply a running maximum here so the
    // public-facing curve is guaranteed monotonically non-decreasing —
    // this is safe to re-run any time and never invents data, it only
    // ever raises a value up to the highest one already seen.
    let runningMax = 0;
    const corrected = valid.map(s => {
      runningMax = Math.max(runningMax, s.accounts);
      return { ...s, accounts: runningMax };
    });

    return res.status(200).json({
      success: true,
      count: corrected.length,
      snapshots: corrected
    });
  } catch (err) {
    return res.status(200).json({
      success: false,
      error: err.message,
      snapshots: []
    });
  }
}
