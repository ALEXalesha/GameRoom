// Законы «Кубического мира», четвёртый заход: тростник, бумага и книги, компас, часы, карты, изумруды.
const { test, expect } = require('@playwright/test');
const { openVoxel, newWorld, flatArena } = require('./_voxel-helpers');

test.describe.configure({ timeout: 90000 });

async function world(page, mode = 'survival') {
  await openVoxel(page);
  await newWorld(page, { seed: 8, mode });
  await page.evaluate(() => { __voxel.game.autoSpawn = false; __voxel.entities.clear(); __voxel.game.ticks = 4000; });
  await flatArena(page, 70, 7);
  await page.evaluate(() => {
    window.aim = (x, y, z) => { const v = __voxel, p = v.player, dx = x - p.pos.x, dy = y - p.eye(), dz = z - p.pos.z; v.look(Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz))); };
    window.hold = (id, n, dmg) => { const v = __voxel; v.inv.slots[0] = { id, count: n || 16, dmg: dmg || 0 }; v.select(0); };
    window.base = () => { const p = __voxel.player; return { x0: Math.floor(p.pos.x), z0: Math.floor(p.pos.z) }; };
  });
}

test.describe('minecraft_clone_3d_1: тростник, компас, часы, карты', () => {
  test('тростник: растёт в мире у воды; ставится только у воды или на тростник; растёт до 3; без опоры падает; бумага, сахар, книги, полки из книг', async ({ page }) => {
    await world(page);
    const r = await page.evaluate(() => {
      const v = __voxel, C = v.core, B = C.B, D = v.data, I = D.I;
      const seed = C.seedFrom('8');
      let gen = 0, nearWater = true;
      for (let cz = -4; cz <= 4; cz++) for (let cx = -4; cx <= 4; cx++) {
        const d = C.generate(seed, cx, cz);
        for (let i = 0; i < d.length; i++) if (d[i] === C.SUGAR_CANE) gen++;
      }
      const { x0, z0 } = base();
      v.setBlock(x0, 69, z0 - 2, B.sand); v.setBlock(x0 + 1, 69, z0 - 2, B.water);
      v.setBlock(x0 - 3, 69, z0 - 2, B.sand);
      hold(C.SUGAR_CANE);
      aim(x0 + 0.5, 70, z0 - 1.5); const ok = v.place();
      aim(x0 - 2.5, 70, z0 - 1.5); const dry = v.place();
      for (let k = 0; k < 600; k++) v.step(0.25);
      let h = 0; while (v.getBlock(x0, 70 + h, z0 - 2) === C.SUGAR_CANE) h++;
      // сломать низ - падает весь
      v.game.breakAt(x0, 70, z0 - 2, true);
      const rest = [v.getBlock(x0, 71, z0 - 2), v.getBlock(x0, 72, z0 - 2)];
      // убрали воду - тростник без опоры выпадает
      hold(C.SUGAR_CANE); aim(x0 + 0.5, 70, z0 - 1.5); v.place();
      v.setBlock(x0 + 1, 69, z0 - 2, B.stone); v.game.afterChange(x0 + 1, 69, z0 - 2);
      const dried = v.getBlock(x0, 70, z0 - 2);
      const rec = (k) => D.RECIPES.find((q) => q.outId === (typeof k === 'number' ? k : I[k] || B[k]));
      return { dried, gen, ok: !!ok, dry, h, rest, paper: rec('paper').count, sugar: !!rec('sugar'), book: rec('book').shapeless.length, shelf: rec('bookshelf').keys.B };
    });
    expect(r.gen).toBeGreaterThan(5);
    expect(r.ok).toBe(true);
    expect(r.dry).toBe(null);
    expect(r.h).toBe(3);
    expect(r.rest).toEqual([0, 0]);
    expect(r.dried).toBe(0);
    expect(r.paper).toBe(3);
    expect(r.sugar).toBe(true);
    expect(r.book).toBe(4);
    expect(r.shelf).toBe('book');
  });

  test('компас смотрит на точку появления (впереди - вверх, справа - на четверть), в Нижнем мире крутится; часы - полдень и полночь разные', async ({ page }) => {
    await world(page);
    const r = await page.evaluate(() => {
      const v = __voxel, I = v.data.I, p = v.player, IT = v.VX.items;
      const sp = v.meta.spawn;
      p.pos.set(sp.x, p.pos.y, sp.z + 20);                         // точка появления на -Z
      v.look(0, 0); const ahead = IT.variant(I.compass);
      v.look(Math.PI / 2, 0); const right = IT.variant(I.compass);  // смотрим на -X: цель справа
      v.look(Math.PI, 0); const behind = IT.variant(I.compass);
      const iconA = v.game.icon(I.compass); v.look(0, 0); const iconB = v.game.icon(I.compass);
      v.game.ticks = 6000; const noon = IT.variant(I.clock);
      v.game.ticks = 18000; const night = IT.variant(I.clock);
      return { ahead, right, behind, iconDiff: iconA !== iconB, noon, night };
    });
    expect(r.ahead).toBe(0);
    expect(r.right).toBe(4);
    expect(r.behind).toBe(8);
    expect(r.iconDiff).toBe(true);
    expect(r.noon).toBe(4);
    expect(r.night).toBe(12);
  });

  test('карта: ПКМ пустой картой - карта 128x128 вокруг героя, дорисовывается в руке и видна на экране; хранится в мире; достижение «Картограф»', async ({ page }) => {
    await world(page);
    const r = await page.evaluate(async () => {
      const v = __voxel, I = v.data.I, p = v.player;
      hold(I.empty_map, 2);
      const res = v.place();
      const held = v.inv.slots.find((s) => s && s.id === I.filled_map);
      const n = held && held.dmg;
      const m = v.meta.maps[n];
      const inside = p.pos.x >= m.x0 && p.pos.x < m.x0 + 128 && p.pos.z >= m.z0 && p.pos.z < m.z0 + 128;
      v.select(v.inv.slots.indexOf(held));
      for (let k = 0; k < 20; k++) v.step(0.05);
      await new Promise((rr) => setTimeout(rr, 300));
      const px = v.VX.items.mapData(n);
      let known = 0; for (let i = 0; i < px.length; i++) if (px[i]) known++;
      const shown = getComputedStyle(document.getElementById('mapView')).display;
      const id = v.meta.id;
      await v.flush(); await v.exitToTitle(); await v.openWorld(id);
      const px2 = v.VX.items.mapData(n);
      let known2 = 0; for (let i = 0; i < px2.length; i++) if (px2[i]) known2++;
      return { res, filled: held.id === I.filled_map, n, inside, known, shown, known2, ach: !!v.ach.got.map, leftEmpty: v.inv.count(I.empty_map) };
    });
    expect(r.res).toBe('map');
    expect(r.filled).toBe(true);
    expect(r.inside).toBe(true);
    expect(r.known).toBeGreaterThan(2000);
    expect(r.shown).toBe('block');
    expect(r.known2).toBe(r.known);
    expect(r.ach).toBe(true);
    expect(r.leftEmpty).toBe(1);
  });

  test('изумрудная руда: в горах, даёт изумруд железной киркой', async ({ page }) => {
    await openVoxel(page);
    const r = await page.evaluate(() => {
      const v = __voxel, C = v.core, D = v.data, I = D.I, seed = C.seedFrom('8');
      const w = C.worldOf(seed);
      let ores = 0, chunks = 0;
      for (let cz = -40; cz <= 40 && chunks < 8; cz += 2) for (let cx = -40; cx <= 40 && chunks < 8; cx += 2) {
        if (C.column(w, cx * 16 + 8, cz * 16 + 8).biome !== 4) continue;
        chunks++;
        const d = C.generate(seed, cx, cz);
        for (let i = 0; i < d.length; i++) if (d[i] === C.EMERALD_ORE) ores++;
      }
      return { chunks, ores, drop: D.dropsOf(C.EMERALD_ORE, I.iron_pickaxe, Math.random), stone: D.dropsOf(C.EMERALD_ORE, I.stone_pickaxe, Math.random), em: I.emerald };
    });
    expect(r.chunks).toBeGreaterThan(0);
    expect(r.ores).toBeGreaterThan(0);
    expect(r.drop).toEqual([[r.em, 1]]);
    expect(r.stone).toEqual([]);
  });
});
