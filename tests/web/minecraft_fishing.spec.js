// Законы «Кубического мира», четвёртый заход: рыбалка - удочка по рецепту, заброс, поплавок на воде,
// поклёвка через 5-30 секунд, подсечка в окне 0.8 с, улов летит к герою, опыт, износ удочки, таблица
// улова (рыба, хлам, сокровища), жарка рыбы, достижение.
const { test, expect } = require('@playwright/test');
const { openVoxel, newWorld, flatArena } = require('./_voxel-helpers');

test.describe.configure({ timeout: 90000 });

async function world(page) {
  await openVoxel(page);
  await newWorld(page, { seed: 8, mode: 'survival' });
  await page.evaluate(() => { __voxel.game.autoSpawn = false; __voxel.entities.clear(); __voxel.game.ticks = 4000; });
  await flatArena(page, 70, 8);
  await page.evaluate(() => {
    const v = __voxel, B = v.core.B, p = v.player, x0 = Math.floor(p.pos.x), z0 = Math.floor(p.pos.z);
    window.base = () => ({ x0, z0 });
    // пруд к северу: 9x6, глубина 2
    for (let x = x0 - 4; x <= x0 + 4; x++) for (let z = z0 - 8; z <= z0 - 3; z++) { v.setBlock(x, 69, z, B.water); v.setBlock(x, 68, z, B.water); v.setBlock(x, 67, z, B.stone); }
    window.rod = () => { v.inv.slots[0] = { id: v.data.I.fishing_rod, count: 1, dmg: 0 }; v.select(0); v.look(0, -0.3); };
  });
}

test.describe('minecraft_clone_3d_1: рыбалка', () => {
  test('удочка по рецепту; заброс - поплавок на воде; подсёк до поклёвки - пусто; поклёвка через 5-30 с, подсечка - рыба летит к герою, опыт, износ; не успел за 0.8 с - рыба ушла; «Рыбный день»', async ({ page }) => {
    await world(page);
    const r = await page.evaluate(() => {
      const v = __voxel, C = v.core, D = v.data, I = D.I, F = v.VX.fishing, p = v.player;
      const { z0 } = base();
      const rec = !!D.RECIPES.find((q) => q.outId === I.fishing_rod);
      F.R.rnd = () => 0;                                // ожидание 5 с, улов - треска
      rod();
      const cast = v.place();
      for (let k = 0; k < 30 && F.bob.state === 'fly'; k++) v.step(0.05);
      const b = F.bob, floatAt = { state: b.state, dy: b.y - 70, inPond: b.z < z0 - 2.5 };
      v.step(0.05, 20);
      const early = v.place();
      const earlyItems = v.entities.items.length, dmg0 = v.inv.slots[0].dmg;
      // снова и ждём поклёвку
      v.place();
      for (let k = 0; k < 30 && F.bob.state === 'fly'; k++) v.step(0.05);
      let biteAt = 0; for (let k = 0; k < 140 && !(F.bob.biteT > 0); k++) { v.step(0.05); biteAt = (k + 1) * 0.05; }
      const xp0 = p.xpTotal || 0;
      const caught = v.place();
      for (let k = 0; k < 60; k++) v.step(0.05);
      const got = v.inv.count(I.raw_cod), xpGot = (p.xpTotal || 0) - xp0, dmg = v.inv.slots[0].dmg;
      // не успел: поклёвка прошла
      v.place();
      for (let k = 0; k < 30 && F.bob.state === 'fly'; k++) v.step(0.05);
      for (let k = 0; k < 140 && !(F.bob.biteT > 0); k++) v.step(0.05);
      v.step(0.05, 20);
      const missed = { bite: F.bob.biteT, waiting: F.bob.wait > 0 };
      const late = v.place();
      // на суше поплавок лежит
      v.look(Math.PI, -0.4); v.place();
      for (let k = 0; k < 30 && F.bob && F.bob.state === 'fly'; k++) v.step(0.05);
      const onGround = F.bob && F.bob.state;
      // убрали удочку - леска рвётся
      v.select(3); v.step(0.05, 2);
      const cut = F.bob === null;
      return { rec, cast, floatAt, early, earlyItems, dmg0, biteAt, caught, got, xpGot, dmg, missed, late, onGround, cut, ach: !!v.ach.got.fish };
    });
    expect(r.rec).toBe(true);
    expect(r.cast).toBe('cast');
    expect(r.floatAt.state).toBe('float');
    expect(r.floatAt.dy).toBeCloseTo(-0.2, 1);
    expect(r.floatAt.inPond).toBe(true);
    expect(r.early).toBe('reel');
    expect(r.earlyItems).toBe(0);
    expect(r.dmg0).toBe(0);
    expect(r.biteAt).toBeGreaterThan(4.8);
    expect(r.biteAt).toBeLessThan(5.3);
    expect(r.caught).toBe('catch');
    expect(r.got).toBe(1);
    expect(r.xpGot).toBeGreaterThanOrEqual(1);
    expect(r.dmg).toBe(1);
    expect(r.missed.bite).toBe(0);
    expect(r.missed.waiting).toBe(true);
    expect(r.late).toBe('reel');
    expect(r.onGround).toBe('ground');
    expect(r.cut).toBe(true);
    expect(r.ach).toBe(true);
  });

  test('улов по таблице: рыба 85% (треска чаще лосося), хлам 10%, сокровища 5% (лук, зачарованная книга, удочка); рыба жарится в печи', async ({ page }) => {
    await world(page);
    const r = await page.evaluate(() => {
      const v = __voxel, D = v.data, I = D.I, F = v.VX.fishing;
      F.R.rnd = Math.random;
      const fish = new Set([I.raw_cod, I.raw_salmon]), treas = new Set([I.bow, I.enchanted_book, I.fishing_rod]);
      let nf = 0, nc = 0, ns = 0, nt = 0, nj = 0, booksOk = true;
      const N = 4000;
      for (let k = 0; k < N; k++) {
        const s = F.roll();
        if (fish.has(s.id)) { nf++; if (s.id === I.raw_cod) nc++; else ns++; }
        else if (treas.has(s.id)) { nt++; if (s.id === I.enchanted_book && !(s.ench && s.ench.length)) booksOk = false; }
        else nj++;
      }
      return { fish: nf / N, junk: nj / N, treas: nt / N, codMore: nc > ns * 1.5, booksOk, cod: D.smeltOf(I.raw_cod).out === I.cooked_cod, salmon: D.smeltOf(I.raw_salmon).out === I.cooked_salmon };
    });
    expect(r.fish).toBeGreaterThan(0.82); expect(r.fish).toBeLessThan(0.88);
    expect(r.junk).toBeGreaterThan(0.08); expect(r.junk).toBeLessThan(0.12);
    expect(r.treas).toBeGreaterThan(0.035); expect(r.treas).toBeLessThan(0.065);
    expect(r.codMore).toBe(true);
    expect(r.booksOk).toBe(true);
    expect(r.cod).toBe(true);
    expect(r.salmon).toBe(true);
  });
});
