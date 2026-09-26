// Законы «Кубического мира»: three.js свой, мир рисуется кусками только из видимых граней,
// блок ломается и ставится туда, куда смотришь, в себя не ставится, нижний слой не ломается,
// постройки переживают перезагрузку, «Новый мир» их стирает, земля держит, стены не пускают,
// полёт, пауза, мир один и тот же при каждом запуске, окно.
const { test, expect } = require('@playwright/test');
const { openGame, fitReport, expectFits, SIZES } = require('./_games-helpers');

const fresh = async (page) => {
  await openGame(page, 'minecraft_clone_3d_1');
  await page.evaluate(() => { localStorage.removeItem('cubeworld_edits_v1'); __game.resetWorld(); __game.begin(); __game.step(0.016, 90); });
};

test.describe('minecraft_clone_3d_1 (Кубический мир)', () => {
  test('three.js из vendor/, без сети и ошибок; мир - 9 кусков, скрытых граней нет', async ({ page }) => {
    const requests = [];
    page.on('request', (r) => requests.push(r.url()));
    const errors = await openGame(page, 'minecraft_clone_3d_1');
    expect(requests.filter((u) => /^https?:/.test(u))).toEqual([]);
    expect(await page.evaluate(() => THREE.REVISION)).toBe('149');
    const r = await page.evaluate(() => {
      const g = __game; let blocks = 0;
      for (let x = -24; x < 24; x++) for (let y = 0; y < 32; y++) for (let z = -24; z < 24; z++) if (g.getBlock(x, y, z)) blocks++;
      return { meshes: g.meshCount(), faces: g.faceCount(), blocks };
    });
    expect(r.meshes).toBe(9);                       // раньше - отдельный объект на каждый блок (тысячи)
    expect(r.faces).toBeLessThan(r.blocks);         // рисуются только грани, которые видно
    expect(r.faces).toBeGreaterThan(48 * 48);       // верхний слой виден весь
    await page.waitForTimeout(300);
    expect(errors).toEqual([]);
  });

  test('земля держит: герой стоит ровно на верхней грани блока', async ({ page }) => {
    await fresh(page);
    const r = await page.evaluate(() => {
      const p = __game.player;
      const feet = p.pos.y - p.height;
      return { ground: p.onGround, feet, below: __game.getBlock(Math.floor(p.pos.x), Math.round(feet) - 1, Math.floor(p.pos.z)) };
    });
    expect(r.ground).toBe(true);
    expect(Math.abs(r.feet - Math.round(r.feet))).toBeLessThan(0.01);
    expect(r.below).toBeGreaterThan(0);
    // падение с высоты: в первый же шаг касания ноги ровно на грани, без зависания над ней
    const land = await page.evaluate(() => {
      const g = __game, p = g.player;
      p.pos.y += 6; p.vel.y = 0; p.onGround = false;
      for (let i = 0; i < 200 && !p.onGround; i++) g.step(0.016);
      return p.pos.y - p.height;
    });
    expect(Math.abs(land - Math.round(land))).toBeLessThan(0.01);
  });

  test('ЛКМ ломает блок под прицелом, нижний слой не ломается', async ({ page }) => {
    await fresh(page);
    const r = await page.evaluate(() => {
      const g = __game; g.look(0, -1.55);                  // смотрим под ноги
      const hit = g.raycastVoxel();
      const broken = g.breakTarget();
      const after = g.getBlock(hit.block.x, hit.block.y, hit.block.z);
      // нижний слой: ставим героя над дырой до самого низа
      for (let y = 1; y < 32; y++) g.setBlockRaw(0, y, 0, 0);
      g.player.pos.set(0.5, 1 + 1.7, 0.5); g.look(0, -1.55);
      const bottom = g.breakTarget();
      return { hit: hit.block, broken, after, bottom, y0: g.getBlock(0, 0, 0) };
    });
    expect(r.broken).toEqual(r.hit);
    expect(r.after).toBe(0);
    expect(r.bottom).toBe(null);
    expect(r.y0).toBeGreaterThan(0);
  });

  test('ПКМ ставит выбранный блок на грань под прицелом, но не внутрь героя', async ({ page }) => {
    await fresh(page);
    const r = await page.evaluate(() => {
      const g = __game; g.select(7);
      g.look(0, -0.9);                                      // на землю впереди
      const aim = g.raycastVoxel();
      const placed = g.placeTarget();
      const t = placed ? g.getBlock(placed.x, placed.y, placed.z) : 0;
      g.look(0, -1.55);                                     // себе под ноги: клетка занята телом
      const self = g.placeTarget();
      return { aim: aim.place, placed, t, self };
    });
    expect(r.placed).toEqual(r.aim);
    expect(r.t).toBe(7);
    expect(r.self).toBe(null);
  });

  test('постройки переживают перезагрузку, «Новый мир» их стирает', async ({ page }) => {
    await fresh(page);
    const placed = await page.evaluate(() => { const g = __game; g.select(3); g.look(0, -0.9); return g.placeTarget(); });
    expect(placed).not.toBe(null);
    await page.reload();
    await page.waitForFunction(() => window.__game && __game.ready);
    expect(await page.evaluate((p) => __game.getBlock(p.x, p.y, p.z), placed)).toBe(3);
    await page.evaluate(() => __game.resetWorld());
    expect(await page.evaluate((p) => __game.getBlock(p.x, p.y, p.z), placed)).toBe(0);
    await page.reload();
    await page.waitForFunction(() => window.__game && __game.ready);
    expect(await page.evaluate((p) => __game.getBlock(p.x, p.y, p.z), placed)).toBe(0);
  });

  test('стена из блоков не пускает, W идёт туда, куда смотришь', async ({ page }) => {
    await fresh(page);
    const r = await page.evaluate(() => {
      const g = __game, p = g.player;
      const feet = Math.round(p.pos.y - p.height);
      for (let x = -3; x <= 3; x++) for (let y = feet; y < feet + 3; y++) g.setBlockRaw(x, y, -3, 3);   // стена на z = -3
      g.look(0, 0);                                        // лицом к -Z
      const z0 = p.pos.z;
      g.keys.KeyW = true; g.step(0.016, 120); g.keys.KeyW = false;
      return { z0, z: p.pos.z };
    });
    expect(r.z).toBeLessThan(r.z0);          // шёл вперёд
    expect(r.z).toBeGreaterThanOrEqual(-2 + 0.29);   // но в стену не вошёл
  });

  test('полёт: Пробел поднимает, F выключает и герой падает на землю', async ({ page }) => {
    await fresh(page);
    const r = await page.evaluate(() => {
      const g = __game, p = g.player;
      const y0 = p.pos.y;
      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF', bubbles: true }));
      g.keys.Space = true; g.step(0.016, 60); g.keys.Space = false;
      const up = p.pos.y - y0;
      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF', bubbles: true }));
      g.step(0.016, 200);
      return { up, back: Math.abs(p.pos.y - y0), ground: p.onGround, fly: p.flying };
    });
    expect(r.up).toBeGreaterThan(5);
    expect(r.fly).toBe(false);
    expect(r.ground).toBe(true);
    expect(r.back).toBeLessThan(0.01);
  });

  test('пауза: меню открыто, клавиши не двигают героя', async ({ page }) => {
    await fresh(page);
    const r = await page.evaluate(() => {
      const g = __game, p = g.player; g.pause();
      const x = p.pos.x, z = p.pos.z;
      g.keys.KeyW = true; g.step(0.016, 60); g.keys.KeyW = false;
      return { moved: Math.hypot(p.pos.x - x, p.pos.z - z), s: g.state };
    });
    expect(r).toEqual({ moved: 0, s: 'menu' });
    await expect(page.locator('#menu')).toBeVisible();
  });

  test('мир при каждом запуске один и тот же (деревья не переезжают)', async ({ page }) => {
    const sig = async () => {
      await openGame(page, 'minecraft_clone_3d_1');
      return page.evaluate(() => { let h = 0; for (let x = -24; x < 24; x++) for (let y = 0; y < 32; y++) for (let z = -24; z < 24; z++) h = (h * 31 + __game.getBlock(x, y, z)) | 0; return h; });
    };
    await openGame(page, 'minecraft_clone_3d_1');
    await page.evaluate(() => localStorage.removeItem('cubeworld_edits_v1'));
    const a = await sig();
    const b = await sig();
    expect(b).toBe(a);
  });

  for (const size of SIZES) {
    test(`заполняет окно ${size.width}x${size.height}`, async ({ page }) => {
      await page.setViewportSize(size);
      await openGame(page, 'minecraft_clone_3d_1');
      const rep = await fitReport(page, '#gc');
      expectFits(expect, rep);
      expect(rep.box.width).toBe(size.width);
      expect(rep.box.height).toBe(size.height);
    });
  }
});
