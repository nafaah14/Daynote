/**
 * Local adapter. Same interface as the Firestore adapter, so the app runs
 * with no config at all and you can switch backends without touching a module.
 */
const KEY = 'daybook.records.v1';

function readAll() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); }
  catch { return {}; }
}

function writeAll(map) {
  localStorage.setItem(KEY, JSON.stringify(map));
}

const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

export function createLocalAdapter() {
  return {
    async put(record) {
      const map = readAll();
      map[record.id] = record;
      writeAll(map);
      notify();
      return record;
    },

    /**
     * Write many at once. Without this, importing a few thousand rows
     * re-reads and re-parses the whole store on every single record —
     * quadratic, and enough to lock the browser up.
     */
    async bulkPut(records) {
      const map = readAll();
      records.forEach((r) => { map[r.id] = r; });
      writeAll(map);
      notify();
      return records.length;
    },

    async get(id) {
      return readAll()[id] || null;
    },

    async all() {
      return Object.values(readAll());
    },

    async remove(id) {
      const map = readAll();
      delete map[id];
      writeAll(map);
      notify();
    },

    subscribe(fn) {
      listeners.add(fn);
      const onStorage = (e) => { if (e.key === KEY) fn(); };
      window.addEventListener('storage', onStorage);
      return () => { listeners.delete(fn); window.removeEventListener('storage', onStorage); };
    },
  };
}
