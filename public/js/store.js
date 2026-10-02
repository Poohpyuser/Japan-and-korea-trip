// Single source of truth. Everything lives in localStorage on the device (big files in IndexedDB), so the app works
// offline with no account or server. Several trips are supported; get() returns a view of the ACTIVE trip, so
// the tabs can keep writing `st.days`, `st.places`, … and it lands in the right trip.
import { uid, addDays, daysBetween, todayISO } from './util.js';
import { DEFAULT_PACKING, sampleTrip } from './data.js';
import { delFile } from './docs.js';

export const MAX_DAYS = 90;
const KEY = 'trip-planner-v2';
const OLD_KEY = 'trip-planner-v1';
const listeners = new Set();

const newTripObj = (o = {}) => ({
  id: uid(), name: 'My trip', note: '', start: '', end: '',
  days: [], // { date, city, note, stops: [{id, kind, time, title, placeId, note, cost, done, move, alarm, docs, transit}] }
  places: [], // { id, name, local, cat, lat, lng, address, mapUrl, country, city, note, status, must, scores, ratings }
  flights: [], // { id, airline, no, fromCode, fromCity, toCode, toCity, depDate, depTime, arrDate, arrTime, note }
  expenses: [],
  packing: DEFAULT_PACKING.map((text) => ({ id: uid(), text, done: false })),
  ...o,
});

const defaultSettings = () => ({
  names: ['Me', 'Sister'], who: 'Me', homeCurrency: 'USD',
  hotels: {}, // city key -> { name, local }
  emergency: { name: '', blood: '', allergies: '', meds: '', contact: '', embassy: '' },
});

const fresh = () => { const t = newTripObj(); return { v: 2, trips: [t], activeId: t.id, settings: defaultSettings(), ui: { day: 0, tab: 'plan' } }; };

function migrate(raw) {
  if (raw?.v === 2 && Array.isArray(raw.trips) && raw.trips.length) {
    raw.settings = { ...defaultSettings(), ...raw.settings };
    raw.trips = raw.trips.map((t) => newTripObj(t));
    if (!raw.trips.some((t) => t.id === raw.activeId)) raw.activeId = raw.trips[0].id;
    raw.ui = { day: 0, tab: 'plan', ...raw.ui };
    return raw;
  }
  if (raw?.v === 1) { // first version stored a single trip at the top level
    const t = newTripObj({ ...raw.trip, days: raw.days || [], places: raw.places || [], expenses: raw.expenses || [], packing: raw.packing || undefined });
    return { v: 2, trips: [t], activeId: t.id, settings: { ...defaultSettings(), ...raw.settings }, ui: { day: raw.ui?.day || 0, tab: 'plan' } };
  }
  return null;
}

function load() {
  try {
    const cur = migrate(JSON.parse(localStorage.getItem(KEY)));
    if (cur) return cur;
    const old = migrate(JSON.parse(localStorage.getItem(OLD_KEY)));
    if (old) return old;
  } catch { /* corrupt or blocked storage: start fresh */ }
  return fresh();
}

let state = load();
export const activeTrip = () => state.trips.find((t) => t.id === state.activeId) || state.trips[0];

const view = {
  get trips() { return state.trips; },
  get activeId() { return state.activeId; },
  get settings() { return state.settings; },
  set settings(v) { state.settings = v; },
  get ui() { return state.ui; },
  get trip() { return activeTrip(); },
  set trip(v) { Object.assign(activeTrip(), v, { id: activeTrip().id }); },
};
for (const k of ['days', 'places', 'flights', 'expenses', 'packing']) {
  Object.defineProperty(view, k, { get: () => activeTrip()[k], set: (v) => { activeTrip()[k] = v; } });
}
export const get = () => view;
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

let saveTimer;
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage full or disabled */ } };
export function save(notify = true) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 150);
  if (notify) listeners.forEach((fn) => fn(view));
}
window.addEventListener('pagehide', persist);

export function replaceState(next) {
  const m = migrate(JSON.parse(JSON.stringify(next)));
  if (!m) throw new Error('Not a trip backup file');
  state = m; persist(); save();
}
export const exportState = () => state;

// Cache for API results so the app stays useful with no signal.
export const cache = {
  get(k) { try { return JSON.parse(localStorage.getItem('cache:' + k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem('cache:' + k, JSON.stringify({ at: Date.now(), v })); } catch { /* ignore */ } },
};

// ---- trips ----
export function createTrip({ name, start, end, note }, { sample = false } = {}) {
  // An untouched empty trip (the first-run placeholder) is reused instead of leaving a stray blank trip behind.
  const cur = activeTrip();
  const reuse = !cur.days.length && !cur.places.length && !cur.flights.length;
  const t = reuse ? Object.assign(cur, { name: name || 'My trip', note: note || '' }) : newTripObj({ name: name || 'My trip', note: note || '' });
  if (!reuse) state.trips.push(t);
  state.activeId = t.id; state.ui.day = 0;
  if (start && end) setDates(start, end);
  if (sample) fillSample(t);
  save();
  return t;
}
export function switchTrip(id) {
  if (!state.trips.some((t) => t.id === id)) return;
  state.activeId = id; state.ui.day = Math.max(0, Math.min(state.ui.day, (activeTrip().days.length || 1) - 1));
  save();
}
export function deleteTrip(id) {
  if (state.trips.length < 2) return;
  const t = state.trips.find((x) => x.id === id);
  t?.days.forEach((d) => d.stops.forEach((s) => (s.docs || []).forEach((f) => delFile(f.id))));
  delFile('bg:' + id);
  state.trips = state.trips.filter((x) => x.id !== id);
  if (state.activeId === id) { state.activeId = state.trips[0].id; state.ui.day = 0; }
  save();
}

function fillSample(t) {
  const s = sampleTrip();
  const placed = s.places.map((p) => ({ id: uid(), status: 'want', note: '', scores: {}, ratings: {}, ...p }));
  t.places = placed;
  s.plan.forEach(([day, time, pi, move, note]) => { t.days[day]?.stops.push({ id: uid(), kind: 'place', time, title: '', placeId: placed[pi].id, note, cost: '', done: false, move, alarm: '', docs: [] }); });
  t.flights = [];
}

// ---- days ----
export function setDates(start, end, defaultCity = 'tokyo') {
  const t = activeTrip();
  const n = daysBetween(start, end) + 1;
  if (n < 1 || n > MAX_DAYS) throw new Error(`Trips can be 1–${MAX_DAYS} days`);
  const old = new Map(t.days.map((d) => [d.date, d]));
  const lastCity = t.days.at(-1)?.city || defaultCity;
  t.start = start; t.end = end;
  t.days = Array.from({ length: n }, (_, i) => {
    const date = addDays(start, i);
    return old.get(date) || { date, city: lastCity, note: '', stops: [] };
  });
  // Keep stops of days that fell outside the new range by parking them on the last day.
  for (const d of old.values()) if (!t.days.some((x) => x.date === d.date) && d.stops.length) t.days.at(-1).stops.push(...d.stops);
  state.ui.day = Math.min(state.ui.day, t.days.length - 1);
  save();
}

// Open the app on today's day when the trip is under way.
export function dayIndexForToday() {
  const t = activeTrip();
  const i = t.days.findIndex((d) => d.date === todayISO());
  return i;
}

export const currentDay = () => activeTrip().days[state.ui.day] || null;
export const placeById = (id) => activeTrip().places.find((p) => p.id === id);

export function addPlace(p) {
  const t = activeTrip();
  const exists = t.places.find((x) => x.name === p.name && (x.lat == null || p.lat == null || Math.abs(x.lat - p.lat) < 1e-4));
  if (exists) return exists;
  const place = { id: uid(), cat: 'sight', status: 'want', note: '', scores: {}, ratings: {}, ...p };
  t.places.push(place);
  save();
  return place;
}

export function addStop(dayIdx, stop) {
  const day = activeTrip().days[dayIdx];
  if (!day) return null;
  const s = { id: uid(), kind: 'place', time: '', title: '', note: '', cost: '', done: false, move: '', alarm: '', docs: [], ...stop };
  day.stops.push(s);
  sortStopsByTime(day);
  save();
  return s;
}

// Stops that have a time are kept in time order; untimed stops keep the position the user gave them.
export function sortStopsByTime(day) {
  const timed = day.stops.filter((s) => s.time).sort((a, b) => a.time.localeCompare(b.time));
  let i = 0;
  day.stops = day.stops.map((s) => (s.time ? timed[i++] : s));
}

export function stopTitle(s) {
  if (s.kind === 'transit') return `${s.transit?.from || '?'} → ${s.transit?.to || '?'}`;
  return placeById(s.placeId)?.name || s.title || 'Untitled';
}

export function stopCoords(s) {
  if (s.kind === 'transit') {
    const t = s.transit || {};
    return t.toLat != null ? { lat: t.toLat, lng: t.toLng } : t.fromLat != null ? { lat: t.fromLat, lng: t.fromLng } : null;
  }
  const p = placeById(s.placeId);
  return p?.lat != null ? { lat: p.lat, lng: p.lng } : null;
}

export const allStops = (trip = activeTrip()) => trip.days.flatMap((d, di) => d.stops.map((s) => ({ s, d, di })));
