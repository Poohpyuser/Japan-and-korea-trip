// AI tab / panel: ask questions, turn a reel (caption + screenshots) into places, draft a whole day.
// Everything goes through ONE Netlify function (/api/ai) that holds the API key; the phone never sees it.
import { h, clear, field, input, select, modal, toast, geocode, resizeImage, blobToBase64, todayISO, fmtDate } from './util.js';
import * as S from './store.js';
import { CITIES, CATS, MOVES, cityOptions } from './data.js';
import { icon } from './icons.js';

// ---------- transport ----------
export const getPass = () => { try { return localStorage.getItem('aiPass') || ''; } catch { return ''; } };
export const setPass = (v) => { try { localStorage.setItem('aiPass', v); } catch { /* ignore */ } };

function askPasscode() {
  return new Promise((resolve) => {
    const inp = input({ type: 'password', placeholder: 'Passcode', autocomplete: 'off', value: getPass() });
    const m = modal('AI passcode', h('div.stack', h('p', 'This site is protected so only you and your sister can use the AI. Enter the passcode you set as APP_PASSCODE in Netlify.'), inp), [
      { label: 'Cancel', onclick: () => resolve(null) },
      { label: 'Save', primary: true, onclick: () => { setPass(inp.value.trim()); resolve(inp.value.trim()); } },
    ]);
    m.el.addEventListener('close', () => resolve(null), { once: true });
  });
}

async function callAI(body, retry = true) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 70000);
  let res;
  try {
    res = await fetch('/api/ai', { method: 'POST', headers: { 'content-type': 'application/json', 'x-passcode': getPass() }, body: JSON.stringify(body), signal: ctl.signal });
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'The AI took too long. Try a shorter request.' : 'No connection to the AI service. Check your signal.');
  } finally { clearTimeout(timer); }
  let j = null;
  try { j = await res.json(); } catch { /* not JSON */ }
  if (res.status === 401 && retry) { if (await askPasscode()) return callAI(body, false); }
  if (!j) {
    const e = new Error(res.status === 404 ? 'The AI backend isn’t available here. It runs only on the deployed Netlify site (or with `netlify dev`).' : res.status === 504 || res.status === 502 ? 'The AI request timed out on the server. Try a shorter input or set AI_MODEL=claude-sonnet-5-5 in Netlify.' : `Unexpected response (${res.status}).`);
    e.code = res.status === 404 ? 'not_configured' : 'bad_response';
    throw e;
  }
  if (!j.ok) { const e = new Error(j.error || 'AI error'); e.code = j.code; throw e; }
  return j.data;
}

// A compact snapshot of the trip so the AI answers about YOUR plan. Kept under the function's 12k-char cap.
function tripContext(focusIdx = S.get().ui.day) {
  const st = S.get();
  const days = st.days.map((d, i) => ({ i, d }))
    .filter(({ i }) => Math.abs(i - focusIdx) <= 12)
    .map(({ i, d }) => `Day ${i + 1} ${d.date} ${CITIES[d.city]?.name}: ${d.stops.map((s) => `${s.time || '--:--'} ${S.stopTitle(s)}`).join(' | ') || '(empty)'}`);
  return JSON.stringify({
    today: todayISO(), trip: st.trip.name, dates: `${st.trip.start}..${st.trip.end}`, travellers: st.settings.names,
    focusDay: focusIdx + 1, itinerary: days, savedPlaces: st.places.slice(0, 60).map((p) => `${p.name} (${p.cat})`),
  });
}

// ---------- adding AI suggestions to the trip ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cityKeyFor = (txt) => {
  const t = (txt || '').toLowerCase();
  return Object.entries(CITIES).find(([, c]) => t.includes(c.name.toLowerCase().split(' ')[0]))?.[0];
};

async function locatePlace(p, cityHint) {
  const key = cityKeyFor(p.city) || cityHint;
  const c = CITIES[key] || CITIES.tokyo;
  let hit = null;
  try { hit = (await geocode(p.search_query || `${p.name} ${p.city}`, { lat: c.lat, lng: c.lng }))[0]; } catch { /* offline: save without coordinates */ }
  return S.addPlace({
    name: p.name, local: p.local_name || '', cat: p.category || 'other', note: p.why || p.note || '',
    lat: hit?.lat ?? null, lng: hit?.lng ?? null, address: hit?.address || p.city || '', country: hit?.country || c.country, city: key || cityHint,
  });
}

// ---------- UI ----------
let tab = 'ask';
const chat = { msgs: [], busy: false };
const imp = { text: '', files: [], results: null, summary: '', needs: '', busy: false };
const plan = { result: null, dayIdx: null, busy: false };
let notConfigured = false;
let pendingAsk = null;

export function openAI(opts = {}) {
  const body = h('div.ai-modal');
  const m = modal('AI assistant', body);
  renderAI(body, { ...opts, modal: m });
}

export function renderAI(root, opts = {}) {
  if (opts.mode) tab = { planday: 'plan', extract: 'import', chat: 'ask' }[opts.mode] || tab;
  if (opts.dayIdx != null) plan.dayIdx = opts.dayIdx;
  if (opts.text != null) { imp.text = opts.text; tab = 'import'; }
  if (opts.ask) { pendingAsk = opts.ask; tab = 'ask'; }
  const st = S.get();
  if (plan.dayIdx == null || plan.dayIdx >= st.days.length) plan.dayIdx = st.ui.day;

  const draw = () => {
    clear(root).append(...[
      h('div.seg', [['ask', '💬 Ask'], ['import', '📥 From a reel'], ['plan', '🪄 Plan a day']].map(([k, l]) => h('button', { class: tab === k ? 'on' : '', onclick: () => { tab = k; draw(); } }, l))),
      notConfigured ? setupHelp() : null,
      tab === 'ask' ? askView(draw) : tab === 'import' ? importView(draw, opts) : planView(draw, opts),
      h('p.muted.small.center', 'AI can be wrong about hours, prices and closures. Double-check before you go.'),
    ].filter(Boolean));
  };
  draw();
}

function setupHelp() {
  return h('div.card.callout', h('b', 'AI isn’t connected yet'),
    h('ol', h('li', 'Get an API key at console.anthropic.com.'), h('li', 'Netlify → Site configuration → Environment variables: add ANTHROPIC_API_KEY (and APP_PASSCODE so nobody else can spend your credit).'), h('li', 'Redeploy the site. The AI works on the Netlify URL, not on a local file.')));
}

function handleErr(e, draw) {
  if (e.code === 'not_configured') notConfigured = true;
  toast(e.message, 5000);
  draw();
}

// ----- Ask -----
const QUICK = ['Is my itinerary too packed?', 'Rainy-day backup for today', 'Where should we eat near my stops?', 'Best half-day trip from here?', 'What should we book in advance?'];
function askView(draw) {
  const box = h('div.chatlog');
  chat.msgs.forEach((m) => box.append(bubble(m, draw)));
  if (chat.busy) box.append(h('div.bubble.ai', h('span.typing', '● ● ●')));
  const inp = h('textarea', { rows: 2, placeholder: 'Ask anything about your trip…', onkeydown: (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } } });
  const send = async (txt) => {
    const q = (txt ?? inp.value).trim();
    if (!q || chat.busy) return;
    chat.msgs.push({ role: 'user', content: q }); chat.busy = true; draw();
    try {
      const data = await callAI({ mode: 'chat', context: tripContext(), messages: chat.msgs.map((m) => ({ role: m.role, content: m.content })) });
      chat.msgs.push({ role: 'assistant', content: data.reply, places: data.places });
    } catch (e) { chat.msgs.pop(); chat.busy = false; return handleErr(e, draw); }
    chat.busy = false; draw();
  };
  if (pendingAsk) { const q = pendingAsk; pendingAsk = null; setTimeout(() => send(q), 0); }
  return h('div.stack',
    box,
    chat.msgs.length ? null : h('div.chips.wrap', QUICK.map((q) => h('button.chip', { onclick: () => send(q) }, q))),
    h('div.chatbar', inp, h('button.btn.primary', { disabled: chat.busy ? true : null, onclick: () => send() }, icon('nav', 18))),
    chat.msgs.length ? h('button.btn.sm.ghost', { onclick: () => { chat.msgs = []; draw(); } }, 'Clear chat') : null);
}

function bubble(m, draw) {
  if (m.role === 'user') return h('div.bubble.me', m.content);
  return h('div.bubble.ai', h('div.md', m.content), (m.places || []).map((p) => placeCard(p)));
}

function placeCard(p, extra) {
  const st = S.get();
  const daySel = select([['', 'Saved only'], ...st.days.map((d, i) => [i, `Day ${i + 1}`])], '');
  const btn = h('button.btn.sm.primary', { onclick: async () => {
    btn.disabled = true; btn.textContent = 'Adding…';
    try {
      const place = await locatePlace(p, S.currentDay()?.city);
      if (daySel.value !== '') S.addStop(+daySel.value, { kind: 'place', placeId: place.id });
      btn.textContent = place.lat == null ? '✓ Added (no map pin)' : '✓ Added';
    } catch (e) { btn.disabled = false; btn.textContent = 'Add'; toast(e.message); }
  } }, 'Add');
  const cat = CATS[p.category] || CATS.other;
  return h('div.aiplace',
    h('div.row.between', h('div', h('strong', `${cat.icon} ${p.name}`), p.local_name ? h('small', p.local_name) : null), extra || null),
    h('small.muted', [p.city, p.why].filter(Boolean).join(' · ')),
    h('div.row.wrap', daySel, btn));
}

// ----- Import from a reel / post -----
function importView(draw, opts) {
  const txt = h('textarea', { rows: 5, placeholder: 'Paste the reel / post caption, the comments, or the link…', value: imp.text, oninput: (e) => { imp.text = e.target.value; } });
  const picker = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true, onchange: async (e) => {
    for (const f of e.target.files) {
      if (imp.files.length >= 4) { toast('Up to 4 screenshots'); break; }
      try { const blob = await resizeImage(f, 1280, 0.8); imp.files.push({ blob, url: URL.createObjectURL(blob) }); } catch (err) { toast(err.message); }
    }
    e.target.value = ''; draw();
  } });
  const cityHint = select(cityOptions(), S.currentDay()?.city || 'tokyo');
  const run = async () => {
    if (!imp.text.trim() && !imp.files.length) return toast('Paste a caption or add a screenshot first');
    imp.busy = true; imp.results = null; draw();
    try {
      const images = await Promise.all(imp.files.map(async (f) => ({ media_type: 'image/jpeg', data: await blobToBase64(f.blob) })));
      const hint = `Likely city: ${CITIES[cityHint.value].name}.`;
      const data = await callAI({ mode: 'extract', context: tripContext(), text: `${hint}\n${imp.text}`, images });
      Object.assign(imp, { results: data.places, summary: data.summary, needs: data.needs_more_info });
    } catch (e) { imp.busy = false; return handleErr(e, draw); }
    imp.busy = false; draw();
  };
  const onlyLink = /^\s*https?:\/\/\S+\s*$/.test(imp.text);
  return h('div.stack',
    h('div.card.callout',
      h('b', 'Turn a reel into a plan'),
      h('p.small', 'Instagram and TikTok don’t let apps read a video from its link, so give the AI what you can see: paste the caption (tap ⋯ → copy) and/or add screenshots of the frames showing place names, maps or signs. On Android, “Share → Trip Planner” from the reel fills this in for you.')),
    txt,
    onlyLink ? h('p.warn.small', 'A bare link has nothing to read. Paste the caption text or add screenshots.') : null,
    h('div.row.wrap', imp.files.map((f, i) => h('div.thumb', h('img', { src: f.url, alt: 'screenshot' }), h('button.icon-btn', { 'aria-label': 'Remove', onclick: () => { imp.files.splice(i, 1); draw(); } }, icon('x', 14)))),
      h('button.btn.sm', { onclick: () => picker.click() }, icon('camera', 16), 'Add screenshots'), picker),
    h('div.row.wrap', field('City', cityHint), h('button.btn.primary', { disabled: imp.busy ? true : null, onclick: run }, imp.busy ? 'Reading…' : [icon('ai', 18), 'Find places'])),
    imp.results ? importResults(draw, cityHint) : null);
}

function importResults(draw, cityHint) {
  const r = imp.results;
  return h('div.stack',
    imp.summary ? h('p', h('b', 'About: '), imp.summary) : null,
    !r.length ? h('p.muted', imp.needs || 'No specific places found.') : null,
    r.map((p) => placeCard(p, h('span.pill', { class: p.confidence === 'high' ? 'ok' : p.confidence === 'low' ? 'warnp' : '' }, p.confidence))),
    r.length > 1 ? h('button.btn', { onclick: async (e) => {
      e.target.disabled = true;
      for (const p of r) { e.target.textContent = `Saving ${p.name}…`; await locatePlace(p, cityHint.value); await sleep(1100); }
      toast(`Saved ${r.length} places`); e.target.textContent = '✓ All saved';
    } }, 'Save all to my places') : null);
}

// ----- Plan a day -----
function planView(draw) {
  const st = S.get();
  const dayIdx = plan.dayIdx;
  const day = st.days[dayIdx];
  if (!day) return h('p.muted', 'Create a trip first (Plan tab).');
  const daySel = select(st.days.map((d, i) => [i, `Day ${i + 1} · ${fmtDate(d.date)} · ${CITIES[d.city]?.name}`]), dayIdx, { onchange: (e) => { plan.dayIdx = +e.target.value; plan.result = null; draw(); } });
  const pace = select([['relaxed', 'Relaxed (3–4 stops)'], ['balanced', 'Balanced (5–6 stops)'], ['packed', 'Packed (7+ stops)']], 'balanced');
  const from = input({ type: 'time', value: '09:00' }), to = input({ type: 'time', value: '21:00' });
  const prefs = input({ type: 'text', placeholder: 'e.g. ramen lunch, teamLab, rainy-day friendly, no long walks' });
  const run = async () => {
    plan.busy = true; plan.result = null; draw();
    try {
      const text = `Plan day ${dayIdx + 1} (${day.date}) in ${CITIES[day.city].name}. Pace: ${pace.value}. Start about ${from.value}, finish about ${to.value}. Preferences: ${prefs.value || 'none'}. ${day.stops.length ? 'The day already has stops; keep them and fill the gaps unless they clash.' : ''}`;
      plan.result = await callAI({ mode: 'planday', context: tripContext(dayIdx), text });
    } catch (e) { plan.busy = false; return handleErr(e, draw); }
    plan.busy = false; draw();
  };
  return h('div.stack',
    field('Day', daySel), h('div.grid2', field('Start', from), field('Finish', to)), field('Pace', pace), field('Anything specific?', prefs),
    h('button.btn.primary', { disabled: plan.busy ? true : null, onclick: run }, plan.busy ? 'Planning…' : [icon('ai', 18), 'Draft this day']),
    plan.result ? planResult(draw, day) : null);
}

function planResult(draw, day) {
  const r = plan.result;
  const picked = new Set(r.stops.map((_, i) => i));
  const mode = select([['append', 'Add to the day'], ['replace', 'Replace the day']], day.stops.length ? 'append' : 'replace');
  const apply = h('button.btn.primary', { onclick: async () => {
    if (mode.value === 'replace' && day.stops.length) { day.stops = []; }
    apply.disabled = true;
    const idx = S.get().days.indexOf(day);
    let n = 0;
    for (const i of [...picked].sort((a, b) => a - b)) {
      const s = r.stops[i];
      apply.textContent = `Adding ${s.name}… (${++n}/${picked.size})`;
      const place = await locatePlace({ ...s, city: CITIES[day.city].name, why: s.note }, day.city);
      S.addStop(idx, { kind: 'place', placeId: place.id, time: /^\d{2}:\d{2}$/.test(s.time) ? s.time : '', move: s.move, note: s.note });
      await sleep(1100);
    }
    toast('Day updated'); apply.textContent = '✓ Done';
  } }, 'Add selected stops');
  return h('div.stack',
    h('h4', r.title),
    h('ul.plain', r.stops.map((s, i) => h('li.planrow',
      h('label.row', h('input', { type: 'checkbox', checked: true, onchange: (e) => { e.target.checked ? picked.add(i) : picked.delete(i); } }),
        h('div', h('b', `${s.time} ${(CATS[s.category] || CATS.other).icon} ${s.name}`), s.local_name ? h('small', ` ${s.local_name}`) : null, h('small.muted', `${MOVES[s.move]?.[0] || ''} ${s.duration_min} min · ${s.note}`)))))),
    r.tips?.length ? h('div.card.callout', h('b', 'Tips'), h('ul', r.tips.map((t) => h('li', t)))) : null,
    h('div.row.wrap', mode, apply));
}
