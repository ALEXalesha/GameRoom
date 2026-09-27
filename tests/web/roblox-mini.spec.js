// Законы Блоксити (web/roblox-mini), часть 1 - лаунчер и вход в место:
// открывается без ошибок и без сети; на главной и в «Местах» все шесть мест; «Играть» - экран
// загрузки - место; Esc - меню и пауза; «Выйти из места» - обратно в лаунчер; скрытая вкладка -
// пауза, звук молчит, после возврата пауза остаётся; страница влезает в 1280x800 и 1024x700.
const { test, expect } = require('@playwright/test');
const { openBlox, enter, fit, SIZES } = require('./_blox-helpers');

const PLACES = ['obby', 'race', 'lava', 'coins', 'sandbox', 'tube'];

test.describe('roblox-mini (Блоксити): лаунчер', () => {
  test.describe.configure({ timeout: 60000 });   // рисование программное (без видеокарты) - медленно
  test('без ошибок и без сети; three.js свой; на главной и в «Местах» все шесть мест', async ({ page }) => {
    const requests = [];
    page.on('request', (r) => requests.push(r.url()));
    const errors = await openBlox(page, 'seed=7');
    expect(await page.evaluate(() => THREE.REVISION)).toBe('149');
    await expect(page).toHaveTitle(/Блоксити/);
    await expect(page.locator('#sec-home .card')).toHaveCount(6);
    const ids = await page.locator('#sec-home .card').evaluateAll((els) => els.map((e) => e.dataset.place));
    expect(ids.sort()).toEqual(PLACES.slice().sort());
    await page.locator('.sidenav [data-sec="places"]').click();
    await expect(page.locator('#sec-places .card')).toHaveCount(6);
    // верхняя полоса: аватар в круге, ник, баланс; пометка о фан-концепте
    await expect(page.locator('#me-nick')).toHaveText(/Гость_\d+/);
    await expect(page.locator('#bal')).toHaveText('0');
    await expect(page.locator('.fan-note')).toContainText('не связан с Roblox Corporation');
    await page.waitForTimeout(1500);                   // картинки карточек снимаются из самих мест
    expect(requests.filter((u) => /^https?:/.test(u))).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('карточка - страница места - «Играть» - экран загрузки с названием - место', async ({ page }) => {
    const errors = await openBlox(page, 'seed=7&fast=1');
    await page.locator('#sec-home .card[data-place="race"]').click();
    await expect(page.locator('#sec-place h1')).toHaveText('Скоростной забег');
    await expect(page.locator('#sec-place')).toContainText('Описание');
    await page.locator('#pl-play').click();
    await expect(page.locator('#loading')).toBeVisible();
    await expect(page.locator('#ld-name')).toHaveText('Скоростной забег');
    await expect(page.locator('#ld-tip')).not.toBeEmpty();
    await expect(page.locator('#game')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#loading')).toBeHidden();
    expect(await page.evaluate(() => __blox.screen)).toBe('place');
    // внутри: имя над головой, кнопка-логотип меню, таблица игроков, чат
    await expect(page.locator('#g-menu')).toBeVisible();
    await expect(page.locator('#g-board .board-row.me')).toContainText('Гость_');
    await expect(page.locator('#g-chat-log')).toContainText('Добро пожаловать');
    const np = await page.evaluate(() => __blox.nameplate());
    expect(np.text).toMatch(/^Гость_\d+$/);
    expect(np.visible).toBe(false);                    // своё имя над собой не видно, как в похожих играх
    expect(np.y).toBeGreaterThan(5.2);                 // над макушкой (у ботов - видно)
    expect(await page.evaluate(() => __blox.game.bots.every((b) => b.np.visible))).toBe(true);
    expect(errors).toEqual([]);
  });

  test('Esc - меню и пауза; «Выйти из места» - обратно в лаунчер', async ({ page }) => {
    await openBlox(page, 'seed=7&fast=1');
    await page.evaluate(() => __blox.enter('obby'));
    await expect(page.locator('#game')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#g-menu-panel')).toBeVisible();
    const t = await page.evaluate(() => __blox.game.time);
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => __blox.game.time)).toBe(t);      // мир стоит
    await page.keyboard.press('Escape');
    await expect(page.locator('#g-menu-panel')).toBeHidden();
    await page.locator('#g-menu').click();                             // кнопка-логотип - то же меню
    await expect(page.locator('#g-menu-panel')).toBeVisible();
    await page.locator('#m-leave').click();                            // первый раз - спрашивает
    await expect(page.locator('#m-leave')).toContainText('Точно выйти');
    expect(await page.evaluate(() => __blox.screen)).toBe('place');
    await page.locator('#m-leave').click();
    await expect(page.locator('#launcher')).toBeVisible();
    await expect(page.locator('#game')).toBeHidden();
    expect(await page.evaluate(() => __blox.screen)).toBe('launcher');
    // посещение засчитано
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mix.blox.stats')).obby.visits)).toBe(1);
  });

  test('«Сбросить персонажа» в меню: персонаж разваливается и появляется снова', async ({ page }) => {
    await openBlox(page);
    await enter(page, 'coins');
    await page.keyboard.press('Escape');
    await page.locator('#m-reset').click();
    const r = await page.evaluate(() => {
      const g = __blox.game;
      const dead = g.dead, pieces = g.pieces.length, snd = __blox.B.sound.played.includes('ouch');
      __blox.step(60 * 3);
      return { dead, pieces, snd, after: g.dead, back: g.pieces.length };
    });
    expect(r).toEqual({ dead: true, pieces: expect.any(Number), snd: true, after: false, back: 0 });
    expect(r.pieces).toBeGreaterThanOrEqual(6);        // голова, туловище, 2 руки, 2 ноги (+ вещи)
  });

  test('скрытая вкладка - пауза: меню открыто, звук молчит; после возврата пауза остаётся', async ({ page }) => {
    await openBlox(page, 'seed=7&fast=1');
    await page.evaluate(() => __blox.enter('race'));
    await expect(page.locator('#game')).toBeVisible();
    await page.evaluate(() => __blox.B.sound.resume());
    const hide = (hidden) => page.evaluate((h) => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
      document.dispatchEvent(new Event('visibilitychange'));
    }, hidden);
    await hide(true);
    await expect(page.locator('#g-menu-panel')).toBeVisible();
    await expect.poll(() => page.evaluate(() => __blox.B.sound.state())).toBe('suspended');
    const t = await page.evaluate(() => __blox.game.time);
    await hide(false);
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => ({ menu: __blox.game.menuOpen, paused: __blox.game.paused }))).toEqual({ menu: true, paused: true });
    expect(await page.evaluate(() => __blox.game.time)).toBe(t);
    await page.locator('#m-resume').click();
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => __blox.game.time)).toBeGreaterThan(t);
  });

  test('оболочка ОС: postMessage({mix:"pause"}) - пауза как при скрытой вкладке; "resume" паузу не снимает; meta с именем', async ({ page }) => {
    await openBlox(page, 'seed=7&fast=1');
    expect(await page.locator('meta[name="application-name"]').getAttribute('content')).toBe('Блоксити');
    await page.evaluate(() => __blox.enter('obby'));
    await expect(page.locator('#game')).toBeVisible();
    await page.evaluate(() => { __blox.B.sound.resume(); __blox.game.keys.KeyW = true; });
    await page.waitForTimeout(300);
    await page.evaluate(() => window.postMessage({ mix: 'pause' }, '*'));
    await expect(page.locator('#g-menu-panel')).toBeVisible();
    await expect.poll(() => page.evaluate(() => __blox.B.sound.state())).toBe('suspended');
    const t = await page.evaluate(() => __blox.game.time);
    expect(await page.evaluate(() => __blox.game.keys.KeyW)).toBe(false);          // ввод сброшен
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => __blox.game.time)).toBe(t);                  // игровое время стоит
    await page.evaluate(() => window.postMessage({ mix: 'resume' }, '*'));
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => ({ time: __blox.game.time, paused: __blox.game.paused }))).toEqual({ time: t, paused: true });
    await page.locator('#m-resume').click();
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => __blox.game.time)).toBeGreaterThan(t);
  });

  test('мелочи: NumpadEnter отправляет в чат; L выходит только со второго раза; «Ещё раз» в обби гасит флажки', async ({ page }) => {
    await openBlox(page, 'seed=7&fast=1&manual=1');
    await page.evaluate(() => __blox.enter('obby'));
    await page.keyboard.press('Enter');
    await page.keyboard.type('привет');
    await page.keyboard.press('NumpadEnter');
    await expect(page.locator('#g-chat-log')).toContainText('привет');
    const flags = await page.evaluate(() => {
      const g = __blox.game, pad = g.state.pads[2];
      g.player.teleport(pad.cx, pad.maxY + 0.01, pad.cz); __blox.step(3);
      const lit = pad.data.flag.mesh.geometry.getAttribute('color').getY(0);
      g.place.restart(g);
      return { lit, after: pad.data.flag.mesh.geometry.getAttribute('color').getY(0) };
    });
    expect(flags.lit).toBeGreaterThan(0.7);
    expect(flags.after).toBeLessThan(0.6);
    await page.keyboard.press('Escape');
    await page.keyboard.press('KeyL');
    expect(await page.evaluate(() => __blox.screen)).toBe('place');
    await page.keyboard.press('KeyL');
    expect(await page.evaluate(() => __blox.screen)).toBe('launcher');
  });

  test('лаунчер 1920x1080: содержимое по центру; всплывашки не закрывают прогресс; даты ДД.ММ.ГГГГ', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await openBlox(page, 'seed=7&fast=1&manual=1');
    await page.evaluate(() => { __blox.B.acct.award('shopper'); __blox.B.ui.toast('проверка', 'ok'); });
    const r = await page.evaluate(() => {
      const c = document.querySelector('#content').getBoundingClientRect(), s = document.querySelector('#sec-home').getBoundingClientRect();
      const t = document.querySelector('#toasts .toast').getBoundingClientRect(), p = document.querySelector('.progress-card').getBoundingClientRect();
      const overlap = !(t.right < p.left || t.left > p.right || t.bottom < p.top || t.top > p.bottom);
      return { left: s.left - c.left, right: c.right - s.right, overlap };
    });
    expect(Math.abs(r.left - r.right)).toBeLessThan(30);
    expect(r.overlap).toBe(false);
    await page.locator('.sidenav [data-sec="profile"]').click();
    const txt = await page.locator('#sec-profile').textContent();
    expect(txt).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(txt).toMatch(/\d{2}\.\d{2}\.\d{4}/);
  });

  for (const size of SIZES) {
    test(`влезает в ${size.width}x${size.height}: лаунчер, страница места, место`, async ({ page }) => {
      await page.setViewportSize(size);
      await openBlox(page, 'seed=7&fast=1');
      for (const sec of ['home', 'places', 'avatar', 'catalog', 'profile', 'settings']) {
        await page.locator(`.sidenav [data-sec="${sec}"]`).click();
        const r = await fit(page, '#content');
        expect(r.scrollW, sec).toBeLessThanOrEqual(r.w);
        expect(r.scrollH, sec).toBeLessThanOrEqual(r.h);
        expect(r.box.right, sec).toBeLessThanOrEqual(r.w + 0.5);
        const over = await page.evaluate(() => document.querySelector('#content').scrollWidth - document.querySelector('#content').clientWidth);
        expect(over, sec + ': нет прокрутки вбок').toBeLessThanOrEqual(0);
      }
      await page.locator('.sidenav [data-sec="home"]').click();
      await page.locator('#sec-home .card[data-place="lava"]').click();
      await expect(page.locator('#pl-play')).toBeVisible();
      await page.waitForTimeout(600);
      const pb = await page.locator('#pl-play').boundingBox();
      expect(pb.y + pb.height).toBeLessThanOrEqual(size.height);        // «Играть» видна без прокрутки
      await page.locator('#pl-play').click();
      await expect(page.locator('#game')).toBeVisible({ timeout: 10000 });
      const g = await fit(page, '#gl canvas');
      expect(g.box.right - g.box.left).toBe(size.width);
      expect(g.box.bottom - g.box.top).toBe(size.height);
      for (const sel of ['#g-board', '#g-chat', '#g-hud']) {
        const b = await page.locator(sel).boundingBox();
        expect(b.x, sel).toBeGreaterThanOrEqual(0);
        expect(b.x + b.width, sel).toBeLessThanOrEqual(size.width);
        expect(b.y + b.height, sel).toBeLessThanOrEqual(size.height);
      }
    });
  }
});
