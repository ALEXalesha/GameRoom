// Законы по замечаниям независимого ревьюера (27.09.2026): громкость после перезагрузки,
// вопрос и полоса вкладок, чужие вопросы от фоновых вкладок, звук вне документа,
// скачивания, повторные сбои страницы, отправитель IPC, пределы журналов.
'use strict';

const { test, expect } = require('@playwright/test');
const H = require('./harness');

const VOL = `window[Symbol.for('igroteka.volume')]()`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ctx;
test.beforeEach(async () => { ctx = await H.launch(); });
test.afterEach(async () => { await H.close(ctx); H.rmData(ctx.dataDir); });

const open = async (id) => {
  const { app, shell } = ctx;
  if ((await H.tabs(app)).active !== 'home') await H.press(app, 'shell', 'T', ['control']);
  await expect.poll(() => H.tabs(app).then((t) => t.active)).toBe('home');
  await shell.click(`.card[data-id="${id}"]`);
  await H.gameLoaded(app, id);
};

test('громкость переживает F5 и перезагрузку страницы', async () => {
  const { app, shell } = ctx;
  await open('dino');
  await shell.evaluate(() => window.igroteka.setSetting('volume', 30));
  await expect.poll(() => H.inGame(app, 'dino', VOL)).toBe(0.3);
  await H.press(app, 'dino', 'F5');
  await shell.click('#modal .ok');
  await sleep(500);
  await H.gameLoaded(app, 'dino');
  expect(await H.inGame(app, 'dino', VOL)).toBe(0.3);
});

test('громкость доходит и до new Audio() вне документа', async () => {
  const { app, shell } = ctx;
  await open('dino');
  await shell.evaluate(() => window.igroteka.setSetting('volume', 30));
  await expect.poll(() => H.inGame(app, 'dino', VOL)).toBe(0.3);
  const r = await H.inGame(app, 'dino', `(async () => {
    const n = 1600, b = new ArrayBuffer(44 + n), v = new DataView(b);
    const s = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    s(0, 'RIFF'); v.setUint32(4, 36 + n, true); s(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); s(36, 'data'); v.setUint32(40, n, true);
    for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
    const a = new Audio(URL.createObjectURL(new Blob([b], { type: 'audio/wav' })));
    await a.play().catch(() => {});
    const first = a.volume;
    window[Symbol.for('igroteka.volume')](0.5);
    return { first, after: a.volume };
  })()`);
  expect(r).toEqual({ first: 0.3, after: 0.5 });
});

test('disconnect() без аргументов отключает все выходы узла', async () => {
  const { app } = ctx;
  await open('dino');
  const r = await H.inGame(app, 'dino', `(() => {
    const c = new AudioContext();
    const sp = c.createChannelSplitter(2);
    const a = c.createGain(), b = c.createGain();
    sp.connect(a, 0); sp.connect(b, 1);
    sp.disconnect();
    try { sp.disconnect(b); return 'выход 1 остался'; } catch (e) { return 'всё отключено'; }
  })()`);
  expect(r).toBe('всё отключено');
});

test('пока открыт вопрос, полоса вкладок не работает, а «Перезапустить» перезапускает ту игру', async () => {
  const { app, shell } = ctx;
  await open('mario');
  await open('dino');
  await H.inGame(app, 'dino', 'window.__mark = 1');
  await H.press(app, 'dino', 'F5');
  await expect(shell.locator('#modal')).toBeVisible();
  expect(await shell.locator('#bar').evaluate((b) => b.inert)).toBe(true);
  // Даже если щелчок дойдёт до main (или его пришлёт кто-то ещё) - вкладки не меняются.
  await shell.evaluate(() => { window.igroteka.activate('mario'); window.igroteka.close('mario'); window.igroteka.open('fps_1'); });
  await sleep(300);
  expect(await H.tabs(app)).toEqual({ open: ['mario', 'dino'], active: 'dino' });
  await shell.click('#modal .ok');
  await expect.poll(() => H.inGame(app, 'dino', 'typeof window.__mark').catch(() => 'loading')).toBe('undefined');
  expect(await shell.locator('#bar').evaluate((b) => b.inert)).toBe(false);
});

test('фоновая вкладка не может задать вопрос и подменить вопрос оболочки', async () => {
  const { app, shell } = ctx;
  await open('dino');
  await open('mario');
  await H.press(app, 'mario', 'T', ['control']);
  await shell.click('#gear');
  await shell.selectOption('#clear-game', 'mario');
  await shell.click('#clear-btn');
  await expect(shell.locator('#modal-title')).toContainText('Стереть');
  await H.inGame(app, 'dino', `window.open('https://example.com/bg'); location.href = 'https://example.com/nav'; 1`);
  await sleep(500);
  await expect(shell.locator('#modal-title')).toContainText('Стереть');
  await shell.click('#modal .ok');
  await expect(shell.locator('#clear-hint')).toContainText('стёрты');
  expect(await app.evaluate(() => globalThis.__opened)).toEqual([]);
  // И без вопроса оболочки фоновая вкладка ничего не спрашивает.
  await shell.click('#settings [data-close]');
  await H.inGame(app, 'dino', `window.open('https://example.com/bg2'); 1`);
  await sleep(500);
  await expect(shell.locator('#modal')).toBeHidden();
});

test('пока открыт вопрос оболочки «стереть данные», клавиши не уводят с домашнего экрана', async () => {
  const { app, shell } = ctx;
  await open('dino');
  await H.press(app, 'dino', 'T', ['control']);
  await shell.click('#gear');
  await shell.click('#clear-btn');
  await expect(shell.locator('#modal')).toBeVisible();
  await H.press(app, 'shell', 'Tab', ['control']);
  await H.press(app, 'shell', '2', ['control']);
  await sleep(300);
  expect((await H.tabs(app)).active).toBe('home');
  await shell.click('#modal .cancel');
  await H.press(app, 'shell', 'Tab', ['control']);
  await expect.poll(() => H.tabs(app).then((t) => t.active)).toBe('dino');
});

test('скачивания со страницы игры отменяются', async () => {
  const { app } = ctx;
  await open('dino');
  await app.evaluate(({ session }) => {
    globalThis.__dl = [];
    session.fromPartition('persist:dino').on('will-download', (_e, item) => globalThis.__dl.push(item.getState()));
  });
  await H.inGame(app, 'dino', `(() => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['x'])); a.download = 'save.txt'; document.body.append(a); a.click(); return 1; })()`);
  await expect.poll(() => app.evaluate(() => globalThis.__igroteka.blocked.some((u) => u.startsWith('download:')))).toBe(true);
  const states = await app.evaluate(() => globalThis.__dl);
  expect(states.length).toBeGreaterThan(0);
});

test('страница, которая падает раз за разом, после трёх сбоев показывает экран «игра упала»', async () => {
  const { app, shell } = ctx;
  await open('dino');
  for (let i = 0; i < 4; i++) {
    await app.evaluate(() => globalThis.__igroteka.views.get('dino').webContents.forcefullyCrashRenderer());
    await sleep(1500);
  }
  await expect(shell.locator('#crashed')).toBeVisible();
  expect(await app.evaluate(() => globalThis.__igroteka.win.contentView.children.length)).toBe(0);
  await shell.click('#crashed .btn');
  await expect(shell.locator('#crashed')).toBeHidden();
  await H.gameLoaded(app, 'dino');
  expect(await app.evaluate(() => globalThis.__igroteka.win.contentView.children.length)).toBe(1);
});

test('команды вкладок принимаются только от окна оболочки', async () => {
  const { app } = ctx;
  await app.evaluate(({ ipcMain }) => ipcMain.emit('tabs:open', { sender: {} }, 'dino'));
  await sleep(300);
  expect(await H.tabs(app)).toEqual({ open: [], active: 'home' });
});

test('журналы ошибок и отказов хранят не больше 100 последних', async () => {
  const { app } = ctx;
  await open('dino');
  await H.inGame(app, 'dino', `for (let i = 0; i < 250; i++) console.error('e' + i); 1`);
  await H.inGame(app, 'dino', `for (let i = 0; i < 150; i++) fetch('http://127.0.0.1:9/' + i).catch(() => {}); 1`);
  await sleep(1500);
  const r = await app.evaluate(() => ({ e: globalThis.__igroteka.errors.dino, b: globalThis.__igroteka.blocked }));
  expect(r.e.length).toBe(100);
  expect(r.e[99]).toBe('e249');
  expect(r.b.length).toBeLessThanOrEqual(100);
});

// Контраст текста кнопки к её фону, с учётом полупрозрачных подложек предков.
const contrastOf = (sel) => ctx.shell.evaluate((s) => {
  const parse = (c) => { const m = c.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 }; };
  const el = document.querySelector(s);
  const layers = [];
  for (let e = el; e; e = e.parentElement) {
    const bg = parse(getComputedStyle(e).backgroundColor);
    if (bg.a > 0) layers.push(bg);
    if (bg.a >= 1) break;
  }
  let base = { r: 255, g: 255, b: 255 };
  if (!layers.length || layers[layers.length - 1].a < 1) {
    const root = parse(getComputedStyle(document.body).backgroundColor);
    base = root;
  }
  for (const l of layers.reverse()) base = { r: l.r * l.a + base.r * (1 - l.a), g: l.g * l.a + base.g * (1 - l.a), b: l.b * l.a + base.b * (1 - l.a) };
  const fg = parse(getComputedStyle(el).color);
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const [a, b] = [lum(fg), lum(base)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}, sel);

for (const theme of ['dark', 'light']) {
  test(`красные кнопки читаются (контраст от 4.5) в теме ${theme}`, async () => {
    const { shell } = ctx;
    await shell.evaluate((t) => window.igroteka.setSetting('theme', t), theme);
    await expect(shell.locator('html')).toHaveAttribute('data-theme', theme);
    await shell.click('#gear');
    expect(await contrastOf('#clear-btn')).toBeGreaterThanOrEqual(4.5);
    await shell.click('#clear-btn');
    expect(await contrastOf('#modal .ok')).toBeGreaterThanOrEqual(4.5);
    await shell.click('#modal .cancel');
  });
}

test('вкладки: у каждой видно имя (8 вкладок при 1280), при 800 полоса прокручивается, активная видна', async () => {
  const { app, shell } = ctx;
  const ids = require('../app/games').IDS;
  for (const id of ids) {
    await H.press(app, 'shell', 'T', ['control']);
    await expect.poll(() => H.tabs(app).then((t) => t.active)).toBe('home');
    await shell.evaluate((g) => window.igroteka.open(g), id);
    await expect.poll(() => H.tabs(app).then((t) => t.active)).toBe(id);
  }
  const measure = () => shell.evaluate(() => {
    const box = document.getElementById('tabs').getBoundingClientRect();
    const tabs = [...document.querySelectorAll('.tab.game')];
    const act = document.querySelector('.tab.game.active').getBoundingClientRect();
    return {
      minName: Math.min(...tabs.map((t) => t.querySelector('.name').getBoundingClientRect().width)),
      scrolls: document.getElementById('tabs').scrollWidth > document.getElementById('tabs').clientWidth,
      activeVisible: act.left >= box.left - 1 && act.right <= box.right + 1,
      closeOnInactive: tabs.filter((t) => !t.classList.contains('active')).map((t) => getComputedStyle(t.querySelector('.x')).visibility),
    };
  });
  await app.evaluate(() => globalThis.__igroteka.win.setContentSize(1280, 720));
  await sleep(400);
  let m = await measure();
  expect(m.minName).toBeGreaterThanOrEqual(60);
  expect(m.activeVisible).toBe(true);
  expect(new Set(m.closeOnInactive)).toEqual(new Set(['hidden']));
  await app.evaluate(() => globalThis.__igroteka.win.setContentSize(800, 560));
  await sleep(400);
  await H.press(app, ids[ids.length - 1], '2', ['control']); // первая игра
  await sleep(300);
  m = await measure();
  expect(m.minName).toBeGreaterThanOrEqual(60);
  expect(m.scrolls).toBe(true);
  expect(m.activeVisible).toBe(true);
  await H.press(app, ids[0], '9', ['control']); // последняя
  await sleep(300);
  expect((await measure()).activeVisible).toBe(true);
});

test('значки вкладок с обводкой: на чёрном и белом не сливаются в квадрат', async () => {
  const { shell } = ctx;
  await shell.evaluate(() => window.igroteka.open('dino'));
  // Обводка средней яркости и почти непрозрачная: видна и на чёрном, и на белом.
  const ring = await shell.locator('.tab.game .icon').first().evaluate((i) => {
    const s = getComputedStyle(i);
    const m = s.outlineColor.match(/[\d.]+/g).map(Number);
    return { solid: s.outlineStyle === 'solid' && parseFloat(s.outlineWidth) >= 1, gray: (m[0] + m[1] + m[2]) / 3, alpha: m.length > 3 ? m[3] : 1 };
  });
  expect(ring.solid).toBe(true);
  expect(ring.gray).toBeGreaterThan(80);
  expect(ring.gray).toBeLessThan(190);
  expect(ring.alpha).toBeGreaterThanOrEqual(0.6);
});

test('главная при 1280x720: все игры в два ряда без прокрутки, имена одного ряда на одной высоте', async () => {
  const { app, shell } = ctx;
  await app.evaluate(() => globalThis.__igroteka.win.setContentSize(1280, 720));
  await sleep(500);
  const r = await shell.evaluate(() => {
    const home = document.getElementById('home');
    const cards = [...document.querySelectorAll('.card')].map((c) => ({
      top: Math.round(c.getBoundingClientRect().top),
      name: Math.round(c.querySelector('h2').getBoundingClientRect().top),
      play: Math.round(c.querySelector('.play').getBoundingClientRect().top),
      width: c.getBoundingClientRect().width,
    }));
    const rows = [...new Set(cards.map((c) => c.top))];
    return {
      overflow: home.scrollHeight - home.clientHeight,
      rows: rows.length,
      namesPerRow: rows.map((t) => new Set(cards.filter((c) => c.top === t).map((c) => c.name)).size),
      playsPerRow: rows.map((t) => new Set(cards.filter((c) => c.top === t).map((c) => c.play)).size),
      minWidth: Math.min(...cards.map((c) => c.width)),
    };
  });
  expect(r.overflow).toBeLessThanOrEqual(0);
  expect(r.rows).toBe(2);
  expect(r.namesPerRow).toEqual([1, 1]);
  // И кнопки «Играть» одного ряда на одной линии, хотя описания разной длины.
  expect(r.playsPerRow).toEqual([1, 1]);
  expect(r.minWidth).toBeGreaterThanOrEqual(210);
  // На широком экране описания разной длины (одна и две строки) - кнопки всё равно в линию.
  await app.evaluate(() => globalThis.__igroteka.win.setContentSize(1920, 1080));
  await sleep(500);
  const wide = await shell.evaluate(() => {
    const cards = [...document.querySelectorAll('.card')].map((c) => ({
      top: Math.round(c.getBoundingClientRect().top),
      play: Math.round(c.querySelector('.play').getBoundingClientRect().top),
      desc: (() => { const r = document.createRange(); r.selectNodeContents(c.querySelector('.desc')); return new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size; })(),
    }));
    const rows = [...new Set(cards.map((c) => c.top))];
    return {
      playsPerRow: rows.map((t) => new Set(cards.filter((c) => c.top === t).map((c) => c.play)).size),
      descHeights: new Set(cards.map((c) => c.desc)).size,
    };
  });
  expect(wide.descHeights).toBeGreaterThan(1); // строк в описаниях разное число, иначе закон ничего не проверяет
  expect(wide.playsPerRow).toEqual([1, 1]);
});

test('при 1920x1080 сетка стоит по центру, без большой пустоты снизу', async () => {
  const { app, shell } = ctx;
  await app.evaluate(() => globalThis.__igroteka.win.setContentSize(1920, 1080));
  await sleep(500);
  const r = await shell.evaluate(() => {
    const home = document.getElementById('home').getBoundingClientRect();
    const hero = document.querySelector('.hero').getBoundingClientRect();
    const note = document.querySelector('.note').getBoundingClientRect();
    return { top: hero.top - home.top, bottom: home.bottom - note.bottom };
  });
  expect(Math.abs(r.top - r.bottom)).toBeLessThan(60);
});

test('метка открытой игры не ложится на картинку, подпись «стёрты» сбрасывается', async () => {
  const { app, shell } = ctx;
  await open('dino');
  await H.press(app, 'dino', 'T', ['control']);
  const over = await shell.evaluate(() => {
    const card = document.querySelector('.card[data-id="dino"]');
    const shot = card.querySelector('.shot').getBoundingClientRect();
    return [...card.querySelectorAll('.badge, .open-mark')].filter((b) => b.offsetParent).some((b) => {
      const r = b.getBoundingClientRect();
      return r.bottom > shot.top && r.top < shot.bottom;
    });
  });
  expect(over).toBe(false);
  await shell.click('#gear');
  await shell.selectOption('#clear-game', 'mario');
  await shell.click('#clear-btn');
  await shell.click('#modal .ok');
  await expect(shell.locator('#clear-hint')).toContainText('стёрты');
  await shell.selectOption('#clear-game', 'dino');
  await expect(shell.locator('#clear-hint')).not.toContainText('Данные «');
  // И при новом открытии настроек подпись снова обычная.
  await shell.selectOption('#clear-game', 'mario');
  await shell.click('#clear-btn');
  await shell.click('#modal .ok');
  await expect(shell.locator('#clear-hint')).toContainText('Данные «');
  await shell.click('#settings [data-close]');
  await shell.click('#gear');
  await expect(shell.locator('#clear-hint')).not.toContainText('Данные «');
});

// --- клавиши, которые игра забирает себе (games.js, поле keys) ---

const listenKeys = (id) => H.inGame(ctx.app, id, `window.__keys = []; addEventListener('keydown', (e) => __keys.push(e.code), true); 1`);

test('F5 в игре, которая забрала его себе, доходит до страницы и вопроса не открывает', async () => {
  const { app, shell } = ctx;
  await open('minecraft_clone_3d_1');
  await listenKeys('minecraft_clone_3d_1');
  for (const k of ['F1', 'F2', 'F3', 'F5']) await H.press(app, 'minecraft_clone_3d_1', k);
  await sleep(400);
  expect(await H.inGame(app, 'minecraft_clone_3d_1', '__keys')).toEqual(['F1', 'F2', 'F3', 'F5']);
  await expect(shell.locator('#modal')).toBeHidden();
  expect(await app.evaluate(() => globalThis.__igroteka.modalOpen)).toBe(false);
});

test('F5 в обычной игре открывает вопрос и до страницы не доходит', async () => {
  const { app, shell } = ctx;
  await open('dino');
  await listenKeys('dino');
  await H.press(app, 'dino', 'F5');
  await expect(shell.locator('#modal')).toBeVisible();
  await shell.click('#modal .cancel');
  expect(await H.inGame(app, 'dino', '__keys')).not.toContain('F5');
});

for (const [id, key] of [['minecraft_clone_3d_1', 'R'], ['dino', 'R'], ['minecraft_clone_3d_1', 'F5']]) {
  test(`Ctrl+${key} открывает вопрос о перезапуске в ${id}`, async () => {
    const { app, shell } = ctx;
    await open(id);
    await H.press(app, id, key, ['control']);
    await expect(shell.locator('#modal')).toBeVisible();
    await expect(shell.locator('#modal-title')).toContainText('заново');
    await shell.click('#modal .cancel');
  });
}

test('меню вкладки: «Начать заново» спрашивает и перезапускает, «Закрыть вкладку» закрывает', async () => {
  const { app, shell } = ctx;
  await open('minecraft_clone_3d_1');
  await open('dino');
  await H.inGame(app, 'minecraft_clone_3d_1', 'window.__mark = 1');
  await shell.locator('.tab.game[data-id="minecraft_clone_3d_1"]').click({ button: 'right' });
  await expect.poll(() => app.evaluate(() => !!globalThis.__igroteka.lastMenu)).toBe(true);
  const labels = await app.evaluate(() => globalThis.__igroteka.lastMenu.items.map((i) => i.label));
  expect(labels).toEqual(['Начать заново…', '', 'Закрыть вкладку']);
  await app.evaluate(() => { const m = globalThis.__igroteka.lastMenu; m.closePopup(); m.items[0].click(); });
  await expect(shell.locator('#modal')).toBeVisible();
  expect((await H.tabs(app)).active).toBe('minecraft_clone_3d_1');
  await shell.click('#modal .ok');
  await expect.poll(() => H.inGame(app, 'minecraft_clone_3d_1', 'typeof window.__mark').catch(() => 'loading')).toBe('undefined');
  await shell.locator('.tab.game[data-id="dino"]').click({ button: 'right' });
  await app.evaluate(() => { const m = globalThis.__igroteka.lastMenu; m.closePopup(); m.items[2].click(); });
  await expect.poll(() => H.tabs(app).then((t) => t.open)).toEqual(['minecraft_clone_3d_1']);
});

test('в настройках есть подсказка клавиш и про игру, которая забрала F5', async () => {
  const { shell } = ctx;
  await shell.click('#gear');
  await expect(shell.locator('.keys')).toContainText('Ctrl');
  await expect(shell.locator('#keys-own')).toContainText('Ctrl+R');
  await expect(shell.locator('#keys-own')).toContainText('Кубический мир');
});
