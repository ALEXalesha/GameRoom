// ================= Программы «Тахо» =================
const APPS = {
  finder: { title: 'Файлы', icon: 'files', w: 900, h: 540, minW: 520, minH: 320, multi: true, create: createFinder, menus: finderMenus },
  browser: { title: 'Браузер', icon: 'browser', w: 980, h: 620, minW: 460, minH: 320, create: createBrowser },
  textedit: { title: 'Текстовый редактор', icon: 'textedit', w: 700, h: 520, minW: 380, minH: 260, multi: true, create: createTextEdit, menus: editMenus },
  photos: { title: 'Фото', icon: 'photos', w: 920, h: 600, minW: 460, minH: 340, create: createPhotos },
  music: { title: 'Музыка', icon: 'music', w: 880, h: 560, minW: 560, minH: 380, create: createMusic },
  calculator: { title: 'Калькулятор', icon: 'calculator', w: 260, h: 430, minW: 240, minH: 400, slim: true, create: createCalc },
  clock: { title: 'Часы', icon: 'clock', w: 640, h: 520, minW: 460, minH: 420, create: createClock },
  weather: { title: 'Погода', icon: 'weather', w: 720, h: 600, minW: 420, minH: 420, slim: true, create: createWeather },
  terminal: { title: 'Терминал', icon: 'terminal', w: 720, h: 440, minW: 380, minH: 220, multi: true, slim: true, create: createTerminal, menus: w => ({ 'Правка': [{ label: 'Очистить экран', key: 'Ctrl+K', action: () => w.clear() }] }) },
  settings: { title: 'Системные настройки', icon: 'settings', w: 860, h: 600, minW: 640, minH: 420, create: createSettings },
  paint: { title: 'Paint', icon: 'paint', w: 960, h: 640, minW: 480, minH: 360, iframe: 'apps/paint.html' },
  messenger: { title: 'Мессенджер', icon: 'notes', w: 900, h: 600, minW: 480, minH: 360, iframe: 'apps/messenger.html' },
  minicraft: { title: 'MiniCraft', icon: 'maps', w: 900, h: 600, minW: 420, minH: 300, iframe: 'apps/minicraft.html' },
  obby: { title: 'Обби 3D', icon: 'launchpad', w: 900, h: 600, minW: 420, minH: 300, iframe: 'apps/obby.html' },
};

// ---------------- Файлы ----------------
let CLIP = null;
function finderMenus(w) {
  return {
    'Файл': [{ label: 'Новая папка', key: 'Ctrl+Shift+N', disabled: !w.canWrite(), action: () => w.newFolder() }, { label: 'Открыть', key: 'Ctrl+O', disabled: !w.sel().length, action: () => w.openSel() },
      { label: 'Дублировать', key: 'Ctrl+D', disabled: !w.sel().length || !w.canWrite(), action: () => w.duplicate() }, { label: 'Переместить в Корзину', key: 'Ctrl+⌫', disabled: !w.sel().length || !w.canWrite(), action: () => w.del() }],
    'Правка': [{ label: 'Копировать', key: 'Ctrl+C', disabled: !w.sel().length, action: () => w.copy() }, { label: 'Вставить', key: 'Ctrl+V', disabled: !CLIP || !w.canWrite(), action: () => w.paste() }, { label: 'Выбрать все', key: 'Ctrl+A', action: () => w.selectAll() }],
    'Вид': [{ label: 'Значки', checked: w.view() === 'grid', action: () => w.setView('grid') }, { label: 'Список', checked: w.view() === 'list', action: () => w.setView('list') }, { label: 'Просмотр', checked: w.prev(), action: () => w.togglePrev() }],
  };
}
const SIDE = () => [['Рабочий стол', SI.deskf], ['Документы', SI.doc], ['Загрузки', SI.down], ['Изображения', SI.photo], ['Музыка', SI.note]];
function createFinder(w, start) {
  let path = start === '__trash' || start === '' || (start && FS.has(start) && FS.get(start).type === 'dir') ? start : 'Документы';
  const hist = [], fwd = [];
  let sel = new Set(), view = store.get('fView', 'grid'), sortBy = store.get('fSort', 'name'), q = '', showPrev = false, renaming = null;
  w.arg = start;
  w.tools.innerHTML = '<div class="cap-group glass"><button class="cap" data-x="back" aria-label="Назад">' + SI.back + '</button><button class="cap" data-x="fwd" aria-label="Вперёд">' + SI.fwd + '</button></div>' +
    '<span class="w-title f-title" style="margin-right:auto"></span>' +
    '<div class="cap-group glass"><button class="cap" data-x="grid" aria-label="Значки">' + SI.grid + '</button><button class="cap" data-x="list" aria-label="Список">' + SI.list + '</button></div>' +
    '<div class="cap-group glass"><button class="cap" data-x="newdir" title="Новая папка" aria-label="Новая папка">' + SI.newfolder + '</button><button class="cap" data-x="import" title="Добавить файлы с диска" aria-label="Импорт">' + SI.import + '</button><button class="cap" data-x="prev" title="Просмотр" aria-label="Просмотр">' + SI.preview + '</button></div>' +
    '<label class="search-field glass">' + SI.search + '<input placeholder="Поиск" aria-label="Поиск"></label>';
  w.el.querySelector('.titlebar > .w-title').style.display = 'none';
  w.tools.style.flex = '1';
  w.body.innerHTML = '<div class="app-split"><div class="sidebar glass"></div><div class="app-main"><div class="f-main" tabindex="0"></div><div class="f-status"></div></div><div class="preview" hidden></div></div><input type="file" multiple hidden class="f-file">';
  const side = w.body.querySelector('.sidebar'), main = w.body.querySelector('.f-main'), prev = w.body.querySelector('.preview'), finput = w.body.querySelector('.f-file'), sq = w.tools.querySelector('input');
  const canWrite = () => path !== '' && path !== '__trash';
  Object.assign(w, { canWrite, sel: () => [...sel], view: () => view, prev: () => showPrev,
    newFolder, openSel: () => sel.forEach(p => openItem(p)), duplicate: () => { [...sel].forEach(p => copyPath(p, path)); }, del: delSel,
    copy: () => { CLIP = { mode: 'copy', paths: [...sel] }; }, paste: doPaste, selectAll: () => { sel = new Set(items().map(e => e.path)); render(); },
    setView: v => { view = v; store.set('fView', v); render(); }, togglePrev: () => { showPrev = !showPrev; render(); } });
  w.path = () => path;
  w.onArg = p => go(p);
  function go(p, noHist) { if (p !== '' && p !== '__trash' && !FS.has(p)) p = ''; if (!noHist && p !== path) { hist.push(path); fwd.length = 0; } path = p; sel.clear(); q = ''; sq.value = ''; render(); }
  function items() {
    if (path === '__trash') return [];
    let list = path === '' ? ROOTS.map(r => FS.get(r)).filter(Boolean) : childrenOf(path, sortBy);
    if (q) list = [...FS.values()].filter(e => e.path && (path === '' || e.path.startsWith(path + '/')) && baseName(e.path).toLowerCase().includes(q));
    return list;
  }
  const titleOf = () => path === '__trash' ? 'Корзина' : path === '' ? 'Домашняя папка' : baseName(path);
  function render() {
    if (path !== '' && path !== '__trash' && !FS.has(path)) path = '';
    w.setTitle(titleOf()); w.tools.querySelector('.f-title').textContent = titleOf();
    side.innerHTML = '<div class="side-sec">Избранное</div><button class="side-item' + (path === '' ? ' active' : '') + '" data-go="">' + SI.home + '<span>Домашняя папка</span></button>' +
      SIDE().map(([p, ic]) => '<button class="side-item' + (path === p || path.startsWith(p + '/') ? ' active' : '') + '" data-go="' + esc(p) + '" data-drop="' + esc(p) + '">' + ic + '<span>' + esc(p) + '</span></button>').join('') +
      '<div class="side-sec">Места</div><button class="side-item' + (path === '__trash' ? ' active' : '') + '" data-go="__trash" data-drop="__trash">' + SI.trash + '<span>Корзина</span></button>';
    if (path === '__trash') { renderTrash(); return; }
    const list = items();
    if (!list.length) main.innerHTML = '<div class="empty">' + (q ? 'Ничего не найдено' : 'Папка пуста. Перетащите сюда файлы с диска.') + '</div>';
    else if (view === 'list') main.innerHTML = '<table class="f-list"><tr><th>Имя</th><th>Дата изменения</th><th>Размер</th><th>Тип</th></tr>' + list.map(e =>
      '<tr class="fr' + (sel.has(e.path) ? ' selected' : '') + '" data-p="' + esc(e.path) + '" draggable="true"><td><div class="nm">' + fileIcon(e.path) + (renaming === e.path ? '<input value="' + esc(baseName(e.path)) + '" data-ren>' : '<span>' + esc(baseName(e.path)) + '</span>') + '</div></td><td>' + fmtStamp(e.mtime) + '</td><td>' + (e.type === 'file' ? fmtSize(e.size) : '--') + '</td><td>' + kindName(e) + '</td></tr>').join('') + '</table>';
    else main.innerHTML = '<div class="f-grid">' + list.map(e => '<div class="fi' + (sel.has(e.path) ? ' selected' : '') + '" data-p="' + esc(e.path) + '" draggable="true"><div class="th">' + fileIcon(e.path) + '</div>' +
      (renaming === e.path ? '<input value="' + esc(baseName(e.path)) + '" data-ren>' : '<span>' + esc(baseName(e.path)) + '</span>') + '</div>').join('') + '</div>';
    const ren = main.querySelector('[data-ren]');
    if (ren) { ren.focus(); const b = ren.value, dot = b.lastIndexOf('.'); ren.setSelectionRange(0, dot > 0 && FS.get(renaming).type === 'file' ? dot : b.length); }
    w.body.querySelector('.f-status').textContent = 'Объектов: ' + list.length + (sel.size ? ', выбрано: ' + sel.size : '');
    w.tools.querySelector('[data-x=back]').disabled = !hist.length;
    w.tools.querySelector('[data-x=fwd]').disabled = !fwd.length;
    w.tools.querySelector('[data-x=newdir]').disabled = !canWrite();
    w.tools.querySelector('[data-x=import]').disabled = !canWrite();
    w.tools.querySelector('[data-x=grid]').classList.toggle('on', view === 'grid');
    w.tools.querySelector('[data-x=list]').classList.toggle('on', view === 'list');
    w.tools.querySelector('[data-x=prev]').classList.toggle('on', showPrev);
    renderPreview();
    if (activeWin === w) renderMenubar();
  }
  function renderTrash() {
    main.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid var(--line)"><b>Корзина</b><span><button class="btn" data-t="all"' + (TRASH.length ? '' : ' disabled') + '>Восстановить все</button> <button class="btn" data-t="empty"' + (TRASH.length ? '' : ' disabled') + '>Очистить</button></span></div>' +
      (TRASH.length ? '<table class="f-list"><tr><th>Имя</th><th>Откуда</th><th>Удалено</th><th></th></tr>' + [...TRASH].reverse().map(t => '<tr class="fr"><td><div class="nm">' + (t.items[0].type === 'dir' ? FILE_ICONS.folder : FILE_ICONS.text) + '<span>' + esc(baseName(t.path)) + '</span></div></td><td>' + esc(parentOf(t.path) || 'Домашняя папка') + '</td><td>' + fmtStamp(t.deleted) + '</td><td><button class="btn" data-restore="' + t.id + '">Вернуть</button> <button class="btn" data-kill="' + t.id + '">Удалить</button></td></tr>').join('') + '</table>'
        : '<div class="empty">Корзина пуста</div>');
    w.body.querySelector('.f-status').textContent = 'Объектов: ' + TRASH.length;
    prev.hidden = true;
    ['newdir', 'import'].forEach(k => { w.tools.querySelector('[data-x=' + k + ']').disabled = true; });
  }
  function renderPreview() {
    prev.hidden = !showPrev;
    if (!showPrev) return;
    const p = [...sel][0], e = p && FS.get(p);
    if (!e) { prev.innerHTML = '<div class="muted" style="text-align:center;margin-top:40px">Выберите объект</div>'; return; }
    prev.innerHTML = '<div style="display:flex;justify-content:center">' + (isImage(p) && fileUrl(e) ? '<img src="' + fileUrl(e) + '" alt="">' : '<div style="width:96px">' + fileIcon(p) + '</div>') + '</div><b>' + esc(baseName(p)) + '</b><div class="muted" style="font-size:11px">' + kindName(e) + (e.type === 'file' ? ' · ' + fmtSize(e.size) : '') + '<br>Изменён: ' + fmtStamp(e.mtime) + '</div>' +
      (e.text != null && !isImage(p) ? '<pre>' + esc(e.text.slice(0, 3000)) + '</pre>' : '');
  }
  const selectOnly = p => { sel = new Set(p ? [p] : []); };
  function markSel() { main.querySelectorAll('[data-p]').forEach(el => el.classList.toggle('selected', sel.has(el.dataset.p))); w.body.querySelector('.f-status').textContent = 'Объектов: ' + items().length + (sel.size ? ', выбрано: ' + sel.size : ''); renderPreview(); if (activeWin === w) renderMenubar(); }
  function openItem(p) { const e = FS.get(p); if (!e) return; e.type === 'dir' ? go(p) : openPath(p); }
  function newFolder() { if (!canWrite()) return; const p = makeDir(uniquePath(path, 'Новая папка')).path; selectOnly(p); renaming = p; render(); }
  function commitRename(input) {
    const old = renaming; renaming = null; if (!old) return;
    const name = input.value.trim(), err = nameError(parentOf(old), name, old);
    if (!name || name === baseName(old)) { render(); return; }
    if (err) { sheet(w, { title: 'Не удалось переименовать', text: err, buttons: ['ОК'], icon: 'files' }).then(render); return; }
    selectOnly(renamePath(old, name)); render();
  }
  function delSel() { if (!canWrite()) return; [...sel].filter(p => !ROOTS.includes(p)).forEach(trashPath); sel.clear(); render(); }
  function doPaste() { if (!CLIP || !canWrite()) return; CLIP.paths.forEach(p => { if (FS.has(p)) CLIP.mode === 'cut' ? movePath(p, path) : copyPath(p, path); }); if (CLIP.mode === 'cut') CLIP = null; render(); }
  finput.addEventListener('change', async () => { for (const f of finput.files) await importFile(path, f); finput.value = ''; notify({ app: 'finder', title: 'Файлы добавлены', body: 'Папка «' + titleOf() + '»' }); });
  w.tools.addEventListener('click', e => {
    const b = e.target.closest('[data-x]'); if (!b || b.disabled) return;
    const x = b.dataset.x;
    if (x === 'back' && hist.length) { fwd.push(path); path = hist.pop(); sel.clear(); render(); }
    else if (x === 'fwd' && fwd.length) { hist.push(path); path = fwd.pop(); sel.clear(); render(); }
    else if (x === 'grid' || x === 'list') w.setView(x);
    else if (x === 'newdir') newFolder();
    else if (x === 'import') finput.click();
    else if (x === 'prev') w.togglePrev();
  });
  sq.addEventListener('input', () => { q = sq.value.trim().toLowerCase(); render(); });
  w.body.addEventListener('click', async e => {
    const g = e.target.closest('[data-go]'); if (g) { go(g.dataset.go); return; }
    const r = e.target.closest('[data-restore]'); if (r) { restoreTrash(r.dataset.restore); return; }
    const k = e.target.closest('[data-kill]'); if (k) { if ((await sheet(w, { title: 'Удалить объект навсегда?', text: 'Это действие нельзя отменить.', buttons: ['Удалить', 'Отменить'], icon: 'trash' })) === 0) deleteTrash(k.dataset.kill); return; }
    const t = e.target.closest('[data-t]');
    if (t && !t.disabled) { if (t.dataset.t === 'all') [...TRASH].forEach(x => restoreTrash(x.id)); else if ((await sheet(w, { title: 'Очистить Корзину?', text: 'Объектов: ' + TRASH.length + '. Их нельзя будет вернуть.', buttons: ['Очистить', 'Отменить'], icon: 'trash' })) === 0) emptyTrash(); return; }
    if (e.target.closest('[data-ren]')) return;
    const it = e.target.closest('[data-p]');
    if (it) { const p = it.dataset.p; if (e.ctrlKey || e.metaKey) { sel.has(p) ? sel.delete(p) : sel.add(p); } else selectOnly(p); markSel(); return; }
    if (e.target.closest('.f-main')) { sel.clear(); markSel(); }
  });
  main.addEventListener('dblclick', e => { const it = e.target.closest('[data-p]'); if (it && !e.target.closest('[data-ren]')) openItem(it.dataset.p); });
  main.addEventListener('keydown', e => { const r = e.target.closest('[data-ren]'); if (!r) return; e.stopPropagation(); if (e.key === 'Enter') commitRename(r); if (e.key === 'Escape') { renaming = null; render(); } });
  main.addEventListener('focusout', e => { const r = e.target.closest && e.target.closest('[data-ren]'); if (r && renaming) commitRename(r); });
  main.addEventListener('contextmenu', e => {
    e.preventDefault(); e.stopPropagation();
    if (path === '__trash') return;
    const it = e.target.closest('[data-p]');
    if (it) {
      const p = it.dataset.p; if (!sel.has(p)) { selectOnly(p); markSel(); }
      const sys = [...sel].some(x => ROOTS.includes(x)), en = FS.get(p);
      showMenu(e.clientX, e.clientY, [
        { label: 'Открыть', action: () => openItem(p) },
        ...(en.type === 'dir' ? [{ label: 'Новое окно Терминала по адресу папки', action: () => openApp('terminal', p) }] : []),
        { sep: true }, { label: 'Переместить в Корзину', disabled: sys, action: delSel }, { sep: true },
        { label: 'Получить информацию', action: () => showInfo(w, p) }, { label: 'Переименовать', disabled: sys || sel.size !== 1, action: () => { renaming = p; render(); } },
        { label: 'Дублировать', disabled: sys || !canWrite(), action: w.duplicate }, { sep: true },
        { label: 'Скопировать', action: w.copy },
        ...(isImage(p) ? [{ sep: true }, { label: 'Сделать картинкой рабочего стола', action: () => setS({ wallpaper: 'fs:' + p }) }] : []),
      ]);
    } else if (canWrite()) {
      showMenu(e.clientX, e.clientY, [
        { label: 'Новая папка', action: newFolder }, { label: 'Новый текстовый файл', action: () => { const p = writeFile(uniquePath(path, 'Без названия', '.txt'), '').path; selectOnly(p); renaming = p; render(); } },
        { sep: true }, { label: 'Вставить', disabled: !CLIP, action: doPaste }, { label: 'Добавить файлы с диска…', action: () => finput.click() }, { sep: true },
        { label: 'Сортировать по', sub: [['name', 'Имени'], ['kind', 'Типу'], ['date', 'Дате изменения']].map(([k, n]) => ({ label: n, checked: sortBy === k, action: () => { sortBy = k; store.set('fSort', k); render(); } })) },
        { label: 'Вид', sub: [['grid', 'Значки'], ['list', 'Список']].map(([k, n]) => ({ label: n, checked: view === k, action: () => w.setView(k) })) },
        { sep: true }, { label: 'Открыть в Терминале', action: () => openApp('terminal', path) },
      ]);
    }
  });
  // Перетаскивание: внутри - перенос (с Alt/Ctrl - копия), в Корзину боковой панели или Dock; с диска - импорт
  w.body.addEventListener('dragstart', e => { const it = e.target.closest('[data-p]'); if (!it) return; if (!sel.has(it.dataset.p)) { selectOnly(it.dataset.p); markSel(); } e.dataTransfer.setData('text/x-fs', JSON.stringify([...sel])); e.dataTransfer.effectAllowed = 'copyMove'; });
  const dropDir = el => { const d = el.closest('[data-drop]'); if (d) return d.dataset.drop; const it = el.closest('[data-p]'); if (it && FS.get(it.dataset.p) && FS.get(it.dataset.p).type === 'dir') return it.dataset.p; return el.closest('.f-main') && canWrite() ? path : null; };
  const clearDrop = () => { w.body.querySelectorAll('.drop').forEach(x => x.classList.remove('drop')); main.classList.remove('drop-os'); };
  w.body.addEventListener('dragover', e => {
    const d = dropDir(e.target); if (d === null) return;
    const fromOS = e.dataTransfer.types.includes('Files') && !e.dataTransfer.types.includes('text/x-fs');
    if (!fromOS && d === path && !e.target.closest('[data-p]') && !e.target.closest('[data-drop]')) return;
    e.preventDefault(); clearDrop();
    const t = e.target.closest('[data-drop],[data-p]'); if (t && !fromOS) t.classList.add('drop');
    main.classList.toggle('drop-os', fromOS);
  });
  w.body.addEventListener('dragleave', e => { if (!w.body.contains(e.relatedTarget)) clearDrop(); });
  w.body.addEventListener('dragend', clearDrop);
  w.body.addEventListener('drop', async e => {
    const d = dropDir(e.target); if (d === null) return;
    e.preventDefault(); clearDrop();
    const raw = e.dataTransfer.getData('text/x-fs');
    if (raw) { JSON.parse(raw).forEach(p => d === '__trash' ? trashPath(p) : (e.altKey || e.ctrlKey) ? copyPath(p, d) : movePath(p, d)); sel.clear(); render(); }
    else if (e.dataTransfer.files.length && d !== '__trash' && d !== '') for (const f of e.dataTransfer.files) await importFile(d, f);
  });
  w.onKey = e => {
    const list = items().map(x => x.path), c = e.ctrlKey || e.metaKey;
    if ((c && e.key === 'Backspace') || e.key === 'Delete') { e.preventDefault(); delSel(); }
    else if (e.key === 'Enter' && sel.size === 1 && canWrite()) { e.preventDefault(); renaming = [...sel][0]; render(); }
    else if (c && e.code === 'KeyO') { e.preventDefault(); w.openSel(); }
    else if (c && e.key === 'ArrowDown' && sel.size) { e.preventDefault(); w.openSel(); }
    else if (c && e.key === 'ArrowUp') { e.preventDefault(); if (path && path !== '__trash') go(parentOf(path)); }
    else if (c && e.shiftKey && e.code === 'KeyN') { e.preventDefault(); newFolder(); }
    else if (c && e.code === 'KeyD' && sel.size) { e.preventDefault(); w.duplicate(); }
    else if (c && e.code === 'KeyA') { e.preventDefault(); w.selectAll(); }
    else if (c && e.code === 'KeyC' && sel.size) w.copy();
    else if (c && e.code === 'KeyX' && sel.size) CLIP = { mode: 'cut', paths: [...sel] };
    else if (c && e.code === 'KeyV') doPaste();
    else if (['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key) && !c) { e.preventDefault(); const i = list.indexOf([...sel][0]); selectOnly(list[Math.max(0, Math.min(list.length - 1, i + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1)))]); markSel(); }
  };
  w.cleanup.push(on('fs', () => { if (!renaming) render(); }));
  render();
}
function showInfo(w, p) {
  const e = FS.get(p); if (!e) return;
  const size = e.type === 'dir' ? subtree(p).reduce((s, x) => s + (FS.get(x).size || 0), 0) : e.size;
  sheet(w, { title: baseName(p), text: kindName(e) + ' · ' + fmtSize(size || 0) + '\nГде: ' + (parentOf(p) || 'Домашняя папка') + '\nИзменён: ' + fmtStamp(e.mtime) + (e.type === 'dir' ? '\nОбъектов внутри: ' + (subtree(p).length - 1) : ''), buttons: ['ОК'], icon: 'files' });
}

// ---------------- Текстовый редактор ----------------
function editMenus(w) {
  return { 'Файл': [{ label: 'Открыть…', key: 'Ctrl+O', action: () => w.openDlg() }, { label: 'Сохранить', key: 'Ctrl+S', action: () => w.save() }, { label: 'Сохранить как…', key: 'Ctrl+Shift+S', action: () => w.saveAs() }],
    'Правка': [{ label: 'Выбрать все', key: 'Ctrl+A', action: () => { const t = w.body.querySelector('textarea'); t.focus(); t.select(); } }, { label: 'Вставить дату и время', action: () => w.insertDate() }] };
}
function createTextEdit(w, path) {
  w.arg = path;
  let file = path && FS.get(path) ? path : null;
  w.body.innerHTML = '<div class="app-main" style="margin-top:0"><div class="ed-bar"><span class="ed-name"></span><span class="sp"></span><span class="ed-count"></span></div><textarea class="editor" spellcheck="false" aria-label="Текст"></textarea></div>';
  const ta = w.body.querySelector('textarea');
  ta.value = file ? FS.get(file).text || '' : '';
  let saved = ta.value;
  const dirty = () => ta.value !== saved;
  function status() {
    w.setTitle((file ? baseName(file) : 'Без названия') + (dirty() ? ' - изменён' : ''));
    w.body.querySelector('.ed-name').textContent = file ? parentOf(file) : 'Не сохранён';
    const words = (ta.value.match(/\S+/g) || []).length;
    w.body.querySelector('.ed-count').textContent = 'Слов: ' + words + ' · символов: ' + ta.value.length;
  }
  async function saveAs() {
    const name = await sheet(w, { title: 'Сохранить как', text: 'Файл попадёт в папку «Документы».', input: file ? baseName(file) : 'Без названия.txt', buttons: ['Сохранить', 'Отменить'] });
    if (name === null) return false;
    let n = name.trim(); if (!n) return false; if (!/\.[^.]+$/.test(n)) n += '.txt';
    const p = 'Документы/' + n, err = nameError('Документы', n, file);
    if (err && !(FS.has(p) && FS.get(p).type === 'file')) { await sheet(w, { title: 'Не удалось сохранить', text: err, buttons: ['ОК'] }); return false; }
    if (FS.has(p) && p !== file && (await sheet(w, { title: '«' + n + '» уже существует. Заменить?', text: 'Файл с таким именем будет перезаписан.', buttons: ['Заменить', 'Отменить'] })) !== 0) return false;
    file = p; return save();
  }
  function save() { if (!file) return saveAs(); writeFile(file, ta.value); saved = ta.value; w.arg = file; status(); return true; }
  async function openDlg() {
    const files = [...FS.values()].filter(e => e.type === 'file' && isText(e.path) && !isImage(e.path));
    const back = document.createElement('div');
    back.className = 'sheet-back';
    back.innerHTML = '<div class="sheet" style="text-align:left"><h3>Открыть документ</h3><div class="scroll" style="max-height:240px;margin:10px 0">' + files.map(e => '<button class="sp-item" data-f="' + esc(e.path) + '">' + fileIcon(e.path) + '<span>' + esc(baseName(e.path)) + '</span><small>' + esc(parentOf(e.path)) + '</small></button>').join('') + '</div><div class="s-btns"><button class="btn" data-c>Отменить</button></div></div>';
    w.el.appendChild(back);
    back.addEventListener('click', e => { const f = e.target.closest('[data-f]'); if (f) { back.remove(); openApp('textedit', f.dataset.f); } else if (e.target.closest('[data-c]')) back.remove(); });
  }
  function insertDate() { const n = new Date(); ta.setRangeText(fmtDate(n) + ', ' + fmtTime(n), ta.selectionStart, ta.selectionEnd, 'end'); ta.focus(); status(); }
  Object.assign(w, { save, saveAs, openDlg, insertDate });
  ['input', 'keyup', 'click'].forEach(ev => ta.addEventListener(ev, status));
  ta.addEventListener('keydown', e => {
    if (e.ctrlKey && e.code === 'KeyS') { e.preventDefault(); e.shiftKey ? saveAs() : save(); }
    else if (e.ctrlKey && e.code === 'KeyO') { e.preventDefault(); openDlg(); }
  });
  w.beforeClose = async () => {
    if (!dirty()) return true;
    const r = await sheet(w, { title: 'Сохранить изменения в документе «' + (file ? baseName(file) : 'Без названия') + '»?', text: 'Если не сохранить, изменения пропадут.', buttons: ['Сохранить', 'Не сохранять', 'Отменить'] });
    if (r === 2) return false;
    if (r === 0) return await save();
    return true;
  };
  status();
  setTimeout(() => ta.focus(), 30);
}

// ---------------- Калькулятор (логика из web/calculator, раскладка настольной системы) ----------------
function createCalc(w) {
  const keys = [['AC', 'c', 'fn'], ['+/−', 'neg', 'fn'], ['%', 'pct', 'fn'], ['÷', '/', 'op'], ['7', '7', 'num'], ['8', '8', 'num'], ['9', '9', 'num'], ['×', '*', 'op'], ['4', '4', 'num'], ['5', '5', 'num'], ['6', '6', 'num'], ['−', '-', 'op'], ['1', '1', 'num'], ['2', '2', 'num'], ['3', '3', 'num'], ['+', '+', 'op'], ['0', '0', 'num zero'], [',', '.', 'num'], ['=', '=', 'op']];
  w.body.innerHTML = '<div class="calc"><div class="calc-hist"></div><div class="calc-disp">0</div><div class="calc-keys">' + keys.map(k => '<button class="ck ' + k[2] + '" data-k="' + k[1] + '">' + k[0] + '</button>').join('') + '</div></div>';
  const disp = w.body.querySelector('.calc-disp'), hist = w.body.querySelector('.calc-hist');
  let current = '0', previous = null, operator = null, waitingForNew = false, error = false;
  const SYM = { '+': '+', '-': '−', '*': '×', '/': '÷' };
  function formatNumber(n) {
    const num = parseFloat(n);
    if (!isFinite(num)) return 'Ошибка';
    if (Math.abs(num) >= 1e9 || (Math.abs(num) < 1e-8 && num !== 0)) return num.toExponential(5).replace('.', ',').replace('e+', 'e');
    if (typeof n === 'string' && !waitingForNew && /\./.test(n)) { const [a, b] = n.split('.'); return a.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ',' + b; }
    const [a, b] = String(parseFloat(num.toPrecision(9))).split('.');
    return a.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (b ? ',' + b : '');
  }
  function render() {
    disp.textContent = error ? 'Ошибка' : formatNumber(current);
    const len = disp.textContent.length;
    disp.style.fontSize = Math.min(52, Math.floor((disp.clientWidth || 220) / (len * 0.6))) + 'px';
    w.body.querySelector('[data-k=c]').textContent = current !== '0' && !waitingForNew ? 'C' : 'AC';
    w.body.querySelectorAll('.ck.op').forEach(b => b.classList.toggle('on', waitingForNew && operator === b.dataset.k));
  }
  const compute = (a, b, op) => { const x = parseFloat(a), y = parseFloat(b); if (op === '+') return x + y; if (op === '-') return x - y; if (op === '*') return x * y; if (op === '/') return y === 0 ? NaN : x / y; return y; };
  const clean = r => String(parseFloat(r.toPrecision(12)));
  function press(k) {
    if (error && k !== 'c') { error = false; current = '0'; previous = null; operator = null; hist.textContent = ''; }
    if (/^\d$/.test(k)) { if (waitingForNew || current === '0') { current = k; waitingForNew = false; } else if (current.replace(/[-.]/g, '').length < 9) current += k; }
    else if (k === '.') { if (waitingForNew) { current = '0.'; waitingForNew = false; } else if (!current.includes('.')) current += '.'; }
    else if (k === 'c') { if (current !== '0' && !waitingForNew) current = '0'; else { current = '0'; previous = null; operator = null; hist.textContent = ''; } waitingForNew = false; error = false; }
    else if (k === 'back') { if (!waitingForNew) current = current.length > 1 && !/^-\d$/.test(current) ? current.slice(0, -1) : '0'; }
    else if (k === 'neg') { if (current !== '0') current = current.startsWith('-') ? current.slice(1) : '-' + current; }
    else if (k === 'pct') { current = clean(previous !== null && (operator === '+' || operator === '-') ? parseFloat(previous) * parseFloat(current) / 100 : parseFloat(current) / 100); }
    else if ('+-*/'.includes(k)) {
      if (operator && !waitingForNew) { const r = compute(previous, current, operator); if (!isFinite(r)) { error = true; render(); return; } current = clean(r); }
      previous = current; operator = k; waitingForNew = true; hist.textContent = formatNumber(previous) + ' ' + SYM[k];
    } else if (k === '=') {
      if (operator === null) return;
      const r = compute(previous, current, operator);
      hist.textContent = formatNumber(previous) + ' ' + SYM[operator] + ' ' + formatNumber(current);
      if (!isFinite(r)) { error = true; operator = null; render(); return; }
      current = clean(r); operator = null; previous = null; waitingForNew = true;
    }
    render();
  }
  w.body.addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (b) press(b.dataset.k); });
  w.onKey = e => {
    const map = { Enter: '=', '=': '=', Backspace: 'back', Escape: 'c', Delete: 'c', ',': '.', '.': '.', '+': '+', '-': '-', '*': '*', '/': '/', '%': 'pct' };
    const k = /^\d$/.test(e.key) ? e.key : map[e.key];
    if (k) { e.preventDefault(); press(k); }
  };
  render();
}

// ---------------- Системные настройки ----------------
const SETTINGS_PAGES = [['network', 'Wi-Fi и Bluetooth', '#0a84ff', SI.wifi], ['appearance', 'Оформление', '#1c1c1e', SI.brush], ['wallpaper', 'Обои', '#32ade6', SI.photo], ['dock', 'Рабочий стол и Dock', '#1c1c1e', SI.dock],
  ['display', 'Дисплей', '#0a84ff', SI.sun], ['sound', 'Звук', '#ff375f', SI.vol], ['focus', 'Не беспокоить', '#5e5ce6', SI.moon], ['time', 'Дата и время', '#8e8e93', SI.time], ['access', 'Универсальный доступ', '#0a84ff', SI.access], ['about', 'Об этом компьютере', '#8e8e93', SI.info]];
function createSettings(w, startPage) {
  let cur = startPage || 'appearance';
  w.onArg = p => { cur = p || cur; render(); };
  w.tools.innerHTML = '<span class="w-title s-title" style="margin-right:auto"></span>';
  w.tools.style.flex = '1';
  w.el.querySelector('.titlebar > .w-title').style.display = 'none';
  const sw = (k, title, sub) => '<div class="g-row"><div class="g-main">' + title + (sub ? '<small>' + sub + '</small>' : '') + '</div><button class="switch' + (S[k] ? ' on' : '') + '" data-sw="' + k + '" role="switch" aria-checked="' + !!S[k] + '" aria-label="' + title + '"></button></div>';
  const range = (k, title, min, max, step = 1) => '<div class="g-row"><div class="g-main">' + title + '</div><input type="range" min="' + min + '" max="' + max + '" step="' + step + '" value="' + (k === 'volume' && S.muted ? 0 : S[k]) + '" data-range="' + k + '" aria-label="' + title + '" style="width:220px"></div>';
  function body() {
    const d = S.theme === 'dark';
    if (cur === 'network') return '<div class="group">' + sw('wifi', 'Wi-Fi', S.wifi ? 'Подключено: Домашняя сеть (условно)' : 'Выключено') + sw('bt', 'Bluetooth') + '</div><p class="muted" style="font-size:12px">Оболочка работает без интернета, переключатели условные.</p>';
    if (cur === 'appearance') return '<div class="group"><div class="g-row"><div class="g-main">Оформление</div><div class="theme-pick">' +
      [['light', 'Светлое', 'linear-gradient(180deg,#fff 40%,#e5e5ea 40%)'], ['dark', 'Тёмное', 'linear-gradient(180deg,#3a3a3c 40%,#1c1c1e 40%)']].map(([k, n, bg]) => '<button data-theme-set="' + k + '" class="' + (S.theme === k ? 'on' : '') + '"><i style="background:' + bg + '"></i>' + n + '</button>').join('') + '</div></div>' +
      '<div class="g-row"><div class="g-main">Цветовой акцент</div><div class="accents">' + ACCENTS.map(([n, c], i) => '<button data-accent="' + i + '" class="' + (S.accent === i ? 'on' : '') + '" style="background:' + c + '" title="' + n + '" aria-label="' + n + '"></button>').join('') + '</div></div></div>' +
      '<div class="group">' + sw('transparency', 'Прозрачность и стекло', 'Размытие под меню, Dock и окнами') + '</div>';
    if (cur === 'wallpaper') {
      const imgs = [...FS.values()].filter(e => e.type === 'file' && isImage(e.path));
      return '<div class="group"><div class="walls">' + Object.entries(WALLS).map(([k, v]) => '<button class="wall' + (S.wallpaper === k ? ' on' : '') + '" data-wall="' + k + '" title="' + v.name + '" aria-label="' + v.name + '" style="background:' + esc(v.css(d)) + ';background-size:cover"></button>').join('') + '</div></div>' +
        '<h1 style="font-size:14px">Ваши изображения</h1><div class="group"><div class="walls">' + (imgs.length ? imgs.map(e => fileUrl(e) ? '<button class="wall' + (S.wallpaper === 'fs:' + e.path ? ' on' : '') + '" data-wall="fs:' + esc(e.path) + '" title="' + esc(baseName(e.path)) + '" style="background-image:url(&quot;' + fileUrl(e) + '&quot;)"></button>' : '').join('') : '<span class="muted">Нет картинок в «Изображениях»</span>') + '</div></div>';
    }
    if (cur === 'dock') return '<div class="group">' + range('dockSize', 'Размер Dock', 36, 72, 2) + sw('magnify', 'Увеличение', 'Значки растут под курсором') + '</div><div class="group">' + sw('desktopIcons', 'Показывать объекты на рабочем столе') + '</div>';
    if (cur === 'display') return '<div class="group">' + range('brightness', 'Яркость', 30, 100) + sw('night', 'Тёплые цвета', 'Меньше синего вечером') + '</div>';
    if (cur === 'sound') return '<div class="group">' + range('volume', 'Громкость', 0, 100) + sw('muted', 'Выключить звук') + '</div><p class="muted" style="font-size:12px">Громкость общая для «Музыки» и пункта управления.</p>';
    if (cur === 'focus') return '<div class="group">' + sw('focus', 'Не беспокоить', 'Уведомления не всплывают, но остаются в центре уведомлений') + '</div>';
    if (cur === 'time') { const n = new Date(); return '<div class="group"><div class="g-row"><div class="g-main">Сейчас<small class="t-now">' + fmtDate(n) + ', ' + fmtTime(n, true) + '</small></div></div>' + sw('time24', '24-часовой формат', 'Иначе 12-часовой с AM/PM') + sw('seconds', 'Секунды в строке меню') + sw('showDate', 'Дата в строке меню') + '</div><p class="muted" style="font-size:12px">Время и часовой пояс берутся с этого компьютера.</p>'; }
    if (cur === 'access') return '<div class="group">' + sw('animations', 'Анимации', 'Выключите, чтобы окна открывались без движения') + sw('transparency', 'Прозрачность') + '</div>';
    return '<div style="text-align:center;padding:10px 0 20px"><div style="width:80px;height:80px;margin:0 auto 12px;color:var(--fg)">' + SI.mark + '</div><h1 style="margin-bottom:4px">Тахо</h1><div class="muted">Версия 2.0 · одна страница HTML</div></div>' +
      '<div class="group"><div class="g-row"><div class="g-main">Фан-концепт интерфейса, не связан с Microsoft/Apple/Samsung<small>Значки, знак системы и обои нарисованы заново кодом; шрифты системные; интернет не нужен.</small></div></div>' +
      '<div class="g-row"><div class="g-main">Хранилище<small>' + [...FS.values()].filter(e => e.type === 'file').length + ' файлов, ' + fmtSize([...FS.values()].reduce((s, e) => s + (e.size || 0), 0)) + (dbOk ? ' · IndexedDB' : ' · только в памяти') + '</small></div></div>' +
      '<div class="g-row"><div class="g-main">Сбросить всё<small>Настройки, файлы и Корзина вернутся к исходным</small></div><button class="btn" data-reset>Сбросить…</button></div></div>';
  }
  function render() {
    const sc = w.body.querySelector('.set-list') ? w.body.querySelector('.set-list').scrollTop : 0;
    const page = SETTINGS_PAGES.find(p => p[0] === cur) || SETTINGS_PAGES[1];
    w.body.innerHTML = '<div class="app-split"><div class="sidebar glass"><label class="search-field" style="margin:4px 2px 8px;background:var(--field)">' + SI.search + '<input placeholder="Поиск" data-sq aria-label="Поиск настройки"></label>' +
      '<button class="side-item" data-page="about" style="height:48px"><div class="avatar">П</div><span><b>Пользователь</b><br><small class="muted">Локальная учётная запись</small></span></button>' +
      SETTINGS_PAGES.map(([k, n, c, ic]) => '<button class="side-item' + (k === cur ? ' active' : '') + '" data-page="' + k + '"><span class="g-ic" style="background:' + c + ';width:20px;height:20px">' + ic.replace('<svg', '<svg style="color:#fff;width:12px;height:12px"') + '</span><span>' + n + '</span></button>').join('') +
      '</div><div class="app-main"><div class="set-list"><h1>' + page[1] + '</h1>' + body() + '</div></div></div>';
    w.body.querySelector('.set-list').scrollTop = sc;
    w.tools.querySelector('.s-title').textContent = page[1];
    w.setTitle('Системные настройки');
  }
  let own = false;
  w.body.addEventListener('click', async e => {
    const t = e.target;
    const pg = t.closest('[data-page]'); if (pg) { cur = pg.dataset.page; render(); return; }
    const s = t.closest('[data-sw]'); if (s) { own = true; setS({ [s.dataset.sw]: !S[s.dataset.sw] }); own = false; render(); return; }
    const wl = t.closest('[data-wall]'); if (wl) { setS({ wallpaper: wl.dataset.wall }); return; }
    const th = t.closest('[data-theme-set]'); if (th) { setS({ theme: th.dataset.themeSet }); return; }
    const ac = t.closest('[data-accent]'); if (ac) { setS({ accent: +ac.dataset.accent }); return; }
    if (t.closest('[data-reset]') && (await sheet(w, { title: 'Сбросить всё?', text: 'Настройки, файлы и Корзина вернутся к исходным.', buttons: ['Сбросить', 'Отменить'] })) === 0) {
      store.clear(); if (db) db.close(); try { indexedDB.deleteDatabase('macos-tahoe'); } catch (er) { /* нет доступа */ } setTimeout(() => location.reload(), 150);
    }
  });
  w.body.addEventListener('input', e => {
    const r = e.target.closest('[data-range]');
    if (r) { own = true; setS({ [r.dataset.range]: +r.value, ...(r.dataset.range === 'volume' ? { muted: +r.value === 0 } : {}) }); own = false; return; }
    const q = e.target.closest('[data-sq]');
    if (q && q.value.trim()) { const f = SETTINGS_PAGES.find(p => p[1].toLowerCase().includes(q.value.trim().toLowerCase())); if (f) { cur = f[0]; const v = q.value; render(); const i = w.body.querySelector('[data-sq]'); i.value = v; i.focus(); } }
  });
  w.cleanup.push(on('settings', () => { if (!own) render(); }), on('tick', () => { const t = w.body.querySelector('.t-now'); if (t) t.textContent = fmtDate(new Date()) + ', ' + fmtTime(new Date(), true); }));
  render();
}

// ---------------- Браузер (встроенные страницы) ----------------
function createBrowser(w, startUrl) {
  const PAGES = {
    'about:start': { t: 'Избранное', h: () => '<div class="b-start"><h2>Избранное</h2><div class="b-favs">' +
      [['about:help', '📖', 'Справка'], ['about:keys', '⌨️', 'Клавиши'], ['about:system', 'ℹ️', 'О системе'], ['app:finder', '📁', 'Файлы'], ['app:textedit', '📝', 'Редактор'], ['app:settings', '⚙️', 'Настройки']].map(t => '<button class="b-fav" data-go="' + t[0] + '"><i>' + t[1] + '</i>' + t[2] + '</button>').join('') +
      '</div><h2 style="margin-top:30px">Отчёт о конфиденциальности</h2><p class="muted">Страницы открываются только встроенные, ничего не уходит в сеть.</p></div>' },
    'about:help': { t: 'Справка', h: () => '<h1>Справка</h1><p>Это встроенный браузер «Тахо». Он показывает страницы about: и открывает программы (app:имя). Внешние сайты не открываются: оболочка работает без сети.</p><p>Страницы: about:start, about:help, about:keys, about:system.</p>' },
    'about:keys': { t: 'Клавиши', h: () => '<h1>Горячие клавиши</h1><p>Ctrl заменяет Cmd.</p><p><kbd>Ctrl</kbd>+<kbd>Пробел</kbd> - поиск · <kbd>F3</kbd> - все окна · <kbd>F4</kbd> - Launchpad · <kbd>Esc</kbd> - закрыть панели</p><p><kbd>Ctrl</kbd>+<kbd>W</kbd> - закрыть окно · <kbd>Ctrl</kbd>+<kbd>M</kbd> - свернуть · <kbd>Ctrl</kbd>+<kbd>Q</kbd> - завершить программу</p><p>Файлы: <kbd>Enter</kbd> - переименовать, <kbd>Ctrl</kbd>+<kbd>O</kbd> - открыть, <kbd>Ctrl</kbd>+<kbd>⌫</kbd> - в Корзину, <kbd>Ctrl</kbd>+<kbd>D</kbd> - дублировать</p>' },
    'about:system': { t: 'О системе', h: () => '<h1>О системе</h1><p>«Тахо», версия 2.0. <b>Фан-концепт интерфейса, не связан с Microsoft/Apple/Samsung.</b></p><p>Открыто окон: ' + wins.length + '. Файлов: ' + [...FS.values()].filter(e => e.type === 'file').length + '.</p>' },
  };
  let tabs = [{ hist: [startUrl && PAGES[startUrl] ? startUrl : 'about:start'], i: 0 }], cur = 0;
  w.onArg = u => { if (PAGES[u]) { tabs.push({ hist: [u], i: 0 }); cur = tabs.length - 1; render(); } };
  w.tools.innerHTML = '<div class="cap-group glass"><button class="cap" data-b="back" aria-label="Назад">' + SI.back + '</button><button class="cap" data-b="fwd" aria-label="Вперёд">' + SI.fwd + '</button></div><form class="b-url" data-url><input placeholder="Поиск или адрес сайта" aria-label="Адрес" spellcheck="false"></form><div class="cap-group glass"><button class="cap" data-newtab title="Новая вкладка" aria-label="Новая вкладка">' + SI.plus + '</button></div>';
  w.tools.style.flex = '1';
  w.el.querySelector('.titlebar > .w-title').style.display = 'none';
  function render() {
    const t = tabs[cur], url = t.hist[t.i], p = PAGES[url];
    w.tools.querySelector('input').value = url === 'about:start' ? '' : url;
    w.tools.querySelector('[data-b=back]').disabled = !t.i;
    w.tools.querySelector('[data-b=fwd]').disabled = t.i >= t.hist.length - 1;
    w.body.innerHTML = '<div class="browser">' + (tabs.length > 1 ? '<div class="b-tabs">' + tabs.map((x, i) => { const u = x.hist[x.i]; return '<div class="b-tab' + (i === cur ? ' on' : '') + '" data-tab="' + i + '"><button class="bx" data-tx="' + i + '" title="Закрыть вкладку" aria-label="Закрыть вкладку">' + SI.x + '</button><span>' + esc(PAGES[u] ? PAGES[u].t : 'Нет подключения') + '</span></div>'; }).join('') + '</div>' : '') +
      '<div class="b-page">' + (p ? p.h() : '<div style="text-align:center;padding-top:10vh"><div style="font-size:60px">📡</div><h1>Нет подключения к Интернету</h1><p>Страница <b>' + esc(url) + '</b> не открыта: «Тахо» работает без сети и не загружает внешние сайты.</p><p><button class="btn accent" data-go="about:start">Избранное</button></p></div>') + '</div></div>';
    w.setTitle(p ? p.t : 'Нет подключения');
  }
  function nav(u) {
    u = u.trim(); if (!u) return;
    if (u.startsWith('app:')) { openApp(u.slice(4)); return; }
    if (!/^[a-z]+:/i.test(u)) u = /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(u) ? 'https://' + u : 'about:help';
    const t = tabs[cur]; t.hist = t.hist.slice(0, t.i + 1); t.hist.push(u); t.i++; render();
  }
  w.tools.addEventListener('submit', e => { e.preventDefault(); nav(e.target.querySelector('input').value); });
  w.tools.addEventListener('click', e => {
    if (e.target.closest('[data-newtab]')) { tabs.push({ hist: ['about:start'], i: 0 }); cur = tabs.length - 1; render(); return; }
    const b = e.target.closest('[data-b]'); if (!b || b.disabled) return;
    const t = tabs[cur]; if (b.dataset.b === 'back') t.i--; else t.i++; render();
  });
  w.body.addEventListener('click', e => {
    const g = e.target.closest('[data-go]'); if (g) { nav(g.dataset.go); return; }
    const x = e.target.closest('[data-tx]'); if (x) { tabs.splice(+x.dataset.tx, 1); cur = Math.min(cur, tabs.length - 1); render(); return; }
    const tb = e.target.closest('[data-tab]'); if (tb) { cur = +tb.dataset.tab; render(); }
  });
  render();
}

// ---------------- Фото ----------------
function createPhotos(w, start) {
  let view = start || null;
  const listAll = () => [...[...FS.values()].filter(e => e.type === 'file' && isImage(e.path)).map(e => e.path), ...Object.keys(WALLS).map(k => 'wall:' + k)];
  const bgOf = id => { if (id.startsWith('wall:')) return WALLS[id.slice(5)].css(S.theme === 'dark'); const u = fileUrl(FS.get(id)); return u ? 'url("' + u + '")' : 'none'; };
  const nameOf = id => id.startsWith('wall:') ? WALLS[id.slice(5)].name : baseName(id);
  w.onArg = p => { view = p; render(); };
  w.tools.innerHTML = '<div class="cap-group glass"><button class="cap" data-ph="import" title="Импорт" aria-label="Импорт">' + SI.import + '</button></div>';
  let zoomed = false;
  function render() {
    const imgs = [...FS.values()].filter(e => e.type === 'file' && isImage(e.path));
    let html = '<div class="app-main" style="margin-top:0"><div class="ph-grid"><div class="ph-sec">Медиатека</div>' + (imgs.length ? imgs.map(e => '<button class="ph-tile" data-view="' + esc(e.path) + '" title="' + esc(baseName(e.path)) + '" style="background-image:url(&quot;' + (fileUrl(e) || '') + '&quot;)"></button>').join('') : '<div class="muted" style="grid-column:1/-1">Нет фотографий. Импортируйте их кнопкой справа вверху.</div>') +
      '<div class="ph-sec">Обои «Тахо»</div>' + Object.entries(WALLS).map(([k, v]) => '<button class="ph-tile" data-view="wall:' + k + '" title="' + v.name + '" style="background:' + esc(v.css(S.theme === 'dark')) + ';background-size:cover"></button>').join('') + '</div><input type="file" accept="image/*" multiple hidden class="ph-in"></div>';
    if (view) {
      const all = listAll(), i = all.indexOf(view);
      html += '<div class="ph-view"><div class="pv-bar"><button class="cap" data-ph="close" aria-label="Назад">' + SI.back + '</button><button class="cap" data-ph="prev" aria-label="Предыдущее">‹</button><button class="cap" data-ph="next" aria-label="Следующее">›</button><span>' + esc(nameOf(view)) + ' · ' + (i + 1) + ' из ' + all.length + '</span>' +
        '<button class="cap" data-ph="zoom" title="Увеличить">⤢</button><button class="cap" data-ph="wall" title="Сделать обоями">' + SI.photo + '</button>' + (view.startsWith('wall:') ? '' : '<button class="cap" data-ph="del" title="Удалить" aria-label="Удалить">' + SI.trash + '</button>') + '</div><div class="pv-img" style="background-image:' + esc(bgOf(view)) + '"></div></div>';
    }
    w.body.innerHTML = html;
    w.setTitle(view ? nameOf(view) : 'Фото');
  }
  const step = d => { const all = listAll(), i = all.indexOf(view); view = all[(i + d + all.length) % all.length]; zoomed = false; render(); };
  const onClick = async e => {
    const v = e.target.closest('[data-view]'); if (v) { view = v.dataset.view; zoomed = false; render(); return; }
    const b = e.target.closest('[data-ph]'); if (!b) return;
    const k = b.dataset.ph;
    if (k === 'import') w.body.querySelector('.ph-in').click();
    else if (k === 'close') { view = null; render(); }
    else if (k === 'prev' || k === 'next') step(k === 'next' ? 1 : -1);
    else if (k === 'wall') { setS({ wallpaper: view.startsWith('wall:') ? view.slice(5) : 'fs:' + view }); notify({ app: 'photos', title: 'Обои изменены', body: nameOf(view) }); }
    else if (k === 'del') { trashPath(view); view = null; render(); }
    else if (k === 'zoom') { zoomed = !zoomed; w.body.querySelector('.pv-img').style.transform = zoomed ? 'scale(1.8)' : ''; }
  };
  w.body.addEventListener('click', onClick); w.tools.addEventListener('click', onClick);
  w.body.addEventListener('change', async e => { if (e.target.classList.contains('ph-in')) { for (const f of e.target.files) await importFile('Изображения', f); e.target.value = ''; } });
  w.onKey = e => { if (!view) return; if (e.key === 'Escape') { view = null; render(); } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') step(e.key === 'ArrowRight' ? 1 : -1); };
  w.cleanup.push(on('fs', render), on('settings', render));
  render();
}

// ---------------- Музыка: мелодии синтезируются (WebAudio) ----------------
const TRACKS = [['Рассвет над озером', 'Синтезатор', 0], ['Тихая гавань', 'Волны', 3], ['Северный ветер', 'Аврора', 5], ['Огни города', 'Неон', 7], ['Колыбельная', 'Тихий час', 10]].map(([t, a, k], i) => ({ id: i, title: t, artist: a, key: k, len: 24 }));
const player = { idx: -1, playing: false, ctx: null, gain: null, nodes: [], startAt: 0, offset: 0, shuffle: false, repeat: false, timer: null };
const pNow = () => player.ctx ? player.ctx.currentTime : performance.now() / 1000;
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
const pPos = () => player.idx < 0 ? 0 : player.playing ? Math.min(TRACKS[player.idx].len, pNow() - player.startAt) : player.offset;
function pSkip(d) { pPlay(player.shuffle ? Math.floor(Math.random() * TRACKS.length) : (Math.max(0, player.idx) + d + TRACKS.length) % TRACKS.length); }
function pTick() { if (player.playing && pPos() >= TRACKS[player.idx].len) { if (player.repeat) pPlay(player.idx); else pSkip(1); } emit('playerTick'); }
on('settings', () => { if (player.gain) player.gain.gain.value = S.muted ? 0 : S.volume / 100; });
on('visibility', hidden => { if (hidden && player.playing) { pPause(); player.pausedByTab = true; } else if (!hidden && player.pausedByTab) { player.pausedByTab = false; pPlay(player.idx, player.offset); } });
on('lock', () => pPause());
function createMusic(w) {
  const mm = s => Math.floor(s / 60) + ':' + pad(Math.floor(s % 60));
  const cover = k => 'linear-gradient(135deg,hsl(' + k * 30 + ',80%,60%),hsl(' + (k * 30 + 60) + ',70%,40%))';
  function render() {
    const tr = TRACKS[player.idx];
    w.body.innerHTML = '<div class="app-split"><div class="sidebar glass"><div class="side-sec">Медиатека</div><button class="side-item active">' + SI.note + '<span>Песни</span></button><button class="side-item" data-p="shuffle">' + SI.restart + '<span>' + (player.shuffle ? 'Перемешано' : 'Перемешать') + '</span></button></div>' +
      '<div class="app-main"><div class="music"><div class="mu-list"><div class="mu-head"><div class="mu-cover" style="background:' + cover(tr ? tr.key : 4) + '"></div><div><small class="muted">Плейлист</small><h2>Синтезированное</h2><p class="muted" style="font-size:12px">Мелодии собираются прямо в браузере, без файлов и сети.</p></div></div>' +
      TRACKS.map(t => '<button class="track' + (t.id === player.idx ? ' on' : '') + '" data-tr="' + t.id + '"><span>' + (t.id === player.idx && player.playing ? '▶' : t.id + 1) + '</span><span>' + t.title + '</span><small>' + t.artist + '</small><small>' + mm(t.len) + '</small></button>').join('') + '</div>' +
      '<div class="mu-bar"><div class="mu-now"><i style="background:' + cover(tr ? tr.key : 4) + '"></i><div style="min-width:0"><b>' + (tr ? tr.title : 'Ничего не играет') + '</b><small>' + (tr ? tr.artist : 'Выберите песню') + '</small></div></div>' +
      '<div class="mu-ctl"><div class="mu-btns"><button data-p="prev" aria-label="Предыдущая">' + SI.prev + '</button><button data-p="play" aria-label="' + (player.playing ? 'Пауза' : 'Играть') + '">' + (player.playing ? SI.pause : SI.play) + '</button><button data-p="next" aria-label="Следующая">' + SI.next + '</button><button data-p="repeat" title="Повтор" style="' + (player.repeat ? 'color:var(--accent)' : 'opacity:.6') + '">↻</button></div>' +
      '<div class="mu-seek"><span class="mu-cur">' + mm(pPos()) + '</span><input type="range" min="0" max="' + (tr ? tr.len : 1) + '" step="0.1" value="' + pPos() + '" data-seek aria-label="Позиция"><span>' + (tr ? mm(tr.len) : '0:00') + '</span></div></div>' +
      '<div class="mu-vol">' + SI.vol + '<input type="range" min="0" max="100" value="' + (S.muted ? 0 : S.volume) + '" data-vol aria-label="Громкость"></div></div></div></div></div>';
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
  w.cleanup.push(on('player', render), on('playerTick', () => { const c = w.body.querySelector('.mu-cur'), s = w.body.querySelector('[data-seek]'); if (c) c.textContent = mm(pPos()); if (s && document.activeElement !== s) s.value = pPos(); }), () => pPause());
  render();
}

// ---------------- Часы ----------------
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
  let tab = tab0 || 'world';
  const ZONES = [['Москва', 'Europe/Moscow'], ['Лондон', 'Europe/London'], ['Нью-Йорк', 'America/New_York'], ['Токио', 'Asia/Tokyo'], ['Сидней', 'Australia/Sydney']];
  const hms = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return pad(Math.floor(s / 3600)) + ':' + pad(Math.floor(s / 60) % 60) + ':' + pad(s % 60); };
  const swf = ms => pad(Math.floor(ms / 60000)) + ':' + pad(Math.floor(ms / 1000) % 60) + ',' + pad(Math.floor(ms / 10) % 100);
  const swNow = () => swState.acc + (swState.run ? Date.now() - swState.start : 0);
  w.tools.innerHTML = '<div class="seg clock-seg">' + [['world', 'Мировые часы'], ['alarm', 'Будильники'], ['stop', 'Секундомер'], ['timer', 'Таймер']].map(([k, n]) => '<button data-tab="' + k + '">' + n + '</button>').join('') + '</div>';
  w.tools.style.margin = '0 auto';
  function main() {
    if (tab === 'timer') { const left = timerState.run ? timerState.end - Date.now() : timerState.left; return '<div class="big-num" data-tval>' + hms(left) + '</div><div class="row-c">' + [1, 3, 5, 10, 25].map(m => '<button class="btn" data-preset="' + m + '"' + (timerState.run ? ' disabled' : '') + '>' + m + ' мин</button>').join('') + '</div><div class="row-c"><button class="round" data-t="reset">Сброс</button><button class="round ' + (timerState.run ? 'stop' : 'go') + '" data-t="go">' + (timerState.run ? 'Пауза' : 'Старт') + '</button></div><p class="muted" style="text-align:center">Когда время выйдет, придёт уведомление.</p>'; }
    if (tab === 'alarm') return '<form class="row-c" data-addalarm><input type="time" class="field" name="t" value="08:00" aria-label="Время"><input class="field" name="label" placeholder="Название" maxlength="30"><button class="btn accent">Добавить</button></form><div class="alarms">' +
      (ALARMS.length ? ALARMS.map((a, i) => '<div class="' + (a.on ? '' : 'off') + '"><span><b>' + a.t + '</b><br><small class="muted">' + esc(a.label) + '</small></span><span style="display:flex;gap:10px;align-items:center"><button class="cap" data-adel="' + i + '" aria-label="Удалить">' + SI.trash + '</button><button class="switch' + (a.on ? ' on' : '') + '" data-aon="' + i + '" aria-label="Включить"></button></span></div>').join('') : '<p class="muted">Будильников нет</p>') + '</div>';
    if (tab === 'stop') return '<div class="big-num" data-swval>' + swf(swNow()) + '</div><div class="row-c"><button class="round" data-s="lap"' + (swState.run || swState.acc ? '' : ' disabled') + '>' + (swState.run ? 'Круг' : 'Сброс') + '</button><button class="round ' + (swState.run ? 'stop' : 'go') + '" data-s="go">' + (swState.run ? 'Стоп' : 'Старт') + '</button></div><div class="laps">' + swState.laps.map((l, i) => '<div><span>Круг ' + (swState.laps.length - i) + '</span><span>' + swf(l) + '</span></div>').join('') + '</div>';
    return '<div class="world">' + ZONES.map(([n, tz]) => '<div><span>' + n + '<br><small class="muted">' + new Date().toLocaleDateString('ru-RU', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' }) + '</small></span><b>' + new Date().toLocaleTimeString('ru-RU', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: !S.time24 }) + '</b></div>').join('') + '</div>';
  }
  function render() {
    w.tools.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    w.body.innerHTML = '<div class="app-main" style="margin-top:0"><div class="clock-body">' + main() + '</div></div>';
  }
  const saveAl = () => store.set('alarms', ALARMS);
  const onClick = e => {
    const t = e.target.closest('[data-tab]'); if (t) { tab = t.dataset.tab; render(); return; }
    const p = e.target.closest('[data-preset]'); if (p && !p.disabled) { timerState.left = timerState.total = +p.dataset.preset * 60000; render(); return; }
    const tt = e.target.closest('[data-t]');
    if (tt) { if (tt.dataset.t === 'go') { if (timerState.run) { timerState.left = timerState.end - Date.now(); timerState.run = false; } else if (timerState.left > 0) { timerState.end = Date.now() + timerState.left; timerState.run = true; } } else { timerState.run = false; timerState.left = timerState.total; } render(); return; }
    const s = e.target.closest('[data-s]');
    if (s && !s.disabled) { if (s.dataset.s === 'go') { if (swState.run) { swState.acc += Date.now() - swState.start; swState.run = false; } else { swState.start = Date.now(); swState.run = true; } } else if (swState.run) swState.laps.unshift(swNow()); else { swState.acc = 0; swState.laps = []; } render(); return; }
    const ad = e.target.closest('[data-adel]'); if (ad) { ALARMS.splice(+ad.dataset.adel, 1); saveAl(); render(); return; }
    const ao = e.target.closest('[data-aon]'); if (ao) { ALARMS[+ao.dataset.aon].on = !ALARMS[+ao.dataset.aon].on; saveAl(); render(); }
  };
  w.body.addEventListener('click', onClick); w.tools.addEventListener('click', onClick);
  w.body.addEventListener('submit', e => { e.preventDefault(); const f = e.target; if (!f.t.value) return; ALARMS.push({ t: f.t.value, label: f.label.value.trim() || 'Будильник', on: true }); ALARMS.sort((a, b) => a.t.localeCompare(b.t)); saveAl(); render(); });
  const iv = setInterval(() => {
    const tv = w.body.querySelector('[data-tval]'); if (tv) tv.textContent = hms(timerState.run ? timerState.end - Date.now() : timerState.left);
    const sv = w.body.querySelector('[data-swval]'); if (sv) sv.textContent = swf(swNow());
  }, 50);
  w.cleanup.push(() => clearInterval(iv), on('clockState', render), on('tick', () => { if (tab === 'world' && new Date().getSeconds() === 0) render(); }));
  render();
}

// ---------------- Погода (демо) ----------------
function createWeather(w) {
  const d = new Date(), temp = h => Math.round(16 + 4 * Math.sin((h - 9) / 24 * Math.PI * 2));
  const hours = Array.from({ length: 12 }, (_, i) => { const h = (d.getHours() + i) % 24; return [i ? pad(h) : 'Сейчас', h < 6 || h > 20 ? '🌙' : ['⛅', '☁️', '🌤️', '☀️'][i % 4], temp(h)]; });
  const days = Array.from({ length: 7 }, (_, i) => { const x = new Date(d); x.setDate(d.getDate() + i); return [i ? DAYS_SHORT[x.getDay()] : 'Сегодня', ['⛅', '🌧️', '☀️', '☀️', '⛅', '🌦️', '☀️'][i], 11 + i % 4, 18 + (i * 3) % 7]; });
  w.body.innerHTML = '<div class="weather"><div class="w-now"><div style="font-size:26px">Лиссабон</div><div class="t">' + temp(d.getHours()) + '°</div><div>Переменная облачность</div><div>Макс.: ' + (temp(d.getHours()) + 3) + '°, мин.: ' + (temp(d.getHours()) - 5) + '°</div></div>' +
    '<div class="w-card"><h5>Почасовой прогноз</h5><div class="w-hours">' + hours.map(h => '<div><div>' + h[0] + '</div><div style="font-size:22px;margin:6px 0">' + h[1] + '</div><b>' + h[2] + '°</b></div>').join('') + '</div></div>' +
    '<div class="w-card"><h5>Прогноз на 7 дней</h5><div class="w-days">' + days.map(x => '<div><span>' + x[0] + '</span><span>' + x[1] + '</span><span>' + x[2] + '° … ' + x[3] + '°</span></div>').join('') + '</div></div>' +
    '<div class="w-note">Демо-данные: «Тахо» не ходит в интернет, прогноз сгенерирован по времени суток.</div></div>';
}

// ---------------- Терминал: команды в духе zsh над той же файловой системой ----------------
function createTerminal(w, startDir) {
  let cwd = startDir && FS.has(startDir) && FS.get(startDir).type === 'dir' ? startDir : '';
  const hist = []; let hi = -1;
  w.arg = startDir;
  w.body.innerHTML = '<div class="term scroll" tabindex="0"></div>';
  const out = w.body.querySelector('.term');
  const shortDir = () => cwd ? baseName(cwd) : '~';
  const tildePath = p => '~' + (p ? '/' + p : '');
  const print = (t, cls) => { const d = document.createElement('div'); if (cls) d.className = cls; d.textContent = t; out.insertBefore(d, out.querySelector('.term-line')); };
  w.clear = () => { out.innerHTML = ''; prompt(); };
  function resolve(arg) {
    if (!arg || arg === '~') return '';
    let a = arg.replace(/^~\/?/, '/');
    let parts = a.startsWith('/') ? [] : (cwd ? cwd.split('/') : []);
    for (const seg of a.split('/').filter(Boolean)) { if (seg === '.') continue; if (seg === '..') parts.pop(); else parts.push(seg); }
    return parts.join('/');
  }
  function prompt() {
    const line = document.createElement('div'); line.className = 'term-line';
    line.innerHTML = '<span class="pr"></span><input aria-label="Команда" spellcheck="false" autocomplete="off">';
    line.querySelector('span').textContent = 'user@tahoe ' + shortDir() + ' % ';
    out.appendChild(line);
    const inp = line.querySelector('input'); inp.focus({ preventScroll: true }); setTimeout(() => { if (activeWin === w) inp.focus({ preventScroll: true }); }, 10); out.scrollTop = out.scrollHeight;
    inp.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') { const cmd = inp.value; line.remove(); print('user@tahoe ' + shortDir() + ' % ' + cmd); if (cmd.trim()) hist.unshift(cmd); hi = -1; run(cmd.trim()); if (wins.includes(w) && !out.querySelector('.term-line')) prompt(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (hi < hist.length - 1) hi++; inp.value = hist[hi] || ''; }
      else if (e.key === 'ArrowDown') { e.preventDefault(); if (hi > -1) hi--; inp.value = hi < 0 ? '' : hist[hi]; }
      else if (e.key === 'Tab') { e.preventDefault(); const parts = inp.value.split(' '), last = parts.pop(); const m = (cwd === '' ? ROOTS : childrenOf(cwd).map(x => baseName(x.path))).find(n => n.toLowerCase().startsWith(last.toLowerCase())); if (m) inp.value = parts.concat(m.includes(' ') ? '"' + m + '"' : m).join(' '); }
      else if ((e.key === 'k' || e.key === 'l') && e.ctrlKey) { e.preventDefault(); w.clear(); }
    });
  }
  const args = s => (s.match(/"[^"]*"|'[^']*'|\S+/g) || []).map(x => x.replace(/^["']|["']$/g, ''));
  const isDir = p => p === '' || (FS.has(p) && FS.get(p).type === 'dir');
  const kids = d => d === '' ? ROOTS.map(r => FS.get(r)) : childrenOf(d);
  function run(cmd) {
    if (!cmd) return;
    let redirect = null;
    const m = cmd.match(/^(echo\s+.*?)\s*(>>?)\s*(\S+|"[^"]+")$/i);
    if (m) { cmd = m[1]; redirect = { append: m[2] === '>>', file: m[3].replace(/"/g, '') }; }
    const [c, ...a] = args(cmd);
    switch (c) {
      case 'help': ['Команды:', '  ls [-l] [папка]   список файлов', '  cd [папка]        сменить папку (cd .. - вверх, cd ~ - домой)', '  pwd               где я', '  mkdir имя         создать папку', '  touch имя         создать пустой файл', '  cat имя           показать файл', '  echo текст [> имя] вывести или записать в файл (>> - дописать)', '  cp из в           копировать в папку', '  mv из в           переместить в папку или переименовать', '  rm [-r] имя       в Корзину', '  tree              дерево папок', '  open имя          открыть файл, папку или программу', '  clear, date, whoami, uname, exit'].forEach(l => print(l)); break;
      case 'ls': {
        const long = a[0] === '-l', d = resolve(long ? a[1] : a[0]);
        if (!isDir(d)) { print('ls: ' + (a[long ? 1 : 0]) + ': Нет такого файла или каталога', 'err'); break; }
        const list = kids(d);
        if (long) list.forEach(x => print((x.type === 'dir' ? 'drwxr-xr-x' : '-rw-r--r--') + '  user  ' + String(x.size || 0).padStart(7) + '  ' + fmtStamp(x.mtime) + '  ' + baseName(x.path), x.type === 'dir' ? 'dir' : ''));
        else if (list.length) print(list.map(x => baseName(x.path) + (x.type === 'dir' ? '/' : '')).join('    '));
        break;
      }
      case 'cd': { const d = resolve(a[0]); if (isDir(d)) cwd = d; else print('cd: нет такого каталога: ' + a[0], 'err'); break; }
      case 'pwd': print('/Пользователи/user' + (cwd ? '/' + cwd : '')); break;
      case 'mkdir': case 'touch': {
        if (!a[0]) { print(c + ': не указано имя', 'err'); break; }
        const p = resolve(a[0]), dir = parentOf(p);
        if (dir === '' || !isDir(dir)) { print(c + ': здесь нельзя создать: ' + a[0], 'err'); break; }
        if (FS.has(p)) { if (c === 'mkdir') print('mkdir: ' + a[0] + ': Файл существует', 'err'); break; }
        const err = nameError(dir, baseName(p)); if (err) { print(c + ': ' + err, 'err'); break; }
        c === 'mkdir' ? makeDir(p) : writeFile(p, ''); break;
      }
      case 'cat': { const p = resolve(a[0]), e = FS.get(p); if (!e || e.type !== 'file') { print('cat: ' + (a[0] || '') + ': Нет такого файла', 'err'); break; } if (e.text == null) { print('cat: ' + a[0] + ': двоичный файл', 'err'); break; } e.text.split('\n').forEach(l => print(l)); break; }
      case 'echo': {
        const text = cmd.replace(/^echo\s?/, '').replace(/^["']|["']$/g, '');
        if (!redirect) { print(text); break; }
        const p = resolve(redirect.file), dir = parentOf(p);
        if (dir === '' || !isDir(dir)) { print('zsh: нельзя записать: ' + redirect.file, 'err'); break; }
        const old = FS.get(p); writeFile(p, (redirect.append && old && old.text ? old.text + '\n' : '') + text); break;
      }
      case 'cp': case 'mv': {
        if (a.length < 2) { print(c + ': укажите откуда и куда', 'err'); break; }
        const from = resolve(a[0]), to = resolve(a[1]);
        if (!FS.has(from) || ROOTS.includes(from)) { print(c + ': ' + a[0] + ': Нет такого файла', 'err'); break; }
        if (isDir(to) && to !== '') { const r = c === 'cp' ? copyPath(from, to) : movePath(from, to); if (!r) print(c + ': нельзя', 'err'); break; }
        if (c === 'mv' && parentOf(to) === parentOf(from)) { const err = nameError(parentOf(from), baseName(to), from); if (err) print('mv: ' + err, 'err'); else renamePath(from, baseName(to)); break; }
        print(c + ': ' + a[1] + ': нет такой папки', 'err'); break;
      }
      case 'rm': case 'rmdir': {
        const rec = a[0] === '-r' || a[0] === '-rf', name = rec ? a[1] : a[0], p = resolve(name), e = FS.get(p);
        if (!e || ROOTS.includes(p)) { print(c + ': ' + (name || '') + ': Нет такого файла или каталога', 'err'); break; }
        if (e.type === 'dir' && c === 'rm' && !rec) { print('rm: ' + name + ': это каталог (нужен -r)', 'err'); break; }
        trashPath(p); print('Перемещено в Корзину: ' + baseName(p), 'ok'); break;
      }
      case 'tree': { const walk = (d, pre) => kids(d).filter(x => x.type === 'dir').forEach((x, i, arr) => { const last = i === arr.length - 1; print(pre + (last ? '└── ' : '├── ') + baseName(x.path)); walk(x.path, pre + (last ? '    ' : '│   ')); }); print(cwd ? baseName(cwd) : '~'); walk(cwd, ''); break; }
      case 'open': {
        const name = a.join(' '); if (!name) { print('open: укажите что открыть', 'err'); break; }
        const appName = a[0] === '-a' ? a.slice(1).join(' ') : null;
        const id = Object.keys(APPS).find(k => k === (appName || name).toLowerCase() || APPS[k].title.toLowerCase() === (appName || name).toLowerCase());
        if (id) { openApp(id); break; }
        const p = resolve(name); if (isDir(p) || FS.has(p)) openPath(p); else print('open: ' + name + ': нет такого файла', 'err'); break;
      }
      case 'clear': out.innerHTML = ''; break;
      case 'date': print(new Date().toLocaleString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: !S.time24 })); break;
      case 'whoami': print('user'); break;
      case 'uname': print('Тахо 2.0 (фан-концепт интерфейса, не связан с Microsoft/Apple/Samsung)'); break;
      case 'exit': closeWin(w); break;
      default: print('zsh: команда не найдена: ' + c + '. Наберите help.', 'err');
    }
  }
  print('Последний вход: ' + fmtStamp(Date.now()) + ' на ttys000', 'dim');
  prompt();
  out.addEventListener('click', () => { if (!getSelection().toString()) { const i = out.querySelector('.term-line input'); if (i) i.focus(); } });
  w.setTitle('user - zsh - 80×24');
}

// ================= Рабочий стол: файлы из папки «Рабочий стол» =================
let deskSel = new Set(), deskRenaming = null;
function renderDesktop() {
  const files = childrenOf('Рабочий стол', store.get('deskSort', 'name'));
  const box = $('desktop-icons');
  box.innerHTML = files.map(e => '<div class="dicon' + (deskSel.has(e.path) ? ' selected' : '') + '" data-p="' + esc(e.path) + '" draggable="true" tabindex="0"' + (e.type === 'dir' ? ' data-drop="' + esc(e.path) + '"' : '') + '><div class="ic">' + fileIcon(e.path) + '</div>' +
    (deskRenaming === e.path ? '<input class="rename" value="' + esc(baseName(e.path)) + '">' : '<span>' + esc(baseName(e.path)) + '</span>') + '</div>').join('');
  const r = box.querySelector('.rename'); if (r) { r.focus(); const dot = r.value.lastIndexOf('.'); r.setSelectionRange(0, dot > 0 ? dot : r.value.length); }
}
$('desktop').addEventListener('click', e => {
  const d = e.target.closest('.dicon');
  if (d && e.target.closest('.rename')) return;
  if (!d) deskSel.clear(); else if (e.ctrlKey || e.metaKey) { deskSel.has(d.dataset.p) ? deskSel.delete(d.dataset.p) : deskSel.add(d.dataset.p); } else deskSel = new Set([d.dataset.p]);
  document.querySelectorAll('.dicon').forEach(x => x.classList.toggle('selected', deskSel.has(x.dataset.p)));
});
$('desktop').addEventListener('dblclick', e => { const d = e.target.closest('.dicon'); if (d && !e.target.closest('.rename')) openPath(d.dataset.p); });
$('desktop').addEventListener('keydown', e => {
  const r = e.target.closest('.rename');
  if (r) { if (e.key === 'Enter') finishDeskRename(r); if (e.key === 'Escape') { deskRenaming = null; renderDesktop(); } e.stopPropagation(); return; }
  const d = e.target.closest('.dicon'); if (!d) return;
  if (e.key === 'Enter') { deskRenaming = d.dataset.p; renderDesktop(); }
  if ((e.ctrlKey && e.key === 'Backspace') || e.key === 'Delete') trashPath(d.dataset.p);
  if (e.ctrlKey && e.code === 'KeyO') openPath(d.dataset.p);
});
$('desktop').addEventListener('focusout', e => { if (e.target.classList && e.target.classList.contains('rename') && deskRenaming) finishDeskRename(e.target); });
function finishDeskRename(inp) { const old = deskRenaming; deskRenaming = null; const n = inp.value.trim(); const err = nameError('Рабочий стол', n, old); if (n && n !== baseName(old) && !err) renamePath(old, n); else if (err && n !== baseName(old)) notify({ app: 'finder', title: 'Не удалось переименовать', body: err }); renderDesktop(); }
$('desktop').addEventListener('contextmenu', e => {
  e.preventDefault(); closePanels();
  const d = e.target.closest('.dicon');
  if (d) {
    const p = d.dataset.p, en = FS.get(p);
    showMenu(e.clientX, e.clientY, [{ label: 'Открыть', action: () => openPath(p) }, { sep: true }, { label: 'Переместить в Корзину', action: () => trashPath(p) }, { sep: true },
      { label: 'Переименовать', action: () => { deskRenaming = p; renderDesktop(); } }, { label: 'Дублировать', action: () => copyPath(p, 'Рабочий стол') }, { label: 'Скопировать', action: () => { CLIP = { mode: 'copy', paths: [p] }; } },
      ...(isImage(p) ? [{ sep: true }, { label: 'Сделать картинкой рабочего стола', action: () => setS({ wallpaper: 'fs:' + p }) }] : []),
      ...(en.type === 'dir' ? [{ sep: true }, { label: 'Открыть в Терминале', action: () => openApp('terminal', p) }] : [])]);
    return;
  }
  showMenu(e.clientX, e.clientY, [
    { label: 'Новая папка', action: () => { const p = makeDir(uniquePath('Рабочий стол', 'Новая папка')).path; deskRenaming = p; renderDesktop(); } },
    { label: 'Новый текстовый файл', action: () => { const p = writeFile(uniquePath('Рабочий стол', 'Без названия', '.txt'), '').path; deskRenaming = p; renderDesktop(); } },
    { sep: true }, { label: 'Вставить', disabled: !CLIP, action: () => { CLIP.paths.forEach(p => copyPath(p, 'Рабочий стол')); } }, { sep: true },
    { label: 'Сортировать по', sub: [['name', 'Имени'], ['kind', 'Типу'], ['date', 'Дате изменения']].map(([k, n]) => ({ label: n, checked: store.get('deskSort', 'name') === k, action: () => { store.set('deskSort', k); renderDesktop(); } })) },
    { sep: true }, { label: 'Изменить обои…', action: () => openApp('settings', 'wallpaper') }, { label: 'Открыть в Терминале', action: () => openApp('terminal', 'Рабочий стол') },
  ]);
});
// Перетаскивание: значок на папку, в Корзину Dock; файлы с диска - на рабочий стол
document.addEventListener('dragstart', e => { const d = e.target.closest && e.target.closest('.dicon'); if (d) e.dataTransfer.setData('text/x-fs', JSON.stringify([d.dataset.p])); });
for (const zone of [$('desktop'), $('dock')]) {
  zone.addEventListener('dragover', e => {
    const t = e.target.closest('[data-drop]'); const fromOS = e.dataTransfer.types.includes('Files') && !e.dataTransfer.types.includes('text/x-fs');
    if (t || (fromOS && zone === $('desktop'))) { e.preventDefault(); document.querySelectorAll('.drop').forEach(x => x.classList.remove('drop')); if (t) t.classList.add('drop'); }
  });
  zone.addEventListener('dragleave', e => { const t = e.target.closest('[data-drop]'); if (t) t.classList.remove('drop'); });
  zone.addEventListener('drop', async e => {
    e.preventDefault(); document.querySelectorAll('.drop').forEach(x => x.classList.remove('drop'));
    const raw = e.dataTransfer.getData('text/x-fs'), t = e.target.closest('[data-drop]');
    if (raw) { if (t) JSON.parse(raw).forEach(p => t.dataset.drop === '__trash' ? trashPath(p) : movePath(p, t.dataset.drop)); }
    else if (zone === $('desktop')) for (const f of e.dataTransfer.files) await importFile(t && t.dataset.drop !== '__trash' ? t.dataset.drop : 'Рабочий стол', f);
  });
}
on('fs', () => { renderDesktop(); renderDock(); });

// ================= Запуск =================
(async function boot() {
  applySettings();
  await fsLoad();
  applySettings();
  renderDesktop(); renderNotifs(); renderDock(); renderMenubar();
  setTimeout(() => {
    $('boot').classList.add('hidden');
    if (!dbOk) notify({ app: 'finder', title: 'Файлы только в памяти', body: 'IndexedDB недоступна: файлы не сохранятся после перезагрузки.' });
    document.body.dataset.ready = '1';
  }, 900);
})();
