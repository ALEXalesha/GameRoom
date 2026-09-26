// Законы «Дино-бега» после доработки для «Игротеки»: меню, путешествие из четырёх этапов,
// которое можно пройти (проверяет независимый «бот» через настоящие клавиши), контрольные
// точки, экран победы, прогресс после перезагрузки, сердца и скорость по сложности,
// настройки (громкость, переназначение клавиш), пауза при скрытии вкладки, рекорды.
const { test, expect } = require('@playwright/test');
const { openGame, fitReport, expectFits, SIZES } = require('./_games-helpers');
const { hideTab, showTab } = require('./_kit-helpers');

// Бот нажимает клавиши каркаса (Пробел/↓), глядя на ближайшее препятствие
const BOT = `(maxSteps, untilLeg) => {
  const g = __game, k = g.kit, s = g.state, d = g.dino;
  for (let i = 0; i < maxSteps && s.phase === 'run'; i++) {
    if (untilLeg !== undefined && s.leg >= untilLeg) break;
    const o = g.obstacles.find((q) => q.x + q.w > d.x - 2);
    let jump = false, duck = false;
    if (o) {
      const dx = o.x - (d.x + 44);
      if (o.type === 'bird' && o.level === 'high') {}
      else if (o.type === 'bird' && o.level === 'mid') duck = dx < s.speed * 9;
      else jump = dx < s.speed * 7 || (d.jumping && d.vy < 0);
    }
    jump ? k.held.add('Space') : k.held.delete('Space');
    duck ? k.held.add('ArrowDown') : k.held.delete('ArrowDown');
    g.step(1, false);
  }
  k.held.clear();
  return { dist: Math.floor(s.dist), leg: s.leg, phase: s.phase, hits: s.stats.hits, lives: s.lives };
}`;

test.describe('dino: меню и прохождение', () => {
  test('при запуске - главное меню поверх живой заставки, без ошибок', async ({ page }) => {
    const errors = await openGame(page, 'dino', 'seed=1');
    await expect(page.locator('[data-screen=main]')).toBeVisible();
    for (const t of ['Путешествие', 'Бесконечный бег', 'Выбор этапа', 'Настройки', 'Достижения и рекорды', 'Как играть', 'Об игре']) {
      await expect(page.locator('[data-screen=main] .kit-btn', { hasText: t }).first()).toBeVisible();
    }
    const d0 = await page.evaluate(() => __game.state.dist);
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => __game.state.dist)).toBeGreaterThan(d0);   // заставка бежит
    expect(await page.evaluate(() => __game.autopilot)).toBe(true);             // в заставке бежит автопилот...
    await page.click('[data-screen=main] .kit-btn:has-text("Бесконечный бег")');
    expect(await page.evaluate(() => __game.autopilot)).toBe(false);            // ...а в забеге правит игрок
    expect(errors).toEqual([]);
  });

  test('всё путешествие проходится ботом через клавиши: 4 этапа, финиш, экран победы', async ({ page }) => {
    test.setTimeout(120_000);
    await openGame(page, 'dino', 'seed=3');
    await page.evaluate(() => localStorage.clear());
    await page.click('[data-screen=main] .kit-btn:has-text("Путешествие")');
    const r = await page.evaluate(`(${BOT})(30000)`);
    expect(await page.evaluate(() => __game.autopilot)).toBe(false);
    expect(r.phase).toBe('won');
    expect(r.dist).toBe(10000);
    await expect(page.locator('[data-screen=victory]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-screen=victory]')).toContainText('Прыжков');
    const saved = await page.evaluate(() => ({ p: __game.progress, t: __game.records.journeyTime.normal }));
    expect(saved.p.done).toBe(true);
    expect(saved.t).toBeGreaterThan(60);
  });

  test('этап открывает следующий и переживает перезагрузку: в меню «Продолжить»', async ({ page }) => {
    await openGame(page, 'dino', 'seed=2');
    await page.evaluate(() => { localStorage.clear(); __game.startJourney(0); });
    const r = await page.evaluate(`(${BOT})(5000, 1)`);
    expect(r.leg).toBe(1);
    await page.reload();
    await page.waitForFunction(() => window.__game && __game.ready);
    expect(await page.evaluate(() => __game.progress.leg)).toBe(1);
    const cont = page.locator('[data-screen=main] .kit-btn:has-text("Продолжить путешествие")');
    await expect(cont).toBeVisible();
    await cont.click();
    const st = await page.evaluate(() => ({ from: __game.state.legStart, leg: __game.state.leg, m: __game.kit.mode, d: __game.state.dist }));
    expect(st).toMatchObject({ from: 1000, leg: 1, m: 'play' });
    expect(st.d).toBeLessThan(1100);
  });

  test('сердца кончились - экран «с контрольной точки» ставит на начало этапа', async ({ page }) => {
    await openGame(page, 'dino', 'seed=2');
    await page.evaluate(() => {
      const g = __game; g.startJourney(1); g.state.dist = 1800;
      for (let i = 0; i < 5 && g.state.phase === 'run'; i++) {
        g.state.invuln = 0; g.obstacles.length = 0;
        const c = g.makeObstacle('cactus', { w: 18, h: 36 }); c.x = g.dino.x + 5; g.obstacles.push(c); g.step(2);
      }
      g.step(80);
    });
    await expect(page.locator('[data-screen=over]')).toBeVisible();
    await page.click('[data-screen=over] [data-id=again]');
    const st = await page.evaluate(() => ({ from: __game.state.legStart, lives: __game.state.lives, d: __game.state.dist }));
    expect(st).toMatchObject({ from: 1000, lives: 2 });
    expect(st.d).toBeLessThan(1100);
  });

  test('выбор этапа: закрытые этапы недоступны', async ({ page }) => {
    await openGame(page, 'dino', 'seed=1');
    await page.evaluate(() => { localStorage.clear(); __game.kit.showMain(); });
    await page.click('[data-screen=main] .kit-btn:has-text("Выбор этапа")');
    await expect(page.locator('[data-leg="0"]')).toBeEnabled();
    await expect(page.locator('[data-leg="1"]')).toBeDisabled();
    await expect(page.locator('[data-leg="3"]')).toBeDisabled();
  });
});

test.describe('dino: правила бега', () => {
  test('столкновение отнимает сердце и даёт мигание; сердец - по сложности, скорость тоже', async ({ page }) => {
    await openGame(page, 'dino', 'seed=1');
    const r = await page.evaluate(() => {
      const g = __game, k = g.kit, out = {};
      for (const d of ['easy', 'normal', 'hard']) {
        k.set('difficulty', d); g.startJourney(0); g.clearObstacles(); g.step(300, false);
        out[d] = { lives: g.state.lives, speed: +g.state.speed.toFixed(2) };
      }
      k.set('difficulty', 'normal'); g.startJourney(0); g.clearObstacles();
      const c = g.makeObstacle('cactus', { w: 18, h: 36 }); c.x = g.dino.x + 5; g.obstacles.push(c); g.step(2, false);
      out.after = { lives: g.state.lives, invuln: g.state.invuln > 0, phase: g.state.phase, left: g.obstacles.length };
      return out;
    });
    expect([r.easy.lives, r.normal.lives, r.hard.lives]).toEqual([3, 2, 1]);
    expect(r.easy.speed).toBeLessThan(r.normal.speed);
    expect(r.hard.speed).toBeGreaterThan(r.normal.speed);
    expect(r.after).toEqual({ lives: 1, invuln: true, phase: 'run', left: 0 });
  });

  test('птицы: высокая безопасна, под средней пригнуться, через низкую прыгать', async ({ page }) => {
    await openGame(page, 'dino', 'seed=1');
    const r = await page.evaluate(() => {
      const g = __game; g.startJourney(0); g.clearObstacles();
      const bird = (lvl) => { g.obstacles.length = 0; const b = g.makeBird(lvl); b.x = g.dino.x + 10; g.obstacles.push(b); };
      bird('mid'); g.dino.ducking = false; const midStand = !!g.collidingObstacle();
      g.dino.ducking = true; const midDuck = !!g.collidingObstacle();
      bird('low'); const lowDuck = !!g.collidingObstacle();
      bird('high'); g.dino.ducking = false; const highStand = !!g.collidingObstacle();
      return { midStand, midDuck, lowDuck, highStand };
    });
    expect(r).toEqual({ midStand: true, midDuck: false, lowDuck: true, highStand: false });
  });

  test('бесконечный бег: рекорд сохраняется и переживает перезагрузку', async ({ page }) => {
    await openGame(page, 'dino', 'seed=1');
    const rec = await page.evaluate(() => {
      localStorage.clear(); const g = __game; g.startEndless(); g.clearObstacles(); g.step(900, false);
      const c = g.makeObstacle('cactus', { w: 18, h: 36 }); c.x = g.dino.x + 5; g.obstacles.push(c); g.step(80);
      return { rec: g.records.endless, phase: g.state.phase };
    });
    expect(rec.phase).toBe('over');
    expect(rec.rec).toBeGreaterThan(500);
    await expect(page.locator('[data-screen=over]')).toContainText('Новый рекорд');
    await page.reload();
    await page.waitForFunction(() => window.__game && __game.ready);
    expect(await page.evaluate(() => __game.records.endless)).toBe(rec.rec);
    expect(await page.evaluate(() => !!__game.kit.unlocked.first500)).toBe(true);
  });

  test('одинаковый seed - одинаковые препятствия', async ({ page }) => {
    const run = async () => {
      await openGame(page, 'dino', 'seed=42');
      return page.evaluate(() => {
        const g = __game; g.reseed(42); g.startEndless(); const seen = [];
        for (let i = 0; i < 600; i++) { g.state.invuln = 5; g.step(1, false); for (const o of g.obstacles) if (!o.seen) { o.seen = 1; seen.push(o.type + o.w + ':' + o.h); } }
        return seen.join(',');
      });
    };
    const a = await run(); const b = await run();
    expect(a.length).toBeGreaterThan(10);
    expect(b).toBe(a);
  });
});

test.describe('dino: пауза, настройки, окно', () => {
  test('Esc - пауза с «Продолжить / Настройки / Заново / В меню», мир стоит', async ({ page }) => {
    await openGame(page, 'dino', 'seed=1');
    await page.click('[data-screen=main] .kit-btn:has-text("Бесконечный бег")');
    await page.waitForTimeout(200);
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-screen=pause]')).toBeVisible();
    for (const t of ['Продолжить', 'Настройки', 'Заново', 'В меню']) await expect(page.locator(`[data-screen=pause] .kit-btn:has-text("${t}")`)).toBeVisible();
    const d = await page.evaluate(() => __game.state.dist);
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => __game.state.dist)).toBe(d);
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => __game.kit.mode)).toBe('play');
  });

  test('скрытие вкладки ставит паузу и глушит звук; после возврата игра всё ещё на паузе', async ({ page }) => {
    await openGame(page, 'dino', 'seed=1');
    await page.click('[data-screen=main] .kit-btn:has-text("Бесконечный бег")');
    await page.evaluate(() => __game.kit.audioCtx());
    await hideTab(page);
    const hidden = await page.evaluate(() => ({ mode: __game.kit.mode, audio: __game.kit.ctx.state }));
    await showTab(page);
    await page.waitForTimeout(200);
    const back = await page.evaluate(() => ({ mode: __game.kit.mode, music: __game.kit.music.name }));
    expect(hidden).toEqual({ mode: 'paused', audio: 'suspended' });
    expect(back).toEqual({ mode: 'paused', music: null });
    await expect(page.locator('[data-screen=pause]')).toBeVisible();
  });

  test('громкость музыки меняет усиление и сохраняется', async ({ page }) => {
    await openGame(page, 'dino', 'seed=1');
    await page.evaluate(() => __game.kit.audioCtx());
    await page.click('[data-screen=main] .kit-btn:has-text("Настройки")');
    await page.locator('input[data-setting=musicVol]').fill('20');
    await page.locator('input[data-setting=sfxVol]').fill('65');
    expect(await page.evaluate(() => [__game.kit.musicGain.gain.value, __game.kit.sfxGain.gain.value].map((v) => +v.toFixed(2)))).toEqual([0.2, 0.65]);
    await page.reload();
    await page.waitForFunction(() => window.__game && __game.ready);
    expect(await page.evaluate(() => [__game.kit.settings.musicVol, __game.kit.settings.sfxVol])).toEqual([0.2, 0.65]);
  });

  test('переназначение прыжка на W работает, занятую клавишу взять нельзя', async ({ page }) => {
    await openGame(page, 'dino', 'seed=1');
    await page.evaluate(() => localStorage.clear());
    await page.click('[data-screen=main] .kit-btn:has-text("Настройки")');
    await page.click('[data-bind="jump:0"]');
    await page.keyboard.press('KeyW');
    await expect(page.locator('[data-bind="jump:0"]')).toHaveText('W');
    await page.click('[data-bind="duck:0"]');
    await page.keyboard.press('KeyW');                                   // W уже у прыжка
    await expect(page.locator('.kit-modal .kit-warn')).toContainText('уже занята');
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-bind="duck:0"]')).toHaveText('↓');
    await page.click('[data-screen=settings] .kit-btn:has-text("Готово")');
    await page.click('[data-screen=main] .kit-btn:has-text("Бесконечный бег")');
    await page.evaluate(() => { __game.clearObstacles(); });
    await page.keyboard.down('Space'); await page.evaluate(() => __game.step(3, false)); await page.keyboard.up('Space');
    const bySpace = await page.evaluate(() => __game.dino.jumping);
    await page.keyboard.down('KeyW'); await page.evaluate(() => __game.step(3, false)); await page.keyboard.up('KeyW');
    const byW = await page.evaluate(() => __game.dino.jumping);
    expect(bySpace).toBe(false);
    expect(byW).toBe(true);
    await page.reload();
    await page.waitForFunction(() => window.__game && __game.ready);
    expect(await page.evaluate(() => __game.kit.bindings.jump[0])).toBe('KeyW');
  });

  test('сброс прогресса с подтверждением стирает этапы и рекорды, но не настройки', async ({ page }) => {
    await openGame(page, 'dino', 'seed=1');
    await page.evaluate(() => { const g = __game; g.progress.leg = 2; g.records.endless = 999; g.kit.save('progress', g.progress); g.kit.save('records', g.records); g.kit.set('musicVol', 0.3); g.kit.showMain(); });
    await page.click('[data-screen=main] .kit-btn:has-text("Настройки")');
    await page.click('[data-id=resetProgress]');
    await page.click('[data-screen=confirm] .kit-btn:has-text("Да")');
    expect(await page.evaluate(() => [__game.progress.leg, __game.records.endless, __game.kit.settings.musicVol])).toEqual([0, 0, 0.3]);
  });

  for (const size of [...SIZES, { width: 1920, height: 1080 }]) {
    test(`игра и меню влезают в окно ${size.width}x${size.height}, холст чёткий`, async ({ page }) => {
      await page.setViewportSize(size);
      await openGame(page, 'dino');
      expectFits(expect, await fitReport(page, '#game'));
      expectFits(expect, await fitReport(page, '[data-screen=main] .kit-panel'));
      const c = await page.evaluate(() => { const c = document.getElementById('game'), r = c.getBoundingClientRect(); return { ratio: c.width / r.width, dpr: devicePixelRatio }; });
      expect(Math.abs(c.ratio - c.dpr)).toBeLessThan(0.02);
    });
  }
});
