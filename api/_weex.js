// ============================================================
//  /api/_weex.js
//  Shared WEEX helpers: signed requests + aggregated data fetch.
//  The leading underscore prevents Vercel from treating this
//  as a public endpoint (only stats.js and leaderboard.js consume it).
// ============================================================

import crypto from 'crypto';

const WEEX_API = 'https://api-spot.weex.com';

function signRequest(timestamp, method, requestPath, body, secret) {
  const message = timestamp + method.toUpperCase() + requestPath + (body || '');
  return crypto.createHmac('sha256', secret).update(message).digest('base64');
}

export async function callWeex(path, method = 'GET', body = '') {
  const apiKey = process.env.WEEX_API_KEY;
  const apiSecret = process.env.WEEX_API_SECRET;
  const passphrase = process.env.WEEX_API_PASSPHRASE;

  if (!apiKey || !apiSecret || !passphrase) {
    throw new Error('WEEX API credentials missing');
  }

  const timestamp = Date.now().toString();
  const sign = signRequest(timestamp, method, path, body, apiSecret);

  const response = await fetch(`${WEEX_API}${path}`, {
    method,
    headers: {
      'ACCESS-KEY': apiKey,
      'ACCESS-SIGN': sign,
      'ACCESS-PASSPHRASE': passphrase,
      'ACCESS-TIMESTAMP': timestamp,
      'Content-Type': 'application/json',
      'locale': 'en-US'
    },
    body: method !== 'GET' ? body : undefined
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`WEEX API ${path} ${response.status}: ${text.substring(0, 300)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`WEEX API ${path} returned non-JSON: ${text.substring(0, 300)}`);
  }
}

// Total registered affiliates (lifetime cumulative)
export async function countAffiliates() {
  try {
    const resp = await callWeex('/api/v3/rebate/affiliate/getAffiliateUIDs?page=1&pageSize=1');
    const total = resp?.total ?? resp?.data?.total;
    if (typeof total === 'number') return total;
    const list = resp?.channelUserInfoItemList || resp?.data?.channelUserInfoItemList || [];
    return list.length;
  } catch {
    return 0;
  }
}

// Aggregate per-user trading data.
// Without args: last 360 days (lifetime cumulative).
// With { fromMs, toMs }: only that range, split into 90-day chunks if needed.
// Returns array of { uid, spotVolume, futuresVolume, totalVolume } sorted desc.
export async function aggregatePerUser(opts = {}) {
  const userMap = new Map();
  const windowSize = 90 * 24 * 60 * 60 * 1000;

  // Build the list of windows to fetch
  const windows = [];
  if (opts.fromMs && opts.toMs) {
    // Custom range: split into 90-day chunks
    let cursor = opts.toMs;
    while (cursor > opts.fromMs) {
      const start = Math.max(opts.fromMs, cursor - windowSize + 1);
      windows.push({ startTime: start, endTime: cursor });
      cursor = start - 1;
    }
  } else {
    // Default: last 360 days
    const now = Date.now();
    for (let i = 0; i < 4; i++) {
      const endTime = now - i * windowSize;
      const startTime = endTime - windowSize + 1;
      windows.push({ startTime, endTime });
    }
  }

  for (const { startTime, endTime } of windows) {
    let page = 1;
    let consecutiveErrors = 0;

    while (true) {
      const path = `/api/v3/rebate/affiliate/getChannelUserTradeAndAsset?startTime=${startTime}&endTime=${endTime}&page=${page}&pageSize=100`;
      let resp;
      let errored = false;
      try {
        resp = await callWeex(path);
        consecutiveErrors = 0;
      } catch (err) {
        errored = true;
        consecutiveErrors += 1;
        // Retry up to 3 times with a short delay before giving up on this window
        if (consecutiveErrors <= 3) {
          await new Promise(r => setTimeout(r, 500 * consecutiveErrors));
          continue;  // retry the same page
        }
        // After 3 retries, log and break this window's loop (move to next window)
        console.warn('[aggregatePerUser] Window failed after retries', { startTime, endTime, page, error: err.message });
        break;
      }
      if (errored) continue;
      const records = resp?.records || resp?.data?.records || [];
      if (records.length === 0) break;

      for (const r of records) {
        if (!r.uid) continue;
        const spot = parseFloat(r.spotTradingAmount || 0);
        const futures = parseFloat(r.futuresTradingAmount || 0);
        const existing = userMap.get(r.uid) || { uid: r.uid, spotVolume: 0, futuresVolume: 0 };
        existing.spotVolume += spot;
        existing.futuresVolume += futures;
        userMap.set(r.uid, existing);
      }

      const totalPages = resp?.pages || resp?.data?.pages || 1;
      if (page >= totalPages) break;
      page += 1;
    }
  }

  // Build sorted list
  const list = [];
  for (const u of userMap.values()) {
    const total = u.spotVolume + u.futuresVolume;
    if (total > 0) {
      list.push({
        uid: u.uid,
        spotVolume: u.spotVolume,
        futuresVolume: u.futuresVolume,
        totalVolume: total
      });
    }
  }
  list.sort((a, b) => b.totalVolume - a.totalVolume);
  return list;
}

// Mask a UID for privacy: keep first 3 + last 4 digits, mask the middle.
//   "7606813926" -> "760***3926"
export function maskUid(uid) {
  const s = String(uid);
  if (s.length <= 7) return s;
  return s.slice(0, 3) + '***' + s.slice(-4);
}
