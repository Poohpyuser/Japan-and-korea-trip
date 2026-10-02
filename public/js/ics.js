// iCalendar export. Japan and Korea are both UTC+9 with no daylight saving, so a fixed offset is exact.
import { parseISO, pad } from './util.js';

const esc = (t) => String(t || '').replace(/\\/g, '\\\\').replace(/[;,]/g, (c) => '\\' + c).replace(/\r?\n/g, '\\n');
const utc = (date, time, plusMin = 0) => {
  const d = parseISO(date);
  const [hh, mm] = time.split(':').map(Number);
  d.setHours(hh, mm + plusMin - 540, 0, 0);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00Z`;
};
const fold = (line) => (line.length <= 73 ? line : line.match(/.{1,73}/g).join('\r\n '));

// events: [{ uid, date, time, title, location?, note?, alarm?: 'HH:MM', minutes? }]
export function buildICS(events) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const out = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//trip-planner//EN', 'CALSCALE:GREGORIAN'];
  for (const e of events) {
    if (!e.time) continue;
    out.push('BEGIN:VEVENT', `UID:${e.uid}@trip-planner`, `DTSTAMP:${stamp}`, `DTSTART:${utc(e.date, e.time)}`, `DTEND:${utc(e.date, e.time, e.minutes || 60)}`, fold(`SUMMARY:${esc(e.title)}`));
    if (e.location) out.push(fold(`LOCATION:${esc(e.location)}`));
    if (e.note) out.push(fold(`DESCRIPTION:${esc(e.note)}`));
    if (e.alarm) {
      const [ah, am] = e.alarm.split(':').map(Number), [h, m] = e.time.split(':').map(Number);
      const before = Math.max(0, h * 60 + m - (ah * 60 + am));
      out.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(e.title)}`, `TRIGGER:-PT${before}M`, 'END:VALARM');
    }
    out.push('END:VEVENT');
  }
  out.push('END:VCALENDAR');
  return out.join('\r\n');
}
