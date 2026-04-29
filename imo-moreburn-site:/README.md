# IMO MoreBurn

Static landing page with hourly auto-refresh of WEEX affiliate stats
through a Vercel cron job.

---

## File structure

```
.
├── index.html        ← the site (don't edit unless changing design)
├── data.js           ← static defaults + burns registry (edit manually)
├── imo-logo.png      ← logo file (must stay next to index.html)
├── api/
│   └── stats.js      ← serverless function: fetches WEEX data
├── vercel.json       ← cron config (1x hourly)
├── package.json      ← Node.js project metadata
└── README.md         ← this file
```

---

## How the data flows

1. **Visitor opens the site** → `index.html` loads.
2. The page reads `data.js` first (static defaults + burns registry).
3. Then it calls `/api/stats` to get the live WEEX numbers.
4. If the call succeeds, the live values overwrite the static ones
   (accounts, 48h volume, pending commissions).
5. If the call fails (WEEX API down, cold cache), the page keeps
   showing the values from `data.js` - no broken UI.

The serverless function `/api/stats` is cached by the Vercel CDN for
**15 minutes**. To keep the cache warm and the data fresh:

- **Every 15 minutes**, [cron-job.org](https://cron-job.org) (free)
  pings the endpoint with `?refresh=true` and a Bearer token, forcing
  a fresh fetch from WEEX and updating the cache.
- **Once daily** at 8:00 UTC, a Vercel cron does the same as a backup.

The endpoint is protected: refresh requests without the correct Bearer
token return 401 Unauthorized. Public reads (without `?refresh`) are
served from cache and do not require authentication.

---

## What's automated vs. manual

| Field | Source | Action needed |
|---|---|---|
| Accounts signed up via your link | WEEX API (auto) | Nothing |
| 48h volume traded | WEEX API (auto) | Nothing |
| Pending commissions | WEEX API (auto) | Nothing |
| Total IMO burned | `data.js` (manual) | Update after each burn |
| Number of burns done | `data.js` (manual) | Update after each burn |
| Burns registry table | `data.js` (manual) | Add an entry per burn |
| Burn chart | Auto from registry | Built from your registry entries |

---

## Initial deployment on Vercel

### 1. Push the project to GitHub

Create a new GitHub repo (e.g. `imo-moreburn-site`) and push these files.

### 2. Import the repo into Vercel

- Go to [vercel.com](https://vercel.com), sign in.
- Click **Add New → Project → Import Git Repository**.
- Pick your repo, click **Deploy**. The first deploy takes 30 seconds.

### 3. Add your WEEX API credentials as environment variables

In your Vercel project: **Settings → Environment Variables**.
Add these 4 variables (Production + Preview + Development):

| Name | Value |
|---|---|
| `WEEX_API_KEY` | your WEEX ACCESS-KEY |
| `WEEX_API_SECRET` | your WEEX ACCESS-SECRET |
| `WEEX_API_PASSPHRASE` | the passphrase you chose when creating the key |
| `CRON_SECRET` | any random string of 32+ characters |

After adding the variables, redeploy: **Deployments → ⋯ on the latest deploy → Redeploy**.

### 4. Verify the cron job

In Vercel: **Settings → Cron Jobs**. You should see one entry:
`/api/stats?refresh=true` running at `0 8 * * *` (daily at 8:00 UTC).
This is the **backup** cron, in case cron-job.org is unreachable.

You can also manually trigger it: **Run cron job now**.

### 5. Set up the 15-minute refresh on cron-job.org

This is what gives the site its "near real-time" feel without paying
for Vercel Pro. Free tier on cron-job.org allows unlimited jobs at
1-minute granularity.

1. Sign up on [cron-job.org](https://cron-job.org) (free, no credit card).
2. Click **Create cronjob**.
3. Configure:
   - **Title**: `IMO MoreBurn - refresh WEEX stats`
   - **URL**: `https://imo-moreburn.com/api/stats?refresh=true`
   - **Schedule**: Every 15 minutes (use the visual scheduler or `*/15 * * * *`)
4. Open the **Advanced** tab:
   - **Request method**: GET
   - **Headers**: add a custom header
     - Name: `Authorization`
     - Value: `Bearer <paste your CRON_SECRET here>`
5. Save the job.

That's it. Every 15 minutes, cron-job.org pings your endpoint with the
correct Bearer token, your serverless function calls WEEX, the result is
written into the Vercel CDN cache, and visitors get fresh data within 15
minutes of any change.

If cron-job.org is ever down, the daily Vercel backup cron still keeps
the data updated at least once a day.

### 6. Connect a custom domain (optional)

**Settings → Domains → Add**. Point your domain (e.g. `imo-burn.com`)
to Vercel via the DNS records they show. Propagation: 5 to 30 minutes.

---

## How to generate WEEX API keys

1. Sign in on weex.com with your affiliate account.
2. Top right: avatar → **API Management**.
3. Create a new API key.
4. Permissions: **Read-only** (do NOT enable Trade or Withdraw).
5. IP whitelist: leave empty for now (you can add the Vercel egress
   IPs later if you want extra security).
6. WEEX shows you 3 values to copy **immediately**:
   - `ACCESS-KEY`
   - `ACCESS-SECRET`
   - `ACCESS-PASSPHRASE` (you choose this one)

Paste them into Vercel as described above. Never commit them to Git.

---

## Updating burns (manual, monthly)

When you execute a burn transaction on Basescan, it may include multiple
sources in a single tx (WEEX fees + real estate revenues + ecosystem
surplus). On this site, you only track the WEEX share.

After each burn:

1. Open `data.js`.
2. Add a new object at the top of the `burns` array:

```javascript
burns: [
  {
    date: "15/05/2026",                     // DD/MM/YYYY
    amount: "5,230 IMO",                    // WEEX share only (shown in chart)
    txTotalAmount: "12,500 IMO",            // optional: full tx amount, for transparency
    txHash: "0xabc123...def456",
    txUrl: "https://basescan.org/tx/0xabc123...",
    source: "WEEX",
    type: "Burn"
  },
  // older burns below
],
```

The `amount` field is what shows up in the chart and the totals.
The optional `txTotalAmount` is shown as a small annotation under the
amount, so visitors can verify the on-chain tx and understand why the
numbers may differ.

3. Update the top metrics:

```javascript
metrics: {
  totalBurned: "5,230",       // sum of WEEX-share burns
  totalBurns: "1",            // number of burn transactions
  futuresFeeShare: "75%",
  cadence: "Monthly"
}
```

4. Commit and push:

```bash
git add data.js
git commit -m "Add burn 15/05: 5,230 IMO (WEEX share)"
git push
```

Vercel redeploys automatically.

---

## Modifying the design

Colors are defined at the top of `index.html` in the `:root` CSS variables:

```css
--bg: #ffffff;
--ink: #0a0a0a;
--ink-soft: #4a4a4a;
--bg-soft: #fafaf8;
```

---

## Local development (optional)

Install Vercel CLI: `npm i -g vercel`.

In the project folder: `vercel dev`.
This runs the site + the serverless function locally on `http://localhost:3000`.
You'll need a `.env.local` file with the same variables as in Vercel.

---

Trade. Buy. Burn.
