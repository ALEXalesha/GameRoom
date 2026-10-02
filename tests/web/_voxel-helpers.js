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
    if (window.__denyLock) { setTimeout(() => document.dispatchEvent(new Event('pointerlockerror'))); return Promise.reject(new DOMException('denied', 'SecurityError')); }
    window.__pl = this; setTimeout(() => document.dispatchEvent(new Event('pointerlockchange'))); return Promise.resolve();
  };
  Element.prototype.requestPointerLock = stub;
  if (Object.prototype.hasOwnProperty.call(HTMLCanvasElement.prototype, 'requestPointerLock')) HTMLCanvasElement.prototype.requestPointerLock = stub;
  Document.prototype.exitPointerLock = function () { window.__unlockCalls++; if (!window.__pl) return; window.__pl = null; setTimeout(() => document.dispatchEvent(new Event('pointerlockchange'))); };
  for (const t of ['mousedown', 'mouseup', 'click', 'contextmenu']) window.addEventListener(t, (e) => {
    if (window.__pl && e.isTrusted && e.target !== window.__pl && !e.__re) { e.stopImmediatePropagation(); e.preventDefault(); const n = new MouseEvent(t, e); n.__re = true; window.__pl.dispatchEvent(n); }
  }, { capture: true });
  window.__browserEsc = () => { if (window.__pl) { window.__pl = null; document.dispatchEvent(new Event('pointerlockchange')); return true; } return false; };
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
