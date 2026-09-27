// Законы «Огненных джунглей» после доработки для «Игротеки»: пять миссий с боссами проходятся
// (бот-«рука» доходит до босса и побеждает его), ямы уже прыжка, контрольные точки, экран
// победы, прогресс после перезагрузки, жизни по сложности, яма, снайпер и мина, огонь ЛКМ
// (клик, очередь, общий темп с клавишей, мимо поля не стреляет), пауза при скрытии вкладки.
const { test, expect } = require('@playwright/test');
const { openGame, fitReport, expectFits, SIZES } = require('./_games-helpers');
const { hideTab, showTab, blurWindow, focusWindow, pauseLayout } = require('./_kit-helpers');

// Прогон миссии автопилотом - честно, без неуязвимости: он уклоняется от пуль, гранат, мин, камней
// и босса, предсказывая их полёт по законам игры. Считаем и потерянные жизни.
const RUN = `(maxSteps) => {
  const g = __game; g.setAutopilot(true); let n = 0;
  while (g.G.phase === 'run' || g.G.phase === 'clear') { g.step(1, false); if (++n > maxSteps) break; }
  g.setAutopilot(false);
  return { phase: g.G.phase, steps: n, x: Math.round(g.player.x), boss: !!g.boss, deaths: g.G.stats.deaths };
}`;

test.describe('jungle-strike: кампания', () => {
  test('меню поверх заставки, без ошибок; в миссии правит игрок, а не автопилот', async ({ page }) => {
    const errors = await openGame(page, 'jungle-strike', 'seed=1&fast');
    await expect(page.locator('[data-screen=main]')).toBeVisible();
    for (const t of ['Кампания', 'Выбор миссии', 'Настройки', 'Достижения и рекорды', 'Как играть', 'Об игре']) await expect(page.locator(`[data-screen=main] .kit-btn:has-text("${t}")`)).toBeVisible();
    expect(await page.evaluate(() => __game.autopilot)).toBe(true);
    await page.click('[data-screen=main] .kit-btn:has-text("Кампания")');
    expect(await page.evaluate(() => ({ a: __game.autopilot, m: __game.G.mode, k: __game.kit.mode }))).toEqual({ a: false, m: 'mission', k: 'play' });
    await expect(page.locator('#c')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('каждая из 5 миссий проходится честно (без неуязвимости, обычная сложность), босс повержен, открывается следующая', async ({ page }) => {
    test.setTimeout(240_000);
    await openGame(page, 'jungle-strike', 'seed=2&fast');
    await page.evaluate(() => localStorage.clear());
    for (let m = 0; m < 5; m++) {
      await page.evaluate((i) => __game.startMission(i, false), m);
      const r = await page.evaluate(`(${RUN})(40000)`);
      expect(r.phase, 'миссия ' + (m + 1)).toBe('done');
      expect(r.deaths, 'миссия ' + (m + 1) + ': потеряно жизней').toBeLessThanOrEqual(1);
      const id = m === 4 ? 'victory' : 'missionClear';
      await expect(page.locator(`[data-screen=${id}]`)).toBeVisible();
      expect(await page.evaluate(() => __game.progress.unlocked)).toBe(Math.min(m + 1, 4));
      expect(await page.evaluate((i) => !!__game.kit.unlocked['boss' + (i + 1)], m)).toBe(true);
    }
    await expect(page.locator('[data-screen=victory]')).toContainText('Точность');
    expect(await page.evaluate(() => __game.progress.done)).toBe(true);
  });

  test('уровни проходимы по построению: ямы уже прыжка, платформы не выше прыжка, точки не в ямах', async ({ page }) => {
    await openGame(page, 'jungle-strike', 'seed=1');
    const r = await page.evaluate(() => {
      const g = __game, out = [];
      for (let i = 0; i < g.MISSIONS.length; i++) {
        const L = g.buildLevel(i);
        out.push({ maxPit: Math.max(...L.pits.map((p) => p.w)), minPlat: Math.min(...L.plats.map((p) => p.y)), cpInPit: L.checkpoints.some((c) => L.pits.some((p) => c > p.x - 10 && c < p.x + p.w + 10)), bossArenaPits: L.pits.some((p) => p.x + p.w > L.arena), pits: L.pits.length });
      }
      return { out, jumpDist: g.JUMP_DIST, jumpH: g.JUMP_H, ground: g.GROUND };
    });
    for (const l of r.out) {
      expect(l.pits).toBeGreaterThanOrEqual(2);
      expect(l.maxPit).toBeLessThan(r.jumpDist - 8);
      expect(r.ground - l.minPlat).toBeLessThan(r.jumpH - 5);
      expect(l.cpInPit).toBe(false);
      expect(l.bossArenaPits).toBe(false);
    }
  });

  test('каждый кадр рисуется целиком: в пещере не просвечивает прошлый кадр джунглей', async ({ page }) => {
    await openGame(page, 'jungle-strike', 'seed=1');
    const px = await page.evaluate(() => {
      const g = __game; g.kit.closeAll(); g.startMission(0, false); g.step(1); g.startMission(2, false); g.step(1);
      const c = document.getElementById('c').getContext('2d', { willReadFrequently: true }), k = c.canvas.width / 400;
      return Array.from(c.getImageData(5 * k, 147 * k, 1, 1).data).slice(0, 3);
    });
    expect(px).not.toEqual([26, 74, 42]);          // #1a4a2a - кусты джунглей
    expect(px[1]).toBeLessThan(40);                 // в пещере фон тёмный
  });

  test('пройденная миссия переживает перезагрузку: «Продолжить · миссия 2»', async ({ page }) => {
    await openGame(page, 'jungle-strike', 'seed=3&fast');
    await page.evaluate(() => { localStorage.clear(); __game.startMission(0, false); });
    expect((await page.evaluate(`(${RUN})(40000)`)).phase).toBe('done');
    await page.reload();
    await page.waitForFunction(() => window.__game && __game.ready);
    await page.click('[data-screen=main] [data-id=continue]');
    expect(await page.evaluate(() => [__game.G.mission, __game.kit.mode])).toEqual([1, 'play']);
    await page.keyboard.press('Escape');
    await page.click('[data-screen=pause] .kit-btn:has-text("В меню")');
    await page.click('[data-screen=main] .kit-btn:has-text("Выбор миссии")');
    await expect(page.locator('[data-mission="1"]')).toBeEnabled();
    await expect(page.locator('[data-mission="2"]')).toBeDisabled();
  });

  test('контрольная точка: после провала миссия продолжается с флажка с полными жизнями', async ({ page }) => {
    await openGame(page, 'jungle-strike', 'seed=1&fast');
    await page.evaluate(() => {
      const g = __game; g.startMission(1, false);
      const cp = g.G.level.checkpoints[0];
      g.player.x = cp + 2; g.G.cam = cp - 100; g.step(1, false);
      for (let i = 0; i < 5 && g.G.phase === 'run'; i++) { g.player.invuln = 0; g.hurtPlayer(); }
    });
    await expect(page.locator('[data-screen=over]')).toBeVisible();
    await page.click('[data-screen=over] [data-id=again]');
    const r = await page.evaluate(() => ({ x: __game.player.x, cp: __game.G.level.checkpoints[0], lives: __game.G.lives, m: __game.G.mission }));
    expect(r.x).toBe(r.cp);
    expect(r.lives).toBe(3);
    expect(r.m).toBe(1);
  });

  test('жизни по сложности 5/3/2; ровно столько ударов до конца', async ({ page }) => {
    await openGame(page, 'jungle-strike', 'seed=1&fast');
    const r = await page.evaluate(() => {
      const g = __game, out = {};
      for (const d of ['easy', 'normal', 'hard']) {
        g.kit.set('difficulty', d); g.startMission(0, false);
        const lives = g.G.lives; let hits = 0;
        while (g.G.phase === 'run' && hits < 10) { g.player.invuln = 0; g.hurtPlayer(); hits++; }
        out[d] = [lives, hits];
      }
      g.kit.set('difficulty', 'normal');
      return out;
    });
    expect(r).toEqual({ easy: [5, 5], normal: [3, 3], hard: [2, 2] });
  });

  test('падение в яму отнимает жизнь и ставит на берег перед ней', async ({ page }) => {
    await openGame(page, 'jungle-strike', 'seed=1&fast');
    const r = await page.evaluate(() => {
      const g = __game; g.startMission(0, false);
      const pit = g.G.level.pits[0];
      g.G.cam = pit.x - 150; g.player.x = pit.x + pit.w / 2; g.player.y = g.GROUND + 3; g.player.invuln = 50;
      for (let i = 0; i < 90 && g.G.lives === 3; i++) g.step(1, false);
      return { lives: g.G.lives, x: g.player.x, pit, inPit: !!g.pitAt(g.player.x), y: g.player.y };
    });
    expect(r.lives).toBe(2);
    expect(r.inPit).toBe(false);
    expect(r.x).toBeLessThan(r.pit.x);
    expect(r.y).toBe(186);
  });

  test('снайпер сначала целится лучом, мина взрывается не сразу', async ({ page }) => {
    await openGame(page, 'jungle-strike', 'seed=1&fast');
    const r = await page.evaluate(() => {
      const g = __game; g.startMission(2, false); g.enemies.length = 0; g.player.invuln = 1e9;
      const s = g.spawnEnemy('sniper', g.player.x + 120, g.GROUND); s.cd = 1;
      g.step(1, false); const aiming = s.aim > 0, b0 = g.ebullets.length;
      g.step(30, false); const b1 = g.ebullets.length;
      g.step(25, false); const b2 = g.ebullets.length;
      g.enemies.length = 0;
      const m = g.spawnEnemy('mine', g.player.x + 6, g.GROUND);
      g.step(5, false); const armedAlive = g.enemies.includes(m) && !!m.armed;
      g.step(30, false);
      return { aiming, b0, b1, b2, armedAlive, gone: !g.enemies.includes(m) };
    });
    expect(r.aiming).toBe(true);
    expect(r.b0 + r.b1).toBe(0);
    expect(r.b2).toBe(1);
    expect(r.armedAlive).toBe(true);
    expect(r.gone).toBe(true);
  });
});

test.describe('jungle-strike: огонь левой кнопкой мыши', () => {
  const center = async (page) => { const b = await page.locator('#c').boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  const quiet = (page) => page.evaluate(() => { const g = __game; g.kit.closeAll(); g.startMission(0, false); g.enemies.length = 0; g.player.invuln = 1e9; });

  test('подсказки упоминают ЛКМ', async ({ page }) => {
    await openGame(page, 'jungle-strike', 'seed=1');
    await page.click('[data-screen=main] .kit-btn:has-text("Как играть")');
    await expect(page.locator('[data-screen=howto]')).toContainText('левая кнопка мыши');
  });

  test('клик по полю - ровно один выстрел', async ({ page }) => {
    await openGame(page, 'jungle-strike', 'seed=1');
    await quiet(page);
    const c = await center(page);
    const a = await page.evaluate(() => __game.shotsFired);
    await page.mouse.click(c.x, c.y);
    const r = await page.evaluate(() => { __game.step(20, false); return { n: __game.shotsFired, held: __game.mouseFire }; });
    expect(r.n - a).toBe(1);
    expect(r.held).toBe(false);
  });

  test('зажатая ЛКМ - очередь в темпе оружия, отпустил - тишина', async ({ page }) => {
    await openGame(page, 'jungle-strike', 'seed=1');
    await quiet(page);
    const c = await center(page);
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    const normal = await page.evaluate(() => { const g = __game; const a = g.shotsFired; g.step(64, false); return g.shotsFired - a; });
    const rapid = await page.evaluate(() => { const g = __game; g.player.weapon = 'rapid'; g.step(8, false); const a = g.shotsFired; g.step(64, false); return g.shotsFired - a; });
    await page.mouse.up();
    const after = await page.evaluate(() => { const g = __game; g.step(2, false); const a = g.shotsFired; g.step(64, false); return g.shotsFired - a; });
    expect([normal, rapid, after]).toEqual([8, 16, 0]);
  });

  test('клавиша J и ЛКМ вместе не стреляют чаще', async ({ page }) => {
    await openGame(page, 'jungle-strike', 'seed=1');
    await quiet(page);
    const c = await center(page);
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    const both = await page.evaluate(() => {
      const g = __game, k = g.kit; let n = 0;
      for (let i = 0; i < 64; i++) { const a = g.shotsFired; if (i % 3 === 0) { k.held.add('KeyJ'); k.pressed.add('fire'); } g.step(1, false); n += g.shotsFired - a; }
      k.held.delete('KeyJ');
      return n;
    });
    await page.mouse.up();
    expect(both).toBe(8);
  });

  test('клик в меню, на паузе и правой кнопкой не стреляет; меню правой кнопки над полем нет', async ({ page }) => {
    await openGame(page, 'jungle-strike', 'seed=1');
    const c = await center(page);
    await page.mouse.click(c.x - 300, c.y + 200);                // главное меню закрывает поле
    await page.click('[data-screen=main] .kit-btn:has-text("Кампания")');
    const s0 = await page.evaluate(() => { __game.enemies.length = 0; __game.player.invuln = 1e9; const a = __game.shotsFired; __game.step(20, false); return __game.shotsFired - a; });
    expect(s0).toBe(0);                                          // клик по меню не оставил выстрела «про запас»
    const a1 = await page.evaluate(() => __game.shotsFired);
    await page.keyboard.press('Escape');
    await page.mouse.click(c.x - 300, c.y + 200);
    await page.keyboard.press('Escape');
    await page.mouse.click(c.x, c.y, { button: 'right' });
    expect(await page.evaluate(() => { __game.step(20, false); return __game.shotsFired; })).toBe(a1);
    const prevented = await page.evaluate(() => { const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }); document.getElementById('c').dispatchEvent(e); return e.defaultPrevented; });
    expect(prevented).toBe(true);
  });
});

test.describe('jungle-strike: пауза и окно', () => {
  for (const size of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
    test(`пауза ${size.width}x${size.height}: надпись игры не наезжает на окно «Пауза»`, async ({ page }) => {
      await page.setViewportSize(size);
      await openGame(page, 'jungle-strike', 'seed=1');
      await page.click('[data-screen=main] .kit-btn:has-text("Кампания")');
      await page.waitForTimeout(150);
      const r = await pauseLayout(page);
      expect(r.during, 'в игре надпись видна').not.toBe(null);
      expect(r.overlap).toBe(false);
    });
  }

  test('потеря фокуса окна ставит паузу, возврат фокуса паузу не снимает - только игрок', async ({ page }) => {
    await openGame(page, 'jungle-strike', 'seed=1');
    await page.click('[data-screen=main] .kit-btn:has-text("Кампания")');
    await blurWindow(page);
    await focusWindow(page);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => __game.kit.mode)).toBe('paused');
    await expect(page.locator('[data-screen=pause]')).toBeVisible();
    await page.click('[data-screen=pause] [data-id=resume]');
    expect(await page.evaluate(() => __game.kit.mode)).toBe('play');
  });

  test('скрытие вкладки - пауза, после возврата пауза остаётся', async ({ page }) => {
    await openGame(page, 'jungle-strike', 'seed=1');
    await page.click('[data-screen=main] .kit-btn:has-text("Кампания")');
    await page.evaluate(() => __game.kit.audioCtx());
    await hideTab(page);
    await showTab(page);
    const s = await page.evaluate(() => __game.G.stats.steps);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => [__game.kit.mode, __game.G.stats.steps])).toEqual(['paused', s]);
    await expect(page.locator('[data-screen=pause]')).toBeVisible();
  });

  test('прыжок переназначается на W', async ({ page }) => {
    await openGame(page, 'jungle-strike', 'seed=1');
    await page.evaluate(() => localStorage.clear());
    await page.click('[data-screen=main] .kit-btn:has-text("Настройки")');
    await page.click('[data-bind="up:0"]'); await page.keyboard.press('KeyI');
    await page.click('[data-bind="jump:0"]'); await page.keyboard.press('KeyW');
    await page.click('[data-screen=settings] .kit-btn:has-text("Готово")');
    await page.click('[data-screen=main] .kit-btn:has-text("Кампания")');
    await page.evaluate(() => { __game.enemies.length = 0; __game.player.invuln = 1e9; });
    await page.keyboard.down('KeyW');
    const y = await page.evaluate(() => { __game.step(6, false); return __game.player.y; });
    await page.keyboard.up('KeyW');
    expect(y).toBeLessThan(186 - 10);
  });

  for (const size of [...SIZES, { width: 1920, height: 1080 }]) {
    test(`поле и меню влезают в окно ${size.width}x${size.height}, пиксели целые`, async ({ page }) => {
      await page.setViewportSize(size);
      await openGame(page, 'jungle-strike');
      expectFits(expect, await fitReport(page, '#c'));
      expectFits(expect, await fitReport(page, '[data-screen=main] .kit-panel'));
      const c = await page.evaluate(() => ({ w: document.getElementById('c').width, h: document.getElementById('c').height }));
      expect(c.w % 400).toBe(0);
      expect(c.h).toBe(c.w / 400 * 225);
    });
  }
});

test.describe('jungle-strike: по ревью', () => {
  for (const [name, dx, dy] of [['слева-сверху', -80, -60], ['справа-снизу', 90, 10], ['прямо над', 2, -90]]) {
    test(`ЛКМ стреляет в курсор (${name}), герой поворачивается к нему`, async ({ page }) => {
      await openGame(page, 'jungle-strike', 'seed=1');
      await page.click('[data-screen=main] [data-id=campaign]');
      await page.evaluate(() => { const g = __game; g.enemies.length = 0; g.player.invuln = 1e9; g.player.x = g.G.cam + 200; g.player.dir = 1; g.step(1); });
      const box = await page.locator('#c').boundingBox();
      const hero = await page.evaluate(() => ({ x: __game.player.x - __game.G.cam, y: __game.player.y - 12 }));
      const k = box.width / 400;
      await page.evaluate(() => { __game.bullets.length = 0; __game.player.cd = 0; });
      await page.mouse.click(box.x + (hero.x + dx) * k, box.y + (hero.y + dy) * k);
      const b = await page.evaluate(() => { __game.step(1, false); const b = __game.bullets[0]; return b && { vx: b.vx, vy: b.vy, dir: __game.player.dir }; });
      expect(b).toBeTruthy();
      const want = Math.atan2(dy, dx), got = Math.atan2(b.vy, b.vx);
      expect(Math.abs(Math.atan2(Math.sin(want - got), Math.cos(want - got)))).toBeLessThan(0.2);
      if (Math.abs(dx) > 10) expect(b.dir).toBe(Math.sign(dx));
    });
  }

  test('мину можно подстрелить лёжа; сама взорвавшаяся мина очков не даёт', async ({ page }) => {
    await openGame(page, 'jungle-strike', 'seed=1');
    await page.click('[data-screen=main] [data-id=campaign]');
    const r = await page.evaluate(() => {
      const g = __game; g.enemies.length = 0; g.player.invuln = 1e9; g.player.dir = 1;
      const m = g.spawnEnemy('mine', g.player.x + 60, g.GROUND);
      g.kit.held.add('KeyS'); g.kit.held.add('KeyJ');
      for (let i = 0; i < 60 && g.enemies.includes(m); i++) g.step(1, false);
      g.kit.held.delete('KeyS'); g.kit.held.delete('KeyJ');
      const shot = !g.enemies.includes(m);
      g.enemies.length = 0; g.bullets.length = 0; g.pickups.length = 0; g.step(1, false);
      const k0 = g.G.stats.kills, s0 = g.G.score;
      g.spawnEnemy('mine', g.player.x + 4, g.GROUND);
      g.step(60, false);
      return { shot, kills: g.G.stats.kills - k0, score: g.G.score - s0 };
    });
    expect(r).toEqual({ shot: true, kills: 0, score: 0 });
  });

  for (const vp of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }, { width: 1024, height: 700 }, { width: 1366, height: 768 }]) {
    test(`пиксели игры одного размера: целое кратное на экране ${vp.width}x${vp.height}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await openGame(page, 'jungle-strike', 'seed=1');
      const r = await page.evaluate(() => { const b = document.getElementById('c').getBoundingClientRect(); return { kx: b.width * devicePixelRatio / 400, ky: b.height * devicePixelRatio / 225, fits: b.right <= innerWidth && b.bottom <= innerHeight }; });
      expect(Math.abs(r.kx - Math.round(r.kx))).toBeLessThan(0.01);
      expect(Math.abs(r.ky - r.kx)).toBeLessThan(0.01);
      expect(r.kx).toBeGreaterThanOrEqual(2);
      expect(r.fits).toBe(true);
    });
  }

  test('зажатая мышь, отпущенная при скрытой вкладке, после продолжения не стреляет', async ({ page }) => {
    await openGame(page, 'jungle-strike', 'seed=1');
    await page.click('[data-screen=main] [data-id=campaign]');
    const box = await page.locator('#c').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await hideTab(page); await showTab(page);
    await page.click('[data-screen=pause] [data-id=resume]');
    const r = await page.evaluate(() => { const a = __game.shotsFired; __game.step(60, false); return { shots: __game.shotsFired - a, mouse: __game.mouseFire }; });
    await page.mouse.up();
    expect(r).toEqual({ shots: 0, mouse: false });
  });

  test('«Трудная кампания» - только если все миссии пройдены на трудной', async ({ page }) => {
    await openGame(page, 'jungle-strike', 'seed=1&fast');
    const r = await page.evaluate(() => {
      localStorage.clear(); const g = __game; g.kit.unlocked = {};
      g.progress.unlocked = 4; g.progress.best = { 0: { score: 1, time: 1 }, 1: { score: 1, time: 1 }, 2: { score: 1, time: 1 }, 3: { score: 1, time: 1 } };
      g.kit.set('difficulty', 'hard'); g.startMission(4, false); g.player.invuln = 1e9;
      g.spawnBoss(); g.boss.hp = 0;
      for (let i = 0; i < 600 && g.G.phase !== 'done'; i++) g.step(1, false);
      return { phase: g.G.phase, campaign: !!g.kit.unlocked.campaign, hard: !!g.kit.unlocked.campaignHard };
    });
    expect(r).toEqual({ phase: 'done', campaign: true, hard: false });
  });
});

test.describe('jungle-strike: пиксельный шрифт', () => {
  test('меню и надписи игры - пиксельным шрифтом, в нём есть все буквы из текстов игры', async ({ page }) => {
    const errors = await openGame(page, 'jungle-strike', 'seed=1&fast');
    const r = await page.evaluate(async () => {
      await PixelFont.ready;
      const k = __game.kit, texts = [];
      const grab = () => texts.push(document.querySelector('#app .kit-layer').innerText);
      grab();
      for (const id of ['settings', 'achievements', 'howto', 'credits', 'missions']) { k.closeAll(); k.showMain(); document.querySelector(`[data-screen=main] [data-id=${id}]`).click(); grab(); }
      k.closeAll(); __game.startMission(0, false); k.pause(); grab();
      for (const m of __game.MISSIONS) texts.push(m.name, m.intro);
      const font = getComputedStyle(document.querySelector('[data-screen=pause] .kit-btn')).fontFamily;
      const c = document.createElement('canvas').getContext('2d');
      c.font = '16px JunglePixel'; const w = c.measureText('ИГРА').width;
      const missing = new Set();
      for (const t of texts) for (const ch of t) if (!/\s/.test(ch) && !PixelFont.chars.has(ch) && !'🏆🔒↺'.includes(ch)) missing.add(ch);
      return { status: PixelFont.face.status, font, w, missing: [...missing].join('') };
    });
    expect(r.status).toBe('loaded');
    expect(r.font).toMatch(/^"?JunglePixel/);
    expect(r.w).toBe(48);                  // 4 буквы по 5 точек + промежуток, точка = 2 px при 16 px
    expect(r.missing).toBe('');
    expect(errors).toEqual([]);
  });
});
