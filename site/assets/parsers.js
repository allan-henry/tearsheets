/* Created: 2026-08-25 09:55 MST (America/Phoenix)
   tearsheets parsers, browser copy. Canonical logic is duplicated in the Worker.
   Edit both. The fixture harness (tests.html) runs against this file. */

export function extractResults(engine, data) {
  if (engine === "images") return data.images_results || [];
  if (engine === "news") return data.news_results || [];
  return data.organic_results || [];
}

export function parseCaption(snippet) {
  if (!snippet) return null;
  const m = snippet.match(/^([A-Z][a-z]{2,8}\.?\s+\d{1,2},\s*\d{4});\s*([^;]+);\s*(.+)$/s);
  if (!m) return null;
  return {
    event_date: parseDateLoose(m[1]),
    location: m[2].trim(),
    subject: m[3].trim(),
    player: parsePlayerAnchor(m[3]),
    caption: snippet.trim(),
  };
}

export function parsePlayerAnchor(subject) {
  const m = subject.match(/\b([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+)?)\s+\((\d{1,2})\)/);
  return m ? m[1] : null;
}

export function parseTitle(title) {
  if (!title || title.trim().toLowerCase() === "test") return null;
  const m = title.match(/^([A-Z]{2,6}):\s*(.+)$/);
  if (!m) return null;
  const league = m[1];
  const rest = m[2].trim();
  const vs = rest.match(/^(.+?)\s+at\s+(.+)$/i);
  if (vs) return { league, team_away: vs[1].trim(), team_home: vs[2].trim(), event_name: null };
  return { league, team_away: null, team_home: null, event_name: rest };
}

export function parseDateLoose(s) {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d) ? null : d.toISOString().slice(0, 10);
}

/* type is grouping only. social does not exclude; only stock does.
   account-level exclusions happen in the Worker at harvest. */
export function classifyDomain(d, cfg) {
  if (cfg.stockDomains.some((s) => d === s || d.endsWith("." + s))) return "stock";
  if (cfg.socialDomains.some((s) => d === s || d.endsWith("." + s))) return "social";
  if (d === "msn.com" || d.endsWith(".msn.com")) return "distribution";
  return "publication";
}

export function orientationOf(w, h) {
  if (!w || !h) return null;
  const r = w / h;
  if (r > 1.15) return "landscape";
  if (r < 0.87) return "portrait";
  return "square";
}

/* dhash, 64-bit, computed from a canvas. 9x8 grayscale, row-wise gradient. */
export function dhashFromImage(img) {
  const c = document.createElement("canvas");
  c.width = 9; c.height = 8;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, 9, 8);
  const px = ctx.getImageData(0, 0, 9, 8).data;
  const gray = [];
  for (let i = 0; i < px.length; i += 4) {
    gray.push(0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]);
  }
  let bits = 0n;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      bits = (bits << 1n) | (gray[row * 9 + col] > gray[row * 9 + col + 1] ? 1n : 0n);
    }
  }
  return bits.toString(16).padStart(16, "0");
}

export function hamming(hexA, hexB) {
  let x = BigInt("0x" + hexA) ^ BigInt("0x" + hexB);
  let c = 0;
  while (x) { c += Number(x & 1n); x >>= 1n; }
  return c;
}
