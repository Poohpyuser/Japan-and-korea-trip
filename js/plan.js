// Plan tab: the day-by-day itinerary (the Wanderlog / Plotline part).
import { h, clear, field, input, select, modal, confirmBox, toast, placePicker, links, fmtDate, daysBetween, todayISO, distKm, fmtDist, fetchJSON, download, packShare, pad, parseISO } from './util.js';
import * as S from './store.js';
import { CITIES, CATS, cityOptions } from './data.js';
import { openTransitForm } from './transit.js';
import { openPlaceEditor } from './eat.js';

const WX = { 0: ['☀️', 'Clear'], 1: ['🌤️', 'Mostly clear'], 2: ['⛅', 'Partly cloudy'], 3: ['☁️', 'Cloudy'], 45: ['🌫️', 'Fog'], 48: ['🌫️', 'Fog'], 51: ['🌦️', 'Drizzle'], 53: ['🌦️', 'Drizzle'], 55: ['🌧️', 'Drizzle'], 61: ['🌧️', 'Rain'], 63: ['🌧️', 'Rain'], 65: ['🌧️', 'Heavy rain'], 71: ['🌨️', 'Snow'], 73: ['🌨️', 'Snow'], 75: ['❄️', 'Heavy snow'], 80: ['🌦️', 'Showers'], 81: ['🌧️', 'Showers'], 82: ['⛈️', 'Violent showers'], 95: ['⛈️', 'Thunderstorm'], 96: ['⛈️', 'Thunderstorm + hail'], 99: ['⛈️', 'Thunderstorm + hail'] };
export const wxInfo = (code) => WX[code] || WX[Math.floor(code / 10) * 10] || ['🌡️', 'Weather'];

// One forecast request per city, cached for an hour. Also used by the Safety tab.
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

export function renderPlan(root) {
  const st = S.get();
  clear(root);

  if (!st.days.length) return root.append(setupCard());

  const countdown = (() => {
    const n = daysBetween(todayISO(), st.trip.start);
    if (n > 0) return `${n} day${n === 1 ? '' : 's'} to go ✈️`;
    if (n <= 0 && daysBetween(todayISO(), st.trip.end) >= 0) return `Day ${-n + 1} of ${st.days.length} — enjoy! 🎉`;
    return 'Trip complete — welcome home 🏡';
  })();

  root.append(
    h('section.hero',
      h('div',
        h('h2', st.trip.name),
        h('p.muted', `${fmtDate(st.trip.start)} → ${fmtDate(st.trip.end)} · ${st.days.length} days · ${countdown}`)),
      h('div.row.wrap',
        h('button.btn', { onclick: editTripModal }, '⚙️ Trip'),
        h('button.btn', { onclick: exportCalendar }, '📅 Calendar (.ics)'),
        h('button.btn', { onclick: shareLink }, '🔗 Share'))),
    dayChips(),
    dayPanel(),
    savedPlaces(),
  );
  const first = root.querySelector('.chip.on');
  first?.scrollIntoView({ inline: 'center', block: 'nearest' });
}

// ---------- set-up ----------
function setupCard() {
  const start = input({ type: 'date', value: todayISO() });
  const end = input({ type: 'date', value: todayISO() });
  const name = input({ type: 'text', value: S.get().trip.name });
  return h('section.card.setup',
    h('h2', 'Let’s plan your trip 🌸'),
    h('p', 'Pick your dates and add a city to each day. Everything is saved on this device and works offline.'),
    field('Trip name', name),
    h('div.grid2', field('First day', start), field('Last day', end)),
    h('button.btn.primary', {
      onclick: () => {
        if (!start.value || !end.value || end.value < start.value) return toast('Pick a valid date range');
        if (daysBetween(start.value, end.value) > 60) return toast('Trips over 60 days are not supported');
        S.get().trip.name = name.value.trim() || 'My trip';
        S.setDates(start.value, end.value);
      },
    }, 'Create itinerary'));
}

function editTripModal() {
  const st = S.get();
  const name = input({ type: 'text', value: st.trip.name });
  const start = input({ type: 'date', value: st.trip.start });
  const end = input({ type: 'date', value: st.trip.end });
  modal('Trip settings', h('div.stack',
    field('Name', name),
    h('div.grid2', field('First day', start), field('Last day', end)),
    h('p.muted', 'Changing dates keeps your stops. If you shorten the trip, stops from removed days are moved to the last day.'),
  ), [{
    label: 'Save', primary: true,
    onclick: () => {
      if (!start.value || !end.value || end.value < start.value) { toast('Pick a valid date range'); return false; }
      if (daysBetween(start.value, end.value) > 60) { toast('Trips over 60 days are not supported'); return false; }
      st.trip.name = name.value.trim() || 'My trip';
      S.setDates(start.value, end.value);
    },
  }]);
}

// ---------- days ----------
function dayChips() {
  const st = S.get();
  return h('nav.chips', { 'aria-label': 'Days' }, st.days.map((d, i) => h('button.chip', {
    class: i === st.ui.day ? 'on' : '',
    onclick: () => { st.ui.day = i; S.save(); },
  }, h('b', `Day ${i + 1}`), h('small', `${fmtDate(d.date, { month: 'short', day: 'numeric' })} · ${CITIES[d.city]?.name || ''}`))));
}

function dayPanel() {
  const st = S.get();
  const day = S.currentDay();
  const idx = st.ui.day;
  const city = CITIES[day.city] || CITIES.tokyo;

  const wx = h('span.wx', '');
  const cached = S.cache.get('fc:' + day.city);
  const paint = (rows) => {
    const f = rows?.find((r) => r.date === day.date);
    if (!f) return;
    const [icon, label] = wxInfo(f.code);
    wx.textContent = `${icon} ${label} · ${Math.round(f.lo)}–${Math.round(f.hi)}°C · ☔ ${f.pop ?? '–'}%`;
    wx.title = `Rain ${f.rain} mm, gusts ${Math.round(f.gust)} km/h, UV ${f.uv}`;
  };
  paint(cached?.v);
  forecast(day.city).then(paint).catch(() => {});

  const citySel = select(cityOptions(), day.city, {
    'aria-label': 'City for this day',
    onchange: (e) => { day.city = e.target.value; S.save(); },
  });

  const stops = day.stops;
  const withCoords = stops.map((s) => stopPoint(s)).filter(Boolean);
  let km = 0;
  withCoords.forEach((p, i) => { if (i) km += distKm(withCoords[i - 1], p); });
  const total = stops.reduce((a, s) => a + (+s.cost || 0), 0);

  const list = stops.length
    ? h('ol.stops', stops.map((s, i) => stopCard(s, i, stops, day)))
    : h('div.empty', h('p', '🧭 Nothing planned yet.'), h('p.muted', 'Add a place, a train ride or a note. Time-stamped stops sort themselves.'));

  return h('section.card',
    h('div.day-head',
      h('div', h('h3', `Day ${idx + 1} · ${fmtDate(day.date, { weekday: 'long', month: 'long', day: 'numeric' })}`), wx),
      citySel),
    list,
    h('div.row.wrap.actions',
      h('button.btn.primary', { onclick: () => addPlaceFlow(idx) }, '＋ Place'),
      h('button.btn', { onclick: () => openTransitForm({ dayIdx: idx }) }, '🚆 Train / transit'),
      h('button.btn', { onclick: () => addNote(idx) }, '📝 Note'),
      withCoords.length ? h('a.btn', { href: links.gmapsRoute(withCoords), target: '_blank', rel: 'noopener' }, '↗ Day route in Google Maps') : null),
    stops.length ? h('p.muted.small', `${stops.length} stops · ${km ? `~${fmtDist(km)} between stops (straight line) · ` : ''}${total ? `planned spend ${total.toLocaleString()}` : 'no costs entered'}`) : null,
    field('Notes for this day', h('textarea', { rows: 2, placeholder: 'Booking refs, reminders, meeting time…', value: day.note || '', oninput: (e) => { day.note = e.target.value; S.save(false); } })),
  );
}

function stopPoint(s) {
  if (s.kind === 'transit') {
    const t = s.transit || {};
    return t.toLat != null ? { lat: t.toLat, lng: t.toLng, name: t.to } : t.fromLat != null ? { lat: t.fromLat, lng: t.fromLng, name: t.from } : null;
  }
  const p = S.placeById(s.placeId);
  return p?.lat != null ? { lat: p.lat, lng: p.lng, name: p.name } : null;
}

function stopCard(s, i, all, day) {
  const p = S.placeById(s.placeId);
  const icon = s.kind === 'transit' ? '🚆' : s.kind === 'note' ? '📝' : CATS[p?.cat]?.icon || '📍';
  const title = s.kind === 'transit' ? `${s.transit?.from || '?'} → ${s.transit?.to || '?'}` : p?.name || s.title || 'Untitled';
  const sub = s.kind === 'transit'
    ? [s.transit?.line, s.transit?.platform && `platform ${s.transit.platform}`, s.transit?.ticket].filter(Boolean).join(' · ')
    : p?.local || p?.address?.split(',').slice(0, 2).join(',') || '';
  const move = (d) => {
    const j = i + d;
    if (j < 0 || j >= all.length) return;
    [all[i], all[j]] = [all[j], all[i]];
    S.save();
  };
  const nav = s.kind === 'transit'
    ? links.gmapsDir(s.transit?.from || '', s.transit?.to || '')
    : p ? links.gmapsPlace(p) : null;
  return h('li.stop', { class: s.done ? 'done' : '' },
    h('input.chk', { type: 'checkbox', checked: s.done ? true : null, 'aria-label': 'Done', onchange: (e) => { s.done = e.target.checked; S.save(); } }),
    h('div.time', s.time || '·'),
    h('div.body',
      h('strong', `${icon} ${title}`),
      sub ? h('small', sub) : null,
      s.note ? h('small.note', s.note) : null,
      s.cost ? h('small.cost', `💴 ${s.cost}`) : null),
    h('div.stop-actions',
      nav ? h('a.icon-btn', { href: nav, target: '_blank', rel: 'noopener', title: 'Open in maps', 'aria-label': 'Open in maps' }, '↗') : null,
      h('button.icon-btn', { title: 'Move up', 'aria-label': 'Move up', disabled: i === 0 ? true : null, onclick: () => move(-1) }, '↑'),
      h('button.icon-btn', { title: 'Move down', 'aria-label': 'Move down', disabled: i === all.length - 1 ? true : null, onclick: () => move(1) }, '↓'),
      h('button.icon-btn', { title: 'Edit', 'aria-label': 'Edit', onclick: () => editStop(s, day) }, '✎')));
}

function editStop(s, day) {
  if (s.kind === 'transit') return openTransitForm({ stop: s, dayIdx: S.get().days.indexOf(day) });
  const time = input({ type: 'time', value: s.time });
  const title = input({ type: 'text', value: S.placeById(s.placeId)?.name || s.title, disabled: s.placeId ? true : null });
  const note = h('textarea', { rows: 3, value: s.note });
  const cost = input({ type: 'text', inputmode: 'decimal', placeholder: 'e.g. 1500', value: s.cost });
  const moveTo = select(S.get().days.map((d, i) => [i, `Day ${i + 1} · ${fmtDate(d.date)}`]), S.get().days.indexOf(day));
  modal('Edit stop', h('div.stack',
    field('Name', title), field('Time', time), field('Note', note), field('Cost (any currency)', cost), field('Day', moveTo)), [
    {
      label: 'Delete', danger: true, onclick: async () => {
        if (!(await confirmBox('Remove this stop from the day?', 'Remove'))) return false;
        day.stops = day.stops.filter((x) => x !== s); S.save();
      },
    },
    {
      label: 'Save', primary: true, onclick: () => {
        if (!s.placeId) s.title = title.value;
        Object.assign(s, { time: time.value, note: note.value.trim(), cost: cost.value.trim() });
        const target = S.get().days[+moveTo.value];
        if (target !== day) { day.stops = day.stops.filter((x) => x !== s); target.stops.push(s); S.sortStopsByTime(target); }
        else S.sortStopsByTime(day);
        S.save();
      },
    }]);
}

function addNote(dayIdx) {
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
      h('button.btn', { onclick: () => modalPickToSave() }, '＋ Save a place')),
    h('div.chips.small', cats.map(([k, l]) => h('button.chip', { class: filter === k ? 'on' : '', onclick: () => { sessionStorage.setItem('placeFilter', k); S.save(); } }, l))),
    rows.length ? h('ul.plain', rows.map((p) => h('li.saved',
      h('div', h('strong', `${CATS[p.cat]?.icon || '📍'} ${p.name}`), h('small', p.local || p.address?.split(',').slice(0, 2).join(',') || '')),
      h('div.row',
        h('select', {
          'aria-label': 'Add to day', onchange: (e) => {
            if (e.target.value === '') return;
            S.addStop(+e.target.value, { kind: 'place', placeId: p.id });
            toast(`Added to Day ${+e.target.value + 1}`);
          },
        }, h('option', { value: '' }, '＋ day'), st.days.map((d, i) => h('option', { value: i }, `Day ${i + 1}`))),
        h('button.icon-btn', { 'aria-label': 'Edit place', onclick: () => openPlaceEditor(p) }, '✎'))))) :
      h('p.muted', 'Save places you want to visit, then drop them into any day. Food spots found in the Eat tab appear here too.'));
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
  const payload = { v: 1, trip: st.trip, days: st.days, places: st.places, packing: st.packing, settings: { hotels: st.settings.hotels } };
  const code = await packShare(payload);
  const url = `${location.origin}${location.pathname}#share=${code}`;
  const box = h('textarea', { rows: 4, readonly: true, onfocus: (e) => e.target.select() }, url);
  modal('Share with your travel buddy', h('div.stack',
    h('p', 'Anyone who opens this link can import your itinerary, saved places and food ratings into their own copy of the app. Your expenses and emergency details are not included.'),
    box,
    h('p.muted.small', `Link size: ${(url.length / 1024).toFixed(1)} KB. If it is too long for a chat app, use Tools → Backup instead.`)), [
    { label: 'Copy link', primary: true, onclick: async () => { try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch { box.select(); document.execCommand('copy'); toast('Link copied'); } return false; } },
    navigator.share ? { label: 'Share…', onclick: () => navigator.share({ title: st.trip.name, url }).catch(() => {}) } : { label: 'Close' },
  ].filter(Boolean));
}

// Japan and Korea are both UTC+9 with no DST, so converting to UTC is a fixed offset.
function exportCalendar() {
  const st = S.get();
  const esc = (t) => String(t || '').replace(/[\\;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
  const utc = (date, time, plusMin = 0) => {
    const d = parseISO(date);
    const [hh, mm] = time.split(':').map(Number);
    d.setHours(hh, mm + plusMin - 540, 0, 0);
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00Z`;
  };
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const ev = [];
  st.days.forEach((d) => d.stops.forEach((s) => {
    if (!s.time) return;
    const p = S.placeById(s.placeId);
    const title = s.kind === 'transit' ? `🚆 ${s.transit?.from} → ${s.transit?.to}` : p?.name || s.title;
    ev.push(['BEGIN:VEVENT', `UID:${s.id}@trip-planner`, `DTSTAMP:${stamp}`, `DTSTART:${utc(d.date, s.time)}`, `DTEND:${utc(d.date, s.time, 60)}`,
      `SUMMARY:${esc(title)}`, p?.address ? `LOCATION:${esc(p.address)}` : null, s.note ? `DESCRIPTION:${esc(s.note)}` : null, 'END:VEVENT'].filter(Boolean).join('\r\n'));
  }));
  if (!ev.length) return toast('Give some stops a time first');
  download('trip.ics', ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//trip-planner//EN', ...ev, 'END:VCALENDAR'].join('\r\n'), 'text/calendar');
}
