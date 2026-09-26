// Законы «Кубик-паркура»: three.js свой, герой стоит ступнями на земле (ноги не в земле),
// земля одна (без мерцающего двойника), сквозь стену и бок платформы не пройти, на платформу
// можно запрыгнуть, ездящая платформа везёт, монеты собираются, все монеты - победа и рекорд
// времени, падение - на старт, пауза, до каждой платформы можно допрыгнуть, окно.
const { test, expect } = require('@playwright/test');
const { openGame, fitReport, expectFits, SIZES } = require('./_games-helpers');

test.describe('roblox-mini (Кубик-паркур)', () => {
  test('three.js из vendor/, без сети; земля одна; ступни героя на земле, а не под ней', async ({ page }) => {
    const requests = [];
    page.on('request', (r) => requests.push(r.url()));
    const errors = await openGame(page, 'roblox-mini');
    expect(requests.filter((u) => /^https?:/.test(u))).toEqual([]);
    const r = await page.evaluate(() => {
      const g = __game; g.start(); g.step(0.016, 30);
      let grounds = 0;
      g.scene.traverse((o) => { if (o.isMesh && o.geometry.parameters && o.geometry.parameters.width === 100) grounds++; });
      return { rev: THREE.REVISION, grounds, y: g.player.position.y, bottom: g.heroBottom(), onGround: g.state.onGround };
    });
    expect(r.rev).toBe('149');
    expect(r.grounds).toBe(1);
    expect(r.onGround).toBe(true);
    expect(r.y).toBe(0);
    expect(r.bottom).toBeGreaterThan(-0.01);        // раньше ноги уходили на 1.2 в землю
    await page.waitForTimeout(300);
    expect(errors).toEqual([]);
  });

  test('сквозь стену и бок платформы не пройти', async ({ page }) => {
    await openGame(page, 'roblox-mini');
    const r = await page.evaluate(() => {
      const g = __game; g.start();
      g.setYaw(Math.PI);                       // вперёд = +Z, прямо в стену на z = 11.5..12.5
      g.player.position.set(-4, 0, 8);
      g.keys.KeyW = true; g.step(0.016, 120); g.keys.KeyW = false;
      const wallZ = g.player.position.z;
      g.setYaw(-Math.PI / 2);                  // вперёд = +X, в бок красной платформы (верх 1.5)
      g.player.position.set(4, 0, 0);
      g.keys.KeyW = true; g.step(0.016, 120); g.keys.KeyW = false;
      return { wallZ, sideX: g.player.position.x, y: g.player.position.y };
    });
    expect(r.wallZ).toBeLessThanOrEqual(11.5 - 0.45 + 0.01);
    expect(r.sideX).toBeLessThanOrEqual(6.5 - 0.45 + 0.01);
    expect(r.y).toBe(0);
  });

  test('на платформу можно запрыгнуть и на ней стоять', async ({ page }) => {
    await openGame(page, 'roblox-mini');
    const r = await page.evaluate(() => {
      const g = __game; g.start(); g.setYaw(-Math.PI / 2);
      g.player.position.set(5.5, 0, 0);
      g.keys.Space = true; g.keys.KeyW = true; g.step(0.016, 12); g.keys.Space = false; g.step(0.016, 10); g.keys.KeyW = false;
      g.step(0.016, 60);
      return { y: g.player.position.y, ground: g.state.onGround, x: g.player.position.x };
    });
    expect(r.y).toBeCloseTo(1.5, 5);
    expect(r.ground).toBe(true);
  });

  test('ездящая платформа везёт стоящего на ней героя', async ({ page }) => {
    await openGame(page, 'roblox-mini');
    const r = await page.evaluate(() => {
      const g = __game; g.start();
      const m = g.mover.mesh.position;
      g.step(0.016, 1);
      g.player.position.set(m.x, m.y + 0.5, m.z);
      g.step(0.016, 2);
      const dx0 = g.player.position.x - m.x;
      g.step(0.016, 60);
      return { on: g.state.standOn === g.mover, moved: Math.abs(m.x - 26) > 0.5, dx: g.player.position.x - m.x, dx0 };
    });
    expect(r.on).toBe(true);
    expect(r.moved).toBe(true);
    expect(Math.abs(r.dx - r.dx0)).toBeLessThan(0.01);
  });

  test('монета собирается; все монеты - победа, рекорд времени переживает перезагрузку', async ({ page }) => {
    await openGame(page, 'roblox-mini');
    await page.evaluate(() => localStorage.removeItem('parkour_best_ms'));
    const r = await page.evaluate(() => {
      const g = __game; g.start(); g.step(0.016, 5);
      const total = g.coins.length;
      let firstGot = null;
      for (let guard = 0; g.coins.length && guard < 50; guard++) {
        const c = g.coins[g.coins.length - 1];
        g.player.position.set(c.position.x, c.userData.baseY - 1, c.position.z);   // стоя на платформе под монетой
        g.vel.set(0, 0, 0);
        g.step(0.016, 1);
        if (firstGot === null) firstGot = g.state.got;
      }
      return { total, firstGot, got: g.state.got, phase: g.state.phase, best: g.state.best, time: g.state.time };
    });
    expect(r.firstGot).toBe(1);
    expect(r.got).toBe(r.total);
    expect(r.phase).toBe('won');
    expect(r.best).toBe(Math.round(r.time * 1000));
    await expect(page.locator('#win')).toBeVisible();
    await page.reload();
    await page.waitForFunction(() => window.__game && __game.ready);
    expect(await page.evaluate(() => __game.state.best)).toBe(r.best);
    await expect(page.locator('#best')).not.toHaveText('-');
  });

  test('падение с края мира возвращает на старт', async ({ page }) => {
    await openGame(page, 'roblox-mini');
    const r = await page.evaluate(() => {
      const g = __game; g.start();
      g.player.position.set(60, 0, 0);
      g.step(0.016, 80);
      return g.player.position.toArray();
    });
    expect(r).toEqual([0, 0, 0]);
  });

  test('пауза останавливает время и героя', async ({ page }) => {
    await openGame(page, 'roblox-mini');
    await page.keyboard.press('Enter');
    await page.keyboard.press('KeyP');
    const r = await page.evaluate(() => {
      const g = __game; const t = g.state.time, x = g.player.position.x;
      g.keys.KeyW = true; g.step(0.016, 60); g.keys.KeyW = false;
      return { dt: g.state.time - t, dx: g.player.position.x - x, p: g.state.phase };
    });
    expect(r).toEqual({ dt: 0, dx: 0, p: 'paused' });
    await expect(page.locator('#pause')).toBeVisible();
  });

  test('до каждой следующей платформы можно допрыгнуть (зазор и высота в пределах прыжка)', async ({ page }) => {
    await openGame(page, 'roblox-mini');
    const bad = await page.evaluate(() => {
      const g = __game;
      const ps = g.platforms.filter((p) => p !== g.ground && p.h === 1).map((p) => ({ x: p.base.x, y: p.base.y + 0.5, z: p.base.z, w: p.w, d: p.d }));
      const jumpH = 11 * 11 / (2 * 30);                // высота прыжка ~2.0
      const bad = [];
      for (const a of ps) {
        // хоть одна опора (земля или платформа ниже) должна быть досягаема
        const cands = [{ x: a.x, y: 0, z: a.z, w: 1000, d: 1000 }, ...ps.filter((b) => b !== a)];
        const ok = cands.some((b) => {
          const gx = Math.max(0, Math.abs(a.x - b.x) - (a.w + b.w) / 2), gz = Math.max(0, Math.abs(a.z - b.z) - (a.d + b.d) / 2);
          return a.y - b.y <= jumpH - 0.2 && a.y - b.y >= 0 && Math.hypot(gx, gz) <= 3.6;
        });
        if (!ok) bad.push(a);
      }
      return bad;
    });
    expect(bad).toEqual([]);
  });

  for (const size of SIZES) {
    test(`заполняет окно ${size.width}x${size.height}`, async ({ page }) => {
      await page.setViewportSize(size);
      await openGame(page, 'roblox-mini');
      const rep = await fitReport(page, 'canvas');
      expectFits(expect, rep);
      expect(rep.box.width).toBe(size.width);
    });
  }
});
