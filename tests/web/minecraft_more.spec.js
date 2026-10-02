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

test.describe('minecraft_clone_3d_1: пиксельный шрифт', () => {
  test('свой шрифт VoxelPixel собран кодом и загружен: пиксельный, точка = 1/8 кегля, весь интерфейс на нём', async ({ page }) => {
    await openVoxel(page);
    const r = await page.evaluate(async () => {
      await VX.font.ready;
      const c = document.createElement('canvas').getContext('2d');
      c.font = '16px VoxelPixel';
      const w = (s) => c.measureText(s).width;
      const fam = (sel) => { const e = document.querySelector(sel); return e ? getComputedStyle(e).fontFamily.split(',')[0].replace(/"/g, '').trim() : null; };
      return {
        loaded: VX.font.loaded, err: VX.font.error, check: document.fonts.check('16px VoxelPixel'),
        i: w('i'), W: w('W'), sh: w('Щ'), a: w('а'), dig: w('0123456789'),
        fams: ['body', '.mc-btn', '#hotbar', '#actionBar', '.tip', 'h2'].map(fam).filter(Boolean),
        buf: VX.font.buffer.byteLength,
      };
    });
    expect(r.err).toBe(null);
    expect(r.loaded).toBe(true);
    expect(r.check).toBe(true);
    expect(r.i).toBe(4);                // «i» - одна точка и промежуток: 2 точки по 2px
    expect(r.W).toBe(12);               // 5 точек и промежуток
    expect(r.sh).toBe(14);              // «Щ» шире: 6 точек
    expect(r.a).toBe(12);
    expect(r.dig).toBe(120);            // цифры одной ширины
    for (const f of r.fams) expect(f).toBe('VoxelPixel');
    expect(r.buf).toBeLessThan(60000);
  });

  test('подписи кнопок, ползунков и клавиш на всех экранах помещаются в одну строку', async ({ page }) => {
    await world(page, 'survival');
    const bad = await page.evaluate(() => {
      const out = [];
      const lines = (e) => { const r = document.createRange(); r.selectNodeContents(e); const ys = new Set([...r.getClientRects()].filter((q) => q.width > 0).map((q) => Math.round(q.top))); return ys.size; };
      for (const name of ['title', 'worlds', 'create', 'pause', 'settings', 'controls', 'death', 'ach']) {
        VX.ui.show(name);
        for (const e of document.querySelectorAll('.screen.show .mc-btn, .screen.show .mc-slider .cap, .screen.show .krow > span, .screen.show .krow > label')) {
          if (!e.offsetParent || !e.textContent.trim()) continue;
          if (lines(e) > 1 || e.scrollWidth > e.clientWidth + 1) out.push(name + ': ' + e.textContent.trim());
        }
      }
      return out;
    });
    expect(bad).toEqual([]);
  });

  test('в шрифте есть каждый знак, который встречается в игре (исходники, названия, достижения, экраны)', async ({ page }) => {
    const fs = require('fs'), path = require('path');
    const dir = path.join(__dirname, '../../web/minecraft_clone_3d_1');
    const files = ['index.html'].concat(fs.readdirSync(path.join(dir, 'js')).map((f) => 'js/' + f));
    const used = new Set();
    for (const f of files) for (const ch of fs.readFileSync(path.join(dir, f), 'utf8')) {
      const c = ch.codePointAt(0);
      if (c >= 32 && c !== 0xffff) used.add(ch);   // U+FFFF - граница ключей в IndexedDB, не текст
    }
    await openVoxel(page);
    const r = await page.evaluate((u) => {
      const D = VX.data, more = [];
      for (const t of D.TABS) for (const id of (D.tabItems(t.key) || [])) more.push((D.info(id) || {}).name || '');
      for (const a of D.ACH || []) more.push(a.name || '', a.desc || '');
      more.push(document.body.innerText);
      const all = new Set(u.concat([...more.join('')]));
      return [...all].filter((ch) => !/\s/.test(ch) && ch.codePointAt(0) >= 32 && ch.codePointAt(0) !== 0xffff && !VX.font.has(ch));
    }, [...used]);
    expect(r).toEqual([]);
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
    expect(r.font).toBeLessThanOrEqual(16);   // 16px - самый мелкий ровный кегль пиксельного шрифта (8px нечитаем)
    expect(r.hgt).toBeLessThan(24); expect(r.w).toBeLessThan(400);
    // подсказка сама исчезает через пару секунд, время в игре идёт
    const t0 = await page.evaluate(() => __voxel.ticks);
    await page.waitForTimeout(3000);
    expect(await page.evaluate(() => getComputedStyle(document.getElementById('clickHint')).display)).toBe('none');
    expect(await page.evaluate(() => __voxel.ticks)).toBeGreaterThan(t0 + 20);
    // щелчок мышью по игре (настоящий, через страницу) просит захват - управление вернулось
    await page.evaluate(() => { window.__calls = 0; HTMLCanvasElement.prototype.requestPointerLock = function () { window.__calls++; return Promise.resolve(); }; });
    await page.mouse.click(640, 360);
    expect(await page.evaluate(() => ({ calls: window.__calls, state: __voxel.state }))).toEqual({ calls: 1, state: 'play' });
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
    // у скелета выпадает 0-2 кости и 0-2 стрелы: за четыре победы хоть что-то выпадет (иначе 1 шанс из 10000)
    let got = [];
    for (let k = 0; k < 4; k++) { const s = await hitRun(page, 'skeleton', 'diamond_sword'); got = got.concat(s.drops, s.inv); }
    expect(got.some((id) => id === I.bone || id === I.arrow)).toBe(true);
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
