// Законы «Кубического мира», четвёртый заход: рельсы (сами соединяются: прямые, повороты, подъёмы),
// вагонетка (катится по пути, трение, горки, тупик), энергорельсы (разгон, тормоз, сигнал по цепочке),
// езда в вагонетке и лодке (посадка, управление, выход, достижения), сохранение, без утечек.
const { test, expect } = require('@playwright/test');
const { openVoxel, newWorld, flatArena } = require('./_voxel-helpers');

test.describe.configure({ timeout: 120000 });

async function world(page, mode = 'survival') {
  await openVoxel(page);
  await newWorld(page, { seed: 8, mode });
  await page.evaluate(() => { __voxel.game.autoSpawn = false; __voxel.entities.clear(); __voxel.game.ticks = 4000; });
  await flatArena(page, 70, 8);
  await page.evaluate(() => {
    window.aim = (x, y, z) => { const v = __voxel, p = v.player, dx = x - p.pos.x, dy = y - p.eye(), dz = z - p.pos.z; v.look(Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz))); };
    window.hold = (id, n) => { const v = __voxel; v.inv.slots[0] = id ? { id, count: n || 1, dmg: 0 } : null; v.select(0); };
    window.base = () => { const p = __voxel.player; return { x0: Math.floor(p.pos.x), z0: Math.floor(p.pos.z) }; };
    // путь вдоль x на z от xa до xb (первый - энергорельс у стены на блоке красного камня)
    window.track = (z, xa, xb, powered) => {
      const v = __voxel, C = v.core, VH = v.VX.vehicles, y = 70;
      if (powered) { v.setBlock(xa - 1, y, z, C.B.stone); v.setBlock(xa, y - 1, z, C.REDSTONE_BLOCK); VH.placeRail(xa, y, z, true, 1); v.VX.redstone.update(xa, y - 1, z); xa++; }
      for (let x = xa; x <= xb; x++) VH.placeRail(x, y, z, false, 1);
    };
    window.cartAt = (x, y, z) => { const v = __voxel; v.player.pos.set(x + 0.5, 70, z + 3.5); aim(x + 0.5, y + 0.05, z + 0.5); hold(v.data.I.minecart, 1); v.place(); return v.VX.vehicles.list[v.VX.vehicles.list.length - 1]; };
  });
}

test.describe('minecraft_clone_3d_1: рельсы, вагонетка, лодка', () => {
  test('рельсы: рецепт 16 штук; сами соединяются (прямые, поворот, подъём на блок); нужна твёрдая опора; сквозь них можно пройти', async ({ page }) => {
    await world(page);
    const r = await page.evaluate(() => {
      const v = __voxel, C = v.core, B = C.B, D = v.data, I = D.I, VH = v.VX.vehicles, p = v.player;
      const { x0, z0 } = base(), y = 70;
      const rec = D.RECIPES.find((q) => q.outId === C.RAIL), prec = D.RECIPES.find((q) => q.outId === C.POWERED_RAIL);
      const S = (x, yy, z) => { const id = v.getBlock(x, yy, z); return id >= C.POWERED_RAIL ? 'p' + ((id - C.POWERED_RAIL) >> 1) : id >= C.RAIL ? id - C.RAIL : null; };
      // прямая на север, потом поворот на восток
      VH.placeRail(x0 - 4, y, z0 - 2, false, 0); VH.placeRail(x0 - 4, y, z0 - 3, false, 0); VH.placeRail(x0 - 4, y, z0 - 4, false, 0);
      const straight = [S(x0 - 4, y, z0 - 2), S(x0 - 4, y, z0 - 3)];
      VH.placeRail(x0 - 3, y, z0 - 4, false, 1);
      const corner = S(x0 - 4, y, z0 - 4), cornerDirs = C.RAIL_DIRS[corner].slice().sort();
      // подъём: рельс на блоке выше к востоку
      v.setBlock(x0 + 2, y, z0 - 6, B.stone);
      VH.placeRail(x0 + 2, y + 1, z0 - 6, false, 1);
      VH.placeRail(x0 + 1, y, z0 - 6, false, 1);
      const up = S(x0 + 1, y, z0 - 6), high = C.RAIL_HIGH[up];
      // опора: убрали камень под рельсом - рельс выпал
      v.setBlock(x0 + 4, y - 1, z0 + 3, B.stone); VH.placeRail(x0 + 4, y, z0 + 3, false, 0);
      v.game.mode = 'creative'; aim(x0 + 4.5, y - 0.5, z0 + 3.5); p.pos.set(x0 + 4.5, y, z0 + 5.5); aim(x0 + 4.5, y - 0.5, z0 + 3.2);
      const hadRail = S(x0 + 4, y, z0 + 3);
      v.setBlock(x0 + 4, y - 1, z0 + 3, 0); v.game.afterChange(x0 + 4, y - 1, z0 + 3);
      const popped = v.getBlock(x0 + 4, y, z0 + 3);
      v.game.mode = 'survival';
      // нельзя ставить в воздух
      p.pos.set(x0 + 0.5, y, z0 + 0.5); hold(C.RAIL, 4); aim(x0 + 0.5, y - 0.5, z0 - 1.2);
      const ok = v.place(), placed = S(x0, y, z0 - 1);
      // сквозь рельсы проходишь
      p.pos.set(x0 - 4.5, y, z0 + 0.5); p.vel.set(0, 0, 0); v.look(0, 0); v.key('KeyW'); v.step(0.05, 30); v.key('KeyW', false);
      const walked = p.pos.z < z0 - 3.5;
      // стоишь на рельсах - на высоте пола (рельс не опора)
      p.pos.set(x0 - 3.5, y + 0.6, z0 - 3.5); p.vel.set(0, 0, 0); v.step(0.05, 20);
      const standY = p.pos.y;
      return { rec: rec && rec.out[1], prec: prec && prec.out[1], straight, corner, cornerDirs, up, high, hadRail, popped, ok: !!ok, placed, walked, standY };
    });
    expect(r.rec).toBe(16);
    expect(r.prec).toBe(6);
    expect(r.straight).toEqual([0, 0]);
    expect(r.cornerDirs).toEqual([1, 2]);      // юг (к прямой) и восток (к новому)
    expect(r.high).toBe(1);                    // подъём к востоку
    expect(r.hadRail).not.toBe(null);
    expect(r.popped).toBe(0);
    expect(r.ok).toBe(true);
    expect(r.placed).not.toBe(null);
    expect(r.walked).toBe(true);
    expect(r.standY).toBe(70);
  });

  test('вагонетка: от стены на запитанном энергорельсе - разгон, дальше по инерции с трением, в тупике стоп; на повороте поворачивает; в горку медленнее, под горку быстрее; выключенный энергорельс тормозит', async ({ page }) => {
    await world(page);
    const r = await page.evaluate(() => {
      const v = __voxel, C = v.core, B = C.B, VH = v.VX.vehicles, y = 70;
      const { x0, z0 } = base();
      track(z0 - 3, x0 - 6, x0 + 6, true);
      const on = (v.getBlock(x0 - 6, y, z0 - 3) - C.POWERED_RAIL) & 1;
      const c = cartAt(x0 - 6, y, z0 - 3);
      v.step(0.05, 10);
      const boosted = c.v;
      let maxX = c.x, vMid = 0;
      for (let k = 0; k < 120; k++) { v.step(0.05); maxX = Math.max(maxX, c.x); if (Math.abs(c.x - x0) < 0.3) vMid = c.v; }
      const end = { x: c.x - x0, v: c.v };
      // поворот: путь на север и поворот на восток
      VH.remove(c);
      VH.placeRail(x0 - 5, y, z0 + 6, false, 0); for (let z = z0 + 5; z >= z0 + 2; z--) VH.placeRail(x0 - 5, y, z, false, 0);
      for (let x = x0 - 4; x <= x0; x++) VH.placeRail(x, y, z0 + 2, false, 1);
      const c2 = cartAt(x0 - 5, y, z0 + 6); c2.from = 2; c2.to = 0; c2.v = 5;
      for (let k = 0; k < 60; k++) v.step(0.05);
      const turned = { cx: c2.cx - x0, cz: c2.cz - z0 };
      // горка: вверх на 1 блок
      VH.remove(c2);
      const z = z0 - 6;
      for (let x = x0 - 6; x <= x0 - 1; x++) VH.placeRail(x, y, z, false, 1);
      v.setBlock(x0, y, z, B.stone); v.setBlock(x0 + 1, y, z, B.stone); v.setBlock(x0 + 2, y, z, B.stone);
      VH.placeRail(x0, y + 1, z, false, 1); VH.placeRail(x0 + 1, y + 1, z, false, 1); VH.placeRail(x0 + 2, y + 1, z, false, 1);
      VH.placeRail(x0 - 1, y, z, false, 1);
      const slope = C.RAIL_HIGH[v.getBlock(x0 - 1, y, z) - C.RAIL];
      const c3 = cartAt(x0 - 6, y, z); c3.from = 3; c3.to = 1; c3.v = 4;
      let vBefore = 0, vTop = 0, climbed = false;
      for (let k = 0; k < 60; k++) { v.step(0.05); if (c3.cx === x0 - 2) vBefore = c3.v; if (c3.cy === y + 1 && !climbed) { climbed = true; vTop = c3.v; } }
      // тормоз: выключенный энергорельс посреди пути
      VH.remove(c3);
      const zb = z0 + 4;
      for (let x = x0; x <= x0 + 7; x++) VH.placeRail(x, y, zb, x === x0 + 3, 1);
      const offRail = (v.getBlock(x0 + 3, y, zb) - C.POWERED_RAIL) & 1;
      const c4 = cartAt(x0, y, zb); c4.from = 3; c4.to = 1; c4.v = 6;
      for (let k = 0; k < 40; k++) v.step(0.05);
      return { on, boosted, vMid, maxX: maxX - x0, end, turned, slope, vBefore, vTop, climbed, offRail, braked: c4.cx - x0, brakedV: c4.v };
    });
    expect(r.on).toBe(1);
    expect(r.boosted).toBeGreaterThan(3);
    expect(r.vMid).toBeGreaterThan(2);
    expect(r.vMid).toBeLessThan(r.boosted);
    expect(r.end.x).toBeCloseTo(7, 1);
    expect(r.end.v).toBe(0);
    expect(r.turned.cz).toBe(2);
    expect(r.turned.cx).toBeGreaterThan(-5);
    expect(r.slope).toBe(1);
    expect(r.climbed).toBe(true);
    expect(r.vTop).toBeLessThan(r.vBefore - 1);
    expect(r.offRail).toBe(0);
    expect(r.braked).toBeLessThanOrEqual(4);
    expect(r.brakedV).toBeLessThan(0.1);
  });

  test('энергорельсы: сигнал от блока красного камня идёт по цепочке до 8 рельсов; без сигнала гаснут', async ({ page }) => {
    await world(page);
    const r = await page.evaluate(() => {
      const v = __voxel, C = v.core, B = C.B, VH = v.VX.vehicles, y = 70;
      const { x0, z0 } = base();
      const z = z0 - 3;
      for (let x = x0 - 6; x <= x0 + 6; x++) VH.placeRail(x, y, z, true, 1);
      v.setBlock(x0 - 6, y, z - 1, C.REDSTONE_BLOCK); v.VX.redstone.update(x0 - 6, y, z - 1);
      const lit = []; for (let x = x0 - 6; x <= x0 + 6; x++) lit.push((v.getBlock(x, y, z) - C.POWERED_RAIL) & 1);
      v.setBlock(x0 - 6, y, z - 1, 0); v.VX.redstone.update(x0 - 6, y, z - 1);
      const off = []; for (let x = x0 - 6; x <= x0 + 6; x++) off.push((v.getBlock(x, y, z) - C.POWERED_RAIL) & 1);
      return { lit, off };
    });
    expect(r.lit).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0]);
    expect(r.off.every((q) => q === 0)).toBe(true);
  });

  test('езда в вагонетке: ПКМ - сел, едешь вместе, W толкает по взгляду, Shift - вышел рядом; 500 блоков - «Поехали!»; вагонетка сохраняется; ударами ломается в предмет', async ({ page }) => {
    await world(page);
    const r = await page.evaluate(async () => {
      const v = __voxel, C = v.core, I = v.data.I, VH = v.VX.vehicles, p = v.player, G = v.game, y = 70;
      const { x0, z0 } = base();
      track(z0 - 3, x0 - 6, x0 + 6, false);
      const c = cartAt(x0 - 3, y, z0 - 3);
      p.pos.set(x0 - 2.5, y, z0 - 0.5); hold(null); aim(c.x, c.y + 0.4, c.z);
      const mounted = v.place();
      const riding = G.riding === c;
      v.step(0.05, 2);
      const seat = Math.hypot(p.pos.x - c.x, p.pos.z - c.z);
      v.look(-Math.PI / 2, 0);                            // взгляд на восток (+x)
      v.key('KeyW'); v.step(0.05, 30); v.key('KeyW', false);
      const pushed = c.x - (x0 - 2.5), withCart = Math.hypot(p.pos.x - c.x, p.pos.z - c.z);
      // 500 блоков: счётчик почти полон
      G.meta.stats.rail = 498; c.v = 4;
      v.step(0.05, 20);
      const ach = !!v.ach.got.rail;
      // выйти: по бокам стены - выход туда, где свободно
      c.v = 0;
      for (let x = c.cx - 2; x <= c.cx + 2; x++) for (const dz of [-1, 1]) for (const yy of [y, y + 1, y + 2]) v.setBlock(x, yy, c.cz + dz, C.B.stone);
      v.key('ShiftLeft'); v.step(0.05, 1); v.key('ShiftLeft', false); v.step(0.05, 2);
      const out = { riding: !!G.riding, dist: Math.hypot(p.pos.x - c.x, p.pos.z - c.z), free: !v.VX.phys.boxHits(v.world, p.box()) };
      for (let x = c.cx - 2; x <= c.cx + 2; x++) for (const dz of [-1, 1]) for (const yy of [y, y + 1, y + 2]) v.setBlock(x, yy, c.cz + dz, 0);
      // сохранение
      c.v = 0; const cx = c.cx;
      const id = v.meta.id; await v.flush(); await v.exitToTitle(); await v.openWorld(id);
      const back = VH.list.filter((q) => q.kind === 'cart').map((q) => q.cx);
      // сломать: 3 удара по 2
      const c2 = VH.list[0]; p.pos.set(c2.x, y, c2.z + 2.5); p.vel.set(0, 0, 0); aim(c2.x, c2.y + 0.4, c2.z);
      for (let k = 0; k < 3; k++) { c2.hurtT = 0; VH.attack(); }
      v.step(0.05, 20);
      return { mounted, riding, seat, pushed, withCart, ach, out, saved: back.length === 1 && back[0] === cx, broken: VH.list.length, item: v.inv.count(I.minecart) + v.entities.items.filter((it) => it.stack.id === I.minecart).length };
    });
    expect(r.mounted).toBe('ride');
    expect(r.riding).toBe(true);
    expect(r.seat).toBeLessThan(0.05);
    expect(r.pushed).toBeGreaterThan(0.5);
    expect(r.withCart).toBeLessThan(0.05);
    expect(r.ach).toBe(true);
    expect(r.out.riding).toBe(false);
    expect(r.out.dist).toBeGreaterThan(0.8);
    expect(r.out.free).toBe(true);
    expect(r.saved).toBe(true);
    expect(r.broken).toBe(0);
    expect(r.item).toBe(1);
  });

  test('лодка: рецепт из 5 досок, ставится на воду и держится на плаву; W - разгон до 5-8 блоков в секунду, A - поворот вместе с видом; на суше еле ползёт; в лодке не тонешь; 50 блоков - «Отдать швартовы»', async ({ page }) => {
    await world(page);
    const r = await page.evaluate(() => {
      const v = __voxel, C = v.core, B = C.B, D = v.data, I = D.I, VH = v.VX.vehicles, p = v.player, G = v.game, y = 70;
      const { x0, z0 } = base();
      const rec = D.RECIPES.find((q) => q.outId === I.boat);
      // пруд 21x23 глубиной 2, над ним пусто, вокруг - каменный бортик
      for (let x = x0 - 11; x <= x0 + 11; x++) for (let z = z0 - 26; z <= z0 - 2; z++) {
        const rim = x === x0 - 11 || x === x0 + 11 || z === z0 - 26;
        v.setBlock(x, y - 1, z, rim ? B.stone : B.water); v.setBlock(x, y - 2, z, rim ? B.stone : B.water); v.setBlock(x, y - 3, z, B.stone);
        for (let k = 0; k < 8; k++) v.setBlock(x, y + k, z, 0);
      }
      v.VX.fluids && v.VX.fluids.reset && 0;
      p.pos.set(x0 + 0.5, y, z0 + 0.5); hold(I.boat, 1); aim(x0 + 0.5, y - 0.2, z0 - 3.5);
      const placed = v.place();
      const bt = VH.list[0];
      v.step(0.05, 20);
      const floatY = bt.y - y;
      p.pos.set(x0 + 0.5, y, z0 - 1.2); hold(null); aim(bt.x, bt.y + 0.3, bt.z);
      const mounted = v.place();
      v.look(0, 0); bt.yaw = 0;                       // нос на север (-z)
      p.air = 15;
      v.key('KeyW'); v.step(0.05, 40);
      const speed = Math.hypot(bt.vx, bt.vz), moved = (z0 - 3.5) - bt.z;
      v.key('KeyW', false);
      const yaw0 = bt.yaw, pyaw0 = p.yaw;
      v.key('KeyA'); v.step(0.05, 10); v.key('KeyA', false);
      const turned = bt.yaw - yaw0, pturned = p.yaw - pyaw0;
      G.meta.stats.boat = 49.5;
      v.key('KeyW'); v.step(0.05, 10); v.key('KeyW', false);
      const ach = !!v.ach.got.boat, air = p.air, hp = p.health;
      // на суше
      v.key('ShiftLeft'); v.step(0.05, 1); v.key('ShiftLeft', false);
      VH.list.length && VH.remove(bt);
      VH.list.push({ kind: 'boat', x: x0 + 0.5, y: y, z: z0 + 4.5, vx: 0, vy: 0, vz: 0, yaw: 0, hp: 4, hurtT: 0, w: 1.375, h: 0.6 });
      const land = VH.list[VH.list.length - 1];
      VH.mount(land); v.look(0, 0);
      v.key('KeyW'); v.step(0.05, 40); v.key('KeyW', false);
      const landMoved = Math.abs(land.z - (z0 + 4.5));
      return { rec: !!rec, placed, floatY, mounted, speed, moved, turned, pturned, ach, air, hp, landMoved };
    });
    expect(r.rec).toBe(true);
    expect(r.placed).toBe('boat');
    expect(r.floatY).toBeGreaterThan(-0.35);           // дно над водой (вода 69..69.9), лодка не тонет
    expect(r.floatY).toBeLessThan(0);
    expect(r.mounted).toBe('ride');
    expect(r.speed).toBeGreaterThan(5);
    expect(r.speed).toBeLessThan(8.5);
    expect(r.moved).toBeGreaterThan(5);
    expect(r.turned).toBeGreaterThan(0.5);
    expect(r.pturned).toBeCloseTo(r.turned, 5);
    expect(r.ach).toBe(true);
    expect(r.air).toBe(15);
    expect(r.hp).toBe(20);
    expect(r.landMoved).toBeLessThan(r.moved / 3);
  });

  test('без утечек: три круга по 10 лодок и 10 вагонеток - число геометрий не растёт', async ({ page }) => {
    await world(page, 'creative');
    const frames = (n) => page.evaluate((n) => new Promise((rr) => { let k = 0; const f = () => (++k >= n ? rr() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
    const geo = () => page.evaluate(() => { const v = __voxel; return v.game.renderer.info.memory.geometries - v.counts().draws - v.world.trash.length; });
    await page.evaluate(() => { const { x0, z0 } = base(); track(z0 - 3, x0 - 6, x0 + 6, false); });
    const round = async () => {
      await page.evaluate(() => {
        const v = __voxel, VH = v.VX.vehicles, p = v.player, { x0, z0 } = base();
        v.look(0, -0.3);
        for (let k = 0; k < 10; k++) VH.list.push({ kind: 'boat', x: p.pos.x + k - 5, y: 70, z: p.pos.z - 6, vx: 0, vy: 0, vz: 0, yaw: 0, hp: 4, hurtT: 0, w: 1.375, h: 0.6 });
        for (let k = 0; k < 10; k++) { const c = { kind: 'cart', cx: x0 - 5 + k, cy: 70, cz: z0 - 3, from: 3, to: 1, s: 0.5, v: 0, hp: 6, hurtT: 0, yaw: 0, w: 0.98, h: 0.7 }; VH.pose(c); VH.list.push(c); }
      });
      await frames(4);
      const n = await geo();
      await page.evaluate(() => { const VH = __voxel.VX.vehicles; while (VH.list.length) VH.remove(VH.list[0]); });
      await frames(4);
      return n;
    };
    const a = await round(), b = await round(), c = await round();
    expect(b - a).toBeLessThanOrEqual(3);
    expect(c - a).toBeLessThanOrEqual(3);
  });
});
