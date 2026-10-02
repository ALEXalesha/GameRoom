// Законы «Кубического мира»: плавание лёжа, как в оригинале. В воде бег + вперёд - герой ложится по
// взгляду (нырнуть и всплыть - смотреть вниз и вверх), плывёт быстрее обычного, тратит сытость как
// бег; коробка высотой 0.6 и глаза ниже - проплывает щель в один блок; встать нельзя, пока над
// головой тесно; от третьего лица модель лежит и гребёт.
const { test, expect } = require('@playwright/test');
const { openVoxel, newWorld } = require('./_voxel-helpers');

test.describe.configure({ timeout: 90000 });

// бассейн 13x13 глубиной 4 (вода 66..69, дно 65), над ним пусто; посередине - туннель высотой 1
async function pool(page) {
  await openVoxel(page);
  await newWorld(page, { seed: 8, mode: 'survival' });
  await page.evaluate(() => {
    const v = __voxel, B = v.core.B, p = v.player;
    v.game.autoSpawn = false; v.entities.clear(); v.game.ticks = 6000;
    const x0 = Math.floor(p.pos.x), z0 = Math.floor(p.pos.z);
    for (let x = x0 - 8; x <= x0 + 8; x++) for (let z = z0 - 14; z <= z0 + 8; z++) {
      const rim = Math.abs(x - x0) === 8 || z === z0 - 14 || z === z0 + 8;
      v.setBlock(x, 65, z, B.stone);
      for (let y = 66; y <= 69; y++) v.setBlock(x, y, z, rim ? B.stone : B.water);
      for (let y = 70; y < 82; y++) v.setBlock(x, y, z, 0);
    }
    window.base = () => ({ x0, z0 });
    window.put = (x, y, z) => { p.pos.set(x, y, z); p.vel.set(0, 0, 0); };
  });
}
const keys = (page, on, list) => page.evaluate(([on, list]) => { for (const k of list) __voxel.key(k, on); }, [on, list]);

test.describe('minecraft_clone_3d_1: плавание лёжа', () => {
  test('бег + вперёд в воде - герой лёг: коробка 0.6, глаза ниже, тело по взгляду (нырнуть - смотреть вниз); отпустил бег - встал; вышел из воды - встал', async ({ page }) => {
    await pool(page);
    const r = await page.evaluate(() => {
      const v = __voxel, p = v.player, { x0, z0 } = base();
      put(x0 + 0.5, 68.6, z0 + 0.5); v.look(0, -0.5);
      v.key('KeyW'); v.key('ControlLeft'); v.step(0.05, 4);
      const lying = { swim: !!p.swimming, h: p.box()[4] - p.box()[1], eye: +(p.eye() - p.pos.y).toFixed(2) };
      const y0 = p.pos.y; v.step(0.05, 6); const dived = y0 - p.pos.y;
      v.look(0, 0.6); const y1 = p.pos.y; v.step(0.05, 10); const rose = p.pos.y - y1;
      v.look(0, -0.3);
      v.key('ControlLeft', false); p.sprinting = false; v.step(0.05, 3);
      const stood = { swim: !!p.swimming, h: p.box()[4] - p.box()[1] };
      v.key('KeyW', false);
      // снова лечь и выйти из воды на берег
      put(x0 + 0.5, 67, z0 + 0.5); v.look(0, 0); v.key('KeyW'); v.key('ControlLeft'); v.step(0.05, 6);
      const again = !!p.swimming;
      put(x0 + 0.5, 70, z0 + 12.5); v.step(0.05, 6);       // за бортиком сухо
      const dry = !!p.swimming;
      v.key('KeyW', false); v.key('ControlLeft', false);
      return { lying, dived, rose, stood, again, dry };
    });
    expect(r.lying.swim).toBe(true);
    expect(r.lying.h).toBeCloseTo(0.6, 5);
    expect(r.lying.eye).toBeLessThan(0.6);
    expect(r.dived).toBeGreaterThan(0.5);
    expect(r.rose).toBeGreaterThan(0.5);
    expect(r.stood.swim).toBe(false);
    expect(r.stood.h).toBeCloseTo(1.8, 5);
    expect(r.again).toBe(true);
    expect(r.dry).toBe(false);
  });

  test('лёжа плывёт заметно быстрее обычного плавания и тратит сытость как бег', async ({ page }) => {
    await pool(page);
    const r = await page.evaluate(() => {
      const v = __voxel, p = v.player, { x0, z0 } = base();
      const run = (sprint) => {
        put(x0 + 0.5, 67, z0 + 6.5); v.look(0, 0); p.exhaustion = 0; p.sprinting = false;
        v.key('KeyW'); if (sprint) v.key('ControlLeft');
        v.step(0.05, 8); const z1 = p.pos.z; v.step(0.05, 20);
        const d = z1 - p.pos.z, ex = p.exhaustion;
        v.key('KeyW', false); v.key('ControlLeft', false); p.sprinting = false; v.step(0.05, 5);
        return { d, ex, swim: !!p.swimming };
      };
      const slow = run(false), fast = run(true);
      return { slow, fast };
    });
    expect(r.slow.swim).toBe(false);
    expect(r.fast.d / 1).toBeGreaterThan(r.slow.d * 1.6);
    expect(r.fast.d).toBeGreaterThan(4);                          // за секунду
    expect(r.fast.ex).toBeGreaterThan(r.slow.ex * 3);
  });

  test('лёжа проплывает туннель высотой в один блок; внутри встать нельзя (лежит, пока тесно), вылез на простор - встал; голод - конец заплыва', async ({ page }) => {
    await pool(page);
    const r = await page.evaluate(() => {
      const v = __voxel, B = v.core.B, p = v.player, { x0, z0 } = base();
      // туннель вдоль -z: пол 66 (камень), вода 67, потолок 68-69 (камень), длина 6
      for (let z = z0 - 9; z <= z0 - 3; z++) for (let x = x0 - 1; x <= x0 + 1; x++) {
        const wall = x !== x0;
        v.setBlock(x, 66, z, B.stone); v.setBlock(x, 67, z, wall ? B.stone : B.water); v.setBlock(x, 68, z, B.stone); v.setBlock(x, 69, z, B.stone);
      }
      put(x0 + 0.5, 67.05, z0 - 1.5); v.look(0, 0);
      v.key('KeyW'); v.key('ControlLeft');
      v.step(0.05, 20);
      const inside = { z: p.pos.z, swim: !!p.swimming };
      // посреди туннеля отпустил бег и вперёд - лежит
      v.key('ControlLeft', false); v.key('KeyW', false); p.sprinting = false; v.step(0.05, 10);
      const stuck = { swim: !!p.swimming, y: p.pos.y, h: p.box()[4] - p.box()[1] };
      // дальше - снова плывёт и выплывает на простор
      v.key('KeyW'); v.key('ControlLeft'); v.step(0.05, 30); v.key('ControlLeft', false); v.key('KeyW', false); p.sprinting = false; v.step(0.05, 10);
      const out = { z: p.pos.z, swim: !!p.swimming };
      // голод: сытость 6 и меньше - плыть лёжа нельзя
      put(x0 + 0.5, 67, z0 + 4.5); p.food = 6; v.key('KeyW'); v.key('ControlLeft'); v.step(0.05, 8);
      const hungry = !!p.swimming;
      v.key('KeyW', false); v.key('ControlLeft', false);
      return { start: z0 - 1.5, inside, stuck, out, hungry, tunnelEnd: z0 - 9 };
    });
    expect(r.inside.swim).toBe(true);
    expect(r.inside.z).toBeLessThan(r.start - 2.5);               // заплыл в туннель
    expect(r.stuck.swim).toBe(true);                               // встать негде - лежит
    expect(r.stuck.h).toBeCloseTo(0.6, 5);
    expect(r.stuck.y).toBeGreaterThanOrEqual(67);
    expect(r.stuck.y).toBeLessThan(67.5);
    expect(r.out.z).toBeLessThan(r.tunnelEnd);                    // проплыл насквозь
    expect(r.out.swim).toBe(false);                                // на просторе встал
    expect(r.hungry).toBe(false);
  });

  test('от третьего лица модель героя лежит по взгляду и гребёт руками и ногами', async ({ page }) => {
    await pool(page);
    const r = await page.evaluate(async () => {
      const v = __voxel, p = v.player, G = v.game, { x0, z0 } = base();
      put(x0 + 0.5, 67, z0 + 2.5); v.look(0, -0.2);
      v.key('KeyW'); v.key('ControlLeft'); v.step(0.05, 6);
      G.view = 1;
      await new Promise((rr) => setTimeout(rr, 300));
      const m = v.entities.playerModelState();
      const a0 = m.arms[0].rotation.x;
      await new Promise((rr) => setTimeout(rr, 250));
      v.step(0.05, 4);
      await new Promise((rr) => setTimeout(rr, 100));
      const a1 = m.arms[0].rotation.x;
      // голова модели - впереди, по взгляду, а не над ногами
      const head = new THREE.Vector3(); m.head.getWorldPosition(head);
      const f = p.forward();
      const along = (head.x - p.pos.x) * f.x + (head.z - p.pos.z) * f.z;
      v.key('KeyW', false); v.key('ControlLeft', false);
      return { swim: !!p.swimming, headUp: head.y - p.pos.y, along, stroke: Math.abs(a1 - a0) };
    });
    expect(r.swim).toBe(true);
    expect(r.headUp).toBeLessThan(0.8);                            // стоя голова на высоте 1.75
    expect(r.along).toBeGreaterThan(0.4);
    expect(r.stroke).toBeGreaterThan(0.05);
  });
});
