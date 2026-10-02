// Plan tab: trip header, flights, document vault and the day-by-day itinerary.
import { h, clear, field, input, select, modal, confirmBox, toast, placePicker, links, fmtDate, daysBetween, todayISO, parseISO, fetchJSON, download, packShare, geocode, resizeImage, uid, pad } from './util.js';
import * as S from './store.js';
import { CITIES, CATS, KIND_STYLE, MOVES, cityOptions } from './data.js';
import { icon } from './icons.js';
import { buildICS } from './ics.js';
import { putFile, getFile } from './docs.js';
import { extraFields, openDoc } from './stopfields.js';
import { openTransitForm } from './transit.js';
import { openPlaceEditor } from './eat.js';
import { openAI } from './ai.js';

const WX = { 0: ['☀️', 'Clear'], 1: ['🌤️', 'Mostly clear'], 2: ['⛅', 'Partly cloudy'], 3: ['☁️', 'Cloudy'], 45: ['🌫️', 'Fog'], 48: ['🌫️', 'Fog'], 51: ['🌦️', 'Drizzle'], 53: ['🌦️', 'Drizzle'], 55: ['🌧️', 'Drizzle'], 61: ['🌧️', 'Rain'], 63: ['🌧️', 'Rain'], 65: ['🌧️', 'Heavy rain'], 71: ['🌨️', 'Snow'], 73: ['🌨️', 'Snow'], 75: ['❄️', 'Heavy snow'], 80: ['🌦️', 'Showers'], 81: ['🌧️', 'Showers'], 82: ['⛈️', 'Violent showers'], 95: ['⛈️', 'Thunderstorm'], 96: ['⛈️', 'Thunderstorm + hail'], 99: ['⛈️', 'Thunderstorm + hail'] };
export const wxInfo = (code) => WX[code] || WX[Math.floor(code / 10) * 10] || ['🌡️', 'Weather'];

// One forecast request per city, cached for an hour. Also used by the Safety panel.
const fcCache = new Map();
export async function forecast(cityKey) {
  const hit = fcCache.get(cityKey);
  if (hit && Date.now() - hit.at < 36e5) return hit.v;
  const c = CITIES[cityKey];
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lng}` +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_gusts_10m_max,uv_index_max&timezone=Asia%2FTokyo&forecast_days=16';
  const j = await fetchJSON(url);
  const v = j.daily.time.map((date, i) => ({
    date, code: j.daily.weather_code[i], hi: j.daily.temperature_2m_max[i], lo: j.daily.temperature_2m_min[i],
    rain: j.daily.precipitation_sum[i], pop: j.daily.precipitation_probability_max[i], gust: j.daily.wind_gusts_10m_max[i], uv: j.daily.uv_index_max[i],
  }));
  fcCache.set(cityKey, { at: Date.now(), v });
  S.cache.set('fc:' + cityKey, v);
  return v;
}

const bgUrls = new Map();
let scrollToDay = false;

export function renderPlan(root) {
  const st = S.get();
  clear(root);
  if (!st.days.length) return root.append(setupCard());

  root.append(hero(), dayBar(), flightsCard(), docsCard(), dayPanel(), savedPlaces());
  if (scrollToDay) { scrollToDay = false; root.querySelector('.day-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  root.querySelector('.chip.on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
}

// ---------- hero ----------
function dday(st) {
  const toStart = daysBetween(todayISO(), st.trip.start);
  if (toStart > 0) return [`D-${toStart}`, 'soon'];
  if (daysBetween(todayISO(), st.trip.end) >= 0) return [toStart === 0 ? 'D-DAY' : `Day ${-toStart + 1}`, 'live'];
  return ['Trip complete', 'done'];
}

function hero() {
  const st = S.get();
  const t = st.trip;
  const cities = [...new Set(st.days.map((d) => CITIES[d.city]?.name).filter(Boolean))];
  const label = `${cities.slice(0, 3).join(' · ')}${cities.length > 3 ? ` +${cities.length - 3}` : ''} · ${parseISO(t.start).getFullYear()}`;
  const nights = st.days.length - 1;
  const [badge, kind] = dday(st);
  const el = h('section.hero',
    h('div.hero-top', h('span.hero-label', label),
      h('label.icon-btn.glass', { title: 'Change cover photo', 'aria-label': 'Change cover photo' }, icon('camera', 18),
        h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async (e) => {
          const f = e.target.files[0]; if (!f) return;
          try { await putFile('bg:' + t.id, await resizeImage(f, 1100, 0.72)); bgUrls.delete(t.id); S.save(); } catch (err) { toast(err.message); }
        } }))),
    h('h2', t.name),
    h('p.hero-sub', `${fmtDate(t.start, { month: 'short', day: 'numeric', weekday: 'short' })} – ${fmtDate(t.end, { month: 'short', day: 'numeric', weekday: 'short' })} · ${nights}N ${st.days.length}D${t.note ? ` · ${t.note}` : ''}`),
    h('div.hero-foot', h('span.badge', { class: kind }, badge),
      h('div.row.wrap',
        h('button.btn.glass.sm', { onclick: editTripModal }, icon('tools', 16), 'Trip'),
        h('button.btn.glass.sm', { onclick: exportCalendar }, icon('cal', 16), 'Calendar'),
        h('button.btn.glass.sm', { onclick: shareLink }, icon('share', 16), 'Share'))));
  const apply = (url) => { el.style.backgroundImage = `linear-gradient(180deg, rgba(14,40,66,.35), rgba(14,40,66,.88)), url(${url})`; };
  if (bgUrls.has(t.id)) apply(bgUrls.get(t.id));
  else getFile('bg:' + t.id).then((b) => { if (b) { const u = URL.createObjectURL(b); bgUrls.set(t.id, u); apply(u); } });
  return el;
}

// ---------- set-up / trip editing ----------
export function tripForm(initial = {}) {
  const name = input({ type: 'text', value: initial.name || '', placeholder: 'e.g. Japan & Korea 2026' });
  const note = input({ type: 'text', value: initial.note || '', placeholder: 'e.g. 2 travellers' });
  const start = input({ type: 'date', value: initial.start || todayISO() });
  const end = input({ type: 'date', value: initial.end || todayISO() });
  const el = h('div.stack', field('Trip name', name), h('div.grid2', field('First day', start), field('Last day', end)), field('Subtitle', note),
    h('p.muted.small', `Up to ${S.MAX_DAYS} days. Changing dates keeps your stops.`));
  const read = () => {
    if (!start.value || !end.value || end.value < start.value) { toast('Pick a valid date range'); return null; }
    if (daysBetween(start.value, end.value) + 1 > S.MAX_DAYS) { toast(`Trips can be up to ${S.MAX_DAYS} days`); return null; }
    return { name: name.value.trim() || 'My trip', note: note.value.trim(), start: start.value, end: end.value };
  };
  return { el, read };
}

function setupCard() {
  const form = tripForm({ name: S.get().trip.name === 'My trip' ? '' : S.get().trip.name });
  return h('section.card.setup',
    h('div.setup-art', '🗾'),
    h('h2', 'Plan your trip'),
    h('p.muted', `Choose your dates (up to ${S.MAX_DAYS} days). Add cities, places and tickets, or let the AI build it from a reel.`),
    form.el,
    h('div.row.wrap',
      h('button.btn.primary', { onclick: () => { const v = form.read(); if (!v) return; Object.assign(S.get().trip, { name: v.name, note: v.note }); S.setDates(v.start, v.end); } }, 'Create itinerary'),
      h('button.btn', { onclick: () => { S.createTrip({ name: 'Tokyo sample trip', note: 'Sample', start: todayISO(), end: addDaysISO(todayISO(), 2) }, { sample: true }); toast('Sample trip added. Delete it from the trips list when done.'); } }, 'Try a sample trip')));
}
const addDaysISO = (iso, n) => { const d = parseISO(iso); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

function editTripModal() {
  const st = S.get();
  const form = tripForm(st.trip);
  const body = h('div.stack', form.el,
    h('button.btn', { onclick: cityPlanModal }, icon('map', 16), 'City plan (set cities for many days)'));
  modal('Trip settings', body, [{
    label: 'Save', primary: true,
    onclick: () => { const v = form.read(); if (!v) return false; Object.assign(st.trip, { name: v.name, note: v.note }); S.setDates(v.start, v.end); },
  }]);
}

// Fast way to assign cities on a long trip: "Tokyo 5 days, Kyoto 3 days, Seoul rest".
function cityPlanModal() {
  const st = S.get();
  const rows = [];
  // Seed from the current plan (consecutive runs of the same city).
  st.days.forEach((d) => { const last = rows.at(-1); if (last && last.city === d.city) last.n++; else rows.push({ city: d.city, n: 1 }); });
  const list = h('div.stack');
  const draw = () => {
    clear(list);
    rows.forEach((r, i) => list.append(h('div.row',
      select(cityOptions(), r.city, { onchange: (e) => { r.city = e.target.value; } }),
      input({ type: 'number', min: 1, max: 90, value: r.n, 'aria-label': 'Days', onchange: (e) => { r.n = Math.max(1, +e.target.value || 1); } }),
      h('span.muted.small', 'days'),
      h('button.icon-btn', { 'aria-label': 'Remove', onclick: () => { rows.splice(i, 1); draw(); } }, icon('x', 16)))));
    list.append(h('button.btn.sm', { onclick: () => { rows.push({ city: rows.at(-1)?.city || 'tokyo', n: 3 }); draw(); } }, icon('plus', 16), 'Add city'));
  };
  draw();
  modal('City plan', h('div.stack', h('p.muted', `Cities are used for weather, safety checks and where searches start. Days beyond the plan keep the last city.`), list), [{
    label: 'Apply', primary: true,
    onclick: () => { let i = 0; rows.forEach((r) => { for (let k = 0; k < r.n && i < st.days.length; k++) st.days[i++].city = r.city; }); while (i < st.days.length) st.days[i++].city = rows.at(-1)?.city || 'tokyo'; S.save(); toast('Cities updated'); },
  }]);
}

// ---------- day bar ----------
function dayBar() {
  const st = S.get();
  const today = todayISO();
  const chips = h('nav.chips', { 'aria-label': 'Days' }, st.days.map((d, i) => {
    const dt = parseISO(d.date);
    return h('button.chip.daychip', { class: `${i === st.ui.day ? 'on' : ''} ${d.date === today ? 'today' : ''}`, onclick: () => { st.ui.day = i; scrollToDay = true; S.save(); } },
      h('small', dt.toLocaleDateString(undefined, { weekday: 'short' })), h('b', dt.getDate()), h('small', CITIES[d.city]?.name || ''));
  }));
  const bar = h('div.daybar', chips, st.days.length > 10 ? h('button.btn.sm.jump', { onclick: jumpModal, 'aria-label': 'Jump to a date' }, icon('cal', 16)) : null);
  return bar;
}

function jumpModal() {
  const st = S.get();
  const months = new Map();
  st.days.forEach((d, i) => { const k = d.date.slice(0, 7); (months.get(k) || months.set(k, []).get(k)).push([d, i]); });
  const m = modal('Jump to a day', h('div.stack', [...months].map(([k, arr]) => {
    const first = parseISO(arr[0][0].date);
    const grid = h('div.calgrid', ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((x) => h('i', x)));
    const lead = (first.getDay() + 6) % 7;
    for (let i = 0; i < lead; i++) grid.append(h('span'));
    arr.forEach(([d, i]) => grid.append(h('button', { class: `${i === st.ui.day ? 'on' : ''} ${d.stops.length ? 'has' : ''}`, onclick: () => { st.ui.day = i; scrollToDay = true; m.close(); S.save(); } }, parseISO(d.date).getDate())));
    return h('div', h('h4', first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })), grid);
  })));
}

// ---------- flights ----------
function flightsCard() {
  const st = S.get();
  return h('section.card.flights',
    h('div.row.between', h('h3', icon('plane', 18), ' Flights'), h('button.btn.sm', { onclick: () => editFlight() }, icon('plus', 16), 'Add')),
    st.flights.length ? st.flights.map((f) => h('button.flight', { onclick: () => editFlight(f) },
      h('div.f-end', h('b', f.fromCode || '—'), h('small', f.fromCity), h('span', f.depTime || '')),
      h('div.f-mid', icon('plane', 18), h('small', [f.airline, f.no].filter(Boolean).join(' ')), h('small', f.depDate ? fmtDate(f.depDate) : '')),
      h('div.f-end.r', h('b', f.toCode || '—'), h('small', f.toCity), h('span', f.arrTime || '')))) : h('p.muted.small', 'Add your flights so times, codes and calendar alarms are one tap away.'));
}

export function editFlight(f) {
  const st = S.get();
  const o = f || { id: uid() };
  const F = (k, attrs = {}) => input({ type: 'text', value: o[k] || '', ...attrs });
  const refs = { airline: F('airline', { placeholder: 'Airline' }), no: F('no', { placeholder: 'KE703' }), fromCode: F('fromCode', { placeholder: 'ICN', maxlength: 4 }), fromCity: F('fromCity', { placeholder: 'Seoul' }), toCode: F('toCode', { placeholder: 'NRT', maxlength: 4 }), toCity: F('toCity', { placeholder: 'Tokyo' }), depDate: input({ type: 'date', value: o.depDate || st.trip.start }), depTime: input({ type: 'time', value: o.depTime || '' }), arrDate: input({ type: 'date', value: o.arrDate || st.trip.start }), arrTime: input({ type: 'time', value: o.arrTime || '' }), note: F('note', { placeholder: 'Booking ref, seat, terminal' }) };
  modal(f ? 'Edit flight' : 'Add flight', h('div.stack',
    h('div.grid2', field('Airline', refs.airline), field('Flight no.', refs.no)),
    h('div.grid2', field('From (code)', refs.fromCode), field('From (city)', refs.fromCity)),
    h('div.grid2', field('To (code)', refs.toCode), field('To (city)', refs.toCity)),
    h('div.grid2', field('Departs (date)', refs.depDate), field('Departs (time)', refs.depTime)),
    h('div.grid2', field('Arrives (date)', refs.arrDate), field('Arrives (time)', refs.arrTime)),
    field('Notes', refs.note)), [
    f ? { label: 'Delete', danger: true, onclick: async () => { if (!(await confirmBox('Delete this flight?'))) return false; st.flights = st.flights.filter((x) => x !== f); S.save(); } } : null,
    { label: 'Save', primary: true, onclick: () => {
      Object.entries(refs).forEach(([k, el]) => { o[k] = el.value.trim(); });
      o.fromCode = o.fromCode.toUpperCase(); o.toCode = o.toCode.toUpperCase();
      if (!f) st.flights.push(o);
      st.flights.sort((a, b) => (a.depDate + a.depTime).localeCompare(b.depDate + b.depTime));
      S.save();
    } }].filter(Boolean));
}

// ---------- documents ----------
function docsCard() {
  const docs = S.allStops().flatMap(({ s, d }) => (s.docs || []).map((f) => ({ f, s, d })));
  if (!docs.length) return h('span');
  return h('section.card', h('h3', icon('file', 18), ` Booking documents (${docs.length})`),
    h('ul.plain', docs.map(({ f, s, d }) => h('li', h('button.doc', { onclick: () => openDoc(f) },
      h('span.doc-ic', f.type?.startsWith('image/') ? '🖼️' : '📄'), h('span', h('b', f.name), h('small', `${fmtDate(d.date, { month: 'short', day: 'numeric' })} · ${S.stopTitle(s)}`)))))));
}

// ---------- day ----------
function dayPanel() {
  const st = S.get();
  const day = S.currentDay();
  const idx = st.ui.day;

  const wx = h('span.wx');
  const paint = (rows) => {
    const f = rows?.find((r) => r.date === day.date);
    if (!f) return;
    const [ic, label] = wxInfo(f.code);
    wx.textContent = `${ic} ${label} · ${Math.round(f.lo)}–${Math.round(f.hi)}°C · ☔ ${f.pop ?? '–'}%`;
    wx.title = `Rain ${f.rain} mm, gusts ${Math.round(f.gust)} km/h, UV ${f.uv}`;
  };
  paint(S.cache.get('fc:' + day.city)?.v);
  forecast(day.city).then(paint).catch(() => {});

  const citySel = select(cityOptions(), day.city, {
    'aria-label': 'City for this day',
    onchange: (e) => {
      const old = day.city; day.city = e.target.value;
      // Changing a city also moves the following days that were still on the old city (fast for long trips).
      let n = 0;
      for (let i = idx + 1; i < st.days.length && st.days[i].city === old; i++) { st.days[i].city = day.city; n++; }
      if (n) toast(`Also set the next ${n} day${n > 1 ? 's' : ''} to ${CITIES[day.city].name}`);
      S.save();
    },
  });

  const stops = day.stops;
  const total = stops.reduce((a, s) => a + (parseFloat(s.cost) || 0), 0);
  const list = stops.length
    ? h('ol.timeline', stops.map((s, i) => itemCard(s, i, stops, day, idx)))
    : h('div.empty', h('div.empty-art', '🧭'), h('p', h('b', 'Nothing planned yet')), h('p.muted', 'Add a place, a train ride or a note, or let the AI draft the day for you.'));

  return h('section.card.day-card',
    h('div.day-head',
      h('div', h('h3', `Day ${idx + 1}`, h('span.muted', ` · ${fmtDate(day.date, { weekday: 'long', month: 'long', day: 'numeric' })}`)), wx),
      citySel),
    list,
    h('div.addbar',
      h('button.btn.primary', { onclick: () => addPlaceFlow(idx) }, icon('plus', 18), 'Place'),
      h('button.btn', { onclick: () => openTransitForm({ dayIdx: idx }) }, icon('train', 18), 'Transit'),
      h('button.btn', { onclick: () => addNote(idx) }, '📝 Note'),
      h('button.btn.ai', { onclick: () => openAI({ mode: 'planday', dayIdx: idx }) }, icon('ai', 18), 'AI plan')),
    stops.length ? h('p.muted.small', `${stops.length} stops${total ? ` · planned spend ${total.toLocaleString()}` : ''}`) : null,
    field('Notes for this day', h('textarea', { rows: 2, placeholder: 'Booking refs, reminders, meeting time…', value: day.note || '', oninput: (e) => { day.note = e.target.value; S.save(false); } })));
}

function styleOf(s) {
  if (s.kind === 'transit' || s.kind === 'note') return KIND_STYLE[s.kind];
  const p = S.placeById(s.placeId);
  return CATS[p?.cat] || CATS.other;
}

function itemCard(s, i, all, day, dayIdx) {
  const p = S.placeById(s.placeId);
  const sty = styleOf(s);
  const title = S.stopTitle(s);
  const sub = s.kind === 'transit'
    ? [s.transit?.line, s.transit?.platform && `platform ${s.transit.platform}`, s.transit?.ticket].filter(Boolean).join(' · ')
    : p?.local || p?.address?.split(',').slice(0, 2).join(',') || '';
  const move = (d) => { const j = i + d; if (j < 0 || j >= all.length) return; [all[i], all[j]] = [all[j], all[i]]; S.save(); };
  const mapHref = s.kind === 'transit' ? links.gmapsDir(s.transit?.from || '', s.transit?.to || '')
    : p ? (p.mapUrl || links.gmapsPlace(p)) : null;
  const dirHref = s.kind === 'transit' ? mapHref : p ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(p.lat != null ? `${p.lat},${p.lng}` : p.name)}` : null;
  const mv = MOVES[s.move];

  const attach = h('input', { type: 'file', multiple: true, accept: 'application/pdf,image/*', hidden: true, onchange: async (e) => {
    try {
      for (const f of e.target.files) {
        if (f.size > 12 * 1024 * 1024) { toast(`${f.name} is over 12 MB`); continue; }
        const id = uid(); const blob = f.type.startsWith('image/') ? await resizeImage(f, 1600, 0.85) : f;
        await putFile(id, blob); (s.docs ||= []).push({ id, name: f.name, type: blob.type || f.type });
      }
      e.target.value = ''; S.save(); toast('Attached');
    } catch (err) { toast(err.message); }
  } });

  const act = (ic, label, props) => h(props.href ? 'a.act' : 'button.act', { target: props.href ? '_blank' : null, rel: props.href ? 'noopener' : null, ...props }, icon(ic, 16), h('span', label));

  return h('li.item', { class: s.done ? 'done' : '', dataset: { stop: s.id } },
    h('div.rail', h('span.t', s.time || ''), h('i.dot', { style: `background:${sty.color}` })),
    h('div.icard', { style: `--c:${sty.color}` },
      h('div.ihead',
        h('input.chk', { type: 'checkbox', checked: s.done ? true : null, 'aria-label': 'Done', onchange: (e) => { s.done = e.target.checked; S.save(); } }),
        h('span.tile', sty.icon),
        h('div.ititle', h('strong', title), sub ? h('small', sub) : null),
        h('div.reorder',
          h('button.icon-btn', { 'aria-label': 'Move up', disabled: i === 0 ? true : null, onclick: () => move(-1) }, '↑'),
          h('button.icon-btn', { 'aria-label': 'Move down', disabled: i === all.length - 1 ? true : null, onclick: () => move(1) }, '↓'))),
      h('div.badges',
        h('span.badge-sm', sty.label || 'Place'), mv ? h('span.badge-sm', `${mv[0]} ${mv[1]}`) : null,
        s.alarm ? h('span.badge-sm.alarm', `⏰ ${s.alarm}`) : null, s.cost ? h('span.badge-sm', `💴 ${s.cost}`) : null,
        p?.must ? h('span.badge-sm.hot', '🔥 must') : null),
      s.note ? h('p.inote', s.note) : null,
      (s.docs || []).length ? h('div.row.wrap', s.docs.map((f) => h('button.doc-chip', { onclick: () => openDoc(f) }, icon('file', 14), f.name))) : null,
      h('div.acts',
        dirHref ? act('nav', 'Directions', { href: dirHref }) : null,
        mapHref ? act('map', 'Maps', { href: mapHref }) : null,
        act('cal', 'Calendar', { onclick: () => itemCalendar(s, day) }),
        act('clip', 'Attach', { onclick: () => attach.click() }),
        act('edit', 'Edit', { onclick: () => editStop(s, day) }),
        act('trash', 'Delete', { onclick: async () => { if (await confirmBox('Remove this stop from the day?', 'Remove')) { day.stops = day.stops.filter((x) => x !== s); S.save(); toast('Deleted'); } } }),
        h('button.act', { onclick: () => document.dispatchEvent(new CustomEvent('show-on-map', { detail: { dayIdx, stopId: s.id } })) }, icon('map', 16), h('span', 'On map')),
        attach)));
}

function stopEvent(s, day) {
  const p = S.placeById(s.placeId);
  return { uid: s.id, date: day.date, time: s.time, title: s.kind === 'transit' ? `🚆 ${S.stopTitle(s)}` : S.stopTitle(s), location: p?.address || p?.name, note: s.note, alarm: s.alarm };
}
function itemCalendar(s, day) {
  if (!s.time) return toast('Give this stop a time first (Edit)');
  download(`${S.stopTitle(s).replace(/[^\w]+/g, '-')}.ics`, buildICS([stopEvent(s, day)]), 'text/calendar');
}

function editStop(s, day) {
  const st = S.get();
  const dayIdx = st.days.indexOf(day);
  if (s.kind === 'transit') return openTransitForm({ stop: s, dayIdx });
  const p = S.placeById(s.placeId);
  const time = input({ type: 'time', value: s.time });
  const title = input({ type: 'text', value: p?.name || s.title });
  const query = input({ type: 'text', value: p?.address || '', placeholder: 'Address or search words for the map' });
  const mapUrl = input({ type: 'url', value: p?.mapUrl || '', placeholder: 'Paste a Google Maps link (optional)' });
  const note = h('textarea', { rows: 3, value: s.note, placeholder: 'Memo' });
  const cost = input({ type: 'text', inputmode: 'decimal', placeholder: 'e.g. 1500', value: s.cost });
  const moveTo = select(st.days.map((d, i) => [i, `Day ${i + 1} · ${fmtDate(d.date)}`]), dayIdx);
  let cat = p?.cat || 'other';
  const catRow = h('div.chips.wrap');
  const drawCats = () => catRow.replaceChildren(...Object.entries(CATS).map(([k, c]) => h('button.chip', { type: 'button', class: cat === k ? 'on' : '', onclick: () => { cat = k; drawCats(); } }, `${c.icon} ${c.label}`)));
  drawCats();
  const extra = extraFields(s);
  modal('Edit stop', h('div.stack',
    s.kind === 'place' ? h('div.field', h('span', 'Category'), catRow) : null,
    field('Name', title),
    s.kind === 'place' ? [field('Map search / address', query), field('Google Maps link', mapUrl)] : null,
    h('div.grid2', field('Time', time), field('Day', moveTo)),
    extra.el, field('Cost (any currency)', cost), field('Memo', note)), [
    { label: 'Delete', danger: true, onclick: async () => {
      if (!(await confirmBox('Remove this stop from the day?', 'Remove'))) return false;
      day.stops = day.stops.filter((x) => x !== s); S.save();
    } },
    { label: 'Save', primary: true, onclick: async () => {
      try { await extra.apply(s); } catch (e) { toast(e.message); return false; }
      Object.assign(s, { time: time.value, note: note.value.trim(), cost: cost.value.trim() });
      if (p) {
        Object.assign(p, { name: title.value.trim() || p.name, cat, address: query.value.trim(), mapUrl: mapUrl.value.trim() });
        // Quietly look up coordinates so the stop appears on the map (as long as the name is searchable).
        if (p.lat == null) geocode(p.address || p.name, S.get() && CITIES[day.city]).then((r) => { if (r[0]) { p.lat = r[0].lat; p.lng = r[0].lng; S.save(); } }).catch(() => {});
      } else s.title = title.value.trim();
      const target = st.days[+moveTo.value];
      if (target !== day) { day.stops = day.stops.filter((x) => x !== s); target.stops.push(s); S.sortStopsByTime(target); } else S.sortStopsByTime(day);
      S.save(); toast('Saved');
    } }]);
}

export function addNote(dayIdx) {
  const text = h('textarea', { rows: 3, placeholder: 'Reminder, booking number, idea…' });
  const time = input({ type: 'time' });
  modal('Add note', h('div.stack', field('Time (optional)', time), field('Note', text)), [{
    label: 'Add', primary: true,
    onclick: () => { if (!text.value.trim()) return false; S.addStop(dayIdx, { kind: 'note', title: text.value.trim().slice(0, 60), note: text.value.trim(), time: time.value }); },
  }]);
}

export function addPlaceFlow(dayIdx) {
  const st = S.get();
  const day = st.days[dayIdx];
  const city = CITIES[day.city];
  const saved = st.places.filter((p) => !day.stops.some((s) => s.placeId === p.id));
  const m = modal('Add a place', h('div.stack',
    saved.length ? h('div',
      h('h4', 'From your saved places'),
      h('div.results', saved.slice(0, 40).map((p) => h('button.result', {
        onclick: () => { S.addStop(dayIdx, { kind: 'place', placeId: p.id }); m.close(); toast('Added to Day ' + (dayIdx + 1)); },
      }, h('strong', `${CATS[p.cat]?.icon || '📍'} ${p.name}`), h('small', p.address || p.local || ''))))) : null,
    h('h4', 'Search anywhere'),
    placePicker({
      near: { lat: city.lat, lng: city.lng, country: city.country },
      onPick: (r) => {
        const place = S.addPlace({ name: r.name, address: r.address, lat: r.lat, lng: r.lng, country: r.country, city: day.city });
        S.addStop(dayIdx, { kind: 'place', placeId: place.id });
        m.close(); toast('Added to Day ' + (dayIdx + 1));
      },
    })));
}

// ---------- saved places (wishlist) ----------
function savedPlaces() {
  const st = S.get();
  const filter = sessionStorage.getItem('placeFilter') || 'all';
  const cats = [['all', 'All'], ...Object.entries(CATS).map(([k, c]) => [k, c.icon + ' ' + c.label])];
  const rows = st.places.filter((p) => filter === 'all' || p.cat === filter);
  return h('section.card',
    h('div.row.between', h('h3', `Saved places (${st.places.length})`),
      h('button.btn.sm', { onclick: modalPickToSave }, icon('plus', 16), 'Save')),
    h('div.chips.small', cats.map(([k, l]) => h('button.chip', { class: filter === k ? 'on' : '', onclick: () => { sessionStorage.setItem('placeFilter', k); S.save(); } }, l))),
    rows.length ? h('ul.plain', rows.map((p) => h('li.saved',
      h('span.tile.sm', { style: `--c:${(CATS[p.cat] || CATS.other).color}` }, (CATS[p.cat] || CATS.other).icon),
      h('div', h('strong', p.name), h('small', p.local || p.address?.split(',').slice(0, 2).join(',') || '')),
      h('div.row',
        h('select', {
          'aria-label': 'Add to day', onchange: (e) => {
            if (e.target.value === '') return;
            S.addStop(+e.target.value, { kind: 'place', placeId: p.id });
            toast(`Added to Day ${+e.target.value + 1}`);
          },
        }, h('option', { value: '' }, '＋ day'), st.days.map((d, i) => h('option', { value: i }, `Day ${i + 1}`))),
        h('button.icon-btn', { 'aria-label': 'Edit place', onclick: () => openPlaceEditor(p) }, icon('edit', 16)))))) :
      h('p.muted', 'Save places you want to visit, then drop them into any day. Spots from the map, the Eat tab and the AI import land here too.'));
}

function modalPickToSave() {
  const city = CITIES[S.currentDay()?.city || 'tokyo'];
  const m = modal('Save a place', placePicker({
    near: { lat: city.lat, lng: city.lng, country: city.country },
    onPick: (r) => { S.addPlace({ name: r.name, address: r.address, lat: r.lat, lng: r.lng, country: r.country, city: S.currentDay()?.city }); m.close(); toast('Saved'); },
  }));
}

// ---------- sharing & calendar ----------
async function shareLink() {
  const st = S.get();
  const days = st.days.map((d) => ({ ...d, stops: d.stops.map((s) => ({ ...s, docs: [] })) })); // files stay on your phone
  const payload = { v: 2, trip: { name: st.trip.name, note: st.trip.note, start: st.trip.start, end: st.trip.end }, days, places: st.places, flights: st.flights, packing: st.packing };
  const code = await packShare(payload);
  const url = `${location.origin}${location.pathname}#share=${code}`;
  const box = h('textarea', { rows: 4, readonly: true, onfocus: (e) => e.target.select() }, url);
  modal('Share with your travel buddy', h('div.stack',
    h('p', 'Opening this link adds a copy of this trip (itinerary, saved places, food ratings, flights) to their app. Attachments, expenses and emergency details are not included.'),
    box, h('p.muted.small', `Link size: ${(url.length / 1024).toFixed(1)} KB. If it’s too long for a chat app, use Tools → Backup.`)), [
    { label: 'Copy link', primary: true, onclick: async () => { try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch { box.select(); document.execCommand('copy'); toast('Link copied'); } return false; } },
    navigator.share ? { label: 'Share…', onclick: () => navigator.share({ title: st.trip.name, url }).catch(() => {}) } : { label: 'Close' },
  ]);
}

function exportCalendar() {
  const st = S.get();
  const ev = [];
  st.days.forEach((d) => d.stops.forEach((s) => { if (s.time) ev.push(stopEvent(s, d)); }));
  st.flights.forEach((f) => {
    if (f.depDate && f.depTime) ev.push({ uid: f.id, date: f.depDate, time: f.depTime, title: `✈️ ${f.fromCode} → ${f.toCode} ${f.no || ''}`, location: f.fromCity, note: f.note, minutes: 120 });
  });
  if (!ev.length) return toast('Give some stops a time first');
  download(`${st.trip.name.replace(/[^\w]+/g, '-')}.ics`, buildICS(ev), 'text/calendar');
}
