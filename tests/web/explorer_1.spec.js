// Законы explorer_1: навигация, поиск не сбивает выбор, файлы и папки создаются, правятся
// и переживают перезагрузку, режим настоящей папки работает (на поддельной папке), всё в экране.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { WEB } = require('../helpers');
const { openOs, expectInside, expectNoPageOverflow } = require('./_os-helpers');

const NAME = 'explorer_1';
const row = (page, name) => page.locator(`.file-row[data-name="${name}"]`);

// Поддельная папка «с диска» вместо окна выбора папки (его нельзя нажать из проверки).
function fakeDisk() {
  class FakeFile {
    constructor(name, text) { this.kind = 'file'; this.name = name; this.text = text; }
    async getFile() { return new File([this.text], this.name, { type: 'text/plain', lastModified: 0 }); }
    async createWritable() { let buf = ''; return { write: async (s) => { buf += s; }, close: async () => { this.text = buf; } }; }
  }
  class FakeDir {
    constructor(name, list) { this.kind = 'directory'; this.name = name; this.map = new Map(list.map((h) => [h.name, h])); }
    async *entries() { for (const e of this.map) yield e; }
    async getDirectoryHandle(n, o = {}) { if (!this.map.has(n) && o.create) this.map.set(n, new FakeDir(n, [])); const h = this.map.get(n); if (!h || h.kind !== 'directory') throw new Error('нет папки ' + n); return h; }
    async getFileHandle(n, o = {}) { if (!this.map.has(n) && o.create) this.map.set(n, new FakeFile(n, '')); const h = this.map.get(n); if (!h) throw new Error('нет файла ' + n); return h; }
    async removeEntry(n) { this.map.delete(n); }
  }
  const root = new FakeDir('МояПапка', [new FakeDir('src', [new FakeFile('main.js', 'console.log(1)')]), new FakeFile('todo.txt', 'дело')]);
  window.__fakeRoot = root;
  window.showDirectoryPicker = async () => root;
}

test('открывается без сети, шрифты системные, пометка фан-концепта есть', async ({ page }) => {
  const errors = await openOs(page, NAME);
  await expect(page).toHaveTitle(/не связан с Microsoft\/Apple\/Samsung/);
  const font = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  expect(font).not.toMatch(/IBM Plex|JetBrains/);
  await page.click('#btn-about');
  await expect(page.locator('.modal')).toContainText('не связан с Microsoft/Apple/Samsung');
  await page.keyboard.press('Escape');
  await expect(page.locator('.modal')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('навигация: двойной щелчок в папку, назад, вперёд, вверх, хлебные крошки', async ({ page }) => {
  await openOs(page, NAME);
  await row(page, 'Документы').dblclick();
  await expect(page.locator('#breadcrumbs')).toHaveText(/Этот компьютер›Документы/);
  await row(page, 'Учёба').dblclick();
  await expect(row(page, 'физика.md')).toBeVisible();
  await page.click('#btn-back');
  await expect(row(page, 'Учёба')).toBeVisible();
  await page.click('#btn-forward');
  await expect(row(page, 'физика.md')).toBeVisible();
  await page.click('#btn-up');
  await page.locator('.crumb', { hasText: 'Этот компьютер' }).click();
  await expect(row(page, 'readme.txt')).toBeVisible();
  // клавиатура: стрелка выбирает, Enter открывает, Backspace поднимается
  await page.keyboard.press('ArrowDown');
  await expect(row(page, 'Документы')).toHaveClass(/selected/);
  await page.keyboard.press('Enter');
  await expect(row(page, 'Учёба')).toBeVisible();
  await page.keyboard.press('Backspace');
  await expect(row(page, 'readme.txt')).toBeVisible();
});

test('при поиске открывается и удаляется именно найденный файл', async ({ page }) => {
  await openOs(page, NAME);
  await page.fill('#search', 'readme');
  await expect(page.locator('.file-row')).toHaveCount(1);
  await row(page, 'readme.txt').dblclick();
  await expect(page.locator('.modal-title')).toHaveText('readme.txt');
  await page.click('[data-close]');
  await row(page, 'readme.txt').click();
  await page.keyboard.press('Delete');
  await expect(page.locator('.modal-text')).toContainText('readme.txt');
  await page.click('[data-ok]');
  await page.fill('#search', '');
  await expect(row(page, 'readme.txt')).toHaveCount(0);
  await expect(page.locator('.file-row')).toHaveCount(4);
});

test('сортировка не сбивает выделение', async ({ page }) => {
  await openOs(page, NAME);
  await row(page, 'Документы').dblclick();
  await row(page, 'заметки.txt').click();
  await page.click('.file-header [data-sort="size"]');
  await page.click('.file-header [data-sort="size"]');
  await expect(page.locator('.file-row.selected')).toHaveCount(1);
  await expect(page.locator('.file-row.selected')).toHaveAttribute('data-name', 'заметки.txt');
});

test('новая папка, проверка имени, переименование - и всё остаётся после перезагрузки', async ({ page }) => {
  await openOs(page, NAME);
  await page.click('#btn-new-folder');
  await page.fill('.modal-input', 'плохо/имя');
  await page.click('[data-ok]');
  await expect(page.locator('.modal-error')).toContainText('не может содержать');
  await page.fill('.modal-input', 'Черновики');
  await page.keyboard.press('Enter');
  await expect(row(page, 'Черновики')).toHaveClass(/selected/);
  await page.keyboard.press('F2');
  await page.fill('.modal-input', 'Архив');
  await page.keyboard.press('Enter');
  await expect(row(page, 'Архив')).toBeVisible();
  await page.waitForFunction(() => dbPending === 0);
  await page.reload();
  await expect(row(page, 'Архив')).toBeVisible();
  await expect(row(page, 'Черновики')).toHaveCount(0);
});

test('текстовый файл правится, размер пересчитывается, правка переживает перезагрузку', async ({ page }) => {
  await openOs(page, NAME);
  await row(page, 'readme.txt').dblclick();
  await page.click('[data-edit]');
  await page.fill('textarea.preview-content', 'абв');
  await page.click('[data-save]');
  await expect(page.locator('.modal-bg')).toHaveCount(0);
  await expect(row(page, 'readme.txt').locator('.meta').first()).toHaveText('6 Б');
  await page.waitForFunction(() => dbPending === 0);
  await page.reload();
  await row(page, 'readme.txt').dblclick();
  await expect(page.locator('#preview-text')).toHaveText('абв');
});

test('контекстное меню не вылезает за край окна', async ({ page }) => {
  await openOs(page, NAME);
  await page.mouse.click(1270, 760, { button: 'right' });
  const menu = page.locator('.ctx-menu');
  await expect(menu).toBeVisible();
  await expectInside(page, menu, 'контекстное меню');
  await page.mouse.click(600, 400);
  await expect(menu).toHaveCount(0);
});

test('настоящая папка: список, вход в папку, правка файла, возврат к демо', async ({ page }) => {
  await page.addInitScript(fakeDisk);
  await openOs(page, NAME);
  await page.click('#btn-open-real');
  await expect(page.locator('#status-mode-badge')).toHaveText('ДИСК');
  await expect(row(page, 'todo.txt')).toBeVisible();
  await row(page, 'src').dblclick();
  await expect(row(page, 'main.js')).toBeVisible();
  await page.click('#btn-up');
  await row(page, 'todo.txt').dblclick();
  await page.click('[data-edit]');
  await page.fill('textarea.preview-content', 'сделано');
  await page.click('[data-save]');
  expect(await page.evaluate(() => window.__fakeRoot.map.get('todo.txt').text)).toBe('сделано');
  await page.click('.sidebar-item[data-path="/Документы"]');
  await expect(page.locator('#status-mode-badge')).toHaveText('ДЕМО');
  await expect(row(page, 'Учёба')).toBeVisible();
  await page.click('#real-root-item');
  await expect(row(page, 'todo.txt')).toBeVisible();
});

for (const size of [{ width: 1024, height: 700 }, { width: 480, height: 700 }]) {
  test(`на ${size.width}x${size.height} всё помещается, диалог не шире экрана`, async ({ page }) => {
    const errors = await openOs(page, NAME, size);
    await expectNoPageOverflow(page);
    await expectInside(page, page.locator('.toolbar'), 'панель кнопок');
    await expectInside(page, page.locator('.statusbar'), 'строка состояния');
    await page.click('#btn-new-file');
    await expectInside(page, page.locator('.modal'), 'диалог');
    await page.keyboard.press('Escape');
    expect(errors).toEqual([]);
  });
}

// ===== Второй этап: IndexedDB, корзина, копировать-вставить, файлы с диска, миниатюры =====
async function reloadEx(page) {
  await page.waitForFunction(() => dbPending === 0);
  await page.reload();
  await page.waitForFunction(() => typeof xdb !== 'undefined' && document.querySelectorAll('.file-row').length > 0);
}

test('демо-файлы живут в IndexedDB, а не в localStorage; старые данные переносятся', async ({ page }) => {
  // данные первой версии в localStorage, базы ещё нет
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('explorer_1.vfs', JSON.stringify({ name: '', type: 'folder', modified: '', children: { 'Старое': { name: 'Старое', type: 'folder', modified: '', children: {} } } })); } });
  await openOs(page, NAME);
  await expect(row(page, 'Старое')).toBeVisible();
  await page.waitForFunction(() => dbPending === 0);
  expect(await page.evaluate(() => localStorage.getItem('explorer_1.vfs'))).toBeNull();
  await page.click('#btn-new-folder');
  await page.fill('.modal-input', 'Новое');
  await page.keyboard.press('Enter');
  await reloadEx(page);
  await expect(row(page, 'Новое')).toBeVisible();
  await expect(row(page, 'Старое')).toBeVisible();
});

test('удаление идёт в корзину, оттуда возвращается; очистка корзины переживает перезагрузку', async ({ page }) => {
  await openOs(page, NAME);
  await row(page, 'readme.txt').click();
  await page.keyboard.press('Delete');
  await expect(page.locator('.modal-text')).toContainText('в корзину');
  await page.click('[data-ok]');
  await expect(row(page, 'readme.txt')).toHaveCount(0);
  await expect(page.locator('#trash-label')).toHaveText('Корзина (1)');
  await page.click('#trash-item');
  await expect(page.locator('#trash-list')).toContainText('readme.txt');
  await page.click('[data-restore]');
  await expect(page.locator('#trash-list')).toContainText('Корзина пуста');
  await page.click('[data-close]');
  await expect(row(page, 'readme.txt')).toBeVisible();
  await row(page, 'Проекты').click();
  await page.keyboard.press('Delete');
  await page.click('[data-ok]');
  await reloadEx(page);
  await expect(page.locator('#trash-label')).toHaveText('Корзина (1)');
  await page.click('#trash-item');
  await page.click('[data-empty]');
  await page.click('[data-close]');
  await reloadEx(page);
  await expect(page.locator('#trash-label')).toHaveText('Корзина');
  await expect(row(page, 'Проекты')).toHaveCount(0);
});

test('копировать и вставить, вырезать и вставить, перетаскивание на папку', async ({ page }) => {
  await openOs(page, NAME);
  await row(page, 'readme.txt').click();
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  await expect(row(page, 'readme - копия.txt')).toHaveClass(/selected/);
  await page.keyboard.press('Control+x');
  await row(page, 'Документы').dblclick();
  await page.keyboard.press('Control+v');
  await expect(row(page, 'readme - копия.txt')).toBeVisible();
  await page.click('#btn-up');
  await expect(row(page, 'readme - копия.txt')).toHaveCount(0);
  // папку нельзя вставить в саму себя
  await row(page, 'Проекты').click();
  await page.keyboard.press('Control+c');
  await row(page, 'Проекты').dblclick();
  await page.keyboard.press('Control+v');
  await expect(page.locator('.toast')).toContainText('саму себя');
  await page.click('#btn-up');
  await row(page, 'readme.txt').dragTo(row(page, 'Загрузки'));
  await expect(row(page, 'readme.txt')).toHaveCount(0);
  await row(page, 'Загрузки').dblclick();
  await expect(row(page, 'readme.txt')).toBeVisible();
  await reloadEx(page);
  expect(await page.evaluate(() => [!!state.vfs.children['Загрузки'].children['readme.txt'], !!state.vfs.children['Документы'].children['readme - копия.txt']])).toEqual([true, true]);
});

test('файлы с диска: кнопка «Добавить» и перетаскивание в окно; картинка с миниатюрой и просмотром, переживает перезагрузку', async ({ page }) => {
  await openOs(page, NAME);
  await row(page, 'Изображения').dblclick();
  await page.locator('#file-input').setInputFiles({ name: 'закат.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3"><rect width="4" height="3" fill="#f97316"/></svg>') });
  await expect(row(page, 'закат.svg').locator('img.thumb')).toHaveCount(1);
  await page.locator('.file-area').evaluate((el) => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], 'снимок.png', { type: 'image/png' }));
    el.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
    el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  await expect(row(page, 'снимок.png')).toBeVisible();
  await reloadEx(page);
  await row(page, 'Изображения').dblclick();
  await expect(row(page, 'закат.svg').locator('img.thumb')).toHaveCount(1);
  expect(await page.evaluate(() => state.vfs.children['Изображения'].children['снимок.png'].blob instanceof Blob)).toBe(true);
  await row(page, 'закат.svg').dblclick();
  await expect(page.locator('.modal .preview-content img')).toBeVisible();
});

// ===== Замечания ревьюера =====
const legacySeed = () => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('explorer_1.vfs', JSON.stringify({ name: '', type: 'folder', modified: '', children: { 'Старое': { name: 'Старое', type: 'folder', modified: '', children: { 'важное.txt': { name: 'важное.txt', type: 'file', modified: '', content: 'не потерять', size: 21 } } } } })); } };

test('перенос старых данных без правки и с перезагрузкой сразу: файлы не теряются', async ({ page }) => {
  await page.addInitScript(legacySeed);
  // первая запись в IndexedDB не удаётся (как при закрытой вкладке посреди записи): старые данные должны остаться
  await page.addInitScript(() => { if (!sessionStorage.getItem('putfail')) { sessionStorage.setItem('putfail', '1'); const put = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function () { IDBObjectStore.prototype.put = put; throw new DOMException('сорвалось', 'AbortError'); }; } });
  await openOs(page, NAME);
  await expect(row(page, 'Старое')).toBeVisible();
  await page.reload();                      // сразу, не дожидаясь записи
  await expect(row(page, 'Старое')).toBeVisible();
  await page.waitForFunction(() => dbPending === 0);
  await page.reload();
  await row(page, 'Старое').dblclick();
  await expect(row(page, 'важное.txt')).toBeVisible();
  await page.waitForFunction(() => dbPending === 0);
  expect(await page.evaluate(() => localStorage.getItem('explorer_1.vfs'))).toBeNull();
});

test('windows_4 хранит свои файлы под своим ключом и не затирает данные explorer_1', async () => {
  const src = fs.readFileSync(path.join(WEB, 'windows_4', 'apps', 'explorer.html'), 'utf8');
  expect(src).not.toContain("'explorer_1.vfs'");
  expect(src).toContain("'windows_4.explorer'");
});

test('файл с диска в настоящую папку: одноимённый не перезаписывается молча', async ({ page }) => {
  await page.addInitScript(fakeDisk);
  await openOs(page, NAME);
  await page.click('#btn-open-real');
  await expect(row(page, 'todo.txt')).toBeVisible();
  await page.locator('#file-input').setInputFiles({ name: 'todo.txt', mimeType: 'text/plain', buffer: Buffer.from('чужое') });
  await expect(page.locator('.modal-text')).toContainText('уже есть');
  await page.click('[data-cancel]');
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__fakeRoot.map.get('todo.txt').text)).toBe('дело');
});

test('запасной режим без IndexedDB: двоичный файл - предупреждение, переполнение - сообщение', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, 'indexedDB', { value: { open() { throw new Error('нет'); } } }); });
  await openOs(page, NAME);
  await page.locator('#file-input').setInputFiles({ name: 'снимок.png', mimeType: 'image/png', buffer: Buffer.from([137, 80, 78, 71, 1, 2, 3]) });
  await expect(page.locator('.toast')).toContainText('двоичные файлы не сохранятся');
  await page.evaluate(() => { Storage.prototype.setItem = function () { throw new DOMException('мало', 'QuotaExceededError'); }; });
  await page.click('#btn-new-folder');
  await page.fill('.modal-input', 'Ещё');
  await page.keyboard.press('Enter');
  await expect(page.locator('.toast')).toContainText('мало места');
});

test('возврат из корзины, когда на месте папки теперь файл: рядом с ним; «Удалить навсегда» переспрашивает', async ({ page }) => {
  await openOs(page, NAME);
  await row(page, 'Проекты').dblclick();
  await row(page, 'game.py').click();
  await page.keyboard.press('Delete'); await page.click('[data-ok]');
  await page.click('#btn-up');
  await row(page, 'Проекты').click();
  await page.keyboard.press('Delete'); await page.click('[data-ok]');
  await page.evaluate(() => { state.vfs.children['Проекты'] = { name: 'Проекты', type: 'file', modified: '', content: 'файл', size: 8 }; saveVFS(); });
  await page.click('#trash-item');
  await page.locator('.trash-row', { hasText: 'game.py' }).locator('[data-restore]').click();
  expect(await page.evaluate(() => [state.vfs.children['Проекты'].type, !!state.vfs.children['game.py']])).toEqual(['file', true]);
  await page.locator('.trash-row', { hasText: 'Проекты' }).locator('[data-kill]').click();
  await expect(page.locator('.modal-title').last()).toHaveText('Удалить навсегда?');
  await page.locator('[data-cancel]').last().click();
  await expect(page.locator('.trash-row', { hasText: 'Проекты' })).toHaveCount(1);
});

test('расширение файла не вставляется в страницу как разметка; имена __proto__ и constructor работают', async ({ page }) => {
  await openOs(page, NAME);
  await page.locator('#file-input').setInputFiles({ name: 'x.<img src=x onerror=xss>', mimeType: 'application/octet-stream', buffer: Buffer.from('1') });
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  expect(await page.locator('.file-row .meta img').count(), 'расширение превратилось в разметку').toBe(0);
  for (const n of ['__proto__', 'constructor']) {
    await page.click('#btn-new-folder');
    await page.fill('.modal-input', n);
    await page.keyboard.press('Enter');
    await expect(row(page, n)).toBeVisible();
  }
  await row(page, '__proto__').dblclick();
  await expect(page.locator('.empty-title')).toHaveText('Папка пуста');
  await page.waitForFunction(() => dbPending === 0);
  await page.reload();
  await expect(row(page, '__proto__')).toBeVisible();
  await expect(row(page, 'constructor')).toBeVisible();
});

test('перетаскивание на папку не затирает буфер обмена', async ({ page }) => {
  await openOs(page, NAME);
  await row(page, 'readme.txt').click();
  await page.keyboard.press('Control+c');
  await row(page, 'Документы').dblclick();
  await row(page, 'заметки.txt').dragTo(row(page, 'Учёба'));
  await expect(row(page, 'заметки.txt')).toHaveCount(0);
  expect(await page.evaluate(() => state.clip && state.clip.names)).toEqual(['readme.txt']);
  await page.keyboard.press('Control+v');
  await expect(row(page, 'readme.txt')).toBeVisible();
});
