// Законы «Кубического мира», четвёртый заход: 16-битные id блоков, плиты, ступени, заборы, калитки,
// люки, стеклянные панели, лестницы, течение воды.
const { test, expect } = require('@playwright/test');
const { openVoxel, newWorld, flatArena } = require('./_voxel-helpers');

test.describe.configure({ timeout: 90000 });

async function world(page, mode = 'survival') {
  await openVoxel(page);
  await newWorld(page, { seed: 8, mode });
  await page.evaluate(() => { __voxel.game.autoSpawn = false; __voxel.entities.clear(); __voxel.game.ticks = 4000; });
  await flatArena(page, 70, 7);
  // прицел на точку мира от глаз героя
  await page.evaluate(() => {
    window.aim = (x, y, z) => {
      const v = __voxel, p = v.player, dx = x - p.pos.x, dy = y - p.eye(), dz = z - p.pos.z;
      v.look(Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz)));
    };
    window.hold = (id, n) => { const v = __voxel; v.inv.slots[0] = { id, count: n || 16, dmg: 0 }; v.select(0); };
    window.base = () => { const p = __voxel.player; return { x0: Math.floor(p.pos.x), z0: Math.floor(p.pos.z) }; };
  });
}

test.describe('minecraft_clone_3d_1: строительные блоки', () => {
  test('id блоков 16-битные: старые куски (байтовые) читаются, блоки с id от 1024 переживают сохранение и перезапуск мира', async ({ page }) => {
    await world(page, 'creative');
    const r = await page.evaluate(async () => {
      const v = __voxel, C = v.core;
      const old = C.rleDecode(new Uint8Array([255, 3, 255, 3, 10, 9]));
      const d = new Uint16Array(C.CVOL); d[5] = C.SLAB; d[6] = C.LADDER + 3; d[C.CVOL - 1] = C.STAIRS + 13; d[7] = 3;
      const back = C.rleDecode(C.rleEncode(d));
      const { x0, z0 } = base();
      v.setBlock(x0 + 2, 70, z0, C.STAIRS + 13); v.setBlock(x0 + 3, 70, z0, C.GATE + 5);
      const id = v.meta.id;
      await v.flush(); await v.exitToTitle(); await v.openWorld(id);
      return {
        old: [old[0], old[509], old[510], old[519], old[520]], same: back.every((x, i) => x === d[i]), blockIds: [C.isBlock(C.SLAB), C.isBlock(300), C.isBlock(700), C.isBlock(3)],
        after: [v.getBlock(x0 + 2, 70, z0), v.getBlock(x0 + 3, 70, z0)], want: [C.STAIRS + 13, C.GATE + 5],
        itemsBelow1024: v.data.ITEMS.every((it) => it.id >= 256 && it.id < 1024),
      };
    });
    expect(r.old).toEqual([3, 3, 9, 9, 0]);
    expect(r.same).toBe(true);
    expect(r.blockIds).toEqual([true, false, false, true]);
    expect(r.after).toEqual(r.want);
    expect(r.itemsBelow1024).toBe(true);
  });

  test('плита: на пол - нижняя, на плиту того же камня - двойная (ломается в две плиты), в верх боковой грани - верхняя; на плиту входишь без прыжка', async ({ page }) => {
    await world(page);
    const r = await page.evaluate(() => {
      const v = __voxel, C = v.core, B = C.B, I = v.data.I, p = v.player;
      const { x0, z0 } = base(), slab = C.SLAB + 4 * 3;       // каменная
      hold(slab);
      aim(x0 + 0.5, 70, z0 - 1.5); v.place();
      const a = v.getBlock(x0, 70, z0 - 2);
      aim(x0 + 0.5, 70.5, z0 - 1.5); v.place();
      const dbl = v.getBlock(x0, 70, z0 - 2);
      v.inv.slots[1] = { id: I.stone_pickaxe, count: 1, dmg: 0 }; v.select(1);
      v.game.breakAt(x0, 70, z0 - 2, true);
      v.step(0.05, 2);
      const drops = v.entities.items.filter((it) => it.stack.id === slab).reduce((s, it) => s + it.stack.count, 0);
      v.entities.clear();
      // верхняя: в верхнюю половину боковой грани стены
      v.setBlock(x0, 70, z0 - 3, B.stone); v.setBlock(x0, 71, z0 - 3, B.stone);
      hold(slab); aim(x0 + 0.5, 70.8, z0 - 2); v.place();
      const top = v.getBlock(x0, 70, z0 - 2);
      // ступенька в полблока: идём вперёд без прыжка
      v.setBlock(x0, 70, z0 - 2, 0); v.setBlock(x0, 70, z0 - 3, 0); v.setBlock(x0, 71, z0 - 3, 0);
      for (let k = 1; k <= 5; k++) v.setBlock(x0, 70, z0 - k, slab);
      v.look(0, 0); v.key('KeyW'); v.step(0.05, 10); v.key('KeyW', false); v.step(0.05, 10);
      return { a, dbl, drops, top, want: [slab, slab + 2, slab + 1], y: p.pos.y, z: p.pos.z - z0 };
    });
    expect([r.a, r.dbl, r.top]).toEqual(r.want);
    expect(r.drops).toBe(2);
    expect(r.y).toBeCloseTo(70.5, 3);
    expect(r.z).toBeLessThan(-0.5);
  });

  test('ступени: поворот по взгляду, снизу потолка - перевёрнутые; по лестнице из ступеней поднимаешься без прыжка', async ({ page }) => {
    await world(page);
    const r = await page.evaluate(() => {
      const v = __voxel, C = v.core, B = C.B, p = v.player;
      const { x0, z0 } = base(), st = C.STAIRS;      // дубовые
      hold(st);
      aim(x0 + 0.5, 70, z0 - 1.5); v.place();
      const north = v.getBlock(x0, 70, z0 - 2);
      v.setBlock(x0, 70, z0 - 2, 0);
      aim(x0 - 1.5, 70, z0 + 0.5); v.place();              // смотрим на -X
      const west = v.getBlock(x0 - 2, 70, z0);
      v.setBlock(x0 - 2, 70, z0, 0);
      v.setBlock(x0, 72, z0 - 1, B.stone);
      hold(st); aim(x0 + 0.5, 72, z0 - 0.6); v.place();
      const upside = v.getBlock(x0, 71, z0 - 1);
      v.setBlock(x0, 72, z0 - 1, 0); v.setBlock(x0, 71, z0 - 1, 0);
      // две ступени и площадка
      v.setBlock(x0, 70, z0 - 1, st); v.setBlock(x0, 70, z0 - 2, B.stone); v.setBlock(x0, 71, z0 - 2, st);
      v.setBlock(x0, 70, z0 - 3, B.stone); v.setBlock(x0, 71, z0 - 3, B.stone);
      v.setBlock(x0, 72, z0 - 4, B.stone); v.setBlock(x0, 73, z0 - 4, B.stone);      // стена в конце
      v.look(0, 0); v.key('KeyW'); v.step(0.05, 40); v.key('KeyW', false); v.step(0.05, 10);
      return { north, west, upside, want: [st, st + 1 * 2, st + 1], y: p.pos.y, z: p.pos.z - z0 };
    });
    expect([r.north, r.west, r.upside]).toEqual(r.want);
    expect(r.y).toBeCloseTo(72, 3);
    expect(r.z).toBeLessThan(-2.2);
  });

  test('забор цепляется к соседям, выше 1.5 - не перепрыгнуть; калитка закрыта - стена, ПКМ - открыта от игрока и проходима', async ({ page }) => {
    await world(page);
    const r = await page.evaluate(() => {
      const v = __voxel, C = v.core, B = C.B, p = v.player;
      const { x0, z0 } = base(), F = C.FENCE;
      for (let x = x0 - 3; x <= x0 + 3; x++) v.setBlock(x, 70, z0 - 2, F);
      v.setBlock(x0 + 5, 70, z0 - 2, F);
      const nb = (x, y, z) => (dx, dy, dz) => v.getBlock(x + dx, y + dy, z + dz);
      const mid = C.shapeOf(F, nb(x0, 70, z0 - 2), 'render').length, lone = C.shapeOf(F, nb(x0 + 5, 70, z0 - 2), 'render').length;
      const coll = C.shapeOf(F, nb(x0, 70, z0 - 2), 'collide');
      // прыгаем на забор 2 секунды
      v.look(0, 0); v.key('KeyW'); v.key('Space');
      let maxY = 0; for (let i = 0; i < 40; i++) { v.step(0.05); maxY = Math.max(maxY, p.pos.y); }
      v.key('Space', false); v.key('KeyW', false); v.step(0.05, 20);
      const blockedZ = p.pos.z - z0, landY = p.pos.y;
      // калитка в середине
      p.pos.set(x0 + 0.5, 70, z0 + 0.5); p.vel.set(0, 0, 0);
      v.setBlock(x0, 70, z0 - 2, 0);
      hold(C.GATE); aim(x0 + 0.5, 70, z0 - 1.5); v.place();
      const gate = v.getBlock(x0, 70, z0 - 2);
      v.look(0, 0); v.key('KeyW'); v.step(0.05, 20); v.key('KeyW', false);
      const closedZ = p.pos.z - z0;
      aim(x0 + 0.5, 70.5, z0 - 1.5); v.place();
      const opened = v.getBlock(x0, 70, z0 - 2);
      const leaf = C.SHAPE[opened].slice(2).map((q) => q[5]);
      v.look(0, 0); v.key('KeyW'); v.step(0.05, 30); v.key('KeyW', false);
      return { mid, lone, collTop: Math.max(...coll.map((q) => q[4])), maxY, blockedZ, landY, gate, closedZ, opened, leafMaxZ: Math.max(...leaf), passedZ: p.pos.z - z0, want: [C.GATE, C.GATE + 1] };
    });
    expect(r.mid).toBe(5);          // столб и по две жерди в обе стороны
    expect(r.lone).toBe(1);
    expect(r.collTop).toBe(24);
    expect(r.maxY).toBeLessThan(71.5);            // прыжок (шаг 0.05 с) не выше верха забора
    expect(r.blockedZ).toBeGreaterThan(-1.2);
    expect(r.landY).toBeCloseTo(70, 3);
    expect([r.gate, r.opened]).toEqual(r.want);
    expect(r.closedZ).toBeGreaterThan(-1.2);
    expect(r.leafMaxZ).toBeLessThanOrEqual(8);     // створки ушли от игрока (он с +Z)
    expect(r.passedZ).toBeLessThan(-2.5);
  });

  test('люк: ставится петлёй к опоре, закрытый держит, открытый - проход вниз; железный рукой не открыть', async ({ page }) => {
    await world(page);
    const r = await page.evaluate(() => {
      const v = __voxel, C = v.core, B = C.B, p = v.player;
      const { x0, z0 } = base();
      v.setBlock(x0, 70, z0 - 2, B.stone);
      hold(C.TRAPDOOR); aim(x0 + 0.5, 70.8, z0 - 1); v.place();
      const placed = v.getBlock(x0, 70, z0 - 1);
      v.setBlock(x0, 70, z0 - 1, 0); v.setBlock(x0, 70, z0 - 2, 0);
      // люк в полу перед героем, под ним яма
      v.setBlock(x0, 69, z0 - 1, C.TRAPDOOR + 1); v.setBlock(x0, 68, z0 - 1, 0); v.setBlock(x0, 67, z0 - 1, 0); v.setBlock(x0, 66, z0 - 1, B.stone);
      v.look(0, 0); v.key('KeyW'); v.step(0.05, 6); v.key('KeyW', false); v.step(0.05, 10);
      const onTop = { y: p.pos.y, z: p.pos.z - z0 };
      p.pos.set(x0 + 0.5, 70, z0 + 0.5); p.vel.set(0, 0, 0); v.step(0.05, 2);
      aim(x0 + 0.5, 69.9, z0 - 0.5); const open = v.place();
      const openId = v.getBlock(x0, 69, z0 - 1);
      p.pos.set(x0 + 0.5, 70, z0 - 0.5); p.vel.set(0, 0, 0); v.step(0.05, 30);
      const fellY = p.pos.y;
      v.setBlock(x0 + 2, 69, z0, C.IRON_TRAPDOOR + 1);
      p.pos.set(x0 + 0.5, 70, z0 + 0.5); v.step(0.05, 2);
      aim(x0 + 2.5, 69.95, z0 + 0.5); v.place();
      return { placed, want: C.TRAPDOOR + 1, onTop, open, openId, wantOpen: C.TRAPDOOR + 3, fellY, iron: v.getBlock(x0 + 2, 69, z0), wantIron: C.IRON_TRAPDOOR + 1 };
    });
    expect(r.placed).toBe(r.want);                 // петля к стене на -Z, в верхней половине
    expect(r.onTop.y).toBeGreaterThan(69.9);
    expect(r.open).toBe('trapdoor');
    expect(r.openId).toBe(r.wantOpen);
    expect(r.fellY).toBeLessThan(68);
    expect(r.iron).toBe(r.wantIron);
  });

  test('стеклянная панель цепляется к стеклу и блокам, одиночная - крестом; сквозь соединённую не пройти', async ({ page }) => {
    await world(page);
    const r = await page.evaluate(() => {
      const v = __voxel, C = v.core, B = C.B, p = v.player;
      const { x0, z0 } = base();
      for (let x = x0 - 3; x <= x0 + 3; x++) v.setBlock(x, 70, z0 - 2, C.PANE);
      v.setBlock(x0 - 4, 70, z0 - 2, B.glass); v.setBlock(x0 + 4, 70, z0 - 2, B.stone);
      v.setBlock(x0 + 6, 70, z0 - 2, C.PANE);
      const nb = (x, y, z) => (dx, dy, dz) => v.getBlock(x + dx, y + dy, z + dz);
      const edge = C.shapeOf(C.PANE, nb(x0 - 3, 70, z0 - 2), 'render');
      const lone = C.shapeOf(C.PANE, nb(x0 + 6, 70, z0 - 2), 'render');
      v.look(0, 0); v.key('KeyW'); v.step(0.05, 30); v.key('KeyW', false);
      return { edge: edge.length, lone: lone.map((q) => [q[3] - q[0], q[5] - q[2]]), z: p.pos.z - z0 };
    });
    expect(r.edge).toBe(3);                               // стойка и крылья к стеклу и к соседней панели
    expect(r.lone).toEqual([[2, 16], [16, 2]]);
    expect(r.z).toBeGreaterThan(-1.3);
  });

  test('лестница: только на стену; упором вверх - лезешь, крадучись - висишь, спуск без урона от падения', async ({ page }) => {
    await world(page);
    const r = await page.evaluate(() => {
      const v = __voxel, C = v.core, B = C.B, p = v.player;
      const { x0, z0 } = base();
      for (let y = 70; y < 77; y++) v.setBlock(x0, y, z0 - 1, B.stone);
      hold(C.LADDER);
      aim(x0 + 1.5, 70, z0 + 0.5);
      const onFloor = v.place();
      aim(x0 + 0.5, 70.5, z0 - 0.02); v.place();
      const placed = v.getBlock(x0, 70, z0);
      for (let y = 71; y < 76; y++) v.setBlock(x0, y, z0, C.LADDER);
      v.look(0, 0); v.key('KeyW'); v.step(0.05, 40);
      const climbed = p.pos.y;
      v.key('KeyW', false); v.key('ShiftLeft'); v.step(0.05, 5); const h0 = p.pos.y; v.step(0.05, 20); const h1 = p.pos.y;
      v.key('ShiftLeft', false);
      const hp0 = p.health;
      v.step(0.05, 80);
      return { onFloor, placed, want: C.LADDER, climbed, hold: Math.abs(h1 - h0), end: p.pos.y, hp: p.health - hp0 };
    });
    expect(r.onFloor).toBe(null);
    expect(r.placed).toBe(r.want);                 // стена с -Z
    expect(r.climbed).toBeGreaterThan(72);
    expect(r.hold).toBeLessThan(0.05);
    expect(r.end).toBeCloseTo(70, 3);
    expect(r.hp).toBe(0);
  });

  test('течение воды сносит героя и предметы по ходу воды', async ({ page }) => {
    await world(page);
    const r = await page.evaluate(() => {
      const v = __voxel, C = v.core, B = C.B, p = v.player;
      const { x0, z0 } = base();
      for (let x = x0 - 5; x <= x0 + 6; x++) { v.setBlock(x, 70, z0 - 1, B.stone); v.setBlock(x, 70, z0 + 1, B.stone); v.setBlock(x, 71, z0 - 1, B.stone); v.setBlock(x, 71, z0 + 1, B.stone); }
      v.setBlock(x0 - 5, 70, z0, B.stone);
      v.setBlock(x0 - 4, 70, z0, B.water); v.VX.fluids.touch(x0 - 4, 70, z0);
      p.pos.set(x0 + 5.5, 72, z0 + 0.5);
      v.step(0.05, 80);
      const lev = v.getBlock(x0 - 1, 70, z0);
      p.pos.set(x0 - 0.5, 70, z0 + 0.5); p.vel.set(0, 0, 0);
      const x1 = p.pos.x;
      v.step(0.05, 40);
      const moved = p.pos.x - x1;
      v.game.dropItem(v.VX.inv.newStack(B.dirt, 1), false, x0 - 1.5, 70.3, z0 + 0.5);
      const it = v.entities.items[v.entities.items.length - 1]; it.delay = 99;
      p.pos.set(x0 + 5.5, 72, z0 + 0.5);
      const ix = it.x; v.step(0.05, 40);
      return { flowing: C.FLUID[lev] === 1 && C.FLEVEL[lev] > 0, moved, itemMoved: it.x - ix };
    });
    expect(r.flowing).toBe(true);
    expect(r.moved).toBeGreaterThan(1);
    expect(r.itemMoved).toBeGreaterThan(1);
  });

  test('луч проходит над нижней плитой к блоку за ней; рамка выбора - по форме плиты; значок плиты - половина кубика', async ({ page }) => {
    await world(page, 'creative');
    const r = await page.evaluate(async () => {
      const v = __voxel, C = v.core, B = C.B;
      const { x0, z0 } = base();
      const slab = C.SLAB + 4 * 3;
      v.setBlock(x0, 70, z0 - 2, slab); v.setBlock(x0, 70, z0 - 3, B.stone);
      aim(x0 + 0.5, 70.6, z0 - 2.5);
      const t = v.target();
      aim(x0 + 0.5, 70.3, z0 - 1.5);
      const t2 = v.target();
      await new Promise((res) => setTimeout(res, 150));
      const sel = v.game.selBounds;
      const alphaAt = (url, x, y) => new Promise((res) => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.drawImage(im, 0, 0); res(g.getImageData(x, y, 1, 1).data[3]); }; im.src = url; });
      return { t: [t.id, t.z - z0], t2: [t2.id, t2.n[1]], sel: sel && sel.hi[1], cube: await alphaAt(v.game.icon(B.stone), 32, 8), half: await alphaAt(v.game.icon(slab), 32, 8), halfLow: await alphaAt(v.game.icon(slab), 32, 40), stone: B.stone, slab };
    });
    expect(r.t).toEqual([r.stone, -3]);
    expect(r.t2).toEqual([r.slab, 1]);
    expect(r.sel).toBe(8);
    expect(r.cube).toBeGreaterThan(200);
    expect(r.half).toBe(0);
    expect(r.halfLow).toBeGreaterThan(200);
  });
});
