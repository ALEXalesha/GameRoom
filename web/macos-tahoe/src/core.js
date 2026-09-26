'use strict';
// =====================================================================
// «Тахо» - оболочка в духе настольных систем. Фан-концепт интерфейса, не связан с Microsoft/Apple/Samsung.
// Работает без сети. Файлы - в IndexedDB, настройки - в localStorage (префикс macos-tahoe.).
// =====================================================================
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const store = {
  get(k, d) { try { const v = localStorage.getItem('macos-tahoe.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('macos-tahoe.' + k, JSON.stringify(v)); } catch (e) { /* хранилище недоступно */ } },
  clear() { try { Object.keys(localStorage).filter(k => k.startsWith('macos-tahoe.')).forEach(k => localStorage.removeItem(k)); } catch (e) { /* нет доступа */ } },
};
const bus = {};
const on = (ev, fn) => { (bus[ev] = bus[ev] || new Set()).add(fn); return () => bus[ev].delete(fn); };
const emit = (ev, a) => (bus[ev] || []).forEach(fn => fn(a));
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const MON_SHORT = ['янв.', 'февр.', 'мар.', 'апр.', 'мая', 'июн.', 'июл.', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.'];
const DAYS_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

// ================= Системные значки (монохромные, цвет от текста) =================
const g16 = body => '<svg viewBox="0 0 16 16" aria-hidden="true">' + body + '</svg>';
const st = 'fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"';
const SI = {
  mark: '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="13.5" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M7 14c3-3 6-3 9 0s6 3 9 0M7 20c3-3 6-3 9 0s6 3 9 0" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>',
  wifi: g16('<path d="M1.5 6.2a9.5 9.5 0 0113 0M3.8 8.6a6.2 6.2 0 018.4 0M6 11a3 3 0 014 0" ' + st + '/><circle cx="8" cy="13" r="1" fill="currentColor"/>'),
  wifiOff: g16('<path d="M1.5 6.2a9.5 9.5 0 0113 0M3.8 8.6a6.2 6.2 0 018.4 0" ' + st + ' opacity=".35"/><path d="M2 2l12 12" ' + st + '/>'),
  bt: g16('<path d="M4.5 5l7 6-3.5 3V2l3.5 3-7 6" ' + st + '/>'),
  battery: '<svg viewBox="0 0 26 13" aria-hidden="true"><rect x="0.6" y="0.6" width="22" height="11.8" rx="3.4" fill="none" stroke="currentColor" stroke-opacity=".45"/><rect x="2.2" y="2.2" width="15" height="8.6" rx="2" fill="currentColor"/><path d="M24 4.5v4a2 2 0 000-4z" fill="currentColor" fill-opacity=".45"/></svg>',
  search: g16('<circle cx="7" cy="7" r="4.6" ' + st + '/><path d="M10.5 10.5l3.5 3.5" ' + st + '/>'),
  cc: g16('<rect x="1.5" y="3" width="13" height="4" rx="2" ' + st + '/><circle cx="12.5" cy="5" r="1.2" fill="currentColor"/><rect x="1.5" y="9" width="13" height="4" rx="2" ' + st + '/><circle cx="3.5" cy="11" r="1.2" fill="currentColor"/>'),
  moon: g16('<path d="M13.5 9.8A6 6 0 016.2 2.5a6 6 0 107.3 7.3z" ' + st + '/>'),
  sun: g16('<circle cx="8" cy="8" r="3" ' + st + '/><path d="M8 1v1.6M8 13.4V15M1 8h1.6M13.4 8H15M3 3l1.1 1.1M11.9 11.9L13 13M3 13l1.1-1.1M11.9 4.1L13 3" ' + st + '/>'),
  vol: g16('<path d="M2 6h2.5L8 3v10L4.5 10H2z" ' + st + '/><path d="M10.5 5.5a3.5 3.5 0 010 5M12.4 3.6a6.2 6.2 0 010 8.8" ' + st + '/>'),
  mute: g16('<path d="M2 6h2.5L8 3v10L4.5 10H2z" ' + st + '/><path d="M10.5 6l4 4m0-4l-4 4" ' + st + '/>'),
  x: g16('<path d="M4 4l8 8M12 4l-8 8" ' + st + '/>'),
  lx: g16('<path d="M4.5 4.5l7 7M11.5 4.5l-7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'),
  lmin: g16('<path d="M3.5 8h9" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'),
  lzoom: g16('<path d="M4 12V6.5L9.5 12zM12 4v5.5L6.5 4z" fill="currentColor"/>'),
  back: g16('<path d="M10 3L5 8l5 5" ' + st + '/>'),
  fwd: g16('<path d="M6 3l5 5-5 5" ' + st + '/>'),
  chev: g16('<path d="M6 3l5 5-5 5" ' + st + '/>'),
  plus: g16('<path d="M8 2.5v11M2.5 8h11" ' + st + '/>'),
  trash: g16('<path d="M3 4h10M6 4V2.5h4V4M4.3 4l.7 10h6l.7-10" ' + st + '/>'),
  grid: g16('<rect x="2" y="2" width="5" height="5" rx="1.2" ' + st + '/><rect x="9" y="2" width="5" height="5" rx="1.2" ' + st + '/><rect x="2" y="9" width="5" height="5" rx="1.2" ' + st + '/><rect x="9" y="9" width="5" height="5" rx="1.2" ' + st + '/>'),
  list: g16('<path d="M5.5 4h8M5.5 8h8M5.5 12h8" ' + st + '/><circle cx="2.5" cy="4" r=".9" fill="currentColor"/><circle cx="2.5" cy="8" r=".9" fill="currentColor"/><circle cx="2.5" cy="12" r=".9" fill="currentColor"/>'),
  newfolder: g16('<path d="M1.5 4a1 1 0 011-1H6l1.5 1.5h6a1 1 0 011 1V12a1 1 0 01-1 1h-11a1 1 0 01-1-1z" ' + st + '/><path d="M8 7v4M6 9h4" ' + st + '/>'),
  preview: g16('<rect x="1.5" y="2.5" width="13" height="11" rx="2" ' + st + '/><path d="M10 2.5v11" ' + st + '/>'),
  import: g16('<path d="M8 2v8m-3-3l3 3 3-3M2.5 11v2.5h11V11" ' + st + '/>'),
  play: g16('<path d="M4.5 2.5l9 5.5-9 5.5z" fill="currentColor"/>'),
  pause: g16('<rect x="4" y="2.5" width="3" height="11" rx=".8" fill="currentColor"/><rect x="9" y="2.5" width="3" height="11" rx=".8" fill="currentColor"/>'),
  prev: g16('<path d="M8 8l6-4.5v9zM2 8l6-4.5v9z" fill="currentColor"/>'),
  next: g16('<path d="M8 8L2 3.5v9zM14 8L8 3.5v9z" fill="currentColor"/>'),
  lock: g16('<rect x="3" y="7" width="10" height="7.5" rx="1.8" ' + st + '/><path d="M5 7V5a3 3 0 016 0v2" ' + st + '/>'),
  sleep: g16('<path d="M13.5 9.8A6 6 0 016.2 2.5a6 6 0 107.3 7.3z" ' + st + '/>'),
  restart: g16('<path d="M13 8a5 5 0 11-1.5-3.6M13 2.5v3h-3" ' + st + '/>'),
  power: g16('<path d="M8 1.5v6" ' + st + '/><path d="M4.6 3.6a5.5 5.5 0 106.8 0" ' + st + '/>'),
  display: g16('<rect x="1.5" y="2" width="13" height="9" rx="1.5" ' + st + '/><path d="M5.5 14h5M8 11v3" ' + st + '/>'),
  info: g16('<circle cx="8" cy="8" r="6.3" ' + st + '/><path d="M8 7v4.3M8 4.6v.2" ' + st + '/>'),
  person: g16('<circle cx="8" cy="5.5" r="3" ' + st + '/><path d="M2.5 14.5a5.5 5.5 0 0111 0" ' + st + '/>'),
  time: g16('<circle cx="8" cy="8" r="6.3" ' + st + '/><path d="M8 4.5V8l2.5 1.8" ' + st + '/>'),
  brush: g16('<circle cx="8" cy="8" r="6.3" ' + st + '/><path d="M8 1.7v12.6" ' + st + '/><path d="M8 1.7a6.3 6.3 0 010 12.6z" fill="currentColor"/>'),
  dock: g16('<rect x="1.5" y="2" width="13" height="12" rx="2" ' + st + '/><rect x="4" y="10" width="8" height="2" rx="1" fill="currentColor"/>'),
  bell: g16('<path d="M8 2a4 4 0 014 4v2.8l1.3 2.2H2.7L4 8.8V6a4 4 0 014-4zM6.3 13a1.8 1.8 0 003.4 0" ' + st + '/>'),
  access: g16('<circle cx="8" cy="3" r="1.3" fill="currentColor"/><path d="M3 5.5l5 1 5-1M8 6.5v3l-2.5 5M8 9.5l2.5 5" ' + st + '/>'),
  apps: g16('<rect x="2" y="2" width="5" height="5" rx="1.5" ' + st + '/><rect x="9" y="2" width="5" height="5" rx="1.5" ' + st + '/><rect x="2" y="9" width="5" height="5" rx="1.5" ' + st + '/><rect x="9" y="9" width="5" height="5" rx="1.5" ' + st + '/>'),
  home: g16('<path d="M2 7.5L8 2.5l6 5V14H10V10H6v4H2z" ' + st + '/>'),
  doc: g16('<path d="M4 1.5h5l3.5 3.5v9.5h-8.5z" ' + st + '/><path d="M9 1.5V5h3.5" ' + st + '/>'),
  down: g16('<circle cx="8" cy="8" r="6.3" ' + st + '/><path d="M8 4.5v6M5.5 8.2L8 10.7l2.5-2.5" ' + st + '/>'),
  photo: g16('<rect x="1.5" y="3" width="13" height="10" rx="2" ' + st + '/><path d="M2 12l4-4 3 3 2-2 3 3" ' + st + '/>'),
  note: g16('<path d="M6 12.5V4l7-1.5V11" ' + st + '/><circle cx="4.5" cy="12.5" r="1.6" ' + st + '/><circle cx="11.5" cy="11" r="1.6" ' + st + '/>'),
  deskf: g16('<rect x="1.5" y="2" width="13" height="9" rx="1.5" ' + st + '/><path d="M5.5 14h5" ' + st + '/>'),
  mission: g16('<rect x="1.5" y="3" width="6" height="5" rx="1" ' + st + '/><rect x="8.5" y="3" width="6" height="5" rx="1" ' + st + '/><rect x="4.5" y="9.5" width="7" height="4" rx="1" ' + st + '/>'),
};
// Значки в разметке
document.querySelectorAll('[data-si]').forEach(e => { e.innerHTML = SI[e.dataset.si]; });
const ICON_BY_ROOT = { 'Рабочий стол': 'deskf', 'Документы': 'doc', 'Загрузки': 'down', 'Изображения': 'photo', 'Музыка': 'note' };

// ================= Обои: пейзажи и волны, нарисованные кодом =================
function svgUrl(svg) { return 'url("data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg) + '")'; }
function lakeSVG(dark) {
  // горное озеро: небо, солнце/луна, три гряды гор, вода с отражением
  const sky = dark ? ['#0b1330', '#27345e', '#4a4a78'] : ['#6aa7e8', '#a9cdf0', '#f6d8b8'];
  const m = dark ? ['#2a3257', '#1c2344', '#10162e'] : ['#7d93c2', '#4d6a9e', '#2a4570'];
  const water = dark ? ['#141c3a', '#070b1c'] : ['#3f79b8', '#123d6e'];
  const sunC = dark ? '#dfe6ff' : '#fff4d6';
  const ridge = (y, amp, seed) => { let d = 'M0 ' + y; for (let x = 0; x <= 1600; x += 16) { const h = y - amp * (0.5 + 0.35 * Math.sin(x / 170 + seed) * Math.cos(x / 310 + seed * 2) + 0.12 * Math.sin(x / 47 + seed * 3) + 0.04 * Math.sin(x / 13 + seed)); d += ' L' + x + ' ' + h.toFixed(1); } return d + ' L1600 640 L0 640 Z'; };
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice"><defs>' +
    '<linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + sky[0] + '"/><stop offset="0.55" stop-color="' + sky[1] + '"/><stop offset="1" stop-color="' + sky[2] + '"/></linearGradient>' +
    '<linearGradient id="w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + water[0] + '"/><stop offset="1" stop-color="' + water[1] + '"/></linearGradient>' +
    '<radialGradient id="g" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="' + sunC + '" stop-opacity="0.9"/><stop offset="1" stop-color="' + sunC + '" stop-opacity="0"/></radialGradient>' +
    '<filter id="b"><feGaussianBlur stdDeviation="3"/></filter><filter id="h"><feGaussianBlur stdDeviation="14"/></filter></defs>' +
    '<rect width="1600" height="1000" fill="url(#s)"/><circle cx="1120" cy="300" r="260" fill="url(#g)"/><circle cx="1120" cy="300" r="46" fill="' + sunC + '"/>' +
    '<path d="' + ridge(430, 150, 1) + '" fill="' + m[0] + '" filter="url(#b)" opacity="0.9"/><path d="' + ridge(520, 170, 4) + '" fill="' + m[1] + '"/><path d="' + ridge(600, 110, 7) + '" fill="' + m[2] + '"/>' +
    '<rect y="640" width="1600" height="360" fill="url(#w)"/><g opacity="0.35" filter="url(#h)" transform="translate(0 1280) scale(1 -1)"><path d="' + ridge(600, 110, 7) + '" fill="' + m[0] + '"/></g>' +
    '<ellipse cx="1120" cy="760" rx="40" ry="130" fill="' + sunC + '" opacity="0.25" filter="url(#h)"/>' +
    Array.from({ length: 14 }, (_, i) => '<rect x="' + (300 + (i * 97) % 1100) + '" y="' + (660 + i * 22) + '" width="' + (80 + (i * 53) % 160) + '" height="1.5" fill="#fff" opacity="' + (dark ? 0.12 : 0.22) + '"/>').join('') + '</svg>';
}
function dunesSVG(dark) {
  const c = dark ? ['#1a0f24', '#3b1f3f', '#6b2f4a', '#a2485a', '#d0706a'] : ['#ffe3c4', '#ffc49a', '#f6a27a', '#e07b61', '#b9554b'];
  let d = '';
  for (let i = 0; i < 5; i++) { const y = 300 + i * 150; d += '<path d="M0 ' + y + ' C 400 ' + (y - 160 + i * 20) + ', 900 ' + (y + 120) + ', 1600 ' + (y - 60) + ' V1000 H0 Z" fill="' + c[i] + '"/>'; }
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice"><rect width="1600" height="1000" fill="' + (dark ? '#0d0714' : '#fff4e8') + '"/>' + d + '</svg>';
}
function swirlSVG(dark, hue) {
  const c = (l, s = 85) => 'hsl(' + hue + ',' + s + '%,' + l + '%)';
  const c2 = (l, s = 85) => 'hsl(' + (hue + 40) + ',' + s + '%,' + l + '%)';
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice"><defs><filter id="b"><feGaussianBlur stdDeviation="40"/></filter>' +
    '<linearGradient id="a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + c(dark ? 12 : 88) + '"/><stop offset="1" stop-color="' + c2(dark ? 20 : 70) + '"/></linearGradient></defs>' +
    '<rect width="1600" height="1000" fill="url(#a)"/><g filter="url(#b)">' +
    '<path d="M-100 700 C 300 400, 700 900, 1100 500 S 1700 300, 1800 500 V1100 H-100Z" fill="' + c(dark ? 35 : 62) + '" opacity="0.9"/>' +
    '<path d="M-100 850 C 400 600, 800 1000, 1200 700 S 1700 600, 1800 700 V1100 H-100Z" fill="' + c2(dark ? 45 : 55) + '" opacity="0.85"/>' +
    '<path d="M-100 400 C 300 150, 800 500, 1300 200 S 1700 100, 1800 150 V-100 H-100Z" fill="' + c2(dark ? 25 : 80) + '" opacity="0.8"/></g></svg>';
}
const WALLS = {
  lake: { name: 'Озеро', css: d => svgUrl(lakeSVG(d)) },
  dunes: { name: 'Дюны', css: d => svgUrl(dunesSVG(d)) },
  swirl: { name: 'Волна', css: d => svgUrl(swirlSVG(d, 215)) },
  aurora: { name: 'Сияние', css: d => svgUrl(swirlSVG(d, 150)) },
  sunset: { name: 'Закат', css: d => svgUrl(swirlSVG(d, 300)) },
  graphite: { name: 'Графит', css: d => d ? 'linear-gradient(160deg,#2c2c2e,#0f0f10)' : 'linear-gradient(160deg,#e5e5ea,#c7c7cc)' },
};
const ACCENTS = [['Синий', '#0a84ff'], ['Фиолетовый', '#bf5af2'], ['Розовый', '#ff375f'], ['Красный', '#ff453a'], ['Оранжевый', '#ff9f0a'], ['Жёлтый', '#ffd60a'], ['Зелёный', '#30d158'], ['Графит', '#8e8e93']];

// ================= Настройки: применяются ко всей системе =================
const DEFAULTS = { theme: 'light', accent: 0, wallpaper: 'lake', transparency: true, animations: true, brightness: 100, night: false, volume: 60, muted: false,
  wifi: true, bt: true, focus: false, time24: true, seconds: false, showDate: true, dockSize: 52, magnify: true, desktopIcons: true };
const S = Object.assign({}, DEFAULTS, store.get('cfg', {}));
function wallpaperCss(dark) {
  if (S.wallpaper && S.wallpaper.startsWith('fs:')) { const f = FS.get(S.wallpaper.slice(3)); const u = f && fileUrl(f); if (u) return 'url("' + u + '")'; }
  return (WALLS[S.wallpaper] || WALLS.lake).css(dark);
}
function applySettings() {
  const dark = S.theme === 'dark';
  document.body.dataset.theme = S.theme;
  const accent = (ACCENTS[S.accent] || ACCENTS[0])[1];
  document.documentElement.style.setProperty('--accent', accent);
  document.documentElement.style.setProperty('--on-accent', S.accent === 5 ? '#000' : '#fff');
  document.documentElement.style.setProperty('--dock-size', S.dockSize + 'px');
  const w = wallpaperCss(dark);
  for (const el of [$('wallpaper'), $('lock')]) { el.style.background = ''; if (w.startsWith('url(')) { el.style.backgroundImage = w; el.style.backgroundSize = 'cover'; el.style.backgroundPosition = 'center'; } else el.style.background = w; }
  document.body.classList.toggle('no-anim', !S.animations);
  document.body.classList.toggle('no-transparency', !S.transparency);
  $('desktop-icons').hidden = !S.desktopIcons;
  $('dim').style.opacity = String((100 - S.brightness) / 100 * 0.7);
  $('night').style.display = S.night ? 'block' : 'none';
  $('mb-wifi').innerHTML = S.wifi ? SI.wifi : SI.wifiOff;
  updateClock();
  emit('settings');
}
function setS(patch) { Object.assign(S, patch); store.set('cfg', S); applySettings(); }

// ================= Время =================
function fmtTime(d, withSec) {
  const s = withSec ? ':' + pad(d.getSeconds()) : '';
  if (S.time24) return pad(d.getHours()) + ':' + pad(d.getMinutes()) + s;
  return (d.getHours() % 12 || 12) + ':' + pad(d.getMinutes()) + s + ' ' + (d.getHours() < 12 ? 'AM' : 'PM');
}
const fmtDate = d => d.getDate() + ' ' + MONTHS_GEN[d.getMonth()] + ' ' + d.getFullYear();
function fmtStamp(t) { const d = new Date(t); return d.getDate() + ' ' + MON_SHORT[d.getMonth()] + ' ' + d.getFullYear() + ' г., ' + fmtTime(d); }
function updateClock() {
  const n = new Date();
  $('mb-clock').textContent = (S.showDate ? DAYS_SHORT[n.getDay()] + ' ' + n.getDate() + ' ' + MON_SHORT[n.getMonth()] + '  ' : '') + fmtTime(n, S.seconds);
  $('lk-time').textContent = fmtTime(n).replace(/ (AM|PM)$/, '');
  $('lk-date').textContent = n.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
}
setInterval(() => { updateClock(); emit('tick'); }, 1000);

// ================= Файловая система в IndexedDB (как в Проводнике, своя база) =================
const ROOTS = ['Рабочий стол', 'Документы', 'Загрузки', 'Изображения', 'Музыка'];
const FS = new Map();
let TRASH = [];
let db = null, dbOk = true, dbPending = 0;
const parentOf = p => p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '';
const baseName = p => p.slice(p.lastIndexOf('/') + 1);
const extOf = p => { const b = baseName(p), i = b.lastIndexOf('.'); return i > 0 ? b.slice(i + 1).toLowerCase() : ''; };
const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'];
const TEXT_EXT = ['txt', 'md', 'log', 'csv', 'json', 'js', 'py', 'html', 'css', 'sh', 'rtf'];
const isImage = p => IMAGE_EXT.includes(extOf(p));
const isText = p => TEXT_EXT.includes(extOf(p)) || !extOf(p);
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
    try { req = indexedDB.open('macos-tahoe', 1); } catch (e) { dbOk = false; res(null); return; }
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
  if (!rows.length) { rows = defaultFiles(); if (db) rows.forEach(dbPut); }
  rows.forEach(e => FS.set(e.path, e));
  ROOTS.forEach(r => { if (!FS.has(r)) FS.set(r, { path: r, type: 'dir', mtime: Date.now() }); });
  TRASH = trash.sort((a, b) => a.deleted - b.deleted);
}
function defaultFiles() {
  const t = Date.now(), f = (path, text) => ({ path, type: 'file', mtime: t, mime: 'text/plain', size: new Blob([text]).size, text });
  const img = (path, svg) => ({ path, type: 'file', mtime: t, mime: 'image/svg+xml', size: svg.length, text: svg });
  return [
    ...ROOTS.map(r => ({ path: r, type: 'dir', mtime: t })),
    { path: 'Документы/Проекты', type: 'dir', mtime: t }, { path: 'Документы/Учёба', type: 'dir', mtime: t },
    f('Рабочий стол/Прочти меня.txt', 'Добро пожаловать в «Тахо»!\n\n- окна тащатся за заголовок; у края экрана раскладываются по половинам;\n- наведите на зелёную кнопку - варианты раскладки;\n- Ctrl+Пробел - поиск, F3 - все окна, F4 - Launchpad;\n- файлы лежат в памяти браузера (IndexedDB) и переживают перезагрузку.\n\nФан-концепт интерфейса, не связан с Microsoft/Apple/Samsung.\n'),
    f('Документы/Список дел.txt', 'Список дел\n\n- купить хлеб\n- дочитать книгу\n- позвонить бабушке\n'),
    f('Документы/Проекты/план.txt', '1. Придумать\n2. Сделать\n3. Показать\n'),
    f('Загрузки/заметка.md', '# Заметка\n\nФайлы с диска можно перетащить в окно «Файлов».\n'),
    img('Изображения/Озеро.svg', lakeSVG(false)), img('Изображения/Ночь.svg', lakeSVG(true)),
    img('Изображения/Дюны.svg', dunesSVG(false)), img('Изображения/Волна.svg', swirlSVG(false, 215)),
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
  const cmp = sortBy === 'date' ? (a, b) => b.mtime - a.mtime : sortBy === 'kind' ? (a, b) => extOf(a.path).localeCompare(extOf(b.path)) || baseName(a.path).localeCompare(baseName(b.path), 'ru') : (a, b) => baseName(a.path).localeCompare(baseName(b.path), 'ru');
  return list.sort((a, b) => (a.type === b.type ? cmp(a, b) : a.type === 'dir' ? -1 : 1));
}
function uniquePath(dir, base, ext = '') {
  const pre = dir ? dir + '/' : '';
  let name = base + ext, i = 2;
  while (FS.has(pre + name)) name = base + ' ' + (i++) + ext;
  return pre + name;
}
function nameError(dir, name, self) {
  if (!name || !name.trim()) return 'Введите имя';
  if (/[\/:]/.test(name)) return 'Имя не должно содержать «/» и «:»';
  if (name.startsWith('.')) return 'Имена, начинающиеся с точки, зарезервированы для системы';
  const p = (dir ? dir + '/' : '') + name;
  if (FS.has(p) && p !== self) return 'Имя «' + name + '» уже занято. Выберите другое.';
  return '';
}
function fsChanged(path) { emit('fs', path); }
function writeFile(path, text) {
  const old = FS.get(path);
  const e = { path, type: 'file', mtime: Date.now(), mime: (old && old.mime) || 'text/plain', size: new Blob([text]).size, text };
  FS.set(path, e); dbPut(e); touchRecent(path); fsChanged(path);
  return e;
}
function makeDir(path) { const e = { path, type: 'dir', mtime: Date.now() }; FS.set(path, e); dbPut(e); fsChanged(path); return e; }
async function importFile(dir, file) {
  const m = file.name.match(/\.[^.]+$/);
  const path = uniquePath(dir, m ? file.name.slice(0, -m[0].length) : file.name, m ? m[0] : '');
  const e = { path, type: 'file', mtime: Date.now(), mime: file.type || 'application/octet-stream', size: file.size };
  if (file.type === 'image/svg+xml' || ((file.type.startsWith('text/') || isText(path)) && file.size < 2e6)) e.text = await file.text();
  else e.blob = file;
  FS.set(path, e); dbPut(e); fsChanged(path);
  return path;
}
function subtree(path) { return [...FS.keys()].filter(p => p === path || p.startsWith(path + '/')); }
function splitName(p) { const b = baseName(p), dot = b.lastIndexOf('.'), f = FS.get(p) && FS.get(p).type === 'file'; return f && dot > 0 ? [b.slice(0, dot), b.slice(dot)] : [b, '']; }
function movePath(from, toDir) {
  if (!FS.has(from) || ROOTS.includes(from) || parentOf(from) === toDir || toDir === from || toDir.startsWith(from + '/')) return null;
  const target = uniquePath(toDir, ...splitName(from));
  subtree(from).forEach(p => { const e = FS.get(p); FS.delete(p); dbDel(p); const ne = Object.assign({}, e, { path: target + p.slice(from.length) }); FS.set(ne.path, ne); dbPut(ne); });
  if (S.wallpaper === 'fs:' + from) setS({ wallpaper: 'fs:' + target });
  fsChanged(target);
  return target;
}
function copyPath(from, toDir) {
  if (!FS.has(from)) return null;
  const [b, e] = splitName(from);
  const target = uniquePath(toDir, parentOf(from) === toDir ? b + ' копия' : b, e);
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
  const t = TRASH[i], dir = parentOf(t.path);
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
function touchRecent(p) { RECENT = [p].concat(RECENT.filter(x => x !== p)).slice(0, 8); store.set('recent', RECENT); }
function fileIcon(path) {
  const e = FS.get(path);
  if (!e) return FILE_ICONS.other;
  if (e.type === 'dir') return FILE_ICONS.folder;
  if (isImage(path)) { const u = fileUrl(e); return u ? '<img src="' + u + '" alt="">' : FILE_ICONS.image; }
  if (['js', 'py', 'html', 'css', 'json', 'sh'].includes(extOf(path))) return FILE_ICONS.code;
  if (extOf(path) === 'csv') return FILE_ICONS.sheet;
  return isText(path) || e.text != null ? FILE_ICONS.text : FILE_ICONS.other;
}
const fmtSize = b => b == null ? '--' : b < 1000 ? b + ' байт' : b < 1e6 ? (b / 1000).toFixed(1).replace('.', ',') + ' КБ' : (b / 1e6).toFixed(1).replace('.', ',') + ' МБ';
const kindName = e => e.type === 'dir' ? 'Папка' : isImage(e.path) ? 'Изображение ' + extOf(e.path).toUpperCase() : isText(e.path) ? 'Текстовый документ' : 'Документ';
function openPath(path) {
  const e = FS.get(path); if (!e && path !== '') return;
  if (path === '' || e.type === 'dir') { openApp('finder', path); return; }
  touchRecent(path);
  if (isImage(path)) openApp('photos', path);
  else if (isText(path) || e.text != null) openApp('textedit', path);
  else notify({ app: 'finder', title: 'Не удалось открыть', body: '«' + baseName(path) + '»: нет программы для этого типа' });
}

// ================= Уведомления =================
let NOTES = [];
function notifHTML(n, full) {
  return '<div class="n-ic">' + icon(APPS[n.app] ? APPS[n.app].icon : 'settings') + '</div><b></b><time>' + (full ? fmtTime(new Date(n.t)) : 'сейчас') + '</time><p></p>';
}
function notify({ app, title, body }) {
  const n = { id: String(Date.now() + Math.random()), app, title, body, t: Date.now() };
  NOTES.unshift(n); NOTES = NOTES.slice(0, 30);
  renderNotifs();
  if (S.focus) return n;       // «Не беспокоить»: без всплывания, только в центре уведомлений
  const el = document.createElement('div');
  el.className = 'notif glass glass-strong'; el.setAttribute('role', 'status');
  el.innerHTML = notifHTML(n) + '<button class="n-x" title="Закрыть" aria-label="Закрыть">' + SI.x + '</button>';
  el.querySelector('b').textContent = title; el.querySelector('p').textContent = body;
  const kill = () => { if (!el.isConnected) return; el.classList.add('out'); setTimeout(() => el.remove(), 250); };
  el.querySelector('.n-x').onclick = e => { e.stopPropagation(); kill(); };
  el.onclick = () => { kill(); if (APPS[app]) openApp(app); };
  $('toasts').appendChild(el);
  setTimeout(kill, 6000);
  return n;
}
function renderNotifs() {
  const list = $('nc-list');
  list.innerHTML = NOTES.map(n => '<div class="notif glass glass-strong" data-n="' + n.id + '">' + notifHTML(n, true) + '<button class="n-x" data-nx="' + n.id + '" title="Закрыть" aria-label="Закрыть">' + SI.x + '</button></div>').join('');
  list.querySelectorAll('[data-n]').forEach((el, i) => { el.querySelector('b').textContent = NOTES[i].title; el.querySelector('p').textContent = NOTES[i].body; });
  $('nc-head').hidden = !NOTES.length;
  $('mb-clock').classList.toggle('has-notes', !!NOTES.length);
}

// ================= Окна =================
const layer = () => $('windows');
const area = () => ({ w: layer().clientWidth, h: layer().clientHeight });
const dockReserve = () => S.dockSize + 24;
const wins = [];
let activeWin = null, winSeq = 0;
function openApp(id, arg) {
  const app = APPS[id]; if (!app) return null;
  closePanels();
  if (!app.multi) { const ex = wins.find(w => w.app === id); if (ex) { if (arg !== undefined && ex.onArg) ex.onArg(arg); focusWin(ex); return ex; } }
  if (app.multi && arg !== undefined) { const ex = wins.find(w => w.app === id && w.arg === arg); if (ex) { focusWin(ex); return ex; } }
  const a = area(), saved = store.get('geo.' + id, null);
  const width = Math.min(saved ? saved.w : app.w, a.w), height = Math.min(saved ? saved.h : app.h, a.h - dockReserve() + 20);
  const n = wins.length % 6;
  const w = { id: 'w' + (++winSeq), app: id, arg, zoomed: false, tiled: null, prev: null, cleanup: [] };
  const el = document.createElement('div');
  el.className = 'window' + (S.animations ? ' opening' : '');
  el.id = w.id; el.dataset.app = id; el.tabIndex = -1;
  Object.assign(el.style, { width: width + 'px', height: height + 'px',
    left: (saved ? saved.x + n * 20 : (a.w - width) / 2 + (n - 2) * 26) + 'px', top: (saved ? saved.y + n * 20 : Math.max(10, (a.h - dockReserve() - height) / 2 + (n - 2) * 22)) + 'px' });
  el.innerHTML = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map(d => '<div class="rz rz-' + d + '" data-rz="' + d + '"></div>').join('') +
    '<div class="titlebar' + (app.slim ? ' slim' : '') + '"><div class="lights"><button class="l-close" data-cap="close" title="Закрыть" aria-label="Закрыть">' + SI.lx + '</button>' +
    '<button class="l-min" data-cap="min" title="Свернуть в Dock" aria-label="Свернуть">' + SI.lmin + '</button><button class="l-zoom" data-cap="zoom" title="Заполнить экран" aria-label="Заполнить">' + SI.lzoom + '</button></div>' +
    '<span class="w-title"></span><div class="w-tools"></div></div><div class="wbody"></div>';
  w.el = el; w.body = el.querySelector('.wbody'); w.tools = el.querySelector('.w-tools');
  w.setTitle = t => { el.querySelector('.w-title').textContent = t; w.title = t; if (activeWin === w) renderMenubar(); };
  w.setTitle(app.title);
  layer().appendChild(el);
  wins.push(w);
  setTimeout(() => el.classList.remove('opening'), 260);
  el.querySelector('[data-cap=min]').onclick = () => minimizeWin(w);
  el.querySelector('[data-cap=zoom]').onclick = () => toggleZoom(w);
  el.querySelector('[data-cap=close]').onclick = () => closeWin(w);
  bindTileMenu(w, el.querySelector('[data-cap=zoom]'));
  el.addEventListener('pointerdown', () => focusWin(w), true);
  const tb = el.querySelector('.titlebar');
  tb.addEventListener('dblclick', e => { if (!e.target.closest('.lights, .w-tools button, .w-tools input')) toggleZoom(w); });
  enableDrag(w, tb);
  el.querySelectorAll('.rz').forEach(h => enableResize(w, h));
  if (app.iframe) mountIframe(w, app.iframe); else app.create(w, arg);
  clampWin(w);
  if (saved && saved.zoom) toggleZoom(w, true);
  focusWin(w);
  bounceDock(id);
  return w;
}
function mountIframe(w, src) {
  const f = document.createElement('iframe');
  f.src = src; f.title = APPS[w.app].title;
  f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-downloads allow-forms allow-pointer-lock allow-modals');
  f.style.cssText = 'flex:1;border:none;width:100%;background:#1e1e1e;border-radius:0 0 16px 16px';
  w.body.appendChild(f);
  w.iframe = f;
}
function restack() {
  const top = [...wins].reverse().find(w => !w.min) || null;
  wins.forEach((w, i) => { w.el.style.zIndex = i + 1; w.el.classList.toggle('inactive', w !== top); });
  activeWin = top;
  renderDock(); renderMenubar();
}
function focusWin(w) {
  const i = wins.indexOf(w); if (i < 0) return;
  wins.splice(i, 1); wins.push(w);
  if (w.min) restoreWin(w);
  restack();
  if (w.iframe && document.activeElement !== w.iframe) { try { w.iframe.focus(); } catch (e) { /* грузится */ } }
  else if (!w.iframe && !w.el.contains(document.activeElement)) w.el.focus({ preventScroll: true });
}
function dockRectOf(w) { const b = document.querySelector('#dock [data-mini="' + w.id + '"]') || document.querySelector('#dock [data-app="' + w.app + '"]'); return b ? b.getBoundingClientRect() : null; }
function animateDock(w, toDock) {
  if (!S.animations || !w.el.animate) return Promise.resolve();
  const r = w.el.getBoundingClientRect(), t = dockRectOf(w);
  const dx = t ? t.left + t.width / 2 - (r.left + r.width / 2) : 0, dy = t ? t.top + t.height / 2 - (r.top + r.height / 2) : 300;
  // «джинн» упрощённо: окно сужается к низу и втягивается в значок Dock
  const frames = [{ transform: 'none', opacity: 1 }, { transform: 'translate(' + dx * 0.4 + 'px,' + dy * 0.5 + 'px) scale(0.6, 0.45) perspective(600px) rotateX(18deg)', opacity: 0.8, offset: 0.5 }, { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(0.06)', opacity: 0.2 }];
  return w.el.animate(toDock ? frames : frames.reverse(), { duration: 320, easing: 'cubic-bezier(0.4,0,0.2,1)' }).finished.catch(() => { });
}
function minimizeWin(w) { if (w.min) return; w.min = true; restack(); animateDock(w, true).then(() => { if (w.min) w.el.classList.add('minimized'); }); }
function restoreWin(w) { w.min = false; w.el.classList.remove('minimized'); animateDock(w, false); }
async function closeWin(w) {
  if (w.beforeClose && !(await w.beforeClose())) return false;
  const i = wins.indexOf(w); if (i < 0) return true;
  rememberGeo(w);
  wins.splice(i, 1);
  w.cleanup.forEach(f => { try { f(); } catch (e) { /* ничего */ } });
  const el = w.el;
  if (S.animations) { el.classList.add('closing'); setTimeout(() => el.remove(), 170); } else el.remove();
  restack();
  return true;
}
async function quitApp(id) { for (const w of wins.filter(x => x.app === id).reverse()) if (!(await closeWin(w))) return false; return true; }
function rememberGeo(w) {
  const r = (w.zoomed || w.tiled) && w.prev ? w.prev : { left: w.el.style.left, top: w.el.style.top, width: w.el.style.width, height: w.el.style.height };
  store.set('geo.' + w.app, { x: parseFloat(r.left), y: parseFloat(r.top), w: parseFloat(r.width), h: parseFloat(r.height), zoom: w.zoomed });
}
function setRect(w, r) { Object.assign(w.el.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' }); }
function saveNormal(w) { if (!w.zoomed && !w.tiled) w.prev = { left: w.el.style.left, top: w.el.style.top, width: w.el.style.width, height: w.el.style.height }; }
// Раскладка: половины, четверти и «заполнить» - всё над Dock, с отступом как в системе
const GAP = 6;
function zoneRect(z) {
  const a = area(), H = a.h - dockReserve();
  const R = { fill: [0, 0, 1, 1], left: [0, 0, 0.5, 1], right: [0.5, 0, 0.5, 1], top: [0, 0, 1, 0.5], bottom: [0, 0.5, 1, 0.5], tl: [0, 0, 0.5, 0.5], tr: [0.5, 0, 0.5, 0.5], bl: [0, 0.5, 0.5, 0.5], br: [0.5, 0.5, 0.5, 0.5] }[z];
  return { x: Math.round(R[0] * a.w) + GAP, y: Math.round(R[1] * H) + GAP, w: Math.round(R[2] * a.w) - GAP * 2, h: Math.round(R[3] * H) - GAP * 2 };
}
function toggleZoom(w, force) {
  if (w.zoomed && !force) { Object.assign(w.el.style, w.prev); w.zoomed = false; }
  else { saveNormal(w); w.tiled = null; w.el.classList.remove('tiled'); setRect(w, zoneRect('fill')); w.zoomed = true; }
  w.el.classList.toggle('zoomed', w.zoomed);
  if (!w.zoomed) clampWin(w);
  rememberGeo(w); focusWin(w);
}
function tileWin(w, z) {
  if (z === 'fill') { if (!w.zoomed) toggleZoom(w); return; }
  if (w.zoomed) { w.zoomed = false; w.el.classList.remove('zoomed'); }
  saveNormal(w);
  w.tiled = z; w.el.classList.add('tiled');
  setRect(w, zoneRect(z));
  focusWin(w);
}
function untile(w) { if (!w.tiled) return; w.tiled = null; w.el.classList.remove('tiled'); if (w.prev) { w.el.style.width = w.prev.width; w.el.style.height = w.prev.height; } }
function clampWin(w) {
  if (w.zoomed || w.tiled) return;
  const a = area(), el = w.el, app = APPS[w.app];
  const width = Math.max(Math.min(app.minW || 300, a.w), Math.min(el.offsetWidth, a.w));
  const height = Math.max(Math.min(app.minH || 200, a.h), Math.min(el.offsetHeight, a.h));
  el.style.width = width + 'px'; el.style.height = height + 'px';
  el.style.left = Math.max(0, Math.min(parseFloat(el.style.left) || 0, a.w - width)) + 'px';
  el.style.top = Math.max(0, Math.min(parseFloat(el.style.top) || 0, a.h - height)) + 'px';
}
addEventListener('resize', () => wins.forEach(w => { if (w.tiled) setRect(w, zoneRect(w.tiled)); else if (w.zoomed) setRect(w, zoneRect('fill')); clampWin(w); }));
function edgeZone(x, y) {
  const a = area();
  if (y <= 1) return 'fill';
  if (x <= 2) return y < 120 ? 'tl' : y > a.h - dockReserve() - 60 ? 'bl' : 'left';
  if (x >= a.w - 3) return y < 120 ? 'tr' : y > a.h - dockReserve() - 60 ? 'br' : 'right';
  return null;
}
function showPreview(z) {
  const p = $('tile-preview');
  if (!z) { p.classList.remove('on'); return; }
  const r = zoneRect(z), top = layer().getBoundingClientRect().top;
  Object.assign(p.style, { left: r.x + 'px', top: r.y + top + 'px', width: r.w + 'px', height: r.h + 'px' });
  p.classList.add('on');
}
function enableDrag(w, tb) {
  tb.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest('.lights, .w-tools button, .w-tools input, .w-tools .b-tab')) return;
    const el = w.el, sx = e.clientX, sy = e.clientY, top = layer().getBoundingClientRect().top;
    let dx = sx - el.offsetLeft, dy = sy - el.offsetTop, started = false, zone = null;
    tb.setPointerCapture(e.pointerId);
    const move = ev => {
      if (!started) {
        if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) < 5) return;
        started = true; document.body.classList.add('dragging'); hideTileMenu();
        if (w.zoomed || w.tiled) {
          const ratio = (sx - el.offsetLeft) / el.offsetWidth;
          if (w.zoomed) { w.zoomed = false; el.classList.remove('zoomed'); el.style.width = w.prev.width; el.style.height = w.prev.height; } else untile(w);
          el.style.left = (sx - el.offsetWidth * ratio) + 'px'; el.style.top = Math.max(0, sy - top - 20) + 'px';
          dx = sx - el.offsetLeft; dy = sy - el.offsetTop;
        }
      }
      el.style.left = (ev.clientX - dx) + 'px'; el.style.top = (ev.clientY - dy) + 'px';
      clampWin(w);
      zone = edgeZone(ev.clientX, ev.clientY - top);
      showPreview(zone);
    };
    const up = () => {
      tb.removeEventListener('pointermove', move); tb.removeEventListener('pointerup', up); tb.removeEventListener('pointercancel', up);
      document.body.classList.remove('dragging'); showPreview(null);
      if (started && zone) tileWin(w, zone);
      if (started) rememberGeo(w);
    };
    tb.addEventListener('pointermove', move); tb.addEventListener('pointerup', up); tb.addEventListener('pointercancel', up);
  });
}
function enableResize(w, h) {
  h.addEventListener('pointerdown', e => {
    if (e.button !== 0 || w.zoomed) return;
    e.stopPropagation(); untile(w);
    const el = w.el, dir = h.dataset.rz, a = area(), app = APPS[w.app];
    const s0 = { x: e.clientX, y: e.clientY, l: el.offsetLeft, t: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
    const minW = app.minW || 300, minH = app.minH || 200;
    h.setPointerCapture(e.pointerId); document.body.classList.add('dragging');
    const move = ev => {
      const dx = ev.clientX - s0.x, dy = ev.clientY - s0.y;
      let { l, t, w: ww, h: hh } = s0;
      if (dir.includes('e')) ww = Math.min(a.w - l, Math.max(minW, s0.w + dx));
      if (dir.includes('s')) hh = Math.min(a.h - t, Math.max(minH, s0.h + dy));
      if (dir.includes('w')) { const nl = Math.max(0, Math.min(s0.l + s0.w - minW, s0.l + dx)); ww = s0.w + s0.l - nl; l = nl; }
      if (dir.includes('n')) { const nt = Math.max(0, Math.min(s0.t + s0.h - minH, s0.t + dy)); hh = s0.h + s0.t - nt; t = nt; }
      setRect(w, { x: l, y: t, w: ww, h: hh });
    };
    const up = () => { h.removeEventListener('pointermove', move); h.removeEventListener('pointerup', up); document.body.classList.remove('dragging'); clampWin(w); rememberGeo(w); };
    h.addEventListener('pointermove', move); h.addEventListener('pointerup', up);
  });
}
// Меню раскладки при наведении на зелёную кнопку
let tileTimer = null;
function bindTileMenu(w, btn) {
  btn.addEventListener('mouseenter', () => { clearTimeout(tileTimer); tileTimer = setTimeout(() => {
    const r = btn.getBoundingClientRect();
    showMenu(r.left - 4, r.bottom + 6, [
      { label: 'Заполнить', key: 'Ctrl+Ф', action: () => tileWin(w, 'fill') },
      { sep: true },
      { label: 'Слева', action: () => tileWin(w, 'left') }, { label: 'Справа', action: () => tileWin(w, 'right') },
      { label: 'Сверху', action: () => tileWin(w, 'top') }, { label: 'Снизу', action: () => tileWin(w, 'bottom') },
      { sep: true },
      { label: 'Четверти', sub: [['tl', 'Слева сверху'], ['tr', 'Справа сверху'], ['bl', 'Слева снизу'], ['br', 'Справа снизу']].map(([z, n]) => ({ label: n, action: () => tileWin(w, z) })) },
      ...(w.zoomed || w.tiled ? [{ sep: true }, { label: 'Вернуть прежний размер', action: () => { if (w.zoomed) toggleZoom(w); else { untile(w); if (w.prev) Object.assign(w.el.style, w.prev); clampWin(w); } } }] : []),
    ], { tile: true });
  }, 600); });
  btn.addEventListener('mouseleave', () => clearTimeout(tileTimer));
  btn.addEventListener('click', () => clearTimeout(tileTimer));
}
function hideTileMenu() { document.querySelectorAll('.menu[data-tile]').forEach(m => m.remove()); }

addEventListener('blur', () => setTimeout(() => {
  const f = document.activeElement;
  if (f && f.tagName === 'IFRAME') { closePanels(); const w = wins.find(x => x.el.contains(f)); if (w && w !== activeWin) focusWin(w); }
}, 0));

// Лист-диалог, выезжающий из заголовка окна (вместо alert/confirm)
function sheet(w, { title, text, buttons, input, icon: ic }) {
  return new Promise(resolve => {
    const back = document.createElement('div');
    back.className = 'sheet-back';
    back.innerHTML = '<div class="sheet" role="alertdialog"><div class="s-ic">' + icon(ic || APPS[w.app].icon) + '</div><h3></h3><p></p>' + (input !== undefined ? '<input class="field">' : '') + '<div class="s-btns">' +
      buttons.map((b, i) => '<button class="btn' + (i === 0 ? ' accent' : '') + '" data-i="' + i + '">' + esc(b) + '</button>').join('') + '</div></div>';
    back.querySelector('h3').textContent = title; back.querySelector('p').textContent = text || '';
    if (w.app && APPS[w.app].slim) back.style.top = '38px';
    w.el.appendChild(back);
    const inp = back.querySelector('input');
    if (inp) { inp.value = input; inp.focus(); inp.select(); } else back.querySelector('.btn').focus();
    const done = i => { back.remove(); resolve(inp ? (i === 0 ? inp.value : null) : i); };
    back.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) done(+b.dataset.i); });
    back.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') done(buttons.length - 1); if (e.key === 'Enter' && inp) done(0); });
  });
}

// ================= Меню (выпадающие и контекстные) =================
function showMenu(x, y, items, opts = {}) {
  hideMenu();
  const m = document.createElement('div');
  m.className = 'menu'; m.setAttribute('role', 'menu');
  if (opts.tile) m.dataset.tile = '1';
  const render = (box, list) => {
    list.forEach(it => {
      if (it.sep) { box.insertAdjacentHTML('beforeend', '<div class="msep"></div>'); return; }
      const b = document.createElement('button');
      b.className = 'mi'; b.setAttribute('role', 'menuitem'); b.disabled = !!it.disabled;
      b.innerHTML = '<span class="mi-ck">' + (it.checked ? '✓' : '') + '</span><span>' + esc(it.label) + '</span>' + (it.key ? '<span class="mi-key">' + it.key + '</span>' : '') + (it.sub ? '<span class="mi-arrow">›</span>' : '');
      if (it.sub) {
        b.addEventListener('mouseenter', () => {
          document.querySelectorAll('.menu.sub').forEach(s => s.remove());
          box.querySelectorAll('.sub-open').forEach(s => s.classList.remove('sub-open'));
          b.classList.add('sub-open');
          const s = document.createElement('div'); s.className = 'menu sub';
          render(s, it.sub); document.body.appendChild(s);
          const r = b.getBoundingClientRect();
          s.style.left = (r.right + s.offsetWidth > innerWidth ? r.left - s.offsetWidth : r.right + 2) + 'px';
          s.style.top = Math.min(r.top - 5, innerHeight - s.offsetHeight - 4) + 'px';
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
  m.style.top = Math.max(4, Math.min(y, innerHeight - m.offsetHeight - 4)) + 'px';
  return m;
}
function hideMenu() { document.querySelectorAll('.menu').forEach(m => m.remove()); document.querySelectorAll('.mb-item.open').forEach(b => b.classList.remove('open')); }
document.addEventListener('pointerdown', e => { if (!e.target.closest('.menu') && !e.target.closest('.mb-item')) hideMenu(); });
document.addEventListener('contextmenu', e => { if (!e.target.closest('input, textarea, .term')) e.preventDefault(); });

// ================= Строка меню =================
function appMenus(w) {
  const app = w ? APPS[w.app] : APPS.finder, id = w ? w.app : 'finder';
  const extra = w && app.menus ? app.menus(w) : {};
  const menus = {};
  menus[app.title] = [{ label: 'О программе «' + app.title + '»', action: () => aboutApp(id) }, { sep: true },
    { label: 'Системные настройки…', key: 'Ctrl+,', action: () => openApp('settings') }, { sep: true },
    { label: 'Скрыть «' + app.title + '»', key: 'Ctrl+H', disabled: !w, action: () => wins.filter(x => x.app === id).forEach(minimizeWin) },
    { label: 'Завершить «' + app.title + '»', key: 'Ctrl+Q', disabled: !w, action: () => quitApp(id) }];
  menus['Файл'] = [...(extra['Файл'] || []), ...(extra['Файл'] ? [{ sep: true }] : []), { label: 'Новое окно', key: 'Ctrl+N', disabled: !app.multi && !!w, action: () => openApp(id) }, { label: 'Закрыть окно', key: 'Ctrl+W', disabled: !w, action: () => closeWin(w) }];
  if (extra['Правка']) menus['Правка'] = extra['Правка'];
  menus['Вид'] = [...(extra['Вид'] || []), ...(extra['Вид'] ? [{ sep: true }] : []), { label: 'Все окна (Mission Control)', key: 'F3', action: showMission }, { label: 'Launchpad', key: 'F4', action: showLaunchpad }];
  menus['Окно'] = [{ label: 'Свернуть', key: 'Ctrl+M', disabled: !w, action: () => minimizeWin(w) }, { label: 'Заполнить', disabled: !w, action: () => tileWin(w, 'fill') },
    { label: 'Переместить и изменить размер', disabled: !w, sub: [['left', 'Слева'], ['right', 'Справа'], ['top', 'Сверху'], ['bottom', 'Снизу'], ['tl', 'Слева сверху'], ['tr', 'Справа сверху'], ['bl', 'Слева снизу'], ['br', 'Справа снизу']].map(([z, n]) => ({ label: n, action: () => tileWin(w, z) })) },
    { sep: true }, ...wins.map(x => ({ label: x.title, checked: x === w, action: () => focusWin(x) }))];
  menus['Справка'] = [{ label: 'Горячие клавиши', action: () => openApp('browser', 'about:keys') }, { label: 'О «Тахо»', action: () => aboutApp() }];
  return menus;
}
function renderMenubar() {
  const w = activeWin, app = w ? APPS[w.app] : APPS.finder;
  $('mb-app').textContent = app.title;
  const names = Object.keys(appMenus(w)).slice(1);
  $('mb-menus').innerHTML = names.map(n => '<button class="mb-item" data-mb="' + esc(n) + '">' + esc(n) + '</button>').join('');
}
function openMbMenu(btn, items) {
  const was = btn.classList.contains('open');
  hideMenu(); closePanels();
  if (was) return;
  btn.classList.add('open');
  const r = btn.getBoundingClientRect();
  showMenu(r.left, r.bottom + 4, items);
}
$('menubar').addEventListener('click', e => {
  const b = e.target.closest('.mb-item'); if (!b) return;
  if (b.id === 'mb-mark') openMbMenu(b, [
    { label: 'Об этом компьютере', action: () => aboutApp() }, { sep: true },
    { label: 'Системные настройки…', action: () => openApp('settings') }, { label: 'Недавние файлы', sub: RECENT.filter(p => FS.has(p)).length ? RECENT.filter(p => FS.has(p)).map(p => ({ label: baseName(p), action: () => openPath(p) })) : [{ label: 'Нет недавних', disabled: true }] },
    { sep: true }, { label: 'Принудительно завершить…', disabled: !activeWin, action: () => activeWin && quitApp(activeWin.app) }, { sep: true },
    { label: 'Режим сна', action: sleepScreen }, { label: 'Перезагрузить…', action: restartShell }, { sep: true },
    { label: 'Заблокировать экран', key: 'Ctrl+Ctrl+Q', action: lockScreen }]);
  else if (b.id === 'mb-app') openMbMenu(b, appMenus(activeWin)[APPS[activeWin ? activeWin.app : 'finder'].title]);
  else if (b.dataset.mb) openMbMenu(b, appMenus(activeWin)[b.dataset.mb]);
  else if (b.id === 'mb-cc') togglePanel('cc', b);
  else if (b.id === 'mb-clock') togglePanel('nc', b, () => { renderNotifs(); renderWidgets(); });
  else if (b.id === 'mb-search') toggleSpotlight();
  else if (b.id === 'mb-wifi') { openMbMenu(b, [{ label: 'Wi-Fi', checked: S.wifi, action: () => setS({ wifi: !S.wifi }) }, { sep: true }, { label: S.wifi ? 'Домашняя сеть (условно)' : 'Wi-Fi выключен', disabled: true }, { sep: true }, { label: 'Настройки сети…', action: () => openApp('settings', 'network') }]); }
  else if (b.id === 'mb-bat') openMbMenu(b, [{ label: 'Аккумулятор: 84% (условно)', disabled: true }, { label: 'Настройки аккумулятора…', action: () => openApp('settings', 'display') }]);
});
$('menubar').addEventListener('mouseover', e => {
  // как в системе: если одно меню открыто, наведение открывает соседнее
  const b = e.target.closest('.mb-item[data-mb], #mb-app, #mb-mark');
  if (!b || b.classList.contains('open') || !document.querySelector('#menubar .mb-item.open')) return;
  if (!document.querySelector('#mb-left .mb-item.open')) return;
  b.click();
});
function aboutApp(id) {
  const w = openApp('settings', 'about');
  if (id && w) notify({ app: id, title: APPS[id].title, body: 'Встроенная программа «Тахо». Фан-концепт интерфейса, не связан с Microsoft/Apple/Samsung.' });
}

// ================= Dock =================
const DOCK_PINNED = ['finder', 'launchpad', 'browser', 'textedit', 'photos', 'music', 'calculator', 'clock', 'terminal', 'settings'];
function renderDock() {
  const running = [...new Set(wins.map(w => w.app))];
  const ids = DOCK_PINNED.concat(running.filter(a => !DOCK_PINNED.includes(a)));
  const mins = wins.filter(w => w.min);
  $('dock').innerHTML = ids.map(id => '<button class="d-item' + (running.includes(id) ? ' running' : '') + '" data-app="' + id + '" data-tip="' + esc(id === 'launchpad' ? 'Launchpad' : APPS[id].title) + '" aria-label="' + esc(id === 'launchpad' ? 'Launchpad' : APPS[id].title) + '"><span class="ti">' + icon(id === 'launchpad' ? 'launchpad' : APPS[id].icon) + '</span></button>').join('') +
    '<span class="d-sep"></span>' + mins.map(w => '<button class="d-item d-mini" data-mini="' + w.id + '" data-tip="' + esc(w.title) + '" aria-label="' + esc(w.title) + '"><span class="ti">' + icon(APPS[w.app].icon) + '</span></button>').join('') +
    '<button class="d-item" data-app="trash" data-tip="Корзина" aria-label="Корзина" data-drop="__trash"><span class="ti">' + icon(TRASH.length ? 'trashFull' : 'trash') + '</span></button>';
}
function bounceDock(id) { const b = document.querySelector('#dock [data-app="' + id + '"]'); if (b && S.animations) { b.classList.add('bounce'); setTimeout(() => b.classList.remove('bounce'), 700); } }
$('dock').addEventListener('click', e => {
  const b = e.target.closest('.d-item'); if (!b) return;
  closePanels();
  if (b.dataset.mini) { const w = wins.find(x => x.id === b.dataset.mini); if (w) focusWin(w); return; }
  const id = b.dataset.app;
  if (id === 'launchpad') { showLaunchpad(); return; }
  if (id === 'trash') { openApp('finder', '__trash'); return; }
  const list = wins.filter(w => w.app === id);
  if (!list.length) { openApp(id); return; }
  const vis = list.filter(w => !w.min);
  focusWin(vis.length ? vis[vis.length - 1] : list[list.length - 1]);
});
$('dock').addEventListener('contextmenu', e => {
  const b = e.target.closest('.d-item[data-app]'); if (!b) return;
  e.preventDefault();
  const id = b.dataset.app, r = b.getBoundingClientRect();
  if (id === 'trash') { const m = showMenu(r.left, r.top, [{ label: 'Открыть', action: () => openApp('finder', '__trash') }, { label: 'Очистить Корзину', disabled: !TRASH.length, action: emptyTrash }]); m.style.top = r.top - m.offsetHeight - 8 + 'px'; return; }
  if (id === 'launchpad') return;
  const list = wins.filter(w => w.app === id);
  const m = showMenu(r.left, r.top, [...list.map(w => ({ label: w.title, action: () => focusWin(w) })), ...(list.length ? [{ sep: true }] : []),
    { label: 'Новое окно', disabled: !APPS[id].multi && !!list.length, action: () => openApp(id) },
    ...(list.length ? [{ label: 'Скрыть', action: () => list.forEach(minimizeWin) }, { label: 'Завершить', action: () => quitApp(id) }] : [{ label: 'Открыть', action: () => openApp(id) }])]);
  m.style.top = r.top - m.offsetHeight - 8 + 'px';
});
// Увеличение значков под курсором
$('dock').addEventListener('mousemove', e => {
  if (!S.magnify) return;
  $('dock').querySelectorAll('.d-item').forEach(b => {
    const r = b.getBoundingClientRect(), d = Math.abs(e.clientX - (r.left + r.width / 2));
    const k = 1 + 0.55 * Math.max(0, 1 - d / (S.dockSize * 2.2));
    b.style.width = b.style.height = S.dockSize * k + 'px';
  });
});
$('dock').addEventListener('mouseleave', () => $('dock').querySelectorAll('.d-item').forEach(b => { b.style.width = b.style.height = ''; }));
// Подсказки над Dock
let tipEl = null;
document.addEventListener('mouseover', e => {
  const b = e.target.closest('[data-tip]');
  if (!b) { if (tipEl) { tipEl.remove(); tipEl = null; } return; }
  if (tipEl && tipEl.dataset.for === b.dataset.tip) return;
  if (tipEl) tipEl.remove();
  tipEl = document.createElement('div'); tipEl.className = 'd-tip glass glass-strong'; tipEl.textContent = b.dataset.tip; tipEl.dataset.for = b.dataset.tip;
  document.body.appendChild(tipEl);
  const r = b.getBoundingClientRect();
  tipEl.style.left = Math.max(4, Math.min(r.left + r.width / 2 - tipEl.offsetWidth / 2, innerWidth - tipEl.offsetWidth - 4)) + 'px';
  tipEl.style.top = r.top - tipEl.offsetHeight - 12 + 'px';
});
document.addEventListener('pointerdown', () => { if (tipEl) { tipEl.remove(); tipEl = null; } }, true);

// ================= Панели: пункт управления, центр уведомлений =================
const PANELS = ['cc', 'nc'];
function closePanels() {
  PANELS.forEach(p => $(p).classList.remove('open'));
  document.querySelectorAll('#menubar .mb-item.open').forEach(b => b.classList.remove('open'));
  hideSpotlight(); hideLaunchpad(); hideMission();
}
function togglePanel(id, btn, onOpen) {
  const was = $(id).classList.contains('open');
  hideMenu(); closePanels();
  if (!was) { $(id).classList.add('open'); btn && btn.classList.add('open'); onOpen && onOpen(); }
}
function renderCC() {
  const nowT = typeof TRACKS !== 'undefined' && player.idx >= 0 ? TRACKS[player.idx] : null;
  $('cc').innerHTML =
    '<div class="cc-tile glass"><div class="cc-row"><button class="cc-btn' + (S.wifi ? ' on' : '') + '" data-cc="wifi" aria-label="Wi-Fi" aria-pressed="' + S.wifi + '">' + SI.wifi + '</button><div><b>Wi-Fi</b><small>' + (S.wifi ? 'Домашняя сеть' : 'Выкл.') + '</small></div></div>' +
    '<div class="cc-row"><button class="cc-btn' + (S.bt ? ' on' : '') + '" data-cc="bt" aria-label="Bluetooth" aria-pressed="' + S.bt + '">' + SI.bt + '</button><div><b>Bluetooth</b><small>' + (S.bt ? 'Вкл.' : 'Выкл.') + '</small></div></div></div>' +
    '<div style="display:grid;gap:10px"><div class="cc-tile glass"><div class="cc-row"><button class="cc-btn' + (S.focus ? ' on' : '') + '" data-cc="focus" aria-label="Не беспокоить" aria-pressed="' + S.focus + '">' + SI.moon + '</button><div><b>Не беспокоить</b><small>' + (S.focus ? 'Вкл.' : 'Выкл.') + '</small></div></div></div>' +
    '<div class="cc-tile glass"><div class="cc-row"><button class="cc-btn' + (S.theme === 'dark' ? ' on' : '') + '" data-cc="dark" aria-label="Тёмное оформление" aria-pressed="' + (S.theme === 'dark') + '">' + SI.brush + '</button><div><b>Тёмное</b><small>' + (S.theme === 'dark' ? 'Вкл.' : 'Выкл.') + '</small></div></div></div></div>' +
    '<div class="cc-tile glass wide"><span class="t-label">Дисплей</span><div class="cc-row">' + SI.sun.replace('<svg', '<svg width="14" height="14"') + '<input type="range" min="30" max="100" value="' + S.brightness + '" id="cc-bright" aria-label="Яркость"><button class="cc-btn' + (S.night ? ' on' : '') + '" data-cc="night" title="Night Shift" aria-label="Тёплые цвета" aria-pressed="' + S.night + '">' + SI.moon + '</button></div></div>' +
    '<div class="cc-tile glass wide"><span class="t-label">Звук</span><div class="cc-row">' + (S.muted || !S.volume ? SI.mute : SI.vol).replace('<svg', '<svg width="14" height="14"') + '<input type="range" min="0" max="100" value="' + (S.muted ? 0 : S.volume) + '" id="cc-vol" aria-label="Громкость"></div></div>' +
    '<div class="cc-tile glass wide"><div class="cc-row"><span style="width:38px;height:38px;border-radius:8px;flex-shrink:0;background:' + (nowT ? 'linear-gradient(135deg,hsl(' + nowT.key * 30 + ',80%,60%),hsl(' + (nowT.key * 30 + 60) + ',70%,40%))' : 'rgba(127,127,127,0.3)') + '"></span><div style="flex:1;min-width:0"><b>' + (nowT ? esc(nowT.title) : 'Музыка') + '</b><small>' + (nowT ? esc(nowT.artist) : 'Ничего не играет') + '</small></div>' +
    '<button class="cc-btn" data-cc="play" aria-label="' + (typeof player !== 'undefined' && player.playing ? 'Пауза' : 'Играть') + '">' + (typeof player !== 'undefined' && player.playing ? SI.pause : SI.play) + '</button><button class="cc-btn" data-cc="next" aria-label="Следующий">' + SI.next + '</button></div></div>';
}
$('cc').addEventListener('click', e => {
  const b = e.target.closest('[data-cc]'); if (!b) return;
  const k = b.dataset.cc;
  if (k === 'dark') setS({ theme: S.theme === 'dark' ? 'light' : 'dark' });
  else if (k === 'play') { if (player.playing) pPause(); else pPlay(player.idx < 0 ? 0 : player.idx, player.offset); }
  else if (k === 'next') pSkip(1);
  else setS({ [k]: !S[k] });
  renderCC();
});
$('cc').addEventListener('input', e => {
  if (e.target.id === 'cc-bright') setS({ brightness: +e.target.value });
  if (e.target.id === 'cc-vol') setS({ volume: +e.target.value, muted: +e.target.value === 0 });
});
on('settings', () => { if ($('cc').classList.contains('open') && !document.activeElement.closest('#cc')) renderCC(); });
on('player', () => { if ($('cc').classList.contains('open')) renderCC(); });
$('mb-cc').addEventListener('click', renderCC, true);
function renderWidgets() {
  const now = new Date(), first = new Date(now.getFullYear(), now.getMonth(), 1), start = new Date(first); start.setDate(1 - (first.getDay() + 6) % 7);
  let cal = ['П', 'В', 'С', 'Ч', 'П', 'С', 'В'].map(d => '<div class="dow">' + d + '</div>').join('');
  for (let i = 0; i < 42; i++) { const d = new Date(start); d.setDate(start.getDate() + i); cal += '<div class="d' + (d.getMonth() !== now.getMonth() ? ' other' : '') + (d.toDateString() === now.toDateString() ? ' today' : '') + '">' + d.getDate() + '</div>'; }
  $('nc-widgets').innerHTML = '<div class="widget glass glass-strong"><h4>' + MONTHS[now.getMonth()] + '</h4><div class="wd-cal" id="wd-cal">' + cal + '</div></div>' +
    '<div class="widget glass wd-weather"><b>Лиссабон</b><div class="big">17°</div><small>Облачно · демо</small></div>';
}
$('nc').addEventListener('click', e => {
  const x = e.target.closest('[data-nx]'); if (x) { e.stopPropagation(); NOTES = NOTES.filter(n => n.id !== x.dataset.nx); renderNotifs(); return; }
  const it = e.target.closest('[data-n]'); if (it) { const n = NOTES.find(k => k.id === it.dataset.n); NOTES = NOTES.filter(k => k !== n); renderNotifs(); if (n && APPS[n.app]) openApp(n.app); }
});
$('nc-clear').addEventListener('click', () => { NOTES = []; renderNotifs(); });
document.addEventListener('pointerdown', e => {
  if (!e.target.closest('.panel, #menubar, .menu, #spotlight, #launchpad, #mission')) closePanels();
});

// ================= Поиск (Spotlight) =================
function spotResults(q) {
  const apps = Object.keys(APPS).filter(id => APPS[id].title.toLowerCase().includes(q));
  const files = [...FS.values()].filter(e => e.path && baseName(e.path).toLowerCase().includes(q)).slice(0, 8);
  const sets = SETTINGS_PAGES.filter(p => p[1].toLowerCase().includes(q));
  let html = '';
  if (apps.length) html += '<div class="sp-sec">Программы</div>' + apps.map(id => '<button class="sp-item" data-open-app="' + id + '">' + icon(APPS[id].icon) + '<span>' + esc(APPS[id].title) + '</span><small>Программа</small></button>').join('');
  if (sets.length) html += '<div class="sp-sec">Системные настройки</div>' + sets.map(p => '<button class="sp-item" data-open-settings="' + p[0] + '">' + icon('settings') + '<span>' + p[1] + '</span><small>Настройки</small></button>').join('');
  if (files.length) html += '<div class="sp-sec">Документы и папки</div>' + files.map(e => '<button class="sp-item" data-open-file="' + esc(e.path) + '">' + fileIcon(e.path) + '<span>' + esc(baseName(e.path)) + '</span><small>' + esc(parentOf(e.path) || 'Домашняя папка') + '</small></button>').join('');
  if (!html) html = '<div class="empty" style="padding:20px">Нет результатов для «' + esc(q) + '»</div>';
  return html;
}
function toggleSpotlight() { if ($('spotlight').classList.contains('open')) hideSpotlight(); else { hideMenu(); closePanels(); $('spotlight').classList.add('open'); $('sp-q').value = ''; $('sp-res').innerHTML = ''; $('sp-q').focus(); } }
function hideSpotlight() { $('spotlight').classList.remove('open'); }
$('sp-q').addEventListener('input', () => { const q = $('sp-q').value.trim().toLowerCase(); $('sp-res').innerHTML = q ? spotResults(q) : ''; const f = $('sp-res').querySelector('.sp-item'); if (f) f.classList.add('sel'); });
$('sp-q').addEventListener('keydown', e => {
  const items = [...$('sp-res').querySelectorAll('.sp-item')], i = items.findIndex(x => x.classList.contains('sel'));
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!items.length) return; items.forEach(x => x.classList.remove('sel')); items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].classList.add('sel'); }
  if (e.key === 'Enter' && items[Math.max(0, i)]) items[Math.max(0, i)].click();
});
document.addEventListener('click', e => {
  const a = e.target.closest('[data-open-app]'); if (a) { hideSpotlight(); hideLaunchpad(); openApp(a.dataset.openApp); return; }
  const f = e.target.closest('[data-open-file]'); if (f) { hideSpotlight(); openPath(f.dataset.openFile); return; }
  const s = e.target.closest('[data-open-settings]'); if (s) { hideSpotlight(); openApp('settings', s.dataset.openSettings); }
});

// ================= Launchpad и Mission Control =================
function showLaunchpad() {
  closePanels(); hideMenu();
  $('launchpad').classList.add('open'); $('lp-q').value = ''; renderLaunchpad(); $('lp-q').focus();
}
function hideLaunchpad() { $('launchpad').classList.remove('open'); }
function renderLaunchpad() {
  const q = $('lp-q').value.trim().toLowerCase();
  const ids = Object.keys(APPS).filter(id => APPS[id].title.toLowerCase().includes(q));
  $('lp-grid').innerHTML = ids.map((id, i) => '<button class="lp-app" data-open-app="' + id + '" style="animation-delay:' + i * 12 + 'ms"><span class="ti">' + icon(APPS[id].icon) + '</span>' + esc(APPS[id].title) + '</button>').join('') || '<div style="color:#fff;grid-column:1/-1;text-align:center">Ничего не найдено</div>';
}
$('lp-q').addEventListener('input', renderLaunchpad);
$('lp-q').addEventListener('keydown', e => { if (e.key === 'Enter') { const f = $('lp-grid').querySelector('[data-open-app]'); if (f) f.click(); } });
$('launchpad').addEventListener('click', e => { if (e.target === $('launchpad') || e.target === $('lp-grid')) hideLaunchpad(); });
function showMission() {
  closePanels(); hideMenu();
  const mc = $('mission'), grid = $('mc-grid');
  const list = wins.filter(w => !w.min);
  mc.classList.add('open');
  const wp = $('wallpaper').style;
  Object.assign($('mc-space').style, { background: wp.background || '', backgroundImage: wp.backgroundImage, backgroundSize: 'cover', backgroundPosition: 'center' });
  if (!list.length) { grid.innerHTML = '<div class="mc-empty">Нет открытых окон</div>'; return; }
  const cols = Math.ceil(Math.sqrt(list.length)), rows = Math.ceil(list.length / cols);
  const gw = grid.clientWidth, gh = grid.clientHeight;
  const cw = (gw - (cols - 1) * 36) / cols, ch = (gh - (rows - 1) * 36) / rows - 30;
  grid.innerHTML = '';
  list.forEach((w, i) => {
    const W = w.el.offsetWidth, H = w.el.offsetHeight, k = Math.min(cw / W, ch / H, 0.7);
    const item = document.createElement('div');
    item.className = 'mc-win'; item.dataset.mc = w.id; item.style.animationDelay = i * 30 + 'ms';
    const th = document.createElement('div'); th.className = 'mc-thumb'; th.style.width = W * k + 'px'; th.style.height = H * k + 'px';
    if (w.iframe) th.innerHTML = '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center"><span style="width:64px;height:64px">' + icon(APPS[w.app].icon) + '</span></div>';
    else {
      const c = w.el.cloneNode(true);
      c.removeAttribute('id'); c.querySelectorAll('[id]').forEach(x => x.removeAttribute('id'));
      c.classList.remove('opening', 'inactive', 'minimized'); c.classList.add('mc-clone');
      Object.assign(c.style, { width: W + 'px', height: H + 'px', left: '0', top: '0', transform: 'scale(' + k + ')', zIndex: 'auto' });
      th.appendChild(c);
    }
    item.appendChild(th);
    item.insertAdjacentHTML('beforeend', '<div class="mc-lab">' + icon(APPS[w.app].icon) + '<span></span></div>');
    item.querySelector('.mc-lab span').textContent = w.title;
    grid.appendChild(item);
  });
}
function hideMission() { $('mission').classList.remove('open'); }
$('mission').addEventListener('click', e => {
  const it = e.target.closest('[data-mc]'); hideMission();
  if (it) { const w = wins.find(x => x.id === it.dataset.mc); if (w) focusWin(w); }
});

// ================= Блокировка, сон, перезагрузка =================
function lockScreen() { closePanels(); hideMenu(); updateClock(); $('lock').classList.remove('leaving'); $('lock').classList.add('open'); emit('lock'); }
function unlock() { const l = $('lock'); if (!l.classList.contains('open') || l.classList.contains('leaving')) return; if (S.animations) { l.classList.add('leaving'); setTimeout(() => l.classList.remove('open', 'leaving'), 400); } else l.classList.remove('open'); }
$('lock').addEventListener('click', unlock);
function sleepScreen() { lockScreen(); $('dim').style.opacity = '0.94'; const wake = () => { applySettings(); removeEventListener('keydown', wake, true); removeEventListener('pointerdown', wake, true); }; setTimeout(() => { addEventListener('keydown', wake, true); addEventListener('pointerdown', wake, true); }, 50); }
async function restartShell() {
  for (const w of [...wins].reverse()) { if (!(await closeWin(w))) return; }
  $('boot').classList.remove('hidden');
  const bar = $('boot').querySelector('.bar i'); bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = '';
  setTimeout(() => $('boot').classList.add('hidden'), 1100);
}

// ================= Клавиатура (Ctrl вместо Cmd) =================
document.addEventListener('keydown', e => {
  if ($('lock').classList.contains('open')) { if (!e.ctrlKey && !e.altKey) { e.preventDefault(); unlock(); } return; }
  if (e.ctrlKey && e.code === 'Space') { e.preventDefault(); toggleSpotlight(); return; }
  if (e.key === 'F3' || (e.ctrlKey && e.key === 'ArrowUp')) { e.preventDefault(); $('mission').classList.contains('open') ? hideMission() : showMission(); return; }
  if (e.key === 'F4') { e.preventDefault(); $('launchpad').classList.contains('open') ? hideLaunchpad() : showLaunchpad(); return; }
  if (e.key === 'Escape') {
    const open = PANELS.some(p => $(p).classList.contains('open')) || ['spotlight', 'launchpad', 'mission'].some(p => $(p).classList.contains('open')) || document.querySelector('.menu');
    if (open) { closePanels(); hideMenu(); return; }
  }
  const t = e.target, inField = t.closest && t.closest('input, textarea');
  if (e.ctrlKey && !e.shiftKey && activeWin && !activeWin.el.querySelector('.sheet-back')) {
    if (e.code === 'KeyW') { e.preventDefault(); closeWin(activeWin); return; }
    if (e.code === 'KeyM') { e.preventDefault(); minimizeWin(activeWin); return; }
    if (e.code === 'KeyQ') { e.preventDefault(); quitApp(activeWin.app); return; }
  }
  if (!activeWin || !activeWin.onKey || inField || activeWin.el.querySelector('.sheet-back')) return;
  if (t !== document.body && !activeWin.el.contains(t)) return;
  activeWin.onKey(e);
});

// Вкладка скрыта - анимации и звук на паузе
document.addEventListener('visibilitychange', () => { document.body.classList.toggle('paused', document.hidden); emit('visibility', document.hidden); });
