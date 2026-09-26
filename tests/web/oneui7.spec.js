// Законы oneui7 (телефон «Волна»): телефон целиком виден, блокировка, шторка, все приложения,
// каждое приложение работает без alert, настройки и данные сохраняются, часы верные.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { WEB } = require('../helpers');
const { openOs, expectInside, dragFrom, expectNoPageOverflow, expectNoBrandGlyphs } = require('./_os-helpers');

const NAME = 'oneui7';
const APPS = ['phone', 'messages', 'contacts', 'camera', 'gallery', 'calculator', 'clock', 'settings', 'weather', 'calendar', 'notes', 'music', 'browser', 'files', 'mail'];
const app = (page) => page.locator('#app-container');
const hhmm = (page) => page.evaluate(() => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); });

async function unlock(page) {
  await page.locator('#unlock-area').click({ position: { x: 190, y: 330 } });
  await expect(page.locator('#homescreen')).not.toHaveClass(/hidden/);
}
async function openFromDrawer(page, id) {
  await page.click('#home-pill');
  await expect(page.locator('#app-drawer')).toHaveClass(/open/);
  await page.click(`#drawer-grid [data-open="${id}"]`);
  await expect(app(page)).toHaveClass(/open/);
  await expect(app(page).locator('.app-screen')).toBeVisible();
  return app(page);
}
async function home(page) {
  await app(page).locator('[data-a="home"]').click();
  await expect(app(page)).not.toHaveClass(/open/);
}

test('без чужих названий и alert, с пометкой фан-концепта', async ({ page }) => {
  const errors = await openOs(page, NAME);
  await expect(page).toHaveTitle(/фан-концепт интерфейса, не связан с Microsoft\/Apple\/Samsung/);
  await expectNoBrandGlyphs(page);
  const src = fs.readFileSync(path.join(WEB, NAME, 'index.html'), 'utf8');
  expect(src).not.toMatch(/\balert\(|\bprompt\(|\bconfirm\(|(src|href)\s*=\s*["']https?:/);
  expect(src).not.toMatch(/Samsung account|Galaxy|One UI|Spotify|YouTube|Gmail|Android|\+7 9(0[56]|1[56]|2[56]|77|99) /);
  await unlock(page);
  let text = '';
  for (const id of APPS) { await openFromDrawer(page, id); text += await page.evaluate(() => document.body.innerText); await home(page); }
  expect(text.replace(/Microsoft\/Apple\/Samsung/g, '')).not.toMatch(/Samsung|Galaxy|One UI|Spotify|Google|YouTube|GitHub|Android|Алексей|В разработке|раздел демо/);
  const s = await openFromDrawer(page, 'settings');
  await s.locator('[data-p="about"]').click();
  await expect(s).toContainText('не связан с Microsoft/Apple/Samsung');
  expect(errors).toEqual([]);
});

for (const size of [{ width: 1280, height: 800 }, { width: 1024, height: 700 }, { width: 800, height: 600 }]) {
  test(`на ${size.width}x${size.height} телефон целиком в окне`, async ({ page }) => {
    await openOs(page, NAME, size);
    await expectInside(page, page.locator('#phone'), 'телефон');
    await expectNoPageOverflow(page);
  });
}

test('на экране 390x844 телефон на весь экран, док и полоска видны', async ({ page }) => {
  await openOs(page, NAME, { width: 390, height: 844 });
  expect(Math.round((await page.locator('#phone').boundingBox()).width)).toBe(390);
  await unlock(page);
  await expectInside(page, page.locator('#dock'), 'док');
  await expectInside(page, page.locator('#home-pill'), 'полоска');
  await expectNoPageOverflow(page);
});

test('блокировка: время верное, Enter разблокирует, кнопка питания блокирует, ярлык открывает камеру', async ({ page }) => {
  await openOs(page, NAME);
  await expect(page.locator('#lock-clock')).toHaveText(await hhmm(page));
  await page.keyboard.press('Enter');
  await expect(page.locator('#homescreen')).not.toHaveClass(/hidden/);
  await page.click('#power-btn');
  await expect(page.locator('#lockscreen')).not.toHaveClass(/hidden/);
  await page.click('[data-lockapp="camera"]');
  await expect(app(page)).toHaveClass(/open/);
  await expect(app(page).locator('.cam-shutter')).toBeVisible();
});

test('шторка: открывается по строке состояния и смахиванием, быстрые настройки переключаются и сохраняются', async ({ page }) => {
  await openOs(page, NAME);
  await unlock(page);
  await page.locator('#homescreen .statusbar').click();
  await expect(page.locator('#shade')).toHaveClass(/open/);
  await page.click('[data-shade="qs"]');
  await page.click('[data-qs="bt"]');
  await page.click('[data-qs="airplane"]');
  await expect(page.locator('[data-qs="wifi"]')).not.toHaveClass(/on/);
  const tr = await page.locator('#bright-track').boundingBox();
  await page.mouse.click(tr.x + tr.width * 0.3, tr.y + tr.height / 2);
  expect(+(await page.locator('#dim').evaluate((e) => e.style.opacity))).toBeGreaterThan(0.2);
  await page.keyboard.press('Escape');
  await expect(page.locator('#shade')).not.toHaveClass(/open/);
  const b = await page.locator('#phone').boundingBox();
  await dragFrom(page, b.x + b.width / 2, b.y + 30, 0, 250);
  await expect(page.locator('#shade')).toHaveClass(/open/);
  await page.reload();
  await unlock(page);
  await page.locator('#homescreen .statusbar').click();
  await page.click('[data-shade="qs"]');
  await expect(page.locator('[data-qs="airplane"]')).toHaveClass(/on/);
});

test('каждое приложение открывается из «Всех приложений» и закрывается полоской, Esc и смахиванием', async ({ page }) => {
  const errors = await openOs(page, NAME);
  await unlock(page);
  for (const id of APPS) { await openFromDrawer(page, id); await home(page); }
  await page.click('#home-pill');
  await page.fill('#drawer-input', 'кальк');
  await expect(page.locator('#drawer-grid [data-open]')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(app(page)).toHaveClass(/open/);
  await page.keyboard.press('Escape');
  await expect(app(page)).not.toHaveClass(/open/);
  await openFromDrawer(page, 'weather');
  // уезжающий список приложений не перехватывает нажатия и лежит под открытым приложением
  expect(await page.locator('#app-drawer').evaluate((e) => getComputedStyle(e).pointerEvents)).toBe('none');
  const z = (sel) => page.locator(sel).evaluate((e) => +getComputedStyle(e).zIndex);
  expect(await z('#app-container')).toBeGreaterThan(await z('#app-drawer'));
  const b = await page.locator('#phone').boundingBox();

  await dragFrom(page, b.x + b.width / 2, b.y + b.height - 15, 0, -250);
  await expect(app(page)).not.toHaveClass(/open/);
  expect(errors).toEqual([]);
});

test('обои, заметка, будильник, событие, сообщение и фото камеры сохраняются', async ({ page }) => {
  await openOs(page, NAME);
  await unlock(page);
  let a = await openFromDrawer(page, 'settings');
  await a.locator('[data-p="wall"]').click();
  await a.locator('[data-w="mint"]').click();
  await home(page);
  a = await openFromDrawer(page, 'notes');
  await a.locator('[data-a="new"]').click();
  await a.locator('[name=note]').fill('Проверка\nвторая строка');
  await page.keyboard.press('Escape');
  await expect(a.locator('.note-card').first()).toContainText('Проверка');
  await home(page);
  a = await openFromDrawer(page, 'clock');
  await a.locator('[data-tab="alarm"]').click();
  await a.locator('input[name=t]').fill('06:15');
  await a.locator('input[name=label]').fill('Бег');
  await a.locator('form button').click();
  await home(page);
  a = await openFromDrawer(page, 'calendar');
  await a.locator('input[name=title]').fill('Кружок');
  await a.locator('form button').click();
  await home(page);
  a = await openFromDrawer(page, 'messages');
  await a.locator('[data-id="bor"]').click();
  await a.locator('[name=msg]').fill('до завтра');
  await a.locator('[name=msg]').press('Enter');
  await home(page);
  a = await openFromDrawer(page, 'gallery');
  const before = await a.locator('.gal-tile').count();
  await home(page);
  a = await openFromDrawer(page, 'camera');
  await a.locator('[data-a="shoot"]').click();
  await page.reload();
  expect(await page.locator('#homescreen').evaluate((e) => e.style.background)).toContain('rgb(20, 83, 45)');
  await unlock(page);
  await expect(page.locator('.widget-calendar')).toContainText('Кружок');
  a = await openFromDrawer(page, 'notes');
  await expect(a.locator('.note-card').first()).toContainText('Проверка');
  await home(page);
  a = await openFromDrawer(page, 'clock');
  await a.locator('[data-tab="alarm"]').click();
  await expect(a).toContainText('Бег');
  await home(page);
  a = await openFromDrawer(page, 'messages');
  await a.locator('[data-id="bor"]').click();
  await expect(a.locator('.bubble.me').last()).toHaveText('до завтра');
  await home(page);
  a = await openFromDrawer(page, 'gallery');
  await expect(a.locator('.gal-tile')).toHaveCount(before + 1);
});

test('калькулятор: не больше 9 цифр, ÷0 - ошибка, клавиатура', async ({ page }) => {
  await openOs(page, NAME);
  await unlock(page);
  const a = await openFromDrawer(page, 'calculator');
  for (const k of '1234567890') await a.locator(`[data-k="${k}"]`).click();
  await expect(a.locator('#calc-display')).toHaveText('123 456 789');
  for (const k of ['C', '5', '÷', '0', '=']) await a.locator(`[data-k="${k}"]`).click();
  await expect(a.locator('#calc-display')).toHaveText('Ошибка');
  await page.keyboard.type('0.1+0.2');
  await page.keyboard.press('Enter');
  await expect(a.locator('#calc-display')).toHaveText('0,3');
});

test('часы: мировое время по настоящим поясам, таймер и секундомер идут', async ({ page }) => {
  await openOs(page, NAME);
  await unlock(page);
  const a = await openFromDrawer(page, 'clock');
  const tokyo = await page.evaluate(() => new Date().toLocaleTimeString('ru-RU', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' }));
  await expect(a.locator('.o-list-row', { hasText: 'Токио' })).toContainText(tokyo);
  await a.locator('[data-tab="timer"]').click();
  await a.locator('[data-m="1"]').click();
  await a.locator('[data-a="tstart"]').click();
  await page.waitForTimeout(1300);
  expect(await a.locator('.big-time').textContent()).toMatch(/00:00:5\d/);
  await a.locator('[data-tab="stop"]').click();
  await a.locator('[data-a="swgo"]').click();
  await page.waitForTimeout(300);
  await a.locator('[data-a="swlap"]').click();
  await expect(a.locator('.laps div')).toHaveCount(1);
});

test('телефон звонит и завершает звонок, контакт открывает переписку, письмо читается', async ({ page }) => {
  await openOs(page, NAME);
  await unlock(page);
  let a = await openFromDrawer(page, 'phone');
  await a.locator('[data-tab="dial"]').click();
  for (const k of '101') await a.locator(`[data-k="${k}"]`).click();
  await a.locator('[data-a="dialcall"]').click();
  await expect(page.locator('.call-screen')).toBeVisible();
  await page.locator('[data-endcall]').click();
  await expect(page.locator('.call-screen')).toHaveCount(0);
  await a.locator('[data-tab="log"]').click();
  await expect(a.locator('.o-list-row').first()).toContainText('101');
  await home(page);
  a = await openFromDrawer(page, 'contacts');
  await a.locator('[data-i="2"]').click();
  await a.locator('[data-a="write"]').click();
  await expect(a.locator('.app-title')).toHaveText('Вика');
  await home(page);
  a = await openFromDrawer(page, 'mail');
  await a.locator('[data-i="2"]').click();
  await expect(a).toContainText('не связан с Microsoft/Apple/Samsung');
});
