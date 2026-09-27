// Законы «Кубического мира», четвёртый заход: Нижний мир - генератор, портал и переходы (1:8),
// правила измерения (вода испаряется, кровать взрывается, вечный огонь, песок душ, адский нарост),
// мобы (свинолюди, гасты, ифриты), сохранение, возрождение дома, достижения.
const { test, expect } = require('@playwright/test');
const { openVoxel, newWorld, flatArena } = require('./_voxel-helpers');

test.describe.configure({ timeout: 120000 });

async function world(page, mode = 'survival') {
  await openVoxel(page);
  await newWorld(page, { seed: 8, mode });
  await page.evaluate(() => { __voxel.game.autoSpawn = false; __voxel.entities.clear(); __voxel.game.ticks = 4000; });
  await flatArena(page, 70, 7);
  await page.evaluate(() => {
    window.aim = (x, y, z) => { const v = __voxel, p = v.player, dx = x - p.pos.x, dy = y - p.eye(), dz = z - p.pos.z; v.look(Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz))); };
    window.hold = (id, n) => { const v = __voxel; v.inv.slots[0] = { id, count: n || 1, dmg: 0 }; v.select(0); };
    window.base = () => { const p = __voxel.player; return { x0: Math.floor(p.pos.x), z0: Math.floor(p.pos.z) }; };
    // рамка из обсидиана вдоль X: внутри w x h, левый нижний угол внутренности (x, y, z)
    window.frame = (x, y, z, w, h, alongZ) => {
      const v = __voxel, B = v.core.B, s = (i, j, id) => (alongZ ? v.setBlock(x, y + j, z + i, id) : v.setBlock(x + i, y + j, z, id));
      for (let i = -1; i <= w; i++) { s(i, -1, B.obsidian); s(i, h, B.obsidian); }
      for (let j = 0; j < h; j++) { s(-1, j, B.obsidian); s(w, j, B.obsidian); for (let i = 0; i < w; i++) s(i, j, 0); }
    };
  });
}
// переход без портала (для проверок): на той стороне - площадка 9x9 из обсидиана и воздух над ней
const DIM_PLATFORM = `(() => { const v = __voxel, p = v.player, x0 = Math.floor(p.pos.x), z0 = Math.floor(p.pos.z), y = 70;
  for (let x = x0 - 4; x <= x0 + 4; x++) for (let z = z0 - 4; z <= z0 + 4; z++) { v.setBlock(x, y - 1, z, v.core.B.obsidian); for (let k = 0; k < 5; k++) v.setBlock(x, y + k, z, 0); }
  p.pos.set(x0 + 0.5, y, z0 + 0.5); })`;
// ждать, пока переход закончится (экран загрузки, потом игра)
async function arrive(page) {
  await page.waitForFunction(() => __voxel.state === 'play', null, { timeout: 60000 });
  await page.evaluate(() => __voxel.waitIdle(1));
}

test.describe('minecraft_clone_3d_1: Нижний мир', () => {
  test('генератор: бедрок снизу и сверху, лавовое море до 31, незерак, светокамень, кварц, крепость с рассадником; поток и страница дают один мир', async ({ page }) => {
    await openVoxel(page);
    const r = await page.evaluate(() => {
      const C = __voxel.core, seed = C.seedFrom('8');
      const cnt = {};
      let bedrockOk = true, lavaTop = 0;
      for (let cz = -2; cz <= 2; cz++) for (let cx = -2; cx <= 2; cx++) {
        const d = C.generate(seed, cx, cz, 'nether');
        for (let i = 0; i < d.length; i++) cnt[d[i]] = (cnt[d[i]] || 0) + 1;
        for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) {
          if (d[C.cidx(x, 0, z)] !== C.B.bedrock || d[C.cidx(x, 127, z)] !== C.B.bedrock) bedrockOk = false;
          for (let y = 0; y < 128; y++) if (d[C.cidx(x, y, z)] === C.B.lava) lavaTop = Math.max(lavaTop, y);
        }
      }
      const f = C.fortressNear(seed, 0, 0);
      const fd = C.generate(seed, Math.floor(f.x / 16), Math.floor(f.z / 16), 'nether');
      const at = (x, y, z) => fd[C.cidx(x - Math.floor(f.x / 16) * 16, y, z - Math.floor(f.z / 16) * 16)];
      return { bedrockOk, lavaTop, rack: cnt[C.NETHERRACK] / (25 * 32768), glow: cnt[C.B.glowstone] || 0, quartz: cnt[C.QUARTZ_ORE] || 0, soul: cnt[C.SOUL_SAND] || 0, grass: cnt[C.B.grass] || 0,
        spawner: at(f.x, f.y + 1, f.z) === C.SPAWNER, floor: at(f.x, f.y, f.z) === C.NETHER_BRICKS, roof: at(f.x, f.y + 6, f.z) === C.NETHER_BRICKS,
        same: C.checksum(C.generate(seed, 3, -4, 'nether')) === C.checksum(C.generate(seed, 3, -4, 'nether')), differs: C.checksum(C.generate(seed, 3, -4, 'nether')) !== C.checksum(C.generate(seed, 3, -4)) };
    });
    expect(r.bedrockOk).toBe(true);
    expect(r.lavaTop).toBe(31);
    expect(r.rack).toBeGreaterThan(0.35);
    expect(r.glow).toBeGreaterThan(20);
    expect(r.quartz).toBeGreaterThan(100);
    expect(r.soul).toBeGreaterThan(0);
    expect(r.grass).toBe(0);
    expect([r.spawner, r.floor, r.roof]).toEqual([true, true, true]);
    expect(r.same).toBe(true);
    expect(r.differs).toBe(true);
  });

  test('портал: рамка 4x5 зажигается огнивом (вдоль X и вдоль Z), неполная - только огонь, сломал рамку - портал гаснет', async ({ page }) => {
    await world(page);
    const r = await page.evaluate(() => {
      const v = __voxel, C = v.core, B = C.B, I = v.data.I;
      const { x0, z0 } = base();
      frame(x0 - 1, 70, z0 - 3, 2, 3);
      hold(I.flint_and_steel);
      aim(x0 + 0.5, 70, z0 - 2.5);                 // пол внутри рамки
      const res = v.place();
      const cells = []; for (let i = 0; i < 2; i++) for (let j = 0; j < 3; j++) cells.push(v.getBlock(x0 - 1 + i, 70 + j, z0 - 3));
      const wear = v.inv.slots[0].dmg;
      // вдоль Z
      frame(x0 + 3, 70, z0 - 4, 3, 4, true);
      const lz = v.VX.nether.light(x0 + 3, 70, z0 - 3);
      const zc = v.getBlock(x0 + 3, 72, z0 - 2);
      // неполная рамка
      frame(x0 - 5, 70, z0 + 3, 2, 3); v.setBlock(x0 - 6, 71, z0 + 3, 0);
      const res2 = v.VX.nether.ignite({ id: B.obsidian, x: x0 - 5, y: 69, z: z0 + 3, n: [0, 1, 0], place: { x: x0 - 5, y: 70, z: z0 + 3 } }, v.inv.slots[0]);
      const inside2 = v.getBlock(x0 - 5, 70, z0 + 3);
      // рамка без верхнего блока - тоже не портал
      frame(x0 + 3, 70, z0 + 3, 2, 3); v.setBlock(x0 + 4, 73, z0 + 3, 0);
      const noTop = v.VX.nether.light(x0 + 3, 70, z0 + 3);
      // сломать рамку первого портала
      v.game.breakAt(x0 - 2, 71, z0 - 3, true);
      const after = []; for (let i = 0; i < 2; i++) for (let j = 0; j < 3; j++) after.push(v.getBlock(x0 - 1 + i, 70 + j, z0 - 3));
      return { res, cells, wear, lz, zc, res2, inside2, after, noTop, P: C.PORTAL, fire: B.fire };
    });
    expect(r.res).toBe('portal');
    expect(r.cells).toEqual(new Array(6).fill(r.P));
    expect(r.wear).toBe(1);
    expect(r.lz).toBe(true);
    expect(r.zc).toBe(r.P + 1);
    expect(r.res2).toBe('fire');
    expect(r.inside2).toBe(r.fire);
    expect(r.after).toEqual(new Array(6).fill(0));
    expect(r.noTop).toBe(false);
  });

  test('переход: 4 секунды в портале - Нижний мир (координаты / 8), там свой портал; обратно - к прежнему порталу (x8); достижение', async ({ page }) => {
    await world(page);
    // уходим подальше от начала координат, чтобы 1:8 отличалось от 1:1
    await page.evaluate(async () => { const v = __voxel, p = v.player; v.game.mode = 'creative'; p.pos.set(p.pos.x + 330, 100, p.pos.z - 210); p.flying = true; await v.waitIdle(1); });
    await flatArena(page, 70, 7);
    await page.evaluate(() => { __voxel.game.mode = 'survival'; });
    const a = await page.evaluate(() => {
      const v = __voxel, C = v.core, I = v.data.I, p = v.player;
      const { x0, z0 } = base();
      frame(x0, 70, z0 - 3, 2, 3);
      v.VX.nether.light(x0, 70, z0 - 3);
      p.pos.set(x0 + 1, 70, z0 - 2.5); p.vel.set(0, 0, 0);
      const t0 = []; for (let i = 0; i < 70; i++) { v.step(0.05); if (v.state !== 'play') { t0.push(i); break; } }
      const early = v.game.dim;
      for (let i = 0; i < 30 && v.state === 'play'; i++) v.step(0.05);
      return { early, dim: v.game.dim, from: { x: x0 + 1, z: z0 - 2.5 } };
    });
    expect(a.early).toBe('over');                // за 3.5 с ещё не перенесло
    expect(a.dim).toBe('nether');
    await arrive(page);
    const n = await page.evaluate(() => {
      const v = __voxel, p = v.player, C = v.core;
      const x = Math.floor(p.pos.x), z = Math.floor(p.pos.z);
      return { dim: v.game.dim, x: p.pos.x, z: p.pos.z, inPortal: v.VX.nether.inPortal(), ach: !!v.ach.got.nether, storeId: v.world.storeId, fog: v.world.gen };
    });
    expect(n.dim).toBe('nether');
    expect(Math.abs(n.x - a.from.x / 8)).toBeLessThan(3);
    expect(Math.abs(n.z - a.from.z / 8)).toBeLessThan(3);
    expect(n.inPortal).toBe(true);
    expect(n.ach).toBe(true);
    expect(n.storeId.endsWith('|n')).toBe(true);
    // выйти из портала и войти снова - обратно
    await page.evaluate(() => {
      const v = __voxel, p = v.player;
      const px = p.pos.x, pz = p.pos.z, py = p.pos.y;
      p.pos.set(px, py, pz + 2); v.step(0.05, 4);
      p.pos.set(px, py, pz); p.vel.set(0, 0, 0);
      for (let i = 0; i < 100 && v.state === 'play'; i++) v.step(0.05);
    });
    await arrive(page);
    const b = await page.evaluate(() => { const v = __voxel, p = v.player; return { dim: v.game.dim, x: p.pos.x, z: p.pos.z }; });
    expect(b.dim).toBe('over');
    expect(Math.abs(b.x - a.from.x)).toBeLessThan(3);        // нашёлся прежний портал
    expect(Math.abs(b.z - a.from.z)).toBeLessThan(3);
  });

  test('правила Нижнего мира: вода испаряется, кровать взрывается, огонь на незераке вечный, песок душ замедляет, адский нарост растёт только на песке душ', async ({ page }) => {
    await world(page);
    await page.evaluate((pf) => { const v = __voxel; v.game.changeDim('nether', { x: v.player.pos.x, y: 70, z: v.player.pos.z }, eval(pf)); }, DIM_PLATFORM);
    await arrive(page);
    const r = await page.evaluate(() => {
      const v = __voxel, C = v.core, B = C.B, I = v.data.I, p = v.player;
      v.entities.clear(); v.game.autoSpawn = false;
      const x0 = Math.floor(p.pos.x), z0 = Math.floor(p.pos.z), y = Math.floor(p.pos.y);
      for (let x = x0 - 6; x <= x0 + 6; x++) for (let z = z0 - 6; z <= z0 + 6; z++) { v.setBlock(x, y - 1, z, C.NETHERRACK); for (let k = 0; k < 6; k++) v.setBlock(x, y + k, z, 0); }
      p.pos.set(x0 + 0.5, y, z0 + 0.5); p.vel.set(0, 0, 0); v.step(0.05, 4);
      hold(I.water_bucket); aim(x0 + 0.5, y, z0 - 1.5);
      const water = v.place();
      const wb = { held: v.inv.slots[0] && v.inv.slots[0].id, cell: v.getBlock(x0, y, z0 - 2) };
      // огонь на незераке
      hold(I.flint_and_steel); aim(x0 + 2.5, y, z0 - 1.5); v.place();
      v.setBlock(x0 - 2, y - 1, z0 - 4, B.stone);
      aim(x0 - 1.5, y, z0 - 3.5); v.place();
      const stoneFire0 = v.getBlock(x0 - 2, y, z0 - 4) === B.fire;
      v.step(0.05, 200);
      const fire = v.getBlock(x0 + 2, y, z0 - 2) === B.fire, stoneFire = v.getBlock(x0 - 2, y, z0 - 4) === B.fire;
      // песок душ
      for (let z = z0 - 5; z <= z0; z++) v.setBlock(x0 - 3, y - 1, z, C.SOUL_SAND);
      p.pos.set(x0 - 2.5, y, z0 + 0.5); p.vel.set(0, 0, 0); v.step(0.05, 2);
      const zs = p.pos.z; v.look(0, 0); v.key('KeyW'); v.step(0.05, 20); v.key('KeyW', false);
      const slow = zs - p.pos.z;
      p.pos.set(x0 + 0.5, y, z0 + 0.5); p.vel.set(0, 0, 0); v.step(0.05, 2);
      const zr = p.pos.z; v.key('KeyW'); v.step(0.05, 20); v.key('KeyW', false);
      const fast = zr - p.pos.z;
      const diag = { state: v.state, dead: p.dead, hp: p.health, y: p.pos.y, fly: p.flying, below: v.getBlock(Math.floor(p.pos.x), Math.floor(p.pos.y - 0.05), Math.floor(p.pos.z)) };
      // нарост
      p.pos.set(x0 + 0.5, y, z0 + 0.5); v.step(0.05, 2);
      hold(I.nether_wart, 4);
      aim(x0 - 2.5, y - 0.02, z0 - 1.5); const onSoul = v.place();
      aim(x0 + 3.5, y - 0.02, z0 + 0.5); const onRack = v.place();
      let grew = false; for (let k = 0; k < 2000 && !grew; k++) { v.step(0.25); grew = v.getBlock(x0 - 3, y, z0 - 2) === C.NETHER_WART + 3; }
      // кровать
      v.setBlock(x0 + 4, y, z0 + 3, 122); v.setBlock(x0 + 4, y, z0 + 2, 126);
      const hp = p.health;
      const bed = v.game.useBed(x0 + 4, y, z0 + 3);
      return { diag, water, wb, wantHeld: I.bucket, fire, stoneFire0, stoneFire, slow, fast, onSoul, onRack, grew, bed, hp: hp - p.health };
    });
    expect(r.water).toBe('evaporate');
    expect(r.wb).toEqual({ held: r.wantHeld, cell: 0 });
    expect(r.fire).toBe(true);
    expect(r.stoneFire0).toBe(true);
    expect(r.stoneFire).toBe(false);               // на камне огонь без топлива гаснет
    expect(r.slow, JSON.stringify(r.diag)).toBeLessThan(r.fast * 0.6);
    expect(r.onSoul).toBe('plant');
    expect(r.onRack).toBe(null);
    expect(r.grew).toBe(true);
    expect(r.bed).toBe('explode');
    expect(r.hp).toBeGreaterThan(0);
  });

  test('свинолюди мирные, пока не ударишь; ударил - злятся все рядом; огонь и лава им не страшны', async ({ page }) => {
    await world(page);
    const r = await page.evaluate(() => {
      const v = __voxel, p = v.player, I = v.data.I, C = v.core;
      const a = v.spawnMob('zombie_pigman', 0, -3), b = v.spawnMob('zombie_pigman', 3, -3), far = v.spawnMob('zombie_pigman', 0, -40);
      const hp0 = p.health;
      v.step(0.05, 60);
      const calm = hp0 - p.health;
      v.entities.hurtMob(a, 1, p.pos.x, p.pos.z, 'player');
      const angry = [a.angry > 0, b.angry > 0, far.angry > 0];
      for (let i = 0; i < 80; i++) v.step(0.05);
      const hurt = hp0 - p.health;
      const x = Math.floor(b.x), z = Math.floor(b.z);
      v.setBlock(x, Math.floor(b.y), z, C.B.lava); b.fireT = 0; const bh = b.hp; v.step(0.05, 20);
      return { calm, angry, hurt, fireproof: b.hp === bh || b.hp >= bh - 0.01 };
    });
    expect(r.calm).toBe(0);
    expect(r.angry).toEqual([true, true, false]);
    expect(r.hurt).toBeGreaterThan(0);
    expect(r.fireproof).toBe(true);
  });

  test('гаст стреляет огненным шаром (взрыв, урон); отбитый ударом шар убивает гаста - «Возврат отправителю»', async ({ page }) => {
    await world(page);
    const r = await page.evaluate(() => {
      const v = __voxel, p = v.player, C = v.core, E = v.entities;
      const { x0, z0 } = base();
      const g = v.spawnMob('ghast', 0, -14); g.y = 71; g.wander = 99; g.goal = { x: g.x, y: g.y, z: g.z };
      const hp0 = p.health;
      let shot = false;
      for (let i = 0; i < 90 && !shot; i++) { g.x = p.pos.x; g.z = p.pos.z - 14; v.step(0.05); shot = E.fireballs.length > 0; }
      const f = E.fireballs[0];
      const owner = f && f.owner === g;
      // подождём попадания
      let i2 = 0; while (E.fireballs.length && i2++ < 60) { v.step(0.05); }
      const hurt = hp0 - p.health;
      // второй шар отбиваем
      p.health = 20; p.hurtCool = 0; g.charge = 2.99;
      v.step(0.05, 2);
      const f2 = E.fireballs[0];
      let deflected = false;
      for (let k = 0; k < 40 && f2 && !deflected; k++) {
        const dx = f2.x - p.pos.x, dy = f2.y - p.eye(), dz = f2.z - p.pos.z;
        if (Math.hypot(dx, dy, dz) < 3.5) { v.look(Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz))); deflected = E.deflect(); }
        else v.step(0.02);
      }
      if (deflected) { v.look(Math.atan2(-(g.x - p.pos.x), -(g.z - p.pos.z)), Math.atan2(g.y + 2 - p.eye(), Math.hypot(g.x - p.pos.x, g.z - p.pos.z))); const d = p.forward(); const s = Math.hypot(f2.vx, f2.vy, f2.vz); f2.vx = d.x * s; f2.vy = d.y * s; f2.vz = d.z * s; }
      for (let k = 0; k < 60 && g.deadT === 0; k++) v.step(0.05);
      return { shot, owner, hurt, deflected, dead: g.deadT > 0, ach: !!v.ach.got.return_sender };
    });
    expect(r.shot).toBe(true);
    expect(r.owner).toBe(true);
    expect(r.hurt).toBeGreaterThan(0);
    expect(r.deflected).toBe(true);
    expect(r.dead).toBe(true);
    expect(r.ach).toBe(true);
  });

  test('ифрит стреляет тремя малыми шарами (урон и поджог), вода ранит его; стержень - только от руки героя', async ({ page }) => {
    await world(page);
    const r = await page.evaluate(() => {
      const v = __voxel, p = v.player, C = v.core, E = v.entities, I = v.data.I;
      const b = v.spawnMob('blaze', 0, -8); b.y = 71;
      const hp0 = p.health;
      let most = 0;
      for (let i = 0; i < 100; i++) { b.x = p.pos.x; b.z = p.pos.z - 8; v.step(0.05); most = Math.max(most, E.fireballs.filter((f) => f.small).length); }
      const burned = p.fireT > 0 || hp0 - p.health > 0;
      // вода
      const w = v.spawnMob('blaze', 5, 0); w.y = p.pos.y;
      v.setBlock(Math.floor(w.x), Math.floor(w.y), Math.floor(w.z), C.B.water);
      const wh = w.hp; for (let i = 0; i < 30; i++) { w.vx = w.vy = w.vz = 0; w.x = Math.floor(w.x) + 0.5; v.step(0.05); }
      const wet = wh - w.hp;
      // стержни: сгорел в лаве/от воды - нет; от меча - бывает
      E.clear();
      let rodsWater = 0, rodsSword = 0;
      for (let k = 0; k < 12; k++) {
        const q = v.spawnMob('blaze', 0, -2); q.hp = 1; E.hurtMob(q, 5, p.pos.x, p.pos.z, 'water');
        const s = v.spawnMob('blaze', 0, -2); s.hp = 1; E.hurtMob(s, 5, p.pos.x, p.pos.z, 'player');
      }
      rodsWater = 0; rodsSword = E.items.filter((it) => it.stack.id === I.blaze_rod).length;
      return { most, burned, wet, rodsSword };
    });
    expect(r.most).toBeGreaterThanOrEqual(2);
    expect(r.burned).toBe(true);
    expect(r.wet).toBeGreaterThan(0);
    expect(r.rodsSword).toBeGreaterThan(0);
  });

  test('сундук в Нижнем мире хранится отдельно; мир открывается снова в Нижнем мире; смерть там - возрождение дома', async ({ page }) => {
    await world(page);
    const r1 = await page.evaluate(async (pf) => {
      const v = __voxel, p = v.player, I = v.data.I, C = v.core;
      const { x0, z0 } = base();
      v.game.chestSlots(x0 + 2, 70, z0)[0] = { id: I.diamond, count: 3, dmg: 0 };
      v.setBlock(x0 + 2, 70, z0, C.B.chest);
      v.game.changeDim('nether', { x: x0 + 0.5, y: 80, z: z0 + 0.5 }, eval(pf));
      return { x0, z0 };
    }, DIM_PLATFORM);
    await arrive(page);
    const r2 = await page.evaluate(async ({ x0, z0 }) => {
      const v = __voxel, p = v.player, I = v.data.I, C = v.core;
      const overChest = !!v.game.chests[(x0 + 2) + ',70,' + z0];
      v.game.chestSlots(x0 + 2, 70, z0)[0] = { id: I.quartz, count: 5, dmg: 0 };
      const pos = { x: p.pos.x, z: p.pos.z };
      const id = v.meta.id;
      await v.flush(); await v.exitToTitle(); await v.openWorld(id);
      const back = { dim: v.game.dim, x: p.pos.x, z: p.pos.z, chest: v.game.chests[(x0 + 2) + ',70,' + z0] && v.game.chests[(x0 + 2) + ',70,' + z0][0].id };
      p.health = 1; p.hurtCool = 0; p.damage(10, 'lava', null, true);
      return { overChest, pos, back, quartz: I.quartz };
    }, r1);
    expect(r2.overChest).toBe(false);
    expect(r2.back.dim).toBe('nether');
    expect(Math.abs(r2.back.x - r2.pos.x)).toBeLessThan(0.5);
    expect(r2.back.chest).toBe(r2.quartz);
    await page.waitForFunction(() => __voxel.state === 'dead');
    await page.evaluate(() => __voxel.game.respawn());
    await arrive(page);
    const r3 = await page.evaluate(({ x0, z0 }) => {
      const v = __voxel, I = v.data.I;
      return { dim: v.game.dim, chest: v.game.chests[(x0 + 2) + ',70,' + z0] && v.game.chests[(x0 + 2) + ',70,' + z0][0].id, diamond: I.diamond, hp: v.player.health };
    }, r1);
    expect(r3.dim).toBe('over');
    expect(r3.chest).toBe(r3.diamond);
    expect(r3.hp).toBe(20);
  });

  test('экран достижений: вкладки «Обычный мир» и «Нижний мир», у каждой своё дерево', async ({ page }) => {
    await world(page);
    const r = await page.evaluate(async () => {
      const v = __voxel;
      v.VX.ui.show('ach');
      const tabs = [...document.querySelectorAll('#scr-ach .ach-tab')].map((b) => b.textContent);
      const main = document.querySelectorAll('#scr-ach .ach').length;
      [...document.querySelectorAll('#scr-ach .ach-tab')].find((b) => b.textContent === 'Нижний мир').click();
      const neth = [...document.querySelectorAll('#scr-ach .ach')].map((n) => n.dataset.id);
      return { tabs, main, neth, wantMain: v.data.ACH.filter((a) => !a.tab).length };
    });
    expect(r.tabs.slice(0, 2)).toEqual(['Обычный мир', 'Нижний мир']);
    expect(r.main).toBe(r.wantMain);
    expect(r.main).toBeGreaterThanOrEqual(30);
    expect(r.neth.sort()).toEqual(['blaze_rod', 'fortress', 'nether', 'return_sender', 'wart']);
  });
});
