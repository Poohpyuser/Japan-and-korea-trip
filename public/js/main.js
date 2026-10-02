// App shell: tabs, trip switcher, share-link / share-target import, alarms, safety badge, offline support.
import { $, $$, h, modal, toast, unpackShare, confirmBox, fmtDate, pad, todayISO } from './util.js';
import * as S from './store.js';
import { icon } from './icons.js';
import { renderPlan } from './plan.js';
import { renderMap } from './map.js';
import { renderHome } from './home.js';
import { openAI } from './ai.js';
import { checkSafety } from './safety.js';
import { renderTools, toolsPage, setToolsPage } from './tools.js';
import { openCreate, destinationFlow } from './create.js';
import { applyTheme } from './theme.js';

const TABS = [
  ['home', 'Home', 'home', renderHome], ['plan', 'Trip', 'plan', renderPlan], ['map', 'Map', 'map', renderMap], ['tools', 'Me', 'user', renderTools],
];
// The AI chat keeps its own in-progress state, so it renders when opened, not on every data change.
const isSticky = (tab) => tab === 'tools' && toolsPage() === 'ai';

function show(tab, { fromState = false } = {}) {
  const st = S.get();
  if (!TABS.some(([k]) => k === tab)) tab = 'home';
  const changed = st.ui.tab !== tab;
  st.ui.tab = tab;
  $$('.view').forEach((v) => { v.hidden = v.id !== 'view-' + tab; });
  document.body.dataset.tab = tab;
  $$('nav.tabs button').forEach((b) => { b.classList.toggle('on', b.dataset.tab === tab); b.setAttribute('aria-current', b.dataset.tab === tab ? 'page' : 'false'); });
  const [, label, , render] = TABS.find(([k]) => k === tab);
  document.title = `${label} · ${st.trip.name}`;
  $('#trip-name').textContent = st.trip.name;
  if (isSticky(tab) && fromState && !changed) return;
  try { render($('#view-' + tab)); } catch (e) { console.error(e); $('#view-' + tab).replaceChildren(h('div.card', h('p.warn', `Something went wrong drawing this tab: ${e.message}`))); }
  if (changed) { window.scrollTo(0, 0); S.save(false); }
}

function buildShell() {
  const btn = ([k, label, ic]) => h('button', { dataset: { tab: k }, onclick: () => show(k) }, icon(ic, 22), h('span', label), k === 'map' ? h('i.dot', { id: 'safety-dot' }) : null);
  $('nav.tabs').append(btn(TABS[0]), btn(TABS[1]), h('button.fab', { 'aria-label': 'Create', onclick: openCreate }, icon('plus', 28)), btn(TABS[2]), btn(TABS[3]));
  $('main').append(...TABS.map(([k]) => h('section.view', { id: 'view-' + k, hidden: true, class: k === 'map' ? 'full' : '' })));
  $('#trip-btn').addEventListener('click', tripsSheet);
}

// ---------- trips ----------
function tripsSheet() {
  const st = S.get();
  const list = h('div.stack');
  const armed = new Set();
  const m = modal('My trips', h('div.stack', list, h('button.btn.primary', { onclick: () => { m.close(); destinationFlow(); } }, icon('plus', 18), 'New trip')));
  const draw = () => {
    list.replaceChildren(...st.trips.map((t) => {
      const n = t.days.reduce((a, d) => a + d.stops.length, 0);
      return h('div.triprow', { class: t.id === st.activeId ? 'on' : '' },
        h('button.tr-main', { onclick: () => { S.switchTrip(t.id); m.close(); } },
          h('b', `${t.id === st.activeId ? '✓ ' : ''}${t.name}`),
          h('small', `${t.start ? `${fmtDate(t.start, { month: 'short', day: 'numeric' })} – ${fmtDate(t.end, { month: 'short', day: 'numeric' })}` : 'No dates yet'} · ${n} stops`)),
        h('button.icon-btn', { 'aria-label': 'Edit trip', onclick: () => { S.switchTrip(t.id); m.close(); document.dispatchEvent(new CustomEvent('edit-trip')); } }, icon('edit', 16)),
        st.trips.length > 1 ? h('button.icon-btn', { 'aria-label': 'Delete trip', class: armed.has(t.id) ? 'armed' : '', onclick: () => {
          if (!armed.has(t.id)) { armed.add(t.id); toast('Tap again to delete this trip'); draw(); setTimeout(() => { armed.delete(t.id); draw(); }, 3500); return; }
          S.deleteTrip(t.id); toast('Trip deleted'); draw();
        } }, armed.has(t.id) ? 'Sure?' : icon('trash', 16)) : null);
    }));
  };
  draw();
}

async function importShared(code) {
  try {
    const data = await unpackShare(code);
    if (![1, 2].includes(data.v) || !Array.isArray(data.days)) throw new Error('unrecognised format');
    const n = data.days.reduce((a, d) => a + d.stops.length, 0);
    if (!(await confirmBox(`Add “${data.trip?.name || 'shared trip'}” (${data.days.length} days, ${n} stops, ${data.places?.length || 0} places) as a new trip? Your own trips are not touched.`, 'Add trip'))) return;
    const t = S.createTrip({ name: data.trip?.name, note: data.trip?.note });
    Object.assign(t, { start: data.trip.start, end: data.trip.end, days: data.days.map((d) => ({ ...d, stops: d.stops.map((s) => ({ move: '', alarm: '', docs: [], ...s })) })), places: data.places || [], flights: data.flights || [] });
    if (data.packing) t.packing = data.packing;
    S.save();
    toast('Trip imported ✓');
  } catch (e) { toast('That share link couldn’t be read: ' + e.message, 4000); }
}

// ---------- alarms (work while the app is open) ----------
const fired = new Set();
function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.25, 0.5].forEach((t) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = 880; g.gain.value = 0.15; o.connect(g); g.connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.15); });
  } catch { /* audio not allowed yet */ }
}
function checkAlarms() {
  const now = new Date();
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const hm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  S.get().trips.forEach((t) => t.days.filter((d) => d.date === date).forEach((d) => d.stops.forEach((s) => {
    const k = `${s.id}|${date}|${s.alarm}`;
    if (!s.alarm || s.alarm !== hm || fired.has(k)) return;
    fired.add(k);
    const title = (s.kind === 'transit' ? `${s.transit?.from} → ${s.transit?.to}` : (t.places.find((p) => p.id === s.placeId)?.name || s.title)) || 'Reminder';
    const text = `⏰ ${s.time ? s.time + ' · ' : ''}${title}`;
    const bar = $('#alarm');
    bar.replaceChildren(h('span', text), h('button.btn.sm', { onclick: () => { bar.hidden = true; } }, 'OK'));
    bar.hidden = false; beep(); navigator.vibrate?.([200, 100, 200]);
    if (window.Notification?.permission === 'granted') { try { new Notification(title, { body: s.time ? `at ${s.time}` : '', icon: 'icons/icon-192.png' }); } catch { /* ignore */ } }
  })));
}

// ---------- safety badge ----------
async function refreshBadge() {
  try {
    const s = await checkSafety();
    document.body.dataset.safety = s.level;
    document.body.dataset.safetyWhy = s.reasons.join('\n');
  } catch { /* offline */ }
}

function init() {
  buildShell();
  S.subscribe(() => show(S.get().ui.tab, { fromState: true }));
  document.addEventListener('show-on-map', () => show('map'));
  document.addEventListener('goto', (e) => { const { tab, sub } = e.detail; if (tab === 'tools') setToolsPage(sub || ''); window.scrollTo(0, 0); show(tab); });
  document.addEventListener('edit-trip', () => { show('plan'); setTimeout(() => $('#view-plan .hero .btn')?.click(), 50); });

  const params = new URLSearchParams(location.search);
  const m = location.hash.match(/^#share=(.+)$/);
  applyTheme();
  show(S.get().ui.tab || 'home');
  if (m) { history.replaceState(null, '', location.pathname); importShared(m[1]); }
  // Android "Share → Trip Planner" from Instagram/TikTok/Maps lands here (see share_target in the manifest).
  if (params.has('share')) {
    const text = ['title', 'text', 'url'].map((k) => params.get(k)).filter(Boolean).join('\n');
    history.replaceState(null, '', location.pathname);
    openAI({ mode: 'extract', text });
  }

  const net = () => { $('#offline').hidden = navigator.onLine; };
  window.addEventListener('online', () => { net(); refreshBadge(); });
  window.addEventListener('offline', net);
  net();

  setTimeout(refreshBadge, 1500);
  setInterval(refreshBadge, 15 * 60 * 1000);
  setInterval(checkAlarms, 15000);

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
init();
