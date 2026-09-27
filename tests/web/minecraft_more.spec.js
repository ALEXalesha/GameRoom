// Законы «Кубического мира», третий заход: Esc как в оригинале, бой с мобами в обоих режимах,
// виды камеры, броня, жидкости, двери, сундуки, кровать, фермерство, лук, новые мобы, перенос
// построек старой версии.
const { test, expect } = require('@playwright/test');
const { openVoxel, newWorld, flatArena } = require('./_voxel-helpers');

test.describe.configure({ timeout: 60000 });   // программная отрисовка в параллельных прогонах медленная

async function world(page, mode = 'survival', seed = 8) {
  await openVoxel(page);
  await newWorld(page, { seed, mode });
  await page.evaluate(() => { __voxel.game.autoSpawn = false; __voxel.entities.clear(); });
  await flatArena(page, 70, 7);
}

test.describe('minecraft_clone_3d_1: оболочки ОС', () => {
  test('в <head> есть meta application-name «Кубический мир»', async ({ page }) => {
    await openVoxel(page);
    expect(await page.evaluate(() => { const m = document.head.querySelector('meta[name="application-name"]'); return m && m.content; })).toBe('Кубический мир');
  });

  test('postMessage {mix:"pause"} от оболочки: пауза, тики мира стоят, звук заглушен, клавиши отпущены; "resume" - пауза остаётся, звук снова есть', async ({ page }) => {
    await world(page, 'survival');
    await page.evaluate(() => { __voxel.game.testMode = false; __voxel.key('KeyW'); });
    const t0 = await page.evaluate(() => __voxel.ticks);
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => __voxel.ticks)).toBeGreaterThan(t0 + 4);   // без паузы время идёт
    await page.evaluate(() => window.postMessage({ mix: 'pause' }, '*'));
    await page.waitForTimeout(150);
    const r1 = await page.evaluate(() => ({ t: __voxel.ticks, s: __voxel.state, muted: __voxel.VX.audio.muted, w: !!__voxel.game.keys.KeyW, lock: !!document.pointerLockElement }));
    expect(r1.s).toBe('paused');
    expect(r1.muted).toBe(true);
    expect(r1.w).toBe(false);
    expect(r1.lock).toBe(false);
    await page.waitForTimeout(1000);
    expect(await page.evaluate(() => __voxel.ticks)).toBe(r1.t);                 // тики мира стоят
    await expect(page.locator('#scr-pause')).toBeVisible();
    await page.evaluate(() => window.postMessage({ mix: 'resume' }, '*'));
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => ({ s: __voxel.state, muted: __voxel.VX.audio.muted }))).toEqual({ s: 'paused', muted: false });
    // чужие сообщения игру не трогают
    await page.locator('#scr-pause').getByText('Вернуться к игре').click();
    await page.evaluate(() => { window.postMessage('pause', '*'); window.postMessage({ type: 'pause' }, '*'); });
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => __voxel.state)).toBe('play');
  });
});

test.describe('minecraft_clone_3d_1: Esc и бой', () => {
  test('Esc открывает паузу, второй Esc закрывает её: игра идёт, затемнения и большой надписи нет', async ({ page }) => {
    await world(page, 'creative');
    // захват мыши по Esc браузер не даёт (замер в Electron: WrongDocumentError) - так и моделируем
    await page.evaluate(() => {
      __voxel.game.testMode = false;
      HTMLCanvasElement.prototype.requestPointerLock = function () { return Promise.reject(new DOMException('отказ', 'WrongDocumentError')); };
    });
    await page.keyboard.press('Escape');
    await expect(page.locator('#scr-pause')).toBeVisible();
    expect(await page.evaluate(() => document.body.classList.contains('dim'))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.locator('#scr-pause')).toBeHidden();
    const r = await page.evaluate(() => {
      const h = document.getElementById('clickHint'), b = h.getBoundingClientRect();
      return { state: __voxel.state, dim: document.body.classList.contains('dim'), menu: document.body.classList.contains('menu'), shown: getComputedStyle(h).display !== 'none', w: b.width, hgt: b.height, font: parseFloat(getComputedStyle(h).fontSize), screens: [...document.querySelectorAll('.screen.show')].map((s) => s.id) };
    });
    expect(r.state).toBe('play');
    expect(r.dim).toBe(false);
    expect(r.menu).toBe(false);
    expect(r.screens).toEqual(['scr-hud']);
    expect(r.shown).toBe(true);                      // маленькая подсказка у прицела вместо большой надписи
    expect(r.font).toBeLessThanOrEqual(13); expect(r.hgt).toBeLessThan(24); expect(r.w).toBeLessThan(400);
    // подсказка сама исчезает через пару секунд, время в игре идёт
    const t0 = await page.evaluate(() => __voxel.ticks);
    await page.waitForTimeout(3000);
    expect(await page.evaluate(() => getComputedStyle(document.getElementById('clickHint')).display)).toBe('none');
    expect(await page.evaluate(() => __voxel.ticks)).toBeGreaterThan(t0 + 20);
  });

  const hitRun = async (page, type, heldKey) => page.evaluate(({ type, heldKey }) => {
    const v = __voxel, p = v.player, B = v.core.B, cv = document.getElementById('gc');
    v.game.testMode = true;
    // моб перед игроком, за ним - блок в пределах руки
    const x = Math.floor(p.pos.x), z = Math.floor(p.pos.z);
    v.setBlock(x, 70, z - 3, B.stone); v.setBlock(x, 71, z - 3, B.stone);
    v.inv.slots[0] = heldKey ? { id: v.data.I[heldKey], count: 1, dmg: 0 } : null; v.select(0);
    v.look(0, -0.75);
    const m = v.spawnMob(type, 0, -1.7); m.y = 70;
    const hp0 = m.hp;
    let hits = 0;
    while (m.hp > 0 && hits < 30) {
      m.x = p.pos.x; m.z = p.pos.z - 1.7; m.y = 70; m.vx = m.vz = 0; m.hurtT = 0;
      cv.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
      v.step(0.05);
      window.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }));
      hits++;
    }
    v.step(0.05, 4);                                   // сразу после удара: выпавшее ещё лежит
    const drops = v.entities.items.map((i) => i.stack.id);
    v.step(0.05, 26);
    return { hp0, hits, dead: m.hp <= 0, drops, block: v.getBlock(x, 70, z - 3), inv: v.inv.slots.filter(Boolean).map((s) => s.id) };
  }, { type, heldKey });

  test('творческий режим: любой моб погибает с одного удара ЛКМ, выпадения нет, блок за ним цел', async ({ page }) => {
    await world(page, 'creative');
    for (const type of ['pig', 'sheep', 'zombie', 'cow', 'skeleton', 'spider']) {
      const r = await hitRun(page, type, null);
      expect(r.dead, type).toBe(true);
      expect(r.hits, type).toBe(1);
      expect(r.drops, type).toEqual([]);
      expect(r.block, type).toBe(await page.evaluate(() => __voxel.core.B.stone));
    }
  });

  test('выживание: число ударов по таблице урона (рука 1, мечи 4-7), моб перед блоком получает удар, блок цел, выпадение', async ({ page }) => {
    await world(page, 'survival');
    const table = [['pig', null, 10], ['pig', 'wood_sword', 3], ['pig', 'stone_sword', 2], ['zombie', 'iron_sword', 4], ['zombie', 'diamond_sword', 3], ['sheep', 'gold_sword', 2]];
    for (const [type, held, want] of table) {
      const r = await hitRun(page, type, held);
      expect(r.hits, `${type} ${held}`).toBe(want);
      expect(r.block, `${type}: блок за мобом не сломан`).toBe(await page.evaluate(() => __voxel.core.B.stone));
    }
    const I = await page.evaluate(() => __voxel.data.I);
    const r = await hitRun(page, 'pig', 'diamond_sword');
    const all = r.drops.concat(r.inv);
    expect(all).toContain(I.raw_porkchop);
    const s = await hitRun(page, 'skeleton', 'diamond_sword');
    expect(s.drops.concat(s.inv).some((id) => id === I.bone || id === I.arrow)).toBe(true);
  });

  test('яйца призыва в творческой палитре: ПКМ по земле ставит моба', async ({ page }) => {
    await world(page, 'creative');
    const r = await page.evaluate(() => {
      const v = __voxel, D = v.data;
      const eggs = D.tabItems('tools').concat(D.tabItems('food')).map((id) => D.info(id)).filter((i) => i.egg).map((i) => i.egg);
      v.inv.slots[0] = { id: D.I.egg_cow, count: 1, dmg: 0 }; v.select(0);
      v.look(0, -0.6);
      const n0 = v.entities.mobs.length;
      v.place();
      return { eggs, spawned: v.entities.mobs.length - n0, type: v.entities.mobs[v.entities.mobs.length - 1] && v.entities.mobs[v.entities.mobs.length - 1].type, left: v.inv.slots[0] && v.inv.slots[0].count };
    });
    for (const t of ['pig', 'sheep', 'cow', 'chicken', 'zombie', 'skeleton', 'spider']) expect(r.eggs).toContain(t);
    expect(r.spawned).toBe(1);
    expect(r.type).toBe('cow');
    expect(r.left).toBe(1);                  // в творческом яйцо не тратится
  });
});
