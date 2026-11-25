// Vista de estudio: las 5 modalidades + flujo de la sesion.
import { F } from './vocab.js';
import { h, add, clear, pinyinEl, toast, fmtTime } from './ui.js';
import { settings, flush, bumpDay, put, prog, STORE_S } from './store.js';
import { checkPinyin } from './pinyin.js';
import { answer } from './srs.js';
import { MODES, distractors, shuffle } from './session.js';
import { wordSheet, levelBadge } from './wordsheet.js';

export class StudyView {
  constructor(session, hooks = {}) {
    this.s = session;
    this.hooks = hooks;
    this.timers = [];
    this.bar = h('div', { class: 'sbar-fill' });
    this.counts = h('div', { class: 'sbar-counts' });
    this.modeTag = h('span', { class: 'mode-tag' });
    this.card = h('div', { class: 'card-area' });
    this.foot = h('div', { class: 'study-foot' });
    this.root = h('div', { class: 'study' }, [
      h('div', { class: 'study-head' }, [
        h('button', { class: 'icon-btn', 'aria-label': 'Salir de la sesión', html: '&larr;', onclick: () => this.exit() }),
        h('div', { class: 'sbar' }, [this.bar]),
        this.counts,
      ]),
      this.modeTag,
      this.card,
      this.foot,
    ]);
    this.onKey = (e) => this.key(e);
  }

  mount(container) {
    clear(container).append(this.root);
    document.addEventListener('keydown', this.onKey);
    this.render();
  }
  unmount() {
    document.removeEventListener('keydown', this.onKey);
    this.timers.forEach(clearTimeout);
  }
  after(ms, fn) { this.timers.push(setTimeout(fn, ms)); }

  exit() {
    if (this.s.cards > 0) this.finish(true); else { this.unmount(); this.hooks.onExit?.(); }
  }

  key(e) {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === ' ' || e.key === 'Enter') {
      const b = this.foot.querySelector('button[data-primary]');
      if (b) { e.preventDefault(); b.click(); }
    }
    if (/^[1-4]$/.test(e.key)) {
      const opts = this.card.querySelectorAll('.opt:not(.answered)');
      const b = opts[+e.key - 1];
      if (b) b.click();
    }
  }

  // --- flujo -------------------------------------------------------------

  async submit(word, correct, dir, mode) {
    const id = word[F.N];
    const res = answer(id, correct, dir);
    this.s.cards++;
    this.s.touched.add(id);
    if (correct) this.s.ok++; else { this.s.ko++; this.s.requeue(word, mode); }
    if (res.justLearned) { this.s.learned++; toast(`${word[F.HANZI]} aprendida 🎉`, 'good'); }
    if (res.unlearned) toast(`${word[F.HANZI]} vuelve a la cola`, 'warn');
    this.renderHead();
    try {
      await flush([id]);
      await bumpDay({ c: 1, ok: correct ? 1 : 0, ko: correct ? 0 : 1, nl: res.justLearned ? 1 : 0 });
      this.hooks.onProgress?.();
    } catch (err) { console.warn('persistencia', err); }
  }

  next() {
    this.s.advance();
    if (this.s.done) this.finish(); else this.render();
  }

  async finish(early = false) {
    this.unmount();
    const sec = Math.round(this.s.elapsed() / 1000);
    try {
      await bumpDay({ s: sec });
      await put(STORE_S, {
        ts: this.s.startedAt, modes: this.s.cfg.modes.join(','), n: this.s.cards,
        ok: this.s.ok, ko: this.s.ko, s: sec, lv: this.s.cfg.levels.join(','),
      });
    } catch (err) { console.warn(err); }
    this.hooks.onFinish?.(this.s, early);
  }

  renderHead() {
    const pct = this.s.total ? (this.s.i / this.s.total) * 100 : 0;
    this.bar.style.width = pct.toFixed(1) + '%';
    clear(this.counts).append(
      h('span', { class: 'c-ok', text: '✓ ' + this.s.ok }),
      h('span', { class: 'c-ko', text: '✗ ' + this.s.ko }),
    );
  }

  render() {
    const step = this.s.step;
    if (!step) return this.finish();
    this.timers.forEach(clearTimeout); this.timers = [];
    this.renderHead();
    const m = MODES[step.mode];
    add(clear(this.modeTag),
      h('span', { text: `${m.icon} ${m.label}` }),
      h('span', { class: 'mode-n', text: `${Math.min(this.s.i + 1, this.s.total)} / ${this.s.total}` }),
      step.retry ? h('span', { class: 'badge retry', text: 'repesca' }) : null,
    );
    clear(this.card); clear(this.foot);
    this.locked = false;
    this['m_' + step.mode](step);
  }

  infoBtn(w) {
    return h('button', {
      class: 'icon-btn ghost', 'aria-label': 'Ficha de la palabra', text: '⋯',
      onclick: () => wordSheet(w, () => this.hooks.onProgress?.()),
    });
  }

  hanziEl(w, small) {
    return h('div', {
      class: 'hanzi' + (small ? ' small' : ''),
      style: { fontSize: (small ? settings.hanziSize * 0.55 : settings.hanziSize) + 'px' },
      text: w[F.HANZI],
    });
  }

  reveal(w) {
    return h('div', { class: 'reveal' }, [
      pinyinEl(w[F.PINYIN], 'pinyin big'),
      h('div', { class: 'en', text: w[F.EN] }),
      h('div', { class: 'meta' }, [
        levelBadge(w),
        settings.showPos && w[F.POS] ? h('span', { class: 'badge pos', text: w[F.POS] }) : null,
      ]),
      settings.showNote && w[F.NOTE] ? h('p', { class: 'note', text: '📌 ' + w[F.NOTE] }) : null,
    ]);
  }

  feedback(ok, extra) {
    return h('div', { class: 'fb ' + (ok ? 'ok' : 'ko') }, [
      h('span', { class: 'fb-ic', text: ok ? '✓' : '✗' }),
      h('span', { text: ok ? '¡Correcto!' : (extra || 'Incorrecto') }),
    ]);
  }

  nextBtn(label = 'Siguiente') {
    return h('button', { class: 'btn primary wide', 'data-primary': '1', text: label, onclick: () => this.next() });
  }

  // --- modalidades -------------------------------------------------------

  m_clasica(step) {
    const w = step.words[0];
    this.card.append(
      h('div', { class: 'face' }, [
        this.infoBtn(w),
        this.hanziEl(w),
        settings.showPinyinFront ? pinyinEl(w[F.PINYIN], 'pinyin') : null,
      ]),
    );
    this.foot.append(h('button', {
      class: 'btn primary wide', 'data-primary': '1', text: 'Mostrar',
      onclick: () => {
        this.card.append(this.reveal(w));
        clear(this.foot).append(
          h('div', { class: 'two' }, [
            h('button', { class: 'btn ko', text: '✗ No lo sé', onclick: () => { this.submit(w, false, 'r', 'clasica'); this.next(); } }),
            h('button', { class: 'btn ok', 'data-primary': '1', text: '✓ Lo sé', onclick: () => { this.submit(w, true, 'r', 'clasica'); this.next(); } }),
          ]),
        );
      },
    }));
  }

  choice(step, { prompt, options, labelOf, dir, mode }) {
    const w = step.words[0];
    const opts = shuffle([w, ...distractors(w, 3, this.s.pool)]);
    const box = h('div', { class: 'opts' });
    this.card.append(prompt, box);
    opts.forEach((o) => {
      const b = h('button', { class: 'opt', onclick: () => pick(o, b) }, [labelOf(o)]);
      box.append(b);
    });
    const pick = (o, btn) => {
      if (this.locked) return;
      this.locked = true;
      const good = o[F.N] === w[F.N];
      box.querySelectorAll('.opt').forEach((b) => b.classList.add('answered'));
      btn.classList.add(good ? 'good' : 'bad');
      if (!good) {
        [...box.querySelectorAll('.opt')][opts.findIndex((x) => x[F.N] === w[F.N])].classList.add('good');
      }
      this.submit(w, good, dir, mode);
      this.card.append(this.feedback(good), this.reveal(w));
      this.foot.append(this.nextBtn());
      if (good) this.after(850, () => this.next());
    };
  }

  m_test4(step) {
    const w = step.words[0];
    this.choice(step, {
      prompt: h('div', { class: 'face' }, [this.infoBtn(w), this.hanziEl(w),
        settings.showPinyinFront ? pinyinEl(w[F.PINYIN], 'pinyin') : null]),
      labelOf: (o) => h('span', { class: 'opt-en', text: o[F.EN] }),
      dir: 'r', mode: 'test4',
    });
  }

  m_inversa(step) {
    const w = step.words[0];
    this.choice(step, {
      prompt: h('div', { class: 'face' }, [
        this.infoBtn(w),
        h('div', { class: 'prompt-en', text: w[F.EN] }),
        settings.showPos && w[F.POS] ? h('span', { class: 'badge pos', text: w[F.POS] }) : null,
      ]),
      labelOf: (o) => h('span', { class: 'opt-hanzi', text: o[F.HANZI] }),
      dir: 'p', mode: 'inversa',
    });
  }

  m_pinyin(step) {
    const w = step.words[0];
    const input = h('input', {
      class: 'pin-input', type: 'text', inputmode: 'latin', autocomplete: 'off',
      autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false',
      placeholder: settings.strictTones ? 'pinyin con tonos (ni3hao3)' : 'pinyin',
      'aria-label': 'Escribe el pinyin',
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') check(); });
    this.card.append(
      h('div', { class: 'face' }, [this.infoBtn(w), this.hanziEl(w),
        h('div', { class: 'en dim', text: w[F.EN] })]),
      h('div', { class: 'pin-wrap' }, [input,
        h('div', { class: 'hint', text: settings.strictTones ? 'Tonos obligatorios: nǐhǎo o ni3hao3' : 'Los tonos son opcionales' })]),
    );
    const checkBtn = h('button', { class: 'btn primary wide', 'data-primary': '1', text: 'Comprobar', onclick: () => check() });
    this.foot.append(checkBtn);
    setTimeout(() => input.focus(), 50);

    const check = () => {
      if (this.locked) return;
      const val = input.value.trim();
      if (!val) { input.focus(); return; }
      this.locked = true;
      const good = checkPinyin(val, w[F.PINYIN], settings.strictTones);
      input.disabled = true;
      input.classList.add(good ? 'good' : 'bad');
      this.submit(w, good, 'p', 'pinyin');
      this.card.append(this.feedback(good, `Era: ${w[F.PINYIN]}`), this.reveal(w));
      add(clear(this.foot),
        !good ? h('button', {
          class: 'btn', text: 'Era correcta (corregir)',
          onclick: () => { this.fix(w, 'p'); this.next(); },
        }) : null,
        this.nextBtn(),
      );
      if (good) this.after(900, () => this.next());
    };
  }

  /** Corrige un falso negativo: revierte el fallo y lo cuenta como acierto. */
  fix(w, dir) {
    const r = prog.get(w[F.N]);
    if (r) { r.ko = Math.max(0, r.ko - 1); r.lap = Math.max(0, r.lap - 1); }
    this.s.ko = Math.max(0, this.s.ko - 1);
    this.s.cards = Math.max(0, this.s.cards - 1);
    this.s.steps = this.s.steps.filter((st) => !(st.retry && st.words[0][F.N] === w[F.N]));
    this.s.again = this.s.again.filter((x) => x !== w[F.N]);
    this.submit(w, true, dir, 'pinyin');
  }

  m_match(step) {
    const ws = step.words;
    const left = shuffle(ws), right = shuffle(ws);
    let sel = null, pairs = 0;
    const grid = h('div', { class: 'match' });
    this.card.append(h('p', { class: 'match-hint', text: 'Toca un hanzi y luego su significado' }), grid);
    const colL = h('div', { class: 'mcol' }), colR = h('div', { class: 'mcol' });
    grid.append(colL, colR);

    const tile = (w, side) => h('button', {
      class: 'mtile ' + side,
      dataset: { id: w[F.N] },
      onclick: (e) => tap(w, e.currentTarget, side),
    }, [side === 'l'
      ? h('span', { class: 'mt-hanzi', text: w[F.HANZI] })
      : h('span', { class: 'mt-en', text: w[F.EN] })]);

    left.forEach((w) => colL.append(tile(w, 'l')));
    right.forEach((w) => colR.append(tile(w, 'r')));

    const tap = (w, btn, side) => {
      if (btn.classList.contains('done')) return;
      if (!sel) {
        grid.querySelectorAll('.mtile.sel').forEach((b) => b.classList.remove('sel'));
        btn.classList.add('sel'); sel = { w, btn, side };
        return;
      }
      if (sel.btn === btn) { btn.classList.remove('sel'); sel = null; return; }
      if (sel.side === side) {
        sel.btn.classList.remove('sel'); btn.classList.add('sel'); sel = { w, btn, side };
        return;
      }
      const target = side === 'r' ? sel.w : w;     // la palabra "pregunta" es el hanzi
      const good = sel.w[F.N] === w[F.N];
      sel.btn.classList.remove('sel');
      if (good) {
        sel.btn.classList.add('done'); btn.classList.add('done');
        sel.btn.append(h('span', { class: 'tick', text: '✓' }));
        this.submit(target, true, 'r', 'match');
        pairs++;
        if (pairs === ws.length) {
          this.foot.append(this.nextBtn(this.s.i + 1 >= this.s.total ? 'Terminar' : 'Siguiente'));
          this.card.append(this.feedback(true, ''), h('div', { class: 'match-done' },
            ws.map((x) => h('div', { class: 'md-row' }, [
              h('span', { class: 'md-h', text: x[F.HANZI] }), pinyinEl(x[F.PINYIN]), h('span', { class: 'md-en', text: x[F.EN] }),
            ]))));
        }
      } else {
        btn.classList.add('shake'); sel.btn.classList.add('shake');
        const a = sel.btn;
        setTimeout(() => { btn.classList.remove('shake'); a.classList.remove('shake'); }, 450);
        this.submit(target, false, 'r', 'match');
      }
      sel = null;
    };
  }
}

export function summary(s) {
  const tot = s.ok + s.ko;
  return {
    cards: s.cards, ok: s.ok, ko: s.ko,
    acc: tot ? s.ok / tot : 0,
    learned: s.learned,
    time: fmtTime(s.elapsed()),
  };
}
