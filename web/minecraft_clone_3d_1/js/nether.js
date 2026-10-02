// Портал в Нижний мир: рамка из обсидиана (внутри от 2x3 до 21x21) зажигается огнивом; постоял в
// портале 4 секунды (в творческом - полсекунды) - переход. Координаты: в Нижнем мире в 8 раз меньше.
// На той стороне ищется портал поблизости, нет - строится новый (с площадкой из обсидиана).
// Здесь же: огниво, вода в Нижнем мире испаряется, кровать там взрывается.
(function () {
  'use strict';
  const VX = window.VX, G = VX.game, C = VX.core, D = VX.data, B = C.B;
  const P = C.PORTAL;
  const isPortal = (id) => id === P || id === P + 1;
  const W = () => G.world;

  // Рамка вокруг клетки (x, y, z) внутри будущего портала: сначала вдоль X, потом вдоль Z
  function findFrame(x, y, z) {
    const w = W();
    const inside = (X, Y, Z) => { const id = w.getBlock(X, Y, Z); return id === 0 || id === B.fire || isPortal(id); };
    for (const axis of ['x', 'z']) {
      const dx = axis === 'x' ? 1 : 0, dz = axis === 'z' ? 1 : 0;
      if (!inside(x, y, z)) continue;
      let by = y; while (by > y - 22 && inside(x, by - 1, z)) by--;
      if (w.getBlock(x, by - 1, z) !== B.obsidian) continue;
      let lx = 0; while (lx < 22 && inside(x - dx * (lx + 1), by, z - dz * (lx + 1))) lx++;
      const x0 = x - dx * lx, z0 = z - dz * lx;
      if (w.getBlock(x0 - dx, by, z0 - dz) !== B.obsidian) continue;
      let width = 0; while (width < 22 && inside(x0 + dx * width, by, z0 + dz * width)) width++;
      if (width < 2 || width > 21 || w.getBlock(x0 + dx * width, by, z0 + dz * width) !== B.obsidian) continue;
      let h = 0; while (h < 22 && inside(x0, by + h, z0)) h++;
      if (h < 3 || h > 21) continue;
      let ok = true;
      for (let i = 0; i < width && ok; i++) {
        if (w.getBlock(x0 + dx * i, by - 1, z0 + dz * i) !== B.obsidian || w.getBlock(x0 + dx * i, by + h, z0 + dz * i) !== B.obsidian) ok = false;
        for (let j = 0; j < h && ok; j++) if (!inside(x0 + dx * i, by + j, z0 + dz * i)) ok = false;
      }
      for (let j = 0; j < h && ok; j++) if (w.getBlock(x0 - dx, by + j, z0 - dz) !== B.obsidian || w.getBlock(x0 + dx * width, by + j, z0 + dz * width) !== B.obsidian) ok = false;
      if (ok) return { axis, x0, y0: by, z0, width, height: h, dx, dz };
    }
    return null;
  }
  function fill(f) {
    const id = f.axis === 'x' ? P : P + 1;
    for (let i = 0; i < f.width; i++) for (let j = 0; j < f.height; j++) W().setBlock(f.x0 + f.dx * i, f.y0 + j, f.z0 + f.dz * i, id);
  }
  function light(x, y, z) {
    const f = findFrame(x, y, z);
    if (!f) return false;
    fill(f);
    VX.audio.play('portal');
    G.emit('portal', {});
    return true;
  }
  // Огниво: в рамке - портал, на твёрдом блоке - огонь
  function ignite(t, held) {
    if (!t) return null;
    let { x, y, z } = t.place;
    if (C.BLOCKS[t.id].replaceable) { x = t.x; y = t.y; z = t.z; }
    const w = W();
    const lit = light(x, y, z);
    if (!lit) {
      const cur = w.getBlock(x, y, z);
      if (cur !== 0 && !(cur > 0 && C.BLOCKS[cur].replaceable)) return null;
      if (VX.fluids) VX.fluids.addFire(x, y, z); else w.setBlock(x, y, z, B.fire);
      VX.audio.play('fire');
    }
    if (G.mode === 'survival') G.inv.wearHeld();
    G.swing = 1;
    return lit ? 'portal' : 'fire';
  }
  // Сломали рамку (или рядом с порталом что-то поменялось): портал без рамки гаснет целиком
  function after(x, y, z) {
    const w = W();
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [0, 0, 0]]) {
      const X = x + dx, Y = y + dy, Z = z + dz, id = w.getBlock(X, Y, Z);
      if (!isPortal(id)) continue;
      const f = findFrame(X, Y, Z);
      if (f && (f.axis === 'x') === (id === P)) continue;
      // гасим все связанные клетки портала
      const q = [[X, Y, Z]], seen = new Set();
      while (q.length && seen.size < 1000) {
        const [a, b, c] = q.pop(), k = a + ',' + b + ',' + c;
        if (seen.has(k) || !isPortal(w.getBlock(a, b, c))) continue;
        seen.add(k);
        w.setBlock(a, b, c, 0);
        for (const [ex, ey, ez] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) q.push([a + ex, b + ey, c + ez]);
      }
    }
  }

  // Стоишь в портале: копится время, потом переход; после прибытия надо выйти и войти снова
  function inPortal() {
    const p = G.player, w = W(), x = Math.floor(p.pos.x), z = Math.floor(p.pos.z);
    return isPortal(w.getBlock(x, Math.floor(p.pos.y + 0.1), z)) || isPortal(w.getBlock(x, Math.floor(p.pos.y + 1), z));
  }
  function tick(dt) {
    if (!G.meta || G.panorama) return;
    const here = inPortal();
    if (G.portalWait) { if (!here) G.portalWait = false; G.portalT = 0; return; }     // после прибытия надо выйти из портала
    if (here) {
      G.portalT = (G.portalT || 0) + dt;
      if (G.portalT >= (G.mode === 'creative' ? 0.5 : 4)) { G.portalT = 0; travel(); }
    } else G.portalT = Math.max(0, (G.portalT || 0) - dt * 2);
  }
  function travel() {
    const p = G.player, toNether = G.dim === 'over';
    if (G.dim !== 'over' && G.dim !== 'nether') return false;
    const k = toNether ? 1 / 8 : 8;
    const tx = Math.floor(p.pos.x * k), tz = Math.floor(p.pos.z * k);
    VX.audio.play('portal');
    return G.changeDim(toNether ? 'nether' : 'over', { x: tx + 0.5, y: toNether ? 70 : C.CH - 20, z: tz + 0.5 }, () => arrive(tx, tz, toNether));
  }
  // На той стороне: ближайший портал в 16 блоках, иначе - новый
  function arrive(tx, tz, nether) {
    const w = W(), p = G.player;
    let best = null, bd = Infinity;
    for (let dx = -16; dx <= 16; dx++) for (let dz = -16; dz <= 16; dz++) for (let y = 1; y < C.CH - 1; y++) {
      const id = w.getBlock(tx + dx, y, tz + dz);
      if (!isPortal(id) || isPortal(w.getBlock(tx + dx, y - 1, tz + dz))) continue;
      const d = dx * dx + dz * dz + (y - 64) * (y - 64) * 0.01;
      if (d < bd) { bd = d; best = { x: tx + dx, y, z: tz + dz }; }
    }
    if (!best) best = build(tx, tz, nether);
    p.pos.set(best.x + 0.5, best.y, best.z + 0.5); p.vel.set(0, 0, 0);
    G.portalWait = true;
    G.emit('arrive', { dim: G.dim });
    return best;
  }
  function build(tx, tz, nether) {
    const w = W();
    let y0 = -1;
    const free = (x, y, z) => { const id = w.getBlock(x, y, z); return id === 0 || (id > 0 && C.BLOCKS[id].replaceable); };
    const solid = (x, y, z) => { const id = w.getBlock(x, y, z); return id > 0 && C.SOLID[id] && C.RENDER[id] === 1; };
    if (nether) {
      for (let y = 100; y > C.NETHER_SEA + 1 && y0 < 0; y--) {
        let ok = true;
        for (let i = -1; i <= 2 && ok; i++) { if (!solid(tx + i, y - 1, tz)) ok = false; for (let j = 0; j < 4 && ok; j++) if (!free(tx + i, y + j, tz)) ok = false; }
        if (ok) y0 = y;
      }
      if (y0 < 0) y0 = 70;
    } else {
      let y = C.CH - 2; while (y > 1 && !(solid(tx, y, tz) || C.FLUID[Math.max(0, w.getBlock(tx, y, tz))])) y--;
      y0 = Math.max(C.SEA + 1, y + 1);
    }
    // площадка и воздух вокруг
    for (let i = -1; i <= 2; i++) for (let dz = -1; dz <= 1; dz++) {
      if (!solid(tx + i, y0 - 1, tz + dz)) w.setBlock(tx + i, y0 - 1, tz + dz, B.obsidian);
      for (let j = 0; j < 4; j++) if (dz !== 0 || i < 0 || i > 1 || j === 3) { if (dz !== 0) w.setBlock(tx + i, y0 + j, tz + dz, 0); }
    }
    // рамка 4x5 вдоль X, внутри 2x3 портала
    for (let i = -1; i <= 2; i++) { w.setBlock(tx + i, y0 - 1, tz, B.obsidian); w.setBlock(tx + i, y0 + 3, tz, B.obsidian); }
    for (let j = 0; j < 3; j++) { w.setBlock(tx - 1, y0 + j, tz, B.obsidian); w.setBlock(tx + 2, y0 + j, tz, B.obsidian); w.setBlock(tx, y0 + j, tz, P); w.setBlock(tx + 1, y0 + j, tz, P); }
    return { x: tx, y: y0, z: tz };
  }

  VX.nether = { findFrame, light, ignite, after, tick, travel, arrive, build, isPortal, inPortal };
})();
