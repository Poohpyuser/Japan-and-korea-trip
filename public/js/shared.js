// Things several panels need: the "search around…" picker and in-memory layers drawn on the Map.
import { h, select, getPosition, toast } from './util.js';
import { CITIES, cityOptions } from './data.js';
import * as S from './store.js';

export const layers = { wifi: [], safety: [], quakes: [], food: [] };
export const bump = () => document.dispatchEvent(new Event('layers-changed'));

// 'pin' = a spot tapped on the map, 'map' = whatever the map is currently showing, 'me' = device location.
let chosen = null;
let myPos = null;
let pin = null;
let mapCenter = null;

export const registerMapCenter = (fn) => { mapCenter = fn; };
export function setPin(p) { pin = p; chosen = 'pin'; }
export const getPin = () => pin;
export const lastKnownPosition = () => myPos;
export const setMyPosition = (p) => { myPos = p; };

export function centerPicker(onChange) {
  const today = S.currentDay();
  const opts = [
    ...(pin ? [['pin', '📌 Dropped pin']] : []),
    ...(mapCenter ? [['map', '🗺 Map view']] : []),
    ['me', '📍 My location'], ...cityOptions(),
  ];
  const dflt = chosen && opts.some(([k]) => k === chosen) ? chosen : pin ? 'pin' : mapCenter ? 'map' : today?.city || 'tokyo';
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
  if (key === 'pin' && pin) return { ...pin, label: pin.label || 'dropped pin', country: guessCountry(pin) };
  if (key === 'map' && mapCenter) { const c = mapCenter(); return { ...c, label: 'map view', country: guessCountry(c) }; }
  if (key === 'me') {
    if (!myPos) await locate();
    if (myPos) return { ...myPos, label: 'your location', country: guessCountry(myPos), me: true };
    key = S.currentDay()?.city || 'tokyo';
  }
  const c = CITIES[key] || CITIES.tokyo;
  return { lat: c.lat, lng: c.lng, label: c.name, country: c.country };
}

// Rough bounding box for South Korea; good enough to pick KR vs JP tools.
export function guessCountry(p) {
  return p.lng < 129.65 && p.lat > 33 && p.lat < 38.7 && p.lng > 125 ? 'KR' : 'JP';
}
