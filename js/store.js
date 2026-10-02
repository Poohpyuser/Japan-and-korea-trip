// Single source of truth. Everything lives in localStorage on the device, so the app works offline
// and there is no account or server to run. Sharing between devices is done with share links / backups.
import { uid, addDays, daysBetween } from './util.js';
import { DEFAULT_PACKING } from './data.js';

const KEY = 'trip-planner-v1';
const listeners = new Set();

const defaults = () => ({
  v: 1,
  trip: { name: 'Japan & Korea trip', start: '', end: '' },
  days: [], // { date, city, note, stops: [{id, kind, time, title, placeId, note, cost, done, transit}] }
  places: [], // { id, name, local, cat, lat, lng, address, country, city, note, status, scores, ratings }
  expenses: [],
  packing: DEFAULT_PACKING.map((text) => ({ id: uid(), text, done: false })),
  settings: {
    names: ['Me', 'Sister'], who: 'Me', homeCurrency: 'USD',
    hotels: {}, // city key -> { name, address, local }
    emergency: { name: '', blood: '', allergies: '', meds: '', contact: '', embassy: '' },
  },
  ui: { day: 0, tab: 'plan' },
});

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw && raw.v === 1) return { ...defaults(), ...raw, settings: { ...defaults().settings, ...raw.settings } };
  } catch { /* corrupt or blocked storage: fall through to defaults */ }
  return defaults();
}

let state = load();
export const get = () => state;
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

let saveTimer;
export function save(notify = true) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage full or disabled */ }
  }, 150);
  if (notify) listeners.forEach((fn) => fn(state));
}
window.addEventListener('pagehide', () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ } });

export function replaceState(next) {
  state = { ...defaults(), ...next, settings: { ...defaults().settings, ...next.settings } };
  save();
}

// Cache for API results so the app stays useful with no signal.
export const cache = {
  get(k) { try { return JSON.parse(localStorage.getItem('cache:' + k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem('cache:' + k, JSON.stringify({ at: Date.now(), v })); } catch { /* ignore */ } },
};

// ---- trip / day helpers ----
export function setDates(start, end, defaultCity = 'tokyo') {
  const n = daysBetween(start, end) + 1;
  const old = new Map(state.days.map((d) => [d.date, d]));
  state.trip.start = start; state.trip.end = end;
  state.days = Array.from({ length: n }, (_, i) => {
    const date = addDays(start, i);
    return old.get(date) || { date, city: state.days.at(-1)?.city || defaultCity, note: '', stops: [] };
  });
  // Keep stops of days that fell outside the new range by parking them on the last day.
  for (const d of old.values()) if (!state.days.some((x) => x.date === d.date) && d.stops.length) state.days.at(-1).stops.push(...d.stops);
  state.ui.day = Math.min(state.ui.day, state.days.length - 1);
  save();
}

export const currentDay = () => state.days[state.ui.day] || null;
export const placeById = (id) => state.places.find((p) => p.id === id);

export function addPlace(p) {
  const exists = state.places.find((x) => x.name === p.name && (x.lat == null || Math.abs(x.lat - p.lat) < 1e-4));
  if (exists) return exists;
  const place = { id: uid(), cat: 'sight', status: 'want', note: '', scores: {}, ratings: {}, ...p };
  state.places.push(place);
  save();
  return place;
}

export function addStop(dayIdx, stop) {
  const day = state.days[dayIdx];
  if (!day) return null;
  const s = { id: uid(), kind: 'place', time: '', title: '', note: '', cost: '', done: false, ...stop };
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
