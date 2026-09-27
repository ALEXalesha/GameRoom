// Законы по находкам ревьюера «Кубического мира»: утечка памяти видеокарты, перезагрузка на
// экране смерти, ошибки записи, смерть с открытым верстаком, отложенный экран победы, сгоревший
// зомби не в счёт игрока, двойной щелчок «Создать мир», битые данные, небо под водой, упавшие потоки.
const { test, expect } = require('@playwright/test');
const { openVoxel, newWorld, flatArena } = require('./_voxel-helpers');

test.describe.configure({ timeout: 90000 });

async function world(page, mode = 'survival') {
  await openVoxel(page);
  await newWorld(page, { seed: 8, mode });
  await page.evaluate(() => { __voxel.game.autoSpawn = false; __voxel.entities.clear(); });
  await flatArena(page, 70, 7);
}
const frames = (page, n = 2) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

test.describe('minecraft_clone_3d_1: находки ревьюера', () => {
  test('предметы и мобы не копят геометрии: три круга по 150 предметов и 20 мобов - число геометрий не растёт', async ({ page }) => {
    await world(page, 'survival');
    const round = async () => {
      await page.evaluate(() => {
        const v = __voxel, p = v.player, E = v.entities, B = v.core.B, I = v.data.I;
        const ids = [B.dirt, B.stone, B.oak_log, B.sand, I.apple, I.stick, I.iron_ingot, B.torch, I.bone, B.glass];
        for (let k = 0; k < 150; k++) E.spawnItem({ id: ids[k % ids.length], count: 1 }, p.pos.x + (k % 10) - 5, 71, p.pos.z + ((k / 10) | 0) - 7, 0, 0, 0, 99);
        const types = ['pig', 'sheep', 'cow', 'chicken', 'zombie', 'skeleton', 'spider'];
        for (let k = 0; k < 20; k++) E.spawnMob(types[k % types.length], p.pos.x + (k % 5) * 2 - 4, 70, p.pos.z - 6 - ((k / 5) | 0) * 2);
      });
      await frames(page, 3);
      // геометрии не мира: куски подгружаются в фоне и в счёт не идут
      const n = await page.evaluate(() => { const v = __voxel; return v.game.renderer.info.memory.geometries - v.counts().draws - v.world.trash.length; });
      await page.evaluate(() => __voxel.entities.clear());
      await frames(page, 3);
      return n;
    };
    const a = await round(), b = await round(), c = await round();
    const after = await page.evaluate(() => { const v = __voxel; return v.game.renderer.info.memory.geometries - v.counts().draws - v.world.trash.length; });
    expect(c - a).toBeLessThanOrEqual(5);            // раньше +420 за круг
    expect(b - a).toBeLessThanOrEqual(5);
    expect(after).toBeLessThan(a);                   // после очистки мобы ушли вместе с геометрией
  });

  test('перезагрузка на экране смерти: снова экран смерти, а не герой с нулём здоровья; «Возродиться» даёт полное здоровье', async ({ page }) => {
    await world(page, 'survival');
    const id = await page.evaluate(async () => { const v = __voxel; v.player.damage(100, 'fall'); v.step(0.05, 2); await v.flush(); return v.meta.id; });
    await page.reload();
    await page.waitForFunction(() => window.__voxel && __voxel.ready);
    await page.evaluate((id) => { __voxel.settings.renderDistance = 3; __voxel.game.applySettings(); return __voxel.openWorld(id); }, id);
    await expect(page.locator('#scr-death')).toBeVisible();
    expect(await page.evaluate(() => __voxel.state)).toBe('dead');
    await page.locator('#scr-death').getByText('Возродиться').click();
    expect(await page.evaluate(() => ({ s: __voxel.state, h: __voxel.player.health }))).toEqual({ s: 'play', h: 20 });
  });

  test('ошибка записи (нет места): игра не падает, выход в меню работает, игрок видит «Не удалось сохранить»', async ({ page }) => {
    const errors = await openVoxel(page);
    await newWorld(page, { seed: 8, mode: 'survival' });
    await page.evaluate(() => {
      IDBDatabase.prototype.transaction = function () { const e = new Error('места нет'); e.name = 'QuotaExceededError'; throw e; };
    });
    await page.evaluate(() => { const v = __voxel, p = v.player; v.setBlock(Math.floor(p.pos.x), 100, Math.floor(p.pos.z), v.core.B.bricks); });
    await frames(page, 3);
    const msg = await page.evaluate(() => __voxel.game.actionText);
    const done = await page.evaluate(() => Promise.race([__voxel.exitToTitle().then(() => 'ok'), new Promise((r) => setTimeout(() => r('завис'), 8000))]));
    expect(done).toBe('ok');
    await expect(page.locator('#scr-title')).toBeVisible();
    expect(msg).toContain('Не удалось сохранить');
    expect(errors).toEqual([]);
  });

  test('смерть с открытым верстаком: вещи из сетки тоже выпадают, в инвентаре не остаются', async ({ page }) => {
    await world(page, 'survival');
    const r = await page.evaluate(() => {
      const v = __voxel, B = v.core.B, p = v.player;
      v.openContainer('table', { x: 0, y: 0, z: 0 });
      v.container.grid[4] = { id: B.oak_planks, count: 3, dmg: 0 };
      v.inv.cursor = { id: B.stone, count: 2, dmg: 0 };
      p.damage(100, 'fall'); v.step(0.05, 2);
      return { inv: v.inv.slots.filter(Boolean).length, cursor: v.inv.cursor, drops: v.entities.items.map((i) => i.stack.id + 'x' + i.stack.count), state: v.state };
    });
    const B = await page.evaluate(() => __voxel.core.B);
    expect(r.state).toBe('dead');
    expect(r.inv).toBe(0);
    expect(r.cursor).toBe(null);
    expect(r.drops).toContain(B.oak_planks + 'x3');
    expect(r.drops).toContain(B.stone + 'x2');
  });

  test('финал без тестового режима: если сразу уйти в паузу, экран победы покажется при возврате в игру', async ({ page }) => {
    await world(page, 'survival');
    await page.evaluate(() => {
      const v = __voxel, I = v.data.I, VX = v.VX;
      v.game.testMode = false;
      v.openContainer('table', { x: 0, y: 0, z: 0 });
      const view = v.container;
      const G_ = { id: I.gold_ingot, count: 1, dmg: 0 }, Dm = { id: I.diamond, count: 1, dmg: 0 }, A = { id: I.apple, count: 1, dmg: 0 };
      [G_, Dm, G_, Dm, A, Dm, G_, Dm, G_].forEach((s, i) => { view.grid[i] = Object.assign({}, s); });
      VX.inv.click(v.inv, view, 200, 0, false);
      v.game.pause();                              // Esc сразу после
    });
    await page.waitForTimeout(2200);
    expect(await page.evaluate(() => __voxel.state)).toBe('paused');
    await page.locator('#scr-pause').getByText('Вернуться к игре').click();
    await expect(page.locator('#scr-victory')).toBeVisible();
    expect(await page.evaluate(() => __voxel.state)).toBe('victory');
  });

  test('зомби, сгоревший на солнце, не засчитывается игроку; убитый игроком - засчитывается', async ({ page }) => {
    await world(page, 'survival');
    const r = await page.evaluate(() => {
      const v = __voxel, E = v.entities, G = v.game, p = v.player;
      const z = E.spawnMob('zombie', p.pos.x + 5, 70, p.pos.z + 5);
      p.pos.y = 140; p.flying = true;
      for (let k = 0; k < 300 && z.hp > 0; k++) { G.ticks = 6000; G.dayLight = 1; z.x = p.pos.x + 5; z.z = p.pos.z + 5; v.step(0.1); }
      const burned = z.hp <= 0, kills = (v.ach.progress['kill:zombie'] || 0), stats = v.meta.stats.kills;
      const z2 = E.spawnMob('zombie', p.pos.x + 5, 70, p.pos.z + 5);
      E.hurtMob(z2, 100, p.pos.x, p.pos.z, 'player');
      return { burned, kills, stats, kills2: v.ach.progress['kill:zombie'] || 0, ach: !!v.ach.got.zombie };
    });
    expect(r.burned).toBe(true);
    expect(r.kills).toBe(0);
    expect(r.stats).toBe(0);
    expect(r.kills2).toBe(1);
    expect(r.ach).toBe(true);
  });

  test('двойной щелчок «Создать мир» создаёт один мир', async ({ page }) => {
    await openVoxel(page);
    await page.mouse.click(640, 400);
    await page.locator('#scr-title').getByText('Одиночная игра').click();
    await page.locator('#scr-worlds').getByText('Создать новый мир').click();
    await page.evaluate(() => { __voxel.settings.renderDistance = 3; __voxel.game.applySettings(); });
    await page.locator('#scr-create').getByText('Создать мир').dblclick();
    await page.waitForFunction(() => __voxel.state === 'play', null, { timeout: 30000 });
    await page.waitForTimeout(500);
    expect((await page.evaluate(() => __voxel.listWorlds())).length).toBe(1);
  });

  test('битые данные: неизвестные id в инвентаре, сундуке и куске не роняют игру (становятся пустотой или камнем)', async ({ page }) => {
    const errors = await openVoxel(page);
    const id = await newWorld(page, { seed: 8, mode: 'survival' });
    const where = await page.evaluate(async () => {
      const v = __voxel, p = v.player, C = v.core;
      const x = Math.floor(p.pos.x), z = Math.floor(p.pos.z), cx = Math.floor(x / 16), cz = Math.floor(z / 16);
      const d = v.world.chunk(cx, cz).data.slice();
      d[C.cidx(x - cx * 16, 110, z - cz * 16)] = 250;             // блок, которого нет
      await v.VX.store.putChunk(v.meta.id, cx, cz, d);
      await v.exitToTitle();
      const m = await v.VX.store.getWorld(v.meta ? v.meta.id : null) || null;
      return { x, z };
    });
    await page.evaluate(async (id) => {
      const S = __voxel.VX.store, m = await S.getWorld(id);
      m.inv = { slots: [{ id: 9999, count: 3 }, { id: __voxel.core.B.dirt, count: 5 }], armor: [{ id: __voxel.core.B.dirt, count: 1 }], selected: 0 };
      m.chests = { '0,70,0': [{ id: 7777, count: 1 }] };
      await S.putWorld(m);
    }, id);
    await page.evaluate((id) => __voxel.openWorld(id), id);
    await page.keyboard.press('KeyE');
    await frames(page, 3);
    const r = await page.evaluate(({ x, z }) => ({ slots: __voxel.inv.slots.filter(Boolean).map((s) => s.id), armor: __voxel.inv.armor.filter(Boolean).length, chest: __voxel.game.chests['0,70,0'][0], block: __voxel.getBlock(x, 110, z), stone: __voxel.core.B.stone }), where);
    expect(r.slots).toEqual([await page.evaluate(() => __voxel.core.B.dirt)]);
    expect(r.armor).toBe(0);                          // земля в ячейке брони - не броня
    expect(r.chest).toBe(null);
    expect(r.block).toBe(r.stone);
    expect(errors).toEqual([]);
  });

  test('под водой не видно неба, светил и облаков; на экранах меню в игре панель быстрого доступа спрятана', async ({ page }) => {
    await world(page, 'creative');
    await page.evaluate(() => {
      const v = __voxel, p = v.player, B = v.core.B;
      const x = Math.floor(p.pos.x), z = Math.floor(p.pos.z);
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let y = 70; y < 74; y++) v.setBlock(x + dx, y, z + dz, B.water);
      p.flying = true; p.pos.y = 70.5;
    });
    await frames(page, 3);
    const under = await page.evaluate(() => { const G = __voxel.game; let sky = null, clouds = null; G.scene.traverse((o) => { if (o.geometry && o.geometry.type === 'SphereGeometry') sky = o.parent.visible; }); return { uw: G.underwater, sky }; });
    expect(under.uw).toBe(true);
    expect(under.sky).toBe(false);
    await page.evaluate(() => { __voxel.player.pos.y = 90; __voxel.pause(); __voxel.VX.ui.show('ach'); });
    await frames(page, 2);
    expect(await page.evaluate(() => getComputedStyle(document.getElementById('hotbar')).display)).toBe('none');
  });

  test('упавшие потоки: их задания раздаются заново, если упали все - мир строится на странице', async ({ page }) => {
    await world(page, 'creative');
    const r = await page.evaluate(async () => {
      const v = __voxel, W = v.world, p = v.player;
      for (const w of W.pool) { w.terminate(); W.workerDied(w); }
      const sync = W.syncMode;
      p.flying = true; p.pos.x += 16 * 6;
      const t0 = performance.now();
      while (!W.readyAround(p.pos.x, p.pos.z, 1) && performance.now() - t0 < 20000) await new Promise((r) => setTimeout(r, 50));
      return { sync, ready: W.readyAround(p.pos.x, p.pos.z, 1) };
    });
    expect(r.sync).toBe(true);
    expect(r.ready).toBe(true);
  });
});
