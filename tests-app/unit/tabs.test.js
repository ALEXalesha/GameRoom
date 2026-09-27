// Законы порядка вкладок (app/tabs.js). Чистые функции, Electron не нужен.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../../app/tabs');

const s = (open, active) => ({ open, active });

test('открыть новую игру: вкладка встаёт последней и становится активной', () => {
  assert.deepEqual(T.openTab(s(['a'], 'home'), 'b'), s(['a', 'b'], 'b'));
});

test('открыть уже открытую игру: второй вкладки нет, просто переключение', () => {
  const r = T.openTab(s(['a', 'b'], 'b'), 'a');
  assert.deepEqual(r, s(['a', 'b'], 'a'));
});

test('функции не меняют старое состояние', () => {
  const before = s(['a', 'b'], 'a');
  const copy = JSON.parse(JSON.stringify(before));
  T.openTab(before, 'c'); T.closeTab(before, 'a'); T.cycle(before, 1); T.byNumber(before, 3);
  assert.deepEqual(before, copy);
});

test('закрыть активную: соседняя справа, у крайней правой - слева, последняя - домой', () => {
  assert.deepEqual(T.closeTab(s(['a', 'b', 'c'], 'b'), 'b'), s(['a', 'c'], 'c'));
  assert.deepEqual(T.closeTab(s(['a', 'b', 'c'], 'c'), 'c'), s(['a', 'b'], 'b'));
  assert.deepEqual(T.closeTab(s(['a'], 'a'), 'a'), s([], 'home'));
});

test('закрыть неактивную: активная остаётся той же', () => {
  assert.deepEqual(T.closeTab(s(['a', 'b', 'c'], 'c'), 'a'), s(['b', 'c'], 'c'));
});

test('закрыть неоткрытую или домашнюю - ничего не меняется', () => {
  const x = s(['a'], 'a');
  assert.equal(T.closeTab(x, 'zzz'), x);
  assert.equal(T.closeTab(x, 'home'), x);
});

test('Ctrl+Tab идёт по кругу через домашнюю, Ctrl+Shift+Tab - обратно', () => {
  let x = s(['a', 'b'], 'home');
  const seen = [];
  for (let i = 0; i < 4; i++) { x = T.cycle(x, 1); seen.push(x.active); }
  assert.deepEqual(seen, ['a', 'b', 'home', 'a']);
  assert.equal(T.cycle(s(['a', 'b'], 'home'), -1).active, 'b');
  assert.equal(T.cycle(s([], 'home'), 1).active, 'home');
});

test('Ctrl+1 - домашняя, Ctrl+N - N-я, Ctrl+9 - последняя, лишний номер ничего не делает', () => {
  const x = s(['a', 'b', 'c'], 'b');
  assert.equal(T.byNumber(x, 1).active, 'home');
  assert.equal(T.byNumber(x, 2).active, 'a');
  assert.equal(T.byNumber(x, 4).active, 'c');
  assert.equal(T.byNumber(x, 9).active, 'c');
  assert.equal(T.byNumber(x, 5), x);
  assert.equal(T.byNumber(s([], 'home'), 9).active, 'home');
});

test('восстановление: только известные игры, без повторов, активная из открытых', () => {
  const known = ['a', 'b', 'c'];
  assert.deepEqual(T.restore({ open: ['b', 'x', 'b', 7, 'a'], active: 'a' }, known), s(['b', 'a'], 'a'));
  assert.deepEqual(T.restore({ open: ['b'], active: 'x' }, known), s(['b'], 'home'));
  for (const junk of [null, 'строка', 42, {}, { open: 'a' }, []]) assert.deepEqual(T.restore(junk, known), s([], 'home'));
});

test('случайные последовательности действий: вкладки без повторов, активная всегда существует', () => {
  const ids = ['a', 'b', 'c', 'd', 'e'];
  let seed = 12345;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  let x = T.empty();
  for (let i = 0; i < 5000; i++) {
    const op = rnd(5);
    const id = ids[rnd(ids.length)];
    if (op === 0) x = T.openTab(x, id);
    else if (op === 1) x = T.closeTab(x, x.open[rnd(x.open.length + 1)] || 'home');
    else if (op === 2) x = T.cycle(x, rnd(2) ? 1 : -1);
    else if (op === 3) x = T.byNumber(x, 1 + rnd(9));
    else x = T.activate(x, id);
    assert.equal(new Set(x.open).size, x.open.length);
    assert.ok(x.active === 'home' || x.open.includes(x.active), JSON.stringify(x));
  }
});
