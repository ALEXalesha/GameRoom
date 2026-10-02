// Законы «Кубического мира», четвёртый заход: зелья - бутылочка из воды, варочная стойка с топливом,
// цепочки рецептов (грубое, исцеление, стремительность, огнестойкость, ночное зрение, сила, долгие, II,
// взрывные), питьё и действия, взрывные зелья, сохранение; морковь и арбузы.
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
    window.hold = (id, n) => { const v = __voxel; v.inv.slots[0] = { id, count: n || 1, dmg: 0 }; v.select(0); };
    window.base = () => { const p = __voxel.player; return { x0: Math.floor(p.pos.x), z0: Math.floor(p.pos.z) }; };
  });
}

test.describe('minecraft_clone_3d_1: зелья', () => {
  test('варочная стойка: вода + нарост = грубое за 20 с на огненном порошке; дальше сахар, красный камень, светокамень, порох; без топлива не варит', async ({ page }) => {
    await world(page);
    const r = await page.evaluate(() => {
      const v = __voxel, I = v.data.I, BR = v.VX.brewing, C = v.core, B = C.B;
      const st = BR.newStand();
      const s = (k, id, n) => { st.slots[k] = id ? { id, count: n || 1, dmg: 0 } : null; };
      [0, 1, 2].forEach((k) => s(k, I.water_bottle)); s(3, I.nether_wart, 5);
      BR.tickStand(st, 25); const noFuel = st.slots.slice(0, 3).map((q) => q.id);
      s(4, I.blaze_powder, 1);
      BR.tickStand(st, 19.9); const early = st.slots[0].id;
      BR.tickStand(st, 0.2); const awk = st.slots.slice(0, 3).map((q) => q.id);
      const fuelLeft = st.fuel, wartLeft = st.slots[3] && st.slots[3].count;
      const step = (ing) => { s(3, ing, 1); BR.tickStand(st, 0.05); BR.tickStand(st, 20); return st.slots[0].id; };
      const sw = step(I.sugar), swLong = step(C.WIRE);
      s(0, I.swiftness); const sw2 = step(B.glowstone);
      s(0, I.swiftness); const splash = step(I.gunpowder);
      const rec = [['awkward', 'glistering_melon', 'healing'], ['awkward', 'magma_cream', 'fire_resistance'], ['awkward', 'golden_carrot', 'night_vision'], ['awkward', 'blaze_powder', 'strength'], ['healing', 'glowstone', 'healing_strong']].map(([a, b, c]) => BR.brewOf(I[a], I[b] || B[b]) === I[c]);
      const wrong = BR.brewOf(I.water_bottle, I.sugar);
      return { noFuel, early, awk, fuelLeft, wartLeft, sw, swLong, sw2, splash, rec, wrong, I: { wb: I.water_bottle, awk: I.awkward, sw: I.swiftness, swl: I.swiftness_long, sw2: I.swiftness_strong, spl: I.splash_swiftness } };
    });
    expect(r.noFuel).toEqual([r.I.wb, r.I.wb, r.I.wb]);
    expect(r.early).toBe(r.I.wb);
    expect(r.awk).toEqual([r.I.awk, r.I.awk, r.I.awk]);
    expect(r.fuelLeft).toBe(19);
    expect(r.wartLeft).toBe(4);
    expect(r.sw).toBe(r.I.sw);
    expect(r.swLong).toBe(r.I.swl);
    expect(r.sw2).toBe(r.I.sw2);
    expect(r.splash).toBe(r.I.spl);
    expect(r.rec).toEqual([true, true, true, true, true]);
    expect(r.wrong).toBe(0);
  });

  test('бутылочка наполняется из источника; выпить (ПКМ 1.6 с): стремительность - быстрее на 20%, бутылочка остаётся; исцеление II +8; сила +3 к удару; огнестойкость - лава не жжёт; ночное зрение - светло; действия хранятся', async ({ page }) => {
    await world(page);
    const r = await page.evaluate(async () => {
      const v = __voxel, I = v.data.I, BR = v.VX.brewing, C = v.core, B = C.B, p = v.player, G = v.game;
      const { x0, z0 } = base();
      v.setBlock(x0, 69, z0 - 2, B.water);
      hold(I.glass_bottle, 2); aim(x0 + 0.5, 69.9, z0 - 1.5);
      const filled = v.place(); const bottles = [v.inv.count(I.glass_bottle), v.inv.count(I.water_bottle)];
      v.setBlock(x0, 69, z0 - 2, B.stone);
      // выпить стремительность
      v.inv.clear(); hold(I.swiftness);
      v.look(0, 0);
      G.mouse.r = true; v.place(); v.step(0.05, 34); G.mouse.r = false;
      const speed = p.effects.speed, left = v.inv.slots[0] && v.inv.slots[0].id;
      p.vel.set(0, 0, 0); v.key('KeyW'); v.step(0.05, 10); const z1 = p.pos.z; v.step(0.05, 20); v.key('KeyW', false);
      const fast = (z1 - p.pos.z);
      delete p.effects.speed;
      p.vel.set(0, 0, 0); p.pos.set(x0 + 0.5, 70, z0 + 0.5); v.key('KeyW'); v.step(0.05, 10); const z2 = p.pos.z; v.step(0.05, 20); v.key('KeyW', false);
      const slow = (z2 - p.pos.z);
      await new Promise((rr) => setTimeout(rr, 100));
      p.effects.speed = { lvl: 1, t: 100 }; await new Promise((rr) => setTimeout(rr, 150));
      const hudText = document.getElementById('effects').textContent;
      // исцеление II
      p.health = 6; BR.apply(v.data.info(I.healing_strong).potion); const healed = p.health;
      // сила
      BR.apply(v.data.info(I.strength).potion);
      v.inv.slots[0] = { id: I.iron_sword, count: 1, dmg: 0 };
      const m = v.spawnMob('zombie', 0, -2); m.y = p.pos.y; v.look(0, -0.3); const hp = m.hp; v.entities.attack(); const hit = hp - m.hp;
      // огнестойкость и лава
      BR.apply(v.data.info(I.fire_resistance).potion);
      p.health = 20; p.hurtCool = 0; const lava = p.damage(4, 'lava', null, true);
      // ночное зрение
      G.ticks = 18000; BR.apply(v.data.info(I.night_vision).potion);
      const nv = G.lightAt(p.pos.x, p.pos.y - 30, p.pos.z);
      // сохранение
      const id = v.meta.id; await v.flush(); await v.exitToTitle(); await v.openWorld(id);
      const kept = Object.keys(v.player.effects).sort();
      v.player.effects.strength.t = 0.1; v.step(0.05, 4);
      return { filled, bottles, speed, left, glass: I.glass_bottle, ratio: fast / slow, hudText, healed, hit, lava, nv, kept, expired: !v.player.effects.strength, ach: !!v.ach.got.drink };
    });
    expect(r.filled).toBe('fill');
    expect(r.bottles).toEqual([1, 1]);
    expect(r.speed.lvl).toBe(1);
    expect(r.speed.t).toBeGreaterThan(170);
    expect(r.left).toBe(r.glass);
    expect(r.ratio).toBeGreaterThan(1.15);
    expect(r.ratio).toBeLessThan(1.25);
    expect(r.hudText).toContain('Скорость');
    expect(r.healed).toBe(14);
    expect(r.hit).toBe(6 + 3);
    expect(r.lava).toBe(false);
    expect(r.nv).toBe(1);
    expect(r.kept).toEqual(['fire_resistance', 'night_vision', 'speed', 'strength']);
    expect(r.expired).toBe(true);
    expect(r.ach).toBe(true);
  });

  test('взрывное зелье: бросок, лопается о землю, лечит тех, кто рядом (ближе - сильнее), нежить - ранит', async ({ page }) => {
    await world(page);
    const r = await page.evaluate(() => {
      const v = __voxel, I = v.data.I, BR = v.VX.brewing, p = v.player;
      p.health = 4; hold(I.splash_healing); v.look(0, -1.3);
      const thrown = v.place();
      for (let k = 0; k < 40 && BR.flying.length; k++) v.step(0.05);
      const z = v.spawnMob('zombie', 0, -1.2); z.y = p.pos.y;
      hold(I.splash_healing); v.look(0, -1.2); v.place();
      const zh = z.hp; for (let k = 0; k < 40 && BR.flying.length; k++) v.step(0.05);
      return { thrown, health: p.health, left: v.inv.slots[0], zombieHurt: zh - z.hp };
    });
    expect(r.thrown).toBe('throw');
    expect(r.health).toBeGreaterThan(4);
    expect(r.left).toBe(null);
    expect(r.zombieHurt).toBeGreaterThan(0);
  });

  test('морковь растёт на грядке и есть в деревенских полях; золотая морковь, сверкающий арбуз, огненная слизь - по рецептам; арбузы в мире дают 5 долек', async ({ page }) => {
    await world(page);
    const r = await page.evaluate(() => {
      const v = __voxel, I = v.data.I, C = v.core, B = C.B, D = v.data, p = v.player;
      const { x0, z0 } = base();
      v.setBlock(x0, 69, z0 - 2, B.farmland);
      hold(I.carrot, 3); aim(x0 + 0.5, 69.95, z0 - 1.5);
      const planted = v.place();
      let grown = false; for (let k = 0; k < 800 && !grown; k++) { v.step(0.25); grown = v.getBlock(x0, 70, z0 - 2) === C.CARROTS + 3; }
      const drops = D.dropsOf(C.CARROTS + 3, 0, () => 0.99), melon = D.dropsOf(C.MELON, I.iron_axe, Math.random);
      const rec = (k) => !!D.RECIPES.find((q) => q.outId === I[k]);
      // деревенские поля
      const seed = C.seedFrom('8'), w = C.worldOf(seed); let carrotsInVillages = 0, melons = 0;
      for (let cz = -3; cz <= 3; cz++) for (let cx = -3; cx <= 3; cx++) {
        const vil = C.villageAt(w, cx, cz); if (!vil) continue;
        for (const h of vil.houses.filter((hh) => hh.kind === 'farm')) { const d = C.generate(seed, Math.floor(h.x / 16), Math.floor(h.z / 16)); for (const q of d) if (q >= C.CARROTS && q <= C.CARROTS + 3) carrotsInVillages++; }
      }
      for (let cz = -6; cz <= 6; cz++) for (let cx = -6; cx <= 6; cx++) { const d = C.generate(seed, cx, cz); for (const q of d) if (q === C.MELON) melons++; }
      return { planted, grown, drops, melon, recs: ['golden_carrot', 'glistering_melon', 'magma_cream', 'glass_bottle'].map(rec), carrotsInVillages, melons, carrot: I.carrot, slice: I.melon_slice, stand: !!D.RECIPES.find((q) => q.outId === C.BREWING_STAND) };
    });
    expect(r.planted).toBe('plant');
    expect(r.grown).toBe(true);
    expect(r.drops).toEqual([[r.carrot, 4]]);
    expect(r.melon).toEqual([[r.slice, 5]]);
    expect(r.recs).toEqual([true, true, true, true]);
    expect(r.stand).toBe(true);
    expect(r.carrotsInVillages).toBeGreaterThan(0);
    expect(r.melons).toBeGreaterThan(0);
  });
});
