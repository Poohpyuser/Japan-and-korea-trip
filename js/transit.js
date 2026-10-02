// Transit tab: journey planning via deep links, station cheat-sheets, passes, and legs you can drop into any day.
import { h, clear, field, input, select, modal, confirmBox, toast, links, fmtDate, placePicker } from './util.js';
import * as S from './store.js';
import { STATIONS, TRANSIT_CARDS, CITIES, cityOptions } from './data.js';

let country = sessionStorage.getItem('transitCountry') || 'JP';

export function renderTransit(root) {
  root.replaceChildren(
    h('div.seg', [['JP', '🇯🇵 Japan'], ['KR', '🇰🇷 Korea']].map(([k, l]) =>
      h('button', { class: country === k ? 'on' : '', onclick: () => { country = k; sessionStorage.setItem('transitCountry', k); S.save(); } }, l))),
    planner(),
    stationGuide(),
    h('section.card', h('h3', 'Passes, cards & etiquette'),
      TRANSIT_CARDS.filter((c) => c.title.includes(country === 'JP' ? '🇯🇵' : '🇰🇷') || !/🇯🇵|🇰🇷/.test(c.title))
        .map((c) => h('details', h('summary', c.title), h('p', c.body)))),
  );
}

function planner() {
  const from = input({ type: 'text', placeholder: 'From (e.g. Shinjuku Station)' });
  const to = input({ type: 'text', placeholder: 'To (e.g. Kyoto Station)' });
  const day = S.currentDay();
  const dayIdx = S.get().ui.day;
  const swap = () => { [from.value, to.value] = [to.value, from.value]; };
  const need = () => { if (!from.value.trim() || !to.value.trim()) { toast('Enter both a start and a destination'); return false; } return true; };
  return h('section.card',
    h('h3', 'Journey planner'),
    h('p.muted.small', country === 'JP'
      ? 'Google Maps gives live Japanese train times, platforms, fares and last trains. Open it, then save the leg into your day.'
      : 'Naver Map and Kakao Map are far more accurate than Google in Korea (Google has no walking / driving data there). Use them for routes; save the leg here.'),
    h('div.stack',
      h('div.grid2.align-end', field('From', from), h('div.row', field('To', to), h('button.icon-btn', { title: 'Swap', 'aria-label': 'Swap', onclick: swap }, '⇅'))),
      h('div.row.wrap',
        h('button.btn.primary', { onclick: () => need() && window.open(links.gmapsDir(from.value, to.value), '_blank', 'noopener') }, 'Google Maps transit'),
        country === 'KR' ? h('button.btn', { onclick: () => need() && window.open(links.kakaoDir(from.value, to.value), '_blank', 'noopener') }, 'Kakao Map') : null,
        country === 'KR' ? h('button.btn', { onclick: () => window.open(links.naver(to.value || from.value || 'Seoul Station'), '_blank', 'noopener') }, 'Naver Map') : null,
        h('button.btn', { onclick: () => need() && openTransitForm({ dayIdx, prefill: { from: from.value.trim(), to: to.value.trim() } }) }, day ? `＋ Save to Day ${dayIdx + 1}` : 'Save leg'))));
}

function stationGuide() {
  const list = STATIONS.filter((s) => CITIES[s.city].country === country);
  const sel = select(list.map((s) => [s.id, `${s.name}  ${s.local}`]), list[0]?.id);
  const out = h('div');
  const draw = () => {
    const s = STATIONS.find((x) => x.id === sel.value);
    if (!s) return;
    clear(out).append(
      h('div.row.between', h('div', h('strong', s.name), h('small', s.local))),
      h('ul', s.tips.map((t) => h('li', t))),
      h('div.row.wrap',
        h('a.btn.sm', { href: links.gmapsPlace({ name: s.name + ' ' + s.local }), target: '_blank', rel: 'noopener' }, '↗ Station map & exits'),
        h('a.btn.sm', { href: `https://www.google.com/search?q=${encodeURIComponent(s.name + ' station map PDF')}&tbm=isch`, target: '_blank', rel: 'noopener' }, '🖼 Floor maps')));
  };
  sel.addEventListener('change', draw);
  draw();
  return h('section.card', h('h3', 'Station cheat-sheet'),
    h('p.muted.small', 'Big stations are the hardest part of the trip. Read the tips, then use the station map to pick your exit before you walk.'),
    sel, out,
    h('details', h('summary', 'How to read the signs'),
      h('ul',
        h('li', 'Japan: lines have letter + number codes (G-09 = Ginza line, station 9). Follow the colour/letter of your line, not just the name.'),
        h('li', 'Korea: lines are numbered and coloured (Line 2 = green); station numbers appear in the big circles. Exit numbers are on yellow signs.'),
        h('li', 'Always check the direction of travel by the last stop name on the platform sign, and whether your train is “local”, “rapid” or “express”.'),
        h('li', 'Gates take IC cards and paper tickets. If a gate blocks you, go to the fare adjustment machine or staff window ("Fare adjustment" / 精算機).'))));
}

// Used from the Plan tab ("Train / transit") and from here ("Save to day").
export function openTransitForm({ stop, dayIdx, prefill } = {}) {
  const st = S.get();
  const t = stop?.transit || prefill || {};
  const from = input({ type: 'text', value: t.from || '', placeholder: 'Departure station / place' });
  const to = input({ type: 'text', value: t.to || '', placeholder: 'Arrival station / place' });
  const line = input({ type: 'text', value: t.line || '', placeholder: 'Line / train name (e.g. Nozomi 15, Line 2)' });
  const platform = input({ type: 'text', value: t.platform || '', placeholder: 'e.g. 14' });
  const ticket = input({ type: 'text', value: t.ticket || '', placeholder: 'e.g. Reserved car 5 seat 12A, IC card' });
  const time = input({ type: 'time', value: stop?.time || '' });
  const cost = input({ type: 'text', inputmode: 'decimal', value: stop?.cost || '', placeholder: 'Fare' });
  const day = select(st.days.map((d, i) => [i, `Day ${i + 1} · ${fmtDate(d.date)}`]), dayIdx ?? st.ui.day);
  const geo = { from: null, to: null };
  const find = (which, inp) => {
    const holder = h('div');
    const m = modal(`Find ${which === 'from' ? 'departure' : 'arrival'} on the map`, placePicker({
      near: CITIES[st.days[+day.value]?.city || 'tokyo'], placeholder: 'Station name',
      onPick: (r) => { inp.value = r.name; geo[which] = r; m.close(); },
    }));
  };
  const body = h('div.stack',
    st.days.length ? field('Day', day) : null,
    field('From', h('div.row', from, h('button.btn.sm', { onclick: () => find('from', from) }, '📍'))),
    field('To', h('div.row', to, h('button.btn.sm', { onclick: () => find('to', to) }, '📍'))),
    h('div.grid2', field('Departs', time), field('Fare', cost)),
    field('Line / train', line), h('div.grid2', field('Platform', platform), field('Ticket / seat', ticket)),
    h('p.muted.small', '📍 sets map coordinates so the leg shows on the Map tab.'));
  modal(stop ? 'Edit transit leg' : 'Add transit leg', body, [
    stop ? { label: 'Delete', danger: true, onclick: async () => {
      if (!(await confirmBox('Remove this transit leg?', 'Remove'))) return false;
      const d = st.days.find((d) => d.stops.includes(stop)); if (d) d.stops = d.stops.filter((x) => x !== stop); S.save();
    } } : null,
    { label: 'Save', primary: true, onclick: () => {
      if (!from.value.trim() || !to.value.trim()) { toast('Enter where you’re going'); return false; }
      const tr = { ...t, from: from.value.trim(), to: to.value.trim(), line: line.value.trim(), platform: platform.value.trim(), ticket: ticket.value.trim() };
      if (geo.from) Object.assign(tr, { fromLat: geo.from.lat, fromLng: geo.from.lng });
      if (geo.to) Object.assign(tr, { toLat: geo.to.lat, toLng: geo.to.lng });
      if (stop) { Object.assign(stop, { transit: tr, time: time.value, cost: cost.value.trim() }); S.sortStopsByTime(st.days.find((d) => d.stops.includes(stop))); S.save(); }
      else { S.addStop(+day.value, { kind: 'transit', transit: tr, time: time.value, cost: cost.value.trim() }); toast('Saved to Day ' + (+day.value + 1)); }
    } }].filter(Boolean));
}
