// Зелья по правилам оригинала. Бутылочку наполняешь водой из источника (ПКМ), на варочной стойке
// (топливо - огненный порошок, 20 варок) за 20 секунд: вода + адский нарост = грубое зелье; грубое +
// сверкающий арбуз = исцеление, + сахар = стремительность, + огненная слизь = огнестойкость,
// + золотая морковь = ночное зрение, + огненный порошок = сила. Красный камень - дольше (8 минут),
// светокаменная пыль - сильнее (II), порох - взрывное. Выпить - держать ПКМ; взрывное - бросить.
// Действия: скорость +20% за уровень, сила +3 урона за уровень, огнестойкость, ночное зрение,
// исцеление +4 здоровья за уровень (сразу).
(function () {
  'use strict';
  const VX = window.VX, G = VX.game, C = VX.core, D = VX.data, B = C.B;
  const I = D.I;
  const P = (k) => D.idOf(k);
  const EFF_NAMES = { speed: 'Скорость', strength: 'Сила', fire_resistance: 'Огнестойкость', night_vision: 'Ночное зрение', heal: 'Исцеление' };
  const ROMAN = ['', '', ' II', ' III'];

  // ---------- Рецепты стойки: [из, добавка, во что] ----------
  const BREW = [];
  function add(from, ing, to) { const a = P(from), b = typeof ing === 'number' ? ing : P(ing), c = P(to); if (a && b && c) BREW.push([a, b, c]); }
  add('water_bottle', 'nether_wart', 'awkward');
  add('awkward', 'glistering_melon', 'healing');
  add('awkward', 'sugar', 'swiftness');
  add('awkward', 'magma_cream', 'fire_resistance');
  add('awkward', 'golden_carrot', 'night_vision');
  add('awkward', 'blaze_powder', 'strength');
  for (const k of ['swiftness', 'fire_resistance', 'night_vision', 'strength']) add(k, C.WIRE, k + '_long');
  for (const k of ['healing', 'swiftness', 'strength']) add(k, 'glowstone', k + '_strong');
  for (const k of D.POTIONS) if (!k.startsWith('splash_') && D.I['splash_' + k]) add(k, 'gunpowder', 'splash_' + k);
  const brewOf = (bottle, ing) => { const r = BREW.find((q) => q[0] === bottle && q[1] === ing); return r ? r[2] : 0; };
  const isIngredient = (id) => BREW.some((q) => q[1] === id);
  const isBottle = (id) => !!(D.info(id) && D.info(id).potion);

  // ---------- Стойка ----------
  const BREW_TIME = 20;
  const newStand = () => ({ slots: [null, null, null, null, null], fuel: 0, t: 0 });   // 0-2 бутылки, 3 добавка, 4 топливо
  function canBrew(st) {
    const ing = st.slots[3];
    if (!ing) return false;
    return st.slots.slice(0, 3).some((b) => b && brewOf(b.id, ing.id));
  }
  function tickStand(st, dt, onBrew) {
    if (st.fuel <= 0 && st.slots[4] && st.slots[4].id === I.blaze_powder && canBrew(st)) {
      st.fuel = 20; st.slots[4].count--; if (!st.slots[4].count) st.slots[4] = null;
    }
    if (!canBrew(st) || st.fuel <= 0) { st.t = 0; return false; }
    st.t += dt;
    if (st.t >= BREW_TIME) {
      st.t = 0;
      const ing = st.slots[3];
      for (let k = 0; k < 3; k++) { const b = st.slots[k]; const out = b && brewOf(b.id, ing.id); if (out) { st.slots[k] = VX.inv.newStack(out, 1); if (onBrew) onBrew(out); } }
      ing.count--; if (!ing.count) st.slots[3] = null;
      st.fuel--;
    }
    return true;
  }
  function BrewView(inv, st, pos) { this.inv = inv; this.st = st; this.pos = pos; }
  BrewView.prototype.get = function (i) { if (i < 36) return this.inv.slots[i]; return i >= 720 && i < 725 ? this.st.slots[i - 720] : null; };
  BrewView.prototype.set = function (i, s) { if (s && s.count <= 0) s = null; if (i < 36) this.inv.slots[i] = s; else if (i >= 720 && i < 725) this.st.slots[i - 720] = s; };
  BrewView.prototype.canPut = function (i, s) {
    if (i < 36) return true;
    if (i < 723) return isBottle(s.id) && s.count === 1;
    if (i === 723) return isIngredient(s.id);
    if (i === 724) return s.id === I.blaze_powder;
    return false;
  };
  BrewView.prototype.shiftMove = function (i, s) {
    if (i >= 720) return this.inv.add(s.id, s.count, s.dmg);
    const sl = this.st.slots;
    if (s.id === I.blaze_powder && (!sl[4] || sl[4].id === s.id)) { const cur = sl[4] ? sl[4].count : 0, k = Math.min(64 - cur, s.count); sl[4] = VX.inv.newStack(s.id, cur + k); return s.count - k; }
    if (isIngredient(s.id) && (!sl[3] || sl[3].id === s.id)) { const cur = sl[3] ? sl[3].count : 0, k = Math.min(64 - cur, s.count); sl[3] = VX.inv.newStack(s.id, cur + k); return s.count - k; }
    if (isBottle(s.id)) for (let k = 0; k < 3; k++) if (!sl[k]) { sl[k] = VX.inv.newStack(s.id, 1); return s.count - 1; }
    return s.count;
  };
  BrewView.prototype.close = function () {
    const spill = [], c = this.inv.cursor;
    if (c) { const left = this.inv.add(c.id, c.count, c.dmg); if (left) spill.push(VX.inv.newStack(c.id, left, c.dmg)); this.inv.cursor = null; }
    return spill;
  };
  function tick(dt) {
    const stands = G.dimSlot ? (G.dimSlot().stands || (G.dimSlot().stands = {})) : {};
    for (const k in stands) {
      const [x, y, z] = k.split(',').map(Number);
      const id = G.world.getBlock(x, y, z);
      if (id < 0) continue;
      if (id !== C.BREWING_STAND) { delete stands[k]; continue; }
      tickStand(stands[k], dt, (out) => { G.emit('brew', { id: out }); if (D.info(out).potion.suf === '_strong') G.emit('brew_strong', { id: out }); });
    }
    tickEffects(dt);
    tickSplash(dt);
  }
  function standAt(pos) {
    const stands = G.dimSlot().stands || (G.dimSlot().stands = {});
    const k = pos.x + ',' + pos.y + ',' + pos.z;
    return stands[k] || (stands[k] = newStand());
  }

  // ---------- Действия на героя ----------
  function effects() { const p = G.player; return p.effects || (p.effects = {}); }
  function apply(pot, scale) {
    const p = G.player, e = effects();
    if (!pot.eff) return;
    if (pot.eff === 'heal') { p.health = Math.min(20, p.health + 4 * pot.lvl * (scale || 1)); return; }
    const t = pot.dur * (scale || 1);
    const cur = e[pot.eff];
    if (!cur || cur.lvl < pot.lvl || (cur.lvl === pot.lvl && cur.t < t)) e[pot.eff] = { lvl: pot.lvl, t };
  }
  function tickEffects(dt) {
    const e = effects();
    for (const k in e) { e[k].t -= dt; if (e[k].t <= 0) delete e[k]; }
  }
  const level = (k) => { const e = G.player && G.player.effects; return e && e[k] ? e[k].lvl : 0; };
  // выпить: зелье действует, в руке остаётся бутылочка
  function drink() {
    const held = G.inv.held(), info = held && D.info(held.id);
    if (!info || !info.potion || info.potion.splash) return null;
    apply(info.potion);
    if (G.mode === 'survival') { G.inv.slots[G.inv.selected] = VX.inv.newStack(I.glass_bottle, 1); }
    VX.audio.play('drink');
    if (info.potion.eff) G.emit('drink', { id: held.id });
    return held.id;
  }
  // бутылочка + источник воды = бутылочка воды
  function fill() {
    const p = G.player, f = G.world.raycastFluid(new THREE.Vector3(p.pos.x, p.eye(), p.pos.z), p.forward(), 5);
    if (!f || f.id !== B.water) return null;
    if (G.mode === 'survival') G.inv.takeHeld(1);
    const left = G.inv.add(I.water_bottle, 1);
    if (left) G.dropItem(VX.inv.newStack(I.water_bottle, 1), true);
    VX.audio.play('splash');
    return 'fill';
  }

  // ---------- Взрывные зелья ----------
  const flying = [];
  let geo = null;
  function throwSplash() {
    const held = G.inv.held(), info = held && D.info(held.id);
    if (!info || !info.potion || !info.potion.splash) return null;
    const p = G.player, d = p.forward();
    flying.push({ x: p.pos.x + d.x * 0.5, y: p.eye() - 0.1, z: p.pos.z + d.z * 0.5, vx: d.x * 10, vy: d.y * 10 + 2, vz: d.z * 10, pot: info.potion, color: info.potion.color, mesh: null });
    if (G.mode === 'survival') G.inv.takeHeld(1);
    VX.audio.play('bow');
    G.swing = 1;
    return 'throw';
  }
  function burst(f) {
    // по всем в радиусе 4: чем ближе, тем сильнее (1 - расстояние/4)
    const p = G.player, d = Math.hypot(p.pos.x - f.x, p.pos.y + 0.9 - f.y, p.pos.z - f.z);
    if (d < 4) apply(f.pot, Math.max(0.25, 1 - d / 4));
    if (VX.entities && f.pot.eff === 'heal') for (const m of VX.entities.mobs) { const dm = Math.hypot(m.x - f.x, m.y - f.y, m.z - f.z); if (dm < 4 && m.deadT === 0) { if (VX.enchant && VX.enchant.UNDEAD.has(m.type)) { m.hurtT = 0; VX.entities.hurtMob(m, 6 * f.pot.lvl * (1 - dm / 4), f.x, f.z, 'player'); } else m.hp = Math.min(m.def.hp, m.hp + 4 * f.pot.lvl); } }
    VX.audio.play('glass_break');
    G.emit('splash', { eff: f.pot.eff });
  }
  function tickSplash(dt) {
    for (let i = flying.length - 1; i >= 0; i--) {
      const f = flying[i];
      f.vy -= 20 * dt;
      const nx = f.x + f.vx * dt, ny = f.y + f.vy * dt, nz = f.z + f.vz * dt;
      const b = G.world.getBlock(Math.floor(nx), Math.floor(ny), Math.floor(nz));
      const hitMob = VX.entities && VX.entities.mobs.some((m) => m.deadT === 0 && Math.abs(m.x - nx) < m.w / 2 + 0.2 && ny > m.y && ny < m.y + m.h && Math.abs(m.z - nz) < m.w / 2 + 0.2);
      if ((b !== 0 && (b < 0 || C.SOLID[b])) || hitMob || ny < -64) { burst(f); if (f.mesh) G.scene.remove(f.mesh); flying.splice(i, 1); continue; }
      f.x = nx; f.y = ny; f.z = nz;
    }
  }
  const potMats = new Map();          // материал на цвет зелья - общий для всех бросков
  const potMat = (c) => { let m = potMats.get(c); if (!m) { m = new THREE.MeshLambertMaterial({ color: c }); potMats.set(c, m); } return m; };
  function render() {
    for (const f of flying) {
      if (!f.mesh) { if (!geo) geo = new THREE.BoxGeometry(0.2, 0.28, 0.2); f.mesh = new THREE.Mesh(geo, potMat(f.color)); G.scene.add(f.mesh); }
      f.mesh.position.set(f.x, f.y, f.z); f.mesh.rotation.x += 0.2;
    }
  }
  function reset() { for (const f of flying) if (f.mesh) G.scene.remove(f.mesh); flying.length = 0; }
  // строки для экрана: «Скорость II 2:59»
  function hudLines() {
    const e = G.player && G.player.effects;
    if (!e) return [];
    return Object.keys(e).map((k) => { const t = Math.ceil(e[k].t); return { key: k, text: EFF_NAMES[k] + ROMAN[e[k].lvl] + ' ' + Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0') }; });
  }

  VX.brewing = { potMats, BREW, brewOf, isIngredient, isBottle, newStand, tickStand, BrewView, standAt, tick, apply, level, drink, fill, throwSplash, render, reset, hudLines, flying, BREW_TIME, EFF_NAMES };
})();
