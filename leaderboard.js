// ============================================================
//  /api/leaderboard.js
//  Returns the top 10 traders by total volume.
//  - Anonymized UIDs by default (e.g. "261***3333")
//  - Known traders displayed by their public label (consented)
//
//  Cached 15 minutes on the CDN.
// ============================================================

import { aggregatePerUser, maskUid } from './_weex.js';
import { KNOWN_TRADERS } from './_known-traders.js';

const TOP_N = 10;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=86400');
  res.setHeader('Content-Type', 'application/json');

  try {
    const allUsers = await aggregatePerUser();

    const top = allUsers.slice(0, TOP_N).map((u, i) => {
      const knownLabel = KNOWN_TRADERS[u.uid];
      return {
        rank: i + 1,
        uidMasked: maskUid(u.uid),
        label: knownLabel || null,           // public label if trader consented
        identified: Boolean(knownLabel),     // true if displayed by name
        spotVolume: Math.round(u.spotVolume),
        futuresVolume: Math.round(u.futuresVolume),
        totalVolume: Math.round(u.totalVolume)
      };
    });

    return res.status(200).json({
      success: true,
      updatedAt: new Date().toISOString(),
      count: top.length,
      totalTraders: allUsers.length,
      top
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
