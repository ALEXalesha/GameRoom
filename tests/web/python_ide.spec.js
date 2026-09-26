// Законы Python IDE: Python (Pyodide из vendor/) запускается без сети, код выполняется в
// отдельном потоке, ошибки показываются с переходом к строке, input() читает поле ввода,
// бесконечный цикл останавливается кнопкой, файлы сохраняются и переживают перезагрузку.
const { test, expect } = require('@playwright/test');
const { openApp, expectInsideViewport, expectNoHorizontalScroll } = require('./_apps-helpers');

const NAME = 'python_ide';
test.describe.configure({ timeout: 90_000 });

const term = (page) => page.locator('#term');
const setCode = (page, code) => page.evaluate((c) => document.querySelector('.CodeMirror').CodeMirror.setValue(c), code);
const getCode = (page) => page.evaluate(() => document.querySelector('.CodeMirror').CodeMirror.getValue());

async function ready(page) {
  await expect(page.locator('#statusText')).toHaveText(/^Python 3\.\d+\.\d+ готов$/, { timeout: 60_000 });
}
async function run(page) {
  await page.getByRole('button', { name: 'Запустить' }).click();
  await expect(term(page)).toContainText(/─── (готово|ошибка|остановлено)/, { timeout: 30_000 });
}

test('Python загружается из vendor без сети и выполняет пример', async ({ page }) => {
  const net = [];
  page.on('request', (r) => { if (/^https?:/.test(r.url())) net.push(r.url()); });
  const errors = await openApp(page, NAME);
  await ready(page);
  await run(page);
  await expect(term(page)).toContainText('7! = 5040');
  await expect(term(page)).toContainText('pi = 3.141593');
  await expect(term(page)).toContainText(/─── готово за \d+\.\d\d с ───/);
  expect(net).toEqual([]);
  expect(errors).toEqual([]);
});

test('ошибка: короткий traceback, строка подсвечена, ссылка ведёт к месту', async ({ page }) => {
  await openApp(page, NAME);
  await ready(page);
  await setCode(page, 'x = 1\ny = 0\nprint(x / y)\n');
  await run(page);
  await expect(term(page)).toContainText('File "/home/pyodide/main.py", line 3');
  await expect(term(page)).toContainText('ZeroDivisionError: division by zero');
  await expect(term(page)).not.toContainText('runpy');       // служебные кадры убраны
  await expect(term(page)).toContainText('─── ошибка (код 1) ───');
  await expect(page.locator('.CodeMirror .error-line')).toHaveCount(1);
  expect(await page.evaluate(() => document.querySelector('.CodeMirror').CodeMirror.getCursor().line)).toBe(2);
});

test('input() читает строки из поля ввода, при нехватке - подсказка', async ({ page }) => {
  await openApp(page, NAME);
  await ready(page);
  await page.locator('#files .file', { hasText: 'greet.py' }).click();
  await page.fill('#stdin', 'Вера\n');
  await run(page);
  await expect(term(page)).toContainText('Привет, Вера!');
  await expect(term(page)).toContainText('Знакомые: Анна (23), Борис (31), Вера (27)');   // импорт соседнего файла
  await page.fill('#stdin', '');
  await run(page);
  await expect(term(page)).toContainText('EOFError');
  await expect(term(page)).toContainText('input() читает строки из поля');
});

test('бесконечный цикл останавливается, после этого Python снова работает', async ({ page }) => {
  await openApp(page, NAME);
  await ready(page);
  await setCode(page, 'print("старт", flush=True)\nwhile True:\n    pass\n');
  await page.getByRole('button', { name: 'Запустить' }).click();
  await expect(page.locator('#statusText')).toHaveText('Выполняется…');
  await expect(term(page)).toContainText('старт');
  // страница не зависла: интерфейс отвечает
  await page.locator('#stdin').fill('живой');
  await page.getByRole('button', { name: 'Стоп' }).click();
  await expect(term(page)).toContainText('─── остановлено ───');
  await ready(page);
  await setCode(page, 'print(6 * 7)\n');
  await run(page);
  await expect(term(page)).toContainText('42');
});

test('файлы: новый, переименование, удаление с отменой, всё переживает перезагрузку', async ({ page }) => {
  await openApp(page, NAME);
  await page.getByRole('button', { name: 'Новый файл' }).click();
  const inp = page.getByRole('textbox', { name: 'Имя файла' });
  await inp.fill('1bad.py');
  await inp.press('Enter');
  await expect(page.locator('.name-err')).toContainText('не с цифры');
  await inp.fill('notes.txt');
  await inp.press('Enter');
  await expect(page.locator('.name-err')).toHaveText('Имя должно заканчиваться на .py');
  await inp.fill('Main.py');
  await inp.press('Enter');
  await expect(page.locator('.name-err')).toHaveText('Такой файл уже есть');
  await inp.fill('tools.py');
  await inp.press('Enter');
  await expect(page.locator('#fileLabel')).toHaveText('tools.py');
  await setCode(page, 'def double(x):\n    return 2 * x\n');

  const row = page.locator('#files .file', { hasText: 'tools.py' });
  await row.dblclick();
  await page.getByRole('textbox', { name: 'Имя файла' }).fill('helpers.py');
  await page.getByRole('textbox', { name: 'Имя файла' }).press('Enter');
  await expect(page.locator('#files .file-name')).toHaveText(['main.py', 'example.py', 'greet.py', 'helpers.py']);

  const ex = page.locator('#files .file', { hasText: 'example.py' });
  await ex.hover();
  await ex.getByRole('button', { name: 'Удалить' }).click();
  await expect(page.locator('#files .file-name')).toHaveText(['main.py', 'greet.py', 'helpers.py']);
  await page.getByRole('button', { name: 'Вернуть', exact: true }).click();
  await expect(page.locator('#files .file-name')).toHaveText(['main.py', 'example.py', 'greet.py', 'helpers.py']);

  await page.locator('#files .file', { hasText: 'main.py' }).click();
  await setCode(page, 'from helpers import double\nprint(double(21))\n');
  await page.fill('#stdin', 'строка ввода');
  await page.waitForTimeout(400);
  await page.reload();
  await expect(page.locator('#files .file-name')).toHaveText(['main.py', 'example.py', 'greet.py', 'helpers.py']);
  expect(await getCode(page)).toBe('from helpers import double\nprint(double(21))\n');
  await expect(page.locator('#stdin')).toHaveValue('строка ввода');
  await ready(page);
  await run(page);
  await expect(term(page)).toContainText('42');
});

test('пакета нет - понятная подсказка, сетевых запросов нет', async ({ page }) => {
  const net = [];
  page.on('request', (r) => { if (/^https?:/.test(r.url())) net.push(r.url()); });
  await openApp(page, NAME);
  await ready(page);
  await setCode(page, 'import numpy\n');
  await run(page);
  await expect(term(page)).toContainText("ModuleNotFoundError: No module named 'numpy'");
  await expect(term(page)).toContainText('доступна только стандартная библиотека');
  expect(net).toEqual([]);
});

test('поток вывода на сто тысяч строк не вешает страницу и обрезается', async ({ page }) => {
  await openApp(page, NAME);
  await ready(page);
  await setCode(page, 'for i in range(100000):\n    print("строка", i)\nprint("конец")\n');
  await run(page);
  await expect(term(page)).toContainText('строка 99999');
  await expect(term(page)).toContainText('начало вывода обрезано');
  const len = await term(page).evaluate((el) => el.textContent.length);
  expect(len).toBeLessThan(260000);
});

test('Ctrl+Enter запускает, Ctrl+/ комментирует строку', async ({ page }) => {
  await openApp(page, NAME);
  await ready(page);
  await setCode(page, 'print("клавиши")\n');
  await page.locator('.CodeMirror').click();
  await page.keyboard.press('Control+Enter');
  await expect(term(page)).toContainText('клавиши');
  await page.evaluate(() => document.querySelector('.CodeMirror').CodeMirror.setCursor({ line: 0, ch: 0 }));
  await page.keyboard.press('Control+/');
  expect(await getCode(page)).toBe('# print("клавиши")\n');
});

for (const viewport of [{ width: 1280, height: 800 }, { width: 1024, height: 700 }]) {
  test(`кнопки, редактор и терминал видны при ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await openApp(page, NAME, { viewport });
    await expectInsideViewport(page, '#runBtn, #stopBtn, #newFile, .CodeMirror, #term, #stdin');
    await expectNoHorizontalScroll(page);
  });
}

test('испорченный Python: честное сообщение вместо вечной загрузки, редактор работает', async ({ page }) => {
  await page.addInitScript(() => {
    window.__PY_START_TIMEOUT_MS = 4000;
    // Подменяем wasm на мусор: так ведёт себя повреждённая или неполная папка vendor.
    Object.defineProperty(window, 'PYODIDE_OFFLINE_WASM', { configurable: true, get: () => 'AAAAAAAA', set: () => {} });
  });
  await openApp(page, NAME);
  await expect(page.locator('#statusText')).toHaveText('Python не запустился', { timeout: 20_000 });
  await expect(term(page)).toContainText('не запустился за 4 с');
  await expect(page.getByRole('button', { name: 'Запустить' })).toBeDisabled();
  await setCode(page, 'print(1)\n');
  expect(await getCode(page)).toBe('print(1)\n');
});
