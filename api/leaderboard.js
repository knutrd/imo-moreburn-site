// ============================================================
//  /api/leaderboard.js
//  Returns the top 10 traders by total volume.
//  - Reads from Blob cache (populated by /api/stats cron)
//  - Falls back to live WEEX API if cache is missing
//  - Anonymizes UIDs by default, identifies KNOWN_TRADERS by label
// ============================================================

import { list } from '@vercel/blob';
import { aggregatePerUser, maskUid } from './_weex.js';
import { KNOWN_TRADERS } from './_known-traders.js';

const TOP_N = 10;
const LIVE_CACHE_PATH = 'live/current.json';

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

function decorateTop(raw) {
  return raw.slice(0, TOP_N).map((u, i) => {
    const knownLabel = KNOWN_TRADERS[u.uid];
    return {
      rank: i + 1,
      uidMasked: maskUid(u.uid),
      label: knownLabel || null,
      identified: Boolean(knownLabel),
      spotVolume: Math.round(u.spotVolume || 0),
      futuresVolume: Math.round(u.futuresVolume || 0),
      totalVolume: Math.round(u.totalVolume || 0)
    };
  });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=900');
  res.setHeader('Content-Type', 'application/json');

  // ---- Try cache first (instant, no WEEX call) ----
  const cache = await readLiveCache();
  if (cache && Array.isArray(cache.top) && cache.top.length > 0) {
    return res.status(200).json({
      success: true,
      updatedAt: cache.updatedAt,
      count: Math.min(cache.top.length, TOP_N),
      totalTraders: cache.totalTraders || cache.top.length,
      top: decorateTop(cache.top),
      source: 'cache'
    });
  }

  // ---- Fallback: live WEEX call (slower) ----
  try {
    const allUsers = await aggregatePerUser();
    return res.status(200).json({
      success: true,
      updatedAt: new Date().toISOString(),
      count: Math.min(allUsers.length, TOP_N),
      totalTraders: allUsers.length,
      top: decorateTop(allUsers),
      source: 'live-fallback'
    });
  } catch (err) {
    return res.status(200).json({
      success: false,
      error: err.message,
      updatedAt: new Date().toISOString(),
      top: []
    });
  }
}
