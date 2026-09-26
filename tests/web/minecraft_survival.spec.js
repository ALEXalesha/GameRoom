// Законы «Кубического мира», этап 2 - выживание: урон от падения, добыча с инструментом,
// выпадение и подбор, все рецепты по таблице, печь, еда, воздух, мобы, смерть и возрождение,
// достижения и финальная цель «Сердце мира».
const { test, expect } = require('@playwright/test');
const { openVoxel, newWorld, flatArena } = require('./_voxel-helpers');

test.describe.configure({ timeout: 60000 });   // программная отрисовка в параллельных прогонах медленная

async function survival(page, seed = 8) {
  await openVoxel(page);
  await newWorld(page, { seed, mode: 'survival' });
  await page.evaluate(() => { __voxel.game.autoSpawn = false; __voxel.entities.clear(); __voxel.inv.clear(); });
  await flatArena(page, 70, 7);
}

test.describe('minecraft_clone_3d_1: выживание', () => {
  test('падение с высоты N отнимает N-3 единицы здоровья (в воде и в творческом - ничего)', async ({ page }) => {
    await survival(page);
    const r = await page.evaluate(() => {
      const v = __voxel, p = v.player;
      const fall = (n) => {
        p.health = 20; p.hurtCool = 0; p.pos.y = 70 + n; p.vel.set(0, 0, 0); p.onGround = false; p.fallTop = null;
        v.step(0.01, 400);
        return 20 - p.health;
      };
      const out = {};
      for (const n of [2, 3, 4, 5, 8, 12, 19]) out[n] = fall(n);
      // вода глубиной 2 гасит падение
      const x = Math.floor(p.pos.x), z = Math.floor(p.pos.z);
      v.setBlock(x, 70, z, v.core.B.water); v.setBlock(x, 71, z, v.core.B.water);
      p.pos.x = x + 0.5; p.pos.z = z + 0.5;
      out.water = fall(15);
      return out;
    });
    expect(r).toEqual({ 2: 0, 3: 0, 4: 1, 5: 2, 8: 5, 12: 9, 19: 16, water: 0 });
  });

  test('инструмент ускоряет добычу по формуле оригинала; камень рукой ничего не даёт, киркой - булыжник', async ({ page }) => {
    await survival(page);
    const r = await page.evaluate(() => {
      const v = __voxel, p = v.player, B = v.core.B, I = v.data.I, inv = v.inv;
      const x = Math.floor(p.pos.x), z = Math.floor(p.pos.z) - 2;
      const time = (block, tool) => {
        v.setBlock(x, 70, z, block); v.setBlock(x, 71, z, 0);
        inv.slots[0] = tool ? { id: tool, count: 1, dmg: 0 } : null; v.select(0);
        v.look(0, -0.45);
        return v.mineSeconds(20);
      };
      const out = {
        stoneHand: time(B.stone, 0), stoneWood: time(B.stone, I.wood_pickaxe), stoneStone: time(B.stone, I.stone_pickaxe), stoneIron: time(B.stone, I.iron_pickaxe),
        dirtHand: time(B.dirt, 0), dirtShovel: time(B.dirt, I.wood_shovel), logHand: time(B.oak_log, 0), logAxe: time(B.oak_log, I.stone_axe),
        obsidianHand: time(B.bedrock, 0),
      };
      out.formula = [v.data.breakTime(B.stone, 0), v.data.breakTime(B.stone, I.wood_pickaxe), v.data.breakTime(B.iron_ore, I.wood_pickaxe), v.data.breakTime(B.iron_ore, I.stone_pickaxe)];
      // что выпало: рукой - ничего, киркой - булыжник
      v.entities.clear(); inv.clear();
      time(B.stone, 0);
      out.dropsHand = v.entities.items.length;
      inv.clear(); time(B.stone, I.wood_pickaxe);
      out.dropsPick = v.entities.items.map((i) => i.stack.id);
      out.wear = inv.slots[0] && inv.slots[0].dmg;
      return out;
    });
    const near = (a, b) => expect(Math.abs(a - b)).toBeLessThanOrEqual(0.1);
    near(r.stoneHand, 7.5); near(r.stoneWood, 1.15); near(r.stoneStone, 0.6); near(r.stoneIron, 0.4);
    near(r.dirtHand, 0.75); near(r.dirtShovel, 0.4); near(r.logHand, 3); near(r.logAxe, 0.75);
    expect(r.obsidianHand).toBe(null);                      // бедрок не ломается
    expect(r.formula).toEqual([7.5, 1.125, 7.5, 1.125]);    // железо деревянной киркой - медленно и без добычи
    expect(r.dropsHand).toBe(0);
    expect(r.dropsPick).toEqual([await page.evaluate(() => __voxel.core.B.cobblestone)]);
    expect(r.wear).toBe(1);
  });

  test('выпавший предмет падает, притягивается к игроку и попадает в инвентарь; Q выбрасывает', async ({ page }) => {
    await survival(page);
    const r = await page.evaluate(() => {
      const v = __voxel, p = v.player, E = v.entities, B = v.core.B;
      const it = E.spawnItem({ id: B.oak_log, count: 5 }, p.pos.x + 2.2, p.pos.y + 3, p.pos.z, 0, 0, 0, 0.3);
      v.step(0.02, 10);
      const d0 = Math.hypot(it.x - p.pos.x, it.z - p.pos.z), fell = it.y < p.pos.y + 3;
      v.step(0.02, 150);
      const got = v.inv.count(B.oak_log), left = E.items.length;
      // далеко лежащий не подбирается
      const far = E.spawnItem({ id: B.sand, count: 1 }, p.pos.x + 6, p.pos.y + 0.5, p.pos.z, 0, 0, 0, 0);
      v.step(0.02, 100);
      const farLeft = E.items.includes(far);
      // Q: один предмет из руки летит вперёд и сразу не подбирается
      v.inv.slots[0] = { id: B.dirt, count: 3, dmg: 0 }; v.select(0); v.look(0, 0);
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ' }));
      const thrown = E.items.find((i) => i.stack.id === B.dirt);
      v.step(0.02, 20);
      return { d0, fell, got, left, farLeft, inHand: v.inv.slots[0].count, thrownDist: thrown && Math.hypot(thrown.x - p.pos.x, thrown.z - p.pos.z) };
    });
    expect(r.fell).toBe(true);
    expect(r.got).toBe(5);
    expect(r.left).toBe(0);
    expect(r.farLeft).toBe(true);
    expect(r.inHand).toBe(2);
    expect(r.thrownDist).toBeGreaterThan(1.1);
  });

  test('все рецепты из таблицы дают то, что должны; 2x2 - в инвентаре, 3x3 - только на верстаке', async ({ page }) => {
    await survival(page);
    const r = await page.evaluate(() => {
      const v = __voxel, VX = v.VX, D = v.data, inv = v.inv;
      const ids = (k) => (k[0] === '#' ? D.TAGS[k.slice(1)] : [D.idOf(k)]);
      const out = [];
      for (const rec of D.RECIPES) {
        for (const size of [2, 3]) {
          inv.clear();
          const view = new VX.inv.PlayerView(inv, size);
          let crafted = [];
          view.onCraft = (x) => crafted.push(x.outId);
          const need = rec.shape ? (rec.shape.length <= size && Math.max(...rec.shape.map((s) => s.length)) <= size) : rec.shapeless.length <= size * size;
          if (rec.shape) rec.shape.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== ' ' && y < size && x < size) view.grid[y * size + x] = { id: ids(rec.keys[ch])[0], count: 1, dmg: 0 }; }));
          else rec.shapeless.forEach((k, i) => { if (i < size * size) view.grid[i] = { id: ids(k)[0], count: 1, dmg: 0 }; });
          const shown = view.get(200);
          VX.inv.click(inv, view, 200, 0, false);
          out.push({ out: rec.out[0], size, need, shownId: shown && shown.id, shownN: shown && shown.count, cursor: inv.cursor && inv.cursor.id, cursorN: inv.cursor && inv.cursor.count, left: view.grid.filter(Boolean).length, want: rec.outId, count: rec.count, crafted });
        }
      }
      // узор можно сдвинуть и отразить; лишний предмет ломает рецепт
      inv.clear();
      const vt = new VX.inv.PlayerView(inv, 3), P = v.core.B.oak_planks, S = D.I.stick;
      // топор зеркально и со сдвигом вправо: PP / SP / S.
      vt.grid[1] = { id: P, count: 1 }; vt.grid[2] = { id: P, count: 1 }; vt.grid[4] = { id: S, count: 1 }; vt.grid[5] = { id: P, count: 1 }; vt.grid[7] = { id: S, count: 1 };
      const axeMirror = vt.get(200) && vt.get(200).id;
      vt.grid[0] = { id: S, count: 1 };
      const spoiled = vt.get(200);
      return { out, axeMirror, spoiled, woodAxe: D.I.wood_axe };
    });
    expect(r.out.length).toBeGreaterThanOrEqual(30 * 2);
    for (const o of r.out) {
      if (o.need) {
        expect(o.shownId, `${o.out} в сетке ${o.size}`).toBe(o.want);
        expect(o.shownN).toBe(o.count);
        expect(o.cursor).toBe(o.want);
        expect(o.cursorN).toBe(o.count);
        expect(o.left).toBe(0);                 // по одному из каждой ячейки ушло
        expect(o.crafted).toEqual([o.want]);
      } else expect(o.shownId, `${o.out} не помещается в 2x2`).not.toBe(o.want);   // обрезанный узор может совпасть с другим рецептом (меч -> палки), но не с этим
    }
    expect(r.axeMirror).toBe(r.woodAxe);
    expect(r.spoiled).toBe(null);
  });

  test('верстак и печь открываются ПКМ; печь плавит руду в слиток на угле и горит, пока работает', async ({ page }) => {
    await survival(page);
    const r = await page.evaluate(() => {
      const v = __voxel, p = v.player, B = v.core.B, I = v.data.I, VX = v.VX;
      const x = Math.floor(p.pos.x), z = Math.floor(p.pos.z) - 2;
      v.setBlock(x, 70, z, B.crafting_table);
      v.look(0, -0.45);
      const t1 = v.place();
      const kind1 = v.container && v.container.size;
      v.closeInventory();
      v.setBlock(x, 70, z, B.furnace);
      const t2 = v.place();
      const f = v.container.f;
      f.slots[0] = { id: B.iron_ore, count: 3, dmg: 0 };
      f.slots[1] = { id: I.coal, count: 1, dmg: 0 };
      v.step(0.1, 5);
      const lit = v.getBlock(x, 70, z);
      v.step(0.1, 96);
      const after10 = f.slots[2] && f.slots[2].count;
      v.step(0.1, 250);
      const res = { t1, kind1, t2, lit, after10, out: f.slots[2] && Object.assign({}, f.slots[2]), src: f.slots[0], fuel: f.slots[1], stillLit: v.getBlock(x, 70, z) };
      v.step(0.1, 500);                           // уголь горит 80 секунд, потом печь гаснет
      res.unlit = v.getBlock(x, 70, z);
      // Shift+щелчок забирает результат в инвентарь
      VX.inv.click(v.inv, v.container, 302, 0, true);
      res.taken = v.inv.count(I.iron_ingot);
      // без топлива не плавит
      f.slots[0] = { id: B.sand, count: 1, dmg: 0 }; f.burn = 0;
      v.step(0.1, 150);
      res.noFuel = f.slots[2];
      return res;
    });
    expect(r.t1).toBe('table');
    expect(r.kind1).toBe(3);
    expect(r.t2).toBe('furnace');
    expect(r.lit).toBe(await page.evaluate(() => __voxel.core.B.furnace_lit));
    expect(r.after10).toBe(1);                         // 10 секунд на слиток
    expect(r.out).toEqual({ id: await page.evaluate(() => __voxel.data.I.iron_ingot), count: 3, dmg: 0 });
    expect(r.src).toBe(null);
    expect(r.fuel).toBe(null);                         // уголь взят в топку (80 секунд хватает на 8)
    expect(r.stillLit).toBe(r.lit);                    // как в оригинале: топливо догорает, даже когда плавить нечего
    expect(r.unlit).toBe(await page.evaluate(() => __voxel.core.B.furnace));
    expect(r.taken).toBe(3);
    expect(r.noFuel).toBe(null);
  });

  test('голод, еда и воздух: под водой 15 секунд воздуха, потом урон; жареное мясо кормит лучше сырого', async ({ page }) => {
    await survival(page);
    const r = await page.evaluate(() => {
      const v = __voxel, p = v.player, B = v.core.B, I = v.data.I;
      const x = Math.floor(p.pos.x), z = Math.floor(p.pos.z);
      for (let y = 70; y < 74; y++) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) v.setBlock(x + dx, y, z + dz, B.water);
      p.pos.set(x + 0.5, 70, z + 0.5); p.vel.set(0, 0, 0);
      p.food = 17;                                 // ниже 18 - без лечения от сытости
      v.step(0.1, 140);
      const h14 = p.health, air14 = p.air;
      v.step(0.1, 60);
      const h20 = p.health;
      for (let y = 70; y < 74; y++) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) v.setBlock(x + dx, y, z + dz, 0);
      // еда: держать ПКМ 1.6 секунды
      p.food = 6; p.saturation = 0;
      v.inv.slots[0] = { id: I.raw_porkchop, count: 1, dmg: 0 }; v.inv.slots[1] = { id: I.cooked_porkchop, count: 2, dmg: 0 };
      v.select(0); v.game.mouse.r = true; v.place(); v.step(0.1, 10); const early = p.food; v.step(0.1, 8); v.game.mouse.r = false;
      const raw = p.food;
      v.select(1); v.game.mouse.r = true; v.place(); v.step(0.1, 18); v.game.mouse.r = false;
      const cooked = p.food - raw;
      // бег тратит сытость: коридор длиной 50 блоков
      for (let k = 0; k < 50; k++) { v.setBlock(x, 69, z - k, B.stone); for (let y = 70; y < 73; y++) v.setBlock(x, y, z - k, 0); }
      p.pos.set(x + 0.5, 70, z + 0.5); p.vel.set(0, 0, 0);
      p.food = 20; p.saturation = 0; p.exhaustion = 0;
      v.look(0, 0); v.key('KeyW'); v.key('ControlLeft'); v.step(0.05, 160); v.key('KeyW', false); v.key('ControlLeft', false);
      return { h14, air14, h20, early, raw: raw - 6, cooked, afterRun: p.food, eatenAch: !!v.ach.got.food };
    });
    expect(r.h14).toBe(20);                // 14 секунд под водой - ещё цел
    expect(r.air14).toBeGreaterThan(0);
    expect(r.h20).toBeLessThanOrEqual(12); // дальше по 2 в секунду
    expect(r.early).toBe(6);               // за секунду ещё не съел
    expect(r.raw).toBe(3);
    expect(r.cooked).toBe(8);
    expect(r.eatenAch).toBe(true);
    expect(r.afterRun).toBeLessThan(20);
  });

  test('мобы: удар мечом убивает свинью и даёт мясо; зомби догоняет и бьёт; зомби горит на солнце, под крышей - нет', async ({ page }) => {
    await survival(page);
    const r = await page.evaluate(() => {
      const v = __voxel, p = v.player, G = v.game, E = v.entities, I = v.data.I, B = v.core.B;
      G.ticks = 6000; G.dayLight = 1;
      // свинья перед игроком
      const pig = v.spawnMob('pig', 0, -1.6);
      v.inv.slots[0] = { id: I.stone_sword, count: 1, dmg: 0 }; v.select(0);
      v.look(0, -0.6);
      let hits = 0;
      while (pig.hp > 0 && hits < 10) { pig.x = p.pos.x; pig.z = p.pos.z - 1.6; pig.y = 70; E.attack(); hits++; pig.hurtT = 0; }
      v.step(0.05, 40);
      const pork = v.inv.count(I.raw_porkchop);
      // зомби ночью под крышей догоняет и бьёт
      G.ticks = 18000; G.dayLight = 0;
      const z0 = v.spawnMob('zombie', 5, 0);
      const d0 = Math.hypot(z0.x - p.pos.x, z0.z - p.pos.z);
      p.health = 20;
      v.step(0.05, 80);
      const dz = Math.hypot(z0.x - p.pos.x, z0.z - p.pos.z), hpAfter = p.health;
      E.clear();
      // солнце: зомби на открытом месте горит, под крышей - цел
      G.ticks = 6000;
      const x = Math.floor(p.pos.x) + 4, z = Math.floor(p.pos.z) + 4;
      for (let dx = -1; dx <= 1; dx++) for (let dzz = -1; dzz <= 1; dzz++) v.setBlock(x + dx, 73, z + dzz, B.stone);
      const sun = E.spawnMob('zombie', p.pos.x - 4, 70, p.pos.z - 4);
      const shade = E.spawnMob('zombie', x + 0.5, 70, z + 0.5);
      p.pos.y = 130; p.flying = true;             // игрок далеко, зомби не бегут
      const hp0 = [sun.hp, shade.hp];
      for (let i = 0; i < 60; i++) { G.dayLight = 1; v.step(0.1); sun.x = p.pos.x - 4; sun.z = p.pos.z - 4; shade.x = x + 0.5; shade.z = z + 0.5; }
      return { hits, pork, d0, dz, hpAfter, sunHp: sun.hp, shadeHp: shade.hp, hp0, sunFire: sun.fireT > 0 || sun.deadT > 0 };
    });
    expect(r.hits).toBe(2);                    // каменный меч: 5 урона, у свиньи 10
    expect(r.pork).toBeGreaterThanOrEqual(1);
    expect(r.dz).toBeLessThan(r.d0);
    expect(r.hpAfter).toBeLessThan(20);
    expect(r.sunHp).toBeLessThan(r.hp0[0] - 3);
    expect(r.sunFire).toBe(true);
    expect(r.shadeHp).toBe(r.hp0[1]);
  });

  test('смерть: экран «Вы погибли!», вещи выпадают на месте, возрождение в точке появления с полным здоровьем; состояние сохраняется', async ({ page }) => {
    await survival(page);
    const r = await page.evaluate(async () => {
      const v = __voxel, p = v.player, B = v.core.B;
      v.inv.slots[3] = { id: B.cobblestone, count: 20, dmg: 0 };
      p.pos.x += 5; p.pos.z -= 4;                  // гибнем в стороне от точки появления
      const at = [p.pos.x, p.pos.z];
      p.damage(25, 'fall');
      v.step(0.05, 2);      // смерть замечает игровой цикл
      return { state: v.state, items: v.entities.items.length, inv: v.inv.count(B.cobblestone), at };
    });
    expect(r.state).toBe('dead');
    await expect(page.locator('#scr-death')).toBeVisible();
    await expect(page.locator('#scr-death')).toContainText('Разбился, упав с высоты');
    expect(r.items).toBe(1);
    expect(r.inv).toBe(0);
    await page.locator('#scr-death').getByText('Возродиться').click();
    const s = await page.evaluate(async () => {
      const v = __voxel, p = v.player;
      v.begin();
      p.health = 13; p.food = 11;
      v.inv.slots[0] = { id: v.core.B.torch, count: 7, dmg: 0 };
      const res = { state: v.state, x: p.pos.x, z: p.pos.z, spawn: v.meta.spawn };
      await v.flush();
      return res;
    });
    expect(s.state).toBe('play');
    expect(s.x).toBe(s.spawn.x);
    expect(s.z).toBe(s.spawn.z);
    // здоровье, голод и инвентарь переживают перезагрузку
    const id = await page.evaluate(() => __voxel.meta.id);
    await page.reload();
    await page.waitForFunction(() => window.__voxel && __voxel.ready);
    await page.evaluate((id) => { __voxel.settings.renderDistance = 3; __voxel.game.applySettings(); return __voxel.openWorld(id); }, id);
    const back = await page.evaluate(() => ({ h: __voxel.player.health, f: __voxel.player.food, t: __voxel.inv.slots[0], mode: __voxel.mode }));
    expect(back).toEqual({ h: 13, f: 11, t: { id: await page.evaluate(() => __voxel.core.B.torch), count: 7, dmg: 0 }, mode: 'survival' });
  });

  test('факел светит: у факела в тёмной комнате свет блоков, без него - темно', async ({ page }) => {
    await survival(page);
    const r = await page.evaluate(() => {
      const v = __voxel, C = v.core, B = C.B;
      const chunks = []; for (let k = 0; k < 9; k++) chunks.push(new Uint8Array(C.CVOL));
      // закрытая коробка из камня 5x5x5 внутри куска, в центре - факел
      const box = (withTorch) => {
        const c = chunks.map((d) => d.slice());
        for (let x = 4; x <= 10; x++) for (let y = 60; y <= 66; y++) for (let z = 4; z <= 10; z++) {
          const edge = x === 4 || x === 10 || y === 60 || y === 66 || z === 4 || z === 10;
          c[4][C.cidx(x, y, z)] = edge ? B.stone : 0;
        }
        if (withTorch) c[4][C.cidx(7, 61, 7)] = B.torch;
        const m = C.buildMesh(c, {});
        // внутренняя грань западной стены (x = 5) - в двух клетках от факела
        let maxBlk = 0, maxSky = 0;
        for (let v2 = 0; v2 < m.opaque.pos.length / 3; v2++) { const X = m.opaque.pos[v2 * 3], Y = m.opaque.pos[v2 * 3 + 1], Z = m.opaque.pos[v2 * 3 + 2]; if (X === 5 && Y >= 61 && Y <= 66 && Z >= 5 && Z <= 10) { maxBlk = Math.max(maxBlk, m.opaque.light[v2 * 4 + 1]); maxSky = Math.max(maxSky, m.opaque.light[v2 * 4]); } }
        return { maxBlk: Math.round(maxBlk / 17), maxSky };
      };
      return { dark: box(false), lit: box(true) };
    });
    expect(r.dark.maxBlk).toBe(0);
    expect(r.dark.maxSky).toBe(0);                  // закрытая коробка: небо не видно
    expect(r.lit.maxBlk).toBeGreaterThanOrEqual(10);
    expect(r.lit.maxBlk).toBeLessThanOrEqual(13);   // свет гаснет с расстоянием
  });
});

test.describe('minecraft_clone_3d_1: достижения', () => {
  test('каждое достижение даётся своим условием и только им (таблица целиком)', async ({ page }) => {
    await openVoxel(page);
    const r = await page.evaluate(() => {
      const D = __voxel.data;
      const res = [];
      // событие, которое выполняет условие достижения
      const evOf = (a) => {
        if (a.set) return [a.on, { id: a.set[0] }];
        if (a.on === 'kill') return ['kill', { mob: a.mob }];
        if (a.on === 'depth') return ['depth', { y: a.below - 1 }];
        return [a.on, {}];
      };
      for (const a of D.ACH) {
        const got = {}, progress = {};
        const [ev, data] = evOf(a);
        let ids = [];
        for (let k = 0; k < (a.count || 1); k++) ids = ids.concat(D.achieveOn(ev, ev === 'biome' ? { biome: k } : data, progress, got).map((x) => x.id));
        // «чужие» события этого достижения не дают
        const wrong = [];
        for (const b of D.ACH) {
          if (b === a) continue;
          if (a.on === 'kill' && b.on === 'kill' && b.mob === a.mob && (b.count || 1) >= (a.count || 1)) continue;   // 10 побед включают одну
          const [ev2, data2] = evOf(b);
          const g2 = {}, p2 = {};
          for (let k = 0; k < (b.count || 1); k++) for (const x of D.achieveOn(ev2, ev2 === 'biome' ? { biome: k } : data2, p2, g2)) if (x.id === a.id) wrong.push(b.id);
        }
        // недостаточное условие не даёт
        let partial = null;
        if (a.count) { const g3 = {}, p3 = {}; let got3 = []; for (let k = 0; k < a.count - 1; k++) got3 = got3.concat(D.achieveOn(ev, ev === 'biome' ? { biome: k } : data, p3, g3).map((x) => x.id)); partial = got3.includes(a.id); }
        if (a.on === 'depth') partial = D.achieveOn('depth', { y: a.below + 5 }, {}, {}).some((x) => x.id === a.id);
        if (a.set) partial = D.achieveOn(a.on, { id: 1 }, {}, {}).some((x) => x.id === a.id);   // блок травы - не то
        res.push({ id: a.id, ok: ids.includes(a.id), wrong, partial });
      }
      return { res, n: D.ACH.length, final: D.ACH.filter((a) => a.final).map((a) => a.id) };
    });
    expect(r.n).toBeGreaterThanOrEqual(15);
    expect(r.n).toBeLessThanOrEqual(25);
    expect(r.final).toEqual(['heart']);
    for (const a of r.res) {
      expect(a.ok, a.id).toBe(true);
      expect(a.wrong, a.id).toEqual([]);
      if (a.partial !== null) expect(a.partial, a.id).toBe(false);
    }
  });

  test('в игре: доски из бревна - всплывающее «Достижение получено!», дом из досок засчитан, пещера - нет; экран «Достижения»', async ({ page }) => {
    await survival(page);
    const r = await page.evaluate(() => {
      const v = __voxel, p = v.player, B = v.core.B, VX = v.VX;
      // крафт досок через окно инвентаря
      v.openInventory();
      const view = v.container;
      view.grid[0] = { id: B.oak_log, count: 1, dmg: 0 };
      VX.inv.click(v.inv, view, 200, 0, true);
      v.closeInventory();
      const planks = !!v.ach.got.planks, toast = [...document.querySelectorAll('.toast')].map((t) => t.textContent).join(' | ');
      // комната 3x3x3 внутри, стены - доски
      const x0 = Math.floor(p.pos.x), y0 = 70, z0 = Math.floor(p.pos.z);
      const room = (mat, hole) => {
        for (let x = -2; x <= 2; x++) for (let y = -1; y <= 3; y++) for (let z = -2; z <= 2; z++) {
          const edge = Math.abs(x) === 2 || Math.abs(z) === 2 || y === -1 || y === 3;
          v.setBlock(x0 + x, y0 + y, z0 + z, edge ? mat : 0);
        }
        if (hole) v.setBlock(x0, y0 + 3, z0, 0);
        p.pos.set(x0 + 0.5, y0, z0 + 0.5);
        return VX.ach.isHouse(x0, y0, z0);
      };
      const caveReal = room(B.stone, false) || room(B.dirt, false);     // закрытая пещера в камне или земле - не дом
      const holed = room(B.oak_planks, true);
      const before = !!v.ach.got.house;
      const house = room(B.oak_planks, false);
      v.step(0.1, 12);
      return { planks, toast, caveReal, holed, before, house, got: !!v.ach.got.house };
    });
    expect(r.planks).toBe(true);
    expect(r.toast).toContain('Достижение получено!');
    expect(r.toast).toContain('Доски');
    expect(r.caveReal).toBe(false);
    expect(r.holed).toBe(false);
    expect(r.before).toBe(false);
    expect(r.house).toBe(true);
    expect(r.got).toBe(true);
    await page.keyboard.press('Escape');
    await page.locator('#scr-pause').getByText('Достижения').click();
    await expect(page.locator('#scr-ach')).toBeVisible();
    await expect(page.locator('.ach.got')).toHaveCount(await page.evaluate(() => Object.keys(__voxel.ach.got).length));
    await expect(page.locator('#scr-ach .hint')).toContainText(/Получено: \d+ из \d+/);
  });

  test('финал: «Сердце мира» (золото, алмазы, яблоко) на верстаке открывает экран победы с титрами, играть можно дальше', async ({ page }) => {
    await survival(page);
    const r = await page.evaluate(() => {
      const v = __voxel, p = v.player, B = v.core.B, I = v.data.I, VX = v.VX;
      v.game.testMode = true;
      const x = Math.floor(p.pos.x), z = Math.floor(p.pos.z) - 2;
      v.setBlock(x, 70, z, B.crafting_table);
      v.look(0, -0.45);
      v.place();
      const view = v.container;
      const G_ = { id: I.gold_ingot, count: 1, dmg: 0 }, Dm = { id: I.diamond, count: 1, dmg: 0 }, A = { id: I.apple, count: 1, dmg: 0 };
      [G_, Dm, G_, Dm, A, Dm, G_, Dm, G_].forEach((s, i) => { view.grid[i] = Object.assign({}, s); });
      const shown = view.get(200);
      VX.inv.click(v.inv, view, 200, 0, false);
      return { shown: shown && shown.id, heart: I.world_heart, cursor: v.inv.cursor && v.inv.cursor.id };
    });
    expect(r.shown).toBe(r.heart);
    expect(r.cursor).toBe(r.heart);
    await expect(page.locator('#scr-victory')).toBeVisible();
    await expect(page.locator('#scr-victory')).toContainText('Победа!');
    await expect(page.locator('#scr-victory')).toContainText('Вы собрали Сердце мира');
    const st = await page.evaluate(() => ({ s: __voxel.state, won: __voxel.meta.won, t: __voxel.ticks }));
    expect(st.s).toBe('victory');
    expect(st.won).toBe(true);
    await page.locator('#scr-victory').getByText('Продолжить игру').click();
    expect(await page.evaluate(() => __voxel.state)).toBe('play');
  });
});
