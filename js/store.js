// ─── localStorage-backed race store ──────────────────────────────────────────
// Key: hyrox_races_v2  →  Array of race objects (non-seed, auto-discovered)
// Seed races live in data.js SEED_RACES and are never duplicated here.

const STORE_KEY = 'hyrox_races_v2';

const store = {
  // ── READ ──────────────────────────────────────────────────────────────────
  getAll() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); }
    catch { return []; }
  },

  has(resultId) {
    // Check both seed races AND stored races
    if (SEED_RACES.some(r => r.resultId === resultId)) return true;
    return this.getAll().some(r => r.resultId === resultId);
  },

  // ── WRITE ─────────────────────────────────────────────────────────────────
  _save(data) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      // QuotaExceededError — storage full
      console.error('localStorage quota exceeded — race could not be saved:', e);
      return false;
    }
  },

  add(race) {
    if (this.has(race.resultId)) return false; // already exists
    const all = this.getAll();
    all.push(race);
    return this._save(all);
  },

  update(resultId, patch) {
    const all = this.getAll();
    const idx = all.findIndex(r => r.resultId === resultId);
    if (idx === -1) return false;
    all[idx] = { ...all[idx], ...patch };
    return this._save(all);
  },

  remove(resultId) {
    const all = this.getAll().filter(r => r.resultId !== resultId);
    this._save(all);
  },

  clear() {
    localStorage.removeItem(STORE_KEY);
  },

  // ── MERGE INTO RACES ARRAY ────────────────────────────────────────────────
  // Merges localStorage races into the global RACES array (skipping seeds).
  // Returns number of newly added races.
  mergeIntoRaces() {
    const stored = this.getAll();
    let added = 0;
    const colors = ['#06b6d4','#a855f7','#ec4899','#84cc16','#ef4444','#0ea5e9'];
    stored.forEach(r => {
      if (!RACES.some(race => race.resultId === r.resultId)) {
        // assign a color if missing
        if (!r.color) r.color = colors[RACES.length % colors.length];
        RACES.push(r);
        added++;
      }
    });
    return added;
  }
};

// Bootstrap: merge stored races into RACES on script load
store.mergeIntoRaces();

// ─── ATHLETE STORE ────────────────────────────────────────────────────────────
// Persists user-added athletes (beyond the hardcoded TRACKED_ATHLETES seeds).

const ATHLETE_STORE_KEY = 'hyrox_athletes_v1';

const athleteStore = {
  getAll() {
    try { return JSON.parse(localStorage.getItem(ATHLETE_STORE_KEY) || '[]'); }
    catch { return []; }
  },
  has(slug) {
    return this.getAll().some(a => a.slug === slug);
  },
  _save(data) {
    try {
      localStorage.setItem(ATHLETE_STORE_KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      console.error('localStorage quota exceeded — athlete could not be saved:', e);
      return false;
    }
  },
  add(slug, name) {
    if (this.has(slug)) return false;
    const all = this.getAll();
    all.push({ slug, name });
    return this._save(all);
  },
  remove(slug) {
    const all = this.getAll().filter(a => a.slug !== slug);
    this._save(all);
  }
};

// Returns seed athletes merged with any user-added athletes (no duplicates).
function getTrackedAthletes() {
  const seedSlugs = new Set(TRACKED_ATHLETES.map(a => a.slug));
  const custom = athleteStore.getAll().filter(a => !seedSlugs.has(a.slug));
  return [...TRACKED_ATHLETES, ...custom];
}
