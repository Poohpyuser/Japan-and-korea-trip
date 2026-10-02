// Eat tab: find restaurants nearby (OpenStreetMap) and keep a Tabelog-style personal food list.
//
// Why not pull live Tabelog scores? Tabelog has no public API, its terms forbid scraping, and browsers block
// cross-site reads. So each card deep-links to a pre-filled Tabelog / Google / Naver / Kakao search, and you
// type the score you saw into the card. Your own ratings (you + your sister) are tracked on top.
import { h, clear, field, input, select, modal, confirmBox, toast, overpass, elCoords, elName, elLocalName, distKm, fmtDist, links } from './util.js';
import * as S from './store.js';
import { CATS, CITIES } from './data.js';
import { centerPicker, resolveCenter, layers, bump } from './shared.js';
import { placePicker } from './util.js';

const KINDS = {
  all: ['Everything', '["amenity"~"^(restaurant|cafe|fast_food|bar|pub)$"]'],
  ramen: ['🍜 Ramen / noodles', '["amenity"~"^(restaurant|fast_food)$"]["cuisine"~"ramen|noodle|udon|soba"]'],
  sushi: ['🍣 Sushi / seafood', '["amenity"~"^(restaurant|fast_food)$"]["cuisine"~"sushi|seafood|sashimi"]'],
  bbq: ['🥩 BBQ / yakiniku', '["amenity"="restaurant"]["cuisine"~"korean|barbecue|bbq|yakiniku|grill"]'],
  izakaya: ['🍶 Izakaya / bars', '["amenity"~"^(bar|pub)$"]'],
  cafe: ['☕ Cafés', '["amenity"="cafe"]'],
  chicken: ['🍗 Fried chicken', '["amenity"~"^(restaurant|fast_food)$"]["cuisine"~"chicken|fried_chicken"]'],
};

let tab = sessionStorage.getItem('eatTab') || 'list';
let kind = 'all';
let radius = 800;
let results = null;

export function renderEat(root) {
  clear(root);
  root.append(
    h('div.seg', [['list', `❤️ My food list (${S.get().places.filter((p) => p.cat === 'food' || p.cat === 'cafe').length})`], ['find', '🔎 Find nearby']].map(([k, l]) =>
      h('button', { class: tab === k ? 'on' : '', onclick: () => { tab = k; sessionStorage.setItem('eatTab', k); S.save(); } }, l))),
    tab === 'find' ? finderPanel() : foodList(),
  );
}

// ---------- finder ----------
export function finderPanel() {
  const out = h('div.stack');
  const cp = centerPicker();
  const kindSel = select(Object.entries(KINDS).map(([k, v]) => [k, v[0]]), kind, { onchange: (e) => { kind = e.target.value; } });
  const rad = select([[400, '400 m'], [800, '800 m'], [1500, '1.5 km'], [3000, '3 km']], radius, { onchange: (e) => { radius = +e.target.value; } });
  const paint = (c) => {
    clear(out);
    out.append(h('p.muted', `${results.length} places within ${fmtDist(radius / 1000)} of ${c.label}. Open one of the review links to see ratings, then save it.`));
    results.slice(0, 60).forEach((r) => out.append(resultCard(r)));
    if (!results.length) out.append(h('p', 'No named places found. Try a bigger radius or another category.'));
  };
  const go = async () => {
    clear(out).append(h('p.muted', 'Looking for good places to eat…'));
    try {
      const c = await resolveCenter(cp.value);
      const els = await overpass(`[out:json][timeout:25];nwr${KINDS[kind][1]}["name"](around:${radius},${c.lat},${c.lng});out center 150;`);
      results = els.map((e) => ({ e, p: elCoords(e) })).filter((x) => x.p).map(({ e, p }) => {
        const t = e.tags;
        return { id: e.type + e.id, name: elName(t), local: elLocalName(t), cuisine: (t.cuisine || '').replace(/;/g, ', ').replace(/_/g, ' '), hours: t.opening_hours, lat: p.lat, lng: p.lng, km: distKm(c, p), country: c.country, amenity: t.amenity, phone: t.phone || t['contact:phone'], web: t.website, city: cp.value };
      }).sort((a, b) => a.km - b.km);
      layers.food = results.slice(0, 60).map((r) => ({ lat: r.lat, lng: r.lng, name: r.name, local: r.local, cuisine: r.cuisine }));
      bump();
      paint(c);
    } catch (e) {
      clear(out).append(h('p.warn', `Couldn’t load places (${e.message}). Check your connection, or search by name below.`));
    }
  };
  const named = h('div.card',
    h('h4', 'Know the name already?'),
    placePicker({
      placeholder: 'Restaurant name (English or local)',
      near: { lat: CITIES[S.currentDay()?.city || 'tokyo'].lat, lng: CITIES[S.currentDay()?.city || 'tokyo'].lng },
      onPick: (r) => { const p = S.addPlace({ name: r.name, address: r.address, lat: r.lat, lng: r.lng, country: r.country, cat: 'food', city: S.currentDay()?.city }); tab = 'list'; sessionStorage.setItem('eatTab', 'list'); S.save(); openPlaceEditor(p); },
    }));
  return h('div.stack',
    h('section.card',
      h('div.row.wrap', cp.el, field('Type', kindSel), field('Radius', rad), h('button.btn.primary', { onclick: go }, 'Find')),
      h('p.muted.small', 'Results come from OpenStreetMap. Smaller local gems may be missing; that’s where the Tabelog / Naver buttons help.')),
    out, named);
}

function reviewLinks(p, country, city) {
  const cityName = CITIES[city]?.name || '';
  return h('div.row.wrap.links',
    country === 'JP' ? h('a.btn.sm', { href: links.tabelog(p.name), target: '_blank', rel: 'noopener' }, 'Tabelog') : null,
    country === 'KR' ? h('a.btn.sm', { href: links.naver(p.name), target: '_blank', rel: 'noopener' }, 'Naver') : null,
    country === 'KR' ? h('a.btn.sm', { href: links.kakao(p.name), target: '_blank', rel: 'noopener' }, 'Kakao') : null,
    h('a.btn.sm', { href: links.googleReviews(p.name, cityName), target: '_blank', rel: 'noopener' }, 'Google'),
    p.lat != null ? h('a.btn.sm', { href: links.gmapsPlace(p), target: '_blank', rel: 'noopener' }, '↗ Map') : null);
}

function resultCard(r) {
  const saved = S.get().places.some((p) => p.name === r.name && Math.abs((p.lat ?? 0) - r.lat) < 1e-4);
  const btn = h('button.btn.sm.primary', {
    onclick: () => {
      S.addPlace({ name: r.name, local: r.local, lat: r.lat, lng: r.lng, country: r.country, city: r.city, cat: r.amenity === 'cafe' ? 'cafe' : 'food', note: r.cuisine ? r.cuisine : '', address: '' });
      btn.textContent = '✓ Saved'; btn.disabled = true; toast('Saved to your food list');
    },
  }, saved ? '✓ Saved' : '＋ Save');
  if (saved) btn.disabled = true;
  return h('article.card.place',
    h('div.row.between', h('div', h('strong', r.name), r.local ? h('small', r.local) : null), h('span.pill', fmtDist(r.km))),
    h('small.muted', [r.cuisine || r.amenity, r.hours && `🕒 ${r.hours}`].filter(Boolean).join(' · ')),
    reviewLinks(r, r.country, r.city),
    h('div.row', btn));
}

// ---------- personal list ----------
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
export function placeScore(p) {
  const mine = Object.values(p.ratings || {}).map((r) => +r.score).filter((n) => n > 0);
  return avg(mine);
}
const scoreClass = (s) => (s >= 4 ? 'gold' : s >= 3.5 ? 'green' : s >= 3 ? 'blue' : 'grey');

function foodList() {
  const st = S.get();
  const rows = st.places.filter((p) => p.cat === 'food' || p.cat === 'cafe');
  const sort = sessionStorage.getItem('foodSort') || 'score';
  rows.sort((a, b) => sort === 'score' ? (placeScore(b) ?? -1) - (placeScore(a) ?? -1) : a.name.localeCompare(b.name));
  const wrap = h('div.stack',
    h('div.row.between',
      h('p.muted.small', 'Rate places like Tabelog (1.0–5.0). Both travellers’ scores are averaged. Tabelog 3.5+ is already excellent; 4.0+ is rare.'),
      select([['score', 'Best first'], ['name', 'A–Z']], sort, { onchange: (e) => { sessionStorage.setItem('foodSort', e.target.value); S.save(); } })));
  if (!rows.length) wrap.append(h('div.empty', h('p', '🍱 No food spots yet.'), h('button.btn.primary', { onclick: () => { tab = 'find'; sessionStorage.setItem('eatTab', 'find'); S.save(); } }, 'Find places to eat')));
  rows.forEach((p) => wrap.append(foodCard(p)));
  return wrap;
}

function foodCard(p) {
  const s = placeScore(p);
  const refs = Object.entries(p.scores || {}).filter(([, v]) => v);
  return h('article.card.place',
    h('div.row.between',
      h('div', h('strong', p.name), p.local ? h('small', p.local) : null),
      s != null ? h('span.score', { class: scoreClass(s) }, s.toFixed(2)) : h('span.pill', p.status === 'been' ? 'been' : 'want to try')),
    h('div.row.wrap',
      refs.map(([k, v]) => h('span.pill', `${k[0].toUpperCase() + k.slice(1)} ${v}`)),
      p.status === 'been' ? h('span.pill.ok', '✓ been') : null,
      p.must ? h('span.pill.hot', '🔥 must go') : null),
    ratingsRow(p),
    p.note ? h('small.note', p.note) : null,
    reviewLinks(p, p.country, p.city),
    h('div.row', h('button.btn.sm', { onclick: () => openPlaceEditor(p) }, '✎ Rate / edit')));
}

function ratingsRow(p) {
  const rs = Object.entries(p.ratings || {}).filter(([, r]) => +r.score > 0);
  if (!rs.length) return null;
  return h('ul.plain.small', rs.map(([who, r]) => h('li', h('b', `${who}: ${(+r.score).toFixed(1)}`), r.comment ? ` — ${r.comment}` : '')));
}

// Edit sheet for any saved place; for food it carries the rating form.
export function openPlaceEditor(p) {
  const st = S.get();
  const names = st.settings.names.filter(Boolean);
  const name = input({ type: 'text', value: p.name });
  const cat = select(Object.entries(CATS).map(([k, c]) => [k, `${c.icon} ${c.label}`]), p.cat);
  const status = select([['want', 'Want to try'], ['been', 'Been there']], p.status || 'want');
  const must = h('input', { type: 'checkbox', checked: p.must ? true : null });
  const note = h('textarea', { rows: 2, value: p.note || '', placeholder: 'What to order, reservation info, queue tips…' });
  const refs = ['tabelog', 'google', 'naver'].map((k) => [k, input({ type: 'number', min: 0, max: 5, step: 0.01, inputmode: 'decimal', value: p.scores?.[k] || '', placeholder: k === 'tabelog' ? '3.58' : '4.3' })]);
  const rates = names.map((n) => {
    const r = p.ratings?.[n] || {};
    return [n, input({ type: 'number', min: 1, max: 5, step: 0.1, inputmode: 'decimal', value: r.score || '', placeholder: '–' }), input({ type: 'text', value: r.comment || '', placeholder: 'One-line verdict' })];
  });
  const body = h('div.stack',
    field('Name', name),
    h('div.grid2', field('Type', cat), field('Status', status)),
    h('label.row', must, h('span', '🔥 Must-go')),
    h('h4', 'Ratings from other sites'),
    h('div.grid3', refs.map(([k, el]) => field(k[0].toUpperCase() + k.slice(1), el))),
    h('h4', 'Our scores (1–5)'),
    rates.map(([n, sc, cm]) => h('div.grid2.align-end', field(n, sc), field('Comment', cm))),
    field('Notes', note));
  modal('Place details', body, [
    { label: 'Delete', danger: true, onclick: async () => {
      if (!(await confirmBox(`Delete “${p.name}” and remove it from every day?`))) return false;
      st.places = st.places.filter((x) => x.id !== p.id);
      st.days.forEach((d) => { d.stops = d.stops.filter((s) => s.placeId !== p.id); });
      S.save();
    } },
    { label: 'Save', primary: true, onclick: () => {
      Object.assign(p, { name: name.value.trim() || p.name, cat: cat.value, status: status.value, must: must.checked, note: note.value.trim() });
      p.scores = {}; refs.forEach(([k, el]) => { if (el.value) p.scores[k] = +el.value; });
      p.ratings = {};
      rates.forEach(([n, sc, cm]) => { if (sc.value || cm.value.trim()) p.ratings[n] = { score: Math.min(5, Math.max(1, +sc.value || 0)) || '', comment: cm.value.trim() }; });
      if (Object.values(p.ratings).some((r) => r.score)) p.status = 'been';
      S.save();
    } }]);
}
