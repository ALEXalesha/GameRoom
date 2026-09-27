// Законы свободной езды «Horizon Drift»: для каждой большой карты - связность дорог, машина не проваливается
// при потоковой загрузке даже на 300 км/ч, память не растёт за 10 минут езды; плюс точки мира, карьера из мира,
// быстрое перемещение, сохранение по картам, пауза, погода.
const { test, expect } = require('@playwright/test');
const { openDrift } = require('./_drift-helpers');

const MAPS = ['coast', 'mountains', 'desert', 'metro'];
const startWorld = (page, map, o) => page.evaluate(async ([map, o]) => { await __drift.startWorld(map, o || { fest: true }); __drift.manual = true; return __drift.world.M.id; }, [map, o]);

test.describe('horizon_drift_offline: открытый мир', () => {
  test.describe.configure({ timeout: 240_000 });

  test('карты из данных: не меньше трёх больших карт, дороги связны, выборки непрерывны, точки у дорог', async ({ page }) => {
    await openDrift(page);
    const rep = await page.evaluate(() => {
      const WD = __drift.worldData;
      return WD.MAPS.map((def) => {
        const M = WD.buildMap(def.id), con = WD.graphConnected(M);
        let maxGap = 0, endGap = 0;
        for (const e of M.edges) {
          for (let i = e.i0 + 1; i <= e.i1; i++) maxGap = Math.max(maxGap, Math.hypot(M.X[i] - M.X[i - 1], M.Z[i] - M.Z[i - 1]));
          endGap = Math.max(endGap, Math.hypot(M.X[e.i0] - M.nodes[e.a].x, M.Z[e.i0] - M.nodes[e.a].z), Math.hypot(M.X[e.i1] - M.nodes[e.b].x, M.Z[e.i1] - M.nodes[e.b].z));
        }
        const far = M.points.filter((p) => { let d = 1e9; for (let i = 0; i < M.N; i += 3) d = Math.min(d, Math.hypot(M.X[i] - p.x, M.Z[i] - p.z)); return d > 70; }).map((p) => p.id);
        const types = {}; M.points.forEach((p) => { types[p.type] = (types[p.type] || 0) + 1; });
        // маршрут по рёбрам есть между любыми двумя рёбрами
        let routes = true; for (const a of M.edges) for (const b of M.edges) if (!WD.routeEdges(M, a.id, b.id)) routes = false;
        return { id: def.id, reached: con.reached, all: con.all, maxGap, endGap, far, types, sizeKm: M.half * 2 / 1000, roadKm: M.totalRoad / 1000, routes,
          bridges: Array.from(M.FL).filter((f) => f & 1).length, tunnels: Array.from(M.FL).filter((f) => f & 2).length };
      });
    });
    expect(rep.length).toBeGreaterThanOrEqual(3);
    for (const r of rep) {
      expect(r.reached, r.id).toBe(r.all);
      expect(r.routes, r.id).toBe(true);
      expect(r.maxGap, r.id).toBeLessThan(3);
      expect(r.endGap, r.id).toBeLessThan(0.5);
      expect(r.far, r.id).toEqual([]);
      expect(r.sizeKm, r.id).toBeGreaterThan(8);
      expect(r.roadKm, r.id).toBeGreaterThan(40);
      expect(r.types.radar, r.id).toBeGreaterThanOrEqual(4);
      expect(r.types.drift, r.id).toBeGreaterThanOrEqual(4);
      expect(r.types.jump, r.id).toBeGreaterThanOrEqual(3);
      expect(r.types.board, r.id).toBeGreaterThanOrEqual(25);
      expect(r.types.event, r.id).toBeGreaterThanOrEqual(1);
    }
    expect(rep.some((r) => r.bridges > 0) && rep.some((r) => r.tunnels > 0)).toBe(true);
  });

  for (const map of MAPS) {
    test(`${map}: на 300 км/ч при отстающей подгрузке машина не проваливается, рельеф не накрывает дорогу`, async ({ page }) => {
      await page.setViewportSize({ width: 640, height: 400 });
      await openDrift(page);
      await startWorld(page, map);
      const r = await page.evaluate(() => {
        const w = __drift.world, M = w.M, p = w.player, W = __drift.worldRender, g = {};
        let worst = 0, maxGapGround = 0, steps = 0, air = 0;
        // ведём машину по цепочке рёбер ровно по дороге со скоростью 83 м/с (300 км/ч);
        // физика считает высоту сама, а подгрузка кусков - лишь раз в 20 шагов и по одному куску
        let e = M.edges.find((x) => x.type === 'highway') || M.edges[0], dir = 1, s = 10, i = e.i0;
        for (let n = 0; n < 60 * 120; n++) {
          s += 83.3 / 120;
          if (s >= e.len - 2) { const node = dir > 0 ? e.b : e.a, opts = M.nodes[node].edges.filter((x) => x !== e.id); const ne = M.edges[opts.length ? opts[n % opts.length] : e.id]; dir = ne.a === node ? 1 : -1; if (ne.id === e.id) dir = -dir; e = ne; s = 2; }
          const k = dir > 0 ? Math.min(e.i1 - 1, e.i0 + Math.floor(s / e.step)) : Math.max(e.i0 + 1, e.i1 - Math.floor(s / e.step)); i = k;
          const h = Math.atan2(M.TX[k] * dir, M.TZ[k] * dir);
          p.x = M.X[k]; p.z = M.Z[k]; p.h = h; p.vx = Math.sin(h) * 83.3; p.vz = Math.cos(h) * 83.3; p.w = 0;
          w.step(1 / 120, { thr: 1 });
          w.events.length = 0;
          const gy = M.groundAt(p.x, p.z, g).y;
          worst = Math.min(worst, p.y - gy);
          if (p.air) air++; else maxGapGround = Math.max(maxGapGround, p.y - gy);
          if (n % 20 === 0) W.stream(false, 0);
          steps++;
        }
        // догрузить и проверить, что сетка рельефа не выше дороги около машины
        for (let k = 0; k < 40 && W.info().pending > 0; k++) W.stream(true);
        let buried = 0, checked = 0;
        const q = M.nearestRoad(p.x, p.z) || { i, edge: e };
        for (let d = -60; d <= 60; d += 3) {
          const j = Math.min(q.edge.i1, Math.max(q.edge.i0, q.i + d)), mh = W.meshHeight(M.X[j], M.Z[j]);
          if (mh === null) continue; checked++;
          if (mh > M.Y[j] + 0.05) buried++;
        }
        return { worst, maxGapGround, steps, airFrac: air / steps, buried, checked, dist: Math.hypot(p.x, p.z) };
      });
      expect(r.worst).toBeGreaterThanOrEqual(-1e-6);
      expect(r.maxGapGround).toBeLessThan(0.01);
      expect(r.airFrac).toBeLessThan(0.2);
      expect(r.checked).toBeGreaterThan(20);
      expect(r.buried).toBe(0);
    });

    test(`${map}: 10 минут езды - число геометрий и текстур не растёт`, async ({ page }) => {
      await page.setViewportSize({ width: 480, height: 300 });
      await openDrift(page);
      await startWorld(page, map);
      const r = await page.evaluate(async () => {
        const w = __drift.world, W = __drift.worldRender, info = __drift.renderer.info;
        const frame = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
        const carGeo = () => { let n = 0; for (const cm of W.carMeshes.values()) { const set = new Set(); cm.root.traverse((o) => { if (o.geometry) set.add(o.geometry); }); n += set.size; } return n; };
        // одно и то же место (фестиваль), кусков догружено полностью; машины в счёт не входят
        const atFest = async () => { w.placeAtPoint('fest'); __drift.stepWorld(2); for (let k = 0; k < 60 && (W.info().pending > 0 || k < 2); k++) { W.stream(true); await frame(); } return { geo: info.memory.geometries, tex: info.memory.textures, chunks: W.info().chunks, cars: w.cars.length }; };
        w.save.autoTime = true;
        // куски мира меряем без попутчиков (их меши создаются и удаляются отдельно - ниже проверка числа мешей машин)
        w.trafficOn = false; for (const a of w.traffic.slice()) w.removeAi(a); for (const a of w.rivals.slice()) w.removeAi(a);
        let maxChunks = 0, maxCars = 0, before = null;
        for (let min = 0; min < 10; min++) {
          w.setAutopilot(36);
          for (let k = 0; k < 60; k++) { __drift.stepWorld(120); W.stream(false, 3); if (k % 10 === 0) await frame(); maxChunks = Math.max(maxChunks, W.info().chunks); maxCars = Math.max(maxCars, W.carMeshes.size); }
          // первая минута - прогрев (видеокарта впервые видит часть общих буферов), дальше счётчики стоят
          if (min === 0) { w.setAutopilot(0); before = await atFest(); }
        }
        w.setAutopilot(0);
        const after = await atFest();
        // попутчики: 30 раз появился и исчез - счётчики возвращаются
        const g0 = info.memory.geometries, t0 = info.memory.textures;
        const e = w.M.edges.find((x) => x.type === 'highway') || w.M.edges[0];
        const p = w.player, near = w.M.nearestRoad(p.x, p.z);
        for (let k = 0; k < 30; k++) { const a = w.spawnAi(near.edge, near.i, 1, ['iskra', 'kobalt', 'buran'][k % 3], 'x', 20, false); a.car.look = { color: '#2f7dd8', color2: '#ffffff', rims: 'solid', rimColor: '#c9ced6', livery: 'stripes' }; w.traffic.push(a); await frame(); w.removeAi(a); await frame(); }
        return { before, after, maxChunks, maxCars, t: w.t, churn: { before: g0 + t0, after: info.memory.geometries + info.memory.textures }, e: e.id };
      });
      expect(r.t).toBeGreaterThan(600);
      expect(r.after.chunks).toBe(r.before.chunks);
      expect(r.after.geo).toBeLessThanOrEqual(r.before.geo + 4);            // утечка куска дала бы сотни геометрий за 9 минут
      expect(r.after.tex).toBeLessThanOrEqual(r.before.tex);
      expect(r.maxChunks).toBeLessThanOrEqual(81);
      expect(r.maxCars).toBeLessThanOrEqual(10);
      expect(r.churn.after).toBeLessThanOrEqual(r.churn.before);
    });
  }

  test('событие карьеры из мира засчитывается и возвращает в мир', async ({ page }) => {
    await openDrift(page);
    await page.evaluate(() => { const c = __drift.career; c.d.owned.push('mirage'); c.d.current = 'mirage'; c.d.upg.mirage = { engine: 3, tyres: 3, susp: 3, weight: 3, nitro: 3 }; c.save(c.d); });
    await startWorld(page, 'coast');
    await page.evaluate(() => { const w = __drift.world, pt = w.M.pointById('ev-city'); w.placeAt(pt.x, pt.z); const p = w.player; p.x = pt.x; p.z = pt.z; p.y = w.M.groundAt(p.x, p.z).y; __drift.stepWorld(5); __drift.manual = false; });
    await expect(page.locator('#wPrompt')).toContainText('События');
    await page.keyboard.press('KeyE');
    await expect(page.locator('#scrHub')).toBeVisible();
    await page.evaluate(() => { __drift.manual = true; });
    await page.locator('#hubList button[data-evt="c1e1"]').click();
    await page.waitForFunction(() => __drift.screen === 'race' && __drift.race);
    await page.evaluate(() => { const r = __drift.race; r.setAutopilot(r.player, 1); for (let i = 0; i < 400 * 120 && r.phase !== 'done'; i++) __drift.step(1); __drift.showResults(); });
    expect(await page.evaluate(() => __drift.career.eventMedal('c1e1'))).toBe('gold');
    await expect(page.locator('#resNext')).toHaveText('Вернуться в мир');
    await page.locator('#resNext').click();
    await page.waitForFunction(() => __drift.screen === 'world');
    expect(await page.evaluate(() => [!!__drift.world, __drift.world.M.id, !!__drift.worldRender.world])).toEqual([true, 'coast', true]);
  });

  test('щит засчитывается один раз: деньги один раз, после перезагрузки тоже', async ({ page }) => {
    await openDrift(page);
    await startWorld(page, 'desert');
    const hit = () => page.evaluate(() => {
      const w = __drift.world, pt = w.M.points.find((q) => q.type === 'board'), p = w.player;
      const h = Math.atan2(pt.x - (pt.x - 20), 0); void h;
      p.x = pt.x - 20; p.z = pt.z; p.y = w.M.groundAt(p.x, p.z).y; p.h = Math.PI / 2 * -1 * -1; p.h = Math.atan2(1, 0); p.vx = 20; p.vz = 0; p.air = false;
      const m0 = __drift.career.money;
      for (let i = 0; i < 240; i++) { __drift.stepWorld(1, { thr: 0.5 }); p.z = pt.z; }
      return { id: pt.id, got: !!w.save.boards[pt.id], money: __drift.career.money - m0, count: w.counts().boards };
    });
    const a = await hit();
    expect(a.got).toBe(true);
    expect(a.money).toBe(500);
    expect(a.count).toBe(1);
    const b = await hit();
    expect(b.money).toBe(0);
    expect(b.count).toBe(1);
    await page.evaluate(() => __drift.saveWorld());
    await page.reload();
    await page.waitForFunction(() => window.__drift && __drift.ready);
    await startWorld(page, 'desert', { fest: false });
    const c = await hit();
    expect(c.money).toBe(0);
    expect(c.count).toBe(1);
  });

  test('быстрое перемещение - только к открытым точкам; открытие - когда подъедешь', async ({ page }) => {
    await openDrift(page);
    await startWorld(page, 'mountains');
    const r = await page.evaluate(() => {
      const w = __drift.world, p = w.player, M = w.M;
      const far = M.points.filter((q) => q.type === 'radar' && !w.save.disc[q.id]).sort((a, b) => Math.hypot(b.x - p.x, b.z - p.z) - Math.hypot(a.x - p.x, a.z - p.z))[0];
      const before = [p.x, p.z], closed = __drift.worldTravel(far.id), after = [p.x, p.z];
      w.placeAt(far.x, far.z); __drift.stepWorld(61);
      const opened = !!w.save.disc[far.id];
      w.placeAtPoint('fest'); __drift.stepWorld(2);
      const ok = __drift.worldTravel(far.id), d = Math.hypot(p.x - far.x, p.z - far.z);
      return { closed, same: before[0] === after[0] && before[1] === after[1], opened, ok, d };
    });
    expect(r.closed).toBe(false);
    expect(r.same).toBe(true);
    expect(r.opened).toBe(true);
    expect(r.ok).toBe(true);
    expect(r.d).toBeLessThan(40);
  });

  test('рекорды мира: радар, прыжок с рампы, зона дрифта; сохранение по карте переживает перезагрузку', async ({ page }) => {
    await openDrift(page);
    // заднеприводный «Вихрь»: передний привод «Искры» ручником почти не срывается в занос
    await page.evaluate(() => { const c = __drift.career; c.d.owned.push('vihr'); c.d.current = 'vihr'; c.save(c.d); });
    await startWorld(page, 'coast');
    const r = await page.evaluate(() => {
      const w = __drift.world, M = w.M, p = w.player;
      const along = (i, back, v) => { const h = Math.atan2(M.TX[i], M.TZ[i]); p.x = M.X[i] - M.TX[i] * back; p.z = M.Z[i] - M.TZ[i] * back; p.h = h; p.y = M.groundAt(p.x, p.z).y; p.vx = Math.sin(h) * v; p.vz = Math.cos(h) * v; p.air = false; p.w = 0; };
      const radar = M.points.find((q) => q.type === 'radar'); along(radar.i, 60, 40);
      for (let i = 0; i < 360; i++) __drift.stepWorld(1, { thr: 1 });
      const jump = M.points.find((q) => q.type === 'jump'), rp = jump.ramp, h = Math.atan2(rp.tx, rp.tz);
      p.x = rp.x - rp.tx * 30; p.z = rp.z - rp.tz * 30; p.h = h; p.y = M.groundAt(p.x, p.z).y; p.vx = Math.sin(h) * 32; p.vz = Math.cos(h) * 32; p.air = false; p.w = 0;
      let airborne = false;
      for (let i = 0; i < 600; i++) { __drift.stepWorld(1, { thr: 1 }); if (p.air) airborne = true; if (airborne && !p.air && i > 200) break; }
      const zone = M.points.find((q) => q.type === 'drift'); along(zone.i0 + 5, 0, 22);
      p.assist.tc = false; p.assist.steer = false;
      for (let i = 0; i < 40; i++) __drift.stepWorld(1, { thr: 1, steer: 1, hb: 1 });
      for (let i = 0; i < 150; i++) __drift.stepWorld(1, { thr: 1, steer: 0.4 });
      w.placeAtPoint('fest'); __drift.stepWorld(3);
      w.save.weather = 'rain'; w.save.autoTime = false; w.save.tod = 21.5;
      __drift.saveWorld();
      return { radar: w.save.rec.radar[radar.id], jump: w.save.rec.jump[jump.id], airborne, drift: w.save.rec.drift[zone.id], pos: [p.x, p.z] };
    });
    expect(r.radar).toBeGreaterThan(120);
    expect(r.airborne).toBe(true);
    expect(r.jump).toBeGreaterThan(8);
    expect(r.drift).toBeGreaterThan(0);
    await page.reload();
    await page.waitForFunction(() => window.__drift && __drift.ready);
    await startWorld(page, 'coast', { fest: false });
    const s = await page.evaluate(() => { const w = __drift.world; return { rec: w.save.rec, weather: w.save.weather, tod: w.save.tod, pos: [w.player.x, w.player.z] }; });
    expect(s.rec.radar).toEqual(expect.objectContaining({ [Object.keys(s.rec.radar)[0]]: r.radar }));
    expect(Object.values(s.rec.jump)[0]).toBe(r.jump);
    expect(s.weather).toBe('rain');
    expect(s.tod).toBe(21.5);
    expect(Math.hypot(s.pos[0] - r.pos[0], s.pos[1] - r.pos[1])).toBeLessThan(30);
    // прогресс у каждой карты свой
    await page.evaluate(() => __drift.quitWorld());
    await startWorld(page, 'desert');
    expect(await page.evaluate(() => Object.keys(__drift.world.save.rec.radar).length)).toBe(0);
  });

  test('погода меняет сцепление: в дождь и снег асфальт держит хуже; пауза при скрытой вкладке и потере фокуса', async ({ page }) => {
    await openDrift(page);
    await startWorld(page, 'metro');
    const r = await page.evaluate(() => {
      const w = __drift.world, M = w.M, p = w.player;
      const brake = (weather) => {
        w.save.weather = weather; const e = M.edges.find((x) => x.type === 'highway'), i = e.i0 + 400, h = Math.atan2(M.TX[i], M.TZ[i]);
        p.x = M.X[i]; p.z = M.Z[i]; p.h = h; p.y = M.Y[i]; p.vx = Math.sin(h) * 30; p.vz = Math.cos(h) * 30; p.air = false; p.w = 0; p.steer = 0;
        let d = 0; for (let k = 0; k < 1200 && (k === 0 || p.speed > 0.2); k++) { const x0 = p.x, z0 = p.z; __drift.stepWorld(1, { brk: 1 }); d += Math.hypot(p.x - x0, p.z - z0); }
        return { d, mul: p.gripMul };
      };
      return { clear: brake('clear'), rain: brake('rain'), snow: brake('snow') };
    });
    expect(r.rain.mul).toBeLessThan(1);
    expect(r.rain.d).toBeGreaterThan(r.clear.d * 1.1);
    expect(r.snow.d).toBeGreaterThan(r.clear.d * 1.1);
    await page.evaluate(() => { __drift.manual = false; });
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(page.locator('#scrPause')).toBeVisible();
    await expect(page.locator('#pRestart')).toHaveText('На фестиваль');
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
    expect(await page.evaluate(() => __drift.paused)).toBe(true);
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => __drift.paused)).toBe(false);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect(page.locator('#scrPause')).toBeVisible();
  });

  test('выбор карты: превью, размер, точки и собранное; большая карта и мир влезают в окно', async ({ page }) => {
    for (const size of [{ width: 1024, height: 700 }, { width: 1920, height: 1080 }]) {
      await page.setViewportSize(size);
      await openDrift(page);
      await page.locator('.mainnav button[data-go="roam"]').click();
      await expect(page.locator('#mapsGrid .mapcard')).toHaveCount(4);
      await expect(page.locator('#mapsGrid .mapcard').first()).toContainText('км');
      await expect(page.locator('#mapsGrid .mapcard').first()).toContainText('Щиты');
      const fits = (sel) => page.evaluate((sel) => {
        const de = document.documentElement, out = [];
        if (de.scrollWidth > innerWidth || de.scrollHeight > innerHeight) out.push('прокрутка');
        for (const el of document.querySelectorAll(sel)) { const r = el.getBoundingClientRect(); if (!r.width) continue; if (r.left < -0.5 || r.top < -0.5 || r.right > innerWidth + 0.5 || r.bottom > innerHeight + 0.5) out.push(sel + ' ' + (el.id || '')); }
        return out;
      }, sel);
      expect(await fits('#rGo, #rCar, .head')).toEqual([]);
      await page.locator('#rGo').click();
      await page.waitForFunction(() => __drift.screen === 'world');
      expect(await fits('#wInfo, #hMap, #hSpeedo, #hNitro, #hKeys, #hPauseBtn')).toEqual([]);
      await page.keyboard.press('KeyM');
      await expect(page.locator('#scrMap')).toBeVisible();
      expect(await fits('#bigMap, #mapSide, #mapClose')).toEqual([]);
      await page.keyboard.press('KeyM');
      await expect(page.locator('#scrMap')).toBeHidden();
      await page.evaluate(() => __drift.quitWorld());
    }
  });
});
