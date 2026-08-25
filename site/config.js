/* Created: 2026-08-25 13:37 MST (America/Phoenix)
   tearsheets repo config. Things set once live here. Decisions made repeatedly live in the Sheet. */

export const CONFIG = {
  siteName: "Your Name, tearsheets",
  subdomain: "tearsheets.example.com",
  contactEmail: "you@example.com",
  links: {
    linkedin: "https://www.linkedin.com/in/yourname",
    wireFeed: "https://example.com/your-wire-feed",
  },
  feedPageSize: 50,
  sortMode: "bucketed-shuffle",
  dhashThreshold: 4,
  derivatives: [600, 1600],
  collectionThresholds: { league: 3, team: 5, event: 5, player: 5, outlet: 10, game: 5 },
  stockDomains: ["reutersconnect.com", "imagn.com", "usatsimg.com", "vecteezy.com"],
  socialDomains: ["instagram.com", "facebook.com", "youtube.com", "x.com", "twitter.com", "tiktok.com"],
  // informational mirror of the Worker's CONFIG_JSON variants; used by tests.html only
  creditVariants: [
    { key: "example_tight", q: '"your name-your wire service"', tight: true },
    { key: "example_loose", q: '"your name" "your wire service"', tight: false },
  ],
};
