// Значок приложения (app/assets/icon.ico из tools/make-icon.js).
// Проверяется сам файл: все размеры на месте, маленькие кадры не пустые и геймпад на
// них отличим от фона. Сборщик и окно смотрят на тот же файл.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const pkg = require('../../package.json');
const ICON = path.join(ROOT, pkg.build.win.icon);

function frames(buf) {
  assert.equal(buf.readUInt16LE(0), 0, 'не .ico');
  assert.equal(buf.readUInt16LE(2), 1, 'не .ico');
  const n = buf.readUInt16LE(4);
  return Array.from({ length: n }, (_, i) => {
    const e = 6 + 16 * i;
    const size = buf.readUInt8(e) || 256;
    const len = buf.readUInt32LE(e + 8);
    const off = buf.readUInt32LE(e + 12);
    return { size, data: buf.subarray(off, off + len) };
  });
}

// Пиксели кадра BMP (32 бита, строки снизу вверх, BGRA) -> [{r,g,b,a}].
function bmpPixels(f) {
  const d = f.data;
  assert.equal(d.readUInt32LE(0), 40, `кадр ${f.size} не BMP`);
  assert.equal(d.readUInt16LE(14), 32, `кадр ${f.size} не 32-битный`);
  const px = [];
  for (let i = 0; i < f.size * f.size; i++) {
    const o = 40 + i * 4;
    px.push({ b: d[o], g: d[o + 1], r: d[o + 2], a: d[o + 3] });
  }
  return px;
}

const luma = (p) => (0.2126 * p.r + 0.7152 * p.g + 0.0722 * p.b) / 255;

test('package.json: build.win.icon указывает на существующий файл, окно берёт тот же', () => {
  assert.ok(fs.existsSync(ICON), ICON);
  const main = fs.readFileSync(path.join(ROOT, 'app', 'main.js'), 'utf8');
  assert.match(main, /icon: path\.join\(APP_DIR, 'assets', 'icon\.ico'\)/);
  assert.equal(path.resolve(ROOT, 'app', 'assets', 'icon.ico'), ICON);
});

test('в .ico все размеры: 16, 24, 32, 48, 64, 128, 256', () => {
  const sizes = frames(fs.readFileSync(ICON)).map((f) => f.size).sort((a, b) => a - b);
  assert.deepEqual(sizes, [16, 24, 32, 48, 64, 128, 256]);
});

test('большие кадры - настоящие PNG', () => {
  for (const f of frames(fs.readFileSync(ICON)).filter((x) => x.size >= 128)) {
    assert.equal(f.data.subarray(1, 4).toString('latin1'), 'PNG', `кадр ${f.size}`);
  }
});

for (const size of [16, 32]) {
  test(`кадр ${size} px не пустой и геймпад на нём виден`, () => {
    const f = frames(fs.readFileSync(ICON)).find((x) => x.size === size);
    assert.ok(f, `нет кадра ${size}`);
    const px = bmpPixels(f);
    const opaque = px.filter((p) => p.a > 200);
    // Скруглённый квадрат занимает почти весь кадр: непрозрачного больше половины.
    assert.ok(opaque.length > px.length * 0.5, `непрозрачных ${opaque.length} из ${px.length}`);
    // Светлый геймпад на тёмном градиенте: есть и светлые, и тёмные точки, и их заметно.
    const light = opaque.filter((p) => luma(p) > 0.8).length;
    const dark = opaque.filter((p) => luma(p) < 0.5).length;
    assert.ok(light > px.length * 0.08, `светлых точек ${light}`);
    assert.ok(dark > px.length * 0.2, `тёмных точек ${dark}`);
  });
}
