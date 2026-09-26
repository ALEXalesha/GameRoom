// Интерфейс: экраны меню (как в оригинале: тёмный полупрозрачный фон, «пиксельные»
// кнопки, но свой шрифт и свой рисунок), список миров, создание, настройки, клавиши,
// окна инвентаря, верстака и печи, творческая палитра с поиском, полосы здоровья и
// голода, панель быстрого доступа, отладка F3, достижения, экран победы.
(function () {
  'use strict';
  const VX = window.VX;
  const C = VX.core, D = VX.data, B = C.B;
  const G = VX.game;
  const $ = (s, r) => (r || document).querySelector(s);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const UI = VX.ui = { current: null, prev: [] };
  const screens = {};
  let root, hud;

  // ---------- Кнопки ----------
  function button(text, onClick, cls) {
    const b = el('button', 'mc-btn' + (cls ? ' ' + cls : ''));
    b.type = 'button';
    b.innerHTML = '<span>' + text + '</span>';
    b.addEventListener('click', (e) => { if (b.disabled) return; VX.audio.init(); VX.audio.play('click'); onClick(e); });
    return b;
  }
  function setText(b, t) { b.firstChild.textContent = t; }
  // Ползунок в виде кнопки с надписью
  function slider(label, min, max, step, get, set, fmt) {
    const w = el('label', 'mc-slider');
    const inp = el('input'); inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step;
    const cap = el('span', 'cap');
    const upd = () => { cap.textContent = label + ': ' + fmt(+inp.value); };
    inp.addEventListener('input', () => { set(+inp.value); upd(); });
    inp.addEventListener('change', () => G.saveSettings());
    w.append(inp, cap);
    w.refresh = () => { inp.value = get(); upd(); };
    w.refresh();
    return w;
  }
  function toggle(labelFn, onClick) {
    const b = button('', () => { onClick(); b.refresh(); G.saveSettings(); });
    b.refresh = () => setText(b, labelFn());
    b.refresh();
    return b;
  }

  // ---------- Показ экранов ----------
  UI.show = function (name) {
    if (UI.current && UI.current !== name && !['hud', 'inv'].includes(UI.current)) UI.prev.push(UI.current);
    if (UI.prev.length > 8) UI.prev.shift();
    UI.current = name;
    for (const k in screens) screens[k].classList.toggle('show', k === name);
    const inMenu = !['hud', 'inv', 'loading', 'death', 'pause', 'settings', 'controls', 'ach', 'victory'].includes(name) || !G.meta || G.panorama;
    document.body.classList.toggle('menu', inMenu && G.panorama);
    document.body.classList.toggle('dim', ['pause', 'settings', 'controls', 'ach', 'victory', 'death'].includes(name) && !G.panorama);
    hud.classList.toggle('show', !!G.meta && !G.panorama && ['hud', 'inv', 'death', 'pause', 'settings', 'controls', 'ach', 'victory'].includes(name));
    const s = screens[name];
    if (s && s.onShow) s.onShow();
    hideTip();
  };
  UI.back = function () {
    const p = UI.prev.pop();
    if (p) { UI.current = null; UI.show(p); }
  };

  // ---------- Экраны ----------
  function screen(name, cls) {
    const s = el('section', 'screen ' + (cls || ''));
    s.id = 'scr-' + name;
    root.appendChild(s);
    screens[name] = s;
    return s;
  }
  const SPLASHES = ['Своё, не чужое!', 'Теперь с зомби!', 'Кубики до горизонта!', '100% нарисовано кодом!', 'Копай глубже!', 'Не забудь факелы!', 'Сердце мира ждёт!', 'Бесконечный мир!', 'Без интернета!', 'Звуки из воздуха!'];

  function buildStart() {
    const s = screen('start', 'title-screen');
    const logo = VX.tex.titleCanvas('КУБИЧЕСКИЙ МИР', 7);
    logo.className = 'logo';
    s.append(logo, el('div', 'blink', 'Нажмите любую клавишу или щёлкните мышью'), el('div', 'foot', '<span>Кубический мир 2.0</span><span>Фан-песочница в духе Minecraft, не связана с Mojang/Microsoft</span>'));
    s.addEventListener('mousedown', () => { VX.audio.init(); UI.show('title'); });
  }
  function buildTitle() {
    const s = screen('title', 'title-screen');
    const logo = VX.tex.titleCanvas('КУБИЧЕСКИЙ МИР', 7);
    logo.className = 'logo';
    const wrap = el('div', 'logo-wrap');
    const splash = el('div', 'splash');
    wrap.append(logo, splash);
    const col = el('div', 'col');
    col.append(
      button('Одиночная игра', () => UI.show('worlds')),
      button('Настройки', () => UI.show('settings')),
      button('Выход', () => UI.show('start')),
    );
    s.append(wrap, col, el('div', 'foot', '<span>Кубический мир 2.0</span><span>Фан-песочница в духе Minecraft, не связана с Mojang/Microsoft</span>'));
    s.onShow = () => { splash.textContent = SPLASHES[(Math.random() * SPLASHES.length) | 0]; };
  }

  // Список миров
  let worldsCache = [], selectedWorld = null;
  function fmtSize(n) { return n > 1048576 ? (n / 1048576).toFixed(1) + ' МБ' : Math.max(1, Math.round(n / 1024)) + ' КБ'; }
  function fmtDate(t) {
    const d = new Date(t);
    const p = (v) => String(v).padStart(2, '0');
    return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  function buildWorlds() {
    const s = screen('worlds', 'list-screen');
    s.append(el('h2', '', 'Выбор мира'));
    const note = el('div', 'note');
    const list = el('div', 'world-list');
    const bar1 = el('div', 'row'), bar2 = el('div', 'row');
    const bPlay = button('Играть в выбранном мире', () => selectedWorld && playWorld(selectedWorld));
    const bNew = button('Создать новый мир', () => UI.show('create'));
    const bDel = button('Удалить', () => selectedWorld && UI.confirmDelete(selectedWorld));
    const bBack = button('Отмена', () => UI.show('title'));
    bar1.append(bPlay, bNew); bar2.append(bDel, bBack);
    s.append(note, list, bar1, bar2);
    const refreshButtons = () => { bPlay.disabled = bDel.disabled = !selectedWorld; };
    s.onShow = async () => {
      const kind = VX.store.kind;
      note.textContent = kind === 'idb' ? '' : kind === 'local' ? 'IndexedDB недоступна: миры хранятся в localStorage, места там мало.' : 'Хранилище браузера недоступно: миры не сохранятся после закрытия вкладки.';
      list.innerHTML = '<div class="empty">Загрузка…</div>';
      worldsCache = await VX.store.listWorlds();
      if (selectedWorld && !worldsCache.some((w) => w.id === selectedWorld)) selectedWorld = null;
      list.innerHTML = '';
      if (!worldsCache.length) list.innerHTML = '<div class="empty">Миров пока нет. Создайте первый!</div>';
      for (const w of worldsCache) {
        const it = el('div', 'world' + (w.id === selectedWorld ? ' sel' : ''));
        it.dataset.id = w.id;
        const icon = el('img', 'wicon'); icon.src = G.icon(w.mode === 'creative' ? B.grass : B.crafting_table); icon.alt = '';
        const txt = el('div', 'wtxt', `<b>${esc(w.name)}</b><span>${w.mode === 'creative' ? 'Творческий' : 'Выживание'} · зерно ${esc(w.seed)}${w.won ? ' · пройден' : ''}</span><span>${fmtDate(w.lastPlayed || w.created)} · ${fmtSize(w.size || 0)}</span>`);
        it.append(icon, txt);
        it.addEventListener('click', () => { selectedWorld = w.id; for (const n of list.children) n.classList.toggle('sel', n.dataset.id === w.id); refreshButtons(); VX.audio.play('click'); });
        it.addEventListener('dblclick', () => playWorld(w.id));
        list.appendChild(it);
      }
      refreshButtons();
    };
  }
  async function playWorld(id) { await G.openWorld(id); }
  UI.playWorld = playWorld;

  function buildCreate() {
    const s = screen('create', 'list-screen');
    s.append(el('h2', '', 'Создание мира'));
    const form = el('div', 'form');
    const nameL = el('label', '', 'Название мира'); const name = el('input', 'mc-input'); name.maxLength = 32; name.id = 'worldName';
    const seedL = el('label', '', 'Зерно для генерации мира'); const seed = el('input', 'mc-input'); seed.maxLength = 32; seed.id = 'worldSeed'; seed.placeholder = 'Пусто - случайное';
    let mode = 'survival';
    const modeDesc = el('div', 'hint');
    const modeB = button('', () => { mode = mode === 'survival' ? 'creative' : 'survival'; upd(); });
    modeB.id = 'modeBtn';
    const upd = () => {
      setText(modeB, 'Режим игры: ' + (mode === 'creative' ? 'Творческий' : 'Выживание'));
      modeDesc.textContent = mode === 'creative' ? 'Все блоки без ограничений, полёт двойным пробелом, мгновенное разрушение, без урона и голода.' : 'Добывайте ресурсы, мастерите инструменты, следите за здоровьем и голодом. Ночью выходят зомби.';
    };
    upd();
    form.append(nameL, name, seedL, seed, modeB, modeDesc);
    const row = el('div', 'row');
    const create = async () => {
      const meta = await G.createWorld({ name: name.value, seed: seed.value, mode });
      selectedWorld = meta.id;
      await G.openWorld(meta.id);
    };
    row.append(button('Создать мир', create), button('Отмена', () => UI.show('worlds')));
    s.append(form, row);
    s.onShow = () => { name.value = 'Новый мир'; seed.value = ''; mode = 'survival'; upd(); setTimeout(() => name.select(), 0); };
    s.submit = create;
  }
  let deleteId = null;
  UI.confirmDelete = function (id) { deleteId = id; UI.show('confirm'); };
  function buildConfirm() {
    const s = screen('confirm', 'list-screen');
    const q = el('h2', ''), t = el('div', 'hint', 'Мир будет удалён навсегда, вернуть его не получится.');
    const row = el('div', 'row');
    row.append(button('Удалить', async () => { await VX.store.deleteWorld(deleteId); if (selectedWorld === deleteId) selectedWorld = null; UI.show('worlds'); }, 'danger'), button('Отмена', () => UI.show('worlds')));
    s.append(q, t, row);
    s.onShow = () => { const w = worldsCache.find((x) => x.id === deleteId); q.textContent = 'Удалить мир «' + (w ? w.name : '') + '»?'; };
  }
  function buildLoading() {
    const s = screen('loading', 'list-screen loading');
    const t = el('h2', '', 'Загрузка мира');
    const sub = el('div', 'hint', 'Строим рельеф…');
    const bar = el('div', 'progress'); const fill = el('div', 'fill'); bar.append(fill);
    s.append(t, sub, bar);
    UI.loadingFill = fill; UI.loadingSub = sub;
  }
  UI.loaded = function () { G.play(); };

  function buildPause() {
    const s = screen('pause', 'list-screen');
    s.append(el('h2', '', 'Меню игры'));
    const col = el('div', 'col');
    col.append(
      button('Вернуться к игре', () => G.play()),
      button('Достижения', () => UI.show('ach')),
      button('Настройки', () => UI.show('settings')),
      button('Сохранить и выйти в меню', () => G.exitToTitle()),
    );
    s.append(col);
  }
  function buildSettings() {
    const s = screen('settings', 'list-screen');
    s.append(el('h2', '', 'Настройки'));
    const grid = el('div', 'grid2');
    const S = () => G.settings;
    const items = [
      slider('Дальность прорисовки', 2, 12, 1, () => S().renderDistance, (v) => { S().renderDistance = v; }, (v) => v + ' кусков'),
      slider('Поле зрения', 30, 110, 1, () => S().fov, (v) => { S().fov = v; }, (v) => v === 70 ? 'обычное' : v === 110 ? 'Quake Pro' : String(v)),
      slider('Чувствительность мыши', 10, 200, 5, () => S().sensitivity, (v) => { S().sensitivity = v; }, (v) => v + '%'),
      toggle(() => 'Инверсия мыши: ' + (S().invertY ? 'Вкл' : 'Выкл'), () => { S().invertY = !S().invertY; }),
      slider('Громкость звуков', 0, 100, 5, () => S().volume, (v) => { S().volume = v; VX.audio.setVolume(v / 100); }, (v) => v ? v + '%' : 'Выкл'),
      toggle(() => 'Графика: ' + (S().graphics === 'fancy' ? 'Красивая' : 'Быстрая'), () => { S().graphics = S().graphics === 'fancy' ? 'fast' : 'fancy'; }),
      toggle(() => 'Облака: ' + ['Выкл', 'Быстрые', 'Красивые'][S().clouds], () => { S().clouds = (S().clouds + 2) % 3; }),
      toggle(() => 'Мягкое освещение: ' + (S().smooth ? 'Вкл' : 'Выкл'), () => { S().smooth = !S().smooth; }),
      toggle(() => 'Покачивание камеры: ' + (S().bobbing ? 'Вкл' : 'Выкл'), () => { S().bobbing = !S().bobbing; }),
      toggle(() => 'Кадры/с на экране: ' + (S().showFps ? 'Вкл' : 'Выкл'), () => { S().showFps = !S().showFps; }),
    ];
    items.forEach((w, i) => { w.dataset.k = ['renderDistance', 'fov', 'sensitivity', 'invertY', 'volume', 'graphics', 'clouds', 'smooth', 'bobbing', 'showFps'][i]; grid.append(w); });
    grid.append(button('Управление…', () => UI.show('controls')));
    const hint = el('div', 'hint', 'Графика «Красивая»: прозрачная листва. «Быстрая»: листва сплошная, работает быстрее. Мягкое освещение - тени в углах и плавный свет. F3 - отладка.');
    s.append(grid, hint, el('div', 'row', ''));
    s.lastChild.append(button('Готово', () => { G.saveSettings(); UI.back(); }));
    s.onShow = () => items.forEach((w) => w.refresh());
  }
  const ACTIONS = [['forward', 'Вперёд'], ['back', 'Назад'], ['left', 'Влево'], ['right', 'Вправо'], ['jump', 'Прыжок'], ['sneak', 'Красться'], ['sprint', 'Бег'], ['inventory', 'Инвентарь'], ['drop', 'Выбросить предмет']];
  let waiting = null;
  function keyName(code) {
    const m = { Space: 'Пробел', ShiftLeft: 'Левый Shift', ShiftRight: 'Правый Shift', ControlLeft: 'Левый Ctrl', ControlRight: 'Правый Ctrl', AltLeft: 'Левый Alt', Tab: 'Tab', CapsLock: 'Caps Lock', Enter: 'Enter' };
    if (m[code]) return m[code];
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    return code;
  }
  function buildControls() {
    const s = screen('controls', 'list-screen');
    s.append(el('h2', '', 'Управление'));
    const list = el('div', 'keys');
    const btns = {};
    for (const [a, name] of ACTIONS) {
      const row = el('div', 'krow');
      const b = button('', () => { waiting = a; render(); });
      b.dataset.action = a;
      btns[a] = b;
      row.append(el('span', '', name), b);
      list.append(row);
    }
    const render = () => {
      const k = G.settings.keys;
      const used = {};
      for (const [a] of ACTIONS) used[k[a]] = (used[k[a]] || 0) + 1;
      for (const [a] of ACTIONS) { setText(btns[a], waiting === a ? '> ? <' : keyName(k[a])); btns[a].classList.toggle('conflict', used[k[a]] > 1); }
    };
    s.render = render;
    const hint = el('div', 'hint', 'ЛКМ - ломать, ПКМ - ставить, СКМ - взять блок, колесо и 1-9 - выбор, F3 - отладка, Esc - пауза. Ctrl+W в браузере закрывает вкладку: бежать можно и двойным нажатием «вперёд».');
    const row = el('div', 'row');
    row.append(button('Сбросить всё', () => { G.settings.keys = Object.assign({}, { forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space', sneak: 'ShiftLeft', sprint: 'ControlLeft', inventory: 'KeyE', drop: 'KeyQ' }); G.saveSettings(); render(); }), button('Готово', () => { waiting = null; UI.back(); }));
    s.append(list, hint, row);
    s.onShow = () => { waiting = null; render(); };
  }
  function buildDeath() {
    const s = screen('death', 'list-screen death');
    const t = el('h2', '', 'Вы погибли!'), cause = el('div', 'hint');
    const row = el('div', 'col');
    row.append(button('Возродиться', () => G.respawn()), button('В главное меню', () => { G.respawn(); G.exitToTitle(); }));
    s.append(t, cause, row);
    const CAUSES = { fall: 'Разбился, упав с высоты', drown: 'Утонул', starve: 'Умер от голода', zombie: 'Убит зомби', void: 'Выпал из мира', burn: 'Сгорел' };
    s.onShow = () => { const d = G.player.lastDamage; cause.textContent = CAUSES[d && d.cause] || 'Погиб'; };
  }

  // ---------- Достижения ----------
  function buildAch() {
    const s = screen('ach', 'list-screen');
    const title = el('h2', '', 'Достижения');
    const count = el('div', 'hint');
    const box = el('div', 'ach-box');
    const tree = el('div', 'ach-tree');
    box.append(tree);
    const row = el('div', 'row'); row.append(button('Готово', () => UI.back()));
    s.append(title, count, box, row);
    s.onShow = () => {
      const got = (G.meta && G.meta.ach && G.meta.ach.got) || {};
      tree.innerHTML = '';
      // раскладка дерева: глубина - столбец, порядок обхода - строка
      const kids = {};
      for (const a of D.ACH) (kids[a.parent || '_'] = kids[a.parent || '_'] || []).push(a);
      const pos = {};
      let row2 = 0;
      const walk = (a, depth) => {
        const ch = kids[a.id] || [];
        if (!ch.length) { pos[a.id] = [depth, row2++]; return; }
        const start = row2;
        ch.forEach((c) => walk(c, depth + 1));
        pos[a.id] = [depth, (start + row2 - 1) / 2];
      };
      (kids._ || []).forEach((r) => walk(r, 0));
      const CW = 66, RH = 42;
      let maxX = 0, maxY = 0;
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      for (const a of D.ACH) {
        const [x, y] = pos[a.id]; maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
        if (a.parent) {
          const [px, py] = pos[a.parent];
          const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          const x1 = px * CW + 40, y1 = py * RH + 20, x2 = x * CW + 4, y2 = y * RH + 20, mx = (x1 + x2) / 2;
          p.setAttribute('d', `M${x1} ${y1} H${mx} V${y2} H${x2}`);
          p.setAttribute('class', got[a.id] ? 'on' : '');
          svg.appendChild(p);
        }
      }
      svg.setAttribute('width', maxX * CW + 48); svg.setAttribute('height', maxY * RH + 46);
      tree.style.width = (maxX * CW + 48) + 'px'; tree.style.height = (maxY * RH + 46) + 'px';
      tree.append(svg);
      for (const a of D.ACH) {
        const [x, y] = pos[a.id];
        const n = el('div', 'ach' + (got[a.id] ? ' got' : '') + (a.final ? ' final' : ''));
        n.style.left = (x * CW + 4) + 'px'; n.style.top = (y * RH + 2) + 'px';
        n.dataset.id = a.id;
        const img = el('img'); img.src = G.icon(a.icon); img.alt = '';
        n.append(img);
        n.addEventListener('mouseenter', (e) => showTip(e, `<b class="${got[a.id] ? 'gold' : ''}">${esc(a.name)}</b><br>${esc(a.desc)}${got[a.id] ? '<br><i>Получено</i>' : ''}`));
        n.addEventListener('mousemove', moveTip);
        n.addEventListener('mouseleave', hideTip);
        tree.append(n);
      }
      count.textContent = `Получено: ${Object.keys(got).filter((k) => D.ACH.some((a) => a.id === k)).length} из ${D.ACH.length}`;
    };
  }
  function buildVictory() {
    const s = screen('victory', 'list-screen victory');
    const t = el('h2', 'gold', 'Победа!');
    const credits = el('div', 'credits');
    const row = el('div', 'row');
    row.append(button('Продолжить игру', () => G.play()), button('В главное меню', () => G.exitToTitle()));
    s.append(t, credits, row);
    s.onShow = () => {
      const st = (G.meta && G.meta.stats) || {};
      const mins = Math.round((st.played || 0) / 60);
      credits.innerHTML = `<div class="roll">
        <p class="big">Вы собрали Сердце мира.</p>
        <p>Мир «${esc(G.meta ? G.meta.name : '')}» пройден. Можно играть дальше: мир ваш.</p>
        <p>Сломано блоков: ${st.broken || 0} · поставлено: ${st.placed || 0} · побеждено зомби: ${(G.meta && G.meta.ach && G.meta.ach.progress['kill:zombie']) || 0} · гибелей: ${st.deaths || 0} · в игре: ${mins} мин</p>
        <p class="gold">Кубический мир</p>
        <p>Фан-песочница в духе Minecraft, не связана с Mojang/Microsoft.</p>
        <p>Мир, блоки, текстуры, звуки, мобы и шрифт названия сделаны кодом в самой игре.</p>
        <p>Отрисовка - библиотека three.js (лицензия MIT).</p>
        <p class="gold">Спасибо, что играли!</p></div>`;
    };
  }

  // ---------- Подсказка ----------
  let tip;
  function showTip(e, html) { tip.innerHTML = html; tip.style.display = 'block'; moveTip(e); }
  function moveTip(e) { tip.style.left = Math.min(innerWidth - tip.offsetWidth - 4, e.clientX + 14) + 'px'; tip.style.top = Math.max(4, e.clientY - 30) + 'px'; }
  function hideTip() { if (tip) tip.style.display = 'none'; }

  // ---------- Окна с ячейками ----------
  let invScreen, invPanel, cursorEl, drag = null;
  let ctab = 'build', cquery = '', cscroll = 0;
  function slotEl(i, s, extra) {
    const d = el('div', 'slot' + (extra ? ' ' + extra : ''));
    d.dataset.i = i;
    fillSlot(d, s);
    return d;
  }
  function fillSlot(d, s) {
    d.innerHTML = '';
    if (!s) return;
    const img = el('img'); img.src = G.icon(s.id); img.alt = ''; img.draggable = false;
    d.append(img);
    if (s.count > 1) d.append(el('span', 'cnt', String(s.count)));
    const t = D.toolOf(s.id);
    if (t && s.dmg) {
      const f = 1 - s.dmg / t.dur;
      const bar = el('div', 'dur'); const fill = el('div'); fill.style.width = (f * 100) + '%'; fill.style.background = `hsl(${f * 120},90%,45%)`; bar.append(fill); d.append(bar);
    }
  }
  function nameOf(s) {
    const i = D.info(s.id);
    const t = D.toolOf(s.id);
    return esc(i.name) + (t ? `<br><small>Прочность: ${t.dur - (s.dmg || 0)} / ${t.dur}</small>` : '') + (i.food ? `<br><small>Еда: +${i.food.h}</small>` : '');
  }
  function renderInv() {
    const v = G.container;
    if (!v) return;
    invPanel.innerHTML = '';
    const creative = G.mode === 'creative' && v.kind === 'inv';
    invPanel.className = 'inv-panel ' + (creative ? 'creative' : v.kind);
    const grid = (ids, cols, cls) => { const g = el('div', 'sgrid ' + (cls || '')); g.style.gridTemplateColumns = `repeat(${cols}, var(--slot))`; for (const i of ids) g.append(slotEl(i, v.get(i))); return g; };
    const mainGrid = () => { const w = el('div', 'invmain'); const m = []; for (let i = 9; i < 36; i++) m.push(i); w.append(grid(m, 9), el('div', 'gap'), grid([0, 1, 2, 3, 4, 5, 6, 7, 8], 9, 'hot')); return w; };
    if (creative && ctab !== 'inv') {
      const tabs = el('div', 'tabs');
      for (const t of D.TABS) {
        const b = el('div', 'tab' + (t.key === ctab ? ' on' : ''));
        b.dataset.tab = t.key;
        if (t.icon) { const img = el('img'); img.src = G.icon(t.icon); img.alt = ''; b.append(img); } else b.append(el('span', 'mag', '&#x1F50D;&#xFE0E;'));
        b.addEventListener('mouseenter', (e) => showTip(e, esc(t.name)));
        b.addEventListener('mouseleave', hideTip);
        b.addEventListener('click', () => { ctab = t.key; cscroll = 0; VX.audio.play('click'); renderInv(); });
        tabs.append(b);
      }
      invPanel.append(tabs, el('div', 'ptitle', esc(D.TABS.find((t) => t.key === ctab).name)));
      if (ctab === 'search') {
        const q = el('input', 'mc-input search'); q.placeholder = 'Поиск…'; q.value = cquery; q.id = 'creativeSearch';
        q.addEventListener('input', () => { cquery = q.value; cscroll = 0; renderPalette(); });
        invPanel.append(q);
        setTimeout(() => q.focus(), 0);
      }
      const pal = el('div', 'palette');
      pal.addEventListener('wheel', (e) => { e.preventDefault(); cscroll = Math.max(0, cscroll + (e.deltaY > 0 ? 1 : -1)); renderPalette(); }, { passive: false });
      invPanel.append(pal);
      const bottom = el('div', 'crow');
      bottom.append(grid([0, 1, 2, 3, 4, 5, 6, 7, 8], 9, 'hot'));
      const trash = el('div', 'slot trash'); trash.dataset.i = 'trash'; trash.title = 'Удалить предмет';
      bottom.append(trash);
      invPanel.append(bottom);
      renderPalette();
    } else {
      if (creative) {
        const tabs = el('div', 'tabs');
        for (const t of D.TABS) { const b = el('div', 'tab' + (t.key === ctab ? ' on' : '')); b.dataset.tab = t.key; if (t.icon) { const img = el('img'); img.src = G.icon(t.icon); img.alt = ''; b.append(img); } else b.append(el('span', 'mag', '&#x1F50D;&#xFE0E;')); b.addEventListener('click', () => { ctab = t.key; renderInv(); }); tabs.append(b); }
        invPanel.append(tabs);
      }
      if (v.kind === 'furnace') {
        invPanel.append(el('div', 'ptitle', 'Печь'));
        const f = v.f;
        const top = el('div', 'furn');
        const flame = el('div', 'flame'); const ff = el('div'); ff.style.height = (f.burnMax ? f.burn / f.burnMax * 100 : 0) + '%'; flame.append(ff);
        const arrow = el('div', 'arrow prog'); const af = el('div'); af.style.width = (f.cook / D.SMELT_TIME * 100) + '%'; arrow.append(af);
        const left = el('div', 'fcol'); left.append(slotEl(300, v.get(300)), flame, slotEl(301, v.get(301)));
        top.append(left, arrow, slotEl(302, v.get(302), 'big'));
        invPanel.append(top, el('div', 'ptitle', 'Инвентарь'), mainGrid());
      } else {
        const n = v.size;
        invPanel.append(el('div', 'ptitle', n === 3 ? 'Верстак' : 'Создание'));
        const top = el('div', 'craft');
        const ids = []; for (let k = 0; k < n * n; k++) ids.push(100 + k);
        const g = grid(ids, n);
        top.append(g, el('div', 'arrow'), slotEl(200, v.get(200), 'big'));
        invPanel.append(top, el('div', 'ptitle', 'Инвентарь'), mainGrid());
      }
    }
    renderCursor();
  }
  UI.renderInv = renderInv;
  function paletteItems() { return D.tabItems(ctab, cquery); }
  function renderPalette() {
    const pal = $('.palette', invPanel);
    if (!pal) return;
    const items = paletteItems();
    const rows = Math.max(0, Math.ceil(items.length / 9) - 5);
    cscroll = Math.min(cscroll, rows);
    pal.innerHTML = '';
    const g = el('div', 'sgrid'); g.style.gridTemplateColumns = 'repeat(9, var(--slot))';
    for (let k = 0; k < 45; k++) {
      const id = items[cscroll * 9 + k];
      const d = slotEl('p' + (id || ''), id ? { id, count: 1 } : null, 'pal');
      if (id) d.dataset.id = id;
      g.append(d);
    }
    pal.append(g);
    const sb = el('div', 'scrollbar'); const knob = el('div', 'knob');
    knob.style.top = (rows ? cscroll / rows * 100 : 0) + '%';
    sb.append(knob); pal.append(sb);
    if (!items.length) pal.append(el('div', 'empty', 'Ничего не найдено'));
  }
  function renderCursor() {
    const c = G.inv.cursor;
    fillSlot(cursorEl, c);
    cursorEl.style.display = c && G.state === 'inv' ? 'block' : 'none';
  }
  function refreshSlots() {
    if (!G.container) return;
    for (const d of invPanel.querySelectorAll('.slot')) {
      const i = d.dataset.i;
      if (i === 'trash' || String(i).startsWith('p')) continue;
      fillSlot(d, G.container.get(+i));
    }
    const f = G.container.f;
    if (f) {
      const ff = $('.flame > div', invPanel); if (ff) ff.style.height = (f.burnMax ? f.burn / f.burnMax * 100 : 0) + '%';
      const af = $('.arrow.prog > div', invPanel); if (af) af.style.width = (f.cook / D.SMELT_TIME * 100) + '%';
    }
    renderCursor();
  }
  UI.refreshSlots = refreshSlots;
  // Щелчок по ячейке палитры творческого режима
  function paletteClick(id, button, shift) {
    const inv = G.inv;
    if (inv.cursor) { inv.cursor = null; return; }         // с предметом в руке - удалить его
    if (!id) return;
    const max = D.maxStack(id);
    if (shift) { inv.add(id, max); return; }
    inv.cursor = VX.inv.newStack(id, button === 2 ? 1 : max);
  }
  UI.paletteClick = paletteClick;
  function slotAt(e) { const d = e.target.closest && e.target.closest('.slot'); return d && invPanel.contains(d) ? d : null; }
  function onSlotDown(e) {
    const d = slotAt(e);
    if (!d) return;
    e.preventDefault();
    const btn = e.button;
    const i = d.dataset.i;
    const inv = G.inv;
    if (i === 'trash') { if (e.shiftKey) inv.clear(); inv.cursor = null; refreshSlots(); return; }
    if (String(i).startsWith('p')) { paletteClick(+d.dataset.id || 0, btn, e.shiftKey); VX.audio.play('click'); refreshSlots(); return; }
    const idx = +i;
    if (e.shiftKey) { VX.inv.click(inv, G.container, idx, btn, true); refreshSlots(); return; }
    if (inv.cursor && !(G.container.isOutput && G.container.isOutput(idx))) { drag = { btn, cells: [idx] }; d.classList.add('dragging'); return; }
    VX.inv.click(inv, G.container, idx, btn, false);
    refreshSlots();
  }
  function onSlotEnter(e) {
    const d = slotAt(e);
    if (!d) return;
    const i = d.dataset.i;
    if (drag && i !== 'trash' && !String(i).startsWith('p') && !drag.cells.includes(+i)) { drag.cells.push(+i); d.classList.add('dragging'); }
    const s = String(i).startsWith('p') ? (d.dataset.id ? { id: +d.dataset.id, count: 1 } : null) : i === 'trash' ? null : G.container && G.container.get(+i);
    if (s && !G.inv.cursor) showTip(e, nameOf(s)); else if (i === 'trash') showTip(e, 'Удалить предмет<br><small>Shift+щелчок - очистить весь инвентарь</small>'); else hideTip();
  }
  function onUp() {
    if (!drag) return;
    const d = drag; drag = null;
    for (const n of invPanel.querySelectorAll('.dragging')) n.classList.remove('dragging');
    if (d.cells.length > 1) VX.inv.drag(G.inv, G.container, d.cells, d.btn);
    else VX.inv.click(G.inv, G.container, d.cells[0], d.btn, false);
    refreshSlots();
  }
  function buildInv() {
    invScreen = screen('inv', 'inv-screen');
    invPanel = el('div', 'inv-panel');
    invScreen.append(invPanel);
    cursorEl = el('div', 'slot cursor');
    document.body.append(cursorEl);
    invPanel.addEventListener('mousedown', onSlotDown);
    invPanel.addEventListener('mouseover', onSlotEnter);
    invPanel.addEventListener('mouseleave', hideTip);
    invPanel.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mouseup', onUp);
    window.addEventListener('mousemove', (e) => { const z = UI.scale || 1; cursorEl.style.left = (e.clientX / z - 18) + 'px'; cursorEl.style.top = (e.clientY / z - 18) + 'px'; });
    // щелчок мимо окна с предметом - выбросить его
    invScreen.addEventListener('mousedown', (e) => {
      if (e.target !== invScreen || !G.inv.cursor) return;
      const c = G.inv.cursor;
      if (e.button === 2) { G.dropItem(VX.inv.newStack(c.id, 1, c.dmg), true); c.count--; if (!c.count) G.inv.cursor = null; }
      else { G.dropItem(c, true); G.inv.cursor = null; }
      renderCursor();
    });
    invScreen.addEventListener('contextmenu', (e) => e.preventDefault());
    invScreen.onShow = () => renderInv();
  }

  // ---------- HUD ----------
  const icons = {};
  function pixIcon(rows, pal) {
    const c = document.createElement('canvas'); c.width = 9; c.height = 9;
    const g = c.getContext('2d');
    rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (pal[r[x]]) { g.fillStyle = pal[r[x]]; g.fillRect(x, y, 1, 1); } });
    return c.toDataURL();
  }
  function makeHudIcons() {
    const heart = ['.kk...kk.', 'kRRk.kRRk', 'kRWRkRRRk', 'kRRRRRRRk', '.kRRRRRk.', '..kRRRk..', '...kRk...', '....k....', '.........'];
    const half = heart.map((r) => r.split('').map((ch, x) => (x > 4 && ch !== 'k' && ch !== '.' ? 'E' : ch)).join(''));
    const empty = heart.map((r) => r.replace(/[RW]/g, 'E'));
    icons.heart = pixIcon(heart, { k: '#1a0000', R: '#e0102a', W: '#ffc0c8' });
    icons.half = pixIcon(half, { k: '#1a0000', R: '#e0102a', W: '#ffc0c8', E: '#3a0a0a' });
    icons.hempty = pixIcon(empty, { k: '#1a0000', E: '#3a0a0a' });
    const food = ['.....kk..', '....kBBk.', '...kBBBk.', '..kBBBBk.', '.kBBBBk..', 'kWkBBk...', 'kWWkk....', '.kWk.....', '..k......'];
    const fhalf = food.map((r) => r.split('').map((ch, x) => (x > 3 && ch === 'B' ? 'E' : ch)).join(''));
    icons.food = pixIcon(food, { k: '#2a1400', B: '#b86a28', W: '#f0e8d8' });
    icons.fhalf = pixIcon(fhalf, { k: '#2a1400', B: '#b86a28', W: '#f0e8d8', E: '#3a2410' });
    icons.fempty = pixIcon(food.map((r) => r.replace(/[BW]/g, 'E')), { k: '#2a1400', E: '#3a2410' });
    icons.bubble = pixIcon(['..kkkk...', '.kWBBBk..', 'kWBBBBBk.', 'kBBBBBBk.', 'kBBBBBBk.', 'kBBBBBBk.', '.kBBBBk..', '..kkkk...', '.........'], { k: '#10204a', B: '#3a8ae8', W: '#e0f0ff' });
  }
  let hotSig = '', barSig = '';
  function buildHud() {
    hud = el('div', 'hud');
    hud.id = 'hud';
    hud.innerHTML = `<div id="crosshair"></div><div id="debug"></div><div id="fpsMini"></div><div id="clickHint">Щёлкните, чтобы продолжить</div>
      <div id="hurt"></div><div id="waterTint"></div><div id="bars"><div id="hearts"></div><div id="foodbar"></div><div id="airbar"></div></div>
      <div id="itemName"></div><div id="hotbar"></div><div id="toasts"></div>`;
    root.appendChild(hud);
    const hb = $('#hotbar', hud);
    for (let i = 0; i < 9; i++) { const s = el('div', 'hslot'); s.dataset.i = i; hb.append(s); }
  }
  function renderHud(dt) {
    const inv = G.inv, p = G.player;
    const sig = inv.selected + '|' + inv.slots.slice(0, 9).map((s) => (s ? s.id + ':' + s.count + ':' + (s.dmg || 0) : '-')).join(',');
    if (sig !== hotSig) {
      hotSig = sig;
      const cells = $('#hotbar', hud).children;
      for (let i = 0; i < 9; i++) { fillSlot(cells[i], inv.slots[i]); cells[i].classList.toggle('sel', i === inv.selected); }
    }
    const surv = G.mode === 'survival';
    const bs = surv + '|' + p.health + '|' + p.food + '|' + Math.ceil(p.air) + '|' + p.headInWater;
    if (bs !== barSig) {
      barSig = bs;
      $('#bars', hud).style.display = surv ? '' : 'none';
      let h = '';
      for (let k = 0; k < 10; k++) { const v = p.health - k * 2; h += `<img src="${v >= 2 ? icons.heart : v === 1 ? icons.half : icons.hempty}" alt="">`; }
      $('#hearts', hud).innerHTML = h;
      let f = '';
      for (let k = 9; k >= 0; k--) { const v = p.food - k * 2; f += `<img src="${v >= 2 ? icons.food : v === 1 ? icons.fhalf : icons.fempty}" alt="">`; }
      $('#foodbar', hud).innerHTML = f;
      let a = '';
      if (p.headInWater || p.air < 15) { const n = Math.ceil(p.air / 1.5); for (let k = 9; k >= 0; k--) a += k < n ? `<img src="${icons.bubble}" alt="">` : '<i></i>'; }
      $('#airbar', hud).innerHTML = a;
      $('#hearts', hud).classList.toggle('low', p.health <= 4);
    }
    const nm = $('#itemName', hud);
    const held = inv.held();
    nm.textContent = held ? D.info(held.id).name : '';
    nm.style.opacity = Math.min(1, G.itemNameT || 0);
    $('#hurt', hud).style.opacity = Math.min(0.5, p.hurtFlash * 1.6);
    $('#waterTint', hud).style.display = G.underwater ? 'block' : 'none';
    $('#clickHint', hud).style.display = G.state === 'play' && G.needClick && !G.testMode ? 'block' : 'none';
    const fm = $('#fpsMini', hud);
    fm.style.display = G.settings.showFps && !G.debug ? 'block' : 'none';
    if (G.settings.showFps) fm.textContent = (G.fps || 0) + ' к/с';
    const dbg = $('#debug', hud);
    dbg.style.display = G.debug ? 'block' : 'none';
    UI.dbgT = (UI.dbgT || 0) - dt;
    if (G.debug && UI.dbgT <= 0) { UI.dbgT = 0.25; dbg.innerHTML = debugText(); }
  }
  const DIRS = ['север (-Z)', 'запад (-X)', 'юг (+Z)', 'восток (+X)'];
  function debugText() {
    const p = G.player, w = G.world;
    const x = Math.floor(p.pos.x), y = Math.floor(p.pos.y), z = Math.floor(p.pos.z);
    const cx = Math.floor(x / 16), cz = Math.floor(z / 16);
    const col = C.column(C.worldOf(G.meta.seedNum), x, z);
    const n = w.counts();
    const q = ((Math.round(p.yaw / (Math.PI / 2)) % 4) + 4) % 4;
    const t = G.lastTarget;
    const day = Math.floor(G.ticks / VX.DAY_TICKS) + 1, tt = Math.floor(G.ticks % VX.DAY_TICKS);
    const ps = UI.perfStats ? UI.perfStats() : null;
    return [
      `<b>Кубический мир 2.0</b> (${G.fps || 0} к/с${ps ? `, кадр ${ps.avg.toFixed(1)} мс, 1% худших ${ps.p99.toFixed(1)} мс` : ''})`,
      `Куски: ${n.loaded} загружено, ${n.meshed} с сеткой, ${Math.round(n.quads / 1000)} тыс. граней, ${n.draws} отрисовок, заданий ${n.jobs}`,
      `Потоки: ${w.syncMode ? 'нет (всё на странице)' : w.pool.length}, хранилище: ${VX.store.kind}`,
      '',
      `XYZ: ${p.pos.x.toFixed(3)} / ${p.pos.y.toFixed(3)} / ${p.pos.z.toFixed(3)}`,
      `Блок: ${x} ${y} ${z}`,
      `Кусок: ${x & 15} ${y} ${z & 15} в ${cx} ${cz}`,
      `Взгляд: ${DIRS[q]} (${(p.yaw * 180 / Math.PI).toFixed(1)} / ${(p.pitch * 180 / Math.PI).toFixed(1)})`,
      `Биом: ${C.BIOMES[col.biome]}, поверхность ${col.h}`,
      `Сутки: ${tt} (день ${day}), ${G.mode === 'creative' ? 'творческий' : 'выживание'}`,
      t ? `Цель: ${t.x} ${t.y} ${t.z} ${esc(C.BLOCKS[t.id].name)}` : 'Цель: нет',
      `Зерно: ${esc(G.meta.seed)}`,
    ].join('<br>');
  }
  UI.perfStats = function () {
    const f = G.perf.frames.slice(-300).filter((v) => v > 0 && v < 1000);
    if (f.length < 10) return null;
    const avg = f.reduce((a, b) => a + b, 0) / f.length;
    const sorted = f.slice().sort((a, b) => b - a);
    const p99 = sorted[Math.max(0, Math.floor(f.length / 100) - 1)] || sorted[0];
    return { avg, p99 };
  };

  // Тосты достижений
  UI.toast = function (a) {
    const t = el('div', 'toast');
    const img = el('img'); img.src = G.icon(a.icon); img.alt = '';
    t.append(img, el('div', '', `<b>${a.final ? 'Цель достигнута!' : 'Достижение получено!'}</b><span>${esc(a.name)}</span>`));
    $('#toasts', hud).append(t);
    setTimeout(() => t.classList.add('out'), 4200);
    setTimeout(() => t.remove(), 5000);
  };

  // ---------- Клавиши в меню ----------
  UI.onKey = function (e) {
    if (waiting && UI.current === 'controls') {
      e.preventDefault();
      if (e.code !== 'Escape') G.settings.keys[waiting] = e.code;
      waiting = null;
      G.saveSettings();
      screens.controls.render();
      return true;
    }
    if (UI.current === 'start') { UI.show('title'); return true; }
    const active = document.activeElement;
    if (active && active.tagName === 'INPUT' && active.type !== 'range') {
      if (e.code === 'Escape') { active.blur(); if (UI.current === 'inv') return false; }
      else { if (e.code === 'Enter' && UI.current === 'create') screens.create.submit(); return true; }
    }
    if (e.code === 'Escape') {
      if (['worlds'].includes(UI.current)) { UI.show('title'); return true; }
      if (['create', 'confirm'].includes(UI.current)) { UI.show('worlds'); return true; }
      if (['settings', 'controls', 'ach'].includes(UI.current)) { UI.back(); return true; }
    }
    if (e.code === 'Enter' && UI.current === 'create') { screens.create.submit(); return true; }
    return false;
  };

  UI.frame = function (dt) {
    if (G.meta && !G.panorama) renderHud(dt);
    if (UI.current === 'inv' && G.container) {
      UI.slotT = (UI.slotT || 0) - dt;
      if (G.container.f && UI.slotT <= 0) { UI.slotT = 0.2; refreshSlots(); }
    }
    if (UI.current === 'loading') {
      const p = G.player, w = G.world;
      const pcx = Math.floor(p.pos.x / 16), pcz = Math.floor(p.pos.z / 16);
      let ready = 0, total = 0;
      for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) { total++; const ch = w.chunk(pcx + dx, pcz + dz); if (ch && ch.data && !ch.needMesh && !ch.pending) ready++; }
      UI.loadingFill.style.width = Math.round(ready / total * 100) + '%';
      UI.loadingSub.textContent = ready < total / 2 ? 'Строим рельеф…' : 'Сажаем деревья…';
    }
  };

  // Масштаб интерфейса как «размер интерфейса» в оригинале: в большом окне всё крупнее
  function rescale() {
    const z = Math.max(1, Math.min(2, Math.floor(Math.min(innerWidth / 1280, innerHeight / 760) * 10) / 10));
    UI.scale = z;
    root.style.zoom = z;
    cursorEl.style.zoom = z;
  }
  UI.init = function () {
    root = document.getElementById('ui');
    tip = el('div', 'tip'); document.body.append(tip);
    const btnN = VX.tex.buttonTexture('n'), btnH = VX.tex.buttonTexture('hover'), btnO = VX.tex.buttonTexture('off');
    document.documentElement.style.setProperty('--btn', `url(${btnN})`);
    document.documentElement.style.setProperty('--btn-hover', `url(${btnH})`);
    document.documentElement.style.setProperty('--btn-off', `url(${btnO})`);
    makeHudIcons();
    buildHud();
    buildStart(); buildTitle(); buildWorlds(); buildCreate(); buildConfirm(); buildLoading(); buildPause(); buildSettings(); buildControls(); buildDeath(); buildAch(); buildVictory(); buildInv();
    rescale();
    window.addEventListener('resize', rescale);
    screen('hud', 'hud-screen');
  };
})();
