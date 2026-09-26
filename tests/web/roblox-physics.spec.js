// Законы Блоксити, часть 2 - управление и физика: шаг постоянный (1/60 с) и мир повторяется
// один в один; ступни на земле; WASD относительно камеры; плавный разгон; стена держит; на плиту
// можно запрыгнуть; прыжок чуть позже края (coyote) прощается, а поздний - нет; едущая плита везёт;
// руки и ноги машут на бегу; колесо приближает до вида от первого лица; падение в пустоту -
// развал на части и возрождение.
const { test, expect } = require('@playwright/test');
const { openBlox, enter } = require('./_blox-helpers');

test.describe('roblox-mini (Блоксити): физика и управление', () => {
  test.describe.configure({ timeout: 60000 });   // рисование программное (без видеокарты) - медленно
  test('ступни стоят ровно на земле; разгон плавный до скорости бега 16', async ({ page }) => {
    await openBlox(page);
    await enter(page, 'coins');
    const r = await page.evaluate(() => {
      __blox.step(30);
      const p0 = __blox.player();
      const g = __blox.game; g.rig.yaw = 0;
      __blox.key('KeyW'); __blox.step(1);
      const v1 = Math.hypot(__blox.player().vx, __blox.player().vz);
      __blox.step(40);
      const v2 = Math.hypot(__blox.player().vx, __blox.player().vz);
      __blox.key('KeyW', false);
      return { y: p0.y, ground: p0.onGround, v1, v2 };
    });
    expect(r.y).toBe(0);
    expect(r.ground).toBe(true);
    expect(r.v1).toBeGreaterThan(0);
    expect(r.v1).toBeLessThan(8);                        // не мгновенно
    expect(r.v2).toBeCloseTo(16, 1);
  });

  test('WASD - относительно камеры', async ({ page }) => {
    await openBlox(page);
    await enter(page, 'sandbox');   // ровная плита без препятствий рядом
    const r = await page.evaluate(() => {
      const g = __blox.game, out = {};
      const run = (yaw, key) => {
        g.player.teleport(0, 0, -20); g.rig.yaw = yaw; __blox.step(2);
        __blox.key(key); __blox.step(30); __blox.key(key, false);
        const p = __blox.player(); return [Math.round(p.x), Math.round(p.z + 20)];
      };
      out.w0 = run(0, 'KeyW');                    // камера сзади по +Z: вперёд - к -Z
      out.w90 = run(Math.PI / 2, 'KeyW');         // камера по +X: вперёд - к -X
      out.d0 = run(0, 'KeyD');                    // вправо - к +X
      out.s0 = run(0, 'KeyS');
      return out;
    });
    expect(r.w0[0]).toBe(0); expect(r.w0[1]).toBeLessThan(-3);
    expect(r.w90[1]).toBe(0); expect(r.w90[0]).toBeLessThan(-3);
    expect(r.d0[1]).toBe(0); expect(r.d0[0]).toBeGreaterThan(3);
    expect(r.s0[0]).toBe(0); expect(r.s0[1]).toBeGreaterThan(3);
  });

  test('шаг постоянный: одинаковые нажатия дают одинаковый мир на двух страницах', async ({ page, context }) => {
    const script = () => {
      const g = __blox.game; g.rig.yaw = -Math.PI / 2;
      __blox.key('KeyW'); __blox.step(50);
      __blox.key('Space'); __blox.step(12); __blox.key('Space', false);
      __blox.step(40); __blox.key('KeyW', false); __blox.step(20);
      const p = __blox.player();
      return [p.x, p.y, p.z, g.state.t, g.bots.map((b) => [b.body.pos.x, b.body.pos.z])];
    };
    await openBlox(page, 'seed=11&manual=1&fast=1');
    await enter(page, 'race');
    const a = await page.evaluate(script);
    const page2 = await context.newPage();
    await openBlox(page2, 'seed=11&manual=1&fast=1');
    await enter(page2, 'race');
    const b = await page2.evaluate(script);
    expect(b).toEqual(a);
    expect(a[0]).toBeGreaterThan(5);                   // пробежал вперёд
  });

  test('стена не пропускает, на плиту можно запрыгнуть', async ({ page }) => {
    await openBlox(page);
    await enter(page, 'lava');
    const wall = await page.evaluate(() => {
      const g = __blox.game; g.player.teleport(0, 0, 9); g.rig.yaw = 0;   // вперёд - к столбу в центре
      __blox.key('KeyW'); __blox.step(90); __blox.key('KeyW', false);
      return __blox.player().z;
    });
    expect(wall).toBeCloseTo(1.5 + 0.9, 5);             // край столба + полширины героя
    await page.evaluate(() => __blox.leave());
    await enter(page, 'coins');
    const jump = await page.evaluate(() => {
      const g = __blox.game, t = g.state.tower[0];              // плита на высоте 3
      g.player.teleport(t.cx, 0, t.maxZ + 4); g.rig.yaw = 0; __blox.step(2);
      __blox.key('KeyW'); __blox.key('Space'); __blox.step(8); __blox.key('Space', false);
      __blox.step(30); __blox.key('KeyW', false); __blox.step(30);
      const p = __blox.player(); return { y: p.y, ground: p.onGround, on: g.player.ground === t };
    });
    expect(jump).toEqual({ y: 3, ground: true, on: true });
  });

  test('прыжок чуть позже края прощается (coyote), а поздний - нет', async ({ page }) => {
    await openBlox(page);
    await enter(page, 'race');
    const r = await page.evaluate(() => {
      const g = __blox.game;
      const tryAt = (late) => {
        g.player.teleport(9, 0, 0); g.rig.yaw = -Math.PI / 2; __blox.step(2);   // вперёд - к +X, край старта x=11
        __blox.key('KeyW');
        let n = 0; while (g.player.onGround && n < 200) { __blox.step(1); n++; }
        __blox.step(late);
        __blox.key('Space'); __blox.step(1); __blox.key('Space', false);
        const vy = g.player.vel.y; __blox.key('KeyW', false);
        return vy;
      };
      return { early: tryAt(3), late: tryAt(12) };
    });
    expect(r.early).toBeGreaterThan(40);                // прыгнул: 50 минус один шаг тяжести
    expect(r.late).toBeLessThan(0);                     // 0.2 с после края - уже падает
  });

  test('едущая плита везёт стоящего на ней героя', async ({ page }) => {
    await openBlox(page);
    await enter(page, 'obby');
    const r = await page.evaluate(() => {
      const g = __blox.game, m = g.path.find((p) => p.move);
      g.player.teleport(m.cx, m.maxY + 0.3, m.cz); __blox.step(5);
      const dx0 = g.player.pos.x - m.cx, dz0 = g.player.pos.z - m.cz, x0 = m.cx, z0 = m.cz;
      __blox.step(60);
      return { on: g.player.ground === m, moved: Math.hypot(m.cx - x0, m.cz - z0), ddx: g.player.pos.x - m.cx - dx0, ddz: g.player.pos.z - m.cz - dz0, dy: g.player.pos.y - m.maxY };
    });
    expect(r.on).toBe(true);
    expect(r.moved).toBeGreaterThan(1);
    expect(Math.abs(r.ddx)).toBeLessThan(0.01);
    expect(Math.abs(r.ddz)).toBeLessThan(0.01);
    expect(Math.abs(r.dy)).toBeLessThan(0.01);
  });

  test('на бегу руки и ноги машут, стоя - нет; в прыжке руки вверх', async ({ page }) => {
    await openBlox(page);
    await enter(page, 'coins');
    const r = await page.evaluate(() => {
      const g = __blox.game, P = g.ch.pivots;
      __blox.step(30);
      let idle = 0; for (let i = 0; i < 30; i++) { __blox.step(1); idle = Math.max(idle, Math.abs(P.legL.rotation.x)); }
      __blox.key('KeyW'); let run = 0, opp = true;
      for (let i = 0; i < 60; i++) { __blox.step(1); run = Math.max(run, Math.abs(P.legL.rotation.x)); if (Math.abs(P.legL.rotation.x) > 0.2 && Math.sign(P.legL.rotation.x) === Math.sign(P.legR.rotation.x)) opp = false; }
      __blox.key('KeyW', false);
      __blox.key('Space'); for (let i = 0; i < 10; i++) __blox.step(1); __blox.key('Space', false);
      const arms = P.armL.rotation.x;
      return { idle, run, opp, arms };
    });
    expect(r.idle).toBeLessThan(0.05);
    expect(r.run).toBeGreaterThan(0.5);
    expect(r.opp).toBe(true);                           // ноги - в противофазе
    expect(r.arms).toBeGreaterThan(2);                  // руки подняты
  });

  test('ПКМ крутит камеру вокруг героя, колесо приближает до вида от первого лица', async ({ page }) => {
    await openBlox(page);
    await enter(page, 'coins');
    await page.evaluate(() => __blox.step(2));
    const yaw0 = await page.evaluate(() => __blox.game.rig.yaw);
    await page.mouse.move(640, 400);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(740, 400, { steps: 5 });
    await page.mouse.up({ button: 'right' });
    const yaw1 = await page.evaluate(() => __blox.game.rig.yaw);
    expect(yaw1).toBeLessThan(yaw0 - 0.3);
    await page.mouse.move(640, 400);                   // без кнопки - не крутит
    await page.mouse.move(740, 400, { steps: 3 });
    expect(await page.evaluate(() => __blox.game.rig.yaw)).toBe(yaw1);
    for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -600);
    const r = await page.evaluate(() => { __blox.step(30); const g = __blox.game; return { first: g.rig.first, vis: g.ch.body.visible, d: g.camera.position.distanceTo(new THREE.Vector3(g.player.pos.x, g.player.pos.y + 4.5, g.player.pos.z)) }; });
    expect(r).toEqual({ first: true, vis: false, d: expect.any(Number) });
    expect(r.d).toBeLessThan(0.01);
    for (let i = 0; i < 3; i++) await page.mouse.wheel(0, 300);
    const back = await page.evaluate(() => { __blox.step(30); return __blox.game.rig.first; });
    expect(back).toBe(false);
  });

  test('падение в пустоту: развал на части, звук, возрождение на старте', async ({ page }) => {
    await openBlox(page);
    await enter(page, 'coins');
    const r = await page.evaluate(() => {
      const g = __blox.game;
      g.player.teleport(200, 5, 0);
      const n = __blox.until((gg) => gg.dead, 600);
      const pieces = g.pieces.length, hidden = !g.ch.body.visible, snd = __blox.B.sound.played.includes('ouch');
      __blox.step(60 * 3);
      const p = __blox.player();
      return { died: n < 600, pieces, hidden, snd, alive: !g.dead, at: [p.x, p.z], deaths: __blox.B.acct.placeStats('coins').deaths };
    });
    expect(r.died).toBe(true);
    expect(r.pieces).toBeGreaterThanOrEqual(6);
    expect(r.hidden).toBe(true);
    expect(r.snd).toBe(true);
    expect(r.alive).toBe(true);
    expect(r.at).toEqual([0, -50]);
    expect(r.deaths).toBe(1);
  });
});
