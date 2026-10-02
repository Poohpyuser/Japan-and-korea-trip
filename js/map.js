// Map tab: Leaflet + OpenStreetMap. Draws the selected day’s route, saved places and whatever the Wi-Fi /
// Safety tabs last found. Leaflet is vendored (works offline once cached); map tiles need a connection
// except for areas you already viewed.
import { h, clear, toast, getPosition, links } from './util.js';
import * as S from './store.js';
import { CITIES, CATS } from './data.js';
import { layers, setMyPosition } from './shared.js';

let map, group, meMarker;
const on = { route: true, saved: true, wifi: true, safety: true, quakes: true };
let lastDay = -1;

const dot = (cls, text = '') => L.divIcon({ className: '', html: `<div class="pin ${cls}">${text}</div>`, iconSize: [26, 26], iconAnchor: [13, 13], popupAnchor: [0, -12] });

export function renderMap(root) {
  if (typeof L === 'undefined') {
    return root.replaceChildren(h('div.card', h('p.warn', 'The map library didn’t load. Reload the page once while online.')));
  }
  const st = S.get();
  const day = S.currentDay();
  if (!map) {
    const box = h('div', { id: 'map', role: 'application', 'aria-label': 'Trip map' });
    root.replaceChildren(
      h('div.map-bar',
        h('div.row.wrap', Object.entries({ route: 'Route', saved: 'Saved', wifi: 'Wi-Fi', safety: 'Help', quakes: 'Quakes' }).map(([k, l]) =>
          h('label.chipcheck', h('input', { type: 'checkbox', checked: on[k] ? true : null, onchange: (e) => { on[k] = e.target.checked; draw(false); } }), h('span', l))),
          h('button.btn.sm', { onclick: locate }, '📍 Me'))),
      box);
    const c = CITIES[day?.city || 'tokyo'];
    map = L.map(box, { zoomControl: true }).setView([c.lat, c.lng], 12);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(map);
    group = L.layerGroup().addTo(map);
  }
  setTimeout(() => map.invalidateSize(), 50);
  draw(lastDay !== st.ui.day);
  lastDay = st.ui.day;
}

function popup(title, sub, link) {
  const d = h('div', h('strong', title), sub ? h('div', sub) : null, link ? h('a', { href: link, target: '_blank', rel: 'noopener' }, 'Open in Maps ↗') : null);
  return d;
}

function draw(fit = true) {
  if (!map) return;
  const st = S.get();
  const day = S.currentDay();
  group.clearLayers();
  const bounds = [];

  if (day && on.route) {
    const pts = [];
    day.stops.forEach((s, i) => {
      if (s.kind === 'transit' && s.transit) {
        const t = s.transit;
        if (t.fromLat != null) pts.push([t.fromLat, t.fromLng]);
        if (t.toLat != null) { pts.push([t.toLat, t.toLng]); L.marker([t.toLat, t.toLng], { icon: dot('transit', '🚆') }).bindPopup(popup(`${t.from} → ${t.to}`, [t.line, s.time].filter(Boolean).join(' · '), links.gmapsDir(t.from, t.to))).addTo(group); }
        return;
      }
      const p = S.placeById(s.placeId);
      if (p?.lat == null) return;
      pts.push([p.lat, p.lng]);
      L.marker([p.lat, p.lng], { icon: dot('route', String(i + 1)) }).bindPopup(popup(`${i + 1}. ${p.name}`, [s.time, p.local].filter(Boolean).join(' · '), links.gmapsPlace(p))).addTo(group);
    });
    if (pts.length > 1) L.polyline(pts, { color: '#e11d48', weight: 3, opacity: 0.7, dashArray: '6 6' }).addTo(group);
    bounds.push(...pts);
  }
  if (on.saved) {
    const inDay = new Set(day?.stops.map((s) => s.placeId));
    st.places.filter((p) => p.lat != null && !(on.route && inDay.has(p.id))).forEach((p) => {
      L.marker([p.lat, p.lng], { icon: dot(p.cat === 'food' || p.cat === 'cafe' ? 'food' : 'saved', CATS[p.cat]?.icon || '📍') }).bindPopup(popup(p.name, p.local || p.address, links.gmapsPlace(p))).addTo(group);
    });
  }
  if (on.wifi) layers.wifi.forEach((w) => L.marker([w.lat, w.lng], { icon: dot(w.sure ? 'wifi' : 'wifi2', '📶') }).bindPopup(popup(w.name, w.sure ? 'Tagged free Wi-Fi' : 'Chain – usually has Wi-Fi', links.gmapsPlace(w))).addTo(group));
  if (on.safety) layers.safety.forEach((w) => L.marker([w.lat, w.lng], { icon: dot('help', '✚') }).bindPopup(popup(w.name, w.kind, links.gmapsPlace(w))).addTo(group));
  if (on.quakes) layers.quakes.forEach((q) => L.circleMarker([q.lat, q.lng], { radius: 4 + q.mag * 1.8, color: '#b91c1c', fillColor: '#ef4444', fillOpacity: 0.35, weight: 1 })
    .bindPopup(popup(`M${q.mag.toFixed(1)} earthquake`, `${q.place} · ${new Date(q.time).toLocaleString()}`)).addTo(group));

  if (fit) {
    if (bounds.length) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    else { const c = CITIES[day?.city || 'tokyo']; map.setView([c.lat, c.lng], 12); }
  }
}

async function locate() {
  try {
    const p = await getPosition();
    setMyPosition(p);
    meMarker?.remove();
    meMarker = L.circleMarker([p.lat, p.lng], { radius: 8, color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }).addTo(map).bindPopup('You are here');
    map.setView([p.lat, p.lng], 16);
  } catch (e) { toast(e.message); }
}
