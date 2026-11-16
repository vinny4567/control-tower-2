// Bumped whenever the caching behaviour changes — a new name makes `activate` bin
// every older cache, which is the only reliable way to shake off a stale shell.
// v3: the first version that is actually REGISTERED (index.html never called
// register() until now), so bump it to bin anything an older build left behind.
// v4: there is a SECOND page now (the screen builder), and v3 would have served
// the wrong one — see the navigate handler below.
const CACHE = 'watchtower-v4';

// ⛔ THERE IS MORE THAN ONE PAGE NOW, AND THIS FILE ASSUMED THERE WAS ONE.
//
// v3 cached every navigation response under './index.html' and, with no network,
// answered every navigation with './index.html'. Add a second page and both halves
// are wrong: opening the screen builder wrote the BUILDER into the shell slot, so
// the next offline open of the Watch Tower showed the builder; and opening the
// builder offline showed the Watch Tower. Online it looks perfect, which is why
// this had to be found by reading rather than by trying it.
//
// So a navigation is cached and served under ITS OWN path. Adding a third page
// means adding it here; a page not listed falls back to the shell, which is the
// safe end of the mistake (the Watch Tower is where every tab lives).
const SHELLS = ['./index.html', './screens.html'];
const shellFor = (pathname) => {
  for (const s of SHELLS) { const name = s.replace('./', ''); if (pathname.endsWith('/' + name)) return s; }
  return './index.html';
};

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
    const shell = shellFor(url.pathname);
    e.respondWith(
      fetch(e.request, { cache: 'reload' })
        .then(r => {
          const copy = r.clone();
          caches.open(CACHE).then(c => c.put(shell, copy));
          return r;
        })
        .catch(() => caches.match(shell))
    );
    return;
  }

  // The builder's core. Network-first for the same reason as the catalogue: a page
  // served fresh with a ten-minute-old core is a mismatch nobody would think to
  // look for, and GitHub Pages serves both with max-age=600.
  if (url.pathname.endsWith('/screens-core.js')) {
    e.respondWith(
      fetch(e.request, { cache: 'reload' })
        .then(r => {
          const copy = r.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
          return r;
        })
        .catch(() => caches.match(e.request))
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
