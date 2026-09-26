// Законы win11_3 (объединённая Windows-подобная оболочка): окна ведут себя как окна (тащатся, прикрепляются,
// не уходят под панель задач), каждое приложение открывается и делает главное дело, файлы живут в IndexedDB
// и переживают перезагрузку, настройки применяются ко всей системе, вкладка в фоне ставит звук и анимации на паузу.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { WEB } = require('../helpers');
const { openOs, expectInside, dragFrom, dragBy, expectNoPageOverflow, topmostAt, expectNoBrandGlyphs } = require('./_os-helpers');

const NAME = 'win11_3';
const BUILT_IN = ['explorer', 'browser', 'notepad', 'calc', 'photos', 'media', 'settings', 'terminal', 'clock', 'weather', 'recycle'];
const FRAMED = ['paint', 'messenger'];
const TB = 48; // высота панели задач

async function boot(page, size) {
  const errors = await openOs(page, NAME, size);
  await page.waitForFunction(() => document.body.dataset.ready === '1');
  return errors;
}
async function reload(page) {
  await page.waitForFunction(() => dbPending === 0);
  await page.reload();
  await page.waitForFunction(() => document.body.dataset.ready === '1');
}
const win = (page, id) => page.locator(`.window[data-app="${id}"]`).last();
async function ready(w) { await expect(w).toBeVisible(); await expect(w).not.toHaveClass(/opening/); return w; }
async function startApp(page, id) {
  await page.click('#btn-start');
  await expect(page.locator('#start')).toHaveClass(/open/);
  await page.click('#start [data-start="all"]');
  await page.click(`#start [data-open-app="${id}"]`);
  return ready(win(page, id));
}
async function openVia(page, id, arg) { await page.evaluate(([i, a]) => { openApp(i, a); }, [id, arg]); return ready(win(page, id)); }
async function term(page, cmd) { await page.keyboard.type(cmd); await page.keyboard.press('Enter'); }
const hhmm = (page) => page.evaluate(() => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); });

test('пометка фан-концепта, без личных данных, чужих знаков, сети и alert', async ({ page }) => {
  const errors = await boot(page);
  await expect(page).toHaveTitle(/фан-концепт интерфейса, не связан с Microsoft\/Apple\/Samsung/);
  await expectNoBrandGlyphs(page);
  const src = ['index.html', 'src/core.js', 'src/apps.js', 'src/markup.html'].map((f) => fs.readFileSync(path.join(WEB, NAME, f), 'utf8')).join('\n');
  expect(src).not.toMatch(/\balert\(|\bconfirm\(|window\.prompt\(|Алексей|@gmail|192\.168\./);
  expect(src).not.toMatch(/(src|href)\s*=\s*["']https?:/);
  // собранная страница совпадает с исходниками (правка без сборки не проскочит)
  const built = fs.readFileSync(path.join(WEB, NAME, 'index.html'), 'utf8');
  for (const f of ['core.js', 'apps.js', 'style.css']) expect(built.includes(fs.readFileSync(path.join(WEB, NAME, 'src', f), 'utf8')), f + ' не собран в index.html').toBe(true);
  const s = await openVia(page, 'settings', 'about');
  await expect(s).toContainText('не связан с Microsoft/Apple/Samsung');
  expect(errors).toEqual([]);
});

test('Пуск и поиск: щелчок, Esc, щелчок по столу; поиск находит приложение, параметр и файл', async ({ page }) => {
  await boot(page);
  const start = page.locator('#start');
  await page.click('#btn-start');
  await expect(start).toHaveClass(/open/);
  await page.click('#btn-start');
  await expect(start).not.toHaveClass(/open/);
  await page.click('#btn-start');
  await page.keyboard.press('Escape');
  await expect(start).not.toHaveClass(/open/);
  await page.click('#btn-start');
  await page.mouse.click(700, 300);
  await expect(start).not.toHaveClass(/open/);
  await page.click('#btn-start');
  await page.keyboard.type('отч');
  await expect(start.locator('[data-open-file="Документы/Отчёт.txt"]')).toBeVisible();
  await page.fill('#start-q', 'персон');
  await expect(start.locator('[data-open-settings="personal"]')).toBeVisible();
  await page.fill('#start-q', 'кальк');
  await page.keyboard.press('Enter');
  await ready(win(page, 'calc'));
  await expect(start).not.toHaveClass(/open/);
  await page.click('#btn-search');
  await page.keyboard.type('терм');
  await page.keyboard.press('Enter');
  await ready(win(page, 'terminal'));
});

test('каждое встроенное приложение открывается из «Всех приложений» со значком на панели и закрывается', async ({ page }) => {
  const errors = await boot(page);
  for (const id of BUILT_IN) {
    const w = await startApp(page, id);
    await expectInside(page, w, id);
    await expect(page.locator(`#tb-apps .tb-btn[data-app="${id}"]`)).toHaveClass(/running/);
    await expect(page.locator(`#tb-apps .tb-btn[data-app="${id}"]`)).toHaveClass(/active/);
    await w.locator('[data-cap=close]').click();
    await expect(page.locator(`.window[data-app="${id}"]`)).toHaveCount(0);
    const pinned = await page.evaluate((i) => PINNED.includes(i), id);
    await expect(page.locator(`#tb-apps .tb-btn[data-app="${id}"]`)).toHaveCount(pinned ? 1 : 0);
  }
  expect(errors).toEqual([]);
});

test('Paint и Мессенджер открываются рамкой из папки apps/ без ошибок', async ({ page }) => {
  const errors = await boot(page);
  for (const id of FRAMED) {
    const w = await startApp(page, id);
    const src = await w.locator('iframe').getAttribute('src');
    expect(fs.existsSync(path.join(WEB, NAME, src)), src).toBe(true);
    await expect(w.frameLocator('iframe').locator('body')).not.toBeEmpty();
    await w.locator('[data-cap=close]').click();
    await expect(page.locator(`.window[data-app="${id}"]`)).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test('окно тащится, не уходит за край и под панель задач; у края прикрепляется и отрывается обратно', async ({ page }) => {
  await boot(page);
  const w = await openVia(page, 'notepad');
  const t = w.locator('.t-text');
  // тащим к правому нижнему углу, не касаясь края экрана курсором (у края окно прикрепилось бы)
  let tb0 = await t.boundingBox();
  await dragFrom(page, tb0.x + 10, tb0.y + 8, 1200 - tb0.x, 740 - tb0.y);
  let b = await w.boundingBox();
  expect(b.x + b.width).toBeLessThanOrEqual(1281);
  expect(b.y + b.height).toBeLessThanOrEqual(800 - TB + 1);
  await expect(w).not.toHaveClass(/snapped/);
  tb0 = await t.boundingBox();
  await dragFrom(page, tb0.x + 10, tb0.y + 8, 60 - tb0.x, 40 - tb0.y);
  b = await w.boundingBox();
  expect(b.x).toBeGreaterThanOrEqual(-1);
  expect(b.y).toBeGreaterThanOrEqual(-1);
  const width = b.width;
  // к левому краю - левая половина экрана
  const tb = await t.boundingBox();
  await page.mouse.move(tb.x + 20, tb.y + 8);
  await page.mouse.down();
  await page.mouse.move(300, 300, { steps: 4 });
  await page.mouse.move(1, 300, { steps: 4 });
  await expect(page.locator('#snap-preview')).toHaveClass(/on/);
  await page.mouse.up();
  await expect(page.locator('#snap-preview')).not.toHaveClass(/on/);
  b = await w.boundingBox();
  expect(Math.round(b.x)).toBe(0);
  expect(Math.round(b.width)).toBe(640);
  expect(Math.round(b.height)).toBe(800 - TB);
  // оторвать от края - прежний размер
  await dragBy(page, w.locator('.t-text'), 300, 100);
  b = await w.boundingBox();
  expect(Math.round(b.width)).toBe(Math.round(width));
  // к верхнему краю - развернуть
  const tb2 = await w.locator('.t-text').boundingBox();
  await dragFrom(page, tb2.x + 10, tb2.y + 8, 0, -tb2.y - 8);
  await expect(w).toHaveClass(/maxed/);
});

test('макеты прикрепления у «Развернуть», двойной щелчок разворачивает, размер за угол не меньше минимума', async ({ page }) => {
  await boot(page);
  const w = await openVia(page, 'explorer', 'Документы');
  await w.locator('[data-cap=max]').hover();
  await expect(page.locator('#snap-flyout')).toHaveClass(/open/);
  await expectInside(page, page.locator('#snap-flyout'), 'макеты');
  await page.click('#snap-flyout [data-zone="c3"]');
  let b = await w.boundingBox();
  expect(Math.round(b.x)).toBe(853);
  expect(Math.round(b.width)).toBe(427);
  await w.locator('.t-text').dblclick();
  await expect(w).toHaveClass(/maxed/);
  b = await w.boundingBox();
  expect([Math.round(b.width), Math.round(b.height)]).toEqual([1280, 800 - TB]);
  await w.locator('.t-text').dblclick();
  await expect(w).not.toHaveClass(/maxed/);
  await w.locator('.t-text').dblclick();
  await w.locator('.t-text').dblclick();
  const se = await w.locator('.rz-se').boundingBox();
  await dragFrom(page, se.x + 4, se.y + 4, -2000, -2000);
  b = await w.boundingBox();
  expect(b.width).toBeGreaterThanOrEqual(459);
  expect(b.height).toBeGreaterThanOrEqual(319);
});

test('свернуть и вернуть через панель задач; закрытое окно уходит с панели; панель и Пуск выше окон', async ({ page }) => {
  await boot(page);
  const n = await openVia(page, 'notepad');
  const c = await openVia(page, 'calc');
  await c.locator('[data-cap=min]').click();
  await expect(c).toHaveClass(/minimized/);
  await page.click('#tb-apps .tb-btn[data-app="calc"]');
  await expect(c).not.toHaveClass(/minimized/);
  await expect(c).not.toHaveClass(/inactive/);
  // щелчок по значку активного окна сворачивает его
  await page.click('#tb-apps .tb-btn[data-app="calc"]');
  await expect(c).toHaveClass(/minimized/);
  await page.click('#tb-apps .tb-btn[data-app="calc"]');
  // щелчок по окну снизу поднимает его
  const nb = await n.boundingBox();
  await page.mouse.click(nb.x + 30, nb.y + nb.height - 60);
  await expect(n).not.toHaveClass(/inactive/);
  await expect(c).toHaveClass(/inactive/);
  // развёрнутое окно не заходит под панель задач, а Пуск - поверх окна
  await n.locator('[data-cap=max]').click();
  expect(await topmostAt(page, 640, 800 - 20, '#taskbar')).toBe(true);
  await page.click('#btn-start');
  expect(await topmostAt(page, 640, 400, '#start')).toBe(true);
  await page.keyboard.press('Escape');
  // окно под развёрнутым закрывается из меню значка на панели
  await page.click('#tb-apps .tb-btn[data-app="calc"]', { button: 'right' });
  await page.locator('.menu.ctx .mi', { hasText: 'Закрыть окно' }).click();
  await expect(page.locator('#tb-apps .tb-btn[data-app="calc"]')).toHaveCount(0);
  // «Свернуть все» у часов прячет и возвращает окна
  await page.click('#show-desktop');
  await expect(n).toHaveClass(/minimized/);
  await page.click('#show-desktop');
  await expect(n).not.toHaveClass(/minimized/);
});

test('представление задач: живые миниатюры всех окон, щелчок поднимает окно, крестик закрывает', async ({ page }) => {
  await boot(page);
  const a = await openVia(page, 'explorer', 'Документы');
  await openVia(page, 'clock');
  await page.click('#btn-tv');
  await expect(page.locator('#taskview')).toHaveClass(/open/);
  await expect(page.locator('.tv-card')).toHaveCount(2);
  await expect(page.locator('.tv-card').last().locator('.tv-clone')).toContainText('Документы');
  await page.locator('.tv-card').last().click();
  await expect(page.locator('#taskview')).not.toHaveClass(/open/);
  await expect(a).not.toHaveClass(/inactive/);
  await page.click('#btn-tv');
  await page.locator('.tv-card').first().locator('[data-tvx]').click();
  await expect(page.locator('.tv-card')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('#taskview')).not.toHaveClass(/open/);
});

test('файлы в IndexedDB: новая папка и сохранённый Блокнотом файл переживают перезагрузку', async ({ page }) => {
  await boot(page);
  await page.locator('.dicon[data-sys="pc"]').dblclick();
  const ex = await ready(win(page, 'explorer'));
  await ex.locator('[data-p="Документы"]').dblclick();
  await ex.locator('[data-x="new"]').click();
  await page.locator('.menu.ctx .mi', { hasText: 'Папку' }).click();
  await ex.locator('[data-ren]').fill('Архив');
  await ex.locator('[data-ren]').press('Enter');
  await expect(ex.locator('[data-p="Документы/Архив"]')).toBeVisible();
  const np = await startApp(page, 'notepad');
  await np.locator('textarea').fill('строка один\nстрока два');
  await expect(np.locator('.t-text')).toContainText('●');
  await page.keyboard.press('Control+s');
  await np.locator('.win-dialog input').fill('итог');
  await np.locator('.win-dialog .btn', { hasText: 'Сохранить' }).click();
  await expect(np.locator('.t-text')).toHaveText('итог.txt - Блокнот');
  // Проводник видит новый файл сразу
  await expect(ex.locator('[data-p="Документы/итог.txt"]')).toBeVisible();
  await reload(page);
  const fsState = await page.evaluate(() => ({ dir: FS.get('Документы/Архив') && FS.get('Документы/Архив').type, text: FS.get('Документы/итог.txt') && FS.get('Документы/итог.txt').text }));
  expect(fsState).toEqual({ dir: 'dir', text: 'строка один\nстрока два' });
  const ex2 = await openVia(page, 'explorer', 'Документы');
  await ex2.locator('[data-p="Документы/итог.txt"]').dblclick();
  await expect(win(page, 'notepad').locator('textarea')).toHaveValue('строка один\nстрока два');
});

test('удаление идёт в Корзину, оттуда возвращается; очистка корзины переживает перезагрузку', async ({ page }) => {
  await boot(page);
  const ex = await openVia(page, 'explorer', 'Документы');
  await ex.locator('[data-p="Документы/Отчёт.txt"]').click();
  await page.keyboard.press('Delete');
  await expect(ex.locator('[data-p="Документы/Отчёт.txt"]')).toHaveCount(0);
  await expect(page.locator('.dicon[data-sys="recycle"] svg')).toHaveCount(1);
  await ex.locator('[data-recycle]').click();
  const rb = await ready(win(page, 'recycle'));
  await expect(rb).toContainText('Отчёт.txt');
  await rb.locator('[data-restore]').click();
  await expect(rb).toContainText('Корзина пуста');
  await expect(ex.locator('[data-p="Документы/Отчёт.txt"]')).toBeVisible();
  // папка уходит целиком
  await page.click('#tb-apps .tb-btn[data-app="explorer"]');
  await ex.locator('[data-p="Документы/Проекты"]').click({ button: 'right' });
  await page.locator('.menu.ctx [aria-label="Удалить"]').click();
  await expect(rb).toContainText('Проекты');
  expect(await page.evaluate(() => FS.has('Документы/Проекты/план.txt'))).toBe(false);
  await reload(page);
  const rb2 = await openVia(page, 'recycle');
  await expect(rb2).toContainText('Проекты');
  await rb2.locator('[data-r="empty"]').click();
  await rb2.locator('.win-dialog .btn', { hasText: 'Да' }).click();
  await expect(rb2).toContainText('Корзина пуста');
  await reload(page);
  expect(await page.evaluate(() => TRASH.length)).toBe(0);
});

test('Проводник: перетаскивание в папку, вырезать-вставить, переименование F2, импорт и файлы с диска', async ({ page }) => {
  await boot(page);
  const ex = await openVia(page, 'explorer', 'Документы');
  await ex.locator('[data-p="Документы/Отчёт.txt"]').dragTo(ex.locator('[data-p="Документы/Учёба"]'));
  await expect(ex.locator('[data-p="Документы/Отчёт.txt"]')).toHaveCount(0);
  expect(await page.evaluate(() => FS.has('Документы/Учёба/Отчёт.txt'))).toBe(true);
  await ex.locator('[data-p="Документы/Проекты"]').dblclick();
  await ex.locator('[data-p="Документы/Проекты/план.txt"]').click();
  await page.keyboard.press('Control+x');
  await page.keyboard.press('Backspace');
  await expect(ex.locator('.crumbs')).toHaveText(/Документы$/);
  await page.keyboard.press('Control+v');
  await expect(ex.locator('[data-p="Документы/план.txt"]')).toBeVisible();
  await ex.locator('[data-p="Документы/план.txt"]').click();
  await page.keyboard.press('F2');
  await ex.locator('[data-ren]').fill('план/плохо');
  await ex.locator('[data-ren]').press('Enter');
  await expect(page.locator('.toast').last()).toContainText('не должно содержать');
  await ex.locator('[data-p="Документы/план.txt"]').click();
  await page.keyboard.press('F2');
  await ex.locator('[data-ren]').fill('план-2.txt');
  await ex.locator('[data-ren]').press('Enter');
  await expect(ex.locator('[data-p="Документы/план-2.txt"]')).toBeVisible();
  // импорт кнопкой
  await ex.locator('.ex-file').setInputFiles({ name: 'заметка.txt', mimeType: 'text/plain', buffer: Buffer.from('с диска') });
  await expect(ex.locator('[data-p="Документы/заметка.txt"]')).toBeVisible();
  // файл, брошенный из системы на окно
  await ex.locator('.ex-main').evaluate((el) => {
    const dt = new DataTransfer();
    dt.items.add(new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], 'брошено.svg', { type: 'image/svg+xml' }));
    el.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
    el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  await expect(ex.locator('[data-p="Документы/брошено.svg"]')).toBeVisible();
  await expect(ex.locator('[data-p="Документы/брошено.svg"] img')).toHaveCount(1);
  // область просмотра показывает текст
  await ex.locator('[data-x="prev"]').click();
  await ex.locator('[data-p="Документы/заметка.txt"]').click();
  await expect(ex.locator('.preview-pane pre')).toHaveText('с диска');
});

test('Блокнот спрашивает о несохранённом: «Отмена» оставляет окно, «Не сохранять» закрывает', async ({ page }) => {
  await boot(page);
  const np = await openVia(page, 'notepad');
  await np.locator('textarea').fill('черновик');
  await np.locator('[data-cap=close]').click();
  await expect(np.locator('.win-dialog')).toContainText('Сохранить изменения');
  await np.locator('.win-dialog .btn', { hasText: 'Отмена' }).click();
  await expect(np).toBeVisible();
  await np.locator('[data-cap=close]').click();
  await np.locator('.win-dialog .btn', { hasText: 'Не сохранять' }).click();
  await expect(page.locator('.window[data-app="notepad"]')).toHaveCount(0);
});

test('калькулятор: порядок действий, 0,1+0,2, деление на ноль, память и клавиатура', async ({ page }) => {
  await boot(page);
  const c = await openVia(page, 'calc');
  const d = c.locator('.calc-disp');
  for (const k of ['2', '+', '3', '*', '4', '=']) await c.locator(`[data-k="${k}"]`).click();
  await expect(d).toHaveText('20');
  await page.keyboard.type('0.1+0.2');
  await page.keyboard.press('Enter');
  await expect(d).toHaveText('0,3');
  await page.keyboard.press('Escape');
  await page.keyboard.type('1..5');
  await expect(d).toHaveText('1,5');
  await page.keyboard.press('Escape');
  await page.keyboard.type('1/0');
  await page.keyboard.press('Enter');
  await expect(d).toHaveText('Деление на ноль невозможно');
  await page.keyboard.press('Escape');
  await page.keyboard.type('1234567');
  await expect(d).toHaveText('1 234 567');
  await c.locator('[data-m="MS"]').click();
  await page.keyboard.press('Escape');
  await c.locator('[data-m="MR"]').click();
  await expect(d).toHaveText('1 234 567');
  await c.locator('[data-k="sqrt"]').click();
  await c.locator('[data-k="c"]').click();
  await c.locator('[data-k="9"]').click();
  await c.locator('[data-k="sqrt"]').click();
  await expect(d).toHaveText('3');
});

test('настройки применяются ко всей системе и переживают перезагрузку', async ({ page }) => {
  await boot(page);
  const s = await openVia(page, 'settings', 'personal');
  await s.locator('[data-theme-set="light"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-theme', 'light');
  await s.locator('[data-accent="4"]').click();
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim())).toBe('#c30052');
  await s.locator('[data-wall="waves"]').click();
  const wall = await page.locator('#wallpaper').evaluate((e) => e.style.backgroundImage);
  expect(decodeURIComponent(wall)).toContain('#e0f7fa');
  await s.locator('[data-tog="transparency"]').click();
  await expect(page.locator('body')).toHaveClass(/no-transparency/);
  expect(await s.evaluate((e) => getComputedStyle(e).backdropFilter)).toBe('none');
  await s.locator('[data-page="time"]').click();
  await s.locator('[data-tog="time24"]').click();
  await s.locator('[data-tog="dateLong"]').click();
  await expect(page.locator('#tb-time')).toHaveText(/(AM|PM)$/);
  await expect(page.locator('#tb-date')).toHaveText(/^\d+ [а-я]+ \d{4}$/);
  // быстрые настройки и параметры - одно и то же
  await s.locator('[data-page="network"]').click();
  await page.click('#btn-tray');
  await page.click('[data-qs="airplane"]');
  await expect(s.locator('[data-tog="wifi"]')).toHaveAttribute('aria-checked', 'false');
  await expect(s.locator('[data-tog="airplane"]')).toHaveAttribute('aria-checked', 'true');
  await page.locator('#qs-bright').fill('40');
  expect(+(await page.locator('#dim').evaluate((e) => e.style.opacity))).toBeGreaterThan(0.3);
  await reload(page);
  await expect(page.locator('body')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('body')).toHaveClass(/no-transparency/);
  await expect(page.locator('#tb-time')).toHaveText(/(AM|PM)$/);
  expect(decodeURIComponent(await page.locator('#wallpaper').evaluate((e) => e.style.backgroundImage))).toContain('#e0f7fa');
  expect(await page.evaluate(() => S.airplane && !S.wifi && S.brightness === 40)).toBe(true);
});

test('Терминал: команды над той же файловой системой, Проводник видит изменения сразу', async ({ page }) => {
  await boot(page);
  const ex = await openVia(page, 'explorer', 'Документы');
  const t = await startApp(page, 'terminal');
  const out = t.locator('.term-out');
  await term(page, 'cd Документы');
  await term(page, 'mkdir Черновики');
  await expect(ex.locator('[data-p="Документы/Черновики"]')).toBeVisible();
  await term(page, 'echo привет > z.txt');
  await term(page, 'type z.txt');
  await expect(out).toContainText(/type z\.txt\s*привет/);
  await term(page, 'ren z.txt итог.txt');
  await term(page, 'copy итог.txt Черновики');
  await term(page, 'dir');
  await expect(out).toContainText('итог.txt');
  expect(await page.evaluate(() => FS.get('Документы/Черновики/итог.txt').text)).toBe('привет');
  await term(page, 'del итог.txt');
  await expect(out).toContainText('Перемещено в корзину: итог.txt');
  await term(page, 'cd ..');
  await term(page, 'tree');
  await expect(out).toContainText('└───Черновики');
  await term(page, 'абв');
  await expect(t.locator('.term-out .err').last()).toContainText('не является внутренней или внешней командой');
  await term(page, 'start notepad');
  await ready(win(page, 'notepad'));
  await page.click('#tb-apps .tb-btn[data-app="terminal"]');
  await t.locator('.term-out').click({ position: { x: 20, y: 20 } });
  await term(page, 'exit');
  await expect(page.locator('.window[data-app="terminal"]')).toHaveCount(0);
});

test('уведомления: всплывают, копятся у часов, очищаются; «Фокусировка» прячет всплывание', async ({ page }) => {
  await boot(page);
  const ph = await openVia(page, 'photos');
  await ph.locator('[data-view="wall:glow"]').click();
  await ph.locator('[data-ph="wall"]').click();
  await expect(page.locator('.toast')).toContainText('Фон изменён');
  await expect(page.locator('#tb-bell .badge')).toHaveText('1');
  expect(await page.evaluate(() => S.wallpaper)).toBe('glow');
  await page.click('#btn-clock');
  await expect(page.locator('#notif-center')).toHaveClass(/open/);
  await expect(page.locator('#nc-list .nc-item')).toHaveCount(1);
  await expect(page.locator('#cal-grid .today')).toHaveText(String(new Date().getDate()));
  await page.click('#nc-focus');
  await page.click('#nc-clear');
  await expect(page.locator('#nc-list')).toContainText('Нет новых уведомлений');
  await expect(page.locator('#tb-bell .badge')).toBeHidden();
  await page.keyboard.press('Escape');
  await page.locator('.toast').first().waitFor({ state: 'detached' }).catch(() => {});
  const toasts = await page.locator('.toast').count();
  await ph.locator('[data-ph="wall"]').click();
  await expect(page.locator('#tb-bell .badge')).toHaveText('1');
  expect(await page.locator('.toast').count()).toBeLessThanOrEqual(toasts);
});

test('Фотографии показывают картинки из файлов; удаление уходит в корзину', async ({ page }) => {
  await boot(page);
  const ph = await openVia(page, 'photos');
  await expect(ph.locator('[data-view^="Изображения/"]')).toHaveCount(4);
  await ph.locator('.ph-in').setInputFiles({ name: 'кадр.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="red"/></svg>') });
  await expect(ph.locator('[data-view="Изображения/кадр.svg"]')).toBeVisible();
  await ph.locator('[data-view="Изображения/кадр.svg"]').click();
  await expect(ph.locator('.pv-bar')).toContainText('кадр.svg');
  await page.keyboard.press('ArrowRight');
  await expect(ph.locator('.pv-bar')).not.toContainText('кадр.svg');
  await page.keyboard.press('ArrowLeft');
  await ph.locator('[data-ph="del"]').click();
  await expect(ph.locator('[data-view="Изображения/кадр.svg"]')).toHaveCount(0);
  expect(await page.evaluate(() => TRASH.some((t) => t.path === 'Изображения/кадр.svg'))).toBe(true);
});

test('Браузер: вкладки, встроенные страницы, внешний адрес - честное «нет подключения» без запросов в сеть', async ({ page }) => {
  const requests = [];
  page.on('request', (r) => { if (/^https?:/.test(r.url())) requests.push(r.url()); });
  await boot(page);
  const b = await openVia(page, 'browser');
  await b.locator('.b-tile', { hasText: 'Справка' }).click();
  await expect(b.locator('.b-page h1')).toHaveText('Справка');
  await b.locator('[data-url] input').fill('example.com');
  await b.locator('[data-url] input').press('Enter');
  await expect(b.locator('.b-page')).toContainText('Нет подключения к Интернету');
  await b.locator('[data-b="back"]').click();
  await expect(b.locator('.b-page h1')).toHaveText('Справка');
  await b.locator('[data-newtab]').click();
  await expect(b.locator('.b-tab')).toHaveCount(2);
  await b.locator('.b-tab').first().locator('[data-tx]').click();
  await expect(b.locator('.b-tab')).toHaveCount(1);
  expect(requests).toEqual([]);
});

test('Медиаплеер играет, громкость общая с панелью; скрытая вкладка ставит звук и анимации на паузу', async ({ page }) => {
  await boot(page);
  const m = await openVia(page, 'media');
  await m.locator('[data-tr="2"]').click();
  await expect(m.locator('[data-p="play"]')).toHaveAttribute('aria-label', 'Пауза');
  await expect(m.locator('.mb-info b')).toHaveText('Северный ветер');
  await m.locator('[data-p="next"]').click();
  await expect(m.locator('.mb-info b')).toHaveText('Городские огни');
  await m.locator('[data-vol]').fill('25');
  expect(await page.evaluate(() => S.volume)).toBe(25);
  const setHidden = (h) => page.evaluate((v) => { Object.defineProperty(document, 'hidden', { value: v, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }, h);
  await setHidden(true);
  await expect(page.locator('body')).toHaveClass(/paused/);
  await expect(m.locator('[data-p="play"]')).toHaveAttribute('aria-label', 'Играть');
  expect(await page.evaluate(() => player.playing)).toBe(false);
  await setHidden(false);
  await expect(page.locator('body')).not.toHaveClass(/paused/);
  await expect(m.locator('[data-p="play"]')).toHaveAttribute('aria-label', 'Пауза');
});

test('Часы: будильник сохраняется, таймер и секундомер идут, мировое время по поясам; погода помечена как демо', async ({ page }) => {
  await boot(page);
  let c = await openVia(page, 'clock', 'alarm');
  await c.locator('input[name=t]').fill('06:15');
  await c.locator('input[name=label]').fill('Бег');
  await c.locator('[data-addalarm] button').click();
  await expect(c.locator('.a-card', { hasText: 'Бег' })).toBeVisible();
  await c.locator('[data-tab="timer"]').click();
  await c.locator('[data-preset="1"]').click();
  await c.locator('[data-t="go"]').click();
  await page.waitForTimeout(1300);
  await expect(c.locator('[data-tval]')).toHaveText(/00:00:5\d/);
  await c.locator('[data-tab="stop"]').click();
  await c.locator('[data-s="go"]').click();
  await page.waitForTimeout(200);
  await c.locator('[data-s="lap"]').click();
  await expect(c.locator('.laps div')).toHaveCount(1);
  await c.locator('[data-tab="world"]').click();
  const tokyo = await page.evaluate(() => new Date().toLocaleTimeString('ru-RU', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' }));
  await expect(c.locator('.a-card', { hasText: 'Токио' })).toContainText(tokyo);
  const w = await openVia(page, 'weather');
  await expect(w).toContainText('Демо-данные');
  await reload(page);
  c = await openVia(page, 'clock', 'alarm');
  await expect(c.locator('.a-card', { hasText: 'Бег' })).toBeVisible();
});

test('рабочий стол: меню «Создать», перенос файла в Корзину, двойной щелчок открывает файл', async ({ page }) => {
  await boot(page);
  await page.locator('.dicon[data-p="Рабочий стол/Заметки.txt"]').dblclick();
  await expect(win(page, 'notepad').locator('textarea')).toHaveValue(/Добро пожаловать/);
  await win(page, 'notepad').locator('[data-cap=close]').click();
  await page.mouse.click(700, 300, { button: 'right' });
  await page.locator('.menu.ctx .mi', { hasText: 'Создать' }).hover();
  await page.locator('.menu.sub .mi', { hasText: 'Папку' }).click();
  await page.locator('#desktop .rename').fill('Игры');
  await page.locator('#desktop .rename').press('Enter');
  await expect(page.locator('.dicon[data-p="Рабочий стол/Игры"]')).toBeVisible();
  await page.locator('.dicon[data-p="Рабочий стол/Заметки.txt"]').dragTo(page.locator('.dicon[data-sys="recycle"]'));
  await expect(page.locator('.dicon[data-p="Рабочий стол/Заметки.txt"]')).toHaveCount(0);
  expect(await page.evaluate(() => TRASH.length)).toBe(1);
  // вид значков меняется из меню стола
  await page.mouse.click(700, 300, { button: 'right' });
  await page.locator('.menu.ctx .mi', { hasText: 'Вид' }).hover();
  await page.locator('.menu.sub .mi', { hasText: 'Крупные' }).click();
  expect(Math.round((await page.locator('.dicon').first().boundingBox()).width)).toBe(104);
});

test('блокировка из меню питания: время верное, клавиша снимает; перезагрузка ждёт несохранённый Блокнот', async ({ page }) => {
  await boot(page);
  const np = await openVia(page, 'notepad');
  await np.locator('textarea').fill('важно');
  await page.click('#btn-start');
  await page.click('#power-btn');
  await page.click('[data-power="lock"]');
  await expect(page.locator('#lock')).toBeVisible();
  await expect(page.locator('#lk-time')).toHaveText(await hhmm(page));
  await page.keyboard.press('Space');
  await expect(page.locator('#lock')).toBeHidden();
  await page.click('#btn-start');
  await page.click('#power-btn');
  await page.click('[data-power="restart"]');
  await expect(np.locator('.win-dialog')).toBeVisible();
  await np.locator('.win-dialog .btn', { hasText: 'Отмена' }).click();
  await expect(np).toBeVisible();
  await expect(page.locator('#boot')).toHaveClass(/hidden/);
});

for (const size of [{ width: 1024, height: 700 }, { width: 800, height: 600 }]) {
  test(`на ${size.width}x${size.height} меню, панели и окна помещаются, у страницы нет прокрутки`, async ({ page }) => {
    await boot(page, size);
    for (const [btn, panel] of [['#btn-start', '#start'], ['#btn-search', '#search'], ['#btn-tray', '#quick'], ['#btn-clock', '#notif-center']]) {
      await page.click(btn);
      await expect(page.locator(panel)).toHaveClass(/open/);
      await page.waitForTimeout(300);
      await expectInside(page, page.locator(panel), panel);
      await page.keyboard.press('Escape');
    }
    for (const id of ['settings', 'explorer', 'media', 'photos']) {
      const w = await openVia(page, id);
      const b = await expectInside(page, w, id);
      expect(b.y + b.height).toBeLessThanOrEqual(size.height - TB + 1);
    }
    await expectInside(page, page.locator('#tb-right'), 'часы и значки');
    await expectNoPageOverflow(page);
  });
}

// ===== Игры «Игротеки» и значок «Медиаплеер» (правки владельца) =====
const vm = require('vm');
const GAMES = (() => { const ctx = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(WEB, '_os-shared', 'games.js'), 'utf8'), ctx); return ctx.window.OS_GAMES; })();

test('папка «Игры» в «Пуске» и во «Всех приложениях», игры находятся поиском; старых встроенных копий нет', async ({ page }) => {
  await boot(page);
  expect(GAMES.length).toBeGreaterThanOrEqual(8);
  expect(fs.existsSync(path.join(WEB, NAME, 'apps', 'minicraft.html')) || fs.existsSync(path.join(WEB, NAME, 'apps', 'obby.html'))).toBe(false);
  const src = fs.readFileSync(path.join(WEB, NAME, 'index.html'), 'utf8');
  expect(src).not.toMatch(/apps\/(minicraft|obby)\.html/);
  await page.click('#btn-start');
  await page.click('#start .pinned [data-start="games"]');
  for (const g of GAMES) await expect(page.locator(`#start [data-open-app="game-${g.id}"]`)).toContainText(g.title);
  await page.click('#start [data-start="back"]');
  await page.click('#start [data-start="all"]');
  await page.click('#start .all-list [data-start="games"]');
  await expect(page.locator('#start [data-open-app]')).toHaveCount(GAMES.length);
  await page.fill('#start-q', GAMES[0].title.slice(0, 5));
  await expect(page.locator(`#start [data-open-app="game-${GAMES[0].id}"]`)).toContainText('Игры');
});

for (const g of GAMES) {
  test(`игра «${g.title}»: окно открывает ../${g.dir}/index.html, страница есть и работает без ошибок и без сети`, async ({ page }) => {
    const requests = [];
    page.on('request', (r) => { if (/^https?:/.test(r.url())) requests.push(r.url()); });
    const errors = await boot(page);
    expect(fs.existsSync(path.join(WEB, g.dir, 'index.html')), g.dir + '/index.html').toBe(true);
    await page.click('#btn-start');
    await page.click('#start .pinned [data-start="games"]');
    await page.click(`#start [data-open-app="game-${g.id}"]`);
    const w = await ready(win(page, 'game-' + g.id));
    await expect(w.locator('iframe')).toHaveAttribute('src', `../${g.dir}/index.html`);
    await expect(w.frameLocator('iframe').locator('body')).toBeAttached();
    await page.waitForTimeout(1500);
    expect(errors, 'ошибки на странице игры').toEqual([]);
    expect(requests, 'запросы в сеть').toEqual([]);
  });
}

test('свёрнутое и закрытое окно игры ставит игру на паузу: внутри страница становится скрытой и теряет фокус', async ({ page }) => {
  await boot(page);
  const g = GAMES.find((x) => x.id === 'dino') || GAMES[0];
  const w = await openVia(page, 'game-' + g.id);
  const frame = page.frames().find((f) => f.url().includes('/' + g.dir + '/'));
  await expect.poll(() => frame.evaluate(() => document.readyState)).toBe('complete');
  await frame.evaluate(() => { const log = (window.parent.__gameLog = []); document.addEventListener('visibilitychange', () => log.push('hidden:' + document.hidden)); addEventListener('blur', () => log.push('blur')); addEventListener('focus', () => log.push('focus')); });
  await w.locator('[data-cap=min]').click();
  await expect.poll(() => page.evaluate(() => window.__gameLog.slice())).toEqual(expect.arrayContaining(['hidden:true', 'blur']));
  expect(await frame.evaluate(() => document.hidden)).toBe(true);
  await page.evaluate(() => { window.__gameLog.length = 0; });
  await page.click(`#tb-apps .tb-btn[data-app="game-${g.id}"]`);
  await expect.poll(() => page.evaluate(() => window.__gameLog.slice())).toEqual(expect.arrayContaining(['hidden:false', 'focus']));
  expect(await frame.evaluate(() => document.hidden)).toBe(false);
  await page.evaluate(() => { window.__gameLog.length = 0; });
  await w.locator('[data-cap=close]').click();
  await expect(page.locator(`.window[data-app="game-${g.id}"]`)).toHaveCount(0);
  expect(await page.evaluate(() => window.__gameLog.slice())).toEqual(expect.arrayContaining(['hidden:true', 'blur']));
});

test('значок «Медиаплеер»: центр масс ноты в пределах 0,5 px от центра, нота внутри квадрата, квадрат как у соседей', async ({ page }) => {
  await boot(page);
  const m = await page.evaluate(async () => {
    const root = new DOMParser().parseFromString(ICON.media.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"'), 'image/svg+xml').documentElement;
    const bg = root.querySelector('rect'), bgBox = ['x', 'y', 'width', 'height'].map((k) => +bg.getAttribute(k));
    const note = root.querySelector('[data-glyph]');
    // рисуем только ноту крупно (1 единица рисунка = 10 точек) и считаем центр по непрозрачности
    const only = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="480" height="480">' + new XMLSerializer().serializeToString(note) + '</svg>';
    const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(only); await img.decode();
    const c = document.createElement('canvas'); c.width = c.height = 480; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, 480, 480).data; let s = 0, sx = 0, sy = 0, x0 = 480, y0 = 480, x1 = 0, y1 = 0;
    for (let i = 0; i < d.length; i += 4) { const a = d[i + 3]; if (!a) continue; const px = (i / 4) % 480, py = Math.floor(i / 4 / 480); s += a; sx += a * px; sy += a * py; x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py); }
    return { cx: sx / s / 10, cy: sy / s / 10, box: [x0 / 10, y0 / 10, (x1 + 1) / 10, (y1 + 1) / 10], bg: bgBox, rx: +bg.getAttribute('rx'), photosRx: +/rx="(\d+)"/.exec(ICON.photos)[1] };
  });
  // самый крупный показ: 32 px в «Пуске» при 150 % = 48 точек, 1 единица рисунка = 1 точка экрана
  expect(Math.abs(m.cx - 24), 'центр масс по горизонтали ' + m.cx).toBeLessThanOrEqual(0.5);
  expect(Math.abs(m.cy - 24), 'центр масс по вертикали ' + m.cy).toBeLessThanOrEqual(0.5);
  const [bx, by, bw, bh] = m.bg;
  expect(m.box[0]).toBeGreaterThanOrEqual(bx + 3); expect(m.box[1]).toBeGreaterThanOrEqual(by + 3);
  expect(m.box[2]).toBeLessThanOrEqual(bx + bw - 3); expect(m.box[3]).toBeLessThanOrEqual(by + bh - 3);
  expect(bx >= 4 && by >= 4 && bx + bw <= 44 && by + bh <= 44, 'квадрат внутри значка с отступом').toBe(true);
  expect(m.rx).toBe(m.photosRx);
});

for (const dpr of [1, 1.25, 1.5]) {
  test(`значок «Медиаплеер» при масштабе ${dpr * 100}%: в панели задач, «Пуске» и заголовке не выходит за свои границы`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: dpr });
    const page = await ctx.newPage();
    await boot(page);
    await openVia(page, 'notepad');
    await openVia(page, 'media');
    await page.click('#btn-start');
    for (const [sel, box] of [['#tb-apps .tb-btn[data-app="media"] svg', '#tb-apps .tb-btn[data-app="media"]'], ['.window[data-app="media"] .t-ic svg', '.window[data-app="media"] .t-ic'], ['#start .pin[data-open-app="media"] svg', '#start .pin[data-open-app="media"]']]) {
      const a = await page.locator(sel).boundingBox(), b = await page.locator(box).boundingBox();
      expect(a.x >= b.x - 0.01 && a.y >= b.y - 0.01 && a.x + a.width <= b.x + b.width + 0.01 && a.y + a.height <= b.y + b.height + 0.01, sel + ' внутри ' + box).toBe(true);
      // размер такой же, как у соседа
      const n = await page.locator(sel.replace('"media"', '"notepad"')).boundingBox();
      expect(Math.abs(n.width - a.width)).toBeLessThan(0.5);
    }
    await ctx.close();
  });
}
