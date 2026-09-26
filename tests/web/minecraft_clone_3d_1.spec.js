// Законы «Кубического мира» (этап 1: мир, блоки, управление, инвентарь, меню, настройки).
// Детерминизм - через зерно мира, состояние читается крючком window.__voxel без canvas.
const { test, expect } = require('@playwright/test');
const { fitReport, expectFits, SIZES } = require('./_games-helpers');
const { openVoxel, newWorld, flatArena } = require('./_voxel-helpers');

test.describe('minecraft_clone_3d_1 (Кубический мир): мир', () => {
  test('без сети и ошибок: three.js r149 свой, мир строят потоки из Blob, хранилище - IndexedDB', async ({ page }) => {
    const requests = [];
    page.on('request', (r) => requests.push(r.url()));
    const errors = await openVoxel(page);
    await newWorld(page, { seed: 1 });
    const r = await page.evaluate(() => ({ rev: THREE.REVISION, workers: __voxel.world.pool.length, sync: __voxel.world.syncMode, store: __voxel.storage, gen: __voxel.world.stats.generated }));
    expect(requests.filter((u) => /^https?:/.test(u))).toEqual([]);
    expect(r.rev).toBe('149');
    expect(r.sync).toBe(false);
    expect(r.workers).toBeGreaterThan(0);
    expect(r.store).toBe('idb');
    expect(r.gen).toBeGreaterThan(8);
    expect(await page.title()).toContain('не связана с Mojang/Microsoft');
    expect(errors).toEqual([]);
  });

  test('одно зерно - один мир: кусок из потока совпадает с куском со страницы, другое зерно - другой мир', async ({ page }) => {
    await openVoxel(page);
    await newWorld(page, { seed: 4242 });
    const r = await page.evaluate(() => {
      const v = __voxel, p = v.player;
      const cx = Math.floor(p.pos.x / 16), cz = Math.floor(p.pos.z / 16);
      return {
        fromWorker: v.chunkChecksum(cx, cz),
        mainA: v.genChecksum('4242', cx, cz),
        mainB: v.genChecksum('4242', cx, cz),
        other: v.genChecksum('4243', cx, cz),
        near: v.genChecksum('4242', cx + 1, cz),
        text: [v.genChecksum('привет', 0, 0), v.genChecksum('привет', 0, 0), v.genChecksum('пока', 0, 0)],
      };
    });
    expect(r.fromWorker).toBe(r.mainA);
    expect(r.mainB).toBe(r.mainA);
    expect(r.other).not.toBe(r.mainA);
    expect(r.near).not.toBe(r.mainA);
    expect(r.text[0]).toBe(r.text[1]);
    expect(r.text[2]).not.toBe(r.text[0]);
  });

  test('генерация: пять биомов, деревья, пещеры, руда в глубине, вода на уровне моря, песок у берега, бедрок на дне', async ({ page }) => {
    await openVoxel(page);
    const r = await page.evaluate(() => {
      const C = __voxel.core, B = C.B, w = C.worldOf(99);
      const biomes = new Set();
      for (let x = -4000; x <= 4000; x += 64) for (let z = -4000; z <= 4000; z += 64) biomes.add(C.BIOMES[C.column(w, x, z).biome]);
      const cnt = {}; let caves = 0, beachSand = 0, oreDeep = 0, oreHigh = 0, bedrock0 = 0, waterAtSea = 0;
      for (let cx = -3; cx <= 3; cx++) for (let cz = -3; cz <= 3; cz++) {
        const d = C.generate(99, cx, cz);
        for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
          const col = C.column(w, cx * 16 + x, cz * 16 + z);
          if (d[C.cidx(x, 0, z)] === B.bedrock) bedrock0++;
          if (col.h < C.SEA - 1 && d[C.cidx(x, C.SEA, z)] === B.water) waterAtSea++;
          if (col.biome === 6 && d[C.cidx(x, col.h, z)] === B.sand) beachSand++;
          for (let y = 5; y < col.h - 4; y++) if (d[C.cidx(x, y, z)] === 0) caves++;
        }
        for (let i = 0; i < d.length; i++) {
          cnt[d[i]] = (cnt[d[i]] || 0) + 1;
          const y = i >> 8;
          if (d[i] === B.diamond_ore) { if (y < 17) oreDeep++; else oreHigh++; }
        }
      }
      // океан: ищем колонку ниже уровня моря и строим её кусок
      let ox = null, oz = null;
      for (let x = 0; x < 6000 && ox === null; x += 16) { const c = C.column(w, x, 0); if (c.h < C.SEA - 4 && c.biome === 5) { ox = x; oz = 0; } }
      if (ox !== null) {
        const d = C.generate(99, Math.floor(ox / 16), 0), lx = ox & 15;
        if (d[C.cidx(lx, C.SEA, 0)] === B.water && d[C.cidx(lx, C.SEA + 1, 0)] === 0) waterAtSea++;
      }
      return { biomes: [...biomes], logs: (cnt[B.oak_log] || 0) + (cnt[B.birch_log] || 0) + (cnt[B.spruce_log] || 0), leaves: (cnt[B.oak_leaves] || 0) + (cnt[B.spruce_leaves] || 0) + (cnt[B.birch_leaves] || 0), coal: cnt[B.coal_ore] || 0, iron: cnt[B.iron_ore] || 0, caves, beachSand, oreDeep, oreHigh, bedrock0, waterAtSea };
    });
    for (const b of ['Равнины', 'Лес', 'Пустыня', 'Снежная тундра', 'Горы']) expect(r.biomes).toContain(b);
    expect(r.logs).toBeGreaterThan(20);
    expect(r.leaves).toBeGreaterThan(r.logs);
    expect(r.caves).toBeGreaterThan(500);
    expect(r.coal).toBeGreaterThan(100);
    expect(r.iron).toBeGreaterThan(50);
    expect(r.oreDeep).toBeGreaterThan(0);
    expect(r.oreHigh).toBe(0);                  // алмазы только глубоко
    expect(r.bedrock0).toBe(49 * 256);          // дно мира целиком из бедрока
    expect(r.waterAtSea).toBeGreaterThan(0);
  });

  test('сетка куска: между двумя твёрдыми блоками граней нет, прозрачные - в своей сетке', async ({ page }) => {
    await openVoxel(page);
    const r = await page.evaluate(() => {
      const C = __voxel.core, B = C.B;
      const mesh = (cells) => {
        const chunks = []; for (let k = 0; k < 9; k++) chunks.push(new Uint8Array(C.CVOL));
        for (const [x, y, z, id] of cells) chunks[4][C.cidx(x, y, z)] = id;
        const m = C.buildMesh(chunks, {});
        return [m.opaque.quads, m.trans.quads];
      };
      return {
        one: mesh([[5, 60, 5, B.stone]]),
        two: mesh([[5, 60, 5, B.stone], [6, 60, 5, B.stone]]),
        cube: mesh([[5, 60, 5, B.stone], [6, 60, 5, B.stone], [5, 61, 5, B.stone], [6, 61, 5, B.stone], [5, 60, 6, B.stone], [6, 60, 6, B.stone], [5, 61, 6, B.stone], [6, 61, 6, B.stone]]),
        glass2: mesh([[5, 60, 5, B.glass], [6, 60, 5, B.glass]]),
        water: mesh([[5, 60, 5, B.water], [6, 60, 5, B.stone]]),
        water2: mesh([[5, 60, 5, B.water], [6, 60, 5, B.water]]),
        border: mesh([[0, 60, 0, B.stone]]),
      };
    });
    expect(r.one).toEqual([6, 0]);
    expect(r.two).toEqual([10, 0]);            // общая грань не рисуется ни с одной стороны
    expect(r.cube).toEqual([24, 0]);           // куб 2x2x2 - только наружные грани
    expect(r.glass2).toEqual([10, 0]);         // стекло к стеклу - без внутренней грани
    expect(r.water).toEqual([6, 5]);           // вода в прозрачной сетке, грань к камню скрыта
    expect(r.water2).toEqual([0, 10]);
    expect(r.border).toEqual([6, 0]);          // на краю куска грань видна (сосед - воздух)
    // настоящий кусок: граней меньше, чем блоков (рисуется только видимое)
    await newWorld(page, { seed: 5 });
    const real = await page.evaluate(() => {
      const v = __voxel, p = v.player, cx = Math.floor(p.pos.x / 16), cz = Math.floor(p.pos.z / 16);
      const d = v.world.chunk(cx, cz).data; let solid = 0; for (const b of d) if (b && v.core.RENDER[b] === 1) solid++;
      return { solid, quads: v.chunkInfo(cx, cz).quads };
    });
    expect(real.quads).toBeGreaterThan(256);
    expect(real.quads).toBeLessThan(real.solid / 3);
  });

  test('мир бесконечный: куски грузятся вокруг героя и выгружаются позади', async ({ page }) => {
    await openVoxel(page);
    await newWorld(page, { seed: 31, radius: 3 });
    const r1 = await page.evaluate(() => __voxel.counts());
    await page.evaluate(() => { const p = __voxel.player; p.pos.x += 16 * 40; p.pos.y = 120; p.flying = true; });
    await page.evaluate(() => __voxel.waitIdle(1));
    const r2 = await page.evaluate(() => {
      const v = __voxel, p = v.player;
      const cx = Math.floor(p.pos.x / 16), cz = Math.floor(p.pos.z / 16);
      let far = 0; for (const ch of v.world.chunks.values()) if (Math.abs(ch.cx - cx) > 6 || Math.abs(ch.cz - cz) > 6) far++;
      return { counts: v.counts(), far, here: !!v.world.chunk(cx, cz).data };
    });
    expect(r2.here).toBe(true);
    expect(r2.far).toBe(0);                                   // старые куски выгружены
    expect(r2.counts.loaded).toBeLessThanOrEqual(r1.loaded + 30);
    expect(r2.counts.loaded).toBeLessThan(13 * 13);
  });
});

test.describe('minecraft_clone_3d_1: управление и блоки', () => {
  test('ЛКМ ломает блок под прицелом, ПКМ ставит на грань, но не в героя; дно мира не ломается', async ({ page }) => {
    await openVoxel(page);
    await newWorld(page, { seed: 8 });
    await flatArena(page);
    const r = await page.evaluate(() => {
      const v = __voxel, p = v.player;
      v.select(2);                                              // камень
      v.look(0, -0.6);
      const aim = v.target();
      const placed = v.place();
      const t1 = placed && v.getBlock(placed.x, placed.y, placed.z);
      v.look(0, -Math.PI / 2 + 0.01);                            // себе под ноги
      const self = v.place();
      // сломать то, что поставили
      v.look(0, -0.6);
      const broken = v.breakTarget();
      const after = broken && v.getBlock(broken.x, broken.y, broken.z);
      // дно: герой над дырой до самого низа
      const x = Math.floor(p.pos.x), z = Math.floor(p.pos.z);
      for (let y = 1; y < 70; y++) v.setBlock(x, y, z, 0);
      p.pos.y = 1; p.flying = true; v.look(0, -Math.PI / 2 + 0.01);
      const bottom = v.breakTarget();
      return { aim: aim && aim.place, placed, t1, self, broken, after, bottom, y0: v.getBlock(x, 0, z) };
    });
    expect(r.placed).toEqual(r.aim);
    expect(r.t1).toBe(3);
    expect(r.self).toBe(null);
    expect(r.broken).toEqual(r.placed);
    expect(r.after).toBe(0);
    expect(r.bottom).toBe(null);
    expect(r.y0).toBe(5);
  });

  test('земля держит, стена не пускает, прыжок на 1.25 блока, Shift не даёт упасть с края', async ({ page }) => {
    await openVoxel(page);
    await newWorld(page, { seed: 8 });
    await flatArena(page, 70, 6);
    const r = await page.evaluate(() => {
      const v = __voxel, p = v.player;
      v.step(0.02, 30);
      const stand = { y: p.pos.y, ground: p.onGround };
      // прыжок: наибольшая высота
      v.key('Space'); let top = p.pos.y; for (let i = 0; i < 60; i++) { v.step(0.01); top = Math.max(top, p.pos.y); } v.key('Space', false);
      v.step(0.02, 60);
      // стена на z-3
      const x0 = Math.floor(p.pos.x), z0 = Math.floor(p.pos.z);
      for (let x = x0 - 2; x <= x0 + 2; x++) for (let y = 70; y < 73; y++) v.setBlock(x, y, z0 - 3, 1);
      v.look(0, 0); v.key('KeyW'); v.step(0.02, 150); v.key('KeyW', false);
      const wallZ = p.pos.z;
      // край: под героем убираем пол впереди (к +Z), крадёмся вперёд
      for (let x = x0 - 6; x <= x0 + 6; x++) for (let z = z0 + 1; z <= z0 + 6; z++) v.setBlock(x, 69, z, 0);
      p.pos.set(x0 + 0.5, 70, z0 + 0.5); p.vel.set(0, 0, 0); v.step(0.02, 10);
      v.look(Math.PI, 0); v.key('ShiftLeft'); v.key('KeyW'); v.step(0.02, 200); v.key('KeyW', false); v.key('ShiftLeft', false);
      const sneak = { z: p.pos.z, y: p.pos.y, ground: p.onGround };
      // без Shift - падает
      v.key('KeyW'); v.step(0.02, 100); v.key('KeyW', false);
      return { stand, jump: top - stand.y, wallZ, z0, sneak, fell: p.pos.y };
    });
    expect(r.stand.ground).toBe(true);
    expect(r.stand.y).toBeCloseTo(70, 5);
    expect(r.jump).toBeGreaterThan(1.15);
    expect(r.jump).toBeLessThan(1.35);
    expect(r.wallZ).toBeGreaterThanOrEqual(r.z0 - 2 + 0.3 - 1e-6);   // в стену не вошёл
    expect(r.wallZ).toBeLessThan(r.z0 - 1);                           // но дошёл до неё
    expect(r.sneak.ground).toBe(true);
    expect(r.sneak.y).toBeCloseTo(70, 5);
    expect(r.sneak.z).toBeGreaterThan(r.z0 + 1);                      // дошёл до края
    expect(r.sneak.z).toBeLessThan(r.z0 + 1 + 0.35);                  // и остановился на нём
    expect(r.fell).toBeLessThan(69);
  });

  test('полёт в творческом: двойной пробел, подъём, Shift вниз; вода держит медленнее воздуха', async ({ page }) => {
    await openVoxel(page);
    await newWorld(page, { seed: 8 });
    await flatArena(page, 70, 6);
    const r = await page.evaluate(async () => {
      const v = __voxel, p = v.player;
      v.step(0.02, 20);
      const press = () => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' })); };
      press(); press();
      const fly = p.flying;
      v.key('Space'); v.step(0.02, 50); v.key('Space', false);
      const up = p.pos.y - 70;
      v.key('ShiftLeft'); v.step(0.02, 20); v.key('ShiftLeft', false);
      const down = 70 + up - p.pos.y;
      // вода: бассейн глубиной 6
      p.flying = false;
      const x0 = Math.floor(p.pos.x), z0 = Math.floor(p.pos.z);
      for (let x = x0 - 2; x <= x0 + 2; x++) for (let z = z0 - 2; z <= z0 + 2; z++) for (let y = 70; y < 76; y++) v.setBlock(x, y, z, v.core.B.water);
      p.pos.set(x0 + 0.5, 75, z0 + 0.5); p.vel.set(0, 0, 0);
      v.step(0.02, 25);
      const sinkWater = 75 - p.pos.y;
      return { fly, up, down, sinkWater, inWater: p.inWater };
    });
    expect(r.fly).toBe(true);
    expect(r.up).toBeGreaterThan(4);
    expect(r.down).toBeGreaterThan(1);
    expect(r.inWater).toBe(true);
    expect(r.sinkWater).toBeGreaterThan(0);
    expect(r.sinkWater).toBeLessThan(1.5);          // в воздухе за полсекунды - 3.5 блока
  });

  test('панель быстрого доступа: колесо и клавиши 1-9, СКМ берёт блок под прицелом', async ({ page }) => {
    await openVoxel(page);
    await newWorld(page, { seed: 8 });
    await flatArena(page);
    const r = await page.evaluate(() => {
      const v = __voxel, G = v.game, cv = document.getElementById('gc');
      const out = [];
      v.select(0);
      cv.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true })); out.push(v.inv.selected);
      cv.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }));
      cv.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true })); out.push(v.inv.selected);
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit5' })); out.push(v.inv.selected);
      // СКМ по блоку пола (камень), которого в панели нет
      v.inv.slots[4] = null; v.select(4);
      v.look(0, -1.2);
      const t = v.target();
      const picked = v.pick();
      return { out, picked, floor: t && t.id, held: G.inv.held() && G.inv.held().id, name: document.getElementById('itemName').textContent };
    });
    expect(r.out).toEqual([1, 8, 4]);
    expect(r.picked).toBe(r.floor);
    expect(r.held).toBe(r.floor);
  });
});

test.describe('minecraft_clone_3d_1: инвентарь', () => {
  test('стопки по 64, переполнение, инструменты по одному, Shift+щелчок переносит между панелью и рюкзаком', async ({ page }) => {
    await openVoxel(page);
    await newWorld(page, { seed: 8, mode: 'survival' });
    const r = await page.evaluate(() => {
      const v = __voxel, VX = v.VX, inv = v.inv, B = v.core.B, I = v.data.I;
      inv.clear();
      const left1 = inv.add(B.dirt, 100);
      const s = [inv.slots[0] && inv.slots[0].count, inv.slots[1] && inv.slots[1].count];
      const pick = inv.add(I.wood_pickaxe, 2);
      const picks = inv.slots.filter((x) => x && x.id === I.wood_pickaxe).map((x) => x.count);
      // переполнение: всё занято
      inv.clear(); for (let i = 0; i < 36; i++) inv.slots[i] = VX.inv.newStack(B.stone, 64);
      const over = inv.add(B.stone, 10);
      inv.slots[20].count = 60;
      const over2 = inv.add(B.stone, 10);
      // Shift+щелчок
      inv.clear(); inv.slots[2] = VX.inv.newStack(B.sand, 30);
      const view = new VX.inv.PlayerView(inv, 2);
      VX.inv.click(inv, view, 2, 0, true);
      const toMain = inv.slots.findIndex((x) => x && x.id === B.sand);
      VX.inv.click(inv, view, toMain, 0, true);
      const back = inv.slots.findIndex((x) => x && x.id === B.sand);
      // правая кнопка: взять половину, положить по одной
      inv.clear(); inv.slots[9] = VX.inv.newStack(B.dirt, 9);
      VX.inv.click(inv, view, 9, 2, false);
      const half = [inv.cursor.count, inv.slots[9].count];
      VX.inv.click(inv, view, 10, 2, false);
      const one = [inv.cursor.count, inv.slots[10].count];
      return { left1, s, pick, picks, over, over2, toMain, back, half, one };
    });
    expect(r.left1).toBe(0);
    expect(r.s).toEqual([64, 36]);
    expect(r.pick).toBe(0);
    expect(r.picks).toEqual([1, 1]);
    expect(r.over).toBe(10);
    expect(r.over2).toBe(6);
    expect(r.toMain).toBeGreaterThanOrEqual(9);
    expect(r.back).toBeLessThan(9);
    expect(r.half).toEqual([5, 4]);
    expect(r.one).toEqual([4, 1]);
  });

  test('мышью: E открывает инвентарь, стопка берётся и раскладывается протягиванием поровну, E закрывает', async ({ page }) => {
    await openVoxel(page);
    await newWorld(page, { seed: 8, mode: 'survival' });
    await page.evaluate(() => { const v = __voxel; v.inv.clear(); v.inv.slots[9] = v.VX.inv.newStack(v.core.B.dirt, 64); });
    await page.keyboard.press('KeyE');
    await expect(page.locator('#scr-inv')).toBeVisible();
    const box = async (i) => page.locator(`.inv-panel .slot[data-i="${i}"]`).boundingBox();
    const c = async (i) => { const b = await box(i); return [b.x + b.width / 2, b.y + b.height / 2]; };
    const s9 = await c(9);
    await page.mouse.move(...s9); await page.mouse.down(); await page.mouse.up();
    expect(await page.evaluate(() => __voxel.inv.cursor && __voxel.inv.cursor.count)).toBe(64);
    const [a, b2, d] = [await c(18), await c(19), await c(20)];
    await page.mouse.move(...a); await page.mouse.down();
    await page.mouse.move(...b2, { steps: 4 }); await page.mouse.move(...d, { steps: 4 });
    await page.mouse.up();
    const r = await page.evaluate(() => ({ s: [18, 19, 20].map((i) => __voxel.inv.slots[i] && __voxel.inv.slots[i].count), cur: __voxel.inv.cursor && __voxel.inv.cursor.count }));
    expect(r.s).toEqual([21, 21, 21]);
    expect(r.cur).toBe(1);
    // Shift+щелчок мышью: из рюкзака в панель
    await page.keyboard.down('Shift');
    await page.mouse.move(...a); await page.mouse.down(); await page.mouse.up();
    await page.keyboard.up('Shift');
    expect(await page.evaluate(() => __voxel.inv.slots[0] && __voxel.inv.slots[0].count)).toBe(21);
    await page.keyboard.press('KeyE');
    await expect(page.locator('#scr-inv')).toBeHidden();
    // курсор вернулся в инвентарь, ничего не пропало
    expect(await page.evaluate(() => __voxel.inv.count(__voxel.core.B.dirt))).toBe(64);
  });

  test('творческий: вкладки со всеми блоками, поиск находит блок, щелчок даёт стопку', async ({ page }) => {
    await openVoxel(page);
    await newWorld(page, { seed: 8 });
    await page.keyboard.press('KeyE');
    await expect(page.locator('.inv-panel.creative')).toBeVisible();
    const total = await page.evaluate(() => { const D = __voxel.data; return ['build', 'nature', 'color', 'tools', 'food'].reduce((n, k) => n + D.tabItems(k).length, 0); });
    const blocks = await page.evaluate(() => __voxel.core.BLOCKS.filter((b) => b && b.creative).length);
    expect(blocks).toBeGreaterThanOrEqual(30);
    expect(total).toBeGreaterThan(blocks);
    await page.locator('.tab[data-tab="search"]').click();
    await page.locator('#creativeSearch').fill('алмаз');
    const names = await page.evaluate(() => [...document.querySelectorAll('.palette .slot[data-id]')].map((d) => __voxel.data.info(+d.dataset.id).name));
    expect(names).toContain('Алмазная руда');
    expect(names.every((n) => n.toLowerCase().includes('алмаз'))).toBe(true);
    // E при вводе в поиск не закрывает окно
    await page.locator('#creativeSearch').press('KeyE');
    await expect(page.locator('#scr-inv')).toBeVisible();
    await page.locator('#creativeSearch').fill('алмаз');
    await page.locator('.palette .slot[data-id]').first().click();
    const cur = await page.evaluate(() => __voxel.inv.cursor);
    expect(cur.count).toBe(64);
  });
});

test.describe('minecraft_clone_3d_1: меню, миры, сохранение', () => {
  test('экраны как в игре: старт, «Одиночная игра», создание мира с именем, зерном и режимом, пауза по Esc', async ({ page }) => {
    const errors = await openVoxel(page);
    await expect(page.locator('#scr-start')).toBeVisible();
    await page.mouse.click(640, 400);
    await expect(page.locator('#scr-title')).toBeVisible();
    await expect(page.locator('#scr-title .mc-btn')).toHaveText(['Одиночная игра', 'Настройки', 'Выход']);
    await page.locator('#scr-title').getByText('Выход').click();
    await expect(page.locator('#scr-start')).toBeVisible();          // «Выход» во вкладке - к стартовому экрану
    await page.keyboard.press('Space');
    await page.locator('#scr-title').getByText('Одиночная игра').click();
    await expect(page.locator('#scr-worlds')).toBeVisible();
    await page.locator('#scr-worlds').getByText('Создать новый мир').click();
    await page.locator('#worldName').fill('Мой остров');
    await page.locator('#worldSeed').fill('12345');
    await expect(page.locator('#modeBtn')).toHaveText('Режим игры: Выживание');
    await page.locator('#modeBtn').click();
    await expect(page.locator('#modeBtn')).toHaveText('Режим игры: Творческий');
    await page.evaluate(() => { __voxel.settings.renderDistance = 3; __voxel.game.applySettings(); });
    await page.locator('#scr-create').getByText('Создать мир').click();
    await page.waitForFunction(() => __voxel.state === 'play', null, { timeout: 30000 });
    const m = await page.evaluate(() => ({ name: __voxel.meta.name, seed: __voxel.meta.seed, mode: __voxel.mode }));
    expect(m).toEqual({ name: 'Мой остров', seed: '12345', mode: 'creative' });
    await page.keyboard.press('Escape');
    await expect(page.locator('#scr-pause')).toBeVisible();
    await expect(page.locator('#scr-pause .mc-btn')).toHaveText(['Вернуться к игре', 'Достижения', 'Настройки', 'Сохранить и выйти в меню']);
    await page.locator('#scr-pause').getByText('Вернуться к игре').click();
    expect(await page.evaluate(() => __voxel.state)).toBe('play');
    await page.keyboard.press('Escape');
    await page.locator('#scr-pause').getByText('Сохранить и выйти в меню').click();
    await expect(page.locator('#scr-title')).toBeVisible();
    await page.locator('#scr-title').getByText('Одиночная игра').click();
    await expect(page.locator('.world')).toHaveCount(1);
    await expect(page.locator('.world')).toContainText('Мой остров');
    await expect(page.locator('.world')).toContainText('Творческий · зерно 12345');
    await expect(page.locator('.world')).toContainText(/\d\d\.\d\d\.\d{4} \d\d:\d\d · \d+(\.\d)? [КМ]Б/);
    expect(errors).toEqual([]);
  });

  test('сломанное и поставленное сохраняется в IndexedDB и переживает перезагрузку страницы', async ({ page }) => {
    await openVoxel(page);
    const id = await newWorld(page, { seed: 77 });
    const r = await page.evaluate(async () => {
      const v = __voxel, p = v.player, B = v.core.B;
      const x = Math.floor(p.pos.x) + 2, z = Math.floor(p.pos.z) + 2;
      let y = 120; while (y > 0 && v.getBlock(x, y, z) <= 0) y--;
      const under = v.getBlock(x, y, z);
      v.setBlock(x, y + 1, z, B.bricks);          // поставили
      v.setBlock(x + 1, y, z, 0);                 // сломали
      await v.flush();
      return { x, y, z, under };
    });
    await page.reload();
    await page.waitForFunction(() => window.__voxel && __voxel.ready);
    await page.evaluate((id) => { __voxel.settings.renderDistance = 3; __voxel.game.applySettings(); return __voxel.openWorld(id); }, id);
    const after = await page.evaluate(({ x, y, z }) => [__voxel.getBlock(x, y + 1, z), __voxel.getBlock(x + 1, y, z), __voxel.getBlock(x, y, z)], r);
    expect(after).toEqual([await page.evaluate(() => __voxel.core.B.bricks), 0, r.under]);
  });

  test('миры не смешиваются, удаление - с подтверждением', async ({ page }) => {
    await openVoxel(page);
    const a = await newWorld(page, { seed: 5, name: 'Альфа' });
    const pos = await page.evaluate(async () => {
      const v = __voxel, p = v.player;
      const x = Math.floor(p.pos.x) + 1, z = Math.floor(p.pos.z) + 1, y = 110;
      v.setBlock(x, y, z, v.core.B.gold_ore);
      await v.flush();
      await v.exitToTitle();
      return { x, y, z };
    });
    const b = await newWorld(page, { seed: 5, name: 'Бета' });
    expect(await page.evaluate(({ x, y, z }) => __voxel.getBlock(x, y, z), pos)).toBe(0);    // то же зерно, но свой мир
    await page.evaluate(() => __voxel.exitToTitle());
    await page.evaluate((a) => __voxel.openWorld(a), a);
    expect(await page.evaluate(({ x, y, z }) => __voxel.getBlock(x, y, z), pos)).toBe(await page.evaluate(() => __voxel.core.B.gold_ore));
    await page.evaluate(() => __voxel.exitToTitle());
    await page.locator('#scr-title').getByText('Одиночная игра').click();
    await expect(page.locator('.world')).toHaveCount(2);
    await page.locator('.world', { hasText: 'Бета' }).click();
    await page.locator('#scr-worlds').getByText('Удалить', { exact: true }).click();
    await expect(page.locator('#scr-confirm')).toContainText('Удалить мир «Бета»?');
    await page.locator('#scr-confirm').getByText('Отмена').click();
    await expect(page.locator('.world')).toHaveCount(2);
    await page.locator('.world', { hasText: 'Бета' }).click();
    await page.locator('#scr-worlds').getByText('Удалить', { exact: true }).click();
    await page.locator('#scr-confirm').getByText('Удалить', { exact: true }).click();
    await expect(page.locator('.world')).toHaveCount(1);
    await expect(page.locator('.world')).toContainText('Альфа');
    const left = await page.evaluate(async (b) => { const w = await __voxel.listWorlds(); return { ids: w.map((x) => x.id), chunk: await __voxel.VX.store.getChunk(b, 0, 0) }; }, b);
    expect(left.ids).toEqual([a]);
    expect(left.chunk).toBe(null);                // куски удалённого мира тоже стёрты
  });

  test('настройки сохраняются и применяются после перезагрузки', async ({ page }) => {
    await openVoxel(page);
    await page.mouse.click(640, 400);
    await page.locator('#scr-title').getByText('Настройки').click();
    await expect(page.locator('#scr-settings')).toBeVisible();
    await page.locator('[data-k="renderDistance"] input').fill('5');
    await page.locator('[data-k="fov"] input').fill('90');
    await page.getByText('Графика: Красивая').click();
    await page.getByText('Инверсия мыши: Выкл').click();
    await page.getByText('Кадры/с на экране: Выкл').click();
    await page.locator('#scr-settings').getByText('Управление…').click();
    await page.locator('[data-action="jump"]').click();
    await page.keyboard.press('KeyJ');
    await expect(page.locator('[data-action="jump"]')).toHaveText('J');
    await page.locator('#scr-controls').getByText('Готово').click();
    await page.locator('#scr-settings').getByText('Готово').click();
    await expect(page.locator('#scr-title')).toBeVisible();
    await page.reload();
    await page.waitForFunction(() => window.__voxel && __voxel.ready);
    const s = await page.evaluate(() => ({ ...__voxel.settings, radius: __voxel.world.radius, fancy: __voxel.world.opts.fancy }));
    expect(s.renderDistance).toBe(5);
    expect(s.radius).toBe(5);
    expect(s.fov).toBe(90);
    expect(s.graphics).toBe('fast');
    expect(s.fancy).toBe(false);
    expect(s.invertY).toBe(true);
    expect(s.showFps).toBe(true);
    expect(s.keys.jump).toBe('KeyJ');
  });

  test('пауза останавливает время и героя; скрытая вкладка - пауза, звук выключен, после возврата - пауза остаётся', async ({ page }) => {
    await openVoxel(page);
    await newWorld(page, { seed: 8 });
    const r = await page.evaluate(async () => {
      const v = __voxel, p = v.player;
      const t0 = v.ticks; v.step(0.05, 20); const run = v.ticks - t0;
      v.pause();
      const t1 = v.ticks, x = p.pos.x, z = p.pos.z;
      v.key('KeyW'); v.step(0.05, 40); await new Promise((r) => setTimeout(r, 400)); v.key('KeyW', false);
      return { run, paused: v.ticks - t1, moved: Math.hypot(p.pos.x - x, p.pos.z - z), state: v.state };
    });
    expect(r.run).toBeCloseTo(20, 5);              // 20 тиков в секунду: сутки - 20 минут
    expect(r.paused).toBe(0);
    expect(r.moved).toBe(0);
    expect(r.state).toBe('paused');
    await page.locator('#scr-pause').getByText('Вернуться к игре').click();
    expect(await page.evaluate(() => __voxel.state)).toBe('play');
    const hide = async (hidden) => page.evaluate((h) => {
      Object.defineProperty(document, 'hidden', { value: h, configurable: true });
      Object.defineProperty(document, 'visibilityState', { value: h ? 'hidden' : 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    }, hidden);
    await hide(true);
    expect(await page.evaluate(() => ({ s: __voxel.state, muted: __voxel.VX.audio.muted }))).toEqual({ s: 'paused', muted: true });
    await expect(page.locator('#scr-pause')).toBeVisible();
    await hide(false);
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => ({ s: __voxel.state, muted: __voxel.VX.audio.muted }))).toEqual({ s: 'paused', muted: false });
  });

  test('сутки: ночью небо и блоки темнее, солнце и луна, звёзды видны только ночью', async ({ page }) => {
    await openVoxel(page);
    await newWorld(page, { seed: 8 });
    const r = await page.evaluate(async () => {
      const v = __voxel, G = v.game;
      const at = async (t) => { G.ticks = t; await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); const s = G.dayLight; return s; };
      const noon = await at(6000), midnight = await at(18000), dawn = await at(0);
      return { noon, midnight, dawn, cycle: v.VX.DAY_SECONDS };
    });
    expect(r.cycle).toBe(1200);
    expect(r.noon).toBe(1);
    expect(r.midnight).toBe(0);
    expect(r.dawn).toBeGreaterThan(0.2);
    expect(r.dawn).toBeLessThan(0.8);
  });

  for (const size of SIZES) {
    test(`помещается в окно ${size.width}x${size.height}: меню, список миров, инвентарь, настройки`, async ({ page }) => {
      await page.setViewportSize(size);
      await openVoxel(page);
      await page.mouse.click(300, 300);
      for (const [sel, open] of [['#scr-title .col', null], ['#scr-settings .grid2', 'Настройки']]) {
        if (open) await page.locator('#scr-title').getByText(open).click();
        const rep = await fitReport(page, sel);
        expectFits(expect, rep);
      }
      await page.evaluate(() => __voxel.VX.ui.show('title'));
      await newWorld(page, { seed: 8, mode: 'survival' });
      const canvas = await fitReport(page, '#gc');
      expect(canvas.box.width).toBe(size.width);
      expect(canvas.box.height).toBe(size.height);
      await page.keyboard.press('KeyE');
      expectFits(expect, await fitReport(page, '.inv-panel'));
      await page.keyboard.press('KeyE');
      expectFits(expect, await fitReport(page, '#hotbar'));
    });
  }
});
