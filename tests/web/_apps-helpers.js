// Помощники для проверок группы «приложения» (browser_1, calculator, player, python_ide,
// telegram, yandex-music, token-calc, english-abbreviations).
const { expect } = require('@playwright/test');
const { open, pageUrl } = require('../helpers');

// Открыть страницу без сети и вернуть список ошибок, который пополняется до конца проверки.
async function openApp(page, name, { viewport } = {}) {
  if (viewport) await page.setViewportSize(viewport);
  return open(page, name);
}

// Перезагрузить страницу тем же адресом (localStorage у file:// сохраняется в пределах теста).
async function reload(page, name) {
  await page.goto(pageUrl(name));
}

// Все элементы по селектору целиком видны в окне: не обрезаны краем и не требуют прокрутки.
async function expectInsideViewport(page, selector) {
  const vp = page.viewportSize();
  const boxes = await page.locator(selector).evaluateAll((els) => els
    .filter((el) => el.offsetParent !== null)
    .map((el) => {
      const r = el.getBoundingClientRect();
      return { text: (el.textContent || el.getAttribute('aria-label') || el.id || '').trim().slice(0, 20), l: r.left, t: r.top, r: r.right, b: r.bottom };
    }));
  expect(boxes.length, `нет видимых элементов ${selector}`).toBeGreaterThan(0);
  for (const b of boxes) {
    expect(b.l, `${b.text}: левый край`).toBeGreaterThanOrEqual(-0.5);
    expect(b.t, `${b.text}: верхний край`).toBeGreaterThanOrEqual(-0.5);
    expect(b.r, `${b.text}: правый край`).toBeLessThanOrEqual(vp.width + 0.5);
    expect(b.b, `${b.text}: нижний край`).toBeLessThanOrEqual(vp.height + 0.5);
  }
}

// Страница не шире окна: нет горизонтальной прокрутки.
async function expectNoHorizontalScroll(page) {
  const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  expect(sw, 'горизонтальная прокрутка').toBeLessThanOrEqual(cw);
}

// Фан-концепт: пометка о том, что страница не связана с правообладателем, видна пользователю.
async function expectFanNotice(page) {
  await expect(page.getByText(/фан-концепт, не связан с правообладателем/i).first()).toBeVisible();
  await expect(page).toHaveTitle(/фан-концепт/i);
}

module.exports = { openApp, reload, expectInsideViewport, expectNoHorizontalScroll, expectFanNotice };
