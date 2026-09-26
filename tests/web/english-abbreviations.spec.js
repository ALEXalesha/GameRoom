// Законы словаря сокращений: поиск находит то, что должен, и ставит точное совпадение первым,
// категории фильтруют, фильтр переживает перезагрузку, подсветка не ломает разметку.
const { test, expect } = require('@playwright/test');
const { openApp, expectNoHorizontalScroll } = require('./_apps-helpers');

const NAME = 'english-abbreviations';
const cards = (page) => page.locator('#grid .card');
const abbrs = (page) => page.locator('#grid .card .abbr').allTextContents();

async function searchFor(page, q) {
  await page.fill('#search', q);
}

test('без запроса видны все сокращения, дублей нет', async ({ page }) => {
  const errors = await openApp(page, NAME);
  const total = Number(await page.locator('#total').textContent());
  expect(total).toBeGreaterThan(150);
  await expect(cards(page)).toHaveCount(total);
  const list = await abbrs(page);
  const keys = list.map((a, i) => a + '|' + i);
  expect(new Set(list.filter((a) => a !== 'IG')).size).toBe(list.filter((a) => a !== 'IG').length);
  expect(keys.length).toBe(total);
  expect(errors).toEqual([]);
});

// [запрос, сокращение, которое должно быть первым]
const FIRST = [
  ['btw', 'BTW'],
  ['BTW', 'BTW'],
  ['кстати', 'BTW'],
  ['eg', 'E.G.'],           // точки в сокращении не мешают
  ['tldr', 'TL;DR'],
  ['asap', 'ASAP'],
  ['gg', 'GG'],             // точное совпадение выше, чем GGWP и GLHF
  ['ig', 'IG'],             // точное совпадение выше, чем «Right now» (RN) выше по списку
  ['id', 'ID'],             // выше, чем «didn't read» (TL;DR)
  ['good game', 'GG'],      // несколько слов: все должны встретиться
  ['иец', 'BTW'],           // набрано в русской раскладке
  ['двухфакторная', '2FA'],
];

for (const [q, first] of FIRST) {
  test(`поиск «${q}» ставит ${first} первым`, async ({ page }) => {
    await openApp(page, NAME);
    await searchFor(page, q);
    await expect(cards(page).first().locator('.abbr')).toHaveText(first);
  });
}

test('поиск из нескольких слов требует все слова', async ({ page }) => {
  await openApp(page, NAME);
  await searchFor(page, 'good game');
  const list = await abbrs(page);
  expect(list.sort()).toEqual(['GG', 'GGWP']);
});

test('ничего не найдено - понятное сообщение', async ({ page }) => {
  await openApp(page, NAME);
  await searchFor(page, 'zzzzqqq');
  await expect(cards(page)).toHaveCount(0);
  await expect(page.locator('#empty')).toBeVisible();
  await expect(page.locator('#count')).toHaveText('Найдено: 0');
});

test('категория фильтрует и сочетается с поиском', async ({ page }) => {
  await openApp(page, NAME);
  await page.getByRole('button', { name: /^Игры/ }).click();
  const games = await cards(page).locator('.tag').allTextContents();
  expect(games.length).toBeGreaterThan(10);
  expect(new Set(games)).toEqual(new Set(['Игры']));
  await searchFor(page, 'good');
  expect((await abbrs(page)).sort()).toEqual(['GG', 'GGWP', 'GLHF']);
  await page.getByRole('button', { name: /^Бизнес/ }).click();
  await expect(cards(page)).toHaveCount(0);
});

test('поиск и категория переживают перезагрузку', async ({ page }) => {
  await openApp(page, NAME);
  await page.getByRole('button', { name: /^IT/ }).click();
  await searchFor(page, 'память');
  await expect(cards(page).first().locator('.abbr')).toHaveText('RAM');
  await page.waitForTimeout(400); // адрес обновляется с задержкой после ввода
  await page.reload();
  await expect(page.locator('#search')).toHaveValue('память');
  await expect(page.getByRole('button', { name: /^IT/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(cards(page).first().locator('.abbr')).toHaveText('RAM');
});

test('подсветка отмечает совпадение, спецсимволы в запросе ничего не ломают', async ({ page }) => {
  const errors = await openApp(page, NAME);
  await searchFor(page, 'q&a');
  const card = cards(page).first();
  await expect(card.locator('.abbr')).toHaveText('Q&A');
  await expect(card.locator('.abbr mark')).toHaveText('Q&A');
  await searchFor(page, '(смайл');
  await expect(cards(page).first().locator('.abbr')).toHaveText('XD');
  await expect(cards(page).first().locator('.full mark')).toHaveText('(смайл');
  await searchFor(page, '[');
  expect(errors).toEqual([]);
});

test('Esc очищает поиск, «/» ставит курсор в поиск', async ({ page }) => {
  await openApp(page, NAME);
  await page.locator('body').click();
  await page.keyboard.press('/');
  await expect(page.locator('#search')).toBeFocused();
  await page.keyboard.type('lol');
  await expect(cards(page).first().locator('.abbr')).toHaveText('LOL');
  await page.keyboard.press('Escape');
  await expect(page.locator('#search')).toHaveValue('');
});

test('щелчок по карточке копирует её текст', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openApp(page, NAME);
  await searchFor(page, 'fyi');
  await cards(page).first().click();
  await expect(page.locator('#toast')).toHaveText('Скопировано: FYI');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('FYI - For your information - К вашему сведению');
});

for (const viewport of [{ width: 1280, height: 800 }, { width: 1024, height: 700 }]) {
  test(`нет горизонтальной прокрутки при ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await openApp(page, NAME, { viewport });
    await expectNoHorizontalScroll(page);
  });
}
