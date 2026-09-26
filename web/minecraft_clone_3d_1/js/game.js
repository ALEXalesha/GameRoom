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
  G.world = world; G.player = player; G.inv = inv; G.scene = scene; G.camera = camera; G.renderer = renderer;
  G.atlas = atlas; G.atlasTex = atlasTex; G.itemCanvas = itemCanvas; G.itemTex = itemTex;

  // значки предметов для интерфейса (изометрические кубики и плоские)
  const iconCache = new Map();
  G.icon = function (id) {
    let url = iconCache.get(id);
    if (url) return url;
    let c;
    if (id < 256) {
      const b = C.BLOCKS[id];
      const flat = b.render === 'cross' || b.render === 'torch';
      if (flat) { const t = C.TEXF[id * 6]; c = VX.tex.flatIcon(atlas.canvas, (t % C.ATLAS_COLS) * 16, ((t / C.ATLAS_COLS) | 0) * 16); }
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
  const cubeMat = new THREE.MeshLambertMaterial({ map: atlasTex, alphaTest: 0.5 });
  const spriteMats = new Map();
  function spriteMaterial(id) {
    let m = spriteMats.get(id);
    if (m) return m;
    let tex, col, row;
    if (id < 256) { const t = C.TEXF[id * 6]; tex = atlasTex.clone(); col = t % C.ATLAS_COLS; row = (t / C.ATLAS_COLS) | 0; tex.repeat.set(1 / C.ATLAS_COLS, 1 / C.ATLAS_ROWS); tex.offset.set(col / C.ATLAS_COLS, 1 - (row + 1) / C.ATLAS_ROWS); }
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
  G.itemMesh = function (id, size) {
    const b = id < 256 ? C.BLOCKS[id] : null;
    if (b && (b.render === 'cube' || b.render === 'leaves' || b.render === 'glass' || b.render === 'ice')) return new THREE.Mesh(cubeGeometry(id, size), cubeMat);
    return new THREE.Mesh(new THREE.PlaneGeometry(size * 1.6, size * 1.6), spriteMaterial(id));
  };
  let handId = -1;
  function setHand(id) {
    if (id === handId) return;
    handId = id;
    hand.clear();
    let m = handCache.get(id);
    if (!m) {
      if (!id) {
        m = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.75), new THREE.MeshLambertMaterial({ color: 0xc89a78 }));
        m.position.set(0.1, -0.05, 0.1); m.rotation.set(0.2, -0.25, 0.1);
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
    const sp = C.findSpawn(seedNum);
    const meta = {
      id: newId(), name: (o.name || '').trim() || 'Новый мир', seed: seedStr || String(seedNum), seedNum, mode: o.mode === 'survival' ? 'survival' : 'creative',
      created: Date.now(), lastPlayed: Date.now(), ticks: 1000, spawn: { x: sp.x + 0.5, y: sp.h + 1, z: sp.z + 0.5 },
      player: null, inv: null, furnaces: {}, ach: { got: {}, progress: {} }, stats: { broken: 0, placed: 0, kills: 0, deaths: 0, played: 0 }, version: 2,
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
  async function startWorld(meta, persist) {
    G.meta = meta;
    G.mode = meta.mode;
    G.ticks = meta.ticks || 0;
    G.panorama = !persist;
    world.open(meta, persist);
    applySettings();
    sky.cloudMap = sky.makeCloudMap(meta.seedNum);
    sky.setClouds(G.settings.clouds);
    if (meta.player) player.load(meta.player);
    else { player.reset(); player.pos.set(meta.spawn.x, meta.spawn.y, meta.spawn.z); player.yaw = 0; player.pitch = 0; }
    if (meta.inv) inv.load(meta.inv);
    else { inv.clear(); if (meta.mode === 'creative') CREATIVE_START.forEach((id, i) => { inv.slots[i] = VX.inv.newStack(id, 64); }); }
    if (VX.entities) VX.entities.reset(meta);
    G.mining = null;
    G.furnaces = meta.furnaces || (meta.furnaces = {});
    G.state = persist ? 'loading' : 'menu';
    G.loadT = 0;
    G.saveT = 0;
    if (persist && VX.ui) VX.ui.show('loading');
  }
  G.startWorld = startWorld;
  G.saveWorld = async function () {
    if (!G.meta || G.panorama) return;
    world.saveDirty();
    G.meta.ticks = Math.round(G.ticks);
    G.meta.player = player.toJSON();
    G.meta.inv = inv.toJSON();
    G.meta.lastPlayed = Date.now();
    if (VX.entities) VX.entities.save(G.meta);
    await VX.store.putWorld(G.meta);
  };
  G.exitToTitle = async function () {
    if (G.meta && !G.panorama) { closeContainer(); await G.saveWorld(); await VX.store.flush(); }
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
    G.state = 'play';
    releaseKeys();
    if (VX.ui) VX.ui.show('hud');
    lock();
    G.needClick = document.pointerLockElement !== canvas;
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
    } else {
      view = new VX.inv.PlayerView(inv, kind === 'table' ? 3 : 2);
      view.onCraft = (r) => { G.emit('craft', { id: r.outId }); VX.audio.play('click'); };
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

  // Сломать блок в клетке (уже решено, что можно): выпадение, соседи без опоры, вода
  function breakAt(x, y, z, byPlayer) {
    const id = world.getBlock(x, y, z);
    if (id <= 0) return false;
    world.setBlock(x, y, z, 0);
    VX.audio.play('break', { surface: surfaceOf(id) });
    if (VX.entities) VX.entities.burst(x, y, z, id);
    if (byPlayer && G.mode === 'survival') {
      const held = inv.held();
      const drops = D.dropsOf(id, held ? held.id : 0, Math.random);
      for (const [did, n] of drops) G.dropItem(VX.inv.newStack(did, n), false, x + 0.5, y + 0.3, z + 0.5);
      if (D.toolOf(held && held.id)) { if (inv.wearHeld()) VX.audio.play('break', { surface: 'wood' }); }
      player.exhaust(0.005);
    }
    const fk = x + ',' + y + ',' + z;
    if (G.furnaces[fk]) {
      for (const s of G.furnaces[fk].slots) if (s && G.mode === 'survival') G.dropItem(s, false, x + 0.5, y + 0.5, z + 0.5);
      delete G.furnaces[fk];
    }
    G.meta.stats && G.meta.stats.broken++;
    afterChange(x, y, z);
    return true;
  }
  G.breakAt = breakAt;
  // Что держится на этом месте: растения и факел сверху, факелы на стенах, песок и гравий падают
  function afterChange(x, y, z) {
    const up = world.getBlock(x, y + 1, z);
    if (up > 0 && (C.RENDER[up] === 6 || up === B.torch) && !C.SOLID[world.getBlock(x, y, z)]) popBlock(x, y + 1, z);
    const walls = [[0, 0, -1, 2], [1, 0, 0, 3], [0, 0, 1, 0], [-1, 0, 0, 1]];
    for (const [dx, , dz, r] of walls) {
      const id = world.getBlock(x + dx, y, z + dz);
      if (id === C.WALL_TORCH + r && !C.SOLID[world.getBlock(x, y, z)]) popBlock(x + dx, y, z + dz);
    }
    if (up === B.sand || up === B.gravel) fallBlocks(x, y + 1, z);
    if (world.getBlock(x, y, z) === 0) G.fluidCheck(x, y, z);
  }
  function popBlock(x, y, z) {
    const id = world.getBlock(x, y, z);
    world.setBlock(x, y, z, 0);
    if (G.mode === 'survival') for (const [did, n] of D.dropsOf(id, 0, Math.random)) G.dropItem(VX.inv.newStack(did, n), false, x + 0.5, y + 0.3, z + 0.5);
    afterChange(x, y, z);
  }
  function fallBlocks(x, y, z) {
    // столбик песка/гравия падает до опоры
    let yy = y;
    while (true) {
      const id = world.getBlock(x, yy, z);
      if (id !== B.sand && id !== B.gravel) break;
      let to = yy;
      while (to > 0) { const below = world.getBlock(x, to - 1, z); if (below === 0 || below === B.water || C.RENDER[below] === 6) to--; else break; }
      if (to !== yy) { world.setBlock(x, yy, z, 0); world.setBlock(x, to, z, id); }
      yy++;
    }
  }

  // Простая вода: открытая клетка рядом с водой заполняется, вода стекает вниз и
  // растекается по дну не дальше 4 клеток от места, где упала
  G.fluidQueue = [];
  G.fluidCheck = function (x, y, z) {
    const n = [[0, 1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
    if (n.some(([dx, dy, dz]) => world.getBlock(x + dx, y + dy, z + dz) === B.water)) G.fluidQueue.push([x, y, z, 0]);
  };
  function fluidStep() {
    const q = G.fluidQueue.splice(0, 64);
    for (const [x, y, z, d] of q) {
      const cur = world.getBlock(x, y, z);
      if (cur !== 0 && !(cur > 0 && C.BLOCKS[cur].replaceable)) continue;
      world.setBlock(x, y, z, B.water);
      const below = world.getBlock(x, y - 1, z);
      if (below === 0 || (below > 0 && C.BLOCKS[below].replaceable)) { G.fluidQueue.push([x, y - 1, z, 0]); continue; }
      if (d >= 4 || below < 0) continue;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (world.getBlock(x + dx, y, z + dz) === 0) G.fluidQueue.push([x + dx, y, z + dz, d + 1]);
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
  // ПКМ: взаимодействие с верстаком/печью или установка блока из руки
  G.useTarget = function () {
    const t = G.target();
    const held = inv.held();
    if (held && D.info(held.id).food && G.mode === 'survival' && G.player.food < 20) { G.eating = 0; return 'eat'; }
    if (!t) return null;
    if (!player.sneaking && t.id === B.crafting_table) { G.openContainer('table', t); return 'table'; }
    if (!player.sneaking && (t.id >= B.furnace && t.id <= B.furnace + 3 || t.id >= B.furnace_lit && t.id <= B.furnace_lit + 3)) { G.openContainer('furnace', t); return 'furnace'; }
    if (!held || held.id >= 256) return null;
    let { x, y, z } = t.place;
    if (C.BLOCKS[t.id].replaceable) { x = t.x; y = t.y; z = t.z; }
    if (y < 0 || y >= C.CH) return null;
    const cur = world.getBlock(x, y, z);
    if (cur < 0 || (cur !== 0 && cur !== B.water && !C.BLOCKS[cur].replaceable)) return null;
    let id = held.id;
    const b = C.BLOCKS[id];
    if (b.solid && blockedByBodies(x, y, z)) return null;
    if (id === B.torch) {
      const n = t.n;
      if (n[1] === 1 || C.BLOCKS[t.id].replaceable) { if (!C.SOLID[world.getBlock(x, y - 1, z)]) return null; }
      else if (n[1] === -1) return null;
      else id = C.WALL_TORCH + (n[2] === 1 ? 0 : n[0] === -1 ? 1 : n[2] === -1 ? 2 : 3);
    }
    if (b.render === 'cross' && ![B.grass, B.dirt, B.snow_grass, B.sand].includes(world.getBlock(x, y - 1, z))) return null;
    if (b.facing) {
      const q = ((Math.round(player.yaw / (Math.PI / 2)) % 4) + 4) % 4;
      id = b.id + [2, 1, 0, 3][q];
    }
    world.setBlock(x, y, z, id);
    if (G.mode === 'survival') inv.takeHeld(1);
    VX.audio.play('place', { surface: surfaceOf(id) });
    G.swing = 1;
    G.meta.stats && G.meta.stats.placed++;
    G.emit('place', { id: held.id });
    if (id === B.sand || id === B.gravel) fallBlocks(x, y, z);
    return { x, y, z };
  };
  G.placeTarget = G.useTarget;
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
  G.eatHeld = function () {
    const held = inv.held();
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
    const t = G.mouse.l && G.state === 'play' ? G.target() : null;
    if (!t) { G.mining = null; return; }
    if (G.mode === 'creative') {
      G.breakCool = (G.breakCool || 0) - dt;
      if (G.breakCool <= 0) { G.breakTarget(); G.breakCool = 0.3; }
      return;
    }
    if (VX.entities && G.mouse.lPressed) { G.mouse.lPressed = false; if (VX.entities.attack()) { G.mining = null; return; } }
    const m = G.mining;
    if (!m || m.x !== t.x || m.y !== t.y || m.z !== t.z || m.id !== t.id) {
      const held = inv.held();
      G.mining = { x: t.x, y: t.y, z: t.z, id: t.id, p: 0, time: D.breakTime(t.id, held ? held.id : 0), hitT: 0 };
    }
    const g = G.mining;
    const held = inv.held();
    g.time = D.breakTime(t.id, held ? held.id : 0);
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
    if (G.needClick || (canvas.requestPointerLock && document.pointerLockElement !== canvas && !G.testMode)) { lock(); G.needClick = false; return; }
    if (e.button === 0) { G.mouse.l = true; G.mouse.lPressed = true; G.breakCool = 0; }
    else if (e.button === 2) { G.mouse.r = true; G.placeCool = 0.25; G.useTarget(); }
    else if (e.button === 1) { e.preventDefault(); G.pickTarget(); }
  });
  window.addEventListener('mouseup', (e) => { if (e.button === 0) { G.mouse.l = false; G.mining = null; } if (e.button === 2) G.mouse.r = false; });
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
  G.onDeath = function () {
    G.meta.stats && G.meta.stats.deaths++;
    // как в оригинале: вещи выпадают на месте гибели
    for (let i = 0; i < 36; i++) { const s = inv.slots[i]; if (s) { G.dropItem(s, false, player.pos.x, player.pos.y + 1, player.pos.z); inv.slots[i] = null; } }
    if (G.container) closeContainer();
    G.state = 'dead';
    releaseKeys();
    unlock();
    if (VX.ui) VX.ui.show('death');
    G.saveWorld();
  };
  G.respawn = function () {
    player.reset();
    const sp = G.meta.spawn;
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
    const inp = G.state === 'play' ? inputState() : {};
    if (G.state !== 'dead') player.update(dt, inp, world, G.mode, playerEvent);
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
    if (G.state === 'play') {
      updateMining(dt);
      const hf = inv.held();
      if (G.mouse.r && G.eating !== undefined && hf && D.info(hf.id).food) {
        G.eating += dt; G.swing = Math.max(G.swing, 0.3);
        if (G.eating >= 1.6) { G.eatHeld(); G.eating = undefined; }
      } else if (G.mouse.r) { G.eating = undefined; G.placeCool -= dt; if (G.placeCool <= 0) { G.placeCool = 0.2; G.useTarget(); } }
      else G.eating = undefined;
    }
    G.fluidT = (G.fluidT || 0) + dt;
    if (G.fluidT > 0.25) { G.fluidT = 0; fluidStep(); }
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
    camera.position.set(player.pos.x, player.eye() + Math.abs(Math.sin(bob)) * 0.06 * bobA, player.pos.z);
    camera.rotation.set(player.pitch, player.yaw, Math.sin(bob) * 0.006 * bobA);
    camera.updateMatrixWorld();
    const under = world.getBlock(Math.floor(camera.position.x), Math.floor(camera.position.y), Math.floor(camera.position.z)) === B.water;
    G.underwater = under;
    const far = world.radius * C.CS;
    const sk = sky.update(G.ticks, camera, under, far, renderer);
    mats.uniforms.uDay.value = sk.day;
    mats.uniforms.uFogColor.value.copy(sk.fog);
    mats.uniforms.uFogNear.value = under ? 2 : far * 0.62;
    mats.uniforms.uFogFar.value = under ? 22 : far - 4;
    scene.fog = scene.fog || new THREE.Fog(0xffffff, 10, 100);
    scene.fog.color.copy(sk.fog); scene.fog.near = mats.uniforms.uFogNear.value; scene.fog.far = mats.uniforms.uFogFar.value;
    G.dayLight = sk.day;
    // рамка и трещины
    const t = (G.state === 'play' || G.state === 'inv') ? G.target() : null;
    G.lastTarget = t;
    selBox.visible = !!t && G.state === 'play';
    if (t) selBox.position.set(t.x + 0.5, t.y + 0.5, t.z + 0.5);
    const m = G.mining;
    crack.visible = !!(m && m.p > 0 && G.mode === 'survival');
    if (crack.visible) { crack.position.set(m.x + 0.5, m.y + 0.5, m.z + 0.5); crackTex.offset.x = Math.min(9, Math.floor(m.p * 10)) / 10; }
    const LL = G.localLight();
    sceneAmb.intensity = 0.65 * LL; sceneSun.intensity = 0.45 * LL;
    if (VX.entities && G.meta && !G.panorama) VX.entities.render(dt, camera);
    renderer.setClearColor(sk.fog);
    renderer.clear();
    if (G.state !== 'loading') { renderer.render(scene, camera); world.afterRender(); }    // пока грузится - экран загрузки, мир не рисуем
    // рука
    const inGame = G.state === 'play' || G.state === 'inv';
    if (inGame && !G.hideHand) {
      const held = inv.held();
      setHand(held ? held.id : 0);
      const sw = Math.sin(G.swing * Math.PI);
      const bx = Math.sin(bob) * 0.03 * bobA, by = -Math.abs(Math.cos(bob)) * 0.03 * bobA;
      hand.position.set(0.52 + bx - sw * 0.18, -0.42 + by - sw * 0.1, -0.8 - sw * 0.1);
      hand.rotation.set(-sw * 0.6, sw * 0.4, 0);
      const light = G.localLight ? G.localLight() : 1;
      handLight.intensity = 0.6 * light; handScene.children[1].intensity = 0.55 * Math.max(0.15, light);
      renderer.clearDepth();
      renderer.render(handScene, handCam);
    }
    if (VX.ui) VX.ui.frame(dt);
  }
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
    return Math.max(skyL * (0.25 + 0.75 * day), blk, 0.12);
  };
  let llT = 0, llV = 1;
  G.localLight = function () {
    const now = performance.now();
    if (now - llT > 400) { llT = now; llV = G.lightAt(player.pos.x, player.eye(), player.pos.z); }
    return llV;
  };

  // ---------- Запуск ----------
  async function boot() {
    G.settings = loadSettings();
    await VX.store.init();
    applySettings();
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
