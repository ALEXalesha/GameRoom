// Помощники для проверок Блоксити (web/roblox-mini): открыть без сети с параметрами адреса,
// собрать ошибки, войти в место, сделать шаги мира.
const { pageUrl } = require('../helpers');

// query по умолчанию: зерно 7, мир шагает только по команде, короткая загрузка
async function openBlox(page, query = 'seed=7&manual=1&fast=1') {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String((e && e.stack) || e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.route(/^https?:\/\//, (route) => route.abort());
  await page.goto(pageUrl('roblox-mini') + (query ? '?' + query : ''));
  await page.waitForFunction(() => window.__blox && window.__blox.ready === true);
  return errors;
}

async function enter(page, id) {
  const ok = await page.evaluate((i) => __blox.enter(i), id);
  if (!ok) throw new Error('не вошли в ' + id);
}

// Влезает ли страница: нет прокрутки, элемент sel целиком в окне
async function fit(page, sel) {
  return page.evaluate((s) => {
    const de = document.documentElement, r = s ? document.querySelector(s).getBoundingClientRect() : null;
    return { scrollW: de.scrollWidth, scrollH: de.scrollHeight, w: innerWidth, h: innerHeight, box: r && { left: r.left, top: r.top, right: r.right, bottom: r.bottom } };
  }, sel);
}

module.exports = { openBlox, enter, fit, SIZES: [{ width: 1280, height: 800 }, { width: 1024, height: 700 }] };
