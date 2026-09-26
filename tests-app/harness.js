// Оснастка проверок НАСТОЯЩЕГО приложения: запускается Electron, а не страница в браузере.
//
// Playwright умеет выполнять код в main-процессе (app.evaluate): оттуда видно вкладки,
// страницы игр и ошибки их консоли (main.js кладёт это в globalThis.__igroteka), и там же
// подменяется shell.openExternal, чтобы проверка не открывала настоящий браузер.
//
// У каждого запуска СВОЯ папка данных: приложение держит замок одного экземпляра, а
// замок лежит в папке данных. С общей папкой второй запуск молча вышел бы.
'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');
const { _electron: electron } = require('@playwright/test');

const ROOT = path.join(__dirname, '..');

async function launch(opts = {}) {
  const dataDir = opts.dataDir || fs.mkdtempSync(path.join(os.tmpdir(), 'igroteka-test-'));
  if (opts.files) {
    for (const [name, value] of Object.entries(opts.files)) {
      fs.writeFileSync(path.join(dataDir, name), typeof value === 'string' ? value : JSON.stringify(value));
    }
  }
  const app = await electron.launch({
    executablePath: require('electron'),
    args: [ROOT, '--user-data-dir=' + dataDir],
    cwd: ROOT,
  });
  // Внешние ссылки записываются, а не открываются.
  await app.evaluate(({ shell }) => {
    globalThis.__opened = [];
    shell.openExternal = async (url) => { globalThis.__opened.push(url); };
  });
  const shellPage = await app.firstWindow();
  await shellPage.waitForSelector('body[data-ready="1"]');
  return { app, shell: shellPage, dataDir };
}

// Состояние вкладок из main.
const tabs = (app) => app.evaluate(() => globalThis.__igroteka.tabs);

// Выполнить код в странице игры (в её WebContentsView).
async function inGame(app, id, code) {
  return app.evaluate(async (_e, [gid, src]) => {
    const view = globalThis.__igroteka.views.get(gid);
    if (!view) throw new Error('нет вкладки ' + gid);
    return view.webContents.executeJavaScript(src, true);
  }, [id, code]);
}

// Дождаться, пока страница игры загрузится полностью.
async function gameLoaded(app, id, timeout = 20000) {
  const until = Date.now() + timeout;
  for (;;) {
    const ok = await app.evaluate((_e, gid) => {
      const v = globalThis.__igroteka.views.get(gid);
      return !!v && !v.webContents.isLoading() && v.webContents.getURL().startsWith('file:');
    }, id);
    if (ok) {
      const ready = await inGame(app, id, 'document.readyState').catch(() => '');
      if (ready === 'complete') return;
    }
    if (Date.now() > until) throw new Error('игра не загрузилась: ' + id);
    await new Promise((r) => setTimeout(r, 100));
  }
}

const errorsOf = (app, id) => app.evaluate((_e, gid) => globalThis.__igroteka.errors[gid] || [], id);

// Нажать клавишу так, будто её нажали в окне игры (или оболочки): через ввод Chromium,
// поэтому её видит и перехват клавиш приложения (before-input-event).
async function press(app, target, keyCode, modifiers = []) {
  await app.evaluate(async (_e, [t, key, mods]) => {
    const g = globalThis.__igroteka;
    const wc = t === 'shell' ? g.win.webContents : g.views.get(t).webContents;
    wc.sendInputEvent({ type: 'keyDown', keyCode: key, modifiers: mods });
    wc.sendInputEvent({ type: 'keyUp', keyCode: key, modifiers: mods });
  }, [target, keyCode, modifiers]);
}

async function close(ctx) {
  try { await ctx.app.close(); } catch { /* уже закрыто */ }
}

function rmData(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* занято - останется во временной папке */ }
}

module.exports = { ROOT, launch, tabs, inGame, gameLoaded, errorsOf, press, close, rmData };
