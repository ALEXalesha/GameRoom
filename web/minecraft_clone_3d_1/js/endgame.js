// Край по правилам оригинала. Око Края (жемчуг + огненный порошок): брошенное летит к ближайшей
// крепости на 12 блоков, висит и в 4 случаях из 5 падает обратно (иначе разбивается). В зале портала
// крепости 12 рамок; око в каждую - и внутри открывается портал 3x3. В Краю: площадка из обсидиана,
// остров, 10 колонн с кристаллами, эндер-дракон (200 здоровья, кружит и пикирует, кристаллы лечат его).
// Победа: дракон поднимается и рассыпается опытом (12000), в чаше из бедрока открывается выходной
// портал, на колонне - яйцо. Выход домой после победы - титры (главный финал), играть можно дальше.
// Здесь же жемчуг Края: брошенный переносит героя туда, где упал (5 урона).
(function () {
  'use strict';
  const VX = window.VX, G = VX.game, C = VX.core, D = VX.data, B = C.B;
  const I = D.I;
  const R = { rnd: Math.random };            // случай (проверки подменяют)
  const W = () => G.world;
  const E = () => VX.entities;
  const isFrame = (id) => id >= C.END_FRAME && id < C.END_FRAME + 8;
  const hasEye = (id) => isFrame(id) && (id - C.END_FRAME) % 2 === 1;
  const RING = [];
  for (let i = -1; i <= 1; i++) RING.push([i, -2], [i, 2], [-2, i], [2, i]);
  const ARRIVE = { x: 100.5, y: 49, z: 0.5 };

  function fight() { return G.meta.endFight || (G.meta.endFight = { started: false, dragonKilled: false, portalBuilt: false }); }

  // ---------- Рамка и портал ----------
  // Рамка со всеми 12 очами вокруг клетки (x, y, z): центр портала или null
  function ringAround(x, y, z) {
    const w = W();
    for (const [ox, oz] of RING) {
      const cx = x - ox, cz = z - oz;
      if (RING.every(([a, b]) => hasEye(w.getBlock(cx + a, y, cz + b)))) return { x: cx, y, z: cz };
    }
    return null;
  }
  function tryActivate(x, y, z) {
    const c = ringAround(x, y, z);
    if (!c) return null;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) W().setBlock(c.x + dx, y, c.z + dz, C.END_PORTAL);
    VX.audio.play('end_portal');
    G.emit('end_portal_open', c);
    return c;
  }
  function useOnFrame(t) {
    if (hasEye(t.id)) return null;
    W().setBlock(t.x, t.y, t.z, t.id + 1);
    if (G.mode === 'survival') G.inv.takeHeld(1);
    VX.audio.play('eye_place');
    G.swing = 1;
    tryActivate(t.x, t.y, t.z);
    return 'eye_frame';
  }
  // Сломали рамку (в творческом): портал без полной рамки гаснет. Выходной портал Края рамки не имеет.
  function after(x, y, z) {
    if (G.dim === 'end') return;
    const w = W();
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
      const X = x + dx, Z = z + dz;
      if (w.getBlock(X, y, Z) !== C.END_PORTAL) continue;
      let ok = false;
      for (let a = -1; a <= 1 && !ok; a++) for (let b = -1; b <= 1 && !ok; b++) ok = RING.every(([p, q]) => hasEye(w.getBlock(X + a + p, y, Z + b + q)));
      if (!ok) w.setBlock(X, y, Z, 0);
    }
  }

  // ---------- Око Края ----------
  const flying = [];                          // очи и жемчуг в полёте
  let eyeGeo = null, eyeMat = null, pearlMat = null;
  function nearestStronghold(x, z) {
    let best = null, bd = Infinity;
    for (const s of C.strongholds(W().seed)) { const d = Math.hypot(s.x - x, s.z - z); if (d < bd) { bd = d; best = s; } }
    return best;
  }
  function throwEye() {
    if (G.dim !== 'over') return null;          // в Нижнем мире и в Краю око не летит
    const p = G.player, s = nearestStronghold(p.pos.x, p.pos.z);
    const dx = s.x + 0.5 - p.pos.x, dz = s.z + 0.5 - p.pos.z, d = Math.hypot(dx, dz) || 1, go = Math.min(12, d);
    flying.push({ kind: 'eye', x: p.pos.x, y: p.eye(), z: p.pos.z, x0: p.pos.x, y0: p.eye(), z0: p.pos.z, tx: p.pos.x + dx / d * go, tz: p.pos.z + dz / d * go, ty: p.eye() + (d > 12 ? 6 : 1), age: 0, fate: R.rnd() < 0.8 ? 'drop' : 'break', mesh: null });
    if (G.mode === 'survival') G.inv.takeHeld(1);
    VX.audio.play('eye_throw');
    G.swing = 1;
    G.emit('eye', {});
    return 'eye';
  }
  const EYE_FLY = 1.6, EYE_HOVER = 1.2;
  function tickEye(f, dt) {
    f.age += dt;
    if (f.age < EYE_FLY) {
      const k = f.age / EYE_FLY, e = 1 - (1 - k) * (1 - k);
      f.x = f.x0 + (f.tx - f.x0) * e; f.z = f.z0 + (f.tz - f.z0) * e; f.y = f.y0 + (f.ty - f.y0) * Math.sin(k * Math.PI / 2);
      return false;
    }
    if (f.age < EYE_FLY + EYE_HOVER) { f.x = f.tx; f.z = f.tz; f.y = f.ty + Math.sin((f.age - EYE_FLY) * 6) * 0.08; return false; }
    if (f.fate === 'drop') { if (E()) E().spawnItem({ id: I.eye_of_ender, count: 1 }, f.x, f.y, f.z, 0, 0, 0, 0.3); VX.audio.play('pop'); }
    else VX.audio.play('glass_break');
    f.done = f.fate;
    return true;
  }

  // ---------- Жемчуг Края ----------
  function throwPearl() {
    if ((G.pearlCool || 0) > 0) return null;
    const p = G.player, d = p.forward();
    flying.push({ kind: 'pearl', x: p.pos.x + d.x * 0.4, y: p.eye() - 0.1, z: p.pos.z + d.z * 0.4, vx: d.x * 18, vy: d.y * 18 + 1, vz: d.z * 18, age: 0, mesh: null });
    if (G.mode === 'survival') G.inv.takeHeld(1);
    G.pearlCool = 1;
    VX.audio.play('eye_throw');
    G.swing = 1;
    return 'pearl';
  }
  const hitsBlock = (x, y, z) => { const b = W().getBlock(Math.floor(x), Math.floor(y), Math.floor(z)); return b !== 0 && (b < 0 || (C.SOLID[b] && !C.FLUID[b])); };
  function tickPearl(f, dt) {
    f.age += dt;
    f.vy -= 12 * dt;
    if (f.y < -20 || f.age > 20) return true;
    for (let s = 0; s < 4; s++) {
      const nx = f.x + f.vx * dt / 4, ny = f.y + f.vy * dt / 4, nz = f.z + f.vz * dt / 4;
      const mob = E() && E().mobs.find((m) => m.deadT === 0 && nx > m.x - m.w / 2 && nx < m.x + m.w / 2 && ny > m.y && ny < m.y + m.h && nz > m.z - m.w / 2 && nz < m.z + m.w / 2);
      if (mob || hitsBlock(nx, ny, nz)) { land(f); return true; }
      f.x = nx; f.y = ny; f.z = nz;
    }
    return false;
  }
  // герой переносится туда, где упал жемчуг; если там тесно - чуть назад по полёту или выше
  function land(f) {
    const p = G.player;
    if (p.dead) return;
    const sp = Math.hypot(f.vx, f.vy, f.vz) || 1;
    let x = f.x, y = f.y, z = f.z;
    VX.endgame.landed = { x, y, z };
    p.pos.set(x, y, z);
    for (let k = 0; k < 12 && VX.phys.boxHits(W(), p.box()); k++) { x -= f.vx / sp * 0.25; y -= f.vy / sp * 0.25; z -= f.vz / sp * 0.25; p.pos.set(x, y, z); }
    for (let k = 0; k < 4 && VX.phys.boxHits(W(), p.box()); k++) p.pos.y += 0.5;
    p.vel.set(0, 0, 0); p.fallTop = null;
    VX.audio.play('teleport');
    if (G.mode === 'survival') p.damage(5, 'fall', G.playerEvent, true);
    G.emit('pearl', {});
  }

  // ---------- ПКМ ----------
  function use(held, hi) {
    if (hi.key === 'eye_of_ender') {
      const t = G.target();
      if (t && isFrame(t.id)) return useOnFrame(t);
      return throwEye();
    }
    if (hi.key === 'ender_pearl') return throwPearl();
    return undefined;
  }

  // ---------- Переходы ----------
  function inPortal() {
    const p = G.player, w = W(), x = Math.floor(p.pos.x), z = Math.floor(p.pos.z);
    return w.getBlock(x, Math.floor(p.pos.y + 0.1), z) === C.END_PORTAL || w.getBlock(x, Math.floor(p.pos.y + 0.6), z) === C.END_PORTAL;
  }
  function travel() {
    if (G.dim === 'over') { VX.audio.play('portal'); return G.changeDim('end', ARRIVE, arriveEnd); }
    if (G.dim === 'end') return goHome();
    return false;
  }
  // Площадка прибытия каждый раз заново: обсидиан 5x5 и воздух над ним
  function arriveEnd() {
    const w = W(), p = G.player;
    for (let x = 98; x <= 102; x++) for (let z = -2; z <= 2; z++) {
      if (w.getBlock(x, 48, z) !== B.obsidian) w.setBlock(x, 48, z, B.obsidian);
      for (let y = 49; y <= 51; y++) if (w.getBlock(x, y, z) !== 0) w.setBlock(x, y, z, 0);
    }
    p.pos.set(ARRIVE.x, ARRIVE.y, ARRIVE.z); p.vel.set(0, 0, 0);
    p.yaw = Math.PI / 2; p.pitch = 0;          // лицом к центру острова
    G.endWait = true;
    startFight();
  }
  // Из Края домой - к кровати или в начало мира; после победы над драконом - титры
  function goHome() {
    const bd = G.meta.bed, sp0 = G.meta.spawn, won = fight().dragonKilled;
    const at = bd ? { x: bd.x + 0.5, y: bd.y + 0.57, z: bd.z + 0.5 } : { x: sp0.x, y: sp0.y, z: sp0.z };
    VX.audio.play('portal');
    return G.changeDim('over', at, () => {
      if (bd) { const id = W().getBlock(bd.x, bd.y, bd.z); if (!(id > 0 && C.BLOCKS[id].bed)) { G.meta.bed = null; G.player.pos.set(sp0.x, sp0.y, sp0.z); } }
      if (won) G.emit('credits', {});
    });
  }

  // ---------- Битва ----------
  const liveDragon = () => E() && E().mobs.find((m) => m.type === 'ender_dragon' && m.deadT === 0);
  function startFight() {
    const f = fight();
    if (f.dragonKilled) { finishFight(); return; }
    if (!f.started) {
      for (const pl of C.endPillars(W().seed)) E().spawnMob('end_crystal', pl.x + 0.5, pl.h + 1, pl.z + 0.5);
      f.started = true;
    }
    if (!liveDragon()) E().spawnMob('ender_dragon', 0.5, C.END_Y + 30, 40.5);
  }
  // Выходной портал в чаше (кроме колонны) и яйцо на колонне - когда центр острова загружен
  function finishFight() {
    const f = fight(), w = W();
    if (f.portalBuilt) return true;
    if (G.dim !== 'end' || ![[-3, -3], [3, -3], [-3, 3], [3, 3]].every(([x, z]) => w.isLoaded(x, z))) { f.pending = true; return false; }
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) if ((dx || dz) && Math.hypot(dx, dz) <= 2.6) w.setBlock(dx, C.END_Y + 1, dz, C.END_PORTAL);
    w.setBlock(0, C.END_Y + 5, 0, C.DRAGON_EGG);
    f.portalBuilt = true; f.pending = false;
    VX.audio.play('end_portal');
    return true;
  }
  const boxOf = (m) => [m.x - m.w / 2, m.y, m.z - m.w / 2, m.x + m.w / 2, m.y + m.h, m.z + m.w / 2];
  const overlap = (a, b) => a[0] < b[3] && a[3] > b[0] && a[1] < b[4] && a[4] > b[1] && a[2] < b[5] && a[5] > b[2];
  // Дракон: кружит над островом (радиус 40), время от времени пикирует на героя; касание - 10 урона
  // и отброс, после удара уходит на круг. Кристалл в 32 блоках лечит его (1 здоровья за полсекунды).
  function updateDragon(m, dt) {
    const p = G.player;
    m.t = (m.t || 0) + dt;
    const surv = G.mode === 'survival' && !p.dead && G.state !== 'dead' && G.dim === 'end';
    if (!m.mode) { m.mode = 'circle'; m.ang = Math.atan2(m.z, m.x); m.modeT = 6 + R.rnd() * 6; }
    let tx, ty, tz, sp = m.def.speed;
    if (m.mode === 'circle') {
      m.ang += dt * sp / 40;
      tx = Math.cos(m.ang) * 40; tz = Math.sin(m.ang) * 40; ty = C.END_Y + 26 + Math.sin(m.t * 0.5) * 6;
      m.modeT -= dt;
      if (m.modeT <= 0) { if (surv && Math.hypot(p.pos.x, p.pos.z) < 160) { m.mode = 'dive'; m.modeT = 7; } else m.modeT = 3; }
    } else {
      tx = p.pos.x; ty = p.pos.y + 0.5; tz = p.pos.z; sp *= 1.4;
      m.modeT -= dt;
      if (m.modeT <= 0 || !surv) { m.mode = 'circle'; m.ang = Math.atan2(m.z, m.x); m.modeT = 8 + R.rnd() * 8; }
    }
    const dx = tx - m.x, dy = ty - (m.y + m.h / 2), dz = tz - m.z, d = Math.hypot(dx, dy, dz) || 1;
    const k = 1 - Math.exp(-2.5 * dt);
    m.vx += (dx / d * sp - m.vx) * k; m.vy += (dy / d * sp - m.vy) * k; m.vz += (dz / d * sp - m.vz) * k;
    m.x += m.vx * dt; m.y += m.vy * dt; m.z += m.vz * dt;
    m.yaw = Math.atan2(m.vx, m.vz);
    m.pitch = -Math.atan2(m.vy, Math.hypot(m.vx, m.vz)) * 0.6;
    m.phase += dt * 4;
    // касание
    m.hitT = Math.max(0, (m.hitT || 0) - dt);
    if (surv && m.hitT <= 0 && overlap(boxOf(m), p.box())) {
      m.hitT = 1;
      const ex = p.pos.x - m.x, ez = p.pos.z - m.z, el = Math.hypot(ex, ez) || 1;
      if (p.damage(m.def.dmg, 'dragon', G.playerEvent, false, { x: m.x, z: m.z })) { p.vel.x += ex / el * 10; p.vel.z += ez / el * 10; p.vel.y = 7; }
      if (m.mode === 'dive') { m.mode = 'circle'; m.ang = Math.atan2(m.z, m.x); m.modeT = 8 + R.rnd() * 8; }
      G.emit('dragon_hit', {});
    }
    // лечение от ближайшего кристалла
    let best = null, bd = 32;
    for (const c of E().mobs) if (c.type === 'end_crystal' && c.deadT === 0) { const q = Math.hypot(c.x - m.x, c.y - m.y, c.z - m.z); if (q < bd) { bd = q; best = c; } }
    m.healer = best ? best.id : 0;
    if (best && m.hp < m.def.hp) { m.healT = (m.healT || 0) + dt; while (m.healT >= 0.5) { m.healT -= 0.5; m.hp = Math.min(m.def.hp, m.hp + 1); } } else m.healT = 0;
    m.flapT = (m.flapT || 0) - dt;
    const dist = Math.hypot(p.pos.x - m.x, p.pos.y - m.y, p.pos.z - m.z);
    if (m.flapT <= 0) { m.flapT = 1.2; if (dist < 64) VX.audio.play('dragon_flap'); }
    m.noiseT -= dt;
    if (m.noiseT <= 0) { m.noiseT = 8 + R.rnd() * 8; if (dist < 128) VX.audio.play('dragon'); }
  }
  function updateMob(m, dt) {
    if (m.def.custom === 'dragon') return updateDragon(m, dt);
    m.phase += dt;                             // кристалл просто вращается
  }
  // Гибель: кристалл взрывается (сила 6); если он лечил дракона - дракону 10 урона.
  // Дракон: победа записывается сразу, дальше 10 секунд подъёма и опыт порциями.
  function died(m, cause) {
    const e = E();
    if (m.def.custom === 'crystal') {
      const dr = liveDragon();
      if (dr && dr.healer === m.id) { dr.hurtT = 0; e.hurtMob(dr, 10, m.x, m.z, 'crystal'); }
      if (VX.explode) VX.explode(m.x, m.y + 1, m.z, 6, { source: m, ev: G.playerEvent });
      G.emit('crystal', { cause });
      return;
    }
    if (m.def.custom === 'dragon') {
      const f = fight();
      f.dragonKilled = true;
      m.xpLeft = 12000; m.xpT = 0; m.vx = m.vy = m.vz = 0;
      VX.audio.play('dragon_death');
      G.emit('dragon', {});
      G.saveWorld();
    }
  }
  const DIE_AT = { x: 0.5, z: 9.5 };                // опыт падает рядом с чашей, а не в пустоту
  function dying(m, dt) {
    if (!m.def.boss) return;
    m.y = Math.min(C.END_Y + 40, m.y + dt * 1.5);
    m.x += (DIE_AT.x - m.x) * Math.min(1, dt * 0.8); m.z += (DIE_AT.z - m.z) * Math.min(1, dt * 0.8);
    m.phase += dt * 10;
    m.xpT += dt;
    while (m.xpT >= 0.5 && m.xpLeft > 0) {
      m.xpT -= 0.5;
      const n = Math.min(m.xpLeft, 667);
      m.xpLeft -= n;
      if (VX.xp) VX.xp.spawn(m.x, m.y + 1, m.z, n);
    }
  }
  function gone(m) {
    if (!m.def.boss) return;
    if (m.xpLeft > 0 && VX.xp) { VX.xp.spawn(m.x, m.y + 1, m.z, m.xpLeft); m.xpLeft = 0; }
    finishFight();
  }

  // ---------- Шаг ----------
  let chkT = 0;
  function tick(dt) {
    if (!G.meta || G.panorama) return;
    G.pearlCool = Math.max(0, (G.pearlCool || 0) - dt);
    for (let i = flying.length - 1; i >= 0; i--) {
      const f = flying[i];
      if (f.kind === 'eye' ? tickEye(f, dt) : tickPearl(f, dt)) { if (f.mesh) G.scene.remove(f.mesh); flying.splice(i, 1); }
    }
    if (G.state !== 'play') return;
    const here = inPortal();
    if (G.endWait) { if (!here) G.endWait = false; }
    else if (here) { travel(); return; }
    chkT -= dt;
    if (chkT <= 0) {
      chkT = 1;
      const p = G.player;
      if (G.dim === 'over') {
        for (const s of C.strongholds(W().seed)) if (Math.abs(p.pos.x - s.x - 0.5) <= 5 && Math.abs(p.pos.z - s.z - 0.5) <= 8 && p.pos.y >= s.y - 2 && p.pos.y <= s.y + 7) G.emit('stronghold', {});
      }
      if (G.dim === 'end') {
        const f = fight();
        if (f.dragonKilled) { if (!f.portalBuilt && !E().mobs.some((m) => m.def.boss)) finishFight(); }      // дракон ещё гибнет - портал после
        else if (!f.started || !liveDragon()) { if (W().isLoaded(0, 0)) startFight(); }
      }
    }
  }

  // ---------- Картинка: очи, жемчуг, луч кристалла, полоса босса ----------
  let beam = null;
  function render() {
    for (const f of flying) {
      if (!f.mesh) {
        if (!eyeGeo) { eyeGeo = new THREE.BoxGeometry(0.22, 0.22, 0.22); eyeMat = new THREE.MeshBasicMaterial({ color: 0x3ab07a }); pearlMat = new THREE.MeshBasicMaterial({ color: 0x135a52 }); }
        f.mesh = new THREE.Mesh(eyeGeo, f.kind === 'eye' ? eyeMat : pearlMat);
        G.scene.add(f.mesh);
      }
      f.mesh.position.set(f.x, f.y, f.z);
      f.mesh.rotation.y = f.age * 4;
    }
    const dr = G.dim === 'end' && E() ? E().mobs.find((m) => m.type === 'ender_dragon' && m.deadT === 0) : null;
    const cr = dr && dr.healer ? E().mobs.find((c) => c.id === dr.healer) : null;
    if (cr && !beam) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
      beam = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xe090ff }));
      beam.frustumCulled = false;
      G.scene.add(beam);
    }
    if (beam) {
      beam.visible = !!cr;
      if (cr) { const a = beam.geometry.attributes.position; a.setXYZ(0, cr.x, cr.y + 1, cr.z); a.setXYZ(1, dr.x, dr.y + dr.h / 2, dr.z); a.needsUpdate = true; }
    }
  }
  // Полоса здоровья дракона вверху экрана
  function boss() {
    if (G.dim !== 'end' || !E()) return null;
    const m = E().mobs.find((q) => q.type === 'ender_dragon');
    if (!m) return null;
    return { name: m.def.name, frac: Math.max(0, m.hp) / m.def.hp };
  }
  function reset() {
    for (const f of flying) if (f.mesh) G.scene.remove(f.mesh);
    flying.length = 0;
    if (beam) beam.visible = false;
    G.endWait = false; G.pearlCool = 0;
  }

  VX.endgame = { R, RING, ARRIVE, fight, ringAround, tryActivate, useOnFrame, after, nearestStronghold, throwEye, throwPearl, use, inPortal, travel, arriveEnd, goHome, startFight, finishFight, updateMob, updateDragon, died, dying, gone, tick, render, boss, reset, flying, isFrame, hasEye };
})();
