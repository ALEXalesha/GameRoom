// Законы «Horizon Drift»: three.js отдельным файлом (без сети), меню влезает в окно, клавиши
// в меню ничего не ломают, машина едет и поворачивает, чекпоинты по порядку и финиш с бонусом
// и рекордом, пауза останавливает время, дрифт не считается дважды, рендерер один на все заезды.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { WEB } = require('../helpers');
const { openGame, fitReport, expectFits, SIZES } = require('./_games-helpers');

test.describe('horizon_drift_offline', () => {
  test('three.js - отдельный файл vendor/, страница без сети и без ошибок', async ({ page }) => {
    const html = fs.readFileSync(path.join(WEB, 'horizon_drift_offline', 'index.html'), 'utf8');
    expect(html.length).toBeLessThan(150 * 1024);            // раньше 670 КБ из-за вшитой библиотеки
    expect(html).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
    const errors = await openGame(page, 'horizon_drift_offline', 'seed=1');
    expect(await page.evaluate(() => THREE.REVISION)).toBe('149');
    await expect(page).toHaveTitle(/не связана с правообладателем/);
    expect(errors).toEqual([]);
  });

  test('R, C, Esc в меню ничего не ломают (раньше R падал на пустой машине)', async ({ page }) => {
    const errors = await openGame(page, 'horizon_drift_offline', 'seed=1');
    for (const k of ['KeyR', 'KeyC', 'Escape', 'KeyP', 'KeyW']) await page.keyboard.press(k);
    await page.waitForTimeout(200);
    expect(errors).toEqual([]);
    await expect(page.locator('#menu')).toBeVisible();
  });

  test('газ разгоняет, руль поворачивает, тормоз замедляет', async ({ page }) => {
    await openGame(page, 'horizon_drift_offline', 'seed=1');
    const r = await page.evaluate(() => {
      const g = __game; g.start({ map: 'highway', mode: 'freeroam', car: 'apex' });
      const z0 = g.car.position.z;
      g.keys.w = true; g.step(1 / 60, 120);
      const v1 = g.velocity.length(), z1 = g.car.position.z;
      g.keys.a = true; g.step(1 / 60, 20); g.keys.a = false;
      const rot = g.carRotY;
      g.keys.w = false; g.keys.s = true; g.step(1 / 60, 30); g.keys.s = false;
      return { moved: z1 - z0, v1, rot, v2: g.velocity.length() };
    });
    expect(r.moved).toBeGreaterThan(20);
    expect(r.v1).toBeGreaterThan(20);
    expect(r.rot).toBeGreaterThan(0.1);
    expect(r.v2).toBeLessThan(r.v1);
  });

  test('чекпоинты берутся по порядку; финиш - бонус в итоге, рекорд трассы переживает перезагрузку', async ({ page }) => {
    await openGame(page, 'horizon_drift_offline', 'seed=1');
    await page.evaluate(() => localStorage.clear());
    const r = await page.evaluate(() => {
      const g = __game; g.start({ map: 'horizon', mode: 'checkpoint' });
      const cps = g.checkpoints.map((c) => c.position.clone());
      // сначала второй чекпоинт - не засчитывается
      g.car.position.set(cps[1].x, g.getTerrainHeight(cps[1].x, cps[1].z) + 0.5, cps[1].z); g.velocity.set(0, 0, 0);
      g.step(1 / 60, 2);
      const skipped = g.state.checkpointIdx;
      for (const c of cps) { g.car.position.set(c.x, g.getTerrainHeight(c.x, c.z) + 0.5, c.z); g.velocity.set(0, 0, 0); g.step(1 / 60, 2); }
      return { skipped, idx: g.state.checkpointIdx, total: cps.length, finished: g.state.finished, score: g.state.score, time: g.state.time };
    });
    expect(r.skipped).toBe(0);
    expect(r.idx).toBe(r.total);
    expect(r.finished).toBe(true);
    expect(r.score).toBeGreaterThan(r.total * 1000);        // 1000 за чекпоинт + бонус за время
    await expect(page.locator('#finishMenu')).toBeVisible();
    await expect(page.locator('#finishText')).toContainText(r.score.toLocaleString('ru-RU'));
    await expect(page.locator('#finishText')).toContainText('новый рекорд');
    const t = await page.evaluate(() => __game.state.time);
    await page.evaluate(() => __game.step(1 / 60, 60));
    expect(await page.evaluate(() => __game.state.time)).toBe(t);   // после финиша время стоит
    await page.reload();
    await page.waitForFunction(() => window.__game && __game.ready);
    const best = await page.evaluate(() => Number(localStorage.getItem('horizon_best_horizon')));
    expect(best).toBe(Math.round(r.time * 1000));
  });

  test('пауза останавливает время заезда, Esc снимает паузу', async ({ page }) => {
    await openGame(page, 'horizon_drift_offline', 'seed=1');
    const r = await page.evaluate(() => {
      const g = __game; g.start({ map: 'highway', mode: 'freeroam' });
      g.step(1 / 60, 30);
      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true }));
      const t = g.state.time, paused = g.state.paused;
      g.keys.w = true; g.step(1 / 60, 60); g.keys.w = false;
      return { paused, same: g.state.time === t };
    });
    expect(r).toEqual({ paused: true, same: true });
    await expect(page.locator('#pauseMenu')).toBeVisible();
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => __game.state.paused)).toBe(false);
  });

  test('очки на экране: накопленный дрифт не прибавляется второй раз', async ({ page }) => {
    await openGame(page, 'horizon_drift_offline', 'seed=1');
    const text = await page.evaluate(() => {
      const g = __game; g.start({ map: 'highway', mode: 'freeroam' });
      g.state.score = 1200; g.state.totalDrift = 900; g.state.driftCombo = 0;
      g.step(1 / 60, 1);
      return document.getElementById('scoreVal').textContent;
    });
    expect(text.replace(/\s/g, '')).toBe('1200');
  });

  test('один рендерер на все заезды: после трёх заходов из меню - один холст', async ({ page }) => {
    await openGame(page, 'horizon_drift_offline', 'seed=1');
    const r = await page.evaluate(() => {
      const g = __game; const seen = new Set();
      for (let i = 0; i < 3; i++) { g.start({ map: ['horizon', 'highway', 'canyon'][i], mode: 'freeroam' }); g.step(1 / 60, 5); seen.add(g.renderer); g.toMenu(); }
      return { renderers: seen.size, canvases: document.querySelectorAll('canvas').length };
    });
    expect(r.renderers).toBe(1);
    expect(r.canvases).toBe(2);                              // игровой холст + мини-карта
  });

  for (const size of SIZES) {
    test(`меню и заезд влезают в окно ${size.width}x${size.height}`, async ({ page }) => {
      await page.setViewportSize(size);
      await openGame(page, 'horizon_drift_offline', 'seed=1');
      expectFits(expect, await fitReport(page, '#startBtn'));
      expectFits(expect, await fitReport(page, '#carPanel'));
      await page.evaluate(() => { __game.start({ map: 'horizon', mode: 'freeroam' }); __game.step(1 / 60, 2); });
      expectFits(expect, await fitReport(page, '#speedo'));
    });
  }
});
