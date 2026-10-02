// Offline support. App files: stale-while-revalidate (instant, updates in the background).
// Map tiles: cached as you browse (capped). Live API calls (including /api/ai) are never cached.
const VERSION = 'v4';
const SHELL = `shell-${VERSION}`;
const TILES = `tiles-${VERSION}`;
const MAX_TILES = 500;
const TILE_HOSTS = ['tile.openstreetmap.org', 'a.basemaps.cartocdn.com', 'b.basemaps.cartocdn.com', 'c.basemaps.cartocdn.com', 'd.basemaps.cartocdn.com'];
const ASSETS = [
  './', 'index.html', 'css/style.css', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png',
  'vendor/leaflet/leaflet.js', 'vendor/leaflet/leaflet.css',
  'vendor/leaflet/images/marker-icon.png', 'vendor/leaflet/images/marker-icon-2x.png', 'vendor/leaflet/images/marker-shadow.png', 'vendor/leaflet/images/layers.png',
  'js/main.js', 'js/util.js', 'js/store.js', 'js/data.js', 'js/shared.js', 'js/icons.js', 'js/docs.js', 'js/ics.js', 'js/stopfields.js', 'js/journey.js',
  'js/home.js', 'js/create.js', 'js/stay.js', 'js/theme.js', 'js/plan.js', 'js/map.js', 'js/eat.js', 'js/transit.js', 'js/wifi.js', 'js/safety.js', 'js/ai.js', 'js/tools.js',
];

self.addEventListener('install', (e) => {
  // One missing file must not abort the whole install, so add them individually.
  e.waitUntil(caches.open(SHELL).then((c) => Promise.all(ASSETS.map((a) => c.add(a).catch(() => {})))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => ![SHELL, TILES].includes(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

async function trim(cache, max) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (TILE_HOSTS.includes(url.hostname)) {
    e.respondWith(caches.open(TILES).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      try { const res = await fetch(req); if (res.ok) { c.put(req, res.clone()); trim(c, MAX_TILES); } return res; } catch { return Response.error(); }
    }));
    return;
  }

  if (url.origin === location.origin && !url.pathname.startsWith('/api/') && !url.pathname.startsWith('/.netlify/')) {
    e.respondWith(caches.open(SHELL).then(async (c) => {
      const hit = await c.match(req, { ignoreSearch: true });
      const net = fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => null);
      return hit || (await net) || (req.mode === 'navigate' ? c.match('index.html') : Response.error());
    }));
  }
});
