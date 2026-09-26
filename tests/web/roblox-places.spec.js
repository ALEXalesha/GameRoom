// Законы Блоксити, часть 3 - места: контрольная точка обби; таймер и медали забега по порогам;
// лава убивает, рекорд высоты сохраняется; монеты считаются; блок песочницы переживает выход и
// перезагрузку; каждое место можно пройти (настоящие прыжки между всеми плитами пути + сценарий
// до конца), за все шесть - «Легенда Блоксити» и праздник.
const { test, expect } = require('@playwright/test');
const { openBlox, enter } = require('./_blox-helpers');

const stats = (page, id) => page.evaluate((i) => JSON.parse(localStorage.getItem('mix.blox.stats') || '{}')[i] || null, id);

test.describe('roblox-mini (Блоксити): места', () => {
  test('обби: после падения - на последней контрольной точке, а не на старте', async ({ page }) => {
    await openBlox(page);
    await enter(page, 'obby');
    const r = await page.evaluate(() => {
      const g = __blox.game, pad = g.state.pads[3];
      g.player.teleport(pad.cx, pad.maxY + 0.01, pad.cz); __blox.step(3);
      const cp = g.state.cp;
      g.player.teleport(pad.cx + 30, pad.maxY, pad.cz + 30);          // шаг в пустоту
      __blox.until((gg) => gg.dead, 900);
      const died = g.dead;
      __blox.step(60 * 3);
      const p = __blox.player();
      return { cp, died, alive: !g.dead, at: [p.x, p.y, p.z], pad: [pad.cx, pad.maxY, pad.cz], hud: document.querySelector('#g-hud').textContent };
    });
    expect(r.cp).toBe(3);
    expect(r.died).toBe(true);
    expect(r.alive).toBe(true);
    expect(r.at).toEqual(r.pad);
    expect(r.hud).toContain('Этап 4/8');
  });

  test('обби: лава на этапе убивает, батут подбрасывает', async ({ page }) => {
    await openBlox(page);
    await enter(page, 'obby');
    const r = await page.evaluate(() => {
      const g = __blox.game, W = g.world;
      const bar = W.parts.find((p) => p.tag === 'killbar');
      g.player.teleport(bar.cx, bar.maxY + 2, bar.cz);
      __blox.until((gg) => gg.dead, 120);
      const killed = g.dead;
      __blox.step(200);
      const tr = W.parts.find((p) => p.tag === 'tramp');
      g.player.teleport(tr.cx, tr.maxY + 1, tr.cz);
      let vy = 0; for (let i = 0; i < 20; i++) { __blox.step(1); vy = Math.max(vy, g.player.vel.y); }
      return { killed, vy };
    });
    expect(r.killed).toBe(true);
    expect(r.vy).toBeGreaterThan(60);
  });

  test('забег: таймер идёт только после линии старта; медали по порогам; кубы за медали', async ({ page }) => {
    await openBlox(page);
    await enter(page, 'race');
    const before = await page.evaluate(() => { __blox.step(120); return __blox.game.state.t; });
    expect(before).toBe(0);
    const runs = [];
    for (const sec of [30, 34, 40, 55, 70]) {
      runs.push(await page.evaluate((s) => {
        const g = __blox.game, P = g.place;
        P.restart(g); __blox.step(2);
        const b0 = __blox.balance();
        P.scriptedRun(g, s);
        return { t: Math.round(g.state.t * 1000) / 1000, medal: g.lastFinish.medal, got: __blox.balance() - b0, shown: !document.querySelector('#g-result').hidden };
      }, sec));
    }
    expect(runs.map((r) => r.t)).toEqual([30, 34, 40, 55, 70]);
    expect(runs.map((r) => r.medal)).toEqual(['gold', 'gold', 'silver', 'bronze', null]);
    expect(runs.map((r) => r.got)).toEqual([30, 30, 20, 10, 5]);
    expect(runs.every((r) => r.shown)).toBe(true);
    const s = await stats(page, 'race');
    expect(s.best).toBe(30);
    expect(s.medal).toBe('gold');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mix.blox.badges')))).toHaveProperty('race_gold');
  });

  test('лава поднимается, убивает, рекорд высоты сохраняется и виден после перезагрузки', async ({ page }) => {
    await openBlox(page);
    await enter(page, 'lava');
    const r = await page.evaluate(() => {
      const g = __blox.game, st = g.state;
      __blox.step(60 * 5 + 5);                                    // отсчёт 5 секунд
      const phase = st.phase;
      const p = st.plats[8];
      g.player.teleport(p.cx, p.maxY + 0.01, p.cz);
      const y0 = st.lavaY;
      __blox.until((gg) => gg.dead, 60 * 120);
      return { phase, rose: st.lavaY > y0, died: g.dead, lavaAtDeath: st.lavaY, h: p.maxY, best: st.roundBest, after: st.phase };
    });
    expect(r.phase).toBe('rise');
    expect(r.rose).toBe(true);
    expect(r.died).toBe(true);
    expect(r.lavaAtDeath).toBeGreaterThanOrEqual(r.h - 0.2);   // убила именно лава, дошедшая до плиты
    expect(r.after).toBe('over');
    const s = await stats(page, 'lava');
    expect(s.best).toBeCloseTo(Math.round(r.h * 10) / 10, 5);
    await page.reload();
    await page.waitForFunction(() => window.__blox && __blox.ready);
    await page.evaluate(() => __blox.B.launcher.openPlace('lava'));
    await expect(page.locator('.my-best')).toContainText(s.best.toFixed(1));
  });

  test('монеты: подобранная монета считается и исчезает; боты тоже собирают', async ({ page }) => {
    await openBlox(page);
    await enter(page, 'coins');
    const r = await page.evaluate(() => {
      const g = __blox.game, st = g.state;
      const c = st.coins.find((x) => x.ground);
      g.player.teleport(c.x, 0, c.z); __blox.step(1);
      const one = { mine: st.mine, taken: c.taken, vis: c.mesh.visible, left: g.place.left(st) };
      __blox.run(60 * 25); __blox.step(1);
      return { one, bots: g.bots.reduce((s, b) => s + b.stat, 0), hud: document.querySelector('#g-hud').textContent, board: document.querySelector('#g-board .board-row.me').textContent };
    });
    expect(r.one).toEqual({ mine: 1, taken: true, vis: false, left: 23 });
    expect(r.bots).toBeGreaterThan(0);
    expect(r.hud).toContain('Монеты 1');
    expect(r.board).toMatch(/1$/);
  });

  test('песочница: блок, поставленный щелчком, переживает выход, повторный вход и перезагрузку', async ({ page }) => {
    await openBlox(page);
    await enter(page, 'sandbox');
    await page.evaluate(() => { const g = __blox.game; g.rig.pitch = 0.7; g.rig.yaw = Math.PI; __blox.step(2); });
    await page.mouse.click(640, 560);                                 // ЛКМ по плите перед героем
    const placed = await page.evaluate(() => Array.from(__blox.game.state.cells.values()).map((b) => [b.i, b.j, b.k, b.c]));
    expect(placed.length).toBe(1);
    await page.evaluate(() => { __blox.leave(); __blox.enter('sandbox'); });
    const again = await page.evaluate(() => {
      const g = __blox.game, b = Array.from(g.state.cells.values())[0];
      // на блок можно встать: он твёрдый
      g.player.teleport(2 * b.i + 1, 2 * b.j + 4, 2 * b.k + 1);
      __blox.step(60);
      return { cells: Array.from(g.state.cells.values()).map((x) => [x.i, x.j, x.k, x.c]), y: g.player.pos.y, drawn: g.state.im.count };
    });
    expect(again.cells).toEqual(placed);
    expect(again.y).toBe(2 * placed[0][1] + 2);
    expect(again.drawn).toBe(1);
    await page.reload();
    await page.waitForFunction(() => window.__blox && __blox.ready);
    await enter(page, 'sandbox');
    expect(await page.evaluate(() => Array.from(__blox.game.state.cells.values()).map((b) => [b.i, b.j, b.k, b.c]))).toEqual(placed);
    // ломать: инструмент 2, щелчок по блоку
    await page.evaluate(() => { const g = __blox.game; g.player.teleport(0, 0, 0); g.rig.pitch = 0.7; g.rig.yaw = Math.PI; __blox.step(2); });
    await page.keyboard.press('Digit2');
    await page.mouse.click(640, 560);
    expect(await page.evaluate(() => __blox.game.state.cells.size)).toBe(0);
  });

  // Прохождение: сначала настоящая физика - прыжок с каждой плиты пути на следующую, потом сценарий до конца
  for (const id of ['obby', 'race', 'lava', 'coins']) {
    test(`${id}: путь от старта до конца проходим прыжками, место проходится`, async ({ page }) => {
      test.setTimeout(120000);
      await openBlox(page);
      await enter(page, id);
      const res = await page.evaluate(() => {
        const out = [];
        for (let i = 0; i < __blox.pathLength() - 1; i++) out.push(__blox.tryJump(i));
        return out;
      });
      expect(res.length).toBeGreaterThan(3);
      expect(res.filter((r) => !r.ok)).toEqual([]);
      await page.evaluate(() => __blox.complete());
      const badges = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('mix.blox.badges') || '{}')));
      const need = { obby: 'obby_first', race: 'race_medal', lava: 'lava_top', coins: 'coins_win' }[id];
      expect(badges).toContain(need);
      await expect(page.locator('#g-result')).toBeVisible();
    });
  }

  test('все шесть мест пройдены - значок «Легенда Блоксити» и праздник в лаунчере', async ({ page }) => {
    test.setTimeout(120000);
    await openBlox(page);
    for (const id of ['obby', 'race', 'lava', 'coins', 'sandbox', 'tube']) {
      await enter(page, id);
      await page.evaluate(() => __blox.complete());
      const b = await page.evaluate(() => JSON.parse(localStorage.getItem('mix.blox.badges') || '{}'));
      if (id !== 'tube') expect(b.legend).toBeUndefined();
      await page.evaluate(() => __blox.leave());
    }
    const r = await page.evaluate(() => ({ badges: JSON.parse(localStorage.getItem('mix.blox.badges')), tube: __blox.B.acct.placeStats('tube') }));
    expect(r.tube.medal).not.toBeNull();                              // горка: доехал с медалью
    for (const k of ['obby_first', 'race_medal', 'lava_top', 'coins_win', 'builder', 'tube_finish', 'legend']) expect(r.badges).toHaveProperty(k);
    await expect(page.locator('#celebrate')).toBeVisible();
    await expect(page.locator('#celebrate')).toContainText('Легенда Блоксити');
    await page.locator('#cel-ok').click();
    await expect(page.locator('#celebrate')).toBeHidden();
    await expect(page.locator('.progress-card')).toContainText('6/6');
  });
});
