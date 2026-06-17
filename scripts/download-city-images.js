/**
 * download-city-images.js
 *
 * Downloads all city hero images referenced in CITY_IMG_MAP into
 * images/cities/<slug>.<ext>  (relative to repo root).
 *
 * Usage (from repo root or scripts/):
 *   node scripts/download-city-images.js          ← skip already-downloaded
 *   node scripts/download-city-images.js --force  ← re-download everything
 *
 * Also exported as downloadCityImages(CITY_IMG_MAP, opts) so the main
 * scraper can call it after detecting a new event image.
 */

'use strict';
const https  = require('https');
const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const url    = require('url');

const ROOT       = path.join(__dirname, '..');
const IMG_DIR    = path.join(ROOT, 'images', 'cities');

// ── Same city→URL map as in events.html ─────────────────────────────────────
// Keep in sync with the CITY_IMG_BY_CITY object in events.html.
const CITY_IMG_MAP = {
  'Hamburg':         'https://hyrox.com/wp-content/uploads/2026/06/AdobeStock_152735034-scaled-3-1280x720.png',
  'Manchester':      'https://hyrox.com/wp-content/uploads/2026/06/Manchester-BW-2-scaled-2-1280x800.jpg',
  'Edinburgh':       'https://hyrox.com/wp-content/uploads/2025/07/the-boston-skyline-boston-ma-full-zakim-black-and-white-toby-mcguire-768x512-1.jpg',
  'Milan':           'https://hyrox.com/wp-content/uploads/2024/06/Naviglio-1280x720.jpg',
  'Singapore':       'https://hyrox.com/wp-content/uploads/2026/06/singapore-scaled-4-1280x720.jpg',
  'Frankfurt':       'https://hyrox.com/wp-content/uploads/2026/05/FFM-event-page-scaled-2-960x960.png',
  'Dubai':           'https://hyrox.com/wp-content/uploads/2026/03/1500x1000_abudhabi-1280x853.jpg',
  'Melbourne':       'https://hyrox.com/wp-content/uploads/2026/05/Melbourne-scaled-1-1280x720.jpg',
  'Berlin':          'https://hyrox.com/wp-content/uploads/2025/03/pexels-photo-13103362-1280x853.jpeg',
  'Madrid':          'https://hyrox.com/wp-content/uploads/2023/05/Valencia.jpg',
  'Sydney':          'https://hyrox.com/wp-content/uploads/2026/06/Sydney-scaled-4.jpg',
  'Riga':            'https://hyrox.com/wp-content/uploads/2026/05/168fb1cd-aea3-4fbb-a300-3a0b3a76dafe-scaled-2-1280x960.jpg',
  'London':          'https://hyrox.com/wp-content/uploads/2026/06/Olympia-scaled-1-1280x780.jpg',
  'Chicago':         'https://hyrox.com/wp-content/uploads/2023/10/OPEN.-US-CHAMPS-EVENT-IMAGE-1-1280x853.jpg',
  'Toronto':         'https://hyrox.com/wp-content/uploads/2024/02/HYROX-TORONTO-1280x854.jpg',
  'Buenos Aires':    'https://hyrox.com/wp-content/uploads/2025/07/15946147-8add-4609-beb3-44b3e2842715-1280x850.jpg',
  'Stockholm':       'https://hyrox.com/wp-content/uploads/2026/06/7R34835-scaled-3-1280x854.jpg',
  'Nice':            'https://hyrox.com/wp-content/uploads/2026/05/vue-de-nice-1-scaled-2-1280x720.jpg',
  'Jakarta':         'https://hyrox.com/wp-content/uploads/2026/06/Jakarta-NationalMonument_Mono-scaled-4-1280x800.jpg',
  'Hangzhou':        'https://hyrox.com/wp-content/uploads/2026/03/hangzhou_banner-1.jpg',
  'Abu Dhabi':       'https://hyrox.com/wp-content/uploads/2026/03/1500x1000_abudhabi-1280x853.jpg',
  'Delhi':           'https://hyrox.com/wp-content/uploads/2025/05/Delhi_Find-my-race--1280x819.jpg',
  'Istanbul':        'https://hyrox.com/wp-content/uploads/2026/03/istanbul_photo_high-scaled-e1772783750540-1280x853.jpg',
  'Bangkok':         'https://hyrox.com/wp-content/uploads/2025/07/BKK-Event-Page-Featured-Image-1-1280x720.jpg',
  'Cape Town':       'https://hyrox.com/wp-content/uploads/2026/01/WhatsApp-Image-2026-01-27-at-15.49.28-1280x850.jpeg',
  'Perth':           'https://hyrox.com/wp-content/uploads/2026/06/perth-scaled-1-1280x720.jpg',
  'Washington D.C.': 'https://hyrox.com/wp-content/uploads/2023/10/OPEN.-US-CHAMPS-EVENT-IMAGE-1-1280x853.jpg',
  'Tenerife':        'https://hyrox.com/wp-content/uploads/2026/05/photo-1602521715918-e50cc83f7326-copia_1-scaled-2-768x960.jpg',
  'Acapulco':        'https://hyrox.com/wp-content/uploads/2025/05/Acapulco-1280x719.jpg',
  'Athens':          'https://hyrox.com/wp-content/uploads/2026/03/1500x1000_atina_2-1280x853.jpg',
  'Maastricht':      'https://hyrox.com/wp-content/uploads/2023/07/Maastricht-Zwart-Wit.png.jpg',
  'Salt Lake City':  'https://hyrox.com/wp-content/uploads/2026/06/SALT_LAKE_CITY_original_963846-1-scaled-1-1280x852.jpg',
  'İzmir':           'https://hyrox.com/wp-content/uploads/2026/05/1500x1000_izmir-1280x853.jpg',
  'Rome':            'https://hyrox.com/wp-content/uploads/2025/03/pexels-photo-13103362-1280x853.jpeg',
  'Oslo':            'https://hyrox.com/wp-content/uploads/2026/05/168fb1cd-aea3-4fbb-a300-3a0b3a76dafe-scaled-2-1280x960.jpg',
  'Bordeaux':        'https://hyrox.com/wp-content/uploads/2026/06/ChatGPT-Image-26-fevr.-2026-18_47_47-scaled-1-1280x853.png',
  'Karlsruhe':       'https://hyrox.com/wp-content/uploads/2026/05/Karslruhe_Event-Page-scaled-2-1280x853.png',
  'Boston':          'https://hyrox.com/wp-content/uploads/2025/07/the-boston-skyline-boston-ma-full-zakim-black-and-white-toby-mcguire-768x512-1.jpg',
  'Geneva':          'https://hyrox.com/wp-content/uploads/2026/06/Geneva_Event-Page-scaled-1-1280x853.png',
  'Gdańsk':          'https://hyrox.com/wp-content/uploads/2026/06/gdansk-sales-scaled-1-1280x854.jpg',
  'Valencia':        'https://hyrox.com/wp-content/uploads/2023/05/Valencia.jpg',
  'São Paulo':       'https://hyrox.com/wp-content/uploads/2026/03/Imagem-2-1274x960.jpg',
  'Tampa':           'https://hyrox.com/wp-content/uploads/2026/06/Tampa_Skyline_At_Tampa_In_Florida_United_States._original_3228851-scaled-1-1280x720.jpg',
  'Birmingham':      'https://hyrox.com/wp-content/uploads/2026/06/Birmingham-scaled-1-1280x852.jpg',
  'Mexico City':     'https://hyrox.com/wp-content/uploads/2026/06/Mexico-City-scaled-1-1280x896.jpg',
  'Dublin':          'https://hyrox.com/wp-content/uploads/2026/06/Dublin-scaled-1-1280x852.jpg',
  'Düsseldorf':      'https://hyrox.com/wp-content/uploads/2026/06/Dusseldorf-Event-Page-scaled-1-1280x852.png',
  'Barcelona':       'https://hyrox.com/wp-content/uploads/2024/09/Captura-de-pantalla-2024-09-11-a-las-16.10.04.png',
  'Denver':          'https://hyrox.com/wp-content/uploads/2026/06/Denver__Colorado_original_343234-scaled-1-1280x855.jpg',
  'Seoul':           'https://hyrox.com/wp-content/uploads/2026/06/seoul-scaled-1-1280x720.jpg',
  'Dallas':          'https://hyrox.com/wp-content/uploads/2023/05/DALLAS-1280x854.jpg',
  'Poznań':          'https://hyrox.com/wp-content/uploads/2026/06/hyrox-poznan2-scaled-1-1280x720.png',
  'Rio de Janeiro':  'https://hyrox.com/wp-content/uploads/2025/03/Rio-de-Janeiro.jpg',
  'Utrecht':         'https://hyrox.com/wp-content/uploads/2026/06/Utrecht-scaled-2-1280x854.jpg',
  'Johannesburg':    'https://hyrox.com/wp-content/uploads/2026/06/south-africa-tourism-johannesburg-1_square-scaled-1-960x960.jpg',
  'Anaheim':         'https://hyrox.com/wp-content/uploads/2023/10/HYROX-ANAHEIM-23_24-EVENT-IMAGE-1-1-1280x719.jpg',
  'Sanya':           'https://hyrox.com/wp-content/uploads/2026/06/sanya-city-scaled-1-1280x853.jpg',
  'Nashville':       'https://hyrox.com/wp-content/uploads/2026/05/chad-morehead-AHnmupFDWCc-unsplash-scaled-1-1280x855.jpg',
  'Paris':           'https://hyrox.com/wp-content/uploads/2023/10/Paris-1-1280x853.jpg',
  'Gent':            'https://hyrox.com/wp-content/uploads/2026/05/shutterstock_gent_kleiner-scaled-1-1280x854.jpg',
  'Helsinki':        'https://hyrox.com/wp-content/uploads/2025/07/hyrox-helsinki-1280x720.png',
  'Vancouver':       'https://hyrox.com/wp-content/uploads/2026/05/58beed79-5bc1-4beb-9b8a-644f93a69458-scaled-1-1280x717.jpg',
  'Chiba':           'https://hyrox.com/wp-content/uploads/2026/06/JP-CHIBA-BW-featured-image-scaled-1-1280x720.jpg',
  'Chengdu':         'https://hyrox.com/wp-content/uploads/2026/06/cd-scaled-1-1280x853.jpg',
  'Shenzhen':        'https://hyrox.com/wp-content/uploads/2026/06/深圳-1-scaled-1-1280x612.jpg',
  'Guangzhou':       'https://hyrox.com/wp-content/uploads/2026/03/微信图片_20260312212210_661_70.jpg',
  'Beijing':         'https://hyrox.com/wp-content/uploads/2026/03/微信图片_20260312222618_665_70.jpg',
  'Shanghai':        'https://hyrox.com/wp-content/uploads/2026/03/微信图片_20260312213404_663_70.jpg',
  'Mumbai':          'https://hyrox.com/wp-content/uploads/2026/03/Mumbai-image-1280x869.png',
  'Cairo':           'https://hyrox.com/wp-content/uploads/2026/03/1500x1000_abudhabi-1280x853.jpg',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/** city name → safe filename slug, e.g. "São Paulo" → "sao-paulo" */
function citySlug(name) {
  return name
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Derive local filename from city name + source URL extension */
function localFilename(city, sourceUrl) {
  const ext = path.extname(new url.URL(sourceUrl).pathname).toLowerCase() || '.jpg';
  return citySlug(city) + ext;
}

/** local web path used in HTML (relative to repo root) */
function localWebPath(city, sourceUrl) {
  return 'images/cities/' + localFilename(city, sourceUrl);
}

/** Download one URL to destPath; follows one redirect */
function downloadFile(srcUrl, destPath) {
  return new Promise((resolve, reject) => {
    const parsed = new url.URL(srcUrl);
    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.get(srcUrl, {
      rejectUnauthorized: false,   // corporate proxy / self-signed CA
      headers: {
        'User-Agent': 'Mozilla/5.0 (HYROX-Race-Lab-Scraper/1.0)',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
      },
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFile(res.headers.location, destPath).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${srcUrl}`));
      }
      const out = fs.createWriteStream(destPath);
      res.pipe(out);
      out.on('finish', () => out.close(resolve));
      out.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('Timeout: ' + srcUrl)); });
  });
}

// ── Main download function (exported + used as CLI) ──────────────────────────

/**
 * Download all images in cityImgMap into images/cities/.
 * @param {Record<string,string>} cityImgMap  city → remote URL
 * @param {{ force?: boolean, dryRun?: boolean }} [opts]
 * @returns {Promise<{ localPath: string }[]>}  array of { city, localPath } for updated entries
 */
async function downloadCityImages(cityImgMap, opts = {}) {
  const { force = false, dryRun = false } = opts;
  fs.mkdirSync(IMG_DIR, { recursive: true });

  const results = [];
  const entries = Object.entries(cityImgMap);

  for (const [city, remoteUrl] of entries) {
    const filename = localFilename(city, remoteUrl);
    const destPath = path.join(IMG_DIR, filename);
    const webPath  = localWebPath(city, remoteUrl);

    if (!force && fs.existsSync(destPath)) {
      process.stdout.write('.');
      results.push({ city, localPath: webPath, skipped: true });
      continue;
    }

    process.stdout.write(`\n  ↓ ${city.padEnd(20)} ${filename}`);
    if (dryRun) {
      results.push({ city, localPath: webPath, skipped: false });
      continue;
    }

    try {
      await downloadFile(remoteUrl, destPath);
      const size = Math.round(fs.statSync(destPath).size / 1024);
      process.stdout.write(` ✓ ${size}KB`);
      results.push({ city, localPath: webPath, skipped: false });
    } catch (err) {
      process.stdout.write(` ✗ ${err.message}`);
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath); // remove partial
    }
  }

  console.log('\n');
  return results;
}

// ── Build updated CITY_IMG_BY_CITY map with local paths ──────────────────────

function buildLocalCityImgMap(cityImgMap) {
  const out = {};
  for (const [city, remoteUrl] of Object.entries(cityImgMap)) {
    const filename = localFilename(city, remoteUrl);
    const destPath = path.join(IMG_DIR, filename);
    out[city] = fs.existsSync(destPath)
      ? localWebPath(city, remoteUrl)
      : remoteUrl; // fallback to remote if not downloaded
  }
  return out;
}

module.exports = { downloadCityImages, buildLocalCityImgMap, localWebPath, localFilename, citySlug, CITY_IMG_MAP, IMG_DIR };

// ── CLI entry point ───────────────────────────────────────────────────────────
if (require.main === module) {
  const force  = process.argv.includes('--force');
  const dryRun = process.argv.includes('--dry-run');
  console.log(`\n📸 Downloading city images → images/cities/${force ? ' (force)' : ' (skip existing)'}\n`);
  downloadCityImages(CITY_IMG_MAP, { force, dryRun }).then(() => {
    if (!dryRun) {
      // Print a summary of what's available locally
      const files = fs.readdirSync(IMG_DIR);
      console.log(`✅ ${files.length} images in images/cities/`);
    }
  }).catch(err => {
    console.error('Fatal:', err);
    process.exitCode = 1;
  });
}
