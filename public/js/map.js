// Map tab: the planning hub. The map fills the screen; a bottom dock opens Route / Food / Wi-Fi / Transit /
// Safety / AI panels, tapping the map offers quick actions, and "Play" walks a character through the day.
import { h, clear, input, toast, getPosition, links, geocode, fetchJSON, fmtDist, distKm } from './util.js';
import * as S from './store.js';
import { CITIES, CATS, MOVES } from './data.js';
import { icon } from './icons.js';
import { layers, registerMapCenter, setPin, getPin, setMyPosition } from './shared.js';
import { legGeometry, cachedLeg, createCharacter, modeFor, durationMs } from './journey.js';
import { finderPanel } from './eat.js';
import { renderWifi } from './wifi.js';
import { renderTransit } from './transit.js';
import { renderSafety } from './safety.js';
import { renderAI, openAI } from './ai.js';
import { addPlaceFlow } from './plan.js';

const TILES = {
  en: { url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', opt: { subdomains: 'abcd', maxZoom: 19, attribution: '© OpenStreetMap contributors © CARTO' }, label: 'EN' },
  osm: { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', opt: { maxZoom: 19, attribution: '© OpenStreetMap contributors' }, label: 'Local' },
};
const PANELS = {
  route: ['Route', 'route', (el) => routePanel(el)],
  eat: ['Food', 'eat', (el) => el.append(finderPanel())],
  wifi: ['Wi-Fi', 'wifi', (el) => renderWifi(el)],
  transit: ['Transit', 'train', (el) => renderTransit(el)],
  safety: ['Safety', 'shield', (el) => renderSafety(el)],
  ai: ['AI', 'ai', (el) => renderAI(el, { embedded: true })],
};

let map, base, extra, tileLayer, char, pinMarker, meMarker;
let ui = {};
let tileKey = (() => { try { return localStorage.getItem('tiles') || 'en'; } catch { return 'en'; } })();
let showLabels = true;
let activePanel = null;
let journey = { i: 0, busy: false, playing: false, dayKey: '' };
let pendingFocus = null;
let pendingPanel = null;
document.addEventListener('open-panel', (e) => { pendingPanel = e.detail; });
let geomSig = '';

const dot = (cls, text = '') => L.divIcon({ className: '', html: `<div class="pin ${cls}">${text}</div>`, iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -12] });

// ---------- data for the selected day ----------
function dayPts() {
  const day = S.currentDay();
  if (!day) return [];
  const pts = [];
  day.stops.forEach((s) => {
    const c = S.stopCoords(s);
    if (!c) return;
    pts.push({ ...c, stop: s, mode: modeFor(s), label: S.stopTitle(s), time: s.time });
  });
  return pts;
}

// ---------- rendering ----------
export function renderMap(root) {
  if (typeof L === 'undefined') return root.replaceChildren(h('div.card', h('p.warn', 'The map library didn’t load. Reload the page once while online.')));
  if (!map) build(root);
  // Called again on every state change: refresh what depends on the data, but never wipe an open panel.
  refresh(true);
  setTimeout(() => map.invalidateSize(), 60);
  if (pendingFocus) { const f = pendingFocus; pendingFocus = null; focusStop(f); }
  if (pendingPanel) { const k = pendingPanel; pendingPanel = null; if (PANELS[k]) openPanel(k); }
}

function build(root) {
  const center = CITIES[S.currentDay()?.city || 'tokyo'];
  ui.map = h('div', { id: 'map', role: 'application', 'aria-label': 'Trip map' });
  ui.chips = h('nav.mchips', { 'aria-label': 'Days' });
  ui.results = h('div.msearch-results', { hidden: true });
  const q = input({ type: 'search', placeholder: 'Search a place on the map…', 'aria-label': 'Search places' });
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter') runSearch(q.value); });
  ui.tools = h('div.maptools',
    h('button.mt', { title: 'Show a different map style', onclick: toggleTiles }, h('span', TILES[tileKey].label)),
    h('button.mt', { title: 'Toggle labels', onclick: () => { showLabels = !showLabels; refresh(false); } }, icon('tag', 18)),
    h('button.mt', { title: 'My location', onclick: locate }, icon('locate', 18)));
  ui.journey = h('div.journey');
  ui.dock = h('div.dock', Object.entries(PANELS).map(([k, [label, ic]]) =>
    h('button.dk', { dataset: { p: k }, onclick: () => togglePanel(k) }, icon(ic, 20), h('span', label), k === 'safety' ? h('i.dot') : null)));
  ui.panelTitle = h('b', '');
  ui.panelBody = h('div.panel-body');
  ui.panel = h('div.panel', { hidden: true }, h('div.panel-head', ui.panelTitle,
    h('div.row', h('button.icon-btn', { 'aria-label': 'Expand panel', title: 'Expand / shrink', onclick: () => { ui.panel.classList.toggle('tall'); setTimeout(() => map.invalidateSize(), 50); } }, icon('layers', 18)),
      h('button.icon-btn', { 'aria-label': 'Close panel', onclick: () => togglePanel(null) }, icon('x', 18)))), ui.panelBody);
  ui.sheet = h('div.msheet', ui.journey, ui.panel, ui.dock);

  root.replaceChildren(h('div.map-wrap',
    ui.map,
    h('div.map-top', h('div.msearch', icon('search', 18), q), ui.results, ui.chips),
    ui.tools, ui.sheet));

  map = L.map(ui.map, { zoomControl: false, attributionControl: true }).setView([center.lat, center.lng], 12);
  L.control.zoom({ position: 'topright' }).addTo(map);
  setTiles();
  base = L.layerGroup().addTo(map);
  extra = L.layerGroup().addTo(map);
  char = createCharacter(map);
  registerMapCenter(() => { const c = map.getCenter(); return { lat: c.lat, lng: c.lng }; });
  map.on('click', (e) => quickPopup(e.latlng));
  document.addEventListener('layers-changed', () => map && drawExtra());
  document.addEventListener('show-on-map', (e) => { const { dayIdx, stopId } = e.detail; S.get().ui.day = dayIdx; pendingFocus = stopId; });
}

function setTiles() {
  tileLayer?.remove();
  tileLayer = L.tileLayer(TILES[tileKey].url, TILES[tileKey].opt).addTo(map);
  tileLayer.bringToBack();
}
function toggleTiles() {
  tileKey = tileKey === 'en' ? 'osm' : 'en';
  try { localStorage.setItem('tiles', tileKey); } catch { /* ignore */ }
  setTiles();
  ui.tools.querySelector('.mt span').textContent = TILES[tileKey].label;
  toast(tileKey === 'en' ? 'English labels' : 'Local-language labels');
}

function refresh(fit) {
  const st = S.get();
  // day chips
  clear(ui.chips).append(...st.days.map((d, i) => h('button.mchip', { class: i === st.ui.day ? 'on' : '', onclick: () => { st.ui.day = i; S.save(); } }, `D${i + 1}`, h('small', d.date.slice(5)))));
  ui.chips.querySelector('.on')?.scrollIntoView({ inline: 'center', block: 'nearest' });

  const day = S.currentDay();
  const key = `${st.activeId}|${day?.date}`;
  const pts = dayPts();
  if (journey.dayKey !== key) { journey = { i: 0, busy: false, playing: false, dayKey: key }; geomSig = ''; fit = true; }
  journey.i = Math.min(journey.i, Math.max(0, pts.length - 1));
  drawBase(fit);
  drawExtra();
  drawJourneyBar();
  if (activePanel === 'route') PANELS.route[2](clear(ui.panelBody));
}

const pinIcon = (n, p) => {
  const sty = p.stop.kind === 'transit' ? '#2f8f83' : (CATS[S.placeById(p.stop.placeId)?.cat] || CATS.other).color;
  return L.divIcon({ className: '', html: `<div class="pin num" style="background:${sty}">${n}</div>`, iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -12] });
};

function drawBase(fit) {
  base.clearLayers();
  const st = S.get();
  const day = S.currentDay();
  const pts = dayPts();
  const bounds = [];

  pts.forEach((p, i) => {
    const m = L.marker([p.lat, p.lng], { icon: pinIcon(i + 1, p) }).addTo(base);
    if (showLabels) m.bindTooltip(`${p.time ? p.time + ' ' : ''}${p.label}`, { permanent: true, direction: 'top', offset: [0, -14], className: 'plabel' });
    m.bindPopup(() => stopPopup(p, i));
    bounds.push([p.lat, p.lng]);
  });

  // Route legs: travelled = solid navy, remaining = dashed grey. Road geometry is filled in lazily.
  for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k], b = pts[k + 1];
    const g = cachedLeg(a, b, b.mode);
    const done = k < journey.i;
    L.polyline(g ? g.coords : [[a.lat, a.lng], [b.lat, b.lng]], done ? { color: '#1b4b7a', weight: 5, opacity: 0.95 } : { color: '#8794a3', weight: 4, opacity: 0.9, dashArray: '2 9', lineCap: 'round' }).addTo(base);
  }
  const sig = pts.map((p) => `${p.lat},${p.lng},${p.mode}`).join(';');
  if (sig !== geomSig) {
    geomSig = sig;
    (async () => {
      let changed = false;
      for (let k = 0; k < pts.length - 1; k++) { if (!cachedLeg(pts[k], pts[k + 1], pts[k + 1].mode)) { await legGeometry(pts[k], pts[k + 1], pts[k + 1].mode); changed = true; } }
      if (changed && geomSig === sig) { drawBase(false); if (activePanel === 'route') PANELS.route[2](clear(ui.panelBody)); }
    })();
  }

  if (pts.length) { const c = pts[journey.i]; char.setPos([c.lat, c.lng]); char.setMode(c.mode); } else char.remove();

  // Saved places not in today's route
  const inDay = new Set(day?.stops.map((s) => s.placeId));
  st.places.filter((p) => p.lat != null && !inDay.has(p.id)).forEach((p) => {
    const cat = CATS[p.cat] || CATS.other;
    L.marker([p.lat, p.lng], { icon: L.divIcon({ className: '', html: `<div class="pin saved" style="background:${cat.color}">${cat.icon}</div>`, iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -12] }) })
      .bindPopup(() => savedPopup(p)).addTo(base);
  });

  if (fit) {
    if (bounds.length > 1) map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    else if (bounds.length === 1) map.setView(bounds[0], 15);
    else if (day) { const c = CITIES[day.city] || CITIES.tokyo; map.setView([c.lat, c.lng], 12); }
  }
}

function drawExtra() {
  extra.clearLayers();
  layers.food.forEach((f) => L.marker([f.lat, f.lng], { icon: dot('food', '🍜') }).bindPopup(() => foodPopup(f)).addTo(extra));
  layers.wifi.forEach((w) => L.marker([w.lat, w.lng], { icon: dot(w.sure ? 'wifi' : 'wifi2', '📶') }).bindPopup(popupBox(w.name, w.sure ? 'Tagged free Wi-Fi' : 'Chain: usually has Wi-Fi', links.gmapsPlace(w))).addTo(extra));
  layers.safety.forEach((w) => L.marker([w.lat, w.lng], { icon: dot('help', '✚') }).bindPopup(popupBox(w.name, w.kind, links.gmapsPlace(w))).addTo(extra));
  layers.quakes.forEach((q) => L.circleMarker([q.lat, q.lng], { radius: 4 + q.mag * 1.8, color: '#b91c1c', fillColor: '#ef4444', fillOpacity: 0.35, weight: 1 }).bindPopup(popupBox(`M${q.mag.toFixed(1)} earthquake`, `${q.place} · ${new Date(q.time).toLocaleString()}`)).addTo(extra));
  const pin = getPin();
  pinMarker?.remove();
  if (pin) pinMarker = L.marker([pin.lat, pin.lng], { icon: dot('pin', '📌'), zIndexOffset: 900 }).addTo(extra).bindPopup(() => quickBody({ lat: pin.lat, lng: pin.lng }, pin.label));
}

// ---------- popups ----------
const popupBox = (title, sub, link) => h('div.pop', h('strong', title), sub ? h('div.muted', sub) : null, link ? h('a', { href: link, target: '_blank', rel: 'noopener' }, 'Open in Maps ↗') : null);

function stopPopup(p, i) {
  return h('div.pop', h('strong', `${i + 1}. ${p.label}`), h('div.muted', [p.time, MOVES[p.mode]?.join(' ')].filter(Boolean).join(' · ')),
    h('a', { href: `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`, target: '_blank', rel: 'noopener' }, 'Directions ↗'),
    h('div.row.wrap',
      h('button.btn.sm', { onclick: () => { map.closePopup(); journey.i = i; drawBase(false); drawJourneyBar(); } }, 'Start here'),
      h('button.btn.sm', { onclick: () => { map.closePopup(); runAt(p, 'eat'); } }, 'Food nearby'),
      h('button.btn.sm', { onclick: () => { map.closePopup(); runAt(p, 'wifi'); } }, 'Wi-Fi nearby')));
}

function savedPopup(p) {
  const st = S.get();
  const sel = h('select', { onchange: (e) => { if (e.target.value === '') return; S.addStop(+e.target.value, { kind: 'place', placeId: p.id }); toast(`Added to Day ${+e.target.value + 1}`); map.closePopup(); } },
    h('option', { value: '' }, '＋ Add to day…'), st.days.map((d, i) => h('option', { value: i }, `Day ${i + 1}`)));
  return h('div.pop', h('strong', p.name), h('div.muted', p.local || p.address || ''), sel, h('a', { href: p.mapUrl || links.gmapsPlace(p), target: '_blank', rel: 'noopener' }, 'Open in Maps ↗'));
}

function foodPopup(f) {
  return h('div.pop', h('strong', f.name), f.local ? h('div.muted', f.local) : null, f.cuisine ? h('div.muted', f.cuisine) : null,
    h('div.row.wrap',
      h('button.btn.sm.primary', { onclick: () => { S.addPlace({ name: f.name, local: f.local, lat: f.lat, lng: f.lng, cat: 'food', city: S.currentDay()?.city, country: 'JP', note: f.cuisine || '' }); toast('Saved to your food list'); map.closePopup(); } }, 'Save'),
      h('a.btn.sm', { href: links.tabelog(f.name), target: '_blank', rel: 'noopener' }, 'Tabelog'),
      h('a.btn.sm', { href: links.googleReviews(f.name, ''), target: '_blank', rel: 'noopener' }, 'Google')));
}

// Tap anywhere: name the spot and offer the next obvious actions.
function quickPopup(latlng, label) {
  L.popup({ minWidth: 220 }).setLatLng(latlng).setContent(quickBody({ lat: latlng.lat, lng: latlng.lng }, label)).openOn(map);
}
function quickBody(pt, label) {
  const st = S.get();
  const name = input({ type: 'text', value: label || '', placeholder: 'Name this spot' });
  if (!label) {
    fetchJSON(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&accept-language=en&lat=${pt.lat}&lon=${pt.lng}`, {}, 6000)
      .then((r) => { if (!name.value) name.value = r.name || r.display_name?.split(',').slice(0, 2).join(',') || ''; }).catch(() => {});
  }
  const mk = () => ({ name: name.value.trim() || 'Dropped pin', lat: pt.lat, lng: pt.lng, city: S.currentDay()?.city, country: pt.lng < 129.65 && pt.lat > 33 && pt.lat < 38.7 && pt.lng > 125 ? 'KR' : 'JP', address: '' });
  const daySel = h('select', { onchange: (e) => { if (e.target.value === '') return; const p = S.addPlace(mk()); S.addStop(+e.target.value, { kind: 'place', placeId: p.id }); toast(`Added to Day ${+e.target.value + 1}`); map.closePopup(); } },
    h('option', { value: '' }, '＋ Add to day…'), st.days.map((d, i) => h('option', { value: i }, `Day ${i + 1}`)));
  return h('div.pop.quick',
    name, daySel,
    h('div.qgrid',
      h('button.btn.sm', { onclick: () => { S.addPlace(mk()); toast('Saved'); map.closePopup(); } }, 'Save'),
      h('button.btn.sm', { onclick: () => { map.closePopup(); runAt(pt, 'eat', name.value); } }, 'Food here'),
      h('button.btn.sm', { onclick: () => { map.closePopup(); runAt(pt, 'wifi', name.value); } }, 'Wi-Fi here'),
      h('button.btn.sm', { onclick: () => { map.closePopup(); runAt(pt, 'safety', name.value); } }, 'Help here'),
      h('a.btn.sm', { href: links.gmapsPlace(pt), target: '_blank', rel: 'noopener' }, 'Open ↗')));
}

// Drop a pin, then open a panel that searches around it.
function runAt(pt, panel, label) {
  setPin({ lat: pt.lat, lng: pt.lng, label: label || 'dropped pin' });
  drawExtra();
  openPanel(panel);
}

// ---------- search ----------
async function runSearch(term) {
  term = term.trim();
  if (!term) return;
  ui.results.hidden = false;
  clear(ui.results).append(h('p.muted', 'Searching…'));
  try {
    const c = map.getCenter();
    const rows = await geocode(term, { lat: c.lat, lng: c.lng });
    clear(ui.results);
    if (!rows.length) ui.results.append(h('p.muted', 'No matches. Try the English or local name.'));
    rows.slice(0, 6).forEach((r) => ui.results.append(h('button.result', { onclick: () => { ui.results.hidden = true; map.flyTo([r.lat, r.lng], 16); quickPopup({ lat: r.lat, lng: r.lng }, r.name); } }, h('strong', r.name), h('small', r.address))));
    ui.results.append(h('button.btn.sm.ghost', { onclick: () => { ui.results.hidden = true; } }, 'Close'));
  } catch (e) { clear(ui.results).append(h('p.warn', `Search failed (${e.message})`), h('button.btn.sm.ghost', { onclick: () => { ui.results.hidden = true; } }, 'Close')); }
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

// ---------- panels ----------
function togglePanel(k) { if (k === null || k === activePanel) { activePanel = null; syncPanel(); } else openPanel(k); }
function openPanel(k) { activePanel = k; syncPanel(); }
function syncPanel() {
  ui.dock.querySelectorAll('.dk').forEach((b) => b.classList.toggle('on', b.dataset.p === activePanel));
  ui.panel.hidden = !activePanel;
  ui.sheet.classList.toggle('open', !!activePanel);
  if (!activePanel) { clear(ui.panelBody); setTimeout(() => map.invalidateSize(), 50); return; }
  ui.panelTitle.textContent = PANELS[activePanel][0];
  clear(ui.panelBody);
  PANELS[activePanel][2](ui.panelBody);
  ui.panel.scrollTop = 0;
  setTimeout(() => map.invalidateSize(), 50);
}

function routePanel(el) {
  const st = S.get();
  const day = S.currentDay();
  const pts = dayPts();
  const idx = st.ui.day;
  const hereOr = () => pts[journey.i] || map.getCenter();

  const list = h('ol.rlist', pts.map((p, i) => {
    const next = pts[i + 1];
    const leg = next ? cachedLeg(p, next, next.mode) : null;
    return h('li', { class: i === journey.i ? 'on' : '' },
      h('button.rrow', { onclick: () => { journey.i = i; char.setPos([p.lat, p.lng]); map.flyTo([p.lat, p.lng], 16); drawBase(false); drawJourneyBar(); } },
        h('span.num', i + 1), h('span.rt', h('b', p.label), h('small', p.time || '')), ),
      next ? h('div.leg', `${MOVES[next.mode]?.[0] || '🚶'} ${leg ? `${leg.min} min · ${fmtDist(leg.km)}${leg.routed ? '' : ' (straight line)'}` : '…'}`) : null);
  }));

  el.append(
    h('div.qa',
      qa('ai', 'AI plan this day', () => openAI({ mode: 'planday', dayIdx: idx }), true),
      qa('plus', 'Add place', () => addPlaceFlow(idx)),
      qa('route', 'Optimize order', optimize),
      qa('eat', 'Food near here', () => runAt(hereOr(), 'eat')),
      qa('wifi', 'Wi-Fi near here', () => runAt(hereOr(), 'wifi')),
      qa('shield', 'Help near here', () => runAt(hereOr(), 'safety')),
      pts.length > 1 ? qa('nav', 'Open in Google Maps', () => window.open(links.gmapsRoute(pts.map((p) => ({ lat: p.lat, lng: p.lng, name: p.label }))), '_blank', 'noopener')) : null),
    pts.length ? list : h('div.empty', h('div.empty-art', '🗺️'), h('p', h('b', 'No located stops on Day ' + (idx + 1))), h('p.muted', 'Tap the map, search above, or let the AI draft the day. Stops with a map location show up here.')));
}
const qa = (ic, label, fn, hot) => h('button.qa-b', { class: hot ? 'hot' : '', onclick: fn }, icon(ic, 20), h('span', label));

// Reorder untimed stops by nearest-neighbour so you walk less; timed stops keep their slots.
function optimize() {
  const day = S.currentDay();
  const slots = day.stops.map((s, i) => ({ s, i, c: S.stopCoords(s) })).filter((x) => x.c && !x.s.time && x.s.kind !== 'transit');
  if (slots.length < 3) return toast('Need at least 3 untimed stops with locations');
  const before = pathKm(slots.map((x) => x.c));
  const left = slots.slice(1), order = [slots[0]];
  while (left.length) {
    const last = order.at(-1).c;
    let bi = 0;
    left.forEach((x, k) => { if (distKm(last, x.c) < distKm(last, left[bi].c)) bi = k; });
    order.push(left.splice(bi, 1)[0]);
  }
  const after = pathKm(order.map((x) => x.c));
  if (after >= before - 0.05) return toast('Already a good order');
  const idxs = slots.map((x) => x.i);
  order.forEach((x, k) => { day.stops[idxs[k]] = x.s; });
  S.save(); toast(`Saved ~${(before - after).toFixed(1)} km of walking`);
}
const pathKm = (cs) => cs.reduce((a, c, i) => a + (i ? distKm(cs[i - 1], c) : 0), 0);

// ---------- journey bar ----------
function drawJourneyBar() {
  const pts = dayPts();
  const bar = clear(ui.journey);
  ui.journey.hidden = !pts.length;
  if (!pts.length) return;
  const cur = pts[journey.i];
  bar.append(
    h('div.jtext', h('b', `Today’s journey ${journey.i + 1}/${pts.length}`), h('span', `${cur.time ? cur.time + ' · ' : ''}${cur.label}`)),
    h('div.jprog', h('i', { style: `width:${pts.length > 1 ? (journey.i / (pts.length - 1)) * 100 : 100}%` })),
    h('div.jbtns',
      h('button.btn.sm', { onclick: () => go(-1), 'aria-label': 'Previous stop' }, icon('prev', 16)),
      h('button.btn.sm', { onclick: now }, 'Now'),
      h('button.btn.sm.primary', { onclick: play }, journey.playing ? '❚❚ Pause' : [icon('play', 14), ' Play']),
      h('button.btn.sm', { onclick: () => go(1), 'aria-label': 'Next stop' }, icon('next', 16))));
}

async function go(dir, { animate = dir > 0 } = {}) {
  const pts = dayPts();
  const target = journey.i + dir;
  if (journey.busy || target < 0 || target >= pts.length) return false;
  journey.busy = true;
  const a = pts[journey.i], b = pts[target];
  if (animate) {
    const g = await legGeometry(a, b, b.mode);
    char.setMode(b.mode); char.setPos([a.lat, a.lng]);
    await char.move(g.coords, durationMs(g.km), { cancelled: () => !journey.playing && journey.autoStop });
  } else { char.setMode(b.mode); char.setPos([b.lat, b.lng]); map.panTo([b.lat, b.lng]); }
  journey.i = target; journey.busy = false;
  drawBase(false); drawJourneyBar();
  if (activePanel === 'route') PANELS.route[2](clear(ui.panelBody));
  return true;
}
async function play() {
  if (journey.playing) { journey.playing = false; journey.autoStop = true; return drawJourneyBar(); }
  const pts = dayPts();
  if (journey.i >= pts.length - 1) { journey.i = 0; drawBase(false); }
  journey.playing = true; journey.autoStop = false; drawJourneyBar();
  while (journey.playing && (await go(1))) { await new Promise((r) => setTimeout(r, 450)); }
  journey.playing = false; drawJourneyBar();
}
function now() {
  const pts = dayPts(); const day = S.currentDay();
  if (!pts.length) return;
  let i = 0;
  if (day.date === localToday()) { // on the trip day itself, jump to the latest stop whose time has passed
    const hm = new Date().toTimeString().slice(0, 5);
    pts.forEach((p, k) => { if (p.time && p.time <= hm) i = k; });
  }
  journey.i = i; const p = pts[i]; char.setPos([p.lat, p.lng]); map.flyTo([p.lat, p.lng], 16); drawBase(false); drawJourneyBar();
}
const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

function focusStop(stopId) {
  const pts = dayPts();
  const i = pts.findIndex((p) => p.stop.id === stopId);
  if (i < 0) return toast('That stop has no map location yet. Edit it and add an address.');
  journey.i = i; char.setPos([pts[i].lat, pts[i].lng]);
  map.flyTo([pts[i].lat, pts[i].lng], 16); drawBase(false); drawJourneyBar();
}
