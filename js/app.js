// Arranque, navegacion y pantallas.
import { VOCAB, F } from './vocab.js';
import * as S from './store.js';
import { h, add, $, clear, pinyinEl, toast, sheet, fmtTime, fmtNum, fmtPct } from './ui.js';
import { MODES, POS_LIST, DEFAULT_CONFIG, Session, filterPool, byId } from './session.js';
import { StudyView, summary } from './modes.js';
import { wordSheet, levelBadge, masteryBar } from './wordsheet.js';
import { mastery } from './srs.js';
import * as St from './stats.js';
import { def, esOf, enOf, LANGS } from './lang.js';
import { VERSION } from './version.js';

const app = {};
let view = 'home';
const main = () => $('#main');

// --- tema y preferencias visuales ---------------------------------------

function applyTheme() {
  const t = S.settings.theme;
  document.documentElement.dataset.theme = t === 'auto' ? '' : t;
  document.documentElement.style.setProperty('--hanzi-size', S.settings.hanziSize + 'px');
  const meta = $('meta[name=theme-color]');
  if (meta) {
    const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    meta.content = dark ? '#121418' : '#f7f5f2';
  }
}

// --- navegacion ----------------------------------------------------------

const TABS = [
  { id: 'home', label: 'Estudiar', icon: '学' },
  { id: 'stats', label: 'Progreso', icon: '📊' },
  { id: 'vocab', label: 'Vocabulario', icon: '📖' },
  { id: 'settings', label: 'Ajustes', icon: '⚙' },
];

function go(v) {
  view = v;
  $$all('.tab').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
  const r = { home: screenHome, stats: screenStats, vocab: screenVocab, settings: screenSettings }[v];
  window.scrollTo(0, 0);
  r();
}
const $$all = (sel) => [...document.querySelectorAll(sel)];

// --- pantalla: estudiar --------------------------------------------------

async function screenHome() {
  const days = await St.loadDays();
  const st = St.compute(days);
  const goal = S.settings.dailyGoal;
  const donePct = Math.min(1, st.today.c / Math.max(1, goal));

  const ring = (() => {
    const R = 34, C = 2 * Math.PI * R;
    const ns = 'http://www.w3.org/2000/svg';
    const mk = (t, p) => { const e = document.createElementNS(ns, t); for (const k in p) e.setAttribute(k, p[k]); return e; };
    const svg = mk('svg', { viewBox: '0 0 80 80', class: 'ring' });
    svg.append(mk('circle', { cx: 40, cy: 40, r: R, class: 'ring-bg' }));
    svg.append(mk('circle', {
      cx: 40, cy: 40, r: R, class: 'ring-fg', 'stroke-dasharray': C,
      'stroke-dashoffset': C * (1 - donePct), transform: 'rotate(-90 40 40)',
    }));
    return h('div', { class: 'ring-wrap' }, [svg, h('div', { class: 'ring-txt' }, [
      h('strong', { text: st.today.c }), h('small', { text: '/ ' + goal }),
    ])]);
  })();

  const cfg = { ...DEFAULT_CONFIG, ...(S.settings.lastConfig || {}) };

  const quick = (label, desc, patch, cls = '') => h('button', {
    class: 'qcard ' + cls,
    onclick: () => start({ ...cfg, ...patch }),
  }, [h('strong', { text: label }), h('span', { text: desc })]);

  const pending = filterPool({ ...cfg, estado: 'nuevas' }).length;
  const failed = filterPool({ ...cfg, estado: 'falladas' }).length;
  const learnedSel = filterPool({ ...cfg, estado: 'aprendidas' }).length;

  clear(main()).append(
    h('header', { class: 'hero' }, [
      ring,
      h('div', {}, [
        h('h1', { text: 'HSK Flash' }),
        h('p', { class: 'dim', text: st.streak > 0 ? `🔥 Racha de ${st.streak} día${st.streak > 1 ? 's' : ''}` : 'Completa la meta para empezar la racha' }),
        h('p', { class: 'dim small', text: `${fmtNum(st.learned)} de ${fmtNum(st.total)} palabras aprendidas` }),
      ]),
    ]),
    h('div', { class: 'qgrid' }, [
      quick('Continuar', `${pending} sin aprender en los niveles elegidos`, { estado: 'nuevas' }, 'primary'),
      quick('Solo falladas', failed ? `${failed} con algún fallo` : 'Sin fallos pendientes', { estado: 'falladas', order: 'falladas' }),
      quick('Repasar aprendidas', learnedSel ? `${learnedSel} ya aprendidas` : 'Aún no hay aprendidas', { estado: 'aprendidas', order: 'srs' }),
    ]),
    configPanel(cfg),
  );
}

function chipRow(label, items, isOn, onToggle, hint) {
  return h('div', { class: 'field' }, [
    h('label', { text: label }),
    hint ? h('p', { class: 'hint', text: hint }) : null,
    h('div', { class: 'chips' }, items.map((it) => {
      const b = h('button', {
        class: 'chip' + (isOn(it.v) ? ' on' : ''),
        'aria-pressed': isOn(it.v) ? 'true' : 'false',
        onclick: () => { onToggle(it.v); b.classList.toggle('on'); b.setAttribute('aria-pressed', b.classList.contains('on')); },
        text: it.l,
      });
      return b;
    })),
  ]);
}

function configPanel(cfg) {
  const c = JSON.parse(JSON.stringify(cfg));
  c.levels = new Set(c.levels); c.pos = new Set(c.pos); c.modes = new Set(c.modes);
  const count = h('p', { class: 'count' });
  const upd = () => {
    const n = filterPool({ ...c, levels: [...c.levels], pos: [...c.pos] }).length;
    count.textContent = n
      ? `${fmtNum(n)} palabras cumplen el filtro · sesión de ${c.size ? Math.min(c.size, n) : n}`
      : 'Ningún resultado con estos filtros';
  };

  const levels = chipRow('Niveles', [1, 2, 3, 4, 5, 6].map((v) => ({ v, l: 'HSK ' + v })),
    (v) => c.levels.has(v), (v) => { c.levels.has(v) ? c.levels.delete(v) : c.levels.add(v); upd(); });

  const modes = chipRow('Modalidades', Object.entries(MODES).map(([v, m]) => ({ v, l: m.icon + ' ' + m.label })),
    (v) => c.modes.has(v), (v) => { c.modes.has(v) ? c.modes.delete(v) : c.modes.add(v); upd(); },
    'Si eliges varias, se alternan al azar');

  const pos = chipRow('Categoría gramatical', POS_LIST.map((v) => ({ v, l: v })),
    (v) => c.pos.has(v), (v) => { c.pos.has(v) ? c.pos.delete(v) : c.pos.add(v); upd(); },
    'Vacío = todas');

  const radios = (label, name, opts, cur, onPick) => h('div', { class: 'field' }, [
    h('label', { text: label }),
    h('div', { class: 'chips' }, opts.map((o) => h('button', {
      class: 'chip' + (cur === o.v ? ' on' : ''), text: o.l,
      onclick: (e) => {
        onPick(o.v);
        e.currentTarget.parentNode.querySelectorAll('.chip').forEach((x) => x.classList.remove('on'));
        e.currentTarget.classList.add('on');
        upd();
      },
    }))),
  ]);

  const panel = h('details', { class: 'panel', open: Object.keys(S.settings.lastConfig || {}).length === 0 }, [
    h('summary', { text: '⚙ Configurar la sesión' }),
    levels,
    radios('Qué palabras', 'estado', [
      { v: 'nuevas', l: 'Sin aprender' }, { v: 'falladas', l: 'Falladas' },
      { v: 'aprendidas', l: 'Aprendidas (repaso)' }, { v: 'todas', l: 'Todas' },
    ], c.estado, (v) => { c.estado = v; }),
    radios('Orden', 'order', [
      { v: 'srs', l: 'Repaso programado' }, { v: 'aleatorio', l: 'Aleatorio' },
      { v: 'falladas', l: 'Más falladas primero' }, { v: 'lista', l: 'Orden de lista' },
    ], c.order, (v) => { c.order = v; }),
    radios('Tarjetas por sesión', 'size', [
      { v: 10, l: '10' }, { v: 20, l: '20' }, { v: 50, l: '50' }, { v: 100, l: '100' }, { v: 0, l: 'Sin límite' },
    ], c.size, (v) => { c.size = v; }),
    modes, pos,
    count,
    h('button', {
      class: 'btn primary wide', text: '▶ Empezar sesión',
      onclick: () => start({ ...c, levels: [...c.levels], pos: [...c.pos], modes: [...c.modes] }),
    }),
  ]);
  upd();
  return panel;
}

// --- sesion --------------------------------------------------------------

async function start(cfg) {
  const clean = {
    levels: [...new Set(cfg.levels)].sort(), pos: [...new Set(cfg.pos)],
    estado: cfg.estado, order: cfg.order, size: cfg.size,
    modes: [...new Set(cfg.modes)],
  };
  if (!clean.levels.length) return toast('Elige al menos un nivel', 'warn');
  if (!clean.modes.length) clean.modes = ['clasica'];
  const ses = new Session(clean);
  if (!ses.words.length) return toast('No hay palabras con esos filtros', 'warn');
  await S.saveSettings({ lastConfig: clean });

  const endSession = () => {
    app.cleanupSession?.();
    app.cleanupSession = null;
    document.body.classList.remove('studying');
  };
  const sv = new StudyView(ses, {
    onExit: () => { endSession(); go('home'); },
    onFinish: (s, early) => { endSession(); finishScreen(s, early, clean); },
  });
  document.body.classList.add('studying');
  const onVis = () => (document.hidden ? ses.pause() : ses.resume());
  document.addEventListener('visibilitychange', onVis);
  app.cleanupSession = () => document.removeEventListener('visibilitychange', onVis);
  sv.mount(main());
}

function finishScreen(s, early, cfg) {
  document.body.classList.remove('studying');
  const r = summary(s);
  add(clear(main()),
    h('div', { class: 'done-wrap' }, [
      h('div', { class: 'done-emo', text: r.acc >= 0.9 ? '🎉' : r.acc >= 0.6 ? '👍' : '💪' }),
      h('h2', { text: early ? 'Sesión interrumpida' : 'Sesión terminada' }),
      h('div', { class: 'tiles' }, [
        St.tile('Tarjetas', String(r.cards)),
        St.tile('Acierto', fmtPct(r.acc)),
        St.tile('Aprendidas', String(r.learned)),
        St.tile('Tiempo', r.time),
      ]),
      s.again.length ? h('p', { class: 'dim', text: `${s.again.length} palabra(s) falladas volvieron a salir en la repesca.` }) : null,
      h('div', { class: 'two' }, [
        h('button', { class: 'btn', text: 'Volver', onclick: () => go('home') }),
        h('button', { class: 'btn primary', text: 'Otra sesión igual', onclick: () => start(cfg) }),
      ]),
    ]),
  );
}

// --- pantalla: progreso --------------------------------------------------

async function screenStats() {
  const days = await St.loadDays();
  const st = St.compute(days);
  clear(main()).append(
    h('h2', { class: 'h2', text: 'Progreso' }),
    h('div', { class: 'hero-num' }, [
      h('strong', { text: fmtNum(st.learned) }),
      h('span', { text: `de ${fmtNum(st.total)} palabras aprendidas · ${fmtPct(st.learned / st.total)}` }),
    ]),
    h('div', { class: 'tiles' }, [
      St.tile('Tasa de acierto', fmtPct(st.acc), `últimos 7 días: ${fmtPct(st.acc7)}`),
      St.tile('Empezadas', fmtNum(st.started), `${fmtNum(st.hard)} marcadas difíciles`),
      St.tile('Tiempo total', fmtTime(st.secs * 1000), `7 días: ${fmtTime(st.secs7 * 1000)}`),
      St.tile('Racha', st.streak + ' d', `hoy ${st.today.c}/${S.settings.dailyGoal}`),
    ]),
    h('section', {}, [h('h3', { text: 'Por nivel' }), St.levelBars(st)]),
    h('section', {}, [h('h3', { text: 'Últimos 30 días' }), St.dailyChart(days, 30)]),
    h('section', {}, [h('h3', { text: 'Actividad' }), St.heatmap(days, 26)]),
    h('p', { class: 'dim small', text: `${fmtNum(st.cards)} tarjetas respondidas en total.` }),
  );
}

// --- pantalla: vocabulario (lista virtual) ------------------------------

const ROW_H = 68;

function screenVocab() {
  const state = { q: '', lv: new Set(), estado: 'todas', list: [] };
  const search = h('input', {
    class: 'search', type: 'search', placeholder: 'Buscar hanzi, pinyin o significado…',
    autocomplete: 'off', oninput: (e) => { state.q = e.target.value.trim().toLowerCase(); refilter(); },
  });
  const inner = h('div', { class: 'vl-inner' });
  const scroller = h('div', { class: 'vl', onscroll: () => draw() }, [inner]);
  const info = h('p', { class: 'count' });

  const lvChips = h('div', { class: 'chips' }, [1, 2, 3, 4, 5, 6].map((v) => {
    const b = h('button', {
      class: 'chip', text: 'HSK ' + v, onclick: () => {
        state.lv.has(v) ? state.lv.delete(v) : state.lv.add(v);
        b.classList.toggle('on'); refilter();
      },
    });
    return b;
  }));
  const estChips = h('div', { class: 'chips' }, [
    { v: 'todas', l: 'Todas' }, { v: 'nuevas', l: 'Sin aprender' },
    { v: 'aprendidas', l: 'Aprendidas' }, { v: 'falladas', l: 'Falladas' },
    { v: 'dificiles', l: '★ Difíciles' },
  ].map((o) => {
    const b = h('button', {
      class: 'chip' + (o.v === 'todas' ? ' on' : ''), text: o.l,
      onclick: () => {
        state.estado = o.v;
        estChips.querySelectorAll('.chip').forEach((x) => x.classList.remove('on'));
        b.classList.add('on'); refilter();
      },
    });
    return b;
  }));

  function refilter() {
    const q = state.q;
    const out = [];
    for (const w of VOCAB) {
      if (state.lv.size && !state.lv.has(w[F.LVL])) continue;
      const r = S.prog.get(w[F.N]);
      const learned = S.isLearned(r);
      if (state.estado === 'nuevas' && learned) continue;
      if (state.estado === 'aprendidas' && !learned) continue;
      if (state.estado === 'falladas' && !(r && r.ko > 0)) continue;
      if (state.estado === 'dificiles' && !(r && r.H)) continue;
      if (q && !(w[F.HANZI].includes(q) || w[F.PINYIN].toLowerCase().includes(q)
        || enOf(w).toLowerCase().includes(q) || fold(esOf(w)).includes(fold(q))
        || w[F.PINYIN].normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(q))) continue;
      out.push(w);
    }
    state.list = out;
    info.textContent = `${fmtNum(out.length)} palabras`;
    inner.style.height = out.length * ROW_H + 'px';
    scroller.scrollTop = 0;
    draw(true);
  }

  function draw() {
    const top = scroller.scrollTop, hgt = scroller.clientHeight || 400;
    const first = Math.max(0, Math.floor(top / ROW_H) - 4);
    const last = Math.min(state.list.length, Math.ceil((top + hgt) / ROW_H) + 4);
    clear(inner);
    for (let i = first; i < last; i++) {
      const w = state.list[i];
      const r = S.prog.get(w[F.N]);
      const learned = S.isLearned(r);
      inner.append(h('button', {
        class: 'vrow', style: { top: i * ROW_H + 'px' },
        onclick: () => wordSheet(w, () => { refilter(); }),
      }, [
        h('span', { class: 'vr-h', text: w[F.HANZI] }),
        h('span', { class: 'vr-mid' }, [
          pinyinEl(w[F.PINYIN]),
          h('span', { class: 'vr-en', text: def(w) }),
        ]),
        h('span', { class: 'vr-side' }, [
          h('span', { class: 'badge lv' + w[F.LVL], text: 'HSK ' + w[F.LVL] }),
          learned ? h('span', { class: 'tickmini', text: '✓' })
            : h('span', { class: 'mini-bar' }, [h('i', { style: { width: (mastery(r) * 100) + '%' } })]),
          r && r.H ? h('span', { class: 'star', text: '★' }) : null,
        ]),
      ]));
    }
  }

  clear(main()).append(
    h('h2', { class: 'h2', text: 'Vocabulario' }),
    search,
    h('div', { class: 'field' }, [lvChips]),
    h('div', { class: 'field' }, [estChips]),
    info, scroller,
  );
  refilter();
  requestAnimationFrame(() => draw());
}

// --- pantalla: ajustes ---------------------------------------------------

function row(label, control, hint) {
  return h('div', { class: 'srow' }, [
    h('div', {}, [h('span', { class: 'srow-l', text: label }), hint ? h('p', { class: 'hint', text: hint }) : null]),
    control,
  ]);
}
function pick(options, cur, onPick) {
  return h('div', { class: 'chips' }, options.map((o) => h('button', {
    class: 'chip' + (cur === o.v ? ' on' : ''), text: o.l,
    onclick: (e) => {
      onPick(o.v);
      e.currentTarget.parentNode.querySelectorAll('.chip').forEach((x) => x.classList.remove('on'));
      e.currentTarget.classList.add('on');
    },
  })));
}
function toggle(key, onChange) {
  const b = h('button', {
    class: 'switch' + (S.settings[key] ? ' on' : ''), role: 'switch',
    'aria-checked': S.settings[key] ? 'true' : 'false',
    onclick: async () => {
      await S.saveSettings({ [key]: !S.settings[key] });
      b.classList.toggle('on', S.settings[key]);
      b.setAttribute('aria-checked', S.settings[key] ? 'true' : 'false');
      onChange?.();
    },
  }, [h('i', {})]);
  return b;
}
function num(key, min, max, step, onChange, suffix = '') {
  const out = h('output', { text: S.settings[key] + suffix });
  const i = h('input', {
    type: 'range', min, max, step, value: S.settings[key],
    oninput: (e) => { out.textContent = e.target.value + suffix; },
    onchange: async (e) => { await S.saveSettings({ [key]: +e.target.value }); onChange?.(); },
  });
  return h('div', { class: 'slider' }, [i, out]);
}

const fold = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Version de la app y del service worker activo, para comprobar que llego la actualizacion. */
function versionEl() {
  const p = h('p', { class: 'hint version', text: `Versión ${VERSION}` });
  if ('caches' in window) {
    caches.keys().then((ks) => {
      const c = ks.find((k) => k.startsWith('hsk-flash-'));
      if (c) p.textContent = `Versión ${VERSION} · caché ${c.replace('hsk-flash-', '')}`;
    }).catch(() => {});
  }
  return p;
}

function screenSettings() {
  clear(main()).append(
    h('h2', { class: 'h2', text: 'Ajustes' }),

    h('section', {}, [h('h3', { text: 'Aspecto' }),
      row('Tema', pick([{ v: 'auto', l: 'Automático' }, { v: 'light', l: 'Claro' }, { v: 'dark', l: 'Oscuro' }],
        S.settings.theme, async (v) => { await S.saveSettings({ theme: v }); applyTheme(); })),
      row('Tamaño del hanzi', num('hanziSize', 40, 160, 4, applyTheme, ' px')),
      h('div', { class: 'preview', style: { fontSize: 'var(--hanzi-size)' }, text: '学习' }),
      row('Pinyin con colores por tono', toggle('tones'), '1º rojo · 2º verde · 3º azul · 4º morado · neutro gris'),
      row('Mostrar categoría gramatical', toggle('showPos')),
      row('Mostrar notas del HSK', toggle('showNote'), 'Avisos del tipo "more uses at HSK 4"'),
      row('Pinyin visible en la cara frontal', toggle('showPinyinFront'), 'Hace las tarjetas más fáciles'),
    ]),

    h('section', {}, [h('h3', { text: 'Idioma' }),
      row('Definiciones en', pick(LANGS, S.settings.defLang, async (v) => { await S.saveSettings({ defLang: v }); })),
      row('Mostrar también el otro idioma', toggle('showOtherLang'), 'Añade la traducción en el otro idioma en la tarjeta y en la ficha'),
    ]),

    h('section', {}, [h('h3', { text: 'Aprendizaje' }),
      row('Aciertos para dar por aprendida', num('threshold', 5, 50, 1), 'Contador acumulado global'),
      row('Mínimo por dirección', num('minDir', 0, 20, 1),
        'Aciertos mínimos en reconocimiento Y en producción. 0 lo desactiva'),
      row('Penalización por fallo', num('penalty', 0, 5, 1), 'Cuánto resta un fallo al contador'),
      row('Meta diaria (tarjetas)', num('dailyGoal', 5, 300, 5)),
      row('Exigir tonos al escribir pinyin', toggle('strictTones'), 'Acepta nǐhǎo o ni3hao3'),
    ]),

    h('section', {}, [h('h3', { text: 'Recordatorio' }),
      row('Aviso diario', toggle('reminderOn', setupReminder)),
      row('Hora', h('input', {
        type: 'time', class: 'time',
        value: String(S.settings.reminderHour).padStart(2, '0') + ':' + String(S.settings.reminderMin).padStart(2, '0'),
        onchange: async (e) => {
          const [hh, mm] = e.target.value.split(':').map(Number);
          await S.saveSettings({ reminderHour: hh || 0, reminderMin: mm || 0 });
          setupReminder();
        },
      })),
      h('p', { class: 'hint', text: 'Android solo muestra el aviso si la app está instalada y el sistema le deja despertar. Si no llega, abre la app y verás la racha igualmente.' }),
    ]),

    h('section', {}, [h('h3', { text: 'Copia de seguridad' }),
      h('p', { class: 'hint', text: 'El progreso vive solo en este dispositivo. Exporta de vez en cuando.' }),
      h('div', { class: 'two' }, [
        h('button', { class: 'btn', text: '⤓ Exportar JSON', onclick: doExport }),
        h('button', { class: 'btn', text: '⤒ Importar JSON', onclick: doImport }),
      ]),
      h('button', {
        class: 'btn danger-ghost wide', text: 'Borrar todo el progreso',
        onclick: async () => {
          const { close } = sheet('¿Borrar todo el progreso?', [
            h('p', { text: 'Se borran contadores, días y sesiones. El vocabulario no se toca. Esto no se puede deshacer.' }),
            h('div', { class: 'two' }, [
              h('button', { class: 'btn', text: 'Cancelar', onclick: () => close() }),
              h('button', {
                class: 'btn danger', text: 'Borrar', onclick: async () => {
                  await S.resetAll(); close(); toast('Progreso borrado'); go('settings');
                },
              }),
            ]),
          ]);
        },
      }),
    ]),

    h('section', {}, [h('h3', { text: 'Acerca de' }),
      h('p', { class: 'hint', text: `${fmtNum(VOCAB.length)} palabras del HSK 3.0 (niveles 1 a 6). Vocabulario del syllabus CLEC 2025; definiciones en inglés de SayMei y traducción al español. Funciona sin conexión.` }),
      h('p', { class: 'hint', text: 'Atajos: Espacio/Enter avanza, 1-4 eligen opción.' }),
      versionEl(),
    ]),
  );
}

async function doExport() {
  const data = await S.exportJSON();
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const a = h('a', {
    href: URL.createObjectURL(blob),
    download: `hsk-flash-${S.today()}.json`,
  });
  document.body.append(a); a.click(); a.remove();
  toast('Copia exportada');
}

function doImport() {
  const inp = h('input', { type: 'file', accept: 'application/json,.json' });
  inp.addEventListener('change', async () => {
    const f = inp.files[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      const { close } = sheet('Importar copia', [
        h('p', { text: `Archivo del ${data.exportedAt ? new Date(data.exportedAt).toLocaleString('es-ES') : '—'} con ${(data.progress || []).length} palabras con progreso.` }),
        h('div', { class: 'two' }, [
          h('button', {
            class: 'btn', text: 'Fusionar', onclick: async () => {
              await S.importJSON(data, 'merge'); close(); applyTheme(); toast('Copia fusionada'); go('stats');
            },
          }),
          h('button', {
            class: 'btn primary', text: 'Reemplazar', onclick: async () => {
              await S.importJSON(data, 'replace'); close(); applyTheme(); toast('Copia restaurada'); go('stats');
            },
          }),
        ]),
      ]);
    } catch (e) {
      toast('Archivo no válido: ' + e.message, 'warn');
    }
  });
  inp.click();
}

// --- recordatorio --------------------------------------------------------

let reminderTimer = null;
async function setupReminder() {
  clearTimeout(reminderTimer);
  if (!S.settings.reminderOn) return;
  if (!('Notification' in window)) return toast('Este navegador no soporta avisos', 'warn');
  let perm = Notification.permission;
  if (perm === 'default') perm = await Notification.requestPermission();
  if (perm !== 'granted') {
    await S.saveSettings({ reminderOn: false });
    return toast('Permiso de notificaciones denegado', 'warn');
  }
  const now = new Date();
  const at = new Date();
  at.setHours(S.settings.reminderHour, S.settings.reminderMin, 0, 0);
  if (at <= now) at.setDate(at.getDate() + 1);
  reminderTimer = setTimeout(async () => {
    const d = await S.dayRec();
    if (d.c < S.settings.dailyGoal) {
      const reg = await navigator.serviceWorker?.ready.catch(() => null);
      const body = `Te faltan ${S.settings.dailyGoal - d.c} tarjetas para la meta de hoy.`;
      if (reg) reg.showNotification('HSK Flash', { body, icon: 'icons/icon.svg', tag: 'hsk-daily' });
      else new Notification('HSK Flash', { body });
    }
    setupReminder();
  }, at - now);
  try {
    const reg = await navigator.serviceWorker?.ready;
    await reg?.periodicSync?.register('hsk-daily', { minInterval: 12 * 3600 * 1000 });
  } catch { /* no soportado */ }
}

// --- arranque ------------------------------------------------------------

async function boot() {
  await S.open();
  await S.loadSettings();
  await S.loadProgress();
  applyTheme();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

  const nav = h('nav', { class: 'tabs' }, TABS.map((t) => h('button', {
    class: 'tab', dataset: { v: t.id }, onclick: () => go(t.id),
  }, [h('span', { class: 'ticon', text: t.icon }), h('span', { text: t.label })])));
  document.body.append(nav);
  go('home');
  setupReminder();

  if ('serviceWorker' in navigator) {
    try { await navigator.serviceWorker.register('sw.js'); } catch (e) { console.warn('SW', e); }
  }
}

window.addEventListener('error', (e) => console.error(e.error || e.message));
boot().catch((e) => {
  document.body.innerHTML = '<div class="fatal"><h2>No se pudo arrancar</h2><pre></pre>'
    + '<p>Si has abierto el archivo con doble clic (file://), sírvelo por HTTP: la app necesita un origen web para IndexedDB y el modo offline.</p></div>';
  document.querySelector('.fatal pre').textContent = e.message;
});
