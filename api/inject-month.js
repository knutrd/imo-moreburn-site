// ============================================================
//  /api/inject-month.js  (TEMPORARY — DELETE AFTER USE)
//
//  One-shot endpoint that archives April and May 2026 from
//  hardcoded WEEX dashboard values. No auth required for ease
//  of use, but values are hardcoded so this endpoint can't be
//  abused to write arbitrary data.
//
//  Usage:
//    https://www.imo-moreburn.com/api/inject-month?month=2026-04
//    https://www.imo-moreburn.com/api/inject-month?month=2026-05
//
//  Once both months are archived, DELETE this file from the repo.
// ============================================================

import { put } from '@vercel/blob';

const ARCHIVES = {
  '2026-04': {
    month: '2026-04',
    capturedAt: '2026-05-01T00:00:00.000Z',
    stats: {
      monthVolume: 323736,
      commissionsGenerated: 113.82,
      totalTradersActive: 6,
      accountsAtMonthEnd: 30,
      accountsAddedThisMonth: 30,
      topTraders: []
    },
    sources: {
      mode: 'manual-inject',
      note: 'WEEX dashboard values (April 2026)'
    }
  },
  '2026-05': {
    month: '2026-05',
    capturedAt: '2026-06-01T00:00:00.000Z',
    stats: {
      monthVolume: 67558531,
      commissionsGenerated: 21105.75,
      totalTradersActive: 44,
      accountsAtMonthEnd: 354,
      accountsAddedThisMonth: 324,
      topTraders: []
    },
    sources: {
      mode: 'manual-inject',
      note: 'WEEX dashboard values (May 2026)'
    }
  }
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');

  const month = req.query?.month;
  if (!month || !ARCHIVES[month]) {
    return res.status(400).json({
      success: false,
      error: 'Invalid or missing "month" param',
      available: Object.keys(ARCHIVES)
    });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(500).json({
      success: false,
      error: 'BLOB_READ_WRITE_TOKEN missing'
    });
  }

  try {
    const payload = ARCHIVES[month];
    const pathname = `months/${month}.json`;
    await put(pathname, JSON.stringify(payload, null, 2), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 3600
    });
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
