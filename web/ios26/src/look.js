// ================================================================
// Вид iOS 26 поверх программ: где стекло, обои и тон стекла, стеклянные часы блокировки,
// пружинное раскрытие программы из значка и сворачивание обратно, «Поиск» над доком.
// ================================================================
// для проверок и отладки: движок стекла и обои видны как window.LG и window.Wall
window.LG = LG; window.Wall = Wall;
const REDUCED = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
LG.auto([
  ['#dock', 'dock', { wall: true }],
  ['#home-grid .home-widget', 'widget', { wall: true }],
  ['#home-grid .icon-folder', 'button', { wall: true }],
  ['#home-search', 'button', { wall: true }],
  ['.lock-widgets .widget', 'widget', { wall: true }],
  ['.lock-circle', 'button', { wall: true }],
  ['#lock-notifs .n-card', 'card', { wall: true }],
  ['.banner .n-card', 'card'],
  ['#nc-list .n-card', 'card'],
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

// ===== Стеклянные часы блокировки =====
// Буквы - стекло по маске самих букв (поле расстояний по маске, те же три текстуры), поверх -
// заливка. Светлые или тёмные буквы и сила дымки под ними выбираются по обоям так, чтобы контраст
// на самом неудобном месте был не меньше 4.5.
const lockGlass = document.createElement('div');
lockGlass.className = 'lock-glass glyph-layer';
lockGlass.setAttribute('aria-hidden', 'true');
const lockScrim = document.createElement('div');
lockScrim.className = 'lock-scrim';
document.querySelector('.lock-clock').prepend(lockScrim);
document.querySelector('.lock-clock').appendChild(lockGlass);
const FILL_A = 0.86;
function clockTone(cells) {
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  const worst = (white, a) => {
    let w = 99;
    for (const c of cells) {
      const b = white ? c.map((v) => v * (1 - a)) : c.map((v) => v * (1 - a) + 255 * a);
      const f = b.map((v) => v * (1 - FILL_A) + (white ? 255 : 14) * FILL_A);
      w = Math.min(w, ratio(lum(f), lum(b)));
    }
    return w;
  };
  const find = (white) => { for (let a = 0; a <= 0.9; a += 0.02) if (worst(white, a) >= 5) return a; return 0.9; };
  const aw = find(true), ad = find(false);
  return ad + 0.1 < aw ? { white: false, a: ad } : { white: true, a: aw };
}
let lockKey = '';
function lockClock(force) {
  if (!$('lock-page').classList.contains('active') || !Wall.ready()) return;
  const t = $('lock-time'), d = $('lock-date');
  const w = t.offsetWidth, h = t.offsetHeight;
  if (!w || !h) return;
  const box = localBox(t), dbox = localBox(d);
  const cells = Wall.sample({ x: box.x + w * 0.15, y: box.y + h * 0.1, w: w * 0.7, h: h * 0.8 }).concat(Wall.sample({ x: dbox.x + dbox.w * 0.25, y: dbox.y, w: dbox.w * 0.5, h: dbox.h }));
  const tone = clockTone(cells);
  const fill = tone.white ? 'rgba(255,255,255,' + FILL_A + ')' : 'rgba(14,14,20,' + FILL_A + ')';
  $('lock-page').classList.toggle('dark-clock', !tone.white);
  lockScrim.style.background = tone.white ? 'rgba(0,0,0,' + tone.a.toFixed(2) + ')' : 'rgba(255,255,255,' + tone.a.toFixed(2) + ')';
  lockScrim.style.opacity = tone.a > 0.01 ? '1' : '0';
  const cs = getComputedStyle(t);
  const key = [t.textContent, w, h, cs.font, cs.letterSpacing, fill].join('|');
  Object.assign(lockGlass.style, { left: t.offsetLeft + 'px', top: t.offsetTop + 'px', width: w + 'px', height: h + 'px' });
  if (key === lockKey && !force) return;
  lockKey = key;
  // маска букв тем же шрифтом, что у #lock-time (сам текст прозрачный: виден только стеклянный слой)
  const q = Math.min(2, Math.max(1.5, window.devicePixelRatio || 1));
  const cv = document.createElement('canvas'); cv.width = Math.round(w * q); cv.height = Math.round(h * q);
  const x = cv.getContext('2d');
  x.font = cs.fontWeight + ' ' + parseFloat(cs.fontSize) * q + 'px ' + cs.fontFamily;
  if ('letterSpacing' in x) x.letterSpacing = (parseFloat(cs.letterSpacing) || 0) * q + 'px';
  x.textAlign = 'center'; x.textBaseline = 'alphabetic';
  const m = x.measureText(t.textContent);
  const asc = m.actualBoundingBoxAscent, desc = m.actualBoundingBoxDescent;
  x.fillStyle = '#fff';
  x.fillText(t.textContent, cv.width / 2, (cv.height + asc - desc) / 2);
  const img = x.getImageData(0, 0, cv.width, cv.height).data;
  const alpha = new Uint8Array(cv.width * cv.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = img[i * 4 + 3];
  const mask = 'url("' + cv.toDataURL() + '")';
  lockGlass.style.webkitMaskImage = lockGlass.style.maskImage = mask;
  const g = LG.glyphs(alpha, cv.width, cv.height, w, h, t.textContent + '|' + w + 'x' + h + '|' + cs.font);
  lockGlass.style.backgroundColor = fill;
  if (g) {
    lockGlass.style.backgroundImage = 'url("' + g.spec + '"), url("' + g.shade + '")';
    const bf = 'blur(0.6px) saturate(190%) url(#' + g.id + ')';
    lockGlass.style.backdropFilter = lockGlass.style.webkitBackdropFilter = bf;
  } else {
    lockGlass.style.backgroundImage = 'none';
    lockGlass.style.backdropFilter = lockGlass.style.webkitBackdropFilter = 'none';
  }
}
setInterval(() => lockClock(false), 1000);

// ===== Обои, тема и тон стекла идут за настройками =====
function syncLook() {
  Wall.sync();
  LG.retone();
  lockClock(false);
  document.querySelectorAll('canvas.wall-th').forEach((c) => { if (!c.width || c.dataset.done !== Wall.key) { Wall.thumb(c, c.dataset.th); c.dataset.done = Wall.key; } });
  // значок на ползунке темнеет, когда его накрывает белая заливка
  document.querySelectorAll('[data-slider]').forEach((sl) => sl.classList.toggle('lit', S[sl.dataset.slider] > 14));
  // светлые обои: подписи значков, строка состояния и полоска «Домой» темнеют
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

// ===== Пункт управления, центр уведомлений, папка: пока едут - простое размытие =====
// пока открыта сплошная панель, стекло дома под ней выключено (класс снимается после того, как панель уехала)
let coverTimer = 0;
function syncCovered() {
  const open = $('control-center').classList.contains('open') || $('games-folder').classList.contains('open') || spot.classList.contains('open');
  clearTimeout(coverTimer);
  if (open) $('home-page').classList.add('lg-covered');
  else coverTimer = setTimeout(() => $('home-page').classList.remove('lg-covered'), 520);
}
new MutationObserver(syncCovered).observe($('control-center'), { attributes: true, attributeFilter: ['class'] });
new MutationObserver(syncCovered).observe($('games-folder'), { attributes: true, attributeFilter: ['class'] });
// под панелью - активная страница (дом или блокировка) и открытая программа
function movingUnder(ms) { ['home-page', 'lock-page'].forEach((id) => { if ($(id).classList.contains('active')) LG.moving($(id), ms); }); if (current && screens[current]) LG.moving(screens[current].el, ms); }
const openCC0 = openCC, closeCC0 = closeCC;
openCC = function () { if (!$('control-center').classList.contains('open')) movingUnder(620); openCC0(); };
closeCC = function () { if ($('control-center').classList.contains('open')) movingUnder(560); closeCC0(); };
const openNC0 = openNC, closeNC0 = closeNC;
openNC = function () { LG.moving($('nc'), 560); movingUnder(560); openNC0(); };
closeNC = function () { if ($('nc').classList.contains('open')) { LG.moving($('nc'), 560); movingUnder(560); } closeNC0(); };
const notify0 = notify;
notify = function (app, title, body) {
  const n = notify0(app, title, body);
  const b = document.querySelector('.banner:last-of-type');
  if (b && !b.dataset.lgw) { b.dataset.lgw = '1'; LG.moving(b, 600); b.addEventListener('animationstart', (e) => { if (e.animationName === 'bannerOut') LG.moving(b, 400); }); }
  return n;
};

// ползунок тянут - стекло пункта управления плоское, иначе каждый шаг пересчитывает все цепочки
document.querySelectorAll('[data-slider]').forEach((sl) => {
  sl.addEventListener('pointerdown', () => $('control-center').classList.add('lg-moving'));
  const up = () => setTimeout(() => $('control-center').classList.remove('lg-moving'), 80);
  sl.addEventListener('pointerup', up); sl.addEventListener('pointercancel', up);
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
function zoomFrames(el, ic) {
  const W = el.offsetWidth, H = el.offsetHeight, r = localBox(ic);
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
  openApp2(id, arg);
  if (id === 'games') { movingUnder(480); return; }
  if (!ic || current !== id) return;
  const f = zoomFrames(sc.el, ic);
  // пока экран раскрывается, стекло под ним и в нём самом - простое размытие: иначе каждый кадр
  // пересчитывает цепочки с картой смещения на процессоре
  LG.moving($('home-page'), SPRING_OPEN.duration + 60);
  LG.moving(sc.el, SPRING_OPEN.duration + 60);
  sc.el.animate([f.from, f.to], { duration: SPRING_OPEN.duration, easing: SPRING_OPEN.easing });
  const cover = launchCover(sc.el, ic, f.iy, f.vis);
  cover.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, easing: 'ease-out', fill: 'forwards' }).onfinish = () => cover.remove();
};
const hideApp1 = hideApp;
hideApp = function () {
  const id = current, el = id && screens[id] && screens[id].el;
  hideApp1();
  if (!el || REDUCED) return;
  // анимация - уже после того, как вызвавший решил, куда ушёл телефон: домой - сворачиваемся в значок
  queueMicrotask(() => {
    if (current || !$('home-page').classList.contains('active') || $('lock-page').classList.contains('active')) return;
    const ic = iconFor(id);
    if (!ic) return;
    const f = zoomFrames(el, ic);
    el.classList.add('closing');
    LG.moving($('home-page'), SPRING_CLOSE.duration + 60);
    LG.moving(el, SPRING_CLOSE.duration + 60);
    const cover = launchCover(el, ic, f.iy, f.vis);
    cover.animate([{ opacity: 0 }, { opacity: 0, offset: 0.35 }, { opacity: 1 }], { duration: SPRING_CLOSE.duration * 0.8, fill: 'forwards' });
    const an = el.animate([f.to, f.from], { duration: SPRING_CLOSE.duration, easing: SPRING_CLOSE.easing });
    $('home-grid').animate([{ transform: 'scale(1.06)' }, { transform: 'scale(1)' }], { duration: SPRING_CLOSE.duration, easing: SPRING_CLOSE.easing });
    an.onfinish = an.oncancel = () => { el.classList.remove('closing'); cover.remove(); };
  });
};

// ===== «Поиск» над доком: программы по названию =====
const spot = document.createElement('div');
spot.id = 'spotlight'; spot.setAttribute('role', 'dialog'); spot.setAttribute('aria-label', 'Поиск');
spot.innerHTML = '<div class="sp-back"></div><div class="sp-box"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/></svg><input id="sp-input" placeholder="Поиск" aria-label="Поиск программ" autocomplete="off"></div><div class="sp-res" id="sp-res"></div>';
$('home-page').appendChild(spot);
function spotRender() {
  const q = $('sp-input').value.trim().toLowerCase();
  const ids = Object.keys(APPS).filter((id) => id !== 'games' && ICONS[id] && (!q || APPS[id].name.toLowerCase().includes(q))).slice(0, 16);
  $('sp-res').innerHTML = ids.length ? ids.map((id) => '<div class="app-icon" data-app="' + id + '" role="button" aria-label="' + esc(APPS[id].name) + '">' + iconHTML(id) + '<div class="app-label">' + esc(APPS[id].name) + '</div></div>').join('') : '<div class="sp-none">Ничего не найдено</div>';
}
function openSpot() { closeCC(); spot.classList.add('open'); movingUnder(440); $('sp-input').value = ''; spotRender(); setTimeout(() => $('sp-input').focus(), 30); }
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
