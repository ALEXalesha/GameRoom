'use strict';
// =====================================================================
// Windows-подобная оболочка. Фан-концепт интерфейса, не связан с Microsoft/Apple/Samsung.
// Работает без сети. Файлы - в IndexedDB, настройки - в localStorage (префикс win11_3.).
// =====================================================================
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const store = {
  get(k, d) { try { const v = localStorage.getItem('win11_3.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('win11_3.' + k, JSON.stringify(v)); } catch (e) { /* хранилище недоступно */ } },
  clear() { try { Object.keys(localStorage).filter(k => k.startsWith('win11_3.')).forEach(k => localStorage.removeItem(k)); } catch (e) { /* нет доступа */ } },
};
const bus = {};
const on = (ev, fn) => { (bus[ev] = bus[ev] || new Set()).add(fn); return () => bus[ev].delete(fn); };
const emit = (ev, a) => (bus[ev] || []).forEach(fn => fn(a));
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const DAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

// ================= Значки в духе системы (свои, SVG) =================
const G = (id, body, vb = '0 0 48 48') => '<svg viewBox="' + vb + '" aria-hidden="true">' + body + '</svg>';
const FOLDER = '<path d="M4 10a3 3 0 013-3h11l4 4h19a3 3 0 013 3v4H4z" fill="url(#gFolderBack)"/><path d="M4 16h40v22a3 3 0 01-3 3H7a3 3 0 01-3-3z" fill="url(#gFolderFront)"/>';
const ICON = {
  start: G('start', '<rect x="3" y="3" width="42" height="42" rx="11" fill="url(#gMark)"/><path d="M24 10c1.6 7.4 6.6 12.4 14 14-7.4 1.6-12.4 6.6-14 14-1.6-7.4-6.6-12.4-14-14 7.4-1.6 12.4-6.6 14-14z" fill="#fff"/>'),
  search: G('search', '<circle cx="20" cy="20" r="11" fill="none" stroke="currentColor" stroke-width="3.2"/><path d="M28.5 28.5L39 39" stroke="currentColor" stroke-width="3.6" stroke-linecap="round"/>'),
  taskview: G('tv', '<rect x="5" y="12" width="26" height="22" rx="4" fill="none" stroke="currentColor" stroke-width="3"/><path d="M17 12V9a3 3 0 013-3h20a3 3 0 013 3v17a3 3 0 01-3 3h-9" fill="none" stroke="currentColor" stroke-width="3"/>'),
  folder: G('folder', FOLDER),
  explorer: G('explorer', FOLDER + '<rect x="4" y="27" width="40" height="4" fill="#fff" opacity=".35"/>'),
  documents: G('docs', FOLDER + '<rect x="18" y="21" width="12" height="15" rx="1.5" fill="#fff"/><path d="M20.5 26h7M20.5 29.5h7M20.5 33h5" stroke="#3b82f6" stroke-width="1.5"/>'),
  downloads: G('dl', FOLDER + '<path d="M24 20v12m-5-5l5 5 5-5M18 36h12" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round"/>'),
  pictures: G('pics', FOLDER + '<rect x="16" y="21" width="16" height="13" rx="2" fill="#fff"/><path d="M17 33l4.5-5 3 3 3-4 3.5 6z" fill="#34c759"/><circle cx="21" cy="25" r="1.6" fill="#ffb900"/>'),
  music: G('mus', FOLDER + '<path d="M26 20v10.5a3 3 0 11-2-2.8V22l6-2v8.5a3 3 0 11-2-2.8" fill="none" stroke="#fff" stroke-width="2"/>'),
  desktopf: G('desk', FOLDER + '<rect x="16" y="21" width="16" height="11" rx="1.5" fill="#fff"/><path d="M21 35h6" stroke="#fff" stroke-width="2"/>'),
  pc: G('pc', '<rect x="5" y="8" width="38" height="26" rx="3" fill="url(#gBlue)"/><rect x="8" y="11" width="32" height="20" rx="1.5" fill="#0b3a6e"/><path d="M8 26l9-8 7 6 5-4 11 8v3H8z" fill="#4fc3f7" opacity=".6"/><rect x="20" y="34" width="8" height="5" fill="#9aa4ae"/><rect x="14" y="39" width="20" height="3" rx="1.5" fill="#b8c1ca"/>'),
  notepad: G('np', '<path d="M11 6h20l8 8v27a3 3 0 01-3 3H11a3 3 0 01-3-3V9a3 3 0 013-3z" fill="url(#gBlue)"/><path d="M31 6v6a2 2 0 002 2h6" fill="#9bd4ff"/><path d="M14 22h18M14 28h18M14 34h12" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><path d="M34 30l6-6 3 3-6 6h-3z" fill="#ffb900"/>'),
  calc: G('calc', '<rect x="9" y="4" width="30" height="40" rx="5" fill="url(#gGrey)"/><rect x="13" y="8" width="22" height="9" rx="2" fill="#dff3ff"/><g fill="#e8e8e8"><rect x="13" y="21" width="6" height="5" rx="1.2"/><rect x="21" y="21" width="6" height="5" rx="1.2"/><rect x="13" y="28" width="6" height="5" rx="1.2"/><rect x="21" y="28" width="6" height="5" rx="1.2"/><rect x="13" y="35" width="14" height="5" rx="1.2"/></g><rect x="29" y="21" width="6" height="12" rx="1.2" fill="#ffb366"/><rect x="29" y="35" width="6" height="5" rx="1.2" fill="url(#gBlue)"/>'),
  settings: G('set', '<path d="M24 4l4 5 6-1 1 6 5 4-3 5 3 5-5 4-1 6-6-1-4 5-4-5-6 1-1-6-5-4 3-5-3-5 5-4 1-6 6 1z" fill="url(#gGrey)"/><circle cx="24" cy="24" r="8" fill="none" stroke="#e6e6e6" stroke-width="3.5"/>'),
  browser: G('br', '<circle cx="24" cy="24" r="19" fill="url(#gTeal)"/><path d="M24 5a19 19 0 000 38M24 5a19 19 0 010 38M6 18h36M6 30h36M24 5c-7 6-7 32 0 38M24 5c7 6 7 32 0 38" fill="none" stroke="#fff" stroke-width="2" opacity=".85"/>'),
  photos: G('ph', '<rect x="4" y="7" width="40" height="34" rx="6" fill="url(#gSky)"/><circle cx="33" cy="17" r="4" fill="url(#gSun)"/><path d="M4 34l12-12 9 9 5-5 14 12v1a2 2 0 01-2 2H6a2 2 0 01-2-2z" fill="#fff" opacity=".9"/><path d="M4 36l12-12 9 9 5-5 14 12" fill="none" stroke="#0f5ca8" stroke-width="1" opacity=".3"/>'),
  // нота собрана из головки, штиля и флажка; группа сдвинута так, что центр масс знака совпадает с центром значка (проверяется законом)
  media: G('md', '<rect x="5" y="5" width="38" height="38" rx="6" fill="url(#gOrange)"/><g data-glyph="note" transform="translate(-0.12 -0.74)"><ellipse cx="20" cy="30.5" rx="5.6" ry="4.3" transform="rotate(-22 20 30.5)" fill="#fff"/><rect x="23.6" y="11" width="2.8" height="19.5" rx="1" fill="#fff"/><path d="M25 11.4c0 4.5 3.4 6.4 6 8.5 2 1.7 2.4 4.2 1.2 6.4" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round"/></g>'),
  clock: G('ck', '<circle cx="24" cy="26" r="17" fill="url(#gBlue2)"/><circle cx="24" cy="26" r="13" fill="#fff"/><path d="M24 17v9l6 4" stroke="#0f5ca8" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M8 11l6-5M40 11l-6-5" stroke="url(#gBlue2)" stroke-width="4" stroke-linecap="round"/>'),
  weather: G('wt', '<circle cx="18" cy="18" r="9" fill="url(#gSun)"/><path d="M15 40a8 8 0 010-16 11 11 0 0121 3 6.5 6.5 0 01-1 13z" fill="#fff"/><path d="M15 40a8 8 0 010-16 11 11 0 0121 3 6.5 6.5 0 01-1 13z" fill="none" stroke="#8fb9e6"/>'),
  terminal: G('tm', '<rect x="4" y="7" width="40" height="34" rx="5" fill="#2b2b2b"/><rect x="4" y="7" width="40" height="8" rx="4" fill="#3c3c3c"/><path d="M12 22l6 5-6 5" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M22 33h12" stroke="#4cc2ff" stroke-width="3" stroke-linecap="round"/>'),
  recycle: G('rb', '<path d="M11 14h26l-2.5 26a3 3 0 01-3 2.7h-15a3 3 0 01-3-2.7z" fill="url(#gGreyL)" stroke="#8a8f96"/><rect x="8" y="10" width="32" height="5" rx="2" fill="#dfe3e8" stroke="#8a8f96"/><path d="M19 20l1 18M24 20v18M29 20l-1 18" stroke="#9aa0a6" stroke-width="1.5"/>'),
  recycleFull: G('rbf', '<path d="M14 12l6-6 7 5 6-3 2 5z" fill="#fff" stroke="#8a8f96"/><path d="M11 14h26l-2.5 26a3 3 0 01-3 2.7h-15a3 3 0 01-3-2.7z" fill="url(#gGreyL)" stroke="#8a8f96"/><rect x="8" y="10" width="32" height="5" rx="2" fill="#dfe3e8" stroke="#8a8f96"/><path d="M19 20l1 18M24 20v18M29 20l-1 18" stroke="#9aa0a6" stroke-width="1.5"/>'),
  textfile: G('tf', '<path d="M11 4h18l10 10v27a3 3 0 01-3 3H11a3 3 0 01-3-3V7a3 3 0 013-3z" fill="#fff" stroke="#b4b8bd"/><path d="M29 4v8a2 2 0 002 2h8" fill="#e8ebee" stroke="#b4b8bd"/><path d="M14 22h19M14 27h19M14 32h19M14 37h12" stroke="#8f959c" stroke-width="1.6"/>'),
  imagefile: G('if', '<path d="M11 4h18l10 10v27a3 3 0 01-3 3H11a3 3 0 01-3-3V7a3 3 0 013-3z" fill="#fff" stroke="#b4b8bd"/><rect x="13" y="20" width="22" height="17" rx="2" fill="url(#gSky)"/><path d="M13 35l7-7 5 5 3-3 7 6v1H13z" fill="#fff"/>'),
  paint: G('pt', '<path d="M24 5C12 5 4 13 4 23c0 9 7 15 13 15 3 0 4-2 4-4 0-3 2-4 5-4h6c7 0 12-5 12-11C44 11 35 5 24 5z" fill="url(#gPink)"/><circle cx="14" cy="20" r="3.2" fill="#ffd54f"/><circle cx="22" cy="13" r="3.2" fill="#4fc3f7"/><circle cx="32" cy="15" r="3.2" fill="#81c784"/><circle cx="36" cy="24" r="3.2" fill="#fff"/>'),
  messenger: G('ms', '<path d="M6 12a6 6 0 016-6h20a6 6 0 016 6v12a6 6 0 01-6 6H18l-8 7v-7.5A6 6 0 016 24z" fill="url(#gTeal)"/><path d="M40 18a4 4 0 014 4v10a4 4 0 01-4 4v5l-6-5H24a4 4 0 01-4-4v-1h12a8 8 0 008-8z" fill="#9ff0e5"/><path d="M13 15h18M13 21h12" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>'),
};
const SI = { // системные значки 16x16, цвет от текста
  wifi: G('wifi', '<path d="M1 6.3a10 10 0 0114 0M3.4 8.7a6.6 6.6 0 019.2 0M5.8 11.1a3.2 3.2 0 014.4 0" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="8" cy="13.3" r="1.1" fill="currentColor"/>', '0 0 16 16'),
  vol: G('vol', '<path d="M2 6h2.5L8 3v10L4.5 10H2z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M10.5 5.5a3.5 3.5 0 010 5M12.3 3.7a6 6 0 010 8.6" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>', '0 0 16 16'),
  mute: G('mute', '<path d="M2 6h2.5L8 3v10L4.5 10H2z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M10.5 6l4 4m0-4l-4 4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>', '0 0 16 16'),
  battery: G('bat', '<rect x="1" y="4.5" width="12.5" height="7" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.1"/><rect x="2.7" y="6.2" width="7" height="3.6" rx=".6" fill="currentColor"/><rect x="14" y="6.5" width="1.3" height="3" rx=".5" fill="currentColor"/>', '0 0 16 16'),
  bell: G('bell', '<path d="M8 2a4 4 0 014 4v2.8l1.3 2.2H2.7L4 8.8V6a4 4 0 014-4zM6.3 13a1.8 1.8 0 003.4 0" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>', '0 0 16 16'),
  lock: G('lock', '<rect x="3" y="7" width="10" height="7.5" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M5 7V5a3 3 0 016 0v2" fill="none" stroke="currentColor" stroke-width="1.2"/>', '0 0 16 16'),
  power: G('pow', '<path d="M8 1.5v6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M4.6 3.6a5.5 5.5 0 106.8 0" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>', '0 0 16 16'),
  restart: G('rst', '<path d="M13 8a5 5 0 11-1.5-3.6M13 2.5v3h-3" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>', '0 0 16 16'),
  sleep: G('slp', '<path d="M13.5 9.8A6 6 0 016.2 2.5a6 6 0 107.3 7.3z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>', '0 0 16 16'),
  min: G('min', '<path d="M1 5h8" stroke="currentColor" stroke-width="1"/>', '0 0 10 10'),
  max: G('max', '<rect x="1" y="1" width="8" height="8" rx="1.2" fill="none" stroke="currentColor" stroke-width="1"/>', '0 0 10 10'),
  restore: G('res', '<rect x="1" y="3" width="6" height="6" rx="1" fill="none" stroke="currentColor" stroke-width="1"/><path d="M3 3V2a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H7" fill="none" stroke="currentColor" stroke-width="1"/>', '0 0 10 10'),
  close: G('cls', '<path d="M1 1l8 8M9 1L1 9" stroke="currentColor" stroke-width="1"/>', '0 0 10 10'),
  x: G('x', '<path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>', '0 0 16 16'),
  back: G('bk', '<path d="M13 8H3m4-4L3 8l4 4" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>', '0 0 16 16'),
  fwd: G('fw', '<path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>', '0 0 16 16'),
  up: G('upi', '<path d="M8 13V3M4 7l4-4 4 4" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>', '0 0 16 16'),
  refresh: G('rf', '<path d="M13 8a5 5 0 11-1.5-3.6M13 2.5v3h-3" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>', '0 0 16 16'),
  plus: G('pl', '<path d="M8 2.5v11M2.5 8h11" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>', '0 0 16 16'),
  cut: G('cut', '<circle cx="4.5" cy="11.5" r="2" fill="none" stroke="currentColor" stroke-width="1.1"/><circle cx="11.5" cy="11.5" r="2" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M5.8 10L11 2M10.2 10L5 2" stroke="currentColor" stroke-width="1.1"/>', '0 0 16 16'),
  copy: G('cp', '<rect x="5" y="5" width="8.5" height="9.5" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M3 11V3a1.5 1.5 0 011.5-1.5H10" fill="none" stroke="currentColor" stroke-width="1.1"/>', '0 0 16 16'),
  paste: G('ps', '<rect x="3" y="3" width="10" height="11.5" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.1"/><rect x="5.5" y="1.5" width="5" height="3" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/>', '0 0 16 16'),
  rename: G('rn', '<path d="M3 12.5l1-3.2 7-7 2.2 2.2-7 7z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M2 14.5h12" stroke="currentColor" stroke-width="1.1"/>', '0 0 16 16'),
  trash: G('tr', '<path d="M3 4h10M6 4V2.5h4V4M4.3 4l.7 10h6l.7-10" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>', '0 0 16 16'),
  sort: G('so', '<path d="M4 2v12m-2.5-2.5L4 14l2.5-2.5M12 14V2m-2.5 2.5L12 2l2.5 2.5" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>', '0 0 16 16'),
  view: G('vw', '<rect x="2" y="2" width="5" height="5" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/><rect x="9" y="2" width="5" height="5" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/><rect x="2" y="9" width="5" height="5" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/><rect x="9" y="9" width="5" height="5" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/>', '0 0 16 16'),
  newfolder: G('nf', '<path d="M1.5 4a1 1 0 011-1H6l1.5 1.5h6a1 1 0 011 1V12a1 1 0 01-1 1h-11a1 1 0 01-1-1z" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M8 7v4M6 9h4" stroke="currentColor" stroke-width="1.1"/>', '0 0 16 16'),
  import: G('im', '<path d="M8 2v8m-3-3l3 3 3-3M2.5 11v2.5h11V11" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>', '0 0 16 16'),
  preview: G('pv', '<rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M10 2.5v11" stroke="currentColor" stroke-width="1.1"/>', '0 0 16 16'),
  play: G('pla', '<path d="M4.5 2.5l9 5.5-9 5.5z" fill="currentColor"/>', '0 0 16 16'),
  pause: G('pau', '<rect x="4" y="2.5" width="3" height="11" rx=".8" fill="currentColor"/><rect x="9" y="2.5" width="3" height="11" rx=".8" fill="currentColor"/>', '0 0 16 16'),
  prev: G('prv', '<path d="M12.5 3v10L5 8zM3.5 3v10" fill="currentColor" stroke="currentColor" stroke-width="1.3"/>', '0 0 16 16'),
  next: G('nxt', '<path d="M3.5 3v10L11 8zM12.5 3v10" fill="currentColor" stroke="currentColor" stroke-width="1.3"/>', '0 0 16 16'),
  bt: G('bt', '<path d="M4.5 5l7 6-3.5 3V2l3.5 3-7 6" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>', '0 0 16 16'),
  plane: G('pln', '<path d="M8 1.5c.6 0 1 .5 1 1.2v3.6l5 3v1.5l-5-1.4v2.8l1.5 1.2v1.1L8 13.8l-2.5.7v-1.1L7 12.2V9.4l-5 1.4V9.3l5-3V2.7c0-.7.4-1.2 1-1.2z" fill="none" stroke="currentColor" stroke-width="1"/>', '0 0 16 16'),
  saver: G('sv', '<rect x="1" y="4.5" width="12.5" height="7" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M8 5.5L5.5 8.3h2.6L6.5 10.8" fill="none" stroke="currentColor" stroke-width="1.1"/><rect x="14" y="6.5" width="1.3" height="3" rx=".5" fill="currentColor"/>', '0 0 16 16'),
  night: G('nt', '<path d="M8 2v1.5M8 12.5V14M2 8h1.5M12.5 8H14M3.8 3.8l1 1M11.2 11.2l1 1M3.8 12.2l1-1M11.2 4.8l1-1" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/><circle cx="8" cy="8" r="2.8" fill="none" stroke="currentColor" stroke-width="1.1"/>', '0 0 16 16'),
  focus: G('fc', '<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.1"/><circle cx="8" cy="8" r="2.5" fill="currentColor"/>', '0 0 16 16'),
  sun: G('sn', '<circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6L13 13M3 13l1.4-1.4M11.6 4.4L13 3" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>', '0 0 16 16'),
  gear: G('ge', '<circle cx="8" cy="8" r="2.3" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M8 1.5l1 1.8 2-.3.5 2 1.8 1-.9 1.9.9 1.9-1.8 1-.5 2-2-.3-1 1.8-1-1.8-2 .3-.5-2-1.8-1 .9-1.9-.9-1.9 1.8-1 .5-2 2 .3z" fill="none" stroke="currentColor" stroke-width="1"/>', '0 0 16 16'),
  edit: G('ed', '<path d="M3 13l.8-3 7.2-7.2 2.2 2.2L6 12.2z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>', '0 0 16 16'),
  chevUp: G('cu', '<path d="M3 10l5-5 5 5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>', '0 0 16 16'),
  chevDown: G('cd', '<path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>', '0 0 16 16'),
  chevRight: G('cr', '<path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>', '0 0 16 16'),
  home: G('hm', '<path d="M2 7.5L8 2.5l6 5V14H10V10H6v4H2z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>', '0 0 16 16'),
  open: G('op', '<path d="M9 2.5h4.5V7M13.5 2.5L7 9M11 10v3.5H2.5V5H6" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>', '0 0 16 16'),
  info: G('in', '<circle cx="8" cy="8" r="6.3" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M8 7v4.3M8 4.6v.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>', '0 0 16 16'),
  wallpaper: G('wp', '<rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M2 12l4-4 3 3 2-2 3 3" fill="none" stroke="currentColor" stroke-width="1.1"/>', '0 0 16 16'),
  term: G('tmi', '<rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M4 6l2.5 2L4 10M8 10.5h4" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>', '0 0 16 16'),
  display: G('dp', '<rect x="1.5" y="2" width="13" height="9" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M5.5 14h5M8 11v3" stroke="currentColor" stroke-width="1.1"/>', '0 0 16 16'),
  person: G('pr', '<circle cx="8" cy="5.5" r="3" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M2.5 14.5a5.5 5.5 0 0111 0" fill="none" stroke="currentColor" stroke-width="1.1"/>', '0 0 16 16'),
  time: G('ti', '<circle cx="8" cy="8" r="6.3" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M8 4.5V8l2.5 1.8" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>', '0 0 16 16'),
  access: G('ac', '<circle cx="8" cy="3" r="1.3" fill="currentColor"/><path d="M3 5.5l5 1 5-1M8 6.5v3l-2.5 5M8 9.5l2.5 5" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>', '0 0 16 16'),
  network: G('nw', '<circle cx="8" cy="8" r="6.3" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M1.7 8h12.6M8 1.7c-2.2 2.2-2.2 10.4 0 12.6M8 1.7c2.2 2.2 2.2 10.4 0 12.6" fill="none" stroke="currentColor" stroke-width="1"/>', '0 0 16 16'),
  brush: G('bru', '<path d="M13.5 2.5L7 9l-1.5-1.5L12 1z" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M5.5 7.5C3 7.5 3 10 2 12.5c2.5 0 5.5-.5 5-3.5" fill="none" stroke="currentColor" stroke-width="1.1"/>', '0 0 16 16'),
  apps: G('ap', '<rect x="2" y="2" width="5" height="5" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/><rect x="9" y="2" width="5" height="5" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/><rect x="2" y="9" width="5" height="5" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/><rect x="9" y="9" width="5" height="5" rx="1" fill="none" stroke="currentColor" stroke-width="1.1"/>', '0 0 16 16'),
};

// Значки в разметке: data-ic - цветные, data-si - системные
document.querySelectorAll('[data-ic]').forEach(e => { e.innerHTML = ICON[e.dataset.ic]; });
document.querySelectorAll('[data-si]').forEach(e => { e.innerHTML = SI[e.dataset.si]; });

// ================= Обои: генерируются кодом (SVG), своих картинок нет =================
function svgUrl(svg) { return 'url("data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg) + '")'; }
function bloomSVG(dark, hue = 220) {
  const c = (l, s = 90) => 'hsl(' + hue + ',' + s + '%,' + l + '%)';
  const bg = dark ? [c(8, 70), c(22, 75)] : [c(86, 80), c(97, 60)];
  const pet = dark ? [c(78, 100), c(55, 95), c(30, 90)] : [c(97, 100), c(72, 95), c(52, 90)];
  let petals = '';
  [-75, -56, -37, -18, 0, 18, 37, 56, 75].forEach(a => { petals += '<ellipse cx="0" cy="-250" rx="92" ry="270" fill="url(#p)" opacity="0.62" transform="rotate(' + a + ')"/>'; });
  [-48, -24, 0, 24, 48].forEach(a => { petals += '<ellipse cx="0" cy="-175" rx="64" ry="190" fill="url(#q)" opacity="0.7" transform="rotate(' + a + ')"/>'; });
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice"><defs>' +
    '<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + bg[0] + '"/><stop offset="1" stop-color="' + bg[1] + '"/></linearGradient>' +
    '<radialGradient id="p" cx="0.5" cy="0.15" r="0.95"><stop offset="0" stop-color="' + pet[0] + '"/><stop offset="0.55" stop-color="' + pet[1] + '"/><stop offset="1" stop-color="' + pet[2] + '"/></radialGradient>' +
    '<radialGradient id="q" cx="0.5" cy="0.1" r="0.9"><stop offset="0" stop-color="#fff" stop-opacity="0.95"/><stop offset="1" stop-color="' + pet[1] + '"/></radialGradient>' +
    '<radialGradient id="g" cx="0.5" cy="0.62" r="0.5"><stop offset="0" stop-color="' + pet[0] + '" stop-opacity="0.55"/><stop offset="1" stop-color="' + pet[0] + '" stop-opacity="0"/></radialGradient>' +
    '<filter id="b" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="5"/></filter></defs>' +
    '<rect width="1600" height="1000" fill="url(#bg)"/><rect width="1600" height="1000" fill="url(#g)"/><g transform="translate(800 760)" filter="url(#b)">' + petals + '</g></svg>';
}
function wavesSVG(dark) {
  const cols = dark ? ['#0b132b', '#1c2541', '#3a506b', '#5bc0be'] : ['#e0f7fa', '#b2ebf2', '#4dd0e1', '#00838f'];
  let paths = '';
  for (let i = 0; i < 4; i++) {
    const y = 420 + i * 130, a = 80 - i * 10;
    paths += '<path d="M0 ' + y + ' C 400 ' + (y - a) + ', 800 ' + (y + a) + ', 1600 ' + (y - a / 2) + ' V1000 H0 Z" fill="' + cols[i] + '" opacity="' + (0.75 + i * 0.08) + '"/>';
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice"><rect width="1600" height="1000" fill="' + (dark ? '#050814' : '#f5fdff') + '"/>' + paths + '</svg>';
}
function glowSVG(dark) {
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice"><defs><filter id="b"><feGaussianBlur stdDeviation="90"/></filter></defs>' +
    '<rect width="1600" height="1000" fill="' + (dark ? '#120b24' : '#fff5ee') + '"/><g filter="url(#b)" opacity="' + (dark ? 0.85 : 0.7) + '">' +
    '<circle cx="380" cy="300" r="300" fill="#ff5f9e"/><circle cx="1200" cy="260" r="320" fill="#7c5cff"/><circle cx="820" cy="780" r="340" fill="#ffb347"/><circle cx="1400" cy="820" r="220" fill="#34d1bf"/></g></svg>';
}
const WALLS = {
  bloom: { name: 'Цветение', css: d => svgUrl(bloomSVG(d, 218)) },
  bloomViolet: { name: 'Цветение, фиалка', css: d => svgUrl(bloomSVG(d, 268)) },
  bloomTeal: { name: 'Цветение, лагуна', css: d => svgUrl(bloomSVG(d, 188)) },
  glow: { name: 'Свечение', css: d => svgUrl(glowSVG(d)) },
  waves: { name: 'Волны', css: d => svgUrl(wavesSVG(d)) },
  graphite: { name: 'Графит', css: d => d ? 'linear-gradient(135deg,#1f1f1f,#3a3a3a)' : 'linear-gradient(135deg,#d9d9d9,#f5f5f5)' },
};
const ACCENTS = [['#4cc2ff', '#0078d4'], ['#60cdff', '#0063b1'], ['#7eb1ff', '#4a5bd9'], ['#c4a4ff', '#8764b8'], ['#ff99c8', '#c30052'], ['#ff9a6b', '#ca5010'], ['#ffd35c', '#c19c00'], ['#6ccb5f', '#107c10']];

// ================= Настройки: применяются ко всей системе =================
const DEFAULTS = { theme: 'dark', accent: 0, wallpaper: 'bloom', transparency: true, animations: true, brightness: 100, night: false, volume: 60, muted: false,
  wifi: true, bt: true, airplane: false, saver: false, focus: false, time24: true, seconds: false, dateLong: false, icons: 'medium', sortIcons: 'name' };
const S = Object.assign({}, DEFAULTS, store.get('settings', {}));
let wallObjUrl = null;
function wallpaperCss(dark) {
  if (S.wallpaper && S.wallpaper.startsWith('fs:')) { const f = FS.get(S.wallpaper.slice(3)); const u = f && fileUrl(f); if (u) return 'url("' + u + '")'; }
  return (WALLS[S.wallpaper] || WALLS.bloom).css(dark);
}
function applySettings() {
  const dark = S.theme === 'dark';
  document.body.dataset.theme = S.theme;
  const [light, strong] = ACCENTS[S.accent] || ACCENTS[0];
  const root = document.documentElement.style;
  root.setProperty('--accent', dark ? light : strong);
  root.setProperty('--accent-strong', strong);
  root.setProperty('--on-accent', dark ? '#000' : '#fff');
  const w = wallpaperCss(dark);
  $('wallpaper').style.backgroundImage = w.startsWith('url(') ? w : 'none';
  $('wallpaper').style.background = w.startsWith('url(') ? '' : w;
  if (w.startsWith('url(')) { $('wallpaper').style.backgroundImage = w; $('wallpaper').style.backgroundSize = 'cover'; $('wallpaper').style.backgroundPosition = 'center'; }
  $('lock').style.backgroundImage = w.startsWith('url(') ? w : 'none';
  if (!w.startsWith('url(')) $('lock').style.background = w;
  document.body.classList.toggle('no-anim', !S.animations);
  document.body.classList.toggle('no-transparency', !S.transparency);
  document.body.dataset.icons = S.icons;
  $('dim').style.opacity = String((100 - S.brightness) / 100 * 0.7);
  $('night').style.display = S.night ? 'block' : 'none';
  updateClock();
  emit('settings');
}
function setS(patch) {
  Object.assign(S, patch);
  if (patch.airplane) { S.wifi = false; S.bt = false; }
  if (patch.wifi || patch.bt) S.airplane = false;
  store.set('settings', S);
  applySettings();
}

// ================= Время =================
function fmtTime(d, withSec) {
  const s = withSec ? ':' + pad(d.getSeconds()) : '';
  if (S.time24) return pad(d.getHours()) + ':' + pad(d.getMinutes()) + s;
  const h = d.getHours() % 12 || 12;
  return h + ':' + pad(d.getMinutes()) + s + ' ' + (d.getHours() < 12 ? 'AM' : 'PM');
}
function fmtDate(d) { return S.dateLong ? d.getDate() + ' ' + MONTHS_GEN[d.getMonth()] + ' ' + d.getFullYear() : pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear(); }
function fmtStamp(t) { const d = new Date(t); return fmtDate(d) + ' ' + fmtTime(d); }
function updateClock() {
  const n = new Date();
  $('tb-time').textContent = fmtTime(n, S.seconds);
  $('tb-date').textContent = fmtDate(n);
  $('lk-time').textContent = fmtTime(n).replace(/ (AM|PM)$/, '');
  $('lk-date').textContent = n.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
}
setInterval(() => { updateClock(); emit('tick'); }, 1000);

// ================= Файловая система в IndexedDB =================
// Путь - строка «Документы/Проекты/план.txt»; корень «» - «Этот компьютер».
// Запись: { path, type: 'dir'|'file', mtime, size, mime, text?, blob? }. Всё держится в памяти, изменения пишутся в базу.
const ROOTS = ['Рабочий стол', 'Документы', 'Загрузки', 'Изображения', 'Музыка'];
const FS = new Map();
let TRASH = [];
let db = null, dbOk = true;
const parentOf = p => p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '';
const baseName = p => p.slice(p.lastIndexOf('/') + 1);
const extOf = p => { const b = baseName(p), i = b.lastIndexOf('.'); return i > 0 ? b.slice(i + 1).toLowerCase() : ''; };
const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'];
const TEXT_EXT = ['txt', 'md', 'log', 'csv', 'json', 'js', 'py', 'html', 'css', 'bat', 'ini'];
const isImage = p => IMAGE_EXT.includes(extOf(p));
const isText = p => TEXT_EXT.includes(extOf(p)) || !extOf(p);
let dbPending = 0; // незавершённые записи: проверки ждут нуля перед перезагрузкой
function idb(mode, fn) {
  return new Promise((res, rej) => {
    if (!db) { res(null); return; }
    const tx = db.transaction(['fs', 'trash'], mode);
    dbPending++;
    let done = false;
    const fin = () => { if (!done) { done = true; dbPending--; } };
    const r = fn(tx);
    tx.oncomplete = () => { fin(); res(r && r.result); };
    tx.onerror = tx.onabort = () => { fin(); rej(tx.error); };
  });
}
function dbPut(entry) { if (db) idb('readwrite', tx => tx.objectStore('fs').put(entry)).catch(e => console.warn('FS', e)); }
function dbDel(path) { if (db) idb('readwrite', tx => tx.objectStore('fs').delete(path)).catch(e => console.warn('FS', e)); }
function dbTrash() { if (db) idb('readwrite', tx => { const s = tx.objectStore('trash'); s.clear(); TRASH.forEach(t => s.put(t)); }).catch(e => console.warn('FS', e)); }
function openDB() {
  return new Promise(res => {
    let req;
    try { req = indexedDB.open('win11_3', 1); } catch (e) { dbOk = false; res(null); return; }
    req.onupgradeneeded = () => { const d = req.result; d.createObjectStore('fs', { keyPath: 'path' }); d.createObjectStore('trash', { keyPath: 'id' }); };
    req.onsuccess = () => res(req.result);
    req.onerror = () => { dbOk = false; res(null); };
  });
}
async function fsLoad() {
  db = await openDB();
  let rows = [], trash = [];
  if (db) {
    rows = await new Promise(res => { const r = db.transaction('fs').objectStore('fs').getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => res([]); });
    trash = await new Promise(res => { const r = db.transaction('trash').objectStore('trash').getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => res([]); });
  }
  if (!rows.length) rows = defaultFiles();
  rows.forEach(e => FS.set(e.path, e));
  ROOTS.forEach(r => { if (!FS.has(r)) FS.set(r, { path: r, type: 'dir', mtime: Date.now() }); });
  if (db && !store.get('seeded', false)) { rows.forEach(dbPut); store.set('seeded', true); }
  TRASH = trash.sort((a, b) => a.deleted - b.deleted);
}
function defaultFiles() {
  const t = Date.now(), f = (path, text) => ({ path, type: 'file', mtime: t, mime: 'text/plain', size: new Blob([text]).size, text });
  const img = (path, svg) => ({ path, type: 'file', mtime: t, mime: 'image/svg+xml', size: svg.length, text: svg });
  return [
    ...ROOTS.map(r => ({ path: r, type: 'dir', mtime: t })),
    { path: 'Документы/Проекты', type: 'dir', mtime: t }, { path: 'Документы/Учёба', type: 'dir', mtime: t },
    f('Рабочий стол/Заметки.txt', 'Добро пожаловать!\n\nЭто Windows-подобная оболочка в одной странице.\n- окна тащатся за заголовок; к краю экрана - прикрепляются;\n- наведите на «Развернуть» - появятся макеты прикрепления;\n- правый щелчок по столу и по файлам - меню;\n- файлы лежат в памяти браузера (IndexedDB) и переживают перезагрузку.\n'),
    f('Документы/Отчёт.txt', 'Отчёт\n\n1. Введение\n2. Что сделано\n3. Что осталось\n'),
    f('Документы/Проекты/план.txt', '1. Доделать проект\n2. Проверить\n3. Выложить\n'),
    f('Загрузки/readme.txt', 'Файлы с диска можно перетащить в окно Проводника или добавить кнопкой «Импорт».\n'),
    img('Изображения/Цветение.svg', bloomSVG(true, 218)), img('Изображения/Фиалка.svg', bloomSVG(true, 268)),
    img('Изображения/Свечение.svg', glowSVG(true)), img('Изображения/Волны.svg', wavesSVG(false)),
  ];
}
const urlCache = new Map();
function fileUrl(f) {
  if (!f || f.type !== 'file') return null;
  if (urlCache.has(f.path) && urlCache.get(f.path).mtime === f.mtime) return urlCache.get(f.path).url;
  let url;
  if (f.blob) url = URL.createObjectURL(f.blob);
  else if (f.mime === 'image/svg+xml' && f.text) url = URL.createObjectURL(new Blob([f.text], { type: 'image/svg+xml' }));
  else return null;
  urlCache.set(f.path, { url, mtime: f.mtime });
  return url;
}
function childrenOf(dir, sortBy = 'name') {
  const list = [...FS.keys()].filter(p => p && parentOf(p) === dir).map(p => FS.get(p));
  const cmp = sortBy === 'date' ? (a, b) => b.mtime - a.mtime : sortBy === 'type' ? (a, b) => extOf(a.path).localeCompare(extOf(b.path)) || baseName(a.path).localeCompare(baseName(b.path), 'ru') : (a, b) => baseName(a.path).localeCompare(baseName(b.path), 'ru', { numeric: true });
  return list.sort((a, b) => (a.type === b.type ? cmp(a, b) : a.type === 'dir' ? -1 : 1));
}
function uniquePath(dir, base, ext = '') {
  const pre = dir ? dir + '/' : '';
  let name = base + ext, i = 2;
  while (FS.has(pre + name)) name = base + ' (' + (i++) + ')' + ext;
  return pre + name;
}
function nameError(dir, name, self) {
  if (!name || !name.trim()) return 'Введите имя';
  if (/[\/\\:*?"<>|]/.test(name)) return 'Имя файла не должно содержать \\ / : * ? " < > |';
  const p = (dir ? dir + '/' : '') + name;
  if (FS.has(p) && p !== self) return 'Здесь уже есть объект с таким именем';
  return '';
}
function fsChanged(path) { emit('fs', path); }
function writeFile(path, text) {
  const old = FS.get(path);
  const e = { path, type: 'file', mtime: Date.now(), mime: (old && old.mime) || (isText(path) ? 'text/plain' : 'application/octet-stream'), size: new Blob([text]).size, text };
  FS.set(path, e); dbPut(e); touchRecent(path); fsChanged(path);
  return e;
}
function makeDir(path) { const e = { path, type: 'dir', mtime: Date.now() }; FS.set(path, e); dbPut(e); fsChanged(path); return e; }
async function importFile(dir, file) {
  const path = uniquePath(dir, file.name.replace(/\.[^.]+$/, '') || file.name, file.name.match(/\.[^.]+$/) ? file.name.match(/\.[^.]+$/)[0] : '');
  const e = { path, type: 'file', mtime: Date.now(), mime: file.type || 'application/octet-stream', size: file.size };
  if ((file.type.startsWith('text/') || isText(path)) && file.size < 2e6) e.text = await file.text();
  else e.blob = file;
  if (file.type === 'image/svg+xml') { e.text = await file.text(); delete e.blob; }
  FS.set(path, e); dbPut(e); fsChanged(path);
  return path;
}
function subtree(path) { return [...FS.keys()].filter(p => p === path || p.startsWith(path + '/')); }
function movePath(from, toDir) {
  if (!FS.has(from) || ROOTS.includes(from) || parentOf(from) === toDir || toDir === from || toDir.startsWith(from + '/')) return null;
  const b = baseName(from), dot = b.lastIndexOf('.');
  const target = uniquePath(toDir, dot > 0 && FS.get(from).type === 'file' ? b.slice(0, dot) : b, dot > 0 && FS.get(from).type === 'file' ? b.slice(dot) : '');
  subtree(from).forEach(p => { const e = FS.get(p); FS.delete(p); dbDel(p); const np = target + p.slice(from.length); const ne = Object.assign({}, e, { path: np }); FS.set(np, ne); dbPut(ne); });
  S.wallpaper === 'fs:' + from && setS({ wallpaper: 'fs:' + target });
  fsChanged(target);
  return target;
}
function copyPath(from, toDir) {
  if (!FS.has(from)) return null;
  const b = baseName(from), dot = b.lastIndexOf('.'), isF = FS.get(from).type === 'file';
  const target = uniquePath(toDir, isF && dot > 0 ? b.slice(0, dot) : b, isF && dot > 0 ? b.slice(dot) : '');
  subtree(from).forEach(p => { const ne = Object.assign({}, FS.get(p), { path: target + p.slice(from.length), mtime: Date.now() }); FS.set(ne.path, ne); dbPut(ne); });
  fsChanged(target);
  return target;
}
function renamePath(from, newName) {
  const target = (parentOf(from) ? parentOf(from) + '/' : '') + newName;
  if (target === from) return from;
  subtree(from).forEach(p => { const e = FS.get(p); FS.delete(p); dbDel(p); const ne = Object.assign({}, e, { path: target + p.slice(from.length) }); FS.set(ne.path, ne); dbPut(ne); });
  fsChanged(target);
  return target;
}
// Удаление - в корзину: папка уходит целиком и возвращается на прежнее место.
function trashPath(path) {
  if (!FS.has(path) || ROOTS.includes(path)) return;
  const items = subtree(path).map(p => FS.get(p));
  items.forEach(e => { FS.delete(e.path); dbDel(e.path); });
  TRASH.push({ id: 't' + Date.now() + Math.random().toString(36).slice(2, 6), path, items, deleted: Date.now() });
  dbTrash(); RECENT = RECENT.filter(r => FS.has(r)); store.set('recent', RECENT);
  fsChanged(path);
}
function restoreTrash(id) {
  const i = TRASH.findIndex(t => t.id === id); if (i < 0) return;
  const t = TRASH[i];
  let dir = parentOf(t.path);
  const missing = []; let d = dir; while (d && !FS.has(d)) { missing.unshift(d); d = parentOf(d); }
  missing.forEach(makeDir);
  let target = t.path;
  if (FS.has(target)) { const b = baseName(target), dot = b.lastIndexOf('.'); target = uniquePath(dir, dot > 0 ? b.slice(0, dot) : b, dot > 0 ? b.slice(dot) : ''); }
  t.items.forEach(e => { const ne = Object.assign({}, e, { path: target + e.path.slice(t.path.length) }); FS.set(ne.path, ne); dbPut(ne); });
  TRASH.splice(i, 1); dbTrash(); fsChanged(target);
}
function deleteTrash(id) { TRASH = TRASH.filter(t => t.id !== id); dbTrash(); fsChanged(''); }
function emptyTrash() { TRASH = []; dbTrash(); fsChanged(''); }
let RECENT = store.get('recent', []);
function touchRecent(p) { RECENT = [p].concat(RECENT.filter(x => x !== p)).slice(0, 8); store.set('recent', RECENT); emit('recent'); }
function fileIcon(path) {
  const e = FS.get(path);
  if (!e) return ICON.textfile;
  if (e.type === 'dir') return ({ 'Документы': ICON.documents, 'Загрузки': ICON.downloads, 'Изображения': ICON.pictures, 'Музыка': ICON.music, 'Рабочий стол': ICON.desktopf })[path] || ICON.folder;
  if (isImage(path)) { const u = fileUrl(e); return u ? '<img src="' + u + '" alt="">' : ICON.imagefile; }
  return ICON.textfile;
}
const fmtSize = b => b == null ? '' : b < 1024 ? b + ' Б' : b < 1048576 ? Math.ceil(b / 1024) + ' КБ' : (b / 1048576).toFixed(1).replace('.', ',') + ' МБ';
const typeName = e => e.type === 'dir' ? 'Папка с файлами' : isImage(e.path) ? 'Изображение ' + extOf(e.path).toUpperCase() : extOf(e.path) === 'txt' ? 'Текстовый документ' : (extOf(e.path).toUpperCase() || 'Файл') + ' файл';
// Открыть файл подходящей программой
function openPath(path) {
  const e = FS.get(path); if (!e) return;
  if (e.type === 'dir') { openApp('explorer', path); return; }
  touchRecent(path);
  if (isImage(path)) openApp('photos', path);
  else if (isText(path) || e.text != null) openApp('notepad', path);
  else notify({ app: 'explorer', title: 'Не удалось открыть', body: '«' + baseName(path) + '»: для этого типа файлов нет программы' });
}

// ================= Уведомления =================
let NOTES = [];
function notify({ app, title, body }) {
  const n = { id: Date.now() + Math.random(), app, title, body, t: Date.now() };
  NOTES.unshift(n); NOTES = NOTES.slice(0, 30);
  renderNotifs();
  if (S.focus) return n;       // «Фокусировка»: без всплывающих окон, только в центре уведомлений
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.innerHTML = '<div class="n-app">' + (ICON[app] || ICON.start) + '<span>' + esc(APPS[app] ? APPS[app].title : 'Система') + '</span></div><b></b><p></p><button class="n-x" title="Закрыть">' + SI.x + '</button>';
  el.querySelector('b').textContent = title; el.querySelector('p').textContent = body;
  const kill = () => { if (!el.isConnected) return; el.classList.add('out'); setTimeout(() => el.remove(), 250); };
  el.querySelector('.n-x').onclick = e => { e.stopPropagation(); kill(); };
  el.onclick = () => { kill(); if (APPS[app]) openApp(app); };
  $('toasts').appendChild(el);
  setTimeout(kill, 6000);
  return n;
}
function renderNotifs() {
  const b = $('tb-bell').querySelector('.badge');
  b.textContent = NOTES.length; b.hidden = !NOTES.length;
  $('nc-list').innerHTML = NOTES.length ? NOTES.map(n => '<div class="nc-item" data-n="' + n.id + '"><div class="n-app">' + (ICON[n.app] || ICON.start) + '<span>' + esc(APPS[n.app] ? APPS[n.app].title : 'Система') + ' · ' + fmtTime(new Date(n.t)) + '</span></div><b>' + esc(n.title) + '</b><p>' + esc(n.body) + '</p><button class="n-x" data-nx="' + n.id + '" title="Закрыть">' + SI.x + '</button></div>').join('')
    : '<div class="empty" style="padding:24px 8px">Нет новых уведомлений</div>';
  $('nc-focus').textContent = S.focus ? 'Фокусировка: вкл' : 'Фокусировка: выкл';
}

// ================= Диспетчер окон =================
const layer = () => $('windows');
const area = () => ({ w: layer().clientWidth, h: layer().clientHeight });
const wins = [];
let activeWin = null, winSeq = 0;
function openApp(id, arg) {
  const app = APPS[id]; if (!app) return null;
  closePanels();
  if (!app.multi) { const ex = wins.find(w => w.app === id); if (ex) { if (arg !== undefined && ex.onArg) ex.onArg(arg); focusWin(ex); return ex; } }
  if (app.multi && arg !== undefined) { const ex = wins.find(w => w.app === id && w.arg === arg); if (ex) { focusWin(ex); return ex; } }
  const a = area(), saved = store.get('geo.' + id, null);
  const width = Math.min(saved ? saved.w : app.w, a.w), height = Math.min(saved ? saved.h : app.h, a.h);
  const n = wins.length % 6;
  const w = { id: 'w' + (++winSeq), app: id, arg, maxed: false, snapped: null, prev: null, cleanup: [] };
  const el = document.createElement('div');
  el.className = 'window' + (S.animations ? ' opening' : '');
  el.id = w.id; el.dataset.app = id; el.tabIndex = -1;
  Object.assign(el.style, { width: width + 'px', height: height + 'px',
    left: (saved ? saved.x + n * 12 : (a.w - width) / 2 + (n - 2) * 26) + 'px', top: (saved ? saved.y + n * 12 : (a.h - height) / 2 + (n - 2) * 22) + 'px' });
  el.innerHTML = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map(d => '<div class="rz rz-' + d + '" data-rz="' + d + '"></div>').join('') +
    '<div class="titlebar"><span class="t-ic">' + app.icon + '</span><span class="t-text"></span><div class="caption">' +
    '<button data-cap="min" title="Свернуть" aria-label="Свернуть">' + SI.min + '</button><button data-cap="max" title="Развернуть" aria-label="Развернуть">' + SI.max + '</button><button class="close" data-cap="close" title="Закрыть" aria-label="Закрыть">' + SI.close + '</button></div></div><div class="wbody"></div>';
  w.el = el; w.body = el.querySelector('.wbody');
  w.setTitle = t => { el.querySelector('.t-text').textContent = t; w.title = t; updateTaskbar(); };
  w.setTitle(app.title);
  layer().appendChild(el);
  wins.push(w);
  setTimeout(() => el.classList.remove('opening'), 250);
  el.querySelector('[data-cap=min]').onclick = () => minimizeWin(w);
  el.querySelector('[data-cap=max]').onclick = () => toggleMax(w);
  el.querySelector('[data-cap=close]').onclick = () => closeWin(w);
  bindSnapFlyout(w, el.querySelector('[data-cap=max]'));
  el.addEventListener('pointerdown', () => focusWin(w), true);
  const tb = el.querySelector('.titlebar');
  tb.addEventListener('dblclick', e => { if (!e.target.closest('.caption')) toggleMax(w); });
  enableDrag(w, tb);
  el.querySelectorAll('.rz').forEach(h => enableResize(w, h));
  if (app.iframe) mountIframe(w, app.iframe); else app.create(w, arg);
  clampWin(w);
  if (saved && saved.max) toggleMax(w, true);
  focusWin(w);
  return w;
}
function mountIframe(w, src) {
  const f = document.createElement('iframe');
  f.src = src; f.title = APPS[w.app].title;
  f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-downloads allow-forms allow-pointer-lock allow-modals');
  f.style.cssText = 'flex:1;border:none;width:100%;background:#1e1e1e';
  w.body.appendChild(f);
  w.iframe = f;
}
function restack() {
  const top = [...wins].reverse().find(w => !w.min) || null;
  wins.forEach((w, i) => { w.el.style.zIndex = i + 1; w.el.classList.toggle('inactive', w !== top); });
  activeWin = top;
  updateTaskbar();
}
function focusWin(w) {
  const i = wins.indexOf(w); if (i < 0) return;
  wins.splice(i, 1); wins.push(w);
  if (w.min) restoreWin(w);
  restack();
  if (w.iframe && document.activeElement !== w.iframe) { try { w.iframe.focus(); } catch (e) { /* грузится */ } }
  else if (!w.iframe && !w.el.contains(document.activeElement)) w.el.focus({ preventScroll: true });
}
function taskbarRectOf(app) { const b = document.querySelector('.tb-btn[data-app="' + app + '"]'); return b ? b.getBoundingClientRect() : null; }
function animateTo(w, toTaskbar) {
  if (!S.animations || !w.el.animate) return Promise.resolve();
  const r = w.el.getBoundingClientRect(), t = taskbarRectOf(w.app);
  const dx = t ? t.left + t.width / 2 - (r.left + r.width / 2) : 0, dy = t ? t.top - (r.top + r.height / 2) : 200;
  const frames = [{ transform: 'none', opacity: 1 }, { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(0.2)', opacity: 0 }];
  return w.el.animate(toTaskbar ? frames : frames.reverse(), { duration: 220, easing: 'cubic-bezier(0.1,0.9,0.2,1)' }).finished.catch(() => { });
}
// Окно-рамка (игра, Paint) свёрнуто или закрывается: внутри страницы - как будто вкладку скрыли
function framePause(w, paused) {
  if (!w.iframe) return;
  try {
    const d = w.iframe.contentDocument, cw = w.iframe.contentWindow;
    Object.defineProperty(d, 'hidden', { value: paused, configurable: true });
    Object.defineProperty(d, 'visibilityState', { value: paused ? 'hidden' : 'visible', configurable: true });
    d.dispatchEvent(new Event('visibilitychange'));
    cw.dispatchEvent(new Event(paused ? 'blur' : 'focus'));
    if (paused) d.querySelectorAll('audio, video').forEach(m => m.pause());
  } catch (e) { /* страница из другого источника: остаётся обычная потеря фокуса */ }
  if (paused && document.activeElement === w.iframe) w.iframe.blur();
}
function minimizeWin(w) { if (w.min) return; w.min = true; framePause(w, true); animateTo(w, true).then(() => { if (w.min) w.el.classList.add('minimized'); }); restack(); }
function restoreWin(w) { w.min = false; w.el.classList.remove('minimized'); framePause(w, false); animateTo(w, false); }
async function closeWin(w) {
  if (w.beforeClose && !(await w.beforeClose())) return;
  const i = wins.indexOf(w); if (i < 0) return;
  rememberGeo(w);
  framePause(w, true);
  wins.splice(i, 1);
  w.cleanup.forEach(f => { try { f(); } catch (e) { /* ничего */ } });
  const el = w.el;
  if (S.animations) { el.classList.add('closing'); setTimeout(() => el.remove(), 150); } else el.remove();
  restack();
}
function rememberGeo(w) {
  const r = (w.maxed || w.snapped) && w.prev ? w.prev : { left: w.el.style.left, top: w.el.style.top, width: w.el.style.width, height: w.el.style.height };
  store.set('geo.' + w.app, { x: parseFloat(r.left), y: parseFloat(r.top), w: parseFloat(r.width), h: parseFloat(r.height), max: w.maxed });
}
function setRect(w, r) { Object.assign(w.el.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' }); }
function saveNormal(w) { if (!w.maxed && !w.snapped) w.prev = { left: w.el.style.left, top: w.el.style.top, width: w.el.style.width, height: w.el.style.height }; }
function toggleMax(w, force) {
  const b = w.el.querySelector('[data-cap=max]');
  if (w.maxed && !force) { Object.assign(w.el.style, w.prev); w.maxed = false; }
  else { saveNormal(w); w.snapped = null; w.el.classList.remove('snapped'); Object.assign(w.el.style, { left: '0px', top: '0px', width: '100%', height: '100%' }); w.maxed = true; }
  w.el.classList.toggle('maxed', w.maxed);
  b.innerHTML = w.maxed ? SI.restore : SI.max;
  b.title = w.maxed ? 'Свернуть в окно' : 'Развернуть';
  if (!w.maxed) clampWin(w);
  rememberGeo(w);
  focusWin(w);
}
// Прикрепление: к половинам, четвертям и макетам; окно помнит обычный размер
function zoneRect(z) {
  const a = area();
  const R = { left: [0, 0, 0.5, 1], right: [0.5, 0, 0.5, 1], tl: [0, 0, 0.5, 0.5], tr: [0.5, 0, 0.5, 0.5], bl: [0, 0.5, 0.5, 0.5], br: [0.5, 0.5, 0.5, 0.5],
    l66: [0, 0, 2 / 3, 1], r34: [2 / 3, 0, 1 / 3, 1], c1: [0, 0, 1 / 3, 1], c2: [1 / 3, 0, 1 / 3, 1], c3: [2 / 3, 0, 1 / 3, 1] }[z];
  return { x: Math.round(R[0] * a.w), y: Math.round(R[1] * a.h), w: Math.round(R[2] * a.w), h: Math.round(R[3] * a.h) };
}
function snapWin(w, z) {
  if (z === 'max') { if (!w.maxed) toggleMax(w); return; }
  if (w.maxed) { w.maxed = false; w.el.classList.remove('maxed'); w.el.querySelector('[data-cap=max]').innerHTML = SI.max; }
  saveNormal(w);
  w.snapped = z; w.el.classList.add('snapped');
  setRect(w, zoneRect(z));
  focusWin(w);
}
function unsnap(w) { if (!w.snapped) return; w.snapped = null; w.el.classList.remove('snapped'); if (w.prev) { w.el.style.width = w.prev.width; w.el.style.height = w.prev.height; } }
function clampWin(w) {
  if (w.maxed || w.snapped) return;
  const a = area(), el = w.el, app = APPS[w.app];
  const width = Math.max(Math.min(app.minW || 320, a.w), Math.min(el.offsetWidth, a.w));
  const height = Math.max(Math.min(app.minH || 200, a.h), Math.min(el.offsetHeight, a.h));
  el.style.width = width + 'px'; el.style.height = height + 'px';
  el.style.left = Math.max(0, Math.min(parseFloat(el.style.left) || 0, a.w - width)) + 'px';
  el.style.top = Math.max(0, Math.min(parseFloat(el.style.top) || 0, a.h - height)) + 'px';
}
addEventListener('resize', () => wins.forEach(w => { if (w.snapped) setRect(w, zoneRect(w.snapped)); clampWin(w); }));
function edgeZone(x, y) {
  const a = area();
  if (y <= 2) return x < 90 ? 'tl' : x > a.w - 90 ? 'tr' : 'max';
  if (x <= 2) return y < 110 ? 'tl' : y > a.h - 110 ? 'bl' : 'left';
  if (x >= a.w - 3) return y < 110 ? 'tr' : y > a.h - 110 ? 'br' : 'right';
  return null;
}
function showPreview(z) {
  const p = $('snap-preview');
  if (!z) { p.classList.remove('on'); return; }
  const r = z === 'max' ? { x: 0, y: 0, ...area() } : zoneRect(z);
  const a = area(); if (z === 'max') { r.w = a.w; r.h = a.h; }
  Object.assign(p.style, { left: r.x + 6 + 'px', top: r.y + 6 + 'px', width: r.w - 12 + 'px', height: r.h - 12 + 'px' });
  p.classList.add('on');
}
function enableDrag(w, tb) {
  tb.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest('.caption')) return;
    const el = w.el, sx = e.clientX, sy = e.clientY;
    let dx = sx - el.offsetLeft, dy = sy - el.offsetTop, started = false, zone = null;
    tb.setPointerCapture(e.pointerId);
    const move = ev => {
      if (!started) {
        if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) < 5) return;
        started = true; document.body.classList.add('dragging'); hideSnapFlyout();
        if (w.maxed || w.snapped) { // как в системе: окно отрывается от края и возвращает прежний размер под курсором
          const ratio = (sx - el.offsetLeft) / el.offsetWidth;
          if (w.maxed) { w.maxed = false; el.classList.remove('maxed'); el.querySelector('[data-cap=max]').innerHTML = SI.max; el.style.width = w.prev.width; el.style.height = w.prev.height; }
          else unsnap(w);
          el.style.left = (sx - el.offsetWidth * ratio) + 'px'; el.style.top = Math.max(0, sy - 16) + 'px';
          dx = sx - el.offsetLeft; dy = sy - el.offsetTop;
        }
      }
      el.style.left = (ev.clientX - dx) + 'px'; el.style.top = (ev.clientY - dy) + 'px';
      clampWin(w);
      zone = edgeZone(ev.clientX, ev.clientY);
      showPreview(zone);
    };
    const up = () => {
      tb.removeEventListener('pointermove', move); tb.removeEventListener('pointerup', up); tb.removeEventListener('pointercancel', up);
      document.body.classList.remove('dragging'); showPreview(null);
      if (started && zone) snapWin(w, zone);
      if (started) rememberGeo(w);
    };
    tb.addEventListener('pointermove', move); tb.addEventListener('pointerup', up); tb.addEventListener('pointercancel', up);
  });
}
function enableResize(w, h) {
  h.addEventListener('pointerdown', e => {
    if (e.button !== 0 || w.maxed) return;
    e.stopPropagation(); unsnap(w);
    const el = w.el, dir = h.dataset.rz, a = area(), app = APPS[w.app];
    const st = { x: e.clientX, y: e.clientY, l: el.offsetLeft, t: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
    const minW = app.minW || 320, minH = app.minH || 200;
    h.setPointerCapture(e.pointerId); document.body.classList.add('dragging');
    const move = ev => {
      const dx = ev.clientX - st.x, dy = ev.clientY - st.y;
      let { l, t, w: ww, h: hh } = st;
      if (dir.includes('e')) ww = Math.min(a.w - l, Math.max(minW, st.w + dx));
      if (dir.includes('s')) hh = Math.min(a.h - t, Math.max(minH, st.h + dy));
      if (dir.includes('w')) { const nl = Math.max(0, Math.min(st.l + st.w - minW, st.l + dx)); ww = st.w + st.l - nl; l = nl; }
      if (dir.includes('n')) { const nt = Math.max(0, Math.min(st.t + st.h - minH, st.t + dy)); hh = st.h + st.t - nt; t = nt; }
      setRect(w, { x: l, y: t, w: ww, h: hh });
    };
    const up = () => { h.removeEventListener('pointermove', move); h.removeEventListener('pointerup', up); document.body.classList.remove('dragging'); clampWin(w); rememberGeo(w); };
    h.addEventListener('pointermove', move); h.addEventListener('pointerup', up);
  });
}
// Макеты прикрепления: всплывают при наведении на «Развернуть»
let snapTimer = null, snapTarget = null;
function bindSnapFlyout(w, btn) {
  btn.addEventListener('mouseenter', () => { clearTimeout(snapTimer); snapTimer = setTimeout(() => showSnapFlyout(w, btn), 450); });
  btn.addEventListener('mouseleave', () => { clearTimeout(snapTimer); snapTimer = setTimeout(() => { if (!$('snap-flyout').matches(':hover')) hideSnapFlyout(); }, 300); });
}
function showSnapFlyout(w, btn) {
  const f = $('snap-flyout'); snapTarget = w;
  const r = btn.getBoundingClientRect();
  f.classList.add('open');
  f.style.left = Math.max(4, Math.min(r.right - f.offsetWidth, innerWidth - f.offsetWidth - 4)) + 'px';
  f.style.top = r.bottom + 4 + 'px';
}
function hideSnapFlyout() { $('snap-flyout').classList.remove('open'); }
$('snap-flyout').addEventListener('mouseleave', () => { snapTimer = setTimeout(hideSnapFlyout, 250); });
$('snap-flyout').addEventListener('mouseenter', () => clearTimeout(snapTimer));
$('snap-flyout').addEventListener('click', e => { const z = e.target.closest('[data-zone]'); if (z && snapTarget) { snapWin(snapTarget, z.dataset.zone); hideSnapFlyout(); } });

// Щелчок внутрь окна-рамки (Paint, игры) уводит фокус - поднимаем это окно
addEventListener('blur', () => setTimeout(() => {
  const f = document.activeElement;
  if (f && f.tagName === 'IFRAME') { closePanels(); const w = wins.find(x => x.el.contains(f)); if (w && w !== activeWin) focusWin(w); }
}, 0));

// Диалог внутри окна вместо alert/confirm (их нет во вкладках Electron)
function winDialog(w, { title, text, buttons, input }) {
  return new Promise(resolve => {
    const back = document.createElement('div');
    back.className = 'win-dialog-back';
    back.innerHTML = '<div class="win-dialog" role="alertdialog"><div class="wd-body"><h3></h3><p></p>' + (input !== undefined ? '<input class="field" style="width:100%;margin-top:12px">' : '') + '</div><div class="wd-foot">' +
      buttons.map((b, i) => '<button class="btn' + (i === 0 ? ' accent' : '') + '" data-i="' + i + '">' + esc(b) + '</button>').join('') + '</div></div>';
    back.querySelector('h3').textContent = title; back.querySelector('p').textContent = text || '';
    w.el.appendChild(back);
    const inp = back.querySelector('input');
    if (inp) { inp.value = input; inp.focus(); inp.select(); } else back.querySelector('.btn').focus();
    const done = i => { back.remove(); resolve(inp ? (i === 0 ? inp.value : null) : i); };
    back.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) done(+b.dataset.i); });
    back.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') done(buttons.length - 1); if (e.key === 'Enter' && inp) done(0); });
  });
}

// ================= Панель задач =================
const PINNED = ['explorer', 'browser', 'notepad', 'media', 'terminal'];
function updateTaskbar() {
  const running = [...new Set(wins.map(w => w.app))];
  const ids = PINNED.concat(running.filter(a => !PINNED.includes(a)));
  const box = $('tb-apps');
  box.querySelectorAll('.tb-btn[data-app]').forEach(b => { if (!ids.includes(b.dataset.app)) b.remove(); });
  ids.forEach((id, i) => {
    let b = box.querySelector('.tb-btn[data-app="' + id + '"]');
    if (!b) { b = document.createElement('button'); b.className = 'tb-btn'; b.dataset.app = id; b.dataset.tip = APPS[id].title; b.setAttribute('aria-label', APPS[id].title); b.innerHTML = APPS[id].icon; }
    if (box.children[i] !== b) box.insertBefore(b, box.children[i] || null);
    b.classList.toggle('running', running.includes(id));
    b.classList.toggle('active', !!activeWin && activeWin.app === id);
  });
}
$('tb-apps').addEventListener('click', e => {
  const b = e.target.closest('.tb-btn[data-app]'); if (!b) return;
  closePanels();
  const id = b.dataset.app, list = wins.filter(w => w.app === id);
  if (!list.length) { openApp(id); return; }
  if (activeWin && activeWin.app === id) { minimizeWin(activeWin); return; }
  focusWin(list[list.length - 1]);
});
$('tb-apps').addEventListener('contextmenu', e => {
  const b = e.target.closest('.tb-btn[data-app]'); if (!b) return;
  e.preventDefault();
  const id = b.dataset.app, list = wins.filter(w => w.app === id), r = b.getBoundingClientRect();
  showMenu(r.left, r.top - 8, [
    { label: APPS[id].title, icon: APPS[id].icon, action: () => APPS[id].multi || !list.length ? openApp(id) : focusWin(list[list.length - 1]) },
    ...(list.length ? [{ sep: true }, { label: list.length > 1 ? 'Закрыть все окна' : 'Закрыть окно', icon: SI.x, action: () => list.forEach(closeWin) }] : []),
  ], true);
});
// Подсказки над значками панели задач
let tipEl = null;
document.addEventListener('mouseover', e => {
  const b = e.target.closest('[data-tip]');
  if (!b) { if (tipEl) { tipEl.remove(); tipEl = null; } return; }
  if (tipEl && tipEl.dataset.for === b.dataset.tip) return;
  if (tipEl) tipEl.remove();
  tipEl = document.createElement('div'); tipEl.className = 'tb-tip'; tipEl.textContent = b.dataset.tip; tipEl.dataset.for = b.dataset.tip;
  document.body.appendChild(tipEl);
  const r = b.getBoundingClientRect();
  tipEl.style.left = Math.max(4, Math.min(r.left + r.width / 2 - tipEl.offsetWidth / 2, innerWidth - tipEl.offsetWidth - 4)) + 'px';
  tipEl.style.top = r.top - tipEl.offsetHeight - 10 + 'px';
});
document.addEventListener('pointerdown', () => { if (tipEl) { tipEl.remove(); tipEl = null; } }, true);

// ================= Меню (контекстное и выпадающие) =================
function showMenu(x, y, items, above) {
  hideMenu();
  const m = document.createElement('div');
  m.className = 'menu ctx'; m.id = 'ctx'; m.setAttribute('role', 'menu');
  const render = (box, list) => {
    list.forEach(it => {
      if (it.sep) { box.insertAdjacentHTML('beforeend', '<div class="msep"></div>'); return; }
      if (it.icons) { box.insertAdjacentHTML('beforeend', '<div class="ctx-icons">' + it.icons.map((c, i) => '<button data-ii="' + i + '" title="' + esc(c.label) + '" aria-label="' + esc(c.label) + '"' + (c.disabled ? ' disabled style="opacity:.35"' : '') + '>' + c.icon + '</button>').join('') + '</div>');
        box.lastElementChild.addEventListener('click', e => { const b = e.target.closest('[data-ii]'); if (b && !b.disabled) { hideMenu(); it.icons[+b.dataset.ii].action(); } }); return; }
      const b = document.createElement('button');
      b.className = 'mi'; b.setAttribute('role', 'menuitem'); b.disabled = !!it.disabled;
      b.innerHTML = '<span class="mi-ic">' + (it.checked ? '<span class="check">✓</span>' : it.icon || '') + '</span><span>' + esc(it.label) + '</span>' + (it.key ? '<span class="mi-key">' + it.key + '</span>' : '') + (it.sub ? '<span class="mi-arrow">' + SI.chevRight + '</span>' : '');
      if (it.sub) {
        b.addEventListener('mouseenter', () => {
          document.querySelectorAll('.menu.sub').forEach(s => s.remove());
          box.querySelectorAll('.sub-open').forEach(s => s.classList.remove('sub-open'));
          b.classList.add('sub-open');
          const s = document.createElement('div'); s.className = 'menu ctx sub';
          render(s, it.sub); document.body.appendChild(s);
          const r = b.getBoundingClientRect();
          s.style.left = (r.right + s.offsetWidth > innerWidth ? r.left - s.offsetWidth : r.right) + 'px';
          s.style.top = Math.min(r.top - 4, innerHeight - s.offsetHeight - 4) + 'px';
        });
      } else {
        b.addEventListener('mouseenter', () => { if (box === m) { document.querySelectorAll('.menu.sub').forEach(s => s.remove()); box.querySelectorAll('.sub-open').forEach(s => s.classList.remove('sub-open')); } });
        b.addEventListener('click', () => { hideMenu(); it.action && it.action(); });
      }
      box.appendChild(b);
    });
  };
  render(m, items);
  document.body.appendChild(m);
  m.style.left = Math.max(4, Math.min(x, innerWidth - m.offsetWidth - 4)) + 'px';
  m.style.top = Math.max(4, Math.min(above ? y - m.offsetHeight : y, innerHeight - m.offsetHeight - 4)) + 'px';
}
function hideMenu() { document.querySelectorAll('.menu.ctx').forEach(m => m.remove()); }
document.addEventListener('pointerdown', e => { if (!e.target.closest('.menu.ctx')) hideMenu(); });
document.addEventListener('contextmenu', e => { if (!e.target.closest('input, textarea, [contenteditable], .term-out')) e.preventDefault(); });

// ================= Пуск, поиск, быстрые настройки, центр уведомлений =================
const PANELS = ['start', 'search', 'quick', 'notif-center'];
function closePanels(except) { PANELS.forEach(p => { if (p !== except) $(p).classList.remove('open'); }); document.querySelectorAll('.tb-btn.open, .tray.open').forEach(b => b.classList.remove('open')); $('power-menu').classList.remove('open'); hideSnapFlyout(); hideTaskView(); }
function togglePanel(id, btn, onOpen) {
  const was = $(id).classList.contains('open');
  closePanels();
  if (!was) { $(id).classList.add('open'); btn && btn.classList.add('open'); onOpen && onOpen(); }
}
let allApps = false;
const START_PINNED = ['explorer', 'browser', 'notepad', 'calc', 'photos', 'media', 'settings', 'terminal', 'clock', 'weather', 'paint', 'messenger', 'games', 'recycle'];
let startFolder = null;
// папка «Игры»: плитка из четырёх маленьких значков, как папки в «Пуске»
function folderTile() { const g = GAMES.slice(0, 4); return '<button class="pin" data-start="games" aria-label="Папка «Игры»"><span class="folder-tile">' + g.map(id => APPS[id].icon).join('') + '</span><span>Игры</span></button>'; }
function renderStart() {
  const q = $('start-q').value.trim().toLowerCase();
  if (q) { $('start-body').innerHTML = searchHTML(q); return; }
  if (startFolder === 'games') {
    $('start-body').innerHTML = '<div class="sec-head"><span>Игры</span><button data-start="back">' + SI.back + ' Назад</button></div><div class="pinned">' +
      GAMES.map(id => '<button class="pin" data-open-app="' + id + '">' + APPS[id].icon + '<span>' + esc(APPS[id].title) + '</span></button>').join('') + '</div>';
    return;
  }
  if (allApps) {
    const ids = Object.keys(APPS).filter(id => !APPS[id].hidden && !APPS[id].game).sort((a, b) => APPS[a].title.localeCompare(APPS[b].title, 'ru'));
    let letter = '', html = '<div class="sec-head"><span>Все приложения</span><button data-start="back">' + SI.back + ' Назад</button></div><div class="all-list scroll">';
    ids.forEach(id => { const l = APPS[id].title[0].toUpperCase(); if (l !== letter) { letter = l; html += '<div class="letter">' + l + '</div>'; } html += '<button class="all-item" data-open-app="' + id + '">' + APPS[id].icon + '<span>' + esc(APPS[id].title) + '</span></button>'; });
    if (GAMES.length) html += '<div class="letter">Папки</div><button class="all-item" data-start="games">' + ICON.folder + '<span>Игры</span></button>';
    $('start-body').innerHTML = html + '</div>';
    return;
  }
  const recs = RECENT.filter(p => FS.has(p)).slice(0, 6);
  $('start-body').innerHTML = '<div class="sec-head"><span>Закреплено</span><button data-start="all">Все ' + SI.chevRight + '</button></div><div class="pinned">' +
    START_PINNED.map(id => id === 'games' ? (GAMES.length ? folderTile() : '') : '<button class="pin" data-open-app="' + id + '">' + APPS[id].icon + '<span>' + esc(APPS[id].title) + '</span></button>').join('') + '</div>' +
    '<div class="sec-head"><span>Рекомендуем</span></div><div class="recs scroll">' +
    (recs.length ? recs.map(p => '<button class="rec" data-open-file="' + esc(p) + '">' + fileIcon(p) + '<div style="min-width:0"><b>' + esc(baseName(p)) + '</b><small>' + fmtStamp(FS.get(p).mtime) + '</small></div></button>').join('')
      : '<div class="muted" style="padding:8px 12px;font-size:13px;grid-column:1/-1">Здесь появятся недавно открытые файлы</div>') + '</div>';
}
function searchHTML(q) {
  const apps = Object.keys(APPS).filter(id => !APPS[id].hidden && APPS[id].title.toLowerCase().includes(q));
  const files = [...FS.values()].filter(e => e.path && baseName(e.path).toLowerCase().includes(q)).slice(0, 8);
  const sets = SETTINGS_PAGES.filter(p => p[1].toLowerCase().includes(q));
  let html = '<div class="search-res scroll">';
  if (apps.length) html += '<div class="sec-head" style="margin-top:8px"><span>Приложения</span></div>' + apps.map(id => '<button class="res-item" data-open-app="' + id + '">' + APPS[id].icon + '<span>' + esc(APPS[id].title) + '</span><small>' + (APPS[id].game ? 'Игры' : 'Приложение') + '</small></button>').join('');
  if (sets.length) html += '<div class="sec-head"><span>Параметры</span></div>' + sets.map(p => '<button class="res-item" data-open-settings="' + p[0] + '">' + ICON.settings + '<span>' + p[1] + '</span><small>Параметры</small></button>').join('');
  if (files.length) html += '<div class="sec-head"><span>Файлы и папки</span></div>' + files.map(e => '<button class="res-item" data-open-file="' + esc(e.path) + '">' + fileIcon(e.path) + '<span>' + esc(baseName(e.path)) + '</span><small>' + esc(parentOf(e.path) || 'Этот компьютер') + '</small></button>').join('');
  if (!apps.length && !files.length && !sets.length) html += '<div class="empty">Ничего не найдено по запросу «' + esc(q) + '»</div>';
  return html + '</div>';
}
function renderSearch() {
  const q = $('search-q').value.trim().toLowerCase();
  $('search-body').innerHTML = q ? searchHTML(q) : '<div class="sec-head" style="margin-top:0"><span>Быстрый поиск</span></div><div class="pinned">' +
    ['explorer', 'settings', 'notepad', 'calc', 'terminal', 'photos'].map(id => '<button class="pin" data-open-app="' + id + '">' + APPS[id].icon + '<span>' + esc(APPS[id].title) + '</span></button>').join('') + '</div>';
}
document.addEventListener('click', e => {
  const a = e.target.closest('[data-open-app]'); if (a) { openApp(a.dataset.openApp); return; }
  const f = e.target.closest('[data-open-file]'); if (f) { closePanels(); openPath(f.dataset.openFile); return; }
  const s = e.target.closest('[data-open-settings]'); if (s) { openApp('settings', s.dataset.openSettings); return; }
  const st = e.target.closest('[data-start]'); if (st) { const k = st.dataset.start; startFolder = k === 'games' ? 'games' : null; allApps = k === 'all'; renderStart(); }
});
['start-q', 'search-q'].forEach(id => {
  $(id).addEventListener('input', id === 'start-q' ? renderStart : renderSearch);
  $(id).addEventListener('keydown', e => { if (e.key === 'Enter') { const first = $(id === 'start-q' ? 'start' : 'search').querySelector('[data-open-app],[data-open-file],[data-open-settings]'); if (first) first.click(); } });
});
$('btn-start').addEventListener('click', () => togglePanel('start', $('btn-start'), () => { allApps = false; startFolder = null; $('start-q').value = ''; renderStart(); $('start-q').focus(); }));
$('btn-search').addEventListener('click', () => togglePanel('search', $('btn-search'), () => { $('search-q').value = ''; renderSearch(); $('search-q').focus(); }));
$('btn-tv').addEventListener('click', () => { if ($('taskview').classList.contains('open')) hideTaskView(); else { closePanels(); showTaskView(); } });
$('btn-tray').addEventListener('click', () => togglePanel('quick', $('btn-tray'), renderQuick));
$('btn-clock').addEventListener('click', () => togglePanel('notif-center', $('btn-clock'), () => { calMonth = new Date(); calMonth.setDate(1); renderCal(); renderNotifs(); }));
$('show-desktop').addEventListener('click', () => { const vis = wins.filter(w => !w.min); if (vis.length) vis.forEach(minimizeWin); else wins.forEach(w => { if (w.min) restoreWin(w); }); restack(); });
$('power-btn').addEventListener('click', e => { e.stopPropagation(); $('power-menu').classList.toggle('open'); });
$('power-menu').addEventListener('click', e => { const b = e.target.closest('[data-power]'); if (!b) return; closePanels(); ({ lock: lockScreen, sleep: sleepScreen, restart: restartShell })[b.dataset.power](); });
$('user-btn').addEventListener('click', () => openApp('settings', 'accounts'));
document.addEventListener('pointerdown', e => {
  if (!e.target.closest('.flyout') && !e.target.closest('#taskbar') && !e.target.closest('.menu.ctx') && !e.target.closest('#snap-flyout') && !e.target.closest('#taskview')) closePanels();
});
$('nc-list').addEventListener('click', e => {
  const x = e.target.closest('[data-nx]'); if (x) { NOTES = NOTES.filter(n => String(n.id) !== x.dataset.nx); renderNotifs(); return; }
  const it = e.target.closest('[data-n]'); if (it) { const n = NOTES.find(k => String(k.id) === it.dataset.n); NOTES = NOTES.filter(k => k !== n); renderNotifs(); if (n && APPS[n.app]) openApp(n.app); }
});
$('nc-clear').addEventListener('click', () => { NOTES = []; renderNotifs(); });
$('nc-focus').addEventListener('click', () => { setS({ focus: !S.focus }); renderNotifs(); renderQuick(); });
const QS = [['wifi', 'Wi-Fi', 'wifi'], ['bt', 'Bluetooth', 'bt'], ['airplane', 'Режим «в самолёте»', 'plane'], ['saver', 'Экономия заряда', 'saver'], ['night', 'Ночной свет', 'night'], ['focus', 'Фокусировка', 'focus']];
function renderQuick() {
  $('qs-grid').innerHTML = QS.map(([k, n, ic]) => '<div class="qs-tile' + (S[k] ? ' on' : '') + '"><button data-qs="' + k + '" aria-pressed="' + !!S[k] + '" aria-label="' + n + '">' + SI[ic] + '</button><span>' + n + '</span></div>').join('');
  $('qs-bright').value = S.brightness; $('qs-bright-o').textContent = S.brightness;
  $('qs-vol').value = S.muted ? 0 : S.volume; $('qs-vol-o').textContent = S.muted ? 0 : S.volume;
}
$('qs-grid').addEventListener('click', e => { const b = e.target.closest('[data-qs]'); if (b) { setS({ [b.dataset.qs]: !S[b.dataset.qs] }); renderQuick(); } });
$('qs-bright').addEventListener('input', e => { setS({ brightness: +e.target.value }); $('qs-bright-o').textContent = e.target.value; });
$('qs-vol').addEventListener('input', e => { setS({ volume: +e.target.value, muted: +e.target.value === 0 }); $('qs-vol-o').textContent = e.target.value; });
$('qs-settings').addEventListener('click', () => openApp('settings', 'system'));
on('settings', () => {
  $('btn-tray').classList.toggle('off', !S.wifi || S.airplane);
  $('tray-vol').innerHTML = S.muted || !S.volume ? SI.mute : SI.vol;
});
let calMonth = new Date(); calMonth.setDate(1);
function renderCal() {
  const now = new Date();
  $('cal-today').textContent = now.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
  $('cal-title').textContent = MONTHS[calMonth.getMonth()] + ' ' + calMonth.getFullYear();
  const start = new Date(calMonth); start.setDate(1 - (calMonth.getDay() + 6) % 7);
  let html = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'].map(d => '<div class="dow">' + d + '</div>').join('');
  for (let i = 0; i < 42; i++) { const d = new Date(start); d.setDate(start.getDate() + i); html += '<div class="d' + (d.getMonth() !== calMonth.getMonth() ? ' other' : '') + (d.toDateString() === now.toDateString() ? ' today' : '') + '">' + d.getDate() + '</div>'; }
  $('cal-grid').innerHTML = html;
}
$('cal-prev').onclick = () => { calMonth.setMonth(calMonth.getMonth() - 1); renderCal(); };
$('cal-next').onclick = () => { calMonth.setMonth(calMonth.getMonth() + 1); renderCal(); };

// ================= Представление задач =================
function showTaskView() {
  const tv = $('taskview');
  tv.innerHTML = '<div class="tv-grid">' + (wins.length ? [...wins].reverse().map(w => '<div class="tv-card" data-tv="' + w.id + '" role="button"><div class="tv-top">' + APPS[w.app].icon + '<span>' + esc(w.title) + '</span><button data-tvx="' + w.id + '" title="Закрыть">' + SI.x + '</button></div><div class="tv-body">' + APPS[w.app].icon + '</div></div>').join('')
    : '<div class="tv-empty">Нет открытых окон</div>') + '</div>';
  // Живые миниатюры: копия содержимого окна, уменьшенная до карточки (окна-рамки показываем значком)
  tv.querySelectorAll('[data-tv]').forEach(card => {
    const w = wins.find(k => k.id === card.dataset.tv); if (!w || w.iframe) return;
    const body = card.querySelector('.tv-body'), W = w.el.offsetWidth || 800, H = w.el.offsetHeight || 500;
    const k = Math.min(276 / W, 160 / H);
    const c = w.el.cloneNode(true);
    c.removeAttribute('id'); c.querySelectorAll('[id]').forEach(x => x.removeAttribute('id'));
    c.classList.remove('minimized', 'opening', 'inactive'); c.classList.add('tv-clone');
    Object.assign(c.style, { position: 'absolute', left: '50%', top: '50%', width: W + 'px', height: H + 'px', transform: 'translate(-50%,-50%) scale(' + k + ')', visibility: 'visible', zIndex: 'auto' });
    body.innerHTML = ''; body.appendChild(c);
  });
  tv.classList.add('open'); $('btn-tv').classList.add('open');
}
function hideTaskView() { $('taskview').classList.remove('open'); $('btn-tv').classList.remove('open'); }
$('taskview').addEventListener('click', e => {
  const x = e.target.closest('[data-tvx]'); if (x) { const w = wins.find(k => k.id === x.dataset.tvx); if (w) closeWin(w).then(showTaskView); return; }
  const c = e.target.closest('[data-tv]'); hideTaskView();
  if (c) { const w = wins.find(k => k.id === c.dataset.tv); if (w) focusWin(w); }
});

// ================= Блокировка, сон, перезагрузка =================
function lockScreen() { closePanels(); updateClock(); $('lock').classList.remove('leaving'); $('lock').classList.add('open'); emit('lock'); }
function unlock() { const l = $('lock'); if (!l.classList.contains('open') || l.classList.contains('leaving')) return; if (S.animations) { l.classList.add('leaving'); setTimeout(() => l.classList.remove('open', 'leaving'), 350); } else l.classList.remove('open'); }
$('lock').addEventListener('click', unlock);
function sleepScreen() { lockScreen(); $('dim').style.opacity = '0.92'; const wake = () => { applySettings(); removeEventListener('keydown', wake, true); removeEventListener('pointerdown', wake, true); }; setTimeout(() => { addEventListener('keydown', wake, true); addEventListener('pointerdown', wake, true); }, 50); }
async function restartShell() {
  for (const w of [...wins].reverse()) { await closeWin(w); if (wins.includes(w)) return; }
  $('boot').classList.remove('hidden');
  setTimeout(() => $('boot').classList.add('hidden'), 1100);
}

// ================= Клавиатура =================
document.addEventListener('keydown', e => {
  if ($('lock').classList.contains('open')) { if (!e.ctrlKey && !e.altKey) { e.preventDefault(); unlock(); } return; }
  if (e.key === 'Escape') {
    const open = PANELS.some(p => $(p).classList.contains('open')) || $('taskview').classList.contains('open') || document.querySelector('.menu.ctx');
    if (open) { closePanels(); hideMenu(); return; }
    if (e.ctrlKey) { $('btn-start').click(); return; }
  }
  if (e.ctrlKey && e.key === 'Escape') { $('btn-start').click(); return; }
  const t = e.target, inField = t.closest && t.closest('input, textarea, [contenteditable]');
  if (!activeWin || !activeWin.onKey || inField || activeWin.el.querySelector('.win-dialog-back')) return;
  if (t !== document.body && !activeWin.el.contains(t)) return;
  activeWin.onKey(e);
});

// Вкладка скрыта - анимации и звук на паузе
document.addEventListener('visibilitychange', () => { document.body.classList.toggle('paused', document.hidden); emit('visibility', document.hidden); });
