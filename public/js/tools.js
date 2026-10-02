// Tools tab: budget & currency, packing list, survival phrases, settings, backup.
import { h, clear, field, input, select, modal, confirmBox, toast, fetchJSON, uid, todayISO, fmtDate, download, timeAgo } from './util.js';
import * as S from './store.js';
import { PHRASES, ENTRY_LINKS, CITIES } from './data.js';
import { getPass, setPass } from './ai.js';
import { icon } from './icons.js';

const CURRENCIES = ['JPY', 'KRW', 'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'NZD', 'SGD', 'PHP', 'HKD', 'CNY', 'TWD', 'THB', 'MYR', 'IDR', 'INR', 'AED', 'CHF', 'MXN', 'BRL'];
const EXP_CATS = { food: '🍜 Food', transport: '🚆 Transport', stay: '🏨 Stay', shop: '🛍️ Shopping', fun: '🎟️ Activities', other: '📦 Other' };
let sub = sessionStorage.getItem('toolsTab') || 'budget';
let rates = null;

async function loadRates() {
  const c = S.cache.get('rates');
  if (c) rates = c;
  if (c && Date.now() - c.at < 6 * 36e5) return;
  try {
    const j = await fetchJSON('https://open.er-api.com/v6/latest/USD');
    if (j.rates) { S.cache.set('rates', j.rates); rates = S.cache.get('rates'); S.save(); }
  } catch { /* keep cached */ }
}
const convert = (amt, from, to) => (rates?.v?.[from] && rates?.v?.[to] ? (amt / rates.v[from]) * rates.v[to] : null);
const money = (n, cur) => (n == null ? '–' : new Intl.NumberFormat(undefined, { style: 'currency', currency: cur, maximumFractionDigits: ['JPY', 'KRW', 'IDR'].includes(cur) ? 0 : 2 }).format(n));

export function renderTools(root) {
  const tabs = [['budget', '💴 Budget'], ['packing', '🎒 Packing'], ['phrases', '💬 Phrases'], ['settings', '⚙️ Settings']];
  root.replaceChildren(
    h('div.seg', tabs.map(([k, l]) => h('button', { class: sub === k ? 'on' : '', onclick: () => { sub = k; sessionStorage.setItem('toolsTab', k); S.save(); } }, l))),
    { budget, packing, phrases, settings }[sub](),
  );
  if (sub === 'budget' && (!rates || Date.now() - rates.at > 6 * 36e5)) loadRates();
}

// ---------- budget ----------
function budget() {
  const st = S.get();
  const home = st.settings.homeCurrency;
  const names = st.settings.names.filter(Boolean);
  const amt = input({ type: 'number', inputmode: 'decimal', min: 0, step: 'any', placeholder: '0' });
  const cur = select(CURRENCIES.map((c) => [c, c]), sessionStorage.getItem('lastCur') || 'JPY');
  const desc = input({ type: 'text', placeholder: 'What for? (ramen, Suica top-up…)' });
  const cat = select(Object.entries(EXP_CATS), 'food');
  const who = select(names.map((n) => [n, n]), st.settings.who);
  const add = () => {
    if (!(+amt.value > 0)) return toast('Enter an amount');
    sessionStorage.setItem('lastCur', cur.value);
    st.expenses.unshift({ id: uid(), date: todayISO(), desc: desc.value.trim(), amount: +amt.value, cur: cur.value, cat: cat.value, who: who.value });
    S.save();
  };

  // totals in home currency (if rates are known)
  const toHome = (e) => (e.cur === home ? e.amount : convert(e.amount, e.cur, home));
  const known = st.expenses.filter((e) => toHome(e) != null);
  const sum = (arr) => arr.reduce((a, e) => a + toHome(e), 0);
  const total = sum(known);
  const byCat = Object.keys(EXP_CATS).map((k) => [k, sum(known.filter((e) => e.cat === k))]).filter(([, v]) => v > 0);
  const paid = names.map((n) => [n, sum(known.filter((e) => e.who === n))]);

  // converter
  const cAmt = input({ type: 'number', inputmode: 'decimal', value: 10000 });
  const cFrom = select(CURRENCIES.map((c) => [c, c]), 'JPY');
  const cTo = select(CURRENCIES.map((c) => [c, c]), home);
  const cOut = h('div.big-out', '–');
  const calc = () => { const v = convert(+cAmt.value || 0, cFrom.value, cTo.value); cOut.textContent = v == null ? 'Offline: rates not loaded yet' : `${money(+cAmt.value || 0, cFrom.value)} ≈ ${money(v, cTo.value)}`; };
  [cAmt, cFrom, cTo].forEach((el) => el.addEventListener('input', calc));
  setTimeout(calc, 0);
  setTimeout(calc, 1500);

  return h('div.stack',
    h('section.card', h('h3', 'Currency converter'),
      h('div.grid3.align-end', field('Amount', cAmt), field('From', cFrom), field('To', cTo)), cOut,
      h('p.muted.small', rates ? `Rates updated ${timeAgo(rates.at)} (market rates, cards & ATMs differ slightly).` : 'Loading exchange rates…')),
    h('section.card', h('h3', 'Add expense'),
      h('div.grid2', field('Amount', amt), field('Currency', cur)), field('Description', desc),
      h('div.grid2', field('Category', cat), field('Paid by', who)),
      h('button.btn.primary', { onclick: add }, 'Add')),
    h('section.card', h('h3', `Spent so far: ${money(total, home)}`),
      known.length < st.expenses.length ? h('p.warn.small', 'Some expenses can’t be converted until exchange rates load.') : null,
      byCat.length ? h('ul.plain', byCat.map(([k, v]) => h('li.bar-row', h('span', EXP_CATS[k]), h('div.bar', h('i', { style: `width:${Math.max(4, v / total * 100)}%` })), h('b', money(v, home))))) : h('p.muted', 'No expenses yet.'),
      names.length === 2 && total ? settle(paid, home) : null),
    st.expenses.length ? h('section.card', h('h3', 'History'), h('ul.plain', st.expenses.slice(0, 80).map((e) => h('li.row.between',
      h('div', h('strong', e.desc || EXP_CATS[e.cat]), h('small', `${fmtDate(e.date)} · ${e.who} · ${EXP_CATS[e.cat]}`)),
      h('div.row', h('b', money(e.amount, e.cur)), h('button.icon-btn', { 'aria-label': 'Delete', onclick: () => { st.expenses = st.expenses.filter((x) => x.id !== e.id); S.save(); } }, '✕')))))) : null,
    h('section.card', h('h3', 'Before you fly'), h('ul', ENTRY_LINKS.map(([l, u]) => h('li', h('a', { href: u, target: '_blank', rel: 'noopener' }, l)))),
      h('p.muted.small', 'Entry rules change. Always confirm on the official site for your passport before you travel.')));
}

function settle(paid, cur) {
  const [[a, pa], [b, pb]] = paid;
  const diff = (pa - pb) / 2;
  if (Math.abs(diff) < 0.5) return h('p.ok-text', 'Even — nobody owes anything 🎉');
  return h('p', h('b', diff > 0 ? `${b} owes ${a} ${money(diff, cur)}` : `${a} owes ${b} ${money(-diff, cur)}`), h('small.muted', ' (if everything is split 50 / 50)'));
}

// ---------- packing ----------
function packing() {
  const st = S.get();
  const done = st.packing.filter((p) => p.done).length;
  const inp = input({ type: 'text', placeholder: 'Add an item…', onkeydown: (e) => { if (e.key === 'Enter') add(); } });
  const add = () => { if (!inp.value.trim()) return; st.packing.push({ id: uid(), text: inp.value.trim(), done: false }); S.save(); };
  return h('section.card', h('h3', `Packing & prep (${done}/${st.packing.length})`),
    h('div.bar', h('i', { style: `width:${st.packing.length ? done / st.packing.length * 100 : 0}%` })),
    h('ul.plain.packing', st.packing.map((p) => h('li.row.between',
      h('label.row', h('input', { type: 'checkbox', checked: p.done ? true : null, onchange: (e) => { p.done = e.target.checked; S.save(); } }), h('span', { class: p.done ? 'strike' : '' }, p.text)),
      h('button.icon-btn', { 'aria-label': 'Remove', onclick: () => { st.packing = st.packing.filter((x) => x !== p); S.save(); } }, '✕')))),
    h('div.row', inp, h('button.btn.primary', { onclick: add }, 'Add')));
}

// ---------- phrases ----------
let phraseCountry = 'JP';
function phrases() {
  const q = input({ type: 'search', placeholder: 'Filter…' });
  const list = h('div.stack');
  const draw = () => {
    clear(list);
    PHRASES[phraseCountry].filter((p) => p[0].toLowerCase().includes(q.value.toLowerCase())).forEach(([en, loc, rom]) =>
      list.append(h('button.phrase', { onclick: () => bigPhrase(en, loc, rom) }, h('small', en), h('span.local', loc), h('small.rom', rom))));
  };
  q.addEventListener('input', draw); draw();
  return h('div.stack',
    h('div.seg', [['JP', '🇯🇵 Japanese'], ['KR', '🇰🇷 Korean']].map(([k, l]) => h('button', { class: phraseCountry === k ? 'on' : '', onclick: () => { phraseCountry = k; S.save(); } }, l))),
    q, list, h('p.muted.small', 'Tap a phrase to show it full-screen to a local.'));
}
function bigPhrase(en, loc, rom) {
  modal(en, h('div.bigphrase', h('div.local.xl', loc), h('p.muted', rom)));
}

// ---------- settings / backup ----------
function settings() {
  const st = S.get();
  const s = st.settings;
  const bind = (obj, key) => ({ value: obj[key] || '', oninput: (e) => { obj[key] = e.target.value; S.save(false); } });
  const e = s.emergency;
  const cities = [...new Set(st.days.map((d) => d.city))];
  const hotels = cities.map((k) => {
    s.hotels[k] = s.hotels[k] || {};
    const ho = s.hotels[k];
    return h('div.card.inner', h('h4', `${CITIES[k].name} hotel`),
      field('Name', input({ type: 'text', ...bind(ho, 'name') })),
      field(`Address in ${CITIES[k].country === 'JP' ? 'Japanese' : 'Korean'} (show to taxi drivers)`, h('textarea', { rows: 2, ...bind(ho, 'local') })),
      h('a.btn.sm', { href: 'https://translate.google.com/', target: '_blank', rel: 'noopener' }, 'Translate address'));
  });
  const fileInp = h('input', { type: 'file', accept: 'application/json', hidden: true, onchange: importFile });
  return h('div.stack',
    h('section.card', h('h3', 'Travellers & money'),
      h('div.grid2', field('Traveller 1 (you)', input({ type: 'text', value: s.names[0], oninput: (ev) => { s.names[0] = ev.target.value.trim() || 'Me'; s.who = s.names[0]; S.save(false); } })),
        field('Traveller 2', input({ type: 'text', value: s.names[1], oninput: (ev) => { s.names[1] = ev.target.value.trim() || 'Sister'; S.save(false); } }))),
      field('Your home currency', select(CURRENCIES.map((c) => [c, c]), s.homeCurrency, { onchange: (ev) => { s.homeCurrency = ev.target.value; S.save(); } }))),
    h('section.card', h('h3', 'Emergency card details'), h('p.muted.small', 'Stored only on this device. Shown in the Safety tab’s emergency card.'),
      h('div.grid2', field('Full name', input({ type: 'text', ...bind(e, 'name') })), field('Blood type', input({ type: 'text', ...bind(e, 'blood') }))),
      field('Allergies / conditions', input({ type: 'text', ...bind(e, 'allergies') })),
      field('Medication', input({ type: 'text', ...bind(e, 'meds') })),
      field('Emergency contact (name + phone)', input({ type: 'text', ...bind(e, 'contact') })),
      field('Your embassy (name + phone)', input({ type: 'text', ...bind(e, 'embassy') }))),
    hotels.length ? h('section.card', h('h3', 'Where you’re staying'), hotels) : null,
    h('section.card', h('h3', icon('ai', 18), ' AI assistant'),
      h('p.muted.small', 'Needed only if the site owner set APP_PASSCODE in Netlify. Stored on this device.'),
      field('AI passcode', input({ type: 'password', autocomplete: 'off', value: getPass(), oninput: (ev) => setPass(ev.target.value.trim()) }))),
    h('section.card', h('h3', '⏰ Alarms'),
      h('p.muted.small', 'Stop alarms ring (sound + banner + notification) while the app is open. For alarms when your phone is locked, use the Calendar button on a stop: your phone’s calendar will alert you.'),
      h('button.btn', { onclick: async () => { if (!window.Notification) return toast('Notifications aren’t supported in this browser'); toast((await Notification.requestPermission()) === 'granted' ? 'Notifications enabled' : 'Notifications blocked'); } }, 'Enable notifications')),
    h('section.card', h('h3', 'Backup & sync'),
      h('p.muted.small', 'There is no account: your trips live in this browser. Back up before clearing browser data or switching phones (attached files stay on the device and are not in the backup). To share one trip with your sister use Plan → Share.'),
      h('div.row.wrap',
        h('button.btn', { onclick: () => download(`trips-backup-${todayISO()}.json`, JSON.stringify(S.exportState(), null, 1)) }, '⬇ Export backup'),
        h('button.btn', { onclick: () => fileInp.click() }, '⬆ Import backup'), fileInp,
        h('button.btn.danger', { onclick: async () => { if (await confirmBox('This permanently erases your itinerary, places, expenses and settings on this device.', 'Erase everything')) { localStorage.clear(); indexedDB.deleteDatabase('trip-files'); location.reload(); } } }, 'Erase all data'))),
    h('section.card', h('h3', 'Install on your phone'), h('p', 'iPhone: Safari → Share → Add to Home Screen. Android: Chrome → ⋮ → Install app. Once installed it opens full-screen and keeps working offline.')));
}

function importFile(ev) {
  const f = ev.target.files[0];
  if (!f) return;
  f.text().then(async (t) => {
    try {
      const data = JSON.parse(t);
      if (![1, 2].includes(data.v)) throw new Error('Not a trip backup file');
      if (await confirmBox('Replace everything in this app (all trips and settings) with the backup?', 'Replace')) { S.replaceState(data); toast('Backup restored'); }
    } catch (err) { toast('Couldn’t import: ' + err.message); }
  });
}
