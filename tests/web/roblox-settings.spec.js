// Законы Блоксити, часть 5 - настройки в два уровня. В месте (меню - «Настройки»): графика
// вручную 1..10 и автоматически, чувствительность мыши (и отдельно от первого лица), инверсия,
// режим камеры «Следование», вид от первого лица, Shift-лок, движение щелчком, громкости,
// статистика, полный экран; всё переживает перезагрузку и сбрасывается кнопкой. В лаунчере:
// тема, язык, конфиденциальность (чат скрыт), уведомления, сброс прогресса с подтверждением.
const { test, expect } = require('@playwright/test');
const { openBlox, enter } = require('./_blox-helpers');

async function openGameSettings(page) {
  await page.keyboard.press('Escape');
  await page.locator('#g-menu-panel .mtab[data-tab="settings"]').click();
  await expect(page.locator('#g-settings-list .set-row')).toHaveCount(13);
}
const row = (page, key) => page.locator(`#g-settings-list .set-row[data-key="${key}"]`);
const next = (page, key) => row(page, key).locator('.arrow').last().click();
const toggle = (page, key) => row(page, key).locator('.toggle').click();
const slide = (page, key, v) => row(page, key).locator('input').evaluate((el, val) => { el.value = val; el.dispatchEvent(new Event('input', { bubbles: true })); }, v);
const closeMenu = (page) => page.locator('#m-close').click();
async function drag(page, dx, dy) {
  await page.mouse.move(640, 400);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(640 + dx, 400 + dy, { steps: 4 });
  await page.mouse.up({ button: 'right' });
}
const rig = (page) => page.evaluate(() => ({ yaw: __blox.game.rig.yaw, pitch: __blox.game.rig.pitch }));

test.describe('roblox-mini (Блоксити): настройки', () => {
  test.describe.configure({ timeout: 60000 });   // рисование программное (без видеокарты) - медленно
  test('графика: вручную 1 и 10 меняют тени, чёткость, дальность и облака; режим переживает перезагрузку', async ({ page }) => {
    await openBlox(page);
    await enter(page, 'coins');
    await openGameSettings(page);
    await expect(row(page, 'quality')).toHaveClass(/disabled/);          // в «Автоматически» ползунок неактивен
    await next(page, 'graphicsMode');
    await expect(row(page, 'graphicsMode')).toContainText('Вручную');
    await slide(page, 'quality', 1);
    const low = await page.evaluate(() => __blox.renderInfo());
    await slide(page, 'quality', 10);
    const high = await page.evaluate(() => __blox.renderInfo());
    expect(low).toMatchObject({ shadows: false, pixelRatio: 0.75, fogFar: 230, clouds: false, quality: 1 });
    expect(high).toMatchObject({ shadows: true, shadowSize: 4096, fogFar: 860, clouds: true, quality: 10 });
    expect(high.pixelRatio).toBeGreaterThanOrEqual(1);
    await page.reload();
    await page.waitForFunction(() => window.__blox && __blox.ready);
    await enter(page, 'race');
    expect(await page.evaluate(() => __blox.renderInfo())).toMatchObject({ quality: 10, fogFar: 860, shadowSize: 4096 });
    // обратно в «Автоматически»: уровень берётся из замера кадров
    await openGameSettings(page);
    await next(page, 'graphicsMode');
    expect(await page.evaluate(() => __blox.renderInfo().quality)).toBe(await page.evaluate(() => __blox.B.autoQuality));
  });

  test('мышь: чувствительность, отдельная от первого лица, и инверсия', async ({ page }) => {
    await openBlox(page);
    await enter(page, 'sandbox');
    await page.evaluate(() => { const g = __blox.game; g.place.selectTool(g, 'build'); __blox.step(2); });   // без инструмента - ЛКМ не нужна
    let a = await rig(page); await drag(page, 100, 40); let b = await rig(page);
    const d1 = { yaw: a.yaw - b.yaw, pitch: b.pitch - a.pitch };
    await openGameSettings(page);
    await slide(page, 'sens', 2);
    await toggle(page, 'invert');
    await closeMenu(page);
    a = await rig(page); await drag(page, 100, 40); b = await rig(page);
    const d2 = { yaw: a.yaw - b.yaw, pitch: b.pitch - a.pitch };
    expect(d1.yaw).toBeGreaterThan(0.2);
    expect(d2.yaw / d1.yaw).toBeCloseTo(2, 5);
    expect(d2.pitch / d1.pitch).toBeCloseTo(-2, 5);                   // вверх-вниз наоборот
    // от первого лица - своя чувствительность
    await openGameSettings(page);
    await next(page, 'view');
    await slide(page, 'sensFirst', 0.5);
    await closeMenu(page);
    await page.evaluate(() => __blox.step(30));
    expect(await page.evaluate(() => __blox.game.rig.first)).toBe(true);
    a = await rig(page); await drag(page, 100, 0); b = await rig(page);
    expect((a.yaw - b.yaw) / d1.yaw).toBeCloseTo(0.5, 5);
    // в виде от первого лица колесо не отдаляет
    await page.mouse.wheel(0, 600);
    expect(await page.evaluate(() => { __blox.step(30); return __blox.game.rig.first; })).toBe(true);
  });

  test('режим камеры «Следование» заходит за спину, «Классика» - нет; Shift-лок - только если разрешён', async ({ page }) => {
    await openBlox(page);
    await enter(page, 'sandbox');
    const run = () => page.evaluate(() => {
      const g = __blox.game; g.player.teleport(0, 0, 0, 0); g.rig.yaw = 0; __blox.step(2);
      g.moveTarget = { x: 60, z: 0, t: 6 };                         // бежать к точке сбоку (+X), мир неподвижен
      for (let i = 0; i < 90; i++) __blox.step(1);
      g.clearMoveTarget();
      return { yaw: g.rig.yaw, facing: g.player.facing };
    });
    const classic = await run();
    expect(classic.yaw).toBe(0);
    await openGameSettings(page);
    await next(page, 'cameraMode');
    await expect(row(page, 'cameraMode')).toContainText('Следование');
    await closeMenu(page);
    const follow = await run();
    const behind = follow.facing + Math.PI;
    expect(Math.abs(Math.atan2(Math.sin(follow.yaw - behind), Math.cos(follow.yaw - behind)))).toBeLessThan(0.6);
    // Shift-лок: герой смотрит туда же, куда камера, и идёт боком
    await page.keyboard.press('ShiftLeft');
    const sl = await page.evaluate(() => {
      const g = __blox.game; g.rig.yaw = 0; g.player.teleport(0, 0, 0, 1.3); __blox.step(2);
      __blox.key('KeyD'); for (let i = 0; i < 40; i++) __blox.step(1); __blox.key('KeyD', false);
      return { on: g.shiftLock, facing: g.player.facing, shoulder: g.rig.shoulder, x: g.player.pos.x };
    });
    expect(sl.on).toBe(true);
    expect(Math.abs(Math.atan2(Math.sin(sl.facing - Math.PI), Math.cos(sl.facing - Math.PI)))).toBeLessThan(0.05);   // лицом от камеры
    expect(sl.shoulder).toBeGreaterThan(1);
    expect(sl.x).toBeGreaterThan(3);
    await page.keyboard.press('ShiftLeft');
    await openGameSettings(page);
    await toggle(page, 'shiftLock');
    await closeMenu(page);
    await page.keyboard.press('ShiftLeft');
    expect(await page.evaluate(() => __blox.game.shiftLock)).toBe(false);
  });

  test('движение щелчком мыши: герой идёт к точке на земле', async ({ page }) => {
    await openBlox(page);
    await enter(page, 'coins');
    await openGameSettings(page);
    await next(page, 'movementMode');
    await expect(row(page, 'movementMode')).toContainText('Щелчок мышью');
    await closeMenu(page);
    await page.evaluate(() => { const g = __blox.game; g.rig.yaw = 0; g.rig.pitch = 0.6; __blox.step(3); });
    const p0 = await page.evaluate(() => __blox.player());
    await page.mouse.click(640, 300);                                   // выше середины - земля впереди героя
    const tgt = await page.evaluate(() => __blox.game.moveTarget && { x: __blox.game.moveTarget.x, z: __blox.game.moveTarget.z });
    expect(tgt).not.toBeNull();
    expect(tgt.z).toBeLessThan(p0.z);                                   // впереди, по взгляду камеры
    const p1 = await page.evaluate(() => { __blox.run(180); __blox.step(1); return __blox.player(); });
    expect(Math.hypot(p1.x - tgt.x, p1.z - tgt.z)).toBeLessThan(1.5);
  });

  test('громкость: общая, музыка и эффекты доходят до микшера; статистика показывает fps', async ({ page }) => {
    await openBlox(page);
    await enter(page, 'race');
    await page.evaluate(() => __blox.B.sound.play('click'));
    await openGameSettings(page);
    await slide(page, 'volMaster', 0.5);
    await slide(page, 'volMusic', 0.2);
    await slide(page, 'volSfx', 0);
    const lv = await page.evaluate(() => __blox.B.sound.levels());
    expect(lv.master).toBeCloseTo(0.5, 5);
    expect(lv.music).toBeCloseTo(0.2 * 0.35, 5);
    expect(lv.sfx).toBe(0);
    await toggle(page, 'perfStats');
    await closeMenu(page);
    await expect(page.locator('#g-perf')).toBeVisible();
    await expect(page.locator('#g-perf')).toContainText(/\d+ fps · [\d.]+ ms/);
  });

  test('полный экран включается из меню', async ({ page }) => {
    await openBlox(page);
    await enter(page, 'obby');
    await openGameSettings(page);
    await page.locator('#m-fullscreen').click();
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
    await expect(page.locator('#m-fullscreen')).toHaveClass(/on/);
  });

  test('настройки переживают перезагрузку; «Вернуть по умолчанию» сбрасывает всё', async ({ page }) => {
    await openBlox(page);
    await enter(page, 'coins');
    await openGameSettings(page);
    await next(page, 'cameraMode');
    await toggle(page, 'invert');
    await slide(page, 'sens', 2.5);
    await slide(page, 'volMusic', 0.1);
    await page.reload();
    await page.waitForFunction(() => window.__blox && __blox.ready);
    await enter(page, 'coins');
    await openGameSettings(page);
    await expect(row(page, 'cameraMode')).toContainText('Следование');
    await expect(row(page, 'invert')).toContainText('Вкл');
    await expect(row(page, 'sens')).toContainText('2.5');
    await expect(row(page, 'volMusic')).toContainText('10%');
    await page.locator('#m-defaults').click();
    const all = await page.evaluate(() => __blox.B.gameSettings.all());
    expect(all).toEqual(await page.evaluate(() => __blox.B.gameSettings.DEFAULTS));
    await expect(row(page, 'cameraMode')).toContainText('Классика');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mix.blox.gamesettings')).sens)).toBe(1);
  });

  test('лаунчер: тема, язык, скрытый чат, уведомления - применяются и хранятся', async ({ page }) => {
    await openBlox(page);
    await page.locator('.sidenav [data-sec="settings"]').click();
    await page.locator('[data-st="look"]').click();
    await page.locator('#set-list .set-row[data-key="theme"] .arrow').last().click();
    await expect(page.locator('body')).toHaveClass(/theme-light/);
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe('rgb(238, 240, 243)');
    await page.locator('#set-list .set-row[data-key="lang"] .arrow').last().click();
    await expect(page.locator('.sidenav [data-sec="home"]')).toContainText('Home');
    await expect(page.locator('#sec-settings h1')).toHaveText('Settings');
    await page.locator('[data-st="privacy"]').click();
    await page.locator('#set-list .set-row[data-key="chat"] .arrow').last().click();
    await page.locator('[data-st="notify"]').click();
    await page.locator('#set-list .set-row[data-key="notifyCurrency"] .toggle').click();
    await page.reload();
    await page.waitForFunction(() => window.__blox && __blox.ready);
    await expect(page.locator('body')).toHaveClass(/theme-light/);
    await expect(page.locator('#sec-home .card[data-place="obby"] .card-title')).toHaveText('Tower Obby');
    await enter(page, 'race');
    await expect(page.locator('#g-chat')).toBeHidden();
    await page.keyboard.press('Enter');                                // чат не открывается
    expect(await page.evaluate(() => document.activeElement.id)).not.toBe('g-chat-in');
    await page.evaluate(() => { const g = __blox.game; g.place.scriptedRun(g, 30); });
    await page.waitForTimeout(300);
    await expect(page.locator('#toasts .toast.cube')).toHaveCount(0);  // кубы пришли молча
    expect(await page.evaluate(() => __blox.balance())).toBe(30);
  });

  test('сброс прогресса - только с подтверждением; настройки остаются', async ({ page }) => {
    await openBlox(page);
    await page.evaluate(() => { __blox.B.acct.addCurrency(77); __blox.B.acct.award('first_steps'); __blox.B.settings.set('theme', 'light'); });
    await page.locator('.sidenav [data-sec="settings"]').click();
    await page.locator('#acc-reset').click();
    await expect(page.locator('#modal')).toContainText('Удалить кубы');
    await page.locator('#rs-no').click();
    expect(await page.evaluate(() => __blox.balance())).toBe(77);
    await page.locator('#acc-reset').click();
    await page.locator('#rs-yes').click();
    expect(await page.evaluate(() => [__blox.balance(), Object.keys(__blox.B.acct.badges()).length, __blox.B.settings.get('theme')])).toEqual([0, 0, 'light']);
    await expect(page.locator('#bal')).toHaveText('0');
  });
});
