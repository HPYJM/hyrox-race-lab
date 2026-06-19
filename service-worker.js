// ─── SERVICE WORKER ─────────────────────────────────────────────────────────────
// Caches static assets and race data for offline access

const CACHE_NAME = 'hyrox-race-lab-v1';
const STATIC_CACHE = 'hyrox-static-v1';
const DATA_CACHE = 'hyrox-data-v1';

// Static assets to cache on install
const STATIC_ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/data.js',
  './js/store.js',
  './js/analytics.js',
  './js/fetcher.js',
  './js/charts.js',
  './js/simulator.js',
  './js/table.js',
  './js/app.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.2.0/dist/chartjs-plugin-datalabels.min.js'
];

// Install event - cache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.map(key => {
          if (key !== STATIC_CACHE && key !== DATA_CACHE) {
            return caches.delete(key);
          }
        })
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip cross-origin requests (except for CDNs)
  if (url.origin !== location.origin && 
      !url.hostname.includes('jsdelivr.net')) {
    return;
  }

  // For static assets, cache-first strategy
  if (STATIC_ASSETS.some(asset => url.pathname.includes(asset.replace('./', ''))) ||
      url.hostname.includes('jsdelivr.net')) {
    event.respondWith(
      caches.match(event.request)
        .then(response => response || fetch(event.request))
    );
    return;
  }

  // For data requests (hyresult.com), network-first with cache fallback
  if (url.hostname.includes('hyresult.com') || 
      url.hostname.includes('allorigins.win') ||
      url.hostname.includes('corsproxy.io')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Cache successful responses
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(DATA_CACHE).then(cache => cache.put(event.request, responseClone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Default: network-first for everything else
  event.respondWith(
    fetch(event.request)
      .catch(() => caches.match(event.request))
  );
});
