// Законы «Прыг-скока»: земля держит, стены не пускают, прыжок на жука убивает жука,
// касание сбоку и яма отнимают жизнь, подарочный блок даёт монету один раз, флаг ведёт
// на следующий уровень, конец игры и рестарт, пауза, рекорд, размер под окно.
const { test, expect } = require('@playwright/test');
const { openGame, fitReport, expectFits, SIZES } = require('./_games-helpers');

const start = `(() => { __game.newGame(); __game.clearEnemies(); })()`;

test.describe('mario (Прыг-скок)', () => {
  test('без сети и без чужих шрифтов, старт по Enter', async ({ page }) => {
    const requests = [];
    page.on('request', (r) => requests.push(r.url()));
    const errors = await openGame(page, 'mario');
    expect(requests.filter((u) => /^https?:/.test(u))).toEqual([]);
    expect(await page.evaluate(() => __game.state.phase)).toBe('ready');
    await page.keyboard.press('Enter');
    expect(await page.evaluate(() => __game.state.phase)).toBe('play');
    await expect(page).toHaveTitle(/не связана с правообладателем/);
    expect(errors).toEqual([]);
  });

  test('земля держит героя, стена-колонна не пускает', async ({ page }) => {
    await openGame(page, 'mario');
    const r = await page.evaluate(() => {
      const g = __game; g.newGame(); g.clearEnemies();
      g.step(60);
      const y = g.player.y, ground = g.player.onGround;
      // колонна в 3 клетки прямо перед героем
      for (let k = 0; k < 3; k++) g.setTile(6, 9 - k, g.T.PILLAR);
      g.keys.ArrowRight = true; g.step(120); g.keys.ArrowRight = false;
      return { y, ground, bottom: y + g.player.h, x: g.player.x + g.player.w, wall: 6 * g.TILE };
    });
    expect(r.ground).toBe(true);
    expect(r.bottom).toBe(320);
    expect(r.x).toBeLessThanOrEqual(r.wall);
  });

  test('прыжок достаёт до колонны в 3 клетки, короткое нажатие - ниже', async ({ page }) => {
    await openGame(page, 'mario');
    const r = await page.evaluate(() => {
      const g = __game; g.newGame(); g.clearEnemies(); g.step(5);
      const y0 = g.player.y;
      g.keys.Space = true; let top = y0; for (let i = 0; i < 40; i++) { g.step(); top = Math.min(top, g.player.y); } g.keys.Space = false;
      g.step(60);
      g.keys.Space = true; g.step(3); g.keys.Space = false; let top2 = y0; for (let i = 0; i < 40; i++) { g.step(); top2 = Math.min(top2, g.player.y); }
      return { full: y0 - top, short: y0 - top2 };
    });
    expect(r.full).toBeGreaterThan(96);
    expect(r.short).toBeLessThan(r.full - 30);
  });

  test('прыжок на жука сверху - жук погиб, +100 очков, герой подпрыгнул', async ({ page }) => {
    await openGame(page, 'mario');
    const r = await page.evaluate(() => {
      const g = __game; g.newGame(); g.clearEnemies(); g.step(5);
      const e = g.addEnemy(g.player.x, 320 - 24);
      e.vx = 0;
      g.player.y = 320 - 24 - g.player.h - 20; g.player.vy = 4;
      const s0 = g.state.score;
      for (let i = 0; i < 10 && e.alive; i++) g.step();
      return { alive: e.alive, gain: g.state.score - s0, vy: g.player.vy, phase: g.state.phase, lives: g.state.lives };
    });
    expect(r.alive).toBe(false);
    expect(r.gain).toBe(100);
    expect(r.vy).toBeLessThan(0);
    expect(r.phase).toBe('play');
    expect(r.lives).toBe(3);
  });

  test('жук сбоку отнимает жизнь, после паузы уровень начинается заново', async ({ page }) => {
    await openGame(page, 'mario');
    const r = await page.evaluate(() => {
      const g = __game; g.newGame(); g.clearEnemies(); g.step(5);
      g.addEnemy(g.player.x + g.player.w - 2, 320 - 24);
      g.step(2);
      const phase = g.state.phase;
      g.step(80);
      return { phase, lives: g.state.lives, after: g.state.phase, x: g.player.x };
    });
    expect(r.phase).toBe('dying');
    expect(r.lives).toBe(2);
    expect(r.after).toBe('play');
    expect(r.x).toBe(64);
  });

  test('падение в яму отнимает жизнь', async ({ page }) => {
    await openGame(page, 'mario');
    const r = await page.evaluate(() => {
      const g = __game; g.newGame(); g.clearEnemies();
      for (let x = 3; x < 12; x++) { g.setTile(x, 10, 0); g.setTile(x, 11, 0); }
      g.player.x = 5 * 32;
      g.step(120);
      return g.state.lives;
    });
    expect(r).toBe(2);
  });

  test('подарочный блок снизу даёт монету один раз', async ({ page }) => {
    await openGame(page, 'mario');
    const r = await page.evaluate(() => {
      const g = __game; g.newGame(); g.clearEnemies();
      g.setTile(2, 6, g.T.GIFT);
      g.step(5);
      const hit = () => { g.keys.Space = true; g.step(30); g.keys.Space = false; g.step(60); };
      const c0 = g.state.coins;
      hit(); const c1 = g.state.coins; const t1 = g.tileAt(2, 6);
      hit(); const c2 = g.state.coins;
      return { c0, c1, c2, used: t1 === g.T.USED };
    });
    expect(r.c1).toBe(r.c0 + 1);
    expect(r.used).toBe(true);
    expect(r.c2).toBe(r.c1);
  });

  test('флаг ведёт на второй уровень, второй флаг - победа и рекорд после перезагрузки', async ({ page }) => {
    await openGame(page, 'mario');
    await page.evaluate(() => localStorage.removeItem('jumper_best'));
    const r = await page.evaluate(() => {
      const g = __game; g.newGame(); g.clearEnemies();
      g.player.x = g.level.flagX - 40; g.keys.ArrowRight = true; g.step(40); g.keys.ArrowRight = false;
      const phase1 = g.state.phase;
      g.step(110);
      const lvl = g.state.levelIdx; g.clearEnemies();
      g.player.x = g.level.flagX - 40; g.keys.ArrowRight = true; g.step(40); g.keys.ArrowRight = false;
      g.step(110);
      return { phase1, lvl, end: g.state.phase, score: g.state.score, best: g.state.best };
    });
    expect(r.phase1).toBe('clear');
    expect(r.lvl).toBe(1);
    expect(r.end).toBe('won');
    expect(r.best).toBe(r.score);
    await expect(page.locator('#overlay')).toBeVisible();
    await page.reload();
    await page.waitForFunction(() => window.__game && __game.ready);
    expect(await page.evaluate(() => __game.state.best)).toBe(r.score);
  });

  test('три жизни кончились - конец игры; кнопка перезапускает, и пробел потом её не нажимает', async ({ page }) => {
    await openGame(page, 'mario');
    await page.evaluate(() => {
      const g = __game; g.newGame();
      for (let i = 0; i < 3; i++) { g.clearEnemies(); g.addEnemy(g.player.x + g.player.w - 2, 320 - 24); g.step(90); }
    });
    expect(await page.evaluate(() => __game.state.phase)).toBe('over');
    await expect(page.locator('#msg')).toHaveText('ИГРА ОКОНЧЕНА');
    await page.click('#againBtn');
    expect(await page.evaluate(() => ({ p: __game.state.phase, l: __game.state.lives }))).toEqual({ p: 'play', l: 3 });
    await page.evaluate(() => { __game.clearEnemies(); __game.state.score = 500; });
    await page.keyboard.press('Space');
    await page.keyboard.press('Enter');
    expect(await page.evaluate(() => __game.state.score)).toBe(500);
  });

  test('пауза останавливает мир', async ({ page }) => {
    await openGame(page, 'mario');
    await page.keyboard.press('Enter');
    await page.keyboard.press('KeyP');
    const a = await page.evaluate(() => { const g = __game; g.keys.ArrowRight = true; g.step(30); return { x: g.player.x, p: g.state.phase }; });
    await page.evaluate(() => { __game.keys.ArrowRight = false; });
    expect(a.p).toBe('paused');
    expect(a.x).toBe(64);
    await page.keyboard.press('KeyP');
    expect(await page.evaluate(() => __game.state.phase)).toBe('play');
  });

  test('уровни проходимы: ямы не шире прыжка, колонны не выше прыжка', async ({ page }) => {
    await openGame(page, 'mario');
    const r = await page.evaluate(() => {
      const g = __game, out = [];
      for (let i = 0; i < 2; i++) {
        g.loadLevel(i);
        const L = g.level;
        let pit = 0, maxPit = 0, maxH = 0;
        for (let x = 0; x < L.w; x++) {
          if (!g.tileAt(x, 10)) { pit++; maxPit = Math.max(maxPit, pit); } else pit = 0;
          let h = 0; for (let y = 9; y >= 0 && g.tileAt(x, y) && g.tileAt(x, y) !== g.T.BRICK && g.tileAt(x, y) !== g.T.GIFT; y--) h++;
          if (x > 0) { let hp = 0; for (let y = 9; y >= 0 && g.tileAt(x - 1, y) && g.tileAt(x - 1, y) !== g.T.BRICK && g.tileAt(x - 1, y) !== g.T.GIFT; y--) hp++; maxH = Math.max(maxH, h - hp); }
        }
        out.push({ maxPit, maxStep: maxH, flag: L.flagX > 0 });
      }
      return out;
    });
    for (const l of r) {
      expect(l.maxPit).toBeLessThanOrEqual(4);    // прыжок с разбега - около 4 клеток
      expect(l.maxStep).toBeLessThanOrEqual(3);   // подъём за раз - не выше 3 клеток
      expect(l.flag).toBe(true);
    }
  });

  for (const size of SIZES) {
    test(`влезает в окно ${size.width}x${size.height}`, async ({ page }) => {
      await page.setViewportSize(size);
      await openGame(page, 'mario');
      expectFits(expect, await fitReport(page, '#game'));
    });
  }
});
