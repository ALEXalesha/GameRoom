// Кадры приложения для README: docs/screens/app-*.png.
//
//   npm run screenshots
//
// Снимает само приложение (Playwright запускает Electron со своей временной папкой
// данных), а не экран: на кадр не попадёт ничего, кроме окна «Игротеки». Страница игры
// живёт в отдельном WebContentsView, поэтому кадр с игрой собирается из двух: полоса
// вкладок из оболочки и сама игра под ней.
'use strict';

const path = require('path');
const fs = require('fs');
const H = require('../tests-app/harness');

const OUT = path.join(__dirname, '..', 'docs', 'screens');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Оболочка + активная игра под полосой -> один PNG.
async function composite(app, shell, id) {
  const bar = (await shell.screenshot()).toString('base64');
  const game = await app.evaluate(async (_e, gid) => {
    const img = await globalThis.__igroteka.views.get(gid).webContents.capturePage();
    return img.toPNG().toString('base64');
  }, id);
  const png = await shell.evaluate(async ([a, b, barH]) => {
    const load = (s) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = 'data:image/png;base64,' + s; });
    const [top, view] = await Promise.all([load(a), load(b)]);
    const c = document.createElement('canvas');
    c.width = top.width;
    c.height = top.height;
    const g = c.getContext('2d');
    g.drawImage(top, 0, 0);
    const y = Math.round(barH * (top.width / window.innerWidth));
    g.drawImage(view, 0, y, c.width, c.height - y);
    return c.toDataURL('image/png').split(',')[1];
  }, [bar, game, 40]);
  return Buffer.from(png, 'base64');
}

// Щелчок по кнопке внутри игры - настоящим вводом, как мышью.
async function clickIn(app, id, selector) {
  const at = await H.inGame(app, id, `(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`);
  await app.evaluate((_e, [gid, p]) => {
    const wc = globalThis.__igroteka.views.get(gid).webContents;
    wc.sendInputEvent({ type: 'mouseDown', ...p, button: 'left', clickCount: 1 });
    wc.sendInputEvent({ type: 'mouseUp', ...p, button: 'left', clickCount: 1 });
  }, [id, at]);
}

const key = (app, id, type, keyCode) => app.evaluate((_e, [gid, t, k]) => {
  globalThis.__igroteka.views.get(gid).webContents.sendInputEvent({ type: t, keyCode: k });
}, [id, type, keyCode]);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const ctx = await H.launch();
  const { app, shell } = ctx;
  const save = (name, buf) => { fs.writeFileSync(path.join(OUT, name), buf); console.log('docs/screens/' + name); };
  try {
    await app.evaluate(() => { const w = globalThis.__igroteka.win; w.unmaximize(); w.setContentSize(1280, 800); w.center(); });
    await sleep(800);

    save('app-home.png', await shell.screenshot());

    // Игра во вкладке: «Horizon Drift» после старта, газ пару секунд.
    for (const id of ['dino', 'mario', 'horizon_drift_offline']) {
      await H.press(app, 'shell', 'T', ['control']);
      await shell.click(`.card[data-id="${id}"]`);
      await H.gameLoaded(app, id);
    }
    await sleep(800);
    await clickIn(app, 'horizon_drift_offline', '#startBtn');
    await sleep(600);
    await key(app, 'horizon_drift_offline', 'keyDown', 'Up');
    await sleep(2500);
    save('app-game.png', await composite(app, shell, 'horizon_drift_offline'));
    await key(app, 'horizon_drift_offline', 'keyUp', 'Up');

    // Вопрос F5 поверх снимка игры.
    await H.press(app, 'horizon_drift_offline', 'F5');
    await shell.waitForSelector('#modal:not([hidden])');
    await sleep(400);
    save('app-question.png', await shell.screenshot());
    await shell.click('#modal .cancel');

    // Настройки на домашнем экране.
    await H.press(app, 'horizon_drift_offline', 'T', ['control']);
    await shell.click('#gear');
    await sleep(400);
    save('app-settings.png', await shell.screenshot());

    // Светлая тема.
    await shell.click('#set-theme button[data-theme-value="light"]');
    await shell.click('#settings [data-close]');
    await sleep(400);
    save('app-light.png', await shell.screenshot());
  } finally {
    await H.close(ctx);
    H.rmData(ctx.dataDir);
  }
})().catch((e) => { console.error(e); process.exit(1); });
