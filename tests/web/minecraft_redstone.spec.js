// Законы «Кубического мира», четвёртый заход: красный камень по правилам оригинала - сила 15 и затухание
// по пыли, факел-инвертор с задержкой, повторитель (задержка 1-4 такта, восстанавливает 15), кнопки,
// плиты, лампа, двери и люки от сигнала, поршни (обычный и липкий), сильное и слабое питание блоков,
// руда, рецепты, слизни.
const { test, expect } = require('@playwright/test');
const { openVoxel, newWorld, flatArena } = require('./_voxel-helpers');

test.describe.configure({ timeout: 90000 });

async function world(page, mode = 'creative') {
  await openVoxel(page);
  await newWorld(page, { seed: 8, mode });
  await page.evaluate(() => { __voxel.game.autoSpawn = false; __voxel.entities.clear(); __voxel.game.ticks = 4000; });
  await flatArena(page, 70, 9);
  await page.evaluate(() => {
    window.aim = (x, y, z) => { const v = __voxel, p = v.player, dx = x - p.pos.x, dy = y - p.eye(), dz = z - p.pos.z; v.look(Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz))); };
    window.hold = (id, n) => { const v = __voxel; v.inv.slots[0] = { id, count: n || 16, dmg: 0 }; v.select(0); };
    window.base = () => { const p = __voxel.player; return { x0: Math.floor(p.pos.x), z0: Math.floor(p.pos.z) }; };
    window.put = (x, y, z, id) => { const v = __voxel; v.setBlock(x, y, z, id); v.VX.redstone.update(x, y, z); };
    window.lever = (x, y, z) => __voxel.game.toggleLever(x, y, z);
  });
}

test.describe('minecraft_clone_3d_1: красный камень', () => {
  test('пыль: от рычага сила 15 и минус 1 на клетку; лампа на 15-й клетке горит, на 16-й - нет; рычаг выключен - всё гаснет', async ({ page }) => {
    await world(page);
    const r = await page.evaluate(() => {
      const v = __voxel, C = v.core;
      const { x0, z0 } = base(), z = z0 - 3;
      v.setBlock(x0 - 8, 70, z, 130);
      for (let i = 0; i < 15; i++) v.setBlock(x0 - 7 + i, 70, z, C.WIRE);
      v.setBlock(x0 + 8, 70, z, C.LAMP);                  // за 15-й клеткой пыли (сила 1)
      v.setBlock(x0 - 8, 70, z - 2, 130);
      for (let i = 0; i < 16; i++) v.setBlock(x0 - 7 + i, 70, z - 2, C.WIRE);
      v.setBlock(x0 + 9, 70, z - 2, C.LAMP);              // за 16-й (сила 0)
      lever(x0 - 8, 70, z); lever(x0 - 8, 70, z - 2);
      const pw = []; for (let i = 0; i < 15; i++) pw.push(v.getBlock(x0 - 7 + i, 70, z) - C.WIRE);
      const lamp15 = v.getBlock(x0 + 8, 70, z) === C.LAMP + 1, lamp16 = v.getBlock(x0 + 9, 70, z - 2) === C.LAMP + 1, last16 = v.getBlock(x0 + 8, 70, z - 2) - C.WIRE;
      lever(x0 - 8, 70, z);
      const off = []; for (let i = 0; i < 15; i++) off.push(v.getBlock(x0 - 7 + i, 70, z) - C.WIRE);
      return { pw, lamp15, lamp16, last16, off, lampOff: v.getBlock(x0 + 8, 70, z) === C.LAMP };
    });
    expect(r.pw).toEqual([15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    expect(r.lamp15).toBe(true);
    expect(r.last16).toBe(0);
    expect(r.lamp16).toBe(false);
    expect(r.off).toEqual(new Array(15).fill(0));
    expect(r.lampOff).toBe(true);
  });

  test('пыль тянется к соседям и на ступень вверх; одиночная - точкой; ставится только на твёрдый блок', async ({ page }) => {
    await world(page);
    const r = await page.evaluate(() => {
      const v = __voxel, C = v.core, B = C.B;
      const { x0, z0 } = base(), z = z0 - 3;
      const nb = (x, y, zz) => (dx, dy, dz) => v.getBlock(x + dx, y + dy, zz + dz);
      v.setBlock(x0 - 4, 70, z, C.WIRE);
      const dot = C.shapeOf(C.WIRE, nb(x0 - 4, 70, z), 'render').length;
      v.setBlock(x0, 70, z, C.WIRE); v.setBlock(x0 + 1, 70, z, B.stone); v.setBlock(x0 + 1, 71, z, C.WIRE); v.setBlock(x0 - 1, 70, z, 130);
      lever(x0 - 1, 70, z);
      const L = C.wireLinks(nb(x0, 70, z));
      const up = v.getBlock(x0 + 1, 71, z) - C.WIRE;
      hold(C.WIRE);
      v.setBlock(x0 - 2, 70, z0 - 1, B.stone);
      aim(x0 - 1.5, 71, z0 - 0.5); const onTop = v.place();
      const placed = v.getBlock(x0 - 2, 71, z0 - 1);
      // на нижнюю плиту пыль не ставится (нужен полный блок)
      v.setBlock(x0 + 2, 70, z0 - 1, C.SLAB + 4 * 3);
      aim(x0 + 2.5, 70.5, z0 - 0.5); const onSlab = v.place();
      return { dot, links: L.links, climb: L.climb, up, onTop: !!onTop, placed: placed === C.WIRE, onSlab, slabTop: v.getBlock(x0 + 2, 71, z0 - 1) };
    });
    expect(r.dot).toBe(1);
    expect(r.links[1]).toBe(1);          // к ступеньке (+X)
    expect(r.climb[1]).toBe(1);
    expect(r.up).toBe(14);
    expect(r.onTop).toBe(true);
    expect(r.placed).toBe(true);
    expect(r.onSlab).toBe(null);
    expect(r.slabTop).toBe(0);
  });

  test('красный факел: гаснет через такт, если запитан его блок; инвертор включает лампу, когда рычаг выключен', async ({ page }) => {
    await world(page);
    const r = await page.evaluate(() => {
      const v = __voxel, C = v.core, B = C.B;
      const { x0, z0 } = base(), z = z0 - 3;
      v.setBlock(x0, 70, z, B.stone);
      v.setBlock(x0 - 1, 70, z, 130);                   // рычаг у блока (на полу рядом) - через пыль
      v.setBlock(x0 - 1, 70, z, C.WIRE); v.setBlock(x0 - 2, 70, z, 130);
      put(x0 + 1, 70, z, C.RS_TORCH + 1 + 3);           // факел на стене блока (стена с -X)
      put(x0 + 2, 70, z, C.LAMP);
      v.step(0.05, 4);
      const lampLit0 = v.getBlock(x0 + 2, 70, z) === C.LAMP + 1;
      lever(x0 - 2, 70, z);
      const torchNow = v.getBlock(x0 + 1, 70, z);
      v.step(0.05, 1); const at1 = v.getBlock(x0 + 1, 70, z);
      v.step(0.05, 3);
      return { lampLit0, torchNowLit: torchNow === C.RS_TORCH + 4, torchLater: v.getBlock(x0 + 1, 70, z), off: C.RS_TORCH_OFF + 4, lampAfter: v.getBlock(x0 + 2, 70, z) === C.LAMP + 1 };
    });
    expect(r.lampLit0).toBe(true);
    expect(r.torchNowLit).toBe(true);           // не мгновенно
    expect(r.torchLater).toBe(r.off);
    expect(r.lampAfter).toBe(false);
  });

  test('повторитель: задержка 1-4 такта (ПКМ меняет), сигнал на выходе снова 15; ставится выходом туда, куда смотришь', async ({ page }) => {
    await world(page);
    const r = await page.evaluate(() => {
      const v = __voxel, C = v.core, B = C.B, p = v.player;
      const { x0, z0 } = base();
      hold(C.REPEATER); v.look(0, -1.2); aim(x0 + 0.5, 70, z0 - 1.5); v.place();
      const placed = v.getBlock(x0, 70, z0 - 2);
      const b = C.BLOCKS[placed];
      const faced = { repeater: !!b.repeater, dir: b.dir, delay: b.delay };
      aim(x0 + 0.5, 70.1, z0 - 1.5); v.place(); v.place(); v.place();
      const d4 = C.BLOCKS[v.getBlock(x0, 70, z0 - 2)].delay;
      v.setBlock(x0, 70, z0 - 2, 0);
      // линия: рычаг, 14 пыли (сила падает до 2), повторитель (к +X), пыль за ним
      const z = z0 - 4;
      v.setBlock(x0 - 8, 70, z, 130);
      for (let i = 0; i < 14; i++) v.setBlock(x0 - 7 + i, 70, z, C.WIRE);
      v.setBlock(x0 + 7, 70, z, C.REPEATER + 3 * 8 + 2 * 2);     // к +X, задержка 3
      v.setBlock(x0 + 8, 70, z, C.WIRE); v.setBlock(x0 + 9, 70, z, C.WIRE);
      lever(x0 - 8, 70, z);
      const beforeLine = v.getBlock(x0 + 6, 70, z) - C.WIRE;
      const times = []; for (let s = 1; s <= 6; s++) { v.step(0.05, 2); times.push(v.getBlock(x0 + 8, 70, z) - C.WIRE); }
      return { faced, d4, beforeLine, times };
    });
    expect(r.faced).toEqual({ repeater: true, dir: 0, delay: 1 });
    expect(r.d4).toBe(4);
    expect(r.beforeLine).toBe(2);
    expect(r.times).toEqual([0, 0, 15, 15, 15, 15]);       // 3 такта = 0.3 с
  });

  test('кнопка: каменная держит 1 с, деревянная 1.5 с; нажимная плита - пока на ней стоят (дверь открыта), деревянная - и от предмета', async ({ page }) => {
    await world(page, 'survival');
    const r = await page.evaluate(() => {
      const v = __voxel, C = v.core, B = C.B, p = v.player, I = v.data.I;
      const { x0, z0 } = base();
      v.setBlock(x0, 70, z0 - 3, B.stone); v.setBlock(x0, 71, z0 - 3, C.LAMP); v.setBlock(x0 + 3, 70, z0 - 3, B.stone); v.setBlock(x0 + 3, 71, z0 - 3, C.LAMP);
      v.setBlock(x0, 70, z0 - 2, C.BUTTON + 0 * 2); v.setBlock(x0 + 3, 70, z0 - 2, C.WOOD_BUTTON);
      aim(x0 + 0.5, 70.5, z0 - 1.95); const pr = v.place();
      aim(x0 + 3.5, 70.5, z0 - 1.95); v.place();
      const lamps = () => [v.getBlock(x0, 71, z0 - 3) === C.LAMP + 1, v.getBlock(x0 + 3, 71, z0 - 3) === C.LAMP + 1];
      const t0 = lamps(); v.step(0.05, 22); const t1 = lamps(); v.step(0.05, 10); const t2 = lamps();
      // плита у железной двери
      const dx = x0 - 4, dz = z0 - 2;
      v.setBlock(dx, 70, dz - 1, C.DOOR_IRON); v.setBlock(dx, 71, dz - 1, C.DOOR_IRON + 1);
      v.setBlock(dx, 70, dz, C.RS_PLATE);
      p.pos.set(dx + 0.5, 70, dz + 2.5); v.step(0.05, 3);
      const before = v.game.doorOpen(dx, 70, dz - 1);
      p.pos.set(dx + 0.5, 70, dz + 0.5); v.step(0.05, 3);
      const on = v.game.doorOpen(dx, 70, dz - 1);
      p.pos.set(dx + 0.5, 70, dz + 2.5); v.step(0.05, 3);
      const off = v.game.doorOpen(dx, 70, dz - 1);
      // деревянная плита и предмет
      put(x0 + 5, 70, z0, C.RS_WOOD_PLATE); v.setBlock(x0 + 6, 70, z0, C.LAMP);
      v.game.dropItem(v.VX.inv.newStack(B.dirt, 1), false, x0 + 5.5, 70.5, z0 + 0.5);
      v.entities.items[v.entities.items.length - 1].delay = 99;
      v.step(0.05, 20);
      return { pr, t0, t1, t2, before, on, off, woodItem: v.getBlock(x0 + 6, 70, z0) === C.LAMP + 1 };
    });
    expect(r.pr).toBe('button');
    expect(r.t0).toEqual([true, true]);
    expect(r.t1).toEqual([false, true]);     // 1.1 с: каменная отпустилась
    expect(r.t2).toEqual([false, false]);    // 1.6 с: и деревянная
    expect([r.before, r.on, r.off]).toEqual([false, true, false]);
    expect(r.woodItem).toBe(true);
  });

  test('сильное и слабое питание: рычаг на блоке питает пыль рядом с блоком; пыль на блоке включает лампу рядом, но не пыль рядом', async ({ page }) => {
    await world(page);
    const r = await page.evaluate(() => {
      const v = __voxel, C = v.core, B = C.B;
      const { x0, z0 } = base(), z = z0 - 3;
      // рычаг на блоке A (сверху), пыль у A
      v.setBlock(x0, 70, z, B.stone); v.setBlock(x0, 71, z, 130); v.setBlock(x0 + 1, 70, z, C.WIRE); v.setBlock(x0 + 2, 70, z, C.WIRE);
      lever(x0, 71, z);
      const strongDust = v.getBlock(x0 + 1, 70, z) - C.WIRE;
      // пыль сверху на блоке S (слабо): лампа рядом горит, пыль рядом - нет
      const z2 = z - 3;
      v.setBlock(x0 - 3, 70, z2, 130); v.setBlock(x0 - 2, 70, z2, C.WIRE); v.setBlock(x0 - 1, 70, z2, B.stone);
      v.setBlock(x0 - 1, 71, z2, C.WIRE);           // на блоке, от пыли у его бока
      v.setBlock(x0, 70, z2, C.LAMP);
      v.setBlock(x0 - 1, 70, z2 - 1, C.WIRE); v.setBlock(x0 - 1, 71, z2 - 1, B.stone);   // над ней камень: сверху к ней не спуститься
      lever(x0 - 3, 70, z2);
      return { strongDust, top: v.getBlock(x0 - 1, 71, z2) - C.WIRE, lamp: v.getBlock(x0, 70, z2) === C.LAMP + 1, side: v.getBlock(x0 - 1, 70, z2 - 1) - C.WIRE };
    });
    expect(r.strongDust).toBe(15);
    expect(r.top).toBeGreaterThan(0);
    expect(r.lamp).toBe(true);
    expect(r.side).toBe(0);
  });

  test('поршень толкает до 12 блоков (13 - нет, обсидиан - нет), убирает головку; липкий тянет блок назад; сдвигает игрока; ломается целиком', async ({ page }) => {
    await world(page, 'survival');
    const r = await page.evaluate(() => {
      const v = __voxel, C = v.core, B = C.B, p = v.player, I = v.data.I;
      const { x0, z0 } = base(), z = z0 - 3;
      const P = (f, st) => C.PISTON + f * 4 + (st ? 1 : 0);
      // обычный поршень лицом к +X, три блока перед ним
      v.setBlock(x0 - 4, 70, z, P(1)); v.setBlock(x0 - 3, 70, z, B.dirt); v.setBlock(x0 - 2, 70, z, B.sand); v.setBlock(x0 - 1, 70, z, B.cobblestone);
      v.setBlock(x0 - 5, 70, z, 130);
      lever(x0 - 5, 70, z);
      const pushed = [v.getBlock(x0 - 3, 70, z), v.getBlock(x0 - 2, 70, z), v.getBlock(x0 - 1, 70, z), v.getBlock(x0, 70, z)];
      const head = C.BLOCKS[v.getBlock(x0 - 3, 70, z)].pistonHead;
      lever(x0 - 5, 70, z);
      const back = [v.getBlock(x0 - 4, 70, z), v.getBlock(x0 - 3, 70, z), v.getBlock(x0 - 2, 70, z)];
      // 13 блоков - не толкает
      const z2 = z - 2;
      v.setBlock(x0 - 8, 70, z2, P(1)); for (let i = 1; i <= 13; i++) v.setBlock(x0 - 8 + i, 70, z2, B.dirt); v.setBlock(x0 - 9, 70, z2, 130);
      lever(x0 - 9, 70, z2);
      const too = v.getBlock(x0 - 8, 70, z2) === P(1);
      // обсидиан
      const z3 = z - 4;
      v.setBlock(x0, 70, z3, P(1)); v.setBlock(x0 + 1, 70, z3, B.obsidian); v.setBlock(x0 - 1, 70, z3, 130);
      lever(x0 - 1, 70, z3);
      const obs = v.getBlock(x0, 70, z3) === P(1);
      // липкий: выдвинул и втянул - блок вернулся
      const z4 = z - 6;
      v.setBlock(x0, 70, z4, P(1, 1)); v.setBlock(x0 + 1, 70, z4, B.bricks); v.setBlock(x0 - 1, 70, z4, 130);
      lever(x0 - 1, 70, z4); const sOut = v.getBlock(x0 + 2, 70, z4);
      lever(x0 - 1, 70, z4); const sBack = v.getBlock(x0 + 1, 70, z4);
      // игрок перед поршнем
      p.pos.set(x0 + 0.5, 70, z0 + 0.5); p.vel.set(0, 0, 0);
      v.setBlock(x0 - 1, 70, z0, P(1)); v.setBlock(x0 - 2, 70, z0, 130);
      const px = p.pos.x; lever(x0 - 2, 70, z0);
      const shoved = p.pos.x - px;
      // сломать головку - уходит и основа, выпадает поршень
      v.entities.clear();
      v.game.breakAt(x0, 70, z0, true);
      v.step(0.05, 2);
      return { pushed, head: !!head, back, too, obs, sOut, sBack, shoved, broken: [v.getBlock(x0 - 1, 70, z0), v.getBlock(x0, 70, z0)], drops: v.entities.items.map((it) => it.stack.id), B, want: [0, B.dirt, B.sand, B.cobblestone], P1: P(1) };
    });
    expect(r.head).toBe(true);
    expect(r.pushed.slice(1)).toEqual([r.B.dirt, r.B.sand, r.B.cobblestone]);
    expect(r.back).toEqual([r.P1, 0, r.B.dirt]);
    expect(r.too).toBe(true);
    expect(r.obs).toBe(true);
    expect(r.sOut).toBe(r.B.bricks);
    expect(r.sBack).toBe(r.B.bricks);
    expect(r.shoved).toBeCloseTo(1, 3);
    expect(r.broken).toEqual([0, 0]);
    expect(r.drops).toEqual([r.P1 - 4]);
  });

  test('железная дверь и железный люк - от красного факела; руда даёт 4 пыли железной киркой и лежит глубже 16; рецепты; слизень делится, малые дают слизь', async ({ page }) => {
    await world(page, 'survival');
    const r = await page.evaluate(() => {
      const v = __voxel, C = v.core, B = C.B, I = v.data.I, D = v.data;
      const { x0, z0 } = base();
      v.setBlock(x0 + 3, 70, z0 - 3, C.DOOR_IRON); v.setBlock(x0 + 3, 71, z0 - 3, C.DOOR_IRON + 1);
      put(x0 + 4, 70, z0 - 3, C.RS_TORCH);
      const door = v.game.doorOpen(x0 + 3, 70, z0 - 3);
      v.setBlock(x0 - 3, 70, z0 - 3, C.IRON_TRAPDOOR); put(x0 - 4, 70, z0 - 3, C.RS_TORCH);
      const trap = C.BLOCKS[v.getBlock(x0 - 3, 70, z0 - 3)].open;
      // руда
      const drops = D.dropsOf(C.REDSTONE_ORE, I.iron_pickaxe, Math.random), stone = D.dropsOf(C.REDSTONE_ORE, I.stone_pickaxe, Math.random);
      const seed = C.seedFrom('8');
      let ore = 0, high = 0;
      for (let cx = 0; cx < 6; cx++) { const d = C.generate(seed, cx, 3); for (let i = 0; i < d.length; i++) if (d[i] === C.REDSTONE_ORE) { ore++; if ((i >> 8) > 20) high++; } }
      // рецепты
      const rec = (id) => D.RECIPES.find((q) => q.outId === id);
      const need = [C.RS_TORCH, C.REPEATER, C.BUTTON, C.WOOD_BUTTON, C.RS_PLATE, C.RS_WOOD_PLATE, C.LAMP, C.PISTON, C.PISTON + 1, C.REDSTONE_BLOCK].filter((id) => !rec(id));
      // слизень
      v.entities.clear();
      const s = v.spawnMob('slime', 0, -3);
      v.entities.hurtMob(s, 10, v.player.pos.x, v.player.pos.z, 'player');
      const kids = v.entities.mobs.filter((m) => m.type === 'slime' && m.deadT === 0);
      const bigDrops = v.entities.items.map((it) => it.stack.id);
      let balls = 0;
      for (let k = 0; k < 10; k++) { const t = v.spawnMob('slime', 0, -3); t.size = 1; t.w = t.h = 0.5; v.entities.hurtMob(t, 5, v.player.pos.x, v.player.pos.z, 'player'); }
      balls = v.entities.items.filter((it) => it.stack.id === I.slimeball).length;
      return { door, trap, drops, stone, wire: C.WIRE, ore, high, need, kids: kids.length, kidSize: kids.map((k) => k.size), bigDrops, balls };
    });
    expect(r.door).toBe(true);
    expect(r.trap).toBe(true);
    expect(r.drops).toEqual([[r.wire, 4]]);
    expect(r.stone).toEqual([]);
    expect(r.ore).toBeGreaterThan(10);
    expect(r.high).toBe(0);
    expect(r.need).toEqual([]);
    expect(r.kids).toBeGreaterThanOrEqual(2);
    expect(r.kidSize.every((s) => s === 1)).toBe(true);
    expect(r.bigDrops).toEqual([]);
    expect(r.balls).toBeGreaterThan(0);
  });
});
