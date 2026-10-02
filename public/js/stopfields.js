// Shared form block used by every "edit stop" sheet: how you get there, an alarm, and attached files.
import { h, field, input, toast, uid, resizeImage } from './util.js';
import { MOVES } from './data.js';
import { putFile, delFile, getFile } from './docs.js';
import { icon } from './icons.js';

const MAX_FILE = 12 * 1024 * 1024;

export function extraFields(stop = {}) {
  let move = stop.move || '';
  const docs = [...(stop.docs || [])];
  const removed = [];
  const added = [];
  const alarm = input({ type: 'time', value: stop.alarm || '' });

  const moveRow = h('div.chips.wrap');
  const drawMoves = () => {
    moveRow.replaceChildren(...Object.entries(MOVES).map(([k, [emoji, label]]) =>
      h('button.chip', { type: 'button', class: move === k ? 'on' : '', onclick: () => { move = move === k ? '' : k; drawMoves(); } }, `${emoji} ${label}`)));
  };
  drawMoves();

  const list = h('ul.plain.files');
  const drawFiles = () => {
    list.replaceChildren(...docs.map((d) => fileRow(d.name, () => { docs.splice(docs.indexOf(d), 1); removed.push(d.id); drawFiles(); })),
      ...added.map((a) => fileRow(a.file.name + ' (new)', () => { added.splice(added.indexOf(a), 1); drawFiles(); })));
  };
  const fileRow = (name, onRemove) => h('li.row.between', h('span.row', icon('file', 16), h('span', name)), h('button.icon-btn', { type: 'button', 'aria-label': 'Remove file', onclick: onRemove }, icon('x', 16)));
  drawFiles();

  const picker = h('input', {
    type: 'file', multiple: true, accept: 'application/pdf,image/*', hidden: true,
    onchange: (e) => {
      for (const f of e.target.files) {
        if (f.size > MAX_FILE) { toast(`${f.name} is over 12 MB`); continue; }
        added.push({ id: uid(), file: f });
      }
      e.target.value = ''; drawFiles();
    },
  });

  const el = h('div.stack',
    h('div.field', h('span', 'How do you get there?'), moveRow),
    field('Alarm (rings while the app is open; the calendar file rings on your phone)', alarm),
    h('div.field', h('span', 'Attachments (tickets, bookings)'), list,
      h('button.btn.sm', { type: 'button', onclick: () => picker.click() }, icon('clip', 16), 'Add PDF / photo'), picker));

  // Call when the user presses Save: writes new files to IndexedDB, deletes removed ones, updates `target`.
  async function apply(target) {
    for (const id of removed) await delFile(id);
    for (const a of added) {
      const isImg = a.file.type.startsWith('image/');
      const blob = isImg ? await resizeImage(a.file, 1600, 0.85) : a.file;
      await putFile(a.id, blob);
      docs.push({ id: a.id, name: a.file.name, type: blob.type || a.file.type });
    }
    added.length = 0; removed.length = 0; // safe to call again if the caller's own validation fails afterwards
    target.move = move; target.alarm = alarm.value; target.docs = docs;
  }
  return { el, apply };
}

// Open a stored attachment in a new tab. The tab is opened synchronously so iOS Safari doesn't block it.
export async function openDoc(meta) {
  const w = window.open('', '_blank');
  const blob = await getFile(meta.id);
  if (!blob) { w?.close(); return toast('That file isn’t on this device (it isn’t included in share links).'); }
  const url = URL.createObjectURL(blob);
  if (w) w.location.href = url;
  else { const a = h('a', { href: url, download: meta.name }); document.body.append(a); a.click(); a.remove(); }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
