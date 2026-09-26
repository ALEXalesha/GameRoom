// Существа и предметы в мире (этап выживания): выпавшие предметы (падают маленькими
// кубиками, притягиваются к игроку и подбираются), осколки при разрушении, свиньи и овцы
// днём, зомби ночью (преследуют, бьют, горят на солнце), удары по мобам, добыча с них.
(function () {
  'use strict';
  const VX = window.VX;
  const C = VX.core, D = VX.data, B = C.B;
  const G = VX.game;
  const P = VX.phys;
  const rnd = Math.random;

  const items = [], mobs = [], parts = [];
  let group = null;
  function scene() { if (!group) { group = new THREE.Group(); G.scene.add(group); } return group; }

  // ---------- Движение коробки по миру (то же отсечение по блокам, что у игрока) ----------
  function move(e, dx, dy, dz) {
    const box = () => [e.x - e.w / 2, e.y, e.z - e.w / 2, e.x + e.w / 2, e.y + e.h, e.z + e.w / 2];
    const ry = P.sweep(G.world, box(), 1, dy); e.y += ry;
    const rx = P.sweep(G.world, box(), 0, dx); e.x += rx;
    const rz = P.sweep(G.world, box(), 2, dz); e.z += rz;
    e.onGround = dy < 0 && ry !== dy;
    if (ry !== dy) e.vy = 0;
    return { cx: rx !== dx, cz: rz !== dz };
  }
  const inWater = (e) => G.world.getBlock(Math.floor(e.x), Math.floor(e.y + 0.3), Math.floor(e.z)) === B.water;
  // На солнце ли точка: днём и над ней ничего не заслоняет небо
  function inSun(x, y, z) { return (G.dayLight || 0) > 0.55 && G.world.skyTop(Math.floor(x), Math.floor(z)) < y; }

  // ---------- Предметы ----------
  function spawnItem(stack, x, y, z, vx, vy, vz, delay) {
    const it = { stack: VX.inv.newStack(stack.id, stack.count, stack.dmg), x, y, z, vx, vy, vz, w: 0.25, h: 0.25, age: 0, delay: delay || 0, onGround: false, mesh: null };
    items.push(it);
    return it;
  }
  function itemMesh(it) {
    const m = G.itemMesh(it.stack.id, 0.25);
    const g = new THREE.Group(); g.add(m);
    if (it.stack.count > 1) { const m2 = G.itemMesh(it.stack.id, 0.25); m2.position.set(0.06, 0.05, 0.05); g.add(m2); }
    scene().add(g);
    return g;
  }
  function updateItems(dt) {
    const p = G.player;
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      it.age += dt; it.delay -= dt;
      if (it.age > 300 || it.y < -64) { removeItem(i); continue; }
      const dx = p.pos.x - it.x, dy = (p.pos.y + 0.8) - it.y, dz = p.pos.z - it.z;
      const dist = Math.hypot(dx, dy, dz);
      const canTake = it.delay <= 0 && !p.dead && G.state !== 'dead';
      if (canTake && dist < 2.5) {
        // притягивается к игроку
        const k = 9 / Math.max(0.3, dist);
        it.vx += dx * k * dt; it.vy += dy * k * dt; it.vz += dz * k * dt;
        it.vx *= 0.8; it.vy *= 0.8; it.vz *= 0.8;
      } else {
        it.vy -= (inWater(it) ? 4 : 20) * dt;
        const f = it.onGround ? Math.pow(0.02, dt) : Math.pow(0.6, dt);
        it.vx *= f; it.vz *= f;
      }
      move(it, it.vx * dt, it.vy * dt, it.vz * dt);
      if (canTake && dist < 1.1) {
        const left = G.inv.add(it.stack.id, it.stack.count, it.stack.dmg);
        const took = it.stack.count - left;
        if (took > 0) { VX.audio.play('pop'); G.emit('pickup', { id: it.stack.id, n: took }); }
        if (left <= 0) { removeItem(i); continue; }
        it.stack.count = left;
      }
      // одинаковые рядом лежащие сливаются в одну стопку
      if (it.onGround && (i & 7) === (G.frameNo & 7)) {
        for (let j = 0; j < items.length; j++) {
          const o = items[j];
          if (o === it || o.stack.id !== it.stack.id || D.maxStack(o.stack.id) < 2) continue;
          if (Math.abs(o.x - it.x) + Math.abs(o.y - it.y) + Math.abs(o.z - it.z) > 1) continue;
          const room = D.maxStack(o.stack.id) - o.stack.count;
          if (room >= it.stack.count) { o.stack.count += it.stack.count; if (o.mesh) { group.remove(o.mesh); o.mesh = null; } removeItem(i); break; }
        }
      }
    }
  }
  function removeItem(i) { const it = items[i]; if (it.mesh) group.remove(it.mesh); items.splice(i, 1); }

  // ---------- Осколки ----------
  const partGeo = new Map();
  function burst(x, y, z, id) {
    if (!C.BLOCKS[id] || C.BLOCKS[id].render === 'none') return;
    let g = partGeo.get(id);
    if (!g) { g = G.cubeGeometry(id, 0.12); partGeo.set(id, g); }
    for (let k = 0; k < 10; k++) {
      const m = new THREE.Mesh(g, G.cubeMat);
      m.position.set(x + 0.2 + rnd() * 0.6, y + 0.2 + rnd() * 0.6, z + 0.2 + rnd() * 0.6);
      scene().add(m);
      parts.push({ m, vx: (rnd() - 0.5) * 4, vy: 2 + rnd() * 3, vz: (rnd() - 0.5) * 4, life: 0.5 + rnd() * 0.4 });
    }
  }
  function updateParts(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const q = parts[i];
      q.life -= dt;
      if (q.life <= 0) { group.remove(q.m); parts.splice(i, 1); continue; }
      q.vy -= 18 * dt;
      const nx = q.m.position.x + q.vx * dt, ny = q.m.position.y + q.vy * dt, nz = q.m.position.z + q.vz * dt;
      const b = G.world.getBlock(Math.floor(nx), Math.floor(ny), Math.floor(nz));
      if (b > 0 && C.SOLID[b]) { q.vx *= 0.3; q.vz *= 0.3; q.vy = 0; } else q.m.position.set(nx, ny, nz);
      q.m.scale.setScalar(Math.min(1, q.life * 3));
    }
  }

  // ---------- Мобы: модели из коробок со своими пиксельными текстурами ----------
  function pixTex(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); draw(g, w, h);
    const t = new THREE.CanvasTexture(c); t.magFilter = t.minFilter = THREE.NearestFilter;
    return t;
  }
  function noiseFill(g, w, h, cols, seed) {
    const r = C.mulberry32(seed);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { g.fillStyle = cols[(r() * cols.length) | 0]; g.fillRect(x, y, 1, 1); }
  }
  const TEX = {};
  function textures() {
    if (TEX.pig) return TEX;
    TEX.pig = pixTex(8, 8, (g, w, h) => noiseFill(g, w, h, ['#f0a0a0', '#e89494', '#f4aeae'], 1));
    TEX.pigFace = pixTex(8, 8, (g, w, h) => {
      noiseFill(g, w, h, ['#f0a0a0', '#e89494', '#f4aeae'], 2);
      g.fillStyle = '#000'; g.fillRect(1, 2, 1, 1); g.fillRect(6, 2, 1, 1);
      g.fillStyle = '#fff'; g.fillRect(0, 2, 1, 1); g.fillRect(7, 2, 1, 1);
    });
    TEX.snout = pixTex(4, 3, (g) => { g.fillStyle = '#e07a88'; g.fillRect(0, 0, 4, 3); g.fillStyle = '#7a3040'; g.fillRect(0, 1, 1, 1); g.fillRect(3, 1, 1, 1); });
    TEX.wool = pixTex(8, 8, (g, w, h) => noiseFill(g, w, h, ['#e8e8e8', '#f4f4f4', '#d8d8d8'], 3));
    TEX.sheepFace = pixTex(8, 8, (g, w, h) => {
      noiseFill(g, w, h, ['#c8b8a8', '#bca898'], 4);
      g.fillStyle = '#000'; g.fillRect(1, 3, 2, 1); g.fillRect(5, 3, 2, 1);
      g.fillStyle = '#fff'; g.fillRect(1, 3, 1, 1); g.fillRect(6, 3, 1, 1);
      g.fillStyle = '#e8a0a0'; g.fillRect(3, 6, 2, 1);
    });
    TEX.skin = pixTex(8, 8, (g, w, h) => noiseFill(g, w, h, ['#c8b8a8', '#bca898'], 5));
    TEX.zSkin = pixTex(8, 8, (g, w, h) => noiseFill(g, w, h, ['#4f8a3a', '#467d33', '#5a9642'], 6));
    TEX.zFace = pixTex(8, 8, (g, w, h) => {
      noiseFill(g, w, h, ['#4f8a3a', '#467d33', '#5a9642'], 7);
      g.fillStyle = '#101010'; g.fillRect(1, 3, 2, 2); g.fillRect(5, 3, 2, 2);
      g.fillStyle = '#2a4a20'; g.fillRect(2, 6, 4, 1); g.fillStyle = '#3a5a2a'; g.fillRect(3, 5, 2, 1);
    });
    TEX.shirt = pixTex(8, 8, (g, w, h) => noiseFill(g, w, h, ['#2aa6a6', '#239a9a', '#30b0b0'], 8));
    TEX.pants = pixTex(8, 8, (g, w, h) => noiseFill(g, w, h, ['#3a3a9a', '#34348e', '#4040a6'], 9));
    TEX.fire = pixTex(8, 8, (g, w, h) => { const r = C.mulberry32(10); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (r() < 0.2 + y / 12) { g.fillStyle = y > 5 ? '#ff5a00' : r() < 0.5 ? '#ffc020' : '#ff8a10'; g.fillRect(x, y, 1, 1); } });
    return TEX;
  }
  function box(w, h, d, tex, faceTex) {
    const mats = [];
    for (let f = 0; f < 6; f++) mats.push(new THREE.MeshLambertMaterial({ map: f === 4 && faceTex ? faceTex : tex }));
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats);
    return m;
  }
  // Сустав: группа, в которой коробка висит вниз от точки крепления
  function limb(w, h, d, tex, x, y, z) {
    const j = new THREE.Group(); j.position.set(x, y, z);
    const m = box(w, h, d, tex); m.position.y = -h / 2; j.add(m);
    return j;
  }
  function buildModel(type) {
    const T = textures();
    const root = new THREE.Group(), body = new THREE.Group();
    root.add(body);
    const legs = [], arms = [];
    let head;
    if (type === 'pig') {
      const torso = box(0.625, 0.5, 0.875, T.pig); torso.position.set(0, 0.625, 0); body.add(torso);
      head = box(0.5, 0.5, 0.5, T.pig, T.pigFace); head.position.set(0, 0.75, 0.6); body.add(head);
      const sn = box(0.25, 0.19, 0.06, T.snout, T.snout); sn.position.set(0, -0.08, 0.28); head.add(sn);
      for (const [x, z] of [[-0.19, 0.3], [0.19, 0.3], [-0.19, -0.3], [0.19, -0.3]]) { const l = limb(0.25, 0.375, 0.25, T.pig, x, 0.375, z); body.add(l); legs.push(l); }
    } else if (type === 'sheep') {
      const torso = box(0.75, 0.6, 1.0, T.wool); torso.position.set(0, 0.9, 0); body.add(torso);
      head = box(0.375, 0.375, 0.5, T.skin, T.sheepFace); head.position.set(0, 1.12, 0.62); body.add(head);
      const cap = box(0.42, 0.2, 0.4, T.wool); cap.position.set(0, 0.14, -0.05); head.add(cap);
      for (const [x, z] of [[-0.22, 0.34], [0.22, 0.34], [-0.22, -0.34], [0.22, -0.34]]) { const l = limb(0.22, 0.75, 0.22, T.skin, x, 0.75, z); body.add(l); legs.push(l); }
    } else {
      const torso = box(0.5, 0.75, 0.25, T.shirt); torso.position.set(0, 1.125, 0); body.add(torso);
      head = box(0.5, 0.5, 0.5, T.zSkin, T.zFace); head.position.set(0, 1.75, 0); body.add(head);
      for (const x of [-0.125, 0.125]) { const l = limb(0.25, 0.75, 0.25, T.pants, x, 0.75, 0); body.add(l); legs.push(l); }
      for (const x of [-0.375, 0.375]) { const a = limb(0.25, 0.75, 0.25, T.zSkin, x, 1.45, 0); a.rotation.x = -Math.PI / 2; body.add(a); arms.push(a); }
    }
    const fire = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.9, 1.0), new THREE.MeshBasicMaterial({ map: T.fire, transparent: true, depthWrite: false, side: THREE.DoubleSide, alphaTest: 0.1 }));
    fire.position.y = 0.95; fire.visible = false; root.add(fire);
    scene().add(root);
    root.traverse((o) => { if (o.material) o.userData.mats = Array.isArray(o.material) ? o.material : [o.material]; });
    return { root, body, legs, arms, head, fire };
  }

  let nextId = 1;
  function spawnMob(type, x, y, z) {
    const def = D.MOBS[type];
    const m = { id: nextId++, type, def, x, y, z, vx: 0, vy: 0, vz: 0, w: def.w, h: def.h, yaw: rnd() * Math.PI * 2, hp: def.hp, onGround: false,
      wander: 0, dirYaw: 0, walking: false, hurtT: 0, panic: 0, attackCool: 0, fireT: 0, burnT: 0, deadT: 0, phase: 0, noiseT: 3 + rnd() * 10, model: null };
    mobs.push(m);
    return m;
  }
  function removeMob(i) { const m = mobs[i]; if (m.model) group.remove(m.model.root); mobs.splice(i, 1); }
  function hurtMob(m, n, fromX, fromZ, cause) {
    if (m.deadT > 0 || m.hp <= 0) return false;
    m.hp -= n;
    m.hurtT = 0.4;
    const dx = m.x - fromX, dz = m.z - fromZ, d = Math.hypot(dx, dz) || 1;
    if (cause !== 'burn') { m.vx = dx / d * 6; m.vz = dz / d * 6; m.vy = 5; }
    if (!m.def.hostile) m.panic = 4;
    VX.audio.play('mobhurt');
    if (m.hp <= 0) {
      m.deadT = 0.001;
      for (const [id, a, b] of m.def.drops) {
        const n2 = a + Math.floor(rnd() * (b - a + 1));
        if (n2 > 0) spawnItem({ id, count: n2 }, m.x, m.y + 0.5, m.z, (rnd() - 0.5) * 2, 3, (rnd() - 0.5) * 2, 0.5);
      }
      G.emit('kill', { mob: m.type, cause });
      if (G.meta && G.meta.stats) G.meta.stats.kills++;
    }
    return true;
  }

  function updateMob(m, dt) {
    const p = G.player;
    if (m.deadT > 0) { m.deadT += dt; return; }
    const water = inWater(m);
    const dxp = p.pos.x - m.x, dzp = p.pos.z - m.z, distP = Math.hypot(dxp, dzp);
    let speed = 0, targetYaw = m.yaw;
    const chase = m.def.hostile && G.mode === 'survival' && !p.dead && G.state !== 'dead' && distP < 24 && Math.abs(p.pos.y - m.y) < 10;
    if (chase) {
      targetYaw = Math.atan2(dxp, dzp);
      speed = m.def.speed;
      m.attackCool -= dt;
      if (distP < 1.25 && Math.abs(p.pos.y - m.y) < 1.6 && m.attackCool <= 0) {
        m.attackCool = 1;
        m.swingT = 0.3;
        if (p.damage(m.def.dmg, 'zombie', (ev, d) => { if (ev === 'hurt') VX.audio.play('hurt'); if (ev === 'death' && G.state !== 'dead') G.onDeath(d); })) {
          p.vel.x += dxp / (distP || 1) * 6; p.vel.z += dzp / (distP || 1) * 6; p.vel.y = 4;
        }
      }
    } else {
      m.wander -= dt;
      if (m.wander <= 0) { m.wander = 2 + rnd() * 5; m.walking = rnd() < 0.6 || m.panic > 0; m.dirYaw = rnd() * Math.PI * 2; }
      targetYaw = m.dirYaw;
      speed = m.walking ? m.def.speed * (m.panic > 0 ? 2 : 0.6) : 0;
      if (m.panic > 0) { m.panic -= dt; if ((m.panicT = (m.panicT || 0) - dt) <= 0) { m.panicT = 1; m.dirYaw = rnd() * Math.PI * 2; } }
    }
    let dy = targetYaw - m.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    m.yaw += dy * Math.min(1, dt * 6);
    const fx = Math.sin(m.yaw), fz = Math.cos(m.yaw);
    // не прыгать с обрыва (кроме погони)
    if (speed > 0 && !chase && m.onGround) {
      const ax = Math.floor(m.x + fx * 0.8), az = Math.floor(m.z + fz * 0.8);
      let drop = 0; for (let y = Math.floor(m.y) - 1; y > Math.floor(m.y) - 5 && !C.SOLID[Math.max(0, G.world.getBlock(ax, y, az))]; y--) drop++;
      if (drop >= 3 || G.world.getBlock(ax, Math.floor(m.y), az) === B.water) { m.dirYaw += Math.PI; speed = 0; }
    }
    const k = 1 - Math.exp(-(m.onGround ? 12 : 2) * dt);
    m.vx += (fx * speed - m.vx) * k; m.vz += (fz * speed - m.vz) * k;
    if (water) { m.vy = Math.min(2, m.vy + 20 * dt); m.vy *= Math.pow(0.2, dt); }
    else m.vy = Math.max(-60, m.vy - 28.2 * dt);
    const hit = move(m, m.vx * dt, m.vy * dt, m.vz * dt);
    if ((hit.cx || hit.cz) && m.onGround && speed > 0) m.vy = 8.4;          // на ступеньку - прыжком
    m.phase += Math.hypot(m.vx, m.vz) * dt * 4;
    m.hurtT = Math.max(0, m.hurtT - dt);
    // зомби горят на солнце
    if (m.type === 'zombie') {
      if (inSun(m.x, m.y + 1.6, m.z) && !water) m.fireT = 1.5;
      else if (water) m.fireT = 0;
      if (m.fireT > 0) {
        m.fireT -= dt; m.burnT += dt;
        if (m.burnT >= 1) { m.burnT -= 1; hurtMob(m, 1, m.x, m.z, 'burn'); }
      } else m.burnT = 0;
    }
    m.noiseT -= dt;
    if (m.noiseT <= 0) { m.noiseT = 6 + rnd() * 10; if (distP < 16) VX.audio.play(m.def.sound); }
  }

  // Появление: днём звери на траве, ночью (или в темноте) зомби; вдали от игрока
  let spawnT = 0;
  function trySpawn() {
    const p = G.player, w = G.world;
    const near = (hostile) => mobs.filter((m) => !!m.def.hostile === hostile && Math.hypot(m.x - p.pos.x, m.z - p.pos.z) < 96).length;
    const night = (G.dayLight || 0) < 0.35;
    const hostile = night ? rnd() < 0.8 : false;
    if (hostile && (G.mode !== 'survival' || near(true) >= 8)) return;
    if (!hostile && near(false) >= 10) return;
    const a = rnd() * Math.PI * 2, r = 24 + rnd() * 24;
    const x = Math.floor(p.pos.x + Math.cos(a) * r), z = Math.floor(p.pos.z + Math.sin(a) * r);
    if (!w.isLoaded(x, z)) return;
    const top = w.skyTop(x, z);
    if (top < 1) return;
    const ground = w.getBlock(x, top, z);
    if (!hostile && ground !== B.grass) return;
    if (hostile && (!C.SOLID[ground] || C.RENDER[ground] !== 1)) return;
    if (w.getBlock(x, top + 1, z) !== 0 || w.getBlock(x, top + 2, z) !== 0) return;
    if (hostile) spawnMob('zombie', x + 0.5, top + 1, z + 0.5);
    else { const t = rnd() < 0.5 ? 'pig' : 'sheep'; const n = 2 + ((rnd() * 2) | 0); for (let k = 0; k < n; k++) spawnMob(t, x + 0.5 + k * 0.3, top + 1, z + 0.5); }
  }

  function update(dt) {
    G.frameNo = (G.frameNo || 0) + 1;
    updateItems(dt);
    updateParts(dt);
    const p = G.player;
    for (let i = mobs.length - 1; i >= 0; i--) {
      const m = mobs[i];
      if (!G.world.isLoaded(m.x, m.z)) continue;               // кусок ещё не загружен - ждём
      updateMob(m, dt);
      if (m.deadT > 0.6 || m.y < -64 || Math.hypot(m.x - p.pos.x, m.z - p.pos.z) > 128) removeMob(i);
    }
    spawnT -= dt;
    if (spawnT <= 0 && G.autoSpawn !== false) { spawnT = 1; trySpawn(); }
  }

  // Удар по мобу под прицелом (раньше блока, если моб ближе)
  function rayMob(maxD) {
    const p = G.player, o = new THREE.Vector3(p.pos.x, p.eye(), p.pos.z), d = p.forward();
    let best = null, bd = maxD;
    for (const m of mobs) {
      if (m.deadT > 0) continue;
      const lo = [m.x - m.w / 2, m.y, m.z - m.w / 2], hi = [m.x + m.w / 2, m.y + m.h, m.z + m.w / 2];
      let t0 = 0, t1 = bd;
      const oa = [o.x, o.y, o.z], da = [d.x, d.y, d.z];
      let ok = true;
      for (let k = 0; k < 3 && ok; k++) {
        if (Math.abs(da[k]) < 1e-9) { if (oa[k] < lo[k] || oa[k] > hi[k]) ok = false; continue; }
        let a = (lo[k] - oa[k]) / da[k], b = (hi[k] - oa[k]) / da[k];
        if (a > b) { const t = a; a = b; b = t; }
        t0 = Math.max(t0, a); t1 = Math.min(t1, b);
        if (t0 > t1) ok = false;
      }
      if (ok && t0 < bd) { bd = t0; best = m; }
    }
    return best ? { mob: best, dist: bd } : null;
  }
  function attack() {
    const hit = rayMob(3.5);
    if (!hit) return false;
    const t = G.target();
    if (t && t.dist < hit.dist) return false;
    const held = G.inv.held();
    const tool = D.toolOf(held && held.id);
    const dmg = tool ? tool.dmg : 1;
    const p = G.player;
    hurtMob(hit.mob, dmg, p.pos.x, p.pos.z, 'player');
    if (tool) { G.inv.wearHeld(); if (tool.type !== 'sword') G.inv.wearHeld(); }
    G.swing = 1;
    p.exhaust(0.1);
    return true;
  }

  function render() {
    const L = G.localLight ? G.localLight() : 1;
    for (const it of items) {
      if (!it.mesh) it.mesh = itemMesh(it);
      it.mesh.position.set(it.x, it.y + 0.15 + Math.sin(it.age * 2.5) * 0.05, it.z);
      it.mesh.rotation.y = it.age * 1.5;
    }
    for (const m of mobs) {
      if (!m.model) m.model = buildModel(m.type);
      const md = m.model;
      md.root.position.set(m.x, m.y, m.z);
      md.root.rotation.y = m.yaw;
      const sw = Math.sin(m.phase) * 0.7 * Math.min(1, Math.hypot(m.vx, m.vz));
      md.legs.forEach((l, k) => { l.rotation.x = (md.legs.length === 4 ? (k === 0 || k === 3) : k === 0) ? sw : -sw; });
      md.arms.forEach((a, k) => { a.rotation.x = -Math.PI / 2 + (k ? sw : -sw) * 0.2 - (m.swingT > 0 ? 0.5 : 0); });
      if (m.swingT > 0) m.swingT -= 0.016;
      md.body.rotation.z = m.deadT > 0 ? Math.min(Math.PI / 2, m.deadT * 4) : 0;
      md.fire.visible = m.fireT > 0 && m.deadT === 0;
      if (md.fire.visible) md.fire.rotation.y += 0.2;
      // освещение у моба и красная вспышка после удара
      m.lightT = (m.lightT || 0) - 1;
      if (m.lightT <= 0) { m.lightT = 15; m.light = G.lightAt(m.x, m.y + 1, m.z); }
      const red = m.hurtT > 0 || m.deadT > 0;
      const l = (m.light || 1) / Math.max(0.15, L);
      md.root.traverse((o) => { if (o.userData.mats && o !== md.fire) for (const mt of o.userData.mats) mt.color.setRGB(Math.min(2, l) * (red ? 1.4 : 1), Math.min(2, l) * (red ? 0.45 : 1), Math.min(2, l) * (red ? 0.45 : 1)); });
    }
  }

  function bodies() { return mobs.filter((m) => m.deadT === 0).map((m) => [m.x - m.w / 2, m.y, m.z - m.w / 2, m.x + m.w / 2, m.y + m.h, m.z + m.w / 2]); }
  function clear() {
    for (let i = items.length - 1; i >= 0; i--) removeItem(i);
    for (let i = mobs.length - 1; i >= 0; i--) removeMob(i);
    for (const q of parts) group.remove(q.m);
    parts.length = 0;
  }
  function reset(meta) {
    clear();
    if (!meta || !meta.entities) return;
    for (const it of meta.entities.items || []) spawnItem(it.s, it.x, it.y, it.z, 0, 0, 0, 0).age = it.age || 0;
    for (const m of meta.entities.mobs || []) { if (!D.MOBS[m.t]) continue; const e = spawnMob(m.t, m.x, m.y, m.z); e.hp = m.hp; e.yaw = m.yaw || 0; }
  }
  function save(meta) {
    const r = (v) => Math.round(v * 100) / 100;
    meta.entities = {
      items: items.slice(-200).map((it) => ({ s: VX.inv.clone(it.stack), x: r(it.x), y: r(it.y), z: r(it.z), age: Math.round(it.age) })),
      mobs: mobs.filter((m) => m.deadT === 0).map((m) => ({ t: m.type, x: r(m.x), y: r(m.y), z: r(m.z), hp: m.hp, yaw: r(m.yaw) })),
    };
  }

  VX.entities = { spawnItem, spawnMob, burst, update, render, attack, bodies, reset, save, clear, hurtMob, items, mobs, inSun, rayMob };
})();
