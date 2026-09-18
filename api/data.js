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
    totalBurned: "57,826",     // ex: "12,450" - total IMO tokens burned (WEEX share)
    totalBurns: "5",           // ex: "3" - number of burn transactions executed
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
    imoBurnedViaWeex: "57,826",            // IMO already burned via WEEX fees
    feesFutures: "75%",                   // futures fees rebate share
    feesSpot: "75%",                      // spot fees rebate share
    burnAllocation: "50%"                 // minimum committed to buy & burn (can go up to 100%)
  },

  // ----------------------------------------------------------
  //  AFFILIATES HISTORY (chart in the WEEX section)
  // ----------------------------------------------------------
  affiliatesHistory: [
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
  burns: [
    {
      date: "17/09/2026",
      forMonth: "2026-08",
      amount: "3,365 IMO",
      usdAmount: 1773,
      txTotalAmount: "17,824 IMO",
      txHash: "0x599376d9...df869c",
      txUrl: "https://basescan.org/tx/0x599376d9ed61d7f9b93d88c97bc8074bf7b28fd39219abef70f680e35ddf869c",
      source: "WEEX",
      type: "Burn"
    },
    {
      date: "04/08/2026",
      forMonth: "2026-07",
      amount: "6,061 IMO",
      usdAmount: 2467,
      txTotalAmount: "21,346 IMO",
      txHash: "0x7710b810...4ae549",
      txUrl: "https://basescan.org/tx/0x7710b810d7c6082be0bc499f718afa250d171ffdce9bfd1473bccaa2344ae549",
      source: "WEEX",
      type: "Burn"
    },
    {
      date: "07/07/2026",
      forMonth: "2026-06",
      amount: "18,817 IMO",
      usdAmount: 7527,
      txTotalAmount: "114,000 IMO",
      txHash: "0xf117b30e...eedac0",
      txUrl: "https://basescan.org/tx/0xf117b30e621f20b0d8e4ddd50103b453f5af542afafc2ce6248963a15ceedac0",
      source: "WEEX",
      type: "Burn"
    },
    {
      date: "01/06/2026",
      forMonth: "2026-05",
      amount: "27,500 IMO",
      usdAmount: 10500,
      txTotalAmount: "41,869 IMO",
      txHash: "0x6c979384...79ec039c3",
      txUrl: "https://basescan.org/tx/0x6c9793842987bba64344102bb8d5c4225f2bafd4189005480d7cfd079ec039c3",
      source: "WEEX",
      type: "Burn"
    },
    {
      date: "30/04/2026",
      forMonth: "2026-04",
      amount: "2,083 IMO",
      usdAmount: 1000,
      volumeAtBurn: 324449,
      txTotalAmount: "74,123 IMO",
      txHash: "0x014d6358...91d733ae",
      txUrl: "https://basescan.org/tx/0x014d635853f3284b246f2d0f642477419c1e2cb89ae5365ca7a7b36091d733ae",
      source: "WEEX",
      type: "Burn"
    },
  ],

  // ----------------------------------------------------------
  //  SOCIAL LINKS (footer)
  // ----------------------------------------------------------
  socials: {
    twitter: "https://x.com/IMO__Invest",
    telegram: "https://t.me/imo_invest",
    basescan: "https://basescan.org/token/0x5a7a2bf9ffae199f088b25837dcd7e115cf8e1bb"
  }

};
