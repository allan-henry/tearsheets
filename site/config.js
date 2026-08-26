/* Created: 2026-08-26 08:50 MST (America/Phoenix)
   Supersedes config-2026-08-26-0840.js.
   Upload to the repo as site/config.js (canonical path, imported by exact name
   from assets/site.js, assets/chrome.js, and tests.html).

   This is now the ONLY file in site/ carrying personal values. The four page
   templates and assets/chrome.js are generic. Change a name, a link, or the bio
   here and nowhere else.

   tearsheets repo config. Things set once live here. Decisions made repeatedly live in the Sheet. */

export const CONFIG = {
  // Short form, used for the site header on every page.
  displayName: "Allan Henry",
  // Long form, used for the browser title on the feed page and by search engines.
  siteName: "Allan Henry - Imagn-Images / USA Today Sports- Tearsheets",
  subdomain: "tearsheets.allanhenry.com",
  contactEmail: "tearsheets@ahenry.com",

  // About page prose. One string per paragraph, plain text only.
  // Escaped on render, so apostrophes and quotes are safe. HTML is not honored.
  bio: [
    "Published works by Allan Henry. Access the GIT and build out your own tearsheet portfolio site.",
    "This site is an automated archive of every public appearance of my credit line. It finds published uses on its own and keeps finding new ones.",
  ],

  // Rendered in order on the About page. Add or remove entries freely,
  // no code change required. Contact is appended automatically from contactEmail.
  links: [
    { label: "LinkedIn", href: "https://www.linkedin.com/in/allanhenry" },
    { label: "Wire feed", href: "https://www.imagn.com/search/?searchtxt=%22allan%20henry%22" },
    { label: "Instagram", href: "https://www.instagram.com/allanhenry" },
    { label: "Source", href: "https://github.com/allan-henry/tearsheets" },
  ],

  // Base URL for published JSON (/data/*) and cached images (/img/*), both of
  // which are R2 object keys written by the Worker's publish and fetch-images
  // routes. No trailing slash. The bucket also needs a CORS policy allowing this
  // site's origin, or canvas reads on review.html will taint and hashing will throw.
  mediaBase: "https://media.allanhenry.com",

  feedPageSize: 50,
  sortMode: "bucketed-shuffle",
  dhashThreshold: 4,
  derivatives: [600, 1600],
  collectionThresholds: { league: 3, team: 5, event: 5, player: 5, outlet: 10, game: 5 },
  stockDomains: ["reutersconnect.com", "imagn.com", "usatsimg.com", "vecteezy.com"],
  socialDomains: ["instagram.com", "facebook.com", "youtube.com", "x.com", "twitter.com", "tiktok.com"],
  // informational mirror of the Worker's CONFIG_JSON variants; used by tests.html only
  creditVariants: [
    { key: "imagn_tight", q: '"allan henry-imagn images"', tight: true },
    { key: "imagn_loose", q: '"allan henry" "imagn"', tight: false },
    { key: "usats_tight", q: '"allan henry-usa today sports"', tight: true },
    { key: "usats_loose", q: '"allan henry" "usa today sports"', tight: false },
    { key: "uspw_tight", q: '"allan henry-us presswire"', tight: true },
    { key: "uspw_loose", q: '"allan henry" "us presswire"', tight: false },
  ],
};
