// Законы ios26 (телефон «Стекло»): телефон целиком виден в любом окне, блокировка и возврат домой,
// каждая программа работает (заглушек нет), пункт управления меняет настройки, всё сохраняется.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { WEB } = require('../helpers');
const { openOs, expectInside, dragFrom, expectNoPageOverflow, expectNoBrandGlyphs } = require('./_os-helpers');

const NAME = 'ios26';
const APPS = ['weather', 'clock', 'phone', 'messages', 'mail', 'browser', 'camera', 'photos', 'music', 'calc', 'notes', 'calendar', 'settings'];
const screen = (page, id) => page.locator(`#app-${id}`);
const hhmm = (page) => page.evaluate(() => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); });

async function unlock(page) {
  await page.locator('#lock-page').click({ position: { x: 190, y: 400 } });
  await expect(page.locator('#home-page')).toHaveClass(/active/);
}
async function open(page, id) {
  await page.locator(id === 'settings' ? '#dock [data-app="settings"]' : `#home-grid .app-icon[data-app="${id}"]`).click();
  await expect(screen(page, id)).toBeVisible();
  return screen(page, id);
}

test('без чужих названий и знаков, с пометкой фан-концепта; без alert/prompt/confirm', async ({ page }) => {
  const errors = await openOs(page, NAME);
  await expect(page).toHaveTitle(/фан-концепт интерфейса, не связан с Microsoft\/Apple\/Samsung/);
  await expectNoBrandGlyphs(page);
  const src = fs.readFileSync(path.join(WEB, NAME, 'index.html'), 'utf8');
  expect(src).not.toMatch(/\balert\(|\bprompt\(|\bconfirm\(|SF Pro|(src|href)\s*=\s*["']https?:/);
  await unlock(page);
  for (const id of APPS) { await open(page, id); await page.keyboard.press('Escape'); }
  const text = (await page.evaluate(() => document.body.innerText)).replace(/Microsoft\/Apple\/Samsung/g, '');
  expect(text).not.toMatch(/iPhone|iOS|Apple|Safari|iMessage|Wallet|Liquid Glass|Siri|заглушк/i);
  const s = await open(page, 'settings');
  await s.locator('[data-page="about"]').click();
  await expect(s).toContainText('не связан с Microsoft/Apple/Samsung');
  expect(errors).toEqual([]);
});

for (const size of [{ width: 1280, height: 800 }, { width: 1024, height: 700 }, { width: 800, height: 600 }]) {
  test(`на ${size.width}x${size.height} телефон целиком в окне`, async ({ page }) => {
    await openOs(page, NAME, size);
    await expectInside(page, page.locator('#device'), 'телефон');
    await expectNoPageOverflow(page);
  });
}

test('на экране телефона 390x844 всё на весь экран, иконки и панель видны', async ({ page }) => {
  await openOs(page, NAME, { width: 390, height: 844 });
  const b = await page.locator('#device').boundingBox();
  expect(Math.round(b.width)).toBe(390);
  await expectNoPageOverflow(page);
  await unlock(page);
  await expectInside(page, page.locator('#dock'), 'панель');
  await expectInside(page, page.locator('#home-grid .app-icon[data-app="calendar"]'), 'последняя иконка');
});

test('блокировка: время верное, разблокировка нажатием и Enter, кнопка сбоку блокирует', async ({ page }) => {
  await openOs(page, NAME);
  await expect(page.locator('#lock-time')).toHaveText(await hhmm(page));
  await page.keyboard.press('Enter');
  await expect(page.locator('#home-page')).toHaveClass(/active/);
  await page.click('#power-btn');
  await expect(page.locator('#lock-page')).toHaveClass(/active/);
  await unlock(page);
});

test('каждая программа открывается и закрывается жестом, полоской и Esc', async ({ page }) => {
  const errors = await openOs(page, NAME);
  await unlock(page);
  for (const id of APPS) {
    const s = await open(page, id);
    await expect(s.locator('[data-sb] .time')).toHaveText(await hhmm(page));
    await s.locator('.home-indicator').click();
    await expect(s).toBeHidden();
  }
  const s = await open(page, 'weather');
  const b = await page.locator('#device').boundingBox();
  await dragFrom(page, b.x + b.width / 2, b.y + b.height - 60, 0, -300);   // смахнуть вверх от нижнего края
  await expect(s).toBeHidden();
  await open(page, 'music');
  await page.keyboard.press('Escape');
  await expect(screen(page, 'music')).toBeHidden();
  expect(errors).toEqual([]);
});

test('пункт управления: открывается по значкам вверху, Wi-Fi и тема связаны с Настройками, яркость тянется', async ({ page }) => {
  await openOs(page, NAME);
  await unlock(page);
  await page.locator('#home-page [data-sb] .right').click();
  const cc = page.locator('#control-center');
  await expect(cc).toHaveClass(/open/);
  await cc.locator('[data-cc="wifi"]').click();
  await cc.locator('[data-cc="dark"]').click();
  await expect(page.locator('body')).toHaveClass(/dark/);
  const sl = cc.locator('[data-slider="brightness"]');
  const sb = await sl.boundingBox();
  await page.mouse.click(sb.x + sb.width / 2, sb.y + sb.height * 0.6);
  expect(+(await page.locator('#dim-layer').evaluate((e) => e.style.opacity))).toBeGreaterThan(0.1);
  await page.keyboard.press('Escape');
  await expect(cc).not.toHaveClass(/open/);
  const s = await open(page, 'settings');
  await expect(s.locator('[data-set="wifi"]')).toHaveClass(/off/);
  await s.locator('[data-set="airplane"]').click();
  await expect(s.locator('[data-set="bt"]')).toHaveClass(/off/);
});

test('обои, тема, заметка, будильник, событие и переписка сохраняются после перезагрузки', async ({ page }) => {
  await openOs(page, NAME);
  await unlock(page);
  let s = await open(page, 'settings');
  await s.locator('[data-page="wall"]').click();
  await s.locator('[data-wall="forest"]').click();
  await page.keyboard.press('Escape');   // из раздела «Обои» в список настроек
  await page.keyboard.press('Escape');   // из настроек домой

  s = await open(page, 'notes');
  await s.locator('[data-new]').click();
  await s.locator('textarea').fill('Проверка сохранения\nвторая строка');
  await page.keyboard.press('Escape');
  await expect(s.locator('.list-row').first()).toContainText('Проверка сохранения');
  await page.keyboard.press('Escape');
  s = await open(page, 'clock');
  await s.locator('[data-tab="alarms"]').click();
  await s.locator('input[type=time]').fill('06:45');
  await s.locator('input[name=label]').fill('Зарядка');
  await s.locator('.clock-add button').click();
  await page.keyboard.press('Escape');
  s = await open(page, 'calendar');
  await s.locator('input[name=title]').fill('Кружок');
  await s.locator('input[name=time]').fill('23:59');
  await s.locator('.cal-add button').click();
  await page.keyboard.press('Escape');
  s = await open(page, 'messages');
  await s.locator('[data-chat="ann"]').click();
  await s.locator('#msg-input').fill('до встречи');
  await s.locator('#msg-input').press('Enter');
  await page.reload();
  expect(await page.locator('#home-wall').evaluate((e) => e.style.background)).toContain('rgb(20, 83, 45)');
  await expect(page.locator('#w-events')).toHaveText(/2 события/);
  await expect(page.locator('#w-next')).toHaveText(/Следующее в 23:59|Следующее в 18:00/);
  await unlock(page);
  await expect((await open(page, 'notes')).locator('.list-row').first()).toContainText('Проверка сохранения');
  await page.keyboard.press('Escape');
  s = await open(page, 'clock');
  await s.locator('[data-tab="alarms"]').click();
  await expect(s).toContainText('Зарядка');
  await page.keyboard.press('Escape');
  s = await open(page, 'messages');
  await s.locator('[data-chat="ann"]').click();
  await expect(s.locator('.msg-bubble.me').last()).toHaveText('до встречи');
});

test('калькулятор: не больше 9 цифр, деление на ноль - ошибка, ввод с клавиатуры', async ({ page }) => {
  await openOs(page, NAME);
  await unlock(page);
  const c = await open(page, 'calc');
  const d = c.locator('#calc-display');
  for (const k of '1234567890') await c.locator(`[data-calc="${k}"]`).click();
  await expect(d).toHaveText('123 456 789');
  for (const k of ['C', '5', '/', '0', '=']) await c.locator(`[data-calc="${k}"]`).click();
  await expect(d).toHaveText('Ошибка');
  await page.keyboard.type('0.1+0.2');
  await page.keyboard.press('Enter');
  await expect(d).toHaveText('0,3');
});

test('камера: снимок попадает в Фото, его можно удалить; телефон звонит и завершает звонок', async ({ page }) => {
  await openOs(page, NAME);
  await unlock(page);
  let s = await open(page, 'photos');
  const before = await s.locator('.ph-tile').count();
  await page.keyboard.press('Escape');
  s = await open(page, 'camera');
  await s.locator('#camera-shutter').click();
  await s.locator('[data-thumb]').click();
  const p = screen(page, 'photos');
  await expect(p.locator('.ph-view')).toBeVisible();
  await p.locator('[data-pv="close"]').click();
  await expect(p.locator('.ph-tile')).toHaveCount(before + 1);
  await p.locator('.ph-tile').last().click();
  await p.locator('[data-pv="del"]').click();
  await p.locator('[data-pv="close"]').click();
  await expect(p.locator('.ph-tile')).toHaveCount(before);
  await page.keyboard.press('Escape');
  s = await open(page, 'phone');
  for (const k of '112') await s.locator(`[data-key="${k}"]`).click();
  await expect(s.locator('#dial-num')).toHaveText('112');
  await s.locator('[data-call]').click();
  await expect(s.locator('.call-screen')).toBeVisible();
  await s.locator('[data-end]').click();
  await expect(s.locator('.call-screen')).toHaveCount(0);
});

test('часы: мировое время верное, секундомер идёт и считает круги', async ({ page }) => {
  await openOs(page, NAME);
  await unlock(page);
  const c = await open(page, 'clock');
  const msk = await page.evaluate(() => new Date().toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit' }));
  await expect(c.locator('.alarm-item').first()).toContainText(msk);
  await c.locator('[data-tab="stopwatch"]').click();
  await c.locator('[data-sw="toggle"]').click();
  await page.waitForTimeout(300);
  await c.locator('[data-sw="lap"]').click();
  await expect(c.locator('.laps div')).toHaveCount(1);
  await c.locator('[data-sw="toggle"]').click();
  expect(await c.locator('#sw-display').textContent()).not.toBe('00:00,00');
});
