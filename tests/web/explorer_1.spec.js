// Законы explorer_1: навигация, поиск не сбивает выбор, файлы и папки создаются, правятся
// и переживают перезагрузку, режим настоящей папки работает (на поддельной папке), всё в экране.
const { test, expect } = require('@playwright/test');
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
