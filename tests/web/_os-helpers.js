// Общие помощники для проверок оболочек-ОС (win11_3, windows_4, ios26, oneui7, macos-tahoe, explorer_1).
// Сама страница открывается через tests/helpers.js: там собираются ошибки и отсекается сеть.
const { expect } = require('@playwright/test');
const { open } = require('../helpers');

// Открыть страницу нужного размера и вернуть массив ошибок (он пополняется до конца проверки).
async function openOs(page, name, size) {
  if (size) await page.setViewportSize(size);
  return open(page, name);
}

// Прямоугольник элемента целиком внутри окна браузера (с допуском в 1 пиксель на округление).
async function expectInside(page, locator, what) {
  const box = await locator.boundingBox();
  expect(box, `${what}: элемент не виден`).not.toBeNull();
  const vp = page.viewportSize();
  const msg = `${what}: ${JSON.stringify(box)} вылезает за ${vp.width}x${vp.height}`;
  expect(box.x, msg).toBeGreaterThanOrEqual(-1);
  expect(box.y, msg).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width, msg).toBeLessThanOrEqual(vp.width + 1);
  expect(box.y + box.height, msg).toBeLessThanOrEqual(vp.height + 1);
  return box;
}

// Протащить мышью: взять за точку (x, y) и сдвинуть на (dx, dy) в несколько шагов.
async function dragFrom(page, x, y, dx, dy) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 4 });
  await page.mouse.move(x + dx, y + dy, { steps: 4 });
  await page.mouse.up();
}

// Протащить элемент за его середину (или за точку со сдвигом ox, oy от левого верхнего угла).
async function dragBy(page, locator, dx, dy, ox, oy) {
  const box = await locator.boundingBox();
  const x = box.x + (ox === undefined ? box.width / 2 : ox);
  const y = box.y + (oy === undefined ? box.height / 2 : oy);
  await dragFrom(page, x, y, dx, dy);
}

// У страницы нет прокрутки по горизонтали и вертикали: всё помещается в окно.
async function expectNoPageOverflow(page) {
  const m = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight,
    w: innerWidth, h: innerHeight,
  }));
  expect(m.sw, `ширина страницы ${m.sw} больше окна ${m.w}`).toBeLessThanOrEqual(m.w);
  expect(m.sh, `высота страницы ${m.sh} больше окна ${m.h}`).toBeLessThanOrEqual(m.h);
}

// Какой элемент (селектор-предок) оказывается сверху в точке: проверка порядка наложения.
async function topmostAt(page, x, y, selector) {
  return page.evaluate(([x, y, sel]) => {
    const el = document.elementFromPoint(x, y);
    return !!(el && el.closest(sel));
  }, [x, y, selector]);
}

// Во всём тексте страницы нет фирменных логотипов-символов (яблоко U+F8FF и т.п.).
async function expectNoBrandGlyphs(page) {
  const txt = await page.evaluate(() => document.documentElement.outerHTML);
  expect(txt.includes(''), 'в разметке символ-логотип U+F8FF').toBe(false);
}

module.exports = { openOs, expectInside, dragFrom, dragBy, expectNoPageOverflow, topmostAt, expectNoBrandGlyphs };
