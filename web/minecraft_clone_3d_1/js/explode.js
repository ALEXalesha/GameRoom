// Взрыв по правилам оригинала: лучи из центра (16x16x16 направлений по поверхности куба), сила луча
// power x (0.7..1.3) гаснет на каждом шаге 0.3 и на прочности блоков; блоки, где луч ещё жив, рушатся
// (в выживании выпадает 1/power из них). Урон существам: (удар² + удар)/2 x 7 x 2power + 1, где
// удар = (1 - расстояние/2power) x доля открытых лучей до центра. Броня и щит спереди гасят урон.
(function () {
  'use strict';
  const VX = window.VX, G = VX.game, C = VX.core, D = VX.data, B = C.B;

  // Сопротивление взрыву: камень и кирпич 6, обсидиан 1200, бедрок и жидкости не рушатся
  function resist(id) {
    const b = C.BLOCKS[id];
    if (!b) return 0;
    if (b.blast !== undefined) return b.blast;
    if (b.hardness < 0 || C.FLUID[id]) return 1e9;
    if (b.tool === 'pickaxe') return Math.max(b.hardness, 6);
    if (b.tool === 'axe') return Math.max(b.hardness, 3);
    return b.hardness;
  }
  // Доля лучей от точек коробки существа до центра, не упёршихся в твёрдый блок
  function exposure(box, x, y, z) {
    let open = 0, n = 0;
    for (let i = 0; i <= 2; i++) for (let j = 0; j <= 2; j++) for (let k = 0; k <= 2; k++) {
      const px = box[0] + (box[3] - box[0]) * i / 2, py = box[1] + (box[4] - box[1]) * j / 2, pz = box[2] + (box[5] - box[2]) * k / 2;
      n++;
      const d = Math.hypot(px - x, py - y, pz - z), steps = Math.ceil(d / 0.25);
      let clear = true;
      for (let s = 1; s < steps && clear; s++) {
        const t = s / steps, id = G.world.getBlock(Math.floor(x + (px - x) * t), Math.floor(y + (py - y) * t), Math.floor(z + (pz - z) * t));
        if (id > 0 && C.SOLID[id] && C.RENDER[id] === 1) clear = false;
      }
      if (clear) open++;
    }
    return open / n;
  }
  function damageFor(dist, power, exp) {
    const d = dist / (2 * power);
    if (d > 1) return 0;
    const impact = (1 - d) * exp;
    return Math.floor((impact * impact + impact) / 2 * 7 * 2 * power + 1);
  }

  function explode(x, y, z, power, opts) {
    opts = opts || {};
    const w = G.world, rnd = opts.rnd || Math.random;
    const gone = new Map();
    if (opts.breakBlocks !== false) {
      for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) for (let k = 0; k < 16; k++) {
        if (i && j && k && i < 15 && j < 15 && k < 15) continue;
        let dx = i / 15 * 2 - 1, dy = j / 15 * 2 - 1, dz = k / 15 * 2 - 1;
        const len = Math.hypot(dx, dy, dz); dx /= len; dy /= len; dz /= len;
        let f = power * (0.7 + rnd() * 0.6), px = x, py = y, pz = z;
        while (f > 0) {
          const bx = Math.floor(px), by = Math.floor(py), bz = Math.floor(pz);
          if (by < 0 || by >= C.CH) break;
          const id = w.getBlock(bx, by, bz);
          if (id < 0) break;
          if (id > 0) f -= (resist(id) + 0.3) * 0.3;
          if (f > 0 && id > 0 && by > 0) gone.set(bx + ',' + by + ',' + bz, id);
          px += dx * 0.3; py += dy * 0.3; pz += dz * 0.3;
          f -= 0.225;
        }
      }
      for (const [k, id] of gone) {
        const [bx, by, bz] = k.split(',').map(Number);
        if (w.getBlock(bx, by, bz) !== id) continue;
        w.setBlock(bx, by, bz, 0);
        if (G.mode === 'survival' && rnd() < 1 / power) G.popDrops(id, bx, by, bz);
        if (G.chests[k]) { for (const s of G.chests[k]) if (s) G.dropItem(s, false, bx + 0.5, by + 0.5, bz + 0.5); delete G.chests[k]; }
        if (G.furnaces[k]) { for (const s of G.furnaces[k].slots) if (s) G.dropItem(s, false, bx + 0.5, by + 0.5, bz + 0.5); delete G.furnaces[k]; }
      }
      for (const k of gone.keys()) { const [bx, by, bz] = k.split(',').map(Number); G.afterChange(bx, by, bz); }
    }
    // существа
    const p = G.player, E = VX.entities;
    const hurtPlayer = () => {
      if (p.dead || G.mode !== 'survival') return 0;
      const pb = p.box(), cx = p.pos.x, cy = p.pos.y + 0.9, cz = p.pos.z;
      const n = damageFor(Math.hypot(cx - x, cy - y, cz - z), power, exposure(pb, x, y, z));
      if (n > 0) {
        const hit = p.damage(n, 'explosion', opts.ev, true, { x, z });
        if (hit) { const dd = Math.hypot(cx - x, cz - z) || 1, kb = (1 - Math.hypot(cx - x, cy - y, cz - z) / (2 * power)) * 12; p.vel.x += (cx - x) / dd * kb; p.vel.z += (cz - z) / dd * kb; p.vel.y += kb * 0.5; }
      }
      return n;
    };
    const playerDmg = hurtPlayer();
    if (E) {
      for (const m of E.mobs) {
        if (m.deadT > 0 || m === opts.source) continue;
        const mb = [m.x - m.w / 2, m.y, m.z - m.w / 2, m.x + m.w / 2, m.y + m.h, m.z + m.w / 2];
        const n = damageFor(Math.hypot(m.x - x, m.y + m.h / 2 - y, m.z - z), power, exposure(mb, x, y, z));
        if (n > 0) { m.hurtT = 0; E.hurtMob(m, n, x, z, 'explosion'); }
      }
      // предметы на земле сгорают во взрыве
      for (let i = E.items.length - 1; i >= 0; i--) { const it = E.items[i]; if (Math.hypot(it.x - x, it.y - y, it.z - z) < power) E.removeItemAt(i); }
      E.blast(x, y, z, power);
    }
    VX.audio.play('explode');
    G.emit('explode', { x, y, z, power, blocks: gone.size });
    return { blocks: gone.size, playerDmg };
  }

  VX.explode = explode;
  VX.explodeMath = { damageFor, exposure, resist };
})();
