// ================= Приложения =================
const APPS = {
  explorer: { title: 'Проводник', icon: ICON.explorer, w: 920, h: 560, minW: 460, minH: 320, multi: true, create: createExplorer },
  browser: { title: 'Браузер', icon: ICON.browser, w: 980, h: 620, minW: 440, minH: 320, create: createBrowser },
  notepad: { title: 'Блокнот', icon: ICON.notepad, w: 720, h: 500, minW: 360, minH: 240, multi: true, create: createNotepad },
  calc: { title: 'Калькулятор', icon: ICON.calc, w: 340, h: 540, minW: 300, minH: 460, create: createCalc },
  photos: { title: 'Фотографии', icon: ICON.photos, w: 900, h: 600, minW: 420, minH: 320, create: createPhotos },
  media: { title: 'Медиаплеер', icon: ICON.media, icon16: ICON.media16, w: 860, h: 560, minW: 520, minH: 360, create: createMedia },
  settings: { title: 'Параметры', icon: ICON.settings, w: 1000, h: 660, minW: 560, minH: 380, create: createSettings },
  terminal: { title: 'Терминал', icon: ICON.terminal, w: 760, h: 460, minW: 400, minH: 240, multi: true, create: createTerminal },
  clock: { title: 'Часы', icon: ICON.clock, w: 820, h: 560, minW: 480, minH: 380, create: createClock },
  weather: { title: 'Погода', icon: ICON.weather, w: 800, h: 520, minW: 420, minH: 360, create: createWeather },
  recycle: { title: 'Корзина', icon: ICON.recycle, w: 760, h: 460, minW: 420, minH: 260, create: createRecycle },
  paint: { title: 'Paint', icon: ICON.paint, w: 960, h: 640, minW: 480, minH: 360, iframe: 'apps/paint.html' },
  messenger: { title: 'Мессенджер', icon: ICON.messenger, w: 900, h: 600, minW: 480, minH: 360, iframe: 'apps/messenger.html' },
};
// Игры «Игротеки»: полные версии из соседних папок репозитория (таблица - web/_os-shared/games.js)
const GAMES = (window.OS_GAMES || []).map(g => 'game-' + g.id);
function gameIcon(g) {
  const id = 'gg-' + g.id;
  return G(id, '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + g.colors[0] + '"/><stop offset="1" stop-color="' + g.colors[1] + '"/></linearGradient></defs>' +
    '<rect x="5" y="5" width="38" height="38" rx="6" fill="url(#' + id + ')"/>' + ((window.OS_GAME_GLYPHS || {})[g.glyph] || ''));
}
(window.OS_GAMES || []).forEach(g => { APPS['game-' + g.id] = { title: g.title, icon: gameIcon(g), w: 1000, h: 640, minW: 480, minH: 360, iframe: '../' + g.dir + '/index.html', game: true }; });

// ---------------- Проводник ----------------
const NAV_ITEMS = () => [['', 'Этот компьютер', ICON.pc], ...ROOTS.map(r => [r, r, fileIcon(r)])];
let CLIP = null; // { mode: 'cut'|'copy', paths: [] }
function createExplorer(w, start) {
  let path = start !== undefined && (start === '' || FS.has(start)) ? start : 'Документы';
  const hist = [], fwd = [];
  let sel = new Set(), view = store.get('exView', 'grid'), sortBy = store.get('exSort', 'name'), q = '', showPrev = store.get('exPrev', false), renaming = null;
  w.arg = start;
  w.body.innerHTML = '<div class="cmdbar"><button class="tbtn" data-x="new">' + SI.plus + ' Создать ' + SI.chevDown + '</button><span class="vsep"></span>' +
    '<button class="tbtn" data-x="cut" title="Вырезать (Ctrl+X)" aria-label="Вырезать">' + SI.cut + '</button><button class="tbtn" data-x="copy" title="Копировать (Ctrl+C)" aria-label="Копировать">' + SI.copy + '</button>' +
    '<button class="tbtn" data-x="paste" title="Вставить (Ctrl+V)" aria-label="Вставить">' + SI.paste + '</button><button class="tbtn" data-x="rename" title="Переименовать (F2)" aria-label="Переименовать">' + SI.rename + '</button>' +
    '<button class="tbtn" data-x="del" title="Удалить (Del)" aria-label="Удалить">' + SI.trash + '</button><span class="vsep"></span>' +
    '<button class="tbtn ov" data-x="sort">' + SI.sort + ' Сортировка ' + SI.chevDown + '</button><button class="tbtn ov" data-x="view">' + SI.view + ' Вид ' + SI.chevDown + '</button><span class="vsep ov"></span>' +
    '<button class="tbtn ov" data-x="import" title="Добавить файлы с диска">' + SI.import + ' Импорт</button><button class="tbtn ov" data-x="prev" title="Область просмотра">' + SI.preview + '</button>' +
    '<button class="tbtn more" data-x="more" title="Другие команды" aria-label="Другие команды">•••</button></div>' +
    '<div class="addr"><button class="tbtn" data-x="back" title="Назад" aria-label="Назад">' + SI.back + '</button><button class="tbtn" data-x="fwd" title="Вперёд" aria-label="Вперёд">' + SI.fwd + '</button>' +
    '<button class="tbtn" data-x="up" title="Вверх" aria-label="Вверх">' + SI.up + '</button><button class="tbtn" data-x="refresh" title="Обновить" aria-label="Обновить">' + SI.refresh + '</button>' +
    '<div class="crumbs"></div><input class="field ex-search" placeholder="Поиск" aria-label="Поиск в папке"></div>' +
    '<div class="ex-wrap"><div class="navpane scroll"></div><div class="ex-main scroll" tabindex="0"></div><div class="preview-pane" hidden></div></div><div class="statusline"><span class="st-count"></span><span class="st-sel"></span></div>' +
    '<input type="file" multiple hidden class="ex-file">';
  const main = w.body.querySelector('.ex-main'), nav = w.body.querySelector('.navpane'), crumbs = w.body.querySelector('.crumbs'), prev = w.body.querySelector('.preview-pane'), finput = w.body.querySelector('.ex-file');
  w.path = () => path;
  w.onArg = p => go(p);
  function go(p, noHist) { if (p !== '' && !FS.has(p)) p = ''; if (!noHist && p !== path) { hist.push(path); fwd.length = 0; } path = p; sel.clear(); q = ''; w.body.querySelector('.ex-search').value = ''; render(); }
  function items() {
    let list = path === '' ? ROOTS.map(r => FS.get(r)).filter(Boolean) : childrenOf(path, sortBy);
    if (q) list = [...FS.values()].filter(e => e.path && (path === '' || e.path.startsWith(path + '/')) && baseName(e.path).toLowerCase().includes(q));
    return list;
  }
  function render() {
    if (path !== '' && !FS.has(path)) path = '';
    w.setTitle(path === '' ? 'Этот компьютер' : baseName(path));
    nav.innerHTML = NAV_ITEMS().map(([p, n, ic]) => '<button class="nav-item' + ((path === p || (p && path.startsWith(p + '/'))) ? ' active' : '') + '" data-go="' + esc(p) + '" data-drop="' + esc(p) + '">' + ic + '<span>' + esc(n) + '</span></button>').join('') +
      '<div class="nav-sep"></div><button class="nav-item" data-recycle="1" data-drop="__trash">' + (TRASH.length ? ICON.recycleFull : ICON.recycle) + '<span>Корзина</span></button>';
    const parts = path ? path.split('/') : [];
    crumbs.innerHTML = '<a data-go="">Этот компьютер</a>' + parts.map((p, i) => '<i>' + '›' + '</i><a data-go="' + esc(parts.slice(0, i + 1).join('/')) + '">' + esc(p) + '</a>').join('');
    const list = items();
    if (!list.length) main.innerHTML = '<div class="empty">' + (q ? 'Ничего не найдено' : 'Эта папка пуста.<br>Перетащите сюда файлы с диска или нажмите «Создать».') + '</div>';
    else if (view === 'details') main.innerHTML = '<table class="details"><tr><th>Имя</th><th>Дата изменения</th><th>Тип</th><th>Размер</th></tr>' + list.map(e =>
      '<tr class="row' + (sel.has(e.path) ? ' selected' : '') + '" data-p="' + esc(e.path) + '" draggable="true"><td><div class="nm">' + fileIcon(e.path) + (renaming === e.path ? '<input class="field" value="' + esc(baseName(e.path)) + '" data-ren>' : '<span>' + esc(baseName(e.path)) + '</span>') + '</div></td><td>' + fmtStamp(e.mtime) + '</td><td>' + typeName(e) + '</td><td>' + (e.type === 'file' ? fmtSize(e.size) : '') + '</td></tr>').join('') + '</table>';
    else main.innerHTML = '<div class="grid-view">' + list.map(e => '<div class="gi' + (sel.has(e.path) ? ' selected' : '') + '" data-p="' + esc(e.path) + '" draggable="true" title="' + esc(baseName(e.path) + (e.type === 'file' ? '\n' + typeName(e) + '\nРазмер: ' + fmtSize(e.size) : '')) + '"><div class="th">' + fileIcon(e.path) + '</div>' +
      (renaming === e.path ? '<input class="field" value="' + esc(baseName(e.path)) + '" data-ren>' : '<span>' + esc(baseName(e.path)) + '</span>') + '</div>').join('') + '</div>';
    const ren = main.querySelector('[data-ren]');
    if (ren) { ren.focus(); const b = ren.value, dot = b.lastIndexOf('.'); ren.setSelectionRange(0, dot > 0 && FS.get(renaming).type === 'file' ? dot : b.length); }
    w.body.querySelector('.st-count').textContent = 'Элементов: ' + list.length;
    w.body.querySelector('.st-sel').textContent = sel.size ? 'Выбрано: ' + sel.size : '';
    const bar = w.body.querySelector('.cmdbar'), inRoot = path === '';
    bar.querySelector('[data-x=new]').disabled = inRoot;
    bar.querySelector('[data-x=paste]').disabled = inRoot || !CLIP;
    bar.querySelector('[data-x=import]').disabled = inRoot;
    ['cut', 'copy', 'rename', 'del'].forEach(k => { bar.querySelector('[data-x=' + k + ']').disabled = !sel.size || [...sel].some(p => ROOTS.includes(p)) || (k === 'rename' && sel.size !== 1); });
    w.body.querySelector('[data-x=back]').disabled = !hist.length;
    w.body.querySelector('[data-x=fwd]').disabled = !fwd.length;
    w.body.querySelector('[data-x=up]').disabled = inRoot;
    renderPreview();
  }
  function renderPreview() {
    prev.hidden = !showPrev;
    if (!showPrev) return;
    const p = [...sel][0], e = p && FS.get(p);
    if (!e) { prev.innerHTML = '<div class="muted" style="text-align:center;margin-top:40px">Выберите файл, чтобы увидеть его содержимое</div>'; return; }
    prev.innerHTML = '<div style="display:flex;justify-content:center">' + (isImage(p) && fileUrl(e) ? '<img src="' + fileUrl(e) + '" alt="">' : '<div style="width:96px">' + fileIcon(p) + '</div>') + '</div><b>' + esc(baseName(p)) + '</b><div class="muted" style="font-size:12px">' + typeName(e) + (e.type === 'file' ? ' · ' + fmtSize(e.size) : '') + '<br>Изменён: ' + fmtStamp(e.mtime) + '</div>' +
      (e.text != null && !isImage(p) ? '<pre>' + esc(e.text.slice(0, 3000)) + '</pre>' : '');
  }
  function selectOnly(p) { sel = new Set(p ? [p] : []); }
  async function newItem(kind) {
    const p = kind === 'dir' ? makeDir(uniquePath(path, 'Новая папка')).path : writeFile(uniquePath(path, 'Новый текстовый документ', '.txt'), '').path;
    selectOnly(p); renaming = p; render();
  }
  function commitRename(input) {
    const old = renaming; renaming = null;
    if (!old) return;
    const name = input.value.trim(), err = nameError(parentOf(old), name, old);
    if (!name || name === baseName(old)) { render(); return; }
    if (err) { notify({ app: 'explorer', title: 'Переименование', body: err }); render(); return; }
    const np = renamePath(old, name); selectOnly(np); render();
  }
  function delSel() { [...sel].forEach(trashPath); sel.clear(); render(); }
  function doPaste() {
    if (!CLIP || path === '') return;
    CLIP.paths.forEach(p => { if (!FS.has(p)) return; CLIP.mode === 'cut' ? movePath(p, path) : copyPath(p, path); });
    if (CLIP.mode === 'cut') CLIP = null;
    render();
  }
  // в узком окне (меньше 760 px) сортировка, вид, импорт и область просмотра прячутся в «…», как в системе
  const ro = new ResizeObserver(() => w.el.classList.toggle('narrow', w.el.offsetWidth < 760));
  ro.observe(w.el); w.cleanup.push(() => ro.disconnect());
  function act(x, btn) {
    if (x === 'more') {
      const r = btn.getBoundingClientRect();
      showMenu(r.left, r.bottom + 4, [
        { label: 'Сортировка', icon: SI.sort, sub: [['name', 'Имя'], ['date', 'Дата изменения'], ['type', 'Тип']].map(([k, n]) => ({ label: n, checked: sortBy === k, action: () => { sortBy = k; store.set('exSort', k); render(); } })) },
        { label: 'Вид', icon: SI.view, sub: [['grid', 'Крупные значки'], ['details', 'Таблица']].map(([k, n]) => ({ label: n, checked: view === k, action: () => { view = k; store.set('exView', k); render(); } })) },
        { label: 'Импорт с диска', icon: SI.import, disabled: path === '', action: () => finput.click() },
        { label: 'Область просмотра', icon: SI.preview, checked: showPrev, action: () => { showPrev = !showPrev; store.set('exPrev', showPrev); render(); } },
      ]);
      return;
    }
    if (x === 'back' && hist.length) { fwd.push(path); path = hist.pop(); sel.clear(); render(); }
    else if (x === 'fwd' && fwd.length) { hist.push(path); path = fwd.pop(); sel.clear(); render(); }
    else if (x === 'up') go(parentOf(path));
    else if (x === 'refresh') render();
    else if (x === 'new') { const r = btn.getBoundingClientRect(); showMenu(r.left, r.bottom + 4, [{ label: 'Папку', icon: SI.newfolder, action: () => newItem('dir') }, { label: 'Текстовый документ', icon: SI.edit, action: () => newItem('txt') }]); }
    else if (x === 'cut' || x === 'copy') { CLIP = { mode: x, paths: [...sel] }; render(); }
    else if (x === 'paste') doPaste();
    else if (x === 'rename' && sel.size === 1) { renaming = [...sel][0]; render(); }
    else if (x === 'del') delSel();
    else if (x === 'sort') { const r = btn.getBoundingClientRect(); showMenu(r.left, r.bottom + 4, [['name', 'Имя'], ['date', 'Дата изменения'], ['type', 'Тип']].map(([k, n]) => ({ label: n, checked: sortBy === k, action: () => { sortBy = k; store.set('exSort', k); render(); } }))); }
    else if (x === 'view') { const r = btn.getBoundingClientRect(); showMenu(r.left, r.bottom + 4, [['grid', 'Крупные значки'], ['details', 'Таблица']].map(([k, n]) => ({ label: n, checked: view === k, action: () => { view = k; store.set('exView', k); render(); } }))); }
    else if (x === 'import') finput.click();
    else if (x === 'prev') { showPrev = !showPrev; store.set('exPrev', showPrev); render(); }
  }
  finput.addEventListener('change', async () => { for (const f of finput.files) await importFile(path, f); finput.value = ''; notify({ app: 'explorer', title: 'Импорт завершён', body: 'Добавлено в «' + (baseName(path) || 'Этот компьютер') + '»' }); });
  w.body.addEventListener('click', e => {
    const x = e.target.closest('[data-x]'); if (x && !x.disabled) { act(x.dataset.x, x); return; }
    const g = e.target.closest('[data-go]'); if (g) { go(g.dataset.go); return; }
    if (e.target.closest('[data-recycle]')) { openApp('recycle'); return; }
    if (e.target.closest('[data-ren]')) return;
    const it = e.target.closest('[data-p]');
    if (it) { const p = it.dataset.p; if (e.ctrlKey) { sel.has(p) ? sel.delete(p) : sel.add(p); } else selectOnly(p); markSel(); return; }
    if (e.target.closest('.ex-main')) { sel.clear(); markSel(); }
  });
  function markSel() {
    main.querySelectorAll('[data-p]').forEach(el => el.classList.toggle('selected', sel.has(el.dataset.p)));
    w.body.querySelector('.st-sel').textContent = sel.size ? 'Выбрано: ' + sel.size : '';
    const bar = w.body.querySelector('.cmdbar');
    ['cut', 'copy', 'rename', 'del'].forEach(k => { bar.querySelector('[data-x=' + k + ']').disabled = !sel.size || [...sel].some(p => ROOTS.includes(p)) || (k === 'rename' && sel.size !== 1); });
    renderPreview();
  }
  main.addEventListener('dblclick', e => { const it = e.target.closest('[data-p]'); if (it && !e.target.closest('[data-ren]')) { const p = it.dataset.p; FS.get(p).type === 'dir' ? go(p) : openPath(p); } });
  main.addEventListener('keydown', e => { const r = e.target.closest('[data-ren]'); if (!r) return; e.stopPropagation(); if (e.key === 'Enter') commitRename(r); if (e.key === 'Escape') { renaming = null; render(); } });
  main.addEventListener('focusout', e => { const r = e.target.closest && e.target.closest('[data-ren]'); if (r && renaming) commitRename(r); });
  w.body.querySelector('.ex-search').addEventListener('input', e => { q = e.target.value.trim().toLowerCase(); render(); });
  main.addEventListener('contextmenu', e => {
    e.preventDefault(); e.stopPropagation();
    const it = e.target.closest('[data-p]');
    if (it) {
      const p = it.dataset.p; if (!sel.has(p)) { selectOnly(p); markSel(); }
      const sys = [...sel].some(x => ROOTS.includes(x)), e0 = FS.get(p);
      showMenu(e.clientX, e.clientY, [
        { icons: [{ label: 'Вырезать', icon: SI.cut, disabled: sys, action: () => act('cut') }, { label: 'Копировать', icon: SI.copy, disabled: sys, action: () => act('copy') }, { label: 'Переименовать', icon: SI.rename, disabled: sys || sel.size !== 1, action: () => act('rename') }, { label: 'Удалить', icon: SI.trash, disabled: sys, action: () => act('del') }] },
        { label: 'Открыть', icon: SI.open, key: 'Enter', action: () => e0.type === 'dir' ? go(p) : openPath(p) },
        ...(isImage(p) ? [{ label: 'Сделать фоном рабочего стола', icon: SI.wallpaper, action: () => setS({ wallpaper: 'fs:' + p }) }] : []),
        ...(e0.type === 'dir' ? [{ label: 'Открыть в Терминале', icon: SI.term, action: () => openApp('terminal', p) }] : []),
        { sep: true }, { label: 'Свойства', icon: SI.info, action: () => showProps(w, p) },
      ]);
    } else if (path !== '') {
      showMenu(e.clientX, e.clientY, [
        { label: 'Вид', icon: SI.view, sub: [['grid', 'Крупные значки'], ['details', 'Таблица']].map(([k, n]) => ({ label: n, checked: view === k, action: () => { view = k; store.set('exView', k); render(); } })) },
        { label: 'Сортировка', icon: SI.sort, sub: [['name', 'Имя'], ['date', 'Дата изменения'], ['type', 'Тип']].map(([k, n]) => ({ label: n, checked: sortBy === k, action: () => { sortBy = k; store.set('exSort', k); render(); } })) },
        { sep: true }, { label: 'Вставить', icon: SI.paste, key: 'Ctrl+V', disabled: !CLIP, action: doPaste },
        { label: 'Создать', icon: SI.plus, sub: [{ label: 'Папку', icon: SI.newfolder, action: () => newItem('dir') }, { label: 'Текстовый документ', icon: SI.edit, action: () => newItem('txt') }] },
        { label: 'Импорт с диска', icon: SI.import, action: () => finput.click() },
        { sep: true }, { label: 'Открыть в Терминале', icon: SI.term, action: () => openApp('terminal', path) },
      ]);
    }
  });
  // Перетаскивание: внутри - перенос в папку (с Ctrl - копия), снаружи (файлы с диска) - импорт
  let dragPaths = null;
  w.body.addEventListener('dragstart', e => { const it = e.target.closest('[data-p]'); if (!it) return; if (!sel.has(it.dataset.p)) { selectOnly(it.dataset.p); markSel(); } dragPaths = [...sel]; e.dataTransfer.setData('text/x-fs', JSON.stringify(dragPaths)); e.dataTransfer.effectAllowed = 'copyMove'; });
  w.body.addEventListener('dragend', () => { dragPaths = null; w.body.querySelectorAll('.drop').forEach(x => x.classList.remove('drop')); main.classList.remove('drop-os'); });
  const dropDir = el => { const d = el.closest('[data-drop]'); if (d) return d.dataset.drop; const it = el.closest('[data-p]'); if (it && FS.get(it.dataset.p) && FS.get(it.dataset.p).type === 'dir') return it.dataset.p; return el.closest('.ex-main') && path !== '' ? path : null; };
  w.body.addEventListener('dragover', e => {
    const d = dropDir(e.target); if (d === null) return;
    const fromOS = e.dataTransfer.types.includes('Files') && !e.dataTransfer.types.includes('text/x-fs');
    if (!fromOS && (d === path && !e.target.closest('[data-p]') && !e.target.closest('[data-drop]'))) return;
    e.preventDefault(); e.dataTransfer.dropEffect = e.ctrlKey ? 'copy' : 'move';
    w.body.querySelectorAll('.drop').forEach(x => x.classList.remove('drop'));
    const t = e.target.closest('[data-drop],[data-p]'); if (t && !fromOS) t.classList.add('drop');
    main.classList.toggle('drop-os', fromOS);
  });
  w.body.addEventListener('dragleave', e => { if (!w.body.contains(e.relatedTarget)) { main.classList.remove('drop-os'); w.body.querySelectorAll('.drop').forEach(x => x.classList.remove('drop')); } });
  w.body.addEventListener('drop', async e => {
    const d = dropDir(e.target); if (d === null) return;
    e.preventDefault(); main.classList.remove('drop-os'); w.body.querySelectorAll('.drop').forEach(x => x.classList.remove('drop'));
    const raw = e.dataTransfer.getData('text/x-fs');
    if (raw) {
      const ps = JSON.parse(raw);
      if (d === '__trash') ps.forEach(trashPath);
      else if (d !== '') ps.forEach(p => e.ctrlKey ? copyPath(p, d) : movePath(p, d));
      sel.clear(); render();
    } else if (e.dataTransfer.files.length && d !== '' && d !== '__trash') {
      for (const f of e.dataTransfer.files) await importFile(d, f);
    }
  });
  w.onKey = e => {
    const list = items().map(x => x.path);
    if (e.key === 'Delete' && sel.size) { e.preventDefault(); act('del'); }
    else if (e.key === 'F2' && sel.size === 1) { e.preventDefault(); act('rename'); }
    else if (e.key === 'Enter' && sel.size === 1) { e.preventDefault(); const p = [...sel][0]; FS.get(p).type === 'dir' ? go(p) : openPath(p); }
    else if (e.key === 'Backspace' && path !== '') { e.preventDefault(); go(parentOf(path)); }
    else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyA') { e.preventDefault(); sel = new Set(list); markSel(); }
    else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyC' && sel.size) act('copy');
    else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyX' && sel.size) act('cut');
    else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyV') act('paste');
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); const i = list.indexOf([...sel][0]); const n = Math.max(0, Math.min(list.length - 1, i + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1))); selectOnly(list[n]); markSel();
    }
  };
  w.cleanup.push(on('fs', () => { if (!renaming) render(); }));
  render();
}
function showProps(w, p) {
  const e = FS.get(p); if (!e) return;
  const size = e.type === 'dir' ? subtree(p).reduce((s, x) => s + (FS.get(x).size || 0), 0) : e.size;
  winDialog(w, { title: 'Свойства: ' + baseName(p), text: 'Тип: ' + typeName(e) + '\nРасположение: ' + (parentOf(p) || 'Этот компьютер') + '\nРазмер: ' + fmtSize(size || 0) + '\nИзменён: ' + fmtStamp(e.mtime) + (e.type === 'dir' ? '\nСодержит: ' + (subtree(p).length - 1) + ' объектов' : ''), buttons: ['ОК'] });
}

// ---------------- Корзина ----------------
function createRecycle(w) {
  function render() {
    w.body.innerHTML = '<div class="cmdbar"><button class="tbtn" data-r="empty"' + (TRASH.length ? '' : ' disabled') + '>' + SI.trash + ' Очистить корзину</button><button class="tbtn" data-r="all"' + (TRASH.length ? '' : ' disabled') + '>' + SI.restart + ' Восстановить все</button></div>' +
      '<div class="recycle scroll">' + (TRASH.length ? '<table class="details"><tr><th>Имя</th><th>Исходное расположение</th><th>Дата удаления</th><th></th></tr>' +
        [...TRASH].reverse().map(t => '<tr class="row"><td><div class="nm">' + (t.items[0].type === 'dir' ? ICON.folder : ICON.textfile) + '<span>' + esc(baseName(t.path)) + '</span></div></td><td>' + esc(parentOf(t.path) || 'Этот компьютер') + '</td><td>' + fmtStamp(t.deleted) + '</td><td><button class="btn" data-restore="' + t.id + '">Восстановить</button> <button class="btn" data-kill="' + t.id + '">Удалить</button></td></tr>').join('') + '</table>'
        : '<div class="empty">Корзина пуста</div>') + '</div>';
  }
  w.body.addEventListener('click', async e => {
    const r = e.target.closest('[data-restore]'); if (r) { restoreTrash(r.dataset.restore); return; }
    const k = e.target.closest('[data-kill]'); if (k) { if ((await winDialog(w, { title: 'Удалить навсегда?', text: 'Файл нельзя будет вернуть.', buttons: ['Удалить', 'Отмена'] })) === 0) deleteTrash(k.dataset.kill); return; }
    const b = e.target.closest('[data-r]'); if (!b || b.disabled) return;
    if (b.dataset.r === 'all') [...TRASH].forEach(t => restoreTrash(t.id));
    else if ((await winDialog(w, { title: 'Очистить корзину?', text: 'Объектов: ' + TRASH.length + '. Их нельзя будет вернуть.', buttons: ['Да', 'Нет'] })) === 0) emptyTrash();
  });
  w.cleanup.push(on('fs', render));
  render();
}

// ---------------- Блокнот ----------------
function createNotepad(w, path) {
  w.arg = path;
  let file = path && FS.get(path) ? path : null, zoom = 100, wrap = store.get('npWrap', true);
  w.body.innerHTML = '<div class="np-menu"><button data-m="file">Файл</button><button data-m="edit">Правка</button><button data-m="view">Просмотр</button></div><textarea class="np-text" spellcheck="false" aria-label="Текст"></textarea><div class="np-status"><span class="np-pos"></span><span class="np-zoom"></span><span>Windows (CRLF)</span><span>UTF-8</span></div>';
  const ta = w.body.querySelector('textarea');
  const fe = file && FS.get(file);
  ta.value = fe ? fe.text || '' : '';
  let saved = ta.value;
  // большой файл хранится как двоичный: читаем его текст, пока не прочитан - править нельзя (иначе затрём пустым)
  // очень большой текст показываем началом и только для чтения: и не зависнем, и не затрём файл обрезком
  let bigOnly = false;
  const BIG = 300000;
  if (fe && fe.text == null && fe.blob) {
    ta.readOnly = true; ta.value = 'Открывается…';
    fe.blob.text().then(t => { if (t.length > BIG) { bigOnly = true; ta.value = t.slice(0, BIG); saved = ta.value; notify({ app: w.app, title: 'Большой файл открыт для чтения', body: 'Показано начало «' + baseName(file) + '», правка отключена' }); } else { ta.value = t; saved = t; ta.readOnly = false; } status(); });
    saved = ta.value;
  }
  const dirty = () => ta.value !== saved;
  w.isDirty = () => !ta.readOnly && dirty();
  w.cleanup.push(on('moved', ({ from, to }) => { if (file && (file === from || file.startsWith(from + '/'))) { file = to + file.slice(from.length); w.arg = file; status(); } }));
  function status() {
    w.setTitle((dirty() ? '● ' : '') + (file ? baseName(file) : 'Безымянный') + ' - Блокнот');
    const before = ta.value.slice(0, ta.selectionStart).split('\n');
    w.body.querySelector('.np-pos').textContent = 'Стр ' + before.length + ', стлб ' + (before[before.length - 1].length + 1) + ' · ' + ta.value.length + ' символов';
    w.body.querySelector('.np-zoom').textContent = zoom + '%';
    ta.style.fontSize = (15 * zoom / 100) + 'px';
    ta.classList.toggle('wrap', wrap);
  }
  async function saveAs() {
    const name = await winDialog(w, { title: 'Сохранить как', text: 'Имя файла в «Документах»:', input: file ? baseName(file) : 'Безымянный.txt', buttons: ['Сохранить', 'Отмена'] });
    if (name === null) return false;
    let n = name.trim(); if (!n) return false; if (!/\.[^.]+$/.test(n)) n += '.txt';
    const err = nameError('Документы', n, file); const p = 'Документы/' + n;
    if (err && !(FS.has(p) && FS.get(p).type === 'file')) { await winDialog(w, { title: 'Не удалось сохранить', text: err, buttons: ['ОК'] }); return false; }
    if (FS.has(p) && p !== file && (await winDialog(w, { title: 'Заменить файл?', text: '«' + n + '» уже существует.', buttons: ['Заменить', 'Отмена'] })) !== 0) return false;
    file = p; return save();
  }
  function save() { if (bigOnly) return false; if (!file) return saveAs(); writeFile(file, ta.value); saved = ta.value; w.arg = file; status(); return true; }
  async function openDialog() {
    const files = [...FS.values()].filter(e => e.type === 'file' && isText(e.path) && !isImage(e.path));
    const back = document.createElement('div');
    back.className = 'win-dialog-back';
    back.innerHTML = '<div class="win-dialog"><div class="wd-body"><h3>Открыть</h3><div class="scroll" style="max-height:260px">' + files.map(e => '<button class="res-item" data-f="' + esc(e.path) + '">' + ICON.textfile + '<span>' + esc(baseName(e.path)) + '</span><small>' + esc(parentOf(e.path)) + '</small></button>').join('') + '</div></div><div class="wd-foot"><button class="btn" data-c>Отмена</button></div></div>';
    w.el.appendChild(back);
    back.addEventListener('click', e => { const f = e.target.closest('[data-f]'); if (f) { back.remove(); openApp('notepad', f.dataset.f); } else if (e.target.closest('[data-c]')) back.remove(); });
  }
  w.body.querySelector('.np-menu').addEventListener('click', e => {
    const b = e.target.closest('[data-m]'); if (!b) return;
    const r = b.getBoundingClientRect();
    const menus = {
      file: [{ label: 'Создать', key: 'Ctrl+N', action: () => openApp('notepad') }, { label: 'Открыть…', key: 'Ctrl+O', action: openDialog }, { label: 'Сохранить', key: 'Ctrl+S', action: save }, { label: 'Сохранить как…', action: saveAs }, { sep: true }, { label: 'Закрыть', action: () => closeWin(w) }],
      edit: [{ label: 'Выделить всё', key: 'Ctrl+A', action: () => { ta.focus(); ta.select(); } }, { label: 'Время и дата', key: 'F5', action: () => { insertDate(); } }],
      view: [{ label: 'Увеличить', key: 'Ctrl++', action: () => { zoom = Math.min(300, zoom + 10); status(); } }, { label: 'Уменьшить', key: 'Ctrl+-', action: () => { zoom = Math.max(50, zoom - 10); status(); } }, { label: 'Восстановить масштаб', action: () => { zoom = 100; status(); } }, { sep: true }, { label: 'Перенос по словам', checked: wrap, action: () => { wrap = !wrap; store.set('npWrap', wrap); status(); } }],
    };
    showMenu(r.left, r.bottom + 2, menus[b.dataset.m]);
  });
  function insertDate() { const n = new Date(); ta.setRangeText(fmtTime(n) + ' ' + fmtDate(n), ta.selectionStart, ta.selectionEnd, 'end'); ta.focus(); status(); }
  ['input', 'click', 'keyup'].forEach(ev => ta.addEventListener(ev, status));
  ta.addEventListener('keydown', e => {
    if (e.ctrlKey && e.code === 'KeyS') { e.preventDefault(); e.shiftKey ? saveAs() : save(); }
    else if (e.ctrlKey && e.code === 'KeyO') { e.preventDefault(); openDialog(); }
    else if (e.ctrlKey && e.code === 'KeyN') { e.preventDefault(); openApp('notepad'); }
    else if (e.key === 'F5') { e.preventDefault(); insertDate(); }
    else if (e.ctrlKey && (e.key === '=' || e.key === '+')) { e.preventDefault(); zoom = Math.min(300, zoom + 10); status(); }
    else if (e.ctrlKey && e.key === '-') { e.preventDefault(); zoom = Math.max(50, zoom - 10); status(); }
  });
  w.beforeClose = async () => {
    if (!dirty()) return true;
    const r = await winDialog(w, { title: 'Блокнот', text: 'Сохранить изменения в «' + (file ? baseName(file) : 'Безымянный') + '»?', buttons: ['Сохранить', 'Не сохранять', 'Отмена'] });
    if (r === 2) return false;
    if (r === 0) return await save();
    return true;
  };
  status();
  setTimeout(() => ta.focus(), 30);
}

// ---------------- Калькулятор (логика из web/calculator, дополнена) ----------------
function createCalc(w) {
  const keys = [['%', 'pct'], ['CE', 'ce'], ['C', 'c'], ['⌫', 'back'], ['¹/ₓ', 'inv'], ['x²', 'sq'], ['²√x', 'sqrt'], ['÷', '/'], ['7', '7', 'num'], ['8', '8', 'num'], ['9', '9', 'num'], ['×', '*'], ['4', '4', 'num'], ['5', '5', 'num'], ['6', '6', 'num'], ['−', '-'], ['1', '1', 'num'], ['2', '2', 'num'], ['3', '3', 'num'], ['+', '+'], ['+/−', 'neg', 'num'], ['0', '0', 'num'], [',', '.', 'num'], ['=', '=', 'eq']];
  w.body.innerHTML = '<div class="calc"><div class="calc-top"><b>Обычный</b></div><div class="calc-hist"></div><div class="calc-disp">0</div><div class="calc-mem"><button data-m="MC" disabled>MC</button><button data-m="MR" disabled>MR</button><button data-m="M+">M+</button><button data-m="M-">M−</button><button data-m="MS">MS</button></div>' +
    '<div class="calc-keys">' + keys.map(k => '<button class="ck ' + (k[2] || '') + '" data-k="' + k[1] + '">' + k[0] + '</button>').join('') + '</div></div>';
  const disp = w.body.querySelector('.calc-disp'), hist = w.body.querySelector('.calc-hist');
  let current = '0', previous = null, operator = null, waitingForNew = false, error = false, mem = null;
  const SYM = { '+': '+', '-': '−', '*': '×', '/': '÷' };
  function formatNumber(n) {
    const num = typeof n === 'string' ? parseFloat(n) : n;
    if (!isFinite(num)) return 'Ошибка';
    let str = Math.abs(num) >= 1e16 || (Math.abs(num) < 1e-9 && num !== 0) ? num.toExponential(6) : String(parseFloat(num.toPrecision(15)));
    if (str.includes('e')) return str.replace('.', ',');
    const [a, b] = (typeof n === 'string' && !waitingForNew && n.endsWith('.') ? [n.slice(0, -1), ''] : str.split('.'));
    return a.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (b !== undefined ? ',' + b : '');
  }
  function render() {
    disp.textContent = error ? 'Деление на ноль невозможно' : formatNumber(current);
    const len = disp.textContent.length;
    disp.style.fontSize = (error ? 24 : Math.min(46, Math.floor((disp.clientWidth || 300) / (len * 0.58)))) + 'px';
    w.body.querySelectorAll('[data-m=MC],[data-m=MR]').forEach(b => b.disabled = mem === null);
  }
  const compute = (a, b, op) => { const x = parseFloat(a), y = parseFloat(b); if (op === '+') return x + y; if (op === '-') return x - y; if (op === '*') return x * y; if (op === '/') return y === 0 ? NaN : x / y; return y; };
  const clean = r => String(parseFloat(r.toPrecision(15)));
  function press(k) {
    if (error && !['c', 'ce'].includes(k)) { error = false; current = '0'; previous = null; operator = null; hist.textContent = ''; }
    if (/^\d$/.test(k)) { if (waitingForNew || current === '0') { current = k; waitingForNew = false; } else if (current.replace(/[-.]/g, '').length < 16) current += k; }
    else if (k === '.') { if (waitingForNew) { current = '0.'; waitingForNew = false; } else if (!current.includes('.')) current += '.'; }
    else if (k === 'c') { current = '0'; previous = null; operator = null; waitingForNew = false; error = false; hist.textContent = ''; }
    else if (k === 'ce') { current = '0'; error = false; }
    else if (k === 'back') { if (!waitingForNew) current = current.length > 1 && !/^-\d$/.test(current) ? current.slice(0, -1) : '0'; }
    else if (k === 'neg') { if (current !== '0') current = current.startsWith('-') ? current.slice(1) : '-' + current; }
    else if (k === 'pct') { current = clean(previous !== null ? parseFloat(previous) * parseFloat(current) / 100 : parseFloat(current) / 100); waitingForNew = true; }
    else if (k === 'inv') { const v = parseFloat(current); if (v === 0) error = true; else { hist.textContent = '1/(' + formatNumber(current) + ')'; current = clean(1 / v); waitingForNew = true; } }
    else if (k === 'sq') { hist.textContent = 'sqr(' + formatNumber(current) + ')'; current = clean(parseFloat(current) ** 2); waitingForNew = true; }
    else if (k === 'sqrt') { const v = parseFloat(current); if (v < 0) { error = true; disp.textContent = 'Недопустимый ввод'; } else { hist.textContent = '√(' + formatNumber(current) + ')'; current = clean(Math.sqrt(v)); waitingForNew = true; } }
    else if ('+-*/'.includes(k)) {
      if (operator && !waitingForNew) { const r = compute(previous, current, operator); if (!isFinite(r)) { error = true; render(); return; } current = clean(r); }
      previous = current; operator = k; waitingForNew = true; hist.textContent = formatNumber(previous) + ' ' + SYM[k];
    }
    else if (k === '=') {
      if (operator === null) return;
      const r = compute(previous, current, operator);
      hist.textContent = formatNumber(previous) + ' ' + SYM[operator] + ' ' + formatNumber(current) + ' =';
      if (!isFinite(r)) { error = true; render(); return; }
      current = clean(r); operator = null; previous = null; waitingForNew = true;
    }
    render();
  }
  w.body.addEventListener('click', e => {
    const b = e.target.closest('[data-k]'); if (b) { press(b.dataset.k); return; }
    const m = e.target.closest('[data-m]'); if (!m || m.disabled) return;
    const v = parseFloat(current);
    if (m.dataset.m === 'MS') mem = v; else if (m.dataset.m === 'M+') mem = (mem || 0) + v; else if (m.dataset.m === 'M-') mem = (mem || 0) - v;
    else if (m.dataset.m === 'MC') mem = null; else if (m.dataset.m === 'MR' && mem !== null) { current = clean(mem); waitingForNew = true; }
    render();
  });
  w.onKey = e => {
    const map = { Enter: '=', '=': '=', Backspace: 'back', Delete: 'ce', Escape: 'c', ',': '.', '.': '.', '+': '+', '-': '-', '*': '*', '/': '/', '%': 'pct' };
    const k = /^\d$/.test(e.key) ? e.key : map[e.key];
    if (k) { e.preventDefault(); press(k); }
  };
  render();
}

// ---------------- Параметры ----------------
const SETTINGS_PAGES = [['system', 'Система', SI.display], ['network', 'Сеть и Интернет', SI.network], ['personal', 'Персонализация', SI.brush], ['apps', 'Приложения', SI.apps], ['accounts', 'Учётные записи', SI.person], ['time', 'Время и язык', SI.time], ['access', 'Специальные возможности', SI.access], ['about', 'О системе', SI.info]];
function createSettings(w, startPage) {
  let cur = startPage || 'system';
  w.onArg = p => { cur = p || cur; render(); };
  const tog = (k, title, sub, icon) => '<div class="row-card"><span class="rc-ic">' + (icon || '') + '</span><div class="rc-main"><div class="rc-title">' + title + '</div>' + (sub ? '<div class="rc-sub">' + sub + '</div>' : '') + '</div><span class="muted" style="font-size:13px">' + (S[k] ? 'Вкл.' : 'Откл.') + '</span><button class="toggle' + (S[k] ? ' on' : '') + '" data-tog="' + k + '" role="switch" aria-checked="' + !!S[k] + '" aria-label="' + title + '"></button></div>';
  const range = (k, title, min, max, icon) => '<div class="row-card"><span class="rc-ic">' + icon + '</span><div class="rc-main"><div class="rc-title">' + title + '</div></div><input type="range" min="' + min + '" max="' + max + '" value="' + S[k] + '" data-range="' + k + '" aria-label="' + title + '" style="width:200px"><span style="width:30px;text-align:right">' + S[k] + '</span></div>';
  function page() {
    const d = S.theme === 'dark';
    if (cur === 'system') return '<h1>Система</h1>' + range('brightness', 'Яркость', 30, 100, SI.sun) + tog('night', 'Ночной свет', 'Тёплые цвета экрана вечером', SI.night) + range('volume', 'Громкость', 0, 100, SI.vol) + tog('muted', 'Без звука', '', SI.mute) + tog('focus', 'Фокусировка', 'Уведомления не всплывают, но остаются в центре уведомлений', SI.focus) + tog('saver', 'Экономия заряда', '', SI.saver) +
      '<div class="subtitle">Хранилище</div><div class="row-card"><span class="rc-ic">' + SI.display + '</span><div class="rc-main"><div class="rc-title">Файлы в памяти браузера</div><div class="rc-sub">' + [...FS.values()].filter(e => e.type === 'file').length + ' файлов, ' + fmtSize([...FS.values()].reduce((s, e) => s + (e.size || 0), 0)) + (dbOk ? ' · IndexedDB' : ' · только в памяти (IndexedDB недоступна)') + '</div></div></div>';
    if (cur === 'network') return '<h1>Сеть и Интернет</h1>' + tog('wifi', 'Wi-Fi', S.wifi ? 'Подключено, условная сеть' : 'Отключено', SI.wifi) + tog('bt', 'Bluetooth', '', SI.bt) + tog('airplane', 'Режим «в самолёте»', 'Отключает Wi-Fi и Bluetooth', SI.plane) + '<p class="muted" style="margin-top:12px;font-size:13px">Оболочка работает без интернета: переключатели условные.</p>';
    if (cur === 'personal') {
      const imgs = [...FS.values()].filter(e => e.type === 'file' && isImage(e.path));
      return '<h1>Персонализация</h1><div class="wall-prev" style="background:' + esc(wallpaperCss(d)) + ';background-size:cover"></div><div class="subtitle">Фон</div><div class="walls">' +
        Object.entries(WALLS).map(([k, v]) => '<button class="wall' + (S.wallpaper === k ? ' on' : '') + '" data-wall="' + k + '" title="' + v.name + '" aria-label="' + v.name + '" style="background:' + esc(v.css(d)) + ';background-size:cover"></button>').join('') +
        imgs.map(e => fileUrl(e) ? '<button class="wall' + (S.wallpaper === 'fs:' + e.path ? ' on' : '') + '" data-wall="fs:' + esc(e.path) + '" title="' + esc(baseName(e.path)) + '" style="background-image:url(&quot;' + fileUrl(e) + '&quot;)"></button>' : '').join('') + '</div>' +
        '<div class="subtitle">Цвета</div><div class="row-card"><span class="rc-ic">' + SI.brush + '</span><div class="rc-main"><div class="rc-title">Режим</div><div class="rc-sub">Цвет окон, панели задач и меню</div></div><div class="seg"><button data-theme-set="light" class="' + (!d ? 'on' : '') + '">Светлый</button><button data-theme-set="dark" class="' + (d ? 'on' : '') + '">Тёмный</button></div></div>' +
        '<div class="row-card" style="align-items:flex-start"><span class="rc-ic">' + SI.brush + '</span><div class="rc-main"><div class="rc-title" style="margin-bottom:10px">Контрастный цвет</div><div class="accents">' + ACCENTS.map((a, i) => '<button data-accent="' + i + '" class="' + (S.accent === i ? 'on' : '') + '" style="background:' + (d ? a[0] : a[1]) + '" aria-label="Цвет ' + (i + 1) + '"></button>').join('') + '</div></div></div>' +
        tog('transparency', 'Эффекты прозрачности', 'Размытие фона под окнами и панелями') +
        '<div class="subtitle">Рабочий стол</div><div class="row-card"><span class="rc-ic">' + SI.view + '</span><div class="rc-main"><div class="rc-title">Размер значков</div></div><div class="seg">' + [['small', 'Мелкие'], ['medium', 'Обычные'], ['large', 'Крупные']].map(([k, n]) => '<button data-icons="' + k + '" class="' + (S.icons === k ? 'on' : '') + '">' + n + '</button>').join('') + '</div></div>';
    }
    if (cur === 'apps') return '<h1>Приложения</h1>' + Object.keys(APPS).map(id => '<div class="row-card"><span class="rc-ic">' + APPS[id].icon.replace('<svg', '<svg width="20" height="20"') + '</span><div class="rc-main"><div class="rc-title">' + APPS[id].title + '</div><div class="rc-sub">' + (APPS[id].game ? 'Игра: ' + APPS[id].iframe.slice(3, -11) + '/' : APPS[id].iframe ? 'Отдельная страница в папке apps/' : 'Встроено в оболочку') + '</div></div><button class="btn" data-open-app="' + id + '">Открыть</button></div>').join('');
    if (cur === 'accounts') return '<h1>Учётные записи</h1><div class="row-card"><div class="avatar" style="width:64px;height:64px;font-size:26px">П</div><div class="rc-main"><div class="rc-title" style="font-size:18px">Пользователь</div><div class="rc-sub">Локальная учётная запись · Администратор</div></div></div><p class="muted" style="font-size:13px;margin-top:12px">Вход без пароля: это оболочка-демонстрация, личные данные не хранятся.</p>';
    if (cur === 'time') { const n = new Date(); return '<h1>Время и язык</h1><div class="row-card"><span class="rc-ic">' + SI.time + '</span><div class="rc-main"><div class="rc-title">Сейчас</div><div class="rc-sub">' + fmtTime(n, true) + ', ' + fmtDate(n) + '</div></div></div>' + tog('time24', '24-часовой формат', 'Иначе 12-часовой с AM/PM', SI.time) + tog('seconds', 'Секунды на панели задач', '', SI.time) + tog('dateLong', 'Длинный формат даты', '«26 сентября 2026» вместо «26.09.2026»', SI.time) + '<p class="muted" style="font-size:13px;margin-top:12px">Время и часовой пояс берутся с этого компьютера. Язык интерфейса - русский.</p>'; }
    if (cur === 'access') return '<h1>Специальные возможности</h1>' + tog('animations', 'Эффекты анимации', 'Плавное появление окон и меню', SI.access) + tog('transparency', 'Эффекты прозрачности', '', SI.brush);
    return '<h1>О системе</h1><div class="row-card"><span class="rc-ic">' + SI.info + '</span><div class="rc-main"><div class="rc-title">Windows-подобная оболочка, версия 3.0</div><div class="rc-sub">Одна страница HTML; работает без интернета; файлы - IndexedDB, настройки - localStorage</div></div></div>' +
      '<div class="row-card"><span class="rc-ic">' + SI.info + '</span><div class="rc-main"><div class="rc-title">Фан-концепт интерфейса, не связан с Microsoft/Apple/Samsung</div><div class="rc-sub">Значки, знак «Пуска» и обои нарисованы заново кодом, шрифты системные. Paint, Мессенджер и игры - отдельные страницы в папке apps/.</div></div></div>' +
      '<div class="row-card"><span class="rc-ic">' + SI.restart + '</span><div class="rc-main"><div class="rc-title">Сброс</div><div class="rc-sub">Вернуть настройки, файлы и корзину к исходным</div></div><button class="btn" data-reset>Сбросить всё</button></div>';
  }
  function render() {
    const scroll = w.body.querySelector('.set-main') ? w.body.querySelector('.set-main').scrollTop : 0;
    w.body.innerHTML = '<div class="settings"><div class="set-nav scroll"><div class="set-user"><div class="avatar">П</div><div><b>Пользователь</b><small>Локальная учётная запись</small></div></div>' +
      '<div class="search-pill" style="margin:0 4px 12px;height:32px"><input placeholder="Найти параметр" data-sq aria-label="Найти параметр">' + ICON.search.replace('<svg', '<svg width="14" height="14"') + '</div>' +
      SETTINGS_PAGES.map(([k, n, ic]) => '<button class="nav-item' + (k === cur ? ' active' : '') + '" data-page="' + k + '">' + ic + '<span>' + n + '</span></button>').join('') + '</div><div class="set-main scroll">' + page() + '</div></div>';
    w.body.querySelector('.set-main').scrollTop = scroll;
    w.setTitle('Параметры');
  }
  let own = false;
  w.body.addEventListener('click', async e => {
    const t = e.target;
    const pg = t.closest('[data-page]'); if (pg) { cur = pg.dataset.page; render(); return; }
    const tg = t.closest('[data-tog]'); if (tg) { setS({ [tg.dataset.tog]: !S[tg.dataset.tog] }); return; }
    const wl = t.closest('[data-wall]'); if (wl) { setS({ wallpaper: wl.dataset.wall }); return; }
    const th = t.closest('[data-theme-set]'); if (th) { setS({ theme: th.dataset.themeSet }); return; }
    const ac = t.closest('[data-accent]'); if (ac) { setS({ accent: +ac.dataset.accent }); return; }
    const ic = t.closest('[data-icons]'); if (ic) { setS({ icons: ic.dataset.icons }); renderDesktop(); return; }
    if (t.closest('[data-reset]') && (await winDialog(w, { title: 'Сбросить всё?', text: 'Настройки, файлы и корзина вернутся к исходным.', buttons: ['Сбросить', 'Отмена'] })) === 0) {
      store.clear(); if (db) { db.close(); } db = null;
      let req; try { req = indexedDB.deleteDatabase('win11_3'); } catch (er) { location.reload(); return; }
      req.onsuccess = req.onerror = () => location.reload();
      req.onblocked = () => notify({ app: 'settings', title: 'Сброс ждёт', body: 'Закройте другую вкладку с оболочкой' });
    }
  });
  w.body.addEventListener('input', e => {
    const r = e.target.closest('[data-range]'); if (r) { own = true; setS({ [r.dataset.range]: +r.value, ...(r.dataset.range === 'volume' ? { muted: +r.value === 0 } : {}) }); r.nextElementSibling.textContent = r.value; own = false; return; }
    const q = e.target.closest('[data-sq]');
    if (q) { const f = SETTINGS_PAGES.find(p => p[1].toLowerCase().includes(q.value.trim().toLowerCase())); if (f && q.value.trim()) { cur = f[0]; const v = q.value; render(); const i = w.body.querySelector('[data-sq]'); i.value = v; i.focus(); } }
  });
  w.cleanup.push(on('settings', () => { if (!own) render(); }), on('tick', () => { if (cur === 'time') { const s = w.body.querySelector('.rc-sub'); if (s) s.textContent = fmtTime(new Date(), true) + ', ' + fmtDate(new Date()); } }));
  render();
}

// ---------------- Браузер (только встроенные страницы) ----------------
function createBrowser(w) {
  const PAGES = {
    'about:newtab': { t: 'Новая вкладка', h: () => '<div class="b-home"><h1 style="font-size:40px">Доброго дня</h1><form class="search-pill" data-home>' + ICON.search.replace('<svg', '<svg width="16" height="16"') + '<input placeholder="Поиск или адрес" aria-label="Поиск"></form><div class="b-tiles">' +
      [['about:help', '📖', 'Справка'], ['about:system', 'ℹ️', 'О системе'], ['about:keys', '⌨️', 'Клавиши'], ['app:explorer', '📁', 'Проводник'], ['app:notepad', '📝', 'Блокнот'], ['app:settings', '⚙️', 'Параметры']].map(t => '<button class="b-tile" data-go="' + t[0] + '"><b>' + t[1] + '</b>' + t[2] + '</button>').join('') + '</div></div>' },
    'about:help': { t: 'Справка', h: () => '<h1>Справка</h1><p>Это встроенный браузер оболочки. Он показывает страницы about: и открывает приложения. Внешние сайты не открываются: оболочка работает без сети.</p><p>Страницы: about:newtab, about:help, about:system, about:keys.</p>' },
    'about:system': { t: 'О системе', h: () => '<h1>О системе</h1><p>Windows-подобная оболочка, версия 3.0. <b>Фан-концепт интерфейса, не связан с Microsoft/Apple/Samsung.</b></p><p>Открыто окон: ' + wins.length + '. Файлов: ' + [...FS.values()].filter(e => e.type === 'file').length + '.</p>' },
    'about:keys': { t: 'Горячие клавиши', h: () => '<h1>Горячие клавиши</h1><p><kbd>Esc</kbd> - закрыть меню и панели · <kbd>Ctrl</kbd>+<kbd>Esc</kbd> - «Пуск»</p><p>Проводник: <kbd>Del</kbd>, <kbd>F2</kbd>, <kbd>Enter</kbd>, <kbd>Ctrl</kbd>+<kbd>C</kbd>/<kbd>X</kbd>/<kbd>V</kbd>/<kbd>A</kbd>, <kbd>Backspace</kbd></p><p>Блокнот: <kbd>Ctrl</kbd>+<kbd>S</kbd>, <kbd>Ctrl</kbd>+<kbd>O</kbd>, <kbd>F5</kbd> - дата. Окно к краю экрана - прикрепить.</p>' },
  };
  let tabs = [{ hist: ['about:newtab'], i: 0 }], cur = 0;
  function render() {
    const t = tabs[cur], url = t.hist[t.i], p = PAGES[url];
    w.body.innerHTML = '<div class="browser"><div class="b-tabs">' + tabs.map((x, i) => { const u = x.hist[x.i]; return '<div class="b-tab' + (i === cur ? ' on' : '') + '" data-tab="' + i + '"><span>' + esc(PAGES[u] ? PAGES[u].t : 'Нет подключения') + '</span><button class="bx" data-tx="' + i + '" title="Закрыть вкладку">' + SI.x + '</button></div>'; }).join('') + '<button class="b-new" data-newtab title="Новая вкладка">+</button></div>' +
      '<div class="b-bar"><button class="tbtn" data-b="back"' + (t.i ? '' : ' disabled') + ' aria-label="Назад">' + SI.back + '</button><button class="tbtn" data-b="fwd"' + (t.i < t.hist.length - 1 ? '' : ' disabled') + ' aria-label="Вперёд">' + SI.fwd + '</button><button class="tbtn" data-b="reload" aria-label="Обновить">' + SI.refresh + '</button>' +
      '<form data-url><input value="' + (url === 'about:newtab' ? '' : esc(url)) + '" placeholder="Поиск или адрес" aria-label="Адрес" spellcheck="false"></form><button class="tbtn" data-b="home" aria-label="Домой">' + SI.home + '</button></div><div class="b-page">' +
      (p ? p.h() : '<div style="text-align:center;padding-top:10vh"><div style="font-size:64px">📡</div><h1>Нет подключения к Интернету</h1><p>Адрес <b>' + esc(url) + '</b> не открыт: оболочка работает без сети и не загружает внешние сайты.</p><p><button class="btn accent" data-go="about:newtab">Новая вкладка</button></p></div>') + '</div></div>';
    w.setTitle((p ? p.t : 'Нет подключения') + ' - Браузер');
  }
  function nav(u) {
    u = u.trim(); if (!u) return;
    if (u.startsWith('app:')) { openApp(u.slice(4)); return; }
    if (!/^[a-z]+:/i.test(u)) u = /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(u) ? 'https://' + u : 'about:help';
    const t = tabs[cur]; t.hist = t.hist.slice(0, t.i + 1); t.hist.push(u); t.i++; render();
  }
  w.body.addEventListener('submit', e => { e.preventDefault(); nav(e.target.querySelector('input').value); });
  w.body.addEventListener('click', e => {
    const g = e.target.closest('[data-go]'); if (g) { nav(g.dataset.go); return; }
    const x = e.target.closest('[data-tx]'); if (x) { e.stopPropagation(); tabs.splice(+x.dataset.tx, 1); if (!tabs.length) tabs = [{ hist: ['about:newtab'], i: 0 }]; cur = Math.min(cur, tabs.length - 1); render(); return; }
    const tb = e.target.closest('[data-tab]'); if (tb) { cur = +tb.dataset.tab; render(); return; }
    if (e.target.closest('[data-newtab]')) { tabs.push({ hist: ['about:newtab'], i: 0 }); cur = tabs.length - 1; render(); return; }
    const b = e.target.closest('[data-b]'); if (!b || b.disabled) return;
    const t = tabs[cur];
    if (b.dataset.b === 'back') t.i--; else if (b.dataset.b === 'fwd') t.i++; else if (b.dataset.b === 'home') { nav('about:newtab'); return; }
    render();
  });
  render();
}

// ---------------- Фотографии ----------------
function createPhotos(w, start) {
  let view = null; // путь файла или ключ обоев 'wall:<id>'
  const listAll = () => [...[...FS.values()].filter(e => e.type === 'file' && isImage(e.path)).map(e => e.path), ...Object.keys(WALLS).map(k => 'wall:' + k)];
  const bgOf = id => { if (id.startsWith('wall:')) return WALLS[id.slice(5)].css(S.theme === 'dark'); const u = fileUrl(FS.get(id)); return u ? 'url("' + u + '")' : 'none'; };
  const nameOf = id => id.startsWith('wall:') ? WALLS[id.slice(5)].name : baseName(id);
  w.onArg = p => { view = p; render(); };
  if (start) view = start;
  function render() {
    const imgs = [...FS.values()].filter(e => e.type === 'file' && isImage(e.path));
    let html = '<div class="photos"><div class="cmdbar"><button class="tbtn" data-ph="import">' + SI.import + ' Импорт</button><button class="tbtn" data-open-app="explorer">' + SI.open + ' Папка «Изображения»</button></div><div class="ph-grid">' +
      '<div class="ph-sec">Ваши изображения (' + imgs.length + ')</div>' + (imgs.length ? imgs.map(e => '<button class="ph-tile" data-view="' + esc(e.path) + '" title="' + esc(baseName(e.path)) + '" style="background-image:url(&quot;' + (fileUrl(e) || '') + '&quot;)"></button>').join('') : '<div class="muted" style="grid-column:1/-1;padding:0 4px">Импортируйте картинки или сохраните их в «Изображения»</div>') +
      '<div class="ph-sec">Обои оболочки</div>' + Object.entries(WALLS).map(([k, v]) => '<button class="ph-tile" data-view="wall:' + k + '" title="' + v.name + '" style="background:' + esc(v.css(S.theme === 'dark')) + ';background-size:cover"></button>').join('') + '</div><input type="file" accept="image/*" multiple hidden class="ph-in"></div>';
    if (view) {
      const all = listAll(), i = all.indexOf(view);
      html += '<div class="ph-view"><div class="pv-bar"><button class="tbtn" data-ph="close" aria-label="Назад">' + SI.back + '</button><span>' + esc(nameOf(view)) + ' · ' + (i + 1) + ' из ' + all.length + '</span>' +
        '<button class="tbtn" data-ph="zoom" title="Масштаб">🔍</button><button class="tbtn" data-ph="wall" title="Сделать фоном">' + SI.wallpaper + ' Фон</button>' + (view.startsWith('wall:') ? '' : '<button class="tbtn" data-ph="del" title="Удалить">' + SI.trash + '</button>') +
        '<button class="tbtn" data-ph="prev" aria-label="Предыдущее">' + SI.back + '</button><button class="tbtn" data-ph="next" aria-label="Следующее">' + SI.fwd + '</button></div><div class="pv-img" style="background-image:' + bgOf(view).replace(/"/g, '&quot;') + '"></div></div>';
    }
    w.body.innerHTML = html;
    w.setTitle(view ? nameOf(view) + ' - Фотографии' : 'Фотографии');
  }
  let zoomed = false;
  w.body.addEventListener('click', async e => {
    const v = e.target.closest('[data-view]'); if (v) { view = v.dataset.view; zoomed = false; render(); return; }
    const b = e.target.closest('[data-ph]'); if (!b) return;
    const all = listAll(), i = all.indexOf(view);
    if (b.dataset.ph === 'import') w.body.querySelector('.ph-in').click();
    else if (b.dataset.ph === 'close') { view = null; render(); }
    else if (b.dataset.ph === 'prev' || b.dataset.ph === 'next') { view = all[(i + (b.dataset.ph === 'next' ? 1 : -1) + all.length) % all.length]; render(); }
    else if (b.dataset.ph === 'wall') { setS({ wallpaper: view.startsWith('wall:') ? view.slice(5) : 'fs:' + view }); notify({ app: 'photos', title: 'Фон изменён', body: nameOf(view) }); }
    else if (b.dataset.ph === 'del') { trashPath(view); view = null; render(); }
    else if (b.dataset.ph === 'zoom') { zoomed = !zoomed; w.body.querySelector('.pv-img').style.transform = zoomed ? 'scale(1.8)' : ''; }
  });
  w.body.addEventListener('change', async e => { if (e.target.classList.contains('ph-in')) { for (const f of e.target.files) await importFile('Изображения', f); e.target.value = ''; } });
  w.onKey = e => { if (!view) return; if (e.key === 'Escape') { view = null; render(); } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const all = listAll(), i = all.indexOf(view); view = all[(i + (e.key === 'ArrowRight' ? 1 : -1) + all.length) % all.length]; render(); } };
  w.cleanup.push(on('fs', render), on('settings', render));
  render();
}

// ---------------- Медиаплеер: мелодии синтезируются (WebAudio), файлов и сети не нужно ----------------
const TRACKS = [['Утренний свет', 'Синтезатор', 0], ['Тихая гавань', 'Волны', 3], ['Северный ветер', 'Аврора', 5], ['Городские огни', 'Неон', 7], ['Колыбельная', 'Тихий час', 10]].map(([t, a, k], i) => ({ id: i, title: t, artist: a, key: k, len: 24 }));
const player = { idx: -1, playing: false, ctx: null, gain: null, nodes: [], startAt: 0, offset: 0, shuffle: false, repeat: false, timer: null };
function pNow() { return player.ctx ? player.ctx.currentTime : performance.now() / 1000; }
function pStop() { player.nodes.forEach(n => { try { n.stop(); } catch (e) { /* уже */ } }); player.nodes = []; }
function pPlay(idx, from = 0) {
  if (idx !== undefined) player.idx = idx;
  if (player.idx < 0) player.idx = 0;
  try { player.ctx = player.ctx || new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { player.ctx = null; }
  pStop(); player.playing = true; player.offset = from;
  const tr = TRACKS[player.idx];
  if (player.ctx) {
    if (player.ctx.state === 'suspended') player.ctx.resume();
    if (!player.gain) { player.gain = player.ctx.createGain(); player.gain.connect(player.ctx.destination); }
    player.gain.gain.value = S.muted ? 0 : S.volume / 100;
    const scale = [0, 2, 4, 7, 9, 12, 14], root = 220 * Math.pow(2, tr.key / 12), beat = 0.32;
    let seed = tr.id * 7919 + 13; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    const t0 = player.ctx.currentTime - from;
    for (let x = 0, n = 0; x < tr.len; x += beat, n++) {
      const note = scale[Math.floor(rnd() * scale.length)]; if (x < from) continue;
      const o = player.ctx.createOscillator(), g = player.ctx.createGain();
      o.type = n % 4 === 0 ? 'triangle' : 'sine'; o.frequency.value = root * Math.pow(2, note / 12);
      g.gain.setValueAtTime(0, t0 + x); g.gain.linearRampToValueAtTime(0.22, t0 + x + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t0 + x + beat * 0.95);
      o.connect(g); g.connect(player.gain); o.start(t0 + x); o.stop(t0 + x + beat); player.nodes.push(o);
    }
  }
  player.startAt = pNow() - from;
  clearInterval(player.timer); player.timer = setInterval(pTick, 250);
  emit('player');
}
function pPause() { if (!player.playing) return; player.offset = Math.min(TRACKS[player.idx].len, pNow() - player.startAt); player.playing = false; pStop(); clearInterval(player.timer); emit('player'); }
function pPos() { return player.idx < 0 ? 0 : player.playing ? Math.min(TRACKS[player.idx].len, pNow() - player.startAt) : player.offset; }
function pSkip(d) { const n = player.shuffle ? Math.floor(Math.random() * TRACKS.length) : (player.idx + d + TRACKS.length) % TRACKS.length; pPlay(n); }
function pTick() { if (player.playing && pPos() >= TRACKS[player.idx].len) { if (player.repeat) pPlay(player.idx); else pSkip(1); } emit('playerTick'); }
on('settings', () => { if (player.gain) player.gain.gain.value = S.muted ? 0 : S.volume / 100; });
on('visibility', hidden => { if (hidden && player.playing) { pPause(); player.pausedByTab = true; } else if (!hidden && player.pausedByTab) { player.pausedByTab = false; pPlay(player.idx, player.offset); } });
on('lock', () => pPause());
function createMedia(w) {
  const mm = s => Math.floor(s / 60) + ':' + pad(Math.floor(s % 60));
  function render() {
    const tr = TRACKS[player.idx];
    w.body.innerHTML = '<div class="media"><div class="media-main"><div class="navpane scroll"><button class="nav-item active">' + SI.home + '<span>Музыкальная библиотека</span></button></div><div class="media-list scroll"><h2 style="font-family:var(--font-display);font-weight:600;font-size:24px;margin:8px 10px 12px">Музыка</h2>' +
      TRACKS.map(t => '<button class="track' + (t.id === player.idx ? ' on' : '') + '" data-tr="' + t.id + '"><span>' + (t.id === player.idx && player.playing ? '▶' : t.id + 1) + '</span><span>' + t.title + '</span><small>' + t.artist + '</small><small>' + mm(t.len) + '</small></button>').join('') +
      '<p class="muted" style="font-size:12px;margin:12px 10px">Мелодии собираются прямо в браузере (WebAudio), без файлов и без сети. Громкость - общая, как на панели задач.</p></div></div>' +
      '<div class="media-bar"><div class="mb-info"><div class="mb-art" style="background:linear-gradient(135deg,hsl(' + ((tr ? tr.key : 0) * 30) + ',80%,60%),hsl(' + ((tr ? tr.key : 0) * 30 + 60) + ',70%,40%))"></div><div style="min-width:0"><b>' + (tr ? tr.title : 'Ничего не играет') + '</b><small>' + (tr ? tr.artist : 'Выберите трек') + '</small></div></div>' +
      '<div class="mb-center"><div class="mb-btns"><button class="tbtn' + (player.shuffle ? ' on' : '') + '" data-p="shuffle" title="Перемешать" style="' + (player.shuffle ? 'color:var(--accent)' : '') + '">⇄</button><button class="tbtn" data-p="prev" aria-label="Предыдущий">' + SI.prev + '</button>' +
      '<button class="mb-play" data-p="play" aria-label="' + (player.playing ? 'Пауза' : 'Играть') + '">' + (player.playing ? SI.pause : SI.play) + '</button><button class="tbtn" data-p="next" aria-label="Следующий">' + SI.next + '</button><button class="tbtn" data-p="repeat" title="Повтор" style="' + (player.repeat ? 'color:var(--accent)' : '') + '">↻</button></div>' +
      '<div class="mb-seek"><span class="mb-cur">' + mm(pPos()) + '</span><input type="range" min="0" max="' + (tr ? tr.len : 1) + '" step="0.1" value="' + pPos() + '" data-seek aria-label="Позиция"><span>' + (tr ? mm(tr.len) : '0:00') + '</span></div></div>' +
      '<div class="mb-right">' + SI.vol + '<input type="range" min="0" max="100" value="' + (S.muted ? 0 : S.volume) + '" data-vol aria-label="Громкость"></div></div></div>';
  }
  w.body.addEventListener('click', e => {
    const t = e.target.closest('[data-tr]'); if (t) { pPlay(+t.dataset.tr); return; }
    const b = e.target.closest('[data-p]'); if (!b) return;
    const k = b.dataset.p;
    if (k === 'play') { if (player.playing) pPause(); else if (player.idx < 0) pPlay(0); else pPlay(player.idx, player.offset); }
    else if (k === 'prev' || k === 'next') pSkip(k === 'next' ? 1 : -1);
    else if (k === 'shuffle') { player.shuffle = !player.shuffle; render(); }
    else if (k === 'repeat') { player.repeat = !player.repeat; render(); }
  });
  w.body.addEventListener('input', e => {
    if (e.target.matches('[data-seek]') && player.idx >= 0) { const v = +e.target.value; if (player.playing) pPlay(player.idx, v); else player.offset = v; }
    if (e.target.matches('[data-vol]')) setS({ volume: +e.target.value, muted: +e.target.value === 0 });
  });
  w.onKey = e => { if (e.key === ' ') { e.preventDefault(); w.body.querySelector('[data-p=play]').click(); } };
  w.cleanup.push(on('player', render), on('playerTick', () => { const c = w.body.querySelector('.mb-cur'), s = w.body.querySelector('[data-seek]'); if (c) c.textContent = mm(pPos()); if (s && document.activeElement !== s) s.value = pPos(); }), () => pPause());
  render();
}

// ---------------- Часы: будильник, таймер, секундомер, мировое время ----------------
let ALARMS = store.get('alarms', [{ t: '07:00', label: 'Будильник', on: false }]);
const timerState = { left: 5 * 60000, end: 0, run: false, total: 5 * 60000 };
const swState = { acc: 0, start: 0, run: false, laps: [] };
let lastAlarmMinute = '';
on('tick', () => {
  const n = new Date(), hm = pad(n.getHours()) + ':' + pad(n.getMinutes());
  if (hm !== lastAlarmMinute) { lastAlarmMinute = hm; ALARMS.filter(a => a.on && a.t === hm).forEach(a => notify({ app: 'clock', title: 'Будильник ' + a.t, body: a.label })); }
  if (timerState.run && Date.now() >= timerState.end) { timerState.run = false; timerState.left = 0; notify({ app: 'clock', title: 'Таймер', body: 'Время вышло!' }); emit('clockState'); }
});
function createClock(w, tab0) {
  let tab = tab0 || 'timer';
  const ZONES = [['Москва', 'Europe/Moscow'], ['Лондон', 'Europe/London'], ['Нью-Йорк', 'America/New_York'], ['Токио', 'Asia/Tokyo'], ['Сидней', 'Australia/Sydney']];
  const hms = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return pad(Math.floor(s / 3600)) + ':' + pad(Math.floor(s / 60) % 60) + ':' + pad(s % 60); };
  const swf = ms => pad(Math.floor(ms / 60000)) + ':' + pad(Math.floor(ms / 1000) % 60) + ',' + pad(Math.floor(ms / 10) % 100);
  const swNow = () => swState.acc + (swState.run ? Date.now() - swState.start : 0);
  function main() {
    if (tab === 'timer') { const left = timerState.run ? timerState.end - Date.now() : timerState.left; return '<h1>Таймер</h1><div class="big-num" data-tval>' + hms(left) + '</div><div class="row-actions" style="margin-bottom:16px">' + [1, 3, 5, 10, 25].map(m => '<button class="btn" data-preset="' + m + '"' + (timerState.run ? ' disabled' : '') + '>' + m + ' мин</button>').join('') + '</div><div class="row-actions"><button class="btn accent" data-t="go">' + (timerState.run ? SI.pause + ' Пауза' : SI.play + ' Старт') + '</button><button class="btn" data-t="reset">' + SI.restart + ' Сброс</button></div><p class="muted" style="text-align:center;margin-top:16px;font-size:13px">Когда время выйдет, придёт уведомление.</p>'; }
    if (tab === 'alarm') return '<h1>Будильник</h1><form class="row-actions" style="justify-content:flex-start;margin-bottom:16px" data-addalarm><input type="time" class="field" name="t" value="08:00" aria-label="Время"><input class="field" name="label" placeholder="Название" maxlength="30"><button class="btn accent">' + SI.plus + ' Добавить</button></form><div class="card-list">' +
      (ALARMS.length ? ALARMS.map((a, i) => '<div class="a-card' + (a.on ? '' : ' off') + '"><div class="a-time">' + a.t + '</div><button class="tbtn a-del" data-adel="' + i + '" title="Удалить">' + SI.trash + '</button><div class="a-foot"><span>' + esc(a.label) + '</span><button class="toggle' + (a.on ? ' on' : '') + '" data-aon="' + i + '" aria-label="Включить"></button></div></div>').join('') : '<div class="muted">Будильников нет</div>') + '</div><p class="muted" style="margin-top:16px;font-size:13px">Будильник срабатывает, пока эта страница открыта.</p>';
    if (tab === 'stop') return '<h1>Секундомер</h1><div class="big-num" data-swval>' + swf(swNow()) + '</div><div class="row-actions"><button class="btn accent" data-s="go">' + (swState.run ? SI.pause + ' Стоп' : SI.play + ' Старт') + '</button><button class="btn" data-s="lap"' + (swState.run ? '' : (swState.acc ? '' : ' disabled')) + '>' + (swState.run ? 'Круг' : 'Сброс') + '</button></div><div class="laps">' + swState.laps.map((l, i) => '<div><span>Круг ' + (swState.laps.length - i) + '</span><span>' + swf(l) + '</span></div>').join('') + '</div>';
    return '<h1>Мировое время</h1><div class="card-list">' + ZONES.map(([n, tz]) => '<div class="a-card"><div class="a-time">' + new Date().toLocaleTimeString('ru-RU', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: !S.time24 }) + '</div><div class="a-foot"><span>' + n + '</span><span>' + new Date().toLocaleDateString('ru-RU', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' }) + '</span></div></div>').join('') + '</div>';
  }
  function render() {
    w.body.innerHTML = '<div class="clockapp"><div class="navpane scroll" style="width:200px">' + [['timer', 'Таймер', SI.time], ['alarm', 'Будильник', SI.bell], ['stop', 'Секундомер', SI.time], ['world', 'Мировое время', SI.network]].map(([k, n, ic]) => '<button class="nav-item' + (k === tab ? ' active' : '') + '" data-tab="' + k + '">' + ic + '<span>' + n + '</span></button>').join('') + '</div><div class="clock-main scroll">' + main() + '</div></div>';
  }
  const saveAl = () => store.set('alarms', ALARMS);
  w.body.addEventListener('click', e => {
    const t = e.target.closest('[data-tab]'); if (t) { tab = t.dataset.tab; render(); return; }
    const p = e.target.closest('[data-preset]'); if (p && !p.disabled) { timerState.left = timerState.total = +p.dataset.preset * 60000; render(); return; }
    const tt = e.target.closest('[data-t]');
    if (tt) { if (tt.dataset.t === 'go') { if (timerState.run) { timerState.left = timerState.end - Date.now(); timerState.run = false; } else if (timerState.left > 0) { timerState.end = Date.now() + timerState.left; timerState.run = true; } } else { timerState.run = false; timerState.left = timerState.total; } render(); return; }
    const s = e.target.closest('[data-s]');
    if (s && !s.disabled) { if (s.dataset.s === 'go') { if (swState.run) { swState.acc += Date.now() - swState.start; swState.run = false; } else { swState.start = Date.now(); swState.run = true; } } else if (swState.run) swState.laps.unshift(swNow()); else { swState.acc = 0; swState.laps = []; } render(); return; }
    const ad = e.target.closest('[data-adel]'); if (ad) { ALARMS.splice(+ad.dataset.adel, 1); saveAl(); render(); return; }
    const ao = e.target.closest('[data-aon]'); if (ao) { ALARMS[+ao.dataset.aon].on = !ALARMS[+ao.dataset.aon].on; saveAl(); render(); }
  });
  w.body.addEventListener('submit', e => { e.preventDefault(); const f = e.target; if (!f.t.value) return; ALARMS.push({ t: f.t.value, label: f.label.value.trim() || 'Будильник', on: true }); ALARMS.sort((a, b) => a.t.localeCompare(b.t)); saveAl(); render(); });
  const iv = setInterval(() => {
    const tv = w.body.querySelector('[data-tval]'); if (tv) tv.textContent = hms(timerState.run ? timerState.end - Date.now() : timerState.left);
    const sv = w.body.querySelector('[data-swval]'); if (sv) sv.textContent = swf(swNow());
  }, 50);
  w.cleanup.push(() => clearInterval(iv), on('clockState', render), on('tick', () => { if (tab === 'world' && new Date().getSeconds() === 0) render(); }));
  render();
}

// ---------------- Погода (демо-данные) ----------------
function createWeather(w) {
  const d = new Date(), temp = h => Math.round(16 + 4 * Math.sin((h - 9) / 24 * Math.PI * 2));
  const hours = Array.from({ length: 10 }, (_, i) => { const h = (d.getHours() + i) % 24; return [i ? pad(h) + ':00' : 'Сейчас', h < 6 || h > 20 ? '🌙' : ['⛅', '☁️', '🌤️', '☀️'][i % 4], temp(h)]; });
  const days = Array.from({ length: 7 }, (_, i) => { const x = new Date(d); x.setDate(d.getDate() + i); return [i ? ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'][x.getDay()] + ', ' + x.getDate() : 'Сегодня', ['⛅', '🌧️', '☀️', '☀️', '⛅', '🌦️', '☀️'][i], 11 + i % 4, 18 + (i * 3) % 7]; });
  w.body.innerHTML = '<div class="weather"><div class="w-now"><div style="font-size:72px">⛅</div><div><div style="font-size:18px">Лиссабон</div><div class="w-temp">' + temp(d.getHours()) + '°</div><div>Переменная облачность · ощущается как ' + (temp(d.getHours()) - 1) + '°</div></div></div>' +
    '<div class="w-cards">' + hours.map(h => '<div class="w-card"><div>' + h[0] + '</div><div style="font-size:26px;margin:6px 0">' + h[1] + '</div><b>' + h[2] + '°</b></div>').join('') + '</div>' +
    '<div class="w-cards">' + days.map(x => '<div class="w-card"><div>' + x[0] + '</div><div style="font-size:26px;margin:6px 0">' + x[1] + '</div><b>' + x[3] + '°</b> <span style="opacity:.7">' + x[2] + '°</span></div>').join('') + '</div>' +
    '<div class="w-note">Демо-данные: оболочка не ходит в интернет, прогноз сгенерирован по времени суток.</div></div>';
}

// ---------------- Терминал: команды над той же файловой системой ----------------
function createTerminal(w, startDir) {
  let cwd = startDir && FS.has(startDir) && FS.get(startDir).type === 'dir' ? startDir : '';
  const hist = []; let hi = -1;
  w.arg = startDir;
  w.body.innerHTML = '<div class="term"><div class="term-tabs"><span>' + SI.term + ' Командная строка</span></div><div class="term-out scroll" tabindex="0"></div></div>';
  const out = w.body.querySelector('.term-out');
  const winPath = p => 'C:\\Пользователь' + (p ? '\\' + p.replace(/\//g, '\\') : '');
  const print = (t, cls) => { const d = document.createElement('div'); if (cls) d.className = cls; d.textContent = t; out.insertBefore(d, out.querySelector('.term-line')); };
  function resolve(arg) {
    if (!arg) return cwd;
    let a = arg.replace(/\\/g, '/').replace(/^"|"$/g, '');
    if (/^c:\/?(пользователь)?\/?/i.test(a)) a = '/' + a.replace(/^c:\/?(пользователь)?\/?/i, '');
    let parts = a.startsWith('/') ? [] : (cwd ? cwd.split('/') : []);
    for (const seg of a.split('/').filter(Boolean)) { if (seg === '.') continue; if (seg === '..') parts.pop(); else parts.push(seg); }
    const p = parts.join('/');
    // регистр букв как в системе не важен
    if (FS.has(p) || p === '') return p;
    const found = [...FS.keys()].find(k => k.toLowerCase() === p.toLowerCase());
    return found !== undefined ? found : p;
  }
  function prompt() {
    const line = document.createElement('div'); line.className = 'term-line';
    line.innerHTML = '<span></span><input aria-label="Команда" spellcheck="false" autocomplete="off">';
    line.querySelector('span').textContent = winPath(cwd) + '>';
    out.appendChild(line);
    const inp = line.querySelector('input'); inp.focus({ preventScroll: true }); setTimeout(() => { if (activeWin === w) inp.focus({ preventScroll: true }); }, 10); out.scrollTop = out.scrollHeight;
    inp.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') { const cmd = inp.value; line.remove(); print(winPath(cwd) + '>' + cmd); if (cmd.trim()) { hist.unshift(cmd); } hi = -1; run(cmd.trim()); if (wins.includes(w)) prompt(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (hi < hist.length - 1) hi++; inp.value = hist[hi] || ''; }
      else if (e.key === 'ArrowDown') { e.preventDefault(); if (hi > -1) hi--; inp.value = hi < 0 ? '' : hist[hi]; }
      else if (e.key === 'Tab') { e.preventDefault(); const parts = inp.value.split(' '), last = parts.pop(); const m = childrenOf(cwd).map(x => baseName(x.path)).find(n => n.toLowerCase().startsWith(last.toLowerCase())); if (m) inp.value = parts.concat(m.includes(' ') ? '"' + m + '"' : m).join(' '); }
      else if (e.code === 'KeyL' && e.ctrlKey) { e.preventDefault(); out.innerHTML = ''; prompt(); }
    });
  }
  const args = s => (s.match(/"[^"]*"|\S+/g) || []).map(x => x.replace(/^"|"$/g, ''));
  function run(cmd) {
    if (!cmd) return;
    let redirect = null;
    const m = cmd.match(/^(echo\s+.*?)\s*(>>?)\s*(.+)$/i);
    if (m) { cmd = m[1]; redirect = { append: m[2] === '>>', file: m[3].trim() }; }
    const [c0, ...a] = args(cmd), c = c0.toLowerCase();
    const need = () => { print('Синтаксическая ошибка в команде.', 'err'); };
    switch (c) {
      case 'help': ['Команды:', '  DIR [папка]        список файлов (ls)', '  CD [папка]         сменить папку, CD .. - вверх', '  MD имя             создать папку (mkdir)', '  RD имя             удалить папку в корзину (rmdir)', '  DEL имя            удалить файл в корзину (rm)', '  TYPE имя           показать текст файла (cat)', '  ECHO текст [> имя] вывести текст или записать в файл', '  COPY из в          копировать', '  MOVE из в          переместить', '  REN имя новое      переименовать', '  TREE               дерево папок', '  START имя          открыть файл, папку или приложение', '  CLS, DATE, TIME, VER, WHOAMI, EXIT'].forEach(l => print(l)); break;
      case 'dir': case 'ls': {
        const d = resolve(a[0]); const e = d === '' ? { type: 'dir' } : FS.get(d);
        if (!e || e.type !== 'dir') { print('Файл не найден', 'err'); break; }
        print(' Содержимое папки ' + winPath(d), 'dim'); print('');
        const list = d === '' ? ROOTS.map(r => FS.get(r)) : childrenOf(d);
        list.forEach(x => print(fmtStamp(x.mtime).padEnd(20) + (x.type === 'dir' ? '<DIR>'.padEnd(10) : String(x.size || 0).padStart(9) + ' ') + ' ' + baseName(x.path)));
        print('               ' + list.filter(x => x.type === 'file').length + ' файлов, ' + list.filter(x => x.type === 'dir').length + ' папок', 'dim'); break;
      }
      case 'cd': case 'chdir': { if (!a[0]) { print(winPath(cwd)); break; } const d = resolve(a[0]); if (d === '' || (FS.has(d) && FS.get(d).type === 'dir')) cwd = d; else print('Системе не удаётся найти указанный путь.', 'err'); break; }
      case 'md': case 'mkdir': { if (!a[0]) { need(); break; } const p = resolve(a[0]), err = nameError(parentOf(p), baseName(p)); if (parentOf(p) === '' || !FS.has(parentOf(p)) && parentOf(p) !== '') { print('Нельзя создать папку здесь.', 'err'); break; } if (err) print(err, 'err'); else makeDir(p); break; }
      case 'rd': case 'rmdir': case 'del': case 'rm': case 'erase': {
        if (!a[0]) { need(); break; } const p = resolve(a[0]); const e = FS.get(p);
        if (!e || ROOTS.includes(p)) { print('Не удаётся найти ' + a[0], 'err'); break; }
        if ((c === 'rd' || c === 'rmdir') && e.type !== 'dir') { print('Неверно задано имя папки.', 'err'); break; }
        if ((c === 'del' || c === 'erase') && e.type === 'dir') { print('Для папок используйте RD.', 'err'); break; }
        trashPath(p); print('Перемещено в корзину: ' + baseName(p), 'ok'); break;
      }
      case 'type': case 'cat': { const p = resolve(a[0]); const e = FS.get(p); if (!e || e.type !== 'file') { print('Не удаётся найти указанный файл.', 'err'); break; } if (e.text == null || isImage(p) && !e.text) { print('Это двоичный файл.', 'err'); break; } e.text.split('\n').forEach(l => print(l)); break; }
      case 'echo': {
        const text = cmd.replace(/^echo\s?/i, '');
        if (!redirect) { print(text || 'ECHO включён.'); break; }
        const p = resolve(redirect.file); if (parentOf(p) === '' || !FS.has(parentOf(p))) { print('Нельзя записать файл здесь.', 'err'); break; }
        const old = FS.get(p); writeFile(p, (redirect.append && old && old.text ? old.text + '\n' : '') + text); break;
      }
      case 'copy': case 'move': case 'mv': case 'cp': {
        if (a.length < 2) { need(); break; } const from = resolve(a[0]), to = resolve(a[1]);
        if (!FS.has(from)) { print('Не удаётся найти указанный файл.', 'err'); break; }
        const dir = FS.has(to) && FS.get(to).type === 'dir' ? to : null;
        if (!dir) { print('Укажите существующую папку назначения.', 'err'); break; }
        if (intoItself(from, dir)) { print('Нельзя ' + (c.startsWith('c') ? 'скопировать' : 'переместить') + ' папку в саму себя.', 'err'); break; }
        const r = c === 'copy' || c === 'cp' ? copyPath(from, dir) : movePath(from, dir);
        print(r ? (c.startsWith('c') ? 'Скопировано файлов: 1.' : 'Перемещено файлов: 1.') : 'Операция невозможна.', r ? 'ok' : 'err'); break;
      }
      case 'ren': case 'rename': { if (a.length < 2) { need(); break; } const p = resolve(a[0]); if (!FS.has(p) || ROOTS.includes(p)) { print('Не удаётся найти указанный файл.', 'err'); break; } const err = nameError(parentOf(p), a[1], p); if (err) print(err, 'err'); else renamePath(p, a[1]); break; }
      case 'tree': { const walk = (d, pre) => childrenOf(d).filter(x => x.type === 'dir').forEach((x, i, arr) => { print(pre + (i === arr.length - 1 ? '└───' : '├───') + baseName(x.path)); walk(x.path, pre + (i === arr.length - 1 ? '    ' : '│   ')); }); print(winPath(cwd)); if (cwd === '') ROOTS.forEach((r, i) => { print((i === ROOTS.length - 1 ? '└───' : '├───') + r); walk(r, i === ROOTS.length - 1 ? '    ' : '│   '); }); else walk(cwd, ''); break; }
      case 'start': case 'open': {
        const name = a.join(' '); if (!name) { openApp('terminal', cwd); break; }
        const id = Object.keys(APPS).find(k => k === name.toLowerCase() || APPS[k].title.toLowerCase() === name.toLowerCase());
        if (id) { openApp(id); break; }
        const p = resolve(name); if (p === '' || FS.has(p)) openPath(p === '' ? '' : p); else print('Не удаётся найти «' + name + '».', 'err'); break;
      }
      case 'cls': case 'clear': out.innerHTML = ''; break;
      case 'date': print('Текущая дата: ' + fmtDate(new Date())); break;
      case 'time': print('Текущее время: ' + fmtTime(new Date(), true)); break;
      case 'ver': print('Windows-подобная оболочка [версия 3.0] - фан-концепт, не связан с Microsoft/Apple/Samsung'); break;
      case 'whoami': print('пк\\пользователь'); break;
      case 'exit': closeWin(w); break;
      default: print('«' + c0 + '» не является внутренней или внешней командой. Наберите HELP.', 'err');
    }
  }
  print('Windows-подобная оболочка [версия 3.0]', 'dim');
  print('Фан-концепт интерфейса, не связан с Microsoft/Apple/Samsung. Наберите HELP.', 'dim'); print('');
  prompt();
  out.addEventListener('click', () => { if (!getSelection().toString()) { const i = out.querySelector('.term-line input'); if (i) i.focus(); } });
  w.setTitle('Командная строка');
}

// ================= Рабочий стол =================
const SYS_ICONS = [{ id: 'pc', label: 'Этот компьютер', icon: () => ICON.pc, open: () => openApp('explorer', '') }, { id: 'recycle', label: 'Корзина', icon: () => TRASH.length ? ICON.recycleFull : ICON.recycle, open: () => openApp('recycle') }];
let deskSel = new Set(), deskRenaming = null;
function renderDesktop() {
  const files = childrenOf('Рабочий стол', S.sortIcons);
  const box = $('desktop-icons');
  box.innerHTML = SYS_ICONS.map(s => '<div class="dicon' + (deskSel.has('sys:' + s.id) ? ' selected' : '') + '" data-sys="' + s.id + '" tabindex="0" ' + (s.id === 'recycle' ? 'data-drop="__trash"' : '') + '><div class="ic">' + s.icon() + '</div><span>' + s.label + '</span></div>').join('') +
    files.map(e => '<div class="dicon' + (deskSel.has(e.path) ? ' selected' : '') + '" data-p="' + esc(e.path) + '" draggable="true" tabindex="0"' + (e.type === 'dir' ? ' data-drop="' + esc(e.path) + '"' : '') + '><div class="ic">' + fileIcon(e.path) + '</div>' +
      (deskRenaming === e.path ? '<input class="rename" value="' + esc(baseName(e.path)) + '">' : '<span>' + esc(baseName(e.path)) + '</span>') + '</div>').join('');
  const r = box.querySelector('.rename'); if (r) { r.focus(); const dot = r.value.lastIndexOf('.'); r.setSelectionRange(0, dot > 0 ? dot : r.value.length); }
}
function deskOpen(el) { if (el.dataset.sys) SYS_ICONS.find(s => s.id === el.dataset.sys).open(); else openPath(el.dataset.p); }
$('desktop').addEventListener('click', e => {
  const d = e.target.closest('.dicon');
  if (d && e.target.closest('.rename')) return;
  const key = d ? (d.dataset.sys ? 'sys:' + d.dataset.sys : d.dataset.p) : null;
  if (!d) deskSel.clear(); else if (e.ctrlKey) { deskSel.has(key) ? deskSel.delete(key) : deskSel.add(key); } else deskSel = new Set([key]);
  document.querySelectorAll('.dicon').forEach(x => x.classList.toggle('selected', deskSel.has(x.dataset.sys ? 'sys:' + x.dataset.sys : x.dataset.p)));
});
$('desktop').addEventListener('dblclick', e => { const d = e.target.closest('.dicon'); if (d && !e.target.closest('.rename')) deskOpen(d); });
$('desktop').addEventListener('keydown', e => {
  const r = e.target.closest('.rename');
  if (r) { if (e.key === 'Enter') finishDeskRename(r); if (e.key === 'Escape') { deskRenaming = null; renderDesktop(); } e.stopPropagation(); return; }
  const d = e.target.closest('.dicon'); if (!d) return;
  if (e.key === 'Enter') deskOpen(d);
  if (e.key === 'Delete' && d.dataset.p) trashPath(d.dataset.p);
  if (e.key === 'F2' && d.dataset.p) { deskRenaming = d.dataset.p; renderDesktop(); }
});
$('desktop').addEventListener('focusout', e => { if (e.target.classList && e.target.classList.contains('rename') && deskRenaming) finishDeskRename(e.target); });
function finishDeskRename(inp) { const old = deskRenaming; deskRenaming = null; const n = inp.value.trim(); const err = nameError('Рабочий стол', n, old); if (n && n !== baseName(old) && !err) renamePath(old, n); else if (err && n !== baseName(old)) notify({ app: 'explorer', title: 'Переименование', body: err }); renderDesktop(); }
$('desktop').addEventListener('contextmenu', e => {
  e.preventDefault(); closePanels();
  const d = e.target.closest('.dicon');
  if (d && d.dataset.p) {
    const p = d.dataset.p, en = FS.get(p);
    showMenu(e.clientX, e.clientY, [
      { icons: [{ label: 'Вырезать', icon: SI.cut, action: () => { CLIP = { mode: 'cut', paths: [p] }; } }, { label: 'Копировать', icon: SI.copy, action: () => { CLIP = { mode: 'copy', paths: [p] }; } }, { label: 'Переименовать', icon: SI.rename, action: () => { deskRenaming = p; renderDesktop(); } }, { label: 'Удалить', icon: SI.trash, action: () => trashPath(p) }] },
      { label: 'Открыть', icon: SI.open, action: () => openPath(p) },
      ...(isImage(p) ? [{ label: 'Сделать фоном рабочего стола', icon: SI.wallpaper, action: () => setS({ wallpaper: 'fs:' + p }) }] : []),
      ...(en.type === 'dir' ? [{ label: 'Открыть в Терминале', icon: SI.term, action: () => openApp('terminal', p) }] : []),
    ]);
    return;
  }
  if (d && d.dataset.sys === 'recycle') { showMenu(e.clientX, e.clientY, [{ label: 'Открыть', icon: SI.open, action: () => openApp('recycle') }, { label: 'Очистить корзину', icon: SI.trash, disabled: !TRASH.length, action: emptyTrash }]); return; }
  if (d) { showMenu(e.clientX, e.clientY, [{ label: 'Открыть', icon: SI.open, action: () => deskOpen(d) }]); return; }
  showMenu(e.clientX, e.clientY, [
    { label: 'Вид', icon: SI.view, sub: [['large', 'Крупные значки'], ['medium', 'Обычные значки'], ['small', 'Мелкие значки']].map(([k, n]) => ({ label: n, checked: S.icons === k, action: () => { setS({ icons: k }); renderDesktop(); } })) },
    { label: 'Сортировка', icon: SI.sort, sub: [['name', 'Имя'], ['date', 'Дата изменения'], ['type', 'Тип']].map(([k, n]) => ({ label: n, checked: S.sortIcons === k, action: () => { setS({ sortIcons: k }); renderDesktop(); } })) },
    { label: 'Обновить', icon: SI.refresh, action: () => { $('desktop-icons').style.opacity = 0; setTimeout(() => { renderDesktop(); $('desktop-icons').style.opacity = ''; }, 120); } },
    { sep: true },
    { label: 'Вставить', icon: SI.paste, disabled: !CLIP, action: () => { CLIP.paths.forEach(p => CLIP.mode === 'cut' ? movePath(p, 'Рабочий стол') : copyPath(p, 'Рабочий стол')); if (CLIP.mode === 'cut') CLIP = null; } },
    { label: 'Создать', icon: SI.plus, sub: [{ label: 'Папку', icon: SI.newfolder, action: () => { const p = makeDir(uniquePath('Рабочий стол', 'Новая папка')).path; deskRenaming = p; renderDesktop(); } }, { label: 'Текстовый документ', icon: SI.edit, action: () => { const p = writeFile(uniquePath('Рабочий стол', 'Новый текстовый документ', '.txt'), '').path; deskRenaming = p; renderDesktop(); } }] },
    { sep: true },
    { label: 'Открыть в Терминале', icon: SI.term, action: () => openApp('terminal', 'Рабочий стол') },
    { label: 'Параметры экрана', icon: SI.display, action: () => openApp('settings', 'system') },
    { label: 'Персонализация', icon: SI.brush, action: () => openApp('settings', 'personal') },
  ]);
});
// Перетаскивание на рабочем столе: в папку, в Корзину; файлы с диска - в «Рабочий стол»
$('desktop').addEventListener('dragstart', e => { const d = e.target.closest('.dicon[data-p]'); if (d) e.dataTransfer.setData('text/x-fs', JSON.stringify([d.dataset.p])); });
$('desktop').addEventListener('dragover', e => {
  const t = e.target.closest('[data-drop]'); const fromOS = e.dataTransfer.types.includes('Files') && !e.dataTransfer.types.includes('text/x-fs');
  if (t || fromOS) { e.preventDefault(); document.querySelectorAll('.dicon.drop').forEach(x => x.classList.remove('drop')); if (t) t.classList.add('drop'); }
});
$('desktop').addEventListener('dragleave', e => { const t = e.target.closest('[data-drop]'); if (t) t.classList.remove('drop'); });
$('desktop').addEventListener('drop', async e => {
  e.preventDefault(); document.querySelectorAll('.dicon.drop').forEach(x => x.classList.remove('drop'));
  const raw = e.dataTransfer.getData('text/x-fs'), t = e.target.closest('[data-drop]');
  if (raw) { if (t) JSON.parse(raw).forEach(p => t.dataset.drop === '__trash' ? trashPath(p) : movePath(p, t.dataset.drop)); }
  else for (const f of e.dataTransfer.files) await importFile(t && t.dataset.drop !== '__trash' ? t.dataset.drop : 'Рабочий стол', f);
});
on('fs', () => { renderDesktop(); if ($('start').classList.contains('open')) renderStart(); });
on('recent', () => { if ($('start').classList.contains('open')) renderStart(); });

// ================= Запуск =================
(async function boot() {
  applySettings();
  await fsLoad();
  applySettings();
  renderDesktop();
  renderNotifs();
  renderQuick();
  updateTaskbar();
  setTimeout(() => {
    $('boot').classList.add('hidden');
    if (!dbOk) notify({ app: 'explorer', title: 'Файлы только в памяти', body: 'IndexedDB недоступна: файлы не сохранятся после перезагрузки.' });
    document.body.dataset.ready = '1';
  }, 700);
})();
