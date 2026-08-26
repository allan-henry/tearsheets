/* Created: 2026-08-26 10:37 MST (America/Phoenix)
   Supersedes the 2026-08-26 08:18 copy. One change, in moreButton():
   the Load more button no longer guesses which page it is on by testing
   location.pathname against "grid.html". _redirects strips the .html
   extension, so on /grid?page=2 that test failed and Load more called
   renderFeed(), dumping feed cards into the grid container. Each renderer
   now hands moreButton its own repeat function, so there is no path
   sniffing left to break.
   Upload to the repo as site/assets/site.js (canonical path, imported by exact name).
   tearsheets front end. Fetch pregenerated JSON, render, load-more with URL param, lightbox. */

import { CONFIG } from "../config.js";

const qs = new URLSearchParams(location.search);
const page = () => Math.max(1, Number(qs.get("page") || 1));

/* The Worker writes root-relative keys into published JSON: /img/<id>/600.jpg,
   /img/<id>/1600.jpg, and falls back to third-party absolute URLs when an image
   was never cached in R2. So this has to pass absolutes through untouched and
   prepend the base only to our own keys. Exported because review.html needs the
   same resolution for its thumbnails and its hashing loop. */
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
  const cls = ["card", c.orientation || "landscape", c.featured ? "featured" : ""].join(" ");
  return `<article class="${cls}">
    <a href="${esc(c.article_url)}" target="_blank" rel="noopener">
      <img src="${esc(mediaURL(c.src))}" loading="lazy" alt="${esc(c.title || "photo")}">
    </a>
    <div class="meta">
      <div class="outlet">${c.favicon ? `<img src="${esc(c.favicon)}" alt="">` : ""}${esc(c.outlet)}</div>
      <h2><a href="${esc(c.article_url)}" target="_blank" rel="noopener">${esc(c.title || "")}</a></h2>
      <time>${fmtDate(c.date)}</time>
      ${c.frame_id ? `<div><a href="/frame.html?id=${c.frame_id}" style="font-size:12px;color:var(--ink-dim)">all placements</a></div>` : ""}
    </div>
  </article>`;
}

export async function renderGrid(el) {
  const data = await getJSON("/data/grid.json");
  const items = data.items || [];
  const upTo = page() * CONFIG.feedPageSize * 2;
  el.innerHTML = items.slice(0, upTo).map((g) =>
    `<a class="${g.orientation}${g.featured ? " featured" : ""}" href="/frame.html?id=${g.frame_id}">
       <img src="${esc(mediaURL(g.src))}" loading="lazy" alt=""></a>`).join("");
  moreButton(el, items.length > upTo, () => renderGrid(el));
  lightbox(el);
}

export async function renderFrame(el) {
  const id = qs.get("id");
  if (!id) { el.textContent = "No frame specified."; return; }
  const d = await getJSON(`/data/frame/${id}.json`);
  const hero = d.placements[0] || {};
  el.innerHTML = `
    <div class="frame-hero"><img src="${esc(mediaURL(hero.large || hero.src || ""))}" alt=""></div>
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

/* rerender is supplied by the caller (renderFeed or renderGrid passes a closure
   over itself). Do NOT reintroduce a location.pathname test here: _redirects
   serves these pages without the .html extension, so /grid never matches
   "grid.html" and the grid silently rendered feed cards. */
function moreButton(el, hasMore, rerender) {
  document.querySelector(".more")?.remove();
  if (!hasMore) return;
  const b = document.createElement("button");
  b.className = "more";
  b.textContent = "Load more";
  b.onclick = () => {
    qs.set("page", String(page() + 1));
    history.replaceState(null, "", `?${qs}`);
    rerender();
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
