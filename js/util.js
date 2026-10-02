// Small DOM + network helpers shared by every view. No framework, no build step.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// h('div.card', {onclick}, 'text', child) -> element. Text is always inserted as text nodes (no innerHTML),
// which matters because place names come from OpenStreetMap and from the user.
export function h(tag, attrs, ...kids) {
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (classes.length) el.className = classes.join(' ');
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
    kids.unshift(attrs);
    attrs = null;
  }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className += ' ' + v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'value') el.value = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export const clear = (el) => { el.replaceChildren(); return el; };
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

// ---------- dates ----------
export const pad = (n) => String(n).padStart(2, '0');
export const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (iso, n) => { const d = parseISO(iso); d.setDate(d.getDate() + n); return isoDate(d); };
export const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 864e5);
export const fmtDate = (iso, opts = { weekday: 'short', month: 'short', day: 'numeric' }) =>
  parseISO(iso).toLocaleDateString(undefined, opts);
export const todayISO = () => isoDate(new Date());

export function timeAgo(ms) {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const hr = Math.round(m / 60);
  if (hr < 48) return `${hr} h ago`;
  return `${Math.round(hr / 24)} d ago`;
}

// ---------- geo ----------
export function distKm(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
export const fmtDist = (km) => (km < 1 ? `${Math.round(km * 1000 / 10) * 10} m` : `${km.toFixed(km < 10 ? 1 : 0)} km`);

export function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Location is not available on this device'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }),
      (e) => reject(new Error(e.code === 1 ? 'Location permission was denied' : 'Could not get your location')),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  });
}

// ---------- outbound links (all work as plain deep links; no API keys) ----------
const q = encodeURIComponent;
export const links = {
  gmapsPlace: (p) => (p.lat != null
    ? `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${q(p.name)}`),
  gmapsDir: (from, to, mode = 'transit') =>
    `https://www.google.com/maps/dir/?api=1&origin=${q(from)}&destination=${q(to)}&travelmode=${mode}`,
  gmapsRoute: (pts) => {
    const c = (p) => (p.lat != null ? `${p.lat},${p.lng}` : p.name);
    if (pts.length < 2) return links.gmapsPlace(pts[0]);
    const mid = pts.slice(1, -1).map(c).join('|');
    return `https://www.google.com/maps/dir/?api=1&origin=${q(c(pts[0]))}&destination=${q(c(pts.at(-1)))}` +
      (mid ? `&waypoints=${q(mid)}` : '') + '&travelmode=transit';
  },
  tabelog: (name) => `https://tabelog.com/en/rstLst/?sw=${q(name)}`,
  naver: (name) => `https://map.naver.com/p/search/${q(name)}`,
  kakao: (name) => `https://map.kakao.com/?q=${q(name)}`,
  kakaoDir: (from, to) => `https://map.kakao.com/?sName=${q(from)}&eName=${q(to)}`,
  googleReviews: (name, city) => `https://www.google.com/maps/search/${q(name + ' ' + (city || ''))}`,
};

// ---------- network ----------
export async function fetchJSON(url, opts = {}, timeoutMs = 20000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: ctl.signal });
    if (!res.ok) throw new Error(`${new URL(url).hostname} returned ${res.status}`);
    return await res.json();
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(`${new URL(url).hostname} took too long`);
    throw e;
  } finally {
    clearTimeout(t);
  }
}

const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
export async function overpass(query) {
  let lastErr;
  for (const base of OVERPASS) {
    try {
      const json = await fetchJSON(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + q(query),
      }, 30000);
      return json.elements || [];
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('Map data service is unavailable');
}
export const elCoords = (e) => (e.lat != null ? { lat: e.lat, lng: e.lon } : e.center ? { lat: e.center.lat, lng: e.center.lon } : null);
export function elName(t = {}) {
  return t['name:en'] || t.name || t['name:ja'] || t['name:ko'] || t.brand || '';
}
export function elLocalName(t = {}) {
  const local = t['name:ja'] || t['name:ko'] || t.name || '';
  return local !== elName(t) ? local : '';
}

export async function geocode(query, near) {
  const p = new URLSearchParams({ format: 'jsonv2', q: query, limit: '8', addressdetails: '1', 'accept-language': 'en', countrycodes: 'jp,kr' });
  if (near) p.set('viewbox', [near.lng - 0.6, near.lat + 0.5, near.lng + 0.6, near.lat - 0.5].join(','));
  const rows = await fetchJSON('https://nominatim.openstreetmap.org/search?' + p);
  return rows.map((r) => ({
    name: r.name || r.display_name.split(',')[0],
    address: r.display_name,
    lat: +r.lat, lng: +r.lon,
    country: r.address?.country_code?.toUpperCase() === 'KR' ? 'KR' : 'JP',
    kind: r.type,
  }));
}

// ---------- tiny UI kit ----------
let toastTimer;
export function toast(msg, ms = 2600) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

export function modal(title, body, actions = []) {
  const dlg = h('dialog.modal');
  const close = () => { dlg.close(); dlg.remove(); };
  dlg.append(
    h('header', h('h3', title), h('button.icon-btn', { 'aria-label': 'Close', onclick: close }, '✕')),
    h('div.modal-body', body),
    actions.length ? h('footer', actions.map((a) => h(`button.btn${a.primary ? '.primary' : ''}${a.danger ? '.danger' : ''}`, {
      onclick: async () => { if ((await a.onclick?.()) !== false) close(); },
    }, a.label))) : null,
  );
  dlg.addEventListener('cancel', () => dlg.remove());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
  document.body.append(dlg);
  dlg.showModal();
  return { close, el: dlg };
}

export const confirmBox = (msg, label = 'Delete') => new Promise((res) => {
  const m = modal('Are you sure?', h('p', msg), [
    { label: 'Cancel', onclick: () => res(false) },
    { label, danger: true, onclick: () => res(true) },
  ]);
  m.el.addEventListener('close', () => res(false), { once: true });
});

export function field(label, input, hint) {
  return h('label.field', h('span', label), input, hint ? h('small', hint) : null);
}
export const input = (attrs) => h('input', attrs);
export const select = (opts, value, attrs = {}) => {
  const s = h('select', attrs, opts.map(([v, l]) => h('option', { value: v }, l)));
  s.value = value ?? opts[0]?.[0];
  return s;
};

export function download(filename, text, type = 'application/json') {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type })), download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// Compact share links: deflate + base64url so a whole trip fits in a URL hash.
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
async function pipe(bytes, stream) {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}
export async function packShare(obj) {
  const raw = new TextEncoder().encode(JSON.stringify(obj));
  if (typeof CompressionStream === 'undefined') return 'j' + b64u(raw);
  return 'z' + b64u(await pipe(raw, new CompressionStream('deflate-raw')));
}
export async function unpackShare(s) {
  const bytes = unb64u(s.slice(1));
  const raw = s[0] === 'z' ? await pipe(bytes, new DecompressionStream('deflate-raw')) : bytes;
  return JSON.parse(new TextDecoder().decode(raw));
}

// Searchable place picker used by the itinerary and the food list.
export function placePicker({ near, onPick, placeholder = 'Search a place, station or address…' }) {
  const box = h('div.picker');
  const results = h('div.results');
  const inp = h('input', { type: 'search', placeholder, autofocus: true });
  const go = async () => {
    const term = inp.value.trim();
    if (!term) return;
    clear(results).append(h('p.muted', 'Searching…'));
    try {
      const rows = await geocode(term, near);
      clear(results);
      if (!rows.length) results.append(h('p.muted', 'No matches. Try the English or local name, or add it without a location below.'));
      rows.forEach((r) => results.append(h('button.result', { onclick: () => onPick(r) },
        h('strong', r.name), h('small', r.address))));
    } catch (e) {
      clear(results).append(h('p.warn', `Search failed (${e.message}). You can still add it by name only.`));
    }
    results.append(h('button.btn.ghost', { onclick: () => onPick({ name: term, lat: null, lng: null, address: '', country: near?.country || 'JP' }) },
      `Add “${term}” without a location`));
  };
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  box.append(h('div.row', inp, h('button.btn.primary', { onclick: go }, 'Search')), results);
  return box;
}
