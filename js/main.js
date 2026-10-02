// App shell: tab navigation, re-rendering on state changes, share-link import, safety badge, offline support.
import { $, $$, h, modal, toast, unpackShare, confirmBox } from './util.js';
import * as S from './store.js';
import { ICONS } from './data.js';
import { renderPlan } from './plan.js';
import { renderMap } from './map.js';
import { renderEat } from './eat.js';
import { renderTransit } from './transit.js';
import { renderWifi } from './wifi.js';
import { renderSafety, checkSafety } from './safety.js';
import { renderTools } from './tools.js';

const TABS = [
  ['plan', 'Plan', renderPlan], ['map', 'Map', renderMap], ['eat', 'Eat', renderEat], ['transit', 'Transit', renderTransit],
  ['wifi', 'Wi-Fi', renderWifi], ['safety', 'Safety', renderSafety], ['tools', 'Tools', renderTools],
];

function show(tab, { fromState = false } = {}) {
  const st = S.get();
  if (!TABS.some(([k]) => k === tab)) tab = 'plan';
  const changed = st.ui.tab !== tab;
  st.ui.tab = tab;
  $$('.view').forEach((v) => { v.hidden = v.id !== 'view-' + tab; });
  $$('nav.tabs button').forEach((b) => { b.classList.toggle('on', b.dataset.tab === tab); b.setAttribute('aria-current', b.dataset.tab === tab ? 'page' : 'false'); });
  const [, label, render] = TABS.find(([k]) => k === tab);
  document.title = `${label} · ${st.trip.name}`;
  // Safety re-checks the network on every re-render; only do that when the user opens the tab, not on each edit.
  if (tab === 'safety' && fromState && !changed) return;
  try { render($('#view-' + tab)); } catch (e) { console.error(e); $('#view-' + tab).replaceChildren(h('div.card', h('p.warn', `Something went wrong drawing this tab: ${e.message}`))); }
  if (changed) { window.scrollTo(0, 0); S.save(false); }
}

function buildShell() {
  $('nav.tabs').append(...TABS.map(([k, label]) => h('button', { dataset: { tab: k }, onclick: () => show(k) },
    h('span.ico', ICONS[k]), h('span', label), k === 'safety' ? h('i.dot', { id: 'safety-dot', hidden: true }) : null)));
  $('main').append(...TABS.map(([k]) => h('section.view', { id: 'view-' + k, hidden: true })));
}

async function importShared(code) {
  try {
    const data = await unpackShare(code);
    if (data.v !== 1 || !Array.isArray(data.days)) throw new Error('unrecognised format');
    const st = S.get();
    const hasLocal = st.days.some((d) => d.stops.length) || st.places.length;
    const ok = !hasLocal || await confirmBox(`Replace your itinerary and saved places with “${data.trip?.name}” (${data.days.length} days, ${data.places?.length || 0} places)? Your expenses and emergency details are kept.`, 'Replace');
    if (!ok) return;
    st.trip = data.trip; st.days = data.days; st.places = data.places || [];
    if (data.packing) st.packing = data.packing;
    if (data.settings?.hotels) st.settings.hotels = data.settings.hotels;
    st.ui.day = 0;
    S.save();
    toast('Trip imported ✓');
  } catch (e) { toast('That share link couldn’t be read: ' + e.message, 4000); }
}

async function refreshBadge() {
  try {
    const s = await checkSafety();
    const dot = $('#safety-dot');
    dot.hidden = s.level === 'ok';
    dot.className = 'dot ' + s.level;
    dot.title = s.reasons.join('\n');
  } catch { /* offline */ }
}

function init() {
  buildShell();
  S.subscribe(() => show(S.get().ui.tab, { fromState: true }));
  const m = location.hash.match(/^#share=(.+)$/);
  show(S.get().ui.tab || 'plan');
  if (m) { history.replaceState(null, '', location.pathname); importShared(m[1]); }

  const net = () => { $('#offline').hidden = navigator.onLine; };
  window.addEventListener('online', () => { net(); refreshBadge(); });
  window.addEventListener('offline', net);
  net();

  setTimeout(refreshBadge, 1500);
  setInterval(refreshBadge, 15 * 60 * 1000);
  document.addEventListener('safety-updated', () => {});

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
init();
