// Законы общего набора kit.js (меню, пауза, настройки, клавиши, геймпад, звук) для всех игр на нём.
// Набор лежит одинаковой копией рядом с каждой игрой, чтобы игра открывалась сама по себе;
// источник - web/dino/kit.js.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { openGame } = require('./_games-helpers');
const { hideTab, showTab } = require('./_kit-helpers');

// id - приставка в хранилище; start - кнопка главного меню, начинающая игру;
// keys - ключи прогресса и что лежит в них в памяти игры (образец для порчи полей)
const GAMES = {
  dino: { id: 'dino', start: '[data-id=journey]', keys: { progress: '__game.progress', records: '__game.records' },
    nested: { records: [{ journeyTime: { 0: null, 1: 'x' } }, { journeyTime: [] }] } },
  space_shooter: { id: 'space', start: '[data-id=campaign]', keys: { progress: '__game.progress', records: '__game.records' },
    nested: { progress: [{ up: { weapon: 'x', damage: null } }, { up: [] }, { sector: 11, maxSector: 11 }], records: [{ bestTime: { 0: null } }] } },
  'jungle-strike': { id: 'jungle', start: '[data-id=campaign]', keys: { progress: '__game.progress' },
    nested: { progress: [{ best: { 0: null, 1: 'x' } }, { unlocked: 9 }] } },
  mario: { id: 'jumper', start: '[data-id=play]', keys: { progress: '__game.progress', totals: '__game.totals' },
    nested: { progress: [{ levels: { 0: { stars: null, best: 100 } } }, { levels: { 0: null, 3: { stars: [1, 'x'], best: 'x' } } }, { levels: [] }] } },
};
const BAD = [null, 'x', -1, 7, 999, 1.5, [], {}, true];

const read = (g) => fs.readFileSync(path.join(__dirname, '..', '..', 'web', g, 'kit.js'), 'utf8').replace(/\r\n/g, '\n');
const KIT_GAMES = ['dino', 'space_shooter', 'jungle-strike', 'mario', 'tetris', 'sudoku'].filter((g) => fs.existsSync(path.join(__dirname, '..', '..', 'web', g, 'kit.js')));

test('копии общего набора kit.js во всех играх одинаковы', () => {
  const src = read('dino');
  expect(src.length).toBeGreaterThan(10000);
  for (const g of KIT_GAMES.slice(1)) expect(read(g) === src, `web/${g}/kit.js отличается от web/dino/kit.js`).toBe(true);
});

test('каждая игра подключает свой kit.js, а не чужой', () => {
  for (const g of KIT_GAMES) {
    const html = fs.readFileSync(path.join(__dirname, '..', '..', 'web', g, 'index.html'), 'utf8');
    expect(html, g).toMatch(/<script src="kit\.js"><\/script>/);
  }
});

// Обойти главное меню: открыть каждый пункт, вернуться, начать игру и прожить секунду
async function tour(page, game) {
  await page.evaluate(async (start) => {
    const k = __game.kit;
    const ids = Array.from(document.querySelectorAll('[data-screen=main] .kit-btn')).map((b) => b.dataset.id).filter(Boolean);
    for (const id of ids) {
      k.closeAll(); k.showMain();
      const b = document.querySelector(`[data-screen=main] [data-id="${id}"]`);
      if (b && !b.disabled && id !== 'settings') b.click();
      await new Promise((r) => setTimeout(r, 0));
    }
    k.closeAll(); k.showMain();
    const cont = document.querySelector('[data-screen=main] [data-id=continue]:not(:disabled)');
    (cont || document.querySelector('[data-screen=main] ' + start)).click();
    for (let i = 0; i < 60; i++) __game.step(1, true);
  }, GAMES[game].start);
}

async function loadWith(page, storage) {
  await page.evaluate((s) => { localStorage.clear(); for (const k in s) localStorage.setItem(k, s[k]); }, storage);
  await page.reload();
  await page.waitForFunction(() => window.__game && window.__game.ready === true, null, { timeout: 5000 });
}

for (const game of Object.keys(GAMES)) {
  test(`${game}: испорченный прогресс и рекорды не роняют игру`, async ({ page }) => {
    test.setTimeout(240000);
    const errors = await openGame(page, game, 'seed=1&fast');
    const cfg = GAMES[game];
    const samples = await page.evaluate((keys) => { const o = {}; for (const k in keys) o[k] = JSON.parse(JSON.stringify(eval(keys[k]))); return o; }, cfg.keys);
    const variants = [];
    for (const key of [...Object.keys(cfg.keys), 'achievements']) {
      for (const bad of [...BAD, '{broken json']) variants.push({ key, raw: typeof bad === 'string' && bad.startsWith('{') ? bad : JSON.stringify(bad) });
      const base = samples[key];
      if (base && typeof base === 'object') {
        for (const f of Object.keys(base)) for (const bad of BAD) variants.push({ key, raw: JSON.stringify({ ...base, [f]: bad }) });
      }
      for (const extra of (cfg.nested[key] || [])) variants.push({ key, raw: JSON.stringify({ ...(base || {}), ...extra }) });
    }
    const failed = [];
    for (const v of variants) {
      const before = errors.length;
      try {
        await loadWith(page, { [`${cfg.id}:${v.key}`]: v.raw });
        await tour(page, game);
      } catch (e) { errors.push('не загрузилась: ' + e.message.split('\n')[0]); }
      if (errors.length > before) failed.push(`${v.key}=${v.raw}: ${errors.slice(before).join(' | ').slice(0, 160)}`);
    }
    expect(failed, `проверено вариантов: ${variants.length}`).toEqual([]);
  });

  test(`${game}: испорченные настройки и клавиши не роняют игру, звук один`, async ({ page }) => {
    test.setTimeout(120000);
    await page.addInitScript(() => {
      const AC = window.AudioContext;
      window.__acCount = 0;
      window.AudioContext = function (...a) { window.__acCount++; return new AC(...a); };
    });
    const errors = await openGame(page, game, 'seed=1&fast');
    const id = GAMES[game].id;
    const cases = [
      { settings: '{"musicVol":"громко"}' }, { settings: '{"sfxVol":null,"musicVol":-3}' }, { settings: '{"musicVol":55}' },
      { settings: '{"difficulty":"nightmare","effects":"да"}' }, { settings: 'null' }, { settings: '[1,2]' }, { settings: '{broken' },
      { bindings: '{"jump":null}' }, { bindings: '{"jump":"Space"}' }, { bindings: '{"left":[1,2,3]}' }, { bindings: '[]' }, { bindings: 'null' },
      { bindings: '{"fire":[null,null],"pause":[{},"KeyP"]}' },
    ];
    const failed = [];
    for (const c of cases) {
      const before = errors.length;
      const storage = {};
      for (const k in c) storage[`${id}:${k}`] = c[k];
      try {
        await loadWith(page, storage);
        for (let i = 0; i < 4; i++) await page.mouse.click(3, 3);
        const s = await page.evaluate(() => {
          const k = __game.kit, st = k.settings;
          const bindOk = Object.values(k.bindings).every((b) => Array.isArray(b) && b.length === 2 && b.every((x) => x === null || typeof x === 'string'));
          return { vol: [st.musicVol, st.sfxVol], diff: st.difficulty, fx: typeof st.effects, bindOk, ac: window.__acCount };
        });
        if (!(s.vol.every((v) => typeof v === 'number' && v >= 0 && v <= 1))) failed.push(JSON.stringify(c) + ' громкость ' + s.vol);
        if (!['easy', 'normal', 'hard'].includes(s.diff) || s.fx !== 'boolean') failed.push(JSON.stringify(c) + ' настройки ' + JSON.stringify(s));
        if (!s.bindOk) failed.push(JSON.stringify(c) + ' клавиши');
        if (s.ac > 1) failed.push(JSON.stringify(c) + ' звуковых контекстов: ' + s.ac);
        await tour(page, game);
      } catch (e) { errors.push('не загрузилась: ' + e.message.split('\n')[0]); }
      if (errors.length > before) failed.push(JSON.stringify(c) + ': ' + errors.slice(before).join(' | ').slice(0, 160));
    }
    expect(failed).toEqual([]);
  });
}

// Геймпад-заглушка: стандартная раскладка
const FAKE_PAD = () => {
  window.__pad = { connected: true, id: 'fake', index: 0, mapping: 'standard', buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0] };
  navigator.getGamepads = () => [window.__pad];
};

test('геймпад: кнопка A, которой продолжили игру из паузы, не жмёт действие в игре, пока её не отпустят', async ({ page }) => {
  await page.addInitScript(FAKE_PAD);
  await openGame(page, 'dino', 'seed=1');
  await page.click('[data-screen=main] [data-id=endless]');
  await page.evaluate(() => __game.clearObstacles());
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-screen=pause]')).toBeVisible();
  await page.evaluate(() => { __pad.buttons[0].pressed = true; });
  await page.waitForTimeout(120);
  const held = await page.evaluate(() => ({ mode: __game.kit.mode, jumping: __game.dino.jumping, down: __game.kit.isDown('jump') }));
  expect(held).toEqual({ mode: 'play', jumping: false, down: false });
  await page.evaluate(() => { __pad.buttons[0].pressed = false; });
  await page.waitForTimeout(80);
  await page.evaluate(() => { __pad.buttons[0].pressed = true; });
  await page.waitForTimeout(80);
  expect(await page.evaluate(() => __game.dino.jumping || __game.dino.y < __game.GROUND_Y - 1)).toBe(true);
});

test('геймпад: A, зажатая с игры, не нажимает кнопку в открывшемся окне', async ({ page }) => {
  await page.addInitScript(FAKE_PAD);
  await openGame(page, 'dino', 'seed=1');
  await page.click('[data-screen=main] [data-id=endless]');
  await page.evaluate(() => { __pad.buttons[0].pressed = true; });
  await page.waitForTimeout(80);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => __game.kit.mode)).toBe('paused');
});

// Окно итога откладывается (чтобы доиграла анимация); «Заново» или «В меню» за это время его отменяют
const RACES = [
  { game: 'space_shooter', start: '[data-id=campaign]', kill: '(() => { const g = __game; g.P.hp = 1; g.P.invuln = 0; g.damagePlayer(50); })()', leave: 'restart', expectMode: 'play' },
  { game: 'space_shooter', start: '[data-id=campaign]', kill: '(() => { const g = __game; g.P.hp = 1; g.P.invuln = 0; g.damagePlayer(50); })()', leave: 'menu', expectMode: 'menu' },
  { game: 'dino', start: '[data-id=journey]', kill: '(() => { const g = __game; g.startJourney(3); g.state.dist = 9990; g.clearObstacles(); g.step(20, false); })()', leave: 'menu', expectMode: 'menu' },
  { game: 'jungle-strike', start: '[data-id=campaign]', kill: '(() => { const g = __game; g.G.lives = 1; g.player.invuln = 0; g.hurtPlayer(); })()', leave: 'restart', expectMode: 'play' },
  { game: 'jungle-strike', start: '[data-id=campaign]', kill: '(() => { const g = __game; g.G.lives = 1; g.player.invuln = 0; g.hurtPlayer(); })()', leave: 'menu', expectMode: 'menu' },
];
for (const r of RACES) {
  test(`${r.game}: отложенное окно итога не всплывает после «${r.leave === 'menu' ? 'В меню' : 'Заново'}»`, async ({ page }) => {
    await openGame(page, r.game, 'seed=1');
    await page.click('[data-screen=main] ' + r.start);
    await page.evaluate(r.kill);
    await page.keyboard.press('Escape');
    await page.click(`[data-screen=pause] [data-id=${r.leave}]`);
    await page.waitForTimeout(2600);
    const s = await page.evaluate(() => ({ mode: __game.kit.mode, top: __game.kit.topId() }));
    expect(s.mode).toBe(r.expectMode);
    expect(s.top).toBe(r.expectMode === 'menu' ? 'main' : null);
  });
}

test('клавиши: у действия нельзя стереть обе клавиши - нужна хотя бы одна', async ({ page }) => {
  await openGame(page, 'jungle-strike', 'seed=1');
  await page.evaluate(() => localStorage.clear());
  await page.click('[data-screen=main] [data-id=settings]');
  await page.click('[data-bind="fire:0"]'); await page.keyboard.press('Backspace');
  await page.click('[data-bind="fire:1"]'); await page.keyboard.press('Backspace');
  await expect(page.locator('.kit-modal .kit-warn')).toContainText('хотя бы одна');
  await page.keyboard.press('Escape');
  const fire = await page.evaluate(() => __game.kit.bindings.fire);
  expect(fire.filter(Boolean).length).toBe(1);
});

for (const vp of [{ width: 1280, height: 720 }, { width: 1024, height: 700 }, { width: 1280, height: 600 }]) {
  test(`настройки при ${vp.width}x${vp.height}: «Готово» видно без прокрутки`, async ({ page }) => {
    await page.setViewportSize(vp);
    for (const game of ['dino', 'jungle-strike']) {
      await openGame(page, game, 'seed=1');
      await page.click('[data-screen=main] [data-id=settings]');
      const r = await page.evaluate(() => {
        const b = Array.from(document.querySelectorAll('[data-screen=settings] .kit-btn')).find((x) => x.textContent === 'Готово');
        const box = b.getBoundingClientRect();
        const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return { inView: box.top >= 0 && box.bottom <= innerHeight && box.left >= 0 && box.right <= innerWidth, onTop: hit === b || b.contains(hit) };
      });
      expect(r, game).toEqual({ inView: true, onTop: true });
    }
  });
}

const DEFEAT = {
  dino: { start: '[data-id=endless]', die: "(() => { const g = __game; g.clearObstacles(); g.state.lives = 1; g.state.invuln = 0; const o = g.makeObstacle('cactus', { w: 20, h: 40 }); o.x = g.dino.x + 4; g.obstacles.push(o); g.step(150, false); })()", demo: '__game.state.mode' },
  space_shooter: { start: '[data-id=campaign]', die: '(() => { const g = __game; g.P.hp = 1; g.P.invuln = 0; g.damagePlayer(50); g.step(200, false); })()', demo: '__game.S.mode' },
  'jungle-strike': { start: '[data-id=campaign]', die: '(() => { const g = __game; g.G.lives = 1; g.player.invuln = 0; g.hurtPlayer(); g.step(200, false); })()', demo: '__game.G.mode' },
  mario: { start: '[data-id=play]', die: '(() => { const g = __game; for (let i = 0; i < 3; i++) { g.player.invuln = 0; g.hurt(); g.step(80, false); } })()', demo: '__game.state.mode' },
};
for (const game of Object.keys(DEFEAT)) {
  test(`${game}: «В меню» с экрана поражения возвращает живую заставку`, async ({ page }) => {
    await openGame(page, game, 'seed=1');
    const d = DEFEAT[game];
    await page.click('[data-screen=main] ' + d.start);
    await page.evaluate(d.die);
    await page.locator('[data-screen=over] [data-id=menu]').click({ timeout: 6000 });
    expect(await page.evaluate(d.demo)).toBe('demo');
    expect(await page.evaluate(() => [__game.kit.mode, __game.kit.topId()])).toEqual(['menu', 'main']);
  });
}
