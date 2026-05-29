// ============================================================
//  /api/months.js
//  Lists all monthly archives (one entry per past month).
//  Public, cached 1h.
// ============================================================

import { list } from '@vercel/blob';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
  res.setHeader('Content-Type', 'application/json');

  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return res.status(200).json({
        success: false, error: 'Blob not configured', months: []
      });
    }

    // List all blobs under months/
    const all = [];
    let cursor;
    do {
      const result = await list({ cursor, prefix: 'months/', limit: 1000 });
      for (const blob of result.blobs) all.push(blob);
      cursor = result.cursor;
    } while (cursor);

    // Fetch JSON content of each archive in parallel
    const months = await Promise.all(all.map(async blob => {
      try {
        const r = await fetch(blob.url);
        if (!r.ok) return null;
        return await r.json();
      } catch { return null; }
    }));

    const valid = months
      .filter(m => m && m.month && m.stats)
      .sort((a, b) => b.month.localeCompare(a.month));  // most recent first

    return res.status(200).json({
      success: true,
      count: valid.length,
      months: valid
    });
  } catch (err) {
    return res.status(200).json({
      success: false, error: err.message, months: []
    });
  }
}
