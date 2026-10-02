// Помощники для законов «Кубического мира»: открыть страницу без сети, дождаться крючка
// window.__voxel, создать мир с заданным зерном и режимом и дождаться, пока он построится.
const { pageUrl } = require('../helpers');

const NAME = 'minecraft_clone_3d_1';

// Захват мыши НИКОГДА не доходит до настоящего: в headless Chromium на Windows за страницей
// стоит скрытое окно в 0,0, и настоящий requestPointerLock зажимает курсор владельца (ClipCursor)
// в прямоугольник окна проверки. Подмена ставится до любого скрипта страницы: вызов записывается,
// document.pointerLockElement подменён, приходит pointerlockchange; exitPointerLock - так же.
// При «захвате» события мыши идут захваченному элементу (как в браузере), __browserEsc() снимает
// захват, как Esc браузера; __denyLock = true - браузер отказывает (pointerlockerror).
function lockStub() {
  if (window.__lockStubbed) return;
  window.__lockStubbed = true;
  const nativeRPL = Element.prototype.requestPointerLock, nativeExit = Document.prototype.exitPointerLock;
  window.__nativeLock = { rpl: nativeRPL, exit: nativeExit };
  window.__pl = null; window.__lockCalls = 0; window.__unlockCalls = 0;
  Object.defineProperty(Document.prototype, 'pointerLockElement', { configurable: true, get() { return window.__pl; } });
  const stub = function () {
    window.__lockCalls++;
    // __lockNeedsGesture: как в настоящем браузере - захват только по действию человека (щелчок), не по Esc
    // __lockNeedsGesture: как в настоящем браузере - после выхода по Esc захват дают только по НОВОМУ
    // действию человека (щелчок, клавиша кроме Esc), не по самому Esc
    const fresh = !window.__lockExitAt || (window.__lastGestureAt || 0) > window.__lockExitAt;
    if (window.__denyLock || (window.__lockNeedsGesture && !fresh)) { setTimeout(() => document.dispatchEvent(new Event('pointerlockerror'))); return Promise.reject(new DOMException('denied', 'SecurityError')); }
    window.__pl = this; setTimeout(() => document.dispatchEvent(new Event('pointerlockchange'))); return Promise.resolve();
  };
  Element.prototype.requestPointerLock = stub;
  if (Object.prototype.hasOwnProperty.call(HTMLCanvasElement.prototype, 'requestPointerLock')) HTMLCanvasElement.prototype.requestPointerLock = stub;
  // выход по exitPointerLock() из кода страницы: новый захват можно и без щелчка (так в Chromium)
  Document.prototype.exitPointerLock = function () { window.__unlockCalls++; window.__lockExitAt = 0; if (!window.__pl) return; window.__pl = null; setTimeout(() => document.dispatchEvent(new Event('pointerlockchange'))); };
  for (const t of ['mousedown', 'mouseup', 'click', 'contextmenu']) window.addEventListener(t, (e) => {
    if (window.__pl && e.isTrusted && e.target !== window.__pl && !e.__re) { e.stopImmediatePropagation(); e.preventDefault(); const n = new MouseEvent(t, e); n.__re = true; window.__pl.dispatchEvent(n); }
  }, { capture: true });
  for (const t of ['mousedown', 'keydown']) window.addEventListener(t, (e) => { if (e.isTrusted && e.code !== 'Escape') window.__lastGestureAt = performance.now(); }, { capture: true });
  // Esc при захвате в обычном окне: браузер снимает захват сам, клавиша в страницу не приходит;
  // в полном экране с navigator.keyboard.lock(['Escape']) - приходит как обычная клавиша
  window.addEventListener('keydown', (e) => {
    if (e.isTrusted && e.code === 'Escape' && window.__pl && !(window.__kbLocked && window.__fs)) { e.stopImmediatePropagation(); e.preventDefault(); window.__browserEsc(); }
  }, { capture: true });
  // Полный экран (Fullscreen API) и navigator.keyboard.lock - подмена: окна не трогаем
  window.__fs = null; window.__kbLockCalls = []; window.__kbUnlockCalls = 0; window.__kbLocked = false;
  Object.defineProperty(Document.prototype, 'fullscreenElement', { configurable: true, get() { return window.__fs; } });
  Element.prototype.requestFullscreen = function () { window.__fs = this; setTimeout(() => document.dispatchEvent(new Event('fullscreenchange'))); return Promise.resolve(); };
  Document.prototype.exitFullscreen = function () { if (!window.__fs) return Promise.resolve(); window.__fs = null; setTimeout(() => document.dispatchEvent(new Event('fullscreenchange'))); return Promise.resolve(); };
  window.__userExitFullscreen = () => { window.__fs = null; document.dispatchEvent(new Event('fullscreenchange')); };   // «удержать Esc»
  try {
    Object.defineProperty(Navigator.prototype, 'keyboard', { configurable: true, get() { return { lock: (keys) => { window.__kbLockCalls.push(keys || []); window.__kbLocked = true; return Promise.resolve(); }, unlock: () => { window.__kbUnlockCalls++; window.__kbLocked = false; } }; } });
  } catch (e) { /* без keyboard */ }
  window.__browserEsc = () => { window.__lockExitAt = performance.now(); if (window.__pl) { window.__pl = null; document.dispatchEvent(new Event('pointerlockchange')); return true; } return false; };
}

async function openVoxel(page, query = '') {
  await page.addInitScript(lockStub);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String((e && e.stack) || e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  // во время игры страница переспрашивает перед закрытием (защита от Ctrl+W) - в проверках соглашаемся
  page.on('dialog', (d) => d.accept());
  await page.route(/^https?:\/\//, (route) => route.abort());
  await page.goto(pageUrl(NAME) + (query ? '?' + query : ''));
  await page.waitForFunction(() => window.__voxel && window.__voxel.ready === true, null, { timeout: 30000 });
  return errors;
}

// Новый мир: seed, mode ('creative' | 'survival'), name; radius - дальность прорисовки для скорости
async function newWorld(page, o = {}) {
  return page.evaluate(async (o) => {
    const v = window.__voxel;
    v.settings.renderDistance = o.radius || 3;
    v.game.applySettings();
    return v.newWorld({ name: o.name || 'Проверка', seed: String(o.seed === undefined ? 777 : o.seed), mode: o.mode || 'creative' });
  }, o);
}

// Поставить героя на ровную площадку из камня: пол 5x5 на высоте y, воздух над ним
async function flatArena(page, y = 70, size = 6, floor = 3) {
  await page.evaluate(({ y, size, floor }) => {
    const v = window.__voxel, p = v.player;
    const x0 = Math.floor(p.pos.x), z0 = Math.floor(p.pos.z);
    for (let x = x0 - size; x <= x0 + size; x++) for (let z = z0 - size; z <= z0 + size; z++) {
      v.setBlock(x, y - 1, z, floor);
      for (let k = 0; k < 12; k++) v.setBlock(x, y + k, z, 0);
    }
    p.pos.set(x0 + 0.5, y, z0 + 0.5); p.vel.set(0, 0, 0); p.flying = false; p.onGround = false;
    v.step(0.05, 4);
  }, { y, size, floor });
}

module.exports = { NAME, openVoxel, newWorld, flatArena, lockStub };
