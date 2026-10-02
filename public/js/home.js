// Home tab: a Wanderlog-style landing page: create a trip, your trips, quick actions, alerts and ideas.
import { h, clear, fmtDate, daysBetween, todayISO } from './util.js';
import * as S from './store.js';
import { IDEAS, CITIES } from './data.js';
import { icon } from './icons.js';
import { getFile } from './docs.js';
import { openAI } from './ai.js';
import { destinationFlow, goto } from './create.js';

const coverUrls = new Map();

export function renderHome(root) {
  const st = S.get();
  const trips = st.trips.filter((t) => t.days.length);
  clear(root);

  root.append(...[
    h('section.hhero',
      h('h1', trips.length ? 'Where to next?' : 'Plan your next adventure'),
      h('p', trips.length ? 'Start another trip, or keep building the one you have.' : 'Japan and Korea, from first idea to last train.'),
      h('button.btn.primary.big2', { onclick: destinationFlow }, 'Create new trip plan')),
    trips.length ? tripsRow(trips, st) : null,
    quickActions(),
    trips.length ? null : emptyIdeas(),
    alertsCard(),
    ideasRow()].filter(Boolean));
}

function tripBadge(t) {
  const n = daysBetween(todayISO(), t.start);
  if (n > 0) return `D-${n}`;
  if (daysBetween(todayISO(), t.end) >= 0) return n === 0 ? 'D-DAY' : `Day ${-n + 1}`;
  return 'Done';
}

function tripsRow(trips, st) {
  return h('section.hsec',
    h('div.row.between', h('h3', 'Your trips'), h('button.link', { onclick: () => document.getElementById('trip-btn').click() }, 'Manage')),
    h('div.hscroll', trips.map((t) => {
      const cities = [...new Set(t.days.map((d) => CITIES[d.city]?.name).filter(Boolean))];
      const stops = t.days.reduce((a, d) => a + d.stops.length, 0);
      const card = h('button.tripcard', { class: t.id === st.activeId ? 'on' : '', onclick: () => { S.switchTrip(t.id); goto('plan'); } },
        h('span.tbadge', tripBadge(t)),
        h('div.tinfo', h('b', t.name), h('small', `${fmtDate(t.start, { month: 'short', day: 'numeric' })} – ${fmtDate(t.end, { month: 'short', day: 'numeric' })} · ${cities.slice(0, 2).join(', ')}`), h('small', `${stops} stops · ${t.places.length} places`)));
      const apply = (u) => { card.style.backgroundImage = `linear-gradient(180deg, rgba(0,0,0,.05), rgba(0,0,0,.78)), url(${u})`; };
      if (coverUrls.has(t.id)) apply(coverUrls.get(t.id));
      else getFile('bg:' + t.id).then((b) => { if (b) { const u = URL.createObjectURL(b); coverUrls.set(t.id, u); apply(u); } });
      return card;
    })));
}

// Shown on a fresh install, like Wanderlog's "No upcoming trips?" sheet.
function emptyIdeas() {
  const row = (ic, title, sub, fn) => h('button.idearow', { onclick: fn }, h('span.iic', icon(ic, 22)), h('span', h('b', title), h('small', sub)));
  return h('section.hsec',
    h('h3', 'No upcoming trips? Try these'),
    h('div.stack',
      row('map', 'Make a bucket list', 'Save places you love so you don’t forget them', () => goto('plan')),
      row('plan', 'Design your dream vacation', 'Pick destinations and dates', destinationFlow),
      row('ai', 'Import a reel', 'Turn a post or screenshot into places', () => openAI({ mode: 'extract' })),
      row('bed', 'Find a place to stay', 'Compare Booking, Agoda and Google Hotels', () => goto('tools', 'stay')),
      row('shield', 'Check conditions', 'Earthquakes, typhoons and heat before you go', () => { document.dispatchEvent(new CustomEvent('open-panel', { detail: 'safety' })); goto('map'); })));
}

function quickActions() {
  const q = (ic, label, fn) => h('button.quick', { onclick: fn }, h('span.qic', icon(ic, 22)), h('span', label));
  return h('section.hsec', h('div.quickgrid',
    q('ai', 'Import a reel', () => openAI({ mode: 'extract' })),
    q('bed', 'Find hotels', () => goto('tools', 'stay')),
    q('bolt', 'Ask AI', () => openAI({ mode: 'chat' })),
    q('map', 'Open map', () => goto('map'))));
}

function alertsCard() {
  const c = S.cache.get('safety-status');
  const level = c?.v?.level;
  const label = { ok: 'No unusual quakes or weather found', watch: 'Keep an eye on conditions', alert: 'Heads up: check conditions' }[level];
  return h('section.hsec', h('button.alertcard', { class: level || 'none', onclick: () => { document.dispatchEvent(new CustomEvent('open-panel', { detail: 'safety' })); goto('map'); } },
    h('span.qic', icon('shield', 22)),
    h('span', h('b', 'Travel alerts'), h('small', label || 'Tap to check earthquakes, typhoons and heat')),
    h('span.chev', icon('next', 18))));
}

function ideasRow() {
  return h('section.hsec',
    h('h3', 'Ideas for Japan & Korea'),
    h('div.hscroll', IDEAS.map((i) => h('button.idea', { style: `--c:${i.color}`, onclick: () => openAI({ mode: 'chat', ask: i.ask }) },
      h('span.iemoji', i.emoji), h('b', i.title), h('small', i.sub)))));
}
