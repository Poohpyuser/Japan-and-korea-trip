// Attachments (PDF tickets, booking screenshots) and hero photos live in IndexedDB, not localStorage,
// so a few MB of files can't blow the ~5 MB localStorage quota that holds the itinerary.
const DB = 'trip-files';
let dbp;
const open = () => (dbp ||= new Promise((res, rej) => {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore('files');
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
}));
const tx = async (mode, fn) => {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction('files', mode);
    const req = fn(t.objectStore('files'));
    t.oncomplete = () => res(req?.result);
    t.onerror = () => rej(t.error);
  });
};
export const putFile = (id, blob) => tx('readwrite', (s) => s.put(blob, id)).catch(() => { throw new Error('Could not save the file on this device (storage full or blocked).'); });
export const getFile = (id) => tx('readonly', (s) => s.get(id)).catch(() => null);
export const delFile = (id) => tx('readwrite', (s) => s.delete(id)).catch(() => {});
