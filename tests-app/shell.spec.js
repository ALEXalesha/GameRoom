// Оболочка: домашний экран, вкладки, клавиши, звук фоновых вкладок, полный экран, F5.
'use strict';

const { test, expect } = require('@playwright/test');
const H = require('./harness');

let ctx;
test.beforeEach(async () => { ctx = await H.launch(); });
test.afterEach(async () => { await H.close(ctx); H.rmData(ctx.dataDir); });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('запуск: домашний экран, восемь карточек с картинкой, именем, описанием и «Играть»', async () => {
  const { app, shell } = ctx;
  await expect(shell.locator('.card')).toHaveCount(8);
  for (const card of await shell.locator('.card').all()) {
    await expect(card.locator('h2')).not.toBeEmpty();
    await expect(card.locator('p')).not.toBeEmpty();
    await expect(card.locator('.play')).toHaveText('Играть');
    // Картинка загрузилась, а не спрятана как битая.
    expect(await card.locator('.shot img').evaluate((i) => i.complete && i.naturalWidth > 0)).toBe(true);
  }
  await expect(shell.locator('.tab.game')).toHaveCount(0);
  await expect(shell.locator('.tab.home')).toHaveClass(/active/);
  expect(await H.tabs(app)).toEqual({ open: [], active: 'home' });
  expect(await shell.title()).toBe(require('../package.json').productName);
});

test('повторный щелчок по карточке не открывает вторую вкладку, а переключает на открытую', async () => {
  const { app, shell } = ctx;
  await shell.click('.card[data-id="dino"]');
  await H.gameLoaded(app, 'dino');
  await H.press(app, 'dino', 'T', ['control']);
  await expect.poll(() => H.tabs(app).then((t) => t.active)).toBe('home');
  await expect(shell.locator('.card[data-id="dino"] .play')).toHaveText('Вернуться');
  await shell.click('.card[data-id="dino"] .play');
  await expect.poll(() => H.tabs(app)).toEqual({ open: ['dino'], active: 'dino' });
  await expect(shell.locator('.tab.game')).toHaveCount(1);
  expect(await app.evaluate(() => globalThis.__igroteka.views.size)).toBe(1);
});

test('вкладка игры: значок, имя и крестик; крестик закрывает вкладку и её страницу', async () => {
  const { app, shell } = ctx;
  await shell.click('.card[data-id="dino"]');
  await H.press(app, 'dino', 'T', ['control']);
  await shell.click('.card[data-id="mario"]');
  await expect.poll(() => H.tabs(app)).toEqual({ open: ['dino', 'mario'], active: 'mario' });
  const tab = shell.locator('.tab.game[data-id="dino"]');
  expect(await tab.locator('img.icon').evaluate((i) => i.naturalWidth > 0)).toBe(true);
  await expect(tab.locator('.name')).not.toBeEmpty();
  await tab.locator('.x').click();
  await expect.poll(() => H.tabs(app)).toEqual({ open: ['mario'], active: 'mario' });
  await expect(shell.locator('.tab.game')).toHaveCount(1);
  expect(await app.evaluate(() => [...globalThis.__igroteka.views.keys()])).toEqual(['mario']);
});

test('клавиши: Ctrl+Tab, Ctrl+Shift+Tab, Ctrl+1..9, Ctrl+W, Ctrl+T - и из игры, и из оболочки', async () => {
  const { app, shell } = ctx;
  for (const id of ['dino', 'mario', 'space_shooter']) {
    await H.press(app, 'shell', 'T', ['control']);
    await shell.click(`.card[data-id="${id}"]`);
    await H.gameLoaded(app, id);
  }
  const active = async () => (await H.tabs(app)).active;
  expect(await active()).toBe('space_shooter');
  await H.press(app, 'space_shooter', 'Tab', ['control']);
  await expect.poll(active).toBe('home');
  await H.press(app, 'shell', 'Tab', ['control']);
  await expect.poll(active).toBe('dino');
  await H.press(app, 'dino', 'Tab', ['control', 'shift']);
  await expect.poll(active).toBe('home');
  await H.press(app, 'shell', '3', ['control']);
  await expect.poll(active).toBe('mario');
  await H.press(app, 'mario', '9', ['control']);
  await expect.poll(active).toBe('space_shooter');
  await H.press(app, 'space_shooter', '1', ['control']);
  await expect.poll(active).toBe('home');
  await H.press(app, 'shell', '2', ['control']);
  await expect.poll(active).toBe('dino');
  await H.press(app, 'dino', 'W', ['control']);
  await expect.poll(() => H.tabs(app)).toEqual({ open: ['mario', 'space_shooter'], active: 'mario' });
  await H.press(app, 'mario', 'T', ['control']);
  await expect.poll(active).toBe('home');
  // Ctrl+W на домашней ничего не закрывает.
  await H.press(app, 'shell', 'W', ['control']);
  await sleep(200);
  expect(await H.tabs(app)).toEqual({ open: ['mario', 'space_shooter'], active: 'home' });
});

test('фоновая вкладка снята с окна, молчит и не получает кадров; активная звучит', async () => {
  const { app, shell } = ctx;
  await shell.click('.card[data-id="dino"]');
  await H.gameLoaded(app, 'dino');
  await H.inGame(app, 'dino', 'window.__raf = 0; (function f() { __raf++; requestAnimationFrame(f); })(); 1');
  await H.press(app, 'dino', 'T', ['control']);
  await shell.click('.card[data-id="mario"]');
  await H.gameLoaded(app, 'mario');
  const muted = () => app.evaluate(() => Object.fromEntries([...globalThis.__igroteka.views].map(([id, v]) => [id, v.webContents.isAudioMuted()])));
  expect(await muted()).toEqual({ dino: true, mario: false });
  const onWindow = await app.evaluate(() => {
    const g = globalThis.__igroteka;
    const kids = g.win.contentView.children;
    return { dino: kids.includes(g.views.get('dino')), mario: kids.includes(g.views.get('mario')) };
  });
  expect(onWindow).toEqual({ dino: false, mario: true });
  const a = await H.inGame(app, 'dino', '__raf');
  await sleep(800);
  expect(await H.inGame(app, 'dino', '__raf')).toBe(a);
  expect(await app.evaluate(() => globalThis.__igroteka.views.get('dino').webContents.getBackgroundThrottling())).toBe(true);

  // Настройки звука: фоновая может звучать, общий «без звука» глушит всех.
  await shell.evaluate(() => window.igroteka.setSetting('muteBackground', false));
  await expect.poll(muted).toEqual({ dino: false, mario: false });
  await shell.evaluate(() => window.igroteka.setSetting('muted', true));
  await expect.poll(muted).toEqual({ dino: true, mario: true });
  await shell.evaluate(() => window.igroteka.setSetting('muted', false));
  await shell.evaluate(() => window.igroteka.setSetting('muteBackground', true));
  await expect.poll(muted).toEqual({ dino: true, mario: false });
  // Вернулись на вкладку - кадры снова идут, звук включён.
  await H.press(app, 'mario', '2', ['control']);
  await expect.poll(muted).toEqual({ dino: false, mario: true });
  await expect.poll(() => H.inGame(app, 'dino', '__raf')).toBeGreaterThan(a);
});

test('громкость приложения доходит до звука игры', async () => {
  const { app, shell } = ctx;
  await shell.click('.card[data-id="dino"]');
  await H.gameLoaded(app, 'dino');
  // Игра подключает звук к динамикам как обычно; на деле он идёт через усилитель.
  const probe = `(() => {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const back = osc.connect(ctx.destination);
    window.__probeCtx = ctx;
    return back === ctx.destination;
  })()`;
  expect(await H.inGame(app, 'dino', probe)).toBe(true);
  const volume = `window[Symbol.for('igroteka.volume')]()`;
  expect(await H.inGame(app, 'dino', volume)).toBe(0.8);
  await shell.evaluate(() => window.igroteka.setSetting('volume', 30));
  await expect.poll(() => H.inGame(app, 'dino', volume)).toBe(0.3);
  // Новая вкладка сразу получает текущую громкость.
  await H.press(app, 'dino', 'T', ['control']);
  await shell.click('.card[data-id="mario"]');
  await H.gameLoaded(app, 'mario');
  expect(await H.inGame(app, 'mario', volume)).toBe(0.3);
});

test('F11 - игра на весь экран без полосы, Esc возвращает; на домашней F11 ничего не делает', async () => {
  const { app, shell } = ctx;
  await H.press(app, 'shell', 'F11');
  await sleep(300);
  expect(await app.evaluate(() => globalThis.__igroteka.fullscreen)).toBe(false);
  await shell.click('.card[data-id="dino"]');
  await H.gameLoaded(app, 'dino');
  await H.press(app, 'dino', 'F11');
  await expect.poll(() => app.evaluate(() => globalThis.__igroteka.fullscreen)).toBe(true);
  await expect.poll(() => app.evaluate(() => globalThis.__igroteka.views.get('dino').getBounds().y)).toBe(0);
  await expect.poll(() => app.evaluate(() => globalThis.__igroteka.win.isFullScreen())).toBe(true);
  await H.press(app, 'dino', 'Escape');
  await expect.poll(() => app.evaluate(() => globalThis.__igroteka.fullscreen)).toBe(false);
  await expect.poll(() => app.evaluate(() => globalThis.__igroteka.views.get('dino').getBounds().y)).toBe(40);
  await expect.poll(() => app.evaluate(() => globalThis.__igroteka.win.isFullScreen())).toBe(false);
});

test('F5 перезапускает игру только после «да»', async () => {
  const { app, shell } = ctx;
  await shell.click('.card[data-id="dino"]');
  await H.gameLoaded(app, 'dino');
  await H.inGame(app, 'dino', 'window.__mark = 1');
  await H.press(app, 'dino', 'F5');
  await expect(shell.locator('#modal')).toBeVisible();
  await expect(shell.locator('#modal-title')).toContainText('заново');
  // Пока вопрос открыт, игра снята с окна (стоит), а под вопросом её снимок.
  expect(await app.evaluate(() => globalThis.__igroteka.win.contentView.children.length)).toBe(0);
  // Под вопросом - снимок игры, а если Chromium кадр не отдал - сплошной фон, но не
  // домашнее меню (оно лежит под игрой и просвечивало бы, будто открыт не тот экран).
  expect(await shell.evaluate(() => !document.getElementById('modal-shot').hidden || document.getElementById('modal').classList.contains('cover'))).toBe(true);
  await shell.click('#modal .cancel');
  await expect(shell.locator('#modal')).toBeHidden();
  expect(await H.inGame(app, 'dino', 'window.__mark')).toBe(1);
  await H.press(app, 'dino', 'F5');
  await shell.click('#modal .ok');
  await expect.poll(() => H.inGame(app, 'dino', 'typeof window.__mark').catch(() => 'loading')).toBe('undefined');
  expect(await H.tabs(app)).toEqual({ open: ['dino'], active: 'dino' });
});

test('тема оболочки переключается и запоминается', async () => {
  const { app, shell } = ctx;
  await shell.click('#gear');
  await expect(shell.locator('#settings')).toBeVisible();
  await shell.click('#set-theme button[data-theme-value="light"]');
  await expect(shell.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect.poll(() => app.evaluate(() => globalThis.__igroteka.settings.theme)).toBe('light');
  const fs = require('fs');
  const path = require('path');
  expect(JSON.parse(fs.readFileSync(path.join(ctx.dataDir, 'settings.json'), 'utf8')).theme).toBe('light');
  await expect(shell.locator('.about')).toContainText('фан-концепты, не связаны с правообладателями');
  await expect(shell.locator('#version')).toContainText(require('../package.json').version);
  await expect(shell.locator('#about-games li')).toHaveCount(8);
});

test('снимка игры нет - под вопросом сплошной фон, а не домашнее меню', async () => {
  const { app, shell } = ctx;
  await shell.click('.card[data-id="dino"]');
  await H.gameLoaded(app, 'dino');
  await app.evaluate(() => {
    globalThis.__igroteka.views.get('dino').webContents.capturePage = async () => { throw new Error('Current display surface not available for capture'); };
  });
  await H.press(app, 'dino', 'F5');
  await expect(shell.locator('#modal')).toBeVisible();
  await expect(shell.locator('#modal')).toHaveClass(/cover/);
  await expect(shell.locator('#modal-shot')).toBeHidden();
  const bg = await shell.locator('#modal').evaluate((e) => getComputedStyle(e).backgroundColor);
  expect(bg).not.toMatch(/rgba\(.*, 0\.\d+\)$/); // непрозрачный
  await shell.click('#modal .cancel');
  // Вопрос с домашнего экрана (очистка данных) такого фона не получает.
  await H.press(app, 'dino', 'T', ['control']);
  await shell.click('#gear');
  await shell.click('#clear-btn');
  await expect(shell.locator('#modal')).not.toHaveClass(/cover/);
  await shell.click('#modal .cancel');
});
