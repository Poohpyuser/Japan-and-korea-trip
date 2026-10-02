// Safety tab: earthquake feed, weather risk for the days/cities you’ll be in, nearby hospitals & shelters,
// emergency numbers, an "I'm safe" message and an emergency card to show staff.
//
// Honest limits: this is a pull-based dashboard (it checks when the app is open). It is NOT a push alarm and
// it is not an official warning system. Keep the government alert apps listed below installed as well.
import { h, clear, fetchJSON, timeAgo, distKm, fmtDist, links, toast, overpass, elCoords, elName, getPosition, select, field, modal, todayISO, daysBetween, fmtDate } from './util.js';
import * as S from './store.js';
import { CITIES, EMERGENCY, PREPAREDNESS, PHRASES } from './data.js';
import { forecast, wxInfo } from './plan.js';
import { centerPicker, resolveCenter, layers, bump as layersChanged } from './shared.js';

// ---------- data ----------
const SHINDO = { 10: '1', 20: '2', 30: '3', 40: '4', 45: '5−', 50: '5+', 55: '6−', 60: '6+', 70: '7' };
const REGION = { minLat: 24, maxLat: 46, minLng: 122, maxLng: 148 };

async function loadQuakes() {
  const out = { usgs: [], jma: [], errors: [] };
  const [u, j] = await Promise.allSettled([
    fetchJSON('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson'),
    fetchJSON('https://api.p2pquake.net/v2/history?codes=551&limit=30'),
  ]);
  if (u.status === 'fulfilled') {
    out.usgs = u.value.features.map((f) => ({
      mag: f.properties.mag, place: f.properties.place, time: f.properties.time, url: f.properties.url,
      tsunami: !!f.properties.tsunami, lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], depth: f.geometry.coordinates[2],
    })).filter((q) => q.lat >= REGION.minLat && q.lat <= REGION.maxLat && q.lng >= REGION.minLng && q.lng <= REGION.maxLng)
      .sort((a, b) => b.time - a.time);
  } else out.errors.push('USGS');
  if (j.status === 'fulfilled') {
    out.jma = j.value.filter((e) => e.earthquake?.hypocenter).map((e) => ({
      time: new Date(e.earthquake.time.replace(/\//g, '-').replace(' ', 'T') + '+09:00').getTime(),
      place: e.earthquake.hypocenter.name, mag: e.earthquake.hypocenter.magnitude, depth: e.earthquake.hypocenter.depth,
      scale: e.earthquake.maxScale, tsunami: e.earthquake.domesticTsunami,
    })).filter((q) => q.scale >= 30).slice(0, 8);
  } else out.errors.push('JMA via P2PQuake');
  S.cache.set('quakes', out);
  return out;
}

// Cities the traveller will be in over the next ~2 weeks (or today’s city if the trip is on).
function relevantDays() {
  const st = S.get();
  const t = todayISO();
  let rows = st.days.map((d, i) => ({ d, i })).filter(({ d }) => daysBetween(t, d.date) >= 0 && daysBetween(t, d.date) <= 15);
  if (!rows.length && st.days.length) rows = [{ d: st.days[Math.max(0, Math.min(st.ui.day, st.days.length - 1))], i: st.ui.day }];
  return rows;
}

export function weatherRisk(f) {
  const flags = [];
  if (f.code >= 95) flags.push(['danger', 'Thunderstorms']);
  if (f.rain >= 80) flags.push(['danger', `Very heavy rain (${Math.round(f.rain)} mm)`]);
  else if (f.rain >= 40) flags.push(['watch', `Heavy rain (${Math.round(f.rain)} mm)`]);
  if (f.gust >= 90) flags.push(['danger', `Violent gusts ${Math.round(f.gust)} km/h (typhoon-level)`]);
  else if (f.gust >= 65) flags.push(['watch', `Strong wind, gusts ${Math.round(f.gust)} km/h`]);
  if (f.hi >= 35) flags.push(['danger', `Dangerous heat ${Math.round(f.hi)}°C`]);
  else if (f.hi >= 32) flags.push(['watch', `Hot ${Math.round(f.hi)}°C`]);
  if (f.code >= 71 && f.code <= 77 || f.lo <= -8) flags.push(['watch', 'Snow / severe cold']);
  return flags;
}

// Run on app start and every few minutes while open. Returns a compact status for the nav badge.
export async function checkSafety() {
  const status = { level: 'ok', reasons: [], quakes: null, days: [] };
  const rows = relevantDays();
  const [q] = await Promise.allSettled([loadQuakes()]);
  const quakes = q.status === 'fulfilled' ? q.value : (S.cache.get('quakes')?.v || null);
  status.quakes = quakes;
  const bump = (lvl, why) => { if (lvl === 'alert' || status.level === 'ok') status.level = lvl; status.reasons.push(why); };
  if (quakes) {
    const now = Date.now();
    const cities = [...new Set(rows.map(({ d }) => d.city))].map((k) => CITIES[k]).filter(Boolean);
    for (const e of quakes.usgs) {
      const age = now - e.time;
      if (age > 72 * 36e5) continue;
      const nearest = cities.length ? Math.min(...cities.map((c) => distKm(c, e))) : Infinity;
      if (e.mag >= 6 && age < 24 * 36e5) bump('alert', `M${e.mag.toFixed(1)} earthquake ${timeAgo(e.time)}: ${e.place}`);
      else if (e.mag >= 5 && nearest < 250 && age < 24 * 36e5) bump('alert', `M${e.mag.toFixed(1)} quake ${Math.round(nearest)} km from your itinerary city ${timeAgo(e.time)}`);
      else if (e.mag >= 5 && nearest < 500) bump('watch', `M${e.mag.toFixed(1)} quake ${Math.round(nearest)} km away ${timeAgo(e.time)}`);
    }
  }
  const grouped = new Map();
  await Promise.allSettled(rows.slice(0, 8).map(async ({ d }) => {
    try {
      const fc = await forecast(d.city);
      const f = fc.find((x) => x.date === d.date) || fc[0];
      const flags = weatherRisk(f);
      status.days.push({ date: d.date, city: d.city, f, flags });
      flags.forEach(([lvl, text]) => {
        const key = `${d.city}|${text.replace(/[\d.]+/g, '#')}`;
        const g = grouped.get(key) || { lvl, city: d.city, text, dates: [] };
        g.dates.push(d.date); grouped.set(key, g);
      });
    } catch { /* offline: skip */ }
  }));
  status.days.sort((a, b) => a.date.localeCompare(b.date));
  // One line per warning type and city instead of one per day.
  for (const g of grouped.values()) {
    const ds = g.dates.sort().map((x) => fmtDate(x, { month: 'short', day: 'numeric' }));
    bump(g.lvl === 'danger' ? 'alert' : 'watch', `${CITIES[g.city].name}: ${g.text} (${ds.slice(0, 3).join(', ')}${ds.length > 3 ? ` +${ds.length - 3} more` : ''})`);
  }
  S.cache.set('safety-status', { level: status.level, reasons: status.reasons });
  return status;
}

// ---------- view ----------
let last = null;
export async function renderSafety(root) {
  const banner = h('section.card.status');
  const quakeBox = h('section.card');
  const wxBox = h('section.card');
  const spotsBox = h('div.stack');

  const paint = (s, stale) => {
    last = s;
    const cls = { ok: 'ok', watch: 'watch', alert: 'alert' }[s.level];
    clear(banner).append(
      h('div.banner', { class: cls },
        h('strong', s.level === 'alert' ? '⚠️ Heads up: take a look' : s.level === 'watch' ? '👀 Keep an eye on conditions' : '✅ Nothing unusual found'),
        s.reasons.length ? h('ul', s.reasons.slice(0, 6).map((r) => h('li', r))) : h('p', 'No significant earthquakes or severe weather found for your itinerary cities.')),
      h('p.muted.small', `${stale ? 'Offline: showing the last check. ' : ''}Checked ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} when you opened this tab. This app can’t push alerts — keep the official apps below installed.`),
      h('button.btn.sm', { onclick: refresh }, '↻ Refresh'));

    clear(quakeBox).append(h('h3', 'Recent earthquakes (Japan / Korea region)'));
    const q = s.quakes;
    if (!q) quakeBox.append(h('p.warn', 'Couldn’t load earthquake data. Check your connection or open JMA / KMA below.'));
    else {
      if (q.errors?.length) quakeBox.append(h('p.muted.small', `Couldn’t reach: ${q.errors.join(', ')}.`));
      const city = CITIES[(S.currentDay() || {}).city || 'tokyo'];
      const strong = q.usgs.filter((e) => Date.now() - e.time < 7 * 24 * 36e5).slice(0, 8);
      if (q.jma?.length) quakeBox.append(h('h4', 'Felt in Japan (shindo 3+, JMA data)'), h('ul.plain', q.jma.slice(0, 5).map((e) => h('li.quake',
        h('b', `M${e.mag > 0 ? e.mag.toFixed(1) : '?'} · shindo ${SHINDO[e.scale] || e.scale}`), ` ${e.place} · ${timeAgo(e.time)}${e.tsunami && e.tsunami !== 'None' ? ' · 🌊 tsunami info: ' + e.tsunami : ''}`))));
      quakeBox.append(h('h4', 'M4.5+ in the last week (USGS)'));
      if (!strong.length) quakeBox.append(h('p.muted', 'No M4.5+ earthquakes in the region this week.'));
      else quakeBox.append(h('ul.plain', strong.map((e) => h('li.quake',
        h('b', `M${e.mag.toFixed(1)}`), ` ${e.place} · ${timeAgo(e.time)} · ${fmtDist(distKm(city, e))} from ${city.name}`,
        e.tsunami ? ' · 🌊 tsunami flag' : ''))));
      layers.quakes = strong.map((e) => ({ lat: e.lat, lng: e.lng, mag: e.mag, place: e.place, time: e.time }));
      layersChanged();
      quakeBox.append(h('p.muted.small', 'Magnitude ≠ how strongly you’d feel it: depth and distance matter. For official intensity and tsunami info use the links below.'));
    }

    clear(wxBox).append(h('h3', 'Weather risk on your itinerary'));
    if (!s.days.length) wxBox.append(h('p.muted', 'Forecasts cover the next 16 days. Add trip dates and cities in the Plan tab, and come back closer to departure.'));
    s.days.forEach(({ date, city, f, flags }) => {
      const [icon, label] = wxInfo(f.code);
      wxBox.append(h('div.wxrow',
        h('div', h('strong', `${fmtDate(date)} · ${CITIES[city].name}`), h('small', `${icon} ${label} · ${Math.round(f.lo)}–${Math.round(f.hi)}°C · rain ${f.rain} mm · gusts ${Math.round(f.gust)} km/h`)),
        flags.length ? h('div', flags.map(([lvl, t]) => h('span.pill', { class: lvl === 'danger' ? 'hot' : 'warnp' }, t))) : h('span.pill.ok', 'OK')));
    });
    wxBox.append(h('p.muted.small', 'Typhoons: check the JMA / KMA typhoon pages below 3–5 days before moving between cities; trains and flights are often suspended in advance.'));
  };

  const refresh = async () => {
    clear(banner).append(h('p.muted', 'Checking earthquakes and weather…'));
    try { paint(await checkSafety(), false); document.dispatchEvent(new CustomEvent('safety-updated')); }
    catch (e) { const c = S.cache.get('safety-status'); clear(banner).append(h('p.warn', `Couldn’t check (${e.message}).`), c ? h('p.muted', `Last known: ${c.v.level}.`) : null); }
  };

  root.replaceChildren(
    banner,
    h('div.sos', h('button.btn.danger.big', { onclick: emergencyCard }, '🆘 Emergency card (show to staff)'), h('button.btn.big', { onclick: imSafe }, '✅ I’m safe — send a check-in')),
    quakeBox, wxBox, nearby(spotsBox), spotsBox, numbers(), preparedness(),
  );
  if (last) paint(last, false);
  refresh();
}

// ---------- nearby help ----------
const SPOTS = {
  hospital: ['🏥 Hospitals', '["amenity"="hospital"]'],
  clinic: ['🩺 Clinics', '["amenity"="clinic"]["name"]'],
  pharmacy: ['💊 Pharmacies', '["amenity"="pharmacy"]'],
  police: ['👮 Police / Koban', '["amenity"="police"]'],
  shelter: ['🏫 Evacuation points', '["emergency"="assembly_point"]'],
  embassy: ['🏛 Embassies', '["amenity"="embassy"]'],
};
let spotKind = 'hospital';

function nearby(out) {
  const cp = centerPicker();
  const kindSel = select(Object.entries(SPOTS).map(([k, v]) => [k, v[0]]), spotKind, { onchange: (e) => { spotKind = e.target.value; } });
  const go = async () => {
    clear(out).append(h('p.muted', 'Searching…'));
    try {
      const c = await resolveCenter(cp.value);
      const els = await overpass(`[out:json][timeout:25];nwr${SPOTS[spotKind][1]}(around:4000,${c.lat},${c.lng});out center 60;`);
      const rows = els.map((e) => ({ e, p: elCoords(e) })).filter((x) => x.p).map(({ e, p }) => ({ name: elName(e.tags) || SPOTS[spotKind][0].replace(/^\S+\s/, ''), lat: p.lat, lng: p.lng, km: distKm(c, p), phone: e.tags.phone || e.tags['contact:phone'], hours: e.tags.opening_hours, er: e.tags.emergency === 'yes' }))
        .sort((a, b) => a.km - b.km).slice(0, 15);
      layers.safety = rows.map((r) => ({ lat: r.lat, lng: r.lng, name: r.name, kind: spotKind }));
      layersChanged();
      clear(out);
      if (!rows.length) out.append(h('p.muted', 'Nothing mapped within 4 km. In an emergency call 119 (Japan & Korea).'));
      rows.forEach((r) => out.append(h('article.card.place',
        h('div.row.between', h('strong', r.name), h('span.pill', fmtDist(r.km))),
        h('div.row.wrap', r.er ? h('span.pill.hot', 'ER') : null, r.hours ? h('span.pill', `🕒 ${r.hours}`) : null),
        h('div.row.wrap', h('a.btn.sm', { href: links.gmapsPlace(r), target: '_blank', rel: 'noopener' }, '↗ Directions'), r.phone ? h('a.btn.sm', { href: 'tel:' + r.phone.replace(/[^\d+]/g, '') }, '📞 ' + r.phone) : null))));
    } catch (e) { clear(out).append(h('p.warn', `Couldn’t search (${e.message}).`)); }
  };
  return h('section.card', h('h3', 'Find help nearby'),
    h('div.row.wrap', cp.el, field('Look for', kindSel), h('button.btn.primary', { onclick: go }, 'Search')),
    h('p.muted.small', 'Evacuation sites are only partly mapped. Follow the green running-person signs, and ask hotel staff.'));
}

// ---------- numbers, preparedness ----------
function numbers() {
  return h('section.card', h('h3', 'Emergency numbers & official sources'),
    Object.values(EMERGENCY).map((c) => h('div.stack',
      h('h4', `${c.flag} ${c.title}`),
      h('ul.plain', c.numbers.map(([l, n]) => h('li.row.between', h('span', l), h('a.btn.sm', { href: 'tel:' + n.replace(/[^\d+]/g, '') }, '📞 ' + n)))),
      h('p.small', h('b', 'Install: '), c.apps.join(' · ')),
      h('div.row.wrap', c.sites.map(([l, u]) => h('a.btn.sm', { href: u, target: '_blank', rel: 'noopener' }, l))))));
}

function preparedness() {
  return h('section.card', h('h3', 'What to do'),
    PREPAREDNESS.map(([t, items]) => h('details', h('summary', t), h('ul', items.map((i) => h('li', i))))));
}

// ---------- I'm safe + emergency card ----------
async function imSafe() {
  const st = S.get();
  const who = st.settings.names[0] || 'Me';
  let where = CITIES[S.currentDay()?.city || 'tokyo'].name;
  let link = '';
  try { const p = await getPosition(); link = ` My location: https://www.google.com/maps?q=${p.lat.toFixed(5)},${p.lng.toFixed(5)}`; } catch { /* use city name */ }
  const text = `✅ ${who}: I'm safe. Currently in ${where}.${link} (${new Date().toLocaleString()})`;
  if (navigator.share) { try { await navigator.share({ text }); return; } catch { /* cancelled */ } }
  try { await navigator.clipboard.writeText(text); toast('Message copied — paste it into your chat'); } catch { modal('Copy this message', h('textarea', { rows: 4, readonly: true }, text)); }
}

function emergencyCard() {
  const st = S.get();
  const e = st.settings.emergency;
  const cityKey = S.currentDay()?.city || 'tokyo';
  const c = CITIES[cityKey];
  const hotel = st.settings.hotels?.[cityKey] || st.settings.hotels?.[c.country] || {};
  const lang = c.country === 'KR' ? PHRASES.KR : PHRASES.JP;
  const pick = (en) => lang.find((p) => p[0].startsWith(en));
  const rows = [pick('Help me'), pick('Call an ambulance'), pick('I feel sick'), lang.at(-1)].filter(Boolean);
  const line = (k, v) => (v ? h('div.row.between', h('span.muted', k), h('b', v)) : null);
  modal('Emergency card', h('div.ecard',
    h('div.ecard-top', h('b', c.country === 'KR' ? '🇰🇷 119 Ambulance · 112 Police' : '🇯🇵 119 Ambulance · 110 Police')),
    rows.map(([en, loc]) => h('div.ecard-phrase', h('div.local', loc), h('small', en))),
    h('hr'),
    line('Name', e.name), line('Blood type', e.blood), line('Allergies', e.allergies), line('Medication', e.meds), line('Emergency contact', e.contact), line('Embassy', e.embassy),
    hotel.name || hotel.address ? h('div.stack', h('hr'), h('b', 'My hotel'), h('div', hotel.name), h('div.local', hotel.local || hotel.address)) : h('p.muted.small', 'Fill in your details and hotel address under Tools → Settings.')));
}
