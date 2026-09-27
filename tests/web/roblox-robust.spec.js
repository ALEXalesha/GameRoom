// Законы Блоксити, часть 6 - устойчивость: испорченное хранилище не роняет платформу и не вешает
// вход; упавшая сборка места не вешает загрузку; пауза оболочки во время загрузки не теряется;
// повторные входы не копят текстуры; AFK в «Монетах» не приносит кубов; горка возвращает
// упавшего; боты не слипаются; стройка и ходьба щелчком работают при захвате мыши.
const { test, expect } = require('@playwright/test');
const { pageUrl } = require('../helpers');
const { openBlox, enter } = require('./_blox-helpers');

const CASES = {
  'stats=null': { stats: 'null' },
  'stats=[]': { stats: '[]' },
  'badges=null': { badges: 'null' },
  'votes=null': { votes: 'null' },
  'owned={}': { owned: '{}' },
  'owned=строка': { owned: '"hat_crown back_wings"' },
  'avatar.colors=null': { avatar: '{"colors":null}' },
  'avatar.colors.head=5': { avatar: '{"colors":{"head":5,"torso":"red"}}' },
  'avatar: чужие вещи': { avatar: '{"face":"face_nope","hat":"hat_nope","shirt":"x"}' },
  'profile=5': { profile: '5' },
  'profile.nick=объект': { profile: '{"nick":{"a":1}}' },
  'wallet=строка': { wallet: '"abc"' },
  'settings=null': { settings: 'null', gamesettings: 'null' },
  'settings.lang=de': { settings: '{"lang":"de","theme":"pink"}' },
  'sandbox.blocks=[null]': { sandbox: '{"blocks":[null,[1,0,1,3]]}' },
  'sandbox.blocks=[[1,0]]': { sandbox: '{"blocks":[[1,0]]}' },
  'sandbox=null': { sandbox: 'null' },
  'place.sandbox=bots:99': { 'place.sandbox': '{"bots":99,"botsBuild":"yes"}' },
  'сломанный JSON': { stats: '{bad', avatar: '{bad' },
};

test.describe('roblox-mini (Блоксити): устойчивость', () => {
  test.describe.configure({ timeout: 120000 });

  for (const [name, data] of Object.entries(CASES)) {
    test(`испорченное хранилище «${name}»: лаунчер, все разделы и вход в места работают`, async ({ page }) => {
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e.message)));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      await page.route(/^https?:\/\//, (r) => r.abort());
      await page.addInitScript((d) => { if (sessionStorage.done) return; sessionStorage.done = 1; localStorage.clear(); for (const k in d) localStorage.setItem('mix.blox.' + k, d[k]); }, data);
      await page.goto(pageUrl('roblox-mini') + '?seed=5&fast=1&manual=1');
      await page.waitForFunction(() => window.__blox && __blox.ready, null, { timeout: 15000 });
      const r = await page.evaluate(() => {
        const out = { secs: {} };
        for (const s of ['home', 'places', 'avatar', 'catalog', 'profile', 'settings']) {
          try { __blox.B.launcher.show(s); out.secs[s] = document.getElementById('sec-' + s).innerHTML.length > 50; } catch (e) { out.secs[s] = 'ERR ' + e.message; }
        }
        for (const id of ['sandbox', 'obby']) {
          try { out[id] = __blox.enter(id) && __blox.screen; __blox.step(5); if (id === 'sandbox') out.cells = __blox.game.state.cells.size; __blox.leave(); } catch (e) { out[id] = 'ERR ' + e.message; try { __blox.leave(); } catch (e2) { /* нет */ } }
        }
        out.bots = __blox.B.places.sandbox.settings.all().bots;
        return out;
      });
      for (const s in r.secs) expect(r.secs[s], s).toBe(true);
      expect(r.sandbox).toBe('place');
      expect(r.obby).toBe('place');
      if (name === 'sandbox.blocks=[null]') expect(r.cells).toBe(1);
      if (name === 'sandbox.blocks=[[1,0]]') expect(r.cells).toBe(0);
      expect(r.bots).toBeLessThanOrEqual(6);
      expect(errors).toEqual([]);
    });
  }

  test('упала сборка места - загрузка не виснет: сообщение, «Отмена» и другие места работают', async ({ page }) => {
    const errors = await openBlox(page, 'seed=7&fast=1');
    await page.evaluate(() => { const P = __blox.B.places.race; P._build = P.build; P.build = () => { throw new Error('сломано для проверки'); }; __blox.B.game.enter('race'); });
    await expect(page.locator('#ld-error')).toBeVisible({ timeout: 10000 });
    expect(await page.evaluate(() => [__blox.B.game.loading, __blox.B.game.cur])).toEqual([null, null]);
    await page.locator('#ld-cancel').click();
    await expect(page.locator('#loading')).toBeHidden();
    await page.evaluate(() => { const P = __blox.B.places.race; P.build = P._build; __blox.B.game.enter('obby'); });
    await expect(page.locator('#game')).toBeVisible({ timeout: 10000 });
    expect(errors.filter((e) => !/сломано для проверки/.test(e))).toEqual([]);
  });

  test('пауза оболочки во время загрузки не теряется: место открывается уже на паузе', async ({ page }) => {
    await openBlox(page, 'seed=7');
    await page.evaluate(() => __blox.B.game.enter('lava'));
    await expect(page.locator('#loading')).toBeVisible();
    await page.evaluate(() => window.postMessage({ mix: 'pause' }, '*'));
    await expect(page.locator('#game')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#g-menu-panel')).toBeVisible();
    const t = await page.evaluate(() => __blox.game.time);
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => __blox.game.time)).toBe(t);
  });

  test('18 входов и выходов подряд - текстуры и геометрии не копятся', async ({ page }) => {
    await openBlox(page);
    const r = await page.evaluate(() => {
      const R = __blox.B.engine.renderer, ids = ['obby', 'race', 'lava', 'coins', 'sandbox', 'tube'], out = [];
      for (let k = 0; k < 18; k++) { __blox.enter(ids[k % 6]); __blox.step(2); __blox.leave(); if (k % 6 === 5) out.push({ tex: R.info.memory.textures, geo: R.info.memory.geometries }); }
      return out;
    });
    expect(r[2].tex).toBeLessThanOrEqual(r[0].tex);
    expect(r[2].geo).toBeLessThanOrEqual(r[0].geo + 2);
  });

  test('«Монеты»: стоишь без дела - кубов нет; кубы только за победу', async ({ page }) => {
    await openBlox(page);
    await enter(page, 'coins');
    const r = await page.evaluate(() => {
      const g = __blox.game, b0 = __blox.balance();
      g.player.teleport(70, 0.01, 70);
      __blox.run(60 * 200);
      return { got: __blox.balance() - b0, rounds: g.state.rounds || 0, finishes: __blox.B.acct.placeStats('coins').finishes };
    });
    expect(r.got).toBe(0);
    expect(r.finishes).toBe(0);
  });

  test('горка: упал с верхней площадки - через пару секунд снова наверху', async ({ page }) => {
    await openBlox(page);
    await enter(page, 'tube');
    const r = await page.evaluate(() => {
      const g = __blox.game, t = g.state.pts[0];
      g.player.teleport(t.x + 30, t.y - 40, t.z + 20);
      __blox.run(60 * 6);
      const p = g.player.pos;
      return { y: p.y, top: t.y };
    });
    expect(r.y).toBeGreaterThan(r.top - 5);
  });

  test('боты не слипаются друг с другом и с игроком', async ({ page }) => {
    await openBlox(page);
    await enter(page, 'race');
    const r = await page.evaluate(() => {
      const g = __blox.game;
      // все в одну точку - через секунду расходятся
      for (const b of g.bots) { b.body.teleport(-10, 0.01, 0); b.race.phase = 'line'; }      // стоят на старте и ждут
      g.state.idleT = -1e9;
      g.player.teleport(-10, 0.01, 0);
      __blox.run(60);
      const bodies = g.bots.map((b) => b.body.pos).concat([g.player.pos]);
      let min = Infinity;
      for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) if (Math.abs(bodies[i].y - bodies[j].y) < 4) min = Math.min(min, Math.hypot(bodies[i].x - bodies[j].x, bodies[i].z - bodies[j].z));
      return min;
    });
    expect(r).toBeGreaterThan(1.5);
  });

  test('песочница от первого лица (захват мыши): щелчок ставит блок в центр экрана; есть прицел', async ({ page }) => {
    await openBlox(page, 'seed=7&manual=1&fast=1');
    await page.evaluate(() => localStorage.setItem('mix.blox.place.sandbox', JSON.stringify({ bots: 0, botsBuild: true })));
    await enter(page, 'sandbox');
    await page.evaluate(() => {
      const g = __blox.game; g.rig.pitch = 0.9; g.rig.yaw = Math.PI; g.rig.want = g.rig.dist = 0.5; __blox.step(2);
      Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => __blox.B.engine.renderer.domElement });
      document.dispatchEvent(new Event('pointerlockchange'));
    });
    await expect(page.locator('#g-cross')).toBeVisible();
    await page.mouse.click(200, 300);                                  // курсор где угодно - ставится в центр
    const r = await page.evaluate(() => { const c = Array.from(__blox.game.state.cells.values())[0]; const p = __blox.game.player.pos; return c && { dx: 2 * c.i + 1 - p.x, dz: 2 * c.k + 1 - p.z }; });
    expect(r).not.toBeNull();
    expect(Math.hypot(r.dx, r.dz)).toBeLessThan(12);
    expect(r.dz).toBeGreaterThan(0);                                  // перед героем (камера смотрит на +Z)
  });
});
