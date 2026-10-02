// «Кубический мир» в настоящей оболочке «Игротека» (Electron): Esc-Esc без надписей и тихий захват
// мыши следующим щелчком, положение героя переживает закрытие вкладки и перезапуск приложения.
// Окно - за экраном и без фокуса (IGROTEKA_TEST=1), захват мыши - только подмена в странице игры
// (game-preload.js), до настоящего он не доходит: курсор человека за компьютером не зажимается.
'use strict';

const { test, expect } = require('@playwright/test');
const H = require('./harness');

const ID = 'minecraft_clone_3d_1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ctx;
test.beforeEach(async () => { ctx = await H.launch(); });
test.afterEach(async () => { if (ctx) { await H.close(ctx); H.rmData(ctx.dataDir); } });

const open = async (c = ctx) => {
  const { app, shell } = c;
  if ((await H.tabs(app)).active !== 'home') await H.press(app, 'shell', 'T', ['control']);
  await expect.poll(() => H.tabs(app).then((t) => t.active)).toBe('home');
  await shell.click(`.card[data-id="${ID}"]`);
  await H.gameLoaded(app, ID);
  await expect.poll(() => H.inGame(app, ID, '!!(window.__voxel && __voxel.ready)').catch(() => false), { timeout: 30000 }).toBe(true);
};
// щелчок мышью через ввод Chromium - как настоящий (виден и перехвату клавиш оболочки)
const click = (app, x = 640, y = 380) => app.evaluate(async (_e, [gid, cx, cy]) => {
  const wc = globalThis.__igroteka.views.get(gid).webContents;
  wc.sendInputEvent({ type: 'mouseMove', x: cx, y: cy });
  wc.sendInputEvent({ type: 'mouseDown', x: cx, y: cy, button: 'left', clickCount: 1 });
  await new Promise((r) => setTimeout(r, 80));
  wc.sendInputEvent({ type: 'mouseUp', x: cx, y: cy, button: 'left', clickCount: 1 });
}, [ID, x, y]);
const key = (app, code, ms) => app.evaluate(async (_e, [gid, k, hold]) => {
  const wc = globalThis.__igroteka.views.get(gid).webContents;
  wc.sendInputEvent({ type: 'keyDown', keyCode: k });
  await new Promise((r) => setTimeout(r, hold));
  wc.sendInputEvent({ type: 'keyUp', keyCode: k });
}, [ID, code, ms || 30]);

test('захват мыши в странице игры - только подмена, настоящий requestPointerLock недостижим; разрешения на захват в режиме проверок нет', async () => {
  const { app } = ctx;
  await open();
  const r = await H.inGame(app, ID, `({
    stub: typeof window.__lockCalls === 'number',
    native: Element.prototype.requestPointerLock.toString().includes('[native code]'),
    canvasNative: document.getElementById('gc').requestPointerLock.toString().includes('[native code]'),
  })`);
  expect(r).toEqual({ stub: true, native: false, canvasNative: false });
  expect(await app.evaluate(() => globalThis.__igroteka.TEST)).toBe(true);
});

test('Esc-Esc: игра идёт без всяких надписей, клавиатура работает сразу; щелчок по игре (sendInputEvent) тихо захватывает мышь и не ломает блок', async () => {
  const { app } = ctx;
  await open();
  await H.inGame(app, ID, `(async () => {
    const v = __voxel; v.settings.renderDistance = 2; v.game.applySettings();
    await v.newWorld({ name: 'Оболочка', seed: '8', mode: 'survival' });
    v.game.autoSpawn = false; v.entities.clear(); v.game.testMode = false;
    const p = v.player, x0 = Math.floor(p.pos.x), z0 = Math.floor(p.pos.z);
    for (let x = x0 - 6; x <= x0 + 6; x++) for (let z = z0 - 6; z <= z0 + 6; z++) { v.setBlock(x, 69, z, 3); for (let k = 0; k < 10; k++) v.setBlock(x, 70 + k, z, 0); }
    p.pos.set(x0 + 0.5, 70, z0 + 0.5); p.vel.set(0, 0, 0); v.look(0, -1.2);
    return true;
  })()`);
  await sleep(300);
  await click(app);                                          // захват
  await sleep(150);
  const s0 = await H.inGame(app, ID, `({ calls: window.__lockCalls, locked: !!document.pointerLockElement, state: __voxel.state })`);
  expect(s0.locked).toBe(true);
  expect(s0.state).toBe('play');
  // Esc: браузер снимает захват (клавиша в страницу не приходит) - пауза
  await H.inGame(app, ID, 'window.__browserEsc()');
  await sleep(150);
  expect(await H.inGame(app, ID, '__voxel.state')).toBe('paused');
  // второй Esc - игра; по Esc захват не дают (нужен новый щелчок)
  await key(app, 'Escape');
  await sleep(1000);
  const s1 = await H.inGame(app, ID, `({ state: __voxel.state, locked: !!document.pointerLockElement, text: document.body.innerText, hint: getComputedStyle(document.getElementById('clickHint')).display, broken: __voxel.meta.stats.broken, under: __voxel.target() && __voxel.target().id, z: __voxel.player.pos.z })`);
  expect(s1.state).toBe('play');
  expect(s1.locked).toBe(false);
  expect(s1.hint).toBe('none');
  expect(s1.text).not.toMatch(/нажмите|щёлкните|click/i);
  // клавиатура - до всякого щелчка
  await key(app, 'W', 400);
  await sleep(100);
  const z1 = await H.inGame(app, ID, '__voxel.player.pos.z');
  expect(s1.z - z1).toBeGreaterThan(0.5);
  // щелчок: тихий захват, блок цел
  const c0 = await H.inGame(app, ID, 'window.__lockCalls');
  await H.inGame(app, ID, '__voxel.look(0, -1.2)');
  const under0 = await H.inGame(app, ID, '__voxel.target() && __voxel.target().id');
  await click(app);
  await sleep(200);
  const s2 = await H.inGame(app, ID, `({ calls: window.__lockCalls, locked: !!document.pointerLockElement, broken: __voxel.meta.stats.broken, under: __voxel.target() && __voxel.target().id, mining: !!__voxel.game.mining, text: document.body.innerText })`);
  expect(s2.calls).toBeGreaterThan(c0);
  expect(s2.locked).toBe(true);
  expect(s2.broken).toBe(s1.broken);
  expect(s2.under).toBe(under0);
  expect(s2.mining).toBe(false);
  expect(s2.text).not.toMatch(/нажмите|щёлкните|click/i);
});

test('положение героя переживает закрытие вкладки (Ctrl+W) и перезапуск приложения', async () => {
  let { app } = ctx;
  await open();
  const id = await H.inGame(app, ID, `(async () => {
    const v = __voxel; v.settings.renderDistance = 2; v.game.applySettings();
    const wid = await v.newWorld({ name: 'Место', seed: '8', mode: 'creative' });
    const p = v.player; p.flying = true; p.pos.set(v.meta.spawn.x + 40.5, v.meta.spawn.y + 20, v.meta.spawn.z - 30.5); p.vel.set(0, 0, 0);
    return wid;
  })()`);
  await sleep(1500);                                          // меньше 10 с: самосохранение ещё не было
  const want = await H.inGame(app, ID, '[__voxel.player.pos.x, __voxel.player.pos.z]');
  const posAfterOpen = async (a) => H.inGame(a, ID, `(async () => { await __voxel.openWorld(${JSON.stringify(id)}); const p = __voxel.player.pos; return [p.x, p.z]; })()`);
  // вкладку закрыли (страница уничтожается без вопросов) и открыли снова
  await H.press(app, ID, 'W', ['control']);
  await expect.poll(() => H.tabs(app).then((t) => t.open.includes(ID))).toBe(false);
  await open();
  const afterTab = await posAfterOpen(app);
  expect(Math.hypot(afterTab[0] - want[0], afterTab[1] - want[1])).toBeLessThan(1);
  // новое место - и сразу перезапуск приложения (окно закрывается, игра должна успеть записаться)
  await H.inGame(app, ID, `(() => { const p = __voxel.player; p.flying = true; p.pos.x += 25; p.pos.z += 15; p.vel.set(0, 0, 0); })()`);
  await sleep(1500);
  const want2 = await H.inGame(app, ID, '[__voxel.player.pos.x, __voxel.player.pos.z]');
  // перезапуск приложения с той же папкой данных
  const dir = ctx.dataDir;
  await H.close(ctx);
  ctx = await H.launch({ dataDir: dir });
  ({ app } = ctx);
  await open();
  const afterRestart = await posAfterOpen(app);
  expect(Math.hypot(afterRestart[0] - want2[0], afterRestart[1] - want2[1])).toBeLessThan(1);
});
