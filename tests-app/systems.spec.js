// Раздел «Демо систем» в настоящем приложении: четыре демо (win11_3, macos-tahoe, ios26,
// oneui7) из общей таблицы web/_shared/games-data.js открываются во вкладках, как игры.
//
// Окно - за экраном и без фокуса (IGROTEKA_TEST=1). Захват мыши - только подмена из
// game-preload.js, и в демо она стоит в КАЖДОЙ рамке (игры там живут в <iframe>):
// настоящий requestPointerLock недостижим ни в странице демо, ни в игре внутри неё.
'use strict';

const { test, expect } = require('@playwright/test');
const DATA = require('../web/_shared/games-data.js');
const H = require('./harness');

let ctx;
test.beforeAll(async () => { ctx = await H.launch(); });
test.afterAll(async () => { await H.close(ctx); H.rmData(ctx.dataDir); });

// Код в рамке страницы вкладки, найденной по части адреса.
async function inFrame(app, id, urlPart, code) {
  return app.evaluate(async (_e, [gid, part, src]) => {
    const view = globalThis.__igroteka.views.get(gid);
    if (!view) throw new Error('нет вкладки ' + gid);
    const f = view.webContents.mainFrame.framesInSubtree.find((x) => x !== view.webContents.mainFrame && x.url.includes(part));
    if (!f) throw new Error('нет рамки ' + part);
    return f.executeJavaScript(src, true);
  }, [id, urlPart, code]);
}

const hasFrame = (app, id, urlPart) => app.evaluate((_e, [gid, part]) => {
  const view = globalThis.__igroteka.views.get(gid);
  return !!view && view.webContents.mainFrame.framesInSubtree.some((x) => x.url.includes(part));
}, [id, urlPart]);

async function home(app) {
  await H.press(app, 'shell', 'T', ['control']);
  await expect.poll(() => H.tabs(app).then((t) => t.active)).toBe('home');
}

async function openDemo(id) {
  const { app, shell } = ctx;
  await home(app);
  await shell.click(`#systems .card[data-id="${id}"] .play`);
  await expect.poll(() => H.tabs(app).then((t) => t.active)).toBe(id);
  await H.gameLoaded(app, id, 30000);
}

// Журнал сообщений {mix} в рамке: только от родителя, как требует протокол.
const LOG_JS = `(() => { if (!window.__mixLog) { window.__mixLog = []; addEventListener('message', (e) => { if (e.source === parent && e.data && typeof e.data.mix === 'string') window.__mixLog.push(e.data.mix); }); } return true; })()`;

test('на домашнем экране - раздел «Демо систем»: четыре карточки из общей таблицы, картинки, подпись', async () => {
  const { shell } = ctx;
  await expect(shell.locator('#systems .section-title, .systems .section-title')).toHaveText('Демо систем');
  const cards = await shell.locator('#systems .card').evaluateAll((els) => els.map((e) => ({
    id: e.dataset.id,
    name: e.querySelector('h2').childNodes[1].textContent,
    style: e.querySelector('.style').textContent,
    desc: e.querySelector('.desc').textContent,
    play: e.querySelector('.play').textContent,
  })));
  expect(cards).toEqual(DATA.SYSTEMS.map((s) => ({ id: s.id, name: s.name, style: 'в стиле ' + s.style, desc: s.desc, play: 'Открыть' })));
  await expect(shell.locator('#systems-note')).toHaveText('Демо в стиле Windows 11, macOS, iOS и One UI, не связано с Apple/Microsoft/Samsung.');
  await shell.evaluate(() => Promise.all([...document.querySelectorAll('#systems img')].map((i) => i.decode().catch(() => {}))));
  const imgs = await shell.locator('#systems .card .shot img').evaluateAll((els) => els.map((i) => ({ src: i.getAttribute('src'), ok: i.naturalWidth > 0 })));
  expect(imgs).toEqual(DATA.SYSTEMS.map((s) => ({ src: `../assets/thumbs/${s.id}.jpg`, ok: true })));
  // Игры остались на месте и идут первыми.
  expect(await shell.locator('#grid .card').evaluateAll((els) => els.map((e) => e.dataset.id))).toEqual(DATA.GAMES.map((g) => g.id));
  // Данные демо стираются так же, как данные игр.
  expect(await shell.locator('#clear-game option').evaluateAll((els) => els.map((o) => o.value))).toEqual([...DATA.GAMES, ...DATA.SYSTEMS].map((g) => g.id));
});

for (const s of DATA.SYSTEMS) {
  test(`${s.id}: открывается во вкладке со своим сеансом, ошибок и запросов наружу нет, захват мыши - подмена`, async () => {
    const { app, shell } = ctx;
    await openDemo(s.id);
    await new Promise((r) => setTimeout(r, 2000));
    expect(await H.errorsOf(app, s.id)).toEqual([]);
    expect(await app.evaluate(() => globalThis.__igroteka.blocked)).toEqual([]);
    expect(await app.evaluate(({ session }, id) => globalThis.__igroteka.views.get(id).webContents.session === session.fromPartition('persist:' + id), s.id)).toBe(true);
    await expect(shell.locator(`.tab.game[data-id="${s.id}"]`)).toHaveClass(/active/);
    await expect(shell.locator(`.tab.game[data-id="${s.id}"] .name`)).toHaveText(s.name);
    await expect(shell.locator(`#systems .card[data-id="${s.id}"] .play`)).toHaveText('Вернуться');
    const lock = await H.inGame(app, s.id, `({ native: Element.prototype.requestPointerLock.toString().includes('[native code]'), pl: document.pointerLockElement })`);
    expect(lock).toEqual({ native: false, pl: null });

    // Протокол паузы доходит до рамок внутри демо: проверочная игра из _os-shared.
    await H.inGame(app, s.id, `(() => { const f = document.createElement('iframe'); f.id = '__stub'; f.src = '../_os-shared/pause-stub.html'; f.style.cssText = 'position:fixed;left:0;top:0;width:320px;height:200px;z-index:99999'; document.body.append(f); return 1; })()`);
    await expect.poll(() => hasFrame(app, s.id, 'pause-stub.html')).toBe(true);
    await expect.poll(() => inFrame(app, s.id, 'pause-stub.html', 'document.readyState').catch(() => '')).toBe('complete');
    await inFrame(app, s.id, 'pause-stub.html', LOG_JS);
    // Подмена захвата мыши - и в рамке игры внутри демо.
    expect(await inFrame(app, s.id, 'pause-stub.html', `(() => { document.body.requestPointerLock(); return { native: Element.prototype.requestPointerLock.toString().includes('[native code]'), calls: window.__lockCalls }; })()`))
      .toEqual({ native: false, calls: 1 });

    await home(app);
    await expect.poll(() => inFrame(app, s.id, 'pause-stub.html', 'window.__mixLog')).toEqual(['pause']);
    expect(await inFrame(app, s.id, 'pause-stub.html', 'stub.paused')).toBe(true);
    await shell.click(`.tab.game[data-id="${s.id}"]`);
    await expect.poll(() => inFrame(app, s.id, 'pause-stub.html', 'window.__mixLog')).toEqual(['pause', 'resume']);
    // resume паузу не снимает: её снимает игрок.
    expect(await inFrame(app, s.id, 'pause-stub.html', 'stub.paused')).toBe(true);

    // Сеть закрыта и для демо, и для игр в его рамках: запрос отменяет страж сеанса демо.
    const url = 'https://example.com/igroteka-' + s.id;
    expect(await H.inGame(app, s.id, `fetch(${JSON.stringify(url)}).then(() => 'ушёл', () => 'отменён')`)).toBe('отменён');
    expect(await inFrame(app, s.id, 'pause-stub.html', `fetch(${JSON.stringify(url + '-frame')}).then(() => 'ушёл', () => 'отменён')`)).toBe('отменён');
    const blocked = await app.evaluate(() => globalThis.__igroteka.blocked.splice(0));
    expect(blocked).toEqual([url, url + '-frame']);

    await H.press(app, s.id, 'W', ['control']);
    await expect.poll(() => H.tabs(app).then((t) => t.open.includes(s.id))).toBe(false);
    await expect.poll(() => app.evaluate((_e, id) => globalThis.__igroteka.views.has(id), s.id)).toBe(false);
  });
}

// Настоящая игра в окне демо: win11_3 открывает «Дино-бег» из своей папки «Игры».
test('win11_3: игра в окне демо грузится из соседней папки без ошибок, слышит паузу вкладки, захват мыши - подмена', async () => {
  const { app, shell } = ctx;
  await openDemo('win11_3');
  await H.inGame(app, 'win11_3', `(() => { openApp('game-dino'); return 1; })()`);
  await expect.poll(() => hasFrame(app, 'win11_3', '/dino/index.html'), { timeout: 20000 }).toBe(true);
  await expect.poll(() => inFrame(app, 'win11_3', '/dino/index.html', 'document.readyState').catch(() => ''), { timeout: 20000 }).toBe('complete');
  await inFrame(app, 'win11_3', '/dino/index.html', LOG_JS);
  await new Promise((r) => setTimeout(r, 1500));
  expect(await H.errorsOf(app, 'win11_3')).toEqual([]);
  expect(await app.evaluate(() => globalThis.__igroteka.blocked)).toEqual([]);
  expect(await inFrame(app, 'win11_3', '/dino/index.html', `Element.prototype.requestPointerLock.toString().includes('[native code]')`)).toBe(false);
  // Громкость приложения доходит и до игры в рамке (предзагрузка в каждой рамке).
  expect(await inFrame(app, 'win11_3', '/dino/index.html', `window[Symbol.for('igroteka.volume')]()`)).toBe(0.8);

  await shell.click('.tab.home');
  await expect.poll(() => inFrame(app, 'win11_3', '/dino/index.html', 'window.__mixLog')).toContain('pause');
  await shell.click('.tab.game[data-id="win11_3"]');
  await expect.poll(() => inFrame(app, 'win11_3', '/dino/index.html', 'window.__mixLog.at(-1)')).toBe('resume');
  await H.press(app, 'win11_3', 'W', ['control']);
  await expect.poll(() => H.tabs(app).then((t) => t.open.includes('win11_3'))).toBe(false);
});

test('вкладки демо и игр - одна полоса: порядок, переключение и закрытие как у игр, вкладки прошлого раза помнят демо', async () => {
  const { app, shell } = ctx;
  await home(app);
  await shell.click('.card[data-id="dino"] .play');
  await home(app);
  await shell.click('#systems .card[data-id="macos-tahoe"] .play');
  await home(app);
  await shell.click('.card[data-id="sudoku"] .play');
  await expect.poll(() => H.tabs(app)).toEqual({ open: ['dino', 'macos-tahoe', 'sudoku'], active: 'sudoku' });
  await H.press(app, 'sudoku', 'Tab', ['control', 'shift']);
  await expect.poll(() => H.tabs(app).then((t) => t.active)).toBe('macos-tahoe');
  await H.press(app, 'macos-tahoe', 'W', ['control']);
  // Закрыли демо посередине - активна соседняя справа, как у игр.
  await expect.poll(() => H.tabs(app)).toEqual({ open: ['dino', 'sudoku'], active: 'sudoku' });
  await home(app);
  await shell.click('#systems .card[data-id="ios26"] .play');
  await expect.poll(() => H.tabs(app).then((t) => t.open)).toEqual(['dino', 'sudoku', 'ios26']);
  const dataDir = ctx.dataDir;
  await H.close(ctx);
  ctx = await H.launch({ dataDir });
  await expect.poll(() => H.tabs(ctx.app)).toEqual({ open: ['dino', 'sudoku', 'ios26'], active: 'ios26' });
  await H.gameLoaded(ctx.app, 'ios26', 30000);
  expect(await H.errorsOf(ctx.app, 'ios26')).toEqual([]);
  for (const id of ['ios26', 'sudoku', 'dino']) {
    await H.press(ctx.app, 'shell', 'Digit9', ['control']);
    await H.press(ctx.app, 'shell', 'W', ['control']);
    await expect.poll(() => H.tabs(ctx.app).then((t) => t.open.includes(id))).toBe(false);
  }
});

test('«Очистить данные» стирает сеанс демо, не трогая игры', async () => {
  const { app, shell } = ctx;
  await openDemo('oneui7');
  await H.inGame(app, 'oneui7', `localStorage.setItem('oneui7.probe', '1'); 1`);
  await home(app);
  await shell.click('#gear');
  await shell.selectOption('#clear-game', 'oneui7');
  await shell.click('#clear-btn');
  await shell.click('#modal .ok');
  await expect(shell.locator('#clear-hint')).toHaveText('Данные «Телефон «Волна»» стёрты.');
  await expect.poll(() => H.tabs(app).then((t) => t.open.includes('oneui7'))).toBe(false);
  await shell.click('#settings [data-close]');
  await openDemo('oneui7');
  expect(await H.inGame(app, 'oneui7', `localStorage.getItem('oneui7.probe')`)).toBeNull();
  await H.press(app, 'oneui7', 'W', ['control']);
});
