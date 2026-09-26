// Законы «Космического стрелка»: попадание убирает врага и даёт очки, пуля врага ранит
// один раз (неуязвимость), волны идут дальше, босс на пятой, астероиды делятся и не копятся
// без предела, бонус меняет оружие, конец игры и рестарт, пауза, рекорд, окно.
const { test, expect } = require('@playwright/test');
const { openGame, fitReport, expectFits, SIZES } = require('./_games-helpers');

test.describe('space_shooter', () => {
  test('стартовый экран, Enter начинает игру, мир до старта стоит', async ({ page }) => {
    const errors = await openGame(page, 'space_shooter', 'seed=1');
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => ({ p: __game.state.phase, pl: __game.player }))).toEqual({ p: 'start', pl: null });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    const s = await page.evaluate(() => ({ p: __game.state.phase, wave: __game.state.wave, ast: __game.asteroids.length }));
    expect(s.p).toBe('play');
    expect(s.wave).toBe(1);
    expect(s.ast).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test('попадание убирает врага и даёт очки', async ({ page }) => {
    await openGame(page, 'space_shooter', 'seed=1');
    const r = await page.evaluate(() => {
      const g = __game; g.startGame(); g.clearAll();
      const p = g.player;
      const e = g.makeEnemy('scout', p.x + 200, p.y); e.hp = 10; e.speed = 0; g.enemies.push(e);
      g.aim(e.x, e.y); g.keys.Space = true; g.step(2); g.keys.Space = false;
      for (let i = 0; i < 30 && g.enemies.length; i++) g.step();
      return { left: g.enemies.length, score: g.state.score };
    });
    expect(r.left).toBe(0);
    expect(r.score).toBe(50);
  });

  test('промах не трогает врага', async ({ page }) => {
    await openGame(page, 'space_shooter', 'seed=1');
    const r = await page.evaluate(() => {
      const g = __game; g.startGame(); g.clearAll();
      const p = g.player;
      const e = g.makeEnemy('scout', p.x + 200, p.y); e.speed = 0; g.enemies.push(e);
      g.aim(p.x, p.y - 200); g.keys.Space = true; g.step(20); g.keys.Space = false;
      return { hp: e.hp, max: e.maxHp, score: g.state.score };
    });
    expect(r.hp).toBe(r.max);
    expect(r.score).toBe(0);
  });

  test('пуля врага ранит один раз, пока идёт неуязвимость', async ({ page }) => {
    await openGame(page, 'space_shooter', 'seed=1');
    const r = await page.evaluate(() => {
      const g = __game; g.startGame(); g.clearAll();
      const p = g.player;
      for (let i = 0; i < 3; i++) g.enemyBullets.push({ x: p.x + 6 + i * 5, y: p.y, vx: 0, vy: 0, damage: 10, color: '#f00', life: 100 });
      g.step(1);
      const hp1 = p.hp;
      g.step(5);
      return { hp1, hp2: p.hp };
    });
    expect(r.hp1).toBe(90);
    expect(r.hp2).toBe(90);
  });

  test('когда враги волны кончились - начинается следующая волна', async ({ page }) => {
    await openGame(page, 'space_shooter', 'seed=1');
    const r = await page.evaluate(() => {
      const g = __game; g.startGame();
      g.state.enemiesToSpawn = 0; g.enemies.length = 0; g.state.waveState = 'spawning';
      g.player.invuln = 1e9;
      g.step(1);
      const st = g.state.waveState;
      g.step(125);
      return { st, wave: g.state.wave };
    });
    expect(r.st).toBe('complete');
    expect(r.wave).toBe(2);
  });

  test('пятая волна - босс; сбитый босс даёт очки и завершает волну', async ({ page }) => {
    await openGame(page, 'space_shooter', 'seed=1');
    const r = await page.evaluate(() => {
      const g = __game; g.startGame(); g.clearAll();
      g.state.wave = 5; g.spawnWave();
      const hasBoss = !!g.boss;
      const bar = getComputedStyle(document.getElementById('boss-bar')).display;
      const pts = g.boss.score;
      g.boss.hp = 0; g.step(1);
      return { hasBoss, bar, gone: g.boss === null, score: g.state.score, pts, ws: g.state.waveState };
    });
    expect(r.hasBoss).toBe(true);
    expect(r.bar).toBe('block');
    expect(r.gone).toBe(true);
    expect(r.score).toBe(r.pts);
    expect(r.ws).toBe('complete');
  });

  test('большой астероид раскалывается на два, астероиды не копятся без предела', async ({ page }) => {
    await openGame(page, 'space_shooter', 'seed=1');
    const r = await page.evaluate(() => {
      const g = __game; g.startGame(); g.clearAll();
      const a = g.makeAsteroid(100, 100, 50, 0); a.hp = 0; g.asteroids.push(a);
      g.player.invuln = 1e9;
      g.step(1);
      const split = g.asteroids.length;
      for (let w = 2; w < 40; w++) { g.state.wave = w; g.spawnWave(); }
      return { split, total: g.asteroids.length, cap: g.MAX_ASTEROIDS };
    });
    expect(r.split).toBe(2);
    expect(r.total).toBeLessThanOrEqual(r.cap);
  });

  test('бонус меняет оружие, «+» лечит', async ({ page }) => {
    await openGame(page, 'space_shooter', 'seed=1');
    const r = await page.evaluate(() => {
      const g = __game; g.startGame(); g.clearAll();
      const p = g.player;
      g.powerups.push({ x: p.x, y: p.y, vx: 0, vy: 0, type: 'spread', size: 14, life: 600, pulse: 0 });
      g.step(1);
      const weapon = p.weapon;
      p.hp = 50;
      g.powerups.push({ x: p.x, y: p.y, vx: 0, vy: 0, type: 'health', size: 14, life: 600, pulse: 0 });
      g.step(1);
      return { weapon, hp: p.hp, text: document.getElementById('weapon').textContent };
    });
    expect(r.weapon).toBe('spread');
    expect(r.hp).toBe(80);
    expect(r.text).toBe('Дробовик');
  });

  test('здоровье кончилось - экран конца, рекорд после перезагрузки, кнопка «Заново»', async ({ page }) => {
    await openGame(page, 'space_shooter', 'seed=1');
    await page.evaluate(() => localStorage.removeItem('space_shooter_best'));
    await page.evaluate(() => {
      const g = __game; g.startGame(); g.clearAll();
      g.state.score = 777; g.player.hp = 5;
      g.enemyBullets.push({ x: g.player.x, y: g.player.y, vx: 0, vy: 0, damage: 10, color: '#f00', life: 100 });
      g.step(1);
    });
    expect(await page.evaluate(() => __game.state.phase)).toBe('over');
    await expect(page.locator('#game-over')).toBeVisible();
    await expect(page.locator('#final-best')).toHaveText('Новый рекорд!');
    await page.click('#restartBtn');
    expect(await page.evaluate(() => ({ p: __game.state.phase, s: __game.state.score, hp: __game.player.hp }))).toEqual({ p: 'play', s: 0, hp: 100 });
    await page.reload();
    await page.waitForFunction(() => window.__game && __game.ready);
    expect(await page.evaluate(() => __game.state.best)).toBe(777);
  });

  test('пауза останавливает мир', async ({ page }) => {
    await openGame(page, 'space_shooter', 'seed=1');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    await page.keyboard.press('KeyP');
    const a = await page.evaluate(() => JSON.stringify(__game.asteroids.map((x) => [x.x, x.y])));
    await page.waitForTimeout(400);
    const b = await page.evaluate(() => JSON.stringify(__game.asteroids.map((x) => [x.x, x.y])));
    expect(b).toBe(a);
    await expect(page.locator('#pause')).toBeVisible();
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => __game.state.phase)).toBe('play');
  });

  for (const size of SIZES) {
    test(`заполняет окно ${size.width}x${size.height} без прокрутки`, async ({ page }) => {
      await page.setViewportSize(size);
      await openGame(page, 'space_shooter');
      const rep = await fitReport(page, '#game');
      expectFits(expect, rep);
      expect(rep.box.width).toBe(size.width);
      expect(rep.box.height).toBe(size.height);
    });
  }
});
