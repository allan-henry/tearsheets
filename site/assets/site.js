/* Created: 2026-08-25 09:55 MST (America/Phoenix)
   tearsheets front end. Fetch pregenerated JSON, render, load-more with URL param, lightbox. */

import { CONFIG } from "../config.js";

const qs = new URLSearchParams(location.search);
const page = () => Math.max(1, Number(qs.get("page") || 1));

export async function renderFeed(el) {
  const data = await getJSON("/data/feed.json");
  const items = data.items || [];
  const upTo = page() * CONFIG.feedPageSize;
  el.innerHTML = items.slice(0, upTo).map(cardHTML).join("");
  moreButton(el, items.length > upTo);
}

function cardHTML(c) {
  const cls = ["card", c.orientation || "landscape", c.featured ? "featured" : ""].join(" ");
  return `<article class="${cls}">
    <a href="${esc(c.article_url)}" target="_blank" rel="noopener">
      <img src="${esc(c.src)}" loading="lazy" alt="${esc(c.title || "photo")}">
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
       <img src="${esc(g.src)}" loading="lazy" alt=""></a>`).join("");
  moreButton(el, items.length > upTo);
  lightbox(el);
}

export async function renderFrame(el) {
  const id = qs.get("id");
  if (!id) { el.textContent = "No frame specified."; return; }
  const d = await getJSON(`/data/frame/${id}.json`);
  const hero = d.placements[0] || {};
  el.innerHTML = `
    <div class="frame-hero"><img src="${esc(hero.large || hero.src || "")}" alt=""></div>
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

function moreButton(el, hasMore) {
  document.querySelector(".more")?.remove();
  if (!hasMore) return;
  const b = document.createElement("button");
  b.className = "more";
  b.textContent = "Load more";
  b.onclick = () => {
    qs.set("page", String(page() + 1));
    history.replaceState(null, "", `?${qs}`);
    location.pathname.endsWith("grid.html") ? renderGrid(el) : renderFeed(el);
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
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path} ${r.status}`);
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
