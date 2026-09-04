// Bumped whenever the caching behaviour changes — a new name makes `activate` bin
// every older cache, which is the only reliable way to shake off a stale shell.
const CACHE = 'watchtower-v2';

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(['./index.html', './manifest.json', './icon.svg']))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // The app shell. Network-first so a deploy shows up, but `cache: 'reload'` matters
  // as much as the ordering: GitHub Pages serves index.html with max-age=600, so a
  // plain fetch was quietly answered by the browser's own HTTP cache for ten minutes
  // and the newest build did not appear until that expired. This forces the network.
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request, { cache: 'reload' })
        .then(r => {
          const copy = r.clone();
          caches.open(CACHE).then(c => c.put('./index.html', copy));
          return r;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // The item database is regenerated whenever the menu changes, and a stale copy
  // means wrong prices on screen. Always go to the network, fall back to the last
  // good copy only when there is no network at all.
  if (url.pathname.endsWith('/pos-catalog.json')) {
    e.respondWith(
      fetch(e.request, { cache: 'reload' })
        .then(r => {
          const copy = r.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
          return r;
        })
        .catch(() => caches.match(e.request))
    );
  }
});
