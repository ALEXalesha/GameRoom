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
        const data = Core.generate(m.seed, m.cx, m.cz, m.gen);
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
    uniform float uAmb;
    varying vec2 vUv;
    varying vec3 vCol;
    varying float vDist;
    void main() {
      vUv = uv;
      float sky = light.x * 15.0, blk = light.y * 15.0;
      float skyEff = max(0.0, sky - (1.0 - uDay) * 10.5);
      float l = max(max(skyEff, blk) / 15.0, uAmb);
      // кривая яркости как в оригинале (f / (4 - 3f)), чуть приподнятая: свет факела быстро гаснет с расстоянием
      float b = 0.03 + 0.97 * mix(l / (4.0 - 3.0 * l), l, 0.35);
      float ao = mix(1.0, 0.52 + 0.48 * light.z, uSmooth);
      float warm = clamp((blk - skyEff) / 15.0, 0.0, 1.0);
      vec3 tint = mix(vec3(1.0), vec3(1.25, 0.95, 0.62), warm);
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
      uFogColor: { value: new THREE.Color(0xc0d8ff) }, uFogNear: { value: 60 }, uFogFar: { value: 120 }, uAmb: { value: 0 },
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
    trans.uniforms.uAmb = opaque.uniforms.uAmb;
    return { opaque, trans, uniforms: opaque.uniforms };
  }

  // Кусок с диска: неизвестные id блоков (другая версия, битая запись) становятся камнем
  const KNOWN = new Uint8Array(C.MAXID);
  for (let i = 0; i < C.MAXID; i++) KNOWN[i] = C.isBlock(i) ? 1 : 0;
  function sanitize(d) { for (let i = 0; i < d.length; i++) if (!KNOWN[d[i]]) d[i] = C.B.stone; return d; }

  // ---------- Мир ----------
  function World(scene, materials) {
    this.scene = scene;
    this.mat = materials;
    this.chunks = new Map();
    // ?workers=N - число потоков (0 - всё на странице, запасной путь)
    const wp = new URLSearchParams(location.search).get('workers');
    this.pool = makePool(wp !== null ? Math.max(0, Math.min(8, +wp || 0)) : Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 4) - 1)));
    this.jobs = new Map();
    this.jobId = 1;
    this.pool.forEach((w) => { w.onmessage = (e) => this.onResult(w, e.data); w.onerror = (e) => { if (e && e.preventDefault) e.preventDefault(); this.workerDied(w); }; });
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
    this.fresh = [];
    this.trash = [];
  }
  // Измерения: 'over' (обычный мир), 'nether', 'end'. У каждого свой генератор и свои куски в
  // хранилище (ключи «мир|n|x|z» лежат внутри диапазона мира - удаляются вместе с ним)
  const DIM_KEY = { over: '', nether: '|n', end: '|e' };
  World.prototype.open = function (meta, persist, dim) {
    this.close();
    this.meta = meta;
    this.seed = meta.seedNum;
    this.persist = persist;
    this.setDimFields(dim || 'over');
    this.epoch = (this.epoch || 0) + 1;
  };
  World.prototype.setDimFields = function (dim) {
    this.dim = DIM_KEY[dim] !== undefined ? dim : 'over';
    this.gen = this.dim === 'over' ? (this.meta.gen || '') : this.dim;
    this.storeId = this.meta.id + DIM_KEY[this.dim];
  };
  // Сменить измерение: изменённые куски дописываются, всё выгружается, генерация - своим генератором
  World.prototype.setDim = function (dim) {
    this.saveDirty();
    this.close();
    this.setDimFields(dim);
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
    for (const ch of this.saveSet) VX.store.putChunk(this.storeId, ch.cx, ch.cz, ch.data);
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
        VX.store.getChunks(this.storeId, batch).then((found) => {
          if (epoch !== this.epoch) return;
          for (const [cx, cz] of batch) {
            const ch = this.chunks.get(keyOf(cx, cz));
            if (!ch) continue;
            const d = found.get(cx + ',' + cz);
            if (d) { sanitize(d); ch.data = d; ch.state = 2; ch.modified = true; this.stats.loadedFromDisk++; this.touchNeighbours(cx, cz); }
            else ch.state = 3;     // ждёт генерации
          }
        }).catch(() => { for (const [cx, cz] of batch) { const ch = this.chunks.get(keyOf(cx, cz)); if (ch && ch.state === 1) ch.state = 3; } });
      } else for (const [cx, cz] of batch) this.chunks.get(keyOf(cx, cz)).state = 3;
    }
    // выгрузка далёких
    for (const [k, ch] of this.chunks) {
      const dx = ch.cx - pcx, dz = ch.cz - pcz;
      if (dx * dx + dz * dz > R2 * R2) {
        if (this.saveSet.has(ch)) { VX.store.putChunk(this.storeId, ch.cx, ch.cz, ch.data); this.saveSet.delete(ch); }
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
        ch.data = C.generate(this.seed, ch.cx, ch.cz, this.gen); ch.state = 2; this.stats.generated++;
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
      w.postMessage({ id, type: 'gen', seed: this.seed, gen: this.gen, cx: ch.cx, cz: ch.cz });
    }
  };
  // Поток упал: его задания раздаются заново; если упали все - работа идёт на странице
  World.prototype.workerDied = function (w) {
    w.dead = true;
    for (const [id, job] of this.jobs) {
      if (job.w !== w) continue;
      this.jobs.delete(id);
      const ch = job.ch;
      if (job.type === 'gen') ch.state = 3; else { ch.pending = false; ch.needMesh = true; }
    }
    if (this.pool.every((x) => x.dead)) this.syncMode = true;
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
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(8, 64, 8), Math.sqrt(8 * 8 * 2 + 64 * 64));
    return g;
  };
  World.prototype.applyMesh = function (ch, r) {
    this.dropMesh(ch);
    const out = { opaque: null, trans: null, quads: r.opaque.quads, tquads: r.trans.quads };
    const x = ch.cx * CS, z = ch.cz * CS;
    if (r.opaque.quads) {
      const m = new THREE.Mesh(this.geometry(r.opaque), this.mat.opaque);
      m.position.set(x, 0, z); m.matrixAutoUpdate = false; m.updateMatrix();
      this.group.add(m); out.opaque = m;
    }
    if (r.trans.quads) {
      const m = new THREE.Mesh(this.geometry(r.trans), this.mat.trans);
      m.position.set(x, 0, z); m.matrixAutoUpdate = false; m.updateMatrix();
      m.renderOrder = 1;
      this.group.add(m); out.trans = m;
    }
    ch.meshes = out;
    this.stats.meshed++;
    // новая сетка рисуется один раз вне зависимости от поля зрения: буферы уходят в видеокарту
    // сразу, по мере прихода, а не пачкой в тот кадр, когда герой повернётся к ним
    for (const m of [out.opaque, out.trans]) if (m) { m.frustumCulled = false; this.fresh.push(m); }
  };
  World.prototype.afterRender = function () {
    for (const m of this.fresh) m.frustumCulled = true;
    this.fresh.length = 0;
    this.frameNo = (this.frameNo || 0) + 1;
    if (this.frameNo % 3 === 0 || this.trash.length > 40) this.collect(this.trash.length > 400);
  };
  // Старая сетка убирается со сцены сразу, а буферы видеокарты освобождаются позже и по одному:
  // пачка удалений в одном кадре останавливает ANGLE/Direct3D на десятки миллисекунд (рывки на ходу)
  World.prototype.dropMesh = function (ch) {
    if (!ch.meshes) return;
    for (const m of [ch.meshes.opaque, ch.meshes.trans]) if (m) { this.group.remove(m); this.trash.push([performance.now(), m.geometry]); }
    ch.meshes = null;
  };
  World.prototype.collect = function (all) {
    const now = performance.now();
    let n = 0;
    const batch = this.trash.length > 40 ? 4 : 1;       // очередь большая - освобождаем быстрее
    while (this.trash.length && (all || (n < batch && now - this.trash[0][0] > 1500))) { this.trash.shift()[1].dispose(); n++; }
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
  // Луч до источника воды или лавы (для ведра); твёрдый блок раньше - промах
  // Луч и коробка: расстояние входа и нормаль грани входа (или null)
  function rayBox(o, d, b) {
    const O = [o.x, o.y, o.z], D = [d.x, d.y, d.z];
    let tmin = -Infinity, tmax = Infinity, ax = -1;
    for (let k = 0; k < 3; k++) {
      if (Math.abs(D[k]) < 1e-12) { if (O[k] < b[k] || O[k] > b[k + 3]) return null; continue; }
      let t1 = (b[k] - O[k]) / D[k], t2 = (b[k + 3] - O[k]) / D[k];
      if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
      if (t1 > tmin) { tmin = t1; ax = k; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
    if (tmax < 0) return null;
    const n = [0, 0, 0];
    if (ax >= 0 && tmin >= 0) n[ax] = D[ax] > 0 ? -1 : 1;
    return { t: Math.max(0, tmin), n };
  }
  World.prototype.raycastFluid = function (o, d, maxDist) { return this.raycast(o, d, maxDist, true); };
  World.prototype.raycast = function (o, d, maxDist, fluids) {
    let x = Math.floor(o.x), y = Math.floor(o.y), z = Math.floor(o.z);
    const sx = Math.sign(d.x), sy = Math.sign(d.y), sz = Math.sign(d.z);
    const tdx = sx ? Math.abs(1 / d.x) : Infinity, tdy = sy ? Math.abs(1 / d.y) : Infinity, tdz = sz ? Math.abs(1 / d.z) : Infinity;
    let tmx = sx ? (sx > 0 ? x + 1 - o.x : o.x - x) * tdx : Infinity;
    let tmy = sy ? (sy > 0 ? y + 1 - o.y : o.y - y) * tdy : Infinity;
    let tmz = sz ? (sz > 0 ? z + 1 - o.z : o.z - z) * tdz : Infinity;
    let n = [0, 0, 0], t = 0;
    for (let guard = 0; guard < 200 && t <= maxDist; guard++) {
      const b = this.getBlock(x, y, z);
      if (b > 0 && (fluids ? C.FLUID[b] && (b === C.B.water || b === C.B.lava) : !C.FLUID[b])) {
        // блок не во всю клетку (плита, ступени, забор, дверь): луч проверяется по его коробкам
        if (!fluids && (C.RENDER[b] === 8)) {
          const X = x, Y = y, Z = z;
          const shp = C.shapeOf(b, (dx, dy, dz) => this.getBlock(X + dx, Y + dy, Z + dz), 'outline') || [];
          let best = null;
          for (const q of shp) {
            const r = rayBox(o, d, [x + q[0] / 16, y + q[1] / 16, z + q[2] / 16, x + q[3] / 16, y + q[4] / 16, z + q[5] / 16]);
            if (r && (!best || r.t < best.t)) best = r;
          }
          if (best && best.t <= maxDist) {
            const nn = best.t > t + 1e-7 || !n.some(Boolean) ? best.n : n;
            return { x, y, z, id: b, n: nn, dist: best.t, hit: { x: o.x + d.x * best.t, y: o.y + d.y * best.t, z: o.z + d.z * best.t }, place: { x: x + nn[0], y: y + nn[1], z: z + nn[2] } };
          }
        } else return { x, y, z, id: b, n, dist: t, hit: { x: o.x + d.x * t, y: o.y + d.y * t, z: o.z + d.z * t }, place: { x: x + n[0], y: y + n[1], z: z + n[2] } };
      }
      if (fluids && b > 0 && !C.FLUID[b] && C.SOLID[b]) return null;
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
