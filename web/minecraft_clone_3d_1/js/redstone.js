// Красный камень по правилам оригинала. Источники: рычаг, кнопка (камень 1 с, дерево 1.5 с), нажимная
// плита, красный факел, блок красного камня, повторитель. Пыль несёт сигнал силой 15, на каждой клетке -1.
// Твёрдый блок «сильно запитан» факелом под ним, рычагом или кнопкой на нём, повторителем в него - такой
// питает пыль рядом; «слабо» - пылью на нём или направленной в него: такой включает только механизмы.
// Факел гаснет, если запитан его блок (через 1 такт, 0.1 с), повторитель задерживает на 1-4 такта и
// выдаёт 15. Механизмы: лампа, двери и люки, поршни (обычный и липкий, до 12 блоков).
// Решение считается сразу при каждом изменении - по связной области вокруг него.
(function () {
  'use strict';
  const VX = window.VX, G = VX.game, C = VX.core, D = VX.data, B = C.B;
  const FD = C.FDIR, TICK = 0.1;
  const W = () => G.world;
  const get = (x, y, z) => W().getBlock(x, y, z);
  const BL = (id) => (id > 0 ? C.BLOCKS[id] : null);
  const k3 = (x, y, z) => x + ',' + y + ',' + z;
  const fullSolid = (id) => id > 0 && C.RENDER[id] === 1 && C.SOLID[id] === 1;
  function isComp(id) {
    const b = BL(id);
    return !!b && (b.wire !== undefined || b.rsTorch !== undefined || b.repeater || b.button || b.plate || b.lamp !== undefined || b.piston || b.pistonHead || b.rsBlock || b.door === 'iron' || b.door === 'wood' || b.trapdoor || id === 130 || id === 131);
  }
  // клетка, к которой прикреплён источник (её он питает сильно, а факел - наоборот, гаснет от неё)
  function support(c, b) {
    if (b.rsTorch !== undefined) { if (b.wall === undefined) return [c.x, c.y - 1, c.z]; const d = FD[b.wall]; return [c.x + d[0], c.y, c.z + d[2]]; }
    if (b.button) { if (b.face === 4) return [c.x, c.y - 1, c.z]; if (b.face === 5) return [c.x, c.y + 1, c.z]; const d = FD[b.face]; return [c.x + d[0], c.y, c.z + d[2]]; }
    if (b.plate || c.id === 130 || c.id === 131) return [c.x, c.y - 1, c.z];
    return null;
  }
  const outOf = (c, b) => { const d = FD[C.FDIR6_OF_DIR4[b.dir]]; return [c.x + d[0], c.y + d[1], c.z + d[2]]; };
  const backOf = (c, b) => { const d = FD[C.FDIR6_OF_DIR4[b.dir]]; return [c.x - d[0], c.y - d[1], c.z - d[2]]; };

  // Связная область вокруг клетки: механизмы, пыль и твёрдые блоки между ними
  function gather(x0, y0, z0) {
    const seen = new Set(), comps = [], q = [[x0, y0, z0]];
    while (q.length && seen.size < 8000) {
      const [x, y, z] = q.pop(), k = k3(x, y, z);
      if (seen.has(k)) continue;
      seen.add(k);
      const id = get(x, y, z);
      if (id < 0) continue;
      const comp = isComp(id), start = x === x0 && y === y0 && z === z0;
      if (!comp && !start) continue;
      if (comp) comps.push({ x, y, z, id });
      for (const d of FD) {
        const nx = x + d[0], ny = y + d[1], nz = z + d[2];
        q.push([nx, ny, nz]);
        if (fullSolid(get(nx, ny, nz))) for (const e of FD) q.push([nx + e[0], ny + e[1], nz + e[2]]);
      }
      if (comp && BL(id).wire !== undefined) for (let a = 0; a < 4; a++) { q.push([x + FD[a][0], y + 1, z + FD[a][2]]); q.push([x + FD[a][0], y - 1, z + FD[a][2]]); }
    }
    return comps;
  }

  let busy = false;
  const later = [];
  function update(x, y, z) {
    if (busy) { later.push([x, y, z]); return; }
    busy = true;
    try {
      solve(gather(x, y, z));
      for (let n = 0; later.length && n < 64; n++) { const p = later.shift(); solve(gather(p[0], p[1], p[2])); }
      later.length = 0;
    } finally { busy = false; }
  }

  function solve(comps) {
    if (!comps.length) return;
    const byKey = new Map();
    for (const c of comps) { c.b = BL(c.id); c.k = k3(c.x, c.y, c.z); byKey.set(c.k, c); if (c.b.plate) plates.add(c.k); }
    // 1. источники и сильно запитанные блоки
    const strong = new Set(), src = new Map();
    for (const c of comps) {
      const b = c.b;
      let on = false;
      if (b.rsTorch !== undefined) { on = !!b.rsTorch; if (on) strong.add(k3(c.x, c.y + 1, c.z)); }
      else if (c.id === 131) on = true;
      else if (b.button || b.plate) on = b.pressed;
      else if (b.rsBlock) on = true;
      else if (b.repeater && b.powered) { const o = outOf(c, b); strong.add(k3(o[0], o[1], o[2])); }
      if (on) {
        c.sup = support(c, b);
        if (c.sup && b.rsTorch === undefined) strong.add(k3(c.sup[0], c.sup[1], c.sup[2]));
        src.set(c.k, c);
      }
    }
    const isSolidKey = (k) => { const [x, y, z] = k.split(',').map(Number); return fullSolid(get(x, y, z)); };
    // источник рядом с клеткой (факел не питает свой блок)
    const srcNear = (x, y, z) => {
      for (const d of FD) {
        const s = src.get(k3(x + d[0], y + d[1], z + d[2]));
        if (!s) continue;
        if (s.b.rsTorch !== undefined && s.sup && s.sup[0] === x && s.sup[1] === y && s.sup[2] === z) continue;
        return true;
      }
      return false;
    };
    const repeaterInto = (x, y, z) => {
      for (const d of FD) {
        const c = byKey.get(k3(x + d[0], y + d[1], z + d[2]));
        if (c && c.b.repeater && c.b.powered) { const o = outOf(c, c.b); if (o[0] === x && o[1] === y && o[2] === z) return true; }
      }
      return false;
    };
    // 2. пыль: начальная сила от источников и сильно запитанных блоков, дальше -1 на клетку
    const wires = comps.filter((c) => c.b.wire !== undefined);
    const power = new Map(), links = new Map();
    for (const w of wires) {
      links.set(w.k, C.wireLinks((dx, dy, dz) => get(w.x + dx, w.y + dy, w.z + dz)));
      let p = srcNear(w.x, w.y, w.z) || repeaterInto(w.x, w.y, w.z) ? 15 : 0;
      if (!p) for (const d of FD) { const nk = k3(w.x + d[0], w.y + d[1], w.z + d[2]); if (strong.has(nk) && isSolidKey(nk)) { p = 15; break; } }
      power.set(w.k, p);
    }
    const nbrs = (w) => {
      const out = [], L = links.get(w.k);
      const upSolid = fullSolid(get(w.x, w.y + 1, w.z));
      for (let a = 0; a < 4; a++) {
        if (!L.links[a]) continue;
        const d = FD[a];
        for (const dy of [0, 1, -1]) {
          if (dy === 1 && upSolid) continue;
          if (dy === -1 && fullSolid(get(w.x + d[0], w.y, w.z + d[2]))) continue;
          const n = byKey.get(k3(w.x + d[0], w.y + dy, w.z + d[2]));
          if (n && n.b.wire !== undefined) out.push(n);
        }
      }
      return out;
    };
    for (let level = 15; level > 1; level--) {
      for (const w of wires) {
        if (power.get(w.k) !== level) continue;
        for (const n of nbrs(w)) if (power.get(n.k) < level - 1) power.set(n.k, level - 1);
      }
    }
    // 3. слабо запитанные блоки: под пылью и там, куда пыль направлена
    const weak = new Set(), pointsInto = new Set();
    for (const w of wires) {
      if (!power.get(w.k)) continue;
      weak.add(k3(w.x, w.y - 1, w.z)); pointsInto.add(k3(w.x, w.y - 1, w.z));
      const L = links.get(w.k);
      for (let a = 0; a < 4; a++) if (L.links[a] || !L.count) { const d = FD[a], nk = k3(w.x + d[0], w.y, w.z + d[2]); pointsInto.add(nk); weak.add(nk); }
    }
    const blockPowered = (x, y, z) => { const k = k3(x, y, z); return (strong.has(k) || weak.has(k)) && fullSolid(get(x, y, z)); };
    // механизм в клетке получает сигнал?
    const poweredAt = (x, y, z, skip) => {
      if (srcNear(x, y, z) || repeaterInto(x, y, z) || pointsInto.has(k3(x, y, z)) && wires.some((w) => power.get(w.k) > 0 && Math.abs(w.x - x) + Math.abs(w.y - y) + Math.abs(w.z - z) === 1)) return true;
      for (let a = 0; a < 6; a++) {
        if (a === skip) continue;
        const d = FD[a];
        if (blockPowered(x + d[0], y + d[1], z + d[2])) return true;
      }
      return false;
    };
    // 4. применить
    for (const w of wires) { const p = power.get(w.k); if (w.id !== C.WIRE + p) W().setBlock(w.x, w.y, w.z, C.WIRE + p); }
    const moves = [];
    for (const c of comps) {
      const b = c.b;
      if (b.lamp !== undefined) {
        const on = poweredAt(c.x, c.y, c.z);
        if (on !== !!b.lamp) W().setBlock(c.x, c.y, c.z, C.LAMP + (on ? 1 : 0));
      } else if ((b.door === 'iron' || b.door === 'wood') && !b.upper) {
        const on = poweredAt(c.x, c.y, c.z) || poweredAt(c.x, c.y + 1, c.z);
        const prev = G.rsPrev.get(c.k);
        G.rsPrev.set(c.k, on);
        if (b.door === 'iron' ? on !== b.open : prev !== undefined && prev !== on) G.setDoorOpen(c.x, c.y, c.z, on);
      } else if (b.trapdoor) {
        const on = poweredAt(c.x, c.y, c.z);
        const prev = G.rsPrev.get(c.k);
        G.rsPrev.set(c.k, on);
        if (b.trapdoor === 'iron' ? on !== b.open : prev !== undefined && prev !== on) VX.build.setTrapdoor(c.x, c.y, c.z, on);
      } else if (b.piston) {
        const on = poweredAt(c.x, c.y, c.z, b.face);
        if (on !== b.extended) moves.push([c, on]);
      } else if (b.rsTorch !== undefined) {
        const sp = support(c, b);
        const lit = !blockPowered(sp[0], sp[1], sp[2]);
        if (lit !== !!b.rsTorch) schedule(TICK, c.x, c.y, c.z, 'torch', lit);
      } else if (b.repeater) {
        const bk = backOf(c, b);
        const bc = byKey.get(k3(bk[0], bk[1], bk[2]));
        let input = blockPowered(bk[0], bk[1], bk[2]);
        if (bc && bc.b.wire !== undefined && power.get(bc.k) > 0) input = true;
        if (bc && bc.b.repeater && bc.b.powered && bc.b.dir === b.dir) input = true;
        if (src.get(k3(bk[0], bk[1], bk[2]))) input = true;
        if (input !== b.powered) schedule(TICK * b.delay, c.x, c.y, c.z, 'repeater', input);
      }
    }
    for (const [c, on] of moves) { if (on) extend(c); else retract(c); }
  }

  // ---------- Отложенные события: факел, повторитель, отпускание кнопки ----------
  const queue = [];
  let now = 0;
  function schedule(dt, x, y, z, kind, val) {
    const k = k3(x, y, z) + kind;
    const q = queue.find((e) => e.k === k);
    if (q) { if (q.val === val) return; q.val = val; q.t = now + dt; return; }
    queue.push({ k, t: now + dt, x, y, z, kind, val });
  }
  function fire(e) {
    const id = get(e.x, e.y, e.z), b = BL(id);
    if (!b) return;
    if (e.kind === 'torch' && b.rsTorch !== undefined) {
      const base = e.val ? C.RS_TORCH : C.RS_TORCH_OFF;
      W().setBlock(e.x, e.y, e.z, base + (b.wall === undefined ? 0 : 1 + b.wall));
    } else if (e.kind === 'repeater' && b.repeater) {
      W().setBlock(e.x, e.y, e.z, C.REPEATER + b.dir * 8 + (b.delay - 1) * 2 + (e.val ? 1 : 0));
    } else if (e.kind === 'button' && b.button && b.pressed) {
      W().setBlock(e.x, e.y, e.z, id - 1);
      VX.audio.play('click');
    } else return;
    update(e.x, e.y, e.z);
  }
  // плиты: кто стоит на плите (игрок и мобы; на деревянной - ещё и предметы)
  let plateT = 0;
  const plates = new Set();          // известные плиты (из установки и из пересчётов) плюс найденные рядом с героем
  function platesTick() {
    const p = G.player, w = W(), X = Math.floor(p.pos.x), Y = Math.floor(p.pos.y), Z = Math.floor(p.pos.z);
    const bodies = [p.box()].concat(VX.entities ? VX.entities.bodies() : []);
    const itemBoxes = VX.entities ? VX.entities.items.map((it) => [it.x - 0.125, it.y, it.z - 0.125, it.x + 0.125, it.y + 0.25, it.z + 0.125]) : [];
    for (let dx = -6; dx <= 6; dx++) for (let dy = -4; dy <= 4; dy++) for (let dz = -6; dz <= 6; dz++) { const b = BL(w.getBlock(X + dx, Y + dy, Z + dz)); if (b && b.plate) plates.add(k3(X + dx, Y + dy, Z + dz)); }
    for (const pk of plates) {
      const [x, y, z] = pk.split(',').map(Number), id = w.getBlock(x, y, z), b = BL(id);
      if (id < 0) continue;
      if (!b || !b.plate) { plates.delete(pk); continue; }
      const cell = [x + 1 / 16, y, z + 1 / 16, x + 15 / 16, y + 0.3, z + 15 / 16];
      const hit = (a) => a[0] < cell[3] && a[3] > cell[0] && a[1] < cell[4] && a[4] > cell[1] && a[2] < cell[5] && a[5] > cell[2];
      const on = bodies.some(hit) || (b.plate === 'wood' && itemBoxes.some(hit));
      if (on !== b.pressed) {
        w.setBlock(x, y, z, (b.plate === 'wood' ? C.RS_WOOD_PLATE : C.RS_PLATE) + (on ? 1 : 0));
        VX.audio.play('click');
        update(x, y, z);
      }
    }
  }
  function tick(dt) {
    now += dt;
    for (let n = 0; n < 200; n++) {
      let i = -1, t = Infinity;
      for (let j = 0; j < queue.length; j++) if (queue[j].t <= now + 1e-6 && queue[j].t < t) { t = queue[j].t; i = j; }     // допуск: шаги 0.05 копят ошибку округления
      if (i < 0) break;
      const e = queue.splice(i, 1)[0];
      fire(e);
    }
    plateT += dt;
    if (plateT >= TICK) { plateT = 0; platesTick(); }
  }

  // ---------- Поршни ----------
  const IMMOVABLE = new Set([B.bedrock, B.obsidian, C.PORTAL, C.PORTAL + 1, C.SPAWNER, B.chest, B.chest + 1, B.chest + 2, B.chest + 3,
    B.furnace, B.furnace + 1, B.furnace + 2, B.furnace + 3, B.furnace_lit, B.furnace_lit + 1, B.furnace_lit + 2, B.furnace_lit + 3]);
  const movable = (id) => { const b = BL(id); return !!b && !IMMOVABLE.has(id) && b.hardness >= 0 && !(b.piston && b.extended) && !b.pistonHead && !b.door && !b.bed; };
  const breaksWhenPushed = (id) => { const b = BL(id); return !!b && (C.FLUID[id] || !C.SOLID[id] || b.replaceable); };
  function extend(c) {
    const b = c.b, d = FD[b.face];
    let x = c.x + d[0], y = c.y + d[1], z = c.z + d[2];
    const line = [];
    for (;;) {
      const id = get(x, y, z);
      if (id < 0 || y < 0 || y >= C.CH) return false;
      if (id === 0 || breaksWhenPushed(id)) break;
      if (!movable(id) || line.length >= 12) return false;
      line.push([x, y, z, id]);
      x += d[0]; y += d[1]; z += d[2];
    }
    const end = get(x, y, z);
    if (end > 0) { W().setBlock(x, y, z, 0); if (!C.FLUID[end]) G.popDrops(end, x, y, z); }
    for (let i = line.length - 1; i >= 0; i--) { const [px, py, pz, id] = line[i]; W().setBlock(px + d[0], py + d[1], pz + d[2], id); }
    const st = b.piston === 'sticky' ? 1 : 0;
    W().setBlock(c.x + d[0], c.y + d[1], c.z + d[2], C.PISTON_HEAD + b.face * 2 + st);
    W().setBlock(c.x, c.y, c.z, C.PISTON + b.face * 4 + 2 + st);
    // существа на пути сдвигаются
    const cells = [[c.x + d[0], c.y + d[1], c.z + d[2]]].concat(line.map(([px, py, pz]) => [px + d[0], py + d[1], pz + d[2]]));
    const pushBox = (bx) => cells.some(([px, py, pz]) => bx[0] < px + 1 && bx[3] > px && bx[1] < py + 1 && bx[4] > py && bx[2] < pz + 1 && bx[5] > pz);
    if (pushBox(G.player.box())) { G.player.pos.x += d[0]; G.player.pos.y += d[1] * 1.01; G.player.pos.z += d[2]; }
    if (VX.entities) for (const m of VX.entities.mobs) if (pushBox([m.x - m.w / 2, m.y, m.z - m.w / 2, m.x + m.w / 2, m.y + m.h, m.z + m.w / 2])) { m.x += d[0]; m.y += d[1]; m.z += d[2]; }
    VX.audio.play('piston');
    for (const [px, py, pz] of cells) later.push([px, py, pz]);
    G.emit('piston', { sticky: !!st, moved: line.length });
    return true;
  }
  function retract(c) {
    const b = c.b, d = FD[b.face], st = b.piston === 'sticky' ? 1 : 0;
    const hx = c.x + d[0], hy = c.y + d[1], hz = c.z + d[2];
    const head = BL(get(hx, hy, hz));
    if (head && head.pistonHead) W().setBlock(hx, hy, hz, 0);
    W().setBlock(c.x, c.y, c.z, C.PISTON + b.face * 4 + st);
    if (st) {
      const fx = hx + d[0], fy = hy + d[1], fz = hz + d[2], id = get(fx, fy, fz);
      if (id > 0 && movable(id) && C.SOLID[id]) { W().setBlock(fx, fy, fz, 0); W().setBlock(hx, hy, hz, id); later.push([fx, fy, fz]); }
    }
    VX.audio.play('piston');
    later.push([hx, hy, hz]);
  }
  // Вторая половина выдвинутого поршня (для ломания целиком)
  function partner(x, y, z, id) {
    const b = BL(id);
    if (b && b.piston && b.extended) { const d = FD[b.face], h = get(x + d[0], y + d[1], z + d[2]); if (BL(h) && BL(h).pistonHead) return { x: x + d[0], y: y + d[1], z: z + d[2], id: h }; }
    if (b && b.pistonHead) { const d = FD[b.face], p = get(x - d[0], y - d[1], z - d[2]); if (BL(p) && BL(p).piston) return { x: x - d[0], y: y - d[1], z: z - d[2], id: p }; }
    return null;
  }

  // ---------- Установка и ПКМ ----------
  const yawDir = () => ((Math.round(G.player.yaw / (Math.PI / 2)) % 4) + 4) % 4;
  function put(x, y, z, id, held) {
    W().setBlock(x, y, z, id);
    if (G.mode === 'survival') G.inv.takeHeld(1);
    VX.audio.play('place', { surface: C.BLOCKS[id].sound });
    G.swing = 1;
    G.emit('place', { id: held.id });
    G.afterChange(x, y, z);
    return { x, y, z };
  }
  function place(t, held) {
    const b = BL(held.id);
    if (!b || !(b.wire !== undefined || b.rsTorch !== undefined || b.repeater || b.button || b.plate || b.piston)) return undefined;
    let { x, y, z } = t.place;
    if (BL(t.id).replaceable) { x = t.x; y = t.y; z = t.z; }
    const cur = get(x, y, z);
    if (y < 1 || y >= C.CH || !(cur === 0 || (cur > 0 && (BL(cur).replaceable || C.FLUID[cur])))) return null;
    const below = get(x, y - 1, z);
    const n = t.n;
    if (b.wire !== undefined || b.repeater || b.plate) {
      if (!fullSolid(below)) return null;
      if (b.wire !== undefined) return put(x, y, z, C.WIRE, held);
      if (b.plate) return put(x, y, z, held.id, held);
      return put(x, y, z, C.REPEATER + yawDir() * 8, held);
    }
    if (b.rsTorch !== undefined) {
      if (n[1] === 1 || BL(t.id).replaceable) { if (!fullSolid(below)) return null; return put(x, y, z, C.RS_TORCH, held); }
      if (n[1] === -1) return null;
      const wall = n[2] === 1 ? 0 : n[0] === -1 ? 1 : n[2] === -1 ? 2 : 3;
      return put(x, y, z, C.RS_TORCH + 1 + wall, held);
    }
    if (b.button) {
      const face = n[1] === 1 ? 4 : n[1] === -1 ? 5 : n[2] === 1 ? 0 : n[0] === -1 ? 1 : n[2] === -1 ? 2 : 3;
      const sp = support({ x, y, z, id: held.id }, { button: true, face });
      if (!fullSolid(get(sp[0], sp[1], sp[2]))) return null;
      return put(x, y, z, held.id + face * 2, held);
    }
    if (b.piston) {
      if (G.blockedByBodies(x, y, z)) return null;
      const pitch = G.player.pitch;
      const face = pitch < -0.8 ? 4 : pitch > 0.8 ? 5 : [2, 1, 0, 3][yawDir()];     // лицом к игроку
      return put(x, y, z, C.PISTON + face * 4 + (b.piston === 'sticky' ? 1 : 0), held);
    }
    return undefined;
  }
  function use(t) {
    const b = BL(t.id);
    if (b.button && !b.pressed) {
      W().setBlock(t.x, t.y, t.z, t.id + 1);
      VX.audio.play('click');
      schedule(b.button === 'wood' ? 1.5 : 1.0, t.x, t.y, t.z, 'button', false);
      update(t.x, t.y, t.z);
      G.swing = 1;
      return 'button';
    }
    if (b.repeater) {
      const dl = b.delay % 4 + 1;
      W().setBlock(t.x, t.y, t.z, C.REPEATER + b.dir * 8 + (dl - 1) * 2 + (b.powered ? 1 : 0));
      VX.audio.play('click');
      G.swing = 1;
      return 'repeater';
    }
    return undefined;
  }
  // что-то поменялось в мире: пересчитать сигнал вокруг
  function after(x, y, z) { update(x, y, z); }
  function reset() { queue.length = 0; later.length = 0; plates.clear(); G.rsPrev = new Map(); }
  G.rsPrev = new Map();

  VX.redstone = { update, tick, place, use, after, partner, reset, schedule, queue, gather, extend, retract };
})();
