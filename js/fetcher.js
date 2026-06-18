// ─── CORS PROXY FETCH + hyresult.com PARSER ──────────────────────────────────
// Discovers new races for tracked athletes and imports splits automatically.

// Each proxy entry: { make: url => proxyUrl, json: bool }
// json:true  → response is JSON; extract .contents field
// json:false → response is raw HTML text
//
// CF_WORKER_URL: set this to your Cloudflare Worker URL once deployed.
// Deploy cf-worker/proxy.js at https://dash.cloudflare.com/workers
// e.g. "https://hyrox-proxy.YOUR-SUBDOMAIN.workers.dev"
const CF_WORKER_URL = 'https://hyrox-race-lab.andreasambrusg.workers.dev';

const CORS_PROXIES = [
  // Cloudflare Worker (dedicated, most reliable) — enabled when CF_WORKER_URL is set
  ...(CF_WORKER_URL ? [{ make: url => `${CF_WORKER_URL}?url=${encodeURIComponent(url)}`, json: false }] : []),
  // allorigins /get — wraps in JSON {contents:"<html>..."}
  { make: url => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`, json: true },
  // allorigins /raw — plain text fallback
  { make: url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`, json: false },
  // corsproxy.io — last resort (may block hyresult.com)
  { make: url => `https://corsproxy.io/?url=${encodeURIComponent(url)}`, json: false }
];

const STATION_ORDER_FULL = [
  'SkiErg', 'Sled Push', 'Sled Pull', 'Burpee Broad Jump',
  'Row', 'Farmers Carry', 'Sandbag Lunges', 'Wall Balls'
];

// ─── LOW-LEVEL FETCH ─────────────────────────────────────────────────────────
// Tries proxies in order; first one to return valid HTML wins.
async function proxyFetch(url, timeoutMs = 10000) {
  for (const { make, json } of CORS_PROXIES) {
    const proxyUrl = make(url);
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(proxyUrl, { signal: ctrl.signal });
      clearTimeout(tid);
      // skip on any non-2xx (403 block, 429 rate limit, 5xx, etc)
      if (!res.ok) continue;
      let text;
      if (json) {
        const j = await res.json().catch(() => null);
        if (!j) continue;
        text = j.contents || '';
      } else {
        text = await res.text();
      }
      // sanity check — must look like a real HTML page, not a proxy error page
      if (text.length > 200 && text.includes('<')) return text;
    } catch { /* network error or abort — try next proxy */ }
  }
  return null;
}

// ─── PARSE ATHLETE PAGE ───────────────────────────────────────────────────────
// Returns array of { resultId, rawText } for all result links found on the page.
function parseAthletePage(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const found = [];

  doc.querySelectorAll('a[href*="/result/"]').forEach(a => {
    const m = a.getAttribute('href').match(/\/result\/([A-Z0-9]+)/i);
    if (!m) return;
    const resultId = m[1];

    // Prefer the link's own text; only walk up to li or a tight container.
    // Avoid climbing into large divs that contain multiple entries.
    let text = a.textContent.trim();
    if (!text || text.length < 4) {
      const li = a.closest('li');
      if (li) text = li.textContent.trim();
    }

    // Strip leading time patterns like "1:21:42" or ":21:42"
    text = text.replace(/^\d*:\d{2}:\d{2}\s*/, '').trim();
    // Strip leading rank patterns like "#1602" or "# 1602"
    text = text.replace(/^#?\s*\d+\s*/, '').trim();

    if (!found.some(f => f.resultId === resultId)) {
      found.push({ resultId, text });
    }
  });
  return found;
}

// ─── PARSE RESULT PAGE METADATA ──────────────────────────────────────────────
// Extracts athlete names, event, total time, rank, division from the page header.
function parseResultMeta(html, athleteSlug) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // athlete name from link matching slug
  let athlete = athleteSlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  let partner = null, partnerSlug = null;
  doc.querySelectorAll('a[href*="/athlete/"]').forEach(a => {
    const sl = a.getAttribute('href').replace('/athlete/', '');
    const nm = a.textContent.trim();
    if (sl === athleteSlug) athlete = nm;
    else if (sl !== athleteSlug && nm) { partner = nm; partnerSlug = sl; }
  });

  // total time — look for H:MM:SS or M:SS pattern near rank text
  let totalSecs = 0, total = '';
  const timeMatch = html.match(/(\d{1,2}:\d{2}:\d{2})\s*#(\d+)\s*of\s*(\d+)/);
  if (timeMatch) {
    total = timeMatch[1];
    totalSecs = splitToSecs(total);
  }

  // rank string
  const rank = timeMatch ? `#${timeMatch[2]} of ${timeMatch[3]}` : '';

  // AG
  const agMatch = html.match(/#(\d+)\s*in\s*AG\s*([\w-]+)/i);
  const ag = agMatch ? `#${agMatch[1]} AG${agMatch[2]}` : '';

  // division: DBMEN = doubles
  const isDoubles = /DOUBLES|DBMEN/i.test(html);
  const category = isDoubles ? 'DOUBLES' : 'OPEN';
  const divMatch = html.match(/hyrox-(\w+)-men/i);
  const division = divMatch ? divMatch[1].toUpperCase() : 'MEN';

  // event label from breadcrumb-style links
  let label = '';
  const evMatch = html.match(/HYROX\s+([A-Z][a-zA-Z\s]+\d{4})/);
  if (evMatch) label = evMatch[1].trim();

  // age group from label or DOUBLES division
  const agGroup = (ag.match(/AG([\w-]+)/) || ['','30-34'])[1];

  return { athlete, partner, partnerSlug, total, totalSecs, rank, ag, label,
           category, division, ageGroup: agGroup };
}

// ─── PARSE SPLITS TABLE ───────────────────────────────────────────────────────
// Parses the HTML from ?tab=splits into { runs, workouts, rxEntry, rxExit }.
function parseSplitsFromHtml(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // collect all 4-column table rows
  const rows = [];
  doc.querySelectorAll('table tr').forEach(tr => {
    const tds = [...tr.querySelectorAll('td')];
    if (tds.length >= 4) {
      rows.push({
        segment: tds[0].textContent.trim(),
        split:   tds[3].textContent.trim()
      });
    }
  });

  if (!rows.length) return null;

  const runs     = [];
  const workouts = new Array(8).fill(0);
  const rxEntry  = new Array(7).fill(0);
  const rxExit   = new Array(7).fill(0);
  let stationIdx = -1;

  for (const { segment, split } of rows) {
    if (!segment || !split) continue;
    const secs = splitToSecs(split);

    if (segment === 'Roxzone In') {
      runs.push(secs);

    } else if (segment.endsWith(' In') && segment !== 'Roxzone In') {
      const stName = segment.replace(/ In$/, '');
      const idx = STATION_ORDER_FULL.indexOf(stName);
      if (stName === 'Wall Balls') {
        // Run 8 (final run to Wall Balls — no prior Roxzone In)
        runs.push(secs);
        stationIdx = 7;
      } else if (idx !== -1) {
        stationIdx = idx;
        if (idx < 7) rxEntry[idx] = secs;
      }

    } else if (segment.endsWith(' Out') && segment !== 'Roxzone Out') {
      const stName = segment.replace(/ Out$/, '');
      const idx = STATION_ORDER_FULL.indexOf(stName);
      if (idx !== -1) workouts[idx] = secs;

    } else if (segment === 'Roxzone Out') {
      if (stationIdx >= 0 && stationIdx < 7) rxExit[stationIdx] = secs;

    } else if (segment === 'Total time') {
      workouts[7] = secs; // Wall Balls workout
    }
  }

  if (!runs.length || !workouts[0]) return null;

  const runsSecs      = runs.reduce((a, b) => a + b, 0);
  const workoutsSecs  = workouts.reduce((a, b) => a + b, 0);
  const roxzoneSecs   = rxEntry.reduce((a, b) => a + b, 0) + rxExit.reduce((a, b) => a + b, 0);
  const totalSecs     = runsSecs + workoutsSecs + roxzoneSecs;

  return { runs, workouts, rxEntry, rxExit, runsSecs, workoutsSecs, roxzoneSecs, totalSecs };
}

// ─── AUTO-ASSIGN SHORT ID ────────────────────────────────────────────────────
function makeShortId(label, category, existingIds) {
  // e.g. "Berlin 2026" → "BER'26", collision → "BER'26-2"
  const words = label.toUpperCase().replace(/[()]/g, '').split(/\s+/);
  const base = (words[0] || 'RCE').slice(0, 3);
  const fullYear = words.find(w => /^\d{4}$/.test(w)) || '';
  const yr = fullYear.slice(2); // last 2 digits e.g. '26

  let candidate = `${base}'${yr}`;
  let n = 2;
  while (existingIds.has(candidate)) candidate = `${base}'${yr}-${n++}`;
  return candidate;
}
// ─── HYROX NEWS RSS ──────────────────────────────────────────────────────────
// Fetches and parses https://hyrox.com/feed (RSS 2.0).
// Returns array of { title, link, date, description } or null on failure.

// Allowed origin hostnames for external links and images from RSS / athlete data
const ALLOWED_ORIGINS = new Set(['hyrox.com', 'www.hyrox.com', 'hyresult.com', 'www.hyresult.com', 'news.google.com']);

function isSafeUrl(raw) {
  try {
    const u = new URL(raw);
    return (u.protocol === 'https:' || u.protocol === 'http:') && ALLOWED_ORIGINS.has(u.hostname);
  } catch { return false; }
}
// Parse a standard RSS XML doc into news items
function parseRssItems(doc, opts = {}) {
  return [...doc.querySelectorAll('item')].map(item => {
    let image = null;
    const media = item.querySelector('content') || item.getElementsByTagNameNS('http://search.yahoo.com/mrss/', 'content')[0];
    if (media) image = media.getAttribute('url');
    if (!image) {
      const enc = item.querySelector('enclosure');
      if (enc && (enc.getAttribute('type') || '').startsWith('image')) image = enc.getAttribute('url');
    }
    if (!image) {
      const encoded = item.querySelector('encoded')?.textContent || item.querySelector('description')?.textContent || '';
      const imgMatch = encoded.match(/<img[^>]+src=["']([^"']+)["']/);
      if (imgMatch) image = imgMatch[1];
    }
    const rawLink = item.querySelector('link')?.textContent?.trim() || '';
    // Google News link safety: allow news.google.com redirect URLs
    const safeLink = /^https?:\/\//i.test(rawLink) ? rawLink : '#';
    const source = item.querySelector('source')?.textContent?.trim() || opts.source || '';
    return {
      title:       item.querySelector('title')?.textContent?.trim() || '',
      link:        safeLink,
      date:        item.querySelector('pubDate')?.textContent?.trim() || '',
      description: item.querySelector('description')?.textContent?.replace(/<[^>]+>/g, '').trim().slice(0, 160) || '',
      image:       isSafeUrl(image || '') ? image : null,
      source
    };
  }).filter(i => i.title);
}

async function fetchNews(limit = 100) {
  // Google News via rss2json.com — avoids Cloudflare 503 block on news.google.com.
  // Free tier = 10 items/query, rate-limited if called in parallel.
  // Strategy: fire queries sequentially with a small delay, cache in localStorage for 30 min.
  const CACHE_KEY = 'hyrox_news_cache';
  const CACHE_TTL = 30 * 60 * 1000; // 30 minutes
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (cached && (Date.now() - cached.ts) < CACHE_TTL && cached.items?.length > 5) {
      return cached.items.slice(0, limit);
    }
  } catch {}

  const RSS2JSON = 'https://api.rss2json.com/v1/api.json?rss_url=';
  const queries = [
    'hyrox',
    'hyrox race',
    'hyrox fitness',
    'hyrox training',
    'hyrox competition',
  ];

  const allItems = [];
  for (const q of queries) {
    try {
      const rss = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en&gl=US&ceid=US:en`;
      const json = await fetch(RSS2JSON + encodeURIComponent(rss))
        .then(r => r.ok ? r.json() : null).catch(() => null);
      (json?.items || []).forEach(i => allItems.push({
        title:       (i.title || '').trim(),
        link:        /^https?:\/\//i.test(i.link || '') ? i.link : '#',
        date:        i.pubDate || '',
        description: (i.description || i.content || '').replace(/<[^>]+>/g, '').trim().slice(0, 160),
        image:       isSafeUrl(i.thumbnail || '') ? i.thumbnail : null,
        source:      i.author || i.categories?.[0] || 'Google News',
      }));
    } catch {}
    // Small delay to avoid rss2json free-tier rate limit
    await new Promise(r => setTimeout(r, 350));
  }

  // Deduplicate by normalised title
  const seen = new Set();
  const unique = allItems.filter(item => {
    if (!item.title) return false;
    const key = item.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort newest first
  unique.sort((a, b) => new Date(b.date) - new Date(a.date));
  const result = unique.slice(0, limit);

  // Cache result
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), items: result })); } catch {}

  return result;
}
// ─── ATHLETE LOOKUP ──────────────────────────────────────────────────────────
// Accepts a name ("John Doe"), slug ("john-doe"), or hyresult.com URL.
// Returns { slug, name } on success, null if not found or CORS blocked.
async function lookupAthlete(query) {
  query = query.trim();
  if (!query) return null;

  // Extract slug from URL
  let slug;
  const urlMatch = query.match(/\/athlete\/([a-z0-9-]+)/i);
  if (urlMatch) {
    slug = urlMatch[1]; // preserve original casing from URL
  } else if (/^[a-z0-9-]+$/.test(query) && !query.includes(' ')) {
    slug = query.toLowerCase(); // already a slug
  } else {
    // Name → slug: "John Doe" → "john-doe"
    slug = query.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-');
  }
  if (!slug) return null;

  const url = `https://www.hyresult.com/athlete/${slug}`;
  const html = await proxyFetch(url);
  if (!html) return null;

  // Extract athlete name from h1
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const h1 = doc.querySelector('h1');
  const name = h1?.textContent?.trim() || query;

  // Verify it's a real athlete page and collect race list
  const races = parseAthletePage(html);
  if (!races.length) return null;

  return { slug, name, races };
}

// ─── IMPORT A SINGLE RACE BY RESULT ID ──────────────────────────────────────────
async function importRaceById(resultId, athleteSlug, labelHint) {
  if (store.has(resultId)) return { status: 'exists' };
  const splitsUrl = `https://www.hyresult.com/result/${resultId}?tab=splits`;
  const splitsHtml = await proxyFetch(splitsUrl);
  if (!splitsHtml) return { status: 'error', msg: `Could not fetch ${resultId}` };
  const splits = parseSplitsFromHtml(splitsHtml);
  if (!splits) return { status: 'error', msg: `Could not parse splits for ${resultId}` };
  const meta = parseResultMeta(splitsHtml, athleteSlug);
  const existingIds = new Set(RACES.map(r => r.id));
  const id = makeShortId(meta.label || labelHint, meta.category, existingIds);
  const race = {
    resultId, id,
    label:        meta.label || labelHint,
    athlete:      meta.athlete,
    athleteSlug:  athleteSlug,
    partner:      meta.partner,
    partnerSlug:  meta.partnerSlug,
    category:     meta.category,
    division:     meta.division,
    ageGroup:     meta.ageGroup,
    rank:         meta.rank,
    ag:           meta.ag,
    pct:          '',
    color:        null,
    total:        meta.total,
    totalSecs:    splits.totalSecs || meta.totalSecs,
    runsSecs:     splits.runsSecs,
    workoutsSecs: splits.workoutsSecs,
    roxzoneSecs:  splits.roxzoneSecs,
    runs:         splits.runs,
    workouts:     splits.workouts,
    rxEntry:      splits.rxEntry,
    rxExit:       splits.rxExit,
    radarStrength: null
  };
  const added = store.add(race);
  if (added) store.mergeIntoRaces();
  return { status: added ? 'added' : 'exists', race };
}

// ─── MAIN SYNC ───────────────────────────────────────────────────────────────
// Discovers new races for all tracked athletes and imports splits.
// Calls onProgress(msg) during the process.
// Calls onComplete(newCount, errorMsg) when finished.
async function syncAthletes(onProgress, onComplete) {
  let newCount = 0;
  let fetchFailed = 0;

  for (const { slug, name } of getTrackedAthletes()) {
    onProgress(`Checking ${name}…`);
    const athleteUrl = `https://www.hyresult.com/athlete/${slug}`;
    const html = await proxyFetch(athleteUrl);
    if (!html) { onProgress(`⚠ Could not reach hyresult.com for ${name}`); fetchFailed++; continue; }

    const found = parseAthletePage(html);
    onProgress(`Found ${found.length} race(s) for ${name}`);

    for (const { resultId, text } of found) {
      if (store.has(resultId)) continue; // already have it

      onProgress(`Importing ${resultId}…`);
      // Fetch splits tab
      const splitsUrl = `https://www.hyresult.com/result/${resultId}?tab=splits`;
      const splitsHtml = await proxyFetch(splitsUrl);
      if (!splitsHtml) { onProgress(`⚠ Could not fetch splits for ${resultId}`); continue; }

      const splits = parseSplitsFromHtml(splitsHtml);
      if (!splits) { onProgress(`⚠ Could not parse splits for ${resultId}`); continue; }

      // Also parse metadata
      const meta = parseResultMeta(splitsHtml, slug);

      const existingIds = new Set(RACES.map(r => r.id));
      const id = makeShortId(meta.label || text, meta.category, existingIds);

      const race = {
        resultId,
        id,
        label:       meta.label || text.slice(0, 30),
        athlete:     meta.athlete,
        athleteSlug: slug,
        partner:     meta.partner,
        partnerSlug: meta.partnerSlug,
        category:    meta.category,
        division:    meta.division,
        ageGroup:    meta.ageGroup,
        rank:        meta.rank,
        ag:          meta.ag,
        pct:         '',
        color:       null, // assigned by store.mergeIntoRaces
        total:       meta.total,
        totalSecs:   splits.totalSecs || meta.totalSecs,
        runsSecs:    splits.runsSecs,
        workoutsSecs: splits.workoutsSecs,
        roxzoneSecs:  splits.roxzoneSecs,
        runs:         splits.runs,
        workouts:     splits.workouts,
        rxEntry:      splits.rxEntry,
        rxExit:       splits.rxExit,
        radarStrength: null
      };

      const added = store.add(race);
      if (added) {
        store.mergeIntoRaces();
        newCount++;
        onProgress(`✓ Added ${race.id} — ${race.label}`);
      }
    }
  }

  const tracked = getTrackedAthletes();
  const errorMsg = (fetchFailed === tracked.length && newCount === 0)
    ? 'CORS proxies blocked — open via localhost for live sync'
    : null;
  onComplete(newCount, errorMsg);
}
