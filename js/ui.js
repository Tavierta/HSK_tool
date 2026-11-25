// Utilidades de DOM compartidas.
import { toneSpans } from './pinyin.js';
import { settings } from './store.js';

export function h(tag, props = {}, kids = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(e.dataset, v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of [].concat(kids)) {
    if (k == null || k === false) continue;
    e.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return e;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Pinyin con color por tono (el diacritico sigue siendo la pista principal). */
export function pinyinEl(pinyin, cls = 'pinyin') {
  const e = h('span', { class: cls });
  if (!settings.tones) { e.textContent = pinyin; return e; }
  for (const s of toneSpans(pinyin)) e.append(h('span', { class: 't' + s.tone, text: s.text }));
  return e;
}

/** append que ignora null/false (Element.append convertiria null en el texto "null"). */
export function add(el, ...kids) {
  for (const k of kids.flat()) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return el;
}

export function clear(e) { while (e.firstChild) e.removeChild(e.firstChild); return e; }

let toastTimer = null;
export function toast(msg, kind = '') {
  let t = $('#toast');
  if (!t) { t = h('div', { id: 'toast', class: 'toast' }); document.body.append(t); }
  t.className = 'toast show ' + kind;
  t.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast'; }, 2200);
}

/** Hoja inferior modal. Devuelve el elemento de contenido. */
export function sheet(title, kids, onClose) {
  const back = h('div', { class: 'sheet-back' });
  const body = h('div', { class: 'sheet-body' });
  const close = () => { back.remove(); onClose && onClose(); };
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  back.append(h('div', { class: 'sheet' }, [
    h('div', { class: 'sheet-head' }, [
      h('h3', { text: title }),
      h('button', { class: 'icon-btn', 'aria-label': 'Cerrar', onclick: close, html: '&times;' }),
    ]),
    body,
  ]));
  add(body, [].concat(kids));
  document.body.append(back);
  requestAnimationFrame(() => back.classList.add('open'));
  return { body, close };
}

export function fmtTime(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return s + ' s';
  const m = Math.floor(s / 60);
  if (m < 60) return m + ' min';
  const hh = Math.floor(m / 60);
  return hh + ' h ' + (m % 60) + ' min';
}
export function fmtPct(x) { return (x * 100).toFixed(x >= 0.995 || x === 0 ? 0 : 1).replace('.', ',') + '%'; }
export function fmtNum(n) { return n.toLocaleString('es-ES'); }
