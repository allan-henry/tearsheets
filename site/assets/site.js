/* Created: 2026-09-11 16:55 MST (America/Phoenix)
   Supersedes site202608261037.js (the 2026-08-26 10:37 copy with the Load-more
   closure fix, carried forward here). Changes:
     1. Justified photo grid. Each cell gets its aspect ratio as a CSS variable
        (--r) and the layout is pure flex: same row height, native aspect, no
        cropping, no gaps. Needs width/height from grid.json (Worker 2026-09-11).
     2. Cards with a null src render as text only. Never fall back to a third-party
        URL: SerpApi thumbnails expire, which produced the broken-image cards.
     3. Frame page hero comes from d.hero, not d.placements[0].
     4. Grid cells carry title="frame N, instance M" so a junk tile can be
        identified by hover and hidden from the D1 console.
   Upload to the repo as site/assets/site.js (canonical path, imported by exact name).
   Requires the grid rules in site-css-append-2026-09-11-1655.css appended to site.css.
   tearsheets front end. Fetch pregenerated JSON, render, load-more with URL param, lightbox. */

import { CONFIG } from "../config.js";

const qs = new URLSearchParams(location.search);
const page = () => Math.max(1, Number(qs.get("page") || 1));

/* The Worker writes root-relative keys into published JSON: /img/<id>/600.jpg and
   /img/<id>/1600.jpg. Absolutes (favicons) pass through untouched. Exported because
   review.html needs the same resolution for its thumbnails and its hashing loop. */
export function mediaURL(path) {
  const p = String(path ?? "");
  if (!p) return "";
  if (/^(https?:)?\/\//i.test(p)) return p;
  if (/^data:/i.test(p)) return p;
  const base = String(CONFIG.mediaBase || "").replace(/\/+$/, "");
  if (!base) return p;
  return base + (p.startsWith("/") ? p : "/" + p);
}

export async function renderFeed(el) {
  const data = await getJSON("/data/feed.json");
  const items = data.items || [];
  const upTo = page() * CONFIG.feedPageSize;
  el.innerHTML = items.slice(0, upTo).map(cardHTML).join("");
  moreButton(el, items.length > upTo, () => renderFeed(el));
}

function cardHTML(c) {
  const hasImg = !!c.src;
  const cls = ["card", c.orientation || "landscape", c.featured ? "featured" : "", hasImg ? "" : "noimg"].join(" ");
  return `<article class="${cls}">
    ${hasImg ? `<a href="${esc(c.article_url)}" target="_blank" rel="noopener">
      <img src="${esc(mediaURL(c.src))}" loading="lazy" alt="${esc(c.title || "photo")}"
           ${c.width && c.height ? `width="${c.width}" height="${c.height}"` : ""}>
    </a>` : ""}
    <div class="meta">
      <div class="outlet">${c.favicon ? `<img src="${esc(c.favicon)}" alt="">` : ""}${esc(c.outlet)}</div>
      <h2><a href="${esc(c.article_url)}" target="_blank" rel="noopener">${esc(c.title || "")}</a></h2>
      <time>${fmtDate(c.date)}</time>
      ${c.frame_id ? `<div><a href="/frame.html?id=${c.frame_id}" style="font-size:12px;color:var(--ink-dim)">all placements</a></div>` : ""}
    </div>
  </article>`;
}

/* Justified rows. --r is width/height. site.css turns that into
   flex-grow: var(--r) and flex-basis: calc(var(--r) * row-height), so every cell in
   a row shares one height and keeps its own proportions. Rows without width/height
   (older grid.json) fall back to a nominal ratio by orientation. */
function ratioOf(g) {
  if (g.width && g.height) return Math.max(0.4, Math.min(3, g.width / g.height));
  return g.orientation === "portrait" ? 2 / 3 : g.orientation === "square" ? 1 : 3 / 2;
}

export async function renderGrid(el) {
  const data = await getJSON("/data/grid.json");
  const items = (data.items || []).filter((g) => g.src);
  const upTo = page() * CONFIG.feedPageSize * 2;
  el.innerHTML = items.slice(0, upTo).map((g) =>
    `<a class="${g.orientation}${g.featured ? " featured" : ""}" style="--r:${ratioOf(g).toFixed(4)}"
        href="/frame.html?id=${g.frame_id}"
        title="frame ${g.frame_id}, instance ${g.instance_id ?? "?"}">
       <img src="${esc(mediaURL(g.src))}" loading="lazy" alt=""
            ${g.width && g.height ? `width="${g.width}" height="${g.height}"` : ""}></a>`).join("");
  moreButton(el, items.length > upTo, () => renderGrid(el));
  lightbox(el);
}

export async function renderFrame(el) {
  const id = qs.get("id");
  if (!id) { el.textContent = "No frame specified."; return; }
  const d = await getJSON(`/data/frame/${id}.json`);
  const hero = d.hero || null;
  el.innerHTML = `
    ${hero && hero.src ? `<div class="frame-hero"><img src="${esc(mediaURL(hero.large || hero.src))}" alt=""
        ${hero.width && hero.height ? `width="${hero.width}" height="${hero.height}"` : ""}></div>` : ""}
    <p class="frame-caption">${esc(d.frame.caption || d.frame.event_name || "")}</p>
    <div class="placements">
      ${d.placements.map((p) => `<div class="placement">
        ${p.favicon ? `<img src="${esc(p.favicon)}" width="14" height="14" alt="">` : ""}
        <a href="${esc(p.article_url)}" target="_blank" rel="noopener">${esc(p.title || p.outlet)}</a>
        <span class="d">${esc(p.outlet)} · ${fmtDate(p.date)}</span>
      </div>`).join("")}
    </div>
    ${d.licenses.length ? `<p class="licenses">License this frame:
      ${d.licenses.map((l) => `<a href="${esc(l.article_url)}" target="_blank" rel="noopener">${esc(l.outlet)}</a>`).join(" · ")}
    </p>` : ""}`;
}

/* Each renderer passes a closure over itself. Do NOT reintroduce a
   location.pathname test here: _redirects strips .html, so "/grid" would fail an
   endsWith("grid.html") check and Load more would render feed cards into the grid. */
function moreButton(el, hasMore, again) {
  document.querySelector(".more")?.remove();
  if (!hasMore) return;
  const b = document.createElement("button");
  b.className = "more";
  b.textContent = "Load more";
  b.onclick = () => {
    qs.set("page", String(page() + 1));
    history.replaceState(null, "", `?${qs}`);
    again();
  };
  el.after(b);
}

function lightbox(scope) {
  let box = document.querySelector(".lightbox");
  if (!box) {
    box = document.createElement("div");
    box.className = "lightbox";
    box.innerHTML = "<img alt=''>";
    box.onclick = () => box.classList.remove("open");
    document.body.append(box);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") box.classList.remove("open");
      if (!box.classList.contains("open")) return;
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        const imgs = [...scope.querySelectorAll("img")];
        const cur = imgs.findIndex((i) => i.src === box.querySelector("img").src);
        const next = imgs[(cur + (e.key === "ArrowRight" ? 1 : -1) + imgs.length) % imgs.length];
        if (next) box.querySelector("img").src = next.src;
      }
    });
  }
}

async function getJSON(path) {
  const url = mediaURL(path);
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} ${r.status}`);
  return r.json();
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function fmtDate(d) {
  if (!d) return "";
  return new Date(d + "T12:00:00Z").toLocaleDateString("en-US",
    { year: "numeric", month: "short", day: "numeric" });
}
