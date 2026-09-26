// Законы «Судоку»: пазл с единственным решением и нужным числом подсказок, верная и неверная
// цифра, открытые клетки не меняются, отмена и возврат, подсказка отменяется вместе с
// «замком», «Одиночки» не ставят неверных цифр, импорт отвергает противоречия, победа и рекорд,
// автосохранение, клавиши в русской раскладке, пауза, окно.
const { test, expect } = require('@playwright/test');
const { openGame, fitReport, expectFits, SIZES } = require('./_games-helpers');

const CLASSIC = '530070000600195000098000060800060003400803001700020006060000280000419005000080079';
const SOLVED = '534678912672195348198342567859761423426853791713924856961537284287419635345286179';

// Первая пустая клетка и её верная и неверная цифры
const firstEmpty = () => {
  const s = __game.state;
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (!s.user[r][c]) return { r, c, ok: s.solution[r][c], bad: s.solution[r][c] % 9 + 1 };
  return null;
};

test.describe('sudoku', () => {
  test('первый запуск: пазл есть, красной ошибки «Сохранения нет» нет', async ({ page }) => {
    const errors = await openGame(page, 'sudoku', 'seed=1');
    await expect(page.locator('.cell')).toHaveCount(81);
    await expect(page.locator('#msg')).not.toHaveClass(/bad/);
    await expect(page.locator('#msg')).toHaveText('');
    expect(errors).toEqual([]);
  });

  test('пазлы с единственным решением и нужным числом открытых клеток; «Эксперт» строится быстро', async ({ page }) => {
    await openGame(page, 'sudoku', 'seed=3');
    const r = await page.evaluate(() => {
      const g = __game, out = {};
      for (const d of ['easy', 'medium', 'hard', 'expert']) {
        const t = performance.now();
        const { puzzle, solution } = g.generate(d);
        const ms = performance.now() - t;
        const agree = puzzle.every((row, i) => row.every((v, j) => !v || v === solution[i][j]));
        out[d] = { clues: puzzle.flat().filter(Boolean).length, unique: g.countSolutions(puzzle, 2), agree, ms };
      }
      return out;
    });
    expect(r.easy.clues).toBe(40);
    expect(r.medium.clues).toBe(32);
    expect(r.hard.clues).toBeLessThanOrEqual(27);
    expect(r.expert.clues).toBeLessThanOrEqual(25);
    for (const d of Object.keys(r)) {
      expect(r[d].unique, d).toBe(1);
      expect(r[d].agree, d).toBe(true);
    }
    expect(r.expert.ms).toBeLessThan(1000);     // раньше до секунды и дольше, страница замирала
  });

  test('верная цифра встаёт, неверная - ошибка и красная клетка; открытую клетку не изменить', async ({ page }) => {
    await openGame(page, 'sudoku', 'seed=1');
    await page.evaluate(() => __game.newSync('medium'));
    const r = await page.evaluate((fe) => {
      const g = __game, s = g.state, e = eval(fe)();
      g.selectCell(e.r, e.c); g.inputNumber(e.bad);
      const errBad = s.errors, cls = document.querySelectorAll('.cell')[e.r * 9 + e.c].className;
      g.inputNumber(e.ok);
      const okVal = s.user[e.r][e.c], errAfter = s.errors;
      let gr = -1, gc = -1;
      for (let i = 0; i < 81 && gr < 0; i++) if (s.given[Math.floor(i / 9)][i % 9]) { gr = Math.floor(i / 9); gc = i % 9; }
      const before = s.user[gr][gc];
      g.selectCell(gr, gc); g.inputNumber(before % 9 + 1);
      return { errBad, cls, okVal, ok: e.ok, errAfter, givenSame: s.user[gr][gc] === before };
    }, firstEmpty.toString().replace(/^/, '(') + ')');
    expect(r.errBad).toBe(1);
    expect(r.cls).toContain('error');
    expect(r.okVal).toBe(r.ok);
    expect(r.errAfter).toBe(1);
    expect(r.givenSame).toBe(true);
  });

  test('отмена и возврат; подсказка отменяется, и клетка снова доступна', async ({ page }) => {
    await openGame(page, 'sudoku', 'seed=1');
    await page.evaluate(() => __game.newSync('medium'));
    const r = await page.evaluate((fe) => {
      const g = __game, s = g.state, e = eval(fe)();
      g.selectCell(e.r, e.c); g.inputNumber(e.ok);
      g.undo(); const undone = s.user[e.r][e.c];
      g.redo(); const redone = s.user[e.r][e.c];
      g.undo();
      g.selectCell(e.r, e.c); g.giveHint();
      const hinted = s.user[e.r][e.c];
      g.undo();
      g.selectCell(e.r, e.c); g.inputNumber(e.ok);
      return { undone, redone, hinted, ok: e.ok, after: s.user[e.r][e.c] };
    }, '(' + firstEmpty.toString() + ')');
    expect(r.undone).toBe(0);
    expect(r.redone).toBe(r.ok);
    expect(r.hinted).toBe(r.ok);
    expect(r.after).toBe(r.ok);            // раньше клетка оставалась пустой и запертой навсегда
  });

  test('«Одиночки» не ставят неверных цифр, даже когда у игрока есть ошибка', async ({ page }) => {
    await openGame(page, 'sudoku', 'seed=1');
    await page.evaluate(() => __game.newSync('easy'));
    const r = await page.evaluate((fe) => {
      const g = __game, s = g.state, e = eval(fe)();
      g.selectCell(e.r, e.c); g.inputNumber(e.bad);      // сознательная ошибка
      g.fillSingles();
      let wrong = 0, filled = 0;
      for (let i = 0; i < 81; i++) {
        const rr = Math.floor(i / 9), cc = i % 9, v = s.user[rr][cc];
        if (v && !(rr === e.r && cc === e.c)) { filled++; if (v !== s.solution[rr][cc]) wrong++; }
      }
      return { wrong, filled };
    }, '(' + firstEmpty.toString() + ')');
    expect(r.wrong).toBe(0);
    expect(r.filled).toBeGreaterThan(40);
    // Подстроенный случай: пусты (0,0)=5, (0,3)=6, (1,0)=6; игрок ошибочно ставит 5 в (1,0).
    // Если считать ошибку опорой, в (0,0) остаётся одна «шестёрка» - и она неверна.
    const t = SOLVED.split(''); t[0] = '0'; t[3] = '0'; t[9] = '0';
    const trap = await page.evaluate((str) => {
      const g = __game, s = g.state;
      g.importPuzzle(str); g.selectCell(1, 0); g.inputNumber(5); g.fillSingles();
      return [s.user[0][0], s.user[0][3]];
    }, t.join(''));
    expect([0, 5]).toContain(trap[0]);
    expect([0, 6]).toContain(trap[1]);
  });

  test('импорт: противоречивые открытые цифры отвергаются, классический пазл загружается', async ({ page }) => {
    await openGame(page, 'sudoku', 'seed=1');
    const bad = '55' + CLASSIC.slice(2);                      // две пятёрки в первой строке
    const r = await page.evaluate(([b, ok]) => ({ bad: __game.importPuzzle(b), msg: document.getElementById('msg').textContent, good: __game.importPuzzle(ok), first: __game.state.solution[0].join('') }), [bad, CLASSIC]);
    expect(r.bad).toBe(false);
    // Полностью заполненная сетка с повтором (две тройки в строке) - тоже не пазл
    const dup = '3' + SOLVED.slice(1);
    expect(await page.evaluate((d) => __game.importPuzzle(d), dup)).toBe(false);
    expect(r.msg).toContain('нет решения');
    expect(r.good).toBe(true);
    expect(r.first).toBe('534678912');
  });

  test('победа: рекорд времени уровня записан и переживает перезагрузку', async ({ page }) => {
    await openGame(page, 'sudoku', 'seed=1');
    await page.evaluate(() => { localStorage.clear(); __game.newSync('easy'); __game.tickTime(75); });
    await page.evaluate(() => {
      const g = __game, s = g.state;
      for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (!s.user[r][c]) { g.selectCell(r, c); g.inputNumber(s.solution[r][c]); }
    });
    expect(await page.evaluate(() => __game.state.won)).toBe(true);
    await expect(page.locator('#msg')).toContainText('Новый рекорд');
    await expect(page.locator('#best')).toHaveText('01:15');
    await page.reload();
    await page.waitForFunction(() => window.__game && __game.ready);
    expect(await page.evaluate(() => __game.loadBests().easy)).toBe(75);
  });

  test('ход сохраняется сам и переживает перезагрузку', async ({ page }) => {
    await openGame(page, 'sudoku', 'seed=1');
    const e = await page.evaluate((fe) => { __game.newSync('medium'); const e = eval(fe)(); __game.selectCell(e.r, e.c); __game.inputNumber(e.ok); return e; }, '(' + firstEmpty.toString() + ')');
    await page.reload();
    await page.waitForFunction(() => window.__game && __game.ready);
    expect(await page.evaluate((x) => __game.state.user[x.r][x.c], e)).toBe(e.ok);
  });

  test('Ctrl+Z работает в русской раскладке; P ставит паузу и время стоит', async ({ page }) => {
    await openGame(page, 'sudoku', 'seed=1');
    const r = await page.evaluate((fe) => {
      const g = __game, s = g.state; g.newSync('medium');
      const e = eval(fe)();
      g.selectCell(e.r, e.c); g.inputNumber(e.ok);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'я', code: 'KeyZ', ctrlKey: true, bubbles: true }));
      const undone = s.user[e.r][e.c];
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'з', code: 'KeyP', bubbles: true }));
      const t = s.elapsed; g.tickTime(30);
      return { undone, paused: s.paused, frozen: s.elapsed === t };
    }, '(' + firstEmpty.toString() + ')');
    expect(r).toEqual({ undone: 0, paused: true, frozen: true });
    await expect(page.locator('#pauseCover')).toBeVisible();
  });

  for (const size of SIZES) {
    test(`влезает в окно ${size.width}x${size.height} без прокрутки`, async ({ page }) => {
      await page.setViewportSize(size);
      await openGame(page, 'sudoku', 'seed=1');
      expectFits(expect, await fitReport(page, '#board'));
      expectFits(expect, await fitReport(page, '#pad'));
      expectFits(expect, await fitReport(page, '#singlesBtn'));
    });
  }
});
