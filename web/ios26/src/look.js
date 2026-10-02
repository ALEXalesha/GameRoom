// ================================================================
// Вид iOS 26 поверх программ: где стекло, обои и тон стекла, стеклянные часы блокировки,
// пружинное раскрытие программы из значка и сворачивание обратно, жесты за пальцем, «Поиск».
// ================================================================
// для проверок и отладки: движок стекла и обои видны как window.LG и window.Wall
window.LG = LG; window.Wall = Wall;
const REDUCED = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
LG.auto([
  ['#dock', 'dock', { wall: true }],
  ['#home-grid .home-widget', 'widget', { wall: true }],
  ['#home-grid .icon-folder', 'button', { wall: true }],
  ['#home-search', 'button', { wall: true }],
  ['.lock-circle', 'button', { wall: true }],
  ['#lock-notifs .n-card', 'card', { wall: true }],
  // баннер и центр уведомлений лежат над значками и виджетами, а не над одними обоями: подложка по теме, плотная
  ['.banner .n-card', 'card'],
  ['#nc-list .n-card', 'card'],
  ['#control-center .cc-tile.large', 'module'],
  ['#control-center .cc-tile', 'tile'],
  ['#control-center .cc-slider', 'tile'],
  ['.gf-box', 'panel'],
  ['.ios-alert', 'card'],
  ['.is-group', 'card'],
  ['.glass-bar', 'bar'],
  ['.glass-btn', 'button'],
  ['.sp-box', 'panel'],
]);

// координаты внутри экрана телефона без масштаба корпуса
function localBox(el) {
  const s = $('screen'), sr = s.getBoundingClientRect(), k = sr.width / s.offsetWidth || 1, r = el.getBoundingClientRect();
  return { x: (r.left - sr.left) / k, y: (r.top - sr.top) / k, w: r.width / k, h: r.height / k };
}
const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
// светлый или тёмный текст прямо на обоях: тот, у кого худший случай под ним контрастнее
function textTone(cells) {
  if (!cells.length) return 'dark';
  const ls = cells.map(lum), mx = Math.max(...ls), mn = Math.min(...ls);
  return ratio(1, mx) >= ratio(mn, 0.0122) ? 'dark' : 'light';
}

// ===== Стеклянные часы блокировки =====
// Цифры - свои скруглённые знаки (толстая линия с круглыми концами), а не системный шрифт: так часы
// одинаковы на любой машине и похожи на крупные цифры телефона. Буквы - стекло по маске самих букв
// (поле расстояний по маске, те же три текстуры): почти без самозатенения, мягкий блик, лёгкая
// полупрозрачная заливка и подсвеченный фон внутри букв. Светлые или тёмные цифры и сила дымки под
// ними выбираются по обоям так, чтобы контраст на самом неудобном месте был не меньше 5.
const lockGlass = document.createElement('div');
lockGlass.className = 'lock-glass glyph-layer';
lockGlass.dataset.glyphs = 'rounded';
lockGlass.setAttribute('aria-hidden', 'true');
const lockScrim = document.createElement('div');
lockScrim.className = 'lock-scrim';
document.querySelector('.lock-clock').prepend(lockScrim);
document.querySelector('.lock-clock').appendChild(lockGlass);
const FILL_A = 0.6, LIFT = { white: 1.5, dark: 0.5 };
function clockTone(cells) {
  const worst = (white, a) => {
    let w = 99;
    for (const c of cells) {
      const b = white ? c.map((v) => v * (1 - a)) : c.map((v) => v * (1 - a) + 255 * a);
      const inside = b.map((v) => Math.min(255, v * (white ? LIFT.white : LIFT.dark)));
      const f = inside.map((v) => v * (1 - FILL_A) + (white ? 255 : 16) * FILL_A);
      w = Math.min(w, ratio(lum(f), lum(b)));
    }
    return w;
  };
  const find = (white) => { for (let a = 0; a <= 0.9; a += 0.02) if (worst(white, a) >= 5.2) return a; return 0.9; };
  const aw = find(true), ad = find(false);
  return ad + 0.1 < aw ? { white: false, a: ad } : { white: true, a: aw };
}
// контуры цифр в долях высоты знака H; ширина знака 0.56H
function drawDigit(x, ch, L, T, H) {
  const w = H * 0.56, P = (u, v) => [L + u * w, T + v * H];
  const mv = (u, v) => x.moveTo(...P(u, v)), ln = (u, v) => x.lineTo(...P(u, v));
  const bz = (a, b, c, d, e, f) => x.bezierCurveTo(...P(a, b), ...P(c, d), ...P(e, f));
  const ell = (u, v, ru, rv) => { x.moveTo(...P(u + ru, v)); x.ellipse(...P(u, v), ru * w, rv * H, 0, 0, Math.PI * 2); };
  switch (ch) {
    case '0': x.moveTo(L + w, T + w / 2); x.roundRect(L, T, w, H, w / 2); break;
    case '1': mv(0.12, 0.2); ln(0.6, 0); ln(0.6, 1); break;
    case '2': mv(0.02, 0.24); bz(0.06, -0.03, 0.98, -0.04, 0.96, 0.3); bz(0.94, 0.5, 0.4, 0.7, 0.02, 1); ln(1, 1); break;
    case '3': mv(0.04, 0.13); bz(0.25, -0.03, 0.98, -0.02, 0.92, 0.24); bz(0.88, 0.42, 0.6, 0.46, 0.38, 0.47);
      mv(0.38, 0.47); bz(0.75, 0.47, 1.02, 0.6, 1, 0.73); bz(0.98, 1.0, 0.2, 1.04, 0, 0.85); break;
    case '4': mv(0.72, 1); ln(0.72, 0); ln(0, 0.68); ln(1, 0.68); break;
    case '5': mv(0.94, 0); ln(0.18, 0); ln(0.1, 0.45); bz(0.3, 0.36, 1.0, 0.34, 1, 0.68); bz(1.0, 1.02, 0.2, 1.04, 0, 0.86); break;
    case '6': mv(0.86, 0.05); bz(0.5, -0.05, 0, 0.1, 0, 0.66); ell(0.5, 0.69, 0.5, 0.31); break;
    case '7': mv(0, 0); ln(1, 0); ln(0.3, 1); break;
    case '8': ell(0.5, 0.25, 0.42, 0.25); ell(0.5, 0.72, 0.5, 0.28); break;
    case '9': x.save(); x.translate(L + w, T + H); x.rotate(Math.PI); drawDigit(x, '6', 0, 0, H); x.restore(); break;
  }
}
function drawClock(x, text, cw, ch) {
  const H = ch * 0.62, sw = H * 0.21, adv = H * 0.56 + sw + H * 0.09, colon = H * 0.4;
  const total = [...text].reduce((a, c) => a + (c === ':' ? colon : adv), 0) - (sw + H * 0.09) + sw;
  let left = (cw - total) / 2 + sw / 2;
  const T = (ch - H) / 2;
  x.lineWidth = sw; x.lineCap = 'round'; x.lineJoin = 'round';
  x.strokeStyle = x.fillStyle = '#fff';
  for (const c of text) {
    if (c === ':') {
      const cx = left - sw / 2 + colon / 2 - H * 0.06;
      for (const v of [0.3, 0.76]) { x.beginPath(); x.arc(cx, T + v * H, H * 0.11, 0, Math.PI * 2); x.fill(); }
      left += colon;
      continue;
    }
    x.beginPath(); drawDigit(x, c, left, T, H); x.stroke();
    left += adv;
  }
}
let lockKey = '', toneKey = '', clockT = null;
function lockTone() {
  // тон часов и виджетов - только когда сменились обои или тема, а не каждую секунду
  const t = $('lock-time'), d = $('lock-date'), key = Wall.key + '|' + t.offsetWidth + 'x' + t.offsetHeight;
  if (key === toneKey && clockT) return clockT;
  toneKey = key;
  const box = LG.layoutRect(t), dbox = LG.layoutRect(d);
  const cells = Wall.sample({ x: box.x + box.w * 0.12, y: box.y + box.h * 0.12, w: box.w * 0.76, h: box.h * 0.76 }).concat(Wall.sample({ x: dbox.x + dbox.w * 0.25, y: dbox.y, w: dbox.w * 0.5, h: dbox.h }));
  clockT = clockTone(cells);
  $('lock-page').classList.toggle('dark-clock', !clockT.white);
  lockScrim.style.background = clockT.white ? 'rgba(0,0,0,' + clockT.a.toFixed(2) + ')' : 'rgba(255,255,255,' + clockT.a.toFixed(2) + ')';
  lockScrim.style.opacity = clockT.a > 0.01 ? '1' : '0';
  document.querySelectorAll('.lock-widgets .widget').forEach((w) => { w.dataset.tone = textTone(Wall.sample(LG.layoutRect(w))); });
  lockKey = '';
  return clockT;
}
function lockClock(force) {
  if (!$('lock-page').classList.contains('active') || !Wall.ready()) return;
  const t = $('lock-time');
  const w = t.offsetWidth, h = t.offsetHeight;
  if (!w || !h) return;
  const tone = lockTone();
  const fill = tone.white ? 'rgba(255,255,255,' + FILL_A + ')' : 'rgba(16,16,22,' + FILL_A + ')';
  const key = [t.textContent, w, h, fill, LG.mode].join('|');
  if (key === lockKey && !force) return;
  lockKey = key;
  Object.assign(lockGlass.style, { left: t.offsetLeft + 'px', top: t.offsetTop + 'px', width: w + 'px', height: h + 'px' });
  const q = Math.min(2, Math.max(1.5, window.devicePixelRatio || 1));
  const cv = document.createElement('canvas'); cv.width = Math.round(w * q); cv.height = Math.round(h * q);
  const x = cv.getContext('2d');
  drawClock(x, t.textContent, cv.width, cv.height);
  const img = x.getImageData(0, 0, cv.width, cv.height).data;
  const alpha = new Uint8Array(cv.width * cv.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = img[i * 4 + 3];
  lockGlass.style.webkitMaskImage = lockGlass.style.maskImage = 'url("' + cv.toDataURL() + '")';
  const g = LG.glyphs(alpha, cv.width, cv.height, w, h, t.textContent + '|' + w + 'x' + h);
  lockGlass.style.backgroundColor = fill;
  if (g) {
    lockGlass.style.backgroundImage = 'url("' + g.spec + '"), url("' + g.shade + '")';
    const bf = 'blur(5px) brightness(' + (tone.white ? LIFT.white : LIFT.dark) + ') saturate(160%) url(#' + g.id + ')';
    lockGlass.style.backdropFilter = lockGlass.style.webkitBackdropFilter = bf;
  } else {
    lockGlass.style.backgroundImage = 'none';
    const bf = 'blur(5px) brightness(' + (tone.white ? LIFT.white : LIFT.dark) + ')';
    lockGlass.style.backdropFilter = lockGlass.style.webkitBackdropFilter = bf;
  }
}
// раз в секунду только сверка текста: новая минута - новые буквы, тон не трогаем
setInterval(() => { if ($('lock-page').classList.contains('active') && !lockKey.startsWith($('lock-time').textContent + '|')) lockClock(false); }, 1000);

// ===== Подписи значков: светлые или тёмные по месту на обоях =====
let labelsKey = '';
function toneLabels() {
  if (!$('home-page').classList.contains('active') || !Wall.ready() || labelsKey === Wall.key) return;
  labelsKey = Wall.key;
  document.querySelectorAll('#home-grid .app-label').forEach((l) => {
    const t = textTone(Wall.sample(LG.layoutRect(l)));
    l.classList.toggle('lbl-dark', t === 'light'); l.classList.toggle('lbl-light', t !== 'light');
  });
}
new MutationObserver(toneLabels).observe($('home-page'), { attributes: true, attributeFilter: ['class'] });

// ===== Миниатюры обоев: рисуются после того, как страница «Обои» построена =====
function paintThumbs() {
  document.querySelectorAll('canvas.wall-th').forEach((c) => { if (c.dataset.done !== Wall.key) { Wall.thumb(c, c.dataset.th); c.dataset.done = Wall.key; } });
}
new MutationObserver(paintThumbs).observe($('app-settings'), { childList: true, subtree: true });

// ===== Обои, тема и тон стекла идут за настройками =====
function syncLook() {
  LG.refresh();   // «Меньше стекла» - без выпечки, обратно - стекло
  Wall.sync();
  LG.retone();
  labelsKey = ''; toneLabels();
  lockClock(false);
  paintThumbs();
  // значок на ползунке темнеет, когда его накрывает белая заливка
  document.querySelectorAll('[data-slider]').forEach((sl) => sl.classList.toggle('lit', S[sl.dataset.slider] > 14));
  // светлые обои: строка состояния и полоска «Домой» темнеют
  const cells = Wall.sample({ x: 0, y: 0, w: 4000, h: 4000 });
  if (cells.length) {
    const L = cells.reduce((a, c) => a + (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255, 0) / cells.length;
    ['home-page', 'lock-page'].forEach((id) => $(id).classList.toggle('wall-light', L > 0.62));
  }
}
on('settings', syncLook);
syncLook();
const showLock1 = showLock;
showLock = function () { showLock1(); requestAnimationFrame(() => lockClock(true)); };
lockClock(true);
// формы домашнего экрана и пункта управления - заранее, пока человек смотрит на блокировку
(window.requestIdleCallback || ((f) => setTimeout(f, 200)))(() => { LG.prewarm($('home-page')); }, { timeout: 800 });

// ===== Пункт управления, центр уведомлений, папка, поиск: пока едут - размытие =====
// пока открыта сплошная панель, стекло дома под ней не считается; возвращается одним шагом, когда панель уехала
let coverTimer = 0;
function syncCovered() {
  const open = $('control-center').classList.contains('open') || $('games-folder').classList.contains('open') || spot.classList.contains('open');
  clearTimeout(coverTimer);
  if (open) $('home-page').classList.add('lg-covered');
  else coverTimer = setTimeout(() => LG.release($('home-page'), 'lg-covered'), 520);
}
new MutationObserver(syncCovered).observe($('control-center'), { attributes: true, attributeFilter: ['class'] });
new MutationObserver(syncCovered).observe($('games-folder'), { attributes: true, attributeFilter: ['class'] });
// под панелью - активная страница (дом или блокировка) и открытая программа
function underPages(ms) { ['home-page', 'lock-page'].forEach((id) => { if ($(id).classList.contains('active')) LG.under($(id), ms); }); if (current && screens[current]) LG.under(screens[current].el, ms); }
const openCC0 = openCC, closeCC0 = closeCC;
openCC = function () { if (!$('control-center').classList.contains('open')) { LG.moving($('control-center'), 620); underPages(620); } openCC0(); updateMusicTile(); };
closeCC = function () { if ($('control-center').classList.contains('open')) { LG.moving($('control-center'), 560); underPages(560); } closeCC0(); };
const openNC0 = openNC, closeNC0 = closeNC;
openNC = function () { LG.moving($('nc'), 560); underPages(560); openNC0(); };
closeNC = function () { if ($('nc').classList.contains('open')) { LG.moving($('nc'), 560); underPages(560); } closeNC0(); };
const notify0 = notify;
notify = function (app, title, body) {
  const n = notify0(app, title, body);
  const b = document.querySelector('.banner:last-of-type');
  if (b && !b.dataset.lgw) { b.dataset.lgw = '1'; LG.moving(b, 600); b.addEventListener('animationstart', (e) => { if (e.animationName === 'bannerOut') LG.moving(b, 400); }); }
  return n;
};
// ползунок тянут - стекло пункта управления размытое, иначе каждый шаг пересчитывает все цепочки
document.querySelectorAll('[data-slider]').forEach((sl) => {
  sl.addEventListener('pointerdown', () => LG.moving($('control-center'), 60000));
  const up = () => LG.moving($('control-center'), 80);
  sl.addEventListener('pointerup', up); sl.addEventListener('pointercancel', up);
});

// ===== Плитка музыки в пункте управления =====
function musicScreen() { const sc = screens.music; if (!sc.inited) { APPS.music.init(sc); sc.inited = true; } return sc; }
function updateMusicTile() {
  const sc = screens.music; if (!sc || !sc.inited) return;
  const t = sc.el.querySelector('.music-title'), st = sc.state ? sc.state() : { playing: false };
  $('ccm-title').textContent = st.playing && t ? t.textContent : (t ? t.textContent : 'Не исполняется');
  document.querySelector('.cc-music .ccm-icon').setAttribute('d', st.playing ? 'M6 4h4v16H6V4zm8 0h4v16h-4V4z' : 'M8 5v14l11-7L8 5z');
}
document.querySelector('.cc-music').addEventListener('click', (e) => {
  e.stopPropagation();
  const b = e.target.closest('[data-cc-music]');
  if (!b) { openApp('music'); return; }
  const btn = musicScreen().el.querySelector('[data-m="' + b.dataset.ccMusic + '"]');
  if (btn) btn.click();
  updateMusicTile();
});

// ===== Пружина: раскрытие программы из значка и сворачивание в него =====
// Кривая считается честной пружиной (жёсткость, затухание) и отдаётся анимации как linear(...)
function spring(k, c) {
  let x = 0, v = 0, t = 0;
  const dt = 1 / 240, xs = [0];
  for (; t < 2; t += dt) {
    v += (k * (1 - x) - c * v) * dt; x += v * dt; xs.push(x);
    if (t > 0.15 && Math.abs(1 - x) < 0.002 && Math.abs(v) < 0.03) break;
  }
  const N = 40, pts = [];
  for (let i = 0; i <= N; i++) pts.push(i === N ? 1 : +xs[Math.round(i / N * (xs.length - 1))].toFixed(4));
  return { easing: 'linear(' + pts.join(', ') + ')', duration: Math.round(xs.length * dt * 1000) };
}
const SPRING_OPEN = spring(300, 28), SPRING_CLOSE = spring(340, 31);
let launchIcon = null;
$('screen').addEventListener('click', (e) => { const a = e.target.closest('[data-app]'); launchIcon = a && a.querySelector('.icon') ? { id: a.dataset.app, el: a.querySelector('.icon'), t: Date.now() } : null; }, true);
function iconFor(id) {
  if (!$('home-page').classList.contains('active')) return null;
  const vis = (el) => el && el.offsetWidth && el.getBoundingClientRect().width > 0 ? el : null;
  if (launchIcon && launchIcon.id === id && Date.now() - launchIcon.t < 1500 && vis(launchIcon.el)) return launchIcon.el;
  return vis(document.querySelector('#home-grid .app-icon[data-app="' + id + '"] .icon')) || vis(document.querySelector('#dock .app-icon[data-app="' + id + '"] .icon')) ||
    (APPS[id] && APPS[id].game ? vis(document.querySelector('#home-grid .app-icon[data-app="games"] .icon')) : null);
}
// кадры «из значка» и «во весь экран»; экран должен быть показан (иначе размер 0 и scale(Infinity))
function zoomFrames(el, ic) {
  const W = el.offsetWidth || $('screen').offsetWidth, H = el.offsetHeight || $('screen').offsetHeight, r = localBox(ic);
  const s = r.w / W, tx = r.x + r.w / 2 - W / 2, ty = r.y + r.h / 2 - H / 2;
  const vis = W * r.h / r.w, iy = Math.max(0, (H - vis) / 2);
  const cr = getComputedStyle(ic).borderTopLeftRadius, rad = (cr.endsWith('%') ? parseFloat(cr) / 100 * r.w : parseFloat(cr)) * 1.25 / s;
  const end = parseFloat(getComputedStyle($('device')).borderTopLeftRadius) || 55;
  return { from: { transform: 'translate(' + tx + 'px, ' + ty + 'px) scale(' + s + ')', clipPath: 'inset(' + iy + 'px 0px round ' + rad + 'px)' },
    to: { transform: 'translate(0px, 0px) scale(1)', clipPath: 'inset(0px 0px round ' + end + 'px)' }, iy, vis };
}
function launchCover(el, ic, iy, vis) {
  const c = document.createElement('div');
  c.className = 'launch-cover';
  c.style.top = iy + 'px'; c.style.height = vis + 'px';
  const copy = ic.cloneNode(true); copy.removeAttribute('id');
  c.appendChild(copy);
  el.appendChild(c);
  return c;
}
const openApp2 = openApp;
openApp = function (id, arg) {
  const sc = screens[id];
  if (sc && sc.el.classList.contains('closing')) { sc.el.getAnimations().forEach((a) => a.cancel()); sc.el.classList.remove('closing'); sc.el.querySelectorAll('.launch-cover').forEach((c) => c.remove()); }
  const ic = id !== 'games' && sc && !REDUCED ? iconFor(id) : null;
  // значок мерить до открытия: из папки игра открывается, и папка в этот момент закрывается (размер 0 давал NaN)
  const f = ic ? zoomFrames(sc.el, ic) : null;
  openApp2(id, arg);
  if (id === 'games') { LG.moving($('games-folder'), 480); underPages(480); folderDim(); return; }
  if (!ic || current !== id) return;
  // пока экран раскрывается, стекло под ним - только подкраска, в нём самом - размытие
  LG.under($('home-page'), SPRING_OPEN.duration + 60);
  LG.moving(sc.el, SPRING_OPEN.duration + 60);
  sc.el.animate([f.from, f.to], { duration: SPRING_OPEN.duration, easing: SPRING_OPEN.easing });
  const cover = launchCover(sc.el, ic, f.iy, f.vis);
  cover.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, easing: 'ease-out', fill: 'forwards' }).onfinish = () => cover.remove();
};
// Заголовок папки белый, как в телефоне; на светлых обоях дымка под папкой гуще, пока его контраст
// на самом светлом месте под ним не станет не меньше 5 (с запасом: под размытием ещё и значки)
function folderDim() {
  const t = document.querySelector('.gf-title');
  if (!t || !Wall.ready()) return;
  const cells = Wall.sample(LG.layoutRect(t));
  if (!cells.length) return;
  let a = 0.18;
  for (; a < 0.8; a += 0.02) { const mx = Math.max(...cells.map((c) => lum(c.map((v) => v * (1 - a))))); if (ratio(1, mx) >= 6) break; }
  document.querySelector('.gf-back').style.background = 'rgba(0,0,0,' + a.toFixed(2) + ')';
}
let dragged = null;   // программу смахнули пальцем: сворачивание начинается с того места, где её отпустили
const hideApp1 = hideApp;
hideApp = function () {
  const id = current, el = id && screens[id] && screens[id].el;
  hideApp1();
  if (!el) return;
  const from = dragged && dragged.el === el ? dragged : null;
  dragged = null;
  const clear = () => { el.style.transform = ''; el.style.clipPath = ''; };
  if (REDUCED) { clear(); return; }
  // анимация - уже после того, как вызвавший решил, куда ушёл телефон: домой - сворачиваемся в значок
  queueMicrotask(() => {
    if (current || !$('home-page').classList.contains('active') || $('lock-page').classList.contains('active')) { clear(); return; }
    const ic = iconFor(id);
    if (!ic) { clear(); return; }
    // сначала показать экран (closing), потом мерить: скрытый экран размером 0 давал scale(Infinity)
    el.classList.add('closing');
    const f = zoomFrames(el, ic);
    const start = from ? { transform: from.transform || f.to.transform, clipPath: from.clip || f.to.clipPath } : f.to;
    clear();
    LG.under($('home-page'), SPRING_CLOSE.duration + 60);
    LG.moving(el, SPRING_CLOSE.duration + 60);
    const cover = launchCover(el, ic, f.iy, f.vis);
    cover.animate([{ opacity: 0 }, { opacity: 0, offset: 0.35 }, { opacity: 1 }], { duration: SPRING_CLOSE.duration * 0.8, fill: 'forwards' });
    const an = el.animate([start, f.from], { duration: SPRING_CLOSE.duration, easing: SPRING_CLOSE.easing });
    $('home-grid').animate([{ transform: 'scale(1.06)' }, { transform: 'scale(1)' }], { duration: SPRING_CLOSE.duration, easing: SPRING_CLOSE.easing });
    an.onfinish = an.oncancel = () => { el.classList.remove('closing'); cover.remove(); };
  });
};

// ===== Жесты за пальцем: пункт управления, центр уведомлений, сворачивание программы =====
// Пока палец ведёт, панель или экран идут за ним; отпустили - пружина доводит до конца или возвращает.
// Обычный обработчик жестов (по отпусканию) при этом молчит: g = null.
const NOGEST = 'input, textarea, button, select, .cc-slider, .calc-btn, [data-scroll], .scr-body, .msg-list, .settings-list, .read-view, .note-edit, .sw-card';
let gest = null;
const clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
function setCC(p) {
  document.querySelector('.cc-grid').style.transform = 'translateY(' + (-(1 - p) * 118).toFixed(2) + '%) scale(' + (0.94 + 0.06 * p).toFixed(4) + ')';
  document.querySelector('.cc-back').style.opacity = p.toFixed(3);
}
function clearCC() { $('control-center').classList.remove('dragging'); document.querySelector('.cc-grid').style.transform = ''; document.querySelector('.cc-back').style.opacity = ''; }
function clearNC() { $('nc').classList.remove('dragging'); $('nc').style.transform = ''; }
function holdGlass(kind) {
  if (kind.startsWith('cc')) { LG.moving($('control-center'), 60000); underPages(60000); }
  else if (kind.startsWith('nc')) { LG.moving($('nc'), 60000); underPages(60000); }
  else if (current) { LG.moving(screens[current].el, 60000); LG.under($('home-page'), 60000); }
}
function letGlass(kind, ms) {
  if (kind.startsWith('cc')) { LG.moving($('control-center'), ms); underPages(ms); }
  else if (kind.startsWith('nc')) { LG.moving($('nc'), ms); underPages(ms); }
  else { if (current) LG.moving(screens[current].el, ms); LG.under($('home-page'), ms); }
}
$('device').addEventListener('pointerdown', (e) => {
  gest = null;
  if ($('lock-page').classList.contains('active') || $('switcher').classList.contains('open') || spot.classList.contains('open')) return;
  const dv = $('device'), r = dv.getBoundingClientRect(), k = r.height / dv.offsetHeight;
  const lx = (e.clientX - r.left) / k, ly = (e.clientY - r.top) / k, W = dv.offsetWidth, H = dv.offsetHeight;
  const cc = $('control-center').classList.contains('open'), nc = $('nc').classList.contains('open');
  let kind = null;
  if (cc) { if (!e.target.closest('.cc-tile, .cc-slider')) kind = 'cc-close'; }
  else if (nc) { if (!e.target.closest('.n-card, button')) kind = 'nc-close'; }
  else if (ly < 70) kind = lx < W * 0.45 ? 'nc-open' : 'cc-open';
  else if (current && ly > H - 90 && !e.target.closest(NOGEST) && !$('games-folder').classList.contains('open')) kind = 'app';
  if (kind) gest = { kind, y0: e.clientY, k, on: false, p: kind.endsWith('close') ? 1 : 0, v: 0, ly: e.clientY, lt: performance.now() };
}, true);
$('device').addEventListener('pointermove', (e) => {
  if (!gest) return;
  const G = gest, dy = (e.clientY - G.y0) / G.k, now = performance.now();
  G.v = (e.clientY - G.ly) / G.k / Math.max(1, now - G.lt); G.ly = e.clientY; G.lt = now;
  if (!G.on) {
    if (Math.abs(dy) < 10) return;
    const down = dy > 0;
    if ((G.kind.endsWith('open') && !down) || (G.kind.endsWith('close') && down) || (G.kind === 'app' && down)) { gest = null; return; }
    G.on = true;
    holdGlass(G.kind);
    if (G.kind.startsWith('cc')) $('control-center').classList.add('dragging');
    if (G.kind.startsWith('nc')) $('nc').classList.add('dragging');
  }
  if ($('switcher').classList.contains('open')) { cancelGest(G); gest = null; return; }   // палец замер - открылся переключатель
  if (G.kind === 'cc-open') { G.p = clamp01(dy / 300); setCC(G.p); }
  else if (G.kind === 'cc-close') { G.p = clamp01(1 + dy / 300); setCC(G.p); }
  else if (G.kind === 'nc-open') { G.p = clamp01(dy / 520); $('nc').style.transform = 'translateY(' + ((G.p - 1) * 100).toFixed(2) + '%)'; }
  else if (G.kind === 'nc-close') { G.p = clamp01(1 + dy / 520); $('nc').style.transform = 'translateY(' + ((G.p - 1) * 100).toFixed(2) + '%)'; }
  else if (G.kind === 'app' && current) {
    const el = screens[current].el, up = Math.max(0, -dy), s = 1 - Math.min(0.5, up / 600);
    G.p = up;
    el.style.transform = 'translateY(' + (-up * 0.5).toFixed(1) + 'px) scale(' + s.toFixed(4) + ')';
    el.style.clipPath = 'inset(0px round ' + Math.min(55, 24 + up / 4).toFixed(1) + 'px)';
  }
}, true);
function cancelGest(G) {
  if (G.kind.startsWith('cc')) clearCC();
  else if (G.kind.startsWith('nc')) clearNC();
  else if (current) { const el = screens[current].el; el.style.transform = ''; el.style.clipPath = ''; }
  letGlass(G.kind, 400);
}
function endGest(e) {
  const G = gest; gest = null;
  if (!G || !G.on) return;
  g = null;   // обычный обработчик по отпусканию уже не нужен
  if ($('switcher').classList.contains('open')) { cancelGest(G); return; }
  if (G.kind === 'cc-open' || G.kind === 'cc-close') {
    const open = G.kind === 'cc-open' ? (G.p > 0.33 || G.v > 0.4) : !(G.p < 0.67 || G.v < -0.4);
    clearCC();   // переходы CSS доводят с того места, где отпустили
    letGlass(G.kind, 600);
    if (open) openCC(); else closeCC();
  } else if (G.kind === 'nc-open' || G.kind === 'nc-close') {
    const open = G.kind === 'nc-open' ? (G.p > 0.33 || G.v > 0.4) : !(G.p < 0.67 || G.v < -0.4);
    clearNC();
    letGlass(G.kind, 600);
    if (open) openNC(); else closeNC();
  } else if (G.kind === 'app' && current) {
    const el = screens[current].el;
    if (G.p > 110 || G.v < -0.5) { dragged = { el, transform: el.style.transform, clip: el.style.clipPath }; showHome(); }
    else {
      const from = { transform: el.style.transform, clipPath: el.style.clipPath };
      el.style.transform = ''; el.style.clipPath = '';
      el.animate([from, { transform: 'translateY(0px) scale(1)', clipPath: 'inset(0px round 0px)' }], { duration: SPRING_OPEN.duration, easing: SPRING_OPEN.easing });
      letGlass('app', SPRING_OPEN.duration + 60);
    }
  }
}
$('device').addEventListener('pointerup', endGest, true);
$('device').addEventListener('pointercancel', () => { if (gest && gest.on) cancelGest(gest); gest = null; }, true);

// ===== «Поиск»: поле внизу, как в iOS 26; программы по названию =====
const spot = document.createElement('div');
spot.id = 'spotlight'; spot.setAttribute('role', 'dialog'); spot.setAttribute('aria-label', 'Поиск');
spot.innerHTML = '<div class="sp-back"></div><div class="sp-box"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/></svg><input id="sp-input" placeholder="Поиск" aria-label="Поиск программ" autocomplete="off"></div><div class="sp-res" id="sp-res"></div>';
$('home-page').appendChild(spot);
function spotRender() {
  const q = $('sp-input').value.trim().toLowerCase();
  const ids = Object.keys(APPS).filter((id) => id !== 'games' && ICONS[id] && (!q || APPS[id].name.toLowerCase().includes(q))).slice(0, 16);
  $('sp-res').innerHTML = ids.length ? ids.map((id) => '<div class="app-icon" data-app="' + id + '" role="button" aria-label="' + esc(APPS[id].name) + '">' + iconHTML(id) + '<div class="app-label">' + esc(APPS[id].name) + '</div></div>').join('') : '<div class="sp-none">Ничего не найдено</div>';
}
// фокус сразу, в том же нажатии: буквы, набранные без паузы, не теряются
function openSpot() { closeCC(); $('sp-input').value = ''; spot.classList.add('open'); $('sp-input').focus(); LG.moving(spot, 440); underPages(440); spotRender(); }
function closeSpot() { spot.classList.remove('open'); $('sp-input').blur(); }
new MutationObserver(syncCovered).observe(spot, { attributes: true, attributeFilter: ['class'] });
$('home-search').addEventListener('click', openSpot);
$('home-search').addEventListener('keydown', (e) => { if (e.key === 'Enter') openSpot(); });
$('sp-input').addEventListener('input', spotRender);
$('sp-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { const a = $('sp-res').querySelector('[data-app]'); if (a) { closeSpot(); openApp(a.dataset.app); } } });
spot.addEventListener('click', (e) => { if (e.target === spot || e.target.classList.contains('sp-back')) closeSpot(); else if (e.target.closest('[data-app]')) closeSpot(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && spot.classList.contains('open')) { closeSpot(); e.stopImmediatePropagation(); } }, true);
const openApp3 = openApp;
openApp = function (id, arg) { closeSpot(); openApp3(id, arg); };
const showLock2 = showLock;
showLock = function () { closeSpot(); showLock2(); };

// строка состояния поверх пункта управления, папки, поиска и переключателя. Свой атрибут data-sbo, а не
// data-sb: у страницы строка состояния одна, и её ищут по [data-sb]; обновляется вместе с остальными
['control-center', 'games-folder', 'spotlight', 'switcher'].forEach((id) => {
  const r = $(id);
  if (!r || r.querySelector(':scope > [data-sbo]')) return;
  const sb = document.createElement('div');
  sb.className = 'status-bar overlay-sb'; sb.setAttribute('data-sbo', '');
  r.appendChild(sb);
});
const renderStatusBars0 = renderStatusBars;
renderStatusBars = function () { renderStatusBars0(); const h = statusHTML(); document.querySelectorAll('[data-sbo]').forEach((sb) => { if (sb.innerHTML !== h) sb.innerHTML = h; }); };
renderStatusBars();
