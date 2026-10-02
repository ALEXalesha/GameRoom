// Порядок вкладок - чистые функции без Electron, их проверяют обычные тесты.
//
// Состояние: { open: [id игр слева направо], active: 'home' | id }. Домашняя вкладка
// есть всегда, стоит первой и не закрывается. Каждая функция возвращает НОВОЕ состояние
// и старое не трогает.
//
// Тот же файл подключает браузерная страница «Игротеки» (index.html в корне) обычным
// тегом <script>: там функции лежат в window.IgrotekaTabs.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.IgrotekaTabs = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const HOME = 'home';

  const empty = () => ({ open: [], active: HOME });

  // Все вкладки по порядку: домашняя, потом игры.
  const order = (s) => [HOME, ...s.open];

  // Открыть игру. Уже открытая не открывается второй раз - на неё просто переключаемся.
  function openTab(s, id) {
    if (id === HOME) return { open: s.open.slice(), active: HOME };
    if (s.open.includes(id)) return { open: s.open.slice(), active: id };
    return { open: [...s.open, id], active: id };
  }

  function activate(s, id) {
    if (id !== HOME && !s.open.includes(id)) return s;
    return { open: s.open.slice(), active: id };
  }

  // Закрыть вкладку. Если закрыли активную, активной становится соседняя справа, а у
  // крайней правой - соседняя слева (как в браузере); последняя игра уводит на домашнюю.
  function closeTab(s, id) {
    const i = s.open.indexOf(id);
    if (i < 0) return s;
    const open = s.open.filter((x) => x !== id);
    let active = s.active;
    if (active === id) active = open[i] ?? open[i - 1] ?? HOME;
    return { open, active };
  }

  // Ctrl+Tab (dir = 1) и Ctrl+Shift+Tab (dir = -1): по кругу, домашняя входит в круг.
  function cycle(s, dir) {
    const all = order(s);
    const i = Math.max(0, all.indexOf(s.active));
    const n = all.length;
    return { open: s.open.slice(), active: all[(((i + dir) % n) + n) % n] };
  }

  // Ctrl+1..9: N-я вкладка по порядку (Ctrl+1 - домашняя), Ctrl+9 - всегда последняя.
  // Номер больше числа вкладок ничего не меняет.
  function byNumber(s, n) {
    const all = order(s);
    if (n === 9) return { open: s.open.slice(), active: all[all.length - 1] };
    if (!Number.isInteger(n) || n < 1 || n > all.length) return s;
    return { open: s.open.slice(), active: all[n - 1] };
  }

  // Что открыть при запуске из сохранённого файла. Файл мог испортиться, игру могли
  // убрать из приложения: неизвестное и повторы выбрасываются, активная - только из
  // открытых, иначе домашняя.
  function restore(saved, known) {
    if (!saved || typeof saved !== 'object' || !Array.isArray(saved.open)) return empty();
    const open = [];
    for (const id of saved.open) {
      if (typeof id === 'string' && known.includes(id) && !open.includes(id)) open.push(id);
    }
    const active = open.includes(saved.active) ? saved.active : HOME;
    return { open, active };
  }

  return { HOME, empty, order, openTab, activate, closeTab, cycle, byNumber, restore };
});
