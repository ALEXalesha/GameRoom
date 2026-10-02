// Картинки карточек домашнего экрана: app/assets/thumbs/<игра>.jpg, 640x360.
//
//   npm run thumbs            # все игры и демо систем
//   npm run thumbs -- dino    # одна
//
// Демо систем (SYSTEMS в web/_shared/games-data.js) нужны только браузерной странице
// (index.html в корне): их снимок - сама система сразу после загрузки, без нажатий.
//
// Каждая игра открывается в Chromium по файловому адресу (как в web-проверках), сеть
// закрыта. Игра начинается как у игрока: кнопка старта или Enter/пробел, потом пара
// секунд игры с зажатой «вправо», и снимок. После переделки игры картинку нужно снять
// заново этой же командой.
'use strict';

const path = require('path');
const fs = require('fs');
const { chromium } = require('@playwright/test');
const { GAMES, SYSTEMS } = require('../web/_shared/games-data.js');
const { pageUrl } = require('../tests/helpers');

const OUT = path.join(__dirname, '..', 'app', 'assets', 'thumbs');

// Что нажать, чтобы на картинке была игра, а не меню. По умолчанию - кнопка со словом
// «Играть/Поехали/Начать», потом Enter и пробел.
const PLAY = {
  dino: { hold: [], wait: 900 },
  fps_1: { hold: ['KeyW'], wait: 1500, click: true },
  mario: { hold: ['ArrowRight'], wait: 1800 },
  jungle_strike: { hold: ['ArrowRight'], wait: 1500 },
  horizon_drift_offline: { hold: ['ArrowUp'], wait: 3000 },
  space_shooter: { hold: [], wait: 5000, mouse: true },
};

async function start(page) {
  const btn = page.locator('button:visible', { hasText: /играть|поехали|начать|старт/i }).first();
  if (await btn.count()) await btn.click({ timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(300);
  for (const key of ['Enter', 'Space']) {
    await page.keyboard.press(key);
    await page.waitForTimeout(250);
  }
}

// Настоящий захват мыши в Chromium без окна всё равно зажимает курсор человека за этим
// компьютером в прямоугольник страницы. Поэтому до скриптов страницы и во всех рамках
// захват подменяется пустышкой: игра думает, что попросила, и ничего не происходит.
const NO_POINTER_LOCK = `(() => {
  const none = function () { return Promise.resolve(); };
  Object.defineProperty(Element.prototype, 'requestPointerLock', { configurable: true, writable: true, value: none });
  Object.defineProperty(Document.prototype, 'exitPointerLock', { configurable: true, writable: true, value: function () {} });
})();`;

async function shoot(browser, id, system) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 0.5 });
  await ctx.addInitScript(NO_POINTER_LOCK);
  const page = await ctx.newPage();
  await page.route(/^https?:\/\//, (r) => r.abort());
  await page.goto(pageUrl(id));
  await page.waitForTimeout(system ? 3000 : 1200);
  if (system) return snap(page, ctx, id);
  await start(page);
  const how = PLAY[id.replace('-', '_')] || { hold: [], wait: 2000 };
  if (how.click) await page.mouse.click(640, 360);
  if (how.mouse) { await page.mouse.move(640, 500); await page.mouse.down(); }
  for (const k of how.hold) await page.keyboard.down(k);
  await page.waitForTimeout(how.wait);
  return snap(page, ctx, id);
}

// Кадр без паузы и курсора: на снимке должна быть сама игра.
async function snap(page, ctx, id) {
  const file = path.join(OUT, id + '.jpg');
  await page.screenshot({ path: file, type: 'jpeg', quality: 82 });
  await ctx.close();
  return file;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const only = process.argv.slice(2);
  const browser = await chromium.launch({
    args: ['--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  for (const g of [...GAMES, ...SYSTEMS]) {
    if (only.length && !only.includes(g.id)) continue;
    const file = await shoot(browser, g.id, SYSTEMS.includes(g));
    console.log(path.relative(process.cwd(), file), Math.round(fs.statSync(file).size / 1024) + ' КБ');
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
