// Законы «Кубического мира», четвёртый заход: чары (стол, полки, лазурит, уровни), действие чар,
// наковальня (книги, починка, имя, «слишком дорого»), особые стопки не теряют чар.
const { test, expect } = require('@playwright/test');
const { openVoxel, newWorld, flatArena } = require('./_voxel-helpers');

test.describe.configure({ timeout: 90000 });

async function world(page, mode = 'survival') {
  await openVoxel(page);
  await newWorld(page, { seed: 8, mode });
  await page.evaluate(() => { __voxel.game.autoSpawn = false; __voxel.entities.clear(); __voxel.game.ticks = 4000; });
  await flatArena(page, 70, 7);
  await page.evaluate(() => {
    window.base = () => { const p = __voxel.player; return { x0: Math.floor(p.pos.x), z0: Math.floor(p.pos.z) }; };
    // стол и кольцо полок через клетку (15 штук в два яруса)
    window.library = (x, y, z, n) => {
      const v = __voxel, B = v.core.B; let k = 0;
      v.setBlock(x, y, z, v.core.ENCH_TABLE);
      for (let dy = 0; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== 2 || (dx === 0 && dz === 2)) continue;
        if (k < n) { v.setBlock(x + dx, y + dy, z + dz, B.bookshelf); k++; }
      }
      return k;
    };
  });
}

test.describe('minecraft_clone_3d_1: чары и наковальня', () => {
  test('стол: полки через клетку (до 15), факел между ними мешает; нижнее предложение 30 уровня при 15 полках; зачаровать - тратит уровни и лазурит; книга - зачарованная книга', async ({ page }) => {
    await world(page);
    const r = await page.evaluate(() => {
      const v = __voxel, C = v.core, B = C.B, I = v.data.I, E = v.VX.enchant, p = v.player;
      const { x0, z0 } = base(), tz = z0 - 4;
      const placed = library(x0, 70, tz, 15);
      const n15 = E.shelves(x0, 70, tz);
      v.setBlock(x0 + 1, 70, tz, B.torch);
      const blocked = E.shelves(x0, 70, tz);
      v.setBlock(x0 + 1, 70, tz, 0);
      library(x0, 70, tz, 30);
      const n30 = E.shelves(x0, 70, tz);               // 30 полок - всё равно 15
      p.level = 30;
      const view = new E.EnchantView(v.inv, { x: x0, y: 70, z: tz });
      view.set(700, { id: I.iron_sword, count: 1, dmg: 0 });
      const lv = view.offers.map((o) => o.level);
      const firstHint = view.offers[2].ench.length > 0;
      const noLapis = E.enchant(view, 2);
      view.set(701, { id: I.lapis, count: 5, dmg: 0 });
      const seed0 = v.meta.enchSeed;
      const out = E.enchant(view, 2);
      const levelAfterSword = p.level;
      const book = new E.EnchantView(v.inv, { x: x0, y: 70, z: tz }); p.level = 30;
      book.set(700, { id: I.book, count: 1, dmg: 0 }); book.set(701, { id: I.lapis, count: 3, dmg: 0 });
      const bout = E.enchant(book, 0);
      return { n30, placed, n15, blocked, lv, firstHint, noLapis, out: out && { id: out.id, ench: out.ench }, levelAfterSword, level: p.level, lapisLeft: view.lapis && view.lapis.count, seedChanged: v.meta.enchSeed !== seed0, bout: bout && { id: bout.id, n: bout.ench.length }, sword: I.iron_sword, eb: I.enchanted_book };
    });
    expect(r.n15).toBe(15);
    expect(r.blocked).toBeLessThan(15);
    expect(r.n30).toBe(15);
    expect(r.lv[2]).toBe(30);
    expect(r.lv[0]).toBeGreaterThanOrEqual(1);
    expect(r.firstHint).toBe(true);
    expect(r.noLapis).toBe(null);
    expect(r.out.id).toBe(r.sword);
    expect(r.out.ench.length).toBeGreaterThan(0);
    expect(r.lapisLeft).toBe(2);
    expect(r.seedChanged).toBe(true);
    expect(r.bout).toEqual({ id: r.eb, n: 1 });
    expect(r.levelAfterSword).toBe(27);   // нижнее предложение: 3 уровня
    expect(r.level).toBe(29);             // книга, верхнее предложение: 1 уровень
  });

  test('действие чар: острота и кара бьют сильнее, эффективность копает быстрее, прочность реже изнашивает, защита гасит урон, сила лука', async ({ page }) => {
    await world(page);
    const r = await page.evaluate(() => {
      const v = __voxel, C = v.core, B = C.B, I = v.data.I, D = v.data, E = v.VX.enchant, p = v.player;
      const sword = (ench) => ({ id: I.iron_sword, count: 1, dmg: 0, ench });
      const zombie = { type: 'zombie' }, spider = { type: 'spider' }, pig = { type: 'pig' };
      const sharp = E.bonusDamage(sword([['sharpness', 5]]), pig), smiteZ = E.bonusDamage(sword([['smite', 5]]), zombie), smiteP = E.bonusDamage(sword([['smite', 5]]), pig), bane = E.bonusDamage(sword([['bane', 3]]), spider);
      const pick = { id: I.iron_pickaxe, count: 1, dmg: 0 };
      const t0 = D.breakTime(B.stone, I.iron_pickaxe, pick), t5 = D.breakTime(B.stone, I.iron_pickaxe, { ...pick, ench: [['efficiency', 5]] });
      let wears = 0; for (let k = 0; k < 4000; k++) if (E.wears({ id: I.iron_pickaxe, ench: [['unbreaking', 3]] }, false)) wears++;
      // защита IV на четырёх вещах: урон зомби
      v.inv.armor = [0, 1, 2, 3].map((k) => ({ id: [I.iron_helmet, I.iron_chestplate, I.iron_leggings, I.iron_boots][k], count: 1, dmg: 0 }));
      p.health = 20; p.hurtCool = 0; p.damage(10, 'zombie', null, true); const plain = 20 - p.health;
      v.inv.armor.forEach((s) => { s.ench = [['protection', 4]]; });
      p.health = 20; p.hurtCool = 0; p.damage(10, 'zombie', null, true); const prot = 20 - p.health;
      // удар в игре: свинья с острым мечом падает быстрее
      v.inv.slots[0] = sword([['sharpness', 5]]); v.select(0);
      const m = v.spawnMob('pig', 0, -2); m.y = p.pos.y; v.look(0, -0.3);
      const hp = m.hp; v.entities.attack(); const hit = hp - m.hp;
      const pw = E.power({ id: I.bow, ench: [['power', 5]] });
      return { sharp, smiteZ, smiteP, bane, t0, t5, wears, plain, prot, hit, pw };
    });
    expect(r.sharp).toBe(3);
    expect(r.smiteZ).toBe(12.5);
    expect(r.smiteP).toBe(0);
    expect(r.bane).toBe(7.5);
    expect(r.t5).toBeLessThan(r.t0 / 3);
    expect(r.wears).toBeGreaterThan(800);
    expect(r.wears).toBeLessThan(1200);          // 1 из 4
    expect(r.prot).toBeCloseTo(r.plain * (1 - 0.64), 5);
    expect(r.hit).toBe(6 + 3);                   // железный меч 6 + острота V
    expect(r.pw).toBe(2.5);
  });

  test('наковальня: книга переносит чары, два меча - прочность с добавкой, слитки чинят по четверти, имя; дороже 39 - нельзя; уровни тратятся', async ({ page }) => {
    await world(page);
    const r = await page.evaluate(() => {
      const v = __voxel, I = v.data.I, E = v.VX.enchant, p = v.player;
      const A = (l, rr, name) => E.anvilResult(l, rr, name);
      const book = A({ id: I.iron_sword, count: 1, dmg: 0 }, { id: I.enchanted_book, count: 1, dmg: 0, ench: [['sharpness', 3]] });
      const merge = A({ id: I.iron_sword, count: 1, dmg: 0, ench: [['sharpness', 3]] }, { id: I.enchanted_book, count: 1, dmg: 0, ench: [['sharpness', 3]] });
      const noMix = A({ id: I.iron_sword, count: 1, dmg: 0, ench: [['sharpness', 3]] }, { id: I.enchanted_book, count: 1, dmg: 0, ench: [['smite', 2]] });
      const two = A({ id: I.iron_sword, count: 1, dmg: 200 }, { id: I.iron_sword, count: 1, dmg: 200 });
      const ingots = A({ id: I.iron_pickaxe, count: 1, dmg: 240 }, { id: I.iron_ingot, count: 10, dmg: 0 });
      const wrongMat = A({ id: I.iron_pickaxe, count: 1, dmg: 240 }, { id: I.gold_ingot, count: 10, dmg: 0 });
      const rename = A({ id: I.iron_sword, count: 1, dmg: 0 }, null, 'Экскалибур');
      const again = A(book.out, { id: I.enchanted_book, count: 1, dmg: 0, ench: [['unbreaking', 1]] });
      const pricey = A({ id: I.diamond_sword, count: 1, dmg: 0, rep: 5, ench: [['sharpness', 5], ['unbreaking', 3]] }, { id: I.enchanted_book, count: 1, dmg: 0, ench: [['sharpness', 5], ['unbreaking', 3], ['efficiency', 5]] }, 'Очень длинное новое имя меча');
      // в окне: уровни тратятся
      const view = new E.AnvilView(v.inv, { x: 0, y: 0, z: 0 });
      view.set(710, { id: I.iron_sword, count: 1, dmg: 0 }); view.set(711, { id: I.enchanted_book, count: 1, dmg: 0, ench: [['sharpness', 2]] });
      p.level = 1; const poor = view.get(712);
      p.level = 10; const rich = view.get(712); const out = view.takeOutput();
      return { againCost: again.cost, againRep: again.out.rep, book: book && book.out.ench, bookCost: book && book.cost, merge: merge.out.ench, noMix, twoDmg: two.out.dmg, dur: v.data.toolOf(I.iron_sword).dur, ingDmg: ingots.out.dmg, ingUsed: ingots.used, wrongMat, rename: rename.out.name, pricey: pricey.tooExpensive, poor, rich: !!rich, level: p.level, gone: [view.left, view.right], outEnch: out && out.ench };
    });
    expect(r.book).toEqual([['sharpness', 3]]);
    expect(r.bookCost).toBe(3);
    expect(r.againCost).toBe(1 + 1);            // книга I + штраф за один прошлый раз
    expect(r.againRep).toBe(2);
    expect(r.merge).toEqual([['sharpness', 4]]);
    expect(r.noMix).toBe(null);                  // острота и кара несовместимы - нечего делать
    expect(r.twoDmg).toBe(Math.max(0, r.dur - ((r.dur - 200) * 2 + Math.floor(r.dur * 0.12))));
    expect(r.ingDmg).toBe(0);
    expect(r.ingUsed).toBe(4);
    expect(r.wrongMat).toBe(null);
    expect(r.rename).toBe('Экскалибур');
    expect(r.pricey).toBe(true);
    expect(r.poor).toBe(null);
    expect(r.rich).toBe(true);
    expect(r.level).toBe(8);
    expect(r.gone).toEqual([null, null]);
    expect(r.outEnch).toEqual([['sharpness', 2]]);
  });

  test('зачарованная вещь не теряет чар: выбросить и поднять, Shift в сундук, сохранение мира; отблеск в ячейке; книга у библиотекаря', async ({ page }) => {
    await world(page);
    const r = await page.evaluate(async () => {
      const v = __voxel, I = v.data.I, VI = v.VX.inv, p = v.player;
      const e = [['sharpness', 4], ['unbreaking', 2]];
      v.inv.clear(); v.inv.slots[0] = { id: I.diamond_sword, count: 1, dmg: 5, ench: e, name: 'Клинок' }; v.select(0);
      // выбросить (Q) и поднять
      v.game.dropItem(v.inv.slots[0], false, p.pos.x, p.pos.y + 0.5, p.pos.z); v.inv.slots[0] = null;
      for (let k = 0; k < 100 && !v.inv.slots.some(Boolean); k++) v.step(0.05);
      const picked = v.inv.slots.find(Boolean);
      // Shift в сундук и обратно
      const chest = [new Array(27).fill(null)];
      const cv = new VI.ChestView(v.inv, chest);
      const i0 = v.inv.slots.indexOf(picked);
      VI.click(v.inv, cv, i0, 0, true);
      const inChest = chest[0].find(Boolean);
      VI.click(v.inv, cv, 500 + chest[0].indexOf(inChest), 0, true);
      const back = v.inv.slots.find(Boolean);
      const id = v.meta.id;
      await v.flush(); await v.exitToTitle(); await v.openWorld(id);
      const loaded = v.inv.slots.find(Boolean);
      v.openInventory();
      await new Promise((rr) => setTimeout(rr, 100));
      const glint = !!document.querySelector('.slot.ench');
      v.closeInventory();
      const lib = v.VX.villages.makeTrades('librarian').find((t) => t.out[0] === I.enchanted_book);
      return { picked: picked && picked.ench, pickedName: picked && picked.name, inChest: inChest && inChest.ench, back: back && back.ench, loaded: loaded && [loaded.ench, loaded.name, loaded.dmg], glint, lib: lib && lib.ench && lib.ench.length === 1 };
    });
    const e = [['sharpness', 4], ['unbreaking', 2]];
    expect(r.picked).toEqual(e);
    expect(r.pickedName).toBe('Клинок');
    expect(r.inChest).toEqual(e);
    expect(r.back).toEqual(e);
    expect(r.loaded).toEqual([e, 'Клинок', 5]);
    expect(r.glint).toBe(true);
    expect(r.lib).toBe(true);
  });
});
