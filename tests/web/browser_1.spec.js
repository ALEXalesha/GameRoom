// Законы мини-браузера: встроенные страницы открываются, внешний адрес даёт понятное объяснение
// (а не пустое окно), вкладки/история/закладки/заметки работают и переживают перезагрузку.
const { test, expect } = require('@playwright/test');
const { openApp, expectNoHorizontalScroll, expectInsideViewport } = require('./_apps-helpers');

const NAME = 'browser_1';
const url = (page) => page.locator('#urlBar');
const tabs = (page) => page.locator('#tabs .tab');

async function go(page, text) {
  await url(page).fill(text);
  await url(page).press('Enter');
}

test('стартовая страница и переход на встроенные страницы', async ({ page }) => {
  const errors = await openApp(page, NAME);
  await expect(page.locator('.page h1')).toHaveText('Мини-браузер');
  await page.locator('.tile', { hasText: 'Справка' }).click();
  await expect(page.locator('.page h1')).toHaveText('Справка');
  await expect(tabs(page).first()).toHaveText(/Справка/);
  await expect(url(page)).toHaveValue('about:help');
  expect(errors).toEqual([]);
});

test('внешний адрес: понятное объяснение, адрес дополнен, iframe не создаётся', async ({ page }) => {
  const errors = await openApp(page, NAME);
  await go(page, 'example.com');
  await expect(page.locator('#externalBox h1')).toHaveText('Внешний сайт здесь не открывается');
  await expect(page.locator('#externalBox code')).toHaveText('https://example.com/');
  await expect(page.getByRole('button', { name: 'Открыть в системном браузере' })).toBeVisible();
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(tabs(page).first()).toHaveText(/example\.com/);
  await go(page, 'localhost:3000/app');
  await expect(page.locator('#externalBox code')).toHaveText('http://localhost:3000/app');
  expect(errors).toEqual([]);
});

test('неверный адрес и несуществующая встроенная страница', async ({ page }) => {
  const errors = await openApp(page, NAME);
  await go(page, 'http://');
  await expect(page.locator('.error-box h1')).toHaveText('Неверный адрес');
  await go(page, 'about:nothing');
  await expect(page.locator('.error-box h1')).toHaveText('Нет такой страницы');
  expect(errors).toEqual([]);
});

test('текст без точки ищется по страницам, закладкам и истории', async ({ page }) => {
  await openApp(page, NAME);
  await go(page, 'wikipedia.org');
  await go(page, 'истор');
  await expect(page.locator('.page h1')).toHaveText('Поиск: истор');
  await expect(page.locator('.search-row a')).toHaveText(['История']);
  await go(page, 'wikipedia');
  await expect(page.locator('.search-row .u')).toContainText(['история · https://wikipedia.org/']);
});

test('назад и вперёд по истории вкладки', async ({ page }) => {
  await openApp(page, NAME);
  await expect(page.locator('#backBtn')).toBeDisabled();
  await go(page, 'about:help');
  await go(page, 'about:history');
  await page.locator('#backBtn').click();
  await expect(page.locator('.page h1')).toHaveText('Справка');
  await expect(page.locator('#fwdBtn')).toBeEnabled();
  await page.keyboard.press('Alt+ArrowRight');
  await expect(page.locator('.page h1')).toHaveText('История');
  await expect(page.locator('#fwdBtn')).toBeDisabled();
  // переход после «назад» обрезает «вперёд»
  await page.locator('#backBtn').click();
  await go(page, 'about:notes');
  await expect(page.locator('#fwdBtn')).toBeDisabled();
});

test('вкладки: новая, переключение, закрытие, последняя не оставляет пустоту', async ({ page }) => {
  await openApp(page, NAME);
  await go(page, 'about:help');
  await page.getByRole('button', { name: 'Новая вкладка' }).click();
  await expect(tabs(page)).toHaveCount(2);
  await expect(url(page)).toBeFocused();
  await go(page, 'about:notes');
  await tabs(page).first().click();
  await expect(page.locator('.page h1')).toHaveText('Справка');
  await page.keyboard.press('Control+Tab');
  await expect(page.locator('.page h1')).toHaveText('Заметки');
  await tabs(page).nth(1).getByRole('button', { name: 'Закрыть вкладку' }).click();
  await expect(tabs(page)).toHaveCount(1);
  await tabs(page).first().getByRole('button', { name: 'Закрыть вкладку' }).click();
  await expect(tabs(page)).toHaveCount(1);
  await expect(page.locator('.page h1')).toHaveText('Мини-браузер');
});

test('закладки: звезда, Ctrl+D, список, удаление', async ({ page }) => {
  await openApp(page, NAME);
  await go(page, 'example.org');
  await page.locator('#starBtn').click();
  await expect(page.locator('#starBtn')).toHaveAttribute('aria-pressed', 'true');
  await go(page, 'about:notes');
  await page.locator('body').click();
  await page.keyboard.press('Control+d');
  await go(page, 'about:bookmarks');
  await expect(page.locator('.bm-row .t')).toHaveText(['example.org', 'Заметки']);
  await page.locator('.bm-row').first().getByRole('button', { name: 'Удалить закладку' }).click();
  await expect(page.locator('.bm-row .t')).toHaveText(['Заметки']);
  await page.locator('#homeBtn').click();
  await expect(page.locator('.tiles').nth(1).locator('.tile .t')).toHaveText(['Заметки']);
});

test('вкладки, история, закладки и заметки переживают перезагрузку', async ({ page }) => {
  await openApp(page, NAME);
  await go(page, 'example.net');
  await page.locator('#starBtn').click();
  await page.getByRole('button', { name: 'Новая вкладка' }).click();
  await go(page, 'about:notes');
  await page.locator('#notes').fill('список покупок: хлеб');
  await expect(page.locator('#savedMark')).toContainText('Сохранено');
  await page.reload();
  await expect(tabs(page)).toHaveCount(2);
  await expect(tabs(page).nth(1)).toHaveClass(/active/);
  await expect(page.locator('#notes')).toHaveValue('список покупок: хлеб');
  await tabs(page).first().click();
  await expect(page.locator('#externalBox code')).toHaveText('https://example.net/');
  await expect(page.locator('#starBtn')).toHaveAttribute('aria-pressed', 'true');
  await go(page, 'about:history');
  // первая запись - сама страница истории, перед ней - заметки
  await expect(page.locator('.hist-row .u').nth(1)).toHaveText('about:notes');
  await expect(page.locator('.hist-row .u')).toContainText(['https://example.net/']);
});

test('история: фильтр, удаление записи, очистка с подтверждением', async ({ page }) => {
  await openApp(page, NAME);
  await go(page, 'alpha.com');
  await go(page, 'beta.com');
  await go(page, 'about:history');
  await page.fill('#histFilter', 'alpha');
  await expect(page.locator('.hist-row .u')).toHaveText(['https://alpha.com/']);
  await page.fill('#histFilter', '');
  await page.locator('.hist-row', { hasText: 'beta.com' }).getByRole('button', { name: 'Удалить из истории' }).click();
  await expect(page.locator('.hist-row', { hasText: 'beta.com' })).toHaveCount(0);
  await page.locator('#clearHist').click();
  await expect(page.locator('.hist-row')).not.toHaveCount(0);   // первое нажатие только спрашивает
  await page.locator('#clearHist').click();
  await expect(page.locator('#histList .empty')).toHaveText('История пуста');
});

test('подсказки адресной строки выбираются стрелкой', async ({ page }) => {
  await openApp(page, NAME);
  await url(page).fill('закл');
  await expect(page.locator('#suggest')).toHaveClass(/show/);
  await url(page).press('ArrowDown');
  await url(page).press('Enter');
  await expect(page.locator('.page h1')).toHaveText('Закладки');
});

test('разметка в запросе показывается как текст', async ({ page }) => {
  const errors = await openApp(page, NAME);
  await go(page, '<img src=x onerror=alert(1)> test');
  await expect(page.locator('.page h1')).toHaveText('Поиск: <img src=x onerror=alert(1)> test');
  await expect(page.locator('.page img')).toHaveCount(0);
  expect(errors).toEqual([]);
});

for (const viewport of [{ width: 1280, height: 800 }, { width: 1024, height: 700 }]) {
  test(`десять вкладок не ломают раскладку при ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await openApp(page, NAME, { viewport });
    for (let i = 0; i < 9; i++) await page.getByRole('button', { name: 'Новая вкладка' }).click();
    await expect(tabs(page)).toHaveCount(10);
    await expectNoHorizontalScroll(page);
    await expectInsideViewport(page, '#newTab, #urlBar, #starBtn');
  });
}
