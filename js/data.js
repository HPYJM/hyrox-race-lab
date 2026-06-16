// ─── ATHLETE TRACKING CONFIG ────────────────────────────────────────────────
const TRACKED_ATHLETES = [];

// ─── SEED RACE DATA ───────────────────────────────────────────────────────────
// These are verified manually from hyresult.com. New races discovered via
// auto-sync are appended from localStorage (store.js).
const SEED_RACES = [];

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
