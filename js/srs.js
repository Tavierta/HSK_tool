// Puntuacion de respuestas + programacion hibrida (SM-2 simplificado).
import { settings, rec, isLearned } from './store.js';

const DAY = 86400000;
const LAPSE_MS = 10 * 60000;   // un fallo vuelve a los 10 min
export const DIR_REC = 'r';    // reconocimiento: hanzi -> significado
export const DIR_PRO = 'p';    // produccion: significado/pinyin -> hanzi

/**
 * Aplica una respuesta. Devuelve {justLearned, wasLearned, r}.
 * correct: boolean. dir: 'r' | 'p'.
 */
export function answer(id, correct, dir) {
  const s = settings;
  const r = rec(id);
  const wasLearned = isLearned(r, s);
  const now = Date.now();
  r.seen = now;

  if (correct) {
    r.ok++; r.reps++;
    r.t++;
    r[dir]++;
    r.e = Math.min(3.0, r.e + 0.06);
    r.iv = r.iv <= 0 ? 1 : (r.iv === 1 ? 3 : Math.round(r.iv * r.e));
    if (r.H) r.iv = Math.max(1, Math.round(r.iv * 0.6));  // "difícil" vuelve antes
    r.due = now + r.iv * DAY;
  } else {
    r.ko++; r.lap++;
    r.t = Math.max(0, r.t - s.penalty);
    r[dir] = Math.max(0, r[dir] - s.penalty);
    r.e = Math.max(1.3, r.e - 0.2);
    r.iv = 0;
    r.due = now + LAPSE_MS;
  }

  const nowLearned = isLearned(r, s);
  r.L = nowLearned ? 1 : 0;
  return { r, wasLearned, justLearned: nowLearned && !wasLearned, unlearned: !nowLearned && wasLearned };
}

/** Progreso hacia "aprendida" en 0..1 (combina global y direcciones). */
export function mastery(r, s = settings) {
  if (!r) return 0;
  if (r.M === 1) return 1;
  const parts = [Math.min(1, r.t / s.threshold)];
  if (s.minDir > 0) parts.push(Math.min(1, r.r / s.minDir), Math.min(1, r.p / s.minDir));
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}

export function dueNow(r, now = Date.now()) {
  return !r || !r.due || r.due <= now;
}

export function setManual(id, state) {
  const r = rec(id);
  r.M = state;                       // 0 auto, 1 aprendida, 2 no aprendida
  r.L = isLearned(r) ? 1 : 0;
  return r;
}
export function toggleHard(id) {
  const r = rec(id);
  r.H = r.H ? 0 : 1;
  return r;
}
