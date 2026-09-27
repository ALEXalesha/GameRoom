// Законы «Космического стрелка» после доработки для «Игротеки»: кампания из 8 секторов
// проходится (бот стреляет настоящими пулями и покупает улучшения кнопками мастерской), босс
// побеждается и открывает следующий сектор, мастерская, контрольная точка, экран победы,
// прогресс после перезагрузки, сложность, пауза при скрытии вкладки, переназначение огня.
const { test, expect } = require('@playwright/test');
const { openGame, fitReport, expectFits, SIZES } = require('./_games-helpers');
const { hideTab, showTab, blurWindow, focusWindow, pauseLayout } = require('./_kit-helpers');

// Бой до мастерской или победы: автоприцел, огонь зажат, корабль неуязвим (проверяем путь, а не ловкость)
const FIGHT = `(maxSteps) => {
  const g = __game; let n = 0;
  while (g.S.phase !== 'shop' && g.S.phase !== 'won' && g.S.phase !== 'over' && n < maxSteps) { g.P.invuln = 5; g.setHeld(true); g.step(1, false); n++; }
  g.setHeld(false);
  return { phase: g.S.phase, sector: g.S.sector, steps: n };
}`;

test.describe('space_shooter: кампания', () => {
  test('меню поверх заставки-боя, без ошибок', async ({ page }) => {
    const errors = await openGame(page, 'space_shooter', 'seed=1&fast');
    await expect(page.locator('[data-screen=main]')).toBeVisible();
    for (const t of ['Кампания', 'Выбор сектора', 'Выживание', 'Настройки', 'Достижения и рекорды', 'Как играть', 'Об игре']) {
      await expect(page.locator(`[data-screen=main] .kit-btn:has-text("${t}")`).first()).toBeVisible();
    }
    const f0 = await page.evaluate(() => __game.S.frame);
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => __game.S.frame)).toBeGreaterThan(f0);
    expect(errors).toEqual([]);
  });

  test('все 8 секторов проходятся настоящей стрельбой, мастерская между ними, в конце - экран победы', async ({ page }) => {
    test.setTimeout(120_000);
    await openGame(page, 'space_shooter', 'seed=2&fast');
    await page.evaluate(() => { localStorage.clear(); __game.kit.set('autoAim', true); });
    await page.click('[data-screen=main] .kit-btn:has-text("Кампания")');
    const bosses = [];
    for (let sec = 0; sec < 8; sec++) {
      const r = await page.evaluate(`(${FIGHT})(40000)`);
      if (sec === 7) { expect(r.phase).toBe('won'); break; }
      expect(r).toMatchObject({ phase: 'shop', sector: sec });
      await expect(page.locator('[data-screen=shop]')).toBeVisible();
      // покупаем всё, на что хватает, кнопками мастерской
      for (const key of ['weapon', 'damage', 'rate', 'shield']) {
        const b = page.locator(`[data-screen=shop] [data-buy=${key}]`);
        if (await b.isEnabled()) await b.click();
      }
      bosses.push(await page.evaluate(() => Object.keys(__game.kit.unlocked).filter((k) => k.startsWith('boss_')).length));
      await page.click('[data-screen=shop] [data-id=next]');
    }
    await expect(page.locator('[data-screen=victory]')).toBeVisible();
    await expect(page.locator('[data-screen=victory]')).toContainText('Точность');
    const end = await page.evaluate(() => ({ done: __game.progress.done, bosses: Object.keys(__game.kit.unlocked).filter((k) => k.startsWith('boss_')).sort(), up: __game.S.up.weapon }));
    expect(end.done).toBe(true);
    expect(end.bosses).toEqual(['boss_core', 'boss_cruiser', 'boss_guardian', 'boss_hive']);
    expect(end.up).toBeGreaterThan(0);
    expect(bosses[1]).toBe(1);                      // Страж пал во втором секторе
  });

  test('босс сектора 2 побеждается пулями и открывает сектор 3, который виден после перезагрузки', async ({ page }) => {
    await openGame(page, 'space_shooter', 'seed=3&fast');
    await page.evaluate(() => { localStorage.clear(); __game.kit.set('autoAim', true); __game.startCampaign(); __game.progress.up = { ...__game.S.up }; __game.startCampaign(1); __game.startFinale(); });
    expect(await page.evaluate(() => __game.boss && __game.boss.kind)).toBe('guardian');
    const r = await page.evaluate(`(${FIGHT})(20000)`);
    expect(r.phase).toBe('shop');
    expect(await page.evaluate(() => [__game.boss, __game.progress.maxSector, __game.progress.sector])).toEqual([null, 2, 2]);
    await page.reload();
    await page.waitForFunction(() => window.__game && __game.ready);
    await expect(page.locator('[data-screen=main] [data-id=continue]')).toContainText('сектор 3');
    await page.click('[data-screen=main] .kit-btn:has-text("Выбор сектора")');
    await expect(page.locator('[data-sector="2"]')).toBeEnabled();
    await expect(page.locator('[data-sector="3"]')).toBeDisabled();
  });

  test('мастерская: покупка списывает кредиты и работает, без денег - нельзя, покупки сохраняются', async ({ page }) => {
    await openGame(page, 'space_shooter', 'seed=1&fast');
    await page.evaluate(() => { localStorage.clear(); const g = __game; g.startCampaign(); g.S.credits = 260; g.S.sector = 0; g.showShop(); });
    await expect(page.locator('[data-buy=weapon]')).toBeEnabled();
    await page.click('[data-buy=shield]');                              // 100
    await page.click('[data-buy=weapon]');                              // 150
    const r = await page.evaluate(() => ({ c: __game.S.credits, sh: __game.S.up.shield, w: __game.S.up.weapon, max: __game.P.maxHp }));
    expect(r).toEqual({ c: 10, sh: 1, w: 1, max: 125 });
    await expect(page.locator('[data-buy=damage]')).toBeDisabled();     // 120 > 10
    await page.reload();
    await page.waitForFunction(() => window.__game && __game.ready);
    expect(await page.evaluate(() => [__game.progress.up.weapon, __game.progress.up.shield, __game.progress.credits])).toEqual([1, 1, 10]);
  });

  test('гибель - «Повторить сектор» возвращает улучшения и кредиты контрольной точки', async ({ page }) => {
    await openGame(page, 'space_shooter', 'seed=1&fast');
    await page.evaluate(() => {
      localStorage.clear(); const g = __game; g.startCampaign(); g.S.credits = 500; g.showShop();
      g.buy('weapon'); g.buy('damage');                           // точка: оружие 1, урон 1, 230 кредитов
      g.startCampaign(1); g.S.credits = 9999; g.S.up.weapon = 4;   // в бою всё «растратили»
      g.P.hp = 1; g.P.invuln = 0; g.damagePlayer(50); g.step(2);
    });
    await expect(page.locator('[data-screen=over]')).toBeVisible();
    await page.click('[data-screen=over] [data-id=again]');
    expect(await page.evaluate(() => ({ s: __game.S.sector, w: __game.S.up.weapon, d: __game.S.up.damage, c: __game.S.credits, hp: __game.P.hp === __game.P.maxHp }))).toEqual({ s: 1, w: 1, d: 1, c: 230, hp: true });
  });
});

test.describe('space_shooter: правила боя', () => {
  test('попадание убирает врага и даёт кредиты; промах - нет', async ({ page }) => {
    await openGame(page, 'space_shooter', 'seed=1&fast');
    const r = await page.evaluate(() => {
      const g = __game; g.startCampaign(); g.enemies.length = 0; g.asteroids.length = 0; g.S.queue = [];
      g.spawnEnemy('scout', g.P.x + 200, g.P.y); const e = g.enemies[0]; e.hp = 5;
      const c0 = g.S.credits;
      g.aimAt(g.P.x, g.P.y - 300); g.setHeld(true); g.step(8, false); g.setHeld(false);
      const missed = e.hp === 5 || g.enemies.length === 1;
      g.enemies[0].x = g.P.x + 200; g.enemies[0].y = g.P.y; g.enemies[0].vx = g.enemies[0].vy = 0;
      g.aimAt(g.P.x + 200, g.P.y); g.setHeld(true); for (let i = 0; i < 30 && g.enemies.length; i++) { g.enemies.forEach((q) => { q.vx = q.vy = 0; }); g.step(1, false); } g.setHeld(false);
      return { missed, left: g.enemies.length, gain: g.S.credits - c0 };
    });
    expect(r.missed).toBe(true);
    expect(r.left).toBe(0);
    expect(r.gain).toBeGreaterThanOrEqual(8);
  });

  test('сложность меняет урон по кораблю: ×0.6 / ×1 / ×1.4', async ({ page }) => {
    await openGame(page, 'space_shooter', 'seed=1&fast');
    const r = await page.evaluate(() => {
      const g = __game, out = [];
      for (const d of ['easy', 'normal', 'hard']) { g.kit.set('difficulty', d); g.startCampaign(); const h = g.P.hp; g.P.invuln = 0; g.damagePlayer(10); out.push(+(h - g.P.hp).toFixed(2)); }
      return out;
    });
    expect(r).toEqual([6, 10, 14]);
  });

  test('снайпер сначала показывает линию и только потом стреляет; луч в предупреждении не ранит', async ({ page }) => {
    await openGame(page, 'space_shooter', 'seed=1&fast');
    const r = await page.evaluate(() => {
      const g = __game; g.startCampaign(); g.enemies.length = 0; g.asteroids.length = 0; g.S.queue = [];
      g.spawnEnemy('sniper', 200, 200); const s = g.enemies[0]; s.t = 1000;
      g.step(1, false); const aiming = s.aim > 0, shots0 = g.ebullets.length;
      g.step(30, false); const shotsMid = g.ebullets.length;
      g.step(40, false); const shotsEnd = g.ebullets.length;
      g.enemies.length = 0; g.ebullets.length = 0;
      g.beams.push({ x1: g.P.x, y1: 0, x2: g.P.x, y2: 720, t: 30, life: 20, w: 30, dmg: 20 });
      const h = g.P.hp; g.P.invuln = 0; g.step(20, false); const warnDmg = h - g.P.hp;
      g.step(20, false); const beamDmg = h - g.P.hp;
      return { aiming, shots0, shotsMid, shotsEnd, warnDmg, beamDmg };
    });
    expect(r.aiming).toBe(true);
    expect(r.shots0 + r.shotsMid).toBe(0);
    expect(r.shotsEnd).toBe(1);
    expect(r.warnDmg).toBe(0);
    expect(r.beamDmg).toBeGreaterThan(0);
  });

  test('бомба стирает вражеские пули и бьёт всех врагов', async ({ page }) => {
    await openGame(page, 'space_shooter', 'seed=1&fast');
    const r = await page.evaluate(() => {
      const g = __game; g.startCampaign(); g.S.queue = [];
      g.spawnEnemy('fighter', 300, 200); g.spawnEnemy('fighter', 900, 200);
      for (let i = 0; i < 10; i++) g.ebullets.push({ x: 100 + i * 50, y: 400, vx: 0, vy: 0, dmg: 5, r: 5, color: '#f00', life: 100 });
      const b0 = g.S.bombs, hp0 = g.enemies.map((e) => e.hp);
      const used = g.useBomb();
      return { used, bombs: g.S.bombs - b0, bullets: g.ebullets.length, hurt: g.enemies.every((e, i) => e.hp < hp0[i]) };
    });
    expect(r).toEqual({ used: true, bombs: -1, bullets: 0, hurt: true });
  });

  test('выживание: волны идут, рекорд волн сохраняется', async ({ page }) => {
    await openGame(page, 'space_shooter', 'seed=4&fast');
    await page.evaluate(() => { localStorage.clear(); __game.kit.set('autoAim', true); });
    await page.click('[data-screen=main] .kit-btn:has-text("Выживание")');
    const w = await page.evaluate(() => { const g = __game; let n = 0; while (g.S.survivalWave < 3 && n < 20000) { g.P.invuln = 5; g.setHeld(true); g.step(1, false); n++; } return g.S.survivalWave; });
    expect(w).toBe(3);
    await page.reload();
    await page.waitForFunction(() => window.__game && __game.ready);
    expect(await page.evaluate(() => __game.records.survival)).toBeGreaterThanOrEqual(2);
  });
});

test.describe('space_shooter: пауза, настройки, окно', () => {
  for (const size of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
    test(`пауза ${size.width}x${size.height}: надпись игры не наезжает на окно «Пауза»`, async ({ page }) => {
      await page.setViewportSize(size);
      await openGame(page, 'space_shooter', 'seed=1');
      await page.click('[data-screen=main] .kit-btn:has-text("Кампания")');
      await page.waitForTimeout(150);
      const r = await pauseLayout(page);
      expect(r.during, 'в игре надпись видна').not.toBe(null);
      expect(r.overlap).toBe(false);
    });
  }

  test('потеря фокуса окна ставит паузу, возврат фокуса паузу не снимает - только игрок', async ({ page }) => {
    await openGame(page, 'space_shooter', 'seed=1');
    await page.click('[data-screen=main] .kit-btn:has-text("Кампания")');
    await blurWindow(page);
    await focusWindow(page);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => __game.kit.mode)).toBe('paused');
    await expect(page.locator('[data-screen=pause]')).toBeVisible();
    await page.click('[data-screen=pause] [data-id=resume]');
    expect(await page.evaluate(() => __game.kit.mode)).toBe('play');
  });

  test('скрытие вкладки - пауза и тишина, после возврата пауза остаётся; Esc продолжает', async ({ page }) => {
    await openGame(page, 'space_shooter', 'seed=1&fast');
    await page.click('[data-screen=main] .kit-btn:has-text("Кампания")');
    await page.evaluate(() => __game.kit.audioCtx());
    await hideTab(page);
    const hidden = await page.evaluate(() => ({ m: __game.kit.mode, a: __game.kit.ctx.state }));
    await showTab(page);
    const f = await page.evaluate(() => __game.S.stats.steps);
    await page.waitForTimeout(300);
    expect(hidden).toEqual({ m: 'paused', a: 'suspended' });
    expect(await page.evaluate(() => __game.S.stats.steps)).toBe(f);
    await expect(page.locator('[data-screen=pause]')).toBeVisible();
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => __game.kit.mode)).toBe('play');
  });

  test('огонь переназначается на K и стреляет с неё', async ({ page }) => {
    await openGame(page, 'space_shooter', 'seed=1&fast');
    await page.evaluate(() => localStorage.clear());
    await page.click('[data-screen=main] .kit-btn:has-text("Настройки")');
    await page.click('[data-bind="fire:0"]');
    await page.keyboard.press('KeyK');
    await expect(page.locator('[data-bind="fire:0"]')).toHaveText('K');
    await page.click('[data-screen=settings] .kit-btn:has-text("Готово")');
    await page.click('[data-screen=main] .kit-btn:has-text("Кампания")');
    await page.keyboard.down('KeyK');
    const shots = await page.evaluate(() => { const a = __game.S.stats.shots; __game.step(30, false); return __game.S.stats.shots - a; });
    await page.keyboard.up('KeyK');
    expect(shots).toBeGreaterThanOrEqual(2);
  });

  for (const size of [...SIZES, { width: 1920, height: 1080 }]) {
    test(`поле и меню влезают в окно ${size.width}x${size.height}, холст чёткий`, async ({ page }) => {
      await page.setViewportSize(size);
      await openGame(page, 'space_shooter');
      expectFits(expect, await fitReport(page, '#game'));
      expectFits(expect, await fitReport(page, '[data-screen=main] .kit-panel'));
      const c = await page.evaluate(() => { const c = document.getElementById('game'), r = c.getBoundingClientRect(); return c.width / r.width / devicePixelRatio; });
      expect(Math.abs(c - 1)).toBeLessThan(0.02);
    });
  }
});

test.describe('space_shooter: по ревью', () => {
  test('выбор сектора после перезагрузки берёт улучшения и кредиты последней мастерской', async ({ page }) => {
    await openGame(page, 'space_shooter', 'seed=1&fast');
    const saved = await page.evaluate(() => {
      localStorage.clear(); const g = __game; g.startCampaign(); g.S.credits = 3000; g.showShop();
      for (const k of ['weapon', 'weapon', 'weapon', 'damage', 'shield', 'rate']) g.buy(k);
      g.progress.up = { ...g.S.up }; g.progress.credits = g.S.credits; g.progress.maxSector = 3; g.progress.sector = 3; g.kit.save('progress', g.progress);
      return { up: g.progress.up, credits: g.progress.credits };
    });
    await page.reload();
    await page.waitForFunction(() => window.__game && __game.ready);
    await page.click('[data-screen=main] [data-id=sectors]');
    await page.click('[data-sector="1"]');
    const fight = await page.evaluate(() => ({ up: __game.S.up, credits: __game.S.credits, sector: __game.S.sector }));
    expect(fight).toEqual({ up: saved.up, credits: saved.credits, sector: 1 });
  });

  test('корабль не заходит под полосу прочности, кредиты и полосу босса', async ({ page }) => {
    await openGame(page, 'space_shooter', 'seed=1');
    await page.click('[data-screen=main] [data-id=campaign]');
    const r = await page.evaluate(() => { const g = __game; g.P.y = 5; g.P.vy = -20; g.step(3, false); return { y: g.P.y, min: g.HUD_BOTTOM + g.P.r }; });
    expect(r.y).toBeGreaterThanOrEqual(r.min);
    expect(r.min).toBeGreaterThanOrEqual(64);
  });

  test('«Трудная кампания» - только если все сектора пройдены на трудной', async ({ page }) => {
    await openGame(page, 'space_shooter', 'seed=1&fast');
    const r = await page.evaluate(() => {
      localStorage.clear(); const g = __game; g.kit.unlocked = {};
      g.kit.set('difficulty', 'hard'); g.progress.maxSector = 7; g.progress.up = { weapon: 0, damage: 0, shield: 0, speed: 0, rate: 0 };
      g.startCampaign(7); g.enemies.length = 0; g.S.queue = []; g.S.wave = g.SECTORS[7].waves.length - 1;
      g.startFinale(); if (g.boss) g.boss.hp = 0; for (const e of g.enemies) e.hp = 0;
      for (let i = 0; i < 400 && g.S.phase !== 'won'; i++) g.step(1, false);
      return { phase: g.S.phase, hard: !!g.kit.unlocked.campaignHard };
    });
    expect(r).toEqual({ phase: 'won', hard: false });
  });
});
