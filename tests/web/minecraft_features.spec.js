// Законы «Кубического мира», третий заход (продолжение): виды камеры и клавиши F, кактус, броня,
// вода и лава, вёдра, двери и рычаг, сундуки, кровать и сон, пшеница, овцы, лук, новые мобы,
// инструменты всех уровней, перенос построек старой версии.
const { test, expect } = require('@playwright/test');
const { openVoxel, newWorld, flatArena } = require('./_voxel-helpers');

test.describe.configure({ timeout: 90000 });   // программная отрисовка в параллельных прогонах медленная

async function world(page, mode = 'survival', seed = 8) {
  await openVoxel(page);
  await newWorld(page, { seed, mode });
  await page.evaluate(() => { __voxel.game.autoSpawn = false; __voxel.entities.clear(); });
  await flatArena(page, 70, 7);
}
const frames = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

test.describe('minecraft_clone_3d_1: вид камеры и клавиши F', () => {
  test('F5 трижды возвращает вид к первому лицу; F5 не перезагружает страницу; в третьем лице камера не в блоке', async ({ page }) => {
    await world(page, 'survival');
    await page.evaluate(() => { window.__marker = 42; window.__prevented = []; window.addEventListener('keydown', (e) => { if (/^F\d$/.test(e.code)) window.__prevented.push(e.code + ':' + e.defaultPrevented); }); });
    const views = [];
    for (let k = 0; k < 3; k++) { await page.keyboard.press('F5'); views.push(await page.evaluate(() => __voxel.game.view)); }
    expect(views).toEqual([1, 2, 0]);
    expect(await page.evaluate(() => window.__marker)).toBe(42);
    expect(await page.evaluate(() => window.__prevented.filter((x) => x.startsWith('F5')))).toEqual(['F5:true', 'F5:true', 'F5:true']);
    await page.evaluate(() => {
      const v = __voxel, p = v.player, B = v.core.B;
      const x = Math.floor(p.pos.x), z = Math.floor(p.pos.z);
      for (let dx = -2; dx <= 2; dx++) for (let y = 70; y < 74; y++) v.setBlock(x + dx, y, z + 2, B.stone);
      v.look(0, 0); v.game.view = 1;
    });
    await frames(page);
    const wall = await page.evaluate(() => {
      const v = __voxel, p = v.player, c = v.game.camera.position;
      return { inside: v.core.SOLID[Math.max(0, v.getBlock(Math.floor(c.x), Math.floor(c.y), Math.floor(c.z)))] === 1, d: Math.hypot(c.x - p.pos.x, c.z - p.pos.z) };
    });
    await page.evaluate(() => { const v = __voxel, p = v.player; const x = Math.floor(p.pos.x), z = Math.floor(p.pos.z); for (let dx = -2; dx <= 2; dx++) for (let y = 70; y < 74; y++) v.setBlock(x + dx, y, z + 2, 0); });
    await frames(page);
    const open = await page.evaluate(() => { const v = __voxel, p = v.player, c = v.game.camera.position; return Math.hypot(c.x - p.pos.x, c.z - p.pos.z); });
    await page.evaluate(() => { __voxel.game.view = 2; });
    await frames(page);
    const front = await page.evaluate(() => { const v = __voxel, p = v.player, c = v.game.camera.position, f = p.forward(); return (c.x - p.pos.x) * f.x + (c.z - p.pos.z) * f.z; });
    expect(wall.inside).toBe(false);
    expect(wall.d).toBeLessThan(1.6);
    expect(open).toBeGreaterThan(3.5);
    expect(front).toBeGreaterThan(3);
  });

  test('F1 прячет интерфейс, F2 сохраняет снимок PNG, F3 - отладка, конфликтов нет', async ({ page }) => {
    await world(page, 'survival');
    await page.keyboard.press('F1');
    expect(await page.evaluate(() => getComputedStyle(document.getElementById('hud')).visibility)).toBe('hidden');
    await page.keyboard.press('F1');
    expect(await page.evaluate(() => getComputedStyle(document.getElementById('hud')).visibility)).toBe('visible');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('F2')]);
    expect(dl.suggestedFilename()).toMatch(/^kubicheskiy-mir-\d{4}-\d\d-\d\d_\d\d-\d\d-\d\d\.png$/);
    await page.keyboard.press('F3');
    const r = await page.evaluate(() => ({ debug: __voxel.game.debug, view: __voxel.game.view || 0, hide: !!__voxel.game.hideHud, state: __voxel.state }));
    expect(r).toEqual({ debug: true, view: 0, hide: false, state: 'play' });
  });
});

test.describe('minecraft_clone_3d_1: кактус и броня', () => {
  test('кактус: вплотную в выживании - урон, предмет на кактусе исчезает, ставится только на песок и без соседей; в творческом урона нет', async ({ page }) => {
    await world(page, 'survival');
    const r = await page.evaluate(() => {
      const v = __voxel, p = v.player, B = v.core.B, E = v.entities;
      const x = Math.floor(p.pos.x), z = Math.floor(p.pos.z);
      v.setBlock(x + 1, 69, z, B.sand); v.setBlock(x + 1, 70, z, B.cactus); v.setBlock(x + 1, 71, z, B.cactus);
      p.pos.set(x + 0.5, 70, z + 0.5); p.vel.set(0, 0, 0); p.health = 20; p.hurtCool = 0;
      v.look(-Math.PI / 2, 0); v.key('KeyW'); v.step(0.05, 30); v.key('KeyW', false);
      const hSurv = p.health;
      const it = E.spawnItem({ id: B.dirt, count: 3 }, x + 1.5, 72.5, z + 0.5, 0, 0, 0, 5);
      v.step(0.05, 30);
      const itemGone = !E.items.includes(it);
      v.inv.slots[0] = { id: B.cactus, count: 5, dmg: 0 }; v.select(0);
      p.pos.set(x + 0.5, 70, z - 2.5); v.look(Math.PI, -0.9);
      const t = v.target();
      const onStone = v.place();
      v.setBlock(t.x, t.y, t.z, B.sand);
      v.setBlock(t.x + 1, t.y + 1, t.z, B.stone);
      const nextToBlock = v.place();
      v.setBlock(t.x + 1, t.y + 1, t.z, 0);
      const ok = v.place();
      return { hSurv, itemGone, onStone, nextToBlock, ok: !!ok && v.getBlock(ok.x, ok.y, ok.z) === B.cactus };
    });
    expect(r.hSurv).toBeLessThanOrEqual(18);
    expect(r.itemGone).toBe(true);
    expect(r.onStone).toBe(null);
    expect(r.nextToBlock).toBe(null);
    expect(r.ok).toBe(true);
    await page.evaluate(() => __voxel.exitToTitle());
    await newWorld(page, { seed: 8, mode: 'creative' });
    await flatArena(page, 70, 7);
    const c = await page.evaluate(() => {
      const v = __voxel, p = v.player, B = v.core.B;
      const x = Math.floor(p.pos.x), z = Math.floor(p.pos.z);
      v.setBlock(x + 1, 69, z, B.sand); v.setBlock(x + 1, 70, z, B.cactus);
      v.look(-Math.PI / 2, 0); v.key('KeyW'); v.step(0.05, 40); v.key('KeyW', false);
      return p.health;
    });
    expect(c).toBe(20);
  });

  test('броня: Shift+щелчок надевает в свою ячейку, урон по формуле оригинала, падение не гасится, прочность тратится, «Броня!», полоска брони', async ({ page }) => {
    await world(page, 'survival');
    const r = await page.evaluate(async () => {
      const v = __voxel, p = v.player, I = v.data.I, VX = v.VX, inv = v.inv;
      inv.clear();
      ['iron_helmet', 'iron_chestplate', 'iron_leggings', 'iron_boots'].forEach((k, i) => { inv.slots[9 + i] = { id: I[k], count: 1, dmg: 0 }; });
      v.openInventory();
      const view = v.container;
      const wrong = view.canPut(40, { id: I.iron_boots, count: 1 });
      for (let i = 0; i < 4; i++) VX.inv.click(inv, view, 9 + i, 0, true);
      v.closeInventory();
      const worn = inv.armor.map((s) => s && s.id);
      const pts = p.armorPoints().pts;
      p.health = 20; p.hurtCool = 0; p.damage(3, 'zombie');
      const afterHit = p.health;
      const dur = inv.armor.map((s) => s.dmg);
      p.health = 20; p.hurtCool = 0; p.damage(5, 'fall');
      const afterFall = p.health;
      const saved = inv.armor.slice(); inv.armor.fill(null);
      p.health = 20; p.hurtCool = 0; p.damage(3, 'zombie');
      const bare = p.health;
      for (let i = 0; i < 4; i++) inv.armor[i] = saved[i];
      p.health = 20; p.hurtCool = 0; p.damage(1, 'cactus');
      const cactus = p.health;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return { wrong, worn, pts, afterHit, dur, afterFall, bare, cactus, ach: !!v.ach.got.armor, bar: document.querySelectorAll('#armorbar img').length };
    });
    const I = await page.evaluate(() => __voxel.data.I);
    expect(r.wrong).toBe(false);
    expect(r.worn).toEqual([I.iron_helmet, I.iron_chestplate, I.iron_leggings, I.iron_boots]);
    expect(r.pts).toBe(15);
    expect(r.afterHit).toBeCloseTo(20 - 1.38, 2);
    expect(r.dur).toEqual([1, 1, 1, 1]);
    expect(r.afterFall).toBe(15);
    expect(r.bare).toBe(17);
    expect(r.cactus).toBeGreaterThan(19);
    expect(r.ach).toBe(true);
    expect(r.bar).toBe(10);
  });

  test('броня видна на игроке от третьего лица, ломается, когда прочность кончилась, при гибели выпадает', async ({ page }) => {
    await world(page, 'survival');
    await page.evaluate(() => { const v = __voxel, I = v.data.I; v.inv.armor[0] = { id: I.diamond_helmet, count: 1, dmg: 0 }; v.inv.armor[1] = { id: I.gold_chestplate, count: 1, dmg: 0 }; v.game.view = 1; });
    await frames(page);
    const r = await page.evaluate(() => {
      const v = __voxel, p = v.player, I = v.data.I, inv = v.inv;
      let meshes = 0; v.game.scene.traverse((o) => { if (o.isMesh && o.geometry && o.geometry.parameters && Math.abs(o.geometry.parameters.width - 0.56) < 1e-6) { let vis = true; for (let q = o; q; q = q.parent) if (!q.visible) vis = false; if (vis) meshes++; } });
      inv.armor[3] = { id: I.leather_boots, count: 1, dmg: 64 };
      p.hurtCool = 0; p.damage(4, 'zombie');
      const bootsGone = inv.armor[3] === null;
      p.damage(100, 'fall'); v.step(0.05, 2);
      return { meshes, bootsGone, dropped: v.entities.items.map((i) => i.stack.id), armorLeft: inv.armor.filter(Boolean).length };
    });
    const I = await page.evaluate(() => __voxel.data.I);
    expect(r.meshes).toBeGreaterThanOrEqual(2);
    expect(r.bootsGone).toBe(true);
    expect(r.dropped).toContain(I.diamond_helmet);
    expect(r.dropped).toContain(I.gold_chestplate);
    expect(r.armorLeft).toBe(0);
  });
});

test.describe('minecraft_clone_3d_1: вода, лава, вёдра', () => {
  test('вода: источник растекается на 7 клеток с уровнями, без источника уходит, 2x2 даёт источник, течёт вниз', async ({ page }) => {
    await world(page, 'creative');
    const r = await page.evaluate(() => {
      const v = __voxel, C = v.core, B = C.B, p = v.player;
      p.flying = true; p.pos.y = 90;
      const x0 = Math.floor(p.pos.x) - 6, z0 = Math.floor(p.pos.z) - 4;
      const run = (s) => { for (let k = 0; k < 20 * s; k++) v.step(0.05); };
      for (let x = x0 - 1; x <= x0 + 10; x++) for (let z = z0 - 1; z <= z0 + 8; z++) { v.setBlock(x, 69, z, B.stone); for (let y = 70; y < 73; y++) v.setBlock(x, y, z, 0); }
      v.setBlock(x0, 70, z0, B.water); v.VX.fluids.touch(x0, 70, z0);
      run(6);
      const levels = []; for (let d = 0; d <= 8; d++) { const id = v.getBlock(x0 + d, 70, z0); levels.push(id === B.water ? 0 : C.FLUID[Math.max(0, id)] === 1 ? C.FLEVEL[id] : -1); }
      v.setBlock(x0, 70, z0, 0); v.VX.fluids.touch(x0, 70, z0);
      run(6);
      let left = 0; for (let x = x0 - 1; x <= x0 + 10; x++) for (let z = z0 - 1; z <= z0 + 8; z++) if (C.FLUID[Math.max(0, v.getBlock(x, 70, z))]) left++;
      v.setBlock(x0 + 2, 70, z0 + 4, B.water); v.setBlock(x0 + 4, 70, z0 + 4, B.water);
      v.VX.fluids.touch(x0 + 2, 70, z0 + 4); v.VX.fluids.touch(x0 + 4, 70, z0 + 4);
      run(3);
      const middle = v.getBlock(x0 + 3, 70, z0 + 4);
      v.setBlock(x0 + 8, 69, z0 + 7, 0); v.setBlock(x0 + 8, 68, z0 + 7, 0);
      v.setBlock(x0 + 8, 70, z0 + 7, B.water); v.VX.fluids.touch(x0 + 8, 70, z0 + 7);
      run(2);
      return { levels, left, middle, fell: C.FLUID[Math.max(0, v.getBlock(x0 + 8, 68, z0 + 7))], water: B.water };
    });
    expect(r.levels).toEqual([0, 1, 2, 3, 4, 5, 6, 7, -1]);
    expect(r.left).toBe(0);
    expect(r.middle).toBe(r.water);
    expect(r.fell).toBe(1);
  });

  test('ведро: набирает источник воды и лавы, выливает; «Горячая штучка»; сетка течения ниже источника', async ({ page }) => {
    await world(page, 'survival');
    const r = await page.evaluate(() => {
      const v = __voxel, C = v.core, B = C.B, I = v.data.I, p = v.player, inv = v.inv;
      const x0 = Math.floor(p.pos.x), z0 = Math.floor(p.pos.z);
      v.setBlock(x0, 69, z0 - 2, B.water);
      inv.clear(); inv.slots[0] = { id: I.bucket, count: 2, dmg: 0 }; v.select(0);
      v.look(0, -0.7);
      const got = v.place();
      const hasWater = inv.count(I.water_bucket), hole = v.getBlock(x0, 69, z0 - 2);
      v.setBlock(x0, 69, z0 - 2, B.stone);
      v.select(inv.slots.findIndex((s) => s && s.id === I.water_bucket));
      const poured = v.place();
      const placed = poured === 'pour' ? v.getBlock(x0, 70, z0 - 2) : -1;
      v.setBlock(x0, 70, z0 - 2, 0);
      v.setBlock(x0, 69, z0 - 2, B.lava);
      v.select(inv.slots.findIndex((s) => s && s.id === I.bucket));
      v.place();
      return { got, hasWater, hole, poured, placed, lavaBucket: inv.count(I.lava_bucket), ach: !!v.ach.got.hot_stuff, water: B.water };
    });
    expect(r.got).toBe('water');
    expect(r.hasWater).toBe(1);
    expect(r.hole).toBe(0);
    expect(r.poured).toBe('pour');
    expect(r.placed).toBe(r.water);
    expect(r.lavaBucket).toBe(1);
    expect(r.ach).toBe(true);
    const mesh = await page.evaluate(() => {
      const C = __voxel.core, B = C.B;
      const top = (id) => { const ch = []; for (let k = 0; k < 9; k++) ch.push(new Uint8Array(C.CVOL)); ch[4][C.cidx(5, 60, 5)] = id; const m = C.buildMesh(ch, {}); let y = 0; for (let i = 1; i < m.trans.pos.length; i += 3) y = Math.max(y, m.trans.pos[i]); return y - 60; };
      return { src: top(B.water), l3: top(74), l7: top(78) };
    });
    expect(mesh.src).toBeCloseTo(14 / 16, 3);
    expect(mesh.l3).toBeLessThan(mesh.src);
    expect(mesh.l7).toBeLessThan(mesh.l3);
  });

  test('лава: течёт на 3 клетки, светит; вода с лавой - обсидиан, булыжник, камень', async ({ page }) => {
    await world(page, 'creative');
    const r = await page.evaluate(() => {
      const v = __voxel, C = v.core, B = C.B, p = v.player;
      p.flying = true; p.pos.y = 95;
      const x0 = Math.floor(p.pos.x) - 3, z0 = Math.floor(p.pos.z) - 3;
      const run = (s) => { for (let k = 0; k < 20 * s; k++) v.step(0.05); };
      v.setBlock(x0, 70, z0, B.lava); v.VX.fluids.touch(x0, 70, z0);
      run(12);
      const levels = []; for (let d = 0; d <= 4; d++) { const id = v.getBlock(x0 + d, 70, z0); levels.push(id === B.lava ? 0 : C.FLUID[Math.max(0, id)] === 2 ? C.FLEVEL[id] : -1); }
      v.setBlock(x0, 71, z0, B.water); v.VX.fluids.touch(x0, 71, z0);
      run(4);
      const atSource = v.getBlock(x0, 70, z0);
      const cells = []; for (let d = 1; d <= 3; d++) cells.push(v.getBlock(x0 + d, 70, z0));
      v.setBlock(x0 + 6, 70, z0 + 6, B.water); v.setBlock(x0 + 6, 71, z0 + 6, B.lava); v.VX.fluids.touch(x0 + 6, 71, z0 + 6);
      run(4);
      return { levels, atSource, cells, onWater: v.getBlock(x0 + 6, 70, z0 + 6), obs: B.obsidian, cob: B.cobblestone, stone: B.stone };
    });
    expect(r.levels).toEqual([0, 2, 4, 6, -1]);
    expect(r.atSource).toBe(r.obs);
    expect(r.cells).toContain(r.cob);
    expect(r.onWater).toBe(r.stone);
    const light = await page.evaluate(() => {
      const C = __voxel.core; const ch = []; for (let k = 0; k < 9; k++) ch.push(new Uint8Array(C.CVOL));
      for (let x = 2; x <= 12; x++) for (let z = 2; z <= 12; z++) ch[4][C.cidx(x, 59, z)] = C.B.stone;
      ch[4][C.cidx(3, 60, 3)] = C.B.lava;
      const m = C.buildMesh(ch, {}); let best = 0;
      for (let i = 0; i < m.opaque.pos.length / 3; i++) if (Math.abs(m.opaque.pos[i * 3 + 1] - 60) < 1e-6 && m.opaque.pos[i * 3] >= 8) best = Math.max(best, m.opaque.light[i * 4 + 1]);
      return Math.round(best / 17);
    });
    expect(light).toBeGreaterThanOrEqual(8);
  });

  test('лава обжигает: игрок в лаве теряет здоровье и горит, в воде гаснет; горючее рядом загорается; предмет в лаве исчезает', async ({ page }) => {
    await world(page, 'survival');
    const s = await page.evaluate(() => {
      const v = __voxel, C = v.core, B = C.B, p = v.player, E = v.entities;
      const x0 = Math.floor(p.pos.x), z0 = Math.floor(p.pos.z);
      v.setBlock(x0 - 3, 70, z0 - 3, B.lava);
      p.pos.set(x0 - 2.5, 70, z0 - 2.5); p.vel.set(0, 0, 0); p.health = 20; p.hurtCool = 0;
      v.step(0.05, 12);
      const lavaHp = p.health, burning = p.fireT > 0;
      v.setBlock(x0 - 3, 70, z0 - 3, B.water);
      v.step(0.05, 4);
      const out = !(p.fireT > 0);
      p.health = 20;
      v.setBlock(x0 + 5, 70, z0 - 5, B.lava);
      const it = E.spawnItem({ id: B.dirt, count: 1 }, x0 + 5.5, 71.2, z0 - 4.5, 0, 0, 0, 5);
      v.step(0.05, 30);
      const itemGone = !E.items.includes(it);
      p.pos.set(x0 - 5.5, 70, z0 + 5.5);
      for (let dz = -1; dz <= 1; dz++) { v.setBlock(x0 + 4, 70, z0 + dz, B.oak_planks); v.setBlock(x0 + 4, 71, z0 + dz, B.oak_planks); }
      v.setBlock(x0 + 3, 70, z0, B.lava); v.VX.fluids.touch(x0 + 3, 70, z0);
      let fire = 0; for (let k = 0; k < 20 * 40; k++) { v.step(0.05); if (v.VX.fluids.fires.size) fire++; p.health = 20; }
      let planks = 0; for (let dz = -1; dz <= 1; dz++) for (let y = 70; y <= 71; y++) if (v.getBlock(x0 + 4, y, z0 + dz) === B.oak_planks) planks++;
      return { lavaHp, burning, out, itemGone, fire, planks };
    });
    expect(s.lavaHp).toBeLessThanOrEqual(16);
    expect(s.burning).toBe(true);
    expect(s.out).toBe(true);
    expect(s.itemGone).toBe(true);
    expect(s.fire).toBeGreaterThan(0);
    expect(s.planks).toBeLessThan(6);
  });

  test('мир: лава в глубоких пещерах (не выше 10), светокамень жилами глубоко', async ({ page }) => {
    await openVoxel(page);
    const r = await page.evaluate(() => {
      const C = __voxel.core, B = C.B;
      let lavaLow = 0, lavaHigh = 0, glowDeep = 0, glowHigh = 0;
      for (let cx = -4; cx < 4; cx++) for (let cz = -4; cz < 4; cz++) {
        const d = C.generate(99, cx, cz);
        for (let i = 0; i < d.length; i++) {
          const y = i >> 8;
          if (d[i] === B.lava) { if (y <= 10) lavaLow++; else lavaHigh++; }
          if (d[i] === B.glowstone) { if (y < 27) glowDeep++; else glowHigh++; }
        }
      }
      return { lavaLow, lavaHigh, glowDeep, glowHigh };
    });
    expect(r.lavaLow).toBeGreaterThan(50);
    expect(r.lavaHigh).toBe(0);
    expect(r.glowDeep).toBeGreaterThan(5);
    expect(r.glowHigh).toBe(0);
  });
});

test.describe('minecraft_clone_3d_1: двери, сундуки, кровать', () => {
  test('дверь: две клетки, закрытая не пускает, открытая пускает со звуком; ломается целиком; железную открывает только рычаг', async ({ page }) => {
    await world(page, 'survival');
    const r = await page.evaluate(() => {
      const v = __voxel, C = v.core, B = C.B, I = v.data.I, p = v.player, inv = v.inv, G = v.game, A = v.VX.audio.counts;
      const x0 = Math.floor(p.pos.x), z0 = Math.floor(p.pos.z);
      for (let dx = -3; dx <= 3; dx++) for (let y = 70; y < 73; y++) if (!(dx === 0 && y < 72)) v.setBlock(x0 + dx, y, z0 - 3, B.stone);
      inv.clear(); inv.slots[0] = { id: I.oak_door, count: 1, dmg: 0 }; v.select(0);
      p.pos.set(x0 + 0.5, 70, z0 + 0.5); v.look(0, -0.55);
      const placed = G.useTarget();
      const lo = v.getBlock(x0, 70, z0 - 3), up = v.getBlock(x0, 71, z0 - 3);
      const walk = () => { p.pos.set(x0 + 0.5, 70, z0 + 0.5); p.vel.set(0, 0, 0); v.look(0, 0); v.key('KeyW'); v.step(0.05, 60); v.key('KeyW', false); return p.pos.z; };
      const zClosed = walk();
      const opens0 = A.door_open || 0;
      p.pos.set(x0 + 0.5, 70, z0 + 0.5); v.look(0, -0.3);
      const open = G.useTarget();
      const sound = (A.door_open || 0) - opens0;
      const zOpen = walk();
      v.entities.clear();
      G.breakAt(x0, 70, z0 - 3, true);
      const gone = [v.getBlock(x0, 70, z0 - 3), v.getBlock(x0, 71, z0 - 3)];
      const drops = v.entities.items.map((i) => i.stack.id + 'x' + i.stack.count);
      const ix = x0 + 2, iz = z0 + 3;
      v.setBlock(ix, 70, iz, C.DOOR_IRON); v.setBlock(ix, 71, iz, C.DOOR_IRON + 1);
      p.pos.set(ix + 0.5, 70, iz - 1.5); v.look(Math.PI, -0.3); v.select(1);
      G.useTarget();
      const byHand = G.doorOpen(ix, 70, iz);
      v.setBlock(ix + 1, 70, iz, B.lever);
      G.toggleLever(ix + 1, 70, iz);
      const byLever = G.doorOpen(ix, 70, iz);
      G.toggleLever(ix + 1, 70, iz);
      return { placed: !!placed, lo: lo > 0 && C.BLOCKS[lo].door, up: up > 0 && C.BLOCKS[up].upper, zClosed, zOpen, wallZ: z0 - 3, open, sound, gone, drops, byHand, byLever, closedAgain: G.doorOpen(ix, 70, iz), oak: I.oak_door };
    });
    expect(r.placed).toBe(true);
    expect(r.lo).toBe('wood');
    expect(r.up).toBe(true);
    expect(r.zClosed).toBeGreaterThan(r.wallZ + 1);
    expect(r.open).toBe('door');
    expect(r.sound).toBe(1);
    expect(r.zOpen).toBeLessThan(r.wallZ);
    expect(r.gone).toEqual([0, 0]);
    expect(r.drops).toEqual([r.oak + 'x1']);
    expect(r.byHand).toBe(false);
    expect(r.byLever).toBe(true);
    expect(r.closedAgain).toBe(false);
  });

  test('сундук: 27 ячеек, двойной - 54, третий рядом не ставится, содержимое переживает перезагрузку, при поломке выпадает', async ({ page }) => {
    await world(page, 'survival');
    const r = await page.evaluate(async () => {
      const v = __voxel, B = v.core.B, p = v.player, inv = v.inv, G = v.game, VX = v.VX;
      const x0 = Math.floor(p.pos.x), z0 = Math.floor(p.pos.z);
      inv.clear(); inv.slots[0] = { id: B.chest, count: 3, dmg: 0 }; inv.slots[1] = { id: B.dirt, count: 40, dmg: 0 }; v.select(0);
      v.setBlock(x0, 70, z0 - 2, B.chest);
      p.pos.set(x0 + 0.5, 70, z0 + 0.5); v.look(0, -0.5);
      G.useTarget();
      const single = G.container && G.container.size;
      VX.inv.click(inv, G.container, 1, 0, true);
      const inChest = G.chestSlots(x0, 70, z0 - 2)[0];
      v.closeInventory();
      v.setBlock(x0 + 1, 70, z0 - 2, B.chest);
      G.useTarget();
      const dbl = G.container.size;
      v.closeInventory();
      p.pos.set(x0 + 2.5, 70, z0 + 0.5); v.look(0, -0.7);
      const aim = v.target();
      const third = v.place();
      await v.flush();
      return { single, inChest, dbl, third, aimZ: aim && aim.place.z, id: v.meta.id, x0, z0 };
    });
    const B = await page.evaluate(() => __voxel.core.B);
    expect(r.single).toBe(27);
    expect(r.inChest).toEqual({ id: B.dirt, count: 40, dmg: 0 });
    expect(r.dbl).toBe(54);
    expect(r.aimZ).toBe(r.z0 - 2);                      // целимся в клетку рядом с двойным сундуком
    expect(r.third).toBe(null);
    await page.reload();
    await page.waitForFunction(() => window.__voxel && __voxel.ready);
    await page.evaluate((id) => { __voxel.settings.renderDistance = 3; __voxel.game.applySettings(); return __voxel.openWorld(id); }, r.id);
    const after = await page.evaluate(({ x0, z0 }) => {
      const v = __voxel;
      const s = v.game.chestSlots(x0, 70, z0 - 2)[0];
      v.entities.clear();
      v.game.breakAt(x0, 70, z0 - 2, true);
      return { s, drops: v.entities.items.map((i) => i.stack.id + 'x' + i.stack.count) };
    }, r);
    expect(after.s).toEqual({ id: B.dirt, count: 40, dmg: 0 });
    expect(after.drops).toContain(B.dirt + 'x40');
    expect(after.drops).toContain(B.chest + 'x1');
  });

  test('кровать: днём - только точка возрождения, ночью сон до утра, при монстрах рядом нельзя; возрождение у кровати, без неё - в начале мира', async ({ page }) => {
    await world(page, 'survival');
    const r = await page.evaluate(() => {
      const v = __voxel, C = v.core, I = v.data.I, p = v.player, inv = v.inv, G = v.game;
      const x0 = Math.floor(p.pos.x), z0 = Math.floor(p.pos.z);
      inv.clear(); inv.slots[0] = { id: I.bed, count: 1, dmg: 0 }; v.select(0);
      p.pos.set(x0 + 0.5, 70, z0 + 4.5); v.look(0, -0.55);
      const placed = G.useTarget();
      const foot = v.getBlock(placed.x, placed.y, placed.z), head = v.getBlock(placed.x, placed.y, placed.z - 1);
      G.ticks = 6000;
      const day = G.useTarget();
      const spawnSet = !!v.meta.bed;
      G.ticks = 18000;
      v.entities.spawnMob('zombie', placed.x + 3.5, 70, placed.z + 0.5);
      const monsters = G.useTarget();
      v.entities.clear();
      const sleep = G.useTarget();
      v.step(0.05, 60);
      const morning = G.ticks % 24000, day2 = Math.floor(G.ticks / 24000);
      p.pos.set(x0 - 4.5, 70, z0 + 0.5); p.damage(100, 'fall'); v.step(0.05, 2);
      G.respawn();
      const atBed = Math.hypot(p.pos.x - (placed.x + 0.5), p.pos.z - (placed.z - 0.5));
      G.breakAt(placed.x, placed.y, placed.z, true);
      p.damage(100, 'fall'); v.step(0.05, 2); G.respawn();
      const atSpawn = Math.hypot(p.pos.x - v.meta.spawn.x, p.pos.z - v.meta.spawn.z);
      return { foot: !!(C.BLOCKS[foot].bed && !C.BLOCKS[foot].bedHead), head: !!C.BLOCKS[head].bedHead, day, spawnSet, monsters, sleep, morning, day2, ach: !!v.ach.got.sleep, atBed, atSpawn };
    });
    expect(r.foot).toBe(true);
    expect(r.head).toBe(true);
    expect(r.day).toBe('day');
    expect(r.spawnSet).toBe(true);
    expect(r.monsters).toBe('monsters');
    expect(r.sleep).toBe('sleep');
    expect(r.morning).toBeLessThan(40);                 // проснулся в начале утра (после - ещё доли секунды)
    expect(r.day2).toBe(1);
    expect(r.ach).toBe(true);
    expect(r.atBed).toBeLessThan(1.1);
    expect(r.atSpawn).toBeLessThan(0.01);
  });
});

test.describe('minecraft_clone_3d_1: фермерство, овцы, лук, мобы, инструменты', () => {
  test('пшеница: мотыга делает грядку, семена растут со временем, мука ускоряет, спелая даёт пшеницу; хлеб и «Хлеб насущный»; трава даёт семена', async ({ page }) => {
    await world(page, 'survival');
    const r = await page.evaluate(() => {
      const v = __voxel, B = v.core.B, I = v.data.I, p = v.player, inv = v.inv, G = v.game, VX = v.VX;
      const x0 = Math.floor(p.pos.x), z0 = Math.floor(p.pos.z);
      v.setBlock(x0, 69, z0 - 2, B.grass);
      inv.clear(); inv.slots[0] = { id: I.wood_hoe, count: 1, dmg: 0 }; inv.slots[1] = { id: I.seeds, count: 5, dmg: 0 }; inv.slots[2] = { id: I.bone_meal, count: 9, dmg: 0 }; v.select(0);
      v.look(0, -0.7);
      const tilled = G.useTarget();
      const farm = v.getBlock(x0, 69, z0 - 2);
      v.select(1); const planted = G.useTarget();
      const crop0 = v.getBlock(x0, 70, z0 - 2);
      for (let k = 0; k < 20 * 400; k++) v.step(0.05);
      const grown = v.getBlock(x0, 70, z0 - 2);
      v.entities.clear();
      G.breakAt(x0, 70, z0 - 2, true);
      const drops = v.entities.items.map((i) => i.stack.id);
      v.select(1); G.useTarget(); v.select(2);
      let meal = 0; while (v.getBlock(x0, 70, z0 - 2) < 71 && meal < 9) { G.useTarget(); meal++; }
      const view = new VX.inv.PlayerView(inv, 3);
      view.onCraft = (rr) => G.emit('craft', { id: rr.outId });
      [0, 1, 2].forEach((i) => { view.grid[i] = { id: I.wheat, count: 1, dmg: 0 }; });
      const bread = view.get(200);
      VX.inv.click(inv, view, 200, 0, false);
      let seeds = 0; for (let k = 0; k < 300; k++) seeds += v.data.dropsOf(B.tall_grass, 0, Math.random).filter((d) => d[0] === I.seeds).length;
      return { tilled, farm, planted, crop0, grown, drops, meal, bread: bread && bread.id, ach: !!v.ach.got.bread, seeds, hoeWear: inv.slots[0] && inv.slots[0].dmg };
    });
    const I = await page.evaluate(() => __voxel.data.I);
    const B = await page.evaluate(() => __voxel.core.B);
    expect(r.tilled).toBe('till');
    expect(r.farm).toBe(B.farmland);
    expect(r.planted).toBe('plant');
    expect(r.crop0).toBe(64);
    expect(r.grown).toBe(71);
    expect(r.drops).toContain(I.wheat);
    expect(r.meal).toBeLessThanOrEqual(4);
    expect(r.bread).toBe(I.bread);
    expect(r.ach).toBe(true);
    expect(r.seeds).toBeGreaterThan(10);
    expect(r.seeds).toBeLessThan(80);
    expect(r.hoeWear).toBe(1);
  });

  test('овцы: ножницы стригут 1-3 шерсти и второй раз нельзя; краситель красит овцу, её шерсть того же цвета', async ({ page }) => {
    await world(page, 'survival');
    const r = await page.evaluate(() => {
      const v = __voxel, B = v.core.B, I = v.data.I, p = v.player, inv = v.inv, E = v.entities;
      inv.clear(); inv.slots[0] = { id: I.shears, count: 1, dmg: 0 }; inv.slots[1] = { id: I.red_dye, count: 1, dmg: 0 }; v.select(0);
      v.look(0, -0.6);
      const s = v.spawnMob('sheep', 0, -1.8); s.y = 70;
      const pin = (m) => { m.x = p.pos.x; m.z = p.pos.z - 1.8; m.y = 70; m.vx = m.vz = 0; };
      pin(s); const first = v.place();
      const wool = E.items.filter((i) => i.stack.id === B.wool_white).reduce((n, i) => n + i.stack.count, 0);
      pin(s); const again = v.place();
      E.clear(); const s2 = v.spawnMob('sheep', 0, -1.8); s2.y = 70;
      v.select(1); pin(s2); v.place();
      const color = s2.color, dyeLeft = inv.count(I.red_dye);
      v.select(0); pin(s2); v.place();
      const red = E.items.filter((i) => i.stack.id === B.wool_red).length;
      return { first, wool, again, color, dyeLeft, red, wear: inv.slots[0].dmg };
    });
    expect(r.first).toBe('mob');
    expect(r.wool).toBeGreaterThanOrEqual(1);
    expect(r.wool).toBeLessThanOrEqual(3);
    expect(r.again).not.toBe('mob');
    expect(r.color).toBe('red');
    expect(r.dyeLeft).toBe(0);
    expect(r.red).toBe(1);
    expect(r.wear).toBe(2);
  });

  test('лук: полный натяг - 9 урона, стрела тратится, втыкается и подбирается; скелет стреляет; «Меткий стрелок» только за скелета, убитого стрелой', async ({ page }) => {
    await world(page, 'survival');
    const r = await page.evaluate(() => {
      const v = __voxel, B = v.core.B, I = v.data.I, p = v.player, inv = v.inv, E = v.entities, G = v.game;
      inv.clear(); inv.slots[0] = { id: I.bow, count: 1, dmg: 0 }; inv.slots[1] = { id: I.arrow, count: 5, dmg: 0 }; v.select(0);
      v.look(0, -0.12);
      const pig = v.spawnMob('pig', 0, -6); pig.y = 70;
      const pin = () => { pig.x = p.pos.x; pig.z = p.pos.z - 6; pig.y = 70; pig.vx = pig.vz = 0; };
      pin(); const hp0 = pig.hp;
      G.shootBow(1.0);
      for (let k = 0; k < 20; k++) { pin(); v.step(0.02); }
      const dmg = hp0 - pig.hp;
      const arrowsLeft = inv.count(I.arrow);
      E.clear();
      const x0 = Math.floor(p.pos.x), z0 = Math.floor(p.pos.z);
      for (let y = 70; y < 73; y++) v.setBlock(x0, y, z0 + 5, B.stone);
      v.look(Math.PI, 0); G.shootBow(1.0);
      v.step(0.02, 40);
      const stuck = E.arrows.filter((q) => q.stuck === true).length;
      p.pos.z = z0 + 4.1; v.step(0.05, 20);
      const back = inv.count(I.arrow);
      E.clear(); p.pos.set(x0 + 0.5, 70, z0 + 0.5); p.health = 20; p.hurtCool = 0;
      G.ticks = 18000; G.dayLight = 0;
      const sk = v.spawnMob('skeleton', 0, -9); sk.y = 70; sk.shootT = 0;
      let hurt = false; for (let k = 0; k < 200 && !hurt; k++) { G.dayLight = 0; v.step(0.02); if (p.health < 20) hurt = true; }
      const s1 = v.spawnMob('skeleton', 0, -2); E.hurtMob(s1, 100, p.pos.x, p.pos.z, 'player');
      const bySword = !!v.ach.got.archer;
      const s2 = v.spawnMob('skeleton', 0, -2); E.hurtMob(s2, 100, p.pos.x, p.pos.z, 'arrow');
      return { dmg, arrowsLeft, stuck, back, hurt, bySword, byArrow: !!v.ach.got.archer };
    });
    expect(r.dmg).toBe(9);
    expect(r.arrowsLeft).toBe(4);
    expect(r.stuck).toBe(1);
    expect(r.back).toBe(4);
    expect(r.hurt).toBe(true);
    expect(r.bySword).toBe(false);
    expect(r.byArrow).toBe(true);
  });

  test('мобы: паук лезет по стене; скелет горит на солнце, паук - нет; курица падает медленно; добыча с коровы и курицы', async ({ page }) => {
    await world(page, 'survival');
    const r = await page.evaluate(() => {
      const v = __voxel, B = v.core.B, I = v.data.I, p = v.player, E = v.entities, G = v.game;
      const x0 = Math.floor(p.pos.x), z0 = Math.floor(p.pos.z);
      G.ticks = 18000; G.dayLight = 0;
      for (let dx = -3; dx <= 3; dx++) for (let y = 70; y < 73; y++) v.setBlock(x0 + dx, y, z0 - 3, B.stone);
      p.pos.set(x0 + 0.5, 73, z0 - 4.5); p.flying = true;
      const sp = v.spawnMob('spider', 0, 4.5); sp.y = 70;
      let maxY = 70; for (let k = 0; k < 150; k++) { G.dayLight = 0; v.step(0.03); maxY = Math.max(maxY, sp.y); }
      E.clear();
      G.ticks = 6000; p.pos.y = 140;
      const sk = E.spawnMob('skeleton', x0 - 4.5, 70, z0 + 4.5), sp2 = E.spawnMob('spider', x0 + 4.5, 70, z0 + 4.5);
      for (let k = 0; k < 60; k++) { G.dayLight = 1; v.step(0.1); sk.x = x0 - 4.5; sk.z = z0 + 4.5; sp2.x = x0 + 4.5; sp2.z = z0 + 4.5; }
      const ch = E.spawnMob('chicken', x0 + 0.5, 80, z0 + 0.5);
      v.step(0.05, 20);
      const fallen = 80 - ch.y;
      E.clear(); p.pos.set(x0 + 0.5, 70, z0 + 0.5);
      let beef = 0, feather = 0, leather = 0, chicken = 0;
      for (let k = 0; k < 20; k++) {
        const c = E.spawnMob('cow', x0 + 0.5, 70, z0 + 0.5); E.hurtMob(c, 100, x0, z0, 'player');
        const h = E.spawnMob('chicken', x0 + 0.5, 70, z0 + 0.5); E.hurtMob(h, 100, x0, z0, 'player');
      }
      for (const it of E.items) { const id = it.stack.id, n = it.stack.count; if (id === I.raw_beef) beef += n; if (id === I.feather) feather += n; if (id === I.leather) leather += n; if (id === I.raw_chicken) chicken += n; }
      return { climbed: maxY - 70, skHp: sk.hp, spHp: sp2.hp, fallen, beef, feather, leather, chicken };
    });
    expect(r.climbed).toBeGreaterThan(2);
    expect(r.skHp).toBeLessThan(20 - 3);
    expect(r.spHp).toBe(16);
    expect(r.fallen).toBeLessThan(3);
    expect(r.beef).toBeGreaterThanOrEqual(20);
    expect(r.chicken).toBe(20);
    expect(r.feather).toBeGreaterThan(0);
    expect(r.leather).toBeGreaterThan(0);
  });

  test('инструменты всех уровней: золото быстрее всех, но руду железа и алмазы не добывает; всё нужное есть в рецептах и печи', async ({ page }) => {
    await openVoxel(page);
    const r = await page.evaluate(() => {
      const D = __voxel.data, B = __voxel.core.B, I = D.I;
      const tiers = ['wood', 'stone', 'iron', 'gold', 'diamond'];
      return {
        stone: tiers.map((k) => D.breakTime(B.stone, I[k + '_pickaxe'])),
        ironOre: tiers.map((k) => D.canHarvest(B.iron_ore, I[k + '_pickaxe'])),
        diamond: tiers.map((k) => D.canHarvest(B.diamond_ore, I[k + '_pickaxe'])),
        missing: ['gold_pickaxe', 'gold_axe', 'gold_shovel', 'gold_sword', 'wood_hoe', 'stone_hoe', 'iron_hoe', 'gold_hoe', 'diamond_hoe', 'leather_helmet', 'diamond_boots', 'bucket', 'shears', 'bow', 'arrow', 'bread', 'chest', 'oak_door', 'iron_door', 'bed', 'lever'].filter((k) => !D.RECIPES.some((rr) => rr.outId === I[k] || rr.outId === B[k])),
        steak: (D.smeltOf(I.raw_beef) || {}).out === I.steak,
        chicken: (D.smeltOf(I.raw_chicken) || {}).out === I.cooked_chicken,
        greenDye: (D.smeltOf(B.cactus) || {}).out === I.green_dye,
      };
    });
    expect(r.stone).toEqual([1.125, 0.5625, 0.375, 0.1875, 0.28125]);
    expect(r.ironOre).toEqual([false, true, true, false, true]);
    expect(r.diamond).toEqual([false, false, true, false, true]);
    expect(r.missing).toEqual([]);
    expect(r.steak).toBe(true);
    expect(r.chicken).toBe(true);
    expect(r.greenDye).toBe(true);
  });
});

test.describe('minecraft_clone_3d_1: перенос построек старой версии', () => {
  test('правки старой версии (cubeworld_edits_v1) становятся миром «Старый мир» на прежнем острове; перенос один раз, старое не стёрто', async ({ page }) => {
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('seeded')) {
        sessionStorage.setItem('seeded', '1');
        localStorage.setItem('cubeworld_edits_v1', JSON.stringify({ '0,20,0': 7, '1,20,0': 7, '2,21,0': 3, '5,3,5': 0 }));
      }
    });
    await openVoxel(page);
    const list = await page.evaluate(() => __voxel.listWorlds());
    expect(list.map((w) => w.name)).toEqual(['Старый мир']);
    await page.evaluate((id) => { __voxel.settings.renderDistance = 3; __voxel.game.applySettings(); return __voxel.openWorld(id); }, list[0].id);
    const r = await page.evaluate(() => {
      const v = __voxel, C = v.core, B = C.B, dy = C.LEG_DY;
      let same = 0, total = 0;
      for (let x = -20; x < 20; x += 3) for (let z = -20; z < 20; z += 3) { total++; const h = C.legHeight(x, z) + dy; const id = v.getBlock(x, h, z); if (id === B.grass || id === B.sand || id === B.oak_log) same++; }
      return { planks: [v.getBlock(0, 20 + dy, 0), v.getBlock(1, 20 + dy, 0)], stone: v.getBlock(2, 21 + dy, 0), hole: v.getBlock(5, 3 + dy, 5), same, total, mode: v.mode, oak: B.oak_planks, st: B.stone };
    });
    expect(r.planks).toEqual([r.oak, r.oak]);
    expect(r.stone).toBe(r.st);
    expect(r.hole).toBe(0);
    expect(r.same).toBe(r.total);
    expect(r.mode).toBe('creative');
    await page.reload();
    await page.waitForFunction(() => window.__voxel && __voxel.ready);
    expect((await page.evaluate(() => __voxel.listWorlds())).length).toBe(1);
    expect(await page.evaluate(() => localStorage.getItem('cubeworld_edits_v1'))).not.toBe(null);
  });
});
