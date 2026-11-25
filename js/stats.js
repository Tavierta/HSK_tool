// Estadisticas y graficos (SVG propio, sin librerias).
import { VOCAB, F } from './vocab.js';
import { prog, isLearned, settings, all, STORE_D, today, streak } from './store.js';
import { h, clear, fmtNum, fmtPct, fmtTime } from './ui.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const s = (tag, props = {}, kids = []) => {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(props)) if (v != null && v !== false) e.setAttribute(k, v);
  for (const k of [].concat(kids)) if (k) e.append(k);
  return e;
};

export const LEVELS = [1, 2, 3, 4, 5, 6];

export function compute(days) {
  const per = {};
  for (const lv of LEVELS) per[lv] = { total: 0, learned: 0, started: 0, hard: 0 };
  let learned = 0, started = 0, hard = 0, ok = 0, ko = 0;
  for (const w of VOCAB) {
    const lv = w[F.LVL], r = prog.get(w[F.N]);
    per[lv].total++;
    if (r) {
      ok += r.ok; ko += r.ko;
      if (r.t > 0 || r.ok > 0) { per[lv].started++; started++; }
      if (r.H) { per[lv].hard++; hard++; }
      if (isLearned(r)) { per[lv].learned++; learned++; }
    }
  }
  const secs = days.reduce((a, d) => a + (d.s || 0), 0);
  const cards = days.reduce((a, d) => a + (d.c || 0), 0);
  const t = today();
  const todayRec = days.find((d) => d.date === t) || { c: 0, ok: 0, ko: 0, s: 0 };
  const last7 = lastNDays(days, 7);
  return {
    per, learned, started, hard, ok, ko, secs, cards,
    total: VOCAB.length,
    acc: ok + ko ? ok / (ok + ko) : 0,
    acc7: last7.ok + last7.ko ? last7.ok / (last7.ok + last7.ko) : 0,
    cards7: last7.c, secs7: last7.s,
    today: todayRec,
    streak: streak(days, settings.dailyGoal),
  };
}

function lastNDays(days, n) {
  const from = new Date(); from.setDate(from.getDate() - (n - 1));
  const key = today(from);
  return days.filter((d) => d.date >= key)
    .reduce((a, d) => ({ c: a.c + d.c, ok: a.ok + d.ok, ko: a.ko + d.ko, s: a.s + d.s }), { c: 0, ok: 0, ko: 0, s: 0 });
}

export function loadDays() { return all(STORE_D); }

// --- piezas de UI --------------------------------------------------------

export function tile(label, value, sub) {
  return h('div', { class: 'tile' }, [
    h('div', { class: 'tile-v', text: value }),
    h('div', { class: 'tile-l', text: label }),
    sub ? h('div', { class: 'tile-s', text: sub }) : null,
  ]);
}

/** Barras de progreso por nivel: magnitud -> un solo tono (azul secuencial). */
export function levelBars(st) {
  const rows = LEVELS.map((lv) => {
    const p = st.per[lv];
    const pct = p.total ? p.learned / p.total : 0;
    return h('div', { class: 'lvrow' }, [
      h('span', { class: 'lvname', text: 'HSK ' + lv }),
      h('div', { class: 'lvbar', role: 'img', 'aria-label': `HSK ${lv}: ${p.learned} de ${p.total} aprendidas` }, [
        h('div', { class: 'lvbar-seen', style: { width: (p.total ? (p.started / p.total) * 100 : 0) + '%' } }),
        h('div', { class: 'lvbar-fill', style: { width: pct * 100 + '%' } }),
      ]),
      h('span', { class: 'lvval', text: `${fmtNum(p.learned)}/${fmtNum(p.total)}` }),
    ]);
  });
  return h('div', { class: 'lvbars' }, [
    ...rows,
    h('div', { class: 'legend small' }, [
      h('span', { class: 'lg' }, [h('i', { class: 'sw sw-fill' }), 'aprendidas']),
      h('span', { class: 'lg' }, [h('i', { class: 'sw sw-seen' }), 'empezadas']),
    ]),
  ]);
}

/** Barras apiladas de los ultimos N dias. 2 series: aciertos / fallos. */
export function dailyChart(days, n = 30) {
  const map = new Map(days.map((d) => [d.date, d]));
  const list = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = today(d);
    const r = map.get(key) || { ok: 0, ko: 0, c: 0, s: 0 };
    list.push({ date: key, d, ok: r.ok || 0, ko: r.ko || 0, c: r.c || 0, s: r.s || 0 });
  }
  const max = Math.max(settings.dailyGoal, ...list.map((x) => x.ok + x.ko), 1);
  const W = 100, H = 46, pad = 1.2;
  const bw = (W - pad * 2) / n;
  const barW = Math.max(1.6, bw * 0.62);
  const y = (v) => H - (v / max) * (H - 6);
  const g = [];

  // rejilla discreta + linea de meta
  for (const f of [0.5, 1]) {
    g.push(s('line', { x1: 0, x2: W, y1: y(max * f), y2: y(max * f), class: 'grid' }));
  }
  const goalY = y(settings.dailyGoal);
  g.push(s('line', { x1: 0, x2: W, y1: goalY, y2: goalY, class: 'goal' }));

  const maxIdx = list.reduce((bi, x, i) => (x.ok + x.ko > list[bi].ok + list[bi].ko ? i : bi), 0);
  list.forEach((x, i) => {
    const cx = pad + bw * i + bw / 2;
    const tot = x.ok + x.ko;
    if (!tot) return;
    const hOk = (x.ok / max) * (H - 6), hKo = (x.ko / max) * (H - 6);
    const gap = hKo > 0 && hOk > 0 ? 0.6 : 0;   // separacion de 2px aprox entre segmentos
    // aciertos (abajo, anclado a la base, extremo redondeado solo si es el tope)
    if (hOk > 0) {
      g.push(s('rect', {
        x: cx - barW / 2, y: H - hOk, width: barW, height: hOk,
        rx: hKo > 0 ? 0 : Math.min(1.2, barW / 2), class: 'b-ok',
      }));
    }
    if (hKo > 0) {
      g.push(s('rect', {
        x: cx - barW / 2, y: H - hOk - hKo - gap, width: barW, height: Math.max(0.6, hKo),
        rx: Math.min(1.2, barW / 2), class: 'b-ko',
      }));
    }
    if (i === maxIdx && tot > 0) {
      g.push(s('text', { x: cx, y: H - hOk - hKo - gap - 1.6, class: 'blabel', 'text-anchor': 'middle' }, [
        document.createTextNode(String(tot)),
      ]));
    }
    g.push(s('rect', {
      x: pad + bw * i, y: 0, width: bw, height: H, class: 'hit',
      'data-i': i,
    }));
  });

  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart',
    role: 'img', 'aria-label': `Actividad de los últimos ${n} días` }, g);
  const tip = h('div', { class: 'tip' });
  const wrap = h('div', { class: 'chart-wrap' }, [svg, tip]);

  svg.addEventListener('pointermove', (e) => {
    const t = e.target.closest('.hit');
    if (!t) { tip.classList.remove('on'); return; }
    const x = list[+t.dataset.i];
    tip.innerHTML = '';
    tip.append(
      h('strong', { text: x.d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }) }),
      h('span', {}, [h('i', { class: 'sw sw-ok' }), `aciertos: ${x.ok}`]),
      h('span', {}, [h('i', { class: 'sw sw-ko' }), `fallos: ${x.ko}`]),
      h('span', { class: 'dim', text: `${x.c} tarjetas · ${fmtTime(x.s * 1000)}` }),
    );
    const r = wrap.getBoundingClientRect();
    tip.style.left = Math.max(4, Math.min(r.width - 150, e.clientX - r.left - 70)) + 'px';
    tip.classList.add('on');
  });
  svg.addEventListener('pointerleave', () => tip.classList.remove('on'));

  const table = h('table', { class: 'dtable hidden' }, [
    h('thead', {}, [h('tr', {}, [h('th', { text: 'Día' }), h('th', { text: 'Aciertos' }), h('th', { text: 'Fallos' }), h('th', { text: 'Tarjetas' })])]),
    h('tbody', {}, list.filter((x) => x.c).reverse().map((x) => h('tr', {}, [
      h('td', { text: x.date }), h('td', { text: x.ok }), h('td', { text: x.ko }), h('td', { text: x.c }),
    ]))),
  ]);
  const toggle = h('button', {
    class: 'link-btn', text: 'Ver tabla',
    onclick: () => {
      const on = table.classList.toggle('hidden');
      toggle.textContent = on ? 'Ver tabla' : 'Ver gráfico';
      wrap.classList.toggle('hidden', !on);
    },
  });

  return h('div', {}, [
    h('div', { class: 'chart-head' }, [
      h('div', { class: 'legend' }, [
        h('span', { class: 'lg' }, [h('i', { class: 'sw sw-ok' }), 'aciertos']),
        h('span', { class: 'lg' }, [h('i', { class: 'sw sw-ko' }), 'fallos']),
        h('span', { class: 'lg' }, [h('i', { class: 'sw sw-goal' }), 'meta ' + settings.dailyGoal]),
      ]),
      toggle,
    ]),
    wrap,
    h('div', { class: 'axis' }, [
      h('span', { text: list[0].d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) }),
      h('span', { text: 'hoy' }),
    ]),
    table,
  ]);
}

/** Heatmap anual tipo GitHub. Magnitud -> rampa secuencial de un tono. */
export function heatmap(days, weeks = 26) {
  const map = new Map(days.map((d) => [d.date, d]));
  const end = new Date(); end.setHours(0, 0, 0, 0);
  // retrocede al lunes de la semana actual
  const start = new Date(end);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - (weeks - 1) * 7);
  const goal = Math.max(1, settings.dailyGoal);
  const step = (c) => (c <= 0 ? 0 : c < goal * 0.34 ? 1 : c < goal * 0.67 ? 2 : c < goal ? 3 : 4);

  const grid = h('div', { class: 'hm-grid' });
  const months = h('div', { class: 'hm-months' });
  const cells = [];
  let lastMonth = -1;
  for (let w = 0; w < weeks; w++) {
    const col = h('div', { class: 'hm-col' });
    for (let d = 0; d < 7; d++) {
      const date = new Date(start); date.setDate(start.getDate() + w * 7 + d);
      if (date > end) { col.append(h('i', { class: 'hm-cell empty-future' })); continue; }
      const key = today(date);
      const r = map.get(key) || { c: 0, ok: 0, ko: 0, s: 0 };
      const lvl = step(r.c || 0);
      const cell = h('i', {
        class: 'hm-cell s' + lvl,
        tabindex: '-1',
        dataset: { d: key, c: r.c || 0, s: r.s || 0, ok: r.ok || 0 },
        title: `${date.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}: ${r.c || 0} tarjetas`,
      });
      cells.push(cell);
      col.append(cell);
    }
    const m = new Date(start); m.setDate(start.getDate() + w * 7);
    if (m.getMonth() !== lastMonth) {
      lastMonth = m.getMonth();
      months.append(h('span', { class: 'hm-m', style: { gridColumnStart: w + 1 }, text: m.toLocaleDateString('es-ES', { month: 'short' }) }));
    } else months.append(h('span', { class: 'hm-m', style: { gridColumnStart: w + 1 } }));
    grid.append(col);
  }

  const dowCol = h('div', { class: 'hm-dow' }, ['L', '', 'X', '', 'V', '', 'D'].map((x) => h('span', { text: x })));
  const tip = h('div', { class: 'tip' });
  const body = h('div', { class: 'hm-body' }, [dowCol, grid, tip]);
  body.addEventListener('pointermove', (e) => {
    const c = e.target.closest('.hm-cell');
    if (!c || !c.dataset.d) { tip.classList.remove('on'); return; }
    tip.innerHTML = '';
    tip.append(
      h('strong', { text: new Date(c.dataset.d + 'T00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }) }),
      h('span', { text: `${c.dataset.c} tarjetas` }),
      h('span', { class: 'dim', text: fmtTime(c.dataset.s * 1000) }),
    );
    const r = body.getBoundingClientRect();
    tip.style.left = Math.max(4, Math.min(r.width - 140, e.clientX - r.left - 60)) + 'px';
    tip.style.top = (e.clientY - r.top + 14) + 'px';
    tip.classList.add('on');
  });
  body.addEventListener('pointerleave', () => tip.classList.remove('on'));

  return h('div', { class: 'hm' }, [
    months, body,
    h('div', { class: 'hm-legend' }, [
      h('span', { class: 'dim', text: 'menos' }),
      ...[0, 1, 2, 3, 4].map((i) => h('i', { class: 'hm-cell s' + i })),
      h('span', { class: 'dim', text: 'más' }),
    ]),
  ]);
}
