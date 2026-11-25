// Construccion de la cola de estudio y estado de la sesion.
import { VOCAB, F } from './vocab.js';
import { prog, rec, isLearned, settings } from './store.js';

export const MODES = {
  clasica: { label: 'Clásica', icon: '◧', dir: 'r', desc: 'Hanzi → tapas → me lo sé / no' },
  test4:   { label: 'Test 4 opciones', icon: '◉', dir: 'r', desc: 'Hanzi → elige el significado' },
  inversa: { label: 'Inversa', icon: '⇄', dir: 'p', desc: 'Significado → elige el hanzi' },
  pinyin:  { label: 'Escribir pinyin', icon: 'Aa', dir: 'p', desc: 'Hanzi → teclea el pinyin' },
  match:   { label: 'Emparejar 6×6', icon: '⊞', dir: 'r', desc: 'Une 6 hanzi con sus 6 significados' },
};

export const POS_LIST = ['n.', 'v.', 'adj.', 'adv.', 'm.w.', 'pron.', 'num.', 'num.+m.w.',
  'conj.', 'prep.', 'part.', 'interj.', 'onom.', 'prefix', 'suffix'];

export const DEFAULT_CONFIG = {
  levels: [1],
  pos: [],                 // vacio = todas
  estado: 'nuevas',        // nuevas | falladas | todas | aprendidas
  order: 'srs',            // srs | aleatorio | falladas | lista
  size: 20,                // 0 = sin limite
  modes: ['clasica'],
};

export function byId(id) { return VOCAB[id - 1]; }

export function posOf(w) {
  return (w[F.POS] || '').split(',').map((s) => s.trim()).filter(Boolean);
}

/** Palabras que cumplen los filtros (sin ordenar ni limitar). */
export function filterPool(cfg) {
  const lv = new Set(cfg.levels);
  const ps = cfg.pos && cfg.pos.length ? new Set(cfg.pos) : null;
  const out = [];
  for (const w of VOCAB) {
    if (!lv.has(w[F.LVL])) continue;
    if (ps && !posOf(w).some((p) => ps.has(p))) continue;
    const r = prog.get(w[F.N]);
    const learned = isLearned(r);
    if (cfg.estado === 'nuevas' && learned) continue;
    if (cfg.estado === 'aprendidas' && !learned) continue;
    if (cfg.estado === 'falladas' && !(r && r.ko > 0 && !learned)) continue;
    out.push(w);
  }
  return out;
}

export function orderPool(pool, order) {
  const now = Date.now();
  const arr = pool.slice();
  if (order === 'lista') return arr.sort((a, b) => a[F.N] - b[F.N]);
  if (order === 'aleatorio') {
    return arr.map((w) => {
      const r = prog.get(w[F.N]);
      return [Math.random() - (r && r.H ? 0.5 : 0), w];
    }).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  }
  if (order === 'falladas') {
    return arr.sort((a, b) => {
      const ra = prog.get(a[F.N]) || {}, rb = prog.get(b[F.N]) || {};
      return (rb.H || 0) - (ra.H || 0) || (rb.ko || 0) - (ra.ko || 0) || (ra.t || 0) - (rb.t || 0) || a[F.N] - b[F.N];
    });
  }
  // srs: vencidas -> nuevas -> futuras
  const group = (r) => (!r || !r.seen ? 1 : (r.due <= now ? 0 : 2));
  return arr.sort((a, b) => {
    const ra = prog.get(a[F.N]), rb = prog.get(b[F.N]);
    const ga = group(ra), gb = group(rb);
    if (ga !== gb) return ga - gb;
    const ha = ra && ra.H ? 1 : 0, hb = rb && rb.H ? 1 : 0;
    if (ha !== hb) return hb - ha;
    if (ga === 1) return a[F.N] - b[F.N];
    return (ra?.due || 0) - (rb?.due || 0);
  });
}

export function buildQueue(cfg) {
  const ordered = orderPool(filterPool(cfg), cfg.order);
  const size = cfg.size > 0 ? Math.min(cfg.size, ordered.length) : ordered.length;
  return ordered.slice(0, size);
}

/** Distractores: misma categoria gramatical y nivel si se puede. */
export function distractors(w, n, pool) {
  const out = [], seen = new Set([w[F.N]]), seenTxt = new Set([w[F.EN]]);
  const cand = pool && pool.length > n * 4 ? pool : VOCAB;
  const sameLvl = cand.filter((x) => x[F.LVL] === w[F.LVL] && x[F.N] !== w[F.N]);
  const pick = (list) => {
    let guard = 0;
    while (out.length < n && guard++ < 400 && list.length) {
      const x = list[(Math.random() * list.length) | 0];
      if (seen.has(x[F.N]) || seenTxt.has(x[F.EN])) continue;
      seen.add(x[F.N]); seenTxt.add(x[F.EN]); out.push(x);
    }
  };
  pick(sameLvl);
  if (out.length < n) pick(VOCAB);
  return out;
}

export function shuffle(a) {
  const x = a.slice();
  for (let i = x.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [x[i], x[j]] = [x[j], x[i]]; }
  return x;
}

export class Session {
  constructor(cfg) {
    this.cfg = { ...DEFAULT_CONFIG, ...cfg };
    this.words = buildQueue(this.cfg);
    this.pool = filterPool({ ...this.cfg, estado: 'todas' });
    this.steps = this.buildSteps();
    this.i = 0;
    this.ok = 0; this.ko = 0; this.cards = 0; this.learned = 0;
    this.again = [];            // ids fallados para repetir al final
    this.touched = new Set();
    this.ms = 0; this.t0 = Date.now(); this.paused = false;
    this.startedAt = Date.now();
  }

  buildSteps() {
    const modes = this.cfg.modes.length ? this.cfg.modes : ['clasica'];
    const hasMatch = modes.includes('match');
    const single = modes.filter((m) => m !== 'match');
    const steps = [];
    const q = this.words.slice();
    while (q.length) {
      // si solo hay emparejar, o toca emparejar y quedan >=4 palabras
      const useMatch = hasMatch && q.length >= 4 &&
        (single.length === 0 || Math.random() < 1 / modes.length);
      if (useMatch) {
        steps.push({ mode: 'match', words: q.splice(0, Math.min(6, q.length)) });
      } else {
        const m = single.length ? single[(Math.random() * single.length) | 0] : 'clasica';
        steps.push({ mode: m, words: [q.shift()] });
      }
    }
    return steps;
  }

  get total() { return this.steps.length; }
  get step() { return this.steps[this.i]; }
  get done() { return this.i >= this.steps.length; }

  advance() { this.i++; return this.step; }

  /** Reencola un fallo al final de la sesion (una sola vez). */
  requeue(word, mode) {
    if (this.again.includes(word[F.N])) return;
    this.again.push(word[F.N]);
    this.steps.push({ mode: mode === 'match' ? 'clasica' : mode, words: [word], retry: true });
  }

  elapsed() { return this.ms + (this.paused ? 0 : Date.now() - this.t0); }
  pause() { if (!this.paused) { this.ms += Date.now() - this.t0; this.paused = true; } }
  resume() { if (this.paused) { this.t0 = Date.now(); this.paused = false; } }
}
