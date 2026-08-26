/*
 * Created: 2026-08-25 10:38 MST (America/Phoenix)
 * tearsheets harvest Worker. Single file, no build step, Quick Edit deployable.
 *
 * Bindings required (dashboard > Worker > Settings):
 *   DB           D1 database
 *   IMAGES       R2 bucket (images + generated JSON)
 *   SERPAPI_KEY  secret
 *   ADMIN_TOKEN  secret (shared header for admin routes; Cloudflare Access sits in front too)
 *   SHEETS_SA    secret (Google service account JSON, one line) [optional until Sheets is wired]
 *   CONFIG_JSON  plain var (JSON overriding CONFIG below: variants, exclusions, etc.)
 *   SHEET_ID     plain var (Google Sheet id) [optional]
 *
 * Routes (all admin routes require header  x-admin-token: <ADMIN_TOKEN>):
 *   GET  /run?mode=backfill|weekly&engines=news,images,web&dry=1\n *   GET  /fetch-images?batch=100      R2 fetch only, zero SerpApi calls
 *   GET  /health
 *   GET  /admin/unhashed            instances missing dhash, for review.html
 *   POST /admin/hashes              [{id, dhash, width, height}] computed in-browser
 *   POST /admin/cluster?dry=1       caption grouping first, then Hamming <= threshold
 *   GET  /admin/review              frame groups + distances for the merge/split screen
 *   POST /admin/publish             regenerate all JSON to R2
 *   POST /admin/sheets-sync         append new rows, read back include/featured
 *
 * Parser functions here are duplicated in site/assets/parsers.js for the
 * browser test harness. Edit both. The fixtures keep them honest.
 */

/* Generic defaults. Personal values (variants, exclusions, overrides) come from a
 * CONFIG_JSON environment variable on the Worker: a JSON object whose keys override
 * anything below. Deployers never edit this file. Example CONFIG_JSON:
 * {"variants":[{"key":"wire_tight","q":"\"jane doe-wire service\"","tight":true},
 *              {"key":"wire_loose","q":"\"jane doe\" \"wire service\"","tight":false}],
 *  "excludeUrlPatterns":["instagram.com/janedoe"]}
 */
const CONFIG = {
  variants: [
    { key: "example_tight", q: '"your name-your wire service"', tight: true },
    { key: "example_loose", q: '"your name" "your wire service"', tight: false },
  ],
  // metadata-only domains: harvested for captions, surfaced as license links, never cards
  stockDomains: ["reutersconnect.com", "imagn.com", "usatsimg.com", "vecteezy.com"],
  // social platforms are legitimate outlets (a publication posting a frame is a tearsheet).
  // the type exists for grouping; it does not exclude. exclusion is account-level below.
  socialDomains: ["instagram.com", "facebook.com", "youtube.com", "x.com", "twitter.com", "tiktok.com"],
  // URL substrings for accounts the photographer controls; matching results are dropped at harvest
  excludeUrlPatterns: [],
  dhashThreshold: 4,
  derivatives: [600, 1600],
  backfillPagesPerQuery: { news: 5, images: 12, web: 5 },
  weeklyPagesPerQuery: { news: 1, images: 1, web: 1 },
  feedPageSize: 50,
  sheetImageBase: "https://example.com", // base URL for =IMAGE() thumbnails in the Sheet
};
let configApplied = false;
function applyEnvConfig(env) {
  if (configApplied) return;
  configApplied = true;
  if (!env.CONFIG_JSON) return;
  try { Object.assign(CONFIG, JSON.parse(env.CONFIG_JSON)); }
  catch (e) { console.log("CONFIG_JSON parse failed: " + e); }
}

export default {
  async fetch(req, env, ctx) {
    applyEnvConfig(env);
    const url = new URL(req.url);
    // routed as yourdomain.com/api/* or bare on workers.dev; both work
    const p = url.pathname.replace(/^\/api(?=\/|$)/, "") || "/";
    try {
      if (p === "/health") return json({ ok: true, time: new Date().toISOString() });
      if (!isAuthed(req, env)) return json({ error: "unauthorized" }, 401);

      if (p === "/run") return await runHarvest(url, env);
      if (p === "/fetch-images") {
        const batch = Math.min(200, Number(url.searchParams.get("batch") || 100));
        const r2 = await fetchImagesToR2(env, batch);
        return json({ ...r2, remaining_hint: r2.attempted === batch ? "rerun" : "queue drained" });
      }
      if (p === "/admin/unhashed") return await getUnhashed(env);
      if (p === "/admin/hashes" && req.method === "POST") return await saveHashes(req, env);
      if (p === "/admin/cluster" && req.method === "POST") return await cluster(url, env);
      if (p === "/admin/review") return await reviewData(env);
      if (p === "/admin/publish" && req.method === "POST") return await publish(env);
      if (p === "/admin/sheets-sync" && req.method === "POST") return await sheetsSync(env);
      return json({ error: "not found" }, 404);
    } catch (e) {
      return json({ error: String(e && e.stack || e) }, 500);
    }
  },
  // cron block intentionally absent for now: manual /run until a run survives, then add
  // "scheduled" handler + cron trigger in wrangler.toml.
};

function isAuthed(req, env) {
  // header for review.html, ?token= for browser-address-bar testing
  const t = req.headers.get("x-admin-token") || new URL(req.url).searchParams.get("token");
  return t === env.ADMIN_TOKEN;
}
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status, headers: { "content-type": "application/json" },
  });
}
const now = () => new Date().toISOString();

/* ---------------- harvest ---------------- */

async function runHarvest(url, env) {
  const mode = url.searchParams.get("mode") || "weekly";
  const dry = url.searchParams.get("dry") === "1";
  const engines = (url.searchParams.get("engines") || "news").split(",");
  const pages = mode === "backfill" ? CONFIG.backfillPagesPerQuery : CONFIG.weeklyPagesPerQuery;
  const report = { mode, dry, engines, calls: 0, found: 0, inserted: 0, updated: 0, byEngine: {} };

  for (const engine of engines) {
    const items = [];
    for (const v of CONFIG.variants) {
      for (let page = 0; page < (pages[engine] || 1); page++) {
        const results = await serpapi(env, engine, v.q, page);
        report.calls++;
        const parsed = results.map((r) => normalizeResult(engine, r, v));
        items.push(...parsed.filter(Boolean));
        if (results.length === 0) break; // engine exhausted for this query
      }
    }
    report.byEngine[engine] = items.length;
    report.found += items.length;
    if (!dry) {
      const { inserted, updated } = await upsertInstances(env, items);
      report.inserted += inserted;
      report.updated += updated;
    }
  }

  if (!dry) {
    await classifyNewDomains(env);
    const r2 = await fetchImagesToR2(env, 40); // cap per run, rerun to continue
    report.imagesFetched = r2.fetched;
    report.imagesAttempted = r2.attempted;
    report.imageErrors = r2.errors;
  }
  return json(report);
}

async function serpapi(env, engine, q, page) {
  const base = "https://serpapi.com/search.json";
  const params = new URLSearchParams({ q, api_key: env.SERPAPI_KEY, num: "100" });
  if (engine === "images") {
    params.set("engine", "google_images");
    params.set("ijn", String(page));
  } else if (engine === "news") {
    params.set("engine", "google");
    params.set("tbm", "nws");
    params.set("start", String(page * 100));
  } else {
    params.set("engine", "google");
    params.set("start", String(page * 100));
  }
  const res = await fetch(`${base}?${params}`);
  if (!res.ok) throw new Error(`serpapi ${engine} ${res.status}`);
  const data = await res.json();
  return extractResults(engine, data);
}

// shared with fixtures/tests: pull the result array off a raw SerpApi payload
function extractResults(engine, data) {
  if (engine === "images") return data.images_results || [];
  if (engine === "news") return data.news_results || [];
  return data.organic_results || [];
}

function normalizeResult(engine, r, variant) {
  const articleUrl = r.link || r.source_link || null;
  if (!articleUrl) return null;
  // News and web thumbnails are per-search volatile URLs, so they cannot be
  // dedup identity. For those engines the identity is the article itself;
  // the volatile thumb lives in thumbnail_url only. The images engine has a
  // stable original URL, and one article can legitimately carry several frames.
  const imageUrl = engine === "images" ? (r.original || null) : `article:${articleUrl}`;
  const domain = hostnameOf(articleUrl);
  if (!domain) return null;
  if (CONFIG.excludeUrlPatterns.some((pat) => articleUrl.includes(pat))) return null;
  const width = r.original_width || null;
  const height = r.original_height || null;
  return {
    article_url: articleUrl,
    image_url: imageUrl || `pending:${articleUrl}`,
    thumbnail_url: r.thumbnail || null,
    title: r.title || null,
    source_domain: domain,
    published_at: parseDateLoose(r.date) || null,
    snippet: r.snippet || null,
    favicon: r.favicon || null,
    width, height,
    orientation: orientationOf(width, height),
    found_by: variant.key,
    verified: variant.tight ? 1 : 0,
  };
}

function hostnameOf(u) {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return null; }
}

function orientationOf(w, h) {
  if (!w || !h) return null;
  const r = w / h;
  if (r > 1.15) return "landscape";
  if (r < 0.87) return "portrait";
  return "square";
}

async function upsertInstances(env, items) {
  let inserted = 0, updated = 0;
  const t = now();
  for (const it of items) {
    const res = await env.DB.prepare(
      `INSERT INTO instances (article_url,image_url,thumbnail_url,title,source_domain,
         published_at,snippet,favicon,width,height,orientation,found_by,verified,first_seen,last_seen)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(article_url,image_url) DO UPDATE SET
         last_seen=excluded.last_seen,
         found_by=CASE WHEN instr(instances.found_by, excluded.found_by)=0
                       THEN instances.found_by || ',' || excluded.found_by
                       ELSE instances.found_by END,
         verified=MAX(instances.verified, excluded.verified)`
    ).bind(it.article_url, it.image_url, it.thumbnail_url, it.title, it.source_domain,
      it.published_at, it.snippet, it.favicon, it.width, it.height, it.orientation,
      it.found_by, it.verified, t, t).run();
    if (res.meta.changes > 0 && res.meta.last_row_id) inserted++; else updated++;
  }
  return { inserted, updated };
}

async function classifyNewDomains(env) {
  const t = now();
  const { results } = await env.DB.prepare(
    `SELECT DISTINCT source_domain d FROM instances
     WHERE source_domain NOT IN (SELECT domain FROM domains)`
  ).all();
  for (const row of results) {
    const type = classifyDomain(row.d);
    // "a reader encountered the photo inside a story": publications default in,
    // stock and social default out, pending the Sheet's include checkbox
    const include = type === "stock" ? 0 : 1;
    await env.DB.prepare(
      `INSERT OR IGNORE INTO domains (domain,include,type,display_name,first_seen)
       VALUES (?,?,?,?,?)`
    ).bind(row.d, include, type, prettyDomain(row.d), t).run();
  }
  await env.DB.prepare(
    `UPDATE domains SET frame_count =
       (SELECT COUNT(DISTINCT frame_id) FROM instances
        WHERE source_domain = domains.domain AND frame_id IS NOT NULL)`
  ).run();
}

function classifyDomain(d) {
  if (CONFIG.stockDomains.some((s) => d === s || d.endsWith("." + s))) return "stock";
  if (CONFIG.socialDomains.some((s) => d === s || d.endsWith("." + s))) return "social";
  if (d === "msn.com" || d.endsWith(".msn.com")) return "distribution"; // MSN is explicitly a tearsheet
  return "publication";
}
function prettyDomain(d) {
  const base = d.split(".").slice(0, -1).join(".") || d;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/* ---------------- images to R2 ---------------- */

async function fetchImagesToR2(env, cap) {
  // fetch_failed column added lazily so existing databases need no manual migration.
  try { await env.DB.prepare(`ALTER TABLE instances ADD COLUMN fetch_failed INTEGER DEFAULT 0`).run(); } catch {}
  const { results } = await env.DB.prepare(
    `SELECT id, image_url, thumbnail_url FROM instances
     WHERE r2_key IS NULL AND COALESCE(fetch_failed, 0) < 3
       AND (image_url NOT LIKE 'article:%' OR thumbnail_url IS NOT NULL)
     LIMIT ?`
  ).bind(cap).all();
  let ok = 0;
  const errors = [];
  for (const row of results) {
    const src = row.image_url.startsWith("article:") ? row.thumbnail_url : row.image_url;
    if (!src) continue;
    try {
      // Fetch the original bytes once, buffered, and validate before storing.
      // Resizing via cf.image needs Image Resizing on a zone; try it per width
      // but fall back to the original bytes so objects are never empty.
      const orig = await fetchBytes(src, null);
      if (!orig) throw new Error("empty or blocked");
      for (const w of CONFIG.derivatives) {
        const resized = await fetchBytes(src, w);
        const bytes = resized || orig;
        await env.IMAGES.put(`img/${row.id}/${w}.jpg`, bytes, {
          httpMetadata: { contentType: "image/jpeg", cacheControl: "public, max-age=31536000, immutable" },
        });
      }
      await env.DB.prepare(`UPDATE instances SET r2_key=? WHERE id=?`)
        .bind(`img/${row.id}`, row.id).run();
      ok++;
    } catch (e) {
      await env.DB.prepare(`UPDATE instances SET fetch_failed = COALESCE(fetch_failed, 0) + 1 WHERE id=?`)
        .bind(row.id).run();
      errors.push(`${row.id} ${hostnameOf(src) || src}: ${e.message || e}`);
    }
  }
  return { fetched: ok, attempted: results.length, errors: errors.slice(0, 15) };
}

async function fetchBytes(src, width) {
  try {
    const opts = { headers: { "user-agent": "Mozilla/5.0 (Macintosh) tearsheets-archive", accept: "image/*" } };
    if (width) opts.cf = { image: { width, fit: "scale-down", quality: 82 } };
    const res = await fetch(src, opts);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return buf.byteLength > 1000 ? buf : null; // real JPEGs are never under 1KB
  } catch { return null; }
}

/* ---------------- caption + title parsers (duplicated in site/assets/parsers.js) ---------------- */

// "Aug 11, 2026; Phoenix, Arizona, USA; Colorado Rockies third baseman Kyle Karros (12) at bat..."
function parseCaption(snippet) {
  if (!snippet) return null;
  const m = snippet.match(
    /^([A-Z][a-z]{2,8}\.?\s+\d{1,2},\s*\d{4});\s*([^;]+);\s*(.+)$/s
  );
  if (!m) return null;
  const eventDate = parseDateLoose(m[1]);
  const location = m[2].trim();
  const subject = m[3].trim();
  const player = parsePlayerAnchor(subject);
  return { event_date: eventDate, location, subject, player, caption: snippet.trim() };
}

// "{Team} {position} {Name} ({number})"
function parsePlayerAnchor(subject) {
  const m = subject.match(
    /\b([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+)?)\s+\((\d{1,2})\)/
  );
  return m ? m[1] : null;
}

// "MLB: Colorado Rockies at Arizona Diamondbacks"  |  "PGA: WM Phoenix Open"
function parseTitle(title) {
  if (!title || title.trim().toLowerCase() === "test") return null; // Lohud case
  const m = title.match(/^([A-Z]{2,6}):\s*(.+)$/);
  if (!m) return null;
  const league = m[1];
  const rest = m[2].trim();
  const vs = rest.match(/^(.+?)\s+at\s+(.+)$/i);
  if (vs) return { league, team_away: vs[1].trim(), team_home: vs[2].trim(), event_name: null };
  return { league, team_away: null, team_home: null, event_name: rest };
}

function parseDateLoose(s) {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d) ? null : d.toISOString().slice(0, 10);
}

/* ---------------- hashing + clustering ---------------- */

async function getUnhashed(env) {
  const { results } = await env.DB.prepare(
    `SELECT id, r2_key, thumbnail_url, image_url FROM instances
     WHERE dhash IS NULL AND source_domain IN
       (SELECT domain FROM domains WHERE include=1) LIMIT 200`
  ).all();
  return json(results);
}

async function saveHashes(req, env) {
  const rows = await req.json();
  for (const r of rows) {
    await env.DB.prepare(
      `UPDATE instances SET dhash=?,
         width=COALESCE(width, ?), height=COALESCE(height, ?),
         orientation=COALESCE(orientation, ?) WHERE id=?`
    ).bind(r.dhash, r.width || null, r.height || null,
      orientationOf(r.width, r.height), r.id).run();
  }
  return json({ saved: rows.length });
}

function hamming(hexA, hexB) {
  let x = BigInt("0x" + hexA) ^ BigInt("0x" + hexB);
  let c = 0;
  while (x) { c += Number(x & 1n); x >>= 1n; }
  return c;
}

async function cluster(url, env) {
  const dry = url.searchParams.get("dry") === "1";
  const { results: inst } = await env.DB.prepare(
    `SELECT id, dhash, snippet, title, orientation FROM instances
     WHERE frame_id IS NULL AND source_domain IN
       (SELECT domain FROM domains WHERE include=1)`
  ).all();

  // Pass 1: exact caption match. Same Imagn caption = same frame by definition.
  const byCaption = new Map();
  const remaining = [];
  for (const i of inst) {
    const cap = parseCaption(i.snippet);
    if (cap) {
      const key = cap.caption.slice(0, 180);
      if (!byCaption.has(key)) byCaption.set(key, []);
      byCaption.get(key).push({ ...i, parsed: cap });
    } else remaining.push(i);
  }

  // Pass 2: Hamming clustering on what captions did not cover.
  const hashed = remaining.filter((i) => i.dhash);
  const groups = [];
  const assigned = new Set();
  for (const a of hashed) {
    if (assigned.has(a.id)) continue;
    const g = [a];
    assigned.add(a.id);
    for (const b of hashed) {
      if (assigned.has(b.id)) continue;
      if (hamming(a.dhash, b.dhash) <= CONFIG.dhashThreshold) { g.push(b); assigned.add(b.id); }
    }
    groups.push(g);
  }
  const singles = remaining.filter((i) => !i.dhash).map((i) => [i]);

  const plan = {
    captionGroups: byCaption.size,
    hashGroups: groups.length,
    unhashedSingles: singles.length,
    dry,
  };
  if (dry) return json(plan);

  for (const [, members] of byCaption) await writeFrame(env, members, members[0].parsed);
  for (const g of [...groups, ...singles]) {
    const cap = parseCaption(g[0].snippet);
    const tit = parseTitle(g[0].title);
    await writeFrame(env, g, cap, tit);
  }
  await classifyNewDomains(env);
  return json({ ...plan, written: true });
}

async function writeFrame(env, members, cap, tit) {
  tit = tit || parseTitle(members[0].title);
  const res = await env.DB.prepare(
    `INSERT INTO frames (canonical_instance_id, dhash, event_date, location, league,
       team_home, team_away, event_name, player, caption, orientation)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(members[0].id, members[0].dhash || null,
    cap?.event_date || null, cap?.location || null, tit?.league || null,
    tit?.team_home || null, tit?.team_away || null, tit?.event_name || null,
    cap?.player || null, cap?.caption || null, members[0].orientation || null).run();
  const fid = res.meta.last_row_id;
  for (const m of members) {
    await env.DB.prepare(`UPDATE instances SET frame_id=? WHERE id=?`).bind(fid, m.id).run();
  }
}

async function reviewData(env) {
  const { results } = await env.DB.prepare(
    `SELECT f.id frame_id, f.dhash fhash, f.caption, i.id instance_id, i.dhash,
            i.thumbnail_url, i.r2_key, i.source_domain, i.title
     FROM frames f JOIN instances i ON i.frame_id = f.id
     ORDER BY f.id DESC LIMIT 2000`
  ).all();
  const frames = {};
  for (const r of results) {
    (frames[r.frame_id] ||= { frame_id: r.frame_id, caption: r.caption, members: [] });
    frames[r.frame_id].members.push({
      instance_id: r.instance_id,
      domain: r.source_domain,
      title: r.title,
      thumb: r.r2_key ? `/img/${r.instance_id}/600.jpg` : r.thumbnail_url,
      distance: r.dhash && r.fhash ? hamming(r.dhash, r.fhash) : null,
    });
  }
  return json(Object.values(frames));
}

/* ---------------- publish JSON ---------------- */

async function publish(env) {
  const { results: inst } = await env.DB.prepare(
    `SELECT i.*, f.featured, f.event_date, f.league, f.team_home, f.team_away,
            f.event_name, f.player, f.caption
     FROM instances i
     LEFT JOIN frames f ON f.id = i.frame_id
     WHERE i.source_domain IN (SELECT domain FROM domains WHERE include=1)
       AND i.verified = 1
     ORDER BY COALESCE(i.published_at, i.first_seen)`
  ).all();

  const feed = bucketedShuffle(inst).map(cardOf);
  await putJSON(env, "data/feed.json", { generated: now(), count: feed.length, items: feed });

  const { results: frames } = await env.DB.prepare(
    `SELECT f.*, i.r2_key, i.thumbnail_url,
       (SELECT COUNT(*) FROM instances x WHERE x.frame_id = f.id) placements
     FROM frames f LEFT JOIN instances i ON i.id = f.canonical_instance_id`
  ).all();
  const grid = frames.map((f) => ({
    frame_id: f.id,
    src: f.r2_key ? `/img/${f.canonical_instance_id}/600.jpg` : f.thumbnail_url,
    orientation: f.orientation || "landscape",
    featured: !!f.featured,
    placements: f.placements,
  }));
  await putJSON(env, "data/grid.json", { generated: now(), items: grid });

  for (const f of frames) {
    const { results: places } = await env.DB.prepare(
      `SELECT id, article_url, title, source_domain, published_at, favicon,
              r2_key, thumbnail_url
       FROM instances WHERE frame_id=? ORDER BY published_at`
    ).bind(f.id).all();
    const licenses = places.filter((p) =>
      CONFIG.stockDomains.some((s) => p.source_domain.endsWith(s)));
    const cards = places.filter((p) => !licenses.includes(p));
    await putJSON(env, `data/frame/${f.id}.json`, {
      frame: f, placements: cards.map(cardOf), licenses: licenses.map(cardOf),
    });
  }
  return json({ feed: feed.length, frames: frames.length });
}

function cardOf(i) {
  return {
    id: i.id, frame_id: i.frame_id,
    src: i.r2_key ? `/img/${i.id}/600.jpg` : i.thumbnail_url,
    large: i.r2_key ? `/img/${i.id}/1600.jpg` : (i.image_url || i.thumbnail_url),
    article_url: i.article_url, title: i.title, outlet: i.source_domain,
    favicon: i.favicon, date: i.published_at,
    orientation: i.orientation || "landscape",
    featured: !!i.featured, caption: i.caption || null,
  };
}

// months chronological, seeded shuffle within each month, then domain interleave
function bucketedShuffle(items) {
  const seed = Number(new Date().toISOString().slice(0, 10).replace(/-/g, ""));
  const rand = mulberry32(seed);
  const buckets = new Map();
  for (const i of items) {
    const k = (i.published_at || i.first_seen || "0000").slice(0, 7);
    (buckets.get(k) || buckets.set(k, []).get(k)).push(i);
  }
  const out = [];
  for (const k of [...buckets.keys()].sort()) {
    const b = buckets.get(k);
    for (let n = b.length - 1; n > 0; n--) {
      const j = Math.floor(rand() * (n + 1));
      [b[n], b[j]] = [b[j], b[n]];
    }
    out.push(...b);
  }
  // interleave on source_domain only. never on frame: repeats are the point.
  for (let n = 1; n < out.length - 1; n++) {
    if (out[n].source_domain === out[n - 1].source_domain) {
      [out[n], out[n + 1]] = [out[n + 1], out[n]];
    }
  }
  return out;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function putJSON(env, key, obj) {
  await env.IMAGES.put(key, JSON.stringify(obj), {
    httpMetadata: { contentType: "application/json", cacheControl: "public, max-age=300" },
  });
}

/* ---------------- Google Sheets sync ---------------- */
/* Field-level separation: the Worker appends rows and updates counts.
   It never writes a column a human edits (featured, include, display_name). */

async function sheetsSync(env) {
  if (!env.SHEETS_SA || !env.SHEET_ID) return json({ skipped: "SHEETS_SA / SHEET_ID not set" });
  const token = await googleToken(env);

  // Domains tab: pull include / type / display_name edits back into D1
  const domRows = await sheetGet(env, token, "Domains!A2:E");
  for (const r of domRows) {
    const [domain, include, type, display] = r;
    if (!domain) continue;
    await env.DB.prepare(
      `UPDATE domains SET include=?, type=COALESCE(?, type),
         display_name=COALESCE(?, display_name) WHERE domain=?`
    ).bind(include === "TRUE" ? 1 : 0, type || null, display || null, domain).run();
  }
  // Append domains D1 knows that the sheet does not
  const known = new Set(domRows.map((r) => r[0]));
  const { results: allDoms } = await env.DB.prepare(`SELECT * FROM domains`).all();
  const newDoms = allDoms.filter((d) => !known.has(d.domain))
    .map((d) => [d.domain, d.include ? "TRUE" : "FALSE", d.type, d.display_name, d.frame_count]);
  if (newDoms.length) await sheetAppend(env, token, "Domains!A:E", newDoms);

  // Frames tab (newest batch): pull featured edits, append new frames
  const frRows = await sheetGet(env, token, "Frames!A2:C");
  for (const r of frRows) {
    const [fid, , featured] = r;
    if (!fid) continue;
    await env.DB.prepare(`UPDATE frames SET featured=? WHERE id=?`)
      .bind(featured === "TRUE" ? 1 : 0, Number(fid)).run();
  }
  const knownF = new Set(frRows.map((r) => String(r[0])));
  const { results: allFrames } = await env.DB.prepare(
    `SELECT f.id, f.caption, f.featured, f.canonical_instance_id cid FROM frames f`).all();
  const newFrames = allFrames.filter((f) => !knownF.has(String(f.id)))
    .map((f) => [f.id,
      `=IMAGE("${CONFIG.sheetImageBase}/img/${f.cid}/600.jpg")`,
      f.featured ? "TRUE" : "FALSE",
      (f.caption || "").slice(0, 200)]);
  if (newFrames.length) await sheetAppend(env, token, "Frames!A:D", newFrames);

  return json({ domainsPulled: domRows.length, domainsPushed: newDoms.length,
    framesPulled: frRows.length, framesPushed: newFrames.length });
}

async function sheetGet(env, token, range) {
  const r = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${env.SHEET_ID}/values/${encodeURIComponent(range)}`,
    { headers: { authorization: `Bearer ${token}` } });
  const d = await r.json();
  return d.values || [];
}
async function sheetAppend(env, token, range, values) {
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${env.SHEET_ID}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`,
    { method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ values }) });
}

async function googleToken(env) {
  const sa = JSON.parse(env.SHEETS_SA);
  const iat = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email, scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token", iat, exp: iat + 3600,
  }));
  const input = `${header}.${claims}`;
  const key = await crypto.subtle.importKey("pkcs8", pemToDer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(input));
  const jwt = `${input}.${b64url(sig)}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const d = await res.json();
  if (!d.access_token) throw new Error("sheets auth failed: " + JSON.stringify(d));
  return d.access_token;
}
function b64url(x) {
  const bytes = typeof x === "string" ? new TextEncoder().encode(x) : new Uint8Array(x);
  let s = ""; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function pemToDer(pem) {
  const b64 = pem.replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}
