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
  const inWater = (e) => { const b = G.world.getBlock(Math.floor(e.x), Math.floor(e.y + 0.3), Math.floor(e.z)); return b > 0 && C.FLUID[b] > 0; };
  // На солнце ли точка: днём и над ней ничего не заслоняет небо
  function inSun(x, y, z) { return (G.dayLight || 0) > 0.55 && G.world.skyTop(Math.floor(x), Math.floor(z)) < y; }

  // ---------- Предметы ----------
  function spawnItem(stack, x, y, z, vx, vy, vz, delay) {
    const it = { stack: VX.inv.newStack(stack.id, stack.count, stack.dmg), x, y, z, vx, vy, vz, w: 0.25, h: 0.25, age: 0, delay: delay || 0, onGround: false, mesh: null };
    items.push(it);
    return it;
  }
  // материал спрайта общий на id - его не освобождаем, геометрия общая (G.itemMesh)
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
        const wet = inWater(it);
        it.vy -= (wet ? 4 : 20) * dt;
        const f = wet ? Math.pow(0.05, dt) : it.onGround ? Math.pow(0.02, dt) : Math.pow(0.6, dt);
        it.vx *= f; it.vz *= f;
        // течение уносит предмет
        const fl = wet && P.flowAt(G.world, Math.floor(it.x), Math.floor(it.y + 0.1), Math.floor(it.z));
        if (fl) { it.vx += fl.x * 6 * dt; it.vz += fl.z * 6 * dt; }
      }
      move(it, it.vx * dt, it.vy * dt, it.vz * dt);
      // кактус, лава и огонь уничтожают предметы
      const ib = [it.x - 0.125, it.y, it.z - 0.125, it.x + 0.125, it.y + 0.25, it.z + 0.125];
      if (P.touching(G.world, ib, P.isCactus, 0.03) || P.touching(G.world, ib, P.isLava, 0) || P.touching(G.world, ib, P.isFire, 0)) { VX.audio.play('fizz'); removeItem(i); continue; }
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
  // облачко при гибели моба
  let poofGeo = null;
  const poofMat = new THREE.MeshBasicMaterial({ color: 0xdddddd, transparent: true, opacity: 0.8 });
  function poof(m) {
    if (!poofGeo) poofGeo = new THREE.BoxGeometry(0.18, 0.18, 0.18);
    for (let k = 0; k < 14; k++) {
      const q = new THREE.Mesh(poofGeo, poofMat);
      q.position.set(m.x + (rnd() - 0.5) * m.w, m.y + rnd() * m.h, m.z + (rnd() - 0.5) * m.w);
      scene().add(q);
      parts.push({ m: q, vx: (rnd() - 0.5) * 2, vy: 1 + rnd() * 2, vz: (rnd() - 0.5) * 2, life: 0.6 + rnd() * 0.4, float: true });
    }
  }
  const blastMat = new THREE.MeshBasicMaterial({ color: 0xf0f0f0, transparent: true, opacity: 0.85 });
  function blast(x, y, z, power) {
    if (!poofGeo) poofGeo = new THREE.BoxGeometry(0.18, 0.18, 0.18);
    for (let k = 0; k < 40; k++) {
      const q = new THREE.Mesh(poofGeo, blastMat);
      const a = rnd() * Math.PI * 2, e = (rnd() - 0.3) * 2, r = rnd() * power * 0.8;
      q.position.set(x + Math.cos(a) * r, y + e, z + Math.sin(a) * r);
      scene().add(q);
      parts.push({ m: q, vx: Math.cos(a) * 3, vy: 1 + rnd() * 2, vz: Math.sin(a) * 3, life: 0.5 + rnd() * 0.6, float: true, big: true });
    }
  }
  function updateParts(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const q = parts[i];
      q.life -= dt;
      if (q.life <= 0) { group.remove(q.m); parts.splice(i, 1); continue; }
      q.vy -= (q.float ? -1 : 18) * dt;
      const nx = q.m.position.x + q.vx * dt, ny = q.m.position.y + q.vy * dt, nz = q.m.position.z + q.vz * dt;
      const b = G.world.getBlock(Math.floor(nx), Math.floor(ny), Math.floor(nz));
      if (b > 0 && C.SOLID[b]) { q.vx *= 0.3; q.vz *= 0.3; q.vy = 0; } else q.m.position.set(nx, ny, nz);
      q.m.scale.setScalar(Math.min(q.big ? 4 : 1, q.life * (q.big ? 6 : 3)));
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
  const face = (base, eyes, extra) => (g, w, h) => {
    noiseFill(g, w, h, base, eyes.length * 7 + base[0].length);
    for (const [x, y, c] of eyes) { g.fillStyle = c; g.fillRect(x, y, 1, 1); }
    if (extra) extra(g);
  };
  const TEX = {};
  const WOOL_COL = { white: ['#e8e8e8', '#f4f4f4', '#d8d8d8'], red: ['#a82a24', '#b83430', '#962420'], yellow: ['#f0c828', '#f8d840', '#e0b818'], blue: ['#34389a', '#3e44aa', '#2c3088'], green: ['#546d1b', '#5e7a20', '#4a6018'], black: ['#26262a', '#303036', '#1e1e22'] };
  function textures() {
    if (TEX.pig) return TEX;
    TEX.pig = pixTex(8, 8, (g, w, h) => noiseFill(g, w, h, ['#f0a0a0', '#e89494', '#f4aeae'], 1));
    TEX.pigFace = pixTex(8, 8, face(['#f0a0a0', '#e89494', '#f4aeae'], [[1, 2, '#000'], [6, 2, '#000'], [0, 2, '#fff'], [7, 2, '#fff']]));
    TEX.snout = pixTex(4, 3, (g) => { g.fillStyle = '#e07a88'; g.fillRect(0, 0, 4, 3); g.fillStyle = '#7a3040'; g.fillRect(0, 1, 1, 1); g.fillRect(3, 1, 1, 1); });
    for (const c in WOOL_COL) TEX['wool_' + c] = pixTex(8, 8, (g, w, h) => noiseFill(g, w, h, WOOL_COL[c], 3));
    TEX.sheepFace = pixTex(8, 8, face(['#c8b8a8', '#bca898'], [[1, 3, '#fff'], [2, 3, '#000'], [5, 3, '#000'], [6, 3, '#fff'], [3, 6, '#e8a0a0'], [4, 6, '#e8a0a0']]));
    TEX.skin = pixTex(8, 8, (g, w, h) => noiseFill(g, w, h, ['#c8b8a8', '#bca898'], 5));
    TEX.zSkin = pixTex(8, 8, (g, w, h) => noiseFill(g, w, h, ['#4f8a3a', '#467d33', '#5a9642'], 6));
    TEX.zFace = pixTex(8, 8, face(['#4f8a3a', '#467d33', '#5a9642'], [[1, 3, '#101010'], [2, 3, '#101010'], [1, 4, '#101010'], [2, 4, '#101010'], [5, 3, '#101010'], [6, 3, '#101010'], [5, 4, '#101010'], [6, 4, '#101010'], [2, 6, '#2a4a20'], [3, 6, '#2a4a20'], [4, 6, '#2a4a20'], [5, 6, '#2a4a20']]));
    TEX.shirt = pixTex(8, 8, (g, w, h) => noiseFill(g, w, h, ['#2aa6a6', '#239a9a', '#30b0b0'], 8));
    TEX.pants = pixTex(8, 8, (g, w, h) => noiseFill(g, w, h, ['#3a3a9a', '#34348e', '#4040a6'], 9));
    TEX.fire = pixTex(8, 8, (g, w, h) => { const r = C.mulberry32(10); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (r() < 0.2 + y / 12) { g.fillStyle = y > 5 ? '#ff5a00' : r() < 0.5 ? '#ffc020' : '#ff8a10'; g.fillRect(x, y, 1, 1); } });
    // корова: чёрно-белая, свой рисунок пятен
    TEX.cow = pixTex(8, 8, (g, w, h) => { noiseFill(g, w, h, ['#3a2a1e', '#44301f', '#342418'], 11); g.fillStyle = '#e8e8e8'; g.fillRect(1, 1, 3, 2); g.fillRect(5, 4, 2, 3); g.fillRect(2, 5, 2, 2); });
    TEX.cowFace = pixTex(8, 8, face(['#3a2a1e', '#44301f'], [[1, 3, '#fff'], [2, 3, '#000'], [5, 3, '#000'], [6, 3, '#fff']], (g) => { g.fillStyle = '#c8a898'; g.fillRect(2, 5, 4, 3); g.fillStyle = '#5a3a3a'; g.fillRect(2, 6, 1, 1); g.fillRect(5, 6, 1, 1); }));
    TEX.horn = pixTex(2, 2, (g) => { g.fillStyle = '#d8d0b8'; g.fillRect(0, 0, 2, 2); });
    TEX.chicken = pixTex(8, 8, (g, w, h) => noiseFill(g, w, h, ['#f4f4f4', '#e8e8e8', '#ffffff'], 12));
    TEX.chickenFace = pixTex(8, 8, face(['#f4f4f4', '#ffffff'], [[1, 2, '#000'], [6, 2, '#000']]));
    TEX.beak = pixTex(4, 2, (g) => { g.fillStyle = '#f0a020'; g.fillRect(0, 0, 4, 2); });
    TEX.wattle = pixTex(2, 2, (g) => { g.fillStyle = '#d02020'; g.fillRect(0, 0, 2, 2); });
    TEX.chickenLeg = pixTex(2, 4, (g) => { g.fillStyle = '#f0a020'; g.fillRect(0, 0, 2, 4); });
    TEX.bone = pixTex(8, 8, (g, w, h) => noiseFill(g, w, h, ['#c8c8c8', '#bdbdbd', '#d4d4d4'], 13));
    TEX.skull = pixTex(8, 8, face(['#c8c8c8', '#bdbdbd', '#d4d4d4'], [[1, 3, '#202020'], [2, 3, '#202020'], [1, 4, '#202020'], [2, 4, '#202020'], [5, 3, '#202020'], [6, 3, '#202020'], [5, 4, '#202020'], [6, 4, '#202020'], [3, 5, '#505050'], [4, 5, '#505050'], [2, 6, '#606060'], [3, 6, '#404040'], [4, 6, '#606060'], [5, 6, '#404040']]));
    TEX.spider = pixTex(8, 8, (g, w, h) => noiseFill(g, w, h, ['#3a2e2a', '#2e2420', '#443630'], 14));
    TEX.creeper = pixTex(8, 8, (g, w, h) => noiseFill(g, w, h, ['#5aa83a', '#4c9a30', '#6cbc48', '#3f8a26', '#78c858'], 20));
    TEX.creeperFace = pixTex(8, 8, face(['#5aa83a', '#4c9a30', '#6cbc48', '#3f8a26'], [], (g) => {
      g.fillStyle = '#101010';
      g.fillRect(1, 2, 2, 2); g.fillRect(5, 2, 2, 2);                 // глаза
      g.fillRect(3, 4, 2, 3); g.fillRect(2, 5, 1, 3); g.fillRect(5, 5, 1, 3);   // рот
    }));
    TEX.pigSkin = pixTex(8, 8, (g, w, h) => { noiseFill(g, w, h, ['#e8a0a0', '#d88c8c', '#f0b0b0'], 21); g.fillStyle = '#6a9a4a'; g.fillRect(1, 2, 2, 3); g.fillRect(5, 5, 2, 2); g.fillStyle = '#e8e0d0'; g.fillRect(3, 1, 1, 4); });
    TEX.pigmanFace = pixTex(8, 8, face(['#e8a0a0', '#d88c8c'], [[1, 3, '#fff'], [2, 3, '#101010'], [5, 3, '#101010'], [6, 3, '#fff']], (g) => { g.fillStyle = '#c86a7a'; g.fillRect(2, 5, 4, 2); g.fillStyle = '#6a2a3a'; g.fillRect(3, 6, 1, 1); g.fillRect(5, 6, 1, 1); g.fillStyle = '#6a9a4a'; g.fillRect(6, 1, 2, 2); }));
    TEX.loin = pixTex(8, 8, (g, w, h) => noiseFill(g, w, h, ['#6a4a2a', '#5a3e22', '#7a5632'], 22));
    TEX.ghast = pixTex(16, 16, (g, w, h) => noiseFill(g, w, h, ['#f0f0f0', '#e4e4e4', '#fafafa', '#dcdcdc'], 23));
    TEX.ghastFace = pixTex(16, 16, face(['#f0f0f0', '#e4e4e4', '#fafafa'], [], (g) => {
      g.fillStyle = '#303030'; g.fillRect(3, 5, 3, 2); g.fillRect(10, 5, 3, 2);           // закрытые глаза
      g.fillStyle = '#a0a0a0'; g.fillRect(3, 7, 3, 1); g.fillRect(10, 7, 3, 1);
      g.fillStyle = '#202020'; g.fillRect(6, 10, 4, 2); g.fillRect(7, 12, 2, 1);          // рот
    }));
    TEX.ghastAngry = pixTex(16, 16, face(['#f0f0f0', '#e4e4e4', '#fafafa'], [], (g) => {
      g.fillStyle = '#101010'; g.fillRect(3, 4, 3, 4); g.fillRect(10, 4, 3, 4); g.fillStyle = '#c02020'; g.fillRect(3, 7, 3, 1); g.fillRect(10, 7, 3, 1);
      g.fillStyle = '#101010'; g.fillRect(5, 10, 6, 4); g.fillStyle = '#e04040'; g.fillRect(6, 11, 4, 2);
    }));
    TEX.blaze = pixTex(8, 8, (g, w, h) => noiseFill(g, w, h, ['#f0c020', '#e0a010', '#f8d850', '#d08a08'], 24));
    TEX.blazeFace = pixTex(8, 8, face(['#f0c020', '#e0a010', '#f8d850'], [[1, 3, '#3a1a00'], [2, 3, '#3a1a00'], [5, 3, '#3a1a00'], [6, 3, '#3a1a00'], [1, 4, '#ffffff'], [6, 4, '#ffffff']], (g) => { g.fillStyle = '#6a3a08'; g.fillRect(2, 6, 4, 1); }));
    TEX.blazeRod = pixTex(2, 8, (g, w, h) => noiseFill(g, w, h, ['#f8c820', '#e89a10', '#fff080'], 25));
    TEX.fireball = pixTex(8, 8, (g, w, h) => { const r = C.mulberry32(26); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const d = Math.hypot(x - 3.5, y - 3.5); g.fillStyle = d < 1.5 ? '#fff4a0' : d < 2.8 ? (r() < 0.5 ? '#ffb020' : '#ff8010') : '#c83a08'; g.fillRect(x, y, 1, 1); } });
    TEX.slime = pixTex(8, 8, (g, w, h) => noiseFill(g, w, h, ['#6ab84a', '#5aa83a', '#78c858'], 27));
    TEX.slimeFace = pixTex(8, 8, face(['#6ab84a', '#5aa83a'], [[1, 2, '#1a3a10'], [2, 2, '#1a3a10'], [5, 2, '#1a3a10'], [6, 2, '#1a3a10'], [4, 5, '#1a3a10']]));
    TEX.spiderFace = pixTex(8, 8, face(['#3a2e2a', '#2e2420'], [[1, 2, '#e02020'], [2, 3, '#e02020'], [5, 3, '#e02020'], [6, 2, '#e02020'], [3, 2, '#b01010'], [4, 2, '#b01010']]));
    // игрок: своя внешность (не как в оригинале) - бордовая рубаха, коричневые штаны
    TEX.pSkin = pixTex(8, 8, (g, w, h) => noiseFill(g, w, h, ['#c89a78', '#c0916f', '#d0a482'], 15));
    TEX.pFace = pixTex(8, 8, face(['#c89a78', '#d0a482'], [[1, 4, '#fff'], [2, 4, '#3a5a9a'], [5, 4, '#3a5a9a'], [6, 4, '#fff'], [3, 6, '#9a6a50'], [4, 6, '#9a6a50']], (g) => { g.fillStyle = '#4a2e1a'; g.fillRect(0, 0, 8, 2); g.fillRect(0, 2, 1, 2); g.fillRect(7, 2, 1, 2); }));
    TEX.pHair = pixTex(8, 8, (g, w, h) => noiseFill(g, w, h, ['#4a2e1a', '#3e2614', '#56361f'], 16));
    TEX.pShirt = pixTex(8, 8, (g, w, h) => noiseFill(g, w, h, ['#8a2a2a', '#7e2424', '#963030'], 17));
    TEX.pPants = pixTex(8, 8, (g, w, h) => noiseFill(g, w, h, ['#5a4028', '#4e3822', '#66482e'], 18));
    for (const [m, c] of Object.entries({ leather: ['#8a5a30', '#9a6838', '#7a4e28'], iron: ['#d8d8d8', '#e8e8e8', '#c4c4c4'], gold: ['#f0c830', '#fad84a', '#e0b420'], diamond: ['#4ad8cc', '#62e8dc', '#38c4b8'] })) TEX['armor_' + m] = pixTex(8, 8, (g, w, h) => noiseFill(g, w, h, c, 19));
    return TEX;
  }
  function box(w, h, d, tex, faceTex) {
    const mats = [];
    for (let f = 0; f < 6; f++) mats.push(new THREE.MeshLambertMaterial({ map: f === 4 && faceTex ? faceTex : tex }));
    return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats);
  }
  // Сустав: группа, в которой коробка висит вниз от точки крепления
  function limb(w, h, d, tex, x, y, z) {
    const j = new THREE.Group(); j.position.set(x, y, z);
    const m = box(w, h, d, tex); m.position.y = -h / 2; j.add(m);
    j.userData.mesh = m;
    return j;
  }
  function humanoid(T, skin, face, shirt, pants, root) {
    const body = new THREE.Group(); root.add(body);
    const torso = box(0.5, 0.75, 0.25, shirt); torso.position.set(0, 1.125, 0); body.add(torso);
    const head = box(0.5, 0.5, 0.5, skin, face); head.position.set(0, 1.75, 0); body.add(head);
    const legs = [], arms = [];
    for (const x of [-0.125, 0.125]) { const l = limb(0.25, 0.75, 0.25, pants, x, 0.75, 0); body.add(l); legs.push(l); }
    for (const x of [-0.375, 0.375]) { const a = limb(0.25, 0.75, 0.25, skin === T.bone ? T.bone : skin, x, 1.45, 0); body.add(a); arms.push(a); }
    return { body, head, legs, arms, torso };
  }
  function buildModel(type, color, parent) {
    const T = textures();
    const root = new THREE.Group();
    let body = new THREE.Group();
    root.add(body);
    let legs = [], arms = [], head, extra = {};
    if (type === 'pig') {
      const torso = box(0.625, 0.5, 0.875, T.pig); torso.position.set(0, 0.625, 0); body.add(torso);
      head = box(0.5, 0.5, 0.5, T.pig, T.pigFace); head.position.set(0, 0.75, 0.6); body.add(head);
      const sn = box(0.25, 0.19, 0.06, T.snout, T.snout); sn.position.set(0, -0.08, 0.28); head.add(sn);
      for (const [x, z] of [[-0.19, 0.3], [0.19, 0.3], [-0.19, -0.3], [0.19, -0.3]]) { const l = limb(0.25, 0.375, 0.25, T.pig, x, 0.375, z); body.add(l); legs.push(l); }
    } else if (type === 'sheep') {
      const skinBody = box(0.6, 0.45, 0.85, T.skin); skinBody.position.set(0, 0.9, 0); body.add(skinBody);
      const wool = box(0.75, 0.6, 1.0, T['wool_' + (color || 'white')]); wool.position.set(0, 0.9, 0); body.add(wool);
      extra.wool = wool;
      head = box(0.375, 0.375, 0.5, T.skin, T.sheepFace); head.position.set(0, 1.12, 0.62); body.add(head);
      for (const [x, z] of [[-0.22, 0.34], [0.22, 0.34], [-0.22, -0.34], [0.22, -0.34]]) { const l = limb(0.22, 0.75, 0.22, T.skin, x, 0.75, z); body.add(l); legs.push(l); }
    } else if (type === 'cow') {
      const torso = box(0.75, 0.625, 1.125, T.cow); torso.position.set(0, 1.0, 0); body.add(torso);
      head = box(0.5, 0.5, 0.375, T.cow, T.cowFace); head.position.set(0, 1.2, 0.72); body.add(head);
      for (const x of [-0.3, 0.3]) { const hn = box(0.08, 0.16, 0.08, T.horn); hn.position.set(x, 0.3, 0.05); head.add(hn); }
      for (const [x, z] of [[-0.22, 0.4], [0.22, 0.4], [-0.22, -0.4], [0.22, -0.4]]) { const l = limb(0.25, 0.7, 0.25, T.cow, x, 0.7, z); body.add(l); legs.push(l); }
    } else if (type === 'chicken') {
      const torso = box(0.375, 0.375, 0.5, T.chicken); torso.position.set(0, 0.45, 0); body.add(torso);
      head = box(0.25, 0.375, 0.19, T.chicken, T.chickenFace); head.position.set(0, 0.75, 0.25); body.add(head);
      const bk = box(0.25, 0.12, 0.12, T.beak, T.beak); bk.position.set(0, 0.02, 0.15); head.add(bk);
      const wt = box(0.12, 0.12, 0.06, T.wattle); wt.position.set(0, -0.1, 0.12); head.add(wt);
      for (const x of [-0.09, 0.09]) { const l = limb(0.06, 0.28, 0.06, T.chickenLeg, x, 0.28, 0); body.add(l); legs.push(l); }
      for (const x of [-0.22, 0.22]) { const wg = limb(0.06, 0.25, 0.37, T.chicken, x, 0.6, 0); body.add(wg); extra.wings = (extra.wings || []).concat(wg); }
    } else if (type === 'slime') {
      const inner = box(0.6, 0.6, 0.6, T.slime, T.slimeFace); inner.position.set(0, 0.5, 0); body.add(inner);
      const outer = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ map: T.slime, transparent: true, opacity: 0.55, depthWrite: false }));
      outer.position.set(0, 0.5, 0); body.add(outer); head = inner; extra.slimeBody = outer;
    } else if (type === 'ghast') {
      const b0 = box(4, 4, 4, T.ghast, T.ghastFace); b0.position.set(0, 2.2, 0); body.add(b0);
      head = b0; extra.ghastBody = b0;
      extra.tentacles = [];
      for (let k = 0; k < 9; k++) {
        const x = ((k % 3) - 1) * 1.1, z = (((k / 3) | 0) - 1) * 1.1, len = 1.2 + ((k * 37) % 5) * 0.3;
        const t = limb(0.28, len, 0.28, T.ghast, x, 0.2, z); body.add(t); extra.tentacles.push(t);
      }
    } else if (type === 'blaze') {
      head = box(0.5, 0.5, 0.5, T.blaze, T.blazeFace); head.position.set(0, 1.55, 0); body.add(head);
      extra.rods = [];
      for (let ring = 0; ring < 3; ring++) for (let k = 0; k < 4; k++) {
        const rod = box(0.125, 0.5, 0.125, T.blazeRod); rod.userData.ring = ring; rod.userData.k = k; body.add(rod); extra.rods.push(rod);
      }
    } else if (type === 'creeper') {
      const torso = box(0.5, 0.75, 0.25, T.creeper); torso.position.set(0, 0.75, 0); body.add(torso);
      head = box(0.5, 0.5, 0.5, T.creeper, T.creeperFace); head.position.set(0, 1.375, 0); body.add(head);
      for (const [x, z] of [[-0.125, 0.25], [0.125, 0.25], [-0.125, -0.25], [0.125, -0.25]]) { const l = limb(0.25, 0.375, 0.25, T.creeper, x, 0.375, z); body.add(l); legs.push(l); }
    } else if (type === 'spider') {
      const abd = box(0.75, 0.56, 0.75, T.spider); abd.position.set(0, 0.56, -0.45); body.add(abd);
      const th = box(0.4, 0.4, 0.4, T.spider); th.position.set(0, 0.5, 0.1); body.add(th);
      head = box(0.5, 0.5, 0.5, T.spider, T.spiderFace); head.position.set(0, 0.5, 0.5); body.add(head);
      for (let k = 0; k < 8; k++) {
        const side = k < 4 ? -1 : 1, i = k % 4;
        const j = new THREE.Group(); j.position.set(side * 0.2, 0.55, 0.3 - i * 0.2);
        const m = box(0.9, 0.08, 0.08, T.spider); m.position.x = side * 0.45; j.add(m);
        j.rotation.z = side * -0.5; j.rotation.y = side * (0.4 - i * 0.27);
        body.add(j); legs.push(j);
      }
      extra.spiderLegs = true;
    } else {
      const zombie = type === 'zombie', skel = type === 'skeleton', pigman = type === 'zombie_pigman';
      const hm = zombie ? humanoid(T, T.zSkin, T.zFace, T.shirt, T.pants, body) : skel ? humanoid(T, T.bone, T.skull, T.bone, T.bone, body)
        : pigman ? humanoid(T, T.pigSkin, T.pigmanFace, T.pigSkin, T.loin, body) : humanoid(T, T.pSkin, T.pFace, T.pShirt, T.pPants, body);
      if (pigman) { const sw = G.itemMesh(D.I.gold_sword, 0.5); sw.position.set(0, -0.7, 0.2); sw.rotation.set(0, Math.PI / 2, 0); hm.arms[1].add(sw); }
      if (skel) { hm.torso.scale.set(0.6, 1, 0.6); for (const l of hm.legs.concat(hm.arms)) l.userData.mesh.scale.set(0.5, 1, 0.5); }
      head = hm.head; legs = hm.legs; arms = hm.arms;
      if (zombie || skel) for (const a of arms) a.rotation.x = -Math.PI / 2;
      extra.torso = hm.torso;
    }
    const fire = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.9, 1.0), new THREE.MeshBasicMaterial({ map: T.fire, transparent: true, depthWrite: false, side: THREE.DoubleSide, alphaTest: 0.1 }));
    fire.position.y = 0.95; fire.visible = false; root.add(fire);
    (parent || scene()).add(root);
    root.traverse((o) => { if (o.material) o.userData.mats = Array.isArray(o.material) ? o.material : [o.material]; });
    return Object.assign({ root, body, legs, arms, head, fire }, extra);
  }

  let nextId = 1;
  function spawnMob(type, x, y, z) {
    const def = D.MOBS[type];
    if (!def) return null;
    const m = { id: nextId++, type, def, x, y, z, vx: 0, vy: 0, vz: 0, w: def.w, h: def.h, yaw: rnd() * Math.PI * 2, hp: def.hp, onGround: false,
      wander: 0, dirYaw: 0, walking: false, hurtT: 0, panic: 0, attackCool: 1, fireT: 0, burnT: 0, deadT: 0, phase: 0, noiseT: 3 + rnd() * 10, model: null,
      color: 'white', sheared: false, regrow: 0, shootT: 1 + rnd() };
    mobs.push(m);
    return m;
  }
  // Модель моба уходит вместе с его геометрией и материалами (текстуры общие - остаются)
  function disposeModel(root) {
    root.traverse((o) => {
      if (o.geometry && !o.userData.sharedGeo) o.geometry.dispose();
      if (o.material && !o.userData.sharedMat) for (const mt of (Array.isArray(o.material) ? o.material : [o.material])) mt.dispose();
    });
  }
  function removeMob(i) { const m = mobs[i]; if (m.model) { group.remove(m.model.root); disposeModel(m.model.root); } mobs.splice(i, 1); }
  // Урон мобу: после удара полсекунды неуязвимости (как в оригинале), отброс, вспышка, звук
  function hurtMob(m, n, fromX, fromZ, cause) {
    if (m.deadT > 0 || m.hp <= 0) return false;
    if (m.hurtT > 0 && cause !== 'creative') return false;
    m.hp -= n;
    m.hurtT = 0.45;
    const dx = m.x - fromX, dz = m.z - fromZ, d = Math.hypot(dx, dz) || 1;
    if (cause !== 'burn' && cause !== 'cactus') { m.vx = dx / d * 6; m.vz = dz / d * 6; m.vy = 5; }
    if (!m.def.hostile && !m.def.neutral) m.panic = 4;
    if (m.def.neutral && (cause === 'player' || cause === 'arrow')) for (const o of mobs) if (o.type === m.type && Math.hypot(o.x - m.x, o.z - m.z) < 32) o.angry = 20 + rnd() * 20;
    VX.audio.play('mobhurt');
    if (m.hp <= 0) {
      m.deadT = 0.001;
      poof(m);
      if (m.type === 'slime' && (m.size || 2) > 1) {
        for (let k = 0, n = 2 + ((rnd() * 2) | 0); k < n; k++) { const s = spawnMob('slime', m.x + (rnd() - 0.5), m.y + 0.2, m.z + (rnd() - 0.5)); s.size = 1; s.w = s.h = 0.5; s.hp = 1; }
      }
      if (cause !== 'creative' && !(m.type === 'slime' && (m.size || 2) > 1) && !(m.def.playerDrops && cause !== 'player' && cause !== 'arrow' && cause !== 'fireball')) {
        for (const [id0, a, b] of m.def.drops) {
          let id = id0, n2 = a + Math.floor(rnd() * (b - a + 1));
          if (m.type === 'sheep' && id === B.wool_white) { if (m.sheared) n2 = 0; id = D.WOOL_OF[m.color] || id; }
          if (n2 > 0) spawnItem({ id, count: n2 }, m.x, m.y + 0.5, m.z, (rnd() - 0.5) * 2, 3, (rnd() - 0.5) * 2, 0.5);
        }
      }
      // в счёт игрока (достижения, статистика) - только его удары и стрелы
      if (cause === 'player' || cause === 'arrow' || cause === 'creative' || cause === 'fireball') {
        G.emit('kill', { mob: m.type, cause });
        if (G.meta && G.meta.stats) G.meta.stats.kills++;
      }
    }
    return true;
  }
  const playerEv = (ev, d) => { if (ev === 'hurt') VX.audio.play('hurt'); if (ev === 'death' && G.state !== 'dead') G.onDeath(d); };
  // Видит ли моб игрока (нет твёрдых блоков между глазами)
  function sees(m, p) {
    const ax = m.x, ay = m.y + m.h * 0.85, az = m.z, bx = p.pos.x, by = p.eye(), bz = p.pos.z;
    const n = Math.ceil(Math.hypot(bx - ax, by - ay, bz - az) * 3);
    for (let k = 1; k < n; k++) {
      const t = k / n, b = G.world.getBlock(Math.floor(ax + (bx - ax) * t), Math.floor(ay + (by - ay) * t), Math.floor(az + (bz - az) * t));
      if (b !== 0 && (b < 0 || (C.SOLID[b] && C.RENDER[b] === 1))) return false;
    }
    return true;
  }

  function updateMob(m, dt) {
    const p = G.player;
    if (m.deadT > 0) { m.deadT += dt; return; }
    if (m.def.flying) return updateGhast(m, dt);
    if (m.def.jumper) return updateSlime(m, dt);
    if (m.def.hover) return updateBlaze(m, dt);
    if (m.angry > 0) m.angry -= dt;
    const water = inWater(m);
    const dxp = p.pos.x - m.x, dzp = p.pos.z - m.z, distP = Math.hypot(dxp, dzp);
    let speed = 0, targetYaw = m.yaw;
    const hostileNow = (m.def.neutral ? m.angry > 0 : m.def.hostile) && !(m.type === 'spider' && (G.dayLight || 0) > 0.5 && m.hp === m.def.hp);   // паук днём мирный, пока не ударят
    const chase = hostileNow && G.mode === 'survival' && !p.dead && G.state !== 'dead' && distP < 24 && Math.abs(p.pos.y - m.y) < 10;
    let horiz = false;
    if (chase && m.def.ranged) {
      // скелет держит дистанцию и стреляет, если видит
      targetYaw = Math.atan2(dxp, dzp);
      const see = distP < 16 && sees(m, p);
      speed = distP > 10 || !see ? m.def.speed : distP < 5 ? -m.def.speed * 0.6 : 0;
      m.shootT -= dt;
      if (see && distP < 16 && m.shootT <= 0) {
        m.shootT = 2;
        m.swingT = 0.3;
        const ey = m.y + 1.5, ty = p.pos.y + 1.1;
        const flat = Math.max(0.5, distP);
        const v = 26, tt = flat / v;
        shootArrow(m.x + dxp / flat * 0.6, ey, m.z + dzp / flat * 0.6, dxp / flat * v, (ty - ey) / tt + 10 * tt, dzp / flat * v, m, 2 + ((rnd() * 3) | 0));
        VX.audio.play('bow');
      }
    } else if (chase && m.def.explodes) {
      // крипер: подошёл на 3 блока и видит - шипит 1.5 с и взрывается; отошёл дальше 7 - гаснет
      targetYaw = Math.atan2(dxp, dzp);
      const d3 = Math.hypot(dxp, p.pos.y - m.y, dzp);
      if (!m.lit && d3 < 3 && sees(m, p)) { m.lit = true; VX.audio.play('hiss'); }
      if (m.lit && d3 > 7) m.lit = false;
      speed = m.lit ? 0 : m.def.speed;
      m.fuse = Math.max(0, (m.fuse || 0) + (m.lit ? dt : -dt));
      if (m.fuse >= m.def.fuse) {
        m.deadT = 0.001; m.exploded = true;
        if (VX.explode) VX.explode(m.x, m.y + 0.06, m.z, m.def.power, { source: m, ev: playerEv });
        return;
      }
    } else if (chase) {
      targetYaw = Math.atan2(dxp, dzp);
      speed = m.def.speed;
      m.attackCool -= dt;
      if (distP < (m.type === 'spider' ? 1.4 : 1.25) && Math.abs(p.pos.y - m.y) < 1.6 && m.attackCool <= 0) {
        m.attackCool = 1;
        m.swingT = 0.3;
        if (p.damage(m.def.dmg, m.type, playerEv, false, { x: m.x, z: m.z })) { p.vel.x += dxp / (distP || 1) * 6; p.vel.z += dzp / (distP || 1) * 6; p.vel.y = 4; }
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
    // не прыгать с обрыва и не лезть в воду и лаву (кроме погони)
    if (speed > 0 && !chase && m.onGround) {
      const ax = Math.floor(m.x + fx * 0.8), az = Math.floor(m.z + fz * 0.8);
      let drop = 0; for (let y = Math.floor(m.y) - 1; y > Math.floor(m.y) - 5 && !C.SOLID[Math.max(0, G.world.getBlock(ax, y, az))]; y--) drop++;
      const ahead = G.world.getBlock(ax, Math.floor(m.y), az);
      if (drop >= 3 || (ahead > 0 && C.FLUID[ahead]) || ahead === B.cactus) { m.dirYaw += Math.PI; speed = 0; }
    }
    const k = 1 - Math.exp(-(m.onGround ? 12 : 2) * dt);
    m.vx += (fx * speed - m.vx) * k; m.vz += (fz * speed - m.vz) * k;
    if (water) { m.vy = Math.min(2, m.vy + 20 * dt); m.vy *= Math.pow(0.2, dt); }
    else m.vy = Math.max(m.def.flutter ? -2.5 : -60, m.vy - 28.2 * dt);         // курица планирует
    const hit = move(m, m.vx * dt, m.vy * dt, m.vz * dt);
    horiz = hit.cx || hit.cz;
    if (horiz && speed > 0) {
      if (m.def.climber && chase) m.vy = 4;                                         // паук лезет по стене
      else if (m.onGround) m.vy = 8.4;                                             // на ступеньку - прыжком
    }
    m.phase += Math.hypot(m.vx, m.vz) * dt * 4;
    m.hurtT = Math.max(0, m.hurtT - dt);
    // огонь: зомби и скелеты горят на солнце; лава и огонь поджигают любого
    const mb = [m.x - m.w / 2, m.y, m.z - m.w / 2, m.x + m.w / 2, m.y + m.h, m.z + m.w / 2];
    if (m.def.fireImmune) m.fireT = 0;
    else if (P.touching(G.world, mb, P.isLava, 0)) { m.fireT = 15; hurtMob(m, 4, m.x, m.z, 'burn'); }
    else if (P.touching(G.world, mb, P.isFire, 0)) { m.fireT = Math.max(m.fireT, 8); hurtMob(m, 1, m.x, m.z, 'burn'); }
    if (m.def.burns && inSun(m.x, m.y + m.h * 0.8, m.z) && !water) m.fireT = Math.max(m.fireT, 1.5);
    if (water && !P.touching(G.world, mb, P.isLava, 0)) m.fireT = 0;
    if (m.fireT > 0) {
      m.fireT -= dt; m.burnT += dt;
      if (m.burnT >= 1) { m.burnT -= 1; m.hurtT = 0; hurtMob(m, 1, m.x, m.z, 'burn'); }
    } else m.burnT = 0;
    if (P.touching(G.world, mb, P.isCactus, 0.02)) hurtMob(m, 1, m.x, m.z, 'cactus');
    // овца обрастает шерстью, пока щиплет траву
    if (m.sheared && (m.regrow -= dt) <= 0) m.sheared = false;
    m.noiseT -= dt;
    if (m.noiseT <= 0) { m.noiseT = 6 + rnd() * 10; if (distP < 16) VX.audio.play(m.def.sound); }
  }

  // ---------- Гаст и ифрит, огненные шары ----------
  const fireballs = [];
  function shootFireball(x, y, z, vx, vy, vz, owner, small) {
    const f = { x, y, z, vx, vy, vz, owner, small, age: 0, mesh: null };
    fireballs.push(f);
    VX.audio.play(small ? 'blaze_shoot' : 'ghast_shoot');
    return f;
  }
  // Гаст: парит, меняет точку, видит героя до 40 блоков - стреляет раз в 3 с шаром, взрывающимся на силу 1
  function freeAt(x, y, z, r) {
    for (let dx = -r; dx <= r; dx++) for (let dy = 0; dy <= r * 2; dy++) for (let dz = -r; dz <= r; dz++) { const b = G.world.getBlock(Math.floor(x + dx), Math.floor(y + dy), Math.floor(z + dz)); if (b !== 0) return false; }
    return true;
  }
  function updateGhast(m, dt) {
    const p = G.player;
    const dx = p.pos.x - m.x, dz = p.pos.z - m.z, dy = p.eye() - (m.y + 2.2), dist = Math.hypot(dx, dy, dz);
    m.wander -= dt;
    if (m.wander <= 0 || !m.goal) { m.wander = 3 + rnd() * 5; m.goal = { x: m.x + (rnd() - 0.5) * 24, y: Math.max(C.NETHER_SEA + 4, Math.min(110, m.y + (rnd() - 0.5) * 12)), z: m.z + (rnd() - 0.5) * 24 }; }
    const gx = m.goal.x - m.x, gy = m.goal.y - m.y, gz = m.goal.z - m.z, gl = Math.hypot(gx, gy, gz) || 1;
    const sp = gl > 1 ? m.def.speed : 0;
    m.vx += (gx / gl * sp - m.vx) * Math.min(1, dt * 1.5); m.vy += (gy / gl * sp - m.vy) * Math.min(1, dt * 1.5); m.vz += (gz / gl * sp - m.vz) * Math.min(1, dt * 1.5);
    const hit = move(m, m.vx * dt, m.vy * dt, m.vz * dt);
    if (hit.cx || hit.cz || m.vy === 0) m.goal = null;
    const hunt = G.mode === 'survival' && !p.dead && dist < 40 && sees(m, p);
    m.yaw = hunt ? Math.atan2(dx, dz) : Math.atan2(m.vx, m.vz) || m.yaw;
    m.charge = hunt ? (m.charge || 0) + dt : Math.max(0, (m.charge || 0) - dt);
    if (m.charge >= 3) {
      m.charge = 0; m.shotT = 0.6;
      const sx = m.x + dx / dist * 2.4, sy = m.y + 2.2 + dy / dist * 2.4, sz = m.z + dz / dist * 2.4;
      shootFireball(sx, sy, sz, dx / dist * 14, dy / dist * 14, dz / dist * 14, m, false);
    }
    if (m.shotT > 0) m.shotT -= dt;
    m.hurtT = Math.max(0, m.hurtT - dt);
    m.noiseT -= dt;
    if (m.noiseT <= 0) { m.noiseT = 5 + rnd() * 8; if (dist < 48) VX.audio.play('ghast'); }
  }
  // Ифрит: висит над землёй, держится на высоте героя, трижды стреляет малыми огненными шарами; вода ранит
  function updateBlaze(m, dt) {
    const p = G.player;
    const dx = p.pos.x - m.x, dz = p.pos.z - m.z, dy = p.eye() - (m.y + 1.5), flat = Math.hypot(dx, dz), dist = Math.hypot(dx, dy, dz);
    const hunt = G.mode === 'survival' && !p.dead && dist < 24 && sees(m, p);
    let tx = 0, tz = 0;
    if (hunt) { m.yaw = Math.atan2(dx, dz); if (flat > 8) { tx = dx / flat; tz = dz / flat; } else if (flat < 4) { tx = -dx / flat; tz = -dz / flat; } }
    else { m.wander -= dt; if (m.wander <= 0) { m.wander = 2 + rnd() * 4; m.dirYaw = rnd() * Math.PI * 2; m.walking = rnd() < 0.5; } if (m.walking) { tx = Math.sin(m.dirYaw) * 0.5; tz = Math.cos(m.dirYaw) * 0.5; m.yaw = m.dirYaw; } }
    const k = 1 - Math.exp(-4 * dt);
    m.vx += (tx * m.def.speed - m.vx) * k; m.vz += (tz * m.def.speed - m.vz) * k;
    // высота: над игроком на 1-2 блока, иначе медленно опускается
    const wantUp = hunt && p.eye() + 1 > m.y + 1.5;
    m.vy = wantUp ? Math.min(2, m.vy + 8 * dt) : Math.max(-1.2, m.vy - 3 * dt);
    const hit = move(m, m.vx * dt, m.vy * dt, m.vz * dt);
    if ((hit.cx || hit.cz) && m.onGround) m.vy = 4;
    m.phase += dt * 3;
    if (hunt && dist < 16) {
      m.charge = (m.charge || 0) + dt;
      if (m.charge >= 3) { m.volley = 3; m.volleyT = 0; m.charge = 0; }
    } else m.charge = 0;
    if (m.volley > 0) {
      m.volleyT -= dt;
      if (m.volleyT <= 0) {
        m.volley--; m.volleyT = 0.3;
        const sp = 12, ex = (rnd() - 0.5) * 0.12, ez = (rnd() - 0.5) * 0.12;
        shootFireball(m.x + dx / dist * 0.8, m.y + 1.4, m.z + dz / dist * 0.8, (dx / dist + ex) * sp, dy / dist * sp, (dz / dist + ez) * sp, m, true);
      }
    }
    m.hurtT = Math.max(0, m.hurtT - dt);
    // вода ранит ифрита
    if (inWater(m)) { m.wetT = (m.wetT || 0) + dt; if (m.wetT >= 1) { m.wetT = 0; m.hurtT = 0; hurtMob(m, 1, m.x, m.z, 'water'); } }
    m.noiseT -= dt;
    if (m.noiseT <= 0) { m.noiseT = 4 + rnd() * 6; if (dist < 24) VX.audio.play('blaze'); }
  }
  // Слизень: передвигается только прыжками; большой делится на маленьких, бьёт только большой
  function updateSlime(m, dt) {
    const p = G.player;
    const dx = p.pos.x - m.x, dz = p.pos.z - m.z, dist = Math.hypot(dx, dz);
    const hunt = G.mode === 'survival' && !p.dead && dist < 16 && Math.abs(p.pos.y - m.y) < 6;
    m.hopT = (m.hopT === undefined ? 1 : m.hopT) - dt;
    if (m.onGround) {
      m.vx *= Math.pow(0.02, dt); m.vz *= Math.pow(0.02, dt);
      if (m.hopT <= 0) {
        m.hopT = 0.8 + rnd() * 1.2;
        const yaw = hunt ? Math.atan2(dx, dz) : rnd() * Math.PI * 2;
        m.yaw = yaw; m.vy = 5 + (m.size || 2); m.vx = Math.sin(yaw) * m.def.speed * (m.size || 2) * 0.6; m.vz = Math.cos(yaw) * m.def.speed * (m.size || 2) * 0.6;
        if (dist < 16) VX.audio.play('slime');
      }
    }
    m.vy = Math.max(-40, m.vy - 28.2 * dt);
    move(m, m.vx * dt, m.vy * dt, m.vz * dt);
    m.attackCool -= dt;
    if (hunt && (m.size || 2) > 1 && dist < m.w / 2 + 0.6 && Math.abs(p.pos.y - m.y) < 1.2 && m.attackCool <= 0) {
      m.attackCool = 1;
      if (p.damage(m.def.dmg, 'slime', playerEv, false, { x: m.x, z: m.z })) { p.vel.x += dx / (dist || 1) * 4; p.vel.z += dz / (dist || 1) * 4; }
    }
    m.hurtT = Math.max(0, m.hurtT - dt);
  }
  function updateFireballs(dt) {
    const p = G.player;
    for (let i = fireballs.length - 1; i >= 0; i--) {
      const f = fireballs[i];
      f.age += dt;
      if (f.age > 12 || f.y < -10 || f.y > C.CH + 10) { dropFireball(i); continue; }
      let hitAt = null, hitMob = null, hitPlayer = false;
      const n = 4;
      for (let s = 0; s < n && !hitAt; s++) {
        const nx = f.x + f.vx * dt / n, ny = f.y + f.vy * dt / n, nz = f.z + f.vz * dt / n;
        const r = f.small ? 0.15 : 0.5;
        if (f.owner !== 'player' && !p.dead && hitBox(null, p.box().map((v, k) => v + (k < 3 ? -r : r)), nx, ny, nz)) { hitAt = [nx, ny, nz]; hitPlayer = true; break; }
        for (const m of mobs) {
          if (m.deadT > 0 || m === f.owner) continue;
          if (hitBox(null, [m.x - m.w / 2 - r, m.y - r, m.z - m.w / 2 - r, m.x + m.w / 2 + r, m.y + m.h + r, m.z + m.w / 2 + r], nx, ny, nz)) { hitAt = [nx, ny, nz]; hitMob = m; break; }
        }
        if (hitAt) break;
        const b = G.world.getBlock(Math.floor(nx), Math.floor(ny), Math.floor(nz));
        if (b !== 0 && (b < 0 || (C.SOLID[b] && hitBlock(b, nx, ny, nz)))) { hitAt = [f.x, f.y, f.z]; break; }
        f.x = nx; f.y = ny; f.z = nz;
      }
      if (!hitAt) continue;
      dropFireball(i);
      if (f.small) {
        // малый шар: 5 урона и поджог; в блок - огонь рядом
        if (hitPlayer && G.mode === 'survival') { if (p.damage(5, 'fireball', playerEv, false, { x: f.x - f.vx, z: f.z - f.vz })) p.fireT = Math.max(p.fireT || 0, 5); }
        else if (hitMob && !hitMob.def.fireImmune) { hurtMob(hitMob, 5, f.x, f.z, f.owner === 'player' ? 'fireball' : 'burn'); hitMob.fireT = 5; }
        else if (!hitPlayer && !hitMob) {
          const X = Math.floor(f.x), Y = Math.floor(f.y), Z = Math.floor(f.z);
          if (G.world.getBlock(X, Y, Z) === 0 && C.SOLID[Math.max(0, G.world.getBlock(X, Y - 1, Z))]) { if (VX.fluids) VX.fluids.addFire(X, Y, Z); }
        }
      } else {
        // шар гаста: прямое попадание 6 и взрыв силы 1 с огнём; отбитый игроком убивает гаста
        if (hitMob && f.owner === 'player') { hitMob.hurtT = 0; hurtMob(hitMob, 1000, f.x, f.z, 'fireball'); }
        else if (hitPlayer && G.mode === 'survival') p.damage(6, 'fireball', playerEv, false, { x: f.x - f.vx, z: f.z - f.vz });
        if (VX.explode) VX.explode(hitAt[0], hitAt[1], hitAt[2], 1, { fire: true, ev: playerEv, source: f.owner === 'player' ? null : f.owner });
      }
    }
  }
  function dropFireball(i) { const f = fireballs[i]; if (f.mesh) group.remove(f.mesh); fireballs.splice(i, 1); }
  // Удар по огненному шару отбивает его туда, куда смотрит герой
  function deflect() {
    const p = G.player, o = [p.pos.x, p.eye(), p.pos.z], d = p.forward();
    for (const f of fireballs) {
      if (f.owner === 'player') continue;
      const r = f.small ? 0.4 : 0.9;
      const px = f.x - o[0], py = f.y - o[1], pz = f.z - o[2];
      const t = px * d.x + py * d.y + pz * d.z;
      if (t < 0 || t > 4) continue;
      const cx = o[0] + d.x * t - f.x, cy = o[1] + d.y * t - f.y, cz = o[2] + d.z * t - f.z;
      if (Math.hypot(cx, cy, cz) > r) continue;
      const sp = Math.hypot(f.vx, f.vy, f.vz) * 1.2;
      f.vx = d.x * sp; f.vy = d.y * sp; f.vz = d.z * sp; f.owner = 'player'; f.age = 0;
      VX.audio.play('hit', { surface: 'stone' });
      G.swing = 1;
      return true;
    }
    return false;
  }

  // Появление: днём звери на траве, ночью (или в темноте) зомби, скелеты, пауки; вдали от игрока.
  // В творческом режиме тоже появляются (враги там не нападают).
  let spawnT = 0;
  function trySpawnNether() {
    const p = G.player, w = G.world;
    const count = (t) => mobs.filter((m) => m.type === t && m.deadT === 0).length;
    // ифриты у зала крепости с рассадником
    const f = C.fortressNear(w.seed, p.pos.x, p.pos.z);
    if (f && Math.hypot(f.x - p.pos.x, f.z - p.pos.z) < 48 && w.getBlock(f.x, f.y + 1, f.z) === C.SPAWNER && count('blaze') < 4 && rnd() < 0.5) {
      const x = f.x + ((rnd() * 9) | 0) - 4, z = f.z + ((rnd() * 9) | 0) - 4;
      if (w.getBlock(x, f.y + 1, z) === 0 && w.getBlock(x, f.y + 2, z) === 0) spawnMob('blaze', x + 0.5, f.y + 1, z + 0.5);
    }
    const a = rnd() * Math.PI * 2, r = 20 + rnd() * 28;
    const x = Math.floor(p.pos.x + Math.cos(a) * r), z = Math.floor(p.pos.z + Math.sin(a) * r);
    if (!w.isLoaded(x, z)) return;
    if (rnd() < 0.12 && count('ghast') < 3) {
      const y = C.NETHER_SEA + 6 + ((rnd() * 50) | 0);
      if (freeAt(x - 2, y, z - 2, 2)) spawnMob('ghast', x + 0.5, y, z + 0.5);
      return;
    }
    if (count('zombie_pigman') >= 12) return;
    let y = 30 + ((rnd() * 80) | 0);
    for (let k = 0; k < 40 && y > 5; k++, y--) {
      const g0 = w.getBlock(x, y - 1, z);
      if (g0 > 0 && C.SOLID[g0] && C.RENDER[g0] === 1 && w.getBlock(x, y, z) === 0 && w.getBlock(x, y + 1, z) === 0) {
        const n = 1 + ((rnd() * 3) | 0);
        for (let j = 0; j < n; j++) spawnMob('zombie_pigman', x + 0.5 + j * 0.3, y, z + 0.5);
        return;
      }
    }
  }
  function trySpawn() {
    if (G.dim === 'nether') return trySpawnNether();
    const p = G.player, w = G.world;
    const near = (hostile) => mobs.filter((m) => !!m.def.hostile === hostile && Math.hypot(m.x - p.pos.x, m.z - p.pos.z) < 96).length;
    const night = (G.dayLight || 0) < 0.35;
    const hostile = night ? rnd() < 0.8 : false;
    if (hostile && near(true) >= 8) return;
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
    if (hostile) { const q = rnd(); spawnMob(q < 0.32 ? 'zombie' : q < 0.55 ? 'skeleton' : q < 0.72 ? 'spider' : q < 0.9 ? 'creeper' : 'slime', x + 0.5, top + 1, z + 0.5); }
    else {
      const t = ['pig', 'sheep', 'cow', 'chicken'][(rnd() * 4) | 0];
      const n = 2 + ((rnd() * 2) | 0);
      for (let k = 0; k < n; k++) { const s = spawnMob(t, x + 0.5 + k * 0.3, top + 1, z + 0.5); if (t === 'sheep' && rnd() < 0.15) s.color = ['black', 'red', 'yellow'][(rnd() * 3) | 0]; }
    }
  }

  // ---------- Стрелы ----------
  const arrows = [];
  let arrowGeo = null;
  const arrowMat = new THREE.MeshLambertMaterial({ color: 0x9a7a4a });
  function shootArrow(x, y, z, vx, vy, vz, owner, dmg) {
    const a = { x, y, z, vx, vy, vz, owner, dmg, age: 0, stuck: false, mesh: null };
    arrows.push(a);
    return a;
  }
  function hitBox(a, b, x, y, z) { return x > b[0] && x < b[3] && y > b[1] && y < b[4] && z > b[2] && z < b[5]; }
  function updateArrows(dt) {
    const p = G.player;
    for (let i = arrows.length - 1; i >= 0; i--) {
      const a = arrows[i];
      a.age += dt;
      if (a.age > 60 || a.y < -64) { dropArrow(i); continue; }
      if (a.stuck) {
        // стрела игрока в блоке: подобрать, наступив рядом
        if (a.owner === 'player' && G.mode === 'survival' && Math.hypot(p.pos.x - a.x, p.pos.y + 0.5 - a.y, p.pos.z - a.z) < 1.3 && a.age > 0.5) {
          if (G.inv.add(D.I.arrow, 1) === 0) { VX.audio.play('pop'); dropArrow(i); }
        }
        continue;
      }
      a.vy -= 20 * dt;
      const f = Math.pow(0.99, dt * 20); a.vx *= f; a.vy *= f; a.vz *= f;
      const n = 4;
      for (let s = 0; s < n && !a.stuck; s++) {
        const nx = a.x + a.vx * dt / n, ny = a.y + a.vy * dt / n, nz = a.z + a.vz * dt / n;
        // в существо
        if (a.owner === 'player') {
          const m = mobs.find((mm) => mm.deadT === 0 && hitBox(a, [mm.x - mm.w / 2, mm.y, mm.z - mm.w / 2, mm.x + mm.w / 2, mm.y + mm.h, mm.z + mm.w / 2], nx, ny, nz));
          if (m) { hurtMob(m, a.dmg, a.x - a.vx, a.z - a.vz, 'arrow'); VX.audio.play('arrow_hit'); dropArrow(i); a.stuck = 'gone'; break; }
        } else if (!p.dead && hitBox(a, p.box(), nx, ny, nz)) {
          if (G.mode === 'survival') { p.damage(a.dmg, 'arrow', playerEv, false, { x: a.x - a.vx, z: a.z - a.vz }); p.vel.x += a.vx * 0.05; p.vel.z += a.vz * 0.05; }
          VX.audio.play('arrow_hit'); dropArrow(i); a.stuck = 'gone'; break;
        }
        const b = G.world.getBlock(Math.floor(nx), Math.floor(ny), Math.floor(nz));
        if (b !== 0 && (b < 0 || (C.SOLID[b] && hitBlock(b, nx, ny, nz)))) { a.stuck = true; VX.audio.play('arrow_hit'); break; }
        a.x = nx; a.y = ny; a.z = nz;
      }
    }
  }
  function hitBlock(b, x, y, z) {
    const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
    const s = C.shapeOf(b, (dx, dy, dz) => G.world.getBlock(X + dx, Y + dy, Z + dz), 'collide');
    if (!s) return true;
    const fx = (x - Math.floor(x)) * 16, fy = (y - Math.floor(y)) * 16, fz = (z - Math.floor(z)) * 16;
    return s.some((q) => fx >= q[0] && fx <= q[3] && fy >= q[1] && fy <= q[4] && fz >= q[2] && fz <= q[5]);
  }
  function dropArrow(i) { const a = arrows[i]; if (a.mesh) group.remove(a.mesh); arrows.splice(i, 1); }

  // ---------- ПКМ по мобу: ножницы стригут овцу, краситель красит ----------
  function interact(held) {
    const hit = rayMob(3.5);
    if (!hit) return false;
    const t = G.target();
    if (t && t.dist < hit.dist) return false;
    const m = hit.mob, it = D.info(held.id);
    if (m.type === 'sheep' && it.key === 'shears' && !m.sheared) {
      m.sheared = true; m.regrow = 40 + rnd() * 40;
      const n = 1 + ((rnd() * 3) | 0);
      spawnItem({ id: D.WOOL_OF[m.color], count: n }, m.x, m.y + 1, m.z, (rnd() - 0.5) * 2, 3, (rnd() - 0.5) * 2, 0.3);
      if (G.mode === 'survival') G.inv.wearHeld();
      VX.audio.play('shear');
      G.emit('shear', { color: m.color });
      rebuild(m);
      return true;
    }
    if (m.type === 'sheep' && it.dye && it.dye !== m.color) {
      m.color = it.dye;
      if (G.mode === 'survival') G.inv.takeHeld(1);
      rebuild(m);
      return true;
    }
    if (it.egg) return false;
    return false;
  }
  function rebuild(m) { if (m.model) { group.remove(m.model.root); disposeModel(m.model.root); m.model = null; } }

  function update(dt) {
    G.frameNo = (G.frameNo || 0) + 1;
    updateItems(dt);
    updateParts(dt);
    updateArrows(dt);
    updateFireballs(dt);
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
    if (deflect()) return true;
    const hit = rayMob(3.5);
    if (!hit) return false;
    const t = G.target();
    if (t && t.dist < hit.dist) return false;
    const held = G.inv.held();
    const tool = D.toolOf(held && held.id);
    const p = G.player;
    // творческий режим: любой моб с одного удара и без выпадения
    if (G.mode === 'creative') { hurtMob(hit.mob, 1e6, p.pos.x, p.pos.z, 'creative'); G.swing = 1; return true; }
    const dmg = tool ? tool.dmg : 1;
    hurtMob(hit.mob, dmg, p.pos.x, p.pos.z, 'player');
    if (tool) { G.inv.wearHeld(); if (tool.type !== 'sword') G.inv.wearHeld(); }
    G.swing = 1;
    p.exhaust(0.1);
    return true;
  }

  // ---------- Игрок от третьего лица: модель, броня, предмет в руке ----------
  let pm = null;
  const ARMOR_BOX = [
    [['head', 0.56, 0.56, 0.56, 0, 0]],
    [['torso', 0.56, 0.8, 0.32, 0, 0], ['armL', 0.3, 0.4, 0.3, 0, -0.2], ['armR', 0.3, 0.4, 0.3, 0, -0.2]],
    [['legL', 0.29, 0.5, 0.29, 0, -0.25], ['legR', 0.29, 0.5, 0.29, 0, -0.25]],
    [['legL', 0.3, 0.26, 0.3, 0, -0.62], ['legR', 0.3, 0.26, 0.3, 0, -0.62]],
  ];
  // Одеть модель игрока: броня коробками поверх частей тела (цвет материала), предмет в правой руке
  function newPlayerModel(parent) {
    const md = buildModel('player', null, parent);
    md.parts = { head: md.head, torso: md.torso, armL: md.arms[0], armR: md.arms[1], legL: md.legs[0], legR: md.legs[1] };
    md.armor = [[], [], [], []]; md.armorKey = ['', '', '', '']; md.handItem = null; md.handId = -1; md.phase = 0;
    return md;
  }
  function dressModel(md, armor, hid) {
    const T = textures();
    for (let s = 0; s < 4; s++) {
      const it = armor[s], ar = it && D.armorOf(it.id);
      const k = ar ? ar.mat : '';
      if (k === md.armorKey[s]) continue;
      md.armorKey[s] = k;
      for (const m of md.armor[s]) { m.parent.remove(m); disposeModel(m); }
      md.armor[s] = [];
      if (!ar) continue;
      for (const [part, w, h, d, ox, oy] of ARMOR_BOX[s]) {
        const mesh = box(w, h, d, T['armor_' + ar.mat]);
        if (part === 'head') mesh.material[4] = new THREE.MeshBasicMaterial({ visible: false });     // шлем открыт спереди - лицо видно
        mesh.position.set(ox, oy, 0);
        md.parts[part].add(mesh);
        md.armor[s].push(mesh);
      }
    }
    if (hid !== md.handId) {
      md.handId = hid;
      if (md.handItem) { md.handItem.parent.remove(md.handItem); disposeModel(md.handItem); md.handItem = null; }
      if (hid) { const m = G.itemMesh(hid, 0.35); m.position.set(0, -0.72, 0.18); m.rotation.set(0, Math.PI / 2, 0); md.arms[1].add(m); md.handItem = m; }
    }
  }
  function playerModel(visible, dt) {
    const p = G.player;
    if (!visible) { if (pm) pm.root.visible = false; return; }
    if (!pm) pm = newPlayerModel();
    pm.root.visible = true;
    pm.root.position.set(p.pos.x, p.pos.y, p.pos.z);
    pm.root.rotation.y = p.yaw + Math.PI;
    pm.head.rotation.x = -p.pitch * 0.8;
    const sp = Math.hypot(p.vel.x, p.vel.z);
    pm.phase += sp * dt * 2.2;
    const sw = Math.sin(pm.phase) * Math.min(1, sp / 4) * 0.8;
    pm.legs[0].rotation.x = sw; pm.legs[1].rotation.x = -sw;
    pm.arms[0].rotation.x = -sw * 0.8;
    pm.arms[1].rotation.x = sw * 0.8 - Math.sin((G.swing || 0) * Math.PI) * 1.2 - (G.bowT > 0 ? 1.4 : 0);
    pm.body.position.y = p.sneaking ? -0.15 : 0;
    const held = G.inv.held();
    dressModel(pm, G.inv.armor, held ? held.id : 0);
  }
  // Фигурка игрока в окне инвентаря (своя маленькая сцена), поворачивается за мышью, как в оригинале
  let pv = null;
  function previewCanvas() {
    if (!pv) {
      const c = document.createElement('canvas'); c.width = 104; c.height = 150; c.className = 'preview';
      let r = null;
      try { r = new THREE.WebGLRenderer({ canvas: c, alpha: true, antialias: false }); r.setPixelRatio(1); } catch (e) { r = null; }
      const sc = new THREE.Scene();
      sc.add(new THREE.AmbientLight(0xffffff, 0.8));
      const dl = new THREE.DirectionalLight(0xffffff, 0.45); dl.position.set(1, 2, 3); sc.add(dl);
      const cam = new THREE.PerspectiveCamera(30, 104 / 150, 0.1, 20);
      cam.position.set(0, 1.0, 4.2); cam.lookAt(0, 0.95, 0);
      pv = { c, r, sc, cam, md: newPlayerModel(sc), mx: 0, my: 0 };
      c.addEventListener('mousemove', (e) => { const b = c.getBoundingClientRect(); pv.mx = (e.clientX - b.left) / b.width - 0.5; pv.my = (e.clientY - b.top) / b.height - 0.3; });
    }
    return pv.c;
  }
  function renderPreview() {
    if (!pv || !pv.r) return;
    const held = G.inv.held();
    dressModel(pv.md, G.inv.armor, held ? held.id : 0);
    pv.md.root.rotation.y = pv.mx * 1.2;
    pv.md.head.rotation.set(pv.my * 0.8, pv.mx * 0.6, 0);
    pv.r.render(pv.sc, pv.cam);
  }

  function render() {
    const L = G.localLight ? G.localLight() : 1;
    for (const it of items) {
      if (!it.mesh) it.mesh = itemMesh(it);
      it.mesh.position.set(it.x, it.y + 0.15 + Math.sin(it.age * 2.5) * 0.05, it.z);
      it.mesh.rotation.y = it.age * 1.5;
    }
    for (const a of arrows) {
      if (!a.mesh) {
        if (!arrowGeo) arrowGeo = new THREE.BoxGeometry(0.05, 0.05, 0.6);
        a.mesh = new THREE.Mesh(arrowGeo, arrowMat); scene().add(a.mesh);
      }
      a.mesh.position.set(a.x, a.y, a.z);
      if (!a.stuck) a.mesh.lookAt(a.x + a.vx, a.y + a.vy, a.z + a.vz);
    }
    for (const f of fireballs) {
      if (!f.mesh) {
        const s = f.small ? 0.3 : 1.0;
        f.mesh = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), new THREE.MeshBasicMaterial({ map: textures().fireball }));
        scene().add(f.mesh);
      }
      f.mesh.position.set(f.x, f.y, f.z);
      f.mesh.rotation.set(f.age * 5, f.age * 7, 0);
    }
    for (const m of mobs) {
      if (!m.model) m.model = buildModel(m.type, m.color);
      const md = m.model;
      md.root.position.set(m.x, m.y, m.z);
      md.root.rotation.y = m.yaw;
      const sw = Math.sin(m.phase) * 0.7 * Math.min(1, Math.hypot(m.vx, m.vz));
      if (md.spiderLegs) md.legs.forEach((l, k) => { l.rotation.x = (k % 2 ? sw : -sw) * 0.5; });
      else md.legs.forEach((l, k) => { l.rotation.x = (md.legs.length === 4 ? (k === 0 || k === 3) : k === 0) ? sw : -sw; });
      if (m.type === 'zombie' || m.type === 'skeleton') md.arms.forEach((a, k) => { a.rotation.x = -Math.PI / 2 + (k ? sw : -sw) * 0.2 - (m.swingT > 0 ? 0.5 : 0); });
      if (md.wings) md.wings.forEach((wg, k) => { wg.rotation.z = (k ? 1 : -1) * (m.onGround ? 0 : Math.abs(Math.sin(m.phase * 6)) * 0.8); });
      if (md.wool) md.wool.visible = !m.sheared;
      if (md.slimeBody) { const s = (m.size || 2) === 1 ? 0.5 : 1, sq = m.onGround ? 1 : 1.12; md.root.scale.set(s / Math.sqrt(sq), s * sq, s / Math.sqrt(sq)); }
      if (md.tentacles) md.tentacles.forEach((tn, k) => { tn.rotation.x = Math.sin(G.frameNo * 0.05 + k) * 0.3; tn.rotation.z = Math.cos(G.frameNo * 0.04 + k * 1.7) * 0.2; });
      if (md.ghastBody) { const angry = (m.charge || 0) > 2.2 || m.shotT > 0; if (md.angry !== angry) { md.angry = angry; md.ghastBody.material[4].map = angry ? textures().ghastAngry : textures().ghastFace; } }
      if (md.rods) md.rods.forEach((rod) => { const ring = rod.userData.ring, k = rod.userData.k, a = m.phase * (ring === 1 ? -1 : 1) + k * Math.PI / 2 + ring * 0.4, rad = [0.6, 0.5, 0.35][ring]; rod.position.set(Math.cos(a) * rad, 1.15 - ring * 0.42 + Math.sin(m.phase * 2 + k) * 0.05, Math.sin(a) * rad); });
      if (m.swingT > 0) m.swingT -= 0.016;
      md.body.rotation.z = m.deadT > 0 ? Math.min(Math.PI / 2, m.deadT * 4) : 0;
      md.fire.visible = m.fireT > 0 && m.deadT === 0;
      const swell = m.fuse ? Math.min(1, m.fuse / m.def.fuse) : 0;
      md.root.scale.set(1 + swell * 0.25, 1 + swell * 0.12, 1 + swell * 0.25);
      m.flash = swell > 0 && Math.floor(m.fuse * 6) % 2 === 1;
      if (md.fire.visible) md.fire.rotation.y += 0.2;
      // освещение у моба и красная вспышка после удара
      m.lightT = (m.lightT || 0) - 1;
      if (m.lightT <= 0) { m.lightT = 15; m.light = G.lightAt(m.x, m.y + 1, m.z); }
      const red = m.hurtT > 0 || m.deadT > 0;
      const l = (m.light || 1) / Math.max(0.15, L), wk = m.flash ? 2.2 : 1;
      md.root.traverse((o) => { if (o.userData.mats && o !== md.fire) for (const mt of o.userData.mats) mt.color.setRGB(Math.min(2.4, l * wk) * (red ? 1.4 : 1), Math.min(2.4, l * wk) * (red ? 0.45 : 1), Math.min(2.4, l * wk) * (red ? 0.45 : 1)); });
    }
  }

  function bodies() { return mobs.filter((m) => m.deadT === 0).map((m) => [m.x - m.w / 2, m.y, m.z - m.w / 2, m.x + m.w / 2, m.y + m.h, m.z + m.w / 2]); }
  function clear() {
    for (let i = fireballs.length - 1; i >= 0; i--) dropFireball(i);
    for (let i = items.length - 1; i >= 0; i--) removeItem(i);
    for (let i = mobs.length - 1; i >= 0; i--) removeMob(i);
    for (let i = arrows.length - 1; i >= 0; i--) dropArrow(i);
    for (const q of parts) group.remove(q.m);
    parts.length = 0;
  }
  function reset(meta) {
    clear();
    if (!meta || !meta.entities) return;
    for (const it of meta.entities.items || []) spawnItem(it.s, it.x, it.y, it.z, 0, 0, 0, 0).age = it.age || 0;
    for (const m of meta.entities.mobs || []) {
      if (!D.MOBS[m.t]) continue;
      const e = spawnMob(m.t, m.x, m.y, m.z); e.hp = m.hp; e.yaw = m.yaw || 0;
      if (m.c) e.color = m.c;
      if (m.sh) { e.sheared = true; e.regrow = 60; }
      if (m.sz === 1) { e.size = 1; e.w = e.h = 0.5; }
    }
  }
  function save(meta) {
    const r = (v) => Math.round(v * 100) / 100;
    meta.entities = {
      items: items.slice(-200).map((it) => ({ s: VX.inv.clone(it.stack), x: r(it.x), y: r(it.y), z: r(it.z), age: Math.round(it.age) })),
      mobs: mobs.filter((m) => m.deadT === 0).map((m) => ({ t: m.type, x: r(m.x), y: r(m.y), z: r(m.z), hp: m.hp, yaw: r(m.yaw), c: m.color !== 'white' ? m.color : undefined, sh: m.sheared || undefined, sz: m.size === 1 ? 1 : undefined })),
    };
  }

  VX.entities = { fireballs, shootFireball, deflect, updateGhast, updateBlaze, blast, removeItemAt: removeItem, previewCanvas, renderPreview, spawnItem, spawnMob, burst, update, render, attack, bodies, reset, save, clear, hurtMob, items, mobs, arrows, inSun, rayMob, shootArrow, interact, playerModel, sees };
})();
