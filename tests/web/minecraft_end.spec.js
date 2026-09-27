// Законы «Кубического мира», четвёртый заход: Край - крепости с залом портала, око Края (летит к
// крепости, падает или бьётся), рамка из 12 блоков и портал, остров с колоннами и кристаллами,
// эндер-дракон (лечение от кристаллов, взрыв кристалла, касание, пике), победа (опыт, выходной
// портал, яйцо), титры при выходе домой, эндермены, жемчуг Края, сохранение битвы.
const { test, expect } = require('@playwright/test');
const { openVoxel, newWorld, flatArena } = require('./_voxel-helpers');

test.describe.configure({ timeout: 120000 });

async function world(page, mode = 'survival') {
  await openVoxel(page);
  await newWorld(page, { seed: 8, mode });
  await page.evaluate(() => { __voxel.game.autoSpawn = false; __voxel.entities.clear(); __voxel.game.ticks = 4000; });
  await flatArena(page, 70, 7);
  await page.evaluate(() => {
    window.aim = (x, y, z) => { const v = __voxel, p = v.player, dx = x - p.pos.x, dy = y - p.eye(), dz = z - p.pos.z; v.look(Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz))); };
    window.hold = (id, n) => { const v = __voxel; v.inv.slots[0] = { id, count: n || 1, dmg: 0 }; v.select(0); };
    window.base = () => { const p = __voxel.player; return { x0: Math.floor(p.pos.x), z0: Math.floor(p.pos.z) }; };
    // в Край (как через портал) и дождаться загрузки
    window.toEnd = async () => { const v = __voxel; v.VX.endgame.travel(); await v.waitLoaded(); v.game.autoSpawn = false; };
    window.near = async (x, y, z) => { const v = __voxel; v.player.pos.set(x, y, z); v.player.vel.set(0, 0, 0); v.player.flying = true; await v.waitIdle(2); };
  });
}

test.describe('minecraft_clone_3d_1: Край', () => {
  test('крепости: три на кольце 500-900 блоков через 120°, в зале 12 рамок вокруг лавы 3x3; око Края по рецепту летит к ближайшей, поднимается, 4 из 5 падают обратно; в Нижнем мире не летит; вход в зал - достижение', async ({ page }) => {
    await world(page);
    const r = await page.evaluate(async () => {
      const v = __voxel, C = v.core, EG = v.VX.endgame, I = v.data.I, D = v.data, p = v.player, G = v.game;
      const seed = v.world.seed, S = C.strongholds(seed);
      const ring = S.map((s) => Math.hypot(s.x, s.z));
      const angs = S.map((s) => Math.atan2(s.z, s.x)).sort((a, b) => a - b);
      const gaps = [angs[1] - angs[0], angs[2] - angs[1]];
      // зал портала по генератору
      const cache = new Map();
      const at = (x, y, z) => { const cx = Math.floor(x / 16), cz = Math.floor(z / 16), k = cx + ',' + cz; if (!cache.has(k)) cache.set(k, C.generate(seed, cx, cz)); return cache.get(k)[C.cidx(x - cx * 16, y, z - cz * 16)]; };
      const s = S[0];
      let frames = 0, eyes = 0, lava = 0;
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
        const id = at(s.x + dx, s.y, s.z + dz);
        if (EG.isFrame(id)) { frames++; if (EG.hasEye(id)) eyes++; }
        if (Math.abs(dx) < 2 && Math.abs(dz) < 2 && at(s.x + dx, s.y - 1, s.z + dz) === C.B.lava) lava++;
      }
      const recipe = !!D.RECIPES.find((q) => q.outId === I.eye_of_ender);
      // бросок ока
      EG.R.rnd = () => 0.5;
      hold(I.eye_of_ender, 3); v.look(0, 0);
      const thrown = v.place();
      const left = v.inv.slots[0].count;
      const ns = EG.nearestStronghold(p.pos.x, p.pos.z);
      v.step(0.05, 12);
      const f = EG.flying[0];
      const ex = f.x - p.pos.x, ez = f.z - p.pos.z, tx = ns.x + 0.5 - p.pos.x, tz = ns.z + 0.5 - p.pos.z;
      const dot = (ex * tx + ez * tz) / Math.hypot(ex, ez) / Math.hypot(tx, tz);
      v.step(0.05, 20);
      const rose = f.y - p.eye(), flew = Math.hypot(f.x - p.pos.x, f.z - p.pos.z);
      v.step(0.05, 30);
      const dropped = v.entities.items.filter((it) => it.stack.id === I.eye_of_ender).length;
      EG.R.rnd = () => 0.9;
      v.place(); v.step(0.05, 70);
      const afterBreak = v.entities.items.filter((it) => it.stack.id === I.eye_of_ender).length;
      // в Нижнем мире око не летит и не тратится
      G.dim = 'nether'; const inNether = v.place(); G.dim = 'over';
      const leftNether = v.inv.slots[0].count;
      // в зал портала
      await near(s.x + 0.5, s.y, s.z - 5.5);
      p.flying = false; p.pos.set(s.x + 0.5, s.y, s.z - 5.5);
      v.step(0.05, 30);
      return { ring, gaps, frames, eyes, lava, recipe, thrown, left, dot, rose, flew, dropped, afterBreak, inNether, leftNether, ach: !!v.ach.got.stronghold };
    });
    for (const d of r.ring) { expect(d).toBeGreaterThanOrEqual(499); expect(d).toBeLessThanOrEqual(901); }
    for (const g of r.gaps) expect(Math.abs(g - 2 * Math.PI / 3)).toBeLessThan(0.02);
    expect(r.frames).toBe(12);
    expect(r.eyes).toBeLessThan(12);
    expect(r.lava).toBe(9);
    expect(r.recipe).toBe(true);
    expect(r.thrown).toBe('eye');
    expect(r.left).toBe(2);
    expect(r.dot).toBeGreaterThan(0.99);
    expect(r.rose).toBeGreaterThan(4);
    expect(r.flew).toBeGreaterThan(11);
    expect(r.flew).toBeLessThan(12.5);
    expect(r.dropped).toBe(1);
    expect(r.afterBreak).toBe(1);
    expect(r.inNether).toBe(null);
    expect(r.leftNether).toBe(1);
    expect(r.ach).toBe(true);
  });

  test('рамка: 11 очей - портала нет, двенадцатое рукой - портал 3x3; око в занятую рамку не тратится; сломали рамку - портал гаснет; шаг в портал - Край', async ({ page }) => {
    await world(page);
    const r = await page.evaluate(async () => {
      const v = __voxel, C = v.core, EG = v.VX.endgame, I = v.data.I, p = v.player, G = v.game;
      const { x0, z0 } = base();
      const y = 70, cx = x0, cz = z0 - 4;
      for (const [a, b] of EG.RING) v.setBlock(cx + a, y, cz + b, C.END_FRAME + 1);
      v.setBlock(cx, y, cz + 2, C.END_FRAME);
      const portals = () => { let n = 0; for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) if (v.getBlock(cx + dx, y, cz + dz) === C.END_PORTAL) n++; return n; };
      EG.tryActivate(cx - 1, y, cz - 2);
      const with11 = portals();
      hold(I.eye_of_ender, 2); aim(cx - 0.5, y + 0.9, cz + 2.5);
      const busy = v.place(); const keptBusy = v.inv.slots[0].count;
      aim(cx + 0.5, y + 0.9, cz + 2.5);
      const put = v.place();
      const with12 = portals(), center = v.getBlock(cx, y, cz), used = v.inv.slots[0] ? v.inv.slots[0].count : 0;
      // творческий: сломать рамку
      G.mode = 'creative'; aim(cx + 0.5, y + 0.5, cz + 2.5); v.breakTarget(); const afterBreak = portals(); G.mode = 'survival';
      // заново и шаг в портал
      v.setBlock(cx, y, cz + 2, C.END_FRAME + 1); EG.tryActivate(cx, y, cz + 2);
      const again = portals();
      p.pos.set(cx + 0.5, y + 0.8, cz + 0.5); p.vel.set(0, 0, 0);
      v.step(0.05, 2);
      const dim = G.dim;
      await v.waitLoaded();
      return { with11, busy, keptBusy, put, with12, center, used, afterBreak, again, dim, pos: [p.pos.x, p.pos.y, p.pos.z], floor: v.getBlock(100, 48, 0), air: v.getBlock(100, 49, 0), ach: !!v.ach.got.the_end };
    });
    expect(r.with11).toBe(0);
    expect(r.busy).toBe(null);
    expect(r.keptBusy).toBe(2);
    expect(r.put).toBe('eye_frame');
    expect(r.with12).toBe(9);
    expect(r.used).toBe(1);
    expect(r.afterBreak).toBe(0);
    expect(r.again).toBe(9);
    expect(r.dim).toBe('end');
    expect(r.pos).toEqual([100.5, 49, 0.5]);
    expect(r.floor).toBe(await page.evaluate(() => __voxel.core.B.obsidian));
    expect(r.air).toBe(0);
    expect(r.ach).toBe(true);
  });

  test('Край: остров из камня Края, 10 обсидиановых колонн с кристаллами на бедроке, дракон с полосой здоровья, чаша выходного портала; при повторном входе дракон не двоится', async ({ page }) => {
    await world(page);
    const r = await page.evaluate(async () => {
      const v = __voxel, C = v.core, EG = v.VX.endgame, E = v.entities, B = C.B, G = v.game;
      await toEnd();
      const mobs = () => E.mobs.filter((m) => m.deadT === 0).map((m) => m.type).sort();
      const first = mobs();
      await new Promise((rr) => setTimeout(rr, 200));
      const bar = document.getElementById('bossbar');
      const barShown = getComputedStyle(bar).display !== 'none', barText = bar.textContent;
      const pillars = C.endPillars(v.world.seed);
      const onBedrock = E.mobs.filter((m) => m.type === 'end_crystal').every((m) => pillars.some((pl) => Math.abs(m.x - pl.x - 0.5) < 0.01 && Math.abs(m.z - pl.z - 0.5) < 0.01 && m.y === pl.h + 1));
      const seed = v.world.seed;
      const col = (x, z) => { const d = C.generate(seed, Math.floor(x / 16), Math.floor(z / 16), 'end'); const out = []; for (let y = 0; y < C.CH; y++) out.push(d[C.cidx(((x % 16) + 16) % 16, y, ((z % 16) + 16) % 16)]); return out; };
      const c20 = col(20, 5), pl = pillars[0], cp = col(pl.x, pl.z), c0 = col(0, 0), c2 = col(2, 0), cfar = col(300, 0);
      const endStone = c20.filter((q) => q === C.END_STONE).length;
      const pillarTop = cp[pl.h], pillarObs = cp.slice(C.END_Y, pl.h).every((q) => q === B.obsidian);
      const bowl = [c2[C.END_Y], c2[C.END_Y + 1], c0[C.END_Y + 4]];
      // выйти домой и снова войти: дракон и кристаллы те же
      const d0 = E.mobs.find((m) => m.type === 'ender_dragon'); d0.hp = 150;
      EG.goHome(); await v.waitLoaded();
      const home = G.dim;
      await toEnd();
      const second = mobs(), hp = E.mobs.find((m) => m.type === 'ender_dragon').hp;
      return { first, barShown, barText, onBedrock, endStone, pillarTop, pillarObs, bowl, bedrock: B.bedrock, empty: cfar.every((q) => q === 0), home, second, hp };
    });
    expect(r.first.filter((t) => t === 'end_crystal').length).toBe(10);
    expect(r.first.filter((t) => t === 'ender_dragon').length).toBe(1);
    expect(r.barShown).toBe(true);
    expect(r.barText).toContain('Эндер-дракон');
    expect(r.onBedrock).toBe(true);
    expect(r.endStone).toBeGreaterThan(10);
    expect(r.pillarTop).toBe(r.bedrock);
    expect(r.pillarObs).toBe(true);
    expect(r.bowl).toEqual([r.bedrock, 0, r.bedrock]);
    expect(r.empty).toBe(true);
    expect(r.home).toBe('over');
    expect(r.second).toEqual(r.first);
    expect(r.hp).toBeGreaterThanOrEqual(150);
  });

  test('дракон: кристалл рядом лечит (2 в секунду), взрыв лечащего кристалла - дракону 10 урона, взрывы дракона не берут; касание - 10 урона и отброс; время от времени пикирует на героя', async ({ page }) => {
    await world(page);
    const r = await page.evaluate(async () => {
      const v = __voxel, C = v.core, EG = v.VX.endgame, E = v.entities, p = v.player;
      await toEnd();
      await near(0.5, C.END_Y + 3, 12.5);
      p.flying = false;
      const d = E.mobs.find((m) => m.type === 'ender_dragon');
      const cr = E.mobs.filter((m) => m.type === 'end_crystal');
      // взрыв рядом (сила 4) дракона не ранит - над центром, вдали от кристаллов
      d.x = 0.5; d.y = C.END_Y + 20; d.z = 0.5; d.hp = 100;
      v.VX.explode(1, C.END_Y + 21, 1.5, 4, {}); const blast = 100 - d.hp;
      // лечение: 1 с рядом с кристаллом
      const hold = () => { d.x = cr[0].x + 6; d.y = cr[0].y + 2; d.z = cr[0].z; d.vx = d.vy = d.vz = 0; };
      hold(); v.step(0.05, 1); hold();
      const healer = d.healer === cr[0].id;
      for (let k = 0; k < 20; k++) { v.step(0.05); hold(); }
      const healed = d.hp - 100;
      // стрела в лечащий кристалл
      const hp0 = d.hp; d.healT = 0;
      v.entities.shootArrow(cr[0].x - 3, cr[0].y + 1, cr[0].z, 30, 0, 0, 'player', 6);
      for (let k = 0; k < 10 && cr[0].deadT === 0; k++) { v.step(0.05); hold(); }
      const crystalHit = hp0 - d.hp, left = E.mobs.filter((m) => m.type === 'end_crystal' && m.deadT === 0).length;
      // касание
      d.x = p.pos.x - 1.5; d.y = p.pos.y - 1; d.z = p.pos.z; d.vx = d.vy = d.vz = 0; d.hitT = 0; p.health = 20; p.hurtCool = 0;
      v.step(0.05, 1);
      const touched = 20 - p.health, kick = Math.hypot(p.vel.x, p.vel.z);
      // пике: по окончании круга
      p.health = 20; d.x = 40; d.y = C.END_Y + 26; d.z = 0; d.mode = 'circle'; d.modeT = 0.01;
      v.step(0.05, 1);
      const dive = d.mode;
      const d1 = Math.hypot(d.x - p.pos.x, d.z - p.pos.z); v.step(0.05, 20); const d2 = Math.hypot(d.x - p.pos.x, d.z - p.pos.z);
      return { healer, healed, blast, crystalHit, left, touched, kick, dive, closer: d1 - d2 };
    });
    expect(r.healer).toBe(true);
    expect(r.healed).toBeGreaterThanOrEqual(2);
    expect(r.healed).toBeLessThanOrEqual(3);
    expect(r.blast).toBe(0);
    expect(r.crystalHit).toBe(10);
    expect(r.left).toBe(9);
    expect(r.touched).toBe(10);
    expect(r.kick).toBeGreaterThan(5);
    expect(r.dive).toBe('dive');
    expect(r.closer).toBeGreaterThan(5);
  });

  test('победа: «Освобождение Края» сразу, 10 секунд гибели и 12000 опыта, выходной портал в чаше и яйцо на колонне; выход домой - титры (финал), играть дальше; второй выход - без титров', async ({ page }) => {
    await world(page);
    const r = await page.evaluate(async () => {
      const v = __voxel, C = v.core, EG = v.VX.endgame, E = v.entities, p = v.player, G = v.game, XP = v.VX.xp;
      await toEnd();
      await near(12.5, C.END_Y + 3, 12.5);
      p.flying = false;
      let xp = 0; const sp = XP.spawn; XP.spawn = (x, y, z, n) => { xp += Math.floor(n); return sp(x, y, z, n); };
      const d = E.mobs.find((m) => m.type === 'ender_dragon');
      d.hurtT = 0; E.hurtMob(d, 1000, 0, 0, 'player');
      const free = !!v.ach.got.free_end, killed = v.meta.endFight.dragonKilled, y0 = d.y;
      v.step(0.05, 100);
      const mid = { still: E.mobs.includes(d), rose: d.y - y0, portal: v.getBlock(1, C.END_Y + 1, 0) };
      v.step(0.05, 110);
      XP.spawn = sp;
      let cells = 0; for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) if (v.getBlock(dx, C.END_Y + 1, dz) === C.END_PORTAL) cells++;
      const egg = v.getBlock(0, C.END_Y + 5, 0), gone = !E.mobs.includes(d);
      // в выходной портал
      p.pos.set(1.5, C.END_Y + 1.1, 0.5); p.vel.set(0, 0, 0);
      v.step(0.05, 2);
      const dim = G.dim;
      await new Promise((rr) => { const t = setInterval(() => { if (G.state !== 'loading') { clearInterval(t); rr(); } }, 30); });
      await new Promise((rr) => setTimeout(rr, 300));
      return { free, killed, mid, xp, cells, egg, gone, dim, state: G.state, won: v.meta.won, credits: !!v.ach.got.the_end2, EGG: C.DRAGON_EGG, P: C.END_PORTAL };
    });
    expect(r.free).toBe(true);
    expect(r.killed).toBe(true);
    expect(r.mid.still).toBe(true);
    expect(r.mid.rose).toBeGreaterThan(2);
    expect(r.mid.portal).not.toBe(r.P);
    expect(r.xp).toBe(12000);
    expect(r.cells).toBe(20);
    expect(r.egg).toBe(r.EGG);
    expect(r.gone).toBe(true);
    expect(r.dim).toBe('over');
    expect(r.state).toBe('victory');
    expect(r.won).toBe(true);
    expect(r.credits).toBe(true);
    await expect(page.locator('#scr-victory')).toBeVisible();
    await expect(page.locator('#scr-victory')).toContainText('Победа!');
    await expect(page.locator('#scr-victory')).toContainText('Эндер-дракон повержен');
    await page.locator('#scr-victory').getByText('Продолжить игру').click();
    expect(await page.evaluate(() => __voxel.state)).toBe('play');
    // снова в Край: дракона нет, портал и яйцо на месте; второй выход - без титров
    const r2 = await page.evaluate(async () => {
      const v = __voxel, C = v.core, EG = v.VX.endgame, E = v.entities, p = v.player, G = v.game;
      await toEnd();
      await near(6.5, C.END_Y + 3, 6.5);
      v.step(0.05, 25);
      const dragons = E.mobs.filter((m) => m.type === 'ender_dragon').length, portal = v.getBlock(1, C.END_Y + 1, 0);
      p.flying = false; p.pos.set(1.5, C.END_Y + 1.1, 0.5); p.vel.set(0, 0, 0); v.step(0.05, 2);
      await new Promise((rr) => { const t = setInterval(() => { if (G.state !== 'loading') { clearInterval(t); rr(); } }, 30); });
      await new Promise((rr) => setTimeout(rr, 300));
      return { dragons, portal, P: C.END_PORTAL, dim: G.dim, state: G.state };
    });
    expect(r2.dragons).toBe(0);
    expect(r2.portal).toBe(r2.P);
    expect(r2.dim).toBe('over');
    expect(r2.state).toBe('play');
  });

  test('эндермен: взгляд в лицо злит (мимо - нет, в творческом - нет), от стрелы уходит телепортом без урона, удар злит, бьёт на 7, выпадает жемчуг; в Краю появляются на камне Края', async ({ page }) => {
    await world(page);
    const r = await page.evaluate(async () => {
      const v = __voxel, C = v.core, E = v.entities, p = v.player, G = v.game, I = v.data.I;
      const { x0, z0 } = base();
      const e = v.spawnMob('enderman', 0, -6);
      const look = (dy) => aim(e.x, e.y + dy, e.z);
      look(0.5); v.step(0.05, 2); const atFeet = !!(e.angry > 0);
      G.mode = 'creative'; look(2.6); v.step(0.05, 2); const creative = !!(e.angry > 0); G.mode = 'survival';
      look(2.6); v.step(0.05, 1); const stared = !!(e.angry > 0);
      // стрела
      const e2 = v.spawnMob('enderman', 4, -6); const x1 = e2.x, z1 = e2.z, hp = e2.hp;
      E.shootArrow(p.pos.x + 4, e2.y + 1.5, p.pos.z - 2, 0, 0, -30, 'player', 6);
      v.step(0.05, 6);
      const dodged = { hp: e2.hp === hp, moved: Math.hypot(e2.x - x1, e2.z - z1) > 0.5 };
      // удар
      const e3 = v.spawnMob('enderman', 0, 2); e3.y = p.pos.y;
      v.inv.slots[0] = null; v.look(Math.PI, 0); e3.x = p.pos.x; e3.z = p.pos.z + 2;
      E.attack();
      const hitAngry = !!(e3.angry > 0);
      // бьёт на 7
      E.clear(); p.health = 20; p.hurtCool = 0;
      const e4 = v.spawnMob('enderman', 0, -1); e4.y = p.pos.y; e4.angry = 30; e4.attackCool = 0;
      v.step(0.05, 2);
      const bit = 20 - p.health;
      // выпадение
      const drops = [];
      for (let k = 0; k < 12; k++) { E.clear(); const q = v.spawnMob('enderman', 0, -2); q.y = p.pos.y; E.hurtMob(q, 100, p.pos.x, p.pos.z, 'player'); for (const it of E.items) drops.push(it.stack.id); }
      // в Краю
      await toEnd(); G.autoSpawn = true;
      await near(20.5, C.END_Y + 6, 20.5); p.flying = true;
      for (let k = 0; k < 200 && !E.mobs.some((m) => m.type === 'enderman'); k++) v.step(0.05, 20);
      const en = E.mobs.find((m) => m.type === 'enderman');
      const onEnd = en && v.getBlock(Math.floor(en.x), Math.floor(en.y) - 1, Math.floor(en.z)) === C.END_STONE;
      return { atFeet, creative, stared, dodged, hitAngry, bit, pearls: drops.filter((q) => q === I.ender_pearl).length, other: drops.filter((q) => q !== I.ender_pearl).length, onEnd };
    });
    expect(r.atFeet).toBe(false);
    expect(r.creative).toBe(false);
    expect(r.stared).toBe(true);
    expect(r.dodged).toEqual({ hp: true, moved: true });
    expect(r.hitAngry).toBe(true);
    expect(r.bit).toBe(7);
    expect(r.pearls).toBeGreaterThan(0);
    expect(r.other).toBe(0);
    expect(r.onEnd).toBe(true);
  });

  test('без утечек: три круга дракон, 10 кристаллов, 8 эндерменов, очи и жемчуг в полёте - число геометрий не растёт', async ({ page }) => {
    await world(page, 'creative');
    const frames = (n) => page.evaluate((n) => new Promise((rr) => { let k = 0; const f = () => (++k >= n ? rr() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
    const geo = () => page.evaluate(() => { const v = __voxel; return v.game.renderer.info.memory.geometries - v.counts().draws - v.world.trash.length; });
    const round = async () => {
      await page.evaluate(() => {
        const v = __voxel, p = v.player, E = v.entities, EG = v.VX.endgame, I = v.data.I;
        const d = E.spawnMob('ender_dragon', p.pos.x, p.pos.y + 6, p.pos.z - 12);
        for (let k = 0; k < 10; k++) E.spawnMob('end_crystal', p.pos.x + k * 2 - 9, p.pos.y, p.pos.z - 8);
        for (let k = 0; k < 8; k++) E.spawnMob('enderman', p.pos.x + k - 4, p.pos.y, p.pos.z - 5);
        const s = EG.nearestStronghold(p.pos.x, p.pos.z);
        v.look(Math.atan2(-(s.x - p.pos.x), -(s.z - p.pos.z)), 0.3);        // очи летят в кадре
        hold(I.ender_pearl, 16);
        for (let k = 0; k < 4; k++) { v.game.pearlCool = 0; v.place(); }
        hold(I.eye_of_ender, 16); for (let k = 0; k < 4; k++) v.place();
        d.mode = 'circle';
      });
      await frames(4);
      const n = await geo();
      await page.evaluate(() => { __voxel.entities.clear(); __voxel.VX.endgame.reset(); });
      await frames(4);
      return n;
    };
    const a = await round(), b = await round(), c = await round();
    const after = await geo();
    expect(b - a).toBeLessThanOrEqual(5);
    expect(c - a).toBeLessThanOrEqual(5);
    expect(after).toBeLessThan(a);
  });

  test('жемчуг Края: бросок переносит героя туда, где он упал, с уроном 5; перезарядка секунда; битва в Краю переживает сохранение', async ({ page }) => {
    await world(page);
    const r = await page.evaluate(async () => {
      const v = __voxel, C = v.core, E = v.entities, p = v.player, G = v.game, I = v.data.I;
      const { x0, z0 } = base();
      hold(I.ender_pearl, 3);
      p.health = 20; p.hurtCool = 0;
      aim(x0 + 0.5, 69, z0 - 5.5);
      const thrown = v.place(), again = v.place();
      for (let k = 0; k < 40 && v.VX.endgame.flying.length; k++) v.step(0.05);
      const L = v.VX.endgame.landed;
      const at = [p.pos.x - x0, p.pos.y, p.pos.z - z0], off = Math.hypot(p.pos.x - L.x, p.pos.z - L.z), hurt = 20 - p.health, left = v.inv.slots[0].count;
      // сохранение битвы
      await toEnd();
      const d = E.mobs.find((m) => m.type === 'ender_dragon'); d.hp = 77;
      const cr = E.mobs.find((m) => m.type === 'end_crystal'); E.hurtMob(cr, 5, 0, 0, 'arrow');
      const id = v.meta.id; await v.flush(); await v.exitToTitle(); await v.openWorld(id);
      const d2 = E.mobs.find((m) => m.type === 'ender_dragon');
      return { thrown, again, at, off, hurt, left, dim: G.dim, hp: d2 && d2.hp, crystals: E.mobs.filter((m) => m.type === 'end_crystal').length, fight: v.meta.endFight };
    });
    expect(r.thrown).toBe('pearl');
    expect(r.again).toBe(null);
    expect(Math.abs(r.at[0] - 0.5)).toBeLessThan(0.8);
    expect(r.at[2]).toBeGreaterThan(-12);
    expect(r.at[2]).toBeLessThan(-2);
    expect(r.off).toBeLessThan(0.3);
    expect(r.at[1]).toBeGreaterThanOrEqual(70);
    expect(r.at[1]).toBeLessThan(71);
    expect(r.hurt).toBe(5);
    expect(r.left).toBe(2);
    expect(r.dim).toBe('end');
    expect(r.hp).toBeGreaterThanOrEqual(77);
    expect(r.hp).toBeLessThan(90);
    expect(r.crystals).toBe(9);
    expect(r.fight.started).toBe(true);
    expect(r.fight.dragonKilled).toBe(false);
  });
});
