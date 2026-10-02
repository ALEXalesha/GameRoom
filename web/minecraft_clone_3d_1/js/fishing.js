// Рыбалка по правилам оригинала: удочка (палки и нитки), ПКМ - заброс поплавка; упал в воду - ждёт
// поклёвку 5-30 секунд, поклёвка - поплавок ныряет с плеском, и на 0.8 секунды можно подсечь (ПКМ).
// Улов летит к герою: рыба 85% (треска и лосось), хлам 10%, сокровища 5% (лук, зачарованная книга,
// удочка); опыт 1-6; удочка изнашивается на 1 за улов. Подсёк без поклёвки - поплавок просто вернулся.
(function () {
  'use strict';
  const VX = window.VX, G = VX.game, C = VX.core, D = VX.data, B = C.B;
  const I = D.I;
  const R = { rnd: Math.random };
  const W = () => G.world;
  let bob = null, line = null, bobMesh = null;
  const isWater = (x, y, z) => { const id = W().getBlock(Math.floor(x), Math.floor(y), Math.floor(z)); return id > 0 && C.FLUID[id] === 1; };

  function cast() {
    const p = G.player, d = p.forward();
    bob = { x: p.pos.x + d.x * 0.6, y: p.eye() - 0.1, z: p.pos.z + d.z * 0.6, vx: d.x * 12, vy: d.y * 12 + 3, vz: d.z * 12, state: 'fly', wait: 0, biteT: 0, dip: 0, age: 0, dim: G.dim };
    VX.audio.play('bow');
    G.swing = 1;
    G.emit('cast', {});
    return 'cast';
  }
  const newWait = () => 5 + R.rnd() * 25;
  // Улов по таблице оригинала (упрощённой): рыба, хлам, сокровища
  function roll() {
    const q = R.rnd();
    if (q < 0.85) return R.rnd() < 0.7 ? VX.inv.newStack(I.raw_cod, 1) : VX.inv.newStack(I.raw_salmon, 1);
    if (q < 0.95) { const junk = [I.stick, I.string, I.bone, I.rotten_flesh, I.leather]; return VX.inv.newStack(junk[(R.rnd() * junk.length) | 0], 1); }
    const t = R.rnd();
    if (t < 0.34) return VX.inv.newStack(I.bow, 1, Math.floor(D.toolOf(I.bow).dur * (0.2 + R.rnd() * 0.5)));
    if (t < 0.67 && VX.enchant) { const keys = Object.keys(VX.enchant.ENCH), k = keys[(R.rnd() * keys.length) | 0]; return VX.inv.newStack(I.enchanted_book, 1, 0, { ench: [[k, 1 + ((R.rnd() * VX.enchant.ENCH[k].max) | 0)]] }); }
    return VX.inv.newStack(I.fishing_rod, 1, Math.floor(64 * (0.2 + R.rnd() * 0.5)));
  }
  // Подсечь: с поклёвкой - улов летит к герою, без неё - поплавок возвращается
  function reel() {
    const b = bob;
    remove();
    G.swing = 1;
    if (!b || b.state !== 'float' || b.biteT <= 0) { VX.audio.play('pop'); return 'reel'; }
    const p = G.player, s = roll();
    const dx = p.pos.x - b.x, dy = p.pos.y + 1 - b.y, dz = p.pos.z - b.z, dist = Math.hypot(dx, dz);
    const T = 0.5 + dist * 0.04;
    if (VX.entities) VX.entities.spawnItem(s, b.x, b.y + 0.3, b.z, dx / T / 0.8, (dy + 10 * T * T) / T, dz / T / 0.8, 0);
    if (VX.xp) VX.xp.spawn(p.pos.x, p.pos.y + 0.5, p.pos.z, 1 + ((R.rnd() * 6) | 0));
    if (G.mode === 'survival') G.inv.wearHeld();
    VX.audio.play('splash');
    G.emit('fish', { id: s.id });
    return 'catch';
  }
  // ПКМ держат - удочка срабатывает один раз на нажатие
  function use(held, hi) {
    if (hi.key !== 'fishing_rod') return undefined;
    if (G.mouse.r && G.rodHeld) return null;
    G.rodHeld = true;
    return bob ? reel() : cast();
  }
  function remove() {
    bob = null;
    if (bobMesh) bobMesh.visible = false;
    if (line) line.visible = false;
  }
  function tick(dt) {
    if (!G.mouse.r) G.rodHeld = false;
    if (!bob) return;
    const p = G.player, held = G.inv.held();
    // удочку убрали из руки, ушли далеко или в другой мир - леска рвётся
    if (!held || held.id !== I.fishing_rod || bob.dim !== G.dim || Math.hypot(p.pos.x - bob.x, p.pos.y - bob.y, p.pos.z - bob.z) > 32 || p.dead) { remove(); return; }
    bob.age += dt;
    if (bob.state === 'fly') {
      bob.vy -= 20 * dt;
      for (let s = 0; s < 4; s++) {
        const nx = bob.x + bob.vx * dt / 4, ny = bob.y + bob.vy * dt / 4, nz = bob.z + bob.vz * dt / 4;
        if (isWater(nx, ny, nz)) {
          bob.state = 'float'; bob.x = nx; bob.z = nz;
          let top = Math.floor(ny); while (isWater(nx, top + 1, nz) && top < C.CH - 1) top++;
          bob.y = top + 0.8; bob.wait = newWait();
          VX.audio.play('splash');
          return;
        }
        const id = W().getBlock(Math.floor(nx), Math.floor(ny), Math.floor(nz));
        if (id !== 0 && (id < 0 || C.SOLID[id])) { bob.state = 'ground'; return; }
        bob.x = nx; bob.y = ny; bob.z = nz;
      }
      if (bob.y < -10) remove();
      return;
    }
    if (bob.state === 'float') {
      if (!isWater(bob.x, bob.y - 0.3, bob.z)) { bob.state = 'fly'; bob.vx = bob.vy = bob.vz = 0; return; }   // вода ушла
      if (bob.biteT > 0) {
        bob.biteT -= dt;
        if (bob.biteT <= 0) { bob.biteT = 0; bob.wait = newWait(); }          // не успел - рыба ушла
      } else {
        bob.wait -= dt;
        if (bob.wait <= 0) { bob.biteT = 0.8; VX.audio.play('splash'); G.emit('bite', {}); }
      }
    }
  }
  function render() {
    if (!bob) return;
    if (!bobMesh) {
      bobMesh = new THREE.Group();
      const a = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.16), new THREE.MeshLambertMaterial({ color: 0xe02020 }));
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.16), new THREE.MeshLambertMaterial({ color: 0xf0f0f0 }));
      a.position.y = 0.1; b.position.y = 0.0; bobMesh.add(a, b);
      G.scene.add(bobMesh);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
      line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x202020 }));
      line.frustumCulled = false;
      G.scene.add(line);
    }
    const dip = bob.biteT > 0 ? -0.25 : bob.state === 'float' ? Math.sin(bob.age * 3) * 0.03 : 0;
    bobMesh.visible = true; line.visible = true;
    bobMesh.position.set(bob.x, bob.y + dip, bob.z);
    // леска: от кончика удочки (справа впереди от глаз) к поплавку
    const p = G.player, f = p.forward(), rx = -f.z, rz = f.x;
    const a = line.geometry.attributes.position;
    // от кончика удочки в руке (картинка удочки: кончик справа сверху), от третьего лица - примерно у руки
    const tip = G.handPoint ? G.handPoint(13.5 / 16 - 0.5, 0.5 - 3 / 16) : null;
    if (tip) a.setXYZ(0, tip.x, tip.y, tip.z);
    else a.setXYZ(0, p.pos.x + f.x * 0.8 + rx * 0.3, p.eye() - 0.2 + f.y * 0.8, p.pos.z + f.z * 0.8 + rz * 0.3);
    a.setXYZ(1, bob.x, bob.y + dip + 0.12, bob.z);
    a.needsUpdate = true;
  }
  function reset() { remove(); }

  VX.fishing = { get line() { return line; }, R, use, cast, reel, roll, tick, render, reset, get bob() { return bob; } };
})();
