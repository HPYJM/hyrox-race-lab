/**
 * migrate.js — ONE-TIME migration
 * Reads js/events-data.js and writes each season to data/sN/events.json
 *
 * Run once from the scripts/ folder:
 *   cd scripts && npm install && node migrate.js
 */

'use strict';
const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const ROOT       = path.join(__dirname, '..');
const DATA_SRC   = path.join(ROOT, 'js', 'events-data.js');
const DATA_DIR   = path.join(ROOT, 'data');

// ── Load events-data.js into a sandbox context ──────────────────────────────
const code = fs.readFileSync(DATA_SRC, 'utf8');
const ctx  = {};
vm.runInNewContext(code, ctx);

const SEASONS = {
  s7:  { events: ctx.HYROX_S7_EVENTS  || [] },
  s8:  { events: ctx.HYROX_S8_EVENTS  || [] },
  s9:  { events: ctx.HYROX_EVENTS     || [] },   // S9 = HYROX_EVENTS
  s10: { events: ctx.HYROX_S10_EVENTS || [] },
};

// ── Write one JSON file per season ──────────────────────────────────────────
for (const [key, { events }] of Object.entries(SEASONS)) {
  const dir  = path.join(DATA_DIR, key);
  const file = path.join(dir, 'events.json');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(events, null, 2), 'utf8');
  console.log(`✓ Written ${events.length} events → data/${key}/events.json`);
}

console.log('\nMigration complete. Verify the JSON files, then use scrape-events.js for future updates.');
