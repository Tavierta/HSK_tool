// Idioma de las definiciones: español (vocab-es.js) o inglés (vocab.js).
import { VOCAB, F } from './vocab.js';
import { ES } from './vocab-es.js';
import { settings } from './store.js';

const esById = new Map(VOCAB.map((w, i) => [w[F.N], ES[i]]));

export const LANGS = [{ v: 'es', l: 'Español' }, { v: 'en', l: 'English' }];

export function esOf(w) { return esById.get(w[F.N]) || w[F.EN]; }
export function enOf(w) { return w[F.EN]; }

/** Definicion en el idioma elegido. */
export function def(w) {
  return settings.defLang === 'en' ? enOf(w) : esOf(w);
}

/** Definicion en el otro idioma, o '' si no se quiere mostrar. */
export function def2(w) {
  if (!settings.showOtherLang) return '';
  return settings.defLang === 'en' ? esOf(w) : enOf(w);
}

/** Nota del HSK ("more uses at HSK 4: adv.") en el idioma elegido. */
export function noteOf(w) {
  const n = w[F.NOTE];
  if (!n || settings.defLang === 'en') return n;
  return n.replace(/more uses at HSK/g, 'más usos en HSK')
    .replace(/new meaning \(also HSK/g, 'acepción nueva (también HSK');
}
