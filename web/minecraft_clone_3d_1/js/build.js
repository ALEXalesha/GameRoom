// Строительные блоки: плиты (две в одной клетке - двойная), ступени (поворот по взгляду, перевёрнутые
// сверху), калитки и люки (открываются ПКМ), лестницы (только на стену), заборы и стеклянные панели
// (цепляются к соседям сами, в сетке мира).
(function () {
  'use strict';
  const VX = window.VX, G = VX.game, C = VX.core, D = VX.data, B = C.B;
  const inv = () => G.inv;
  const yawDir = () => ((Math.round(G.player.yaw / (Math.PI / 2)) % 4) + 4) % 4;
  // сторона по нормали грани: 0 -Z, 1 -X, 2 +Z, 3 +X (как у кровати и ступеней)
  const sideOfNormal = (n) => (n[2] === -1 ? 0 : n[0] === -1 ? 1 : n[2] === 1 ? 2 : 3);
  const opp = (d) => (d + 2) % 4;
  // стена лестницы: 0 -Z, 1 +X, 2 +Z, 3 -X (как у факела на стене)
  const LADDER_WALL = [[0, 0, -1], [1, 0, 0], [0, 0, 1], [-1, 0, 0]];
  const fullSolid = (id) => id > 0 && C.RENDER[id] === 1 && C.SOLID[id] === 1;

  function put(x, y, z, id, held) {
    const w = G.world;
    w.setBlock(x, y, z, id);
    if (G.mode === 'survival') inv().takeHeld(1);
    VX.audio.play('place', { surface: C.BLOCKS[id].sound });
    G.swing = 1;
    if (G.meta.stats) G.meta.stats.placed++;
    G.emit('place', { id: held.id });
    G.afterChange(x, y, z);
    return { x, y, z };
  }
  function freeCell(x, y, z) {
    const c = G.world.getBlock(x, y, z);
    return c === 0 || (c > 0 && (C.FLUID[c] || C.BLOCKS[c].replaceable));
  }

  // Установка. undefined - не наш предмет (дальше обычная установка), null - нельзя
  function place(t, held) {
    const b = C.BLOCKS[held.id];
    if (!b || !(b.slab !== undefined || b.stairs !== undefined || b.gate || b.trapdoor || b.ladder !== undefined)) return undefined;
    const w = G.world, tb = C.BLOCKS[t.id];
    const frac = t.hit ? t.hit.y - Math.floor(t.hit.y) : 0.25;
    // плита на плиту того же камня - двойная
    if (b.slab !== undefined) {
      const dbl = C.SLAB + b.slab * 3 + 2;
      if (tb.slab === b.slab && ((tb.half === 0 && t.n[1] === 1) || (tb.half === 1 && t.n[1] === -1))) return put(t.x, t.y, t.z, dbl, held);
      let { x, y, z } = t.place;
      if (tb.replaceable) { x = t.x; y = t.y; z = t.z; }
      const cur = w.getBlock(x, y, z);
      if (cur > 0 && C.BLOCKS[cur].slab === b.slab && C.BLOCKS[cur].half < 2) return put(x, y, z, dbl, held);
      if (!freeCell(x, y, z) || y < 0 || y >= C.CH) return null;
      const top = t.n[1] === -1 || (t.n[1] === 0 && frac > 0.5);
      return put(x, y, z, C.SLAB + b.slab * 3 + (top ? 1 : 0), held);
    }
    let { x, y, z } = t.place;
    if (tb.replaceable) { x = t.x; y = t.y; z = t.z; }
    if (y < 0 || y >= C.CH || !freeCell(x, y, z)) return null;
    if (b.stairs !== undefined) {
      const up = t.n[1] === -1 || (t.n[1] === 0 && frac > 0.5);
      if (G.blockedByBodies(x, y, z)) return null;
      return put(x, y, z, C.STAIRS + b.stairs * 8 + yawDir() * 2 + (up ? 1 : 0), held);
    }
    if (b.gate) {
      if (G.blockedByBodies(x, y, z)) return null;
      return put(x, y, z, C.GATE + yawDir() * 2, held);
    }
    if (b.trapdoor) {
      const base = b.trapdoor === 'wood' ? C.TRAPDOOR : C.IRON_TRAPDOOR;
      let d, top;
      if (t.n[1] === 0) { d = opp(sideOfNormal(t.n)); top = frac > 0.5; } else { d = opp(yawDir()); top = t.n[1] === -1; }
      return put(x, y, z, base + d * 4 + (top ? 1 : 0), held);
    }
    if (b.ladder !== undefined) {
      if (t.n[1] !== 0) return null;                             // лестница - только на стену
      const wall = LADDER_WALL.findIndex((v) => v[0] === -t.n[0] && v[2] === -t.n[2]);
      if (!fullSolid(w.getBlock(x - t.n[0], y, z - t.n[2]))) return null;
      return put(x, y, z, C.LADDER + wall, held);
    }
    return undefined;
  }

  // ПКМ по блоку: калитка открывается от игрока, деревянный люк - рукой, железный - только сигналом
  function use(t) {
    const b = C.BLOCKS[t.id];
    if (b.gate) {
      let d = b.dir;
      if (!b.open && yawDir() % 2 === d % 2) d = yawDir();
      G.world.setBlock(t.x, t.y, t.z, C.GATE + d * 2 + (b.open ? 0 : 1));
      VX.audio.play(b.open ? 'door_close' : 'door_open', { surface: 'wood' });
      G.swing = 1;
      return 'gate';
    }
    if (b.trapdoor === 'wood') {
      setTrapdoor(t.x, t.y, t.z, !b.open);
      G.swing = 1;
      return 'trapdoor';
    }
    return undefined;
  }
  function setTrapdoor(x, y, z, open, sound) {
    const id = G.world.getBlock(x, y, z), b = id > 0 ? C.BLOCKS[id] : null;
    if (!b || !b.trapdoor || b.open === open) return false;
    const base = b.trapdoor === 'wood' ? C.TRAPDOOR : C.IRON_TRAPDOOR;
    G.world.setBlock(x, y, z, base + b.dir * 4 + (open ? 2 : 0) + (b.top ? 1 : 0));
    if (sound !== false) VX.audio.play(open ? 'door_open' : 'door_close', { surface: b.trapdoor === 'wood' ? 'wood' : 'stone' });
    return true;
  }

  // Опора убрана: лестница падает (выпадает предметом)
  function after(x, y, z, here) {
    if (C.SOLID[here] && C.RENDER[here] === 1) return;
    for (let wv = 0; wv < 4; wv++) {
      const v = LADDER_WALL[wv];
      const X = x - v[0], Z = z - v[2];               // клетка, у которой эта клетка была бы стеной
      const id = G.world.getBlock(X, y, Z);
      if (id === C.LADDER + wv) {
        G.world.setBlock(X, y, Z, 0);
        G.popDrops(id, X, y, Z);
        G.afterChange(X, y, Z);
      }
    }
  }

  VX.build = { place, use, after, setTrapdoor, LADDER_WALL };
})();
