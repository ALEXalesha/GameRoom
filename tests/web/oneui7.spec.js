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
  test.setTimeout(90000);   // 15 программ по очереди
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

// ===== Второй этап: «Мои файлы» на IndexedDB, уведомления, недавние приложения, пауза в фоне =====
async function reloadPhone(page) {
  await page.waitForFunction(() => dbPending === 0);
  await page.reload();
  await unlock(page);
}

test('«Мои файлы»: папка и документ переживают перезагрузку, переименование, корзина, импорт; «Галерея» видит картинки', async ({ page }) => {
  await openOs(page, NAME);
  await unlock(page);
  let a = await openFromDrawer(page, 'files');
  await a.locator('.f-root').click();
  await a.locator('[data-p="Документы"]').click();
  await a.locator('[data-a="more"]').click();
  await page.locator('.o-sheet button', { hasText: 'Создать папку' }).click();
  await page.locator('.o-dlg input').fill('Архив');
  await page.locator('.o-dlg input').press('Enter');
  await expect(a.locator('[data-p="Документы/Архив"]')).toBeVisible();
  await a.locator('[data-a="more"]').click();
  await page.locator('.o-sheet button', { hasText: 'Создать текстовый файл' }).click();
  await a.locator('[name=fvtext]').fill('важная мысль');
  await a.locator('[data-a="back"]').click();
  await expect(a.locator('[data-p="Документы/Документ.txt"]')).toBeVisible();
  await a.locator('[data-p="Документы/Документ.txt"]').click({ button: 'right' });
  await page.locator('.o-sheet button', { hasText: 'Переименовать' }).click();
  await page.locator('.o-dlg input').fill('мысль.txt');
  await page.locator('.o-dlg [data-r="1"]').click();
  await expect(a.locator('[data-p="Документы/мысль.txt"]')).toBeVisible();
  await a.locator('[data-p="Документы/Список покупок.txt"]').click({ button: 'right' });
  await page.locator('.o-sheet button', { hasText: 'Удалить' }).click();
  await expect(a.locator('[data-p="Документы/Список покупок.txt"]')).toHaveCount(0);
  await a.locator('[data-a="back"]').click();
  await a.locator('[data-a="back"]').click();
  await a.locator('[data-d="__trash"]').click();
  await expect(a).toContainText('Список покупок.txt');
  await a.locator('[data-a="restore"]').click();
  await expect(a).toContainText('Корзина пуста');
  await a.locator('[data-a="back"]').click();
  await a.locator('[data-d="Изображения"]').click();
  await a.locator('.f-in').setInputFiles({ name: 'кадр.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="red"/></svg>') });
  await expect(a.locator('[data-p="Изображения/кадр.svg"] img')).toHaveCount(1);
  await expect(page.locator('.heads-up')).toContainText('Файлы добавлены');
  await reloadPhone(page);
  expect(await page.evaluate(() => [FS.get('Документы/Архив').type, FS.get('Документы/мысль.txt').text, FS.has('Документы/Список покупок.txt'), FS.has('Изображения/кадр.svg')])).toEqual(['dir', 'важная мысль', true, true]);
  a = await openFromDrawer(page, 'gallery');
  expect(await page.evaluate(() => loadPhotos().filter((p) => p.fs).length)).toBe(3);
  await expect(a.locator('.gal-tile')).toHaveCount(await page.evaluate(() => loadPhotos().length));
});

test('уведомления: карточка сверху от камеры открывает «Галерею», шторка хранит её, «Не беспокоить» глушит, на блокировке видны', async ({ page }) => {
  await openOs(page, NAME);
  await unlock(page);
  let a = await openFromDrawer(page, 'camera');
  await a.locator('[data-a="shoot"]').click();
  await expect(page.locator('.heads-up')).toContainText('Снимок сохранён');
  await page.locator('.heads-up').click();
  await expect(app(page).locator('.app-title')).toHaveText(/Галерея/);
  await home(page);
  await page.evaluate(() => notify('clock', 'Будильник 07:00', 'Подъём'));
  await page.locator('#homescreen .statusbar').click();
  await expect(page.locator('#notif-section')).toContainText('Будильник 07:00');
  await page.click('[data-shade="qs"]');
  await page.click('[data-qs="dnd"]');
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => { document.querySelectorAll('.heads-up').forEach((x) => x.remove()); notify('clock', 'Тихо', 'без карточки'); return document.querySelectorAll('.heads-up').length; })).toBe(0);
  await page.click('#power-btn');
  await expect(page.locator('#lock-notifs .ln-card').first()).toContainText('Тихо');
  await page.locator('#lock-notifs .ln-card').first().click();
  await expect(app(page)).toHaveClass(/open/);
});

test('недавние приложения: долгое нажатие на полоску и жест с задержкой, карточка открывает, смахивание и «Закрыть все»', async ({ page }) => {
  await openOs(page, NAME);
  await unlock(page);
  await openFromDrawer(page, 'notes');
  await home(page);
  await openFromDrawer(page, 'calculator');
  // долгое нажатие на полоску навигации
  await app(page).locator('[data-a="home"]').click({ delay: 700 });
  await expect(page.locator('#recents')).toHaveClass(/open/);
  await expect(page.locator('.rc-card')).toHaveCount(2);
  await expect(page.locator('.rc-card').first()).toHaveAttribute('data-rc', 'calculator');
  await page.locator('.rc-card[data-rc="notes"]').click();
  await expect(page.locator('#recents')).not.toHaveClass(/open/);
  await expect(app(page).locator('.app-title')).toHaveText('Заметки');
  const b = await page.locator('#phone').boundingBox();
  // сбоку от полоски, чтобы не сработало долгое нажатие на неё
  await page.mouse.move(b.x + b.width * 0.2, b.y + b.height - 20);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.2, b.y + b.height - 160, { steps: 5 });
  await page.waitForTimeout(500);
  await page.mouse.up();
  await expect(page.locator('#recents')).toHaveClass(/open/);
  await page.locator('.rc-card[data-rc="calculator"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const card = await page.locator('.rc-card[data-rc="calculator"]').boundingBox();
  await dragFrom(page, card.x + card.width / 2, card.y + card.height / 2, 0, -250);
  await expect(page.locator('.rc-card[data-rc="calculator"]')).toHaveCount(0);
  expect(await page.evaluate(() => RECENTS)).toEqual(['notes']);
  await page.click('#rc-close-all');
  await expect(page.locator('#recents')).not.toHaveClass(/open/);
  expect(await page.evaluate(() => [RECENTS.length, state.app])).toEqual([0, null]);
});

test('скрытая вкладка ставит музыку и анимации на паузу, возврат продолжает', async ({ page }) => {
  await openOs(page, NAME);
  await unlock(page);
  await openFromDrawer(page, 'music');
  await page.evaluate(() => mPlay());
  expect(await page.evaluate(() => music.playing)).toBe(true);
  const setHidden = (h) => page.evaluate((v) => { Object.defineProperty(document, 'hidden', { value: v, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }, h);
  await setHidden(true);
  await expect(page.locator('body')).toHaveClass(/paused/);
  expect(await page.evaluate(() => music.playing)).toBe(false);
  await setHidden(false);
  expect(await page.evaluate(() => music.playing)).toBe(true);
});

test('собранная страница совпадает с исходниками в src/', async () => {
  const built = fs.readFileSync(path.join(WEB, NAME, 'index.html'), 'utf8');
  for (const f of ['kit.js', 'kit.css', 'extra.css']) expect(built.includes(fs.readFileSync(path.join(WEB, NAME, 'src', f), 'utf8')), f + ' не собран в index.html').toBe(true);
});

// ===== Замечания ревьюера =====
const vm = require('vm');
const GAMES = (() => { const ctx = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(WEB, '_os-shared', 'games.js'), 'utf8'), ctx); return ctx.window.OS_GAMES; })();
const lum = (rgb) => { const [r, g, b] = rgb.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

test('часы: цифры идут, а кнопки не пересоздаются (нажатия не теряются)', async ({ page }) => {
  await openOs(page, NAME);
  await unlock(page);
  const a = await openFromDrawer(page, 'clock');
  await a.locator('[data-tab="stop"]').click();
  await a.locator('[data-a="swgo"]').click();   // само нажатие перерисовывает (Старт → Стоп), дальше - только цифры
  const btn = await a.locator('[data-a="swgo"]').elementHandle();
  await page.waitForTimeout(700);
  expect(await btn.evaluate((b) => b.isConnected), 'кнопка «Старт» пересоздана перерисовкой').toBe(true);
  const t1 = await a.locator('#sw').textContent(); await page.waitForTimeout(300);
  expect(await a.locator('#sw').textContent()).not.toBe(t1);
  await a.locator('[data-tab="world"]').click();
  const row = await a.locator('[data-tz]').first().elementHandle();
  await page.waitForTimeout(600);
  expect(await row.evaluate((r) => r.isConnected)).toBe(true);
});

test('таймер доходит до конца и при закрытых «Часах»: уведомление «Время вышло»', async ({ page }) => {
  await openOs(page, NAME);
  await unlock(page);
  const a = await openFromDrawer(page, 'clock');
  await a.locator('[data-tab="timer"]').click();
  await page.evaluate(() => { views.clock.timerLeft = 500; });
  await a.locator('[data-a="tstart"]').click();
  await home(page);
  await expect(page.locator('.heads-up')).toContainText('Время вышло');
  expect(await page.evaluate(() => views.clock.timerRun)).toBeNull();
});

test('«Закрыть все» в недавних останавливает музыку', async ({ page }) => {
  await openOs(page, NAME);
  await unlock(page);
  const a = await openFromDrawer(page, 'music');
  await a.locator('[data-a="play"]').click();
  expect(await page.evaluate(() => music.playing)).toBe(true);
  await page.evaluate(() => openRecents());
  await page.click('#rc-close-all');
  expect(await page.evaluate(() => music.playing)).toBe(false);
});

test('всплывающая карточка не ложится поверх шторки и недавних и не дублирует карточку в шторке', async ({ page }) => {
  await openOs(page, NAME);
  await unlock(page);
  // сама карточка уходит через 4,5 с, поэтому считаем сразу, без ожидания
  const hu = () => page.evaluate(() => document.querySelectorAll('.heads-up:not(.out)').length);
  await page.evaluate(() => { openShade(); notify('messages', 'Боря', 'при открытой шторке'); });
  expect(await hu(), 'карточка поверх открытой шторки').toBe(0);
  await expect(page.locator('#notif-section')).toContainText('при открытой шторке');
  await page.evaluate(() => { closeShade(); notify('messages', 'Боря', 'на экране'); });
  expect(await hu()).toBe(1);
  await page.evaluate(() => openShade());
  expect(await hu(), 'шторка открылась, а карточка осталась поверх - дубль').toBe(0);
  await page.evaluate(() => { closeShade(); openRecents(); notify('messages', 'Боря', 'при недавних'); });
  expect(await hu(), 'карточка поверх недавних').toBe(0);
});

test('«Мои файлы»: после долгого нажатия следующий обычный щелчок открывает папку', async ({ page }) => {
  await openOs(page, NAME);
  await unlock(page);
  const a = await openFromDrawer(page, 'files');
  await a.locator('.f-root').click();
  await a.locator('[data-p="Документы"]').click();
  const row = a.locator('[data-p="Документы/Учёба"]');
  const b = await row.boundingBox();
  await page.mouse.move(b.x + 60, b.y + b.height / 2);
  await page.mouse.down(); await page.waitForTimeout(750); await page.mouse.up();
  await expect(page.locator('.o-dlg-back.bottom')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('.o-dlg-back')).toHaveCount(0);
  await row.click();
  await expect(a.locator('.app-title')).toHaveText('Учёба');
});

test('яркость из «Настроек» видна и в шторке; «Откл.» в быстрых настройках читается', async ({ page }) => {
  await openOs(page, NAME);
  await unlock(page);
  const a = await openFromDrawer(page, 'settings');
  await a.locator('[data-p="display"]').click();
  await a.locator('[name="brightness"]').evaluate((r) => { r.value = 50; r.dispatchEvent(new Event('input', { bubbles: true })); });
  await home(page);
  await page.evaluate(() => openShade('qs'));
  expect(await page.locator('#bright-fill').evaluate((e) => e.style.width)).toBe('50%');
  const off = page.locator('.qs-tile:not(.on) .qs-state').first();
  await expect(off).toHaveText('Откл.');
  const st = await off.evaluate((e) => { const s = getComputedStyle(e); return [parseFloat(s.fontSize), parseFloat(s.opacity), s.color]; });
  expect(st[0]).toBeGreaterThanOrEqual(11);
  expect(st[1]).toBe(1);
  const alpha = +(st[2].match(/rgba\(.*,\s*([\d.]+)\)/) || [0, 1])[1];
  expect(alpha, 'подпись «Откл.» слишком бледная').toBeGreaterThanOrEqual(0.75);
});

test('светлая тема и цвет акцента: включаются в «Дисплее», текст читается, переживают перезагрузку', async ({ page }) => {
  await openOs(page, NAME);
  await unlock(page);
  let a = await openFromDrawer(page, 'settings');
  await a.locator('[data-p="display"]').click();
  await a.locator('[data-k="light"]').click();
  await expect(page.locator('body')).toHaveClass(/light/);
  await a.locator('[data-a="accent"][data-c="green"]').click();
  const bg = await a.locator('.app-screen').evaluate((e) => getComputedStyle(e).backgroundColor);
  expect(lum(bg), 'фон программы в светлой теме').toBeGreaterThan(0.8);
  for (const sel of ['.app-title', '.o-title']) {
    const c = await a.locator(sel).first().evaluate((e) => getComputedStyle(e).color);
    expect(contrast(c, bg), sel + ' на светлом фоне').toBeGreaterThanOrEqual(4.5);
  }
  expect(await a.locator('.o-toggle.on').first().evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(19, 122, 75)');
  // белый текст на любом акценте читается
  for (const c of await page.evaluate(() => Object.values(ACCENTS).map((x) => x.c))) {
    const rgb = 'rgb(' + [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)).join(',') + ')';
    expect(contrast(rgb, 'rgb(255,255,255)'), 'акцент ' + c).toBeGreaterThanOrEqual(4.5);
  }
  await page.evaluate(() => openShade('qs'));
  const tile = page.locator('.qs-tile:not(.on)').first();
  const tb = await tile.evaluate((e) => getComputedStyle(e).backgroundColor);
  expect(contrast(await tile.locator('.qs-name').evaluate((e) => getComputedStyle(e).color), tb)).toBeGreaterThanOrEqual(4.5);
  await page.reload();
  await expect(page.locator('body')).toHaveClass(/light/);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim())).toBe('#137a4b');
});

test('вид: разделы «Моих файлов» нарисованы, без эмодзи; док не повторяет значки экрана', async ({ page }) => {
  await openOs(page, NAME);
  await unlock(page);
  const dock = await page.locator('#dock [data-open]').evaluateAll((els) => els.map((e) => e.dataset.open));
  const pages = await page.locator('#home-pages [data-open]').evaluateAll((els) => els.map((e) => e.dataset.open));
  expect(dock.filter((id) => pages.includes(id)), 'значки дока повторяются на экране').toEqual([]);
  const a = await openFromDrawer(page, 'files');
  expect(await a.innerText()).not.toMatch(/\p{Extended_Pictographic}/u);
  await expect(a.locator('.f-cat svg')).toHaveCount(5);
});

test('папка «Игры» на втором экране, игра на весь экран из соседней папки, выход жестом и нажатием на полоску', async ({ page }) => {
  const errors = await openOs(page, NAME);
  await unlock(page);
  await page.locator('#page-indicator [data-page="1"]').click();
  await page.locator('#home-pages [data-folder="games"]').click();
  await expect(page.locator('#games-folder')).toHaveClass(/open/);
  for (const g of GAMES) await expect(page.locator(`#games-folder [data-open="game-${g.id}"]`)).toContainText(g.title);
  const g = GAMES.find((x) => x.id === 'dino');
  await page.click(`#games-folder [data-open="game-${g.id}"]`);
  const lay = page.locator(`#game-layer [data-g="game-${g.id}"]`);
  await expect(lay).toBeVisible();
  await expect(lay.locator('iframe')).toHaveAttribute('src', `../${g.dir}/index.html`);
  const fb = await lay.locator('iframe').boundingBox(), sb = await page.locator('#screen').boundingBox();
  expect(fb.width / sb.width).toBeGreaterThan(0.98);
  expect(fb.height / sb.height).toBeGreaterThan(0.9);
  const gb = await lay.locator('.game-bar').boundingBox();
  await dragFrom(page, gb.x + gb.width / 2, gb.y + gb.height / 2, 0, -300);
  await expect(lay).toBeHidden();
  expect(await page.evaluate(() => state.app)).toBeNull();
  await page.evaluate(() => openApp('game-dino'));
  await expect(lay).toBeVisible();
  await lay.locator('.game-bar .nav-pill').click();
  await expect(lay).toBeHidden();
  expect(errors).toEqual([]);
});

test('пауза игры по протоколу: ушли домой - игровое время стоит, вернулись - паузу снимает игрок, закрыли - рамки нет', async ({ page }) => {
  await openOs(page, NAME);
  await unlock(page);
  await page.evaluate(() => { addGame({ id: 'stub', title: 'Заглушка', colors: ['#444', '#222'], glyph: 'star', src: '../_os-shared/pause-stub.html' }); openApp('game-stub'); });
  await expect.poll(() => page.frames().some((f) => f.url().includes('pause-stub.html'))).toBe(true);
  const f = page.frames().find((x) => x.url().includes('pause-stub.html'));
  await expect.poll(() => f.evaluate(() => window.stub && window.stub.frames)).toBeGreaterThan(5);
  await page.evaluate(() => closeApp());
  await page.waitForTimeout(150);
  let t = await f.evaluate(() => stub.time); await page.waitForTimeout(600);
  expect(await f.evaluate(() => stub.time), 'игровое время в свёрнутой игре').toBe(t);
  await page.evaluate(() => openApp('game-stub'));
  await page.waitForTimeout(150);
  t = await f.evaluate(() => stub.time); await page.waitForTimeout(300);
  expect(await f.evaluate(() => stub.time)).toBe(t);
  await page.locator('#game-layer [data-g="game-stub"] iframe').click({ position: { x: 100, y: 100 } });
  await expect.poll(() => f.evaluate(() => stub.time)).toBeGreaterThan(t);
  await page.evaluate(() => { openRecents(); });
  await page.click('#rc-close-all');
  await expect(page.locator('#game-layer iframe')).toHaveCount(0);
});

test('«Сбросить всё» стирает и файлы; Escape закрывает окно имени, даже если фокус ушёл с поля', async ({ page }) => {
  await openOs(page, NAME);
  await unlock(page);
  await page.evaluate(() => makeDir('Документы/Удалить меня'));
  await page.waitForFunction(() => dbPending === 0);
  const a = await openFromDrawer(page, 'files');
  await a.locator('.f-root').click();
  await a.locator('[data-p="Документы"]').click();
  await a.locator('[data-a="more"]').click();
  await page.locator('.o-sheet button', { hasText: 'Создать папку' }).click();
  await page.locator('.o-dlg b').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.o-dlg-back')).toHaveCount(0);
  await expect(a.locator('.app-title')).toHaveText('Документы');
  await home(page);
  const s = await openFromDrawer(page, 'settings');
  await s.locator('[data-p="about"]').click();
  await Promise.all([page.waitForNavigation(), s.locator('[data-a="reset"]').click()]);
  await expect.poll(() => page.evaluate(() => typeof FS !== 'undefined' && FS.has('Документы/Учёба'))).toBe(true);
  expect(await page.evaluate(() => FS.has('Документы/Удалить меня'))).toBe(false);
});

test('файлы: возврат с цепочкой удалённых папок; мало места - уведомление и откат; две вкладки видят корзины друг друга', async ({ page, context }) => {
  await openOs(page, NAME);
  await unlock(page);
  await page.evaluate(() => { makeDir('Документы/Учёба/Физика'); writeFile('Документы/Учёба/Физика/опыт.txt', 'маятник');
    trashPath('Документы/Учёба/Физика/опыт.txt'); trashPath('Документы/Учёба/Физика'); trashPath('Документы/Учёба'); restoreTrash(TRASH[0].id); });
  expect(await page.evaluate(() => ['Документы/Учёба', 'Документы/Учёба/Физика'].map((p) => FS.get(p) && FS.get(p).type).concat(FS.has('Документы/Учёба/Физика/опыт.txt')))).toEqual(['dir', 'dir', true]);
  await page.waitForFunction(() => dbPending === 0);
  const p2 = await context.newPage();
  await p2.goto(page.url());
  await p2.waitForFunction(() => typeof fdb !== 'undefined' && FS.size > 0);
  const before = await p2.evaluate(() => TRASH.length);
  await page.evaluate(() => trashPath('Документы/Список покупок.txt'));
  await expect.poll(() => p2.evaluate(() => TRASH.length)).toBe(before + 1);
  await page.evaluate(() => { IDBObjectStore.prototype.put = function () { throw new DOMException('мало', 'QuotaExceededError'); }; writeFile('Документы/большой.txt', 'x'); });
  await expect(page.locator('.heads-up')).toContainText('Не сохранено: мало места');
  await expect.poll(() => page.evaluate(() => FS.has('Документы/большой.txt'))).toBe(false);
});
