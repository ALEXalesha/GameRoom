// Законы «Блоков»: полный ряд очищается и даёт очки, фигура не проходит сквозь стены и блоки,
// гравитация и фиксация, переполнение - конец игры и рестарт, пауза, запас, рекорд, раскладка.
const { test, expect } = require('@playwright/test');
const { openGame, fitReport, expectFits, SIZES } = require('./_games-helpers');

// Пустое поле с заполненными нижними рядами, кроме столбцов gap.
const fillRows = (rows, gapCols) => `(() => {
  const g = __game; g.reset();
  const grid = Array.from({ length: g.ROWS }, () => Array(g.COLS).fill(0));
  for (let y = g.ROWS - ${rows}; y < g.ROWS; y++) for (let x = 0; x < g.COLS; x++) if (!${JSON.stringify(gapCols)}.includes(x)) grid[y][x] = 'J';
  g.grid = grid;
})()`;

test.describe('tetris', () => {
  test('полный ряд очищается и даёт 100 очков, поле сдвигается', async ({ page }) => {
    const errors = await openGame(page, 'tetris', 'seed=1');
    await page.evaluate(fillRows(1, [0, 1, 2, 3]));
    const r = await page.evaluate(() => {
      const g = __game;
      g.grid[g.ROWS - 2][5] = 'S';          // блок над рядом должен опуститься
      g.setPiece('I');                      // горизонтальная палка встаёт в столбцы 3..6
      while (g.move(-1)) {}                 // до левой стены: столбцы 0..3
      g.hardDrop();
      return { lines: g.lines, score: g.score, bottom: g.grid[g.ROWS - 1].filter(Boolean).length, moved: g.grid[g.ROWS - 1][5] };
    });
    expect(r.lines).toBe(1);
    expect(r.score).toBeGreaterThanOrEqual(100);
    expect(r.score).toBeLessThan(200);      // 100 за ряд + 2 за каждую клетку сброса
    expect(r.moved).toBe('S');
    expect(r.bottom).toBe(1);
    expect(errors).toEqual([]);
  });

  test('четыре ряда разом - 800 очков', async ({ page }) => {
    await openGame(page, 'tetris', 'seed=1');
    await page.evaluate(fillRows(4, [9]));
    const r = await page.evaluate(() => {
      const g = __game; g.setPiece('I'); g.tryRotate(1);
      while (g.move(1)) {}
      const before = g.score; g.hardDrop();
      return { lines: g.lines, gain: g.score - before, empty: g.grid.every(row => row.every(c => !c)) };
    });
    expect(r.lines).toBe(4);
    expect(r.gain).toBeGreaterThanOrEqual(800);
    expect(r.gain).toBeLessThan(900);
    expect(r.empty).toBe(true);
  });

  test('фигура не проходит сквозь стены и поворот у стены оставляет её в поле', async ({ page }) => {
    await openGame(page, 'tetris', 'seed=1');
    const r = await page.evaluate(() => {
      const g = __game; g.reset();
      const cells = () => { const c = g.current, out = []; c.shape.forEach((row, y) => row.forEach((v, x) => v && out.push([c.x + x, c.y + y]))); return out; };
      const res = {};
      for (const t of ['I', 'T', 'L', 'O']) {
        g.setPiece(t);
        for (let i = 0; i < 20; i++) g.move(-1);
        const minX = Math.min(...cells().map(c => c[0]));
        for (let i = 0; i < 4; i++) g.tryRotate(1);
        const afterRot = cells().every(([x]) => x >= 0 && x < g.COLS);
        for (let i = 0; i < 20; i++) g.move(1);
        const maxX = Math.max(...cells().map(c => c[0]));
        res[t] = { minX, maxX, afterRot };
      }
      return res;
    });
    for (const t of Object.keys(r)) {
      expect(r[t].minX, t).toBe(0);
      expect(r[t].maxX, t).toBe(9);
      expect(r[t].afterRot, t).toBe(true);
    }
  });

  test('фигура не проходит сквозь блоки', async ({ page }) => {
    await openGame(page, 'tetris', 'seed=1');
    const r = await page.evaluate(() => {
      const g = __game; g.reset();
      for (let y = 0; y < g.ROWS; y++) g.grid[y][2] = 'Z';     // стена из блоков в столбце 2
      g.setPiece('O');
      for (let i = 0; i < 10; i++) g.move(-1);
      return g.current.x;
    });
    expect(r).toBe(3);
  });

  test('гравитация опускает фигуру, на дне она фиксируется через задержку', async ({ page }) => {
    await openGame(page, 'tetris', 'seed=1');
    const r = await page.evaluate(() => {
      const g = __game; g.reset(); g.setPiece('T');
      const y0 = g.current.y;
      for (let i = 0; i < 10; i++) g.tick(100); g.tick(5);   // уровень 1: клетка в секунду
      const y1 = g.current.y;
      while (g.drop(false)) {}              // на дно без фиксации
      const count = () => g.grid.flat().filter(Boolean).length;
      g.tick(50); g.tick(50); g.tick(50); g.tick(50);        // 0.2 с на дне - ещё не зафиксирована
      const early = count();
      for (let i = 0; i < 4; i++) g.tick(100);               // ещё 0.4 с - задержка 0.5 с прошла
      return { y0, y1, early, locked: count() };
    });
    expect(r.y1).toBe(r.y0 + 1);
    expect(r.early).toBe(0);
    expect(r.locked).toBe(4);
  });

  test('переполнение - конец игры, R начинает заново, рекорд переживает перезагрузку', async ({ page }) => {
    await openGame(page, 'tetris', 'seed=1');
    await page.evaluate(() => localStorage.removeItem('tetris_best'));
    const r = await page.evaluate(() => {
      const g = __game; g.reset();
      for (let y = 4; y < g.ROWS; y++) for (let x = 0; x < g.COLS; x++) if (x !== y % g.COLS) g.grid[y][x] = 'L';
      let n = 0;
      while (!g.gameOver && n++ < 20) g.hardDrop();
      return { over: g.gameOver, score: g.score, best: g.best };
    });
    expect(r.over).toBe(true);
    expect(r.best).toBe(r.score);
    expect(r.score).toBeGreaterThan(0);
    await expect(page.locator('#overlay')).toContainText('КОНЕЦ ИГРЫ');
    await page.keyboard.press('KeyR');
    const s = await page.evaluate(() => ({ over: __game.gameOver, score: __game.score, filled: __game.grid.flat().filter(Boolean).length }));
    expect(s).toEqual({ over: false, score: 0, filled: 0 });
    await page.reload();
    await page.waitForFunction(() => window.__game && __game.ready);
    expect(await page.evaluate(() => __game.best)).toBe(r.score);
    await expect(page.locator('#best')).toHaveText(String(r.score));
  });

  test('пауза останавливает падение', async ({ page }) => {
    await openGame(page, 'tetris', 'seed=1');
    await page.keyboard.press('KeyP');
    const y = await page.evaluate(() => { __game.tick(5000); return __game.current.y; });
    await page.waitForTimeout(1300);
    expect(await page.evaluate(() => ({ y: __game.current.y, p: __game.paused }))).toEqual({ y, p: true });
    await expect(page.locator('#overlay')).toContainText('ПАУЗА');
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => __game.paused)).toBe(false);
  });

  test('клавиши работают в русской раскладке (по коду клавиши)', async ({ page }) => {
    await openGame(page, 'tetris', 'seed=1');
    const r = await page.evaluate(() => {
      const g = __game; g.reset(); g.setPiece('T');
      const send = (key, code) => document.dispatchEvent(new KeyboardEvent('keydown', { key, code, bubbles: true }));
      const rot0 = g.current.rot;
      send('я', 'KeyZ');
      const rotZ = g.current.rot;
      send('с', 'KeyC');
      const held = g.hold;
      send('з', 'KeyP');
      return { rot0, rotZ, held, paused: g.paused };
    });
    expect(r.rotZ).toBe((r.rot0 + 3) % 4);
    expect(r.held).toBe('T');
    expect(r.paused).toBe(true);
  });

  test('запас: фигура уходит в запас, второй раз подряд нельзя', async ({ page }) => {
    await openGame(page, 'tetris', 'seed=1');
    const r = await page.evaluate(() => {
      const g = __game; g.reset();
      const first = g.current.type, nextType = g.queue[0];
      const ok1 = g.holdPiece();
      const now = g.current.type;
      const ok2 = g.holdPiece();
      return { first, nextType, ok1, now, ok2, hold: g.hold };
    });
    expect(r.ok1).toBe(true);
    expect(r.hold).toBe(r.first);
    expect(r.now).toBe(r.nextType);
    expect(r.ok2).toBe(false);
  });

  test('одинаковый seed - одинаковая очередь фигур, в каждой семёрке все семь', async ({ page }) => {
    const q = async () => { await openGame(page, 'tetris', 'seed=5'); return page.evaluate(() => { __game.reset(); return __game.current.type + __game.queue.join(''); }); };
    const a = await q(); const b = await q();
    expect(b).toBe(a);
    expect([...a.slice(0, 7)].sort().join('')).toBe('IJLOSTZ');
  });

  for (const size of SIZES) {
    test(`влезает в окно ${size.width}x${size.height}`, async ({ page }) => {
      await page.setViewportSize(size);
      await openGame(page, 'tetris');
      expectFits(expect, await fitReport(page, '#board'));
    });
  }
});
