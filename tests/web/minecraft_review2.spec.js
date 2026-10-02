// Законы «Кубического мира» по второму независимому ревью: настоящий путь ввода (щелчок мыши по
// игре без захвата), пауза от оболочки во время загрузки, повреждённые сохранения, мусор в
// настройках, кусок неверного типа в хранилище, удар в творческом по мобу на фоне неба.
const { test, expect } = require('@playwright/test');
const { openVoxel, newWorld, flatArena, lockStub } = require('./_voxel-helpers');

test.describe.configure({ timeout: 90000 });

// Захват мыши подменён в openVoxel (lockStub в _voxel-helpers): до настоящего дело не доходит
const LOCK_STUB = lockStub;
const humanClick = async (page) => { await page.mouse.move(640, 360); await page.mouse.down(); await page.waitForTimeout(80); await page.mouse.up(); };
const info = (page) => page.evaluate(() => ({ calls: window.__lockCalls, locked: !!document.pointerLockElement, state: __voxel.state, top: (document.elementFromPoint(innerWidth / 2, innerHeight / 2) || {}).id || '' }));

test.describe('minecraft_clone_3d_1: второе ревью - ввод', () => {
  test('страж: настоящий requestPointerLock недостижим - игра без testMode просит захват, вызывается только подмена', async ({ page }) => {
    await openVoxel(page);
    await newWorld(page, { seed: 5, mode: 'creative' });
    const r = await page.evaluate(async () => {
      const G = __voxel.game, cv = document.getElementById('gc'), N = window.__nativeLock;
      const fresh = document.createElement('canvas');
      G.testMode = false; G.pause(); G.play();               // play просит захват
      await new Promise((rr) => setTimeout(rr, 50));
      return {
        stubbed: !!window.__lockStubbed, native: typeof N.rpl === 'function',
        notNative: cv.requestPointerLock !== N.rpl && fresh.requestPointerLock !== N.rpl && Element.prototype.requestPointerLock !== N.rpl && document.exitPointerLock !== N.exit,
        calls: window.__lockCalls, locked: document.pointerLockElement === cv,
      };
    });
    expect(r.stubbed).toBe(true);
    expect(r.native).toBe(true);
    expect(r.notNative).toBe(true);
    expect(r.calls).toBeGreaterThan(0);
    expect(r.locked).toBe(true);
  });

  test('пауза от оболочки ({mix:"pause"}) и скрытая вкладка во время загрузки мира не теряются: после загрузки - экран паузы, время стоит', async ({ page }) => {
    await page.addInitScript(LOCK_STUB);
    await openVoxel(page);
    const r = await page.evaluate(async () => {
      const v = __voxel, G = v.game;
      G.testMode = false;
      v.settings.renderDistance = 3; G.applySettings();
      const meta = await G.createWorld({ name: 'Пауза', seed: '91', mode: 'survival' });
      const p = G.openWorld(meta.id);
      for (let k = 0; k < 500 && v.state !== 'loading'; k++) await new Promise((rr) => setTimeout(rr, 2));
      const during = v.state;
      window.postMessage({ mix: 'pause' }, '*');
      await p;
      const t0 = performance.now();
      while (v.state === 'loading' && performance.now() - t0 < 30000) await new Promise((rr) => setTimeout(rr, 30));
      await new Promise((rr) => setTimeout(rr, 300));
      const ticks = v.ticks;
      await new Promise((rr) => setTimeout(rr, 400));
      return { during, state: v.state, screen: v.screen, still: v.ticks === ticks };
    });
    expect(r.during).toBe('loading');
    expect(r.state).toBe('paused');
    expect(r.screen).toBe('pause');
    expect(r.still).toBe(true);
  });

  test('щелчок по игре без захвата мыши (после Esc-Esc и после медленной загрузки) просит захват и возвращает управление', async ({ page }) => {
    await page.addInitScript(LOCK_STUB);
    await page.addInitScript(() => { window.__denyLock = true; });       // мир открылся, когда жест кнопки уже истёк
    await openVoxel(page, 'seed=5&mode=creative');
    await page.waitForFunction(() => __voxel.state === 'play', null, { timeout: 60000 });
    await page.evaluate(() => { __voxel.game.testMode = false; window.__denyLock = false; });
    const a = await info(page);
    expect(a.locked).toBe(false);
    expect(a.top).toBe('gc');                          // в центре экрана - сам холст, ничто его не закрывает
    await humanClick(page);
    await page.waitForTimeout(100);
    const b = await info(page);
    expect(b.calls).toBeGreaterThan(a.calls);
    expect(b.locked).toBe(true);
    expect(b.state).toBe('play');
    // Esc (браузер снимает захват) - пауза, второй Esc - игра без захвата, щелчок возвращает захват
    await page.evaluate(() => window.__browserEsc());
    await page.waitForTimeout(50);
    expect(await page.evaluate(() => __voxel.state)).toBe('paused');
    await page.evaluate(() => { window.__denyLock = true; });          // по Esc браузер захват не даёт
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    await page.evaluate(() => { window.__denyLock = false; });
    const c = await info(page);
    expect(c.state).toBe('play');
    expect(c.locked).toBe(false);
    await humanClick(page);
    await page.waitForTimeout(100);
    const d = await info(page);
    expect(d.calls).toBeGreaterThan(c.calls);
    expect(d.locked).toBe(true);
  });
});

test.describe('minecraft_clone_3d_1: второе ревью - повреждённые данные', () => {
  test('повреждённая запись мира открывается: игрок без pos (и в быстром снимке), inv.slots строкой, chests строкой, нет spawn и player, entities.items не массив, чужое измерение', async ({ page }) => {
    test.setTimeout(240000);
    await openVoxel(page);
    const r = await page.evaluate(async () => {
      const v = __voxel, G = v.game, S = v.VX.store;
      v.settings.renderDistance = 2; G.applySettings();
      const meta0 = await G.createWorld({ name: 'Порча', seed: '777', mode: 'survival' });
      const id = meta0.id;
      const cases = {
        noPos: (m) => { m.player = { health: 20 }; },
        quickNoPos: (m) => { localStorage.setItem('cw2_quick_' + id, JSON.stringify({ t: 9e15, player: { yaw: 1 }, inv: { slots: [{ id: 1, count: 5 }] }, ticks: 5 })); },
        slotsString: (m) => { m.inv = { slots: 'abc', armor: 7 }; },
        chestsString: (m) => { m.chests = 'abc'; m.furnaces = 5; m.crops = null; },
        noSpawnNoPlayer: (m) => { delete m.spawn; delete m.player; },
        itemsNotArray: (m) => { m.entities = { items: 5, mobs: 'x' }; },
        dimGarbage: (m) => { m.dim = 'mars'; },
      };
      const out = {};
      for (const [name, spoil] of Object.entries(cases)) {
        const m = await S.getWorld(id);
        spoil(m);
        await S.putWorld(m); await S.flush();
        let err = null;
        try { await Promise.race([v.VX.ui.playWorld(id), new Promise((_, j) => setTimeout(() => j(new Error('timeout')), 20000))]); } catch (e) { err = String(e).slice(0, 120); }
        const t0 = performance.now();
        while (v.state === 'loading' && performance.now() - t0 < 30000) await new Promise((rr) => setTimeout(rr, 30));
        const p = v.player.pos;
        const sp = G.meta.spawn;
        out[name] = { quickIgnored: v.inv.count(1) === 0 && G.ticks > 50, near: Math.hypot(p.x - sp.x, p.z - sp.z) < 3, ms: performance.now() - t0, err, state: v.state, dim: G.dim, posOk: [p.x, p.y, p.z].every(Number.isFinite) && p.y > 0, slots: Array.isArray(v.inv.slots) && v.inv.slots.length === 36, chests: typeof G.chests === 'object' && !Array.isArray(G.chests) };
        localStorage.removeItem('cw2_quick_' + id);
        if (G.meta && !G.panorama) await G.exitToTitle();
      }
      return out;
    });
    for (const [name, q] of Object.entries(r)) {
      expect(q.err, name).toBe(null);
      expect(['play', 'paused'], name).toContain(q.state);
      expect(q.posOk, name).toBe(true);
      expect(q.slots, name).toBe(true);
      expect(q.chests, name).toBe(true);
      expect(q.dim, name).toBe('over');
      expect(q.ms, name).toBeLessThan(15000);
      if (name === 'quickNoPos') expect(q.quickIgnored, name).toBe(true);                 // снимок без координат - испорчен целиком
      if (['noPos', 'quickNoPos', 'noSpawnNoPlayer'].includes(name)) expect(q.near, name).toBe(true);    // без координат - в точку появления, а не куда попало        // дальность 2: загрузка не ждёт 25 с запасного таймера
    }
  });

  test('мир, который всё же не открылся (ошибка чтения), - сообщение «Мир повреждён» и чистый возврат в меню с панорамой', async ({ page }) => {
    await openVoxel(page);
    const r = await page.evaluate(async () => {
      const v = __voxel, G = v.game, S = v.VX.store;
      const meta = await G.createWorld({ name: 'Битый', seed: '3', mode: 'survival' });
      const real = S.getWorld;
      S.getWorld = async () => { throw new Error('битая запись'); };
      let err = null;
      try { await v.VX.ui.playWorld(meta.id); } catch (e) { err = String(e); }
      S.getWorld = real;
      await new Promise((rr) => setTimeout(rr, 300));
      const note = [...document.querySelectorAll('.screen.show')].map((s) => s.textContent).join(' ');
      return { err, state: v.state, panorama: G.panorama, screen: v.screen, note };
    });
    expect(r.err).toBe(null);
    expect(r.panorama).toBe(true);
    expect(r.state).toBe('menu');
    expect(r.note).toContain('Мир повреждён');
  });

  test('мусор в настройках не ломает картинку: угол обзора, чувствительность, громкость, облака, графика - в допустимых пределах', async ({ page }) => {
    await page.addInitScript(() => { localStorage.setItem('cubeworld_settings_v2', JSON.stringify({ fov: 'abc', clouds: 9, renderDistance: 'x', keys: 5, volume: 'loud', sensitivity: null, graphics: 7, particles: 'lots' })); });
    await openVoxel(page);
    await newWorld(page, { seed: 5 });
    const r = await page.evaluate(() => { const v = __voxel, s = v.settings; return { fov: v.game.camera.fov, sfov: s.fov, sens: s.sensitivity, vol: s.volume, clouds: s.clouds, graphics: s.graphics, keys: typeof s.keys, rd: s.renderDistance }; });
    expect(Number.isFinite(r.fov)).toBe(true);
    expect(r.fov).toBeGreaterThanOrEqual(30); expect(r.fov).toBeLessThanOrEqual(110);
    expect(Number.isFinite(r.sens)).toBe(true);
    expect(r.vol).toBeGreaterThanOrEqual(0); expect(r.vol).toBeLessThanOrEqual(100);
    expect([0, 1, 2]).toContain(r.clouds);
    expect(['fast', 'fancy']).toContain(r.graphics);
    expect(r.keys).toBe('object');
    await page.evaluate(() => __voxel.VX.ui.show('settings'));
    expect(await page.locator('#scr-settings').textContent()).not.toContain('undefined');
  });

  test('кусок в хранилище неверного типа не превращается в воздух: такой кусок строится заново', async ({ page }) => {
    await openVoxel(page);
    const r = await page.evaluate(async () => {
      const v = __voxel, G = v.game, S = v.VX.store, C = v.core;
      v.settings.renderDistance = 2; G.applySettings();
      const meta = await G.createWorld({ name: 'Кусок', seed: '12', mode: 'survival' });
      const sp = meta.spawn, cx = Math.floor(sp.x / 16), cz = Math.floor(sp.z / 16);
      await S.flush();
      // прямо в IndexedDB: строка под героем, объект и число в соседних кусках
      await new Promise((ok) => { const rq = indexedDB.open('cubeworld'); rq.onsuccess = () => { const t = rq.result.transaction('chunks', 'readwrite'), os = t.objectStore('chunks'); os.put('мусор', meta.id + '|' + cx + '|' + cz); os.put({ a: 1 }, meta.id + '|' + (cx + 1) + '|' + cz); os.put(5, meta.id + '|' + cx + '|' + (cz + 1)); t.oncomplete = ok; }; });
      await v.openWorld(meta.id);
      const ch = v.world.chunk(cx, cz);
      let solid = 0; for (const q of ch.data) if (q) solid++;
      const same = [[cx, cz], [cx + 1, cz], [cx, cz + 1]].every(([a, b]) => { const q = v.world.chunk(a, b); return q && q.data && C.checksum(q.data) === C.checksum(C.generate(meta.seedNum, a, b)); });
      return { solid, same, alive: !v.player.dead };
    });
    expect(r.solid).toBeGreaterThan(1000);
    expect(r.same).toBe(true);
    expect(r.alive).toBe(true);
  });
});

test.describe('minecraft_clone_3d_1: второе ревью - лёд', () => {
  test('лёд над водой без тёмных полос на стыках кусков: у льда над водой нет второй (нижней) грани, полупрозрачных слоёв везде одинаково; снимок ровный', async ({ page }) => {
    await openVoxel(page);
    await page.evaluate(() => { localStorage.setItem('cubeworld_settings_v2', JSON.stringify({ renderDistance: 4 })); });
    await page.goto(page.url().split('?')[0] + '?seed=4242&mode=creative');
    await page.waitForFunction(() => window.__voxel && __voxel.state === 'play', null, { timeout: 60000 });
    const r = await page.evaluate(async () => {
      const v = __voxel, C = v.core, w = v.world, pl = v.player;
      v.game.autoSpawn = false; v.game.hideHand = true; v.game.hideHud = true;
      pl.flying = true; pl.pos.set(8.0, 68, -40.0); v.look(0, -Math.PI / 2 + 0.002);
      v.game.simulate = () => {};
      await v.waitIdle(2);
      // сетка куска, целиком покрытого льдом над водой
      const ch = w.chunk(0, -3), m = C.buildMesh(w.neighbours(ch), w.opts), T = m.trans;
      let down = 0, up = 0;
      for (let q = 0; q < T.quads; q++) {
        const ys = [0, 1, 2, 3].map((k) => T.pos[(q * 4 + k) * 3 + 1]);
        if (ys.every((y) => y === 48)) down++; else if (ys.every((y) => y === 49)) up++;
      }
      await new Promise((rr) => setTimeout(rr, 600));
      // строка пикселей поперёк стыка (x = 0 мира около x=425 на экране) против середины куска
      const cv = document.getElementById('gc');
      const g = document.createElement('canvas'); g.width = cv.width; g.height = cv.height;
      v.game.renderer.render(v.game.scene, v.game.camera);
      g.getContext('2d').drawImage(cv, 0, 0);
      const px = (x, y) => { const d = g.getContext('2d').getImageData(Math.round(x * cv.width / cv.clientWidth), Math.round(y * cv.height / cv.clientHeight), 1, 1).data; return d[0] + d[1] + d[2]; };
      let minB = 1e9, maxB = 0;
      for (let x = 300; x <= 560; x += 2) { const b = px(x, 400); minB = Math.min(minB, b); maxB = Math.max(maxB, b); }
      return { down, up, minB, maxB };
    });
    expect(r.up).toBe(256);
    expect(r.down).toBe(0);
    console.log("яркость", r.minB, r.maxB);
    expect(r.maxB - r.minB).toBeLessThan(120);       // раньше полоса темнее льда на 200+
  });
});

async function arena(page, mode = 'survival') {
  await openVoxel(page);
  await newWorld(page, { seed: 8, mode });
  await page.evaluate(() => { __voxel.game.autoSpawn = false; __voxel.entities.clear(); __voxel.game.ticks = 4000; });
  await flatArena(page, 70, 7);
}

test.describe('minecraft_clone_3d_1: второе ревью - мелочи и настоящий ввод', () => {
  test('творческий: настоящий щелчок мышью по мобу на фоне неба убивает его с одного удара (без testMode)', async ({ page }) => {
    await page.addInitScript(LOCK_STUB);
    await openVoxel(page, 'seed=5&mode=creative');
    await page.waitForFunction(() => __voxel.state === 'play', null, { timeout: 60000 });
    await page.evaluate(() => { __voxel.game.testMode = false; });
    await humanClick(page);                                  // захват мыши
    await page.waitForTimeout(100);
    const id = await page.evaluate(() => {
      const v = __voxel, p = v.player, B = v.core.B;
      v.entities.clear(); v.game.autoSpawn = false;
      p.flying = false; p.vel.set(0, 0, 0);
      const x0 = Math.floor(p.pos.x), z0 = Math.floor(p.pos.z), y0 = 110;
      for (let x = x0 - 3; x <= x0 + 3; x++) for (let z = z0 - 5; z <= z0 + 3; z++) { v.setBlock(x, y0 - 1, z, B.stone); for (let k = 0; k < 8; k++) v.setBlock(x, y0 + k, z, 0); }
      v.setBlock(x0, y0, z0 - 2, B.stone);                  // пьедестал: свинья на уровне глаз, за ней небо
      p.pos.set(x0 + 0.5, y0, z0 + 0.5); v.step(0.05, 3);
      v.look(0, 0);
      const m = v.spawnMob('pig', 0, -2); m.x = x0 + 0.5; m.z = z0 - 1.5; m.y = y0 + 1; m.vx = m.vz = 0;
      return { id: m.id, sky: !v.target(), locked: !!document.pointerLockElement };
    });
    expect(id.locked).toBe(true);
    expect(id.sky).toBe(true);                               // за свиньёй блока нет - только небо
    await humanClick(page);
    await page.waitForTimeout(150);
    const pig = await page.evaluate((id) => { const m = __voxel.entities.mobs.find((q) => q.id === id); return m ? { hp: m.hp, dead: m.deadT > 0 } : 'gone'; }, id.id);
    expect(pig === 'gone' || pig.dead).toBe(true);
  });

  test('кактус колет, как только зашёл в его клетку; подсказка над лодкой на тёмной подложке; у игрока волосы на затылке; зелья и шарики опыта - общие материалы', async ({ page }) => {
    await arena(page);
    const r = await page.evaluate(() => {
      const v = __voxel, B = v.core.B, p = v.player, I = v.data.I, E = v.entities, BR = v.VX.brewing;
      const x0 = Math.floor(p.pos.x), z0 = Math.floor(p.pos.z);
      v.setBlock(x0 + 2, 70, z0, B.cactus);
      // край героя на 0.03 внутри клетки кактуса, до его коробки ещё 1/32
      p.pos.set(x0 + 2 - 0.3 + 0.03, 70, z0 + 0.5); p.vel.set(0, 0, 0); p.health = 20; p.hurtCool = 0;
      v.step(0.05, 1);
      const pricked = p.health < 20;
      v.setBlock(x0 + 2, 70, z0, 0);
      v.game.say('Shift - выйти');
      const bg = getComputedStyle(document.getElementById('actionBar')).backgroundColor;
      const md = E.buildModel('player'), hm = md.head.material;
      const hairBack = hm[5].map === hm[2].map && hm[5].map !== hm[4].map;
      md.root.parent.remove(md.root);
      for (let k = 0; k < 5; k++) { v.inv.slots[0] = { id: I.splash_healing, count: 1, dmg: 0 }; v.select(0); v.look(k, 0.6); v.place(); }
      BR.render();
      const potMats = new Set(BR.flying.map((f) => f.mesh && f.mesh.material)).size;
      v.VX.xp.spawn(p.pos.x + 3, 71, p.pos.z, 300); v.VX.xp.render();
      const orbMats = new Set(v.VX.xp.orbs.map((o) => o.mesh.material)).size;
      return { pricked, bg, hairBack, potMats, pots: BR.flying.length, orbMats, orbs: v.VX.xp.orbs.length };
    });
    expect(r.pricked).toBe(true);
    expect(r.bg).not.toBe('rgba(0, 0, 0, 0)');
    expect(r.hairBack).toBe(true);
    expect(r.pots).toBeGreaterThan(1);
    expect(r.potMats).toBe(1);
    expect(r.orbs).toBeGreaterThan(1);
    expect(r.orbMats).toBe(1);
  });

  test('леска начинается у кончика удочки в руке (на экране там же, где кончик картинки в руке)', async ({ page }) => {
    await arena(page);
    const r = await page.evaluate(async () => {
      const v = __voxel, I = v.data.I, F = v.VX.fishing, G = v.game;
      v.inv.slots[0] = { id: I.fishing_rod, count: 1, dmg: 0 }; v.select(0); v.look(0, -0.3);
      v.place();
      await new Promise((rr) => setTimeout(rr, 1200));          // взмах руки после заброса закончился
      const a = F.line.geometry.attributes.position, start = new THREE.Vector3(a.getX(0), a.getY(0), a.getZ(0)).project(G.camera);
      const tip = G.handPoint(13.5 / 16 - 0.5, 0.5 - 3 / 16).project(G.camera);
      return { sx: start.x, sy: start.y, tx: tip.x, ty: tip.y };
    });
    expect(Math.abs(r.sx - r.tx)).toBeLessThan(0.05);
    expect(Math.abs(r.sy - r.ty)).toBeLessThan(0.05);
    expect(r.sx).toBeGreaterThan(0.3);                        // справа внизу, где рука
    expect(r.sy).toBeLessThan(0);
  });

  test('пауза оболочки на титульном экране останавливает панораму (не крутится и не рисуется), resume - снова идёт', async ({ page }) => {
    await openVoxel(page);
    const r = await page.evaluate(async () => {
      const v = __voxel, G = v.game, wait = (ms) => new Promise((rr) => setTimeout(rr, ms));
      await wait(300);
      window.postMessage({ mix: 'pause' }, '*'); await wait(100);
      const t0 = G.ticks, f0 = G.renderer.info.render.frame; await wait(500);
      const paused = { ticks: G.ticks - t0, frames: G.renderer.info.render.frame - f0 };
      window.postMessage({ mix: 'resume' }, '*'); await wait(100);
      const t1 = G.ticks; await wait(500);
      return { paused, after: G.ticks - t1, state: v.state };
    });
    expect(r.state).toBe('menu');
    expect(r.paused.ticks).toBe(0);
    expect(r.paused.frames).toBe(0);
    expect(r.after).toBeGreaterThan(0);
  });
});

test.describe('minecraft_clone_3d_1: Esc-Esc как просил владелец', () => {
  test('Esc - пауза, второй Esc - игра идёт сразу: никакой надписи «нажмите/щёлкните», клавиатура работает до щелчка; первый щелчок тихо возвращает захват и не ломает блок; отказ браузера - повтор на следующем щелчке', async ({ page }) => {
    await openVoxel(page);
    await newWorld(page, { seed: 8, mode: 'survival' });
    await page.evaluate(() => { __voxel.game.autoSpawn = false; __voxel.entities.clear(); });
    await flatArena(page, 70, 7);
    const shot = (n) => page.screenshot({ path: require('path').join(process.env.TEMP || '.', 'voxel-esc-' + n + '.png') }).catch(() => {});
    // как в настоящем браузере: захват только по действию человека (щелчок), Esc действием не считается
    await page.evaluate(() => { window.__lockNeedsGesture = true; __voxel.game.testMode = false; __voxel.look(0, -1.2); });
    await humanClick(page);                                   // захватили мышь
    await page.waitForTimeout(100);
    const visibleText = () => page.evaluate(() => document.body.innerText);
    const s0 = await page.evaluate(() => ({ locked: !!document.pointerLockElement, broken: __voxel.meta.stats.broken }));
    expect(s0.locked).toBe(true);
    // Esc в браузере снимает захват (сама клавиша в страницу не приходит) - пауза
    await page.evaluate(() => window.__browserEsc());
    await page.waitForTimeout(100);
    await shot('1-pause');
    expect(await page.evaluate(() => __voxel.state)).toBe('paused');
    // второй Esc - игра
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    await shot('2-esc2');
    const t1 = await visibleText();
    await page.waitForTimeout(800);
    await shot('3-wait');
    const t2 = await visibleText();
    const st = await page.evaluate(() => ({ state: __voxel.state, locked: !!document.pointerLockElement, screens: [...document.querySelectorAll('.screen.show')].map((s) => s.id), hint: getComputedStyle(document.getElementById('clickHint')).display }));
    expect(st.state).toBe('play');
    expect(st.locked).toBe(false);                            // браузер по Esc захват не дал
    expect(st.screens).toEqual(['scr-hud']);
    expect(st.hint).toBe('none');
    expect(t1).not.toMatch(/нажмите|щёлкните|click/i);
    expect(t2).not.toMatch(/нажмите|щёлкните|click/i);
    // клавиатура работает до щелчка
    const z0 = await page.evaluate(() => __voxel.player.pos.z);
    await page.keyboard.down('KeyW'); await page.waitForTimeout(400); await page.keyboard.up('KeyW');
    const z1 = await page.evaluate(() => __voxel.player.pos.z);
    expect(z0 - z1).toBeGreaterThan(0.5);
    // первый щелчок, но браузер ещё отказывает (пауза после Esc) - молча, без надписи; второй щелчок - захват
    // творческий: любой щелчок, дошедший до игры, сломал бы блок сразу - так видно, что щелчки захвата не ломают
    await page.evaluate(() => { __voxel.game.mode = 'creative'; __voxel.look(0, -1.2); });
    const before = await page.evaluate(() => ({ calls: window.__lockCalls, broken: __voxel.meta.stats.broken, under: __voxel.target() && __voxel.target().id }));
    await page.evaluate(() => { window.__denyLock = true; });
    await humanClick(page);
    await page.waitForTimeout(150);
    await shot('4-click-denied');
    const mid = await page.evaluate(() => ({ calls: window.__lockCalls, locked: !!document.pointerLockElement, text: document.body.innerText, broken: __voxel.meta.stats.broken }));
    expect(mid.calls).toBeGreaterThan(before.calls);
    expect(mid.locked).toBe(false);
    expect(mid.text).not.toMatch(/нажмите|щёлкните|click/i);
    await page.evaluate(() => { window.__denyLock = false; });
    await humanClick(page);
    await page.waitForTimeout(150);
    await shot('5-click-locked');
    const after = await page.evaluate(() => ({ calls: window.__lockCalls, locked: !!document.pointerLockElement, broken: __voxel.meta.stats.broken, under: __voxel.target() && __voxel.target().id, mining: !!__voxel.game.mining }));
    expect(after.calls).toBeGreaterThan(mid.calls);
    expect(after.locked).toBe(true);
    expect(after.broken).toBe(before.broken);                // щелчки захвата блок не ломали
    expect(after.under).toBe(before.under);
    expect(after.mining).toBe(false);
  });

  test('отказ браузера на щелчке - повтор и при движении мыши с нажатой кнопкой; при самом первом входе в мир без захвата подсказка короткая, при Esc-Esc - никогда', async ({ page }) => {
    await page.addInitScript(() => { window.__denyLock = true; });
    await openVoxel(page, 'seed=5&mode=creative');
    await page.waitForFunction(() => __voxel.state === 'play', null, { timeout: 60000 });
    const first = await page.evaluate(() => ({ hint: getComputedStyle(document.getElementById('clickHint')).display, hintT: __voxel.game.hintT }));
    await page.evaluate(() => { __voxel.game.testMode = false; });
    const c0 = await page.evaluate(() => window.__lockCalls);
    await page.mouse.move(640, 360); await page.mouse.down();          // щелчок - браузер ещё отказывает
    await page.waitForTimeout(100);
    const c1 = await page.evaluate(() => window.__lockCalls);
    await page.evaluate(() => { window.__denyLock = false; });
    await page.mouse.move(660, 370, { steps: 3 });                       // кнопка нажата, мышь двигается - повтор
    await page.waitForTimeout(400);
    await page.mouse.up();
    const r = await page.evaluate(() => ({ calls: window.__lockCalls, locked: !!document.pointerLockElement }));
    expect(first.hintT).toBeGreaterThan(0);                  // первый вход в мир: короткая подсказка допустима
    expect(c1).toBeGreaterThan(c0);
    expect(r.calls).toBeGreaterThan(c1);
    expect(r.locked).toBe(true);
  });
});
