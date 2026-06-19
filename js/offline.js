// ─── INDEXEDDB FOR OFFLINE STORAGE ──────────────────────────────────────────────
// Stores race data and athlete data for offline access

const DB_NAME = 'HyroxRaceLab';
const DB_VERSION = 1;
const STORE_RACES = 'races';
const STORE_ATHLETES = 'athletes';

let db = null;

// Open IndexedDB
async function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // Create races store
      if (!db.objectStoreNames.contains(STORE_RACES)) {
        const raceStore = db.createObjectStore(STORE_RACES, { keyPath: 'resultId' });
        raceStore.createIndex('athleteSlug', 'athleteSlug', { unique: false });
        raceStore.createIndex('id', 'id', { unique: false });
      }
      
      // Create athletes store
      if (!db.objectStoreNames.contains(STORE_ATHLETES)) {
        const athleteStore = db.createObjectStore(STORE_ATHLETES, { keyPath: 'slug' });
      }
    };
  });
}

// Save race to IndexedDB
async function saveRace(race) {
  if (!db) await openDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_RACES], 'readwrite');
    const store = transaction.objectStore(STORE_RACES);
    const request = store.put(race);
    
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

// Save all races to IndexedDB
async function saveAllRaces(races) {
  if (!db) await openDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_RACES], 'readwrite');
    const store = transaction.objectStore(STORE_RACES);
    
    // Clear existing races
    store.clear().onsuccess = () => {
      // Add all races
      let added = 0;
      races.forEach(race => {
        const request = store.add(race);
        request.onsuccess = () => added++;
      });
      
      transaction.oncomplete = () => resolve(added);
      transaction.onerror = () => reject(transaction.error);
    };
  });
}

// Get all races from IndexedDB
async function getAllRaces() {
  if (!db) await openDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_RACES], 'readonly');
    const store = transaction.objectStore(STORE_RACES);
    const request = store.getAll();
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Save athlete to IndexedDB
async function saveAthlete(athlete) {
  if (!db) await openDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_ATHLETES], 'readwrite');
    const store = transaction.objectStore(STORE_ATHLETES);
    const request = store.put(athlete);
    
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

// Get all athletes from IndexedDB
async function getAllAthletes() {
  if (!db) await openDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_ATHLETES], 'readonly');
    const store = transaction.objectStore(STORE_ATHLETES);
    const request = store.getAll();
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Clear all data from IndexedDB
async function clearAllData() {
  if (!db) await openDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_RACES, STORE_ATHLETES], 'readwrite');
    const raceStore = transaction.objectStore(STORE_RACES);
    const athleteStore = transaction.objectStore(STORE_ATHLETES);
    
    let cleared = 0;
    raceStore.clear().onsuccess = () => {
      cleared++;
      if (cleared === 2) resolve(true);
    };
    athleteStore.clear().onsuccess = () => {
      cleared++;
      if (cleared === 2) resolve(true);
    };
    
    transaction.onerror = () => reject(transaction.error);
  });
}

// Export functions for use in app.js
window.offlineDB = {
  openDB,
  saveRace,
  saveAllRaces,
  getAllRaces,
  saveAthlete,
  getAllAthletes,
  clearAllData
};
