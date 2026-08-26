/* Created: 2026-08-26 08:50 MST (America/Phoenix)
   Upload to the repo as site/assets/chrome.js (new file).

   GENERIC. No personal values live here. Everything this renders comes from
   config.js, so the four page templates carry no name, no links, and no prose.
   Adding a link or changing the bio is a config edit, never a code edit. */

import { CONFIG } from "../config.js";

const NAV = [
  { key: "feed", href: "/", label: "Tearsheets" },
  { key: "grid", href: "/grid.html", label: "Photos" },
  { key: "about", href: "/about.html", label: "About" },
];

const PAGE_TITLES = { grid: "Photos", frame: "Frame", about: "About" };

/* Call once per page with the active nav key: feed, grid, frame, or about.
   frame is deliberately absent from NAV, it has no nav entry of its own. */
export function mountChrome(active) {
  document.title = active === "feed"
    ? CONFIG.siteName
    : `${PAGE_TITLES[active] || ""}, ${CONFIG.displayName}`;

  const header = document.querySelector("header.site");
  if (!header) return;
  header.innerHTML =
    `<h1>${esc(CONFIG.displayName)}</h1>
     <nav>${NAV.map((n) =>
       `<a${n.key === active ? ' class="on"' : ""} href="${n.href}">${esc(n.label)}</a>`
     ).join("\n       ")}</nav>`;
}

/* About page body. bio is an array of plain-text paragraphs and is escaped on
   the way in, so apostrophes, quotes, and angle brackets are all safe to type.
   No HTML is honored inside a bio string, by design. */
export function mountAbout(el) {
  if (!el) return;
  const bio = (CONFIG.bio || []).map((p) => `<p>${esc(p)}</p>`).join("\n  ");
  const links = (CONFIG.links || []).map((l) =>
    `<a href="${esc(l.href)}" style="text-decoration:underline">${esc(l.label)}</a>`);
  if (CONFIG.contactEmail) {
    links.push(`<a href="mailto:${esc(CONFIG.contactEmail)}" style="text-decoration:underline">Contact</a>`);
  }
  el.innerHTML = `${bio}${links.length ? `\n  <p>${links.join(" · ")}</p>` : ""}`;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
