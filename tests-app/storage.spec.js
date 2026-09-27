// Хранилища игр и то, что переживает перезапуск: данные игр, открытые вкладки, место окна.
'use strict';

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const H = require('./harness');

const open = async ({ app, shell }, id) => {
  if ((await H.tabs(app)).active !== 'home') await H.press(app, 'shell', 'T', ['control']);
  await expect.poll(() => H.tabs(app).then((t) => t.active)).toBe('home');
  await shell.click(`.card[data-id="${id}"]`);
  await H.gameLoaded(app, id);
};

// IndexedDB: записать и прочитать одну запись.
const idbPut = (v) => `new Promise((ok, bad) => {
  const r = indexedDB.open('probe', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('s');
  r.onerror = () => bad(r.error);
  r.onsuccess = () => { const tx = r.result.transaction('s', 'readwrite'); tx.objectStore('s').put(${JSON.stringify(v)}, 'k'); tx.oncomplete = () => { r.result.close(); ok(true); }; };
})`;
const idbGet = `new Promise((ok) => {
  const r = indexedDB.open('probe', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('s');
  r.onsuccess = () => { const q = r.result.transaction('s').objectStore('s').get('k'); q.onsuccess = () => { r.result.close(); ok(q.result ?? null); }; };
})`;

test('localStorage и IndexedDB одной игры не видны другой', async () => {
  const ctx = await H.launch();
  try {
    await open(ctx, 'dino');
    await H.inGame(ctx.app, 'dino', `localStorage.setItem('shared_key', 'dino'); 1`);
    await H.inGame(ctx.app, 'dino', idbPut('dino'));
    await open(ctx, 'mario');
    expect(await H.inGame(ctx.app, 'mario', `localStorage.getItem('shared_key')`)).toBeNull();
    expect(await H.inGame(ctx.app, 'mario', idbGet)).toBeNull();
    await H.inGame(ctx.app, 'mario', `localStorage.setItem('shared_key', 'mario'); 1`);
    expect(await H.inGame(ctx.app, 'dino', `localStorage.getItem('shared_key')`)).toBe('dino');
    // Сеансы разные и на диске: persist:<игра>.
    const parts = await ctx.app.evaluate(() => [...globalThis.__igroteka.views.values()].map((v) => v.webContents.session.storagePath));
    expect(new Set(parts).size).toBe(2);
    for (const p of parts) expect(p).toBeTruthy();
  } finally {
    await H.close(ctx);
    H.rmData(ctx.dataDir);
  }
});

test('после перезапуска: данные игры на месте, вкладки открыты заново, окно там же', async () => {
  let ctx = await H.launch();
  const dataDir = ctx.dataDir;
  // Окно проверок стоит в своей области за экраном (TEST_AREA в main.js).
  const area = await ctx.app.evaluate(() => globalThis.__igroteka.TEST_AREA);
  const bounds = { x: area.x + 140, y: area.y + 90, width: 1010, height: 690 };
  try {
    await open(ctx, 'dino');
    await H.inGame(ctx.app, 'dino', `localStorage.setItem('dino_hi', '4242'); 1`);
    await H.inGame(ctx.app, 'dino', idbPut('живёт'));
    await open(ctx, 'space_shooter');
    await H.press(ctx.app, 'space_shooter', '2', ['control']); // активной оставить dino
    await expect.poll(() => H.tabs(ctx.app).then((t) => t.active)).toBe('dino');
    await ctx.app.evaluate((_e, b) => globalThis.__igroteka.win.setBounds(b), bounds);
    await new Promise((r) => setTimeout(r, 400));
    await H.close(ctx);

    ctx = await H.launch({ dataDir });
    expect(await H.tabs(ctx.app)).toEqual({ open: ['dino', 'space_shooter'], active: 'dino' });
    await expect(ctx.shell.locator('.tab.game')).toHaveCount(2);
    // Создана только активная вкладка; вторая загрузится, когда на неё переключатся.
    expect(await ctx.app.evaluate(() => [...globalThis.__igroteka.views.keys()])).toEqual(['dino']);
    await H.gameLoaded(ctx.app, 'dino');
    expect(await H.inGame(ctx.app, 'dino', `localStorage.getItem('dino_hi')`)).toBe('4242');
    expect(await H.inGame(ctx.app, 'dino', idbGet)).toBe('живёт');
    const got = await ctx.app.evaluate(() => globalThis.__igroteka.win.getBounds());
    expect(got).toEqual(bounds);
  } finally {
    await H.close(ctx);
    H.rmData(dataDir);
  }
});

test('развёрнутое окно открывается развёрнутым', async () => {
  let ctx = await H.launch();
  const dataDir = ctx.dataDir;
  try {
    // В режиме проверок окно не растягивается на настоящий монитор: «развёрнуто» -
    // отметка, которая так же пишется в файл и читается при запуске.
    await ctx.app.evaluate(() => globalThis.__igroteka.setMaximized(true));
    await expect.poll(() => ctx.app.evaluate(() => globalThis.__igroteka.maximized)).toBe(true);
    await H.close(ctx);
    ctx = await H.launch({ dataDir });
    await expect.poll(() => ctx.app.evaluate(() => globalThis.__igroteka.maximized)).toBe(true);
  } finally {
    await H.close(ctx);
    H.rmData(dataDir);
  }
});

test('окно с отключённого монитора открывается на видимом экране', async () => {
  const ctx = await H.launch({ files: { 'window-state.json': { x: -30000, y: -30000, width: 1000, height: 700, maximized: false } } });
  try {
    const { b, areas } = await ctx.app.evaluate(() => ({
      b: globalThis.__igroteka.win.getBounds(),
      areas: [globalThis.__igroteka.TEST_AREA],
    }));
    expect(b.width).toBe(1000);
    const onScreen = areas.some((a) => b.x >= a.x && b.y >= a.y && b.x < a.x + a.width && b.y + 40 <= a.y + a.height);
    expect(onScreen).toBe(true);
  } finally {
    await H.close(ctx);
    H.rmData(ctx.dataDir);
  }
});

test('без «открывать вкладки прошлого раза» запуск начинается с домашнего экрана', async () => {
  const ctx = await H.launch({ files: { 'settings.json': { reopenTabs: false }, 'tabs.json': { open: ['dino'], active: 'dino' } } });
  try {
    expect(await H.tabs(ctx.app)).toEqual({ open: [], active: 'home' });
    await expect(ctx.shell.locator('#set-reopen')).not.toBeChecked();
  } finally {
    await H.close(ctx);
    H.rmData(ctx.dataDir);
  }
});

test('испорченные файлы настроек и вкладок не мешают запуску', async () => {
  const ctx = await H.launch({ files: { 'settings.json': '{"theme": "li', 'tabs.json': '[[[', 'window-state.json': 'мусор' } });
  try {
    expect(await H.tabs(ctx.app)).toEqual({ open: [], active: 'home' });
    await expect(ctx.shell.locator('.card')).toHaveCount(require('../app/games').IDS.length);
  } finally {
    await H.close(ctx);
    H.rmData(ctx.dataDir);
  }
});

test('очистка данных одной игры - после вопроса, и другие игры не задеты', async () => {
  const ctx = await H.launch();
  try {
    await open(ctx, 'dino');
    await H.inGame(ctx.app, 'dino', `localStorage.setItem('dino_hi', '77'); 1`);
    await H.inGame(ctx.app, 'dino', idbPut('dino'));
    await open(ctx, 'mario');
    await H.inGame(ctx.app, 'mario', `localStorage.setItem('jumper_best', '55'); 1`);
    await H.press(ctx.app, 'mario', 'T', ['control']);

    const { shell } = ctx;
    await shell.click('#gear');
    await shell.selectOption('#clear-game', 'dino');
    await shell.click('#clear-btn');
    await expect(shell.locator('#modal')).toBeVisible();
    await shell.click('#modal .cancel');
    await expect(shell.locator('#modal')).toBeHidden();
    expect((await H.tabs(ctx.app)).open).toContain('dino'); // «нет» - ничего не тронуто

    await shell.click('#clear-btn');
    await shell.click('#modal .ok');
    await expect(shell.locator('#clear-hint')).toContainText('стёрты');
    expect((await H.tabs(ctx.app)).open).toEqual(['mario']); // вкладка стёртой игры закрылась
    await shell.click('#settings [data-close]');
    await open(ctx, 'dino');
    expect(await H.inGame(ctx.app, 'dino', `localStorage.getItem('dino_hi')`)).toBeNull();
    expect(await H.inGame(ctx.app, 'dino', idbGet)).toBeNull();
    expect(await H.inGame(ctx.app, 'mario', `localStorage.getItem('jumper_best')`)).toBe('55');
  } finally {
    await H.close(ctx);
    H.rmData(ctx.dataDir);
  }
});

test('файлы приложения лежат в своей папке данных', async () => {
  const ctx = await H.launch();
  try {
    await ctx.shell.evaluate(() => window.igroteka.setSetting('volume', 50));
    await open(ctx, 'dino');
    await H.close(ctx);
    for (const f of ['settings.json', 'tabs.json', 'window-state.json']) expect(fs.existsSync(path.join(ctx.dataDir, f)), f).toBe(true);
    expect(fs.existsSync(path.join(ctx.dataDir, 'Partitions', 'dino'))).toBe(true);
  } finally {
    H.rmData(ctx.dataDir);
  }
});
