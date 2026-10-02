// Законы ios26 (телефон «Стекло»): телефон целиком виден в любом окне, блокировка и возврат домой,
// каждая программа работает (заглушек нет), пункт управления меняет настройки, всё сохраняется.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { WEB } = require('../helpers');
const { openOs, expectInside, dragFrom, expectNoPageOverflow, expectNoBrandGlyphs } = require('./_os-helpers');

const NAME = 'ios26';
// захват мыши недоступен ни странице, ни рамкам игр: на этом компьютере работает человек
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { Element.prototype.requestPointerLock = function () { return Promise.resolve(); }; document.exitPointerLock = function () {}; });
});
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
  // Изменено намеренно: программа раскрывается из значка пружиной (~0.4 с) и сворачивается обратно,
  // а Playwright ждёт неподвижности кнопки с паузами 20/100/100/500 мс - 14 программ туда-обратно дольше 30 с
  test.slow();
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
  for (const f of ['kit.js', 'kit.css', 'extra.css', 'glass.css', 'glass.js', 'wall.js', 'look.js']) expect(built.includes(fs.readFileSync(path.join(WEB, NAME, 'src', f), 'utf8')), f + ' не собран в index.html').toBe(true);
});

// ===== Замечания ревьюера =====
const vm = require('vm');
const GAMES = (() => { const ctx = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(WEB, '_os-shared', 'games.js'), 'utf8'), ctx); return ctx.window.OS_GAMES; })();

// Изменено намеренно (вид iOS 26): размытие и затемнение - отдельный слой .cc-back под плитками. У элемента
// с backdrop-filter дети видят только его собственный фон, поэтому на самом пункте управления фильтра больше нет:
// иначе стеклянные плитки преломляли бы плоскую заливку, а не обои.
test('пункт управления со стеклом: размытие и лёгкое затемнение отдельным слоем, сама панель прозрачная', async ({ page }) => {
  await openOs(page, NAME);
  await unlock(page);
  await page.evaluate(() => openCC());
  await expect(page.locator('#control-center .cc-back')).toHaveCSS('opacity', '1');
  const cs = await page.evaluate(() => { const b = getComputedStyle(document.querySelector('#control-center .cc-back')), c = getComputedStyle(document.getElementById('control-center')); return [b.backdropFilter, b.backgroundColor, c.backdropFilter, c.backgroundColor]; });
  expect(cs[0]).toMatch(/blur\(2\dpx\)/);
  expect(cs[0]).toMatch(/saturate\(1\.\d+\)/);
  const a = +(cs[1].match(/rgba\([^)]*,\s*([\d.]+)\)/) || [0, 1])[1];
  expect(a, 'затемнение не сплошное').toBeLessThan(0.5);
  expect(cs[2]).toBe('none');
  expect(cs[3]).toBe('rgba(0, 0, 0, 0)');
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
  // изменено намеренно: игра раскрывается из значка папки - размер рамки меряется после анимации
  await scr.evaluate((e) => Promise.all(e.getAnimations().map((a) => a.finished)));
  const fb = await scr.locator('iframe').boundingBox(), pb = await page.locator('#screen').boundingBox();
  expect(fb.width / pb.width, 'игра во всю ширину').toBeGreaterThan(0.98);
  expect(fb.height / pb.height, 'игра почти во всю высоту').toBeGreaterThan(0.9);
  // смахивание начинается на полоске и уходит над рамкой игры: отпускание должно дойти до телефона
  const gb = await scr.locator('.game-bar').boundingBox();
  await dragFrom(page, gb.x + gb.width / 2, gb.y + gb.height / 2, 0, -300);
  await expect(scr).toBeHidden();
  // нажатие на полоску в игре тоже ведёт домой
  await page.evaluate((id) => openApp(id), 'game-' + g.id);
  await expect(scr).toBeVisible();
  await scr.locator('.game-bar .home-indicator').click();
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

// ===== Жидкое стекло в духе iOS 26 (техника проекта LiquidGlass: SDF кромки, три текстуры, feDisplacementMap) =====
// Пиксели снимков разбираются в отдельной пустой вкладке: сама страница телефона ничего не знает о проверке.
async function decoder(context) {
  const p = await context.newPage();
  await p.setContent('<canvas></canvas>');
  return p;
}
// Снимок области: массив RGBA и размер
async function grab(page, dec, clip) {
  const b64 = (await page.screenshot({ clip })).toString('base64');
  return dec.evaluate(async (b) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b; await img.decode();
    const c = document.querySelector('canvas'); c.width = img.width; c.height = img.height;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    return { w: img.width, h: img.height, d: Array.from(x.getImageData(0, 0, img.width, img.height).data) };
  }, b64);
}
const mean = (px) => { const s = [0, 0, 0]; const n = px.d.length / 4; for (let i = 0; i < px.d.length; i += 4) { s[0] += px.d[i]; s[1] += px.d[i + 1]; s[2] += px.d[i + 2]; } return s.map((v) => v / n); };
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const luma = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
// середина элемента без краёв: кромка стекла светится, а проверяется то, что видно сквозь него
async function inner(page, sel, k = 0.3) {
  const b = await page.locator(sel).first().boundingBox();
  return { x: b.x + b.width * k, y: b.y + b.height * k, width: b.width * (1 - 2 * k), height: b.height * (1 - 2 * k) };
}
async function glassReady(page, sel) {
  await expect.poll(() => page.evaluate((s) => !!(window.LG && LG.ready(document.querySelector(s))), sel), { timeout: 8000, message: sel + ': стекло не готово' }).toBe(true);
}
async function setWall(page, w) {
  await page.evaluate((x) => setS('wallpaper', x), w);
  await expect.poll(() => page.evaluate(() => !window.Wall || Wall.ready())).toBe(true);
}

test('док, плитки пункта управления и виджет - фильтр Жидкого стекла (преломление, дисперсия), а не просто размытие', async ({ page }) => {
  const errors = await openOs(page, NAME);
  await unlock(page);
  // дом - до пункта управления: под открытой панелью стекло дома не считается (его не видно)
  for (const sel of ['#dock', '#home-grid .home-widget', '#control-center [data-cc="rotation"]', '#control-center [data-slider="brightness"]']) {
    if (sel.startsWith('#control-center')) await page.evaluate(() => openCC());
    await glassReady(page, sel);
    const g = await page.locator(sel).first().evaluate((el) => {
      const bf = getComputedStyle(el).backdropFilter;
      const id = (bf.match(/url\("?#([^")]+)"?\)/) || [])[1];
      const f = id && document.getElementById(id);
      return { bf, filter: !!f, disp: f ? [...f.querySelectorAll('feDisplacementMap')].map((d) => +d.getAttribute('scale')) : [], img: f ? (f.querySelector('feImage').getAttribute('href') || '').slice(0, 14) : '' };
    });
    expect(g.bf, sel + ': в backdrop-filter нет ссылки на фильтр').toMatch(/url\(/);
    expect(g.filter, sel + ': фильтра нет в документе').toBe(true);
    expect(g.img, sel + ': карта смещения не картинка').toBe('data:image/png');
    expect(g.disp.length, sel + ': дисперсия - три прохода смещения').toBe(3);
    expect(Math.max(...g.disp), sel + ': кромка тянет фон внутрь (масштаб отрицательный)').toBeLessThan(0);
    expect(new Set(g.disp).size, sel + ': каналы R, G, B смещаются по-разному').toBe(3);
  }
  expect(errors).toEqual([]);
});

test('сквозь док, виджет и плитки видно обои; пункт управления не сплошной: цвет под ними меняется вместе с обоями', async ({ page, context }) => {
  await openOs(page, NAME);
  await unlock(page);
  const dec = await decoder(context);
  const probe = {};
  for (const w of ['forest', 'sunset']) {
    await setWall(page, w);
    await page.waitForTimeout(300);
    const cc = page.locator('#control-center');
    probe[w] = { dock: mean(await grab(page, dec, await inner(page, '#dock', 0.35))), widget: mean(await grab(page, dec, await inner(page, '#home-grid .home-widget'))) };
    await page.evaluate(() => openCC());
    await glassReady(page, '#control-center [data-cc="rotation"]');
    await page.waitForTimeout(700);
    probe[w].tile = mean(await grab(page, dec, await inner(page, '#control-center [data-cc="rotation"]', 0.2)));
    // фон пункта управления под сеткой, где плиток нет
    const d = await page.locator('#device').boundingBox(), grid = await cc.locator('.cc-grid').boundingBox();
    probe[w].back = mean(await grab(page, dec, { x: d.x + d.width * 0.2, y: grid.y + grid.height + 40, width: d.width * 0.6, height: 60 }));
    await page.keyboard.press('Escape');
    await expect(cc).not.toHaveClass(/open/);
  }
  for (const k of ['dock', 'widget', 'tile', 'back']) {
    expect(dist(probe.forest[k], probe.sunset[k]), `${k}: цвет не зависит от обоев (${probe.forest[k].map(Math.round)} / ${probe.sunset[k].map(Math.round)})`).toBeGreaterThan(40);
  }
  // пункт управления и плитки полупрозрачные
  const a = await page.evaluate(() => {
    const alpha = (el) => { const m = getComputedStyle(el).backgroundColor.match(/rgba?\(([^)]+)\)/); const p = m ? m[1].split(',').map(Number) : [0, 0, 0, 0]; return p.length > 3 ? p[3] : 1; };
    return [alpha(document.getElementById('control-center')), ...[...document.querySelectorAll('#control-center .cc-back, #control-center .cc-tile:not(.active), #control-center .cc-slider')].map(alpha)];
  });
  for (const x of a) expect(x, 'сплошной фон в пункте управления').toBeLessThan(0.6);
});

test('время и дата на экране блокировки читаются на трёх разных обоях: контраст не меньше 4.5', async ({ page, context }) => {
  // 18 снимков по пикселям и три перерисовки обоев и букв: на нагруженной машине дольше 30 с
  test.slow();
  await openOs(page, NAME);
  const dec = await decoder(context);
  for (const w of ['liquid', 'pearl', 'forest']) {
    await setWall(page, w);
    await page.waitForTimeout(400);
    for (const sel of ['#lock-time', '#lock-date']) {
      const clip = await page.locator(sel).boundingBox();
      const withText = await grab(page, dec, clip);
      await page.evaluate(() => document.querySelectorAll('#lock-time, #lock-date, .glyph-layer').forEach((e) => { e.style.visibility = 'hidden'; }));
      await page.waitForTimeout(100);
      const without = await grab(page, dec, clip);
      await page.evaluate(() => document.querySelectorAll('#lock-time, #lock-date, .glyph-layer').forEach((e) => { e.style.visibility = ''; }));
      // пиксели букв - где снимки расходятся; цвет букв - середина самых непохожих, фон - худший случай под ними
      const diff = [];
      for (let i = 0; i < withText.d.length; i += 4) {
        const dd = Math.abs(withText.d[i] - without.d[i]) + Math.abs(withText.d[i + 1] - without.d[i + 1]) + Math.abs(withText.d[i + 2] - without.d[i + 2]);
        if (dd > 60) diff.push([dd, luma(withText.d[i], withText.d[i + 1], withText.d[i + 2]), luma(without.d[i], without.d[i + 1], without.d[i + 2])]);
      }
      expect(diff.length, `${w} ${sel}: текста не видно`).toBeGreaterThan(30);
      diff.sort((x, y) => y[0] - x[0]);
      const core = diff.slice(0, Math.ceil(diff.length / 2));
      const fg = core.map((x) => x[1]).sort((x, y) => x - y)[Math.floor(core.length / 2)];
      const bgs = diff.map((x) => x[2]).sort((x, y) => x - y);
      const light = fg > bgs[Math.floor(bgs.length / 2)];
      const bg = light ? bgs[Math.floor(bgs.length * 0.9)] : bgs[Math.floor(bgs.length * 0.1)];
      expect(contrast(fg, bg), `${w} ${sel}: контраст букв ${fg.toFixed(3)} и фона ${bg.toFixed(3)}`).toBeGreaterThanOrEqual(4.5);
    }
  }
});

test('значок - суперэллипс (непрерывная кривизна угла), а не скруглённый квадрат: пиксели угла', async ({ page, context }) => {
  await openOs(page, NAME);
  await unlock(page);
  const dec = await decoder(context);
  // тот же класс значка, только крупно и белым: кромка угла меряется с долей пикселя по покрытию столбцов
  const S = 400;
  await page.evaluate((s) => {
    const st = document.createElement('style'); st.textContent = '#probe::before,#probe::after{display:none!important}'; document.head.appendChild(st);
    const p = document.createElement('div'); p.className = 'icon'; p.id = 'probe';
    p.style.cssText = `position:fixed;left:20px;top:20px;width:${s}px;height:${s}px;background:#fff;box-shadow:none;z-index:99999;transform:none`;
    document.body.appendChild(p);
  }, S);
  const px = await grab(page, dec, { x: 20, y: 20, width: S / 2, height: S / 2 });
  const inset = (x) => { let cov = 0; for (let y = 0; y < px.h; y++) { const i = (y * px.w + x) * 4; cov += (px.d[i] + px.d[i + 1] + px.d[i + 2]) / 765; } return px.h - cov; };
  const bgCorner = px.d[(Math.round(S * 0.03) * px.w + Math.round(S * 0.03)) * 4];
  expect(bgCorner, 'угол не скруглён').toBeLessThan(128);
  const at10 = inset(Math.round(S * 0.1)), at25 = (inset(Math.round(S * 0.24)) + inset(Math.round(S * 0.25)) + inset(Math.round(S * 0.26))) / 3;
  // у окружности радиуса ~22% кромка к четверти стороны уже прямая (0), у большого круга отступ на 0.1 стороны огромный
  expect(at25, `к четверти стороны угол ещё плавно изгибается (отступ ${at25.toFixed(2)} пкс)`).toBeGreaterThan(0.35);
  expect(at25, `отступ на четверти стороны ${at25.toFixed(2)} пкс - это уже не значок`).toBeLessThan(4);
  expect(at10, `отступ на десятой доле стороны ${at10.toFixed(1)} пкс`).toBeGreaterThan(S * 0.02);
  expect(at10, `отступ на десятой доле стороны ${at10.toFixed(1)} пкс - угол слишком круглый`).toBeLessThan(S * 0.065);
});

test('текстуры стекла кэшируются по размеру: повторное открытие пункта управления их не печёт', async ({ page }) => {
  await page.addInitScript(() => {
    window.__tdu = 0;
    const o = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function (...a) { window.__tdu++; return o.apply(this, a); };
  });
  await openOs(page, NAME);
  await unlock(page);
  await page.evaluate(() => openCC());
  await glassReady(page, '#control-center [data-cc="rotation"]');
  await expect.poll(() => page.evaluate(() => LG.idle())).toBe(true);
  // одинаковые круглые кнопки - одна выпечка и один фильтр на всех
  const ids = await page.evaluate(() => [...document.querySelectorAll('#control-center .cc-tile:not(.active):not(.large)')].map((t) => (getComputedStyle(t).backdropFilter.match(/#([^")]+)/) || [])[1]));
  expect(new Set(ids).size, 'у одинаковых плиток разные фильтры').toBe(1);
  const before = await page.evaluate(() => [window.__tdu, LG.stats.bakes]);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.evaluate(() => openCC());
  await page.waitForTimeout(900);
  await page.keyboard.press('Escape');
  await page.evaluate(() => openCC());
  await page.waitForTimeout(900);
  expect(await page.evaluate(() => [window.__tdu, LG.stats.bakes]), 'повторное открытие печёт текстуры заново').toEqual(before);
});

test('программа раскрывается из своего значка пружиной с перелётом и сворачивается обратно в значок', async ({ page }) => {
  const errors = await openOs(page, NAME);
  await unlock(page);
  const icon = await page.locator('#home-grid .app-icon[data-app="notes"] .icon').boundingBox();
  await page.locator('#home-grid .app-icon[data-app="notes"]').click();
  // кривая раскрытия по кадрам: масштаб из значка, перелёт за 1 и успокоение на 1
  const a = await page.evaluate(() => {
    const el = document.getElementById('app-notes'); const an = el.getAnimations()[0];
    if (!an) return null;
    an.pause();
    const dur = an.effect.getComputedTiming().duration, ws = [];
    let first = null;
    for (let i = 0; i <= 60; i++) {
      an.currentTime = Math.min(dur - 0.01, dur * i / 60);
      const r = el.getBoundingClientRect();
      if (!i) first = { x: r.x, y: r.y, w: r.width, h: r.height };
      ws.push(r.width);
    }
    an.play();
    return { first, ws, easing: an.effect.getTiming().easing };
  });
  expect(a, 'у экрана программы нет анимации раскрытия').not.toBeNull();
  expect(a.easing, 'пружина - кривая linear()').toMatch(/^linear\(/);
  expect(Math.abs(a.first.x + a.first.w / 2 - (icon.x + icon.width / 2)), 'раскрытие начинается не из значка').toBeLessThan(12);
  expect(Math.abs(a.first.y + a.first.h / 2 - (icon.y + icon.height / 2)), 'раскрытие начинается не из значка').toBeLessThan(40);
  const end = a.ws[a.ws.length - 1];
  expect(Math.max(...a.ws) / end, 'у пружины нет перелёта').toBeGreaterThan(1.003);
  expect(Math.abs(a.ws[a.ws.length - 2] / end - 1), 'пружина не успокаивается на месте').toBeLessThan(0.003);
  await expect(screen(page, 'notes')).toBeVisible();
  await page.waitForTimeout(700);
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => current)).toBe(null);
  // сворачивание: экран виден и по кадрам сжимается к значку (а не стоит во весь экран и пропадает)
  const c = await page.evaluate(() => {
    const el = document.getElementById('app-notes'); const an = el.getAnimations()[0];
    if (!an || getComputedStyle(el).display === 'none') return null;
    an.pause();
    const dur = an.effect.getComputedTiming().duration, out = [];
    for (const f of [0.1, 0.4, 0.7, 0.999]) { an.currentTime = dur * f; const r = el.getBoundingClientRect(); out.push({ w: r.width, cx: r.x + r.width / 2 }); }
    an.play();
    return out;
  });
  expect(c, 'нет анимации сворачивания (экран сразу пропал)').not.toBeNull();
  expect(c[0].w, 'в начале сворачивания экран ещё большой').toBeGreaterThan(icon.width * 2.5);
  expect(c[c.length - 1].w, 'в конце экран размером со значок').toBeLessThan(icon.width * 1.6);
  expect(Math.abs(c[c.length - 1].cx - (icon.x + icon.width / 2)), 'сворачивается не в свой значок').toBeLessThan(10);
  await expect(screen(page, 'notes')).toBeHidden();
  expect(errors).toEqual([]);
});

// ===== Ревью ветки ios: найденные недочёты и вид iOS 26 =====
// Контраст мелкого текста по пикселям: снимок с текстом и без (visibility), цвет букв - самые непохожие пиксели,
// фон - худший случай под ними
async function textContrast(page, dec, clip, hide) {
  const withText = await grab(page, dec, clip);
  await page.evaluate((h) => document.querySelectorAll(h).forEach((e) => { e.style.visibility = 'hidden'; }), hide);
  await page.waitForTimeout(60);
  const without = await grab(page, dec, clip);
  await page.evaluate((h) => document.querySelectorAll(h).forEach((e) => { e.style.visibility = ''; }), hide);
  const diff = [];
  for (let i = 0; i < withText.d.length; i += 4) {
    const dd = Math.abs(withText.d[i] - without.d[i]) + Math.abs(withText.d[i + 1] - without.d[i + 1]) + Math.abs(withText.d[i + 2] - without.d[i + 2]);
    if (dd > 60) diff.push([dd, luma(withText.d[i], withText.d[i + 1], withText.d[i + 2]), luma(without.d[i], without.d[i + 1], without.d[i + 2])]);
  }
  if (diff.length < 12) return { ratio: 0, n: diff.length };
  diff.sort((x, y) => y[0] - x[0]);
  const core = diff.slice(0, Math.ceil(diff.length * 0.3));
  const fg = core.map((x) => x[1]).sort((x, y) => x - y)[Math.floor(core.length / 2)];
  const bgs = diff.map((x) => x[2]).sort((x, y) => x - y);
  const light = fg > bgs[Math.floor(bgs.length / 2)];
  const bg = light ? bgs[Math.floor(bgs.length * 0.9)] : bgs[Math.floor(bgs.length * 0.1)];
  return { ratio: +contrast(fg, bg).toFixed(2), fg: +fg.toFixed(3), bg: +bg.toFixed(3), n: diff.length };
}
for (const dark of [false, true]) {
  test(`текст уведомлений, баннера и подписи значков читаются на всех обоях (${dark ? 'тёмная' : 'светлая'} тема): контраст не меньше 4.5`, async ({ page, context }) => {
    test.slow();
    await openOs(page, NAME);
    const dec = await decoder(context);
    const walls = await page.evaluate(() => Object.keys(WALLS));
    await page.evaluate((d) => setS('dark', d), dark);
    for (const w of walls) {
      await setWall(page, w);
      await page.evaluate(() => { showLock(); NOTIFS = []; notify('clock', 'Будильник 07:00', 'Подъём'); });
      await page.waitForTimeout(350);
      const card = page.locator('#lock-notifs .n-card').first();
      const r1 = await textContrast(page, dec, await card.locator('.n-title').boundingBox(), '#lock-notifs .n-card .n-main');
      expect(r1.ratio, `${w}: уведомление на блокировке ${JSON.stringify(r1)}`).toBeGreaterThanOrEqual(4.5);
      await page.evaluate(() => showHome());
      await page.waitForTimeout(150);
      for (const id of ['mail', 'files']) {
        const lab = page.locator(`#home-grid .app-icon[data-app="${id}"] .app-label`);
        const r = await textContrast(page, dec, await lab.boundingBox(), `#home-grid .app-icon[data-app="${id}"] .app-label`);
        expect(r.ratio, `${w}: подпись «${id}» ${JSON.stringify(r)}`).toBeGreaterThanOrEqual(4.5);
      }
      await page.evaluate(() => notify('messages', 'Аня', 'Привет! Как проект?'));
      await page.waitForTimeout(900);
      const r3 = await textContrast(page, dec, await page.locator('.banner .n-title').boundingBox(), '.banner .n-main');
      expect(r3.ratio, `${w}: баннер ${JSON.stringify(r3)}`).toBeGreaterThanOrEqual(4.5);
      await page.evaluate(() => document.querySelectorAll('.banner').forEach((b) => b.remove()));
    }
  });
}

test('неизвестные обои в тёмной теме (старая запись) не роняют страницу: поиск, пружина и пункт управления на месте', async ({ page }) => {
  const errors = await openOs(page, NAME);
  await page.evaluate(() => localStorage.setItem('ios26.settings', JSON.stringify({ wallpaper: 'mint', dark: true })));
  await page.reload();
  await page.waitForTimeout(300);
  expect(errors, errors.join('\n')).toEqual([]);
  expect(await page.evaluate(() => [typeof openSpot, Wall.ready(), !!document.querySelector('#control-center .cc-back')])).toEqual(['function', true, true]);
});

test('пока стекло едет, под ним размытие, а не пустота: баннер, карточки центра уведомлений, плитки пункта управления', async ({ page }) => {
  await openOs(page, NAME);
  await unlock(page);
  const bf = (sel) => page.evaluate((s) => getComputedStyle(document.querySelector(s)).backdropFilter, sel);
  await page.evaluate(() => notify('messages', 'Аня', 'Привет'));
  await page.waitForTimeout(120);
  expect(await bf('.banner .n-card'), 'баннер въезжает без размытия').toMatch(/blur\(\d/);
  await page.evaluate(() => { document.querySelectorAll('.banner').forEach((b) => b.remove()); openNC(); });
  await page.waitForTimeout(120);
  expect(await bf('#nc-list .n-card'), 'карточки центра уведомлений едут без размытия').toMatch(/blur\(\d/);
  await page.evaluate(() => closeNC());
  await page.waitForTimeout(700);
  // плитки пункта управления едут над размытым слоем .cc-back (свой фильтр в движении - кадры по 33 мс)
  await page.evaluate(() => openCC());
  await page.waitForTimeout(120);
  expect(await bf('#control-center .cc-back'), 'под плитками нет размытого слоя').toMatch(/blur\(\d/);
  expect(+(await page.evaluate(() => getComputedStyle(document.querySelector('#control-center .cc-back')).opacity)), 'размытый слой ещё прозрачный').toBeGreaterThan(0.3);
});

// Ревью просило возвращать стекло по 1-2 элемента за кадр. Замер процессора (3 открытия пункта управления):
// по 2 за кадр - 3.9 с, по 4 - 3.4 с, разом - 3.1 с: каждый шаг заново считает уже включённые цепочки.
// Поэтому закон обратный: стекло возвращается одним шагом, без лесенки пересчётов.
test('стекло после движения возвращается одним шагом в следующем кадре, без лесенки пересчётов', async ({ page }) => {
  await openOs(page, NAME);
  await unlock(page);
  await page.evaluate(() => openCC());
  await glassReady(page, '#control-center [data-cc="rotation"]');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(900);
  const steps = await page.evaluate(async () => {
    const els = [...document.querySelectorAll('#control-center .lg')];
    const full = () => els.filter((e) => getComputedStyle(e).backdropFilter.includes('url(')).length;
    openCC();
    const seen = []; let prev = full();
    await new Promise((done) => { const t0 = performance.now(); const f = () => { const n = full(); if (n !== prev) { seen.push(n - prev); prev = n; } if (performance.now() - t0 < 2200) requestAnimationFrame(f); else done(); }; requestAnimationFrame(f); });
    return { seen, total: els.length, end: prev };
  });
  expect(steps.end, 'стекло вернулось не на все плитки').toBe(steps.total);
  expect(steps.seen, `стекло возвращалось лесенкой: ${steps.seen}`).toEqual([steps.total]);
});

test('миниатюры обоев в «Настройках» нарисованы, «Жемчуг» не белое на белом', async ({ page }) => {
  await openOs(page, NAME);
  await unlock(page);
  const s = await open(page, 'settings');
  await s.locator('[data-page="wall"]').click();
  await page.waitForTimeout(200);
  const th = await page.evaluate(() => [...document.querySelectorAll('#app-settings canvas.wall-th')].map((c) => {
    const x = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let a = 0, v = 0;
    for (let i = 0; i < x.length; i += 16) { a += x[i + 3]; v += Math.abs(x[i] - x[i + 2]) + (255 - x[i + 1]); }
    return { k: c.dataset.th, w: c.width, alpha: a / (x.length / 16), tone: v / (x.length / 16) };
  }));
  expect(th.length).toBeGreaterThanOrEqual(6);
  for (const t of th) {
    expect(t.w, t.k + ': холст не нарисован').not.toBe(300);
    expect(t.alpha, t.k + ': пустой холст').toBeGreaterThan(250);
  }
  expect(th.find((t) => t.k === 'pearl').tone, '«Жемчуг» без цвета').toBeGreaterThan(8);
});

test('«Поиск»: поле внизу, буквы сразу после нажатия не теряются, Escape закрывает', async ({ page }) => {
  await openOs(page, NAME);
  await unlock(page);
  await page.click('#home-search');
  await page.keyboard.type('каль');
  await expect(page.locator('#sp-input')).toHaveValue('каль');
  await expect(page.locator('#sp-res [data-app="calc"]')).toBeVisible();
  const box = await page.locator('.sp-box').boundingBox(), d = await page.locator('#device').boundingBox();
  expect(box.y, 'поле поиска не внизу').toBeGreaterThan(d.y + d.height * 0.6);
  await page.keyboard.press('Escape');
  await expect(page.locator('#spotlight')).not.toHaveClass(/open/);
});

test('копии экранов в переключателе без служебных классов движения', async ({ page }) => {
  await openOs(page, NAME);
  await unlock(page);
  await open(page, 'notes');
  await page.evaluate(() => { LG.moving(screens.notes.el, 5000); screens.notes.el.classList.add('closing'); openSwitcher(); });
  expect(await page.evaluate(() => document.querySelectorAll('#switcher .lg-moving, #switcher .closing, #switcher .lg-under').length)).toBe(0);
});

test('«Меньше стекла» - текстуры не пекутся вовсе', async ({ page }) => {
  await openOs(page, NAME);
  await page.evaluate(() => localStorage.setItem('ios26.settings', JSON.stringify({ glass: false })));
  await page.reload();
  await page.keyboard.press('Enter');
  await page.evaluate(() => openCC());
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => LG.stats.bakes)).toBe(0);
});

test('«понижение прозрачности» в системе - плотная подложка без стекла', async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] });
  await openOs(page, NAME);
  await unlock(page);
  await page.waitForTimeout(600);
  const r = await page.evaluate(() => { const s = getComputedStyle(document.getElementById('dock')); const a = s.backgroundColor.match(/[\d.]+/g).map(Number); return [LG.stats.bakes, a.length > 3 ? a[3] : 1]; });
  expect(r[0], 'текстуры пеклись').toBe(0);
  expect(r[1], 'подложка прозрачная').toBeGreaterThan(0.85);
});

test('число фильтров в документе ограничено, сколько бы форм ни было', async ({ page }) => {
  await openOs(page, NAME);
  await unlock(page);
  const n = await page.evaluate(async () => {
    const d = document.createElement('div'); d.style.cssText = 'position:absolute;left:10px;top:200px;height:40px;border-radius:12px;z-index:400';
    $('home-page').appendChild(d); LG.add(d, 'card');
    const idle = () => new Promise((r) => { const t = setInterval(() => { if (LG.idle()) { clearInterval(t); r(); } }, 10); });
    for (let w = 60; w < 300; w += 3) { d.style.width = w + 'px'; LG.sync(d); await idle(); }
    return document.querySelectorAll('filter[id^="lgf"]').length;
  });
  expect(n, 'фильтры копятся без предела').toBeLessThanOrEqual(64);
});

test('часы блокировки не пересчитывают тон по обоям каждую секунду', async ({ page }) => {
  await openOs(page, NAME);
  await page.waitForTimeout(500);
  const calls = await page.evaluate(async () => { let n = 0; const o = Wall.sample; Wall.sample = function (...a) { n++; return o.apply(this, a); }; await new Promise((r) => setTimeout(r, 2600)); Wall.sample = o; return n; });
  expect(calls).toBe(0);
});

test('жесты идут за пальцем: пункт управления, центр уведомлений, сворачивание программы', async ({ page }) => {
  await openOs(page, NAME);
  await unlock(page);
  const d = await page.locator('#device').boundingBox();
  const k = d.width / 393;
  // пункт управления: тянем вниз из правого верхнего угла и держим
  await page.mouse.move(d.x + d.width * 0.8, d.y + 15); await page.mouse.down();
  await page.mouse.move(d.x + d.width * 0.8, d.y + 15 + 160 * k, { steps: 6 });
  const mid = await page.evaluate(() => [+getComputedStyle(document.querySelector('.cc-back')).opacity, document.querySelector('.cc-grid').getBoundingClientRect().bottom - document.getElementById('screen').getBoundingClientRect().top]);
  expect(mid[0], 'фон пункта управления не идёт за пальцем').toBeGreaterThan(0.1);
  expect(mid[0]).toBeLessThan(0.95);
  expect(mid[1], 'плитки не выехали за пальцем').toBeGreaterThan(20);
  await page.mouse.move(d.x + d.width * 0.8, d.y + 15 + 300 * k, { steps: 4 }); await page.mouse.up();
  await expect(page.locator('#control-center')).toHaveClass(/open/);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  // центр уведомлений: слева сверху
  await page.mouse.move(d.x + d.width * 0.2, d.y + 15); await page.mouse.down();
  await page.mouse.move(d.x + d.width * 0.2, d.y + 15 + 200 * k, { steps: 6 });
  const ncBottom = await page.evaluate(() => document.getElementById('nc').getBoundingClientRect().bottom - document.getElementById('screen').getBoundingClientRect().top);
  expect(ncBottom, 'центр уведомлений не идёт за пальцем').toBeGreaterThan(100 * k);
  await page.mouse.up();
  await expect(page.locator('#nc')).toHaveClass(/open/);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  // программа: тянем вверх от полоски - экран уменьшается за пальцем, отпустили - свернулась
  const s = await open(page, 'notes');
  await page.waitForTimeout(600);
  await page.mouse.move(d.x + d.width / 2, d.y + d.height - 12); await page.mouse.down();
  await page.mouse.move(d.x + d.width / 2, d.y + d.height - 12 - 200 * k, { steps: 8 });
  const w = (await s.boundingBox()).width;
  expect(w, 'экран программы не уменьшается за пальцем').toBeLessThan(d.width * 0.92);
  await page.mouse.up();
  await expect(s).toBeHidden();
});

test('вид iOS 26: часы своими знаками, виджеты блокировки без плашек, плитка музыки, браузер, часы, сообщения', async ({ page }) => {
  await openOs(page, NAME);
  // виджеты блокировки - текст прямо на обоях, без стеклянных плашек
  expect(await page.evaluate(() => [...document.querySelectorAll('.lock-widgets .widget')].some((w) => w.classList.contains('lg')))).toBe(false);
  // цифры часов - свои скруглённые знаки (не системный шрифт): слой букв помечен
  expect(await page.evaluate(() => document.querySelector('.lock-glass').dataset.glyphs)).toBe('rounded');
  await unlock(page);
  // пункт управления: плитка музыки включает и выключает музыку
  await page.evaluate(() => openCC());
  await page.locator('#control-center [data-cc-music="play"]').click();
  expect(await page.evaluate(() => screens.music.state().playing)).toBe(true);
  await page.locator('#control-center [data-cc-music="play"]').click();
  expect(await page.evaluate(() => screens.music.state().playing)).toBe(false);
  await page.keyboard.press('Escape');
  // браузер: светлый, одна стеклянная панель с адресом внизу, страница уходит под неё
  const b = await open(page, 'browser');
  await page.waitForTimeout(700);   // раскрытие из значка закончилось
  expect(await b.getAttribute('data-light')).toBe('1');
  expect(await b.locator('.glass-bar').count()).toBe(1);
  expect(await b.locator('.glass-bar input').count()).toBe(1);
  const bar = await b.locator('.glass-bar').boundingBox(), dv = await page.locator('#device').boundingBox();
  expect(bar.y, 'панель браузера не внизу').toBeGreaterThan(dv.y + dv.height * 0.8);
  const cb = await b.locator('.safari-content').boundingBox();
  expect(cb.y + cb.height, 'страница не уходит под панель').toBeGreaterThan(bar.y + bar.height - 1);
  await page.keyboard.press('Escape');
  // часы: у вкладок значки и подписи, у выбранной - линза
  const c = await open(page, 'clock');
  expect(await c.locator('.clock-tab svg').count()).toBe(3);
  await expect(c.locator('.clock-tabs .tab-lens')).toHaveCount(1);
  await page.keyboard.press('Escape');
  // сообщения: светлые, синие и серые пузыри, кнопка «назад» - значок
  const m = await open(page, 'messages');
  expect(await m.getAttribute('data-light')).toBe('1');
  await m.locator('[data-chat="ann"]').click();
  const col = await m.evaluate((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(el.querySelector('.msg-bubble.them')).backgroundColor, getComputedStyle(el.querySelector('.msg-bubble.me')).backgroundColor, el.querySelector('[data-back]').textContent.trim()]);
  expect(col[0]).toBe('rgb(255, 255, 255)');
  expect(col[1]).toBe('rgb(233, 233, 235)');
  expect(col[2]).toBe('rgb(0, 122, 255)');
  expect(col[3], 'кнопка «назад» - текст, а не значок').toBe('');
});

// ===== Повторное ревью: строка состояния в программах, заголовок папки, плитка музыки =====
const settle = (page, sel) => page.evaluate((s) => Promise.all(document.querySelector(s).getAnimations().map((a) => a.finished.catch(() => {}))), sel);
for (const dark of [false, true]) {
  test(`строка состояния читается в каждой программе (${dark ? 'тёмная' : 'светлая'} тема): контраст времени не меньше 4.5`, async ({ page, context }) => {
    test.slow();
    await openOs(page, NAME);
    const dec = await decoder(context);
    await page.evaluate((d) => setS('dark', d), dark);
    await unlock(page);
    const views = APPS.map((id) => [id, null]).concat([['messages', 'ann']]);
    for (const [id, chat] of views) {
      await page.evaluate((x) => openApp(x), id);
      await settle(page, '#app-' + id);
      if (chat) { await page.locator(`#app-${id} [data-chat="${chat}"]`).click(); await page.waitForTimeout(100); }
      const t = page.locator(`#app-${id} [data-sb] .time`);
      const r = await textContrast(page, dec, await t.boundingBox(), `#app-${id} [data-sb] .time`);
      expect.soft(r.ratio, `${id}${chat ? ' (переписка)' : ''}: время в строке состояния ${JSON.stringify(r)}`).toBeGreaterThanOrEqual(4.5);
      await page.evaluate(() => showHome());
      await page.waitForTimeout(450);
    }
  });
}

test('заголовок папки «Игры» и надписи плитки музыки читаются на разных обоях в обеих темах', async ({ page, context }) => {
  test.slow();
  await openOs(page, NAME);
  const dec = await decoder(context);
  await unlock(page);
  for (const dark of [false, true]) {
    await page.evaluate((d) => setS('dark', d), dark);
    for (const w of ['liquid', 'pearl', 'forest']) {
      await setWall(page, w);
      await page.evaluate(() => openApp('games'));
      await page.waitForTimeout(550);
      const r1 = await textContrast(page, dec, await page.locator('.gf-title').boundingBox(), '.gf-title');
      expect.soft(r1.ratio, `${w}${dark ? ' тёмная' : ''}: заголовок папки ${JSON.stringify(r1)}`).toBeGreaterThanOrEqual(4.5);
      await page.keyboard.press('Escape');
      await page.evaluate(() => openCC());
      await glassReady(page, '#control-center [data-cc="rotation"]');
      for (const sel of ['#ccm-title', '.cc-music .ccm-a']) {
        const r = await textContrast(page, dec, await page.locator(sel).boundingBox(), sel);
        expect.soft(r.ratio, `${w}${dark ? ' тёмная' : ''}: ${sel} ${JSON.stringify(r)}`).toBeGreaterThanOrEqual(4.5);
      }
      await page.keyboard.press('Escape');
      await page.waitForTimeout(600);
    }
  }
});

test('строка состояния видна поверх пункта управления, папки, поиска и переключателя', async ({ page }) => {
  await openOs(page, NAME);
  await unlock(page);
  // строка состояния своя у панели: есть, видна, с текущим временем и над её фоном (выше по наложению, чем слой размытия)
  const visibleTime = (root) => page.evaluate((r) => { const sb = document.querySelector(r + ' > [data-sb], ' + r + ' [data-sb]'); const t = sb && sb.querySelector('.time'); if (!t) return false; const b = t.getBoundingClientRect(), cs = getComputedStyle(sb); return b.width > 0 && cs.visibility === 'visible' && +cs.opacity > 0.5 && /\d\d:\d\d/.test(t.textContent); }, root);
  await page.evaluate(() => openCC()); await page.waitForTimeout(700);
  expect(await visibleTime('#control-center'), 'пункт управления').toBe(true);
  await page.keyboard.press('Escape'); await page.waitForTimeout(600);
  await page.evaluate(() => openApp('games')); await page.waitForTimeout(500);
  expect(await visibleTime('#games-folder'), 'папка').toBe(true);
  await page.keyboard.press('Escape');
  await page.click('#home-search'); await page.waitForTimeout(500);
  expect(await visibleTime('#spotlight'), 'поиск').toBe(true);
  await page.keyboard.press('Escape');
  await page.evaluate(() => { openApp('notes'); }); await page.waitForTimeout(600);
  await page.evaluate(() => openSwitcher()); await page.waitForTimeout(400);
  expect(await visibleTime('#switcher'), 'переключатель').toBe(true);
});
