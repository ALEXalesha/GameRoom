// Законы Блоксити, часть 4 - учётка: кубы приходят за медаль и уходят на покупку, в минус не уходят;
// аватар из редактора (цвета частей, шапка) - тот же в месте; ник из профиля - над головой;
// профиль показывает статистику и значки.
const { test, expect } = require('@playwright/test');
const { openBlox, enter } = require('./_blox-helpers');

test.describe('roblox-mini (Блоксити): кубы, каталог, аватар, профиль', () => {
  test.describe.configure({ timeout: 60000 });   // рисование программное (без видеокарты) - медленно
  test('кубы: +за медаль, -за покупку, в минус не уходят; «Купить» гаснет, если не хватает', async ({ page }) => {
    await openBlox(page);
    await enter(page, 'race');
    await page.evaluate(() => { const g = __blox.game; g.place.scriptedRun(g, 40); });   // серебро
    expect(await page.evaluate(() => __blox.balance())).toBe(20);
    await page.evaluate(() => __blox.leave());
    await page.locator('.sidenav [data-sec="catalog"]').click();
    await expect(page.locator('#bal')).toHaveText('20');
    // корона - 150: не хватает
    await page.locator('#sec-catalog [data-item="hat_crown"]').click();
    await expect(page.locator('#mb-buy')).toBeDisabled();
    await expect(page.locator('#mb-warn')).toContainText('Не хватает кубов');
    await page.locator('#mb-cancel').click();
    expect(await page.evaluate(() => __blox.B.acct.buy('hat_crown'))).toEqual({ ok: false, reason: 'не хватает кубов' });
    expect(await page.evaluate(() => __blox.balance())).toBe(20);
    // очки - 15: хватает
    await page.locator('#sec-catalog [data-item="acc_glasses"]').click();
    await page.locator('#mb-buy').click();
    await expect(page.locator('#bal')).toHaveText('5');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mix.blox.wallet')).balance)).toBe(5);
    // уже куплено - повторно не списывает; дороже остатка - отказ
    expect(await page.evaluate(() => [__blox.B.acct.buy('acc_glasses').ok, __blox.balance()])).toEqual([true, 5]);
    expect(await page.evaluate(() => [__blox.B.acct.spend(6), __blox.B.acct.spend(-3), __blox.balance()])).toEqual([false, false, 5]);
    await expect(page.locator('#sec-catalog [data-item="acc_glasses"] .item-price')).toContainText('Есть');
    // бесплатные вещи есть сразу
    await expect(page.locator('#sec-catalog [data-item="hat_cap"] .item-price')).toContainText('Бесплатно');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mix.blox.badges')))).toHaveProperty('shopper');
  });

  test('аватар: цвета частей и шапка из редактора - те же в месте (сетка и текстура)', async ({ page }) => {
    await openBlox(page);
    await page.locator('.sidenav [data-sec="avatar"]').click();
    await page.locator('#av-panel [data-part="head"]').click();
    await page.locator('#av-panel [data-color="#8e5a3a"]').click();
    await page.locator('#av-panel [data-part="armL"]').click();
    await page.locator('#av-panel [data-color="#3fae4a"]').click();
    await page.locator('#av-panel [data-part="torso"]').click();
    await page.locator('#av-panel [data-color="#8a5cf5"]').click();
    await page.locator('#av-tabs [data-tab="acc"]').click();
    await page.locator('#av-panel [data-item="hat_cap"]').click();
    // платная вещь без кубов не надевается - открывается покупка
    await page.locator('#av-panel [data-item="hat_crown"]').click();
    await expect(page.locator('#modal')).toBeVisible();
    await page.locator('#mb-cancel').click();
    await page.locator('#av-tabs [data-tab="faces"]').click();
    await page.locator('#av-panel [data-item="face_wink"]').click();
    await expect(page.locator('#av-note')).toContainText('несохранённые');
    await page.locator('#av-save').click();
    await expect(page.locator('#av-note')).toBeEmpty();
    await enter(page, 'obby');
    const c = await page.evaluate(() => __blox.meshColors());
    expect(c.head).toBe('#8e5a3a');
    expect(c.headPixel).toBe('#8e5a3a');                // нарисовано на голове
    expect(c.armL).toBe('#3fae4a');
    expect(c.armLPixel).toBe('#3fae4a');                // рукав футболки короткий: низ руки - цвет руки
    expect(c.torso).toBe('#8a5cf5');
    expect(c.items).toContain('hat_cap');
    expect(c.items).not.toContain('hat_crown');
    expect(c.face).toBe('face_wink');
    // тот же аватар - после перезагрузки
    await page.reload();
    await page.waitForFunction(() => window.__blox && __blox.ready);
    await enter(page, 'coins');
    expect((await page.evaluate(() => __blox.meshColors())).head).toBe('#8e5a3a');
  });

  test('ник из профиля - в верхней полосе и над головой в месте; неверный ник не принимается', async ({ page }) => {
    await openBlox(page);
    await page.locator('#me-btn').click();
    await page.locator('#pf-edit').click();
    await page.locator('#pf-nick-in').fill('а');
    await page.locator('#pf-form button[type=submit]').click();
    await expect(page.locator('#pf-err')).toBeVisible();
    await page.locator('#pf-nick-in').fill('Кубик_Тест');
    await page.locator('#pf-about-in').fill('Люблю обби');
    await page.locator('#pf-form button[type=submit]').click();
    await expect(page.locator('#me-nick')).toHaveText('Кубик_Тест');
    await expect(page.locator('#sec-profile .about')).toHaveText('Люблю обби');
    await enter(page, 'lava');
    expect((await page.evaluate(() => __blox.nameplate())).text).toBe('Кубик_Тест');
    await expect(page.locator('#g-board .board-row.me')).toContainText('Кубик_Тест');
  });

  test('профиль: статистика по местам и значки после забега', async ({ page }) => {
    await openBlox(page);
    await enter(page, 'race');
    await page.evaluate(() => { const g = __blox.game; g.place.scriptedRun(g, 31.5); });
    await page.evaluate(() => __blox.leave());
    await page.locator('.sidenav [data-sec="profile"]').click();
    const row = page.locator('#sec-profile .tbl tr', { hasText: 'Скоростной забег' });
    await expect(row).toContainText('31.50');
    await expect(row).toContainText('✓');
    await expect(page.locator('#sec-profile .badge.got')).toHaveCount(3);   // первые шаги, призёр забега, золотой забег
    await expect(page.locator('#sec-profile .badge.got', { hasText: 'Призёр забега' })).toBeVisible();
    await expect(page.locator('#sec-profile .badge:not(.got)', { hasText: 'Легенда Блоксити' })).toBeVisible();
  });
});
