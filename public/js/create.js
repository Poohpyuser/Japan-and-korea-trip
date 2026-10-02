// The centre "＋" flow: a full-screen create menu and the destination → dates → trip wizard.
import { h, clear, field, input, toast, geocode, distKm, todayISO, daysBetween, addDays } from './util.js';
import * as S from './store.js';
import { DESTINATIONS, CITIES } from './data.js';
import { icon } from './icons.js';
import { openAI } from './ai.js';
import { addPlaceFlow, addNote, editFlight } from './plan.js';
import { openTransitForm } from './transit.js';

export const goto = (tab, sub) => document.dispatchEvent(new CustomEvent('goto', { detail: { tab, sub } }));

// A full-screen dialog (no header chrome) used by both flows below.
function fullSheet(build) {
  const dlg = h('dialog.full');
  const close = () => { dlg.close(); dlg.remove(); };
  dlg.addEventListener('cancel', () => dlg.remove());
  build(dlg, close);
  document.body.append(dlg);
  dlg.showModal();
  return { close, el: dlg };
}

const nearestCity = (p) => Object.entries(CITIES).sort((a, b) => distKm(a[1], p) - distKm(b[1], p))[0][0];

// ---------- create menu ----------
export function openCreate() {
  const st = S.get();
  const hasTrip = st.days.length > 0;
  const idx = st.ui.day;
  fullSheet((dlg, close) => {
    const card = (emoji, title, sub, fn, tag) => h('button.ccard', { onclick: () => { close(); fn(); } },
      h('span.cemoji', emoji), h('span.ctext', h('b', title, tag ? h('i.rec', tag) : null), h('small', sub)));
    dlg.append(
      h('button.fullclose', { 'aria-label': 'Close', onclick: close }, icon('x', 20)),
      h('div.cwrap',
        card('🧳', 'Plan a trip', 'Choose places and build itineraries', () => destinationFlow(), 'RECOMMENDED'),
        hasTrip ? h('div.ccard.group',
          h('span.ctext', h('b', `Add to Day ${idx + 1}`), h('small', st.trip.name)),
          h('div.cquick',
            qbtn('📍', 'Place', close, () => addPlaceFlow(idx)), qbtn('🚆', 'Transit', close, () => openTransitForm({ dayIdx: idx })),
            qbtn('📝', 'Note', close, () => addNote(idx)), qbtn('✈️', 'Flight', close, () => editFlight()))) : null,
        card('✨', 'Ask AI', 'Plan a day, get ideas, answer questions', () => openAI({ mode: 'chat' })),
        h('div.or', h('span', 'or')),
        card('📥', 'Import from anywhere', 'Link, social media post, or text', () => openAI({ mode: 'extract' })),
        card('🏨', 'Find a hotel', 'Search Booking, Agoda, Google Hotels', () => goto('tools', 'stay'))));
  });
}
const qbtn = (emoji, label, close, fn) => h('button.qbtn', { onclick: () => { close(); fn(); } }, h('span', emoji), label);

// ---------- destination wizard ----------
export function destinationFlow() {
  const picked = []; // [{name, sub, city}]
  fullSheet((dlg, close) => {
    const body = h('div.dwrap');
    dlg.append(body);

    const step1 = () => {
      const q = input({ type: 'search', placeholder: 'e.g. Tokyo, Kyoto, Seoul, Jeju', autofocus: true, 'aria-label': 'Search destinations' });
      const list = h('div.dlist');
      const extra = h('div');
      const isPicked = (d) => picked.some((p) => p.name === d.name);
      const toggle = (d) => { const i = picked.findIndex((p) => p.name === d.name); if (i >= 0) picked.splice(i, 1); else picked.push(d); draw(); };
      const draw = () => {
        const term = q.value.trim().toLowerCase();
        const rows = DESTINATIONS.filter((d) => !term || (d.name + ' ' + d.sub).toLowerCase().includes(term));
        clear(list).append(h('h4', term ? 'Matches' : 'Popular destinations'),
          ...[...picked.filter((p) => !DESTINATIONS.some((d) => d.name === p.name)), ...rows].map((d) => h('button.drow', { class: isPicked(d) ? 'on' : '', onclick: () => toggle(d) },
            h('span.dn', h('b', d.name), d.sub ? h('small', d.sub) : null), h('span.dtype', isPicked(d) ? '✓' : d.type))));
        go.disabled = !picked.length;
        go.textContent = picked.length ? `Continue · ${picked.map((p) => p.name).join(' + ')}` : 'Pick at least one destination';
      };
      const search = async () => {
        const term = q.value.trim(); if (!term) return;
        clear(extra).append(h('p.muted', 'Searching the map…'));
        try {
          const rows = await geocode(term);
          clear(extra).append(...rows.slice(0, 5).map((r) => h('button.drow', { onclick: () => { toggle({ name: r.name, sub: r.address.split(',').slice(1, 3).join(',').trim(), type: 'Place', city: nearestCity(r) }); } },
            h('span.dn', h('b', r.name), h('small', r.address.split(',').slice(1, 3).join(',').trim())), h('span.dtype', 'Place'))));
          if (!rows.length) extra.append(h('p.muted', 'Nothing found. Try another spelling.'));
        } catch (e) { clear(extra).append(h('p.warn', `Search failed (${e.message})`)); }
      };
      q.addEventListener('input', () => { clear(extra); draw(); });
      q.addEventListener('keydown', (e) => { if (e.key === 'Enter') search(); });
      const go = h('button.btn.primary.wide', { onclick: step2 }, '');
      clear(body).append(
        h('div.dsearch', h('button.circle', { 'aria-label': 'Close', onclick: close }, icon('back', 18)), q, h('button.icon-btn', { 'aria-label': 'Search map', onclick: search }, icon('search', 18))),
        list, extra,
        h('div.dfoot', go));
      draw();
    };

    const step2 = () => {
      const names = picked.map((p) => p.name);
      const name = input({ type: 'text', value: `Trip to ${names.join(' & ')}` });
      const start = input({ type: 'date', value: todayISO() });
      const end = input({ type: 'date', value: addDays(todayISO(), 4) });
      const note = input({ type: 'text', placeholder: 'e.g. 2 travellers', value: '' });
      const create = () => {
        if (!start.value || !end.value || end.value < start.value) return toast('Pick a valid date range');
        if (daysBetween(start.value, end.value) + 1 > S.MAX_DAYS) return toast(`Trips can be up to ${S.MAX_DAYS} days`);
        S.createTrip({ name: name.value.trim() || 'My trip', note: note.value.trim(), start: start.value, end: end.value });
        S.setCitiesEven(picked.map((p) => p.city));
        close(); toast('Trip created. Now add places!'); goto('plan');
      };
      clear(body).append(
        h('div.dsearch', h('button.circle', { 'aria-label': 'Back', onclick: step1 }, icon('back', 18)), h('b.dtitle', 'When are you going?')),
        h('div.stack.dform',
          h('p.muted', picked.length > 1 ? `Days are split evenly between ${names.join(', ')}. Change it any time with “City plan”.` : `Searches, weather and safety checks will start from ${names[0]}.`),
          field('Trip name', name), h('div.grid2', field('First day', start), field('Last day', end)), field('Subtitle', note)),
        h('div.dfoot', h('button.btn.primary.wide', { onclick: create }, 'Create trip')));
    };
    step1();
  });
}
