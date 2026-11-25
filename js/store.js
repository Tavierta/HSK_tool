// Persistencia en IndexedDB: progreso por palabra, dias, sesiones y ajustes.

const DB_NAME = 'hsk-flash';
const DB_VER = 1;
export const STORE_P = 'progress', STORE_D = 'days', STORE_S = 'sessions', STORE_M = 'meta';

export const DEFAULTS = {
  theme: 'auto',           // auto | light | dark
  hanziSize: 72,           // px
  threshold: 20,           // aciertos acumulados para "aprendida"
  minDir: 5,               // minimo por direccion (0 = desactivado)
  penalty: 1,              // cuanto resta un fallo
  dailyGoal: 30,           // tarjetas/dia
  reminderOn: false,
  reminderHour: 20,
  reminderMin: 0,
  tones: true,             // colorear pinyin por tono
  strictTones: false,      // exigir tonos al escribir pinyin
  showPos: true,
  showNote: true,
  showPinyinFront: false,  // mostrar pinyin en la cara frontal
  reviewDays: 0,           // 0 = las aprendidas no vuelven solas
};

let db = null;

export function open() {
  if (db) return Promise.resolve(db);
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = (e) => {
      const d = req.result;
      if (!d.objectStoreNames.contains(STORE_P)) {
        const p = d.createObjectStore(STORE_P, { keyPath: 'id' });
        p.createIndex('due', 'due');
        p.createIndex('L', 'L');
      }
      if (!d.objectStoreNames.contains(STORE_D)) d.createObjectStore(STORE_D, { keyPath: 'date' });
      if (!d.objectStoreNames.contains(STORE_S)) d.createObjectStore(STORE_S, { keyPath: 'ts' });
      if (!d.objectStoreNames.contains(STORE_M)) d.createObjectStore(STORE_M);
    };
    req.onsuccess = () => { db = req.result; res(db); };
    req.onerror = () => rej(req.error);
  });
}

function tx(stores, mode) {
  return db.transaction(stores, mode);
}
function wrap(req) {
  return new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
}
export function all(store) {
  return wrap(tx([store], 'readonly').objectStore(store).getAll());
}
export function put(store, val, key) {
  return wrap(tx([store], 'readwrite').objectStore(store).put(val, key));
}
export function get(store, key) {
  return wrap(tx([store], 'readonly').objectStore(store).get(key));
}
export function clearStore(store) {
  return wrap(tx([store], 'readwrite').objectStore(store).clear());
}
export function putMany(store, vals) {
  const t = tx([store], 'readwrite'), os = t.objectStore(store);
  for (const v of vals) os.put(v);
  return new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); });
}

// --- Ajustes -------------------------------------------------------------

export let settings = { ...DEFAULTS };

export async function loadSettings() {
  const s = await get(STORE_M, 'settings');
  settings = { ...DEFAULTS, ...(s || {}) };
  return settings;
}
export async function saveSettings(patch) {
  Object.assign(settings, patch);
  await put(STORE_M, { ...settings }, 'settings');
  return settings;
}

// --- Progreso ------------------------------------------------------------

export function newRecord(id) {
  return { id, t: 0, r: 0, p: 0, ok: 0, ko: 0, L: 0, M: 0, H: 0, e: 2.5, iv: 0, due: 0, reps: 0, lap: 0, seen: 0 };
}

/** Mapa id -> registro, cargado en memoria al arrancar (max 5400 registros). */
export const prog = new Map();

export async function loadProgress() {
  prog.clear();
  for (const r of await all(STORE_P)) prog.set(r.id, r);
  return prog;
}
export function rec(id) {
  let r = prog.get(id);
  if (!r) { r = newRecord(id); prog.set(id, r); }
  return r;
}
export function isLearned(r, s = settings) {
  if (!r) return false;
  if (r.M === 1) return true;
  if (r.M === 2) return false;
  return r.t >= s.threshold && r.r >= s.minDir && r.p >= s.minDir;
}
export function flush(ids) {
  return putMany(STORE_P, [...ids].map((id) => prog.get(id)).filter(Boolean));
}

// --- Dias / racha --------------------------------------------------------

export function today(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function newDay(date) {
  return { date, c: 0, ok: 0, ko: 0, s: 0, nl: 0 };
}
export async function dayRec(date = today()) {
  return (await get(STORE_D, date)) || newDay(date);
}
export async function bumpDay(patch, date = today()) {
  const d = await dayRec(date);
  for (const k of ['c', 'ok', 'ko', 's', 'nl']) if (patch[k]) d[k] += patch[k];
  await put(STORE_D, d);
  return d;
}
export function streak(days, goal) {
  // dias consecutivos (hasta hoy o ayer) cumpliendo la meta
  const map = new Map(days.map((d) => [d.date, d]));
  let n = 0;
  const d = new Date();
  if (!(map.get(today(d))?.c >= goal)) d.setDate(d.getDate() - 1);
  for (;;) {
    const r = map.get(today(d));
    if (r && r.c >= goal) { n++; d.setDate(d.getDate() - 1); } else break;
  }
  return n;
}

// --- Export / import -----------------------------------------------------

export async function exportJSON() {
  const [p, d, s, m] = await Promise.all([all(STORE_P), all(STORE_D), all(STORE_S), get(STORE_M, 'settings')]);
  return {
    app: 'hsk-flash', version: 1, exportedAt: new Date().toISOString(),
    settings: m || settings, progress: p, days: d, sessions: s,
  };
}

export async function importJSON(data, mode = 'replace') {
  if (!data || data.app !== 'hsk-flash') throw new Error('El archivo no es una copia de HSK Flash.');
  if (mode === 'replace') {
    await Promise.all([clearStore(STORE_P), clearStore(STORE_D), clearStore(STORE_S)]);
    if (data.progress) await putMany(STORE_P, data.progress);
    if (data.days) await putMany(STORE_D, data.days);
    if (data.sessions) await putMany(STORE_S, data.sessions);
  } else {
    // fusionar: suma de contadores, se queda el mayor progreso
    const cur = new Map((await all(STORE_P)).map((r) => [r.id, r]));
    for (const r of data.progress || []) {
      const c = cur.get(r.id);
      if (!c) cur.set(r.id, r);
      else {
        c.t = Math.max(c.t, r.t); c.r = Math.max(c.r, r.r); c.p = Math.max(c.p, r.p);
        c.ok += r.ok; c.ko += r.ko; c.reps += r.reps; c.lap += r.lap;
        c.H = c.H || r.H; c.M = c.M || r.M;
        c.due = Math.min(c.due || Infinity, r.due || Infinity) || 0;
        c.iv = Math.max(c.iv, r.iv); c.seen = Math.max(c.seen, r.seen);
      }
    }
    await putMany(STORE_P, [...cur.values()]);
    const curD = new Map((await all(STORE_D)).map((d) => [d.date, d]));
    for (const d of data.days || []) {
      const c = curD.get(d.date);
      if (!c) curD.set(d.date, d);
      else for (const k of ['c', 'ok', 'ko', 's', 'nl']) c[k] += d[k] || 0;
    }
    await putMany(STORE_D, [...curD.values()]);
    if (data.sessions?.length) await putMany(STORE_S, data.sessions);
  }
  if (data.settings) await put(STORE_M, { ...DEFAULTS, ...data.settings }, 'settings');
  await loadSettings();
  await loadProgress();
}

export async function resetAll() {
  await Promise.all([clearStore(STORE_P), clearStore(STORE_D), clearStore(STORE_S)]);
  prog.clear();
}
