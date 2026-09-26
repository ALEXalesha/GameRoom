// Безопасность: страницы игр без Node и без мостов, сеть закрыта, ссылки наружу - только
// после вопроса и только в системный браузер.
'use strict';

const { test, expect } = require('@playwright/test');
const http = require('http');
const H = require('./harness');

let ctx;
test.beforeEach(async () => {
  ctx = await H.launch();
  await ctx.shell.click('.card[data-id="dino"]');
  await H.gameLoaded(ctx.app, 'dino');
});
test.afterEach(async () => { await H.close(ctx); H.rmData(ctx.dataDir); });

const opened = () => ctx.app.evaluate(() => globalThis.__opened);

test('у страницы игры нет Node, нет мостов оболочки, настройки страниц строгие', async () => {
  const seen = await H.inGame(ctx.app, 'dino', `({
    require: typeof require, process: typeof process, module: typeof module,
    shellApi: typeof window.igroteka, electron: Object.keys(window).filter((k) => /electron|ipc|igroteka/i.test(k)),
  })`);
  expect(seen).toEqual({ require: 'undefined', process: 'undefined', module: 'undefined', shellApi: 'undefined', electron: [] });
  const prefs = await ctx.app.evaluate(() => {
    const wc = globalThis.__igroteka.views.get('dino').webContents;
    const p = wc.getLastWebPreferences();
    return { contextIsolation: p.contextIsolation, sandbox: p.sandbox, nodeIntegration: p.nodeIntegration, webSecurity: p.webSecurity };
  });
  expect(prefs).toEqual({ contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true });
  const shellPrefs = await ctx.app.evaluate(() => {
    const p = globalThis.__igroteka.win.webContents.getLastWebPreferences();
    return { contextIsolation: p.contextIsolation, sandbox: p.sandbox, nodeIntegration: p.nodeIntegration };
  });
  expect(shellPrefs).toEqual({ contextIsolation: true, sandbox: true, nodeIntegration: false });
});

test('сеть закрыта: запрос из игры не доходит даже до локального сервера', async () => {
  let hits = 0;
  const server = http.createServer((_q, r) => { hits++; r.end('ok'); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/probe`;
  try {
    const res = await H.inGame(ctx.app, 'dino', `fetch(${JSON.stringify(url)}).then(() => 'дошёл', () => 'отказ')`);
    expect(res).toBe('отказ');
    const img = await H.inGame(ctx.app, 'dino', `new Promise((ok) => { const i = new Image(); i.onload = () => ok('загрузилась'); i.onerror = () => ok('отказ'); i.src = ${JSON.stringify(url + '.png')}; })`);
    expect(img).toBe('отказ');
    expect(hits).toBe(0);
    const blocked = await ctx.app.evaluate(() => globalThis.__igroteka.blocked);
    expect(blocked).toContain(url);
  } finally {
    server.close();
  }
});

test('файлы чужой папки странице игры не отдаются', async () => {
  const other = require('url').pathToFileURL(require('path').join(H.ROOT, 'app', 'assets', 'icon.png')).href;
  const res = await H.inGame(ctx.app, 'dino', `new Promise((ok) => { const i = new Image(); i.onload = () => ok('загрузилась'); i.onerror = () => ok('отказ'); i.src = ${JSON.stringify(other)}; })`);
  expect(res).toBe('отказ');
  // А своя картинка грузится (data: и своя папка разрешены).
  const own = await H.inGame(ctx.app, 'dino', `new Promise((ok) => { const i = new Image(); i.onload = () => ok('да'); i.onerror = () => ok('нет'); i.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; })`);
  expect(own).toBe('да');
});

test('window.open на http(s): без «да» браузер не открывается, после «да» - открывается', async () => {
  const { shell } = ctx;
  await H.inGame(ctx.app, 'dino', `window.open('https://example.com/a', '_blank'); 1`);
  await expect(shell.locator('#modal')).toBeVisible();
  await expect(shell.locator('#modal-text')).toHaveText('https://example.com/a');
  expect(await opened()).toEqual([]);
  // Новое окно не появилось: только оболочка и игра.
  expect(await ctx.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
  await shell.click('#modal .cancel');
  await expect(shell.locator('#modal')).toBeHidden();
  expect(await opened()).toEqual([]);
  // Игра вернулась на окно.
  await expect.poll(() => ctx.app.evaluate(() => globalThis.__igroteka.win.contentView.children.length)).toBe(1);

  await H.inGame(ctx.app, 'dino', `window.open('https://example.com/b'); 1`);
  await shell.click('#modal .ok');
  await expect.poll(opened).toEqual(['https://example.com/b']);
});

test('переход по ссылке наружу не уводит игру со страницы и спрашивает', async () => {
  const { shell } = ctx;
  const before = await ctx.app.evaluate(() => globalThis.__igroteka.views.get('dino').webContents.getURL());
  await H.inGame(ctx.app, 'dino', `const a = document.createElement('a'); a.href = 'http://example.com/x'; document.body.append(a); a.click(); 1`);
  await expect(shell.locator('#modal')).toBeVisible();
  await shell.press('#modal .cancel', 'Escape');
  await expect(shell.locator('#modal')).toBeHidden();
  expect(await opened()).toEqual([]);
  expect(await ctx.app.evaluate(() => globalThis.__igroteka.views.get('dino').webContents.getURL())).toBe(before);
});

test('переход в чужую папку и на data:/javascript: молча не пускается', async () => {
  const before = await ctx.app.evaluate(() => globalThis.__igroteka.views.get('dino').webContents.getURL());
  const mario = before.replace('/dino/', '/mario/');
  await H.inGame(ctx.app, 'dino', `location.href = ${JSON.stringify(mario)}; 1`);
  await new Promise((r) => setTimeout(r, 600));
  expect(await ctx.app.evaluate(() => globalThis.__igroteka.views.get('dino').webContents.getURL())).toBe(before);
  await expect(ctx.shell.locator('#modal')).toBeHidden();
  await H.inGame(ctx.app, 'dino', `location.href = 'data:text/html,<b>x</b>'; 1`);
  await new Promise((r) => setTimeout(r, 600));
  expect(await ctx.app.evaluate(() => globalThis.__igroteka.views.get('dino').webContents.getURL())).toBe(before);
  expect(await opened()).toEqual([]);
});

test('страница, которая сыплет window.open, получает один вопрос, а не стопку', async () => {
  await H.inGame(ctx.app, 'dino', `for (let i = 0; i < 5; i++) window.open('https://example.com/' + i); 1`);
  await expect(ctx.shell.locator('#modal')).toBeVisible();
  await expect(ctx.shell.locator('#modal-text')).toHaveText('https://example.com/0');
  await ctx.shell.click('#modal .cancel');
  await expect(ctx.shell.locator('#modal')).toBeHidden();
  await new Promise((r) => setTimeout(r, 400));
  await expect(ctx.shell.locator('#modal')).toBeHidden();
  expect(await opened()).toEqual([]);
});
