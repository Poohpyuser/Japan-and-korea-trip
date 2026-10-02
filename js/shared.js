// Things several tabs need: the "search around…" picker and in-memory layers drawn on the Map tab.
import { h, select, getPosition, toast } from './util.js';
import { CITIES, cityOptions } from './data.js';
import * as S from './store.js';

export const layers = { wifi: [], safety: [], quakes: [] };

// Remembers the chosen centre across tabs for the session. 'me' = device location.
let chosen = null;
let myPos = null;

export function centerPicker(onChange) {
  const today = S.currentDay();
  const dflt = chosen || today?.city || 'tokyo';
  const opts = [['me', '📍 My location'], ...cityOptions()];
  const sel = select(opts, dflt, {
    'aria-label': 'Search around',
    onchange: async () => { chosen = sel.value; if (chosen === 'me') await locate(); onChange?.(); },
  });
  return { el: h('label.inline', h('span', 'Around'), sel), get value() { return sel.value; } };
}

async function locate() {
  try { myPos = await getPosition(); } catch (e) { toast(e.message); chosen = null; }
}

export async function resolveCenter(key) {
  if (key === 'me') {
    if (!myPos) await locate();
    if (myPos) return { ...myPos, label: 'your location', country: guessCountry(myPos), me: true };
    key = S.currentDay()?.city || 'tokyo';
  }
  const c = CITIES[key];
  return { lat: c.lat, lng: c.lng, label: c.name, country: c.country };
}

export const lastKnownPosition = () => myPos;
export const setMyPosition = (p) => { myPos = p; };

// Rough bounding box for the Korean peninsula's south; good enough to pick KR vs JP tools.
export function guessCountry(p) {
  return p.lng < 129.65 && p.lat > 33 && p.lat < 38.7 && p.lng > 125 ? 'KR' : 'JP';
}
