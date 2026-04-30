// ============================================================
//  IMO MoreBurn - Site data
// ============================================================
//  This is the ONLY file you need to edit to update the numbers.
//  Once edited, save and push to GitHub: Vercel will redeploy automatically.
// ============================================================

window.SITE_DATA = {

  // ----------------------------------------------------------
  //  MAIN METRICS (top of the site, just below the hero)
  // ----------------------------------------------------------
  metrics: {
    totalBurned: "0",          // ex: "12,450" - total IMO tokens burned
    totalBurns: "0",           // ex: "3" - number of burn transactions executed
    futuresFeeShare: "75%",    // share of futures fees rebated by WEEX
    cadence: "Monthly"         // "Weekly" / "Monthly" / "Quarterly"
  },

  // ----------------------------------------------------------
  //  WEEX CARD (Partnership section)
  // ----------------------------------------------------------
  weex: {
    sinceDate: "Since April 2026",       // partnership start date
    accounts: "0",                        // accounts signed up via your link (WEEX dashboard)
    volume48h: "$0",                      // 48h volume traded by your referrals
    commissionsPending: "$0",             // commissions accumulated, ready to burn
    imoBurnedViaWeex: "0",                // IMO already burned via WEEX fees
    feesFutures: "75%",                   // futures fees rebate share
    feesSpot: "75%",                      // spot fees rebate share
    burnAllocation: "50%"                 // minimum committed to buy & burn (can go up to 100%)
  },

  // ----------------------------------------------------------
  //  AFFILIATES HISTORY (chart in the WEEX section)
  // ----------------------------------------------------------
  //  Add a new entry every week (or whenever you want to update the chart).
  //  The chart displays the evolution over time, like a stock curve.
  //  Leave the array EMPTY [] if you want to hide the chart for now.
  // ----------------------------------------------------------
  affiliatesHistory: [
    // Daily cumulative count of registered accounts.
    // Update with the latest snapshot every day to keep the curve current.
    { date: "08/04/2026", accounts: 0 },
    { date: "09/04/2026", accounts: 2 },
    { date: "10/04/2026", accounts: 2 },
    { date: "11/04/2026", accounts: 2 },
    { date: "12/04/2026", accounts: 2 },
    { date: "13/04/2026", accounts: 2 },
    { date: "14/04/2026", accounts: 2 },
    { date: "15/04/2026", accounts: 2 },
    { date: "16/04/2026", accounts: 2 },
    { date: "17/04/2026", accounts: 3 },
    { date: "18/04/2026", accounts: 3 },
    { date: "19/04/2026", accounts: 3 },
    { date: "20/04/2026", accounts: 3 },
    { date: "21/04/2026", accounts: 3 },
    { date: "22/04/2026", accounts: 3 },
    { date: "23/04/2026", accounts: 3 },
    { date: "24/04/2026", accounts: 3 },
    { date: "25/04/2026", accounts: 4 },
    { date: "26/04/2026", accounts: 5 },
    { date: "27/04/2026", accounts: 6 },
    { date: "28/04/2026", accounts: 12 },
    { date: "29/04/2026", accounts: 27 },
    { date: "30/04/2026", accounts: 30 },
  ],

  // ----------------------------------------------------------
  //  VOLUME HISTORY (bar chart in the WEEX section)
  // ----------------------------------------------------------
  //  Cumulative trading volume in USD, one entry per day.
  //  The bar chart shows the DAILY delta (today minus yesterday).
  //  Add a new line every day with the latest cumulative total
  //  (you can read it from /api/stats live response).
  // ----------------------------------------------------------
  volumeHistory: [
    { date: "08/04/2026", volume: 0 },
    { date: "09/04/2026", volume: 0 },
    { date: "10/04/2026", volume: 0 },
    { date: "11/04/2026", volume: 0 },
    { date: "12/04/2026", volume: 0 },
    { date: "13/04/2026", volume: 0 },
    { date: "14/04/2026", volume: 0 },
    { date: "15/04/2026", volume: 0 },
    { date: "16/04/2026", volume: 0 },
    { date: "17/04/2026", volume: 0 },
    { date: "18/04/2026", volume: 0 },
    { date: "19/04/2026", volume: 0 },
    { date: "20/04/2026", volume: 0 },
    { date: "21/04/2026", volume: 0 },
    { date: "22/04/2026", volume: 0 },
    { date: "23/04/2026", volume: 0 },
    { date: "24/04/2026", volume: 0 },
    { date: "25/04/2026", volume: 0 },
    { date: "26/04/2026", volume: 0 },
    { date: "27/04/2026", volume: 48074 },
    { date: "28/04/2026", volume: 132674 },
    { date: "29/04/2026", volume: 226880 },
    { date: "30/04/2026", volume: 278676 },
  ],

  // ----------------------------------------------------------
  //  BURN REGISTRY
  // ----------------------------------------------------------
  //  Each entry represents the WEEX share of an on-chain burn transaction.
  //
  //  Important: each on-chain tx may include multiple burn sources
  //  (WEEX fees + real estate revenues + other). The "amount" field below
  //  is the share that comes from WEEX fees only - the part this site
  //  tracks. The "txTotalAmount" field (optional) is the full amount in
  //  the transaction, for transparency.
  //
  //  The "usdAmount" field is the dollar value of "amount" at the time of
  //  the burn. It feeds the "USD burned" metric (auto-summed across burns).
  //
  //  Leave the array EMPTY [] until your first burn.
  // ----------------------------------------------------------
  burns: [
    // Example to duplicate after your first burn:
    // {
    //   date: "15/05/2026",                  // DD/MM/YYYY
    //   amount: "5,230 IMO",                 // share burned via WEEX fees (shown in chart)
    //   usdAmount: 487,                      // dollar value of "amount" at burn time (number, no $)
    //   txTotalAmount: "12,500 IMO",         // optional: full burn in this tx (WEEX + real estate + ...)
    //   txHash: "0xabc123...def456",         // short hash for display
    //   txUrl: "https://basescan.org/tx/0xabc123def456",
    //   source: "WEEX",
    //   type: "Burn"                         // "Burn" or "Add to LP"
    // },
  ],

  // ----------------------------------------------------------
  //  SOCIAL LINKS (footer)
  // ----------------------------------------------------------
  socials: {
    twitter: "https://x.com/IMO__Invest",
    telegram: "https://t.me/imo_invest",          // verify the official link with the IMO team
    basescan: "https://basescan.org/token/0x5a7a2bf9ffae199f088b25837dcd7e115cf8e1bb"
  }

};
