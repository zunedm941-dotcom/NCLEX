const CACHE_NAME = 'nclex-sim-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './app.css',
  './app.js',
  './manifest.json',
  './data/questions.js',
  './data/lab-values.js',
  './data/questions.json',
  './data/lab-values.json',
  './data/ncsbn-questions.json',
  './data/ncsbn-questions.js',
  './data/ncsbn-questions-bundle.js',
  './data/nclex-exam-cram-questions.json',
  './data/nclex-exam-cram-questions.js',
  './data/nclex-exam-cram-bundle.js',
  './data/NCLEX 4.json',
  './data/NCLEX 4.js',
  './data/nclex-5-questions.json',
  './data/nclex-5-questions.js',
  './data/NCLEX 6.json',
  './data/NCLEX 6.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS_TO_CACHE).catch(err => {
        console.warn('Some cache assets failed to fetch during install:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request).catch(() => {
        return caches.match('./index.html');
      });
    })
  );
});
