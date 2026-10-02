// Stay: "Book hotels" like Wanderlog's tab. We don't resell rooms or show prices, so this opens the big booking
// sites pre-filled (city, dates, guests), remembers recent searches, and saves where you end up staying
// (it feeds the emergency card and the taxi-address helper).
import { h, clear, field, input, select, toast, addDays, todayISO, daysBetween, fmtDate, geocode } from './util.js';
import * as S from './store.js';
import { CITIES } from './data.js';
import { icon } from './icons.js';

const RECENT_KEY = 'recentStays';
const recent = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch { return []; } };
const remember = (s) => { try { localStorage.setItem(RECENT_KEY, JSON.stringify([s, ...recent().filter((r) => !(r.where === s.where && r.in === s.in))].slice(0, 5))); } catch { /* ignore */ } };

const q = encodeURIComponent;
const PROVIDERS = [
  ['Booking.com', (s) => `https://www.booking.com/searchresults.html?ss=${q(s.where)}&checkin=${s.in}&checkout=${s.out}&group_adults=${s.adults}&no_rooms=${s.rooms}`],
  ['Agoda', (s) => `https://www.agoda.com/search?textToSearch=${q(s.where)}&checkIn=${s.in}&checkOut=${s.out}&rooms=${s.rooms}&adults=${s.adults}`],
  ['Google Hotels', (s) => `https://www.google.com/travel/search?q=${q(`hotels in ${s.where} ${s.in} to ${s.out}`)}`],
  ['Airbnb', (s) => `https://www.airbnb.com/s/${q(s.where)}/homes?checkin=${s.in}&checkout=${s.out}&adults=${s.adults}`],
];

export function renderStay(root) {
  const st = S.get();
  const day = S.currentDay();
  const tripStart = st.trip.start || todayISO();
  const where = input({ type: 'text', list: 'stay-cities', value: CITIES[day?.city]?.name || 'Tokyo', placeholder: 'City you’re visiting' });
  const cin = input({ type: 'date', value: day?.date || tripStart });
  const cout = input({ type: 'date', value: addDays(day?.date || tripStart, 1) });
  const rooms = select([1, 2, 3, 4].map((n) => [n, `${n} room${n > 1 ? 's' : ''}`]), 1);
  const adults = select([1, 2, 3, 4, 5, 6].map((n) => [n, `${n} traveller${n > 1 ? 's' : ''}`]), 2);
  const results = h('div.stack');

  const read = () => {
    if (!where.value.trim()) { toast('Enter a city'); return null; }
    if (cout.value <= cin.value) { toast('Check-out must be after check-in'); return null; }
    return { where: where.value.trim(), in: cin.value, out: cout.value, rooms: rooms.value, adults: adults.value };
  };
  const search = () => {
    const s = read(); if (!s) return;
    remember(s);
    const nights = daysBetween(s.in, s.out);
    clear(results).append(h('p.muted', `${s.where} · ${fmtDate(s.in, { month: 'short', day: 'numeric' })} – ${fmtDate(s.out, { month: 'short', day: 'numeric' })} (${nights} night${nights > 1 ? 's' : ''}). Pick a site; your search is pre-filled:`),
      ...PROVIDERS.map(([name, url]) => h('a.provider', { href: url(s), target: '_blank', rel: 'noopener' }, h('b', name), icon('next', 16))),
      h('p.muted.small', 'Tip: compare the same room on two sites and check free cancellation. Prices aren’t shown here.'));
  };

  const rec = recent();
  root.replaceChildren(
    h('datalist#stay-cities', Object.values(CITIES).map((c) => h('option', { value: c.name }))),
    h('section.card', h('h3', 'Book hotels'),
      h('div.stack',
        field('Where', where),
        h('div.grid2', field('Check-in', cin), field('Check-out', cout)),
        h('div.grid2', field('Rooms', rooms), field('Travellers', adults)),
        h('button.btn.primary.wide', { onclick: search }, icon('search', 18), 'Search'), results)),
    h('section.card', h('h3', 'Recently searched'),
      rec.length ? h('ul.plain', rec.map((r) => h('li', h('button.rowbtn', { onclick: () => { where.value = r.where; cin.value = r.in; cout.value = r.out; rooms.value = r.rooms; adults.value = r.adults; search(); } },
        h('b', r.where), h('small', `${fmtDate(r.in, { month: 'short', day: 'numeric' })} – ${fmtDate(r.out, { month: 'short', day: 'numeric' })} · ${r.adults} traveller${r.adults > 1 ? 's' : ''}`))))) :
        h('p.muted', 'No recent searches. Enter where, when and who to start searching for lodgings.')),
    saveStay());
}

// After booking: save the hotel so it's on the map, in the plan and on the emergency card.
function saveStay() {
  const st = S.get();
  const day = S.currentDay();
  const name = input({ type: 'text', placeholder: 'Hotel name' });
  const local = h('textarea', { rows: 2, placeholder: 'Address in Japanese / Korean (for taxis and the emergency card)' });
  const city = select(Object.entries(CITIES).map(([k, c]) => [k, c.name]), day?.city || 'tokyo');
  const addStops = h('input', { type: 'checkbox', checked: true });
  return h('section.card', h('h3', 'Save where you’re staying'),
    h('div.stack',
      field('Hotel', name), field('City', city), field('Local address', local),
      st.days.length ? h('label.row', addStops, h('span', 'Add check-in and check-out to my days')) : null,
      h('button.btn', { onclick: async () => {
        if (!name.value.trim()) return toast('Enter the hotel name');
        const c = CITIES[city.value];
        let hit = null;
        try { hit = (await geocode(name.value + ' ' + c.name, { lat: c.lat, lng: c.lng }))[0]; } catch { /* offline */ }
        const place = S.addPlace({ name: name.value.trim(), local: local.value.trim(), cat: 'stay', city: city.value, country: c.country, lat: hit?.lat ?? null, lng: hit?.lng ?? null, address: hit?.address || '' });
        st.settings.hotels[city.value] = { name: place.name, local: local.value.trim() };
        if (addStops.checked && st.days.length) {
          const days = st.days.map((d, i) => ({ d, i })).filter(({ d }) => d.city === city.value);
          if (days.length) {
            S.addStop(days[0].i, { kind: 'place', placeId: place.id, time: '15:00', note: 'Check in', move: 'subway' });
            if (days.at(-1).i !== days[0].i) S.addStop(days.at(-1).i, { kind: 'place', placeId: place.id, time: '10:00', note: 'Check out' });
          }
        }
        S.save(); toast(hit ? 'Saved and pinned on the map' : 'Saved (no map pin found)');
      } }, icon('bed', 18), 'Save stay')));
}
