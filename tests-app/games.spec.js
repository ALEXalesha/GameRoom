// Каждая из восьми игр открывается во вкладке приложения и работает без ошибок в консоли.
// Ошибки собирает сам main (console-message каждой страницы), так что видно и то, что
// случилось до подключения Playwright.
'use strict';

const { test, expect } = require('@playwright/test');
const { IDS } = require('../app/games');
const H = require('./harness');

let ctx;
test.beforeAll(async () => { ctx = await H.launch(); });
test.afterAll(async () => { await H.close(ctx); H.rmData(ctx.dataDir); });

for (const id of IDS) {
  test(`${id}: открывается во вкладке, ошибок нет, запросов наружу нет`, async () => {
    const { app, shell } = ctx;
    await H.press(app, 'shell', 'T', ['control']);
    await expect.poll(() => H.tabs(app).then((t) => t.active)).toBe('home');
    await shell.click(`.card[data-id="${id}"] .play`);
    await expect.poll(() => H.tabs(app).then((t) => t.active)).toBe(id);
    await H.gameLoaded(app, id, 30000);
    // Игре дать пожить: ошибки часто сыплются с первых кадров, а не при загрузке.
    await new Promise((r) => setTimeout(r, 1500));
    expect(await H.errorsOf(app, id)).toEqual([]);
    expect(await app.evaluate(() => globalThis.__igroteka.blocked)).toEqual([]);
    // Захват мыши в режиме проверок: настоящий requestPointerLock недостижим (подмена из
    // game-preload.js записывает вызовы), курсор человека за компьютером остаётся свободным.
    await app.evaluate((_e, gid) => {
      const wc = globalThis.__igroteka.views.get(gid).webContents;
      for (const type of ['mouseDown', 'mouseUp']) wc.sendInputEvent({ type, x: 400, y: 300, button: 'left', clickCount: 1 });
    }, id);
    await H.inGame(app, id, `(() => { const c = document.querySelector('canvas'); try { c && c.requestPointerLock && c.requestPointerLock(); } catch (e) {} return 1; })()`);
    await new Promise((r) => setTimeout(r, 400));
    const lock = await H.inGame(app, id, `({ native: Element.prototype.requestPointerLock.toString().includes('[native code]'), calls: window.__lockCalls })`);
    expect(lock.native).toBe(false);
    expect(lock.calls).toBeGreaterThanOrEqual(1);
    const title = await H.inGame(app, id, 'document.title');
    expect(title.length).toBeGreaterThan(0);
    await expect(shell.locator(`.tab.game[data-id="${id}"]`)).toHaveClass(/active/);
    // Закрыть, чтобы восемь 3D-страниц не копились в одном процессе.
    await H.press(app, id, 'W', ['control']);
    await expect.poll(() => H.tabs(app).then((t) => t.open.includes(id))).toBe(false);
  });
}
