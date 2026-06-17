/**
 * download-maps.js — Download venue map PDFs/images locally
 *
 * Reads all data/sN/events.json files, finds events where mapImg is a remote
 * URL, downloads each file to maps/<season>/<event-id>.<ext>, then patches
 * the JSON files and regenerates js/events-data.js.
 *
 * Usage (run from scripts/ or root):
 *   node scripts/download-maps.js          ← skip already-downloaded files
 *   node scripts/download-maps.js --force  ← re-download everything
 *
 * Called from scrape-events.js via --maps or --force-maps flags.
 */

'use strict';
const https = require('https');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const url   = require('url');

const ROOT     = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const MAPS_DIR = path.join(ROOT, 'maps');

const SEASONS = ['s7', 's8', 's9', 's10'];

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Derive local filename from event id + remote URL extension */
function localMapFilename(eventId, remoteUrl) {
  const ext = path.extname(new url.URL(remoteUrl).pathname).toLowerCase() || '.pdf';
  return `${eventId}${ext}`;
}

/** Web path relative to repo root */
function localMapWebPath(season, eventId, remoteUrl) {
  return `maps/${season}/${localMapFilename(eventId, remoteUrl)}`;
}

/** Download a file, following one redirect, with SSL bypass for corporate proxies */
function downloadFile(srcUrl, destPath) {
  return new Promise((resolve, reject) => {
    const parsed = new url.URL(srcUrl);
    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.get(srcUrl, {
      rejectUnauthorized: false, // corporate proxy / self-signed CA
      headers: {
        'User-Agent': 'Mozilla/5.0 (HYROX-Race-Lab-Scraper/1.0)',
        'Accept': 'application/pdf,image/*,*/*;q=0.8',
      },
    }, res => {
      // Follow one redirect
      if ((res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) && res.headers.location) {
        req.destroy();
        return downloadFile(res.headers.location, destPath).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        req.destroy();
        return reject(new Error(`HTTP ${res.statusCode} for ${srcUrl}`));
      }
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      const out = fs.createWriteStream(destPath);
      res.pipe(out);
      out.on('finish', () => {
        const kb = Math.round(fs.statSync(destPath).size / 1024);
        resolve(kb);
      });
      out.on('error', reject);
    });
    req.on('error', reject);
  });
}

// ── Core export ──────────────────────────────────────────────────────────────

/**
 * Download all remote mapImg URLs across all seasons.
 * Returns a map of { [season]: { [eventId]: localWebPath } } for patching.
 */
async function downloadMaps(opts = {}) {
  const force = opts.force || false;
  const results = {}; // season → { eventId → localPath }

  // Collect all events with a remote mapImg
  const toDownload = [];
  for (const season of SEASONS) {
    const jsonPath = path.join(DATA_DIR, season, 'events.json');
    if (!fs.existsSync(jsonPath)) continue;
    const events = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    for (const ev of events) {
      if (!ev.mapImg || !ev.mapImg.startsWith('http')) continue;
      const dest = path.join(MAPS_DIR, season, localMapFilename(ev.id, ev.mapImg));
      toDownload.push({ season, id: ev.id, remoteUrl: ev.mapImg, dest });
    }
  }

  if (toDownload.length === 0) {
    console.log('  No remote map URLs found — nothing to download.');
    return results;
  }

  console.log(`\n🗺  Downloading ${toDownload.length} venue map(s) → maps/ …\n`);

  for (const item of toDownload) {
    const webPath = localMapWebPath(item.season, item.id, item.remoteUrl);
    const label   = `  ${item.season}/${item.id}`.padEnd(48);

    if (!force && fs.existsSync(item.dest)) {
      const kb = Math.round(fs.statSync(item.dest).size / 1024);
      console.log(`${label} ⏭  already exists (${kb}KB)`);
    } else {
      process.stdout.write(`${label} ↓  `);
      try {
        const kb = await downloadFile(item.remoteUrl, item.dest);
          // GitHub hard limit is 100MB — warn and skip if too large
          if (kb > 90 * 1024) {
            fs.unlinkSync(item.dest);
            console.log(`⚠  ${kb}KB — exceeds 90MB GitHub safe limit; keeping remote URL`);
            continue;
          }
    if (!results[item.season]) results[item.season] = {};
    results[item.season][item.id] = webPath;
  }

  return results;
}

/**
 * Patch data/sN/events.json: replace remote mapImg with local web path.
 * Only updates events that were successfully downloaded.
 */
function patchJsonFiles(downloadResults) {
  let totalPatched = 0;
  for (const [season, idMap] of Object.entries(downloadResults)) {
    const jsonPath = path.join(DATA_DIR, season, 'events.json');
    if (!fs.existsSync(jsonPath)) continue;
    const events = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    let changed = false;
    for (const ev of events) {
      if (idMap[ev.id] && ev.mapImg !== idMap[ev.id]) {
        ev.mapImg = idMap[ev.id];
        changed = true;
        totalPatched++;
      }
    }
    if (changed) {
      fs.writeFileSync(jsonPath, JSON.stringify(events, null, 2), 'utf8');
      console.log(`  ✓ Patched ${jsonPath}`);
    }
  }
  console.log(`  ${totalPatched} mapImg field(s) updated in JSON source files.`);
}

// ── CLI entry point ───────────────────────────────────────────────────────────

if (require.main === module) {
  const force = process.argv.includes('--force');
  (async () => {
    try {
      const results = await downloadMaps({ force });
      if (Object.keys(results).length > 0) {
        patchJsonFiles(results);
        console.log('\n✅ Done. Re-run scrape-events.js (no flags) to regenerate js/events-data.js.');
      } else {
        console.log('\n✅ Nothing to do.');
      }
    } catch (err) {
      console.error('Error:', err.message);
      process.exit(1);
    }
  })();
}

module.exports = { downloadMaps, patchJsonFiles, localMapWebPath, localMapFilename };
