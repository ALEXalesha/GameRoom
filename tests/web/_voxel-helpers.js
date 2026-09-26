// Помощники для законов «Кубического мира»: открыть страницу без сети, дождаться крючка
// window.__voxel, создать мир с заданным зерном и режимом и дождаться, пока он построится.
const { pageUrl } = require('../helpers');

const NAME = 'minecraft_clone_3d_1';

async function openVoxel(page, query = '') {
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

module.exports = { NAME, openVoxel, newWorld, flatArena };
