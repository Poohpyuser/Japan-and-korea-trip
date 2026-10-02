// "Play my day": road/foot routing between stops and a pixel-art traveller that walks (or rides) the route.
import { fetchJSON, distKm } from './util.js';

// ---------- routing ----------
const SPEED_KMH = { walk: 4.8, bike: 14, bus: 18, taxi: 28, subway: 32, tram: 20, train: 60, flight: 700 };
const ROUTERS = {
  walk: 'https://routing.openstreetmap.de/routed-foot/route/v1/foot',
  bike: 'https://routing.openstreetmap.de/routed-bike/route/v1/bike',
  taxi: 'https://router.project-osrm.org/route/v1/driving',
  bus: 'https://router.project-osrm.org/route/v1/driving',
};
const cache = new Map();

export const modeFor = (stop) => stop?.move || (stop?.kind === 'transit' ? 'train' : 'walk');

// Returns { coords: [[lat,lng],…], km, min, routed }. Falls back to a straight line if the routing service is
// unreachable, so the day still plays offline.
export async function legGeometry(a, b, mode = 'walk') {
  const key = `${mode}|${a.lat.toFixed(5)},${a.lng.toFixed(5)}|${b.lat.toFixed(5)},${b.lng.toFixed(5)}`;
  if (cache.has(key)) return cache.get(key);
  const km = distKm(a, b);
  let out = { coords: [[a.lat, a.lng], [b.lat, b.lng]], km, min: Math.max(1, Math.round((km / (SPEED_KMH[mode] || 5)) * 60)), routed: false };
  if (ROUTERS[mode] && km < 60) {
    try {
      const j = await fetchJSON(`${ROUTERS[mode]}/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`, {}, 8000);
      const r = j.routes?.[0];
      if (r?.geometry?.coordinates?.length > 1) out = { coords: r.geometry.coordinates.map(([x, y]) => [y, x]), km: r.distance / 1000, min: Math.max(1, Math.round(r.duration / 60)), routed: true };
    } catch { /* keep straight line */ }
  }
  cache.set(key, out);
  return out;
}
export const cachedLeg = (a, b, mode) => cache.get(`${mode}|${a.lat.toFixed(5)},${a.lng.toFixed(5)}|${b.lat.toFixed(5)},${b.lng.toFixed(5)}`);

function pointAt(coords, t) {
  const seg = [];
  let total = 0;
  for (let i = 1; i < coords.length; i++) { const d = distKm({ lat: coords[i - 1][0], lng: coords[i - 1][1] }, { lat: coords[i][0], lng: coords[i][1] }); seg.push(d); total += d; }
  if (!total) return coords[0];
  let target = t * total;
  for (let i = 0; i < seg.length; i++) {
    if (target <= seg[i] || i === seg.length - 1) {
      const f = seg[i] ? Math.min(1, target / seg[i]) : 0;
      return [coords[i][0] + (coords[i + 1][0] - coords[i][0]) * f, coords[i][1] + (coords[i + 1][1] - coords[i][1]) * f];
    }
    target -= seg[i];
  }
  return coords.at(-1);
}

// ---------- pixel art ----------
const PAL = { h: '#4a2f1b', s: '#f3c9a0', b: '#1b4b7a', p: '#2b3440', k: '#111827', w: '#eaf4ff', r: '#d9724a', y: '#e0a94e', g: '#3f7cb0', n: '#2f8f83', e: '#1f2937', l: '#cbd5e1' };
const SPRITES = {
  walkA: ['....hhhh....', '...hhhhhh...', '...ssssss...', '...sesses...', '....ssss....', '..bbbbbbbb..', '.sbbbbbbbbs.', '.sbbbbbbbbs.', '..bbbbbbbb..', '..pppppppp..', '..ppp..ppp..', '..ppp..ppp..', '..kkk..kkk..'],
  walkB: ['....hhhh....', '...hhhhhh...', '...ssssss...', '...sesses...', '....ssss....', '..bbbbbbbb..', '.sbbbbbbbbs.', '.sbbbbbbbbs.', '..bbbbbbbb..', '..pppppppp..', '...pppppp...', '...ppppp....', '...kkkkk....'],
  car: ['....rrrrrrr.....', '...rwwrrwwrr....', '..rrwwrrwwrrr...', '.rrrrrrrrrrrrrr.', '.rrrrrrrrrrrrrr.', '.ryyrrrrrrrryyr.', '..kkk......kkk..', '..kkk......kkk..'],
  train: ['...gggggggggggggg...', '..gwwgwwgwwgwwgwwg..', '..gwwgwwgwwgwwgwwg..', '..gggggggggggggggg..', '..gyyggggggggggyyg..', '..gggggggggggggggg..', '..llllllllllllllll..', '...kk..kk..kk..kk...'],
  tram: ['........ll........', '.....llllllll.....', '..nnnnnnnnnnnnnn..', '..nwwnwwnwwnwwnn..', '..nwwnwwnwwnwwnn..', '..nnnnnnnnnnnnnn..', '..nyynnnnnnnnyyn..', '..llllllllllllll..', '...kk........kk...'],
};
const PX = 3;
function svg(rows) {
  const w = rows[0].length, hgt = rows.length;
  let rects = '';
  rows.forEach((row, y) => { for (let x = 0; x < w; x++) { const c = PAL[row[x]]; if (c) rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${c}"/>`; } });
  return { html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${hgt}" width="${w * PX}" height="${hgt * PX}" shape-rendering="crispEdges">${rects}</svg>`, w: w * PX, h: hgt * PX };
}
function sprite(mode, frame) {
  if (mode === 'flight') return { html: '<div style="font-size:30px;line-height:1">✈️</div>', w: 34, h: 34 };
  if (mode === 'taxi' || mode === 'bus') return svg(SPRITES.car);
  if (mode === 'train' || mode === 'subway') return svg(SPRITES.train);
  if (mode === 'tram') return svg(SPRITES.tram);
  return svg(frame ? SPRITES.walkB : SPRITES.walkA);
}

// ---------- the traveller ----------
export function createCharacter(map) {
  let marker = null, mode = 'walk', frame = 0, timer = null;
  const mkIcon = () => { const s = sprite(mode, frame); return L.divIcon({ className: 'chr', html: `<div class="chr-in">${s.html}</div>`, iconSize: [s.w, s.h], iconAnchor: [s.w / 2, s.h - 2] }); };
  const refresh = () => marker?.setIcon(mkIcon());
  const legs = () => (mode === 'walk' || mode === 'bike');

  return {
    setPos(ll) { if (!marker) marker = L.marker(ll, { icon: mkIcon(), zIndexOffset: 2000, interactive: false, keyboard: false }).addTo(map); else marker.setLatLng(ll); },
    setMode(m) { mode = m; refresh(); },
    get mode() { return mode; },
    // Animate along `coords` over `ms`. Resolves when finished. The map follows if the traveller leaves the screen.
    move(coords, ms, { cancelled = () => false } = {}) {
      return new Promise((resolve) => {
        clearInterval(timer);
        if (legs()) timer = setInterval(() => { frame ^= 1; refresh(); }, 170);
        const t0 = performance.now();
        const tick = (now) => {
          const t = Math.min(1, (now - t0) / ms);
          const ll = pointAt(coords, t);
          marker.setLatLng(ll);
          if (!map.getBounds().pad(-0.18).contains(ll)) map.panTo(ll, { animate: true, duration: 0.25, noMoveStart: true });
          if (t < 1 && !cancelled()) requestAnimationFrame(tick);
          else { clearInterval(timer); frame = 0; refresh(); resolve(); }
        };
        requestAnimationFrame(tick);
      });
    },
    remove() { clearInterval(timer); marker?.remove(); marker = null; },
  };
}

export const durationMs = (km) => Math.round(1600 + Math.min(1, km / 8) * 2400); // 1.6 s … 4 s by distance
