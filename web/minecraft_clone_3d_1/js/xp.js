// Опыт по правилам оригинала: зелёные шарики от мобов (враг 5, животное 1-3, ифрит 10), руды (уголь 0-2,
// алмаз и изумруд 3-7, красный камень 1-5, кварц 2-5), печи (при выемке, по таблице) и торговли.
// Уровни: до следующего 2L+7 (до 15), 5L-38 (16-30), 9L-158 (дальше). Полоса опыта над панелью.
// Смерть: выпадает 7 x уровень (не больше 100), остальное пропадает.
(function () {
  'use strict';
  const VX = window.VX, G = VX.game, C = VX.core, B = C.B;
  const rnd = Math.random;
  const toNext = (L) => (L >= 31 ? 9 * L - 158 : L >= 16 ? 5 * L - 38 : 2 * L + 7);
  function add(p, n) {
    n = Math.max(0, Math.floor(n));
    if (!n) return;
    const L0 = p.level || 0;
    p.xpTotal = (p.xpTotal || 0) + n;
    p.xpPoints = (p.xpPoints || 0) + n;
    p.level = L0;
    while (p.xpPoints >= toNext(p.level)) { p.xpPoints -= toNext(p.level); p.level++; }
    if (p.level > L0 && p.level % 5 === 0) VX.audio.play('levelup');
    G.emit('xp', { level: p.level });
  }
  // дробный опыт (печь): целая часть и шанс на единицу
  function addFrac(p, v) { let n = Math.floor(v); if (rnd() < v - n) n++; add(p, n); }
  // потратить уровни (чары, наковальня): прогресс в текущем уровне сохраняется
  function spend(p, levels) { p.level = Math.max(0, (p.level || 0) - levels); p.xpPoints = Math.min(p.xpPoints || 0, toNext(p.level) - 1); }
  const progress = (p) => (p.xpPoints || 0) / toNext(p.level || 0);

  // ---------- Шарики ----------
  const orbs = [];
  const SIZES = [2477, 1237, 617, 307, 149, 73, 37, 17, 7, 3, 1];
  function spawn(x, y, z, total) {
    total = Math.floor(total);
    while (total > 0) {
      const v = SIZES.find((s) => s <= total);
      total -= v;
      orbs.push({ x: x + (rnd() - 0.5) * 0.5, y: y + 0.2, z: z + (rnd() - 0.5) * 0.5, vx: (rnd() - 0.5) * 3, vy: 2 + rnd() * 2, vz: (rnd() - 0.5) * 3, value: v, age: 0, mesh: null });
    }
  }
  let pickT = 0, group = null, tex = null, orbMat = null;
  function update(dt) {
    const p = G.player;
    pickT -= dt;
    for (let i = orbs.length - 1; i >= 0; i--) {
      const o = orbs[i];
      o.age += dt;
      if (o.age > 300 || o.y < -64) { drop(i); continue; }
      const dx = p.pos.x - o.x, dy = p.pos.y + 0.9 - o.y, dz = p.pos.z - o.z, d = Math.hypot(dx, dy, dz);
      if (d < 8 && !p.dead && G.state !== 'dead') {
        const k = (1 - d / 8) * (1 - d / 8) * 30;
        o.vx += dx / d * k * dt; o.vy += dy / d * k * dt; o.vz += dz / d * k * dt;
      }
      o.vy -= 10 * dt;
      const f = Math.pow(0.4, dt); o.vx *= f; o.vz *= f;
      const b = G.world.getBlock(Math.floor(o.x), Math.floor(o.y + o.vy * dt - 0.1), Math.floor(o.z));
      if (b > 0 && C.SOLID[b] && o.vy < 0) o.vy = 0;
      o.x += o.vx * dt; o.y += o.vy * dt; o.z += o.vz * dt;
      if (d < 1.2 && pickT <= 0 && !p.dead && o.age > 0.3) {
        pickT = 0.1;
        add(p, o.value);
        VX.audio.play('orb');
        drop(i);
      }
    }
  }
  function drop(i) { const o = orbs[i]; if (o.mesh && group) group.remove(o.mesh); orbs.splice(i, 1); }
  function render() {
    if (!group) { group = new THREE.Group(); G.scene.add(group); }
    if (!tex) {
      const c = document.createElement('canvas'); c.width = c.height = 8;
      const g = c.getContext('2d');
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const d = Math.hypot(x - 3.5, y - 3.5); if (d < 3.6) { g.fillStyle = d < 1.5 ? '#f0ff90' : d < 2.6 ? '#9aff30' : '#3a9a10'; g.fillRect(x, y, 1, 1); } }
      tex = new THREE.CanvasTexture(c); tex.magFilter = tex.minFilter = THREE.NearestFilter;
    }
    // один материал на все шарики: переливается сам по времени (раньше - свой у каждого шарика)
    if (!orbMat) orbMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
    orbMat.color.setHSL(0.25 + Math.sin(performance.now() / 330) * 0.05, 1, 0.55);
    for (const o of orbs) {
      if (!o.mesh) {
        o.mesh = new THREE.Sprite(orbMat);
        const s = 0.18 + Math.min(0.3, Math.log2(o.value + 1) * 0.04);
        o.mesh.scale.set(s, s, s);
        group.add(o.mesh);
      }
      o.mesh.position.set(o.x, o.y + 0.15 + Math.sin(o.age * 4) * 0.04, o.z);
    }
  }
  function clear() { for (let i = orbs.length - 1; i >= 0; i--) drop(i); }
  // смерть: 7 x уровень (не больше 100) шариками на месте, остальное пропадает
  function onDeath(p) {
    const n = Math.min(100, (p.level || 0) * 7);
    if (n > 0) spawn(p.pos.x, p.pos.y + 0.5, p.pos.z, n);
    p.level = 0; p.xpPoints = 0; p.xpTotal = 0;
  }
  // опыт за блок (в выживании, если руда дала добычу)
  const ORE_XP = { coal_ore: [0, 2], diamond_ore: [3, 7], emerald_ore: [3, 7], redstone_ore: [1, 5], quartz_ore: [2, 5], lapis_ore: [2, 5] };
  function forBlock(id) { const b = C.BLOCKS[id], r = b && ORE_XP[b.key]; return r ? r[0] + Math.floor(rnd() * (r[1] - r[0] + 1)) : 0; }
  function forMob(m) { if (m.def.xp !== undefined) return m.def.xp; return m.def.hostile || m.def.neutral ? 5 : 1 + Math.floor(rnd() * 3); }

  VX.xp = { toNext, add, addFrac, spend, progress, spawn, update, render, clear, onDeath, forBlock, forMob, orbs, ORE_XP };
})();
