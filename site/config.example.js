/* Created: 2026-08-26 08:50 MST (America/Phoenix)
   Supersedes config.example-2026-08-26-0837.js.
   Upload to the repo as site/config.example.js.

   TEMPLATE ONLY. Nothing imports this file and no browser ever loads it.
   To run your own copy of this archive: copy this file over site/config.js,
   fill in your values, commit. site/config.js is the file that deploys, and it
   is the only file in site/ you need to touch. The page templates and
   assets/chrome.js are generic and carry no personal values.

   tearsheets repo config. Things set once live here. Decisions made repeatedly live in the Sheet. */

export const CONFIG = {
  // Short form, used for the site header on every page.
  displayName: "Your Name",
  // Long form, used for the browser title on the feed page and by search engines.
  siteName: "Your Name, tearsheets",
  subdomain: "tearsheets.example.com",
  contactEmail: "you@example.com",

  // About page prose. One string per paragraph, plain text only.
  // Escaped on render, so apostrophes and quotes are safe. HTML is not honored.
  bio: [
    "A working photographer. Replace this with two or three sentences about yourself.",
    "This site is an automated archive of every public appearance of my credit line.",
  ],

  // Rendered in order on the About page. Add or remove entries freely,
  // no code change required. Contact is appended automatically from contactEmail.
  links: [
    { label: "LinkedIn", href: "https://www.linkedin.com/in/yourname" },
    { label: "Wire feed", href: "https://example.com/your-wire-feed" },
  ],

  // Base URL for published JSON (/data/*) and cached images (/img/*), both of
  // which are R2 object keys written by the Worker's publish and fetch-images
  // routes. Set this to your R2 bucket's custom domain, no trailing slash,
  // e.g. "https://media.example.com". An empty string falls back to same-origin
  // relative paths, which only works if something serves those keys from the
  // site host itself. The bucket also needs a CORS policy allowing your site's
  // origin, or canvas reads on review.html will taint and hashing will throw.
  mediaBase: "",

  feedPageSize: 50,
  sortMode: "bucketed-shuffle",
  dhashThreshold: 4,
  derivatives: [600, 1600],
  collectionThresholds: { league: 3, team: 5, event: 5, player: 5, outlet: 10, game: 5 },
  // Domains whose copies are stock-agency listings, not published placements.
  // tests.html reads this list and socialDomains via classifyDomain().
  stockDomains: ["reutersconnect.com", "imagn.com", "usatsimg.com", "vecteezy.com"],
  socialDomains: ["instagram.com", "facebook.com", "youtube.com", "x.com", "twitter.com", "tiktok.com"],
  // informational mirror of the Worker's CONFIG_JSON variants; used by tests.html only
  creditVariants: [
    { key: "example_tight", q: '"your name-your wire service"', tight: true },
    { key: "example_loose", q: '"your name" "your wire service"', tight: false },
  ],
};
