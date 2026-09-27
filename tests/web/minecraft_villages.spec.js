// Законы «Кубического мира», четвёртый заход: деревни (генератор), жители с профессиями, торговля за
// изумруды (12 раз, утром запас), опыт за сделку, ночью - домой, сохранение.
const { test, expect } = require('@playwright/test');
const { openVoxel, newWorld } = require('./_voxel-helpers');

test.describe.configure({ timeout: 120000 });

// в деревню: ближайшая к началу координат равнинная деревня мира с зерном 8
async function toVillage(page, mode = 'survival') {
  await openVoxel(page);
  await newWorld(page, { seed: 8, mode });
  return page.evaluate(async () => {
    const v = __voxel, C = v.core, p = v.player, w = C.worldOf(v.world.seed);
    let vil = null;
    for (let r = 0; r < 6 && !vil; r++) for (let cz = -r; cz <= r && !vil; cz++) for (let cx = -r; cx <= r && !vil; cx++) { const q = C.villageAt(w, cx, cz); if (q && !q.desert) vil = q; }
    v.game.autoSpawn = false; v.entities.clear(); v.game.ticks = 4000;
    const g = v.game.mode; v.game.mode = 'creative'; p.flying = true;
    p.pos.set(vil.x + 0.5, vil.h + 3, vil.z + 3.5);
    await v.waitIdle(2);
    v.game.mode = g; p.flying = false;
    return { x: vil.x, z: vil.z, h: vil.h, id: vil.id, houses: vil.houses.map((hh) => ({ kind: hh.kind, x: hh.x, z: hh.z, y: hh.y, door: hh.door })) };
  });
}

test.describe('minecraft_clone_3d_1: деревни и жители', () => {
  test('генератор: деревни на равнинах и в пустынях, план одинаков; колодец, тропинки, дома с дверью и полками у библиотекаря, поля; деревьев в деревне нет', async ({ page }) => {
    await openVoxel(page);
    const r = await page.evaluate(() => {
      const C = __voxel.core, seed = C.seedFrom('8'), w = C.worldOf(seed);
      const list = [];
      for (let cz = -4; cz <= 4; cz++) for (let cx = -4; cx <= 4; cx++) { const v = C.villageAt(w, cx, cz); if (v) list.push(v); }
      const vil = list.find((v) => !v.desert);
      const w2 = C.worldOf(seed); w2.villages = new Map();
      const again = JSON.stringify(C.villageAt(w2, Math.floor(vil.x / C.VIL_CELL), Math.floor(vil.z / C.VIL_CELL)));
      const cache = new Map();
      const at = (x, y, z) => { const k = Math.floor(x / 16) + ',' + Math.floor(z / 16); if (!cache.has(k)) cache.set(k, C.generate(seed, Math.floor(x / 16), Math.floor(z / 16))); return cache.get(k)[C.cidx(((x % 16) + 16) % 16, y, ((z % 16) + 16) % 16)]; };
      const lib = vil.houses.find((h) => h.kind === 'librarian'), farm = vil.houses.find((h) => h.kind === 'farm');
      let shelves = 0, farmland = 0, wheat = 0, logs = 0;
      const doors = new Set();
      for (const h of vil.houses) for (let dx = -5; dx <= 5; dx++) for (let dz = -5; dz <= 5; dz++) for (let y = h.y - 1; y < h.y + 3; y++) {
        const id = at(h.x + dx, y, h.z + dz), b = C.BLOCKS[id];
        if (h === lib && id === C.B.bookshelf) shelves++;
        if (b && b.door && !b.upper) doors.add((h.x + dx) + ',' + y + ',' + (h.z + dz));
        if (h === farm && id === C.B.farmland) farmland++;
        if (h === farm && id >= 64 && id <= 71) wheat++;
      }
      for (let dx = -20; dx <= 20; dx++) for (let dz = -20; dz <= 20; dz++) for (let y = vil.h; y < vil.h + 12; y++) if (at(vil.x + dx, y, vil.z + dz) === C.B.oak_leaves) logs++;
      const well = at(vil.x - 1, vil.h, vil.z - 1) === C.B.water;
      const path = at(vil.x + 12, C.column(w, vil.x + 12, vil.z).h, vil.z) === C.PATH;
      return { n: list.length, deserts: list.filter((v) => v.desert).length, same: again === JSON.stringify(vil), kinds: vil.houses.map((h) => h.kind), shelves, doors: doors.size, farmland, wheat, leaves: logs, well, path };
    });
    expect(r.n).toBeGreaterThan(2);
    expect(r.same).toBe(true);
    for (const k of ['farmer', 'librarian', 'smith', 'cleric']) expect(r.kinds).toContain(k);
    expect(r.shelves).toBe(2);
    expect(r.doors).toBe(r.kinds.filter((k) => k !== 'farm').length);
    expect(r.farmland).toBeGreaterThan(20);
    expect(r.wheat).toBeGreaterThan(20);
    expect(r.leaves).toBe(0);
    expect(r.well).toBe(true);
    expect(r.path).toBe(true);
  });

  test('жители появляются, когда подходишь, по одному на дом, с профессиями; второй раз не появляются; хранятся в мире со сделками', async ({ page }) => {
    const vil = await toVillage(page);
    const r = await page.evaluate(async (vil) => {
      const v = __voxel, VL = v.VX.villages;
      VL.tick(3);
      const vs = () => v.entities.mobs.filter((m) => m.type === 'villager');
      const first = vs().map((m) => m.color).sort();
      VL.tick(3); VL.tick(3);
      const again = vs().length;
      const trades = vs()[0].trades.length;
      const id = v.meta.id;
      await v.flush(); await v.exitToTitle(); await v.openWorld(id);
      const after = vs();
      return { first, again, trades, after: after.length, afterTrades: after[0] && after[0].trades && after[0].trades.length, home: !!(after[0] && after[0].home), houses: vil.houses.filter((h) => h.kind !== 'farm').length, ach: !!v.ach.got };
    }, vil);
    expect(r.first.length).toBe(r.houses);
    for (const k of ['cleric', 'farmer', 'librarian', 'smith']) expect(r.first).toContain(k);
    expect(r.again).toBe(r.houses);
    expect(r.trades).toBeGreaterThan(3);
    expect(r.after).toBe(r.houses);
    expect(r.afterTrades).toBe(r.trades);
    expect(r.home).toBe(true);
  });

  test('торговля: ПКМ по жителю - окно сделок; изумруды за вещь; без оплаты нельзя; 12 раз, утром снова; опыт и достижение', async ({ page }) => {
    await toVillage(page);
    const r = await page.evaluate(() => {
      const v = __voxel, I = v.data.I, B = v.core.B, VL = v.VX.villages, p = v.player;
      VL.tick(3);
      const lib = v.entities.mobs.find((m) => m.color === 'librarian');
      // житель прямо перед героем
      lib.x = p.pos.x; lib.z = p.pos.z - 1.5; lib.y = p.pos.y; lib.wander = 99; lib.walking = false;
      v.look(0, -0.2);
      v.inv.clear(); v.select(3);
      const opened = v.place();
      const kind = v.container && v.container.kind;
      const rows = document.querySelectorAll('.trades .tr-row').length;
      const shelf = lib.trades.findIndex((t) => t.out[0] === B.bookshelf);
      const noMoney = VL.trade(lib, shelf);
      v.inv.slots[5] = { id: I.emerald, count: 64, dmg: 0 };
      v.inv.slots[6] = { id: I.emerald, count: 64, dmg: 0 };
      const xp0 = p.xpTotal;
      const ok = VL.trade(lib, shelf);
      const got = v.inv.count(B.bookshelf), left = v.inv.count(I.emerald);
      let n = 1; while (VL.trade(lib, shelf)) n++;
      const usedUp = lib.trades[shelf].uses;
      v.game.ticks = Math.ceil(v.game.ticks / 24000) * 24000 + 100; VL.tick(0.1);
      const restocked = lib.trades[shelf].uses;
      // покупка: бумага -> изумруд
      const paper = lib.trades.findIndex((t) => t.cost[0][0] === I.paper);
      v.inv.slots[7] = { id: I.paper, count: 30, dmg: 0 };
      const em0 = v.inv.count(I.emerald); VL.trade(lib, paper);
      return { opened, kind, rows, noMoney, ok, got, left, n, usedUp, restocked, xp: p.xpTotal - xp0, paperLeft: v.inv.count(I.paper), emGain: v.inv.count(I.emerald) - em0, ach: !!v.ach.got.trade };
    });
    expect(r.opened).toBe('mob');
    expect(r.kind).toBe('trade');
    expect(r.rows).toBeGreaterThan(3);
    expect(r.noMoney).toBe(false);
    expect(r.ok).toBe(true);
    expect(r.got).toBe(1);
    expect(r.left).toBe(128 - 9);
    expect(r.n).toBe(12);
    expect(r.usedUp).toBe(12);
    expect(r.restocked).toBe(0);
    expect(r.xp).toBeGreaterThanOrEqual(36);
    expect(r.paperLeft).toBe(6);
    expect(r.emGain).toBe(1);
    expect(r.ach).toBe(true);
  });

  test('ночью житель идёт домой', async ({ page }) => {
    await toVillage(page, 'creative');
    const r = await page.evaluate(() => {
      const v = __voxel, VL = v.VX.villages;
      VL.tick(3);
      const m = v.entities.mobs.find((q) => q.type === 'villager');
      m.x = m.home.x + 9; m.z = m.home.z + 3; m.y = m.home.y + 1;
      v.game.ticks = 18000;
      const d0 = Math.hypot(m.x - m.home.x, m.z - m.home.z);
      for (let i = 0; i < 200; i++) v.step(0.05);
      return { d0, d1: Math.hypot(m.x - m.home.x, m.z - m.home.z) };
    });
    expect(r.d1).toBeLessThan(r.d0 - 4);
  });
});
