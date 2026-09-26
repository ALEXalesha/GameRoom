// Мир: куски 16x16x128 вокруг игрока, генерация и сборка сеток в Web Worker (через Blob -
// так поток запускается и по file://), выгрузка кусков позади, сохранение изменённых
// кусков, чтение и запись блоков, луч выбора блока, шейдер освещения.
(function () {
  'use strict';
  const VX = window.VX = window.VX || {};
  const C = VX.core;
  const CS = C.CS, CH = C.CH;
  const keyOf = (cx, cz) => (cx + 32768) * 65536 + (cz + 32768);

  // ---------- Потоки ----------
  function workerMain() {
    /* global VoxelCore */
    const Core = VoxelCore();
    self.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'gen') {
        const data = Core.generate(m.seed, m.cx, m.cz);
        self.postMessage({ id: m.id, data }, [data.buffer]);
      } else if (m.type === 'mesh') {
        const r = Core.buildMesh(m.chunks, m.opt);
        const tr = [];
        for (const part of [r.opaque, r.trans]) tr.push(part.pos.buffer, part.uv.buffer, part.light.buffer, part.index.buffer);
        self.postMessage({ id: m.id, mesh: r }, tr);
      }
    };
  }
  function makePool(n) {
    const workers = [];
    try {
      const src = VoxelCore.toString() + '\n;(' + workerMain.toString() + ')();';
      const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      for (let i = 0; i < n; i++) {
        const w = new Worker(url);
        w.busy = 0;
        workers.push(w);
      }
    } catch (e) { return []; }
    return workers;
  }

  // ---------- Шейдер блоков ----------
  const VERT = `
    attribute vec4 light;
    uniform float uDay;
    uniform float uSmooth;
    varying vec2 vUv;
    varying vec3 vCol;
    varying float vDist;
    void main() {
      vUv = uv;
      float sky = light.x * 15.0, blk = light.y * 15.0;
      float skyEff = max(0.0, sky - (1.0 - uDay) * 11.0);
      float l = max(skyEff, blk) / 15.0;
      float b = 0.035 + 0.965 * pow(l, 1.45);
      float ao = mix(1.0, 0.52 + 0.48 * light.z, uSmooth);
      float warm = clamp((blk - skyEff) / 15.0, 0.0, 1.0);
      vec3 tint = mix(vec3(1.0), vec3(1.12, 0.94, 0.72), warm);
      vCol = tint * b * ao * light.w;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vDist = length(mv.xyz);
      gl_Position = projectionMatrix * mv;
    }`;
  const FRAG = `
    uniform sampler2D map;
    uniform vec3 uFogColor;
    uniform float uFogNear;
    uniform float uFogFar;
    uniform float uAlpha;
    uniform float uCut;
    varying vec2 vUv;
    varying vec3 vCol;
    varying float vDist;
    void main() {
      vec4 t = texture2D(map, vUv);
      if (t.a < uCut) discard;
      float f = smoothstep(uFogNear, uFogFar, vDist);
      gl_FragColor = vec4(mix(t.rgb * vCol, uFogColor, f), uAlpha < 0.0 ? 1.0 : t.a * uAlpha);
    }`;
  function makeMaterials(atlasTex) {
    const uni = {
      map: { value: atlasTex }, uDay: { value: 1 }, uSmooth: { value: 1 },
      uFogColor: { value: new THREE.Color(0xc0d8ff) }, uFogNear: { value: 60 }, uFogFar: { value: 120 },
    };
    const opaque = new THREE.ShaderMaterial({
      uniforms: Object.assign({}, uni, { uAlpha: { value: -1 }, uCut: { value: 0.5 } }),
      vertexShader: VERT, fragmentShader: FRAG,
    });
    const trans = new THREE.ShaderMaterial({
      uniforms: Object.assign({}, uni, { uAlpha: { value: 1 }, uCut: { value: 0.01 } }),
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    // общие значения: меняем их у обоих материалов разом
    trans.uniforms.map = opaque.uniforms.map; trans.uniforms.uDay = opaque.uniforms.uDay; trans.uniforms.uSmooth = opaque.uniforms.uSmooth;
    trans.uniforms.uFogColor = opaque.uniforms.uFogColor; trans.uniforms.uFogNear = opaque.uniforms.uFogNear; trans.uniforms.uFogFar = opaque.uniforms.uFogFar;
    return { opaque, trans, uniforms: opaque.uniforms };
  }

  // ---------- Мир ----------
  function World(scene, materials) {
    this.scene = scene;
    this.mat = materials;
    this.chunks = new Map();
    this.pool = makePool(Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1)));
    this.jobs = new Map();
    this.jobId = 1;
    this.pool.forEach((w) => { w.onmessage = (e) => this.onResult(w, e.data); w.onerror = () => { w.dead = true; }; });
    this.syncMode = this.pool.length === 0;
    this.meta = null;
    this.radius = 8;
    this.opts = { fancy: true, smooth: true };
    this.center = [0, 0];
    this.stats = { generated: 0, meshed: 0, loadedFromDisk: 0 };
    this.saveSet = new Set();
    this.group = new THREE.Group();
    scene.add(this.group);
    this.cache = null;
  }
  World.prototype.open = function (meta, persist) {
    this.close();
    this.meta = meta;
    this.seed = meta.seedNum;
    this.persist = persist;
    this.epoch = (this.epoch || 0) + 1;
  };
  World.prototype.close = function () {
    for (const ch of this.chunks.values()) this.dropMesh(ch);
    this.chunks.clear();
    this.jobs.clear();
    this.saveSet.clear();
    this.cache = null;
    this.epoch = (this.epoch || 0) + 1;
  };
  World.prototype.chunk = function (cx, cz) {
    const c = this.cache;
    if (c && c.cx === cx && c.cz === cz) return c;
    const ch = this.chunks.get(keyOf(cx, cz));
    if (ch) this.cache = ch;
    return ch;
  };
  World.prototype.getBlock = function (x, y, z) {
    if (y < 0 || y >= CH) return 0;
    const cx = Math.floor(x / CS), cz = Math.floor(z / CS);
    const ch = this.chunk(cx, cz);
    if (!ch || !ch.data) return y < 0 ? 5 : -1;     // -1: кусок ещё не загружен
    return ch.data[(x - cx * CS) | ((z - cz * CS) << 4) | (y << 8)];
  };
  World.prototype.isLoaded = function (x, z) { const ch = this.chunk(Math.floor(x / CS), Math.floor(z / CS)); return !!(ch && ch.data); };

  // Поставить блок (id 0 - сломать). Возвращает прежний id или -1, если кусок не загружен.
  World.prototype.setBlock = function (x, y, z, id) {
    if (y < 0 || y >= CH) return -1;
    const cx = Math.floor(x / CS), cz = Math.floor(z / CS);
    const ch = this.chunk(cx, cz);
    if (!ch || !ch.data) return -1;
    const lx = x - cx * CS, lz = z - cz * CS;
    const i = lx | (lz << 4) | (y << 8);
    const old = ch.data[i];
    if (old === id) return old;
    ch.data[i] = id;
    ch.modified = true;
    this.saveSet.add(ch);
    ch.urgent = true; ch.needMesh = true;
    const lightChanged = C.FILTER[old] !== C.FILTER[id] || C.EMIT[old] !== C.EMIT[id];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const nb = this.chunk(cx + dx, cz + dz);
      if (!nb || !nb.data) continue;
      const touches = (dx === -1 ? lx === 0 : dx === 1 ? lx === CS - 1 : true) && (dz === -1 ? lz === 0 : dz === 1 ? lz === CS - 1 : true);
      if (touches) { nb.urgent = true; nb.needMesh = true; }
      else if (lightChanged) nb.needMesh = true;
    }
    return old;
  };
  // Сохранить изменённые куски (вызывается каждый кадр, запись идёт в фоне)
  World.prototype.saveDirty = function () {
    if (!this.persist || !this.saveSet.size) { this.saveSet.clear(); return; }
    for (const ch of this.saveSet) VX.store.putChunk(this.meta.id, ch.cx, ch.cz, ch.data);
    this.saveSet.clear();
  };

  // ---------- Подгрузка вокруг игрока ----------
  World.prototype.update = function (px, pz, budgetMs) {
    const pcx = Math.floor(px / CS), pcz = Math.floor(pz / CS);
    this.center = [pcx, pcz];
    const R = this.radius, R1 = R + 1, R2 = R + 3;
    const need = [];
    for (let dz = -R1; dz <= R1; dz++) for (let dx = -R1; dx <= R1; dx++) {
      const d2 = dx * dx + dz * dz;
      if (d2 > (R1 + 0.5) * (R1 + 0.5)) continue;
      const cx = pcx + dx, cz = pcz + dz;
      if (!this.chunks.has(keyOf(cx, cz))) need.push([cx, cz, d2]);
    }
    need.sort((a, b) => a[2] - b[2]);
    // новые куски: сначала ищем на диске, иначе генерируем
    const batch = need.slice(0, 24);
    if (batch.length) {
      for (const [cx, cz] of batch) this.chunks.set(keyOf(cx, cz), { cx, cz, data: null, state: 1, needMesh: true, meshes: null, ver: 0 });
      const epoch = this.epoch;
      if (this.persist) {
        VX.store.getChunks(this.meta.id, batch).then((found) => {
          if (epoch !== this.epoch) return;
          for (const [cx, cz] of batch) {
            const ch = this.chunks.get(keyOf(cx, cz));
            if (!ch) continue;
            const d = found.get(cx + ',' + cz);
            if (d) { ch.data = d; ch.state = 2; ch.modified = true; this.stats.loadedFromDisk++; this.touchNeighbours(cx, cz); }
            else ch.state = 3;     // ждёт генерации
          }
        }).catch(() => { for (const [cx, cz] of batch) { const ch = this.chunks.get(keyOf(cx, cz)); if (ch && ch.state === 1) ch.state = 3; } });
      } else for (const [cx, cz] of batch) this.chunks.get(keyOf(cx, cz)).state = 3;
    }
    // выгрузка далёких
    for (const [k, ch] of this.chunks) {
      const dx = ch.cx - pcx, dz = ch.cz - pcz;
      if (dx * dx + dz * dz > R2 * R2) {
        if (this.saveSet.has(ch)) { VX.store.putChunk(this.meta.id, ch.cx, ch.cz, ch.data); this.saveSet.delete(ch); }
        this.dropMesh(ch);
        this.chunks.delete(k);
        if (this.cache === ch) this.cache = null;
      } else if (ch.meshes && dx * dx + dz * dz > (R + 1.5) * (R + 1.5)) {
        this.dropMesh(ch); ch.needMesh = true;
      }
    }
    this.schedule(pcx, pcz, budgetMs);
  };
  World.prototype.touchNeighbours = function (cx, cz) {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const nb = this.chunk(cx + dx, cz + dz);
      if (nb) nb.needMesh = true;
    }
  };
  World.prototype.neighbours = function (ch) {
    const arr = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const nb = this.chunk(ch.cx + dx, ch.cz + dz);
      if (!nb || !nb.data) return null;
      arr.push(nb.data);
    }
    return arr;
  };
  World.prototype.schedule = function (pcx, pcz, budgetMs) {
    const R = this.radius;
    const gens = [], meshes = [];
    for (const ch of this.chunks.values()) {
      const dx = ch.cx - pcx, dz = ch.cz - pcz, d2 = dx * dx + dz * dz;
      if (ch.state === 3) gens.push([ch, d2]);
      else if (ch.state === 2 && ch.needMesh && !ch.pending && d2 <= (R + 0.5) * (R + 0.5)) meshes.push([ch, ch.urgent ? -1 : d2]);
    }
    meshes.sort((a, b) => a[1] - b[1]);
    gens.sort((a, b) => a[1] - b[1]);
    if (this.syncMode) {
      // запасной путь без потоков: работа порциями в пределах бюджета кадра
      const t0 = performance.now();
      const budget = budgetMs || 6;
      for (const [ch] of meshes) {
        if (performance.now() - t0 > budget) break;
        const nb = this.neighbours(ch);
        if (!nb) continue;
        ch.needMesh = false; ch.urgent = false;
        this.applyMesh(ch, C.buildMesh(nb, this.opts));
      }
      for (const [ch] of gens) {
        if (performance.now() - t0 > budget) break;
        ch.data = C.generate(this.seed, ch.cx, ch.cz); ch.state = 2; this.stats.generated++;
        this.touchNeighbours(ch.cx, ch.cz);
      }
      return;
    }
    const free = () => this.pool.filter((w) => !w.dead && w.busy < 2).sort((a, b) => a.busy - b.busy)[0];
    for (const [ch] of meshes) {
      const w = free();
      if (!w) break;
      const nb = this.neighbours(ch);
      if (!nb) continue;
      ch.needMesh = false; ch.urgent = false; ch.pending = true;
      const id = this.jobId++;
      ch.ver++;
      this.jobs.set(id, { type: 'mesh', ch, ver: ch.ver, epoch: this.epoch, w });
      w.busy++;
      w.postMessage({ id, type: 'mesh', chunks: nb, opt: this.opts });
    }
    for (const [ch] of gens) {
      const w = free();
      if (!w) break;
      ch.state = 4;
      const id = this.jobId++;
      this.jobs.set(id, { type: 'gen', ch, epoch: this.epoch, w });
      w.busy++;
      w.postMessage({ id, type: 'gen', seed: this.seed, cx: ch.cx, cz: ch.cz });
    }
  };
  World.prototype.onResult = function (w, m) {
    w.busy = Math.max(0, w.busy - 1);
    const job = this.jobs.get(m.id);
    if (!job) return;
    this.jobs.delete(m.id);
    if (job.epoch !== this.epoch) return;
    const ch = job.ch;
    if (this.chunks.get(keyOf(ch.cx, ch.cz)) !== ch) return;
    if (job.type === 'gen') {
      ch.data = m.data; ch.state = 2; this.stats.generated++;
      this.touchNeighbours(ch.cx, ch.cz);
    } else {
      ch.pending = false;
      if (job.ver !== ch.ver) return;
      this.applyMesh(ch, m.mesh);
    }
  };
  World.prototype.geometry = function (part) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(part.pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(part.uv, 2, true));
    g.setAttribute('light', new THREE.BufferAttribute(part.light, 4, true));
    g.setIndex(new THREE.BufferAttribute(part.index, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(128, 64 * 16, 128), Math.sqrt(128 * 128 * 2 + 1024 * 1024));
    return g;
  };
  World.prototype.applyMesh = function (ch, r) {
    this.dropMesh(ch);
    const out = { opaque: null, trans: null, quads: r.opaque.quads, tquads: r.trans.quads };
    const x = ch.cx * CS, z = ch.cz * CS;
    if (r.opaque.quads) {
      const m = new THREE.Mesh(this.geometry(r.opaque), this.mat.opaque);
      m.scale.setScalar(1 / 16); m.position.set(x, 0, z); m.matrixAutoUpdate = false; m.updateMatrix();
      this.group.add(m); out.opaque = m;
    }
    if (r.trans.quads) {
      const m = new THREE.Mesh(this.geometry(r.trans), this.mat.trans);
      m.scale.setScalar(1 / 16); m.position.set(x, 0, z); m.matrixAutoUpdate = false; m.updateMatrix();
      m.renderOrder = 1;
      this.group.add(m); out.trans = m;
    }
    ch.meshes = out;
    this.stats.meshed++;
  };
  World.prototype.dropMesh = function (ch) {
    if (!ch.meshes) return;
    for (const m of [ch.meshes.opaque, ch.meshes.trans]) if (m) { this.group.remove(m); m.geometry.dispose(); }
    ch.meshes = null;
  };
  // Пересобрать все сетки (сменились настройки графики)
  World.prototype.remeshAll = function () { for (const ch of this.chunks.values()) if (ch.data) ch.needMesh = true; };

  // Готовы ли куски вокруг точки в радиусе r (данные и сетки)
  World.prototype.readyAround = function (x, z, r) {
    const pcx = Math.floor(x / CS), pcz = Math.floor(z / CS);
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const ch = this.chunk(pcx + dx, pcz + dz);
      if (!ch || !ch.data || ch.needMesh || ch.pending) return false;
    }
    return true;
  };
  World.prototype.busy = function () {
    for (const ch of this.chunks.values()) if (ch.pending || ch.state !== 2) return true;
    return this.jobs.size > 0;
  };
  World.prototype.counts = function () {
    let loaded = 0, meshed = 0, quads = 0, draws = 0;
    for (const ch of this.chunks.values()) {
      if (ch.data) loaded++;
      if (ch.meshes) { meshed++; quads += ch.meshes.quads + ch.meshes.tquads; draws += (ch.meshes.opaque ? 1 : 0) + (ch.meshes.trans ? 1 : 0); }
    }
    return { loaded, meshed, quads, draws, jobs: this.jobs.size };
  };

  // Высота первого блока, закрывающего небо, в колонке (для солнца на мобах и появления)
  World.prototype.skyTop = function (x, z) {
    for (let y = CH - 1; y >= 0; y--) { const b = this.getBlock(x, y, z); if (b > 0 && C.FILTER[b] > 0) return y; }
    return -1;
  };

  // ---------- Луч по клеткам ----------
  // Первая клетка, в которую можно целиться (не воздух и не вода), и грань входа
  World.prototype.raycast = function (o, d, maxDist) {
    let x = Math.floor(o.x), y = Math.floor(o.y), z = Math.floor(o.z);
    const sx = Math.sign(d.x), sy = Math.sign(d.y), sz = Math.sign(d.z);
    const tdx = sx ? Math.abs(1 / d.x) : Infinity, tdy = sy ? Math.abs(1 / d.y) : Infinity, tdz = sz ? Math.abs(1 / d.z) : Infinity;
    let tmx = sx ? (sx > 0 ? x + 1 - o.x : o.x - x) * tdx : Infinity;
    let tmy = sy ? (sy > 0 ? y + 1 - o.y : o.y - y) * tdy : Infinity;
    let tmz = sz ? (sz > 0 ? z + 1 - o.z : o.z - z) * tdz : Infinity;
    let n = [0, 0, 0], t = 0;
    for (let guard = 0; guard < 200 && t <= maxDist; guard++) {
      const b = this.getBlock(x, y, z);
      if (b > 0 && b !== C.B.water) return { x, y, z, id: b, n, dist: t, place: { x: x + n[0], y: y + n[1], z: z + n[2] } };
      if (tmx < tmy && tmx < tmz) { x += sx; t = tmx; tmx += tdx; n = [-sx, 0, 0]; }
      else if (tmy < tmz) { y += sy; t = tmy; tmy += tdy; n = [0, -sy, 0]; }
      else { z += sz; t = tmz; tmz += tdz; n = [0, 0, -sz]; }
    }
    return null;
  };

  VX.World = World;
  VX.makeMaterials = makeMaterials;
  VX.chunkKey = keyOf;
})();
