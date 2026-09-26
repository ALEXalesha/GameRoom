// Законы профиля: облик из инвентаря на оружии в бою, кейсы за жетоны, настройки каждого раздела
// меняют поведение и переживают перезагрузку, код прицела туда-обратно, переназначение клавиш
// с конфликтом и сбросом, статистика, звания вверх и вниз, миссии по своим условиям, финал.
const { test, expect } = require('@playwright/test');
const { openTactical, startMatch } = require('./_tactical-helpers');

const setRange = (page, sel, v) => page.$eval(sel, (el, val) => { el.value = String(val); el.dispatchEvent(new Event('input', { bubbles: true })); }, v);

test.describe('fps_1: инвентарь и кейсы', () => {
  test('облик, выбранный в инвентаре, надет на оружие в бою', async ({ page }) => {
    await openTactical(page);
    const it = await page.evaluate(() => {
      TAC.inventory.data.tokens = 1000;
      const r = TAC.menu.openCase('perimeter', TAC.makeRng(42));
      document.getElementById('caseopen').classList.remove('show');
      return r.item;
    });
    await page.evaluate(() => TAC.menu.openTab('inventory'));
    await page.click(`#weaponList [data-weapon=${it.weapon}]`);
    await page.click(`#skinList [data-uid="${it.uid}"]`);
    await expect(page.locator(`#skinList [data-uid="${it.uid}"]`)).toHaveClass(/on/);
    const r = await page.evaluate((item) => {
      __tactical.start({ mode: 'dm', map: 'quarry', ai: false });
      const m = __tactical.match, p = m.player;
      const def = TAC.WEAPONS[item.weapon];
      if (def.slot !== 'knife') m.buy(p, item.weapon);
      m.switchSlot(p, def.slot);
      const w = p.weapon();
      return { weaponSkin: w.skin, vm: __tactical.viewmodelSkin(), map: __tactical.app.vm.skinMat.map.userData.pattern, stored: TAC.store.get('inventory').equipped[item.weapon] };
    }, it);
    expect(r.weaponSkin).toBe(it.pattern);
    expect(r.vm).toBe(it.pattern);
    expect(r.map).toBe(it.pattern);
    expect(r.stored).toBe(it.uid);
  });

  test('кейс стоит жетоны, без жетонов не открывается, предмет по таблице кейса', async ({ page }) => {
    await openTactical(page);
    const r = await page.evaluate(() => {
      const inv = TAC.inventory, c = TAC.CASES.surf;
      inv.data.tokens = 310;
      const rng = TAC.makeRng(7);
      const a = inv.open('surf', rng), b = inv.open('surf', rng), no = inv.open('surf', rng);
      const inCase = (x) => c.items.some(([w, p]) => w === x.weapon && p === x.pattern);
      return { a: inCase(a.item), b: inCase(b.item), no: no.reason, tokens: inv.data.tokens, items: inv.data.items.length, saved: TAC.store.get('inventory').items.length };
    });
    expect(r).toEqual({ a: true, b: true, no: 'tokens', tokens: 10, items: 2, saved: 2 });
    // кнопка открытия гаснет без жетонов
    await page.evaluate(() => { TAC.menu.openTab('inventory'); TAC.menu.invSub('cases'); });
    await expect(page.locator('#caseList [data-case=surf]')).toBeDisabled();
  });
});

test.describe('fps_1: настройки', () => {
  test('каждый раздел меняет игру: игра, видео, аудио, мышь; всё переживает перезагрузку', async ({ page }) => {
    await openTactical(page);
    await page.click('#navSettings');
    // Игра
    await page.click('#set-game [data-key=radarRotate] button[data-val=false]');
    await setRange(page, '#set-game input[data-key=vmFov]', 80);
    await setRange(page, '#set-game input[data-key=hudScale]', 1.2);
    // Видео
    await page.click('.settabs button[data-set=video]');
    await setRange(page, '#set-video input[data-key=renderScale]', 0.5);
    await setRange(page, '#set-video input[data-key=distance]', 80);
    await page.click('#set-video [data-key=shadows] button[data-val=high]');
    await page.click('#set-video [data-key=showFps] button[data-val=true]');
    // Аудио
    await page.click('.settabs button[data-set=audio]');
    await setRange(page, '#set-audio input[data-key=master]', 0.3);
    await page.click('#set-audio [data-key=eq] button[data-val=crisp]');
    // Мышь
    await page.click('.settabs button[data-set=input]');
    await setRange(page, '#set-input input[data-key=sens]', 2);
    await page.click('#set-input [data-key=invertY] button[data-val=true]');
    const check = () => page.evaluate(() => {
      __tactical.start({ mode: 'dm', map: 'quarry', ai: false });
      const app = __tactical.app, p = __tactical.player;
      TAC.hud.forceRadar = true;
      p.yaw = 1; __tactical.render();
      const radar = TAC.hud.radarState.angle;
      const y0 = p.yaw, pt0 = p.pitch;
      __tactical.look(100, 50);
      TAC.audio.init();
      return {
        radar, vmFov: app.vm.camera.fov, hudScale: getComputedStyle(document.documentElement).getPropertyValue('--hud-scale').trim(),
        pixel: app.renderer.getPixelRatio(), far: app.camera.far, fog: app.mapRender.fog.far, shadows: app.renderer.shadowMap.enabled,
        fps: getComputedStyle(document.getElementById('fps')).display,
        master: TAC.audio.effective().master, boost: TAC.audio.effective().stepBoostDb,
        dyaw: +((y0 - p.yaw) / (100 * 0.022 * Math.PI / 180)).toFixed(3), dpitch: Math.sign(p.pitch - pt0),
      };
    });
    const expected = { radar: 0, vmFov: 80, hudScale: '1.2', pixel: 0.5, far: 100, fog: 80, shadows: true, fps: 'block', master: 0.3, boost: 9, dyaw: 2, dpitch: 1 };
    expect(await check()).toEqual(expected);
    await page.reload();
    await page.waitForFunction(() => window.__tactical && __tactical.ready);
    expect(await check()).toEqual(expected);
    // по умолчанию - всё назад
    const defaults = await page.evaluate(() => {
      for (const s of ['game', 'video', 'audio', 'input']) TAC.resetSettings(s);
      __tactical.app.applySettings();
      __tactical.start({ mode: 'dm', map: 'quarry', ai: false });
      const p = __tactical.player; p.yaw = 1; TAC.hud.forceRadar = true; __tactical.render();
      return { radar: TAC.hud.radarState.angle, pixel: __tactical.app.renderer.getPixelRatio(), master: TAC.audio.effective().master };
    });
    expect(defaults).toEqual({ radar: 1, pixel: 1, master: 0.7 });
  });

  test('прицел: размер из настроек виден в бою и сохраняется; код прицела туда и обратно', async ({ page }) => {
    await openTactical(page);
    await page.click('#navSettings');
    await page.click('.settabs button[data-set=crosshair]');
    const w0 = await page.$eval('#crosshair i', (e) => e.getBoundingClientRect().width);
    await setRange(page, '#xhControls input[data-key=size]', 8);
    await page.click('#xhControls [data-key=dot] button[data-val=true]');
    await page.click('#xhControls [data-key=color] button[data-val=cyan]');
    const code = await page.$eval('#xhCode', (e) => e.value);
    expect(code).toMatch(/^XH-/);
    await page.click('#xhExport');
    const exported = await page.$eval('#xhCode', (e) => e.value);
    // испортить прицел и вернуть кодом
    await setRange(page, '#xhControls input[data-key=size]', 2);
    await page.fill('#xhCode', exported);
    await page.click('#xhImport');
    const after = await page.evaluate(() => TAC.settings.crosshair);
    expect(after.size).toBe(8);
    expect(after.dot).toBe(true);
    expect(after.color).toBe('cyan');
    // код туда-обратно для многих прицелов
    const round = await page.evaluate(() => {
      const rng = TAC.makeRng(3), bad = [];
      for (let i = 0; i < 50; i++) {
        const c = { style: rng() < 0.5 ? 'static' : 'dynamic', size: Math.round(rng() * 20) / 2, thickness: Math.round(rng() * 10) / 2, gap: Math.round(rng() * 20) / 2 - 5, dot: rng() < 0.5, outline: rng() < 0.5, outlineThickness: 0.5 + Math.round(rng() * 5) / 2, color: ['green', 'yellow', 'custom'][Math.floor(rng() * 3)], r: Math.floor(rng() * 256), g: Math.floor(rng() * 256), b: Math.floor(rng() * 256), alpha: Math.floor(rng() * 256), tStyle: rng() < 0.5, followRecoil: rng() < 0.5 };
        const back = TAC.codeToCrosshair(TAC.crosshairToCode(c));
        if (JSON.stringify(Object.keys(c).sort().map((k) => c[k])) !== JSON.stringify(Object.keys(c).sort().map((k) => back[k]))) bad.push(i);
      }
      return { bad, garbage: TAC.codeToCrosshair('XH-HELLO-WORLD') };
    });
    expect(round).toEqual({ bad: [], garbage: null });
    await page.reload();
    await page.waitForFunction(() => window.__tactical && __tactical.ready);
    await page.evaluate(() => __tactical.start({ mode: 'dm', map: 'quarry', ai: false }));
    const w1 = await page.$eval('#crosshair i', (e) => e.getBoundingClientRect().width);
    const dots = await page.$$eval('#crosshair i', (l) => l.length);
    expect(w1).toBeGreaterThan(w0 * 2);
    expect(dots).toBe(5);
    expect(await page.$eval('#crosshair i', (e) => e.style.background)).toContain('60, 240, 240');
  });

  test('клавиши: новая работает, старая нет, конфликт виден, сброс возвращает', async ({ page }) => {
    await openTactical(page);
    await page.click('#navSettings');
    await page.click('.settabs button[data-set=input]');
    await page.click('#set-input .keybtn[data-action=jump]');
    await expect(page.locator('#bindwait')).toBeVisible();
    await page.keyboard.press('KeyJ');
    await expect(page.locator('#set-input .keybtn[data-action=jump]')).toHaveText('J');
    // конфликт: перезарядка на W, «вперёд» остаётся без клавиши
    await page.click('#set-input .keybtn[data-action=reload]');
    await page.keyboard.press('KeyW');
    await expect(page.locator('#bindMsg')).toContainText('Вперёд');
    await expect(page.locator('#set-input .keyrow[data-action=forward]')).toHaveClass(/conflict/);
    await expect(page.locator('#set-input .keybtn[data-action=forward]')).toHaveText('—');
    const jump = (code) => page.evaluate((c) => {
      __tactical.start({ mode: 'dm', map: 'quarry', ai: false });
      const p = __tactical.player;
      __tactical.stepPlayer(5);
      __tactical.keydown(c); __tactical.stepPlayer(2); __tactical.keyup(c);
      return p.pos.y;
    }, code);
    expect(await jump('KeyJ')).toBeGreaterThan(0.1);
    expect(await jump('Space')).toBe(0);
    await page.evaluate(() => __tactical.app.quitToMenu(false));
    await page.click('#navSettings');
    await page.click('.settabs button[data-set=input]');
    await page.click('#keysReset');
    await expect(page.locator('#set-input .keybtn[data-action=jump]')).toHaveText('Пробел');
    await expect(page.locator('#set-input .keybtn[data-action=forward]')).toHaveText('W');
    await expect(page.locator('#set-input .keybtn[data-action=reload]')).toHaveText('R');
    expect(await jump('Space')).toBeGreaterThan(0.1);
  });
});

test.describe('fps_1: статистика, звания, кампания', () => {
  test('статистика: матчи, победы, У/С, точность, в голову, любимое оружие', async ({ page }) => {
    await openTactical(page);
    const v = await page.evaluate(() => {
      const base = { mode: 'comp', map: 'quarry', diff: 'medium', won: true, draw: false, kills: 10, deaths: 5, assists: 2, shots: 200, hits: 50, headHits: 10, hsKills: 4, damage: 1200, mvps: 3, roundsPlayed: 12, roundsWon: 8, plants: 1, defuses: 0, weaponKills: { burya: 7, grom: 3 } };
      TAC.stats.record(base);
      TAC.stats.record(Object.assign({}, base, { won: false, kills: 2, deaths: 6, shots: 100, hits: 10, hsKills: 1, weaponKills: { grom: 5 } }));
      TAC.stats.record(Object.assign({}, base, { mode: 'train' }));        // разминка не считается
      TAC.stats.reload();
      return TAC.stats.view();
    });
    expect([v.matches, v.wins, v.losses]).toEqual([2, 1, 1]);
    expect(v.kd).toBeCloseTo(12 / 11, 5);
    expect(v.accuracy).toBeCloseTo(60 / 300, 5);
    expect(v.hsPercent).toBeCloseTo(5 / 12, 5);
    expect(v.favourite).toBe('grom');
    await page.click('#navStats');
    await expect(page.locator('#statsBody')).toContainText('Гром');
  });

  test('звания растут за победы до потолка сложности и падают за поражения', async ({ page }) => {
    await openTactical(page);
    const r = await page.evaluate(() => {
      const st = TAC.rankStep;
      const out = {
        win: [st(0, 'easy', 'win'), st(0, 'medium', 'win'), st(0, 'hard', 'win'), st(0, 'expert', 'win')],
        capEasy: [st(390, 'easy', 'win'), st(399, 'easy', 'win'), st(399, 'medium', 'win')],
        loss: [st(110, 'easy', 'loss'), st(110, 'expert', 'loss'), st(10, 'medium', 'loss')],
        draw: st(250, 'hard', 'draw'),
        ranks: [TAC.rankOf(0), TAC.rankOf(99), TAC.rankOf(100), TAC.rankOf(5000)],
      };
      // через итоги матча: победа над сильными +45, поражение -20, бой насмерть не считается
      TAC.profile.data.rankPoints = 90;
      const up = TAC.profile.applyMatch({ mode: 'comp', diff: 'hard', won: true, draw: false });
      const down = TAC.profile.applyMatch({ mode: 'comp', diff: 'hard', won: false, draw: false });
      const dm = TAC.profile.applyMatch({ mode: 'dm', diff: 'hard', won: true });
      out.match = [up.after, up.rankAfter, down.after, down.rankAfter, dm];
      out.saved = TAC.store.get('profile').rankPoints;
      return out;
    });
    expect(r.win).toEqual([25, 35, 45, 60]);
    expect(r.capEasy).toEqual([399, 399, 434]);
    expect(r.loss).toEqual([80, 95, 0]);
    expect(r.draw).toBe(250);
    expect(r.ranks).toEqual([0, 0, 1, 11]);
    expect(r.match).toEqual([135, 1, 115, 1, null]);
    expect(r.saved).toBe(115);
  });

  test('миссия засчитывается только по своему условию; финал открывает экран победы', async ({ page }) => {
    await openTactical(page);
    const r = await page.evaluate(() => {
      const c = TAC.campaign;
      const s3 = { missionId: 'm3', mode: 'comp', map: 'quarry', diff: 'medium', side: 'T', short: true, plants: 3, won: true, draw: false, margin: 2 };
      return {
        m3: c.evaluate('m3', s3),
        m3fewPlants: c.evaluate('m3', Object.assign({}, s3, { plants: 2 })),
        m3notMission: c.evaluate('m3', Object.assign({}, s3, { missionId: null })),
        m3otherMission: c.evaluate('m4', s3),
        m3wrongSide: c.evaluate('m3', Object.assign({}, s3, { side: 'CT' })),
        m3wrongDiff: c.evaluate('m3', Object.assign({}, s3, { diff: 'easy' })),
        m3long: c.evaluate('m3', Object.assign({}, s3, { short: false })),
        m1: c.evaluate('m1', { missionId: 'm1', mode: 'train', map: 'range', diff: 'medium', rangeHits: 26 }),
        m1map: c.evaluate('m1', { missionId: 'm1', mode: 'train', map: 'port', diff: 'medium', rangeHits: 40 }),
        m5: c.evaluate('m5', { missionId: 'm5', mode: 'comp', map: 'quarry', diff: 'hard', short: true, clutches: 1, won: false, draw: false }),
        m6: c.evaluate('m6', { missionId: 'm6', mode: 'dm', map: 'port', diff: 'hard', sniperKills: 12, kills: 30 }),
        m7: c.evaluate('m7', { missionId: 'm7', mode: 'tdm', map: 'quarry', diff: 'hard', teamWon: true, kills: 16 }),
        locked: [c.unlocked('m1'), c.unlocked('m2'), c.unlocked('m8')],
      };
    });
    expect(r).toEqual({ m3: 2, m3fewPlants: 0, m3notMission: 0, m3otherMission: 0, m3wrongSide: 0, m3wrongDiff: 0, m3long: 0, m1: 2, m1map: 0, m5: 1, m6: 2, m7: 2, locked: [true, false, false] });
    // финал: все семь пройдены, победа в m8 - экран победы с титрами
    await page.evaluate(() => {
      for (const m of TAC.MISSIONS) if (!m.final) TAC.campaign.data.stars[m.id] = 1;
      TAC.campaign.save();
      TAC.menu.openTab('campaign');
    });
    await expect(page.locator('#missionList [data-mission=m8] button')).toBeEnabled();
    await page.evaluate(() => {
      __tactical.start(Object.assign(TAC.menu.missionOpts(TAC.MISSIONS[7]), { ai: false, freeze: 0 }));
      const m = __tactical.match;
      for (let i = 0; i < 8; i++) { m.endRound(0, 'elimination'); __tactical.step(64 * 5 + 2); }
      TAC.menu.showMatchOver(m.result, m, __tactical.app.lastRewards);
    });
    await expect(page.locator('#matchover')).toBeVisible();
    await expect(page.locator('#moRewards')).toContainText('★★★');
    await page.click('#btnToMenu');
    await expect(page.locator('#victory')).toBeVisible();
    await expect(page.locator('#creditsRoll')).toContainText('Спасибо, что играли');
    const saved = await page.evaluate(() => TAC.store.get('campaign'));
    expect(saved.finished).toBe(true);
    expect(saved.stars.m8).toBe(3);
    await page.reload();
    await page.waitForFunction(() => window.__tactical && __tactical.ready);
    expect(await page.evaluate(() => [TAC.campaign.data.stars.m8, TAC.campaign.data.stars.m3, TAC.campaign.totalStars()])).toEqual([3, 1, 10]);
  });
});
