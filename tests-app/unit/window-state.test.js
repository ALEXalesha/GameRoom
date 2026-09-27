// Место и размер окна между запусками (app/window-state.js - тот же модуль, что у
// калькуляторов и Paint Pro Electron). Главное: что бы ни лежало в файле, окно
// откроется там, где его видно и можно взять за заголовок.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const WS = require('../../app/window-state');

const MAIN = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'main.js'), 'utf8');
const OPTS = { width: 1280, height: 800, minWidth: 800, minHeight: 560 };
const FULL_HD = { x: 0, y: 0, width: 1920, height: 1040 };
const RIGHT = { x: 1920, y: 0, width: 2560, height: 1400 };

test('main.js берёт размер по умолчанию и минимум отсюда же', () => {
  assert.match(MAIN, /const SIZE = \{ width: 1280, height: 800, minWidth: 800, minHeight: 560 \}/);
  assert.match(MAIN, /WindowState\.restore\(WindowState\.load\(/);
  for (const ev of ['resized', 'moved', 'maximize', 'unmaximize']) assert.ok(MAIN.includes(`'${ev}'`), ev);
  assert.match(MAIN, /win\.on\('close', remember\)/);
});

test('файла нет - размер по умолчанию, по центру', () => {
  assert.deepEqual(WS.restore(null, [FULL_HD], OPTS), { width: 1280, height: 800, maximized: false });
});

test('окно на экране открывается ровно там же', () => {
  const saved = { x: 100, y: 50, width: 1000, height: 700, maximized: false };
  assert.deepEqual(WS.restore(saved, [FULL_HD], OPTS), saved);
});

test('второй монитор отключили - окно по центру основного, размер тот же', () => {
  const saved = { x: 2500, y: 300, width: 1100, height: 700, maximized: false };
  assert.deepEqual(WS.restore(saved, [FULL_HD, RIGHT], OPTS), saved);
  assert.deepEqual(WS.restore(saved, [FULL_HD], OPTS), { width: 1100, height: 700, maximized: false });
});

test('развёрнутое запоминается только настоящим true', () => {
  assert.equal(WS.restore({ x: 0, y: 0, width: 900, height: 600, maximized: true }, [FULL_HD], OPTS).maximized, true);
  assert.equal(WS.restore({ x: 0, y: 0, width: 900, height: 600, maximized: 1 }, [FULL_HD], OPTS).maximized, false);
});

test('меньше минимума - до минимума, больше экрана - до экрана', () => {
  assert.deepEqual(WS.restore({ width: 10, height: 10 }, [FULL_HD], OPTS), { width: 800, height: 560, maximized: false });
  assert.deepEqual(WS.restore({ x: 0, y: 0, width: 9000, height: 9000 }, [FULL_HD], OPTS), { x: 0, y: 0, width: 1920, height: 1040, maximized: false });
});

test('на случайных экранах и мусоре заголовок окна всегда на каком-то экране', () => {
  let seed = 7;
  const rnd = (a, b) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return a + (seed % (b - a + 1)); };
  for (let i = 0; i < 3000; i++) {
    // Мониторы стоят в ряд и не перекрываются, как в жизни; сдвиг по высоте любой.
    let left = rnd(-4000, 0);
    const screens = Array.from({ length: rnd(1, 3) }, () => {
      const a = { x: left, y: rnd(-1500, 1500), width: rnd(800, 4000), height: rnd(600, 2400) };
      left += a.width;
      return a;
    });
    const saved = rnd(0, 9) === 0 ? 'мусор' : { x: rnd(-9000, 9000), y: rnd(-9000, 9000), width: rnd(-100, 6000), height: rnd(-100, 4000), maximized: rnd(0, 1) === 1 };
    const got = WS.restore(saved, screens, OPTS);
    assert.ok(got.width >= OPTS.minWidth && got.height >= OPTS.minHeight);
    if (got.x === undefined) continue; // по центру - ставит Electron
    const grip = screens.some((a) => got.x >= a.x && got.y >= a.y && got.x < a.x + a.width && got.y + WS.GRIP_HEIGHT <= a.y + a.height);
    assert.ok(grip, JSON.stringify({ saved, screens, got }));
    assert.deepEqual(WS.restore(got, screens, OPTS), got, 'восстановленное восстанавливается без изменений');
  }
});

test('запись через временный файл, испорченный файл читается как null', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'igroteka-ws-'));
  const f = path.join(dir, 'w.json');
  assert.equal(WS.save(f, { x: 1 }), true);
  assert.deepEqual(WS.load(f), { x: 1 });
  assert.equal(fs.existsSync(f + '.tmp'), false);
  fs.writeFileSync(f, '{"x": 1');
  assert.equal(WS.load(f), null);
  fs.rmSync(dir, { recursive: true, force: true });
});

// Соседний репозиторий калькуляторов лежит рядом только на машине автора.
const CALC = path.join(__dirname, '..', '..', '..', 'Calculators', 'calcpro-glass', 'window-state.js');
test('модуль совпадает с калькуляторным, если тот рядом', { skip: !fs.existsSync(CALC) }, () => {
  assert.equal(fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'window-state.js'), 'utf8'), fs.readFileSync(CALC, 'utf8'));
});
