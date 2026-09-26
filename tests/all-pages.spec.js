// Законы для каждой страницы: открывается без ошибок и без сети, у неё есть заголовок,
// и за две секунды работы она ничего не роняет.
const { test, expect } = require('@playwright/test');
const { pages, open } = require('./helpers');

for (const name of pages()) {
  test(`${name}: открывается без ошибок и без сети`, async ({ page }) => {
    const errors = await open(page, name);
    await page.waitForTimeout(2000);
    await expect(page).toHaveTitle(/\S/);
    expect(errors, errors.join('\n')).toEqual([]);
  });
}
