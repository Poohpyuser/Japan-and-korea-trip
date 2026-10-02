// Wi-Fi tab: finds spots tagged as free Wi-Fi in OpenStreetMap, plus chains that usually have it.
import { h, clear, select, field, toast, overpass, elCoords, elName, distKm, fmtDist, links, timeAgo } from './util.js';
import * as S from './store.js';
import { WIFI_PROGRAMS } from './data.js';
import { centerPicker, resolveCenter, layers, bump } from './shared.js';

let radius = 800;
let includeChains = true;

export function renderWifi(root) {
  const out = h('div.stack');
  const cp = centerPicker();
  const rad = select([[400, '400 m'], [800, '800 m'], [1500, '1.5 km'], [3000, '3 km']], radius, { onchange: (e) => { radius = +e.target.value; } });
  const chains = h('input', { type: 'checkbox', checked: includeChains ? true : null, onchange: (e) => { includeChains = e.target.checked; } });

  const show = (rows, c, at) => {
    clear(out);
    const sure = rows.filter((r) => r.sure);
    out.append(h('p.muted.small', `${sure.length} confirmed free Wi-Fi spots${includeChains ? ` and ${rows.length - sure.length} chain stores that usually have it` : ''} near ${c.label}${at ? ` · updated ${timeAgo(at)}` : ''}. Chains normally need a one-time e-mail sign-up.`));
    if (!rows.length) out.append(h('div.empty', h('p', 'Nothing found within this radius.'), h('p.muted', 'OpenStreetMap coverage of Wi-Fi tags is patchy. Try 1.5–3 km, or use the free-Wi-Fi apps below.')));
    rows.slice(0, 60).forEach((r) => out.append(h('article.card.place',
      h('div.row.between', h('div', h('strong', r.name), h('small', r.kind)), h('span.pill', fmtDist(r.km))),
      h('div.row.wrap',
        r.sure ? h('span.pill.ok', '✓ tagged free Wi-Fi') : h('span.pill', 'chain – usually free'),
        r.ssid ? h('span.pill', `SSID: ${r.ssid}`) : null,
        r.hours ? h('span.pill', `🕒 ${r.hours}`) : null),
      h('a.btn.sm', { href: links.gmapsPlace(r), target: '_blank', rel: 'noopener' }, '↗ Directions'))));
  };

  const go = async () => {
    clear(out).append(h('p.muted', 'Searching for free Wi-Fi…'));
    try {
      const c = await resolveCenter(cp.value);
      const around = `(around:${radius},${c.lat},${c.lng})`;
      const chainRe = 'Starbucks|スターバックス|스타벅스|7-Eleven|セブン-イレブン|Seven-Eleven|ローソン|Lawson|ファミリーマート|FamilyMart|Tully|タリーズ|Doutor|ドトール|McDonald|マクドナルド|맥도날드|투썸|Twosome|이디야|Ediya|CU|GS25';
      const q = `[out:json][timeout:25];(` +
        `nwr["internet_access"="wlan"]["internet_access:fee"="no"]${around};` +
        `nwr["internet_access"="wlan"]["fee"="no"]${around};` +
        `nwr["wifi"="free"]${around};` +
        (includeChains ? `nwr["name"~"^(${chainRe})"]["amenity"~"cafe|fast_food|restaurant"]${around};nwr["shop"="convenience"]["brand"~"^(${chainRe})"]${around};` : '') +
        `);out center 150;`;
      const els = await overpass(q);
      const seen = new Set();
      const rows = els.map((e) => ({ e, p: elCoords(e) })).filter((x) => x.p).map(({ e, p }) => {
        const t = e.tags || {};
        const sure = t.internet_access === 'wlan' || t.wifi === 'free';
        return { name: elName(t) || 'Wi-Fi hotspot', kind: [t.amenity || t.shop || t.tourism || t.public_transport, t['internet_access:operator']].filter(Boolean).join(' · ').replace(/_/g, ' '), lat: p.lat, lng: p.lng, km: distKm(c, p), sure, ssid: t['internet_access:ssid'], hours: t.opening_hours };
      }).filter((r) => { const k = r.name + r.lat.toFixed(4); if (seen.has(k)) return false; seen.add(k); return true; })
        .sort((a, b) => (b.sure - a.sure) || a.km - b.km);
      layers.wifi = rows.map((r) => ({ lat: r.lat, lng: r.lng, name: r.name, sure: r.sure }));
      bump();
      S.cache.set('wifi', { c, rows });
      show(rows, c);
    } catch (e) {
      const c = S.cache.get('wifi');
      clear(out).append(h('p.warn', `Couldn’t reach the map service (${e.message}).`));
      if (c) { out.append(h('p.muted', 'Showing your last search instead:')); show(c.v.rows, c.v.c, c.at); }
    }
  };

  root.replaceChildren(
    h('section.card',
      h('h3', 'Free Wi-Fi'),
      h('div.row.wrap', cp.el, field('Radius', rad), h('label.row', chains, h('span', 'Include chains')), h('button.btn.primary', { onclick: go }, 'Find Wi-Fi')),
      h('p.muted.small', 'Results are pinned on the map above and saved so you can still see them offline.')),
    out,
    ...WIFI_PROGRAMS.map((g) => h('section.card', h('h3', g.title), h('ul', g.items.map((i) => h('li', i))))));

  const cached = S.cache.get('wifi');
  if (cached) show(cached.v.rows, cached.v.c, cached.at);
}
