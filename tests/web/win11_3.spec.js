// Законы win11_3: окна ведут себя как окна, меню Пуск открывается и закрывается,
// каждое приложение открывается, настройки и файлы переживают перезагрузку, всё помещается в экран.
const { test, expect } = require('@playwright/test');
const { openOs, expectInside, dragBy, expectNoPageOverflow, topmostAt, expectNoBrandGlyphs } = require('./_os-helpers');

const NAME = 'win11_3';
const APPS = ['explorer', 'browser', 'notepad', 'calc', 'settings', 'recycle'];

async function boot(page, size) {
  const errors = await openOs(page, NAME, size);
  await expect(page.locator('#boot')).toHaveClass(/hidden/, { timeout: 5000 });
  return errors;
}
async function openFromStart(page, id) {
  await page.click('#startBtn');
  await expect(page.locator('#startMenu')).toHaveClass(/open/);
  await page.click('#smAllBtn');
  await page.click(`#startMenu [data-open-app="${id}"]`);
  const win = page.locator(`.window[data-app="${id}"]`).last();
  await expect(win).toBeVisible();
  return win;
}

test('заголовок с пометкой фан-концепта, без личных данных и фирменных знаков', async ({ page }) => {
  const errors = await boot(page);
  await expect(page).toHaveTitle(/фан-концепт интерфейса, не связан с Microsoft\/Apple\/Samsung/);
  await expectNoBrandGlyphs(page);
  const html = await page.content();
  expect(html).not.toContain('Алексей');
  expect(html).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
  expect(errors).toEqual([]);
});

test('меню Пуск: открывается щелчком, закрывается повторным щелчком, Esc и щелчком по столу', async ({ page }) => {
  await boot(page);
  const menu = page.locator('#startMenu');
  await page.click('#startBtn');
  await expect(menu).toHaveClass(/open/);
  await page.click('#startBtn');
  await expect(menu).not.toHaveClass(/open/);
  await page.click('#startBtn');
  await page.keyboard.press('Escape');
  await expect(menu).not.toHaveClass(/open/);
  await page.click('#startBtn');
  await page.mouse.click(160, 650);
  await expect(menu).not.toHaveClass(/open/);
  // поиск в меню фильтрует приложения
  await page.click('#startBtn');
  await page.fill('#smSearch', 'кальк');
  await expect(page.locator('#smPinned [data-open-app]')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(page.locator('.window[data-app="calc"]')).toBeVisible();
});

test('каждое приложение из меню Пуск открывает своё окно и значок на панели задач', async ({ page }) => {
  const errors = await boot(page);
  for (const id of APPS) {
    await openFromStart(page, id);
    await expect(page.locator(`.tb-icon[data-app="${id}"]`)).toHaveClass(/running/);
  }
  await expect(page.locator('.window')).toHaveCount(APPS.length);
  expect(errors).toEqual([]);
});

test('окно тащится за заголовок и не уходит за край экрана и под панель задач', async ({ page }) => {
  await boot(page);
  const win = await openFromStart(page, 'calc');
  const header = win.locator('.window-header');
  const before = await win.boundingBox();
  await dragBy(page, header, -100, 60, 60, 16);
  const moved = await win.boundingBox();
  expect(Math.round(moved.x - before.x)).toBe(-100);
  expect(Math.round(moved.y - before.y)).toBe(60);
  await dragBy(page, header, 3000, 3000, 60, 16);
  const box = await expectInside(page, win, 'окно после рывка вправо-вниз');
  expect(box.y + box.height).toBeLessThanOrEqual(800 - 48 + 1);
  await dragBy(page, header, -3000, -3000, 60, 16);
  const box2 = await expectInside(page, win, 'окно после рывка влево-вверх');
  expect(box2.x).toBeGreaterThanOrEqual(0);
  expect(box2.y).toBeGreaterThanOrEqual(0);
});

test('размер окна меняется за угол, двойной щелчок по заголовку разворачивает', async ({ page }) => {
  await boot(page);
  const win = await openFromStart(page, 'notepad');
  const b = await win.boundingBox();
  await dragBy(page, win.locator('.rz-se'), 80, 40);
  const b2 = await win.boundingBox();
  expect(Math.round(b2.width - b.width)).toBe(80);
  expect(Math.round(b2.height - b.height)).toBe(40);
  await win.locator('.window-title').dblclick();
  const m = await win.boundingBox();
  expect(Math.round(m.width)).toBe(1280);
  expect(Math.round(m.height)).toBe(800 - 48);
  await win.locator('.window-title').dblclick();
  expect(Math.round((await win.boundingBox()).width)).toBe(Math.round(b2.width));
});

test('закрытое окно пропадает с панели задач, свёрнутое возвращается щелчком по значку', async ({ page }) => {
  await boot(page);
  const rec = await openFromStart(page, 'recycle');
  await expect(page.locator('.tb-icon[data-app="recycle"]')).toHaveCount(1);
  await rec.locator('[data-act=close]').click();
  await expect(page.locator('.window[data-app="recycle"]')).toHaveCount(0);
  await expect(page.locator('.tb-icon[data-app="recycle"]')).toHaveCount(0);

  const calc = await openFromStart(page, 'calc');
  await calc.locator('[data-act=min]').click();
  await expect(calc).toBeHidden();
  await expect(page.locator('.tb-icon[data-app="calc"]')).not.toHaveClass(/active/);
  await page.click('.tb-icon[data-app="calc"]');
  await expect(calc).toBeVisible();
  await expect(page.locator('.tb-icon[data-app="calc"]')).toHaveClass(/active/);
  await calc.locator('[data-act=close]').click();
  await expect(page.locator('.tb-icon[data-app="calc"]')).not.toHaveClass(/running/);
});

test('порядок окон: щелчок поднимает окно, панель задач и меню всегда выше окон', async ({ page }) => {
  await boot(page);
  const a = await openFromStart(page, 'settings');
  const b = await openFromStart(page, 'browser');
  // 20 переключений через панель задач: номера слоёв не растут бесконечно
  for (let i = 0; i < 20; i++) await page.click(`.tb-icon[data-app="${i % 2 ? 'browser' : 'settings'}"]`);
  // щелчок по видимой части заголовка нижнего окна поднимает его
  await page.click('.tb-icon[data-app="browser"]');
  const ha = await a.locator('.window-header').boundingBox();
  await page.mouse.click(ha.x + 150, ha.y + 10);

  const za = +(await a.evaluate(e => getComputedStyle(e).zIndex));
  const zb = +(await b.evaluate(e => getComputedStyle(e).zIndex));
  expect(za).toBeGreaterThan(zb);
  expect(za).toBeLessThanOrEqual(2);
  await a.locator('[data-act=max]').click();
  expect(await topmostAt(page, 640, 776, '.taskbar')).toBe(true);
  await page.click('#startBtn');
  await expect.poll(() => topmostAt(page, 640, 300, '#startMenu')).toBe(true);
});

test('оформление (обои, тема, акцент) сохраняется после перезагрузки', async ({ page }) => {
  await boot(page);
  const win = await openFromStart(page, 'settings');
  await win.locator('[data-page=personal]').click();
  await win.locator('[data-wall=forest]').click();
  await win.locator('button[data-set-theme=dark]').click();
  await win.locator('[data-accent="#f43f5e"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('#boot')).toHaveClass(/hidden/, { timeout: 5000 });
  await expect(page.locator('body')).toHaveAttribute('data-theme', 'dark');
  expect(await page.locator('#wallpaper').evaluate(e => e.style.background)).toContain('rgb(6, 95, 70)');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim())).toBe('#f43f5e');
});

test('Блокнот сохраняет файл, он виден в Проводнике после перезагрузки; удаление идёт в Корзину и возвращается', async ({ page }) => {
  await boot(page);
  await page.dblclick('.dicon[data-icon="notes"]');
  const np = page.locator('.window[data-app="notepad"]');
  await expect(np).toBeVisible();
  await np.locator('textarea').fill('проверка записи');
  await expect(np.locator('.wt')).toHaveText('*Заметки.txt - Блокнот');
  await np.locator('textarea').press('Control+s');
  await expect(np.locator('.wt')).toHaveText('Заметки.txt - Блокнот');
  await page.reload();
  await expect(page.locator('#boot')).toHaveClass(/hidden/, { timeout: 5000 });
  const ex = await openFromStart(page, 'explorer');
  await ex.locator('.ex-file[data-p="Документы/Заметки.txt"]').dblclick();
  await expect(page.locator('.window[data-app="notepad"] textarea')).toHaveValue('проверка записи');
  await ex.locator('.window-title').click();
  await ex.locator('.ex-file[data-p="Документы/Заметки.txt"]').click();
  await ex.locator('[data-ex=del]').click();
  await expect(ex.locator('.ex-file[data-p="Документы/Заметки.txt"]')).toHaveCount(0);
  const rec = await openFromStart(page, 'recycle');
  await rec.locator('[data-restore="0"]').click();
  await expect(ex.locator('.ex-file[data-p="Документы/Заметки.txt"]')).toHaveCount(1);
});

test('несохранённый Блокнот спрашивает перед закрытием', async ({ page }) => {
  await boot(page);
  const np = await openFromStart(page, 'notepad');
  await np.locator('textarea').fill('черновик');
  await np.locator('[data-act=close]').click();
  await expect(np.locator('.win-dialog')).toBeVisible();
  await np.locator('.win-dialog .btn', { hasText: 'Отмена' }).click();
  await expect(np).toBeVisible();
  await np.locator('[data-act=close]').click();
  await np.locator('.win-dialog .btn', { hasText: 'Не сохранять' }).click();
  await expect(page.locator('.window[data-app="notepad"]')).toHaveCount(0);
});

test('калькулятор считает по порядку, без ошибок округления и с защитой от деления на ноль', async ({ page }) => {
  await boot(page);
  const c = await openFromStart(page, 'calc');
  const press = async (keys) => { for (const k of keys) await c.locator(`[data-k="${k}"]`).click(); };
  const screen = c.locator('.calc-screen');
  await press(['1', '2', '+', '7', '*', '3', '=']);
  await expect(screen).toHaveText('57');
  await press(['C', '0', '.', '1', '+', '0', '.', '2', '=']);
  await expect(screen).toHaveText('0,3');
  await press(['C', '5', '/', '0', '=']);
  await expect(screen).toHaveText('Деление на ноль невозможно');
  await press(['C']);
  await c.locator('.window-title').click();
  await page.keyboard.type('9*9');
  await page.keyboard.press('Enter');
  await expect(screen).toHaveText('81');
});

test('быстрые настройки и календарь открываются; блокировка снимается клавишей', async ({ page }) => {
  await boot(page);
  await page.click('#trayBtn');
  await expect(page.locator('#quickPanel')).toHaveClass(/open/);
  await page.click('.qp-btn[data-qp="night"]');
  await expect(page.locator('#nightLayer')).toBeVisible();
  await page.click('#clock');
  await expect(page.locator('#calendarPanel')).toHaveClass(/open/);
  await expect(page.locator('#quickPanel')).not.toHaveClass(/open/);
  await expect(page.locator('#calGrid .today')).toHaveCount(1);
  await page.click('#startBtn');
  await page.click('#powerBtn');
  await page.click('[data-power=lock]');
  await expect(page.locator('#lock')).toBeVisible();
  const now = await page.evaluate(() => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); });
  await expect(page.locator('#lockTime')).toHaveText(now);
  await page.keyboard.press('Space');
  await expect(page.locator('#lock')).toBeHidden();
});

test('на 1024x700 меню и все окна помещаются в экран, прокрутки у страницы нет', async ({ page }) => {
  const errors = await boot(page, { width: 1024, height: 700 });
  await page.click('#startBtn');
  await expectInside(page, page.locator('#startMenu'), 'меню Пуск');
  await page.keyboard.press('Escape');
  await page.click('#searchBtn');
  await expectInside(page, page.locator('#searchPanel'), 'поиск');
  await page.keyboard.press('Escape');
  for (const id of APPS) {
    const w = await openFromStart(page, id);
    const box = await expectInside(page, w, `окно ${id}`);
    expect(box.y + box.height).toBeLessThanOrEqual(700 - 48 + 1);
  }
  await expectNoPageOverflow(page);
  await page.setViewportSize({ width: 800, height: 600 });
  await expect(async () => {
    for (const w of await page.locator('.window').all()) await expectInside(page, w, 'окно после уменьшения экрана');
  }).toPass({ timeout: 3000 });

  expect(errors).toEqual([]);
});
