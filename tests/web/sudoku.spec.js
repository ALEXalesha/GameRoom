// Законы «Судоку» для «Игротеки»: уровни от лёгкого до эксперта различаются нужными приёмами,
// у каждой головоломки ровно одно решение, заметки и автозаметки, подсветка одинаковых цифр и
// конфликтов, отмена и повтор, подсказка с объяснением приёма, ежедневная головоломка по дате,
// лимит ошибок, рекорды по уровням, серия побед, статистика, тёмная и светлая тема, продолжение
// после перезагрузки, автопилот решает каждый уровень, пауза, клавиши, геймпад, окно.
const { test, expect } = require('@playwright/test');
const { openGame, fitReport, expectFits } = require('./_games-helpers');
const { hideTab, showTab } = require('./_kit-helpers');

const open = (page, q = 'seed=1&date=2026-09-27') => openGame(page, 'sudoku', q);
const LEVELS = ['easy', 'medium', 'hard', 'expert'];
// Первая пустая клетка и её верная цифра
const EMPTY = `(() => { const s = __game.state; const i = s.user.findIndex((v) => !v); return { i, r: Math.floor(i / 9), c: i % 9, d: s.solution[i] }; })()`;

test.describe('Судоку: меню, уровни, единственность', () => {
  test('главное меню над живой заставкой; «Новая игра» - четыре уровня; в игре правит игрок', async ({ page }) => {
    const errors = await open(page);
    for (const t of ['Новая игра', 'Ежедневная', 'Настройки', 'Достижения и рекорды', 'Как играть', 'Об игре']) await expect(page.locator(`[data-screen=main] .kit-btn:has-text("${t}")`).first()).toBeVisible();
    expect(await page.evaluate(() => __game.autopilot)).toBe(true);
    const f0 = await page.evaluate(() => __game.state.user.filter(Boolean).length);
    await page.waitForTimeout(1500);
    expect(await page.evaluate(() => __game.state.user.filter(Boolean).length)).toBeGreaterThan(f0);   // заставка решает
    await page.click('[data-screen=main] [data-id=new]');
    for (const l of LEVELS) await expect(page.locator(`[data-screen=levels] [data-level=${l}]`)).toBeVisible();
    await page.click('[data-screen=levels] [data-level=easy]');
    await page.waitForFunction(() => __game.kit.mode === 'play');
    expect(await page.evaluate(() => [__game.autopilot, __game.state.level, __game.state.daily])).toEqual([false, 'easy', null]);
    expect(errors).toEqual([]);
  });

  test('у каждой головоломки ровно одно решение; уровни различаются нужными приёмами и числом подсказок', async ({ page }) => {
    test.setTimeout(120000);
    await open(page);
    const r = await page.evaluate(() => {
      const L = SudokuLogic, out = {};
      for (const lv of ['easy', 'medium', 'hard', 'expert']) {
        out[lv] = [];
        for (let seed = 1; seed <= 4; seed++) {
          const g = L.generate(lv, seed * 101);
          const sol = []; const n = L.countSolutions(g.puzzle, 3, sol);
          const lg = L.solveLogic(g.puzzle);
          out[lv].push({ n, same: sol.join('') === g.solution.join(''), clues: g.puzzle.filter(Boolean).length, tier: lg.maxTier, solved: lg.solved });
        }
      }
      return out;
    });
    for (const lv of LEVELS) for (const x of r[lv]) { expect(x.n, lv).toBe(1); expect(x.same, lv).toBe(true); expect(x.solved, lv).toBe(true); }
    // ярусы: 1 - последний кандидат и одиночка в квадрате, 2 - скрытая одиночка в строке/столбце,
    // 3 - пересечения и пары, 4 - тройки, четвёрки, «крест», «рыба-меч», «крылья»
    expect(r.easy.map((x) => x.tier)).toEqual([1, 1, 1, 1]);
    expect(r.medium.map((x) => x.tier)).toEqual([2, 2, 2, 2]);
    expect(r.hard.map((x) => x.tier)).toEqual([3, 3, 3, 3]);
    expect(r.expert.map((x) => x.tier)).toEqual([4, 4, 4, 4]);
  });

  test('ежедневная головоломка: одна и та же в один день, другая - в другой; решение одно', async ({ page }) => {
    await open(page);
    const a = await page.evaluate(() => { __game.startDailySync('2026-09-27'); return { p: __game.state.puzzle.join(''), n: SudokuLogic.countSolutions(__game.state.puzzle, 3), level: __game.state.level }; });
    await open(page, 'seed=77&date=2026-09-27');
    const b = await page.evaluate(() => { __game.startDailySync('2026-09-27'); return __game.state.puzzle.join(''); });
    const c = await page.evaluate(() => { __game.startDailySync('2026-09-28'); return __game.state.puzzle.join(''); });
    expect(b).toBe(a.p);
    expect(c).not.toBe(a.p);
    expect(a.n).toBe(1);
    expect(LEVELS).toContain(a.level);
  });
});

test.describe('Судоку: ввод и помощь', () => {
  test('верная цифра встаёт; неверная - ошибка и красная клетка; открытую клетку не изменить', async ({ page }) => {
    await open(page);
    const r = await page.evaluate((E) => {
      const g = __game; g.newSync('easy', 1);
      const e = eval(E);
      g.select(e.r, e.c); g.input(e.d);
      const ok = g.state.user[e.i] === e.d;
      const e2 = eval(E); g.select(e2.r, e2.c); g.input(e2.d === 9 ? 1 : e2.d + 1);
      const err = { mistakes: g.state.mistakes, cls: g.cellEl(e2.r, e2.c).classList.contains('error') };
      const gi = g.state.given.indexOf(true); const before = g.state.user[gi];
      g.select(Math.floor(gi / 9), gi % 9); g.input(before === 9 ? 1 : before + 1);
      return { ok, err, given: g.state.user[gi] === before };
    }, EMPTY);
    expect(r).toEqual({ ok: true, err: { mistakes: 1, cls: true }, given: true });
  });

  test('конфликт по правилам (две одинаковые цифры в строке) подсвечивается и без проверки ошибок', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const g = __game; g.kit.set('instantCheck', false); g.newSync('easy', 2);
      const s = g.state, r0 = s.user.findIndex((v, i) => v && s.given[i]) , row = Math.floor(r0 / 9);
      const empty = [...Array(9).keys()].map((c) => row * 9 + c).find((i) => !s.user[i]);
      g.select(row, empty % 9); g.input(s.user[r0]);
      return { conflict: g.cellEl(row, empty % 9).classList.contains('conflict') && g.cellEl(row, r0 % 9).classList.contains('conflict'), mistakes: s.mistakes };
    });
    expect(r).toEqual({ conflict: true, mistakes: 0 });
  });

  test('заметки карандашом; цифра убирает свою заметку у соседей; автозаметки - все кандидаты', async ({ page }) => {
    await open(page);
    const r = await page.evaluate((E) => {
      const g = __game; g.newSync('easy', 3);
      const e = eval(E);
      g.toggleNotes(); g.select(e.r, e.c); g.input(1); g.input(2); g.input(2);
      const notes = [...g.state.notes[e.i]].sort();
      g.toggleNotes();
      // сосед по строке с заметкой d
      const s = g.state, peer = [...Array(9).keys()].map((c) => e.r * 9 + c).find((i) => !s.user[i] && i !== e.i);
      g.toggleNotes(); g.select(Math.floor(peer / 9), peer % 9); g.input(e.d); g.toggleNotes();
      g.select(e.r, e.c); g.input(e.d);
      const peerHas = g.state.notes[peer].has(e.d);
      g.autoNotes();
      const cand = SudokuLogic.candidates(g.state.user);
      const exact = g.state.user.every((v, i) => v || [...g.state.notes[i]].sort().join('') === SudokuLogic.digits(cand[i]).join(''));
      return { notes, peerHas, exact };
    }, EMPTY);
    expect(r).toEqual({ notes: [1], peerHas: false, exact: true });
  });

  test('подсветка: выбранная цифра подсвечена во всех клетках, где она стоит', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const g = __game; g.newSync('easy', 4);
      const s = g.state, i = s.user.findIndex(Boolean), d = s.user[i];
      g.select(Math.floor(i / 9), i % 9);
      const same = s.user.map((v, k) => [v, k]).filter(([v]) => v === d).map(([, k]) => g.cellEl(Math.floor(k / 9), k % 9).classList.contains('same'));
      const other = s.user.findIndex((v) => v && v !== d);
      return { all: same.slice(1).every(Boolean) || same.every(Boolean), n: same.length, other: g.cellEl(Math.floor(other / 9), other % 9).classList.contains('same') };
    });
    expect(r.n).toBeGreaterThan(1);
    expect(r.all).toBe(true);
    expect(r.other).toBe(false);
  });

  test('отмена и повтор: ввод, заметки и подсказка; Ctrl+Z работает в русской раскладке', async ({ page }) => {
    await open(page);
    await page.evaluate(() => { __game.newSync('easy', 5); __game.kit.play(); });
    const e = await page.evaluate(EMPTY);
    await page.evaluate((e) => { __game.select(e.r, e.c); __game.input(e.d); }, e);
    await page.keyboard.press('Control+KeyZ');
    await page.waitForTimeout(80);
    expect(await page.evaluate((i) => __game.state.user[i], e.i)).toBe(0);
    await page.keyboard.press('Control+KeyY');
    await page.waitForTimeout(80);
    expect(await page.evaluate((i) => __game.state.user[i], e.i)).toBe(e.d);
    const h = await page.evaluate(() => { const before = __game.state.user.filter(Boolean).length; __game.hint(); const after = __game.state.user.filter(Boolean).length; __game.undo(); return [before, after, __game.state.user.filter(Boolean).length, __game.state.hints]; });
    expect(h[1]).toBe(h[0] + 1);
    expect(h[2]).toBe(h[0]);
  });

  test('подсказка ставит цифру и объясняет приём; при ошибке сначала показывает её', async ({ page }) => {
    await open(page);
    const r = await page.evaluate((E) => {
      const g = __game; g.newSync('hard', 6);
      const before = g.state.user.filter(Boolean).length;
      g.hint();
      const text1 = document.getElementById('hintText').textContent;
      const placed = g.state.user.filter(Boolean).length === before + 1;
      const correct = g.state.user.every((v, i) => !v || v === g.state.solution[i]);
      const e = eval(E); g.select(e.r, e.c); g.input(e.d === 9 ? 1 : e.d + 1);
      const n = g.state.user.filter(Boolean).length;
      g.hint();
      const text2 = document.getElementById('hintText').textContent;
      return { text1, placed, correct, text2, same: g.state.user.filter(Boolean).length === n, sel: g.state.selected, wrong: e.i, hints: g.state.hints };
    }, EMPTY);
    expect(r.placed).toBe(true);
    expect(r.correct).toBe(true);
    expect(r.text1).toMatch(/Последний кандидат|Скрытая одиночка|Пересечение|пара|тройка|Крест|Рыба/);
    expect(r.text1).toMatch(/R\dC\d/);
    expect(r.text2).toMatch(/ошибк/i);
    expect(r.same).toBe(true);
    expect(r.sel.r * 9 + r.sel.c).toBe(r.wrong);
    expect(r.hints).toBe(1);
  });

  test('лимит ошибок: три ошибки - поражение; без лимита - игра идёт', async ({ page }) => {
    await open(page);
    await page.evaluate((E) => {
      const g = __game; g.kit.set('mistakeLimit', 3); g.newSync('easy', 7); g.kit.play();
      for (let k = 0; k < 3; k++) { const e = eval(E); g.select(e.r, e.c); g.input(e.d === 9 ? 1 : e.d + 1); g.erase(); }
    }, EMPTY);
    await expect(page.locator('[data-screen=over]')).toBeVisible();
    const r = await page.evaluate((E) => {
      const g = __game; g.kit.set('mistakeLimit', 0); g.newSync('easy', 7); g.kit.play();
      for (let k = 0; k < 5; k++) { const e = eval(E); g.select(e.r, e.c); g.input(e.d === 9 ? 1 : e.d + 1); g.erase(); }
      return [g.state.mistakes, g.state.phase];
    }, EMPTY);
    expect(r).toEqual([5, 'play']);
  });
});

test.describe('Судоку: итоги, рекорды, прогресс', () => {
  test('победа: окно итога, рекорд уровня, серия побед и статистика переживают перезагрузку', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      localStorage.clear(); const g = __game; g.newSync('easy', 8); g.kit.play();
      g.state.elapsed = 125;
      const s = g.state; s.user.forEach((v, i) => { if (!v) { g.select(Math.floor(i / 9), i % 9); g.input(s.solution[i]); } });
    });
    await expect(page.locator('[data-screen=win]')).toBeVisible();
    await expect(page.locator('[data-screen=win]')).toContainText('2:05');
    await page.reload();
    await page.waitForFunction(() => window.__game && __game.ready);
    const r = await page.evaluate(() => ({ best: __game.records.levels.easy.best, won: __game.records.levels.easy.won, streak: __game.records.streak }));
    expect(r.best).toBe(125);
    expect(r.won).toBe(1);
    expect(r.streak.cur).toBe(1);
    await page.click('[data-screen=main] [data-id=achievements]');
    await expect(page.locator('[data-screen=achievements]')).toContainText('Лёгкий');
    await expect(page.locator('[data-screen=achievements]')).toContainText('Серия побед');
  });

  test('ежедневная: решённая отмечается, серия дней растёт на следующий день и рвётся после пропуска', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      localStorage.clear(); const g = __game, out = [];
      const solve = () => { const s = g.state; s.user.forEach((v, i) => { if (!v) { g.select(Math.floor(i / 9), i % 9); g.input(s.solution[i]); } }); };
      for (const d of ['2026-09-27', '2026-09-28', '2026-09-30']) { g.startDailySync(d); g.kit.play(); solve(); out.push(g.records.daily.streak); }
      return { out, done: Object.keys(g.records.daily.done).sort() };
    });
    expect(r.out).toEqual([1, 2, 1]);
    expect(r.done).toEqual(['2026-09-27', '2026-09-28', '2026-09-30']);
  });

  test('ход сохраняется сам: после перезагрузки «Продолжить» возвращает поле, заметки и время', async ({ page }) => {
    await open(page);
    const e = await page.evaluate((E) => {
      localStorage.clear(); const g = __game; g.newSync('medium', 9); g.kit.play();
      const e = eval(E); g.select(e.r, e.c); g.input(e.d);
      const e2 = eval(E); g.toggleNotes(); g.select(e2.r, e2.c); g.input(3); g.toggleNotes();
      g.state.elapsed = 61; g.save();
      return { e, e2, puzzle: g.state.puzzle.join('') };
    }, EMPTY);
    await page.reload();
    await page.waitForFunction(() => window.__game && __game.ready);
    await page.click('[data-screen=main] [data-id=continue]');
    const r = await page.evaluate(([i, j]) => ({ v: __game.state.user[i], n: [...__game.state.notes[j]], t: Math.floor(__game.state.elapsed), p: __game.state.puzzle.join(''), mode: __game.kit.mode }), [e.e.i, e.e2.i]);
    expect(r).toEqual({ v: e.e.d, n: [3], t: 61, p: e.puzzle, mode: 'play' });
  });

  test('тёмная и светлая тема: цвета поля и окон меняются сразу и сохраняются', async ({ page }) => {
    await open(page);
    const dark = await page.evaluate(() => { __game.kit.set('theme', 'dark'); return getComputedStyle(document.body).backgroundColor; });
    const light = await page.evaluate(() => { __game.kit.set('theme', 'light'); return { bg: getComputedStyle(document.body).backgroundColor, panel: getComputedStyle(document.querySelector('.kit-panel')).backgroundColor }; });
    expect(light.bg).not.toBe(dark);
    await page.reload();
    await page.waitForFunction(() => window.__game && __game.ready);
    expect(await page.evaluate(() => [document.documentElement.dataset.theme, getComputedStyle(document.body).backgroundColor])).toEqual(['light', light.bg]);
    await page.click('[data-screen=main] [data-id=settings]');
    await expect(page.locator('[data-setting=theme][data-value=dark]')).toBeVisible();
  });

  test('автопилот решает головоломку каждого уровня логикой, без ошибок, до окна победы', async ({ page }) => {
    test.setTimeout(120000);
    await open(page);
    for (const lv of LEVELS) {
      const r = await page.evaluate((lv) => {
        const g = __game; g.kit.closeAll(); g.newSync(lv, 11); g.kit.play(); g.setAutopilot(true);
        let n = 0; while (g.state.phase === 'play' && n++ < 5000) g.step(1);
        g.setAutopilot(false);
        return { phase: g.state.phase, mistakes: g.state.mistakes, hints: g.state.hints };
      }, lv);
      expect(r, lv).toEqual({ phase: 'won', mistakes: 0, hints: 0 });
      await expect(page.locator('[data-screen=win]')).toBeVisible();
    }
  });

  test('своя головоломка: противоречивая отвергается, классическая загружается', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const bad = '55' + '0'.repeat(79);
      const good = '530070000600195000098000060800060003400803001700020006060000280000419005000080079';
      return { bad: __game.importPuzzle(bad), good: __game.importPuzzle(good), p: __game.state.puzzle.join('') };
    });
    expect(r.bad).toBe(false);
    expect(r.good).toBe(true);
    expect(r.p).toBe('530070000600195000098000060800060003400803001700020006060000280000419005000080079');
  });
});

test.describe('Судоку: пауза, клавиши, окно', () => {
  test('пауза прячет поле и останавливает время; скрытая вкладка - тоже пауза', async ({ page }) => {
    await open(page);
    await page.click('[data-screen=main] [data-id=new]');
    await page.click('[data-screen=levels] [data-level=easy]');
    await page.waitForFunction(() => __game.kit.mode === 'play');
    await page.keyboard.press('Escape');
    const t = await page.evaluate(() => __game.state.elapsed);
    await page.waitForTimeout(600);
    const r = await page.evaluate(() => ({ t: __game.state.elapsed, hidden: document.getElementById('board').classList.contains('hidden') }));
    expect(r).toEqual({ t, hidden: true });
    await page.click('[data-screen=pause] [data-id=resume]');
    await hideTab(page); await showTab(page);
    expect(await page.evaluate(() => __game.kit.mode)).toBe('paused');
  });

  test('клавиши: стрелки двигают выбор, цифры ставят; подсказку можно переназначить, цифру взять нельзя', async ({ page }) => {
    await open(page);
    await page.evaluate(() => localStorage.clear());
    await page.click('[data-screen=main] [data-id=settings]');
    await page.click('[data-bind="hint:0"]'); await page.keyboard.press('Digit5');
    await expect(page.locator('.kit-modal .kit-warn')).toContainText('Цифры');
    await page.keyboard.press('KeyJ');
    await page.click('[data-screen=settings] .kit-btn:has-text("Готово")');
    await page.evaluate(() => { __game.newSync('easy', 12); __game.kit.closeAll(); __game.kit.play(); __game.select(0, 0); });
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(80);
    expect(await page.evaluate(() => __game.state.selected)).toEqual({ r: 1, c: 1 });
    const e = await page.evaluate(EMPTY);
    await page.evaluate((e) => __game.select(e.r, e.c), e);
    await page.keyboard.press('Digit' + e.d);
    expect(await page.evaluate((i) => __game.state.user[i], e.i)).toBe(e.d);
    const n = await page.evaluate(() => __game.state.hints);
    await page.keyboard.press('KeyJ');
    await page.waitForTimeout(80);
    expect(await page.evaluate(() => __game.state.hints)).toBe(n + 1);
  });

  test('геймпад: крестовина двигает выбор, RB выбирает цифру, A ставит', async ({ page }) => {
    await page.addInitScript(() => {
      window.__pad = { connected: true, id: 'fake', index: 0, mapping: 'standard', buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0] };
      navigator.getGamepads = () => [window.__pad];
    });
    await open(page);
    await page.evaluate(() => { __game.newSync('easy', 13); __game.kit.closeAll(); __game.kit.play(); __game.select(4, 4); });
    // нажатие держится, пока игра его не увидит (по кадрам, а не по часам - под нагрузкой кадры реже)
    const frames = (n) => page.evaluate((n) => new Promise((r) => { const f = (k) => (k ? requestAnimationFrame(() => f(k - 1)) : r()); f(n); }), n);
    const tap = async (b) => { await page.evaluate((b) => { __pad.buttons[b].pressed = true; }, b); await frames(3); await page.evaluate((b) => { __pad.buttons[b].pressed = false; }, b); await frames(3); };
    await tap(15);
    expect(await page.evaluate(() => __game.state.selected)).toEqual({ r: 4, c: 5 });
    const e = await page.evaluate(EMPTY);
    await page.evaluate((e) => { __game.select(e.r, e.c); __game.state.padDigit = 1; }, e);
    for (let k = 1; k < e.d; k++) await tap(5);
    await tap(0);
    expect(await page.evaluate((i) => __game.state.user[i], e.i)).toBe(e.d);
  });

  for (const size of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }, { width: 1024, height: 700 }]) {
    test(`поле и панель влезают в окно ${size.width}x${size.height} без прокрутки`, async ({ page }) => {
      await page.setViewportSize(size);
      await open(page);
      await page.evaluate(() => { __game.newSync('easy', 1); __game.kit.closeAll(); __game.kit.play(); });
      expectFits(expect, await fitReport(page, '#board'));
      expectFits(expect, await fitReport(page, '#side'));
      const b = await page.evaluate(() => document.getElementById('board').getBoundingClientRect().width);
      expect(b).toBeGreaterThan(size.height * 0.6);
    });
  }
});

test.describe('Судоку: по второму ревью', () => {
  test('генератор никогда не возвращает null: сотни зёрен каждого уровня и все даты двух лет; «Эксперт» - быстро', async ({ page }) => {
    test.setTimeout(600000);
    await open(page);
    const r = await page.evaluate(() => {
      const L = SudokuLogic, out = { nulls: [], notUnique: 0, maxExpert: 0 };
      const seeds = { easy: 200, medium: 200, hard: 150, expert: 120 };
      for (const lv in seeds) for (let s = 1; s <= seeds[lv]; s++) {
        const t = performance.now(); const g = L.generate(lv, s);
        if (lv === 'expert') out.maxExpert = Math.max(out.maxExpert, performance.now() - t);
        if (!g) { out.nulls.push(lv + ':' + s); continue; }
        if (L.countSolutions(g.puzzle, 2) !== 1) out.notUnique++;
      }
      // все даты двух лет (и дни, где раньше ломалось: 01.11.2026, 28.02.2027, 19.09.2027)
      const days = [];
      for (let d = Date.UTC(2026, 0, 1); d < Date.UTC(2028, 0, 1); d += 864e5) days.push(new Date(d).toISOString().slice(0, 10));
      for (const day of days) { const g = __game.dailyPuzzle(day); if (!g) out.nulls.push(day); else if (L.countSolutions(g.puzzle, 2) !== 1) out.notUnique++; }
      out.days = days.length;
      return out;
    });
    expect(r.nulls).toEqual([]);
    expect(r.notUnique).toBe(0);
    expect(r.days).toBe(730);
    expect(r.maxExpert).toBeLessThan(4000);
  });

  test('подготовка головоломки не замирает: страница отвечает, пока строится «Эксперт», потом игра начинается', async ({ page }) => {
    await open(page, 'seed=107&date=2026-11-01');
    await page.click('[data-screen=main] [data-id=new]');
    await page.click('[data-screen=levels] [data-level=expert]');
    await expect(page.locator('[data-screen=preparing] .spinner')).toBeVisible();
    const t0 = Date.now(); await page.evaluate(() => 1); expect(Date.now() - t0).toBeLessThan(500);
    await page.waitForFunction(() => __game.kit.mode === 'play', null, { timeout: 15000 });
    expect(await page.evaluate(() => [__game.state.level, SudokuLogic.countSolutions(__game.state.puzzle, 2)])).toEqual(['expert', 1]);
  });

  test('отмена ошибки не возвращает счётчик ошибок', async ({ page }) => {
    await open(page);
    const r = await page.evaluate((E) => {
      const g = __game; g.newSync('easy', 21);
      const e = eval(E); g.select(e.r, e.c); g.input(e.d === 9 ? 1 : e.d + 1);
      const m = g.state.mistakes; g.undo();
      return { m, after: g.state.mistakes, cell: g.state.user[e.i] };
    }, EMPTY);
    expect(r).toEqual({ m: 1, after: 1, cell: 0 });
  });

  test('время сохраняется на паузе, при скрытии вкладки, при уходе со страницы и раз в несколько секунд', async ({ page }) => {
    await open(page);
    const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('sudoku:game')).elapsed);
    await page.evaluate(() => { const g = __game; g.newSync('easy', 22); g.kit.play(); g.state.elapsed = 42; g.kit.pause(); });
    expect(await saved()).toBe(42);
    await page.evaluate(() => { __game.kit.resume(); __game.state.elapsed = 50; });
    await hideTab(page); await showTab(page);
    expect(await saved()).toBe(50);
    await page.evaluate(() => { __game.kit.resume(); __game.state.elapsed = 60; dispatchEvent(new Event('pagehide')); });
    expect(await saved()).toBe(60);
    await page.evaluate(() => { __game.state.elapsed = 70; __game.step(6 * 60); });
    expect(await saved()).toBeGreaterThanOrEqual(70);
  });

  test('испорченное сохранение: неверная дата, чужое решение, 50 ошибок - игра продолжается честно, победа засчитывается', async ({ page }) => {
    const errors = await open(page);
    const real = await page.evaluate(() => { const g = __game; g.newSync('easy', 23); g.kit.play(); g.save(); return g.state.solution.join(''); });
    await page.evaluate(() => {
      const o = JSON.parse(localStorage.getItem('sudoku:game'));
      o.daily = 'x'; o.mistakes = 50; o.solution = o.solution.split('').reverse().join('');
      localStorage.setItem('sudoku:game', JSON.stringify(o));
    });
    await page.reload();
    await page.waitForFunction(() => window.__game && __game.ready);
    await page.click('[data-screen=main] [data-id=continue]');
    const r = await page.evaluate(() => ({ daily: __game.state.daily, sol: __game.state.solution.join(''), m: __game.state.mistakes, phase: __game.state.phase }));
    expect(r.daily).toBe(null);
    expect(r.sol).toBe(real);
    expect(r.m).toBeLessThan(3);
    expect(r.phase).toBe('play');
    await page.evaluate(() => { const g = __game, s = g.state; s.user.forEach((v, i) => { if (!v) { g.select(Math.floor(i / 9), i % 9); g.input(s.solution[i]); } }); });
    await expect(page.locator('[data-screen=win]')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('рекорд меньше секунды - это рекорд, а не «пусто»; безумный рекорд из хранилища отбрасывается', async ({ page }) => {
    await open(page);
    await page.evaluate(() => { localStorage.clear(); const g = __game; g.newSync('easy', 24); g.kit.play(); g.state.elapsed = 0.4; const s = g.state; s.user.forEach((v, i) => { if (!v) { g.select(Math.floor(i / 9), i % 9); g.input(s.solution[i]); } }); });
    expect(await page.evaluate(() => __game.records.levels.easy.best)).toBeGreaterThan(0);
    await page.evaluate(() => localStorage.setItem('sudoku:records', JSON.stringify({ levels: { hard: { played: 1, won: 1, best: 999999999, total: 999999999 } } })));
    await page.reload();
    await page.waitForFunction(() => window.__game && __game.ready);
    await page.click('[data-screen=main] [data-id=new]');
    await expect(page.locator('[data-screen=levels] [data-level=hard]')).not.toContainText('16666666');
  });

  test('тёмная тема: неверная цифра в выбранной клетке читается (контраст не ниже 4.5)', async ({ page }) => {
    await open(page);
    const ratio = await page.evaluate((E) => {
      const g = __game; g.kit.set('theme', 'dark'); g.newSync('easy', 25);
      const e = eval(E); g.select(e.r, e.c); g.input(e.d === 9 ? 1 : e.d + 1);
      const cs = getComputedStyle(g.cellEl(e.r, e.c));
      const rgb = (x) => x.match(/[0-9.]+/g).slice(0, 3).map(Number);
      const lum = ([r, gg, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(gg) + 0.0722 * f(b); };
      const a = lum(rgb(cs.color)), b = lum(rgb(cs.backgroundColor));
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    }, EMPTY);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});
