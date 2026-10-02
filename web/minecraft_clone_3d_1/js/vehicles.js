// Лодка и вагонетка по правилам оригинала.
// Лодка (5 досок): ставится на воду (ПКМ), садишься ПКМ, W/S - вперёд и назад, A/D - поворот (вид
// поворачивается вместе с лодкой), на воде до 7.5 блоков в секунду, на суше еле ползёт; течение сносит.
// Рельсы (6 железа и палка - 16 штук) сами соединяются с соседями: прямые, повороты, подъёмы на блок.
// Вагонетка (5 железа) ставится на рельсы и катится по ним: трение, под горку быстрее, в горку медленнее,
// в тупике останавливается. Энергорельсы (золото, палка, красная пыль): запитанные разгоняют до 8 блоков
// в секунду (стоящую - от стены), без сигнала тормозят. Сигнал идёт по цепочке энергорельсов до 8 штук.
// Выйти - Shift. Сломать: ударами (в творческом - сразу, без выпадения).
(function () {
  'use strict';
  const VX = window.VX, G = VX.game, C = VX.core, D = VX.data, B = C.B;
  const I = D.I, P = VX.phys;
  const W = () => G.world;
  const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]], OPP = [2, 3, 0, 1];
  const ASC = [4, 2, 5, 3];                       // подъём к стороне: север, восток, юг, запад
  const CURVE = { '2,1': 6, '2,3': 7, '0,3': 8, '0,1': 9 };
  const list = [];
  const isRail = (id) => id >= C.RAIL && id < C.POWERED_RAIL + 12;
  const railOf = (x, y, z) => { const id = W().getBlock(x, y, z); return isRail(id) ? id : 0; };
  const shapeOf = (id) => C.BLOCKS[id].rail;
  const dirsOf = (s) => C.RAIL_DIRS[s];
  const isWater = (x, y, z) => { const id = W().getBlock(Math.floor(x), Math.floor(y), Math.floor(z)); return id > 0 && C.FLUID[id] === 1; };

  // ---------- Рельсы: форма по соседям ----------
  function neighbors(x, y, z) {
    const out = [];
    for (let d = 0; d < 4; d++) {
      const [dx, dz] = DIRS[d];
      if (railOf(x + dx, y, z + dz)) out.push({ d, dy: 0 });
      else if (railOf(x + dx, y + 1, z + dz)) out.push({ d, dy: 1 });
      else if (railOf(x + dx, y - 1, z + dz)) out.push({ d, dy: -1 });
    }
    return out;
  }
  function choose(x, y, z, powered, facing) {
    const nb = neighbors(x, y, z);
    const has = (d) => nb.some((n) => n.d === d);
    const up = nb.find((n) => n.dy === 1);
    if (up) return ASC[up.d];
    const ns = has(0) || has(2), ew = has(1) || has(3);
    if (!powered && ns && ew) return CURVE[(has(2) ? 2 : 0) + ',' + (has(1) ? 1 : 3)];
    if (ew && !ns) return 1;
    if (ns) return 0;
    return facing % 2 ? 1 : 0;
  }
  const connected = (x, y, z, d) => { const [dx, dz] = DIRS[d]; return !!(railOf(x + dx, y, z + dz) || railOf(x + dx, y + 1, z + dz) || railOf(x + dx, y - 1, z + dz)); };
  function setShape(x, y, z, id, s) {
    const b = C.BLOCKS[id];
    const nid = b.prail !== undefined ? C.POWERED_RAIL + s * 2 + b.prail : C.RAIL + s;
    if (nid !== id) W().setBlock(x, y, z, nid);
  }
  const facingDir = () => { const p = G.player, fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw); return Math.abs(fx) > Math.abs(fz) ? (fx > 0 ? 1 : 3) : (fz > 0 ? 2 : 0); };
  function placeRail(x, y, z, powered, facing) {
    const w = W();
    let s = choose(x, y, z, powered, facing === undefined ? facingDir() : facing);
    if (powered && s >= 6) s = 0;
    w.setBlock(x, y, z, powered ? C.POWERED_RAIL + s * 2 : C.RAIL + s);
    // соседи со свободным концом поворачиваются к новому рельсу
    for (const n of neighbors(x, y, z)) {
      const [dx, dz] = DIRS[n.d], X = x + dx, Y = y + n.dy, Z = z + dz, id = railOf(X, Y, Z);
      if (!id || dirsOf(shapeOf(id)).includes(OPP[n.d])) continue;
      const free = dirsOf(shapeOf(id)).filter((d) => !connected(X, Y, Z, d)).length;
      if (free === 0) continue;
      let s2 = choose(X, Y, Z, C.BLOCKS[id].prail !== undefined, OPP[n.d]);
      if (C.BLOCKS[id].prail !== undefined && s2 >= 6) continue;
      if (!dirsOf(s2).includes(OPP[n.d])) continue;
      setShape(X, Y, Z, id, s2);
    }
    if (VX.redstone) VX.redstone.update(x, y, z);
    return s;
  }
  function place(t, held) {
    if (held.id !== C.RAIL && held.id !== C.POWERED_RAIL) return undefined;
    let { x, y, z } = t.place;
    if (C.BLOCKS[t.id].replaceable) { x = t.x; y = t.y; z = t.z; }
    const w = W(), below = w.getBlock(x, y - 1, z);
    if (w.getBlock(x, y, z) !== 0 || !(below > 0 && C.SOLID[below] && C.RENDER[below] === 1)) return null;
    placeRail(x, y, z, held.id === C.POWERED_RAIL);
    if (G.mode === 'survival') G.inv.takeHeld(1);
    VX.audio.play('place', { surface: 'stone' });
    G.swing = 1;
    G.emit('place', { id: held.id });
    return { x, y, z };
  }
  // Энергорельсы: сигнал в клетке или соседний запитанный энергорельс той же оси (до 8 от источника)
  function poweredRails(comps, poweredAt) {
    const rails = comps.filter((c) => c.b.prail !== undefined);
    if (!rails.length) return;
    const key = (x, y, z) => x + ',' + y + ',' + z;
    const by = new Map(rails.map((c) => [key(c.x, c.y, c.z), c]));
    const dist = new Map(), q = [];
    for (const c of rails) if (poweredAt(c.x, c.y, c.z) || poweredAt(c.x, c.y - 1, c.z)) { dist.set(c, 0); q.push(c); }
    while (q.length) {
      const c = q.shift(), dd = dist.get(c);
      if (dd >= 8) continue;
      for (const d of dirsOf(c.b.rail)) {
        const [dx, dz] = DIRS[d];
        for (const dy of [0, 1, -1]) {
          const n = by.get(key(c.x + dx, c.y + dy, c.z + dz));
          if (n && !dist.has(n) && dirsOf(n.b.rail).includes(OPP[d])) { dist.set(n, dd + 1); q.push(n); }
        }
      }
    }
    for (const c of rails) {
      const on = dist.has(c) ? 1 : 0;
      if (on !== c.b.prail) W().setBlock(c.x, c.y, c.z, C.POWERED_RAIL + c.b.rail * 2 + on);
    }
  }

  // ---------- Вагонетка: движение по пути клетки ----------
  // Путь по клетке: от середины края from к центру и к середине края to; s - доля пути 0..1
  function edgeOf(c, d) {
    const id = railOf(c.cx, c.cy, c.cz), h = id ? C.RAIL_HIGH[shapeOf(id)] : -1, [dx, dz] = DIRS[d];
    return [c.cx + 0.5 + dx * 0.5, c.cy + (h === d ? 1 : 0) + 0.0625, c.cz + 0.5 + dz * 0.5];
  }
  function pose(c) {
    const A = edgeOf(c, c.from), Bp = edgeOf(c, c.to), M = [c.cx + 0.5, (A[1] + Bp[1]) / 2, c.cz + 0.5];
    const first = c.s < 0.5, P0 = first ? A : M, P1 = first ? M : Bp, k = first ? c.s * 2 : (c.s - 0.5) * 2;
    c.x = P0[0] + (P1[0] - P0[0]) * k; c.y = P0[1] + (P1[1] - P0[1]) * k; c.z = P0[2] + (P1[2] - P0[2]) * k;
    const dx = P1[0] - P0[0], dz = P1[2] - P0[2], l = Math.hypot(dx, dz) || 1;
    c.dx = dx / l; c.dz = dz / l;
    if (dx || dz) c.yaw = Math.atan2(dx, dz);
  }
  const MAX_CART = 8;
  function stepCart(c, dt, inp) {
    const w = W();
    let id = railOf(c.cx, c.cy, c.cz);
    if (!id) {                                       // рельс убрали - вагонетка падает и лежит
      c.vy = (c.vy || 0) - 20 * dt;
      const b = [c.x - 0.49, c.y, c.z - 0.49, c.x + 0.49, c.y + 0.7, c.z + 0.49];
      const ry = P.sweep(w, b, 1, c.vy * dt); c.y += ry; if (ry !== c.vy * dt) c.vy = 0;
      const fx = Math.floor(c.x), fy = Math.floor(c.y + 0.1), fz = Math.floor(c.z);
      const nid = railOf(fx, fy, fz);
      if (nid) { const ds = dirsOf(shapeOf(nid)); c.cx = fx; c.cy = fy; c.cz = fz; c.from = ds[0]; c.to = ds[1]; c.s = 0.5; c.v = 0; pose(c); }
      return;
    }
    const b = C.BLOCKS[id];
    let h = C.RAIL_HIGH[b.rail];
    // герой в вагонетке толкает её по взгляду (медленно, как в оригинале)
    if (inp && (inp.f || inp.b)) {
      const f = G.player.forward(), dot = f.x * c.dx + f.z * c.dz;
      if (Math.abs(c.v) < 4) c.v += dot * (inp.f ? 2.5 : -2.5) * dt;
    }
    if (b.prail !== undefined) {
      if (b.prail) {
        if (Math.abs(c.v) < 0.05) {
          // стоит на запитанном: толчок от стены
          const solidAt = (d) => { const [dx, dz] = DIRS[d]; const q = w.getBlock(c.cx + dx, c.cy, c.cz + dz); return q > 0 && C.SOLID[q] && C.RENDER[q] === 1; };
          if (solidAt(c.from)) c.v = 1; else if (solidAt(c.to)) c.v = -1;
        } else c.v = Math.sign(c.v) * Math.min(MAX_CART, Math.abs(c.v) + 16 * dt);
      } else c.v *= Math.pow(0.001, dt);          // выключенный - тормоз
    }
    if (h >= 0) { if (c.to === h) c.v -= 5 * dt; else if (c.from === h) c.v += 5 * dt; }
    c.v *= Math.pow(0.92, dt);
    if (Math.abs(c.v) < 0.005 && !(b.prail) && h < 0) c.v = 0;
    c.v = Math.max(-MAX_CART, Math.min(MAX_CART, c.v));
    if (c.v < 0) { const t = c.from; c.from = c.to; c.to = t; c.s = 1 - c.s; c.v = -c.v; }
    c.s += c.v * dt;
    let guard = 0;
    while (c.s >= 1 && guard++ < 16) {
      const [dx, dz] = DIRS[c.to];
      let ny = c.cy + (h === c.to ? 1 : 0);
      let nid = railOf(c.cx + dx, ny, c.cz + dz);
      if (!nid) { const lo = railOf(c.cx + dx, ny - 1, c.cz + dz); if (lo && C.RAIL_HIGH[shapeOf(lo)] === OPP[c.to]) { nid = lo; ny--; } }
      const back = OPP[c.to];
      if (!nid || !dirsOf(shapeOf(nid)).includes(back)) { c.s = 1; c.v = 0; break; }      // тупик - стоп
      c.cx += dx; c.cy = ny; c.cz += dz; c.s -= 1;
      const ds = dirsOf(shapeOf(nid));
      c.from = back; c.to = ds[0] === back ? ds[1] : ds[0];
      h = C.RAIL_HIGH[shapeOf(nid)];
      if (c === G.riding) {
        const st = G.meta.stats || (G.meta.stats = {});
        st.rail = (st.rail || 0) + 1;
        if (st.rail >= 500) G.emit('rail_trip', { n: st.rail });
      }
    }
    pose(c);
  }
  function placeCart(t) {
    if (!t) return null;
    const id = W().getBlock(t.x, t.y, t.z);
    if (!isRail(id)) return null;
    const ds = dirsOf(shapeOf(id));
    const c = { kind: 'cart', cx: t.x, cy: t.y, cz: t.z, from: ds[0], to: ds[1], s: 0.5, v: 0, hp: 6, hurtT: 0, yaw: 0, w: 0.98, h: 0.7 };
    pose(c);
    list.push(c);
    if (G.mode === 'survival') G.inv.takeHeld(1);
    VX.audio.play('place', { surface: 'stone' });
    G.swing = 1;
    return 'cart';
  }

  // ---------- Лодка ----------
  function placeBoat() {
    const p = G.player, eye = new THREE.Vector3(p.pos.x, p.eye(), p.pos.z), f = p.forward();
    const hitW = W().raycastFluid(eye, f, 5), t = G.target();
    let x, y, z;
    if (hitW && hitW.id === B.water && (!t || t.dist > hitW.dist)) {
      x = hitW.x + 0.5; z = hitW.z + 0.5;
      let top = hitW.y; while (isWater(x, top + 1, z)) top++;
      y = top + 0.8;
    } else if (t && t.n[1] === 1) { x = t.x + 0.5; y = t.y + 1; z = t.z + 0.5; }
    else return null;
    list.push({ kind: 'boat', x, y, z, vx: 0, vy: 0, vz: 0, yaw: p.yaw, hp: 4, hurtT: 0, w: 1.375, h: 0.6 });
    if (G.mode === 'survival') G.inv.takeHeld(1);
    VX.audio.play('place', { surface: 'wood' });
    G.swing = 1;
    return 'boat';
  }
  function waterTop(bt) {
    const fx = Math.floor(bt.x), fz = Math.floor(bt.z);
    for (let y = Math.floor(bt.y + 0.8); y >= Math.floor(bt.y - 0.6); y--) if (isWater(fx + 0.5, y, fz + 0.5)) { let top = y; while (isWater(fx + 0.5, top + 1, fz + 0.5)) top++; return top; }
    return -1;
  }
  function stepBoat(bt, dt, inp) {
    const w = W(), wy = waterTop(bt), onWater = wy >= 0;
    if (onWater) bt.vy = (wy + 0.8 - bt.y) * 6;           // дно лодки чуть выше воды: внутри сухо
    else bt.vy = Math.max(-30, bt.vy - 20 * dt);
    let acc = 0;
    if (inp) {
      const turn = (inp.l ? 1 : 0) - (inp.r ? 1 : 0);
      if (turn) { bt.yaw += turn * 2 * dt; G.player.yaw += turn * 2 * dt; }
      acc = inp.f ? 1 : inp.b ? -0.5 : 0;
    }
    const fx = -Math.sin(bt.yaw), fz = -Math.cos(bt.yaw);
    bt.vx += fx * acc * (onWater ? 6 : 2) * dt; bt.vz += fz * acc * (onWater ? 6 : 2) * dt;
    const drag = Math.pow(onWater ? 0.45 : 0.02, dt);
    bt.vx *= drag; bt.vz *= drag;
    if (onWater) {
      const fl = P.flowAt(w, Math.floor(bt.x), wy, Math.floor(bt.z));
      if (fl) { bt.vx += fl.x * 3 * dt; bt.vz += fl.z * 3 * dt; }
    }
    const box = () => [bt.x - bt.w / 2, bt.y, bt.z - bt.w / 2, bt.x + bt.w / 2, bt.y + bt.h, bt.z + bt.w / 2];
    const x0 = bt.x, z0 = bt.z;
    const ry = P.sweep(w, box(), 1, bt.vy * dt); bt.y += ry; if (ry !== bt.vy * dt) bt.vy = 0;
    const rx = P.sweep(w, box(), 0, bt.vx * dt); bt.x += rx; if (rx !== bt.vx * dt) bt.vx = 0;
    const rz = P.sweep(w, box(), 2, bt.vz * dt); bt.z += rz; if (rz !== bt.vz * dt) bt.vz = 0;
    if (bt === G.riding && onWater) {
      const st = G.meta.stats || (G.meta.stats = {});
      st.boat = (st.boat || 0) + Math.hypot(bt.x - x0, bt.z - z0);
      if (st.boat >= 50) G.emit('boat_trip', { n: st.boat });
    }
    bt.onWater = onWater;
  }

  // ---------- Посадка, езда, выход ----------
  function rayVehicle(maxD) {
    const p = G.player, o = [p.pos.x, p.eye(), p.pos.z], f = p.forward(), d = [f.x, f.y, f.z];
    let best = null, bd = maxD;
    for (const v of list) {
      if (v === G.riding) continue;
      const lo = [v.x - v.w / 2, v.y, v.z - v.w / 2], hi = [v.x + v.w / 2, v.y + v.h, v.z + v.w / 2];
      let t0 = 0, t1 = bd, ok = true;
      for (let k = 0; k < 3 && ok; k++) {
        if (Math.abs(d[k]) < 1e-9) { if (o[k] < lo[k] || o[k] > hi[k]) ok = false; continue; }
        let a = (lo[k] - o[k]) / d[k], b = (hi[k] - o[k]) / d[k];
        if (a > b) { const t = a; a = b; b = t; }
        t0 = Math.max(t0, a); t1 = Math.min(t1, b);
        if (t0 > t1) ok = false;
      }
      if (ok && t0 < bd) { bd = t0; best = v; }
    }
    return best ? { v: best, dist: bd } : null;
  }
  function mount(v) {
    G.riding = v;
    G.player.vel.set(0, 0, 0); G.player.flying = false;
    seat();
    G.say('Shift - выйти');
    G.emit('mount', { kind: v.kind });
    return 'ride';
  }
  function seat() {
    const v = G.riding, p = G.player;
    if (!v) return;
    p.pos.set(v.x, v.y + (v.kind === 'boat' ? 0.1 : 0.2), v.z);
    p.vel.set(0, 0, 0); p.onGround = true; p.fallTop = null;
  }
  function dismount() {
    const v = G.riding, p = G.player;
    if (!v) return;
    G.riding = null;
    // рядом с транспортом свободное место: по бокам, потом сверху
    const side = [[-Math.cos(v.yaw || 0), Math.sin(v.yaw || 0)], [Math.cos(v.yaw || 0), -Math.sin(v.yaw || 0)], [1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [sx, sz] of side) for (const dy of [0.6, 1.2]) {
      p.pos.set(v.x + sx * 1.2, v.y + dy, v.z + sz * 1.2);
      if (!P.boxHits(W(), p.box())) { p.vel.set(0, 0, 0); return; }
    }
    p.pos.set(v.x, v.y + 1, v.z);
    p.vel.set(0, 0, 0);
  }
  // шаг героя в транспорте: движение транспорта по кнопкам, здоровье и голод идут своим чередом
  let rideInp = null;
  function ride(dt, inp) {
    const p = G.player;
    if (!G.riding || !list.includes(G.riding)) { G.riding = null; return false; }
    if (inp.sneak) { dismount(); return false; }
    rideInp = inp;
    p.sneaking = false; p.sprinting = false; p.inWater = false; p.headInWater = false;
    if (G.mode === 'survival' && !p.dead) p.survivalTick(dt, G.playerEvent);
    p.hurtCool = Math.max(0, p.hurtCool - dt); p.hurtFlash = Math.max(0, p.hurtFlash - dt);
    return true;
  }
  function tick(dt) {
    if (!G.meta || G.panorama) return;
    for (const v of list) {
      if (!W().isLoaded(v.x, v.z)) continue;
      const inp = v === G.riding ? rideInp : null;
      if (v.kind === 'cart') stepCart(v, dt, inp); else stepBoat(v, dt, inp);
      v.hurtT = Math.max(0, v.hurtT - dt);
    }
    rideInp = null;
    if (G.riding) seat();
  }

  // ---------- ПКМ и удар ----------
  function use(held, hi) {
    const hit = rayVehicle(3.5), t = G.target();
    if (hit && (!t || t.dist > hit.dist) && !G.riding) return mount(hit.v);
    if (hi && hi.key === 'boat') return placeBoat();
    if (hi && hi.key === 'minecart') { if (t && isRail(t.id)) return placeCart(t); return null; }
    return undefined;
  }
  function attack() {
    const hit = rayVehicle(3.5), t = G.target();
    if (!hit || (t && t.dist < hit.dist)) return false;
    const v = hit.v;
    G.swing = 1;
    if (v.hurtT > 0) return true;
    v.hurtT = 0.25;
    v.hp -= G.mode === 'creative' ? 100 : 2;
    VX.audio.play('hit', { surface: v.kind === 'boat' ? 'wood' : 'stone' });
    if (v.hp <= 0) {
      remove(v);
      if (G.mode === 'survival' && VX.entities) VX.entities.spawnItem({ id: v.kind === 'boat' ? I.boat : I.minecart, count: 1 }, v.x, v.y + 0.5, v.z, 0, 2, 0, 0.3);
    }
    return true;
  }
  function remove(v) {
    const i = list.indexOf(v);
    if (i >= 0) list.splice(i, 1);
    if (v.mesh) G.scene.remove(v.mesh);
    if (G.riding === v) dismount();
  }

  // ---------- Модели: общие коробки и материалы ----------
  let geo = null, mats = null;
  function pixMat(cols, seed) {
    const c = document.createElement('canvas'); c.width = c.height = 8;
    const g = c.getContext('2d'), r = C.mulberry32(seed);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { g.fillStyle = cols[(r() * cols.length) | 0]; g.fillRect(x, y, 1, 1); }
    const t = new THREE.CanvasTexture(c); t.magFilter = t.minFilter = THREE.NearestFilter;
    return new THREE.MeshLambertMaterial({ map: t });
  }
  function model(v) {
    if (!geo) {
      geo = { bFloor: new THREE.BoxGeometry(1.2, 0.12, 1.9), bSide: new THREE.BoxGeometry(0.12, 0.4, 1.9), bEnd: new THREE.BoxGeometry(1.2, 0.4, 0.12),
        cFloor: new THREE.BoxGeometry(0.9, 0.1, 1.2), cSide: new THREE.BoxGeometry(0.08, 0.5, 1.2), cEnd: new THREE.BoxGeometry(0.9, 0.5, 0.08), wheel: new THREE.BoxGeometry(0.1, 0.22, 0.22) };
      mats = { wood: pixMat(['#a0773f', '#8e6a36', '#b0874a'], 41), iron: pixMat(['#8a8a8a', '#7a7a7a', '#9a9a9a', '#6e6e6e'], 42), dark: pixMat(['#2a2a2a', '#343434'], 43) };
    }
    const g = new THREE.Group(), add = (gm, mt, x, y, z) => { const m = new THREE.Mesh(gm, mt); m.position.set(x, y, z); g.add(m); };
    if (v.kind === 'boat') {
      add(geo.bFloor, mats.wood, 0, 0.1, 0);
      add(geo.bSide, mats.wood, -0.6, 0.3, 0); add(geo.bSide, mats.wood, 0.6, 0.3, 0);
      add(geo.bEnd, mats.wood, 0, 0.3, -0.95); add(geo.bEnd, mats.wood, 0, 0.3, 0.95);
    } else {
      add(geo.cFloor, mats.iron, 0, 0.2, 0);
      add(geo.cSide, mats.iron, -0.45, 0.45, 0); add(geo.cSide, mats.iron, 0.45, 0.45, 0);
      add(geo.cEnd, mats.iron, 0, 0.45, -0.6); add(geo.cEnd, mats.iron, 0, 0.45, 0.6);
      for (const [x, z] of [[-0.45, 0.4], [0.45, 0.4], [-0.45, -0.4], [0.45, -0.4]]) add(geo.wheel, mats.dark, x, 0.11, z);
    }
    G.scene.add(g);
    return g;
  }
  function render() {
    for (const v of list) {
      if (!v.mesh) v.mesh = model(v);
      v.mesh.position.set(v.x, v.y + (v.kind === 'boat' ? Math.sin(performance.now() / 400 + v.x) * (v.onWater ? 0.03 : 0) : 0), v.z);
      v.mesh.rotation.y = v.yaw || 0;
      v.mesh.rotation.z = v.hurtT > 0 ? Math.sin(v.hurtT * 40) * 0.1 : 0;
    }
  }

  // ---------- Сохранение ----------
  function save(slot) {
    const r = (q) => Math.round(q * 100) / 100;
    slot.vehicles = list.map((v) => (v.kind === 'cart' ? { k: 'cart', cx: v.cx, cy: v.cy, cz: v.cz, f: v.from, t: v.to, s: r(v.s), v: r(v.v) } : { k: 'boat', x: r(v.x), y: r(v.y), z: r(v.z), yaw: r(v.yaw) }));
  }
  function reset(slot) {
    for (const v of list) if (v.mesh) G.scene.remove(v.mesh);
    list.length = 0;
    G.riding = null;
    for (const q of (slot && slot.vehicles) || []) {
      if (q.k === 'cart') { const c = { kind: 'cart', cx: q.cx, cy: q.cy, cz: q.cz, from: q.f, to: q.t, s: q.s, v: q.v || 0, hp: 6, hurtT: 0, yaw: 0, w: 0.98, h: 0.7 }; pose(c); list.push(c); }
      else if (q.k === 'boat') list.push({ kind: 'boat', x: q.x, y: q.y, z: q.z, vx: 0, vy: 0, vz: 0, yaw: q.yaw || 0, hp: 4, hurtT: 0, w: 1.375, h: 0.6 });
    }
  }

  VX.vehicles = { list, place, placeRail, choose, neighbors, poweredRails, use, attack, mount, dismount, ride, tick, render, save, reset, remove, rayVehicle, isRail, DIRS, pose };
})();
