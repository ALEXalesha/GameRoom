// Погода по правилам оригинала (упрощённо): ясно, дождь, гроза; в холодных биомах и высоко в горах
// вместо дождя - снег, в пустыне осадков нет. Погода меняется сама раз в несколько игровых дней,
// переходы плавные (небо, туман и свет темнеют постепенно), состояние хранится в мире.
// Капли и снежинки - частицы вокруг камеры; под крышей их нет: капля живёт только над верхним
// блоком своего столбца. В грозу бьют молнии: вспышка, гром с задержкой по расстоянию, удар
// поджигает траву и дерево, ранит рядом стоящих (5), свинью превращает в зомби-свиночеловека.
// Дождь гасит огонь на герое и мобах и не даёт нежити гореть на солнце. Только в обычном мире.
(function () {
  'use strict';
  const VX = window.VX, G = VX.game, C = VX.core, D = VX.data, B = C.B;
  const R = { rnd: Math.random };
  const W = () => G.world;
  const DAY = 24000;
  const KINDS = ['clear', 'rain', 'thunder'];
  const NAMES = { clear: 'ясно', rain: 'дождь', thunder: 'гроза' };
  const DESERT = 2, SNOWY = 3, MOUNTAINS = 4, FROZEN = 7;
  const SNOW_Y = 100;                                   // выше - снег в любом биоме

  // ---------- Состояние ----------
  function state() {
    if (!G.meta) return { kind: 'clear', t: DAY, rain: 0, thunder: 0 };
    const s = G.meta.weather;
    if (!s || typeof s !== 'object' || !KINDS.includes(s.kind) || !Number.isFinite(s.t)) G.meta.weather = { kind: 'clear', t: duration('clear'), rain: 0, thunder: 0 };
    const w = G.meta.weather;
    if (!Number.isFinite(w.rain)) w.rain = 0;
    if (!Number.isFinite(w.thunder)) w.thunder = 0;
    return w;
  }
  // длительность в тиках: ясно 1-4 дня, дождь и гроза - полдня-день
  function duration(kind) { return kind === 'clear' ? DAY * (1 + R.rnd() * 3) : DAY * (0.5 + R.rnd() * 0.5); }
  function next(kind) { return kind !== 'clear' ? 'clear' : R.rnd() < 0.3 ? 'thunder' : 'rain'; }
  // поставить погоду (команда в меню, проверки): на заданное время или своё по правилам
  function set(kind, ticks) {
    if (!KINDS.includes(kind)) return false;
    const s = state();
    s.kind = kind; s.t = ticks || duration(kind);
    G.emit('weather', { kind });
    return true;
  }
  // что выпадает в точке: 'rain', 'snow' или null (пустыня, нет осадков)
  function precipAt(x, y, z) {
    const bi = C.column(C.worldOf(W().seed, W().gen), Math.floor(x), Math.floor(z)).biome;
    if (bi === DESERT) return null;
    if (bi === SNOWY || bi === FROZEN || y > SNOW_Y || (bi === MOUNTAINS && y > SNOW_Y - 12)) return 'snow';
    return 'rain';
  }
  const active = () => G.dim === 'over' && G.meta && !G.panorama;
  // идёт ли сейчас дождь на эту клетку (открыта небу, не пустыня, не снег)
  function rainingAt(x, y, z) {
    if (!active() || state().rain < 0.3) return false;
    if (W().skyTop(Math.floor(x), Math.floor(z)) >= y) return false;
    return precipAt(x, y, z) === 'rain';
  }

  // ---------- Шаг ----------
  let lightningT = 5, soundT = 0, achT = 0;
  const bolts = [], thunders = [];
  function tick(dt) {
    if (!G.meta || G.panorama) return;
    const s = state();
    s.t -= dt * 20;
    if (s.t <= 0) set(next(s.kind));
    // плавный переход: около 15 секунд от ясного до ливня
    const wantRain = s.kind === 'clear' ? 0 : 1, wantThunder = s.kind === 'thunder' ? 1 : 0;
    s.rain += Math.max(-dt / 15, Math.min(dt / 15, wantRain - s.rain));
    s.thunder += Math.max(-dt / 15, Math.min(dt / 15, wantThunder - s.thunder));
    if (!active()) return;
    const p = G.player;
    // дождь гасит огонь на герое
    if (p.fireT > 0 && rainingAt(p.pos.x, p.pos.y + 1.6, p.pos.z)) p.fireT = 0;
    // звук дождя - пока есть осадки рядом
    soundT -= dt;
    if (soundT <= 0 && s.rain > 0.2) {
      soundT = 0.5;
      const here = precipAt(p.pos.x, p.pos.y, p.pos.z);
      if (here === 'rain') VX.audio.play('rain', { k: s.rain });
    }
    // молнии в грозу: раз в 5-20 секунд в 64 блоках от героя
    if (s.thunder > 0.5) {
      lightningT -= dt;
      if (lightningT <= 0) { lightningT = 5 + R.rnd() * 15; const a = R.rnd() * Math.PI * 2, r = 8 + R.rnd() * 56; strike(p.pos.x + Math.cos(a) * r, p.pos.z + Math.sin(a) * r); }
    }
    // отложенный гром
    for (let i = thunders.length - 1; i >= 0; i--) { thunders[i].t -= dt; if (thunders[i].t <= 0) { VX.audio.play('thunder', { far: thunders[i].far }); thunders.splice(i, 1); } }
    for (let i = bolts.length - 1; i >= 0; i--) { bolts[i].t -= dt; if (bolts[i].t <= 0) { if (bolts[i].mesh) { G.scene.remove(bolts[i].mesh); bolts[i].mesh.geometry.dispose(); } bolts.splice(i, 1); } }
    flashT = Math.max(0, flashT - dt);
    achT -= dt;
    if (achT <= 0) { achT = 1; if (s.rain > 0.5 && precipAt(p.pos.x, p.pos.y, p.pos.z) === 'snow' && W().skyTop(Math.floor(p.pos.x), Math.floor(p.pos.z)) < p.pos.y + 1) G.emit('snowfall', {}); }
  }
  // Удар молнии в столбец (x, z): в верхний блок; вспышка, гром через расстояние/60 секунд
  let flashT = 0;
  const FLAMMABLE = (id) => id > 0 && (C.BLOCKS[id].tool === 'axe' || id === B.grass || id === B.snow_grass || C.BLOCKS[id].render === 'leaves');
  function strike(x, z) {
    const w = W(), X = Math.floor(x), Z = Math.floor(z);
    if (!w.isLoaded(X, Z)) return null;
    const p = G.player;
    if (precipAt(X, 64, Z) === null) return null;              // в пустыне гроз нет
    const top = w.skyTop(X, Z), y = top + 1;
    const bolt = { x: X + 0.5, y, z: Z + 0.5, t: 0.25, mesh: null, seed: R.rnd() };
    bolts.push(bolt);
    flashT = 0.2;
    const dist = Math.hypot(p.pos.x - bolt.x, p.pos.z - bolt.z);
    thunders.push({ t: dist / 60, far: dist > 32 });
    // огонь: на верхнем горючем блоке или рядом
    const id = w.getBlock(X, top, Z);
    if (FLAMMABLE(id) && w.getBlock(X, y, Z) === 0 && VX.fluids && VX.fluids.addFire && R.rnd() < 0.7) VX.fluids.addFire(X, y, Z);
    // кто рядом: 5 урона и поджог; свинья - в зомби-свиночеловека
    if (G.mode === 'survival' && !p.dead && Math.hypot(p.pos.x - bolt.x, p.pos.y - y, p.pos.z - bolt.z) < 3) { if (p.damage(5, 'lightning', G.playerEvent, true)) p.fireT = Math.max(p.fireT || 0, 8); }
    const E = VX.entities;
    if (E) for (const m of E.mobs.slice()) {
      if (m.deadT > 0 || Math.hypot(m.x - bolt.x, m.y - y, m.z - bolt.z) > 3) continue;
      if (m.type === 'pig') { const z2 = E.spawnMob('zombie_pigman', m.x, m.y, m.z); z2.yaw = m.yaw; m.deadT = 0.6; m.hp = 0; continue; }
      m.hurtT = 0; E.hurtMob(m, 5, bolt.x, bolt.z, 'lightning'); if (!m.def.fireImmune) m.fireT = Math.max(m.fireT, 8);
    }
    if (dist < 32) G.emit('lightning_near', { dist });
    G.emit('lightning', { x: X, y, z: Z });
    return bolt;
  }

  // ---------- Небо, туман, свет ----------
  // вызывается после sky.update: темнее и серее по силе дождя и грозы, вспышка молнии - светло
  const GRAY = new THREE.Color(0x5a6068);
  function adjustSky(sk, sky) {
    if (!active()) return sk;
    const s = state(), k = s.rain * 0.75 + s.thunder * 0.2;
    if (k <= 0.001 && flashT <= 0) return sk;
    const dark = 1 - 0.3 * s.rain - 0.25 * s.thunder;           // свет падает немного
    sk.day *= dark;
    sk.fog = sk.fog.clone().lerp(GRAY.clone().multiplyScalar(0.4 + 0.6 * sk.day), Math.min(0.85, k));
    if (sky && sky.domeU) { sky.domeU.top.value.lerp(GRAY.clone().multiplyScalar(0.3 + 0.6 * sk.day), Math.min(0.9, k)); sky.domeU.bottom.value.copy(sk.fog); sky.domeU.glowK.value *= 1 - k; }
    if (sky && sky.cloudU) sky.cloudU.uCol.value.multiplyScalar(1 - 0.45 * k);
    if (sky && sky.sun) { sky.sun.visible = sky.sun.visible && s.rain < 0.6; sky.moon.visible = sky.moon.visible && s.rain < 0.6; sky.starMat.opacity *= 1 - s.rain; }
    if (flashT > 0) { sk.day = Math.max(sk.day, 0.9); sk.fog = sk.fog.clone().lerp(new THREE.Color(0xdde4ff), 0.5); }
    return sk;
  }

  // ---------- Частицы вокруг камеры ----------
  // плотность: 0 - нет, 1 - мало, 2 - много (настройка «Частицы»)
  const COUNTS = [0, 500, 1500];
  const BOX = 14, HIGH = 18;
  let drops = null, rainMesh = null, snowMesh = null, tops = null, topsAt = null, topsT = 0;
  function count() { const s = G.settings && G.settings.particles; return COUNTS[s === 0 || s === 1 ? s : 2]; }
  // верх столбцов вокруг камеры (с запасом): капля видна только над ним (крыша, листва, навес)
  function refreshTops(cx, cz) {
    const N = BOX * 2 + 1;
    if (!tops) tops = new Int16Array(N * N);
    const w = W();
    for (let dz = -BOX; dz <= BOX; dz++) for (let dx = -BOX; dx <= BOX; dx++) tops[(dx + BOX) + (dz + BOX) * N] = w.skyTop(cx + dx, cz + dz);
    topsAt = [cx, cz];
  }
  function topAt(x, z) {
    const N = BOX * 2 + 1, ix = Math.floor(x) - topsAt[0] + BOX, iz = Math.floor(z) - topsAt[1] + BOX;
    if (ix < 0 || iz < 0 || ix >= N || iz >= N) return 9999;
    return tops[ix + iz * N];
  }
  function spawnDrop(d, cam, fresh) {
    d.x = cam.x + (R.rnd() * 2 - 1) * BOX; d.z = cam.z + (R.rnd() * 2 - 1) * BOX;
    const top = topAt(d.x, d.z) + 1;
    const lo = Math.max(top, cam.y - 8), hi = cam.y + HIGH;
    if (lo >= hi) { d.y = -9999; d.kind = null; return; }      // столбец закрыт выше коробки - капли нет
    d.y = fresh ? lo + R.rnd() * (hi - lo) : hi - R.rnd() * 2;
    d.top = top;
    d.kind = precipAt(d.x, d.y, d.z);
    d.ph = R.rnd() * 6.28;
  }
  function makeMeshes(n) {
    if (rainMesh) { G.scene.remove(rainMesh); rainMesh.geometry.dispose(); G.scene.remove(snowMesh); snowMesh.geometry.dispose(); }
    drops = []; for (let i = 0; i < n; i++) drops.push({ x: 0, y: -9999, z: 0, top: 0, kind: null, ph: 0 });
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 6), 3));
    rainMesh = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0x8aa8d8, transparent: true, opacity: 0.6, depthWrite: false }));
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    snowMesh = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.12, transparent: true, opacity: 0.9, depthWrite: false }));
    rainMesh.frustumCulled = false; snowMesh.frustumCulled = false;
    G.scene.add(rainMesh); G.scene.add(snowMesh);
  }
  let lastDt = 0.016;
  function render(dt) {
    lastDt = dt || lastDt;
    const n = count(), s = active() ? state() : null;
    const on = !!s && s.rain > 0.02 && n > 0 && !G.underwater;
    if (!on) { if (rainMesh) { rainMesh.visible = false; snowMesh.visible = false; } renderBolts(); return; }
    if (!drops || drops.length !== n) { makeMeshes(n); drops.started = false; }
    const cam = G.camera.position;
    topsT -= lastDt;
    const cx = Math.floor(cam.x), cz = Math.floor(cam.z);
    if (!topsAt || topsT <= 0 || Math.abs(cx - topsAt[0]) > 2 || Math.abs(cz - topsAt[1]) > 2) {
      topsT = 0.25; refreshTops(cx, cz);
      // построили крышу (или сломали): уже летящие капли узнают новый верх своего столбца
      if (drops.started) for (const d of drops) if (d.y > -9000) d.top = topAt(d.x, d.z) + 1;
    }
    const shown = Math.floor(n * Math.min(1, s.rain));
    const rp = rainMesh.geometry.attributes.position, sp = snowMesh.geometry.attributes.position;
    let ri = 0, si = 0;
    for (let i = 0; i < n; i++) {
      const d = drops[i];
      if (!drops.started || Math.abs(d.x - cam.x) > BOX || Math.abs(d.z - cam.z) > BOX || d.y > cam.y + HIGH + 2) spawnDrop(d, cam, !drops.started);
      if (i >= shown || d.y < -9000) continue;
      if (d.kind === 'snow') { d.y -= 2.2 * lastDt; d.x += Math.sin(d.ph + d.y) * 0.5 * lastDt; }
      else d.y -= 22 * lastDt;
      if (d.y < d.top || d.y < cam.y - 10) { spawnDrop(d, cam, false); continue; }
      if (d.kind === 'snow') { sp.setXYZ(si++, d.x, d.y, d.z); }
      else if (d.kind === 'rain') { rp.setXYZ(ri * 2, d.x, d.y, d.z); rp.setXYZ(ri * 2 + 1, d.x, d.y + 0.55, d.z); ri++; }
    }
    drops.started = true;
    rainMesh.geometry.setDrawRange(0, ri * 2); snowMesh.geometry.setDrawRange(0, si);
    rp.needsUpdate = true; sp.needsUpdate = true;
    rainMesh.visible = ri > 0; snowMesh.visible = si > 0;
    rainMesh.material.opacity = 0.35 + 0.35 * s.rain;
    renderBolts();
    G.weatherDrops = { rain: ri, snow: si };
  }
  // молния: ломаная линия от неба к земле, одна общая геометрия на удар
  let boltMat = null;
  function renderBolts() {
    for (const b of bolts) {
      if (b.mesh) continue;
      if (!boltMat) boltMat = new THREE.MeshBasicMaterial({ color: 0xf4f6ff, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthWrite: false, fog: false });
      // ломаная из звеньев по 4 блока; каждое звено - два скрещённых плоских ленты шириной 0.35
      const pts = [], rnd = C.mulberry32((b.seed * 1e9) | 0), wd = 0.175;
      let x = b.x, z = b.z;
      for (let y = b.y + 70; y > b.y; y -= 4) {
        const y2 = Math.max(b.y, y - 4), last = y2 <= b.y;
        const x2 = last ? b.x : x + (rnd() - 0.5) * 2.4, z2 = last ? b.z : z + (rnd() - 0.5) * 2.4;      // в землю - точно в место удара
        for (const [ox, oz] of [[wd, 0], [0, wd]]) pts.push(x - ox, y, z - oz, x + ox, y, z + oz, x2 + ox, y2, z2 + oz, x - ox, y, z - oz, x2 + ox, y2, z2 + oz, x2 - ox, y2, z2 - oz);
        x = x2; z = z2;
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      b.mesh = new THREE.Mesh(g, boltMat); b.mesh.frustumCulled = false;
      G.scene.add(b.mesh);
    }
  }
  function reset() {
    for (const b of bolts) if (b.mesh) { G.scene.remove(b.mesh); b.mesh.geometry.dispose(); }
    bolts.length = 0; thunders.length = 0; flashT = 0;
    if (drops) drops.started = false;
    topsAt = null;
  }
  const label = () => NAMES[state().kind];

  VX.weather = { R, KINDS, NAMES, state, set, next, duration, precipAt, rainingAt, tick, strike, adjustSky, render, reset, label, get flash() { return flashT; }, bolts, thunders, get drops() { return drops; }, refreshTops, COUNTS };
})();
