// ─── CORS PROXY FETCH + hyresult.com PARSER ──────────────────────────────────
// Discovers new races for tracked athletes and imports splits automatically.

const CORS_PROXIES = [
  url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  url => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  url => `https://thingproxy.freeboard.io/fetch/${url}`,
  url => `https://corsproxy.io/?url=${encodeURIComponent(url)}`
];

const STATION_ORDER_FULL = [
  'SkiErg', 'Sled Push', 'Sled Pull', 'Burpee Broad Jump',
  'Row', 'Farmers Carry', 'Sandbag Lunges', 'Wall Balls'
];

// ─── LOW-LEVEL FETCH ─────────────────────────────────────────────────────────
async function proxyFetch(url, timeoutMs = 10000) {
  for (const makeProxy of CORS_PROXIES) {
    const proxyUrl = makeProxy(url);
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(proxyUrl, { signal: ctrl.signal });
      clearTimeout(tid);
      // skip on any non-2xx (403 block, 429 rate limit, etc) and try next proxy
      if (!res.ok) continue;
      const text = await res.text();
      // sanity check — proxy returned a real HTML page, not an error JSON
      if (text.length > 200 && !text.startsWith('{"')) return text;
    } catch { /* try next proxy */ }
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
    const text = a.closest('li, p, div')?.textContent?.trim() || a.textContent.trim();
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
const ALLOWED_ORIGINS = new Set(['hyrox.com', 'www.hyrox.com', 'hyresult.com', 'www.hyresult.com']);

function isSafeUrl(raw) {
  try {
    const u = new URL(raw);
    return (u.protocol === 'https:' || u.protocol === 'http:') && ALLOWED_ORIGINS.has(u.hostname);
  } catch { return false; }
}
async function fetchNews(limit = 8) {
  const html = await proxyFetch('https://hyrox.com/feed');
  if (!html) return null;
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/xml');
  const items = [...doc.querySelectorAll('item')].slice(0, limit);
  return items.map(item => {
    // Extract image: try media:content, then enclosure, then first <img> in content
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
    return {
      title:       item.querySelector('title')?.textContent?.trim() || '',
      link:        isSafeUrl(item.querySelector('link')?.textContent?.trim() || '') ? item.querySelector('link').textContent.trim() : '#',
      date:        item.querySelector('pubDate')?.textContent?.trim() || '',
      description: item.querySelector('description')?.textContent?.replace(/<[^>]+>/g, '').trim().slice(0, 120) || '',
      image:       isSafeUrl(image || '') ? image : null
    };
  });
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
    slug = urlMatch[1].toLowerCase();
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
