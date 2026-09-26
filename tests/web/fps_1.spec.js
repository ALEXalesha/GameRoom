// Законы «Операции: Периметр» (web/fps_1): страница без сети и ошибок, путь меню → режим →
// карта → загрузка → бой, окно 1280x800 и 1024x700, пауза при скрытой вкладке, разминка-тир.
const { test, expect } = require('@playwright/test');
const { openTactical, startMatch } = require('./_tactical-helpers');
const { fitReport, expectFits, SIZES } = require('./_games-helpers');

test.describe('fps_1: страница и меню', () => {
  test('three.js из vendor/, без сети и ошибок, заголовок и пометка о фан-концепте', async ({ page }) => {
    const requests = [];
    page.on('request', (r) => requests.push(r.url()));
    const errors = await openTactical(page);
    expect(requests.some((u) => u.endsWith('/vendor/three.min.js'))).toBe(true);
    expect(requests.filter((u) => /^https?:/.test(u))).toEqual([]);
    expect(await page.evaluate(() => THREE.REVISION)).toBe('149');
    await expect(page).toHaveTitle('Операция: Периметр');
    await expect(page.locator('.note')).toContainText('не связан с Valve');
    await page.waitForTimeout(800);
    expect(errors).toEqual([]);
  });

  test('меню → Играть → режим → карта → боты → загрузка с картой и советом → бой', async ({ page }) => {
    test.setTimeout(90000);
    const errors = await openTactical(page);
    await page.click('#navPlay');
    await page.click('#modeCards [data-mode=comp]');
    await page.click('#mapCards [data-map=port]');
    await page.click('#diffSeg [data-val=hard]');
    await page.click('#sideSeg [data-val=CT]');
    await page.click('#btnStart');
    await expect(page.locator('#loading')).toBeVisible();
    await expect(page.locator('#loadMap')).toHaveText('Порт');
    await expect(page.locator('#loadTip')).not.toBeEmpty();
    await expect(page.locator('#clickin')).toBeVisible({ timeout: 10000 });
    const m = await page.evaluate(() => { const x = __tactical.match; return { mode: x.mode, map: x.mapId, diff: x.diff, n: x.agents.length, side: x.player.team, phase: x.phase, bots: x.agents.filter((a) => a.isBot).length }; });
    expect(m).toEqual({ mode: 'comp', map: 'port', diff: 'hard', n: 10, side: 'CT', phase: 'freeze', bots: 9 });
    await expect(page.locator('#hud')).toBeVisible();
    await expect(page.locator('#menu')).toBeHidden();
    expect(errors).toEqual([]);
  });

  for (const size of SIZES) {
    test(`меню и бой влезают в ${size.width}x${size.height}`, async ({ page }) => {
      test.setTimeout(90000);
      await page.setViewportSize(size);
      await openTactical(page);
      for (const tab of ['home', 'play', 'campaign', 'inventory', 'stats', 'settings']) {
        await page.evaluate((t) => TAC.menu.openTab(t), tab);
        expectFits(expect, await fitReport(page, '#menu'));
        const panel = await page.evaluate((t) => { const r = document.getElementById('tab-' + t).getBoundingClientRect(); return { b: r.bottom, r: r.right }; }, tab);
        expect(panel.b).toBeLessThanOrEqual(size.height + 0.5);
        expect(panel.r).toBeLessThanOrEqual(size.width + 0.5);
      }
      // кнопка «Начать» видна на третьем шаге
      await page.evaluate(() => { TAC.menu.openTab('play'); TAC.menu.sel.mode = 'comp'; TAC.menu.sel.map = 'quarry'; TAC.menu.playStep(3); });
      const start = await page.locator('#btnStart').boundingBox();
      expect(start.y + start.height).toBeLessThanOrEqual(size.height);
      await startMatch(page, { mode: 'comp', map: 'quarry', ai: false });
      await page.evaluate(() => __tactical.render());
      const rep = await fitReport(page, 'canvas#view');
      expectFits(expect, rep);
      for (const sel of ['#radar', '.bottomleft', '.bottomright', '#topscore']) {
        const b = await page.locator(sel).boundingBox();
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.y + b.height).toBeLessThanOrEqual(size.height + 0.5);
        expect(b.x + b.width).toBeLessThanOrEqual(size.width + 0.5);
      }
      await page.keyboard.press('KeyB');
      await page.evaluate(() => { TAC.hud.showBuy(true); TAC.hud.refreshBuy(__tactical.match); });
      const bm = await page.locator('#buymenu').boundingBox();
      expect(bm.y).toBeGreaterThanOrEqual(0);
      expect(bm.y + bm.height).toBeLessThanOrEqual(size.height);
    });
  }

  test('скрытая вкладка ставит паузу, выключает звук и отпускает мышь; после возврата пауза остаётся', async ({ page }) => {
    test.setTimeout(90000);
    await openTactical(page);
    await startMatch(page, { mode: 'dm', map: 'quarry', ai: false });
    await page.evaluate(() => { __tactical.app.manual = false; __tactical.app.paused = false; TAC.audio.init(); });
    const t0 = await page.evaluate(() => __tactical.match.time);
    await page.waitForTimeout(300);
    const t1 = await page.evaluate(() => __tactical.match.time);
    expect(t1).toBeGreaterThan(t0);                              // игра шла
    const setVis = (v) => page.evaluate((vv) => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => vv });
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => vv === 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    }, v);
    await setVis('hidden');
    await expect(page.locator('#pause')).toBeVisible();
    const s = await page.evaluate(() => ({ paused: __tactical.app.paused, lock: document.pointerLockElement, audio: TAC.audio.suspendedByPause, time: __tactical.match.time }));
    expect(s.paused).toBe(true);
    expect(s.lock).toBe(null);
    expect(s.audio).toBe(true);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => __tactical.match.time)).toBe(s.time);   // время стоит
    await setVis('visible');
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => __tactical.app.paused)).toBe(true);
    await expect(page.locator('#pause')).toBeVisible();
  });
});

test.describe('fps_1: вкладка и окно', () => {
  const setVis = (page, v) => page.evaluate((vv) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => vv });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => vv === 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  }, v);

  test('в меню звук возвращается, когда вкладку снова показали', async ({ page }) => {
    await openTactical(page);
    await page.mouse.click(640, 650);
    await page.evaluate(() => { TAC.audio.init(); TAC.audio.startMusic(); });
    await setVis(page, 'hidden');
    expect(await page.evaluate(() => TAC.audio.suspendedByPause)).toBe(true);
    await setVis(page, 'visible');
    await page.waitForTimeout(200);
    const s = await page.evaluate(() => ({ susp: TAC.audio.suspendedByPause, state: TAC.audio.ctx.state, music: !!TAC.audio.music }));
    expect(s).toEqual({ susp: false, state: 'running', music: true });
  });

  for (const ev of ['blur', 'pagehide']) {
    test(`окно потеряло фокус (${ev}) - в бою пауза`, async ({ page }) => {
      await openTactical(page);
      await startMatch(page, { mode: 'comp', map: 'quarry', ai: false });
      await page.evaluate(() => { __tactical.app.manual = false; __tactical.app.paused = false; });
      await page.evaluate((e) => window.dispatchEvent(new Event(e)), ev);
      await expect(page.locator('#pause')).toBeVisible();
      expect(await page.evaluate(() => __tactical.app.paused)).toBe(true);
    });
  }
});

test.describe('fps_1: разминка (тир)', () => {
  test('попадание сбивает мишень, через 0.8 с она снова стоит рядом с домом', async ({ page }) => {
    await openTactical(page);
    await startMatch(page, { mode: 'train', map: 'range' });
    const r = await page.evaluate(() => {
      const m = __tactical.match, p = m.player;
      const t = m.targets[6];
      __tactical.aimAt(t.pos.x, t.pos.y, t.pos.z);
      const hits0 = m.trainHits;
      __tactical.fire(1);
      const hidden = !t.alive;
      __tactical.step(Math.ceil(0.85 * 64));
      const d = Math.hypot(t.origin.x - t.home.x, t.origin.z - t.home.z);
      return { hit: m.trainHits - hits0, hidden, back: t.alive, d, shots: m.trainShots, x: p.pos.x };
    });
    expect(r.hit).toBe(1);
    expect(r.hidden).toBe(true);
    expect(r.back).toBe(true);
    expect(r.d).toBeLessThan(4);
    expect(r.shots).toBe(1);
  });

  test('60 секунд - итог и рекорд, рекорд переживает перезагрузку', async ({ page }) => {
    await openTactical(page);
    await startMatch(page, { mode: 'train', map: 'range' });
    const r = await page.evaluate(() => {
      const m = __tactical.match;
      const open = m.targets.filter((t) => m.world.clear(m.player.eye(), t.pos)).slice(0, 3);
      for (const t of open) { __tactical.aimAt(t.pos.x, t.pos.y, t.pos.z); __tactical.fire(1); __tactical.step(20); }
      __tactical.step(64 * 59 - 100);
      const before = m.phase;
      __tactical.step(64 * 2);
      return { before, after: m.phase, hits: m.trainHits, best: TAC.store.get('rangeBest', 0) };
    });
    expect(r.before).toBe('live');
    expect(r.after).toBe('results');
    expect(r.hits).toBe(3);
    expect(r.best).toBe(3);
    await page.reload();
    await page.waitForFunction(() => window.__tactical && __tactical.ready);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mix.tactical.rangeBest')))).toBe(3);
  });
});
