// Законы «Дино-бега»: прыжок и приземление, столкновение и увёртки, счёт и рекорд,
// пауза, рестарт, повторяемость по ?seed=, размер под окно.
const { test, expect } = require('@playwright/test');
const { openGame, fitReport, expectFits, SIZES } = require('./_games-helpers');

test.describe('dino', () => {
  test('до старта мир стоит, пробел запускает забег', async ({ page }) => {
    const errors = await openGame(page, 'dino', 'seed=1');
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => __game.state.phase)).toBe('ready');
    expect(await page.evaluate(() => __game.state.score)).toBe(0);
    await page.keyboard.press('Space');
    await page.waitForTimeout(400);
    const s = await page.evaluate(() => ({ phase: __game.state.phase, score: __game.state.score }));
    expect(s.phase).toBe('running');
    expect(s.score).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test('земля и лапы динозаврика внутри поля (раньше линия земли была за краем холста)', async ({ page }) => {
    await openGame(page, 'dino');
    const r = await page.evaluate(() => ({ floor: __game.FLOOR, h: __game.H, feet: __game.dino.y + 47 }));
    expect(r.feet).toBe(r.floor);
    expect(r.floor).toBeLessThanOrEqual(r.h - 10);
  });

  test('прыжок поднимает и возвращает на землю; короткое нажатие - прыжок ниже', async ({ page }) => {
    await openGame(page, 'dino', 'seed=1');
    const r = await page.evaluate(() => {
      const g = __game; g.start(); g.clearObstacles();
      const ground = g.dino.y;
      g.keys.Space = true;
      let top = ground;
      for (let i = 0; i < 80; i++) { g.step(); top = Math.min(top, g.dino.y); }
      g.keys.Space = false;
      const fullTop = top, landed = g.dino.y === ground && !g.dino.jumping;
      g.keys.Space = true; g.step(3); g.keys.Space = false;
      let shortTop = ground;
      for (let i = 0; i < 80; i++) { g.step(); shortTop = Math.min(shortTop, g.dino.y); }
      return { ground, fullTop, landed, shortTop, landed2: g.dino.y === ground };
    });
    expect(r.ground - r.fullTop).toBeGreaterThan(100);
    expect(r.landed).toBe(true);
    expect(r.landed2).toBe(true);
    expect(r.ground - r.shortTop).toBeLessThan(r.ground - r.fullTop - 30);
  });

  test('кактус впритык - проигрыш, рекорд записан и переживает перезагрузку', async ({ page }) => {
    await openGame(page, 'dino', 'seed=1');
    await page.evaluate(() => localStorage.removeItem('dino_hi'));
    const score = await page.evaluate(() => {
      const g = __game; g.start(); g.clearObstacles();
      g.step(300);                                   // набрать очки
      const c = g.makeCactus({ w: 17, h: 35 }); c.x = g.dino.x + 60; g.obstacles.push(c);
      for (let i = 0; i < 60 && g.state.phase === 'running'; i++) g.step();
      return { phase: g.state.phase, score: Math.floor(g.state.score), hi: g.state.hiScore };
    });
    expect(score.phase).toBe('over');
    expect(score.hi).toBe(score.score);
    expect(score.score).toBeGreaterThan(10);
    await page.reload();
    await page.waitForFunction(() => window.__game && __game.ready);
    expect(await page.evaluate(() => __game.state.hiScore)).toBe(score.score);
  });

  test('над кактусом в прыжке столкновения нет', async ({ page }) => {
    await openGame(page, 'dino', 'seed=1');
    const r = await page.evaluate(() => {
      const g = __game; g.start(); g.clearObstacles();
      const c = g.makeCactus({ w: 50, h: 50 }); c.x = g.dino.x + 5; g.obstacles.push(c);
      g.dino.y = c.y - 60; g.dino.jumping = true; g.dino.vy = -1;
      return g.collides();
    });
    expect(r).toBe(false);
  });

  test('средняя птица: стоя - удар, пригнувшись - проходит; низкая - только прыжком', async ({ page }) => {
    await openGame(page, 'dino', 'seed=1');
    const r = await page.evaluate(() => {
      const g = __game; g.start(); g.clearObstacles();
      const bird = (lvl) => { g.obstacles.length = 0; const b = g.makeBird(lvl); b.x = g.dino.x + 10; g.obstacles.push(b); };
      bird('mid'); g.dino.ducking = false; const midStand = g.collides();
      g.dino.ducking = true; const midDuck = g.collides();
      bird('low'); const lowDuck = g.collides();
      bird('high'); g.dino.ducking = false; const highStand = g.collides();
      return { midStand, midDuck, lowDuck, highStand };
    });
    expect(r).toEqual({ midStand: true, midDuck: false, lowDuck: true, highStand: false });
  });

  test('пауза останавливает мир, P снимает паузу', async ({ page }) => {
    await openGame(page, 'dino', 'seed=1');
    await page.keyboard.press('Space');
    await page.waitForTimeout(200);
    await page.keyboard.press('KeyP');
    const a = await page.evaluate(() => ({ phase: __game.state.phase, score: __game.state.score }));
    await page.waitForTimeout(500);
    const b = await page.evaluate(() => __game.state.score);
    expect(a.phase).toBe('paused');
    expect(b).toBe(a.score);
    await page.keyboard.press('KeyP');
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => __game.state.score)).toBeGreaterThan(a.score);
  });

  test('после проигрыша зажатый пробел не перезапускает сразу, а следующее нажатие - да', async ({ page }) => {
    await openGame(page, 'dino', 'seed=1');
    await page.evaluate(() => {
      const g = __game; g.start(); g.clearObstacles();
      const c = g.makeCactus({ w: 17, h: 35 }); c.x = g.dino.x + 20; g.obstacles.push(c); g.step(10);
    });
    expect(await page.evaluate(() => __game.state.phase)).toBe('over');
    await page.keyboard.press('Space');
    expect(await page.evaluate(() => __game.state.phase)).toBe('over');
    await page.evaluate(() => __game.step(40));
    await page.keyboard.press('Space');
    const s = await page.evaluate(() => ({ phase: __game.state.phase, n: __game.obstacles.length }));
    expect(s.phase).toBe('running');
    expect(s.n).toBe(0);
  });

  test('одинаковый seed - одинаковые препятствия', async ({ page }) => {
    const run = async () => {
      await openGame(page, 'dino', 'seed=42');
      return page.evaluate(() => {
        const g = __game; g.start();
        const seen = [];
        for (let i = 0; i < 600; i++) {
          g.step(); if (g.state.phase !== 'running') { g.state.phase = 'running'; g.obstacles.length = 0; }
          for (const o of g.obstacles) if (!o.seen) { o.seen = 1; seen.push(o.type + o.w + ':' + o.h); }
        }
        return seen.join(',');
      });
    };
    const a = await run();
    const b = await run();
    expect(a.length).toBeGreaterThan(10);
    expect(b).toBe(a);
  });

  for (const size of SIZES) {
    test(`влезает в окно ${size.width}x${size.height}`, async ({ page }) => {
      await page.setViewportSize(size);
      await openGame(page, 'dino');
      expectFits(expect, await fitReport(page, '#game'));
    });
  }
});
