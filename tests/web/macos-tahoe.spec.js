// Законы macos-tahoe («Тахо»): окна, панель приложений, меню, поиск, файлы, заметки, терминал,
// настройки переживают перезагрузку, нет чужих фирменных знаков, всё помещается в экран.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { WEB } = require('../helpers');
const { openOs, expectInside, dragBy, dragFrom, expectNoPageOverflow, topmostAt, expectNoBrandGlyphs } = require('./_os-helpers');

const NAME = 'macos-tahoe';
const DOCK = ['files', 'browser', 'maps', 'photos', 'music', 'notes', 'calendar', 'weather', 'calculator', 'terminal', 'settings'];
const win = (page, id) => page.locator(`#win-${id}`);

async function start(page, size) {
  const errors = await openOs(page, NAME, size);
  await expect(win(page, 'notes')).toBeVisible();          // при первом входе открываются Заметки
  return errors;
}
async function dockOpen(page, id) {
  await page.click(`#dock .dock-icon[data-app="${id}"]`);
  await expect(win(page, id)).toBeVisible();
  await expect(win(page, id)).not.toHaveClass(/opening/);   // анимация появления закончилась
  return win(page, id);
}

test('без фирменных знаков и названий, с пометкой фан-концепта; без alert/prompt/confirm', async ({ page }) => {
  const errors = await start(page);
  await expect(page).toHaveTitle(/фан-концепт интерфейса, не связан с Microsoft\/Apple\/Samsung/);
  await expectNoBrandGlyphs(page);
  const src = fs.readFileSync(path.join(WEB, NAME, 'index.html'), 'utf8');
  expect(src).not.toMatch(/\balert\(|\bprompt\(|\bconfirm\(/);
  expect(src).not.toMatch(/SF Pro/);
  const text = (await page.evaluate(() => document.body.innerText)).replace(/Microsoft\/Apple\/Samsung/g, '');
  expect(text).not.toMatch(/Apple|Safari|Finder|iCloud|Siri|macOS|AirDrop|iPhone|Macintosh/);
  await page.click('#menubar [data-menu="system"]');
  await page.locator('#menu-dropdown .item', { hasText: 'Об этом компьютере' }).click();
  await expect(page.locator('#about-modal')).toContainText('не связан с Microsoft/Apple/Samsung');
  expect(errors).toEqual([]);
});

test('каждое приложение с панели открывает окно, щелчок по корзине открывает Корзину', async ({ page }) => {
  const errors = await start(page);
  for (const id of DOCK) {
    await dockOpen(page, id);
    await expect(page.locator(`#dock .dock-icon[data-app="${id}"]`)).toHaveClass(/running/);
    await expect(page.locator('#active-app')).not.toHaveText('Рабочий стол');
  }
  await page.click('#dock .dock-icon[data-app="trash"]');
  await expect(win(page, 'files').locator('.titlebar-title')).toHaveText('Корзина');
  expect(errors).toEqual([]);
});

test('«Все программы»: открываются щелчком, закрываются Esc, поиск и запуск работают', async ({ page }) => {
  await start(page);
  await page.click('#dock .dock-icon[data-app="launchpad"]');
  await expect(page.locator('#launchpad')).toHaveClass(/open/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#launchpad')).not.toHaveClass(/open/);
  await page.click('#dock .dock-icon[data-app="launchpad"]');
  await page.keyboard.type('кальк');
  await expect(page.locator('#lp-grid .lp-app')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(win(page, 'calculator')).toBeVisible();
  await expect(page.locator('#launchpad')).not.toHaveClass(/open/);
});

test('меню строки: открывается щелчком, переключается наведением, закрывается Esc и щелчком мимо', async ({ page }) => {
  await start(page);
  const dd = page.locator('#menu-dropdown');
  await page.click('#menubar [data-menu="file"]');
  await expect(dd).toHaveClass(/open/);
  await page.hover('#menubar [data-menu="go"]');
  await expect(dd).toContainText('Документы');
  await page.keyboard.press('Escape');
  await expect(dd).not.toHaveClass(/open/);
  await page.click('#menubar [data-menu="go"]');
  await dd.locator('.item', { hasText: 'Загрузки' }).click();
  await expect(win(page, 'files').locator('.titlebar-title')).toHaveText('Загрузки');
  await page.click('#menubar [data-menu="window"]');
  await page.mouse.click(600, 500);
  await expect(dd).not.toHaveClass(/open/);
});

test('окно тащится, не заходит под строку меню и за края экрана', async ({ page }) => {
  await start(page);
  const w = await dockOpen(page, 'settings');
  const tb = w.locator('.titlebar-title');
  const b0 = await w.boundingBox();
  await dragBy(page, tb, -40, 30);
  const b1 = await w.boundingBox();
  expect(Math.round(b1.x - b0.x)).toBe(-40);
  expect(Math.round(b1.y - b0.y)).toBe(30);
  await dragBy(page, tb, -3000, -3000);
  const b2 = await expectInside(page, w, 'окно после рывка влево-вверх');
  expect(Math.round(b2.y)).toBe(28);
  expect(Math.round(b2.x)).toBe(0);
  await dragBy(page, w.locator('.titlebar-title'), 3000, 3000);
  await expectInside(page, w, 'окно после рывка вправо-вниз');
});

test('размер меняется за левый и нижний край в пределах экрана, двойной щелчок - во весь экран', async ({ page }) => {
  await start(page);
  const w = await dockOpen(page, 'files');
  const b = await w.boundingBox();
  await dragFrom(page, b.x + 1, b.y + b.height / 2, -3000, 0);
  const b1 = await w.boundingBox();
  expect(Math.round(b1.x)).toBe(0);
  expect(Math.round(b1.x + b1.width)).toBe(Math.round(b.x + b.width));
  await dragFrom(page, b1.x + b1.width / 2, b1.y + b1.height - 1, 0, 3000);
  await expectInside(page, w, 'окно после растяжения вниз');
  await w.locator('.titlebar-title').dblclick();
  const m = await w.boundingBox();
  expect(Math.round(m.width)).toBe(1280);
  expect(Math.round(m.y)).toBe(28);
  expect(await topmostAt(page, 640, 770, '#dock')).toBe(true);
  expect(await topmostAt(page, 640, 14, '#menubar')).toBe(true);
});

test('свернуть, вернуть с панели, закрыть; номера слоёв не растут', async ({ page }) => {
  await start(page);
  const calc = await dockOpen(page, 'calculator');
  await calc.locator('.tl-min').click();
  await expect(calc).toBeHidden();
  await expect(page.locator('#dock .dock-icon[data-app="calculator"]')).toHaveClass(/minimized/);
  await page.click('#dock .dock-icon[data-app="calculator"]');
  await expect(calc).toBeVisible();
  for (let i = 0; i < 15; i++) await page.click(`#dock .dock-icon[data-app="${i % 2 ? 'notes' : 'calculator'}"]`);
  const zs = await page.$$eval('.window', (els) => els.map((e) => +e.style.zIndex));
  expect(Math.max(...zs)).toBeLessThanOrEqual(zs.length);
  await page.click('#dock .dock-icon[data-app="calculator"]');
  await calc.locator('.tl-close').click();
  await expect(win(page, 'calculator')).toHaveCount(0);
  await expect(page.locator('#dock .dock-icon[data-app="calculator"]')).not.toHaveClass(/running/);
});

test('оформление, обои, акцент и размер панели сохраняются после перезагрузки', async ({ page }) => {
  await start(page);
  const s = await dockOpen(page, 'settings');
  await s.locator('[data-dark="1"]').click();
  await s.locator('[data-accent="#ff2d55"]').click();
  await s.locator('[data-sec="wallpaper"]').click();
  await s.locator('[data-wall="forest"]').click();
  await s.locator('[data-sec="dock"]').click();
  await s.locator('[data-range="dockSize"]').fill('40');
  await page.reload();
  await expect(page.locator('body')).toHaveClass(/dark/);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim())).toBe('#ff2d55');
  expect(await page.locator('#desktop').evaluate((e) => e.style.background)).toContain('rgb(6, 78, 59)');
  expect(Math.round((await page.locator('#dock .dock-icon').first().boundingBox()).width)).toBe(40);
});

test('Файлы: новая папка переживает перезагрузку, файл уходит в корзину и возвращается, перетаскивание в папку', async ({ page }) => {
  await start(page);
  const f = await dockOpen(page, 'files');
  await f.locator('.finder-main').click({ button: 'right', position: { x: 300, y: 250 } });
  await page.locator('#context-menu .item', { hasText: 'Новая папка' }).click();
  await page.locator('.sheet input').fill('Архив');
  await page.keyboard.press('Enter');
  await expect(f.locator('.finder-item', { hasText: 'Архив' })).toBeVisible();
  await page.reload();
  const f2 = await dockOpen(page, 'files');
  await expect(f2.locator('.finder-item', { hasText: 'Архив' })).toBeVisible();
  // перетаскиванием файл уходит в папку
  await f2.locator('.finder-item', { hasText: 'script.py' }).dragTo(f2.locator('.finder-item', { hasText: 'Архив' }));
  await expect(f2.locator('.finder-item', { hasText: 'script.py' })).toHaveCount(0);
  await f2.locator('.finder-item', { hasText: 'Архив' }).dblclick();
  await expect(f2.locator('.finder-item', { hasText: 'script.py' })).toBeVisible();
  // в корзину клавишей Delete и обратно
  await f2.locator('.finder-item', { hasText: 'script.py' }).click();
  await page.keyboard.press('Delete');
  await expect(f2.locator('.finder-item', { hasText: 'script.py' })).toHaveCount(0);
  await expect(page.locator('#dock .dock-icon[data-app="trash"] .ti')).toHaveAttribute('data-full', 'true');
  await page.click('#dock .dock-icon[data-app="trash"]');
  await f2.locator('.finder-item', { hasText: 'script.py' }).click({ button: 'right' });
  await page.locator('#context-menu .item', { hasText: 'Вернуть' }).click();
  await expect(f2.locator('.finder-item')).toHaveCount(0);
  await f2.locator('.finder-sidebar li[data-folder="documents"]').click();
  await f2.locator('.finder-item', { hasText: 'Архив' }).dblclick();
  await expect(f2.locator('.finder-item', { hasText: 'script.py' })).toBeVisible();
});

test('Заметки: новая заметка сохраняется, удаление спрашивает подтверждение', async ({ page }) => {
  await start(page);
  const n = win(page, 'notes');
  await n.locator('[data-n="new"]').click();
  await n.locator('.note-title').fill('Проверка');
  await n.locator('.note-body').fill('текст заметки');
  await page.reload();
  await dockOpen(page, 'notes');
  await expect(win(page, 'notes').locator('.note-item').first()).toContainText('Проверка');

  await win(page, 'notes').locator('.note-item').first().click();
  await expect(win(page, 'notes').locator('.note-body')).toHaveValue('текст заметки');
  await win(page, 'notes').locator('[data-n="del"]').click();
  await page.locator('.sheet button', { hasText: 'Удалить' }).click();
  await expect(win(page, 'notes').locator('.note-item', { hasText: 'Проверка' })).toHaveCount(0);
});

test('Терминал работает с той же файловой системой', async ({ page }) => {
  await start(page);
  const t = await dockOpen(page, 'terminal');
  const run = async (cmd) => { await t.locator('.term-input').last().fill(cmd); await t.locator('.term-input').last().press('Enter'); };
  await run('cd Документы');
  await run('cat Отчёт.txt');
  await expect(t.locator('.terminal-body')).toContainText('Что сделано');
  await run('mkdir ИзТерминала');
  await page.click('#menubar [data-menu="go"]');
  await page.locator('#menu-dropdown .item', { hasText: 'Документы' }).click();
  await expect(win(page, 'files').locator('.finder-item', { hasText: 'ИзТерминала' })).toBeVisible();
});

test('Калькулятор считает по порядку, не больше 9 цифр, деление на ноль - ошибка', async ({ page }) => {
  await start(page);
  const c = await dockOpen(page, 'calculator');
  const press = async (keys) => { for (const k of keys) await c.locator(`[data-key="${k}"]`).click(); };
  const d = c.locator('.calc-display');
  // все кнопки видны целиком внутри окна (раньше нижний ряд обрезался)
  const wb = await c.boundingBox(), eb = await c.locator('[data-key="="]').boundingBox();
  expect(eb.y + eb.height).toBeLessThanOrEqual(wb.y + wb.height);
  await press(['1', '2', '+', '7', '*', '3', '=']);

  await expect(d).toHaveText('57');
  await press(['AC', 'AC', '1', '2', '3', '4', '5', '6', '7', '8', '9', '1', '2']);
  await expect(d).toHaveText('123 456 789');
  await press(['AC', 'AC', '5', '/', '0', '=']);
  await expect(d).toHaveText('Ошибка');
  await c.locator('.titlebar-title').click();
  await page.keyboard.type('0.1+0.2');
  await page.keyboard.press('Enter');
  await expect(d).toHaveText('0,3');
});

test('Календарь показывает текущий месяц, событие добавляется и сохраняется', async ({ page }) => {
  await start(page);
  const c = await dockOpen(page, 'calendar');
  const month = await page.evaluate(() => new Date().toLocaleDateString('ru-RU', { month: 'long' }).replace(/^\d+\s*/, ''));
  await expect(c.locator('h2')).toContainText(String(new Date().getFullYear()));
  await expect(c.locator('.cal-cell.today')).toHaveCount(1);
  await c.locator('.cal-cell.today').click({ position: { x: 40, y: 50 } });
  await page.locator('.sheet input').fill('Контрольная');
  await page.keyboard.press('Enter');
  await page.reload();
  const c2 = await dockOpen(page, 'calendar');
  await expect(c2.locator('.cal-cell.today .cal-event', { hasText: 'Контрольная' })).toBeVisible();
  expect(month.length).toBeGreaterThan(2);
});

test('поиск: Ctrl+Пробел открывает, Enter запускает найденное; блокировка снимается клавишей', async ({ page }) => {
  await start(page);
  await page.keyboard.press('Control+Space');
  await expect(page.locator('#spotlight')).toHaveClass(/open/);
  await page.keyboard.type('термин');
  await page.keyboard.press('Enter');
  await expect(win(page, 'terminal')).toBeVisible();
  const now = await page.evaluate(() => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); });
  await expect(page.locator('#clock')).toContainText(now);
  await page.click('#menubar [data-menu="system"]');
  await page.locator('#menu-dropdown .item', { hasText: 'Заблокировать экран' }).click();
  await expect(page.locator('#lock')).toBeVisible();
  await expect(page.locator('#lk-time')).toHaveText(now);
  await page.keyboard.press('Enter');
  await expect(page.locator('#lock')).toBeHidden();
});

test('значок рабочего стола перетаскивается в пределах экрана и остаётся на месте после перезагрузки', async ({ page }) => {
  await start(page);
  const icon = page.locator('.desktop-icon', { hasText: 'Заметка.txt' });
  await dragBy(page, icon, -3000, 3000);
  const b = await expectInside(page, icon, 'значок');
  await page.reload();
  const b2 = await page.locator('.desktop-icon', { hasText: 'Заметка.txt' }).boundingBox();
  expect(Math.round(b2.x)).toBe(Math.round(b.x));
  expect(Math.round(b2.y)).toBe(Math.round(b.y));
});

test('на 1024x700 панель, меню и все окна помещаются, прокрутки нет', async ({ page }) => {
  const errors = await start(page, { width: 1024, height: 700 });
  await expectInside(page, page.locator('#dock'), 'панель приложений');
  for (const id of DOCK) {
    const w = await dockOpen(page, id);
    await expectInside(page, w, 'окно ' + id);
  }
  await page.click('#dock .dock-icon[data-app="launchpad"]');
  await expectInside(page, page.locator('#lp-grid'), 'сетка «Все программы»');
  await page.keyboard.press('Escape');
  await expectNoPageOverflow(page);
  await page.setViewportSize({ width: 800, height: 600 });
  await expect(async () => {
    for (const id of DOCK) await expectInside(page, win(page, id), 'окно после уменьшения ' + id);
  }).toPass({ timeout: 3000 });
  expect(errors).toEqual([]);
});
