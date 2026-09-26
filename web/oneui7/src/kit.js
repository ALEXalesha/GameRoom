// ================================================================
// Набор второго этапа: «Мои файлы» на IndexedDB, всплывающие уведомления, недавние приложения,
// пауза в фоне. Файловая часть общая с телефоном «Стекло» (скопирована, своя база oneui7).
// ================================================================
const pad = pad2;
const listeners = {};
const on = (ev, fn) => (listeners[ev] = listeners[ev] || new Set()).add(fn);
const emit = ev => (listeners[ev] || []).forEach(fn => fn());

// ===== Файловая система в IndexedDB =====
const FS = new Map();
let TRASH = [], fdb = null, fdbOk = true, dbPending = 0;
const ROOTS = ['Документы', 'Загрузки', 'Изображения', 'Музыка'];
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
    try { req = indexedDB.open('oneui7', 1); } catch (e) { fdbOk = false; res(null); return; }
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
      f('Загрузки/Прочти меня.txt', 'Файлы можно добавить кнопкой «⋮» → «Добавить с устройства».\nФан-концепт интерфейса, не связан с Microsoft/Apple/Samsung.\n'),
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

// ===== Диалоги в стиле телефона: вопрос с полем и нижний лист действий =====
function oPrompt(title, value, okText = 'Готово') {
  return new Promise(resolve => {
    const d = document.createElement('div'); d.className = 'o-dlg-back';
    d.innerHTML = '<div class="o-dlg" role="dialog"><b></b><input aria-label="Имя"><div class="o-dlg-btns"><button data-r="0">Отмена</button><button data-r="1">' + okText + '</button></div></div>';
    d.querySelector('b').textContent = title;
    const inp = d.querySelector('input'); inp.value = value;
    $('screen').appendChild(d);
    inp.focus(); const dot = value.lastIndexOf('.'); inp.setSelectionRange(0, dot > 0 ? dot : value.length);
    const done = v => { d.remove(); resolve(v); };
    d.addEventListener('click', e => { const b = e.target.closest('[data-r]'); if (b) done(b.dataset.r === '1' ? inp.value.trim() : null); });
    inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') done(inp.value.trim()); if (e.key === 'Escape') done(null); });
  });
}
function oSheet(title, actions) {
  const d = document.createElement('div'); d.className = 'o-dlg-back bottom';
  d.innerHTML = '<div class="o-sheet">' + (title ? '<div class="os-title"></div>' : '') + actions.map((a, i) => '<button data-a2="' + i + '"' + (a.danger ? ' class="danger"' : '') + '>' + esc(a.label) + '</button>').join('') + '</div>';
  if (title) d.querySelector('.os-title').textContent = title;
  $('screen').appendChild(d);
  d.addEventListener('click', e => { const b = e.target.closest('[data-a2]'); if (!b && e.target !== d) return; d.remove(); if (b) actions[+b.dataset.a2].run(); });
}

// ===== «Мои файлы» на IndexedDB =====
const FOLDER_SVG = '<svg viewBox="0 0 40 32"><path d="M2 5a3 3 0 013-3h10l3 3.5h17a3 3 0 013 3V27a3 3 0 01-3 3H5a3 3 0 01-3-3z" fill="#f5b400"/><path d="M2 10h36v17a3 3 0 01-3 3H5a3 3 0 01-3-3z" fill="#ffca28"/></svg>';
const DOC_SVG = '<svg viewBox="0 0 32 40"><path d="M3 1h18l8 8v28a2 2 0 01-2 2H3a2 2 0 01-2-2V3a2 2 0 012-2z" fill="#4c8bf5"/><path d="M21 1v8h8" fill="#8ab4f8"/><path d="M7 19h18M7 24h18M7 29h12" stroke="#fff" stroke-width="1.8"/></svg>';
const thumbOf = e => { if (e.type === 'dir') return FOLDER_SVG; const u = isImage(e.path) && fileUrl(e); return u ? '<img src="' + u + '" alt="">' : DOC_SVG; };
APPS.files = {
  enter(arg) { views.files = { dir: arg && (FS.has(arg) || arg === '__trash') ? arg : null, view: null, q: '' }; },
  view() {
    const v = views.files;
    if (v.view && FS.get(v.view)) {
      const e = FS.get(v.view);
      const body = isImage(v.view) ? '<div class="fv-img" style="background-image:url(' + (fileUrl(e) || '') + ')"></div>' : e.text != null ? '<textarea class="fv-text" name="fvtext" aria-label="Текст"></textarea>' : '<div class="o-empty">Просмотр недоступен</div>';
      return shell(esc(baseName(v.view)), body, '<button class="o-hbtn" data-a="fvdel" aria-label="Удалить">🗑</button>');
    }
    if (v.dir === null) {
      const imgs = [...FS.values()].filter(e => e.type === 'file' && isImage(e.path)).length, docs = [...FS.values()].filter(e => e.type === 'file' && !isImage(e.path)).length;
      const used = [...FS.values()].reduce((s, e) => s + (e.size || 0), 0);
      const cats = [['Изображения', '🖼', 'Изображения', imgs, '#ec4899'], ['Документы', '📄', 'Документы', docs, '#4ade80'], ['Загрузки', '⬇', 'Загрузки', childrenOf('Загрузки').length, '#60a5fa'], ['__trash', '🗑', 'Корзина', TRASH.length, '#94a3b8']];
      return shell('Мои файлы', '<div class="o-card"><div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:13px"><span>Память телефона</span><span style="opacity:0.6">' + fmtSize(used) + (fdbOk ? ' · IndexedDB' : '') + '</span></div><div class="f-bar"><i style="width:' + Math.min(100, 4 + used / 2000) + '%"></i></div></div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:0 16px">' + cats.map(c => '<div class="o-card" style="margin:0;cursor:pointer" data-a="go" data-d="' + c[0] + '"><div style="font-size:24px;width:44px;height:44px;border-radius:14px;display:flex;align-items:center;justify-content:center;background:' + c[4] + '33">' + c[1] + '</div><div style="margin-top:8px;font-weight:600">' + c[2] + '</div><div style="font-size:12px;opacity:0.6">' + c[3] + '</div></div>').join('') + '</div>' +
        '<div class="o-card f-root" data-a="go" data-d="" style="cursor:pointer;margin-top:14px;display:flex;align-items:center;gap:12px"><span style="font-size:22px">📱</span><div style="flex:1"><div style="font-weight:600">Внутренняя память</div><div style="font-size:12px;opacity:0.6">Все папки</div></div><span style="opacity:.5">›</span></div>');
    }
    if (v.dir === '__trash') return shell('Корзина', TRASH.length ? [...TRASH].reverse().map(t => '<div class="o-list-row"><div class="f-th">' + (t.items[0].type === 'dir' ? FOLDER_SVG : DOC_SVG) + '</div><div class="o-main"><div class="o-title">' + esc(baseName(t.path)) + '</div><div class="o-sub">' + esc(parentOf(t.path)) + '</div></div><button class="o-chip" data-a="restore" data-id="' + t.id + '">Восстановить</button><button class="o-chip danger" data-a="kill" data-id="' + t.id + '">Удалить</button></div>').join('') : '<div class="o-empty">Корзина пуста</div>');
    const list = v.q ? [...FS.values()].filter(e => e.path && (v.dir === '' || e.path.startsWith(v.dir + '/')) && baseName(e.path).toLowerCase().includes(v.q)) : v.dir === '' ? ROOTS.map(r => FS.get(r)) : childrenOf(v.dir);
    return shell(v.dir === '' ? 'Внутренняя память' : esc(baseName(v.dir)), '<div class="f-crumbs">Память › ' + esc(v.dir.split('/').join(' › ')) + '</div><input class="o-input f-search" name="fq" placeholder="Поиск" aria-label="Поиск файлов">' +
      (list.length ? list.map(e => '<div class="o-list-row" data-a="item" data-p="' + esc(e.path) + '"><div class="f-th">' + thumbOf(e) + '</div><div class="o-main"><div class="o-title">' + esc(baseName(e.path)) + '</div><div class="o-sub">' + new Date(e.mtime).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + (e.type === 'file' ? ' · ' + fmtSize(e.size || 0) : ' · ' + childrenOf(e.path).length + ' объект.') + '</div></div></div>').join('') : '<div class="o-empty">' + (v.q ? 'Ничего не найдено' : 'Папка пуста') + '</div>') +
      '<input type="file" multiple hidden class="f-in">', v.dir !== '' ? '<button class="o-hbtn" data-a="more" aria-label="Ещё">⋮</button>' : '');
  },
  after(c) {
    const v = views.files;
    const ta = c.querySelector('[name=fvtext]'); if (ta) ta.value = FS.get(v.view).text;
    const q = c.querySelector('[name=fq]'); if (q) q.value = v.q;
    const fin = c.querySelector('.f-in');
    if (fin) fin.addEventListener('change', async () => { for (const f of fin.files) await importFile(v.dir, f); notify('files', 'Файлы добавлены', 'Папка «' + baseName(v.dir) + '»'); });
    c.querySelectorAll('[data-a=item]').forEach(row => {
      row.addEventListener('contextmenu', e => { e.preventDefault(); APPS.files.actions(row.dataset.p); });
      let lp = null;
      row.addEventListener('pointerdown', () => { lp = setTimeout(() => { lp = null; row.dataset.lp = '1'; APPS.files.actions(row.dataset.p); }, 550); });
      ['pointerup', 'pointerleave'].forEach(ev => row.addEventListener(ev, () => { clearTimeout(lp); lp = null; }));
    });
  },
  actions(p) {
    if (ROOTS.includes(p)) return;
    oSheet(baseName(p), [{ label: 'Переименовать', run: async () => { const n = await oPrompt('Переименовать', baseName(p)); if (n === null || n === baseName(p)) return; const err = nameError(parentOf(p), n, p); if (err) await oPrompt(err, n, 'ОК'); else renamePath(p, n); } },
      { label: 'Копировать', run: () => copyPath(p) }, { label: 'Удалить', danger: true, run: () => trashPath(p) }]);
  },
  input(el) {
    const v = views.files;
    if (el.name === 'fq') { v.q = el.value.trim().toLowerCase(); renderApp(); const q = $('app-container').querySelector('[name=fq]'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
  },
  saveView() { const v = views.files, ta = $('app-container').querySelector('[name=fvtext]'); if (ta && v.view && FS.get(v.view) && ta.value !== FS.get(v.view).text) writeFile(v.view, ta.value); },
  act(a, t) {
    const v = views.files;
    if (t.dataset.lp) { delete t.dataset.lp; return; }
    if (a === 'go') { v.dir = t.dataset.d; v.q = ''; }
    else if (a === 'item') { const e = FS.get(t.dataset.p); if (!e) return; if (e.type === 'dir') { v.dir = e.path; v.q = ''; } else v.view = e.path; }
    else if (a === 'restore') restoreTrash(t.dataset.id);
    else if (a === 'kill') deleteTrash(t.dataset.id);
    else if (a === 'fvdel') { const p = v.view; v.view = null; trashPath(p); }
    else if (a === 'more') {
      oSheet(null, [{ label: 'Создать папку', run: async () => { const n = await oPrompt('Новая папка', 'Новая папка'); if (!n) return; const err = nameError(v.dir, n); if (err) await oPrompt(err, n, 'ОК'); else makeDir(v.dir + '/' + n); } },
        { label: 'Создать текстовый файл', run: () => { v.view = writeFile(uniquePath(v.dir, 'Документ', '.txt'), '').path; renderApp(); } },
        { label: 'Добавить с устройства', run: () => $('app-container').querySelector('.f-in').click() }]);
      return;
    }
    renderApp();
  },
  back() {
    const v = views.files;
    if (v.view) { this.saveView(); v.view = null; renderApp(); return true; }
    if (v.dir !== null) { v.dir = v.dir === '' || v.dir === '__trash' || !parentOf(v.dir) ? (v.dir === '' || v.dir === '__trash' ? null : '') : parentOf(v.dir); v.q = ''; renderApp(); return true; }
  },
  leave() { this.saveView(); },
};
on('fs', () => { if (state.app === 'files' && !$('app-container').querySelector('[name=fvtext]:focus, [name=fq]:focus')) renderApp(); if (state.app === 'gallery') renderApp(); });

// ===== Уведомления: всплывающая карточка сверху и список в шторке =====
function notify(app, title, text) {
  notifs.unshift({ app, title, text }); notifs = notifs.slice(0, 20); store.set('notifs', notifs);
  renderNotifs(); renderLockNotifs();
  if (S.dnd || !state.unlocked) return;
  document.querySelectorAll('.heads-up').forEach(b => b.remove());
  const a = APP_LIST.find(x => x.id === app);
  const b = document.createElement('div'); b.className = 'heads-up'; b.setAttribute('role', 'status');
  b.innerHTML = '<div class="notif-icon" style="background:' + (a ? a.bg : '#666') + '">' + (ICONS[app] || '') + '</div><div class="notif-body"><div class="notif-app">' + appName(app) + ' · сейчас</div><div class="notif-title"></div><div class="notif-text"></div></div>';
  b.querySelector('.notif-title').textContent = title; b.querySelector('.notif-text').textContent = text;
  b.addEventListener('click', () => { b.remove(); notifs = notifs.filter(n => !(n.app === app && n.title === title && n.text === text)); store.set('notifs', notifs); renderNotifs(); renderLockNotifs(); openApp(app); });
  $('screen').appendChild(b);
  setTimeout(() => { b.classList.add('out'); setTimeout(() => b.remove(), 300); }, 4500);
}
function renderLockNotifs() {
  const box = $('lock-notifs'); if (!box) return;
  box.innerHTML = notifs.slice(0, 2).map((n, i) => { const a = APP_LIST.find(x => x.id === n.app); return '<div class="ln-card" data-ln="' + i + '"><div class="notif-icon" style="background:' + (a ? a.bg : '#666') + '">' + (ICONS[n.app] || '') + '</div><div><b>' + esc(n.title) + '</b><span>' + esc(n.text) + '</span></div></div>'; }).join('') + (notifs.length > 2 ? '<div class="ln-more">и ещё ' + (notifs.length - 2) + '</div>' : '');
}
(function () {
  const box = document.createElement('div'); box.id = 'lock-notifs'; box.className = 'lock-notifs';
  $('lockscreen').insertBefore(box, $('lockscreen').querySelector('.lock-now-bar'));
  box.addEventListener('click', e => { const c = e.target.closest('[data-ln]'); if (!c) return; e.stopPropagation(); const n = notifs.splice(+c.dataset.ln, 1)[0]; store.set('notifs', notifs); renderNotifs(); renderLockNotifs(); unlock(n.app); });
  renderLockNotifs();
})();
const renderNotifs0 = renderNotifs;
renderNotifs = function () { renderNotifs0(); renderLockNotifs(); };
// снимок камеры, будильник
let lastAlarm = '';
setInterval(() => { const d = new Date(), hm = pad(d.getHours()) + ':' + pad(d.getMinutes()); if (hm === lastAlarm) return; lastAlarm = hm; store.get('alarms', []).filter(a => a.on && a.t === hm).forEach(a => notify('clock', 'Будильник ' + a.t, a.label)); }, 1000);

// ===== Недавние приложения: смахнуть вверх и задержать или двойное нажатие на полоску =====
let RECENTS = [];
const openApp0 = openApp;
openApp = function (id, arg) { closeRecents(); openApp0(id, arg); RECENTS = [id].concat(RECENTS.filter(x => x !== id)); };
(function () {
  const r = document.createElement('div'); r.id = 'recents'; r.setAttribute('role', 'dialog'); r.setAttribute('aria-label', 'Недавние приложения');
  r.innerHTML = '<div class="statusbar"><div class="left" data-time></div><div class="right" data-status></div></div><div class="rc-row" id="rc-row"></div><div class="rc-empty">Нет недавних приложений</div><button class="rc-close-all" id="rc-close-all">Закрыть все</button>';
  $('screen').appendChild(r);
  renderStatus();
})();
function openRecents() {
  closeShade(); closeDrawer();
  $('rc-row').innerHTML = RECENTS.map(id => { const a = APP_LIST.find(x => x.id === id); return '<div class="rc-card" data-rc="' + id + '" role="button" aria-label="' + appName(id) + '"><div class="rc-head"><span class="notif-icon" style="background:' + (a ? a.bg : '#666') + '">' + (ICONS[id] || '') + '</span>' + appName(id) + '</div><div class="rc-shot"><div class="rc-clone"></div></div></div>'; }).join('');
  $('rc-row').querySelectorAll('.rc-card').forEach(c => { try { c.querySelector('.rc-clone').innerHTML = APPS[c.dataset.rc].view(); } catch (e) { /* предпросмотр необязателен */ } });
  $('recents').classList.toggle('empty', !RECENTS.length);
  $('recents').classList.add('open');
  state.recents = true;
  renderStatus();
}
function closeRecents() { $('recents').classList.remove('open'); state.recents = false; }
function killApp(id) { RECENTS = RECENTS.filter(x => x !== id); if (state.app === id) closeApp(); }
$('rc-close-all').addEventListener('click', e => { e.stopPropagation(); [...RECENTS].forEach(killApp); closeRecents(); closeApp(); });
let rcDrag = null;
let rcDown = false;   // отпускание того же нажатия, что открыло список, его не закрывает
$('recents').addEventListener('pointerdown', e => { rcDown = true; const c = e.target.closest('.rc-card'); e.stopPropagation(); if (!c) return; rcDrag = { c, y: e.clientY, x: e.clientX, dy: 0 }; c.setPointerCapture(e.pointerId); });
$('recents').addEventListener('pointermove', e => { if (!rcDrag) return; rcDrag.dy = Math.min(0, e.clientY - rcDrag.y); rcDrag.c.style.transform = 'translateY(' + rcDrag.dy + 'px)'; rcDrag.c.style.opacity = String(1 + rcDrag.dy / 400); });
$('recents').addEventListener('pointerup', e => {
  e.stopPropagation();
  if (!rcDown) return;
  rcDown = false;
  if (!rcDrag) { if (e.target.id === 'recents' || e.target.id === 'rc-row' || e.target.closest('.rc-empty')) closeRecents(); return; }
  const { c, dy, x, y } = rcDrag; rcDrag = null;
  if (dy < -90) { c.classList.add('gone'); killApp(c.dataset.rc); setTimeout(() => { c.remove(); if (!RECENTS.length) $('recents').classList.add('empty'); }, 200); return; }
  c.style.transform = ''; c.style.opacity = '';
  if (Math.abs(e.clientX - x) < 8 && Math.abs(e.clientY - y) < 8) openApp(c.dataset.rc);
});
let hold = null;
$('phone').addEventListener('pointerdown', e => {
  const r = $('phone').getBoundingClientRect(), k = r.height / $('phone').offsetHeight;
  if (state.unlocked && (e.clientY - r.top) / k > $('phone').offsetHeight - 70) hold = { y: e.clientY, k, timer: null };
}, true);
$('phone').addEventListener('pointermove', e => {
  // сработает, только если палец замер: каждое движение откладывает срабатывание
  if (!hold || (hold.y - e.clientY) / hold.k < 60) return;
  clearTimeout(hold.timer);
  hold.timer = setTimeout(() => { if (hold) { hold.fired = true; g = null; openRecents(); } }, 320);
}, true);
$('phone').addEventListener('pointerup', () => { if (hold) { clearTimeout(hold.timer); if (hold.fired) g = null; hold = null; } }, true);
// долгое нажатие на полоску навигации - недавние приложения (следующий щелчок гасится)
let pillTimer = null, swallowClick = false;
document.addEventListener('pointerdown', e => { if (!e.target.closest || !e.target.closest('.nav-pill') || !state.unlocked) return; clearTimeout(pillTimer); pillTimer = setTimeout(() => { swallowClick = true; closeDrawer(); openRecents(); }, 500); }, true);
document.addEventListener('pointerup', () => clearTimeout(pillTimer), true);
document.addEventListener('click', e => { if (swallowClick) { swallowClick = false; e.stopPropagation(); e.preventDefault(); } }, true);
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (document.querySelector('.o-dlg-back')) { document.querySelectorAll('.o-dlg-back.bottom').forEach(x => x.remove()); e.stopImmediatePropagation(); return; }
  if (state.recents) { e.stopImmediatePropagation(); closeRecents(); }
}, true);
const lock0 = lock;
lock = function () { closeRecents(); document.querySelectorAll('.o-dlg-back, .heads-up').forEach(x => x.remove()); lock0(); };

// ===== Вкладка скрыта - музыка и анимации на паузе =====
let pausedByTab = false;
document.addEventListener('visibilitychange', () => {
  document.body.classList.toggle('paused', document.hidden);
  if (document.hidden && music.playing) { mPause(); pausedByTab = true; } else if (!document.hidden && pausedByTab) { pausedByTab = false; mPlay(); }
});
