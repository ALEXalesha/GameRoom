// Законы macos-tahoe («Тахо»): окна со «светофором» тащатся, раскладываются у края и не уходят под строку меню,
// Dock запускает и возвращает окна, Launchpad/поиск/все окна открываются и закрываются, каждая программа делает
// своё главное дело, файлы живут в IndexedDB, настройки применяются ко всей системе, фон ставит звук на паузу.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { WEB } = require('../helpers');
const { openOs, expectInside, dragFrom, dragBy, expectNoPageOverflow, topmostAt, expectNoBrandGlyphs } = require('./_os-helpers');

const NAME = 'macos-tahoe';
const BUILT_IN = ['finder', 'browser', 'textedit', 'photos', 'music', 'calculator', 'clock', 'weather', 'terminal', 'settings'];
const FRAMED = ['paint', 'messenger', 'minicraft', 'obby'];
const MB = 28; // строка меню

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
async function openVia(page, id, arg) { await page.evaluate(([i, a]) => { openApp(i, a); }, [id, arg]); return ready(win(page, id)); }
async function fromLaunchpad(page, id) {
  await page.click('#dock [data-app="launchpad"]');
  await expect(page.locator('#launchpad')).toHaveClass(/open/);
  await page.click(`#lp-grid [data-open-app="${id}"]`);
  await expect(page.locator('#launchpad')).not.toHaveClass(/open/);
  return ready(win(page, id));
}
async function term(page, cmd) { await page.keyboard.type(cmd); await page.keyboard.press('Enter'); }
const hhmm = (page) => page.evaluate(() => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); });

test('пометка фан-концепта, свой знак, без личных данных, сети и alert; сборка совпадает с исходниками', async ({ page }) => {
  const errors = await boot(page);
  await expect(page).toHaveTitle(/фан-концепт интерфейса, не связан с Microsoft\/Apple\/Samsung/);
  await expectNoBrandGlyphs(page);
  const files = ['index.html', 'src/core.js', 'src/apps.js', 'src/icons.js', 'src/markup.html'];
  const src = files.map((f) => fs.readFileSync(path.join(WEB, NAME, f), 'utf8')).join('\n');
  expect(src).not.toMatch(/\balert\(|\bconfirm\(|window\.prompt\(|Алексей|@gmail|192\.168\.|Safari|Finder|macOS|iCloud/);
  expect(src).not.toMatch(/(src|href)\s*=\s*["']https?:/);
  const built = fs.readFileSync(path.join(WEB, NAME, 'index.html'), 'utf8');
  for (const f of ['core.js', 'apps.js', 'icons.js', 'style.css']) expect(built.includes(fs.readFileSync(path.join(WEB, NAME, 'src', f), 'utf8')), f + ' не собран').toBe(true);
  const s = await openVia(page, 'settings', 'about');
  await expect(s).toContainText('не связан с Microsoft/Apple/Samsung');
  expect(errors).toEqual([]);
});

test('каждая программа открывается из Launchpad, в Dock появляется точка, «светофор» закрывает окно', async ({ page }) => {
  const errors = await boot(page);
  for (const id of BUILT_IN) {
    const w = await fromLaunchpad(page, id);
    await expectInside(page, w, id);
    await expect(page.locator(`#dock [data-app="${id}"]`)).toHaveClass(/running/);
    await expect(page.locator('#mb-app')).toHaveText(await page.evaluate((i) => APPS[i].title, id));
    await w.locator('[data-cap=close]').click();
    await expect(page.locator(`.window[data-app="${id}"]`)).toHaveCount(0);
    await expect(page.locator(`#dock [data-app="${id}"]`)).toHaveCount(await page.evaluate((i) => DOCK_PINNED.includes(i) ? 1 : 0, id));
  }
  expect(errors).toEqual([]);
});

test('Paint, Мессенджер и игры открываются рамкой из папки apps/', async ({ page }) => {
  const errors = await boot(page);
  for (const id of FRAMED) {
    const w = await fromLaunchpad(page, id);
    const src = await w.locator('iframe').getAttribute('src');
    expect(fs.existsSync(path.join(WEB, NAME, src)), src).toBe(true);
    await expect(w.frameLocator('iframe').locator('body')).not.toBeEmpty();
    await w.locator('[data-cap=close]').click();
  }
  expect(errors).toEqual([]);
});

test('Launchpad ищет, поиск (Ctrl+Пробел) открывает программу и файл, Esc закрывает', async ({ page }) => {
  await boot(page);
  await page.keyboard.press('F4');
  await expect(page.locator('#launchpad')).toHaveClass(/open/);
  await page.keyboard.type('кальк');
  await expect(page.locator('#lp-grid [data-open-app]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('#launchpad')).not.toHaveClass(/open/);
  await page.keyboard.press('Control+Space');
  await expect(page.locator('#spotlight')).toHaveClass(/open/);
  await page.keyboard.type('спис');
  await expect(page.locator('#sp-res [data-open-file="Документы/Список дел.txt"]')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(win(page, 'textedit').locator('textarea')).toHaveValue(/купить хлеб/);
  await page.click('#mb-search');
  await page.keyboard.type('обои');
  await page.keyboard.press('Enter');
  await expect(win(page, 'settings').locator('.set-list h1').first()).toHaveText('Обои');
});

test('окно тащится, не уходит под строку меню и за край; у края раскладывается и отрывается обратно', async ({ page }) => {
  await boot(page);
  const w = await openVia(page, 'textedit');
  const t = w.locator('.w-title');
  let tb = await t.boundingBox();
  await dragFrom(page, tb.x + 10, tb.y + 8, 1200 - tb.x, 740 - tb.y);
  let b = await w.boundingBox();
  expect(b.x + b.width).toBeLessThanOrEqual(1281);
  expect(b.y + b.height).toBeLessThanOrEqual(801);
  await expect(w).not.toHaveClass(/tiled/);
  tb = await t.boundingBox();
  await dragFrom(page, tb.x + 10, tb.y + 8, 100 - tb.x, 29 + 5 - tb.y);
  b = await w.boundingBox();
  expect(b.y).toBeGreaterThanOrEqual(MB - 1);
  const width = b.width;
  tb = await t.boundingBox();
  await page.mouse.move(tb.x + 10, tb.y + 8);
  await page.mouse.down();
  await page.mouse.move(600, 300, { steps: 4 });
  await page.mouse.move(1279, 300, { steps: 4 });
  await expect(page.locator('#tile-preview')).toHaveClass(/on/);
  await page.mouse.up();
  b = await w.boundingBox();
  expect(Math.round(b.x)).toBe(646);
  expect(Math.round(b.width)).toBe(628);
  // низ раскладки над Dock
  expect(b.y + b.height).toBeLessThan((await page.locator('#dock').boundingBox()).y);
  await dragBy(page, w.locator('.w-title'), -400, 60);
  b = await w.boundingBox();
  expect(Math.round(b.width)).toBe(Math.round(width));
});

test('зелёная кнопка: заполнить над Dock, меню раскладки, двойной щелчок по заголовку; размер не меньше минимума', async ({ page }) => {
  await boot(page);
  const w = await openVia(page, 'finder', 'Документы');
  await w.locator('[data-cap=zoom]').click();
  await expect(w).toHaveClass(/zoomed/);
  let b = await w.boundingBox();
  expect(Math.round(b.width)).toBe(1268);
  expect(b.y).toBeGreaterThanOrEqual(MB);
  expect(b.y + b.height).toBeLessThan((await page.locator('#dock').boundingBox()).y);
  await w.locator('[data-cap=zoom]').click();
  await expect(w).not.toHaveClass(/zoomed/);
  await w.locator('[data-cap=zoom]').hover();
  await expect(page.locator('.menu[data-tile]')).toBeVisible();
  await page.locator('.menu[data-tile] .mi', { hasText: 'Слева' }).click();
  b = await w.boundingBox();
  expect(Math.round(b.x)).toBe(6);
  expect(Math.round(b.width)).toBe(628);
  await w.locator('.f-title').dblclick();
  await expect(w).toHaveClass(/zoomed/);
  await w.locator('.f-title').dblclick();
  await expect(w).not.toHaveClass(/zoomed/);
  const se = await w.locator('.rz-se').boundingBox();
  await dragFrom(page, se.x + 5, se.y + 5, -2000, -2000);
  b = await w.boundingBox();
  expect(b.width).toBeGreaterThanOrEqual(519);
  expect(b.height).toBeGreaterThanOrEqual(319);
});

test('свернуть в Dock и вернуть; строка меню и Dock выше окон; Ctrl+W и Ctrl+Q; меню «Окно» знает окна', async ({ page }) => {
  await boot(page);
  const t = await openVia(page, 'textedit');
  const c = await openVia(page, 'calculator');
  await c.locator('[data-cap=min]').click();
  await expect(c).toHaveClass(/minimized/);
  await expect(page.locator('#dock .d-mini')).toHaveCount(1);
  await page.click('#dock .d-mini');
  await expect(c).not.toHaveClass(/minimized/);
  await expect(page.locator('#dock .d-mini')).toHaveCount(0);
  await t.locator('[data-cap=zoom]').click();
  expect(await topmostAt(page, 640, 10, '#menubar')).toBe(true);
  const dock = await page.locator('#dock').boundingBox();
  expect(await topmostAt(page, dock.x + 30, dock.y + dock.height / 2, '#dock')).toBe(true);
  // меню «Окно» показывает открытые окна
  await page.click('#mb-menus [data-mb="Окно"]');
  await expect(page.locator('.menu .mi', { hasText: 'Калькулятор' })).toBeVisible();
  await page.locator('.menu .mi', { hasText: 'Калькулятор' }).click();
  await expect(c).not.toHaveClass(/inactive/);
  await page.keyboard.press('Control+w');
  await expect(page.locator('.window[data-app="calculator"]')).toHaveCount(0);
  await openVia(page, 'terminal');
  await openVia(page, 'terminal', 'Документы');
  await page.locator('.window[data-app="terminal"]').last().locator('.term').click();
  await page.keyboard.press('Control+q');
  await expect(page.locator('.window[data-app="terminal"]')).toHaveCount(0);
});

test('все окна (F3): живые миниатюры, щелчок поднимает окно; меню программы и знака системы открываются', async ({ page }) => {
  await boot(page);
  const f = await openVia(page, 'finder', 'Документы');
  await openVia(page, 'clock');
  await page.keyboard.press('F3');
  await expect(page.locator('#mission')).toHaveClass(/open/);
  await expect(page.locator('.mc-win')).toHaveCount(2);
  await expect(page.locator('.mc-win', { hasText: 'Документы' }).locator('.mc-clone')).toContainText('Список дел.txt');
  await page.locator('.mc-win', { hasText: 'Документы' }).click();
  await expect(page.locator('#mission')).not.toHaveClass(/open/);
  await expect(f).not.toHaveClass(/inactive/);
  await page.click('#mb-mark');
  await expect(page.locator('.menu .mi', { hasText: 'Заблокировать экран' })).toBeVisible();
  await page.hover('#mb-app');
  await expect(page.locator('.menu .mi', { hasText: 'Завершить «Файлы»' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.menu')).toHaveCount(0);
});

test('файлы в IndexedDB: новая папка и сохранённый документ переживают перезагрузку', async ({ page }) => {
  await boot(page);
  const f = await openVia(page, 'finder', 'Документы');
  await f.locator('[data-x="newdir"]').click();
  await f.locator('[data-ren]').fill('Архив');
  await f.locator('[data-ren]').press('Enter');
  await expect(f.locator('[data-p="Документы/Архив"]')).toBeVisible();
  const ed = await fromLaunchpad(page, 'textedit');
  await ed.locator('textarea').fill('строка один\nстрока два');
  await expect(ed.locator('.w-title')).toContainText('изменён');
  await page.keyboard.press('Control+s');
  await ed.locator('.sheet input').fill('итог');
  await ed.locator('.sheet .btn', { hasText: 'Сохранить' }).click();
  await expect(ed.locator('.titlebar > .w-title')).toHaveText('итог.txt');
  await expect(f.locator('[data-p="Документы/итог.txt"]')).toBeVisible();
  await reload(page);
  expect(await page.evaluate(() => [FS.get('Документы/Архив').type, FS.get('Документы/итог.txt').text])).toEqual(['dir', 'строка один\nстрока два']);
  const f2 = await openVia(page, 'finder', 'Документы');
  await f2.locator('[data-p="Документы/итог.txt"]').dblclick();
  await expect(win(page, 'textedit').locator('textarea')).toHaveValue('строка один\nстрока два');
});

test('Корзина: Ctrl+⌫ удаляет, «Вернуть» восстанавливает, очистка переживает перезагрузку; Dock показывает полную корзину', async ({ page }) => {
  await boot(page);
  const f = await openVia(page, 'finder', 'Документы');
  await f.locator('[data-p="Документы/Список дел.txt"]').click();
  await page.keyboard.press('Control+Backspace');
  await expect(f.locator('[data-p="Документы/Список дел.txt"]')).toHaveCount(0);
  expect(await page.locator('#dock [data-app="trash"]').innerHTML()).toContain('M24 22l6-8');
  await f.locator('[data-go="__trash"]').click();
  await expect(f).toContainText('Список дел.txt');
  await f.locator('[data-restore]').click();
  await expect(f).toContainText('Корзина пуста');
  expect(await page.evaluate(() => FS.has('Документы/Список дел.txt'))).toBe(true);
  await f.locator('[data-go="Документы"]').click();
  await f.locator('[data-p="Документы/Проекты"]').click({ button: 'right' });
  await page.locator('.menu .mi', { hasText: 'Переместить в Корзину' }).click();
  expect(await page.evaluate(() => FS.has('Документы/Проекты/план.txt'))).toBe(false);
  await reload(page);
  const f2 = await openVia(page, 'finder', '__trash');
  await expect(f2).toContainText('Проекты');
  await f2.locator('[data-t="empty"]').click();
  await f2.locator('.sheet .btn', { hasText: 'Очистить' }).click();
  await expect(f2).toContainText('Корзина пуста');
  await reload(page);
  expect(await page.evaluate(() => TRASH.length)).toBe(0);
});

test('Файлы: перетаскивание в папку, Enter переименовывает, дублировать, импорт и файлы с диска, просмотр', async ({ page }) => {
  await boot(page);
  const f = await openVia(page, 'finder', 'Документы');
  await f.locator('[data-p="Документы/Список дел.txt"]').dragTo(f.locator('[data-p="Документы/Учёба"]'));
  expect(await page.evaluate(() => FS.has('Документы/Учёба/Список дел.txt'))).toBe(true);
  await f.locator('[data-p="Документы/Проекты"]').dblclick();
  await f.locator('[data-p="Документы/Проекты/план.txt"]').click();
  await page.keyboard.press('Enter');
  await f.locator('[data-ren]').fill('а/б');
  await f.locator('[data-ren]').press('Enter');
  await expect(f.locator('.sheet')).toContainText('«/»');
  await f.locator('.sheet .btn').click();
  await f.locator('[data-p="Документы/Проекты/план.txt"]').click();
  await page.keyboard.press('Enter');
  await f.locator('[data-ren]').fill('план-2.txt');
  await f.locator('[data-ren]').press('Enter');
  await expect(f.locator('[data-p="Документы/Проекты/план-2.txt"]')).toBeVisible();
  await page.keyboard.press('Control+d');
  await expect(f.locator('[data-p="Документы/Проекты/план-2 копия.txt"]')).toBeVisible();
  await page.keyboard.press('Control+ArrowUp');
  await expect(f.locator('[data-p="Документы/Проекты"]')).toBeVisible();
  await f.locator('.f-file').setInputFiles({ name: 'заметка.txt', mimeType: 'text/plain', buffer: Buffer.from('с диска') });
  await expect(f.locator('[data-p="Документы/заметка.txt"]')).toBeVisible();
  await f.locator('.f-main').evaluate((el) => {
    const dt = new DataTransfer();
    dt.items.add(new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], 'брошено.svg', { type: 'image/svg+xml' }));
    el.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
    el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  await expect(f.locator('[data-p="Документы/брошено.svg"] img')).toHaveCount(1);
  await f.locator('[data-x="list"]').click();
  await expect(f.locator('.f-list')).toBeVisible();
  await f.locator('[data-x="prev"]').click();
  await f.locator('[data-p="Документы/заметка.txt"]').click();
  await expect(f.locator('.preview pre')).toHaveText('с диска');
});

test('документ спрашивает о несохранённом: «Отменить» оставляет окно, «Не сохранять» закрывает', async ({ page }) => {
  await boot(page);
  const ed = await openVia(page, 'textedit');
  await ed.locator('textarea').fill('черновик');
  await ed.locator('[data-cap=close]').click();
  await expect(ed.locator('.sheet')).toContainText('Сохранить изменения');
  await ed.locator('.sheet .btn', { hasText: 'Отменить' }).click();
  await expect(ed).toBeVisible();
  await ed.locator('[data-cap=close]').click();
  await ed.locator('.sheet .btn', { hasText: 'Не сохранять' }).click();
  await expect(page.locator('.window[data-app="textedit"]')).toHaveCount(0);
});

test('калькулятор: порядок действий, 0,1+0,2, деление на ноль, 9 цифр, C и AC, клавиатура', async ({ page }) => {
  await boot(page);
  const c = await openVia(page, 'calculator');
  const d = c.locator('.calc-disp');
  for (const k of ['2', '+', '3', '*', '4', '=']) await c.locator(`[data-k="${k}"]`).click();
  await expect(d).toHaveText('20');
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  await page.keyboard.type('0.1+0.2');
  await page.keyboard.press('Enter');
  await expect(d).toHaveText('0,3');
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  await page.keyboard.type('1..5');
  await expect(d).toHaveText('1,5');
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  await page.keyboard.type('1/0');
  await page.keyboard.press('Enter');
  await expect(d).toHaveText('Ошибка');
  await page.keyboard.press('Escape');
  await page.keyboard.type('1234567890');
  await expect(d).toHaveText('123 456 789');
  await expect(c.locator('[data-k="c"]')).toHaveText('C');
  await c.locator('[data-k="c"]').click();
  await expect(d).toHaveText('0');
  await expect(c.locator('[data-k="c"]')).toHaveText('AC');
  for (const k of ['5', '0', '+', '1', '0', 'pct', '=']) await c.locator(`[data-k="${k}"]`).click();
  await expect(d).toHaveText('55');
  // C стирает только последнее число, пример продолжается
  for (const k of ['c', 'c', '5', '+', '3', 'c', '4', '=']) await c.locator(`[data-k="${k}"]`).click();
  await expect(d).toHaveText('9');
});

test('настройки применяются ко всей системе и переживают перезагрузку; пункт управления с ними заодно', async ({ page }) => {
  await boot(page);
  const s = await openVia(page, 'settings', 'appearance');
  await s.locator('[data-theme-set="dark"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-theme', 'dark');
  await s.locator('[data-accent="1"]').click();
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim())).toBe('#bf5af2');
  await s.locator('[data-sw="transparency"]').click();
  await expect(page.locator('body')).toHaveClass(/no-transparency/);
  expect(await s.evaluate((e) => getComputedStyle(e).backdropFilter)).toBe('none');
  await s.locator('[data-page="wallpaper"]').click();
  await s.locator('[data-wall="dunes"]').click();
  expect(decodeURIComponent(await page.locator('#wallpaper').evaluate((e) => e.style.backgroundImage))).toContain('#1a0f24');
  await s.locator('[data-page="time"]').click();
  await s.locator('[data-sw="time24"]').click();
  await s.locator('[data-sw="showDate"]').click();
  await expect(page.locator('#mb-clock')).toHaveText(/^\d{1,2}:\d\d (AM|PM)$/);
  await s.locator('[data-page="dock"]').click();
  await s.locator('[data-range="dockSize"]').fill('40');
  await expect.poll(async () => Math.round((await page.locator('#dock .d-item').first().boundingBox()).width)).toBe(40);
  // пункт управления и настройки - одно состояние
  await s.locator('[data-page="network"]').click();
  await page.click('#mb-cc');
  await page.click('#cc [data-cc="wifi"]');
  await expect(s.locator('[data-sw="wifi"]')).toHaveAttribute('aria-checked', 'false');
  await page.click('#cc [data-cc="dark"]');
  await expect(page.locator('body')).toHaveAttribute('data-theme', 'light');
  await page.locator('#cc-bright').fill('40');
  expect(+(await page.locator('#dim').evaluate((e) => e.style.opacity))).toBeGreaterThan(0.3);
  await reload(page);
  await expect(page.locator('body')).toHaveClass(/no-transparency/);
  await expect(page.locator('#mb-clock')).toHaveText(/(AM|PM)$/);
  expect(await page.evaluate(() => [S.theme, S.accent, S.wallpaper, S.wifi, S.brightness, S.dockSize])).toEqual(['light', 1, 'dunes', false, 40, 40]);
});

test('Терминал: команды zsh над той же файловой системой, Файлы видят изменения сразу', async ({ page }) => {
  await boot(page);
  const f = await openVia(page, 'finder', 'Документы');
  const t = await fromLaunchpad(page, 'terminal');
  const out = t.locator('.term');
  await term(page, 'cd Документы');
  await term(page, 'pwd');
  await expect(out).toContainText('/Пользователи/user/Документы');
  await term(page, 'mkdir Черновики');
  await expect(f.locator('[data-p="Документы/Черновики"]')).toBeVisible();
  await term(page, 'echo привет > z.txt');
  await term(page, 'echo мир >> z.txt');
  await term(page, 'cat z.txt');
  await expect(out).toContainText(/cat z\.txt\s*привет\s*мир/);
  await term(page, 'mv z.txt итог.txt');
  await term(page, 'cp итог.txt Черновики');
  await term(page, 'ls');
  await expect(out).toContainText('итог.txt');
  expect(await page.evaluate(() => FS.get('Документы/Черновики/итог.txt').text)).toBe('привет\nмир');
  await term(page, 'rm Черновики');
  await expect(t.locator('.err').last()).toContainText('нужен -r');
  await term(page, 'rm итог.txt');
  await expect(out).toContainText('Перемещено в Корзину: итог.txt');
  await term(page, 'cd ~');
  await term(page, 'tree');
  await expect(out).toContainText('Черновики');
  await term(page, 'абв');
  await expect(t.locator('.err').last()).toContainText('команда не найдена');
  await term(page, 'open -a Калькулятор');
  await ready(win(page, 'calculator'));
  await page.click('#dock [data-app="terminal"]');
  await t.locator('.term').click({ position: { x: 30, y: 30 } });
  await term(page, 'exit');
  await expect(page.locator('.window[data-app="terminal"]')).toHaveCount(0);
});

test('уведомления: всплывают, копятся в центре у часов, закрываются; «Не беспокоить» глушит всплывание', async ({ page }) => {
  await boot(page);
  const ph = await openVia(page, 'photos');
  await ph.locator('[data-view="wall:aurora"]').click();
  await ph.locator('[data-ph="wall"]').click();
  await expect(page.locator('#toasts .notif')).toContainText('Обои изменены');
  expect(await page.evaluate(() => S.wallpaper)).toBe('aurora');
  await page.click('#mb-clock');
  await expect(page.locator('#nc')).toHaveClass(/open/);
  await expect(page.locator('#nc-list .notif')).toHaveCount(1);
  await expect(page.locator('#wd-cal .today')).toHaveText(String(new Date().getDate()));
  await page.click('#nc-clear');
  await expect(page.locator('#nc-list .notif')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.click('#mb-cc');
  await page.click('#cc [data-cc="focus"]');
  await page.keyboard.press('Escape');
  await page.locator('#toasts .notif').first().waitFor({ state: 'detached' }).catch(() => {});
  const before = await page.locator('#toasts .notif').count();
  await ph.locator('[data-ph="wall"]').click();
  expect(await page.evaluate(() => NOTES.length)).toBe(1);
  expect(await page.locator('#toasts .notif').count()).toBeLessThanOrEqual(before);
});

test('Фото: картинки из файлов и импорт, листание стрелками, удаление в Корзину', async ({ page }) => {
  await boot(page);
  const ph = await openVia(page, 'photos');
  await expect(ph.locator('[data-view^="Изображения/"]')).toHaveCount(4);
  await ph.locator('.ph-in').setInputFiles({ name: 'кадр.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="red"/></svg>') });
  await ph.locator('[data-view="Изображения/кадр.svg"]').click();
  await expect(ph.locator('.pv-bar')).toContainText('кадр.svg');
  await page.keyboard.press('ArrowRight');
  await expect(ph.locator('.pv-bar')).not.toContainText('кадр.svg');
  await page.keyboard.press('ArrowLeft');
  await ph.locator('[data-ph="del"]').click();
  await expect(ph.locator('[data-view="Изображения/кадр.svg"]')).toHaveCount(0);
  expect(await page.evaluate(() => TRASH.some((t) => t.path === 'Изображения/кадр.svg'))).toBe(true);
});

test('Браузер: избранное, вкладки, внешний адрес - честное «нет подключения» без запросов в сеть', async ({ page }) => {
  const requests = [];
  page.on('request', (r) => { if (/^https?:/.test(r.url())) requests.push(r.url()); });
  await boot(page);
  const b = await openVia(page, 'browser');
  await b.locator('.b-fav', { hasText: 'Справка' }).click();
  await expect(b.locator('.b-page h1')).toHaveText('Справка');
  await b.locator('[data-url] input').fill('example.com');
  await b.locator('[data-url] input').press('Enter');
  await expect(b.locator('.b-page')).toContainText('Нет подключения к Интернету');
  await b.locator('[data-b="back"]').click();
  await expect(b.locator('.b-page h1')).toHaveText('Справка');
  await b.locator('[data-newtab]').click();
  await expect(b.locator('.b-tab')).toHaveCount(2);
  await b.locator('.b-tab').first().locator('[data-tx]').click();
  await expect(b.locator('.b-tab')).toHaveCount(0);
  expect(requests).toEqual([]);
});

test('Музыка играет, пункт управления ею управляет; скрытая вкладка ставит звук и анимации на паузу', async ({ page }) => {
  await boot(page);
  const m = await openVia(page, 'music');
  await m.locator('[data-tr="2"]').click();
  await expect(m.locator('[data-p="play"]')).toHaveAttribute('aria-label', 'Пауза');
  await expect(m.locator('.mu-now b')).toHaveText('Северный ветер');
  await page.click('#mb-cc');
  await expect(page.locator('#cc')).toContainText('Северный ветер');
  await page.click('#cc [data-cc="next"]');
  await expect(m.locator('.mu-now b')).toHaveText('Огни города');
  await page.keyboard.press('Escape');
  const setHidden = (h) => page.evaluate((v) => { Object.defineProperty(document, 'hidden', { value: v, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }, h);
  await setHidden(true);
  await expect(page.locator('body')).toHaveClass(/paused/);
  await expect(m.locator('[data-p="play"]')).toHaveAttribute('aria-label', 'Играть');
  await setHidden(false);
  await expect(page.locator('body')).not.toHaveClass(/paused/);
  await expect(m.locator('[data-p="play"]')).toHaveAttribute('aria-label', 'Пауза');
});

test('Часы: мировое время по поясам, будильник сохраняется, таймер и секундомер идут; погода помечена как демо', async ({ page }) => {
  await boot(page);
  let c = await openVia(page, 'clock');
  const tokyo = await page.evaluate(() => new Date().toLocaleTimeString('ru-RU', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' }));
  await expect(c.locator('.world div', { hasText: 'Токио' })).toContainText(tokyo);
  await c.locator('[data-tab="alarm"]').click();
  await c.locator('input[name=t]').fill('06:15');
  await c.locator('input[name=label]').fill('Бег');
  await c.locator('[data-addalarm] button').click();
  await expect(c.locator('.alarms')).toContainText('Бег');
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
  await expect(await openVia(page, 'weather')).toContainText('Демо-данные');
  await reload(page);
  c = await openVia(page, 'clock', 'alarm');
  await expect(c.locator('.alarms')).toContainText('Бег');
});

test('рабочий стол: «Новая папка» из меню, перенос в Корзину Dock, двойной щелчок открывает файл', async ({ page }) => {
  await boot(page);
  await page.locator('.dicon[data-p="Рабочий стол/Прочти меня.txt"]').dblclick();
  await expect(win(page, 'textedit').locator('textarea')).toHaveValue(/Добро пожаловать/);
  await win(page, 'textedit').locator('[data-cap=close]').click();
  await page.mouse.click(500, 300, { button: 'right' });
  await page.locator('.menu .mi', { hasText: 'Новая папка' }).click();
  await page.locator('#desktop .rename').fill('Игры');
  await page.locator('#desktop .rename').press('Enter');
  await expect(page.locator('.dicon[data-p="Рабочий стол/Игры"]')).toBeVisible();
  await page.locator('.dicon[data-p="Рабочий стол/Прочти меня.txt"]').dragTo(page.locator('#dock [data-app="trash"]'));
  await expect(page.locator('.dicon[data-p="Рабочий стол/Прочти меня.txt"]')).toHaveCount(0);
  expect(await page.evaluate(() => TRASH.length)).toBe(1);
});

test('блокировка из меню знака: время верное, клавиша снимает; перезагрузка ждёт несохранённый документ', async ({ page }) => {
  await boot(page);
  const ed = await openVia(page, 'textedit');
  await ed.locator('textarea').fill('важно');
  await page.click('#mb-mark');
  await page.locator('.menu .mi', { hasText: 'Заблокировать экран' }).click();
  await expect(page.locator('#lock')).toBeVisible();
  await expect(page.locator('#lk-time')).toHaveText(await hhmm(page));
  await page.keyboard.press('Space');
  await expect(page.locator('#lock')).toBeHidden();
  await page.click('#mb-mark');
  await page.locator('.menu .mi', { hasText: 'Перезагрузить' }).click();
  await expect(ed.locator('.sheet')).toBeVisible();
  await ed.locator('.sheet .btn', { hasText: 'Отменить' }).click();
  await expect(ed).toBeVisible();
  await expect(page.locator('#boot')).toHaveClass(/hidden/);
});

for (const size of [{ width: 1024, height: 700 }, { width: 800, height: 600 }]) {
  test(`на ${size.width}x${size.height} панели, Dock и окна помещаются, у страницы нет прокрутки`, async ({ page }) => {
    await boot(page, size);
    await page.click('#mb-cc');
    await page.waitForTimeout(300);
    await expectInside(page, page.locator('#cc'), 'пункт управления');
    await page.click('#mb-clock');
    await page.waitForTimeout(300);
    await expectInside(page, page.locator('#nc-widgets'), 'виджеты');
    await page.keyboard.press('Escape');
    await expectInside(page, page.locator('#dock'), 'Dock');
    await expectInside(page, page.locator('#mb-clock'), 'часы');
    for (const id of ['settings', 'finder', 'music', 'photos', 'browser']) {
      const w = await openVia(page, id);
      const b = await expectInside(page, w, id);
      expect(b.y).toBeGreaterThanOrEqual(MB - 1);
    }
    await expectNoPageOverflow(page);
  });
}
