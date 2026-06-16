// ─── ATHLETE TRACKING CONFIG ────────────────────────────────────────────────
const TRACKED_ATHLETES = [
  { slug: 'nicolae-andrei-heyer', name: 'Nicolae Andrei Heyer' },
  { slug: 'nicolae-andrei-gabor', name: 'Nicolae-Andrei Gabor' }
];

// ─── SEED RACE DATA ───────────────────────────────────────────────────────────
// These are verified manually from hyresult.com. New races discovered via
// auto-sync are appended from localStorage (store.js).
const SEED_RACES = [
  {
    resultId: 'LR3MS4JI52C790',
    id: "RI'26", label: 'Riga 2026', athlete: 'Nicolae Andrei Heyer',
    athleteSlug: 'nicolae-andrei-heyer', partner: null, partnerSlug: null,
    category: 'OPEN', division: 'MEN', ageGroup: '30-34', dateIso: '2026-03-01',
    rank: '#349 of 879', ag: '#100 AG30-34', pct: 'Top 43.9%',
    color: '#10b981',
    total: '1:23:41', totalSecs: 5021,
    runsSecs: 2532, workoutsSecs: 2202, roxzoneSecs: 287,
    runs:     [316, 287, 327, 324, 328, 323, 326, 301],
    workouts: [262, 167, 257, 353, 281, 128, 405, 349],
    rxEntry:  [ 25,  22,   8,  14,  14,  22,  25],
    rxExit:   [ 15,  17,  16,  30,   6,  34,  39],
    radarStrength: [40.5, 36.1, 50.4, 64.5, 36.5, 38.6, 38.9, 16.9, 66.4]
  },
  {
    resultId: 'LR3MS4JI2E1F03',
    id: "CGN'25", label: 'Cologne 2025', athlete: 'Nicolae-Andrei Gabor',
    athleteSlug: 'nicolae-andrei-gabor', partner: null, partnerSlug: null,
    category: 'OPEN', division: 'MEN', ageGroup: '30-34', dateIso: '2025-10-04',
    rank: '#1421 of 1840', ag: '#410 AG30-34', pct: 'Top 77.2%',
    color: '#f97316',
    total: '1:37:14', totalSecs: 5834,
    runsSecs: 2894, workoutsSecs: 2449, roxzoneSecs: 491,
    runs:     [277, 344, 468, 356, 372, 336, 338, 403],
    workouts: [270, 217, 289, 437, 363, 120, 320, 433],
    rxEntry:  [  7,   7,  15,  22,  40,  63,  61],
    rxExit:   [ 43,  48,  36,  89,  28,  14,  18],
    radarStrength: null  // not yet scraped
  },
  {
    resultId: 'LR3MS4JI4E9AD0',
    id: "CGN'26", label: 'Cologne 2026 (Doubles)', athlete: 'N.A. Heyer + L. Ungefuk',
    athleteSlug: 'nicolae-andrei-heyer', partner: 'Leon Ungefuk', partnerSlug: 'leon-ungefuk',
    category: 'DOUBLES', division: 'DBMEN', ageGroup: '25-29',
    rank: '#585 of 1136', ag: '#149 AG25-29', pct: 'Top 57.6%',
    color: '#8b5cf6',
    total: '1:16:44', totalSecs: 4604,
    runsSecs: 2752, workoutsSecs: 1466, roxzoneSecs: 386,
    runs:     [272, 326, 345, 339, 385, 374, 370, 341],
    workouts: [232, 120, 171, 128, 276,  80, 235, 224],
    rxEntry:  [  3,  29,  10,   5,  36,  46,  23],
    rxExit:   [ 37,  28,  57,  14,  23,  28,  47],
    radarStrength: null  // doubles — different division
  }
];

// ─── ACTIVE RACE LIST (merged seed + store) ──────────────────────────────────
// Populated by store.js on init. Do not modify directly.
let RACES = [...SEED_RACES];

// ─── CATEGORY STATE ─────────────────────────────────────────────────────────
let activeCategory = 'OPEN';

function getActiveRaces() {
  return RACES.filter(r => r.category === activeCategory);
}

// ─── STATIC LABELS ───────────────────────────────────────────────────────────
const WORKOUT_LABELS = [
  'SkiErg', 'Sled Push', 'Sled Pull', 'Burpee BJ',
  'Row', 'Farmers Carry', 'Sandbag Lunges', 'Wall Balls'
];

const RX_LABELS       = ['SkiErg','Sled Push','Sled Pull','Burpee BJ','Row','Farmers Carry','Sand. Lunges'];
const RX_TABLE_LABELS = ['SkiErg','Sled Push','Sled Pull','Burpee BJ','Row','Farmers Carry','Sand. Lunges'];

const RADAR_LABELS = ['Running','SkiErg','Sled Push','Sled Pull','Burpee BJ','Row','Farmers C.','S. Lunges','Wall Balls'];

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function fmt(s) {
  const m = Math.floor(s / 60), sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function rgba(hex, a) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function splitToSecs(str) {
  if (!str) return 0;
  const s = str.trim().replace(/^0+:/, '');
  const parts = s.split(':').map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return parts[0] || 0;
}
