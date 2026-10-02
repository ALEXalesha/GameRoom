// Законы «Кубического мира», четвёртый заход: опыт - шарики, уровни по формуле оригинала, полоса опыта,
// опыт за мобов, руды и печь, потеря при смерти, сохранение.
const { test, expect } = require('@playwright/test');
const { openVoxel, newWorld, flatArena } = require('./_voxel-helpers');

test.describe.configure({ timeout: 90000 });

async function world(page, mode = 'survival') {
  await openVoxel(page);
  await newWorld(page, { seed: 8, mode });
  await page.evaluate(() => { __voxel.game.autoSpawn = false; __voxel.entities.clear(); __voxel.game.ticks = 4000; });
  await flatArena(page, 70, 7);
}

test.describe('minecraft_clone_3d_1: опыт', () => {
  test('уровни по формуле оригинала: 2L+7, 5L-38, 9L-158', async ({ page }) => {
    await world(page);
    const r = await page.evaluate(() => {
      const X = __voxel.VX.xp, p = __voxel.player;
      const t = [0, 15, 16, 30, 31].map(X.toNext);
      X.add(p, 7); const l1 = [p.level, p.xpPoints];
      p.level = 0; p.xpPoints = 0; X.add(p, 1395); const l30 = [p.level, p.xpPoints];
      X.spend(p, 3); const after = p.level;
      return { t, l1, l30, after };
    });
    expect(r.t).toEqual([7, 37, 42, 112, 121]);
    expect(r.l1).toEqual([1, 0]);
    expect(r.l30).toEqual([30, 0]);
    expect(r.after).toBe(27);
  });

  test('шарики: от зомби 5, от свиньи 1-3, от алмазной руды 3-7; летят к герою и подбираются; полоса опыта и уровень на экране', async ({ page }) => {
    await world(page);
    const r = await page.evaluate(async () => {
      const v = __voxel, p = v.player, E = v.entities, X = v.VX.xp, C = v.core, I = v.data.I;
      const zombie = v.spawnMob('zombie', 0, -3);
      E.hurtMob(zombie, 100, p.pos.x, p.pos.z, 'player');
      const zOrbs = X.orbs.reduce((s, o) => s + o.value, 0);
      for (let i = 0; i < 60; i++) v.step(0.05);
      const afterZ = p.xpTotal;
      const pigs = [];
      for (let k = 0; k < 12; k++) { X.clear(); const pig = v.spawnMob('pig', 0, -3); E.hurtMob(pig, 100, p.pos.x, p.pos.z, 'player'); pigs.push(X.orbs.reduce((s, o) => s + o.value, 0)); }
      X.clear();
      const cr = v.spawnMob('pig', 0, -3); v.game.mode = 'creative'; E.hurtMob(cr, 1e6, p.pos.x, p.pos.z, 'creative'); const creativeOrbs = X.orbs.length; v.game.mode = 'survival';
      // алмазная руда железной киркой
      const x = Math.floor(p.pos.x), z = Math.floor(p.pos.z);
      const ore = [];
      for (let k = 0; k < 6; k++) { X.clear(); v.setBlock(x + 2, 70, z, C.B.diamond_ore); v.inv.slots[0] = { id: I.iron_pickaxe, count: 1, dmg: 0 }; v.select(0); v.game.breakAt(x + 2, 70, z, true); ore.push(X.orbs.reduce((s, o) => s + o.value, 0)); }
      X.clear(); v.entities.clear();
      await new Promise((rr) => setTimeout(rr, 200));
      const bar = document.querySelector('#xpbar'), fill = bar.firstChild;
      return { zOrbs, afterZ, pigs, creativeOrbs, ore, bar: getComputedStyle(bar).display, fillW: fill.style.width, lvl: bar.lastChild.textContent, level: p.level };
    });
    expect(r.zOrbs).toBe(5);
    expect(r.afterZ).toBe(5);
    expect(r.pigs.every((n) => n >= 1 && n <= 3)).toBe(true);
    expect(new Set(r.pigs).size).toBeGreaterThan(1);
    expect(r.creativeOrbs).toBe(0);
    expect(r.ore.every((n) => n >= 3 && n <= 7)).toBe(true);
    expect(r.bar).not.toBe('none');
    expect(parseFloat(r.fillW)).toBeCloseTo(5 / 7 * 100, 0);
    expect(r.lvl).toBe('');
    expect(r.level).toBe(0);
  });

  test('печь: опыт копится при переплавке и выдаётся, когда вынимаешь; смерть - 7 x уровень шариками, остальное пропадает; уровень хранится в мире', async ({ page }) => {
    await world(page);
    const r = await page.evaluate(async () => {
      const v = __voxel, p = v.player, X = v.VX.xp, I = v.data.I, VI = v.VX.inv;
      const f = VI.newFurnace();
      f.slots[0] = { id: 22, count: 10, dmg: 0 }; f.slots[1] = { id: I.coal, count: 2, dmg: 0 };
      for (let k = 0; k < 110; k++) VI.tickFurnace(f, 1);
      const smelted = f.slots[2] && f.slots[2].count, stored = f.xp;
      const before = p.xpTotal;
      new VI.FurnaceView(v.inv, f).takeOutput();
      const gained = p.xpTotal - before;
      // сохранение
      p.level = 12; p.xpPoints = 3; p.xpTotal = 300;
      const id = v.meta.id;
      await v.flush(); await v.exitToTitle(); await v.openWorld(id);
      const kept = [v.player.level, v.player.xpPoints, v.player.xpTotal];
      // смерть
      X.clear();
      v.player.level = 10; v.player.xpPoints = 5;
      v.player.health = 1; v.player.hurtCool = 0; v.player.damage(20, 'fall', null, true); v.game.onDeath();
      const orbSum = X.orbs.reduce((s, o) => s + o.value, 0);
      return { smelted, stored, gained, kept, orbSum, levelAfter: v.player.level };
    });
    expect(r.smelted).toBe(10);
    expect(r.stored).toBeCloseTo(7, 5);
    expect(r.gained).toBe(7);
    expect(r.kept).toEqual([12, 3, 300]);
    expect(r.orbSum).toBe(70);
    expect(r.levelAfter).toBe(0);
  });
});
