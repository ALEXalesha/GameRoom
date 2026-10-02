// Игра: отрисовка, главный цикл, управление, ломание и установка блоков, рамка выбора,
// рука с предметом, открытие и сохранение миров, настройки, крючок window.__voxel для
// проверок (состояние читается без canvas, время двигается шагами).
(function () {
  'use strict';
  const VX = window.VX;
  const C = VX.core, D = VX.data, B = C.B;
  const params = new URLSearchParams(location.search);

  // ---------- Настройки ----------
  const DEFAULT_KEYS = { forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space', sneak: 'ShiftLeft', sprint: 'ControlLeft', inventory: 'KeyE', drop: 'KeyQ' };
  const DEFAULTS = { renderDistance: 8, fov: 70, sensitivity: 100, invertY: false, volume: 70, graphics: 'fancy', clouds: 2, smooth: true, showFps: false, bobbing: true, keys: DEFAULT_KEYS };
  function loadSettings() {
    const s = Object.assign({}, DEFAULTS, VX.store.loadSettings() || {});
    s.keys = Object.assign({}, DEFAULT_KEYS, s.keys || {});
    s.renderDistance = Math.max(2, Math.min(12, s.renderDistance | 0));
    return s;
  }

  const G = VX.game = {
    state: 'boot', mode: 'creative', settings: null, meta: null, ticks: 0, debug: false,
    keys: {}, mouse: { l: false, r: false }, perf: { frames: [], work: [], slow: [], cur: {} }, panorama: true, events: [],
  };

  // ---------- Сцена ----------
  const canvas = document.getElementById('gc');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.autoClear = false;
  renderer.outputEncoding = THREE.LinearEncoding;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 1200);
  camera.rotation.order = 'YXZ';
  const handScene = new THREE.Scene();
  const handCam = new THREE.PerspectiveCamera(70, 1, 0.01, 10);

  const atlas = VX.tex.buildBlockAtlas();
  const atlasTex = new THREE.CanvasTexture(atlas.canvas);
  atlasTex.magFilter = THREE.NearestFilter;
  atlasTex.minFilter = THREE.NearestMipmapLinearFilter;
  atlasTex.generateMipmaps = false;
  atlasTex.mipmaps = atlas.levels;
  atlasTex.needsUpdate = true;
  const itemCanvas = VX.tex.buildItemAtlas(D.ITEMS);
  const itemTex = new THREE.CanvasTexture(itemCanvas);
  itemTex.magFilter = itemTex.minFilter = THREE.NearestFilter;
  const mats = VX.makeMaterials(atlasTex);
  const world = new VX.World(scene, mats);
  const sky = new VX.Sky(scene, 1);
  const player = new VX.Player();
  const inv = new VX.inv.Inventory();
  player.armorSlots = () => inv.armor;
  G.world = world; G.player = player; G.inv = inv; G.scene = scene; G.camera = camera; G.renderer = renderer;
  G.atlas = atlas; G.atlasTex = atlasTex; G.itemCanvas = itemCanvas; G.itemTex = itemTex;

  // значки предметов для интерфейса (изометрические кубики и плоские)
  const iconCache = new Map();
  G.icon = function (id) {
    const inf = D.info(id);
    // компас и часы: картинка своя для каждого положения стрелки
    if (inf && inf.dynamic && VX.items) {
      const v = VX.items.variant(id), key = id + '|' + v;
      let u = iconCache.get(key);
      if (!u) { u = VX.tex.flatIcon(VX.tex.itemTile(inf.dynamic + ':' + v), 0, 0).toDataURL(); iconCache.set(key, u); }
      return u;
    }
    let url = iconCache.get(id);
    if (url) return url;
    if (!inf) id = B.stone;
    let c;
    if (C.isBlock(id)) {
      const b = C.BLOCKS[id];
      const flat = b.render === 'cross' || b.render === 'torch' || id === 130 || id === 131 || b.ladder !== undefined || b.trapdoor || id === C.PANE || b.wire !== undefined || b.repeater;
      if (flat) {
        const t = b.wire !== undefined ? C.T.dust_3 : C.TEXF[id * 6 + 3];
        c = VX.tex.flatIcon(atlas.canvas, (t % C.ATLAS_COLS) * 16, ((t / C.ATLAS_COLS) | 0) * 16);
        if (b.wire !== undefined) {       // пыль - горсткой, а не квадратом
          const g = c.getContext('2d'), im = g.getImageData(0, 0, 64, 64);
          for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const px = (x >> 2) - 7.5, py = (y >> 2) - 8.5; if (px * px / 30 + py * py / 16 > 1) im.data[(y * 64 + x) * 4 + 3] = 0; }
          g.putImageData(im, 0, 0);
        }
      }
      else if (b.render === 'box' && C.SHAPE[id]) c = VX.tex.isoShapeIcon(atlas.canvas, id, C.SHAPE[id]);
      else c = VX.tex.isoIcon(atlas.canvas, id);
    } else {
      const it = D.info(id);
      c = VX.tex.flatIcon(itemCanvas, (it.itile % 16) * 16, ((it.itile / 16) | 0) * 16);
    }
    url = c.toDataURL();
    iconCache.set(id, url);
    return url;
  };

  // свет сцены - только для предметов и существ (блоки освещает свой шейдер)
  const sceneAmb = new THREE.AmbientLight(0xffffff, 0.6); scene.add(sceneAmb);
  const sceneSun = new THREE.DirectionalLight(0xffffff, 0.45); sceneSun.position.set(0.4, 1, 0.3); scene.add(sceneSun);

  // ---------- Рамка выбора и трещины ----------
  const selBox = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)), new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55 }));
  selBox.visible = false;
  scene.add(selBox);
  const crackCanvas = document.createElement('canvas'); crackCanvas.width = 160; crackCanvas.height = 16;
  VX.tex.drawCracks(crackCanvas);
  const crackTex = new THREE.CanvasTexture(crackCanvas);
  crackTex.magFilter = crackTex.minFilter = THREE.NearestFilter;
  crackTex.repeat.set(0.1, 1);
  const crack = new THREE.Mesh(new THREE.BoxGeometry(1.006, 1.006, 1.006), new THREE.MeshBasicMaterial({ map: crackTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  crack.visible = false;
  scene.add(crack);

  // ---------- Рука ----------
  const hand = new THREE.Group();
  handScene.add(hand);
  handScene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const handLight = new THREE.DirectionalLight(0xffffff, 0.6); handLight.position.set(-1, 2, 1); handScene.add(handLight);
  const handCache = new Map();
  function cubeGeometry(id, size) {
    const g = new THREE.BoxGeometry(size, size, size);
    // грани BoxGeometry: +X, -X, +Y, -Y, +Z, -Z -> наши 1, 0, 3, 2, 5, 4
    const map = [1, 0, 3, 2, 5, 4];
    const uv = g.attributes.uv;
    for (let f = 0; f < 6; f++) {
      const t = C.TEXF[id * 6 + map[f]];
      const col = t % C.ATLAS_COLS, row = (t / C.ATLAS_COLS) | 0;
      for (let k = 0; k < 4; k++) {
        const i = f * 4 + k;
        uv.setXY(i, (col + uv.getX(i)) / C.ATLAS_COLS, 1 - (row + 1 - uv.getY(i)) / C.ATLAS_ROWS);
      }
    }
    return g;
  }
  G.cubeGeometry = cubeGeometry;
  // Предмет-блок не во всю клетку: геометрия из его коробок с теми же развёртками, что у сетки мира
  function shapeGeometry(id, size, shp) {
    const pos = [], uv = [], nor = [], idx = [];
    for (const bx of shp) {
      const lo = [bx[0], bx[1], bx[2]], hi = [bx[3], bx[4], bx[5]];
      for (let f = 0; f < 6; f++) {
        const F = C.FACES[f], t = bx[6] ? C.T[bx[6]] : C.TEXF[id * 6 + f];
        const col = t % C.ATLAS_COLS, row = (t / C.ATLAS_COLS) | 0;
        const a1 = F.e1[0] ? 0 : F.e1[1] ? 1 : 2, s1 = F.e1[a1], a2 = F.e2[0] ? 0 : F.e2[1] ? 1 : 2, s2 = F.e2[a2];
        const base = pos.length / 3;
        for (let q = 0; q < 4; q++) {
          const V = C.VERT[f][q];
          const cc = [V.p[0] ? hi[0] : lo[0], V.p[1] ? hi[1] : lo[1], V.p[2] ? hi[2] : lo[2]];
          pos.push((cc[0] / 16 - 0.5) * size, (cc[1] / 16 - 0.5) * size, (cc[2] / 16 - 0.5) * size);
          const u = s1 > 0 ? cc[a1] / 16 : 1 - cc[a1] / 16, v = s2 > 0 ? cc[a2] / 16 : 1 - cc[a2] / 16;
          uv.push((col + u) / C.ATLAS_COLS, 1 - (row + 1 - v) / C.ATLAS_ROWS);
          nor.push(F.n[0], F.n[1], F.n[2]);
        }
        idx.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setIndex(idx);
    return g;
  }
  G.shapeGeometry = shapeGeometry;
  const cubeMat = new THREE.MeshLambertMaterial({ map: atlasTex, alphaTest: 0.5 });
  const spriteMats = new Map();
  function spriteMaterial(id) {
    let m = spriteMats.get(id);
    if (m) return m;
    let tex, col, row;
    if (C.isBlock(id)) { const bb = C.BLOCKS[id], t = bb.wire !== undefined ? C.T.dust_3 : C.TEXF[id * 6 + (bb.repeater ? 3 : 0)]; tex = atlasTex.clone(); col = t % C.ATLAS_COLS; row = (t / C.ATLAS_COLS) | 0; tex.repeat.set(1 / C.ATLAS_COLS, 1 / C.ATLAS_ROWS); tex.offset.set(col / C.ATLAS_COLS, 1 - (row + 1) / C.ATLAS_ROWS); }
    else { const it = D.info(id); tex = itemTex.clone(); col = it.itile % 16; row = (it.itile / 16) | 0; const rows = itemCanvas.height / 16; tex.repeat.set(1 / 16, 1 / rows); tex.offset.set(col / 16, 1 - (row + 1) / rows); }
    tex.needsUpdate = true;
    tex.magFilter = tex.minFilter = THREE.NearestFilter;
    m = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide });
    spriteMats.set(id, m);
    return m;
  }
  G.spriteMaterial = spriteMaterial;
  G.cubeMat = cubeMat;
  // Меш предмета: кубик для блоков, плоская картинка для остального
  // Геометрия предмета одна на id и размер: выпавшие предметы и рука её только переиспользуют
  // (раньше каждый выпавший предмет создавал свою, и память видеокарты росла)
  const itemGeo = new Map();
  G.itemMesh = function (id, size) {
    const b = C.isBlock(id) ? C.BLOCKS[id] : null;
    const cube = b && (b.render === 'cube' || b.render === 'leaves' || b.render === 'glass' || b.render === 'ice' || b.render === 'box');
    const k = id + '|' + size;
    let g = itemGeo.get(k);
    const flatBlock = b && (b.ladder !== undefined || b.trapdoor || id === C.PANE || b.wire !== undefined || b.repeater);
    if (!g) { g = flatBlock ? new THREE.PlaneGeometry(size * 1.6, size * 1.6) : b && b.render === 'box' && C.SHAPE[id] ? shapeGeometry(id, size, C.SHAPE[id]) : cube ? cubeGeometry(id, size) : new THREE.PlaneGeometry(size * 1.6, size * 1.6); itemGeo.set(k, g); }
    const m = new THREE.Mesh(g, cube && !flatBlock ? cubeMat : spriteMaterial(id));
    m.userData.sharedGeo = true; m.userData.sharedMat = true;
    return m;
  };
  let handId = -1;
  function setHand(id) {
    if (id === handId) return;
    handId = id;
    hand.clear();
    let m = handCache.get(id);
    if (!m) {
      if (!id) {
        m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.6), new THREE.MeshLambertMaterial({ color: 0xc89a78 }));
        m.position.set(0.14, -0.08, 0.12); m.rotation.set(0.25, -0.2, 0.1);
      } else {
        m = G.itemMesh(id, 0.22);
        if (m.geometry.type === 'PlaneGeometry') { m.rotation.set(0, -1.2, 0.35); m.position.set(0, 0.1, 0); }
        else m.rotation.set(0.1, 0.8, 0);
      }
      const wrap = new THREE.Group(); wrap.add(m); m = wrap;
      handCache.set(id, m);
    }
    hand.add(m);
  }
  G.swing = 0;

  // ---------- Настройки: применить ----------
  function applySettings() {
    const s = G.settings;
    world.radius = G.panorama ? Math.min(5, s.renderDistance) : s.renderDistance;   // панорама меню - ближе
    const fancy = s.graphics === 'fancy';
    if (world.opts.fancy !== fancy || world.opts.smooth !== !!s.smooth) { world.opts = { fancy, smooth: !!s.smooth }; world.remeshAll(); }
    mats.uniforms.uSmooth.value = s.smooth ? 1 : 0;
    if (sky.cloudMode !== s.clouds) sky.setClouds(s.clouds);
    VX.audio.setVolume(s.volume / 100);
  }
  G.saveSettings = function () { VX.store.saveSettings(G.settings); applySettings(); };
  G.applySettings = applySettings;

  // ---------- Миры ----------
  function newId() { return 'w' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36); }
  G.createWorld = async function (o) {
    const seedStr = String(o.seed == null ? '' : o.seed).trim();
    const seedNum = C.seedFrom(seedStr);
    const sp = C.findSpawn(seedNum, o.gen);
    const meta = {
      id: newId(), name: (o.name || '').trim() || 'Новый мир', seed: seedStr || String(seedNum), seedNum, mode: o.mode === 'survival' ? 'survival' : 'creative',
      created: Date.now(), lastPlayed: Date.now(), ticks: 1000, spawn: { x: sp.x + 0.5, y: sp.h + 1, z: sp.z + 0.5 },
      player: null, inv: null, furnaces: {}, chests: {}, crops: {}, bed: null, gen: o.gen || '', ach: { got: {}, progress: {} }, stats: { broken: 0, placed: 0, kills: 0, deaths: 0, played: 0 }, version: 2,
    };
    await VX.store.putWorld(meta);
    return meta;
  };
  G.openWorld = async function (id) {
    const meta = await VX.store.getWorld(id);
    if (!meta) throw new Error('мир не найден');
    await startWorld(meta, true);
    return meta;
  };
  const CREATIVE_START = [B.grass, B.dirt, B.stone, B.cobblestone, B.oak_planks, B.oak_log, B.glass, B.bricks, B.torch];
  // Данные измерения (сундуки, печи, посевы, существа, огонь): у обычного мира - в самом мире
  // (как раньше), у Нижнего мира и Края - в meta.dimData
  function dimSlot(meta, dim) {
    if (!dim || dim === 'over') return meta;
    meta.dimData = meta.dimData || {};
    const s = meta.dimData[dim] || (meta.dimData[dim] = {});
    s.furnaces = s.furnaces || {}; s.chests = s.chests || {}; s.crops = s.crops || {};
    return s;
  }
  G.dimSlot = () => dimSlot(G.meta, G.dim);
  async function startWorld(meta, persist) {
    sanitizeMeta(meta);
    G.meta = meta;
    G.mode = meta.mode;
    G.ticks = meta.ticks || 0;
    G.panorama = !persist;
    G.dim = persist && meta.dim ? meta.dim : 'over';
    world.open(meta, persist, G.dim);
    const slot = dimSlot(meta, G.dim);
    applySettings();
    sky.cloudMap = sky.makeCloudMap(meta.seedNum);
    sky.setClouds(G.settings.clouds);
    // быстрый снимок новее записи в базе - берём его (окно закрыли, пока база писала)
    try {
      const q = JSON.parse(localStorage.getItem('cw2_quick_' + meta.id) || 'null');
      if (q && persist && q.t > (meta.lastPlayed || 0) + 500) { meta.player = q.player; meta.inv = q.inv; meta.ticks = q.ticks; }
    } catch (e) { /* битый снимок - игнорируем */ }
    if (meta.inv) sanitizeInv(meta.inv);
    if (meta.player) player.load(meta.player);
    else { player.reset(); player.pos.set(meta.spawn.x, meta.spawn.y, meta.spawn.z); player.yaw = 0; player.pitch = 0; }
    if (meta.inv) inv.load(meta.inv);
    else { inv.clear(); if (meta.mode === 'creative') CREATIVE_START.forEach((id, i) => { inv.slots[i] = VX.inv.newStack(id, 64); }); }
    if (VX.entities) VX.entities.reset(slot);
    if (VX.vehicles) VX.vehicles.reset(slot);
    if (VX.fishing) VX.fishing.reset();
    G.mining = null;
    G.furnaces = slot.furnaces || (slot.furnaces = {});
    G.chests = slot.chests || (slot.chests = {});
    G.crops = slot.crops || (slot.crops = {});
    G.sleeping = null; G.bowT = 0; G.afterLoad = null; G.portalT = 0;
    if (VX.fluids) VX.fluids.reset(slot);
    if (VX.redstone) VX.redstone.reset();
    if (VX.items) VX.items.reset();
    if (VX.xp) VX.xp.clear();
    if (VX.villages) VX.villages.reset();
    if (VX.brewing) VX.brewing.reset();
    if (VX.endgame) VX.endgame.reset();
    if (VX.ui && VX.ui.loadingTitle) VX.ui.loadingTitle(G.dim);
    G.state = persist ? 'loading' : 'menu';
    G.loadT = 0;
    G.saveT = 0;
    if (persist && VX.ui) VX.ui.show('loading');
  }
  G.startWorld = startWorld;
  // Неизвестные id (мир из другой версии, битая запись) не должны ронять интерфейс: такие вещи убираются
  const known = (s) => s && typeof s.id === 'number' && !!D.info(s.id) && s.count > 0;
  function sanitizeInv(o) {
    if (o.slots) o.slots = o.slots.map((s) => (known(s) ? s : null));
    if (o.armor) o.armor = o.armor.map((s) => (known(s) && D.armorOf(s.id) ? s : null));
  }
  function sanitizeMeta(meta) {
    for (const k in meta.chests || {}) meta.chests[k] = (meta.chests[k] || []).map((s) => (known(s) ? s : null));
    for (const k in meta.furnaces || {}) { const f = meta.furnaces[k]; f.slots = (f.slots || [null, null, null]).map((s) => (known(s) ? s : null)); }
    if (meta.entities) meta.entities.items = (meta.entities.items || []).filter((it) => known(it.s));
  }
  G.sanitizeMeta = sanitizeMeta;
  G.saveWorld = async function () {
    if (!G.meta || G.panorama) return;
    world.saveDirty();
    G.meta.ticks = Math.round(G.ticks);
    G.meta.player = player.toJSON();
    G.meta.inv = inv.toJSON();
    G.meta.lastPlayed = Date.now();
    G.meta.dim = G.dim;
    if (VX.items) VX.items.saveMaps();
    const slot = dimSlot(G.meta, G.dim);
    if (VX.entities) VX.entities.save(slot);
    if (VX.vehicles) VX.vehicles.save(slot);
    if (VX.fluids) VX.fluids.save(slot);
    G.saveQuick();
    try { await VX.store.putWorld(G.meta); G.saveFailed = false; } catch (e) { saveFailed(e); }
  };
  // Запись не удалась (нет места, хранилище закрыто): игра продолжается, игрок видит сообщение
  function saveFailed() {
    if (!G.saveFailed && VX.ui && VX.ui.toast) VX.ui.toast({ name: 'Мало места в хранилище браузера', icon: B.chest, error: true });
    G.saveFailed = true;
    G.say('Не удалось сохранить: мало места');
  }
  VX.onStorageFull = saveFailed;
  VX.onStorageError = saveFailed;
  // Быстрый снимок положения и инвентаря в localStorage (синхронно): переживает закрытие окна,
  // когда запись в IndexedDB не успевает (Electron закрывается без вопроса)
  G.saveQuick = function () {
    if (!G.meta || G.panorama) return;
    try { localStorage.setItem('cw2_quick_' + G.meta.id, JSON.stringify({ t: Date.now(), player: player.toJSON(), inv: inv.toJSON(), ticks: Math.round(G.ticks) })); } catch (e) { /* нет места - не страшно */ }
  };
  // Переход в другое измерение: куски и существа прежнего сохраняются, новое грузится вокруг pos;
  // after() - когда куски вокруг готовы (найти или построить портал)
  G.changeDim = function (dim, pos, after) {
    if (!G.meta || G.panorama) return false;
    const slot0 = dimSlot(G.meta, G.dim);
    if (VX.entities) VX.entities.save(slot0);
    if (VX.vehicles) { VX.vehicles.dismount(); VX.vehicles.save(slot0); }
    if (VX.fluids) VX.fluids.save(slot0);
    if (G.container) closeContainer();
    world.setDim(dim);
    G.dim = dim; G.meta.dim = dim;
    const slot = dimSlot(G.meta, dim);
    G.furnaces = slot.furnaces; G.chests = slot.chests; G.crops = slot.crops;
    if (VX.entities) VX.entities.reset(slot);
    if (VX.vehicles) VX.vehicles.reset(slot);
    if (VX.fishing) VX.fishing.reset();
    if (VX.fluids) VX.fluids.reset(slot);
    if (VX.redstone) VX.redstone.reset();
    if (VX.xp) VX.xp.clear();
    if (VX.endgame) VX.endgame.reset();
    G.mining = null; G.sleeping = null; G.portalT = 0; G.portalWait = true;
    player.pos.set(pos.x, pos.y, pos.z); player.vel.set(0, 0, 0); player.fallTop = null;
    G.afterLoad = after || null;
    G.state = 'loading'; G.loadT = 0;
    releaseKeys();
    if (VX.ui) { if (VX.ui.loadingTitle) VX.ui.loadingTitle(dim); VX.ui.show('loading'); }
    G.emit('dimension', { dim });
    G.saveWorld();
    return true;
  };
  G.exitToTitle = async function () {
    if (G.meta && !G.panorama) {
      closeContainer();
      await G.saveWorld();
      try { await VX.store.flush(); } catch (e) { saveFailed(e); }
    }
    unlock();
    await openPanorama();
    if (VX.ui) VX.ui.show('title');
  };
  async function openPanorama() {
    const seedNum = 2025;
    const sp = C.findSpawn(seedNum);
    const meta = { id: 'panorama', name: 'panorama', seedNum, mode: 'creative', ticks: 3000, spawn: { x: sp.x + 0.5, y: sp.h + 14, z: sp.z + 0.5 }, furnaces: {}, ach: { got: {}, progress: {} } };
    await startWorld(meta, false);
    G.state = 'menu';
  }
  G.openPanorama = openPanorama;

  // ---------- Захват мыши ----------
  let expectUnlock = false;
  function lock() {
    if (!canvas.requestPointerLock || document.pointerLockElement === canvas) return;
    try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => { G.needClick = true; }); } catch (e) { G.needClick = true; }
  }
  function unlock() { if (document.pointerLockElement) { expectUnlock = true; document.exitPointerLock(); } }
  G.lock = lock; G.unlock = unlock;
  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === canvas;
    G.locked = locked;
    if (locked) {
      // захват пришёл с опозданием, а игра уже в меню (пауза, победа, окно) - отпускаем мышь сразу
      if (G.state !== 'play') { expectUnlock = true; document.exitPointerLock(); return; }
      G.needClick = false; return;
    }
    if (expectUnlock) { expectUnlock = false; return; }
    if (G.state === 'play') G.pause();
  });
  document.addEventListener('pointerlockerror', () => { G.needClick = true; });

  // ---------- Состояния ----------
  G.play = function () {
    if (!G.meta || G.panorama) return;
    // сохранились мёртвым (перезагрузка на экране смерти) - снова экран смерти, а не герой с нулём здоровья
    if (player.health <= 0 || player.dead) {
      player.dead = true; G.state = 'dead'; releaseKeys(); unlock();
      if (VX.ui) VX.ui.show('death');
      return;
    }
    G.state = 'play';
    releaseKeys();
    if (G.victoryPending && G.showVictory && G.showVictory()) return;
    if (VX.ui) VX.ui.show('hud');
    lock();
    G.needClick = document.pointerLockElement !== canvas;
    G.hintT = 2.5;       // если мышь не захвачена - маленькая подсказка у прицела на пару секунд
  };
  G.pause = function (screen) {
    if (G.state !== 'play' && G.state !== 'inv') return;
    if (G.state === 'inv') closeContainer();
    G.state = 'paused';
    releaseKeys();
    unlock();
    if (VX.ui) VX.ui.show(screen || 'pause');
    G.saveWorld();
  };
  function releaseKeys() { for (const k in G.keys) G.keys[k] = false; G.mouse.l = G.mouse.r = false; G.mining = null; }
  G.releaseKeys = releaseKeys;

  // Вкладка скрыта - пауза, звук выключен, мышь отпущена; вернулся - пауза остаётся
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (G.state === 'play' || G.state === 'inv') G.pause();
      VX.audio.mute(true);
      G.saveWorld();
    } else VX.audio.mute(false);
  });
  // Оболочки ОС (симуляторы Windows и macOS) держат игру в iframe и шлют {mix:'pause'|'resume'}:
  // pause - как скрытая вкладка (пауза, звук заглушен, клавиши и мышь отпущены), resume - пауза остаётся
  window.addEventListener('message', (e) => {
    const cmd = e.data && typeof e.data === 'object' ? e.data.mix : null;
    if (cmd === 'pause') {
      if (G.state === 'play' || G.state === 'inv') G.pause();
      releaseKeys(); unlock();
      VX.audio.mute(true);
      G.saveWorld();
    } else if (cmd === 'resume') VX.audio.mute(false);
  });
  window.addEventListener('pagehide', () => { G.saveWorld(); });
  window.addEventListener('blur', () => releaseKeys());
  // Ctrl+W в браузере закрывает вкладку: пока идёт игра, браузер переспросит (в Electron - нет)
  if (!/Electron/i.test(navigator.userAgent)) {
    window.addEventListener('beforeunload', (e) => {
      if (G.state === 'play' && G.meta && !G.panorama) { G.saveWorld(); e.preventDefault(); e.returnValue = ''; }
    });
  }

  // ---------- Контейнеры (инвентарь, верстак, печь) ----------
  G.container = null;
  G.openContainer = function (kind, pos) {
    if (G.state !== 'play') return;
    let view;
    if (kind === 'furnace') {
      const k = pos.x + ',' + pos.y + ',' + pos.z;
      if (!G.furnaces[k]) G.furnaces[k] = VX.inv.newFurnace();
      view = new VX.inv.FurnaceView(inv, G.furnaces[k]);
      view.pos = pos;
    } else if (kind === 'brew') {
      view = new VX.brewing.BrewView(inv, VX.brewing.standAt(pos), pos);
    } else if (kind === 'enchant') {
      view = new VX.enchant.EnchantView(inv, pos);
    } else if (kind === 'anvil') {
      view = new VX.enchant.AnvilView(inv, pos);
    } else if (kind === 'trade') {
      view = new VX.inv.PlayerView(inv, 2);
      view.mob = pos;
    } else if (kind === 'chest') {
      view = new VX.inv.ChestView(inv, G.chestGroup(pos.x, pos.y, pos.z));
      view.pos = pos;
      VX.audio.play('door_open', { surface: 'wood' });
    } else {
      view = new VX.inv.PlayerView(inv, kind === 'table' ? 3 : 2);
      view.onCraft = (r) => { G.emit('craft', { id: r.outId }); VX.audio.play('click'); };
      view.onEquip = (s) => { G.emit('equip', { id: s.id }); VX.audio.play('place', { surface: 'stone' }); };
    }
    view.kind = kind;
    G.container = view;
    G.state = 'inv';
    releaseKeys();
    unlock();
    if (VX.ui) VX.ui.show('inv');
  };
  function closeContainer() {
    const v = G.container;
    if (!v) return;
    const spill = v.close();
    for (const s of spill) G.dropItem(s, true);
    G.container = null;
  }
  G.closeContainer = function () {
    closeContainer();
    if (G.state === 'inv') { G.play(); }
  };

  // ---------- События для достижений и звуков ----------
  G.emit = function (ev, data) {
    G.events.push([ev, data]);
    if (G.events.length > 200) G.events.shift();
    if (VX.ach) VX.ach.on(ev, data || {});
  };

  // ---------- Действия ----------
  function eyePos() { return new THREE.Vector3(player.pos.x, player.eye(), player.pos.z); }
  G.target = function () { return world.raycast(eyePos(), player.forward(), 5); };
  function surfaceOf(id) { const b = C.BLOCKS[id]; return b ? b.sound : 'stone'; }
  // Можно ли поставить блок в клетку: не в себя, не в моба
  function blockedByBodies(x, y, z) {
    const b = [x, y, z, x + 1, y + 1, z + 1];
    const p = player.box();
    const hit = (a) => a[0] < b[3] && a[3] > b[0] && a[1] < b[4] && a[4] > b[1] && a[2] < b[5] && a[5] > b[2];
    if (hit(p)) return true;
    if (VX.entities && VX.entities.bodies().some(hit)) return true;
    return false;
  }
  G.blockedByBodies = blockedByBodies;

  // Вторая половина двери или кровати (или null)
  function partnerOf(x, y, z, id) {
    const b = C.BLOCKS[id];
    if (b.piston || b.pistonHead) return VX.redstone ? VX.redstone.partner(x, y, z, id) : null;
    if (b.door) { const dy = b.upper ? -1 : 1; const o = world.getBlock(x, y + dy, z); return o > 0 && C.BLOCKS[o].door ? { x, y: y + dy, z, id: o } : null; }
    if (b.bed) {
      const v = DIRV[b.bedDir], s = b.bedHead ? -1 : 1;
      const X = x + v[0] * s, Z = z + v[1] * s, o = world.getBlock(X, y, Z);
      return o > 0 && C.BLOCKS[o].bed ? { x: X, y, z: Z, id: o } : null;
    }
    return null;
  }
  const DIRV = [[0, -1], [-1, 0], [0, 1], [1, 0]];   // стороны: 0 -Z, 1 -X, 2 +Z, 3 +X
  G.DIRV = DIRV;
  const yawDir = () => ((Math.round(player.yaw / (Math.PI / 2)) % 4) + 4) % 4;

  // Сломать блок в клетке (уже решено, что можно): выпадение, соседи без опоры, вода и лава
  function breakAt(x, y, z, byPlayer) {
    const id = world.getBlock(x, y, z);
    if (id <= 0) return false;
    const pair = partnerOf(x, y, z, id);
    world.setBlock(x, y, z, 0);
    if (pair) world.setBlock(pair.x, pair.y, pair.z, 0);       // дверь и кровать ломаются целиком
    VX.audio.play('break', { surface: surfaceOf(id) });
    if (VX.entities) VX.entities.burst(x, y, z, id);
    if (byPlayer && G.mode === 'survival') {
      const held = inv.held();
      let drops = D.dropsOf(id, held ? held.id : 0, Math.random);
      if (!drops.length && pair) drops = D.dropsOf(pair.id, held ? held.id : 0, Math.random);   // верх двери, изголовье
      for (const [did, n] of drops) G.dropItem(VX.inv.newStack(did, n), false, x + 0.5, y + 0.3, z + 0.5);
      if (VX.xp && drops.length) { const xp = VX.xp.forBlock(id); if (xp) VX.xp.spawn(x + 0.5, y + 0.5, z + 0.5, xp); }
      if (D.toolOf(held && held.id)) { if (inv.wearHeld()) VX.audio.play('break', { surface: 'wood' }); }
      player.exhaust(0.005);
    }
    const fk = x + ',' + y + ',' + z;
    if (G.furnaces[fk]) {
      for (const s of G.furnaces[fk].slots) if (s && G.mode === 'survival') G.dropItem(s, false, x + 0.5, y + 0.5, z + 0.5);
      delete G.furnaces[fk];
    }
    if (G.chests[fk]) {
      for (const s of G.chests[fk]) if (s) G.dropItem(s, false, x + 0.5, y + 0.5, z + 0.5);
      delete G.chests[fk];
    }
    delete G.crops[fk];
    if (G.meta.bed && G.meta.bed.x === x && G.meta.bed.z === z && G.meta.bed.y === y) G.meta.bed = pair ? { x: pair.x, y: pair.y, z: pair.z, gone: true } : null;
    G.meta.stats && G.meta.stats.broken++;
    afterChange(x, y, z);
    if (pair) afterChange(pair.x, pair.y, pair.z);
    return true;
  }
  G.breakAt = breakAt;
  // Что держится на этом месте: растения, посевы, факел и рычаг сверху, факелы на стенах, кактус;
  // песок и гравий падают; вода и лава вокруг просыпаются
  function afterChange(x, y, z) {
    const here = world.getBlock(x, y, z);
    const up = world.getBlock(x, y + 1, z);
    const needsFloor = (id) => id > 0 && (C.RENDER[id] === 6 || C.RENDER[id] === 9 || id === B.torch || id === 130 || id === 131 || C.BLOCKS[id].wire !== undefined || C.BLOCKS[id].rail !== undefined || C.BLOCKS[id].repeater || C.BLOCKS[id].plate || (C.BLOCKS[id].rsTorch !== undefined && C.BLOCKS[id].wall === undefined) || (C.BLOCKS[id].button && C.BLOCKS[id].face === 4));
    if (needsFloor(up) && !C.SOLID[here]) popBlock(x, y + 1, z);
    if (((up >= 64 && up <= 71) || (up >= C.CARROTS && up <= C.CARROTS + 3)) && here !== B.farmland) popBlock(x, y + 1, z);      // посевы - только на грядке
    if (up === B.cactus && here !== B.sand && here !== B.cactus) popBlock(x, y + 1, z);
    if (up >= C.NETHER_WART && up <= C.NETHER_WART + 3 && here !== C.SOUL_SAND) popBlock(x, y + 1, z);
    if (VX.nether) VX.nether.after(x, y, z);
    if (VX.endgame) VX.endgame.after(x, y, z);
    if (VX.redstone) VX.redstone.after(x, y, z);
    if (VX.items) VX.items.after(x, y, z);
    const walls = [[0, 0, -1, 2], [1, 0, 0, 3], [0, 0, 1, 0], [-1, 0, 0, 1]];
    for (const [dx, , dz, r] of walls) {
      const id = world.getBlock(x + dx, y, z + dz);
      if (id === C.WALL_TORCH + r && !C.SOLID[here]) popBlock(x + dx, y, z + dz);
      // кактус не терпит соседей сбоку (правило оригинала)
      if (id === B.cactus && here > 0 && C.SOLID[here]) popBlock(x + dx, y, z + dz);
    }
    if (up === B.sand || up === B.gravel) fallBlocks(x, y + 1, z);
    if (VX.build) VX.build.after(x, y, z, here);
    if (VX.fluids) VX.fluids.touch(x, y, z);
  }
  G.afterChange = afterChange;
  function popBlock(x, y, z) {
    const id = world.getBlock(x, y, z);
    world.setBlock(x, y, z, 0);
    G.popDrops(id, x, y, z);
    delete G.crops[x + ',' + y + ',' + z];
    afterChange(x, y, z);
  }
  // Блок снесён не игроком (вода смыла, опору убрали): в выживании выпадает как от руки
  G.popDrops = function (id, x, y, z) {
    if (G.mode === 'survival') for (const [did, n] of D.dropsOf(id, 0, Math.random)) G.dropItem(VX.inv.newStack(did, n), false, x + 0.5, y + 0.3, z + 0.5);
  };
  function fallBlocks(x, y, z) {
    // столбик песка/гравия падает до опоры
    let yy = y;
    while (true) {
      const id = world.getBlock(x, yy, z);
      if (id !== B.sand && id !== B.gravel) break;
      let to = yy;
      while (to > 0) { const below = world.getBlock(x, to - 1, z); if (below === 0 || C.FLUID[below] || C.RENDER[below] === 6) to--; else break; }
      if (to !== yy) { world.setBlock(x, yy, z, 0); world.setBlock(x, to, z, id); }
      yy++;
    }
  }

  // ЛКМ в творческом: сломать сразу. Возвращает клетку или null.
  G.breakTarget = function () {
    const t = G.target();
    if (!t) return null;
    const b = C.BLOCKS[t.id];
    if (b.hardness < 0 && G.mode !== 'creative') return null;
    if (t.id === B.bedrock && G.mode !== 'creative') return null;
    if (t.y <= 0) return null;                   // дно мира не ломается даже в творческом
    breakAt(t.x, t.y, t.z, true);
    G.swing = 1;
    return { x: t.x, y: t.y, z: t.z };
  };

  // ---------- Двери и рычаг ----------
  function setDoorOpen(x, y, z, open, sound) {
    let id = world.getBlock(x, y, z);
    if (!(id > 0 && C.BLOCKS[id].door)) return false;
    if (C.BLOCKS[id].upper) { y--; id = world.getBlock(x, y, z); if (!(id > 0 && C.BLOCKS[id].door)) return false; }
    const b = C.BLOCKS[id];
    if (b.open === open) return false;
    const base = b.door === 'wood' ? C.DOOR_WOOD : C.DOOR_IRON;
    const lo = base + b.edge * 4 + (open ? 2 : 0);
    world.setBlock(x, y, z, lo);
    if (world.getBlock(x, y + 1, z) > 0 && C.BLOCKS[world.getBlock(x, y + 1, z)].door) world.setBlock(x, y + 1, z, lo + 1);
    if (sound !== false) VX.audio.play(open ? 'door_open' : 'door_close', { surface: b.door === 'wood' ? 'wood' : 'stone' });
    return true;
  }
  G.setDoorOpen = setDoorOpen;
  G.doorOpen = (x, y, z) => { const id = world.getBlock(x, y, z); return id > 0 && C.BLOCKS[id].door ? C.BLOCKS[id].open : null; };
  function toggleLever(x, y, z) {
    const id = world.getBlock(x, y, z);
    const on = id === 130;
    world.setBlock(x, y, z, on ? 131 : 130);
    VX.audio.play('click');
    // рычаг - источник сигнала: двери, лампы, поршни рядом и по пыли (redstone.js)
    if (VX.redstone) VX.redstone.update(x, y, z);
    return on;
  }
  G.toggleLever = toggleLever;

  // ---------- Сундуки ----------
  G.chests = {};
  const chestAt = (x, y, z) => { const id = world.getBlock(x, y, z); return id >= B.chest && id <= B.chest + 3; };
  function chestNeighbours(x, y, z) { return [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dz]) => chestAt(x + dx, y, z + dz)).map(([dx, dz]) => [x + dx, y, z + dz]); }
  function chestSlots(x, y, z) {
    const k = x + ',' + y + ',' + z;
    if (!G.chests[k]) G.chests[k] = new Array(27).fill(null);
    return G.chests[k];
  }
  G.chestSlots = chestSlots;
  // Двойной сундук: два рядом стоящих - одно окно на 54 ячейки (сначала тот, что западнее или севернее)
  G.chestGroup = function (x, y, z) {
    const nb = chestNeighbours(x, y, z)[0];
    const list = nb ? [[x, y, z], nb].sort((a, b) => a[0] - b[0] || a[2] - b[2]) : [[x, y, z]];
    return list.map(([a, b, c]) => chestSlots(a, b, c));
  };

  // ---------- Сон и кровать ----------
  const isNight = () => { const t = ((G.ticks % 24000) + 24000) % 24000; return t >= 12541 && t <= 23458; };
  G.isNight = isNight;
  G.say = function (text) { G.actionText = text; G.actionT = 3; };
  G.useBed = function (x, y, z) {
    const id = world.getBlock(x, y, z);
    const b = C.BLOCKS[id];
    // в Нижнем мире и в Краю кровать взрывается (как в оригинале)
    if (G.dim !== 'over') {
      const pair = partnerOf(x, y, z, id);
      world.setBlock(x, y, z, 0); if (pair) world.setBlock(pair.x, pair.y, pair.z, 0);
      if (VX.explode) VX.explode(x + 0.5, y + 0.5, z + 0.5, 5, { fire: true, ev: playerEvent });
      return 'explode';
    }
    // точка возрождения - у кровати
    const head = b.bedHead ? { x, y, z } : (partnerOf(x, y, z, id) || { x, y, z });
    G.meta.bed = { x: head.x, y: head.y, z: head.z };
    if (!isNight()) { G.say('Спать можно только ночью. Точка возрождения - у кровати'); return 'day'; }
    if (VX.entities && VX.entities.mobs.some((m) => m.def.hostile && m.deadT === 0 && Math.abs(m.x - x) < 8 && Math.abs(m.z - z) < 8 && Math.abs(m.y - y) < 5)) { G.say('Нельзя спать: рядом монстры'); return 'monsters'; }
    G.sleeping = { t: 0, x: head.x, y: head.y, z: head.z };
    player.vel.set(0, 0, 0);
    player.pos.set(head.x + 0.5, head.y + 0.57, head.z + 0.5);
    return 'sleep';
  };
  function sleepTick(dt) {
    const s = G.sleeping;
    s.t += dt;
    if (s.t >= 2.2) {
      G.ticks = (Math.floor(G.ticks / 24000) + 1) * 24000;     // утро следующего дня
      G.sleeping = null;
      G.emit('sleep', {});
      G.say('Доброе утро!');
      G.saveWorld();
    }
  }

  // ---------- Грядки и посевы ----------
  G.crops = {};
  function cropsTick(dt) {
    G.cropT = (G.cropT || 0) + dt;
    if (G.cropT < 1) return;
    G.cropT -= 1;
    for (const k in G.crops) {
      const [x, y, z] = k.split(',').map(Number);
      const id = world.getBlock(x, y, z);
      if (id < 0) continue;
      if (id === C.SUGAR_CANE) { if (Math.random() < 1 / 20 && VX.items) VX.items.growCane(x, y, z); continue; }
      if (id >= C.CARROTS && id <= C.CARROTS + 3) { if (id < C.CARROTS + 3 && Math.random() < 1 / 15) world.setBlock(x, y, z, id + 1); continue; }
      if (id >= C.NETHER_WART && id <= C.NETHER_WART + 3) { if (id < C.NETHER_WART + 3 && Math.random() < 1 / 20) world.setBlock(x, y, z, id + 1); continue; }
      if (id < 64 || id > 71) { delete G.crops[k]; continue; }
      if (id < 71 && Math.random() < 1 / 15) world.setBlock(x, y, z, id + 1);
    }
  }
  G.growCrop = function (x, y, z, n) {
    const id = world.getBlock(x, y, z);
    if (id < 64 || id > 71) return false;
    world.setBlock(x, y, z, Math.min(71, id + n));
    return true;
  };

  // ПКМ: мобы (ножницы, краситель), еда, вёдра, лук, двери, рычаг, сундук, кровать, верстак, печь,
  // мотыга и семена, костная мука, яйца призыва, установка блока из руки
  G.useTarget = function () {
    const held = inv.held();
    const hi = held ? D.info(held.id) : null;
    if (VX.entities && VX.entities.interact(held)) return 'mob';
    if (VX.vehicles) { const vu = VX.vehicles.use(held, hi); if (vu !== undefined) return vu; }
    if (hi && hi.food && G.mode === 'survival' && player.food < 20) { G.eating = 0; return 'eat'; }
    if (hi && (hi.key === 'bucket' || hi.fluid)) return useBucket(held, hi);
    if (hi && hi.key === 'shield') return 'shield';
    if (hi && hi.potion && VX.brewing) { if (hi.potion.splash) return VX.brewing.throwSplash(); G.eating = 0; return 'drink'; }
    if (hi && hi.key === 'glass_bottle' && VX.brewing) { const fr = VX.brewing.fill(); if (fr) return fr; }
    if (hi && VX.endgame) { const eu = VX.endgame.use(held, hi); if (eu !== undefined) return eu; }
    if (hi && VX.fishing) { const fu = VX.fishing.use(held, hi); if (fu !== undefined) return fu; }
    if (hi && VX.items) { const iu = VX.items.use(held); if (iu !== undefined) return iu; }
    if (hi && hi.key === 'bow') { if (G.mode === 'creative' || inv.count(D.I.arrow) > 0) { G.bowT = 0.0001; return 'bow'; } return null; }
    const t = G.target();
    if (!t) return null;
    const tb = C.BLOCKS[t.id];
    if (hi && hi.key === 'flint_and_steel' && VX.nether) return VX.nether.ignite(t, held);
    if (!player.sneaking || !held) {
      if (t.id === B.crafting_table) { G.openContainer('table', t); return 'table'; }
      if ((t.id >= B.furnace && t.id <= B.furnace + 3) || (t.id >= B.furnace_lit && t.id <= B.furnace_lit + 3)) { G.openContainer('furnace', t); return 'furnace'; }
      if (t.id >= B.chest && t.id <= B.chest + 3) { G.openContainer('chest', t); return 'chest'; }
      if (t.id === C.ENCH_TABLE) { G.openContainer('enchant', t); return 'enchant'; }
      if (t.id === C.BREWING_STAND) { G.openContainer('brew', t); return 'brew'; }
      if (tb.anvil !== undefined) { G.openContainer('anvil', t); return 'anvil'; }
      if (tb.door === 'wood') { setDoorOpen(t.x, t.y, t.z, !tb.open); return 'door'; }
      if (t.id === 130 || t.id === 131) { toggleLever(t.x, t.y, t.z); return 'lever'; }
      if (tb.bed) return G.useBed(t.x, t.y, t.z);
      const u = VX.build && VX.build.use(t);
      if (u !== undefined) return u;
      const ru = VX.redstone && VX.redstone.use(t);
      if (ru !== undefined) return ru;
    }
    if (!held) return null;
    // мотыга: трава и земля становятся грядкой
    const tool = D.toolOf(held.id);
    if (tool && tool.type === 'hoe') {
      if ((t.id === B.grass || t.id === B.dirt) && world.getBlock(t.x, t.y + 1, t.z) === 0 && t.n[1] >= 0) {
        world.setBlock(t.x, t.y, t.z, B.farmland);
        VX.audio.play('step', { surface: 'gravel' });
        if (G.mode === 'survival') inv.wearHeld();
        G.swing = 1;
        return 'till';
      }
      return null;
    }
    // семена - только на грядку (адский нарост - на песок душ)
    if (hi.plant) {
      if (t.id === (hi.soil || B.farmland) && t.n[1] === 1 && world.getBlock(t.x, t.y + 1, t.z) === 0) {
        world.setBlock(t.x, t.y + 1, t.z, hi.plant);
        G.crops[t.x + ',' + (t.y + 1) + ',' + t.z] = 1;
        if (G.mode === 'survival') inv.takeHeld(1);
        VX.audio.play('place', { surface: 'grass' });
        return 'plant';
      }
      return null;
    }
    if (hi.fertilizer) {
      if (t.id >= 64 && t.id <= 71) {
        G.growCrop(t.x, t.y, t.z, 2 + ((Math.random() * 4) | 0));
        if (G.mode === 'survival') inv.takeHeld(1);
        if (VX.entities) VX.entities.burst(t.x, t.y, t.z, B.grass);
        return 'grow';
      }
      return null;
    }
    if (hi.egg) {
      const p = t.place;
      const sm = VX.entities && VX.entities.spawnMob(hi.egg, p.x + 0.5, p.y, p.z + 0.5);
      if (sm && hi.egg === 'villager' && VX.villages) { const ks = Object.keys(VX.villages.PROF); sm.color = ks[(Math.random() * ks.length) | 0]; sm.trades = VX.villages.makeTrades(sm.color); }
      if (G.mode === 'survival') inv.takeHeld(1);
      return 'egg';
    }
    if (hi.places) return placeSpecial(t, held, hi);
    if (!C.isBlock(held.id)) return null;
    const rl = VX.vehicles && VX.vehicles.place(t, held);
    if (rl !== undefined) return rl;
    const built = VX.build && VX.build.place(t, held);
    if (built !== undefined) return built;
    const rsb = VX.redstone && VX.redstone.place(t, held);
    if (rsb !== undefined) return rsb;
    const ib = VX.items && VX.items.place(t, held);
    if (ib !== undefined) return ib;
    let { x, y, z } = t.place;
    if (tb.replaceable) { x = t.x; y = t.y; z = t.z; }
    if (y < 0 || y >= C.CH) return null;
    const cur = world.getBlock(x, y, z);
    if (cur < 0 || (cur !== 0 && !C.FLUID[cur] && !C.BLOCKS[cur].replaceable)) return null;
    let id = held.id;
    const b = C.BLOCKS[id];
    if (b.solid && blockedByBodies(x, y, z)) return null;
    if (id === B.torch) {
      const n = t.n;
      if (n[1] === 1 || tb.replaceable) { if (!C.SOLID[world.getBlock(x, y - 1, z)]) return null; }
      else if (n[1] === -1) return null;
      else id = C.WALL_TORCH + (n[2] === 1 ? 0 : n[0] === -1 ? 1 : n[2] === -1 ? 2 : 3);
    }
    if ((id === 130) && !C.SOLID[world.getBlock(x, y - 1, z)]) return null;
    if (b.render === 'cross' && ![B.grass, B.dirt, B.snow_grass, B.sand].includes(world.getBlock(x, y - 1, z))) return null;
    // кактус: только на песке или кактусе и без соседей сбоку
    if (id === B.cactus) {
      const below = world.getBlock(x, y - 1, z);
      if (below !== B.sand && below !== B.cactus) return null;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = world.getBlock(x + dx, y, z + dz); if (n !== 0 && !C.FLUID[n]) return null; }
    }
    // сундук: не больше двух рядом
    if (id === B.chest) {
      const nb = chestNeighbours(x, y, z);
      if (nb.length > 1 || nb.some(([a, b2, c]) => chestNeighbours(a, b2, c).length > 0)) return null;
    }
    if (b.facing) id = b.id + [2, 1, 0, 3][yawDir()];
    if (b.anvil !== undefined) id = C.ANVIL + yawDir() % 2;
    world.setBlock(x, y, z, id);
    if (G.mode === 'survival') inv.takeHeld(1);
    VX.audio.play('place', { surface: surfaceOf(id) });
    G.swing = 1;
    G.meta.stats && G.meta.stats.placed++;
    G.emit('place', { id: held.id });
    if (id === B.sand || id === B.gravel) fallBlocks(x, y, z);
    afterChange(x, y, z);
    return { x, y, z };
  };
  G.placeTarget = G.useTarget;
  // Дверь (две клетки) и кровать (две клетки вдоль взгляда)
  function placeSpecial(t, held, hi) {
    const { x, y, z } = t.place;
    const free = (X, Y, Z) => { const c = world.getBlock(X, Y, Z); return c === 0 || (c > 0 && (C.BLOCKS[c].replaceable || C.FLUID[c])); };
    const floor = (X, Y, Z) => { const c = world.getBlock(X, Y - 1, Z); return c > 0 && C.SOLID[c] && !C.SHAPE[c]; };
    const q = yawDir();
    if (hi.places === 'door') {
      if (!free(x, y, z) || !free(x, y + 1, z) || !floor(x, y, z)) return null;
      if (blockedByBodies(x, y, z) || blockedByBodies(x, y + 1, z)) return null;
      const lo = hi.door + [2, 1, 0, 3][q] * 4;
      world.setBlock(x, y, z, lo); world.setBlock(x, y + 1, z, lo + 1);
    } else {
      const v = DIRV[q], X2 = x + v[0], Z2 = z + v[1];
      if (!free(x, y, z) || !free(X2, y, Z2) || !floor(x, y, z) || !floor(X2, y, Z2)) return null;
      if (blockedByBodies(x, y, z) || blockedByBodies(X2, y, Z2)) return null;
      world.setBlock(x, y, z, 122 + q); world.setBlock(X2, y, Z2, 126 + q);
    }
    if (G.mode === 'survival') inv.takeHeld(1);
    VX.audio.play('place', { surface: 'wood' });
    G.swing = 1;
    G.emit('place', { id: held.id });
    return { x, y, z };
  }
  // Ведро: набрать источник воды или лавы, вылить в клетку перед собой
  function useBucket(held, hi) {
    const p = player, o = new THREE.Vector3(p.pos.x, p.eye(), p.pos.z);
    if (hi.key === 'bucket') {
      const f = world.raycastFluid(o, p.forward(), 5);
      if (!f) return null;
      const id = f.id;
      if (id !== B.water && id !== B.lava) return null;
      world.setBlock(f.x, f.y, f.z, 0);
      VX.fluids.touch(f.x, f.y, f.z);
      const full = id === B.water ? D.I.water_bucket : D.I.lava_bucket;
      if (G.mode === 'survival') { inv.takeHeld(1); const left = inv.add(full, 1); if (left) G.dropItem(VX.inv.newStack(full, 1), true); }
      VX.audio.play(id === B.water ? 'splash' : 'fizz');
      G.emit('bucket', { id: full });
      return id === B.water ? 'water' : 'lava';
    }
    const t = G.target();
    let pos = t ? t.place : null;
    if (t && C.BLOCKS[t.id].replaceable) pos = { x: t.x, y: t.y, z: t.z };
    if (!pos) return null;
    const cur = world.getBlock(pos.x, pos.y, pos.z);
    if (cur < 0 || (cur !== 0 && !C.FLUID[cur] && !C.BLOCKS[cur].replaceable)) return null;
    // в Нижнем мире вода испаряется (ведро пустеет)
    if (G.dim === 'nether' && hi.fluid === B.water) {
      VX.audio.play('fizz');
      if (G.mode === 'survival') { inv.takeHeld(1); const left = inv.add(D.I.bucket, 1); if (left) G.dropItem(VX.inv.newStack(D.I.bucket, 1), true); }
      return 'evaporate';
    }
    world.setBlock(pos.x, pos.y, pos.z, hi.fluid);
    VX.fluids.touch(pos.x, pos.y, pos.z);
    if (G.mode === 'survival') { const s = inv.held(); s.id = D.I.bucket; s.dmg = 0; }
    VX.audio.play(hi.fluid === B.water ? 'splash' : 'fizz');
    return 'pour';
  }

  // СКМ: взять блок под прицелом (в творческом - всегда, в выживании - если есть в инвентаре)
  G.pickTarget = function () {
    const t = G.target();
    if (!t) return null;
    const id = C.BLOCKS[t.id].item;
    const have = inv.slots.findIndex((s) => s && s.id === id);
    if (have >= 0 && have < 9) { inv.selected = have; return id; }
    if (have >= 9) { const tmp = inv.slots[inv.selected]; inv.slots[inv.selected] = inv.slots[have]; inv.slots[have] = tmp; return id; }
    if (G.mode !== 'creative') return null;
    let slot = inv.selected;
    if (inv.slots[slot]) { const empty = inv.slots.findIndex((s, i) => i < 9 && !s); if (empty >= 0) slot = empty; }
    inv.slots[slot] = VX.inv.newStack(id, 64);
    inv.selected = slot;
    return id;
  };
  // Лук: чем дольше натянут (до 1 с), тем дальше и больнее; стрела берётся из инвентаря
  G.shootBow = function (charge) {
    const f = Math.min(1, charge);
    const power = Math.min(1, (f * f + 2 * f) / 3);
    if (power < 0.1) return null;
    if (G.mode === 'survival') { if (!inv.remove(D.I.arrow, 1)) return null; inv.wearHeld(); }
    const p = player, d = p.forward();
    const bowSt = inv.held(), pw = VX.enchant ? VX.enchant.power(bowSt) : 1;          // сила: +25% x (ур+1)
    const a = VX.entities.shootArrow(p.pos.x + d.x * 0.4, p.eye() - 0.1 + d.y * 0.4, p.pos.z + d.z * 0.4, d.x * power * 60, d.y * power * 60, d.z * power * 60, 'player', Math.ceil((Math.ceil(power * 6) + (power >= 1 ? 3 : 0)) * pw));
    VX.audio.play('bow');
    return a;
  };
  // Щит принял удар: прочность 1 + целая часть урона, глухой звук
  player.onShield = function (n) {
    VX.audio.play('shield');
    if (G.mode !== 'survival') return;
    const k = 1 + Math.floor(n);
    for (let i = 0; i < k; i++) { if (inv.wearHeld()) { VX.audio.play('break', { surface: 'wood' }); player.blocking = false; break; } }
  };
  G.eatHeld = function () {
    const held = inv.held();
    if (held && D.info(held.id).drink && VX.brewing) return VX.brewing.drink();
    const f = held && D.info(held.id).food;
    if (!f || player.food >= 20) return null;
    player.eat(f);
    inv.takeHeld(1);
    VX.audio.play('eat');
    G.emit('eat', { id: held.id });
    return held.id;
  };
  // Предмет выпадает в мир (из рук, из сетки крафта, из сломанного блока)
  G.dropItem = function (stack, fromPlayer, x, y, z) {
    if (!stack || !stack.count) return;
    if (!VX.entities) { inv.add(stack.id, stack.count, stack.dmg); return; }
    if (fromPlayer) {
      const f = player.forward();
      VX.entities.spawnItem(stack, player.pos.x + f.x * 0.4, player.eye() - 0.3, player.pos.z + f.z * 0.4, f.x * 4, 2 + f.y * 3, f.z * 4, 1.5);
    } else VX.entities.spawnItem(stack, x, y, z, (Math.random() - 0.5) * 2, 3, (Math.random() - 0.5) * 2, 0.4);
  };
  G.dropHeld = function (all) {
    const s = inv.held();
    if (!s) return;
    G.dropItem(inv.takeHeld(all ? s.count : 1), true);
  };
  G.select = function (i) { inv.selected = ((i % 9) + 9) % 9; G.itemNameT = 2; };

  // ---------- Добыча в выживании: постепенно, с трещинами ----------
  function updateMining(dt) {
    // Удар по мобу раньше блока: луч сначала ищет существ в пределах руки. Раньше здесь сначала
    // искался блок - в поле (за мобом небо) удар не доходил никуда, а в творческом режиме
    // ломался блок за животным, и убить его было нельзя.
    if (G.mouse.l && G.mouse.lPressed && G.state === 'play' && VX.entities) {
      G.mouse.lPressed = false;
      if (VX.vehicles && VX.vehicles.attack()) { G.mining = null; G.breakCool = 0.3; return; }
      if (VX.entities.attack()) { G.mining = null; G.breakCool = 0.3; return; }
    }
    const t = G.mouse.l && G.state === 'play' ? G.target() : null;
    if (!t) { G.mining = null; return; }
    if (G.mode === 'creative') {
      G.breakCool = (G.breakCool || 0) - dt;
      if (G.breakCool <= 0) { G.breakTarget(); G.breakCool = 0.3; }
      return;
    }
    const m = G.mining;
    if (!m || m.x !== t.x || m.y !== t.y || m.z !== t.z || m.id !== t.id) {
      const held = inv.held();
      G.mining = { x: t.x, y: t.y, z: t.z, id: t.id, p: 0, time: D.breakTime(t.id, held ? held.id : 0, held), hitT: 0 };
    }
    const g = G.mining;
    const held = inv.held();
    g.time = D.breakTime(t.id, held ? held.id : 0, held);
    if (!isFinite(g.time) || t.y <= 0) return;
    let speed = 1;
    if (player.headInWater) speed /= 5;
    if (!player.onGround && !player.inWater) speed /= 5;
    g.p += g.time > 0 ? dt * speed / g.time : 1;
    G.swing = Math.max(G.swing, 0.6);
    g.hitT -= dt;
    if (g.hitT <= 0) { g.hitT = 0.25; VX.audio.play('hit', { surface: surfaceOf(t.id) }); }
    if (g.p >= 1) { breakAt(t.x, t.y, t.z, true); G.mining = null; G.mineCool = 0.3; }
  }
  // Шаг добычи для проверок: сколько секунд занимает сломать блок под прицелом
  G.mineSeconds = function (maxT) {
    const dt = 0.05;
    G.mouse.l = true;
    let t = 0;
    const tgt = G.target();
    if (!tgt) { G.mouse.l = false; return null; }
    while (t < maxT) {
      updateMining(dt);
      t += dt;
      if (world.getBlock(tgt.x, tgt.y, tgt.z) !== tgt.id) break;
    }
    G.mouse.l = false; G.mining = null;
    return world.getBlock(tgt.x, tgt.y, tgt.z) !== tgt.id ? Math.round(t * 100) / 100 : null;
  };

  // ---------- Ввод ----------
  const action = (code) => { for (const k in G.settings.keys) if (G.settings.keys[k] === code) return k; return null; };
  let lastSpace = 0, lastW = 0;
  window.addEventListener('keydown', (e) => {
    VX.audio.init();
    // F1-F3 и F5 - клавиши игры (F5 в браузере перезагрузил бы страницу)
    if (['F1', 'F2', 'F3', 'F5'].includes(e.code) && G.meta && !G.panorama) e.preventDefault();
    if (VX.ui && VX.ui.onKey(e)) return;
    const a = action(e.code);
    if (G.state === 'play') {
      if (['Space', 'Tab', 'F3', 'Slash', 'F1', 'F5'].includes(e.code) || a) e.preventDefault();
      if (e.repeat && a !== 'drop') return;
      G.keys[e.code] = true;
      if (a === 'jump') {
        const now = performance.now();
        if (G.mode === 'creative' && now - lastSpace < 300) { player.flying = !player.flying; player.vel.y = 0; lastSpace = 0; }
        else lastSpace = now;
      }
      if (a === 'forward') { const now = performance.now(); if (now - lastW < 300) G.sprintTap = true; lastW = now; }
      if (a === 'inventory') { G.openContainer('inv'); return; }
      if (a === 'drop') { G.dropHeld(e.ctrlKey); return; }
      if (e.code.startsWith('Digit') && e.code !== 'Digit0') G.select(+e.code.slice(5) - 1);
      if (e.code === 'F3') G.debug = !G.debug;
      if (e.code === 'F5') G.view = ((G.view || 0) + 1) % 3;        // первое лицо -> сзади -> спереди
      if (e.code === 'F1') G.hideHud = !G.hideHud;
      if (e.code === 'F2') G.shotRequest = true;
      if (e.code === 'Escape') G.pause();
    } else if (G.state === 'inv') {
      if (a === 'inventory' || e.code === 'Escape') { e.preventDefault(); G.closeContainer(); }
    } else if (G.state === 'paused' && e.code === 'Escape' && VX.ui && VX.ui.current === 'pause') { e.preventDefault(); G.play(); }
  });
  window.addEventListener('keyup', (e) => {
    G.keys[e.code] = false;
    if (action(e.code) === 'forward') G.sprintTap = false;
  });
  canvas.addEventListener('mousedown', (e) => {
    VX.audio.init();
    if (G.state !== 'play') return;
    // первый щелчок без захвата мыши - только захват (в проверках захвата нет, щелчок идёт в игру)
    if (!G.testMode && (G.needClick || (canvas.requestPointerLock && document.pointerLockElement !== canvas))) { lock(); G.needClick = false; return; }
    if (e.button === 0) { G.mouse.l = true; G.mouse.lPressed = true; G.breakCool = 0; }
    else if (e.button === 2) { G.mouse.r = true; G.placeCool = 0.25; G.useTarget(); }
    else if (e.button === 1) { e.preventDefault(); G.pickTarget(); }
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) { G.mouse.l = false; G.mining = null; }
    if (e.button === 2) { G.mouse.r = false; if (G.bowT > 0) { G.shootBow(G.bowT); G.bowT = 0; } }
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('auxclick', (e) => e.preventDefault());
  document.addEventListener('mousemove', (e) => {
    if (G.state !== 'play' || document.pointerLockElement !== canvas) return;
    const k = 0.0022 * G.settings.sensitivity / 100;
    player.yaw -= e.movementX * k;
    player.pitch -= e.movementY * k * (G.settings.invertY ? -1 : 1);
    player.pitch = Math.max(-Math.PI / 2 + 0.001, Math.min(Math.PI / 2 - 0.001, player.pitch));
  });
  canvas.addEventListener('wheel', (e) => {
    if (G.state !== 'play') return;
    e.preventDefault();
    G.select(inv.selected + (e.deltaY > 0 ? 1 : -1));
  }, { passive: false });

  function inputState() {
    const k = G.keys, s = G.settings.keys, st = G.state === 'play';
    const on = (a) => st && !!k[s[a]];
    return { f: on('forward'), b: on('back'), l: on('left'), r: on('right'), jump: on('jump'), sneak: on('sneak') || (s.sneak === 'ShiftLeft' && st && !!k.ShiftRight), sprint: on('sprint') || (st && !!G.sprintTap) };
  }

  // ---------- Шаг мира ----------
  let stepAcc = 0;
  function playerEvent(ev, d) {
    if (ev === 'hurt') { VX.audio.play('hurt'); }
    if (ev === 'land' && d > 1.2) { const b = world.getBlock(Math.floor(player.pos.x), Math.floor(player.pos.y - 0.1), Math.floor(player.pos.z)); VX.audio.play('step', { surface: surfaceOf(b) }); }
    if (ev === 'death' && G.state !== 'dead') { G.onDeath(d); }
    if (ev === 'jump' && G.mode === 'survival') player.exhaust(player.sprinting ? 0.2 : 0.05);
  }
  G.playerEvent = playerEvent;
  G.onDeath = function () {
    G.meta.stats && G.meta.stats.deaths++;
    // окно (верстак, печь) закрываем первым: вещи из сетки и с курсора тоже выпадают
    if (G.container) closeContainer();
    if (VX.xp) VX.xp.onDeath(player);
    // как в оригинале: вещи выпадают на месте гибели
    for (let i = 0; i < 36; i++) { const s = inv.slots[i]; if (s) { G.dropItem(s, false, player.pos.x, player.pos.y + 1, player.pos.z); inv.slots[i] = null; } }
    for (let i = 0; i < 4; i++) { const s = inv.armor[i]; if (s) { G.dropItem(s, false, player.pos.x, player.pos.y + 1, player.pos.z); inv.armor[i] = null; } }
    G.sleeping = null;
    G.state = 'dead';
    releaseKeys();
    unlock();
    if (VX.ui) VX.ui.show('death');
    G.saveWorld();
  };
  G.respawn = function () {
    player.reset();
    // из Нижнего мира и Края - домой, в обычный мир
    if (G.dim !== 'over') {
      const bd = G.meta.bed, sp0 = G.meta.spawn;
      const at = bd ? { x: bd.x + 0.5, y: bd.y + 0.57, z: bd.z + 0.5 } : { x: sp0.x, y: sp0.y, z: sp0.z };
      G.changeDim('over', at, () => {
        if (bd) { const id = world.getBlock(bd.x, bd.y, bd.z); if (!(id > 0 && C.BLOCKS[id].bed)) { G.meta.bed = null; player.pos.set(sp0.x, sp0.y, sp0.z); G.say('Кровать не найдена: возрождение в начале мира'); } }
      });
      return;
    }
    let sp = G.meta.spawn;
    // кровать: возрождение у неё, если она цела
    const bd = G.meta.bed;
    if (bd) {
      const id = world.getBlock(bd.x, bd.y, bd.z);
      if (id > 0 && C.BLOCKS[id].bed) sp = { x: bd.x + 0.5, y: bd.y + 0.57, z: bd.z + 0.5 };
      else if (id >= 0) { G.meta.bed = null; G.say('Кровать не найдена: возрождение в начале мира'); }
    }
    player.pos.set(sp.x, sp.y, sp.z);
    player.vel.set(0, 0, 0);
    G.state = 'paused';
    G.play();
    G.saveWorld();
  };
  let lastBiome = -1, achT = 0;
  function simulate(dt) {
    const running = G.state === 'play' || G.state === 'inv' || G.state === 'dead';
    if (!running) return;
    G.ticks += dt * 20;
    const wasWater = player.inWater;
    const inp = G.state === 'play' && !G.sleeping ? inputState() : {};
    // в лодке или вагонетке героем правит транспорт (Shift - выйти)
    const riding = G.riding && VX.vehicles && G.state !== 'dead' && VX.vehicles.ride(dt, inp);
    if (G.state !== 'dead' && !riding) player.update(dt, inp, world, G.mode, playerEvent);
    if (player.dead && G.state !== 'dead') { G.onDeath(player.lastDamage && player.lastDamage.cause); return; }
    if (player.inWater && !wasWater && Math.abs(player.vel.y) > 2) VX.audio.play('splash');
    // шаги
    if (player.onGround && !player.flying && (Math.abs(player.vel.x) + Math.abs(player.vel.z)) > 0.5) {
      stepAcc += Math.hypot(player.vel.x, player.vel.z) * dt;
      if (stepAcc > (player.sprinting ? 2.1 : 1.7)) {
        stepAcc = 0;
        const b = world.getBlock(Math.floor(player.pos.x), Math.floor(player.pos.y - 0.05), Math.floor(player.pos.z));
        if (b > 0) VX.audio.play('step', { surface: surfaceOf(b) });
      }
    } else if (player.inWater && (Math.abs(player.vel.x) + Math.abs(player.vel.z)) > 0.5) {
      stepAcc += dt; if (stepAcc > 0.8) { stepAcc = 0; VX.audio.play('swim'); }
    }
    if (G.sleeping) sleepTick(dt);
    else if (G.state === 'play') {
      updateMining(dt);
      const hf = inv.held();
      // щит поднят, пока держишь ПКМ (поднимается за четверть секунды, как в оригинале)
      const shieldUp = G.mouse.r && hf && D.info(hf.id).key === 'shield';
      G.blockT = shieldUp ? (G.blockT || 0) + dt : 0;
      player.blocking = G.blockT >= 0.25;
      if (G.bowT > 0 && G.mouse.r) G.bowT += dt;
      if (G.mouse.r && G.eating !== undefined && hf && (D.info(hf.id).food || D.info(hf.id).drink)) {
        G.eating += dt; G.swing = Math.max(G.swing, 0.3);
        if (G.eating >= 1.6) { G.eatHeld(); G.eating = undefined; }
      } else if (G.mouse.r && !(G.bowT > 0)) { G.eating = undefined; G.placeCool -= dt; if (G.placeCool <= 0) { G.placeCool = 0.2; G.useTarget(); } }
      else G.eating = undefined;
    }
    if (VX.fluids) VX.fluids.tick(dt);
    if (VX.nether && G.state === 'play') VX.nether.tick(dt);
    if (VX.redstone) VX.redstone.tick(dt);
    if (VX.items) VX.items.tick(dt);
    if (VX.xp) VX.xp.update(dt);
    if (VX.villages) VX.villages.tick(dt);
    if (VX.brewing && G.state !== 'dead') VX.brewing.tick(dt);
    if (VX.endgame) VX.endgame.tick(dt);
    if (VX.fishing) VX.fishing.tick(dt);
    if (VX.vehicles) VX.vehicles.tick(dt);
    if (G.dim === 'nether' && ((G.fortT = (G.fortT || 0) + dt) > 1)) {
      G.fortT = 0;
      const f = C.fortressNear(world.seed, player.pos.x, player.pos.z);
      if (f) {
        const dx = Math.abs(player.pos.x - f.x), dz = Math.abs(player.pos.z - f.z), dy = player.pos.y - f.y;
        if (dy >= 0 && dy < 6 && ((dx <= 6 && dz <= 6) || (dz <= 2.5 && dx <= f.arm) || (dx <= 2.5 && dz <= f.arm))) G.emit('fortress', {});
      }
    }
    cropsTick(dt);
    // печи
    for (const k in G.furnaces) {
      const f = G.furnaces[k];
      const [x, y, z] = k.split(',').map(Number);
      const burning = VX.inv.tickFurnace(f, dt, (out) => G.emit('smelt', { id: out }));
      const id = world.getBlock(x, y, z);
      if (id < 0) continue;
      const rot = id >= B.furnace_lit ? id - B.furnace_lit : id - B.furnace;
      if (rot < 0 || rot > 3) { delete G.furnaces[k]; continue; }
      const want = (burning ? B.furnace_lit : B.furnace) + rot;
      if (want !== id) world.setBlock(x, y, z, want);
    }
    if (VX.entities) VX.entities.update(dt);
    // достижения по месту: глубина, биом, дом
    achT -= dt;
    if (achT <= 0) {
      achT = 1;
      if (G.state !== 'dead') {
        G.emit('depth', { y: player.pos.y });
        const bi = C.column(C.worldOf(G.meta.seedNum), Math.floor(player.pos.x), Math.floor(player.pos.z)).biome;
        if (bi !== lastBiome) { lastBiome = bi; G.emit('biome', { biome: bi }); }
        if (VX.ach && VX.ach.checkHouse) VX.ach.checkHouse();
      }
    }
    G.meta.stats && (G.meta.stats.played += dt);
    G.saveT += dt;
    if (G.saveT > 10) { G.saveT = 0; G.saveWorld(); }
    world.saveDirty();
    G.swing = Math.max(0, G.swing - dt * 3.5);
    G.hintT = Math.max(0, (G.hintT || 0) - dt);
    G.actionT = Math.max(0, (G.actionT || 0) - dt);
    G.itemNameT = Math.max(0, (G.itemNameT || 0) - dt);
  }
  G.simulate = simulate;

  // ---------- Кадр ----------
  const clock = { last: performance.now() };
  let bob = 0;
  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - clock.last) / 1000));
    const frameMs = now - clock.last;
    clock.last = now;
    const t0 = performance.now();
    let t1 = t0;
    try { tick(dt); t1 = performance.now(); render(dt); } catch (e) { console.error(e); }
    const work = performance.now() - t0;
    // медленные кадры запоминаем с разбивкой: что именно тормозило
    if (work > 12) { G.perf.slow.push({ at: Math.round(now), tick: +(t1 - t0).toFixed(1), render: +(performance.now() - t1).toFixed(1), parts: G.perf.cur }); if (G.perf.slow.length > 40) G.perf.slow.shift(); }
    G.perf.cur = {};
    const p = G.perf;
    p.frames.push(frameMs); p.work.push(work);
    if (p.frames.length > 600) { p.frames.shift(); p.work.shift(); }
    G.fpsAcc = (G.fpsAcc || 0) + 1;
    if (now - (G.fpsT || 0) > 500) { G.fps = Math.round(G.fpsAcc * 1000 / (now - (G.fpsT || now - 500))); G.fpsAcc = 0; G.fpsT = now; }
    requestAnimationFrame(frame);
  }
  function tick(dt) {
    if (G.state === 'menu' || G.state === 'boot') {
      // панорама: камера медленно вращается над миром
      G.ticks += dt * 2;
      player.yaw += dt * 0.05;
      player.pitch = -0.12;
      if (G.meta) player.pos.set(G.meta.spawn.x, G.meta.spawn.y, G.meta.spawn.z);
    } else if (G.state === 'loading') {
      G.loadT += dt;
      if (world.readyAround(player.pos.x, player.pos.z, 2) || G.loadT > 25) {
        if (G.afterLoad) { const f = G.afterLoad; G.afterLoad = null; f(); }
        // игрок не должен оказаться внутри земли: поднимаем до свободного места
        let guard = 0;
        while (VX.phys.boxHits(world, player.box()) && guard++ < 140) player.pos.y += 1;
        G.emit('enter', {});
        G.state = 'paused';
        if (VX.ui) VX.ui.loaded();
      }
    } else { const a = performance.now(); simulate(dt); G.perf.cur.sim = +(performance.now() - a).toFixed(1); }
    const b = performance.now();
    world.update(player.pos.x, player.pos.z);
    G.perf.cur.world = +(performance.now() - b).toFixed(1);
  }
  function render(dt) {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false);
    }
    camera.aspect = handCam.aspect = w / Math.max(1, h);
    const s = G.settings;
    let fov = s.fov;
    if (player.sprinting && G.state === 'play') fov *= 1.12;
    if (player.flying && player.sprinting) fov *= 1.05;
    camera.fov += (fov - camera.fov) * Math.min(1, dt * 10);
    camera.updateProjectionMatrix(); handCam.updateProjectionMatrix();
    // покачивание при ходьбе
    const moving = player.onGround && Math.hypot(player.vel.x, player.vel.z) > 0.3 && G.state === 'play';
    if (moving && s.bobbing) bob += dt * Math.hypot(player.vel.x, player.vel.z) * 1.9; else bob *= 0.9;
    const bobA = s.bobbing && moving ? 1 : 0;
    const view = G.panorama ? 0 : (G.view || 0);
    if (view === 0) {
      camera.position.set(player.pos.x, player.eye() + Math.abs(Math.sin(bob)) * 0.06 * bobA, player.pos.z);
      camera.rotation.set(player.pitch, player.yaw, Math.sin(bob) * 0.006 * bobA);
    } else {
      // вид от третьего лица: камера на 4 блока сзади (или спереди) и ближе, если мешает стена
      const eye = new THREE.Vector3(player.pos.x, player.eye(), player.pos.z);
      const d = player.forward().multiplyScalar(view === 1 ? -1 : 1);
      const dist = G.cameraDistance(eye, d, 4);
      camera.position.copy(eye).addScaledVector(d, dist);
      if (view === 1) camera.rotation.set(player.pitch, player.yaw, 0);
      else camera.rotation.set(-player.pitch, player.yaw + Math.PI, 0);
    }
    camera.updateMatrixWorld();
    if (VX.entities && VX.entities.playerModel) VX.entities.playerModel(view > 0 && !G.panorama && (G.state === 'play' || G.state === 'inv' || G.state === 'paused'), dt);
    const camId = world.getBlock(Math.floor(camera.position.x), Math.floor(camera.position.y), Math.floor(camera.position.z));
    const under = camId > 0 && C.FLUID[camId] === 1;
    G.inLavaView = camId > 0 && C.FLUID[camId] === 2;
    G.underwater = under;
    const far = world.radius * C.CS;
    const sk = sky.update(G.ticks, camera, under, far, renderer);
    const nether = G.dim === 'nether';
    if (nether) {
      // Нижний мир: неба нет, красноватая дымка, свет только от лавы, светокамня и порталов
      sky.group.visible = false; if (sky.clouds) sky.clouds.visible = false;
      sk.day = 0; sk.fog = new THREE.Color(0x330808);
    }
    const endDim = G.dim === 'end';
    if (endDim) {
      // Край: вечная сумеречная тьма с лиловым отливом, неба и солнца нет
      sky.group.visible = false; if (sky.clouds) sky.clouds.visible = false;
      sk.day = 0; sk.fog = new THREE.Color(0x120c1c);
    }
    // ночное зрение: всё видно как днём
    mats.uniforms.uAmb.value = VX.brewing && VX.brewing.level('night_vision') ? 1 : nether ? 0.55 : endDim ? 0.85 : 0;
    mats.uniforms.uDay.value = sk.day;
    mats.uniforms.uFogColor.value.copy(sk.fog);
    mats.uniforms.uFogNear.value = under ? 2 : nether ? far * 0.3 : endDim ? far * 0.45 : far * 0.62;
    mats.uniforms.uFogFar.value = under ? 22 : nether ? far * 0.95 : endDim ? far * 0.98 : far - 4;
    scene.fog = scene.fog || new THREE.Fog(0xffffff, 10, 100);
    scene.fog.color.copy(sk.fog); scene.fog.near = mats.uniforms.uFogNear.value; scene.fog.far = mats.uniforms.uFogFar.value;
    G.dayLight = sk.day;
    // рамка и трещины
    const t = (G.state === 'play' || G.state === 'inv') ? G.target() : null;
    G.lastTarget = t;
    selBox.visible = !!t && G.state === 'play';
    if (t) {
      // рамка по форме блока (плита, ступени, забор): общая коробка его частей
      let lo = [0, 0, 0], hi = [16, 16, 16];
      if (C.RENDER[t.id] === 8) {
        const shp = C.shapeOf(t.id, (dx, dy, dz) => world.getBlock(t.x + dx, t.y + dy, t.z + dz), 'outline');
        if (shp && shp.length) { lo = [16, 16, 16]; hi = [0, 0, 0]; for (const q of shp) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], q[k]); hi[k] = Math.max(hi[k], q[k + 3]); } }
      }
      selBox.scale.set((hi[0] - lo[0]) / 16 || 0.01, (hi[1] - lo[1]) / 16 || 0.01, (hi[2] - lo[2]) / 16 || 0.01);
      selBox.position.set(t.x + (lo[0] + hi[0]) / 32, t.y + (lo[1] + hi[1]) / 32, t.z + (lo[2] + hi[2]) / 32);
      G.selBounds = { lo, hi };
    }
    const m = G.mining;
    crack.visible = !!(m && m.p > 0 && G.mode === 'survival');
    if (crack.visible) { crack.position.set(m.x + 0.5, m.y + 0.5, m.z + 0.5); crackTex.offset.x = Math.min(9, Math.floor(m.p * 10)) / 10; }
    const LL = G.localLight();
    sceneAmb.intensity = 0.65 * LL; sceneSun.intensity = 0.45 * LL;
    if (VX.entities && G.meta && !G.panorama) VX.entities.render(dt, camera);
    if (VX.xp && G.meta && !G.panorama) VX.xp.render();
    if (VX.brewing && G.meta && !G.panorama) VX.brewing.render();
    if (VX.endgame && G.meta && !G.panorama) VX.endgame.render();
    if (VX.fishing && G.meta && !G.panorama) VX.fishing.render();
    if (VX.vehicles && G.meta && !G.panorama) VX.vehicles.render();
    renderer.setClearColor(sk.fog);
    renderer.clear();
    if (G.state !== 'loading') { renderer.render(scene, camera); world.afterRender(); }    // пока грузится - экран загрузки, мир не рисуем
    // рука
    const inGame = G.state === 'play' || G.state === 'inv';
    if (G.shotRequest) { G.shotRequest = false; G.saveShot(); }
    if (inGame && !G.hideHand && !G.hideHud && !(G.view > 0) && !G.sleeping) {
      const held = inv.held();
      setHand(held ? held.id : 0);
      const sw = Math.sin(G.swing * Math.PI);
      const bx = Math.sin(bob) * 0.03 * bobA, by = -Math.abs(Math.cos(bob)) * 0.03 * bobA;
      if (player.blocking) { hand.position.set(0.22 + bx, -0.3 + by, -0.62); hand.rotation.set(0, 1.05, 0); }       // щит перед собой
      else { hand.position.set(0.52 + bx - sw * 0.18, -0.42 + by - sw * 0.1, -0.8 - sw * 0.1); hand.rotation.set(-sw * 0.6, sw * 0.4, 0); }
      const light = G.localLight ? G.localLight() : 1;
      handLight.intensity = 0.6 * light; handScene.children[1].intensity = 0.55 * Math.max(0.15, light);
      renderer.clearDepth();
      renderer.render(handScene, handCam);
    }
    if (VX.ui) VX.ui.frame(dt);
  }
  // Сколько камере отъехать от глаз по направлению d, не войдя в блок
  G.cameraDistance = function (eye, d, max) {
    let dist = 0;
    for (let k = 0.1; k <= max + 1e-6; k += 0.1) {
      const x = eye.x + d.x * k, y = eye.y + d.y * k, z = eye.z + d.z * k;
      if (VX.phys.boxHits(world, [x - 0.2, y - 0.2, z - 0.2, x + 0.2, y + 0.2, z + 0.2])) break;
      dist = k;
    }
    return dist;
  };
  // F2: снимок экрана в PNG (браузер спросит, куда сохранить, или положит в загрузки)
  G.saveShot = function () {
    try {
      const url = canvas.toDataURL('image/png');
      const d = new Date(), p2 = (v) => String(v).padStart(2, '0');
      const a = document.createElement('a');
      a.href = url;
      a.download = `kubicheskiy-mir-${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}_${p2(d.getHours())}-${p2(d.getMinutes())}-${p2(d.getSeconds())}.png`;
      document.body.appendChild(a); a.click(); a.remove();
      G.say('Снимок сохранён: ' + a.download);
      VX.audio.play('click');
    } catch (e) { G.say('Снимок не удался'); }
  };
  // Приблизительная освещённость у игрока (для руки и существ): небо над головой и факелы рядом
  G.lightAt = function (x, y, z) {
    const top = world.skyTop(Math.floor(x), Math.floor(z));
    const skyL = y > top ? 1 : Math.max(0.12, 1 - (top - y) * 0.2);
    let blk = 0;
    const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
    for (let dx = -6; dx <= 6; dx += 1) for (let dz = -6; dz <= 6; dz += 1) for (let dy = -3; dy <= 3; dy++) {
      const id = world.getBlock(X + dx, Y + dy, Z + dz);
      if (id > 0 && C.EMIT[id]) blk = Math.max(blk, (C.EMIT[id] - Math.abs(dx) - Math.abs(dz) - Math.abs(dy)) / 15);
    }
    const day = G.dayLight === undefined ? 1 : G.dayLight;
    if (VX.brewing && VX.brewing.level('night_vision')) return 1;
    if (G.dim === 'nether') return Math.max(blk, 0.45);          // неба нет, но и полной тьмы тоже
    if (G.dim === 'end') return Math.max(blk, 0.75);
    return Math.max(skyL * (0.25 + 0.75 * day), blk, 0.12);
  };
  let llT = 0, llV = 1;
  G.localLight = function () {
    const now = performance.now();
    if (now - llT > 400) { llT = now; llV = G.lightAt(player.pos.x, player.eye(), player.pos.z); }
    return llV;
  };

  // ---------- Перенос построек старой версии ----------
  // Старая версия хранила в localStorage только отличия от своего острова 48x48. Новый мир
  // «Старый мир» повторяет тот остров клетка в клетку (core.js, legacy), поэтому правки ложатся
  // на свои места. Старый ключ не удаляется; перенос делается один раз.
  const OLD_KEY = 'cubeworld_edits_v1', MIGRATED = 'cubeworld_migrated_v1';
  G.migrateLegacy = async function () {
    let raw = null, done = null;
    try { raw = localStorage.getItem(OLD_KEY); done = localStorage.getItem(MIGRATED); } catch (e) { return null; }
    if (!raw || done) return null;
    let edits;
    try { edits = JSON.parse(raw) || {}; } catch (e) { return null; }
    const keys = Object.keys(edits);
    if (!keys.length) return null;
    const meta = await G.createWorld({ name: 'Старый мир', seed: 'старый мир', mode: 'creative', gen: 'legacy' });
    const chunks = new Map();
    for (const k of keys) {
      const [x, y, z] = k.split(',').map(Number);
      if (!(y >= 0 && y < 32) || !C.inLegacy(x, z)) continue;
      const id = C.LEG_MAP[edits[k]] || 0;
      const cx = Math.floor(x / C.CS), cz = Math.floor(z / C.CS), ck = cx + ',' + cz;
      if (!chunks.has(ck)) chunks.set(ck, { cx, cz, d: C.generate(meta.seedNum, cx, cz, 'legacy') });
      chunks.get(ck).d[C.cidx(x - cx * C.CS, y + C.LEG_DY, z - cz * C.CS)] = id;
    }
    for (const c of chunks.values()) VX.store.putChunk(meta.id, c.cx, c.cz, c.d);
    await VX.store.flush();
    try { localStorage.setItem(MIGRATED, meta.id); } catch (e) { /* не страшно: перенос повторится */ }
    return meta.id;
  };

  // ---------- Запуск ----------
  async function boot() {
    G.settings = loadSettings();
    await VX.store.init();
    applySettings();
    try { await G.migrateLegacy(); } catch (e) { console.warn('перенос старых построек не удался', e); }
    if (VX.ui) VX.ui.init();
    await openPanorama();
    // ?seed=...&mode=... - сразу в новый мир (для проверок и быстрого старта)
    if (params.has('seed')) {
      const meta = await G.createWorld({ name: params.get('name') || 'Мир ' + params.get('seed'), seed: params.get('seed'), mode: params.get('mode') || 'creative' });
      await startWorld(meta, true);
    } else if (VX.ui) VX.ui.show('start');
    G.ready = true;
    requestAnimationFrame(frame);
  }
  G.boot = boot;
})();
