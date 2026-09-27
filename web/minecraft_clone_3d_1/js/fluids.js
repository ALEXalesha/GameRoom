// Жидкости как в оригинале: источник и течение с уровнями (вода растекается на 7 клеток,
// лава - на 3), падающий столб, бесконечный источник 2x2 (текущая вода между двумя источниками
// над опорой сама становится источником), вода и лава дают обсидиан, булыжник или камень.
// Вода обновляется раз в 0.25 с, лава - раз в 1.5 с. Лава поджигает горючее рядом: огонь
// горит несколько секунд и может сжечь блок, на котором стоит.
(function () {
  'use strict';
  const VX = window.VX;
  const C = VX.core, B = C.B;
  const G = VX.game;
  const FL = C.FLUID, LV = C.FLEVEL, FF = C.FFALL;
  const WATER = 1, LAVA = 2;
  const SRC = [0, B.water, B.lava], FALL = [0, 79, 84];
  const STEP = [0, 1, 2], MAX = [0, 7, 6], PERIOD = [0, 0.25, 1.5];
  const flowing = (fam, lvl) => (fam === WATER ? 71 + lvl : 80 + lvl / 2);
  const isSource = (id) => id === B.water || id === B.lava;
  const REPLACEABLE = new Set([0, B.tall_grass, B.dead_bush, B.dandelion, B.poppy, B.blue_flower, B.torch, 52, 53, 54, 55, B.fire, 64, 65, 66, 67, 68, 69, 70, 71, 130, 131]);
  const FLAMMABLE = new Set([B.oak_planks, B.birch_planks, B.spruce_planks, B.oak_log, B.birch_log, B.spruce_log, B.oak_leaves, B.birch_leaves, B.spruce_leaves,
    B.wool_white, B.wool_red, B.wool_blue, B.wool_yellow, B.wool_green, B.wool_black, B.bookshelf, B.tall_grass, B.dead_bush, B.crafting_table, 122, 123, 124, 125, 126, 127, 128, 129]);

  const queues = [null, new Set(), new Set()];
  const timers = [0, 0, 0];
  const key = (x, y, z) => x + ',' + y + ',' + z;
  const get = (x, y, z) => G.world.getBlock(x, y, z);
  function set(x, y, z, id) {
    const old = get(x, y, z);
    if (old === id || old < 0) return false;
    if (old > 0 && !FL[old] && REPLACEABLE.has(old) && old !== B.fire && G.popDrops) G.popDrops(old, x, y, z);   // вода смывает факел, цветы, посевы
    G.world.setBlock(x, y, z, id);
    if (id === B.fire) fires.set(key(x, y, z), 0); else fires.delete(key(x, y, z));
    return true;
  }
  function schedule(x, y, z) {
    const id = get(x, y, z);
    if (id > 0 && FL[id]) queues[FL[id]].add(key(x, y, z));
  }
  // Блок рядом изменился (сломали, поставили, вылили ведро) - будим жидкость вокруг
  function touch(x, y, z) {
    schedule(x, y, z);
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) schedule(x + dx, y + dy, z + dz);
  }
  function wake(x, y, z) { touch(x, y, z); }
  const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  // Можно ли жидкости fam занять клетку с блоком id на уровне lvl
  function canFill(id, fam, lvl) {
    if (id < 0) return false;
    if (REPLACEABLE.has(id)) return true;
    if (FL[id] === fam) return !isSource(id) && !FF[id] && LV[id] > lvl;
    return false;
  }

  function update(x, y, z) {
    let id = get(x, y, z);
    const fam = FL[id];
    if (!fam || id < 0) return;
    // встреча воды и лавы: лава застывает
    if (fam === LAVA) {
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]]) {
        if (FL[Math.max(0, get(x + dx, y + dy, z + dz))] === WATER) { set(x, y, z, isSource(id) ? B.obsidian : B.cobblestone); VX.audio.play('fizz'); touch(x, y, z); return; }
      }
      lavaCells.add(key(x, y, z));
    }
    if (!isSource(id)) {
      const above = get(x, y + 1, z);
      let want;
      if (FL[above] === fam) want = FALL[fam];
      else {
        let best = 99, sources = 0;
        for (const [dx, dz] of SIDES) {
          const n = get(x + dx, y, z + dz);
          if (FL[n] !== fam) continue;
          if (isSource(n)) sources++;
          const l = isSource(n) || FF[n] ? 0 : LV[n];
          best = Math.min(best, l + STEP[fam]);
        }
        const below = get(x, y - 1, z);
        if (fam === WATER && sources >= 2 && (C.SOLID[Math.max(0, below)] || below === B.water)) want = B.water;
        else if (best > MAX[fam]) want = 0;
        else want = flowing(fam, best);
      }
      if (want !== id) {
        set(x, y, z, want);
        touch(x, y, z);
        if (!want) return;
        id = want;
      }
    }
    // вниз - в первую очередь
    const bl = get(x, y - 1, z);
    if (y > 0 && bl >= 0) {
      // застывание не останавливает саму жидкость: она перепроверится и растечётся дальше
      if (fam === LAVA && FL[bl] === WATER) { set(x, y - 1, z, B.stone); VX.audio.play('fizz'); schedule(x, y, z); return; }
      if (fam === WATER && FL[bl] === LAVA) { set(x, y - 1, z, isSource(bl) ? B.obsidian : B.cobblestone); VX.audio.play('fizz'); schedule(x, y, z); return; }
      if (REPLACEABLE.has(bl) || (FL[bl] === fam && !isSource(bl) && !FF[bl])) { set(x, y - 1, z, FALL[fam]); touch(x, y - 1, z); return; }
      if (FL[bl] === fam) return;                  // жидкость на жидкости вбок не растекается
    }
    const my = isSource(id) || FF[id] ? 0 : LV[id];
    const next = my + STEP[fam];
    if (next > MAX[fam]) return;
    for (const [dx, dz] of SIDES) {
      const n = get(x + dx, y, z + dz);
      if (fam === LAVA && FL[n] === WATER) { set(x + dx, y, z + dz, B.stone); VX.audio.play('fizz'); touch(x + dx, y, z + dz); continue; }
      if (fam === WATER && FL[n] === LAVA) { set(x + dx, y, z + dz, isSource(n) ? B.obsidian : B.cobblestone); VX.audio.play('fizz'); touch(x + dx, y, z + dz); continue; }
      if (canFill(n, fam, next)) { set(x + dx, y, z + dz, flowing(fam, next)); schedule(x + dx, y, z + dz); }
    }
    // лава поджигает горючее рядом
    if (fam === LAVA && Math.random() < 0.3) igniteNear(x, y, z);
  }
  function igniteNear(x, y, z) {
    for (let k = 0; k < 3; k++) {
      const X = x + ((Math.random() * 5) | 0) - 2, Y = y + ((Math.random() * 3) | 0), Z = z + ((Math.random() * 5) | 0) - 2;
      if (get(X, Y, Z) !== 0) continue;
      let burn = false;
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) if (FLAMMABLE.has(get(X + dx, Y + dy, Z + dz))) burn = true;
      if (burn) { set(X, Y, Z, B.fire); return; }
    }
  }

  // ---------- Огонь ----------
  const fires = new Map();      // клетка -> сколько горит
  const lavaCells = new Set();  // лава, которую видели: она случайно поджигает горючее и в покое, как в оригинале
  function lavaRandomTicks() {
    let n = 0;
    for (const k of lavaCells) {
      if (n++ > 60) break;
      const [x, y, z] = k.split(',').map(Number);
      if (FL[Math.max(0, get(x, y, z))] !== LAVA) { lavaCells.delete(k); continue; }
      if (Math.random() < 0.3) igniteNear(x, y, z);
    }
  }
  function tickFires(dt) {
    for (const [k, age] of fires) {
      const [x, y, z] = k.split(',').map(Number);
      if (get(x, y, z) !== B.fire) { fires.delete(k); continue; }
      const t = age + dt;
      fires.set(k, t);
      let fuel = null;
      for (const [dx, dy, dz] of [[0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]]) if (FLAMMABLE.has(get(x + dx, y + dy, z + dz))) { fuel = [x + dx, y + dy, z + dz]; break; }
      if (!fuel && t > 1) { set(x, y, z, 0); continue; }
      if (t > 3 + ((x * 7 + z * 13) & 3)) {
        set(x, y, z, 0);
        if (fuel && Math.random() < 0.6) { set(fuel[0], fuel[1], fuel[2], Math.random() < 0.5 ? B.fire : 0); touch(fuel[0], fuel[1], fuel[2]); }
      }
    }
  }

  function tick(dt) {
    for (const fam of [WATER, LAVA]) {
      timers[fam] += dt;
      if (timers[fam] < PERIOD[fam]) continue;
      timers[fam] = 0;
      if (fam === LAVA) lavaRandomTicks();
      const q = queues[fam];
      if (!q.size) continue;
      const cells = [...q].slice(0, 3000);
      for (const c of cells) q.delete(c);
      for (const c of cells) { const [x, y, z] = c.split(',').map(Number); update(x, y, z); }
    }
    tickFires(dt);
  }
  function reset(meta) {
    queues[1].clear(); queues[2].clear(); fires.clear(); lavaCells.clear();
    for (const k of (meta && meta.fires) || []) fires.set(k, 0);
  }
  function save(meta) { meta.fires = [...fires.keys()].slice(0, 500); }
  const pending = () => queues[1].size + queues[2].size;

  VX.fluids = { tick, touch, wake, update, reset, save, pending, fires, FLAMMABLE, REPLACEABLE, isSource, flowing, SRC, FALL };
})();
