// ================================================================
// Набор второго этапа: «Файлы» на IndexedDB, уведомления с центром уведомлений,
// переключатель программ (смахнуть вверх и задержать или двойной щелчок по полоске), пауза в фоне.
// ================================================================

// ===== Файловая система в IndexedDB =====
const FS = new Map();
let TRASH = [], fdb = null, fdbOk = true, dbPending = 0;
const ROOTS = ['Документы', 'Загрузки', 'Изображения'];
const parentOf = p => p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '';
const baseName = p => p.slice(p.lastIndexOf('/') + 1);
const extOf = p => { const b = baseName(p), i = b.lastIndexOf('.'); return i > 0 ? b.slice(i + 1).toLowerCase() : ''; };
const isImage = p => ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(extOf(p));
const isText = p => ['txt', 'md', 'csv', 'json', 'log'].includes(extOf(p)) || !extOf(p);
function idb(fn) {
  return new Promise((res, rej) => {
    if (!fdb) { res(null); return; }
    const tx = fdb.transaction(['fs', 'trash'], 'readwrite');
    dbPending++;
    let done = false; const fin = () => { if (!done) { done = true; dbPending--; } };
    fn(tx);
    tx.oncomplete = () => { fin(); res(); };
    tx.onerror = tx.onabort = () => { fin(); rej(tx.error); };
  });
}
const dbPut = e => idb(tx => tx.objectStore('fs').put(e)).catch(er => console.warn('FS', er));
const dbDel = p => idb(tx => tx.objectStore('fs').delete(p)).catch(er => console.warn('FS', er));
const dbTrash = () => idb(tx => { const s = tx.objectStore('trash'); s.clear(); TRASH.forEach(t => s.put(t)); }).catch(er => console.warn('FS', er));
function openFDB() {
  return new Promise(res => {
    let req;
    try { req = indexedDB.open('ios26', 1); } catch (e) { fdbOk = false; res(null); return; }
    req.onupgradeneeded = () => { req.result.createObjectStore('fs', { keyPath: 'path' }); req.result.createObjectStore('trash', { keyPath: 'id' }); };
    req.onsuccess = () => res(req.result);
    req.onerror = () => { fdbOk = false; res(null); };
  });
}
function picSVG(a, b, c) {
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + a + '"/><stop offset="1" stop-color="' + b + '"/></linearGradient></defs>' +
    '<rect width="400" height="300" fill="url(#s)"/><circle cx="300" cy="80" r="34" fill="#fff" opacity=".85"/><path d="M0 230 L90 140 L160 200 L240 120 L400 250 V300 H0Z" fill="' + c + '"/><path d="M0 260 L120 200 L220 250 L320 210 L400 260 V300 H0Z" fill="' + c + '" opacity=".7"/></svg>';
}
async function fsLoad() {
  fdb = await openFDB();
  let rows = [], trash = [];
  if (fdb) {
    const all = store => new Promise(res => { const r = fdb.transaction(store).objectStore(store).getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => res([]); });
    rows = await all('fs'); trash = await all('trash');
  }
  if (!rows.length) {
    const t = Date.now(), f = (path, text) => ({ path, type: 'file', mtime: t, mime: 'text/plain', size: new Blob([text]).size, text });
    const img = (path, svg) => ({ path, type: 'file', mtime: t, mime: 'image/svg+xml', size: svg.length, text: svg });
    rows = [...ROOTS.map(r => ({ path: r, type: 'dir', mtime: t })), { path: 'Документы/Учёба', type: 'dir', mtime: t },
      f('Документы/Список покупок.txt', 'Молоко\nХлеб\nЯблоки\n'), f('Документы/Учёба/Конспект.txt', 'Тема: дроби\n1/2 + 1/4 = 3/4\n'),
      f('Загрузки/Прочти меня.txt', 'Файлы можно добавить кнопкой «…» → «Импорт».\nФан-концепт интерфейса, не связан с Microsoft/Apple/Samsung.\n'),
      img('Изображения/Горы.svg', picSVG('#7dd3fc', '#fbcfe8', '#334155')), img('Изображения/Закат.svg', picSVG('#f97316', '#7c3aed', '#1e1b4b'))];
    if (fdb) rows.forEach(dbPut);
  }
  rows.forEach(e => FS.set(e.path, e));
  ROOTS.forEach(r => { if (!FS.has(r)) FS.set(r, { path: r, type: 'dir', mtime: Date.now() }); });
  TRASH = trash.sort((a, b) => a.deleted - b.deleted);
  emit('fs');
}
const urlCache = new Map();
function fileUrl(f) {
  if (!f || f.type !== 'file') return null;
  const c = urlCache.get(f.path); if (c && c.mtime === f.mtime) return c.url;
  let url;
  if (f.blob) url = URL.createObjectURL(f.blob);
  else if (f.mime === 'image/svg+xml' && f.text) url = URL.createObjectURL(new Blob([f.text], { type: 'image/svg+xml' }));
  else return null;
  urlCache.set(f.path, { url, mtime: f.mtime });
  return url;
}
const childrenOf = dir => [...FS.values()].filter(e => e.path && parentOf(e.path) === dir).sort((a, b) => a.type === b.type ? baseName(a.path).localeCompare(baseName(b.path), 'ru') : a.type === 'dir' ? -1 : 1);
function uniquePath(dir, base, ext = '') { let n = base + ext, i = 2; while (FS.has(dir + '/' + n)) n = base + ' ' + (i++) + ext; return dir + '/' + n; }
function nameError(dir, name, self) {
  if (!name || !name.trim()) return 'Введите имя';
  if (/[\/:]/.test(name)) return 'Имя не может содержать «/» и «:»';
  if (FS.has(dir + '/' + name) && dir + '/' + name !== self) return 'Имя «' + name + '» уже занято';
  return '';
}
const subtree = p => [...FS.keys()].filter(k => k === p || k.startsWith(p + '/'));
function fsChanged() { emit('fs'); }
function writeFile(path, text) { const old = FS.get(path); const e = { path, type: 'file', mtime: Date.now(), mime: (old && old.mime) || 'text/plain', size: new Blob([text]).size, text }; FS.set(path, e); dbPut(e); fsChanged(); return e; }
function makeDir(path) { const e = { path, type: 'dir', mtime: Date.now() }; FS.set(path, e); dbPut(e); fsChanged(); return e; }
async function importFile(dir, file) {
  const m = file.name.match(/\.[^.]+$/);
  const path = uniquePath(dir, m ? file.name.slice(0, -m[0].length) : file.name, m ? m[0] : '');
  const e = { path, type: 'file', mtime: Date.now(), mime: file.type || 'application/octet-stream', size: file.size };
  if (file.type === 'image/svg+xml' || (isText(path) && file.size < 2e6)) e.text = await file.text(); else e.blob = file;
  FS.set(path, e); dbPut(e); fsChanged();
  return path;
}
function renamePath(from, name) {
  const to = parentOf(from) + '/' + name;
  subtree(from).forEach(p => { const e = FS.get(p); FS.delete(p); dbDel(p); const ne = Object.assign({}, e, { path: to + p.slice(from.length) }); FS.set(ne.path, ne); dbPut(ne); });
  fsChanged(); return to;
}
function copyPath(from) {
  const b = baseName(from), dot = b.lastIndexOf('.'), f = FS.get(from).type === 'file' && dot > 0;
  const to = uniquePath(parentOf(from), (f ? b.slice(0, dot) : b) + ' копия', f ? b.slice(dot) : '');
  subtree(from).forEach(p => { const ne = Object.assign({}, FS.get(p), { path: to + p.slice(from.length), mtime: Date.now() }); FS.set(ne.path, ne); dbPut(ne); });
  fsChanged(); return to;
}
function trashPath(path) {
  if (!FS.has(path) || ROOTS.includes(path)) return;
  const items = subtree(path).map(p => FS.get(p));
  items.forEach(e => { FS.delete(e.path); dbDel(e.path); });
  TRASH.push({ id: 't' + Date.now() + Math.random().toString(36).slice(2, 6), path, items, deleted: Date.now() });
  dbTrash(); fsChanged();
}
function restoreTrash(id) {
  const i = TRASH.findIndex(t => t.id === id); if (i < 0) return;
  const t = TRASH[i]; let to = t.path;
  if (!FS.has(parentOf(to))) makeDir(parentOf(to));
  if (FS.has(to)) { const b = baseName(to), dot = b.lastIndexOf('.'); to = uniquePath(parentOf(to), dot > 0 ? b.slice(0, dot) : b, dot > 0 ? b.slice(dot) : ''); }
  t.items.forEach(e => { const ne = Object.assign({}, e, { path: to + e.path.slice(t.path.length) }); FS.set(ne.path, ne); dbPut(ne); });
  TRASH.splice(i, 1); dbTrash(); fsChanged();
}
function deleteTrash(id) { TRASH = TRASH.filter(t => t.id !== id); dbTrash(); fsChanged(); }
const fmtSize = b => b < 1000 ? b + ' Б' : b < 1e6 ? (b / 1000).toFixed(1).replace('.', ',') + ' КБ' : (b / 1e6).toFixed(1).replace('.', ',') + ' МБ';
const fmtWhenF = t => new Date(t).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const fsReady = fsLoad();

// ===== Диалоги в стиле телефона: вопрос с полем и лист действий =====
function iosPrompt(title, value, okText = 'Готово') {
  return new Promise(resolve => {
    const d = document.createElement('div'); d.className = 'ios-alert-back';
    d.innerHTML = '<div class="ios-alert" role="dialog"><b></b><input aria-label="Имя"><div class="ia-btns"><button data-r="0">Отменить</button><button data-r="1" class="strong">' + okText + '</button></div></div>';
    d.querySelector('b').textContent = title;
    const inp = d.querySelector('input'); inp.value = value;
    $('screen').appendChild(d);
    inp.focus(); const dot = value.lastIndexOf('.'); inp.setSelectionRange(0, dot > 0 ? dot : value.length);
    const done = v => { d.remove(); resolve(v); };
    d.addEventListener('click', e => { const b = e.target.closest('[data-r]'); if (b) done(b.dataset.r === '1' ? inp.value.trim() : null); });
    inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') done(inp.value.trim()); if (e.key === 'Escape') done(null); });
  });
}
function iosSheet(title, actions) {
  const d = document.createElement('div'); d.className = 'ios-sheet-back';
  d.innerHTML = '<div class="ios-sheet"><div class="is-group">' + (title ? '<div class="is-title"></div>' : '') + actions.map((a, i) => '<button data-a="' + i + '"' + (a.danger ? ' class="danger"' : '') + '>' + esc(a.label) + '</button>').join('') + '</div><div class="is-group"><button data-a="x" class="strong">Отменить</button></div></div>';
  if (title) d.querySelector('.is-title').textContent = title;
  $('screen').appendChild(d);
  d.addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (!b && e.target !== d) return; d.remove(); if (b && b.dataset.a !== 'x') actions[+b.dataset.a].run(); });
}

// ===== Программа «Файлы» =====
ICONS.files = ['icon-files', '<svg width="36" height="36" viewBox="0 0 24 24"><path d="M3 6.5A1.5 1.5 0 014.5 5h4.2l1.8 2h9A1.5 1.5 0 0121 8.5v9a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 17.5z" fill="#fff"/><path d="M3 9h18" stroke="#60a5fa" stroke-width="1.2"/></svg>'];
APPS.files = { name: 'Файлы', cls: 'files-app', light: true, init: initFiles };
HOME.splice(HOME.indexOf('calendar') + 1, 0, 'files');
(function addFilesScreen() {
  const el = document.createElement('div');
  el.className = 'app-screen files-app'; el.id = 'app-files'; el.dataset.light = '1';
  $('apps').appendChild(el);
  screens.files = { el, inited: false, onShow: null, onHide: null, onKey: null };
  buildHome();
})();
const FOLDER_SVG = '<svg viewBox="0 0 40 32"><path d="M2 5a3 3 0 013-3h10l3 3.5h17a3 3 0 013 3V27a3 3 0 01-3 3H5a3 3 0 01-3-3z" fill="#5ac8fa"/><path d="M2 10h36v17a3 3 0 01-3 3H5a3 3 0 01-3-3z" fill="#34aadc"/></svg>';
const DOC_SVG = '<svg viewBox="0 0 32 40"><path d="M3 1h18l8 8v28a2 2 0 01-2 2H3a2 2 0 01-2-2V3a2 2 0 012-2z" fill="#fff" stroke="#c7c7cc"/><path d="M21 1v8h8" fill="#e5e5ea"/><path d="M7 17h18M7 22h18M7 27h12" stroke="#8e8e93" stroke-width="1.5"/></svg>';
function thumbOf(e) { if (e.type === 'dir') return FOLDER_SVG; const u = isImage(e.path) && fileUrl(e); return u ? '<img src="' + u + '" alt="">' : DOC_SVG; }
function initFiles(sc) {
  let dir = '', q = '', view = null;
  function listHTML() {
    if (dir === '__trash') return TRASH.length ? '<div class="f-group">' + [...TRASH].reverse().map(t => '<div class="f-row"><div class="f-th">' + (t.items[0].type === 'dir' ? FOLDER_SVG : DOC_SVG) + '</div><div class="f-main"><div class="f-name">' + esc(baseName(t.path)) + '</div><div class="f-sub">Удалено ' + fmtWhenF(t.deleted) + '</div></div><button class="f-act" data-restore="' + t.id + '">Вернуть</button><button class="f-act danger" data-kill="' + t.id + '">Удалить</button></div>').join('') + '</div>' : '<div class="empty-note">Недавно удалённых нет</div>';
    if (dir === '' && !q) return '<div class="f-sec">Места</div><div class="f-group">' + ROOTS.map(r => '<div class="f-row" data-f="' + r + '"><div class="f-th">' + FOLDER_SVG + '</div><div class="f-main"><div class="f-name">' + r + '</div><div class="f-sub">Объектов: ' + childrenOf(r).length + '</div></div><span class="chevron">›</span></div>').join('') +
      '<div class="f-row" data-f="__trash"><div class="f-th" style="font-size:24px;text-align:center">🗑</div><div class="f-main"><div class="f-name">Недавно удалённые</div><div class="f-sub">Объектов: ' + TRASH.length + '</div></div><span class="chevron">›</span></div></div>';
    const list = q ? [...FS.values()].filter(e => e.path && !ROOTS.includes(e.path) && (dir === '' || e.path.startsWith(dir + '/')) && baseName(e.path).toLowerCase().includes(q)) : childrenOf(dir);
    return list.length ? '<div class="f-group">' + list.map(e => '<div class="f-row" data-f="' + esc(e.path) + '"><div class="f-th">' + thumbOf(e) + '</div><div class="f-main"><div class="f-name">' + esc(baseName(e.path)) + '</div><div class="f-sub">' + fmtWhenF(e.mtime) + (e.type === 'file' ? ' · ' + fmtSize(e.size || 0) : ' · объектов: ' + childrenOf(e.path).length) + '</div></div>' + (e.type === 'dir' ? '<span class="chevron">›</span>' : '') + '</div>').join('') + '</div>' : '<div class="empty-note">' + (q ? 'Ничего не найдено' : 'Папка пуста') + '</div>';
  }
  function render() {
    const title = dir === '' ? 'Обзор' : dir === '__trash' ? 'Недавно удалённые' : baseName(dir);
    const canWrite = dir !== '' && dir !== '__trash';
    shell('files', '<div class="app-header">' + (dir !== '' ? '<button class="back-btn" data-fx="up">‹ ' + esc(dir === '__trash' || !parentOf(dir) ? 'Обзор' : baseName(parentOf(dir))) + '</button>' : '') +
      (canWrite ? '<button class="f-more" data-fx="more" aria-label="Ещё">•••</button>' : '') + '<div class="app-title">' + esc(title) + '</div></div>' +
      '<div class="scr-body"><label class="settings-search f-search"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8e8e93" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg><input placeholder="Поиск" aria-label="Поиск файлов"></label>' + listHTML() + '</div><input type="file" multiple hidden class="f-in">' +
      (view ? viewerHTML() : ''), true);
    const inp = sc.el.querySelector('.f-search input'); inp.value = q;
    inp.addEventListener('input', () => { q = inp.value.trim().toLowerCase(); const pos = inp.selectionStart; render(); const i2 = sc.el.querySelector('.f-search input'); i2.focus(); i2.setSelectionRange(pos, pos); });
  }
  function viewerHTML() {
    const e = FS.get(view); if (!e) { view = null; return ''; }
    const body = isImage(view) ? '<div class="fv-img" style="background-image:url(' + (fileUrl(e) || '') + ')"></div>' : e.text != null ? '<textarea class="fv-text" aria-label="Текст">' + esc(e.text) + '</textarea>' : '<div class="empty-note">Просмотр недоступен</div>';
    return '<div class="f-viewer"><div class="fv-bar"><button data-fv="close">Готово</button><b>' + esc(baseName(view)) + '</b><button data-fv="del" class="danger" aria-label="Удалить">Удалить</button></div>' + body + '</div>';
  }
  function saveView() { const ta = sc.el.querySelector('.fv-text'); if (ta && view && FS.get(view) && ta.value !== FS.get(view).text) writeFile(view, ta.value); }
  async function rename(p) {
    const n = await iosPrompt('Переименовать', baseName(p)); if (n === null || n === baseName(p)) return;
    const err = nameError(parentOf(p), n, p);
    if (err) { await iosPrompt(err, n, 'ОК'); return; }
    renamePath(p, n);
  }
  function actions(p) {
    iosSheet(baseName(p), [{ label: 'Переименовать', run: () => rename(p) }, { label: 'Дублировать', run: () => copyPath(p) }, { label: 'Удалить', danger: true, run: () => trashPath(p) }]);
  }
  sc.el.addEventListener('click', async e => {
    const x = e.target.closest('[data-fx]');
    if (x && x.dataset.fx === 'up') { dir = dir === '__trash' ? '' : parentOf(dir); q = ''; render(); return; }
    if (x && x.dataset.fx === 'more') {
      iosSheet(null, [{ label: 'Новая папка', run: async () => { const n = await iosPrompt('Новая папка', 'Новая папка'); if (n) { const err = nameError(dir, n); if (err) await iosPrompt(err, n, 'ОК'); else makeDir(dir + '/' + n); } } },
        { label: 'Новый текстовый файл', run: () => { const p = writeFile(uniquePath(dir, 'Без названия', '.txt'), '').path; view = p; render(); } },
        { label: 'Импорт с устройства', run: () => sc.el.querySelector('.f-in').click() }]);
      return;
    }
    const r = e.target.closest('[data-restore]'); if (r) { restoreTrash(r.dataset.restore); return; }
    const k = e.target.closest('[data-kill]'); if (k) { deleteTrash(k.dataset.kill); return; }
    const fv = e.target.closest('[data-fv]');
    if (fv) { if (fv.dataset.fv === 'close') { saveView(); view = null; render(); } else { const p = view; view = null; trashPath(p); } return; }
    const row = e.target.closest('[data-f]'); if (!row) return;
    const p = row.dataset.f;
    if (p === '__trash' || (FS.get(p) && FS.get(p).type === 'dir')) { dir = p; q = ''; render(); }
    else if (FS.get(p)) { view = p; render(); }
  });
  sc.el.addEventListener('contextmenu', e => { const row = e.target.closest('[data-f]'); if (!row || row.dataset.f === '__trash' || ROOTS.includes(row.dataset.f)) return; e.preventDefault(); actions(row.dataset.f); });
  // долгое нажатие на строку - действия
  let lp = null;
  sc.el.addEventListener('pointerdown', e => { const row = e.target.closest('[data-f]'); if (!row || row.dataset.f === '__trash' || ROOTS.includes(row.dataset.f)) return; lp = setTimeout(() => { lp = null; actions(row.dataset.f); }, 550); });
  ['pointerup', 'pointerleave', 'pointermove'].forEach(ev => sc.el.addEventListener(ev, e => { if (lp && (ev !== 'pointermove' || Math.abs(e.movementY) > 3)) { clearTimeout(lp); lp = null; } }));
  sc.el.addEventListener('change', async e => { if (e.target.classList.contains('f-in')) { for (const f of e.target.files) await importFile(dir, f); e.target.value = ''; notify('files', 'Файлы добавлены', 'Папка «' + baseName(dir) + '»'); } });
  sc.onKey = e => { if (e.key === 'Escape' && view) { saveView(); view = null; render(); return true; } if (e.key === 'Escape' && dir !== '') { dir = dir === '__trash' ? '' : parentOf(dir); render(); return true; } };
  sc.onHide = saveView;
  sc.onShow = arg => { if (arg) { dir = FS.has(arg) || arg === '__trash' ? arg : ''; view = null; } render(); };
  on('fs', () => { if (current === 'files' && !sc.el.querySelector('.fv-text:focus, .f-search input:focus')) render(); });
  fsReady.then(render);
  render();
}

// ===== Уведомления =====
let NOTIFS = [];
const nTime = t => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'сейчас' : m < 60 ? m + ' мин назад' : pad2(new Date(t).getHours()) + ':' + pad2(new Date(t).getMinutes()); };
function notifCard(n) { return '<div class="n-card" data-n="' + n.id + '"><div class="n-ic">' + iconHTML(n.app) + '</div><div class="n-main"><div class="n-top"><b>' + esc(APPS[n.app] ? APPS[n.app].name : 'Система') + '</b><span>' + nTime(n.t) + '</span></div><div class="n-title">' + esc(n.title) + '</div><div class="n-body">' + esc(n.body) + '</div></div></div>'; }
function notify(app, title, body) {
  const n = { id: 'n' + Date.now() + Math.random().toString(36).slice(2, 5), app, title, body, t: Date.now() };
  NOTIFS.unshift(n); NOTIFS = NOTIFS.slice(0, 20);
  renderNotifs();
  if (S.dnd || $('lock-page').classList.contains('active')) return n;       // «Не беспокоить» и экран блокировки: без баннера
  document.querySelectorAll('.banner').forEach(b => b.remove());
  const b = document.createElement('div');
  b.className = 'banner'; b.setAttribute('role', 'status'); b.innerHTML = notifCard(n);
  b.addEventListener('click', () => { b.remove(); NOTIFS = NOTIFS.filter(x => x !== n); renderNotifs(); openApp(app); });
  $('screen').appendChild(b);
  setTimeout(() => { b.classList.add('out'); setTimeout(() => b.remove(), 300); }, 4500);
  return n;
}
function renderNotifs() {
  const html = NOTIFS.map(notifCard).join('');
  $('lock-notifs').innerHTML = html;
  $('nc-list').innerHTML = html || '<div class="nc-empty">Нет уведомлений</div>';
  $('nc-clear').hidden = !NOTIFS.length;
}
(function buildNotifUI() {
  const ln = document.createElement('div'); ln.id = 'lock-notifs'; ln.className = 'lock-notifs';
  $('lock-page').insertBefore(ln, $('lock-page').querySelector('.lock-widgets'));
  const nc = document.createElement('div'); nc.id = 'nc'; nc.setAttribute('role', 'dialog'); nc.setAttribute('aria-label', 'Центр уведомлений');
  nc.innerHTML = '<div class="status-bar" data-sb></div><div class="nc-clock"><div class="nc-date"></div><div class="nc-time"></div></div><div class="nc-head"><b>Уведомления</b><button id="nc-clear">Очистить</button></div><div id="nc-list"></div><div class="home-indicator"></div>';
  $('screen').appendChild(nc);
  renderStatusBars();
})();
function openNC() { closeCC(); const d = new Date(); $('nc').querySelector('.nc-time').textContent = pad2(d.getHours()) + ':' + pad2(d.getMinutes()); $('nc').querySelector('.nc-date').textContent = DAYS[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS_GEN[d.getMonth()]; renderNotifs(); $('nc').classList.add('open'); }
function closeNC() { $('nc').classList.remove('open'); }
$('nc').addEventListener('click', e => {
  if (e.target.closest('#nc-clear')) { NOTIFS = []; renderNotifs(); return; }
  const c = e.target.closest('[data-n]');
  if (c) { const n = NOTIFS.find(x => x.id === c.dataset.n); NOTIFS = NOTIFS.filter(x => x !== n); renderNotifs(); closeNC(); if (n) openApp(n.app); return; }
  if (e.target.closest('.home-indicator') || e.target.id === 'nc' || e.target.closest('.nc-clock')) closeNC();
});
$('lock-notifs').addEventListener('pointerup', e => { if (e.target.closest('.n-card')) e.stopPropagation(); });
$('lock-notifs').addEventListener('click', e => { const c = e.target.closest('[data-n]'); if (!c) return; e.stopPropagation(); const n = NOTIFS.find(x => x.id === c.dataset.n); NOTIFS = NOTIFS.filter(x => x !== n); renderNotifs(); if (n) openApp(n.app); });
// события, о которых сообщается
on('photos', () => { if (current === 'camera') notify('photos', 'Снимок сохранён', 'Фото добавлено в медиатеку'); });

// ===== Переключатель программ =====
let RECENTS = [];
const openApp0 = openApp;
openApp = function (id, arg) { closeNC(); closeSwitcher(true); openApp0(id, arg); if (current === id) RECENTS = [id].concat(RECENTS.filter(x => x !== id)); };
(function buildSwitcher() {
  const s = document.createElement('div'); s.id = 'switcher'; s.setAttribute('role', 'dialog'); s.setAttribute('aria-label', 'Переключатель программ');
  s.innerHTML = '<div class="sw-row" id="sw-row"></div><div class="sw-empty">Нет открытых программ</div>';
  $('screen').appendChild(s);
})();
function openSwitcher() {
  closeCC(); closeNC();
  const row = $('sw-row');
  row.innerHTML = RECENTS.map(id => '<div class="sw-card" data-sw="' + id + '" role="button" aria-label="' + APPS[id].name + '"><div class="sw-head">' + iconHTML(id) + '<span>' + APPS[id].name + '</span></div><div class="sw-shot"></div></div>').join('');
  row.querySelectorAll('.sw-card').forEach(card => {
    const src = screens[card.dataset.sw].el, c = src.cloneNode(true);
    c.removeAttribute('id'); c.querySelectorAll('[id]').forEach(x => x.removeAttribute('id'));
    c.classList.add('active', 'sw-clone');
    card.querySelector('.sw-shot').appendChild(c);
  });
  $('switcher').classList.toggle('empty', !RECENTS.length);
  $('switcher').classList.add('open');
  const cur = row.querySelector('[data-sw="' + current + '"]'); if (cur) cur.scrollIntoView({ inline: 'center', block: 'nearest' });
}
function closeSwitcher(silent) { if (!$('switcher').classList.contains('open')) return; $('switcher').classList.remove('open'); if (!silent && !current) showHome(); }
function killApp(id) {
  RECENTS = RECENTS.filter(x => x !== id);
  if (current === id) hideApp();
  const sc = screens[id]; if (sc.onHide) sc.onHide();
}
let swDrag = null;
$('switcher').addEventListener('pointerdown', e => { const c = e.target.closest('.sw-card'); if (!c) return; e.stopPropagation(); swDrag = { c, y: e.clientY, x: e.clientX, dy: 0 }; c.setPointerCapture(e.pointerId); });
$('switcher').addEventListener('pointermove', e => { if (!swDrag) return; swDrag.dy = Math.min(0, e.clientY - swDrag.y); swDrag.c.style.transform = 'translateY(' + swDrag.dy + 'px)'; swDrag.c.style.opacity = String(1 + swDrag.dy / 400); });
$('switcher').addEventListener('pointerup', e => {
  e.stopPropagation();
  if (!swDrag) { if (!e.target.closest('.sw-card')) { closeSwitcher(); } return; }
  const { c, dy, x, y } = swDrag; swDrag = null;
  if (dy < -90) { c.classList.add('gone'); killApp(c.dataset.sw); setTimeout(() => { c.remove(); if (!RECENTS.length) { $('switcher').classList.add('empty'); } }, 200); return; }
  c.style.transform = ''; c.style.opacity = '';
  if (Math.abs(e.clientX - x) < 8 && Math.abs(e.clientY - y) < 8) { const id = c.dataset.sw; closeSwitcher(true); openApp(id); }
});
// жест: смахнуть снизу вверх и задержать палец - переключатель
let hold = null;
$('device').addEventListener('pointerdown', e => {
  const r = $('device').getBoundingClientRect(), k = r.height / $('device').offsetHeight;
  if ((e.clientY - r.top) / k > $('device').offsetHeight - 70 && !$('lock-page').classList.contains('active')) hold = { y: e.clientY, k, timer: null };
}, true);
$('device').addEventListener('pointermove', e => {
  if (!hold || hold.timer || (hold.y - e.clientY) / hold.k < 60) return;
  hold.timer = setTimeout(() => { if (hold) { hold.fired = true; g = null; openSwitcher(); } }, 320);
}, true);
$('device').addEventListener('pointerup', () => { if (hold) { clearTimeout(hold.timer); if (hold.fired) g = null; hold = null; } }, true);
$('screen').addEventListener('dblclick', e => { if (e.target.closest('.home-indicator') && !$('lock-page').classList.contains('active')) openSwitcher(); });
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (document.querySelector('.ios-alert-back, .ios-sheet-back')) { document.querySelectorAll('.ios-sheet-back').forEach(x => x.remove()); e.stopImmediatePropagation(); return; }
  if ($('switcher').classList.contains('open')) { e.stopImmediatePropagation(); closeSwitcher(); return; }
  if ($('nc').classList.contains('open')) { e.stopImmediatePropagation(); closeNC(); }
}, true);
const showLock0 = showLock;
showLock = function () { closeNC(); closeSwitcher(true); document.querySelectorAll('.ios-alert-back, .ios-sheet-back, .banner').forEach(x => x.remove()); showLock0(); renderNotifs(); };

// будильники из «Часов» присылают уведомление
let lastAlarm = '';
setInterval(() => { const d = new Date(), hm = pad2(d.getHours()) + ':' + pad2(d.getMinutes()); if (hm === lastAlarm) return; lastAlarm = hm; store.get('alarms', []).filter(a => a.on && a.t === hm).forEach(a => notify('clock', 'Будильник ' + a.t, a.label)); }, 1000);

// ===== Вкладка скрыта - анимации и звук на паузе =====
document.addEventListener('visibilitychange', () => { document.body.classList.toggle('paused', document.hidden); emit('visibility'); });
renderNotifs();
