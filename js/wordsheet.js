// Ficha de palabra: datos, progreso y acciones manuales.
import { F } from './vocab.js';
import { h, pinyinEl, sheet, toast, fmtNum } from './ui.js';
import { prog, rec, isLearned, settings, flush } from './store.js';
import { mastery, setManual, toggleHard } from './srs.js';
import { def, def2, noteOf } from './lang.js';

export function levelBadge(w) {
  const extra = w[F.LVL20] ? ` · HSK 2.0: ${w[F.LVL20]}` : '';
  return h('span', { class: 'badge lv' + w[F.LVL], text: `HSK ${w[F.LVL]}${extra}` });
}

export function masteryBar(w) {
  const r = prog.get(w[F.N]);
  const m = mastery(r);
  const learned = isLearned(r);
  return h('div', { class: 'mbar-wrap' }, [
    h('div', { class: 'mbar', role: 'img',
      'aria-label': `Dominio ${Math.round(m * 100)}%${learned ? ', aprendida' : ''}` }, [
      h('div', { class: 'mbar-fill' + (learned ? ' done' : ''), style: { width: (m * 100).toFixed(0) + '%' } }),
    ]),
    h('span', { class: 'mbar-txt', text: learned ? 'aprendida' : `${r ? r.t : 0}/${settings.threshold}` }),
  ]);
}

export function wordSheet(word, onChange) {
  const w = word;
  const r = rec(w[F.N]);
  const row = (k, v) => h('div', { class: 'kv' }, [h('span', { text: k }), h('strong', { text: v })]);

  const stats = h('div', { class: 'kv-grid' }, [
    row('Aciertos totales', fmtNum(r.ok)),
    row('Fallos', fmtNum(r.ko)),
    row('Contador global', `${r.t} / ${settings.threshold}`),
    row('Reconocimiento', `${r.r}${settings.minDir ? ' / ' + settings.minDir : ''}`),
    row('Producción', `${r.p}${settings.minDir ? ' / ' + settings.minDir : ''}`),
    row('Próximo repaso', r.due ? new Date(r.due).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) : '—'),
  ]);

  const actions = h('div', { class: 'sheet-actions' });
  const refresh = () => {
    actions.replaceChildren(
      h('button', {
        class: 'btn' + (isLearned(r) ? ' primary' : ''),
        onclick: async () => {
          setManual(w[F.N], isLearned(r) ? 2 : 1);
          await flush([w[F.N]]);
          toast(isLearned(r) ? 'Marcada como aprendida' : 'Marcada como no aprendida');
          refresh(); onChange && onChange();
        },
        text: isLearned(r) ? '✓ Aprendida — desmarcar' : 'Marcar como aprendida',
      }),
      h('button', {
        class: 'btn' + (r.H ? ' warn' : ''),
        onclick: async () => {
          toggleHard(w[F.N]);
          await flush([w[F.N]]);
          toast(r.H ? 'Marcada como difícil: saldrá más a menudo' : 'Ya no es difícil');
          refresh(); onChange && onChange();
        },
        text: r.H ? '★ Difícil — quitar' : 'Marcar como difícil',
      }),
      h('button', {
        class: 'btn danger-ghost',
        onclick: async () => {
          Object.assign(r, { t: 0, r: 0, p: 0, ok: 0, ko: 0, L: 0, M: 0, e: 2.5, iv: 0, due: 0, reps: 0, lap: 0 });
          await flush([w[F.N]]);
          toast('Progreso de la palabra reiniciado');
          refresh(); onChange && onChange();
        },
        text: 'Reiniciar su progreso',
      }),
    );
  };
  refresh();

  return sheet(w[F.HANZI], [
    h('div', { class: 'ws-head' }, [
      h('div', { class: 'ws-hanzi', text: w[F.HANZI] }),
      h('div', {}, [
        pinyinEl(w[F.PINYIN], 'pinyin big'),
        h('div', { class: 'ws-en', text: def(w) }),
        def2(w) ? h('div', { class: 'ws-en2', text: def2(w) }) : null,
        h('div', { class: 'ws-meta' }, [levelBadge(w), w[F.POS] && h('span', { class: 'badge pos', text: w[F.POS] })]),
      ]),
    ]),
    w[F.NOTE] ? h('p', { class: 'note', text: '📌 ' + noteOf(w) }) : null,
    masteryBar(w),
    stats,
    actions,
  ]);
}
