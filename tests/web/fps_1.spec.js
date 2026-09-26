// Законы «Тира 3D»: three.js свой (без сети), попадание сбивает мишень и она возвращается
// рядом с домом, стена закрывает мишень от пули, W ведёт туда, куда смотришь, стены держат,
// патроны и перезарядка, раунд 60 секунд, рекорд, пауза, окно.
const { test, expect } = require('@playwright/test');
const { openGame, fitReport, expectFits, SIZES } = require('./_games-helpers');

test.describe('fps_1 (Тир 3D)', () => {
  test('библиотека three.js грузится из vendor/, без сети и ошибок', async ({ page }) => {
    const requests = [];
    page.on('request', (r) => requests.push(r.url()));
    const errors = await openGame(page, 'fps_1', 'seed=1');
    expect(requests.some((u) => u.endsWith('/vendor/three.min.js'))).toBe(true);
    expect(requests.filter((u) => /^https?:/.test(u))).toEqual([]);
    expect(await page.evaluate(() => THREE.REVISION)).toBe('149');
    await page.waitForTimeout(500);
    expect(errors).toEqual([]);
  });

  test('попадание сбивает мишень, через 0.8 с она снова стоит рядом с домом', async ({ page }) => {
    await openGame(page, 'fps_1', 'seed=1');
    const r = await page.evaluate(() => {
      const g = __game; g.begin();
      const t = g.targets[6];                   // дом (0, 2, 20) - прямо за спиной, стен между нет
      g.aimAt(t.position.x, t.position.y, t.position.z);
      const hit = g.shoot() === t;
      const hidden = !t.visible;
      g.tick(0.1, 10);
      const back = t.visible && t.userData.alive;
      const d = t.userData.origin.distanceTo(t.userData.home);
      return { hit, hidden, back, d, hits: g.state.hits, shots: g.state.shots };
    });
    expect(r.hit).toBe(true);
    expect(r.hidden).toBe(true);
    expect(r.back).toBe(true);
    expect(r.d).toBeLessThan(4);
    expect(r.hits).toBe(1);
    expect(r.shots).toBe(1);
  });

  test('мишени после многих попаданий не уползают за арену и в стены', async ({ page }) => {
    await openGame(page, 'fps_1', 'seed=2');
    const r = await page.evaluate(() => {
      const g = __game; g.begin();
      let home = 0, edge = 0, inWall = 0;
      for (let k = 0; k < 200; k++) {
        for (const t of g.targets) { t.userData.alive = false; t.userData.respawn = 0; }
        g.tick(0.016);
        for (const t of g.targets) {
          const o = t.userData.origin;
          home = Math.max(home, o.distanceTo(t.userData.home));
          edge = Math.max(edge, Math.abs(o.x), Math.abs(o.z));
          if (g.walls.some((w) => o.x > w.min.x && o.x < w.max.x && o.z > w.min.z && o.z < w.max.z && o.y < w.max.y)) inWall++;
        }
      }
      return { home, edge, inWall };
    });
    expect(r.home).toBeLessThan(4);
    expect(r.edge).toBeLessThan(27);
    expect(r.inWall).toBe(0);
  });

  test('стена закрывает мишень: выстрел сквозь стену не засчитывается', async ({ page }) => {
    await openGame(page, 'fps_1', 'seed=1');
    const r = await page.evaluate(() => {
      const g = __game; g.begin();
      const t = g.targets[0];
      t.userData.origin.set(0, 1.2, 2); t.position.set(0, 1.2, 2);    // за стеной (0, 5) шириной 8 и высотой 2.5
      g.player.pos.set(0, 1.6, 9);
      g.aimAt(0, 1.2, 2);
      return { res: g.shoot(), hits: g.state.hits, alive: t.userData.alive };
    });
    expect(r.res).toBe(null);
    expect(r.hits).toBe(0);
    expect(r.alive).toBe(true);
  });

  test('W ведёт туда, куда смотрит камера, D - вправо; стена не пускает', async ({ page }) => {
    await openGame(page, 'fps_1', 'seed=1');
    const r = await page.evaluate(() => {
      const g = __game; g.begin();
      g.player.pos.set(0, 1.6, 15); g.player.yaw = 0; g.player.pitch = 0;   // смотрим на -Z
      g.keys.KeyW = true; g.tick(0.05, 10); g.keys.KeyW = false;
      const zAfterW = g.player.pos.z;
      g.keys.KeyD = true; g.tick(0.05, 10); g.keys.KeyD = false;
      const xAfterD = g.player.pos.x;
      g.player.pos.set(0, 1.6, 26); g.player.yaw = Math.PI;                  // лицом к задней стене z=30
      g.keys.KeyW = true; g.tick(0.05, 100); g.keys.KeyW = false;
      return { zAfterW, xAfterD, zWall: g.player.pos.z };
    });
    expect(r.zAfterW).toBeLessThan(14);
    expect(r.xAfterD).toBeGreaterThan(1);
    expect(r.zWall).toBeLessThan(29.5 - 0.39);
  });

  test('магазин 30: пустой не стреляет, перезарядка 1.2 с возвращает патроны', async ({ page }) => {
    await openGame(page, 'fps_1', 'seed=1');
    const r = await page.evaluate(() => {
      const g = __game; g.begin(); g.aimAt(0, 30, -100);
      for (let i = 0; i < 30; i++) g.shoot();
      const empty = g.state.mag;
      g.shoot();                       // пустой - запускает перезарядку, выстрела нет
      const shots = g.state.shots;
      g.tick(0.1, 6); const mid = g.state.mag;
      g.tick(0.1, 7); const full = g.state.mag;
      return { empty, shots, mid, full };
    });
    expect(r).toEqual({ empty: 0, shots: 30, mid: 0, full: 30 });
  });

  test('раунд кончается через 60 с, рекорд сохраняется и переживает перезагрузку', async ({ page }) => {
    await openGame(page, 'fps_1', 'seed=1');
    await page.evaluate(() => localStorage.removeItem('fps_range_best'));
    const r = await page.evaluate(() => {
      const g = __game; g.begin();
      const t = g.targets[6]; g.aimAt(t.position.x, t.position.y, t.position.z); g.shoot();
      g.tick(0.05, 1199); const before = g.state.phase;
      g.tick(0.05, 2);
      return { before, after: g.state.phase, best: g.state.best };
    });
    expect(r).toEqual({ before: 'play', after: 'results', best: 1 });
    await expect(page.locator('#results')).toBeVisible();
    await expect(page.locator('#resBest')).toHaveText('Новый рекорд!');
    await page.reload();
    await page.waitForFunction(() => window.__game && __game.ready);
    expect(await page.evaluate(() => __game.state.best)).toBe(1);
    await expect(page.locator('#menuBest')).toContainText('1');
  });

  test('пауза останавливает время раунда', async ({ page }) => {
    await openGame(page, 'fps_1', 'seed=1');
    const r = await page.evaluate(() => {
      const g = __game; g.begin(); g.tick(0.05, 20);
      const t1 = g.state.timeLeft;
      g.pause(); g.tick(0.05, 100);
      const t2 = g.state.timeLeft;
      return { t1, t2, p: g.state.phase };
    });
    expect(r.t2).toBe(r.t1);
    expect(r.p).toBe('paused');
    await expect(page.locator('#pause')).toBeVisible();
  });

  for (const size of SIZES) {
    test(`заполняет окно ${size.width}x${size.height} без прокрутки`, async ({ page }) => {
      await page.setViewportSize(size);
      await openGame(page, 'fps_1');
      const rep = await fitReport(page, 'canvas');
      expectFits(expect, rep);
      expect(rep.box.width).toBe(size.width);
      expect(rep.box.height).toBe(size.height);
    });
  }
});
