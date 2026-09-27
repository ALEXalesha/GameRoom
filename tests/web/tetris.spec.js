// Законы «Блоков» для «Игротеки»: режимы Марафон (150 линий, 15 уровней, финал), Спринт 40 линий,
// Ультра 2 минуты, Дзен без проигрыша; SRS с отскоками от стен, запас, призрак, 5 фигур вперёд, мешок из 7,
// T-вращения, комбо, серия сложных очисток, чистое поле; задержка фиксации; DAS/ARR/SDF из настроек;
// рекорды по режимам и статистика; автопилот проходит Марафон; пауза, клавиши, геймпад, окно.
const { test, expect } = require('@playwright/test');
const { openGame, fitReport, expectFits } = require('./_games-helpers');
const { hideTab, showTab, pauseLayout } = require('./_kit-helpers');

const open = (page, q = 'seed=1&fast') => openGame(page, 'tetris', q);
// Поле из строк: последняя строка - нижний ряд; X - занято
const GRID = (rows) => `(() => { __game.setGrid(${JSON.stringify(rows)}); })()`;
const cells = `(() => { const c = __game.current, out = []; c.shape.forEach((r, y) => r.forEach((v, x) => { if (v) out.push([c.x + x, c.y + y]); })); return out; })()`;

test.describe('Блоки: меню и режимы', () => {
  test('главное меню над заставкой, «Играть» открывает четыре режима, в игре правит игрок', async ({ page }) => {
    const errors = await open(page);
    for (const t of ['Играть', 'Настройки', 'Достижения и рекорды', 'Как играть', 'Об игре']) await expect(page.locator(`[data-screen=main] .kit-btn:has-text("${t}")`).first()).toBeVisible();
    expect(await page.evaluate(() => [__game.autopilot, __game.state.mode])).toEqual([true, 'demo']);
    await page.click('[data-screen=main] [data-id=play]');
    for (const m of ['marathon', 'sprint', 'ultra', 'zen']) await expect(page.locator(`[data-screen=modes] [data-mode=${m}]`)).toBeVisible();
    await page.click('[data-screen=modes] [data-mode=marathon]');
    expect(await page.evaluate(() => [__game.autopilot, __game.state.mode, __game.kit.mode, __game.state.level])).toEqual([false, 'marathon', 'play', 1]);
    await expect(page).toHaveTitle(/не связана с правообладателем/);
    expect(errors).toEqual([]);
  });

  test('мешок из 7: в каждой семёрке все фигуры; видно 5 следующих; одинаковое зерно - одинаковая очередь', async ({ page }) => {
    await open(page, 'seed=5&fast');
    const a = await page.evaluate(() => { __game.startMode('zen'); const seq = [__game.current.type]; for (let i = 0; i < 27; i++) { __game.hardDrop(); seq.push(__game.current.type); } return { seq, next: __game.queue.slice(0, 5).length }; });
    for (let i = 0; i < 28; i += 7) expect(new Set(a.seq.slice(i, i + 7)).size).toBe(7);
    expect(a.next).toBe(5);
    await open(page, 'seed=5&fast');
    const b = await page.evaluate(() => { __game.startMode('zen'); const seq = [__game.current.type]; for (let i = 0; i < 27; i++) { __game.hardDrop(); seq.push(__game.current.type); } return seq; });
    expect(b).toEqual(a.seq);
  });
});

test.describe('Блоки: правила серии', () => {
  test('поворот у стены: I отскакивает от правой стены по таблице SRS', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const g = __game; g.startMode('zen'); g.setGrid([]);
      g.setPiece('I', 7, 5, 1);                         // вертикальная палка в последнем столбце
      const ok = g.rotate(1);
      const c = g.current;
      return { ok, rot: c.rot, x: c.x };
    });
    expect(r).toEqual({ ok: true, rot: 2, x: 6 });
    expect((await page.evaluate(cells)).every(([x]) => x >= 0 && x < 10)).toBe(true);
  });

  test('T-вращение двойное: 1200 очков, надпись и счётчик', async ({ page }) => {
    await open(page);
    await page.evaluate(() => __game.startMode('marathon'));
    await page.evaluate(GRID(['.....X....', 'XXX...XXXX', 'XXXX.XXXXX']));
    const r = await page.evaluate(() => {
      const g = __game; const s0 = g.state.score;
      g.setPiece('T', 3, 19, 3);                        // T носом влево в щели
      const rot = g.rotate(-1);
      g.hardDrop();
      return { rot, lines: g.state.lines, points: g.state.score - s0, label: g.state.label && g.state.label.lines.join(' '), tspins: g.state.stats.tspins };
    });
    expect(r.rot).toBe(true);
    expect(r.lines).toBe(2);
    expect(r.points).toBe(1200);
    expect(r.label).toMatch(/T-ВРАЩЕНИЕ/);
    expect(r.label).toMatch(/ДВОЙНОЕ/);
    expect(r.tspins).toBe(1);
  });

  test('четыре линии: 800, вторые подряд - серия ×1.5 (1200); комбо даёт 50×комбо', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const g = __game; g.startMode('marathon'); const out = [];
      const quad = () => { g.setGrid(['XXXXXXXXX.', 'XXXXXXXXX.', 'XXXXXXXXX.', 'XXXXXXXXX.', 'X........X']); g.setPiece('I', 7, 10, 1); const s = g.state.score; g.hardDrop(); return g.state.score - s; };
      const first = quad(), second = quad();
      out.push(first, second, g.state.label.lines.join(' '));
      // комбо: две одиночные подряд (с чистого счёта комбо)
      g.startMode('marathon');
      g.setGrid(['XXXXXXXX..', 'X.........']); g.setPiece('O', 8, 10, 0);
      let s = g.state.score; g.hardDrop(); const c1 = g.state.score - s;
      g.setGrid(['XXXXXXXX..', 'X.........']); g.setPiece('O', 8, 10, 0);
      s = g.state.score; g.hardDrop();
      return { first, second, b2b: out[2], combo: g.state.score - s, comboLabel: g.state.label.lines.join(' '), c1 };
    });
    expect(r.first).toBeGreaterThanOrEqual(800);
    expect(r.first).toBeLessThan(900);                       // 800 + до 2 за клетку падения
    expect(r.second - (r.first - 800)).toBeGreaterThanOrEqual(1200);
    expect(r.b2b).toMatch(/СЕРИЯ/);
    expect(r.comboLabel).toMatch(/КОМБО/);
    expect(r.combo).toBeGreaterThan(r.c1 + 40);             // вторая очистка подряд: +50×1
  });

  test('чистое поле: бонус и надпись', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const g = __game; g.startMode('marathon');
      g.setGrid(['XXXXXXXX..', 'XXXXXXXX..']); g.setPiece('O', 8, 10, 0);
      const s = g.state.score; g.hardDrop();
      return { pts: g.state.score - s, label: g.state.label.lines.join(' '), empty: g.grid.every((row) => row.every((c) => !c)) };
    });
    expect(r.empty).toBe(true);
    expect(r.label).toMatch(/ЧИСТОЕ ПОЛЕ/);
    expect(r.pts).toBeGreaterThanOrEqual(300 + 1200);
  });

  test('запас: фигура уходит в запас один раз до фиксации, потом возвращается', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const g = __game; g.startMode('zen');
      const t0 = g.current.type, next = g.queue[0];
      const a = g.holdPiece(), b = g.holdPiece();
      const afterHold = { hold: g.hold, cur: g.current.type };
      g.hardDrop();
      const c = g.holdPiece();
      return { t0, next, a, b, afterHold, c, cur: g.current.type };
    });
    expect(r.a).toBe(true);
    expect(r.b).toBe(false);
    expect(r.afterHold).toEqual({ hold: r.t0, cur: r.next });
    expect(r.c).toBe(true);
    expect(r.cur).toBe(r.t0);
  });

  test('призрак показывает место падения; жёсткий сброс кладёт туда', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const g = __game; g.startMode('zen'); g.setGrid(['....XX....', '...XXXX...']);
      g.setPiece('T', 3, 3, 0); const ghost = g.ghostY(); g.hardDrop();
      return { ghost, landed: g.lastLock.y };
    });
    expect(r.landed).toBe(r.ghost);
  });

  test('задержка фиксации: полсекунды на земле, сдвиг продлевает, но не больше 15 раз', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const g = __game; g.startMode('zen'); g.setGrid([]);
      g.setPiece('O', 4, 20, 0); g.step(1, false);
      const id = g.pieceId; g.step(27, false); const early = g.pieceId === id;
      g.step(4, false); const locked = g.pieceId !== id;
      g.setGrid([]); g.setPiece('T', 4, 20, 0); g.step(1, false);
      const id2 = g.pieceId; let steps = 0, dir = 1;
      while (g.pieceId === id2 && steps < 2000) { g.move(dir); dir = -dir; g.step(10, false); steps += 10; }
      return { early, locked, steps };
    });
    expect(r.early).toBe(true);
    expect(r.locked).toBe(true);
    expect(r.steps).toBeLessThanOrEqual(170);                // 15 продлений по 10 кадров, потом фиксация
    expect(r.steps).toBeGreaterThanOrEqual(140);
  });
});

test.describe('Блоки: управление DAS/ARR/SDF', () => {
  test('DAS и ARR берутся из настроек: задержка перед повтором и скорость повтора', async ({ page }) => {
    await open(page);
    await page.evaluate(() => localStorage.clear());
    await page.click('[data-screen=main] [data-id=settings]');
    await page.locator('input[data-setting=das]').fill('100');
    await page.locator('input[data-setting=arr]').fill('50');
    await page.click('[data-screen=settings] .kit-btn:has-text("Готово")');
    const r = await page.evaluate(() => {
      const g = __game; g.startMode('zen'); g.setGrid([]); g.setPiece('O', 4, 5, 0);
      const k = g.kit, xs = [];
      k.held.add('ArrowLeft'); k.pressed.add('left');
      for (let i = 0; i < 16; i++) { g.step(1, false); xs.push(g.current.x); }
      k.held.delete('ArrowLeft');
      return xs;
    });
    // 1-й кадр - шаг сразу; до 100 мс (6 кадров) - стоит; потом шаг раз в 50 мс (3 кадра)
    expect(r[0]).toBe(3);
    expect(r[4]).toBe(3);
    expect(r[7]).toBe(2);
    expect(r[10]).toBe(1);
    expect(r[13]).toBe(0);
  });

  test('ARR = 0: после задержки фигура сразу у стены', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const g = __game; g.kit.set('das', 100); g.kit.set('arr', 0); g.startMode('zen'); g.setGrid([]); g.setPiece('O', 4, 5, 0);
      const k = g.kit; k.held.add('ArrowRight'); k.pressed.add('right');
      g.step(1, false); const a = g.current.x; g.step(7, false); const b = g.current.x;
      k.held.delete('ArrowRight'); return [a, b];
    });
    expect(r).toEqual([5, 8]);
  });

  test('SDF: мягкое падение в SDF раз быстрее гравитации, «мгновенно» - сразу на дно без фиксации', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const g = __game; const k = g.kit;
      g.kit.set('sdf', 20); g.startMode('zen'); g.setGrid([]); g.setPiece('O', 4, 2, 0);
      const y0 = g.current.y; k.held.add('ArrowDown'); g.step(30, false); const fall20 = g.current.y - y0; k.held.delete('ArrowDown');
      g.kit.set('sdf', 41); g.setGrid([]); g.setPiece('O', 4, 2, 0); const id = g.pieceId;
      k.held.add('ArrowDown'); g.step(1, false); k.held.delete('ArrowDown');
      return { fall20, bottom: g.current.y, same: g.pieceId === id };
    });
    expect(r.fall20).toBeGreaterThanOrEqual(8);            // 1000 мс / 20 = 50 мс на клетку: ~10 клеток за 30 кадров
    expect(r.fall20).toBeLessThanOrEqual(11);
    expect(r.bottom).toBe(20);                              // O стоит на дне (ряды 20-21 из 22)
    expect(r.same).toBe(true);
  });

  test('жёсткий сброс переназначается на W; занятую поворотом X взять нельзя', async ({ page }) => {
    await open(page);
    await page.evaluate(() => localStorage.clear());
    await page.click('[data-screen=main] [data-id=settings]');
    await page.click('[data-bind="hard:0"]'); await page.keyboard.press('KeyX');
    await expect(page.locator('.kit-modal .kit-warn')).toContainText('Поворот');
    await page.keyboard.press('KeyW');
    await page.click('[data-screen=settings] .kit-btn:has-text("Готово")');
    await page.click('[data-screen=main] [data-id=play]');
    await page.click('[data-screen=modes] [data-mode=zen]');
    const id = await page.evaluate(() => __game.pieceId);
    await page.keyboard.press('KeyW');
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => __game.pieceId)).not.toBe(id);
  });

  test('геймпад: крестовина влево двигает фигуру', async ({ page }) => {
    await page.addInitScript(() => {
      window.__pad = { connected: true, id: 'fake', index: 0, mapping: 'standard', buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0] };
      navigator.getGamepads = () => [window.__pad];
    });
    await open(page);
    await page.click('[data-screen=main] [data-id=play]');
    await page.click('[data-screen=modes] [data-mode=zen]');
    await page.waitForTimeout(200);
    const x0 = await page.evaluate(() => __game.current.x);
    await page.evaluate(() => { __pad.buttons[14].pressed = true; });
    await page.waitForTimeout(60);
    await page.evaluate(() => { __pad.buttons[14].pressed = false; });
    expect(await page.evaluate(() => __game.current.x)).toBeLessThan(x0);
  });
});

test.describe('Блоки: режимы и итоги', () => {
  test('Марафон: уровень растёт каждые 10 линий, падение ускоряется; 150 линий - финал и рекорд', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const g = __game; localStorage.clear(); g.startMode('marathon');
      const g1 = g.gravityMs();
      g.state.lines = 9; g.setGrid(['XXXXXXXX..', 'XXXXXXXX..']); g.setPiece('O', 8, 10, 0); g.hardDrop();
      const lv2 = g.state.level, g2 = g.gravityMs();
      g.state.lines = 149; g.setGrid(['XXXXXXXX..', 'XXXXXXXX..']); g.setPiece('O', 8, 10, 0); g.hardDrop();
      return { lv2, faster: g2 < g1, phase: g.state.phase, rec: g.records.marathon[0] };
    });
    expect(r.lv2).toBe(2);
    expect(r.faster).toBe(true);
    expect(r.phase).toBe('done');
    await expect(page.locator('[data-screen=victory]')).toBeVisible();
    expect(r.rec.done).toBe(true);
    expect(await page.evaluate(() => !!__game.kit.unlocked.marathon)).toBe(true);
  });

  test('Спринт: 40 линий - итог со временем; лучшее время хранится после перезагрузки', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      const g = __game; localStorage.clear(); g.startMode('sprint');
      g.step(600, false); g.state.lines = 39; g.setGrid(['XXXXXXXX..', 'XXXXXXXX..']); g.setPiece('O', 8, 10, 0); g.hardDrop();
    });
    await expect(page.locator('[data-screen=finish]')).toBeVisible();
    await expect(page.locator('[data-screen=finish]')).toContainText('0:1');
    await page.reload();
    await page.waitForFunction(() => window.__game && __game.ready);
    const rec = await page.evaluate(() => __game.records.sprint[0]);
    expect(rec.lines).toBe(40);
    expect(rec.time).toBeGreaterThan(590);
  });

  test('Ультра: через 2 минуты игра кончается, очки идут в рекорды', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const g = __game; localStorage.clear(); g.startMode('ultra');
      g.setGrid(['XXXXXXXX..', 'XXXXXXXX..']); g.setPiece('O', 8, 10, 0); g.hardDrop();
      let n = 0; while (g.state.phase === 'play' && n++ < 8000) { if (g.current.y > 2) g.current.y = 2; g.step(1, false); }
      return { n, phase: g.state.phase, rec: g.records.ultra[0] };
    });
    expect(r.phase).toBe('done');
    expect(r.n).toBeGreaterThan(7000);
    expect(r.n).toBeLessThan(7300);
    expect(r.rec.score).toBeGreaterThan(0);
    await expect(page.locator('[data-screen=finish]')).toBeVisible();
  });

  test('Дзен: переполнение не проигрыш - поле очищается, игра идёт', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const g = __game; g.startMode('zen');
      g.setGrid(Array.from({ length: 21 }, (_, i) => (i % 2 ? 'XXXX.XXXXX' : 'XXXXX.XXXX')));
      for (let i = 0; i < 4; i++) g.hardDrop();
      return { phase: g.state.phase, mode: g.kit.mode, filled: g.grid.flat().filter(Boolean).length };
    });
    expect(r.phase).toBe('play');
    expect(r.mode).toBe('play');
    expect(r.filled).toBeLessThan(20);
  });

  test('Марафон: переполнение - поражение, окно итога, «Заново» начинает режим снова', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      const g = __game; g.startMode('marathon');
      g.setGrid(Array.from({ length: 21 }, (_, i) => (i % 2 ? 'XXXX.XXXXX' : 'XXXXX.XXXX')));
      for (let i = 0; i < 6 && g.state.phase === 'play'; i++) g.hardDrop();
      g.step(120, false);
    });
    await expect(page.locator('[data-screen=over]')).toBeVisible({ timeout: 5000 });
    await page.click('[data-screen=over] [data-id=again]');
    expect(await page.evaluate(() => [__game.state.mode, __game.state.phase, __game.state.lines])).toEqual(['marathon', 'play', 0]);
  });

  test('статистика: партии, линии и фигуры копятся и видны в «Достижения и рекорды»', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      const g = __game; localStorage.clear(); g.startMode('marathon');
      g.setGrid(['XXXXXXXX..', 'XXXXXXXX..']); g.setPiece('O', 8, 10, 0); g.hardDrop();
      g.kit.toMenu();
    });
    await page.reload();
    await page.waitForFunction(() => window.__game && __game.ready);
    const st = await page.evaluate(() => __game.stats);
    expect(st.games).toBe(1);
    expect(st.lines).toBe(2);
    expect(st.pieces).toBeGreaterThanOrEqual(1);
    await page.click('[data-screen=main] [data-id=achievements]');
    await expect(page.locator('[data-screen=achievements]')).toContainText('Линий всего');
  });

  test('автопилот честно проходит Марафон: 150 линий до экрана победы', async ({ page }) => {
    test.setTimeout(240000);
    await open(page, 'seed=3&fast');
    const r = await page.evaluate(() => {
      const g = __game; localStorage.clear(); g.startMode('marathon'); g.setAutopilot(true);
      let n = 0; while (g.state.phase === 'play' && n++ < 200000) g.step(1, false);
      return { phase: g.state.phase, lines: g.state.lines, level: g.state.level, n };
    });
    expect(r.phase).toBe('done');
    expect(r.lines).toBeGreaterThanOrEqual(150);
    expect(r.level).toBe(15);
    await expect(page.locator('[data-screen=victory]')).toBeVisible();
  });
});

test.describe('Блоки: пауза и окно', () => {
  test('скрытая вкладка ставит паузу, падение стоит, снимает паузу только игрок', async ({ page }) => {
    await open(page, 'seed=1');
    await page.click('[data-screen=main] [data-id=play]');
    await page.click('[data-screen=modes] [data-mode=marathon]');
    await hideTab(page); await showTab(page);
    const y = await page.evaluate(() => __game.current.y);
    await page.waitForTimeout(1200);
    expect(await page.evaluate(() => [__game.kit.mode, __game.current.y])).toEqual(['paused', y]);
    await page.click('[data-screen=pause] [data-id=resume]');
    expect(await page.evaluate(() => __game.kit.mode)).toBe('play');
  });

  for (const size of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
    test(`пауза ${size.width}x${size.height}: надпись уровня не наезжает на окно`, async ({ page }) => {
      await page.setViewportSize(size);
      await open(page, 'seed=1');
      await page.click('[data-screen=main] [data-id=play]');
      await page.click('[data-screen=modes] [data-mode=marathon]');
      await page.waitForTimeout(150);
      const r = await pauseLayout(page);
      expect(r.during).not.toBe(null);
      expect(r.overlap).toBe(false);
    });
  }

  for (const size of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }, { width: 1024, height: 700 }]) {
    test(`поле влезает в окно ${size.width}x${size.height}, холст чёткий`, async ({ page }) => {
      await page.setViewportSize(size);
      await open(page);
      expectFits(expect, await fitReport(page, '#game'));
      expectFits(expect, await fitReport(page, '[data-screen=main] .kit-panel'));
      const c = await page.evaluate(() => { const c = document.getElementById('game'), r = c.getBoundingClientRect(); return c.width / r.width / devicePixelRatio; });
      expect(Math.abs(c - 1)).toBeLessThan(0.02);
    });
  }
});
