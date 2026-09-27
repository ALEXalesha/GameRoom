// Движок мест: мир из деталей-ящиков (статичные склеиваются в одну сетку на материал), физика
// персонажа с постоянным шагом (1/60 с), камера вокруг героя, небо, обломки при развале персонажа.
// Единицы - «шипы» (1 шип = 1 единица): герой ростом 5, бег 16/с, прыжок 50/с, тяжесть 196.2.
'use strict';
(function (B) {
  const E = B.engine = {};
  const PH = E.PHYS = { GRAV: 196.2, WALK: 16, JUMP: 50, HX: 0.9, HEIGHT: 5, STEP_UP: 1.1, COYOTE: 0.1, JBUF: 0.12, TERMINAL: 150 };
  const EPS = 1e-5;

  // ---------- Материалы ----------
  let MATS = null;
  E.mats = function () {
    if (MATS) return MATS;
    const edges = B.tex.edges();
    const phong = (o) => new THREE.MeshPhongMaterial(Object.assign({ vertexColors: true, aoMap: edges, aoMapIntensity: 0.55, shininess: 28, specular: 0x202020 }, o));
    MATS = {
      plastic: [phong({ map: B.tex.studs() }), phong({})],
      smooth: [phong({}), phong({})],
      neon: [new THREE.MeshBasicMaterial({ vertexColors: true }), new THREE.MeshBasicMaterial({ vertexColors: true })],
      lava: [new THREE.MeshBasicMaterial({ vertexColors: true, map: B.tex.lava() }), new THREE.MeshBasicMaterial({ vertexColors: true, map: B.tex.lava() })],
      snow: [new THREE.MeshLambertMaterial({ vertexColors: true, map: B.tex.snow() }), new THREE.MeshLambertMaterial({ vertexColors: true, map: B.tex.snow() })],
      glass: [phong({ transparent: true, opacity: 0.45, shininess: 90, specular: 0x666666 }), phong({ transparent: true, opacity: 0.45 })],
    };
    MATS.lava.uvScale = 1 / 10; MATS.snow.uvScale = 1 / 4;
    return MATS;
  };
  const UVSCALE = { lava: 1 / 10, snow: 1 / 4 };

  // ---------- Построитель склеенной геометрии ящиков ----------
  const FACES = [
    { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0], o: [1, -1, 1] },
    { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0], o: [-1, -1, -1] },
    { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1], o: [-1, 1, 1], top: true },
    { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1], o: [-1, -1, -1] },
    { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], o: [-1, -1, 1] },
    { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0], o: [1, -1, -1] },
  ];
  const AX = ['x', 'y', 'z'];
  // boxes: [{cx,cy,cz, sx,sy,sz, color(THREE.Color), uvs(scale)}], origin - вычитается из позиций
  function boxesGeometry(boxes, origin, uvScale = 1) {
    const n = boxes.length * 24;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), uv = new Float32Array(n * 2), uv2 = new Float32Array(n * 2);
    const top = [], other = [];
    let vi = 0;
    for (const b of boxes) {
      const h = [b.sx / 2, b.sy / 2, b.sz / 2], c = [b.cx, b.cy, b.cz];
      const s = [b.sx, b.sy, b.sz];
      for (const f of FACES) {
        const ui = f.u.findIndex((q) => q !== 0), vj = f.v.findIndex((q) => q !== 0);
        const lu = s[ui], lv = s[vj];
        const base = vi;
        for (let k = 0; k < 4; k++) {
          const du = k === 1 || k === 2 ? 1 : 0, dv = k >= 2 ? 1 : 0;
          const w = [0, 0, 0];
          for (let a = 0; a < 3; a++) w[a] = c[a] + f.o[a] * h[a] + (f.u[a] * lu * du) + (f.v[a] * lv * dv);
          pos[vi * 3] = w[0] - origin.x; pos[vi * 3 + 1] = w[1] - origin.y; pos[vi * 3 + 2] = w[2] - origin.z;
          nor[vi * 3] = f.n[0]; nor[vi * 3 + 1] = f.n[1]; nor[vi * 3 + 2] = f.n[2];
          col[vi * 3] = b.color.r; col[vi * 3 + 1] = b.color.g; col[vi * 3 + 2] = b.color.b;
          // развёртка в мировых единицах: шипы соседних деталей совпадают
          uv[vi * 2] = (w[0] * f.u[0] + w[1] * f.u[1] + w[2] * f.u[2]) * uvScale;
          uv[vi * 2 + 1] = (w[0] * f.v[0] + w[1] * f.v[1] + w[2] * f.v[2]) * uvScale;
          uv2[vi * 2] = du; uv2[vi * 2 + 1] = dv;
          vi++;
        }
        const list = f.top ? top : other;
        list.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('uv2', new THREE.BufferAttribute(uv2, 2));
    const idx = top.concat(other);
    g.setIndex(n > 65000 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
    g.addGroup(0, top.length, 0);
    g.addGroup(top.length, other.length, 1);
    g.computeBoundingSphere();
    return g;
  }
  E.boxesGeometry = boxesGeometry;

  // ---------- Мир ----------
  let partId = 0;
  class World {
    constructor(seed) {
      this.scene = new THREE.Scene();
      this.parts = []; this.dyn = []; this.hash = new Map(); this.cell = 16;
      this.time = 0; this.voidY = -80; this.finalized = false; this.q = 0;
      this.rng = B.rng(seed || 1);
      this.meshes = [];
      this.animTex = [];
    }
    key(ix, iz) { return (ix + 32768) * 65536 + (iz + 32768); }
    cellsOf(p, fn) {
      const c = this.cell;
      for (let ix = Math.floor(p.minX / c); ix <= Math.floor(p.maxX / c); ix++)
        for (let iz = Math.floor(p.minZ / c); iz <= Math.floor(p.maxZ / c); iz++) fn(this.key(ix, iz));
    }
    hashAdd(p) { this.cellsOf(p, (k) => { let l = this.hash.get(k); if (!l) this.hash.set(k, l = []); l.push(p); }); }
    hashRemove(p) { this.cellsOf(p, (k) => { const l = this.hash.get(k); if (l) { const i = l.indexOf(p); if (i >= 0) l.splice(i, 1); } }); }
    setBounds(p) {
      p.minX = p.cx - p.sx / 2; p.maxX = p.cx + p.sx / 2;
      p.minY = p.cy - p.sy / 2; p.maxY = p.cy + p.sy / 2;
      p.minZ = p.cz - p.sz / 2; p.maxZ = p.cz + p.sz / 2;
    }
    // o: pos [x,y,z] (центр) или top [x,y,z] (середина верхней грани), size [w,h,d], color, mat,
    //    solid, kill, bounce, conveyor {x,z}, speed, move(t)->{x,y,z}, spin (рад/с), fade, visual, tag, onTouch
    add(o) {
      const size = o.size || [4, 1, 4];
      let c = o.pos;
      if (!c && o.top) c = [o.top[0], o.top[1] - size[1] / 2, o.top[2]];
      const p = {
        id: ++partId, cx: c[0], cy: c[1], cz: c[2], sx: size[0], sy: size[1], sz: size[2],
        color: new THREE.Color(o.color || '#a3a2a5'), mat: o.mat || 'plastic',
        solid: o.solid !== false, kill: !!o.kill, bounce: o.bounce || 0, conveyor: o.conveyor || null, speed: o.speed || 0,
        move: o.move || null, spin: o.spin || 0, angle: o.angle || 0, fade: o.fade ? { state: 'solid', t: 0 } : null,
        visual: o.visual !== false, tag: o.tag || '', onTouch: o.onTouch || null, data: o.data || {},
        delta: { x: 0, y: 0, z: 0 }, prev: null, mesh: null, _q: 0,
      };
      p.base = { x: p.cx, y: p.cy, z: p.cz };
      this.setBounds(p);
      p.dynamic = !!(p.move || p.spin || p.fade || p.conveyor || o.dynamic);
      this.parts.push(p);
      if (p.dynamic) { this.dyn.push(p); if (p.move) this.applyMove(p, 0, true); }
      else this.hashAdd(p);
      if (p.visual && (p.dynamic || this.finalized || o.ownMesh)) this.makeMesh(p);
      return p;
    }
    remove(p) {
      const i = this.parts.indexOf(p); if (i >= 0) this.parts.splice(i, 1);
      if (p.dynamic) { const j = this.dyn.indexOf(p); if (j >= 0) this.dyn.splice(j, 1); } else this.hashRemove(p);
      if (p.mesh) { this.scene.remove(p.mesh); p.mesh.geometry.dispose(); }
    }
    makeMesh(p) {
      const M = E.mats();
      const geo = boxesGeometry([{ cx: 0, cy: 0, cz: 0, sx: p.sx, sy: p.sy, sz: p.sz, color: p.color }], { x: 0, y: 0, z: 0 }, UVSCALE[p.mat] || 1);
      let mats = M[p.mat] || M.plastic;
      if (p.conveyor) {
        const t = B.tex.conveyor().clone(); t.needsUpdate = true; t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.center.set(0.5, 0.5);
        t.rotation = Math.atan2(p.conveyor.x, -p.conveyor.z) * -1;   // стрелка по направлению ленты
        const top = new THREE.MeshPhongMaterial({ map: t, aoMap: B.tex.edges(), aoMapIntensity: 0.5 });
        mats = [top, M.smooth[1]];
        p.convTex = t;
        this.animTex.push(p);
      }
      if (p.fade) mats = mats.map((m) => { const c = m.clone(); c.transparent = true; return c; });
      const mesh = new THREE.Mesh(geo, mats);
      mesh.position.set(p.cx, p.cy, p.cz);
      mesh.rotation.y = p.angle;
      mesh.castShadow = p.mat !== 'neon' && p.mat !== 'lava'; mesh.receiveShadow = true;
      mesh.userData.part = p;
      p.mesh = mesh;
      this.scene.add(mesh);
      return mesh;
    }
    // Склеить все статичные детали: по одной сетке на материал
    finalize() {
      const byMat = {};
      for (const p of this.parts) if (!p.dynamic && p.visual && !p.mesh) (byMat[p.mat] = byMat[p.mat] || []).push(p);
      const M = E.mats();
      for (const m in byMat) {
        const list = byMat[m];
        for (let i = 0; i < list.length; i += 4000) {
          const chunk = list.slice(i, i + 4000);
          const geo = boxesGeometry(chunk.map((p) => ({ cx: p.cx, cy: p.cy, cz: p.cz, sx: p.sx, sy: p.sy, sz: p.sz, color: p.color })), { x: 0, y: 0, z: 0 }, UVSCALE[m] || 1);
          const mesh = new THREE.Mesh(geo, M[m] || M.plastic);
          mesh.castShadow = m !== 'lava' && m !== 'neon'; mesh.receiveShadow = true;
          this.scene.add(mesh); this.meshes.push(mesh);
        }
      }
      this.finalized = true;
    }
    applyMove(p, t, init) {
      const np = p.move(t, p);
      const ox = p.cx, oy = p.cy, oz = p.cz;
      p.cx = np.x; p.cy = np.y; p.cz = np.z;
      p.delta.x = init ? 0 : p.cx - ox; p.delta.y = init ? 0 : p.cy - oy; p.delta.z = init ? 0 : p.cz - oz;
      this.setBounds(p);
    }
    // Шаг движущихся деталей
    step(dt) {
      this.time += dt;
      for (const p of this.dyn) {
        p.prev = p.prev || {}; p.prev.x = p.cx; p.prev.y = p.cy; p.prev.z = p.cz; p.prev.a = p.angle;
        if (p.move) this.applyMove(p, this.time);
        else { p.delta.x = p.delta.y = p.delta.z = 0; }
        if (p.spin) p.angle += p.spin * dt;
        if (p.fade) {
          const f = p.fade;
          if (f.state === 'warn') { f.t -= dt; if (f.t <= 0) { f.state = 'gone'; f.t = 2.5; p.solid = false; } }
          else if (f.state === 'gone') { f.t -= dt; if (f.t <= 0) { f.state = 'solid'; p.solid = true; } }
        }
      }
      for (const p of this.animTex) p.convTex.offset.y -= dt * Math.hypot(p.conveyor.x, p.conveyor.z) * 0.12;
    }
    // Перенести вид движущихся деталей в сетки (alpha - доля между шагами)
    sync(alpha) {
      for (const p of this.dyn) {
        if (!p.mesh) continue;
        const pr = p.prev || { x: p.cx, y: p.cy, z: p.cz, a: p.angle };
        p.mesh.position.set(B.lerp(pr.x, p.cx, alpha), B.lerp(pr.y, p.cy, alpha), B.lerp(pr.z, p.cz, alpha));
        p.mesh.rotation.y = B.lerp(pr.a, p.angle, alpha);
        if (p.fade) {
          const f = p.fade;
          const op = f.state === 'solid' ? 1 : f.state === 'warn' ? 0.45 + 0.4 * Math.abs(Math.sin(f.t * 20)) : 0.12;
          for (const m of p.mesh.material) m.opacity = op;
          p.mesh.castShadow = f.state !== 'gone';
        }
      }
    }
    query(x0, z0, x1, z1) {
      const out = [], c = this.cell, q = ++this.q;
      for (let ix = Math.floor(x0 / c); ix <= Math.floor(x1 / c); ix++)
        for (let iz = Math.floor(z0 / c); iz <= Math.floor(z1 / c); iz++) {
          const l = this.hash.get(this.key(ix, iz));
          if (l) for (const p of l) if (p._q !== q) { p._q = q; out.push(p); }
        }
      for (const p of this.dyn) out.push(p);
      return out;
    }
    boxFree(x0, y0, z0, x1, y1, z1) {
      for (const c of this.query(x0, z0, x1, z1)) {
        if (!c.solid || c.spin) continue;
        if (x1 > c.minX + EPS && x0 < c.maxX - EPS && y1 > c.minY + EPS && y0 < c.maxY - EPS && z1 > c.minZ + EPS && z0 < c.maxZ - EPS) return false;
      }
      return true;
    }
    // Луч: {t, part, normal} до ближайшей твёрдой детали
    rayCast(o, d, maxT, filter) {
      const x1 = o.x + d.x * maxT, z1 = o.z + d.z * maxT;
      let best = maxT, hit = null, nrm = null;
      for (const c of this.query(Math.min(o.x, x1), Math.min(o.z, z1), Math.max(o.x, x1), Math.max(o.z, z1))) {
        if (!c.solid || c.spin || (filter && !filter(c))) continue;
        let tmin = 0, tmax = best, axis = -1, sign = 0;
        let ok = true;
        for (let a = 0; a < 3; a++) {
          const k = AX[a], oo = o[k], dd = d[k];
          const lo = a === 0 ? c.minX : a === 1 ? c.minY : c.minZ, hi = a === 0 ? c.maxX : a === 1 ? c.maxY : c.maxZ;
          if (Math.abs(dd) < 1e-9) { if (oo < lo || oo > hi) { ok = false; break; } continue; }
          let t1 = (lo - oo) / dd, t2 = (hi - oo) / dd, s = -1;
          if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
          if (t1 > tmin) { tmin = t1; axis = a; sign = s; }
          if (t2 < tmax) tmax = t2;
          if (tmin > tmax) { ok = false; break; }
        }
        if (ok && tmin < best && axis >= 0) { best = tmin; hit = c; nrm = [0, 0, 0]; nrm[axis] = sign; }
      }
      return hit ? { t: best, part: hit, normal: nrm } : null;
    }
    dispose() {
      this.scene.traverse((o) => { if (o.isMesh && o.geometry && !o.userData.shared) o.geometry.dispose(); });
    }
  }
  E.World = World;

  // Касается ли ящик героя повёрнутой (крутящейся) детали: разделяющие оси на плоскости XZ
  function spinTouch(p, x0, y0, z0, x1, y1, z1) {
    if (y1 < p.minY || y0 > p.maxY) return false;
    const ca = Math.cos(p.angle), sa = Math.sin(p.angle);
    const hx = p.sx / 2, hz = p.sz / 2;
    const bx = (x0 + x1) / 2, bz = (z0 + z1) / 2, bhx = (x1 - x0) / 2, bhz = (z1 - z0) / 2;
    const dx = bx - p.cx, dz = bz - p.cz;
    // оси детали: u=(ca,-sa), v=(sa,ca) (поворот вокруг Y)
    const axes = [[1, 0], [0, 1], [ca, -sa], [sa, ca]];
    for (const [ax, az] of axes) {
      const rP = hx * Math.abs(ax * ca + az * -sa) + hz * Math.abs(ax * sa + az * ca);
      const rB = bhx * Math.abs(ax) + bhz * Math.abs(az);
      if (Math.abs(dx * ax + dz * az) > rP + rB) return false;
    }
    return true;
  }
  E.spinTouch = spinTouch;

  // ---------- Тело персонажа ----------
  class Body {
    constructor(world, x, y, z) {
      this.world = world;
      this.pos = { x, y, z }; this.prev = { x, y, z }; this.vel = { x: 0, y: 0, z: 0 };
      this.onGround = false; this.ground = null; this.coyote = 0; this.jumpBuf = 0;
      this.facing = 0; this.prevFacing = 0; this.boost = 0; this.alive = true; this.airTime = 0;
      this.walk = PH.WALK; this.jumpPower = PH.JUMP;
    }
    teleport(x, y, z, facing) {
      this.pos.x = this.prev.x = x; this.pos.y = this.prev.y = y; this.pos.z = this.prev.z = z;
      this.vel.x = this.vel.y = this.vel.z = 0; this.onGround = false; this.ground = null; this.coyote = 0; this.jumpBuf = 0;
      if (facing != null) this.facing = this.prevFacing = facing;
    }
    sweep(axis, amt, allowStep) {
      if (amt === 0) return null;
      const w = this.world, p = this.pos, hx = PH.HX, h = PH.HEIGHT;
      const x0 = p.x - hx, x1 = p.x + hx, y0 = p.y, y1 = p.y + h, z0 = p.z - hx, z1 = p.z + hx;
      let qx0 = x0, qx1 = x1, qz0 = z0, qz1 = z1;
      if (axis === 'x') { if (amt > 0) qx1 += amt; else qx0 += amt; }
      if (axis === 'z') { if (amt > 0) qz1 += amt; else qz0 += amt; }
      const cands = w.query(qx0, qz0, qx1, qz1);
      if (axis === 'y') {
        if (amt < 0) {
          let top = -Infinity, hit = null;
          for (const c of cands) {
            if (!c.solid || c.spin) continue;
            if (!(x1 > c.minX + EPS && x0 < c.maxX - EPS && z1 > c.minZ + EPS && z0 < c.maxZ - EPS)) continue;
            if (c.maxY <= y0 + 0.6 && c.maxY >= y0 + amt - EPS && c.maxY > top) { top = c.maxY; hit = c; }
          }
          if (hit) { p.y = top; return hit; }
          p.y += amt; return null;
        }
        let best = amt, hit = null;
        for (const c of cands) {
          if (!c.solid || c.spin) continue;
          if (!(x1 > c.minX + EPS && x0 < c.maxX - EPS && z1 > c.minZ + EPS && z0 < c.maxZ - EPS)) continue;
          if (c.minY >= y1 - EPS && c.minY - y1 < best) { best = Math.max(0, c.minY - y1); hit = c; }
        }
        p.y += best; return hit;
      }
      let best = amt, hit = null;
      for (const c of cands) {
        if (!c.solid || c.spin) continue;
        if (!(y1 > c.minY + EPS && y0 < c.maxY - EPS)) continue;
        if (axis === 'x') {
          if (!(z1 > c.minZ + EPS && z0 < c.maxZ - EPS)) continue;
          if (amt > 0 && c.minX >= x1 - EPS && c.minX - x1 < best) { best = c.minX - x1; hit = c; }
          if (amt < 0 && c.maxX <= x0 + EPS && c.maxX - x0 > best) { best = c.maxX - x0; hit = c; }
        } else {
          if (!(x1 > c.minX + EPS && x0 < c.maxX - EPS)) continue;
          if (amt > 0 && c.minZ >= z1 - EPS && c.minZ - z1 < best) { best = c.minZ - z1; hit = c; }
          if (amt < 0 && c.maxZ <= z0 + EPS && c.maxZ - z0 > best) { best = c.maxZ - z0; hit = c; }
        }
      }
      if (!hit) { p[axis] += amt; return null; }
      // невысокий уступ - шагнуть на него, если там свободно
      const rise = hit.maxY - p.y;
      if (allowStep && rise > 0 && rise <= PH.STEP_UP && !hit.kill) {
        const nx = axis === 'x' ? p.x + amt : p.x, nz = axis === 'z' ? p.z + amt : p.z;
        if (w.boxFree(nx - hx, hit.maxY + EPS, nz - hx, nx + hx, hit.maxY + h, nz + hx)) {
          p.x = nx; p.z = nz; p.y = hit.maxY; return null;
        }
      }
      if (axis === 'x') p.x = amt > 0 ? hit.minX - hx : hit.maxX + hx;
      else p.z = amt > 0 ? hit.minZ - hx : hit.maxZ + hx;
      return hit;
    }
    // input: { mx, mz (направление в мире, длина <= 1), jump (кнопка зажата), face (угол, куда смотреть; иначе - по движению) }
    step(input, dt) {
      const ev = [];
      const p = this.pos, v = this.vel, w = this.world;
      this.prev.x = p.x; this.prev.y = p.y; this.prev.z = p.z; this.prevFacing = this.facing;
      // стоящего везёт опора: едущая плита и лента конвейера
      const g = this.ground;
      if (g && this.onGround && g.solid) {
        if (g.delta.x || g.delta.z) { this.sweep('x', g.delta.x, false); this.sweep('z', g.delta.z, false); }
        if (g.delta.y) p.y += g.delta.y;
        if (g.conveyor) { this.sweep('x', g.conveyor.x * dt, false); this.sweep('z', g.conveyor.z * dt, false); }
      }
      if (this.boost > 0) this.boost -= dt;
      const speed = this.walk * (this.boost > 0 ? 1.8 : 1);
      const tx = input.mx * speed, tz = input.mz * speed;
      const k = 1 - Math.exp(-(this.onGround ? 18 : 9) * dt);
      v.x += (tx - v.x) * k; v.z += (tz - v.z) * k;
      if (Math.abs(v.x) < 1e-4) v.x = 0;
      if (Math.abs(v.z) < 1e-4) v.z = 0;
      // куда смотрит
      let want = input.face;
      if (want == null && (input.mx || input.mz)) want = Math.atan2(input.mx, input.mz);
      if (want != null) {
        let d = want - this.facing; d = Math.atan2(Math.sin(d), Math.cos(d));
        this.facing += d * Math.min(1, dt * 16);
      }
      // прыжок: запас «после края» (coyote) и запоминание нажатия чуть раньше приземления
      if (this.onGround) this.coyote = PH.COYOTE; else this.coyote -= dt;
      if (input.jump) this.jumpBuf = PH.JBUF; else this.jumpBuf -= dt;
      if (this.jumpBuf > 0 && this.coyote > 0 && this.jumpPower > 0) {
        v.y = this.jumpPower; this.coyote = 0; this.jumpBuf = 0; this.onGround = false; this.ground = null;
        ev.push('jump');
      }
      v.y = Math.max(-PH.TERMINAL, v.y - PH.GRAV * dt);
      const wasGround = this.onGround;
      this.onGround = false;
      this.sweep('x', v.x * dt, wasGround);
      this.sweep('z', v.z * dt, wasGround);
      const hitY = this.sweep('y', v.y * dt, false);
      if (hitY && v.y <= 0) {
        if (!wasGround && v.y < -30) ev.push('land');
        this.onGround = true; this.ground = hitY; this.lastLand = hitY; v.y = 0;
        if (hitY.bounce) { v.y = hitY.bounce; this.onGround = false; this.ground = null; ev.push('bounce'); }
        if (hitY.fade && hitY.fade.state === 'solid') { hitY.fade.state = 'warn'; hitY.fade.t = 0.6; }
      } else if (hitY && v.y > 0) v.y = 0;
      if (!this.onGround) { this.ground = null; this.airTime += dt; } else this.airTime = 0;
      // касания: убивающие детали, ускорители, триггеры мест
      const x0 = p.x - PH.HX - 0.05, x1 = p.x + PH.HX + 0.05, y0 = p.y - 0.08, y1 = p.y + PH.HEIGHT + 0.05, z0 = p.z - PH.HX - 0.05, z1 = p.z + PH.HX + 0.05;
      this.touching = [];
      for (const c of w.query(x0, z0, x1, z1)) {
        if (c.fade && c.fade.state === 'gone') continue;
        const hit = c.spin ? spinTouch(c, x0, y0, z0, x1, y1, z1)
          : x1 > c.minX && x0 < c.maxX && y1 > c.minY && y0 < c.maxY && z1 > c.minZ && z0 < c.maxZ;
        if (!hit) continue;
        this.touching.push(c);
        if (c.kill) ev.push('kill');
        if (c.speed && this.boost <= 0.2) { this.boost = c.speed; ev.push('speed'); }
      }
      if (p.y < w.voidY) ev.push('kill');
      return ev;
    }
    lerpPos(alpha) {
      return { x: B.lerp(this.prev.x, this.pos.x, alpha), y: B.lerp(this.prev.y, this.pos.y, alpha), z: B.lerp(this.prev.z, this.pos.z, alpha) };
    }
    lerpFacing(alpha) { let d = this.facing - this.prevFacing; d = Math.atan2(Math.sin(d), Math.cos(d)); return this.prevFacing + d * alpha; }
  }
  E.Body = Body;

  // ---------- Обломки: персонаж разваливается на части ----------
  E.shatter = function (world, ch, rnd, impulse) {
    const pieces = [];
    ch.root.updateMatrixWorld(true);
    // разбираем по верхним узлам: части тела и вещи целиком
    const nodes = [];
    for (const k of ['head', 'torso', 'armL', 'armR', 'legL', 'legR']) nodes.push(ch.parts[k]);
    ch.root.traverse((o) => { if (o.userData && o.userData.item) nodes.push(o); });
    for (const n of nodes) {
      const clone = n.clone(true);
      n.matrixWorld.decompose(clone.position, clone.quaternion, clone.scale);
      world.scene.add(clone);
      const dir = new THREE.Vector3().subVectors(clone.position, ch.root.position);
      dir.y = 0; if (dir.lengthSq() < 0.01) dir.set(rnd() - 0.5, 0, rnd() - 0.5);
      dir.normalize();
      const s = impulse || 1;
      pieces.push({
        obj: clone, vel: new THREE.Vector3(dir.x * (6 + rnd() * 8) * s, (8 + rnd() * 14) * s, dir.z * (6 + rnd() * 8) * s),
        spin: new THREE.Vector3((rnd() - 0.5) * 10, (rnd() - 0.5) * 10, (rnd() - 0.5) * 10), rest: false,
      });
    }
    return pieces;
  };
  E.stepPieces = function (world, pieces, dt) {
    const q = new THREE.Quaternion(), e = new THREE.Euler();
    for (const pc of pieces) {
      if (pc.rest) continue;
      pc.vel.y -= PH.GRAV * 0.45 * dt;
      const o = pc.obj;
      o.position.addScaledVector(pc.vel, dt);
      e.set(pc.spin.x * dt, pc.spin.y * dt, pc.spin.z * dt); q.setFromEuler(e); o.quaternion.multiply(q);
      const r = 0.5;
      for (const c of world.query(o.position.x - r, o.position.z - r, o.position.x + r, o.position.z + r)) {
        if (!c.solid || c.kill) continue;
        if (o.position.x > c.minX && o.position.x < c.maxX && o.position.z > c.minZ && o.position.z < c.maxZ && o.position.y - r < c.maxY && o.position.y > c.minY) {
          o.position.y = c.maxY + r;
          pc.vel.y = Math.abs(pc.vel.y) * 0.3; pc.vel.x *= 0.6; pc.vel.z *= 0.6; pc.spin.multiplyScalar(0.6);
          if (pc.vel.lengthSq() < 4) pc.rest = true;
        }
      }
    }
  };

  // ---------- Небо: градиент, солнце, облака из кубиков ----------
  E.makeSky = function (scene, opt = {}) {
    const top = new THREE.Color(opt.top || '#3f8fe6'), hor = new THREE.Color(opt.horizon || '#cfe8ff');
    const sunDir = new THREE.Vector3(opt.sun ? opt.sun[0] : 0.45, opt.sun ? opt.sun[1] : 0.62, opt.sun ? opt.sun[2] : 0.35).normalize();
    const mat = new THREE.ShaderMaterial({
      uniforms: { top: { value: top }, hor: { value: hor }, sunDir: { value: sunDir } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 hor; uniform vec3 sunDir; varying vec3 vDir;' +
        'void main(){ float h = max(vDir.y, 0.0); vec3 c = mix(hor, top, pow(h, 0.6));' +
        ' if (vDir.y < 0.0) c = hor * 0.92;' +
        ' float s = max(dot(normalize(vDir), sunDir), 0.0);' +
        ' c += vec3(1.0,0.95,0.8) * (pow(s, 900.0) * 1.6 + pow(s, 30.0) * 0.18);' +
        ' gl_FragColor = vec4(c, 1.0); }',
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), mat);
    sky.renderOrder = -1; sky.frustumCulled = false;
    scene.add(sky);
    scene.background = hor.clone();          // запасной цвет неба вместо чёрного
    // облака: несколько плоских кубиков, одна сетка
    const rnd = B.rng(opt.seed || 5), boxes = [];
    for (let i = 0; i < (opt.clouds == null ? 22 : opt.clouds); i++) {
      const a = rnd() * Math.PI * 2, r = 220 + rnd() * 380, y = (opt.cloudY || 120) + rnd() * 90;
      const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
      for (let j = 0; j < 3 + rnd.int(3); j++) {
        boxes.push({ cx: cx + (rnd() - 0.5) * 40, cy: y + rnd() * 6, cz: cz + (rnd() - 0.5) * 24, sx: 20 + rnd() * 30, sy: 5 + rnd() * 5, sz: 14 + rnd() * 18, color: new THREE.Color('#ffffff') });
      }
    }
    let clouds = null;
    if (boxes.length) {
      clouds = new THREE.Mesh(boxesGeometry(boxes, { x: 0, y: 0, z: 0 }), new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.92, emissive: 0x9aa7b8 }));
      scene.add(clouds);
    }
    return { sky, clouds, sunDir, hor };
  };

  // ---------- Свет ----------
  E.makeLights = function (scene, sunDir) {
    const hemi = new THREE.HemisphereLight(0xdcecff, 0x7c6f5a, 0.62);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff4e0, 0.85);
    sun.position.copy(sunDir).multiplyScalar(120);
    sun.castShadow = true;
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02;
    const sc = sun.shadow.camera; sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 400;
    scene.add(sun); scene.add(sun.target);
    return { hemi, sun, dir: sunDir.clone() };
  };

  // ---------- Камера вокруг героя ----------
  class CameraRig {
    constructor(cam) {
      this.cam = cam; this.yaw = 0; this.pitch = 0.32; this.dist = 16; this.want = 16; this.minD = 0.5; this.maxD = 60;
      this.first = false; this.shoulder = 0;
    }
    rotate(dx, dy) { this.yaw -= dx; this.pitch = B.clamp(this.pitch + dy, -1.35, 1.35); }
    zoom(f) { this.want = B.clamp(this.want * f, this.minD, this.maxD); }
    // target - голова героя; world - для «камера не уходит в стену»
    update(target, world, dt) {
      this.dist += (this.want - this.dist) * Math.min(1, dt * 14);
      this.first = this.want <= 0.75;
      const cp = Math.cos(this.pitch);
      const d = new THREE.Vector3(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
      const t = new THREE.Vector3(target.x, target.y, target.z);
      if (this.shoulder) { t.x += Math.cos(this.yaw) * this.shoulder; t.z -= Math.sin(this.yaw) * this.shoulder; }
      let dist = this.first ? 0 : this.dist;
      if (dist > 0.5 && world) {
        const hit = world.rayCast(t, d, dist, (c) => c.mat !== 'glass' && !c.kill && c.sy > 0.3 && (!c.fade || c.fade.state === 'solid'));
        if (hit) dist = Math.max(0.6, hit.t - 0.4);
      }
      this.cam.position.copy(t).addScaledVector(d, dist);
      if (this.first) this.cam.lookAt(t.x - d.x, t.y - d.y, t.z - d.z);
      else this.cam.lookAt(t);
      return d;
    }
    forward() { return { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) }; }
    right() { return { x: Math.cos(this.yaw), z: -Math.sin(this.yaw) }; }
  }
  E.CameraRig = CameraRig;

  // ---------- Рисовальщик ----------
  E.renderer = null;
  E.initRenderer = function (parent) {
    const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.setSize(innerWidth, innerHeight);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    parent.appendChild(r.domElement);
    E.renderer = r;
    return r;
  };
  // Настройки графики по уровню 1..10
  E.qualityProfile = function (q) {
    return {
      shadows: q >= 3,
      shadowSize: q >= 9 ? 4096 : q >= 6 ? 2048 : 1024,
      softShadows: q >= 5,
      pixelRatio: Math.min(window.devicePixelRatio || 1, q >= 9 ? 2 : q >= 6 ? 1.5 : q >= 3 ? 1 : 0.75),
      drawDistance: 160 + q * 70,
      clouds: q >= 4,
    };
  };
})(window.Blox);
