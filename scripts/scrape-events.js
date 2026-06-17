/**
 * scrape-events.js — Weekly HYROX event data updater
 *
 * What it does:
 *  1. Reads data/sN/events.json (source of truth)
 *  2. Visits hyrox.com/find-my-race and discovers all listed event URLs
 *  3. For each upcoming event: visits the event page, checks for
 *     "Buy Tickets here" button → sets ticketsOnSale true/false
 *  4. Auto-creates full event objects for any NEW events found on the site
 *     and appends them to data/s10/events.json (newest season)
 *  5. Writes updated JSON files back to data/sN/events.json
 *  6. Regenerates js/events-data.js from the JSON files (browser-compatible)
 *
 * Usage:
 *   cd scripts
 *   npm install          ← first time only
 *   node scrape-events.js
 *
 * Options:
 *   --season s10         only probe a single season (new events always go to s10)
 *   --dry-run            print changes without writing files
 */

'use strict';
const { chromium } = require('playwright');
const fs           = require('fs');
const path         = require('path');

const ROOT      = path.join(__dirname, '..');
const DATA_DIR  = path.join(ROOT, 'data');
const JS_OUT    = path.join(ROOT, 'js', 'events-data.js');

const args        = process.argv.slice(2);
const DRY_RUN     = args.includes('--dry-run');
const ONLY_SEASON = (() => { const i = args.indexOf('--season'); return i >= 0 ? args[i + 1] : null; })();

const SEASONS_TO_SCRAPE = ONLY_SEASON ? [ONLY_SEASON] : ['s9', 's10'];
const TICKET_BTN_RE     = /buy\s+tickets\s+here/i;

// Country → flag emoji map (covers most HYROX markets)
const COUNTRY_FLAGS = {
  'indonesia': '🇮🇩', 'australia': '🇦🇺', 'china': '🇨🇳', 'uae': '🇦🇪',
  'united arab emirates': '🇦🇪', 'india': '🇮🇳', 'turkey': '🇹🇷',
  'japan': '🇯🇵', 'thailand': '🇹🇭', 'south africa': '🇿🇦',
  'usa': '🇺🇸', 'united states': '🇺🇸', 'spain': '🇪🇸', 'brazil': '🇧🇷',
  'uk': '🇬🇧', 'united kingdom': '🇬🇧', 'germany': '🇩🇪', 'france': '🇫🇷',
  'netherlands': '🇳🇱', 'norway': '🇳🇴', 'italy': '🇮🇹', 'sweden': '🇸🇪',
  'canada': '🇨🇦', 'belgium': '🇧🇪', 'finland': '🇫🇮', 'greece': '🇬🇷',
  'ireland': '🇮🇪', 'poland': '🇵🇱', 'mexico': '🇲🇽', 'argentina': '🇦🇷',
  'switzerland': '🇨🇭', 'south korea': '🇰🇷', 'singapore': '🇸🇬',
  'latvia': '🇱🇻', 'austria': '🇦🇹', 'portugal': '🇵🇹', 'denmark': '🇩🇰',
  'hungary': '🇭🇺', 'czech republic': '🇨🇿',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function readSeason(key) {
  const file = path.join(DATA_DIR, key, 'events.json');
  if (!fs.existsSync(file)) { console.warn(`  ⚠ No data/${key}/events.json — skipping`); return []; }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeSeason(key, events) {
  const file = path.join(DATA_DIR, key, 'events.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(events, null, 2), 'utf8');
}

/** Slug-ify a city name for use as an event id */
function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ── Step 1: discover all event URLs from find-my-race ───────────────────────

async function discoverEventUrls(page) {
  console.log('\n📡 Visiting hyrox.com/find-my-race …');
  await page.goto('https://hyrox.com/find-my-race/', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(2000);

  const events = await page.evaluate(() => {
    const results = [];
    const seen = new Set();

    // Each event card on find-my-race — grab URL + visible text
    document.querySelectorAll('a[href*="/event/"]').forEach(a => {
      const url = (a.href || '').replace(/\/$/, '') + '/';
      if (!url.includes('hyrox.com/event/') || seen.has(url)) return;
      seen.add(url);

      // Walk up to find the card container and grab city/country/date text
      const card = a.closest('[class*="card"], article, li, .event') || a;
      results.push({
        url,
        cardText: card.innerText || a.innerText || '',
      });
    });
    return results;
  });

  console.log(`  Found ${events.length} event URLs on find-my-race`);
  return events;
}

// ── Step 2: probe one event page (tickets + full data for new events) ────────

async function probeEvent(page, venueUrl, full = false, timeoutMs = 12000, evDate = null) {
  try {
    await page.goto(venueUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await page.waitForTimeout(1500);

    // Expand all accordion / tab sections so wave data is in the DOM
    await page.evaluate(() => {
      document.querySelectorAll('[class*="acc_tab"], details').forEach(el => {
        if (el.tagName === 'DETAILS') el.open = true;
        else el.style.display = 'block';
      });
    });

    return await page.evaluate(({ ticketRe, doFull, evDate }) => {
      const elems      = Array.from(document.querySelectorAll('button, a'));
      const ticketsOn  = elems.some(el => new RegExp(ticketRe).test(el.textContent));

      // Map PDF detection runs for all probes (maps get published close to event date)
      const mapLinkEl = Array.from(document.querySelectorAll('a[href*=".pdf"]'))
        .find(a => /map|floor.?plan|venue/i.test(a.href + a.innerText));
      const mapImgQuick = mapLinkEl ? mapLinkEl.href : null;

      if (!doFull) return { ticketsOnSale: ticketsOn, mapImg: mapImgQuick };

      // ── Full scrape for new events ──────────────────────────────────────
      const title    = document.title || '';

      // Date spans with class w-post-elm-value are the most reliable source
      const dateSpans = Array.from(document.querySelectorAll('.w-post-elm-value'))
        .map(el => (el.innerText || '').trim())
        .filter(t => /\b\d{4}\b/.test(t));
      const scrapedDate = dateSpans[0] || null;

      // Venue
      const venueEl = Array.from(document.querySelectorAll('*')).find(el => {
        if (el.children.length > 0) return false;
        const t = (el.innerText || '').trim();
        return t.length > 4 && t.length < 80 &&
          (el.closest('[class*="venue"]') || el.closest('[class*="location"]'));
      });
      const venueText = venueEl ? (venueEl.innerText || '').trim() : null;

      // City / championship
      const h1 = document.querySelector('h1');
      const cityRaw = h1 ? h1.innerText.trim() : title.split('|')[0].trim();
      const metaGeo = document.querySelector('meta[name="geo.region"]');
      const countryHint = metaGeo ? metaGeo.content : null;
      const isChamp = /world.{0,10}champ|championship/i.test(title + (h1 ? h1.innerText : ''));

      // Map PDF (also detected in light probe above; here we reuse it)
      const mapImg = mapImgQuick;

      // ── Wave scraping ────────────────────────────────────────────────
      // Supports two layouts:
      //   Layout A: bare day-name headers + 24-hr times (most events)
      //   Layout B: "DayName, D. Month YYYY" headers + am/pm times (championships)
      //   Also handles "Category | DayName, time am/pm" inline-day entries.

      const DAY_NAMES  = /\b(saturday|sunday|monday|tuesday|wednesday|thursday|friday)\b/i;
      const TIME_AMPM  = /\b(\d{1,2}:\d{2})\s*(am|pm)\b/i;
      const FULL_DATE  = /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday),?\s+\d{1,2}[\.\s]+\w+[\.\s]+\d{4}/i;
      const DAY_ORDER  = { monday:1, tuesday:2, wednesday:3, thursday:4, friday:5, saturday:6, sunday:7 };

      // Detect Layout B
      const pageText = Array.from(document.querySelectorAll('strong, b, span, p, li'))
        .map(el => el.children.length === 0 ? (el.innerText||'') : '').join(' ');
      const isAmPmLayout = /\d:\d{2}\s*[ap]m\b/i.test(pageText);

      // Parse "D. Month YYYY" from a full-date header → UTC ms
      function parseDateMs(text) {
        const m = text.match(/(\d{1,2})[\.\s]+([a-z]+)[\.\s]+(\d{4})/i);
        if (!m) return null;
        const mo = {jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11}[m[2].slice(0,3).toLowerCase()];
        return (mo !== undefined) ? Date.UTC(+m[3], mo, +m[1]) : null;
      }

      function to24(timeStr, ampm) {
        const parts = timeStr.split(':');
        let h = +parts[0], mn = +(parts[1]||0);
        if (ampm.toLowerCase() === 'pm' && h !== 12) h += 12;
        if (ampm.toLowerCase() === 'am' && h === 12) h = 0;
        return String(h).padStart(2,'0') + ':' + String(mn).padStart(2,'0');
      }

      // evDate from Node side e.g. "2026-06-18"
      const evStartMs = evDate
        ? Date.UTC(+evDate.slice(0,4), +evDate.slice(5,7)-1, +evDate.slice(8,10))
        : null;

      function isDayHeader(text) {
        if (TIME_AMPM.test(text)) return false;
        if (FULL_DATE.test(text))
          return !/\b\d{1,2}:\d{2}/.test(text.replace(FULL_DATE, ''));
        // Layout A: after stripping day name / digits / month words / punctuation → nothing left
        const residual = text
          .replace(DAY_NAMES, '')
          .replace(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec\w*)\b/gi, '')
          .replace(/\d+/g, '').replace(/[.,\-\s]/g, '').trim();
        return DAY_NAMES.test(text) && residual.length === 0 && !/\b\d{1,2}:\d{2}/.test(text);
      }

      const waves = [];
      let currentDay = 1;
      let firstDayNum = null; // Layout A anchor

      const candidates = Array.from(document.querySelectorAll('strong, b, span, p, li'))
        .filter(el => {
          if (el.children.length > 0) return false;
          const t = (el.innerText || '').trim();
          return t && t.length < 200 &&
            (DAY_NAMES.test(t) || TIME_AMPM.test(t) || /\b\d{1,2}:\d{2}\b/.test(t));
        });

      for (const el of candidates) {
        const text = (el.innerText || '').trim();

        // ── Day header ──
        if (isDayHeader(text)) {
          if (evStartMs !== null && FULL_DATE.test(text)) {
            // Layout B: compute exact day number from the actual calendar date
            const hMs = parseDateMs(text);
            if (hMs !== null) currentDay = Math.round((hMs - evStartMs) / 86400000) + 1;
          } else {
            // Layout A: weekday arithmetic
            const m = text.match(DAY_NAMES);
            if (m) {
              const dn = DAY_ORDER[m[1].toLowerCase()];
              if (firstDayNum === null) { firstDayNum = dn; currentDay = 1; }
              else currentDay = ((dn - firstDayNum + 7) % 7) + 1;
            }
          }
          continue;
        }

        // Skip pre-event days (registration days before ev.date)
        if (currentDay < 1) continue;

        let timePadded, cat;

        if (isAmPmLayout) {
          // Try "Category | DayName, time am/pm" — bib-collection / inline-day format
          const inlineM = text.match(/^(.+?)\|\s*(monday|tuesday|wednesday|thursday|friday|saturday|sunday),?\s+(\d{1,2}:\d{2})\s*(am|pm)\b/i);
          if (inlineM) {
            cat = inlineM[1].trim();
            timePadded = to24(inlineM[3], inlineM[4]);
            if (evStartMs !== null) {
              const dn = DAY_ORDER[inlineM[2].toLowerCase()];
              const utcToOrd = [7,1,2,3,4,5,6]; // JS getUTCDay 0=Sun→7
              const evOrd = utcToOrd[new Date(evStartMs).getUTCDay()];
              currentDay = ((dn - evOrd + 7) % 7) + 1;
            }
          } else {
            // Layout C: "time am/pm – time am/pm CATEGORY" (time-range-first, Jakarta style)
            // e.g. "09:00AM – 13:40PM HYROX MEN OPEN INCLD. MEN ADAPTIVE"
            const lcM = text.match(/^(\d{1,2}:\d{2})\s*(am|pm)\s*[–\-]\s*\d{1,2}:\d{2}\s*(?:am|pm)?\s+(.+)/i);
            if (lcM) {
              timePadded = to24(lcM[1], lcM[2]);
              cat = lcM[3].trim();
            } else {
              // "Category | time am/pm" or bare "time am/pm"
              const m = text.match(/^(.*?)\|\s*(\d{1,2}:\d{2})\s*(am|pm)\b/i)
                       || text.match(/^(.*?)(\d{1,2}:\d{2})\s*(am|pm)\b/i);
              if (!m) continue;
              // Skip bare venue-opening lines (no pipe, no category text)
              if (!m[1].trim() && !text.includes('|')) continue;
              cat = m[1].trim();
              timePadded = to24(m[2], m[3]);
            }
          }
        } else {
          // Layout A: extract first time token
          const m = text.match(/\b(\d{1,2}:\d{2})/);
          if (!m) continue;
          timePadded = m[1].replace(/^(\d):/, '0$1:');
          cat = text.replace(/\b\d{1,2}:\d{2}(?:\s*[–\-]\s*\d{1,2}:\d{2})?/g, '')
                    .replace(/[–\-]/g, '').replace(/\s+/g, ' ').trim();
        }

        // Clean up category
        cat = (cat || '')
          .replace(/\s*\|\s*(am|pm)\s*$/i, '')
          .replace(/\s*\|\s*(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday),?\s*$/i, '')
          .replace(/\s*\|+\s*$/, '').replace(/:\s*$/, '').trim();

        if (/^(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i.test(cat)) continue;
        if (/^(?:am|pm)$/i.test(cat)) continue;
        if (!cat) cat = 'Open';
        if (/fan village|partner activation|food|drinks|stage program|early registration|^registration$/i.test(cat)) continue;
        if (cat.length > 60 || cat.split(/\s+/).length > 8) continue;

        const isDupe = waves.some(w => w.day === currentDay && w.time === timePadded && w.category === cat);
        if (!isDupe) waves.push({ day: currentDay, category: cat, time: timePadded });
      }

      return {
        ticketsOnSale: ticketsOn,
        scrapedTitle:   title,
        scrapedCity:    cityRaw,
        scrapedDate:    scrapedDate,
        scrapedVenue:   venueText,
        scrapedCountry: countryHint,
        isChampionship: isChamp,
        mapImg,
        waves,
        wavesConfirmed: waves.length > 0,
      };
    }, { ticketRe: TICKET_BTN_RE.source, doFull: full, evDate });

  } catch (err) {
    console.warn(`    ⚠ Failed to probe ${venueUrl}: ${err.message}`);
    return null;
  }
}

// ── Step 3: build a new event object from scraped data ───────────────────────

function buildNewEvent(venueUrl, scraped, seasonKey, allKnownEvents = []) {
  // Parse city from title: "AirAsia HYROX Jakarta | HYROX" → "Jakarta"
  // or from scrapedCity h1 text
  let city = scraped.scrapedCity || '';
  // Strip "HYROX" prefix/suffix and sponsor names
  city = city.replace(/^.*hyrox\s+/i, '').replace(/\s*\|.*$/, '').trim();
  // Proper title-case: lowercase first so ALL-CAPS source text (e.g. "BORDEAUX") converts correctly
  city = city.toLowerCase().replace(/(?:^|\s)(\S)/g, (m, c) => m.replace(c, c.toUpperCase()));
  // Preserve special uppercase first chars like İ (Turkish dotted I)
  if (/^i̇/i.test(city) && /izmir/i.test(city)) city = 'İzmir';

  // Derive country from URL path or title
  const urlSlug = venueUrl.replace(/.*\/event\//, '').replace(/\/$/, '');
  let country = 'TBC';
  let flag    = '🌍';
  if (scraped.scrapedCountry) {
    // geo.region = "DE", "US", etc — not a full name, but useful as fallback
    country = scraped.scrapedCountry;
  }
  // Try to match known countries from the city name / title text
  const searchText = (scraped.scrapedTitle + ' ' + city).toLowerCase();
  for (const [name, f] of Object.entries(COUNTRY_FLAGS)) {
    if (searchText.includes(name)) { country = name.replace(/\b\w/g, c => c.toUpperCase()); flag = f; break; }
  }

  // Parse ISO date from scrapedDate like "27. Jun. 2026 – 28. Jun. 2026"
  let isoDate   = '2099-01-01';  // fallback — sorts to end
  let dateLabel = 'Date TBA';
  if (scraped.scrapedDate) {
    const m = scraped.scrapedDate.match(/(\d{1,2})[.\s]+([A-Za-z]+)[.\s]+(\d{4})/);
    if (m) {
      const months = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };
      const mo = months[(m[2].slice(0,3).toLowerCase())] || 1;
      isoDate   = `${m[3]}-${String(mo).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
      dateLabel = scraped.scrapedDate.replace(/\s+/g, ' ').trim();
    }
  }

  let id = `${seasonKey}-${slugify(city)}`;
  // Deduplicate: if the base ID already exists in any known event, append a numeric suffix
  const knownIds = new Set(allKnownEvents.map(ev => ev.id));
  let suffix = 2;
  while (knownIds.has(id)) id = `${seasonKey}-${slugify(city)}-${suffix++}`;

  return {
    id,
    city,
    country,
    flag,
    venue:          scraped.scrapedVenue || 'TBC',
    date:           isoDate,
    dateLabel,
    status:         'upcoming',
    isChampionship: scraped.isChampionship || false,
    ticketsOnSale:  scraped.ticketsOnSale,
    venueUrl,
    mapImg:         scraped.mapImg || null,
    mapImgDirect:   null,
    wavesConfirmed: scraped.wavesConfirmed || false,
    waves:          scraped.waves || [],
  };
}

// ── Step 4: regenerate js/events-data.js from JSON files ────────────────────

function regenerateEventsDataJs() {
  const s7  = readSeason('s7');
  const s8  = readSeason('s8');
  const s9  = readSeason('s9');
  const s10 = readSeason('s10');

  const header = `// ─── AUTO-GENERATED by scripts/scrape-events.js ─────────────────────────────
// Source of truth: data/sN/events.json  ·  Do not edit this file manually.
// Run: cd scripts && node scrape-events.js
// Generated: ${new Date().toISOString()}
`;

  const out = [
    header,
    `const HYROX_S7_EVENTS = ${JSON.stringify(s7, null, 2)};\n`,
    `const HYROX_S8_EVENTS = ${JSON.stringify(s8, null, 2)};\n`,
    `const HYROX_EVENTS = ${JSON.stringify(s9, null, 2)};  // Season 9\n`,
    `const HYROX_S10_EVENTS = ${JSON.stringify(s10, null, 2)};\n`,
  ];

  // Preserve the HYROX_SEASONS block from the existing file
  const existing = fs.existsSync(JS_OUT) ? fs.readFileSync(JS_OUT, 'utf8') : '';
  const seasonsMatch = existing.match(/(const HYROX_SEASONS\s*=[\s\S]+)/);
  if (seasonsMatch) {
    out.push(seasonsMatch[1]);
  } else {
    out.push('// ⚠ HYROX_SEASONS block not found — add it manually');
  }

  fs.writeFileSync(JS_OUT, out.join('\n'), 'utf8');
  console.log('\n✓ Regenerated js/events-data.js');
}

// ── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page    = await browser.newPage();

  try {
  // Load all events from JSON files
  const allSeasonData  = {};
  const allKnownEvents = [];
  for (const key of ['s7', 's8', 's9', 's10']) {
    allSeasonData[key] = readSeason(key);
    allKnownEvents.push(...allSeasonData[key]);
  }

  // ── Discover new events from find-my-race ─────────────────────────────────
  let discoveredItems = [];
  try {
    discoveredItems = await discoverEventUrls(page);
  } catch (err) {
    console.warn(`  ⚠ Could not load find-my-race: ${err.message}`);
  }

  const knownUrls = new Set(allKnownEvents.map(ev => (ev.venueUrl || '').replace(/\/$/, '') + '/'));
  const newItems  = discoveredItems.filter(item => !knownUrls.has(item.url));

  if (newItems.length) {
    console.log(`\n🆕 ${newItems.length} new event(s) found — scraping and adding to s10 …`);
    for (const item of newItems) {
      process.stdout.write(`  Scraping ${item.url.split('/event/')[1]} …`);
      const scraped = await probeEvent(page, item.url, /* full= */ true);
      if (!scraped) { console.log(' ⚠ skipped'); continue; }

      const newEv = buildNewEvent(item.url, scraped, 's10', allKnownEvents);
      allSeasonData['s10'].push(newEv);
      allKnownEvents.push(newEv);
      console.log(` ✓ Added "${newEv.city}" (${newEv.date}) ticketsOnSale=${newEv.ticketsOnSale}`);
    }
  } else {
    console.log('\n✓ No new events found on find-my-race');
  }

  // ── Probe existing upcoming events for ticket status ─────────────────────
  const today = new Date().toISOString().slice(0, 10);

  for (const seasonKey of SEASONS_TO_SCRAPE) {
    const events   = allSeasonData[seasonKey];
    const upcoming = events.filter(ev => ev.date > today && ev.venueUrl);
    console.log(`\n── Season ${seasonKey.toUpperCase()}: probing ${upcoming.length} upcoming events ──`);

    let changed = 0;
    for (const ev of upcoming) {
      // Do a full scrape if waves are missing, otherwise light probe
      const needWaves = !ev.waves || ev.waves.length === 0;
      process.stdout.write(`  ${ev.city.padEnd(22)}`);
      const result = await probeEvent(page, ev.venueUrl, /* full= */ needWaves, 12000, ev.date);
      if (!result) { console.log(' ⚠ skipped'); continue; }

      const prev        = ev.ticketsOnSale;
      ev.ticketsOnSale  = result.ticketsOnSale;

      // Update mapImg if it was null and scraper now found a PDF
      let mapTag = '';
      if (!ev.mapImg && result.mapImg) {
        ev.mapImg = result.mapImg;
        mapTag = ' 🗺 map found!';
        changed++;
      }

      // Update waves if we did a full scrape and got real category names
      let waveTag = '';
      if (needWaves && result.waves && result.waves.length > 0) {
        const allOpen = result.waves.every(w => w.category === 'Open');
        if (!allOpen) {
          ev.waves = result.waves;
          ev.wavesConfirmed = result.wavesConfirmed || true;
          waveTag = ` 📅 ${result.waves.length} waves`;
          changed++;
        } else {
          waveTag = ' (times only — no categories yet)';
        }
      }

      const tag  = result.ticketsOnSale ? '🟢 ON SALE' : '⚪ no sale';
      const diff = prev !== result.ticketsOnSale ? ' ← CHANGED' : '';
      console.log(` ${tag}${diff}${mapTag}${waveTag}`);
      if (diff) changed++;
    }
    console.log(`  ${changed} change(s) in ${seasonKey}`);

    if (!DRY_RUN) writeSeason(seasonKey, events);
  }

  if (!DRY_RUN) {
    regenerateEventsDataJs();
    console.log('\n✅ Done. Commit and push to deploy the updated data.\n');
  } else {
    console.log('\n🔍 Dry-run complete — no files written.\n');
  }

  } catch (err) {
    console.error(`\n❌ Fatal error: ${err.message}`);
    console.error(err.stack);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
