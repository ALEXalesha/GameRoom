// Законы «Кубического мира»: погода - ясно, дождь, гроза; снег в холодных биомах и высоко, в пустыне
// осадков нет; плавные переходы и смена раз в несколько дней, сохранение; капли не под крышей;
// небо, туман и свет темнее; звуки; молнии (вспышка, гром с задержкой, огонь, урон, свинья); дождь
// гасит огонь; переключатель в меню паузы творческого режима, настройка частиц; без утечек.
const { test, expect } = require('@playwright/test');
const { openVoxel, newWorld, flatArena } = require('./_voxel-helpers');

test.describe.configure({ timeout: 120000 });

async function world(page, mode = 'survival', seed = 8) {
  await openVoxel(page);
  await newWorld(page, { seed, mode });
  await page.evaluate(() => { __voxel.game.autoSpawn = false; __voxel.entities.clear(); __voxel.game.ticks = 6000; });
  await flatArena(page, 70, 7);
}
const frames = (page, n) => page.evaluate((n) => new Promise((rr) => { let k = 0; const f = () => (++k >= n ? rr() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

test.describe('minecraft_clone_3d_1: погода', () => {
  test('погода по кругу: ясно 1-4 дня, дождь и гроза полдня-день, после дождя - ясно; переход плавный (около 15 с); погода хранится в мире', async ({ page }) => {
    await world(page);
    const r = await page.evaluate(async () => {
      const v = __voxel, W = v.VX.weather, G = v.game;
      W.R.rnd = () => 0.5;
      const dur = { clear: W.duration('clear') / 24000, rain: W.duration('rain') / 24000 };
      W.R.rnd = () => 0; const lo = { clear: W.duration('clear') / 24000, rain: W.duration('rain') / 24000 };
      W.R.rnd = () => 0.999; const hi = { clear: W.duration('clear') / 24000, rain: W.duration('rain') / 24000 };
      W.R.rnd = () => 0.1; const after = { clear: W.next('clear'), rain: W.next('rain') };
      W.R.rnd = () => 0.9; const after2 = W.next('clear');
      W.R.rnd = Math.random;
      W.set('clear', 100000); W.state().rain = 0;
      W.set('rain', 50000);
      v.step(0.05, 100);                                  // 5 секунд
      const mid = W.state().rain;
      v.step(0.05, 220);
      const full = W.state().rain;
      // срок вышел - смена
      W.state().t = 0.5; v.step(0.05, 2);
      const changed = W.state().kind;
      // сохранение
      W.set('thunder', 30000); W.state().rain = 1; W.state().thunder = 1;
      const id = v.meta.id; await v.flush(); await v.exitToTitle(); await v.openWorld(id);
      return { dur, lo, hi, after, after2, mid, full, changed, kept: W.state().kind, rain: W.state().rain };
    });
    expect(r.lo.clear).toBeCloseTo(1, 2); expect(r.hi.clear).toBeLessThanOrEqual(4); expect(r.hi.clear).toBeGreaterThan(3.9);
    expect(r.lo.rain).toBeCloseTo(0.5, 2); expect(r.hi.rain).toBeLessThanOrEqual(1);
    expect(r.after.clear).toBe('thunder'); expect(r.after2).toBe('rain'); expect(r.after.rain).toBe('clear');
    expect(r.mid).toBeGreaterThan(0.25); expect(r.mid).toBeLessThan(0.45);
    expect(r.full).toBe(1);
    expect(r.changed).toBe('clear');
    expect(r.kept).toBe('thunder');
    expect(r.rain).toBe(1);
  });

  test('что выпадает: в пустыне ничего, в снежной тундре и выше 100 - снег, на равнине - дождь; в Нижнем мире погоды нет', async ({ page }) => {
    await world(page);
    const r = await page.evaluate(() => {
      const v = __voxel, W = v.VX.weather, C = v.core, wd = C.worldOf(v.world.seed, v.world.gen);
      const find = (bi) => { for (let r = 0; r < 4000; r += 16) for (let a = 0; a < 6.28; a += 0.4) { const x = Math.round(Math.cos(a) * r), z = Math.round(Math.sin(a) * r); if (C.column(wd, x, z).biome === bi) return [x, z]; } return null; };
      const des = find(2), snow = find(3), pl = find(0);
      return { des: des && W.precipAt(des[0], 70, des[1]), snow: snow && W.precipAt(snow[0], 70, snow[1]), plain: pl && W.precipAt(pl[0], 70, pl[1]), high: pl && W.precipAt(pl[0], 110, pl[1]), found: [!!des, !!snow, !!pl] };
    });
    expect(r.found).toEqual([true, true, true]);
    expect(r.des).toBe(null);
    expect(r.snow).toBe('snow');
    expect(r.plain).toBe('rain');
    expect(r.high).toBe('snow');
  });

  test('капли вокруг камеры падают, но не под крышей: каждая видимая капля выше верхнего блока своего столбца; под сплошной крышей ниже неё - ни одной; настройка «Частицы» 0 - выкл, 1 - мало', async ({ page }) => {
    await world(page);
    const r = await page.evaluate(async () => {
      const v = __voxel, W = v.VX.weather, G = v.game, B = v.core.B, p = v.player;
      const wait = (ms) => new Promise((rr) => setTimeout(rr, ms));
      W.set('rain', 99999); W.state().rain = 1;
      v.look(0, 0.3);
      // навес 5x5 над головой
      const x0 = Math.floor(p.pos.x), z0 = Math.floor(p.pos.z);
      for (let x = x0 - 2; x <= x0 + 2; x++) for (let z = z0 - 2; z <= z0 + 2; z++) v.setBlock(x, 74, z, B.oak_planks);
      await wait(800);
      const pos = W.drops ? null : null;
      // все нарисованные капли - выше верха своего столбца
      const rm = G.scene.children.find((o) => o.isLineSegments && o.material && o.material.color && o.material.color.getHex() === 0x8aa8d8);
      const a = rm.geometry.attributes.position, n = rm.geometry.drawRange.count;
      let bad = 0, under = 0;
      for (let i = 0; i < n; i += 2) { const x = a.getX(i), y = a.getY(i), z = a.getZ(i); if (y < v.world.skyTop(Math.floor(x), Math.floor(z)) + 1 - 0.01) bad++; if (Math.abs(x - x0 - 0.5) < 2 && Math.abs(z - z0 - 0.5) < 2 && y < 74) under++; }
      const shown = n / 2;
      // сплошная крыша над всей коробкой капель
      for (let x = x0 - 16; x <= x0 + 16; x++) for (let z = z0 - 16; z <= z0 + 16; z++) v.setBlock(x, 76, z, B.stone);
      await wait(1200);
      let roofed = 0; const n2 = rm.geometry.drawRange.count;
      for (let i = 0; i < n2; i += 2) if (a.getY(i) < 77 - 0.01) roofed++;           // ниже крыши - ни одной (над ней - можно)
      for (let x = x0 - 16; x <= x0 + 16; x++) for (let z = z0 - 16; z <= z0 + 16; z++) v.setBlock(x, 76, z, 0);
      G.settings.particles = 1; await wait(800); const low = G.weatherDrops.rain;
      G.settings.particles = 0; await wait(300);
      const off = G.scene.children.some((o) => (o.isLineSegments || o.isPoints) && o.visible && o.material && o.material.color && [0x8aa8d8, 0xffffff].includes(o.material.color.getHex()) && o.geometry.drawRange.count > 0 && o.geometry.attributes.position.count > 100);
      return { shown, bad, under, roofed, low, off };
    });
    expect(r.shown).toBeGreaterThan(300);
    expect(r.bad).toBe(0);
    expect(r.under).toBe(0);
    expect(r.roofed).toBe(0);
    expect(r.low).toBeGreaterThan(50); expect(r.low).toBeLessThanOrEqual(500);
    expect(r.off).toBe(false);
  });

  test('в дождь и грозу небо, туман и свет темнее (немного), звук дождя; снегопад - достижение «Белые мухи»', async ({ page }) => {
    await world(page);
    const r = await page.evaluate(async () => {
      const v = __voxel, W = v.VX.weather, G = v.game, wait = (ms) => new Promise((rr) => setTimeout(rr, ms));
      G.ticks = 6000; W.set('clear', 99999); W.state().rain = 0; W.state().thunder = 0;
      await wait(300);
      const fogLum = () => { const c = G.scene.fog.color; return c.r + c.g + c.b; };
      const clear = { day: G.dayLight, fog: fogLum() };
      W.set('thunder', 99999); W.state().rain = 1; W.state().thunder = 1;
      const rain0 = v.VX.audio.counts.rain || 0;
      v.step(0.05, 30);
      await wait(300);
      const storm = { day: G.dayLight, fog: fogLum() };
      // снег: игрок высоко, под открытым небом
      const p = v.player; p.flying = true; p.pos.y = 112; v.step(0.05, 25);
      return { clear, storm, rainSounds: (v.VX.audio.counts.rain || 0) - rain0, snow: !!v.ach.got.snowfall };
    });
    expect(r.storm.day).toBeLessThan(r.clear.day * 0.6);
    expect(r.storm.day).toBeGreaterThan(r.clear.day * 0.3);
    expect(r.storm.fog).toBeLessThan(r.clear.fog);
    expect(r.rainSounds).toBeGreaterThan(0);
    expect(r.snow).toBe(true);
  });

  test('молния: вспышка, гром с задержкой по расстоянию, поджигает траву, рядом - 5 урона и огонь, свинья становится зомби-свиночеловеком; «Гром и молния»; в пустыне не бьёт', async ({ page }) => {
    await world(page);
    const r = await page.evaluate(() => {
      const v = __voxel, W = v.VX.weather, G = v.game, B = v.core.B, p = v.player, E = v.entities, C = v.core;
      const x0 = Math.floor(p.pos.x), z0 = Math.floor(p.pos.z);
      W.R.rnd = () => 0;
      // удар в траву в 10 блоках
      v.setBlock(x0 + 10, 69, z0, B.grass);
      for (let y = 70; y < 90; y++) v.setBlock(x0 + 10, y, z0, 0);
      const t0 = v.VX.audio.counts.thunder || 0;
      const b = W.strike(x0 + 10.5, z0 + 0.5);
      const flash = W.flash, delay = W.thunders[0] && W.thunders[0].t, fire = v.getBlock(x0 + 10, 70, z0) === B.fire;
      v.step(0.05, 2); const early = (v.VX.audio.counts.thunder || 0) - t0;
      v.step(0.05, 10); const later = (v.VX.audio.counts.thunder || 0) - t0;
      // рядом с героем
      p.health = 20; p.hurtCool = 0;
      W.strike(p.pos.x + 1, p.pos.z);
      const hurt = 20 - p.health, burning = p.fireT > 0;
      // свинья
      const pig = v.spawnMob('pig', 4, 0); pig.y = 70;
      W.strike(pig.x, pig.z); v.step(0.05, 15);
      const pigman = E.mobs.some((m) => m.type === 'zombie_pigman' && m.deadT === 0), pigLeft = E.mobs.some((m) => m.type === 'pig' && m.deadT === 0);
      // пустыня
      const wd = C.worldOf(v.world.seed, v.world.gen);
      let des = null; for (let rr = 0; rr < 4000 && !des; rr += 16) for (let a = 0; a < 6.28 && !des; a += 0.4) { const x = Math.round(Math.cos(a) * rr), z = Math.round(Math.sin(a) * rr); if (C.column(wd, x, z).biome === 2) des = [x, z]; }
      const desert = W.precipAt(des[0], 70, des[1]);
      W.R.rnd = Math.random;
      return { bolt: !!b, flash, delay, fire, early, later, hurt, burning, pigman, pigLeft, ach: !!v.ach.got.lightning, desert };
    });
    expect(r.bolt).toBe(true);
    expect(r.flash).toBeGreaterThan(0);
    expect(r.delay).toBeCloseTo(10 / 60, 1);
    expect(r.fire).toBe(true);
    expect(r.early).toBe(0);
    expect(r.later).toBe(1);
    expect(r.hurt).toBe(5);
    expect(r.burning).toBe(true);
    expect(r.pigman).toBe(true);
    expect(r.pigLeft).toBe(false);
    expect(r.ach).toBe(true);
    expect(r.desert).toBe(null);
  });

  test('в грозу молнии бьют сами (раз в 5-20 с); дождь гасит огонь на герое и на мобе, зомби днём под дождём не горит; в Нижнем мире дождя нет', async ({ page }) => {
    await world(page);
    const r = await page.evaluate(() => {
      const v = __voxel, W = v.VX.weather, G = v.game, p = v.player, E = v.entities;
      W.set('thunder', 99999); W.state().rain = 1; W.state().thunder = 1;
      let strikes = 0; const s0 = W.strike; v.VX.weather.strike = (...a) => { strikes++; return s0(...a); };
      G.on ? 0 : 0;
      const n0 = v.VX.audio.counts.thunder || 0;
      v.step(0.05, 20 * 45);                            // 45 секунд
      const thunders = (v.VX.audio.counts.thunder || 0) - n0;
      v.VX.weather.strike = s0;
      p.fireT = 5; v.step(0.05, 2); const pOut = p.fireT === 0;
      G.ticks = 6000;
      W.set('rain', 99999); W.state().rain = 1; W.state().thunder = 0;       // просто дождь: днём светло, но нежить не горит
      v.step(0.05, 2);
      const day = G.dayLight;
      const z = v.spawnMob('zombie', 3, 0); z.y = 70; z.fireT = 0;
      v.step(0.05, 40);
      const zBurn = z.fireT > 0;
      z.fireT = 5; v.step(0.05, 2); const zOut = z.fireT === 0;
      const over = W.rainingAt(p.pos.x, p.pos.y + 1, p.pos.z);
      G.dim = 'nether'; const nether = W.rainingAt(p.pos.x, p.pos.y + 1, p.pos.z); G.dim = 'over';
      return { thunders, pOut, zBurn, zOut, over, nether, day };
    });
    expect(r.thunders).toBeGreaterThanOrEqual(2);
    expect(r.thunders).toBeLessThanOrEqual(10);
    expect(r.pOut).toBe(true);
    expect(r.day).toBeGreaterThan(0.55);             // при таком свете на солнце зомби горел бы
    expect(r.zBurn).toBe(false);
    expect(r.zOut).toBe(true);
    expect(r.over).toBe(true);
    expect(r.nether).toBe(false);
  });

  test('творческий: кнопка «Погода» в меню паузы по кругу ясно - дождь - гроза; в выживании её нет; настройка «Частицы погоды»', async ({ page }) => {
    await world(page, 'creative');
    await page.evaluate(() => { __voxel.VX.weather.set('clear'); __voxel.game.pause(); });
    const btn = page.locator('#weatherBtn');
    await expect(btn).toBeVisible();
    await expect(btn).toHaveText('Погода: ясно');
    await btn.click();
    await expect(btn).toHaveText('Погода: дождь');
    await btn.click();
    await expect(btn).toHaveText('Погода: гроза');
    expect(await page.evaluate(() => __voxel.VX.weather.state().kind)).toBe('thunder');
    await page.evaluate(() => { __voxel.game.mode = 'survival'; __voxel.VX.ui.show('pause'); });
    await expect(btn).toBeHidden();
    await page.evaluate(() => __voxel.VX.ui.show('settings'));
    await expect(page.locator('#scr-settings')).toContainText('Частицы погоды: Много');
  });

  test('без утечек: три грозы по 6 молний и ливень - число геометрий не растёт', async ({ page }) => {
    await world(page, 'creative');
    const geo = () => page.evaluate(() => { const v = __voxel; return v.game.renderer.info.memory.geometries - v.counts().draws - v.world.trash.length; });
    const round = async () => {
      // без огня от молний (огонь перестраивает сетки кусков - счёт геометрий бы плясал)
      await page.evaluate(() => { const v = __voxel, W = v.VX.weather, p = v.player; W.R.rnd = () => 0.99; W.set('thunder', 99999); W.state().rain = 1; W.state().thunder = 1; for (let k = 0; k < 6; k++) W.strike(p.pos.x + 5 + k, p.pos.z - 8); });
      await frames(page, 4);
      const n = await geo();
      await page.evaluate(() => { __voxel.step(0.05, 10); });
      await frames(page, 4);
      return n;
    };
    const a = await round(), b = await round(), c = await round();
    expect(b - a).toBeLessThanOrEqual(2);
    expect(c - a).toBeLessThanOrEqual(2);
  });
});
