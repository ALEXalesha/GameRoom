// Что делает каждая игра, когда её вкладка уходит в фон.
//
//   npm run probe:background
//
// Запускается как main-процесс Electron (без Playwright: Playwright подменяет странице
// фокус и видимость, и под ним фоновая вкладка выглядит активной). Для каждой игры:
// открыть вкладку, начать игру как игрок (Enter, пробел, щелчок), подождать, уйти на
// домашнюю, подождать в фоне, вернуться. Печатается:
//   hidden  - что страница увидела при уходе (visibilitychange / blur);
//   frozen  - не изменилось ли состояние игры, пока вкладка была в фоне;
//   paused  - стоит ли игра после возвращения (ждёт игрока) или пошла сама;
//   audible - звучала ли страница в фоне (оболочка её при этом глушит).
// Страницы игр при этом не меняются.
'use strict';

const { app, ipcMain } = require('electron');
const os = require('os');
const fs = require('fs');
const path = require('path');

if (!process.argv.some((a) => a.startsWith('--user-data-dir='))) {
  app.commandLine.appendSwitch('user-data-dir', fs.mkdtempSync(path.join(os.tmpdir(), 'igroteka-probe-')));
}
require('../app/main.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const WATCH = `(() => {
  window.__probe = { events: [] };
  addEventListener('blur', () => __probe.events.push('blur'));
  document.addEventListener('visibilitychange', () => __probe.events.push(document.visibilityState));
  return 1;
})()`;

// Отпечаток состояния: всё, что меняется, пока игра идёт.
const PRINT = `(() => {
  const g = window.__game || {};
  const p = g.player && (g.player.position || g.player.pos || g.player);
  const pick = (o) => o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v !== 'object' && typeof v !== 'function')) : o;
  const phase = g.phase ?? (g.state && typeof g.state === 'object' ? (g.state.phase ?? (g.state.running ? (g.state.paused ? 'paused' : 'running') : 'menu')) : g.state);
  return JSON.stringify({ phase, s: pick(g.state), p: pick(p), score: g.score, cam: g.camX ?? g.cameraX });
})()`;

const START_AT = `(() => {
  for (const b of document.querySelectorAll('button')) {
    const r = b.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && /играть|поехали|начать|старт/i.test(b.textContent)) {
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    }
  }
  return null;
})()`;

async function probe(id) {
  const g = globalThis.__igroteka;
  ipcMain.emit('tabs:open', { sender: globalThis.__igroteka.win.webContents }, id);
  const wc = () => g.views.get(id).webContents;
  await new Promise((r) => (wc().isLoading() ? wc().once('did-finish-load', r) : r()));
  await sleep(1500);
  await wc().executeJavaScript(WATCH);
  // Начать игру как игрок: щелчок в центр (нужен и для захвата мыши), Enter, пробел.
  // Кнопка старта, если она есть на экране, иначе центр.
  const [w, h] = g.win.getContentSize();
  const at = (await wc().executeJavaScript(START_AT)) || { x: Math.round(w / 2), y: Math.round((h - g.BAR_H) / 2) };
  wc().sendInputEvent({ type: 'mouseDown', ...at, button: 'left', clickCount: 1 });
  wc().sendInputEvent({ type: 'mouseUp', ...at, button: 'left', clickCount: 1 });
  await sleep(300);
  for (const key of ['Enter', 'Space']) {
    wc().sendInputEvent({ type: 'keyDown', keyCode: key });
    wc().sendInputEvent({ type: 'keyUp', keyCode: key });
    await sleep(300);
  }
  // Идти вправо, чтобы в платформерах что-то менялось.
  wc().sendInputEvent({ type: 'keyDown', keyCode: 'Right' });
  await sleep(1200);
  const playing = await wc().executeJavaScript(PRINT);
  let audibleActive = false;
  for (let i = 0; i < 6; i++) { await sleep(250); audibleActive = audibleActive || wc().isCurrentlyAudible(); }

  ipcMain.emit('tabs:activate', { sender: globalThis.__igroteka.win.webContents }, 'home');
  await sleep(300);
  const hiddenA = await wc().executeJavaScript(PRINT);
  let audible = false;
  for (let i = 0; i < 10; i++) { await sleep(250); audible = audible || wc().isCurrentlyAudible(); }
  const hiddenB = await wc().executeJavaScript(PRINT);
  const events = await wc().executeJavaScript('__probe.events.join(",")');

  ipcMain.emit('tabs:activate', { sender: globalThis.__igroteka.win.webContents }, id);
  await sleep(300);
  const backA = await wc().executeJavaScript(PRINT);
  await sleep(1200);
  const backB = await wc().executeJavaScript(PRINT);
  wc().sendInputEvent({ type: 'keyUp', keyCode: 'Right' });
  ipcMain.emit('tabs:close', { sender: globalThis.__igroteka.win.webContents }, id);
  await sleep(300);
  return {
    id,
    hidden: events || '-',
    frozen: hiddenA === hiddenB,
    paused: backA === backB,
    audibleActive,
    audible,
    playing: JSON.parse(playing).phase,
    after: JSON.parse(backB).phase,
  };
}

app.whenReady().then(async () => {
  await sleep(1500);
  const rows = [];
  for (const g of globalThis.__igroteka.games) {
    try {
      rows.push(await probe(g.id));
    } catch (e) {
      rows.push({ id: g.id, error: String(e.message || e) });
    }
  }
  console.table(rows);
  app.quit();
});
