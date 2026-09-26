// Законы «Огненных джунглей»: пуля убивает врага и даёт очки, вражеская пуля отнимает жизнь
// один раз, жизней ровно три, яма отнимает жизнь и возвращает на берег, враги не появляются
// в воде, босс - победа и рекорд, пауза, размер под окно и чёткий текст.
const { test, expect } = require('@playwright/test');
const { openGame, fitReport, expectFits, SIZES } = require('./_games-helpers');

test.describe('jungle-strike (Огненные джунгли)', () => {
  test('экран старта, Enter начинает, мир до старта стоит', async ({ page }) => {
    const errors = await openGame(page, 'jungle-strike', 'seed=1');
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => ({ p: __game.phase, n: __game.enemies.length }))).toEqual({ p: 'ready', n: 0 });
    await page.keyboard.press('Enter');
    expect(await page.evaluate(() => __game.phase)).toBe('play');
    expect(errors).toEqual([]);
  });

  test('пуля убивает солдата и даёт 100 очков', async ({ page }) => {
    await openGame(page, 'jungle-strike', 'seed=1');
    const r = await page.evaluate(() => {
      const g = __game; g.start(); g.player.invuln = 0;
      g.enemies.push({ type: 'soldier', x: g.player.x + 60, y: g.GROUND_Y, vx: 0, w: 12, h: 22, hp: 1, dir: -1, shootTimer: 999, walkFrame: 0, walkTimer: 0, alive: true, onGround: true, vy: 0 });
      g.keys.KeyJ = true; g.step(2); g.keys.KeyJ = false;
      g.step(30);
      return { left: g.enemies.filter((e) => e.type === 'soldier').length, score: g.score };
    });
    expect(r.left).toBe(0);
    expect(r.score).toBe(100);
  });

  test('вражеская пуля отнимает одну жизнь, мигание защищает от второй', async ({ page }) => {
    await openGame(page, 'jungle-strike', 'seed=1');
    const r = await page.evaluate(() => {
      const g = __game; g.start(); g.player.invuln = 0;
      for (let i = 0; i < 3; i++) g.enemyBullets.push({ x: g.player.x + 1, y: g.player.y - 10 - i, vx: 0, vy: 0, life: 50 });
      g.step(1); const a = g.lives;
      g.step(10); return { a, b: g.lives };
    });
    expect(r).toEqual({ a: 2, b: 2 });
  });

  test('жизней ровно три: третий удар - конец игры', async ({ page }) => {
    await openGame(page, 'jungle-strike', 'seed=1');
    const r = await page.evaluate(() => {
      const g = __game; g.start();
      const out = [];
      for (let i = 0; i < 3; i++) { g.player.invuln = 0; g.hitPlayer(); out.push(g.phase); }
      return { out, lives: g.lives };
    });
    expect(r.out).toEqual(['play', 'play', 'over']);
    expect(r.lives).toBe(0);
    await page.keyboard.press('Enter');
    expect(await page.evaluate(() => ({ p: __game.phase, l: __game.lives }))).toEqual({ p: 'play', l: 3 });
  });

  test('яма: жизнь теряется даже во время мигания, герой встаёт на берег, а не над водой', async ({ page }) => {
    await openGame(page, 'jungle-strike', 'seed=1');
    const r = await page.evaluate(() => {
      const g = __game; g.start(); g.enemies.length = 0;
      const pit = g.pits[0];
      g.player.x = pit.x + pit.w / 2; g.player.y = g.GROUND_Y + 2; g.player.invuln = 50;
      g.cameraX = Math.max(0, pit.x - 120);
      for (let i = 0; i < 80 && g.lives === 3; i++) g.step();
      return { lives: g.lives, x: g.player.x, inPit: !!g.pitAt(g.player.x), y: g.player.y, ground: g.GROUND_Y };
    });
    expect(r.lives).toBe(2);
    expect(r.inPit).toBe(false);
    expect(r.y).toBe(r.ground);
  });

  test('пешие враги и турели не появляются в воде', async ({ page }) => {
    await openGame(page, 'jungle-strike', 'seed=3');
    const bad = await page.evaluate(() => {
      const g = __game; g.start();
      let bad = 0;
      for (const pit of g.pits) {
        g.cameraX = pit.x - g.W - 10;       // точка появления справа попадает в яму
        for (let i = 0; i < 40; i++) {
          g.enemies.length = 0; g.spawnEnemy();
          const e = g.enemies[0];
          if (e && e.type !== 'drone' && g.pitAt(e.x)) bad++;
        }
      }
      return bad;
    });
    expect(bad).toBe(0);
  });

  test('сбитый босс - победа, рекорд переживает перезагрузку', async ({ page }) => {
    await openGame(page, 'jungle-strike', 'seed=1');
    await page.evaluate(() => localStorage.removeItem('jungle_best'));
    const r = await page.evaluate(() => {
      const g = __game; g.start(); g.enemies.length = 0;
      g.cameraX = g.LEVEL_W - g.W; g.player.x = g.cameraX + 40;
      g.step(1);                            // камера дошла до конца - босс появляется сам
      const b = g.boss; b.hp = 1;
      g.bullets.push({ x: b.x, y: b.y - 20, vx: 0, vy: 0, life: 10, type: 'normal' });
      g.step(2);
      return { phase: g.phase, score: g.score, best: g.best };
    });
    expect(r.phase).toBe('won');
    expect(r.score).toBe(5000);
    expect(r.best).toBe(5000);
    await page.reload();
    await page.waitForFunction(() => window.__game && __game.ready);
    expect(await page.evaluate(() => __game.best)).toBe(5000);
  });

  test('бонус «веер» даёт три пули за выстрел', async ({ page }) => {
    await openGame(page, 'jungle-strike', 'seed=1');
    const n = await page.evaluate(() => {
      const g = __game; g.start(); g.enemies.length = 0;
      g.powerups.push({ x: g.player.x, y: g.player.y, vy: 0, kind: 'spread', life: 600, onGround: true });
      g.step(1);
      g.bullets.length = 0; g.keys.KeyJ = true; g.step(1); g.keys.KeyJ = false;
      return { weapon: g.player.weapon, bullets: g.bullets.length };
    });
    expect(n).toEqual({ weapon: 'spread', bullets: 3 });
  });

  test('пауза останавливает мир', async ({ page }) => {
    await openGame(page, 'jungle-strike', 'seed=1');
    await page.keyboard.press('Enter');
    await page.keyboard.press('KeyP');
    const r = await page.evaluate(() => { const g = __game; const x = g.player.x; g.keys.KeyD = true; g.step(60); g.keys.KeyD = false; return { x, x2: g.player.x, p: g.phase }; });
    expect(r.p).toBe('paused');
    expect(r.x2).toBe(r.x);
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => __game.phase)).toBe('play');
  });

  for (const size of SIZES) {
    test(`влезает в окно ${size.width}x${size.height}, текст рисуется в кратном разрешении`, async ({ page }) => {
      await page.setViewportSize(size);
      await openGame(page, 'jungle-strike');
      expectFits(expect, await fitReport(page, '#c'));
      const c = await page.evaluate(() => ({ w: document.getElementById('c').width, h: document.getElementById('c').height }));
      expect(c.w % 256).toBe(0);
      expect(c.w).toBeGreaterThanOrEqual(512);
      expect(c.h).toBe(c.w / 256 * 240);
    });
  }
});

test.describe('jungle-strike: огонь левой кнопкой мыши', () => {
  // Центр игрового холста в координатах страницы
  const center = async (page) => { const b = await page.locator('#c').boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  const startQuiet = (page) => page.evaluate(() => { const g = __game; g.start(); g.enemies.length = 0; g.player.invuln = 1e9; });

  test('подсказки на стартовом экране упоминают ЛКМ', async ({ page }) => {
    await openGame(page, 'jungle-strike', 'seed=1');
    await expect(page.locator('#info')).toContainText('ЛКМ');
    expect(await page.evaluate(() => __game.phase)).toBe('ready');
  });

  test('клик по полю - ровно один выстрел, туда же, куда стреляет клавиша', async ({ page }) => {
    await openGame(page, 'jungle-strike', 'seed=1');
    await startQuiet(page);
    const c = await center(page);
    const a = await page.evaluate(() => __game.shotsFired);
    await page.mouse.click(c.x, c.y);
    const r = await page.evaluate(() => { const g = __game; g.bullets.length = 0; const before = g.shotsFired; g.step(20); return { fired: g.shotsFired, before, held: g.mouseFire }; });
    expect(r.fired - a).toBe(1);
    expect(r.held).toBe(false);
    // направление - как у клавиши: герой смотрит вправо - пуля летит вправо
    const dir = await page.evaluate(() => { const g = __game; g.step(10); g.bullets.length = 0; g.press('KeyJ'); g.step(1); g.keys.KeyJ = false; const kb = g.bullets[0].vx; g.step(10); return kb; });
    await page.mouse.click(c.x, c.y);
    const mb = await page.evaluate(() => { const b = __game.bullets[__game.bullets.length - 1]; return b ? b.vx : null; });
    expect(dir).toBeGreaterThan(0);
    expect(mb).toBe(dir);
  });

  test('зажатая ЛКМ - очередь в темпе оружия; отпустил - огонь прекращается', async ({ page }) => {
    await openGame(page, 'jungle-strike', 'seed=1');
    await startQuiet(page);
    const c = await center(page);
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    const normal = await page.evaluate(() => { const g = __game; const a = g.shotsFired; g.step(64); return g.shotsFired - a; });
    const rapid = await page.evaluate(() => { const g = __game; g.player.weapon = 'rapid'; g.player.weaponTimer = 1e6; g.step(8); const a = g.shotsFired; g.step(64); return g.shotsFired - a; });
    await page.mouse.up();
    const after = await page.evaluate(() => { const g = __game; g.step(2); const a = g.shotsFired; g.step(64); return g.shotsFired - a; });
    expect(normal).toBe(8);        // обычное оружие: выстрел раз в 8 шагов (7.5 в секунду)
    expect(rapid).toBe(16);        // «быстрый огонь»: раз в 4 шага
    expect(after).toBe(0);
  });

  test('клавиша J и ЛКМ вместе не стреляют чаще, чем одна из них', async ({ page }) => {
    await openGame(page, 'jungle-strike', 'seed=1');
    await startQuiet(page);
    const c = await center(page);
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    const both = await page.evaluate(() => {
      const g = __game; let n = 0;
      for (let i = 0; i < 64; i++) { const a = g.shotsFired; if (i % 3 === 0) g.press('KeyJ'); g.step(1); n += g.shotsFired - a; }
      g.keys.KeyJ = false;
      return n;
    });
    await page.mouse.up();
    expect(both).toBe(8);
  });

  test('клики мимо игры (подсказки, заголовок), правая кнопка и клик до старта не стреляют', async ({ page }) => {
    await openGame(page, 'jungle-strike', 'seed=1');
    const c = await center(page);
    await page.mouse.click(c.x, c.y);                          // до старта: экран «в бой»
    await page.keyboard.press('Enter');
    const startShots = await page.evaluate(() => { const g = __game; g.enemies.length = 0; g.player.invuln = 1e9; g.step(20); return g.shotsFired; });
    expect(startShots).toBe(0);                                // и отложенного выстрела после старта нет
    await page.click('#info');
    await page.click('h1');
    await page.mouse.click(c.x, c.y, { button: 'right' });
    expect(await page.evaluate(() => { __game.step(20); return __game.shotsFired; })).toBe(0);
    // клик на паузе не копит выстрел на потом
    await page.keyboard.press('KeyP');
    await page.mouse.click(c.x, c.y);
    await page.keyboard.press('KeyP');
    expect(await page.evaluate(() => { __game.step(20); return __game.shotsFired; })).toBe(0);
    const prevented = await page.evaluate(() => {
      const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
      document.getElementById('c').dispatchEvent(e);
      return e.defaultPrevented;
    });
    expect(prevented).toBe(true);
  });
});
