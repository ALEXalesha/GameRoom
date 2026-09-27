// Законы ios26 (телефон «Стекло»): телефон целиком виден в любом окне, блокировка и возврат домой,
// каждая программа работает (заглушек нет), пункт управления меняет настройки, всё сохраняется.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { WEB } = require('../helpers');
const { openOs, expectInside, dragFrom, expectNoPageOverflow, expectNoBrandGlyphs } = require('./_os-helpers');

const NAME = 'ios26';
const APPS = ['weather', 'clock', 'phone', 'messages', 'mail', 'browser', 'camera', 'photos', 'music', 'calc', 'notes', 'calendar', 'files', 'settings'];
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
  await expectInside(page, page.locator('#home-grid .app-icon[data-app="files"]'), 'последняя иконка');
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

// ===== Второй этап: «Файлы» на IndexedDB, уведомления, переключатель программ, пауза в фоне =====
async function reloadPhone(page) {
  await page.waitForFunction(() => dbPending === 0);
  await page.reload();
  await page.keyboard.press('Enter');
  await expect(page.locator('#home-page')).toHaveClass(/active/);
}

test('«Файлы»: папка и документ переживают перезагрузку, переименование, удаление и возврат, импорт', async ({ page }) => {
  await openOs(page, NAME);
  await unlock(page);
  const f = await open(page, 'files');
  await f.locator('[data-f="Документы"]').click();
  await expect(f.locator('.app-title')).toHaveText('Документы');
  await f.locator('[data-fx="more"]').click();
  await page.locator('.ios-sheet button', { hasText: 'Новая папка' }).click();
  await page.locator('.ios-alert input').fill('Архив');
  await page.locator('.ios-alert input').press('Enter');
  await expect(f.locator('[data-f="Документы/Архив"]')).toBeVisible();
  await f.locator('[data-fx="more"]').click();
  await page.locator('.ios-sheet button', { hasText: 'Новый текстовый файл' }).click();
  await f.locator('.fv-text').fill('важная мысль');
  await f.locator('[data-fv="close"]').click();
  await expect(f.locator('[data-f="Документы/Без названия.txt"]')).toBeVisible();
  // переименование через меню действий (правая кнопка или долгое нажатие)
  await f.locator('[data-f="Документы/Без названия.txt"]').click({ button: 'right' });
  await page.locator('.ios-sheet button', { hasText: 'Переименовать' }).click();
  await page.locator('.ios-alert input').fill('мысль.txt');
  await page.locator('.ios-alert [data-r="1"]').click();
  await expect(f.locator('[data-f="Документы/мысль.txt"]')).toBeVisible();
  await f.locator('[data-f="Документы/Список покупок.txt"]').click({ button: 'right' });
  await page.locator('.ios-sheet button', { hasText: 'Удалить' }).click();
  await expect(f.locator('[data-f="Документы/Список покупок.txt"]')).toHaveCount(0);
  await f.locator('[data-fx="up"]').click();
  await f.locator('[data-f="__trash"]').click();
  await expect(f).toContainText('Список покупок.txt');
  await f.locator('[data-restore]').click();
  await expect(f).toContainText('Недавно удалённых нет');
  await f.locator('[data-fx="up"]').click();
  await f.locator('[data-f="Изображения"]').click();
  await f.locator('.f-in').setInputFiles({ name: 'кадр.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="red"/></svg>') });
  await expect(f.locator('[data-f="Изображения/кадр.svg"] img')).toHaveCount(1);
  await reloadPhone(page);
  expect(await page.evaluate(() => [FS.get('Документы/Архив').type, FS.get('Документы/мысль.txt').text, FS.has('Документы/Список покупок.txt'), FS.has('Изображения/кадр.svg')])).toEqual(['dir', 'важная мысль', true, true]);
  // «Фото» показывают картинки из «Файлов»
  const ph = await open(page, 'photos');
  await expect(ph.locator('.ph-tile')).toHaveCount(await page.evaluate(() => loadPhotos().length));
  expect(await page.evaluate(() => loadPhotos().filter((p) => p.fs).length)).toBe(3);
});

test('уведомления: баннер от камеры открывает «Фото», центр уведомлений смахиванием слева сверху, «Не беспокоить» глушит', async ({ page }) => {
  await openOs(page, NAME);
  await unlock(page);
  const cam = await open(page, 'camera');
  await cam.locator('.camera-shutter').click();
  await expect(page.locator('.banner')).toContainText('Снимок сохранён');
  await page.locator('.banner').click();
  await expect(screen(page, 'photos')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.evaluate(() => notify('clock', 'Будильник 07:00', 'Подъём'));
  const b = await page.locator('#device').boundingBox();
  await dragFrom(page, b.x + b.width * 0.2, b.y + 20, 0, 300);
  await expect(page.locator('#nc')).toHaveClass(/open/);
  await expect(page.locator('#nc-list .n-card')).toHaveCount(1);
  await page.click('#nc-clear');
  await expect(page.locator('#nc-list')).toContainText('Нет уведомлений');
  await page.keyboard.press('Escape');
  await expect(page.locator('#nc')).not.toHaveClass(/open/);
  // справа сверху - пункт управления
  await dragFrom(page, b.x + b.width * 0.8, b.y + 20, 0, 300);
  await expect(page.locator('#control-center')).toHaveClass(/open/);
  await page.locator('#control-center [data-cc="dnd"]').click();
  await page.keyboard.press('Escape');
  await page.locator('.banner').waitFor({ state: 'detached' }).catch(() => {});
  expect(await page.evaluate(() => { notify('clock', 'Тихо', 'без баннера'); return document.querySelectorAll('.banner').length; })).toBe(0);
  // на экране блокировки уведомления видны списком
  await page.click('#power-btn');
  await expect(page.locator('#lock-notifs .n-card')).toHaveCount(1);
  // нажатие на уведомление на экране блокировки открывает программу
  await page.locator('#lock-notifs .n-card').click();
  await expect(screen(page, 'clock')).toBeVisible();
});

test('переключатель программ: двойной щелчок по полоске и жест с задержкой, карточка открывает, смахивание закрывает', async ({ page }) => {
  await openOs(page, NAME);
  await unlock(page);
  await open(page, 'notes');
  await page.keyboard.press('Escape');
  const calc = await open(page, 'calc');
  await calc.locator('.home-indicator').dblclick();
  await expect(page.locator('#switcher')).toHaveClass(/open/);
  await expect(page.locator('.sw-card')).toHaveCount(2);
  await expect(page.locator('.sw-card').first()).toHaveAttribute('data-sw', 'calc');
  await page.locator('.sw-card[data-sw="notes"]').click();
  await expect(page.locator('#switcher')).not.toHaveClass(/open/);
  await expect(screen(page, 'notes')).toBeVisible();
  // жест: вверх от нижнего края и задержать палец
  const b = await page.locator('#device').boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height - 20);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height - 160, { steps: 5 });
  await page.waitForTimeout(500);
  await page.mouse.up();
  await expect(page.locator('#switcher')).toHaveClass(/open/);
  // смахнуть карточку вверх - программа закрыта
  await page.locator('.sw-card[data-sw="calc"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const card = await page.locator('.sw-card[data-sw="calc"]').boundingBox();
  await dragFrom(page, card.x + card.width / 2, card.y + card.height / 2, 0, -250);
  await expect(page.locator('.sw-card[data-sw="calc"]')).toHaveCount(0);
  expect(await page.evaluate(() => RECENTS)).toEqual(['notes']);
  await page.keyboard.press('Escape');
  await expect(page.locator('#switcher')).not.toHaveClass(/open/);
});

test('скрытая вкладка ставит музыку и анимации на паузу, возврат продолжает', async ({ page }) => {
  await openOs(page, NAME);
  await unlock(page);
  const m = await open(page, 'music');
  await m.locator('[data-m="play"]').click();
  const icon = () => m.locator('#music-play-icon').getAttribute('d');
  expect(await icon()).toContain('M6 4h4');
  const setHidden = (h) => page.evaluate((v) => { Object.defineProperty(document, 'hidden', { value: v, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }, h);
  await setHidden(true);
  await expect(page.locator('body')).toHaveClass(/paused/);
  expect(await icon()).toContain('M8 5v14');
  await setHidden(false);
  await expect(page.locator('body')).not.toHaveClass(/paused/);
  expect(await icon()).toContain('M6 4h4');
});

test('собранная страница совпадает с исходниками в src/', async () => {
  const built = fs.readFileSync(path.join(WEB, NAME, 'index.html'), 'utf8');
  for (const f of ['kit.js', 'kit.css', 'extra.css']) expect(built.includes(fs.readFileSync(path.join(WEB, NAME, 'src', f), 'utf8')), f + ' не собран в index.html').toBe(true);
});

// ===== Замечания ревьюера =====
const vm = require('vm');
const GAMES = (() => { const ctx = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(WEB, '_os-shared', 'games.js'), 'utf8'), ctx); return ctx.window.OS_GAMES; })();

test('пункт управления со стеклом: размытие и затемнение, текст читается', async ({ page }) => {
  await openOs(page, NAME);
  await unlock(page);
  await page.evaluate(() => openCC());
  const cs = await page.locator('#control-center').evaluate((e) => { const s = getComputedStyle(e); return [s.backdropFilter, s.backgroundColor]; });
  expect(cs[0]).toMatch(/blur\(30px\)/);
  expect(cs[0]).toMatch(/saturate\(1\.6\)/);
  expect(cs[1]).toMatch(/rgba\(18, 18, 26, 0\.6\)/);
});

test('папка «Игры» на рабочем столе, игра на весь экран из соседней папки, выход жестом «Домой»', async ({ page }) => {
  const errors = await openOs(page, NAME);
  await unlock(page);
  await page.click('#home-grid .app-icon[data-app="games"]');
  await expect(page.locator('#games-folder')).toHaveClass(/open/);
  for (const g of GAMES) await expect(page.locator(`#games-folder [data-app="game-${g.id}"]`)).toContainText(g.title);
  const g = GAMES.find((x) => x.id === 'dino');
  await page.click(`#games-folder [data-app="game-${g.id}"]`);
  const scr = screen(page, 'game-' + g.id);
  await expect(scr).toBeVisible();
  await expect(scr.locator('iframe')).toHaveAttribute('src', `../${g.dir}/index.html`);
  const fb = await scr.locator('iframe').boundingBox(), pb = await page.locator('#screen').boundingBox();
  expect(fb.width / pb.width, 'игра во всю ширину').toBeGreaterThan(0.98);
  expect(fb.height / pb.height, 'игра почти во всю высоту').toBeGreaterThan(0.9);
  // смахивание начинается на полоске и уходит над рамкой игры: отпускание должно дойти до телефона
  const gb = await scr.locator('.game-bar').boundingBox();
  await dragFrom(page, gb.x + gb.width / 2, gb.y + gb.height / 2, 0, -300);
  await expect(scr).toBeHidden();
  expect(errors).toEqual([]);
});

test('пауза игры по протоколу: ушли «Домой» - игровое время стоит, вернулись - паузу снимает игрок', async ({ page }) => {
  await openOs(page, NAME);
  await unlock(page);
  await page.evaluate(() => { addGame({ id: 'stub', title: 'Заглушка', colors: ['#444', '#222'], glyph: 'star', src: '../_os-shared/pause-stub.html' }); openApp('game-stub'); });
  await expect.poll(() => page.frames().some((f) => f.url().includes('pause-stub.html'))).toBe(true);
  const f = page.frames().find((x) => x.url().includes('pause-stub.html'));
  await expect.poll(() => f.evaluate(() => window.stub && window.stub.frames)).toBeGreaterThan(5);
  await page.evaluate(() => showHome());
  await page.waitForTimeout(150);
  let t = await f.evaluate(() => stub.time); await page.waitForTimeout(600);
  expect(await f.evaluate(() => stub.time), 'игровое время в свёрнутой игре').toBe(t);
  await page.evaluate(() => openApp('game-stub'));
  await page.waitForTimeout(150);
  t = await f.evaluate(() => stub.time); await page.waitForTimeout(300);
  expect(await f.evaluate(() => stub.time)).toBe(t);
  await screen(page, 'game-stub').locator('iframe').click({ position: { x: 100, y: 100 } });
  await expect.poll(() => f.evaluate(() => stub.time)).toBeGreaterThan(t);
  // закрыли в переключателе - рамка убрана
  await page.evaluate(() => { showHome(); killApp('game-stub'); });
  await expect(screen(page, 'game-stub').locator('iframe')).toHaveCount(0);
});

test('двойное нажатие на полоску не закрывает программу раньше переключателя; поверх блокировки переключателя нет', async ({ page }) => {
  await openOs(page, NAME);
  await unlock(page);
  const n = await open(page, 'notes');
  await n.locator('.home-indicator').dblclick();
  await expect(page.locator('#switcher')).toHaveClass(/open/);
  expect(await page.evaluate(() => current)).toBe('notes');
  await page.click('#lock-btn');
  await expect(page.locator('#lock-page')).toHaveClass(/active/);
  await expect(page.locator('#switcher')).not.toHaveClass(/open/);
  expect(await page.evaluate(() => { openSwitcher(); return document.getElementById('switcher').classList.contains('open'); })).toBe(false);
});

test('закрытые смахиванием «Музыка» и секундомер останавливаются', async ({ page }) => {
  await openOs(page, NAME);
  await unlock(page);
  const m = await open(page, 'music');
  await m.locator('[data-m="play"]').click();
  expect(await m.locator('#music-play-icon').getAttribute('d')).toContain('M6 4h4');
  await page.keyboard.press('Escape');
  const c = await open(page, 'clock');
  await c.locator('[data-tab="stopwatch"]').click();
  await c.locator('[data-sw="toggle"]').click();
  await page.keyboard.press('Escape');
  await page.evaluate(() => { killApp('music'); killApp('clock'); });
  expect(await m.locator('#music-play-icon').getAttribute('d')).toContain('M8 5v14');
  const c2 = await open(page, 'clock');
  await c2.locator('[data-tab="stopwatch"]').click();
  const v1 = await c2.locator('#sw-display').textContent(); await page.waitForTimeout(400);
  expect(await c2.locator('#sw-display').textContent()).toBe(v1);
});

test('«Сбросить всё» стирает и файлы в IndexedDB; Escape закрывает окно ввода имени', async ({ page }) => {
  await openOs(page, NAME);
  await unlock(page);
  await page.evaluate(() => makeDir('Документы/Удалить меня'));
  await page.waitForFunction(() => dbPending === 0);
  const f = await open(page, 'files');
  await f.locator('[data-f="Документы"]').click();
  await f.locator('[data-fx="more"]').click();
  await page.locator('.ios-sheet button', { hasText: 'Новая папка' }).click();
  await expect(page.locator('.ios-alert')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.ios-alert')).toHaveCount(0);
  await expect(f.locator('.app-title')).toHaveText('Документы');
  // фокус ушёл с поля (нажали на заголовок окна): Escape всё равно закрывает окно, а не уводит из папки
  await f.locator('[data-fx="more"]').click();
  await page.locator('.ios-sheet button', { hasText: 'Новая папка' }).click();
  await page.locator('.ios-alert b').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.ios-alert')).toHaveCount(0);
  await expect(f.locator('.app-title')).toHaveText('Документы');
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  const s = await open(page, 'settings');
  await s.locator('[data-page="about"]').click();
  await Promise.all([page.waitForNavigation(), s.locator('[data-reset]').click()]);
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => typeof FS !== 'undefined' && FS.has('Документы'))).toBe(true);
  expect(await page.evaluate(() => FS.has('Документы/Удалить меня'))).toBe(false);
});

test('возврат из «Недавно удалённых», когда удалены и папка, и её родитель', async ({ page }) => {
  await openOs(page, NAME);
  await unlock(page);
  await page.evaluate(() => { makeDir('Документы/Учёба/Физика'); writeFile('Документы/Учёба/Физика/опыт.txt', 'маятник');
    trashPath('Документы/Учёба/Физика/опыт.txt'); trashPath('Документы/Учёба/Физика'); trashPath('Документы/Учёба'); restoreTrash(TRASH[0].id); });
  expect(await page.evaluate(() => ['Документы/Учёба', 'Документы/Учёба/Физика'].map(p => FS.get(p) && FS.get(p).type).concat(FS.has('Документы/Учёба/Физика/опыт.txt')))).toEqual(['dir', 'dir', true]);
});

test('вид: «‹ Обзор» не наезжает на заголовок, полоска «Домой» видна на светлом, погода одна везде', async ({ page }) => {
  await openOs(page, NAME);
  const lockTemp = await page.locator('#w-temp').textContent();
  await unlock(page);
  expect(await page.locator('#hw-temp').textContent()).toBe(lockTemp);
  const f = await open(page, 'files');
  await f.locator('[data-f="Документы"]').click();
  const bb = await f.locator('.back-btn').boundingBox(), tb = await f.locator('.app-title').boundingBox();
  expect(bb.y + bb.height <= tb.y || bb.x + bb.width <= tb.x, 'кнопка «Назад» наезжает на заголовок').toBe(true);
  const hi = await f.locator('.home-indicator').evaluate((e) => getComputedStyle(e).backgroundColor);
  expect(hi).toMatch(/rgba\(0, 0, 0/);
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  const w = await open(page, 'weather');
  expect(await w.locator('.weather-temp').textContent()).toBe(lockTemp.replace('+', ''));
});

test('запись не удалась (мало места): уведомление и откат; две вкладки видят корзины друг друга', async ({ page, context }) => {
  await openOs(page, NAME);
  await unlock(page);
  const p2 = await context.newPage();
  await p2.goto(page.url());
  await p2.waitForFunction(() => typeof fdb !== 'undefined' && FS.size > 0);
  await page.evaluate(() => trashPath('Документы/Список покупок.txt'));
  await expect.poll(() => p2.evaluate(() => TRASH.length)).toBe(1);
  await page.evaluate(() => { IDBObjectStore.prototype.put = function () { throw new DOMException('мало', 'QuotaExceededError'); }; writeFile('Документы/большой.txt', 'x'); });
  await expect(page.locator('.banner')).toContainText('Не сохранено: мало места');
  await expect.poll(() => page.evaluate(() => FS.has('Документы/большой.txt'))).toBe(false);
});
