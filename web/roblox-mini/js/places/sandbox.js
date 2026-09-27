// «Песочница»: серая плита с шипами, блоки 2x2x2 по сетке. Инструменты внизу, как рюкзак:
// 1 - строить, 2 - ломать, 3 - красить; щелчок ЛКМ по миру. Постройка хранится в mix.blox.sandbox.
// Боты строят по заготовкам (B.data.BLUEPRINTS): выбирают свободное место подальше от точки
// появления и построек игрока, ставят по блоку с паузами, ошибаются и переставляют. Блоки ботов не
// сохраняются (пока игрок не нажал «Оставить»), их не больше BOT_LIMIT, старые постройки исчезают.
'use strict';
(function (B) {
  const K = B.kit;
  const MAX = 3000, HALF = 60;                      // клеток от центра в каждую сторону
  const PALETTE = ['#f2f3f3', '#8a8d93', '#1f2227', '#d62d2d', '#ff9d3b', '#ffd23f', '#3fae4a', '#3fd0c4', '#2f74d0', '#8a5cf5', '#ff8fd0', '#8e5a3a'];
  const TOOLS = [
    { id: 'build', ru: 'Строить', en: 'Build', key: '1' },
    { id: 'delete', ru: 'Ломать', en: 'Delete', key: '2' },
    { id: 'paint', ru: 'Красить', en: 'Paint', key: '3' },
  ];
  const cellKey = (i, j, k) => i + ',' + j + ',' + k;
  const BOT_LIMIT = 360;        // блоков ботов на всей плите
  const BUILD_TTL = 150;        // секунд живёт готовая постройка бота, потом исчезает
  const SPAWN_R = 6;            // клеток вокруг точки появления - не строить
  const settings = B.placeSettings('sandbox', { bots: 3, botsBuild: true });

  const P = B.places.sandbox = {
    PALETTE, MAX, BOT_LIMIT, BUILD_TTL, SPAWN_R, settings,
    botCount: () => settings.reload().bots,                    // при входе - свежие значения из хранилища
    botSpeed: 13,
    statLabel: () => (B.lang() === 'en' ? 'Blocks' : 'Блоки'),
    stat: (g, b) => (b ? (g.state.botCells ? g.state.botCells[b.name] || 0 : 0) : g.state.cells.size - (g.state.botBlocks || 0)),
    // Настройки места в меню: число ботов и «боты строят»
    settingsGroup: settings,
    settingsSchema: [
      { key: 'bots', label: () => (B.lang() === 'en' ? 'Bots' : 'Боты'), type: 'slider', min: 0, max: 6, step: 1, fmt: (v) => String(v) },
      { key: 'botsBuild', label: () => (B.lang() === 'en' ? 'Bots build' : 'Боты строят'), type: 'toggle' },
    ],
    onSettings(game, key) {
      if (key === 'bots') game.setBotCount(settings.get('bots'));
      if (key === 'botsBuild' && !settings.get('botsBuild')) for (const bd of game.state.builds.values()) bd.decay = true;
    },
    sky: { top: '#3f8fe6', horizon: '#e7f2ff' },

    load() { const s = B.store.get('sandbox', { blocks: [], placed: 0 }); if (!Array.isArray(s.blocks)) s.blocks = []; return s; },
    // сохраняются только блоки игрока (и оставленные им постройки ботов)
    save(game) {
      const st = game.state;
      B.store.set('sandbox', { blocks: Array.from(st.cells.values()).filter((b) => !b.owner).map((b) => [b.i, b.j, b.k, b.c]), placed: st.placed });
    },

    build(game) {
      const w = game.world, st = game.state;
      w.voidY = -40;
      st.base = w.add({ top: [0, 0, 0], size: [HALF * 4 + 16, 2, HALF * 4 + 16], color: '#8a8d93', tag: 'base' });
      K.decal(game, B.lang() === 'en' ? 'SPAWN' : 'ПОЯВЛЕНИЕ', 0, 0, 0, 8, 4, '#2f74d0', '#fff');
      // готовая «витрина» сбоку: домик, чтобы было на что посмотреть
      const hx = -31, hz = 31, seen = new Set();
      for (let y = 0; y < 3; y++) for (let a = -2; a <= 2; a++) {
        for (const [x, z] of [[a, -2], [a, 2], [-2, a], [2, a]]) {
          if (y < 2 && z === 2 && x === 0) continue;             // дверь
          const key = x + ',' + y + ',' + z;
          if (seen.has(key)) continue;
          seen.add(key);
          w.add({ pos: [hx + x * 2, 1 + y * 2, hz + z * 2], size: [2, 2, 2], color: y === 2 ? '#d62d2d' : '#f2f3f3' });
        }
      }
      w.add({ pos: [hx, 7, hz], size: [12, 2, 12], color: '#8e5a3a' });
      K.tree(game, 34, 0, -30); K.tree(game, 40, 0, -22, 0.8); K.pine(game, -40, 0, -36);
      game.path = [st.base];
      game.spawn = { x: 0, y: 0, z: 0, facing: Math.PI };
    },
    setup(game) {
      const st = game.state;
      const saved = P.load();
      Object.assign(st, { cells: new Map(), placed: saved.placed || 0, tool: 'build', color: 3, ghost: null, mouse: null, builds: new Map(), buildN: 0, botBlocks: 0, botCells: {}, keepT: 0 });
      // блоки: одна сетка с экземплярами на всех, у каждого - свой ящик для столкновений
      const geo = B.engine.boxesGeometry([{ cx: 0, cy: 0, cz: 0, sx: 2, sy: 2, sz: 2, color: new THREE.Color('#ffffff') }], { x: 0, y: 0, z: 0 });
      const im = new THREE.InstancedMesh(geo, B.engine.mats().plastic, MAX);
      im.count = 0; im.castShadow = true; im.receiveShadow = true;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.setColorAt(0, new THREE.Color('#fff'));
      im.frustumCulled = false;
      game.world.scene.add(im);
      st.im = im;
      for (const [i, j, k, c] of saved.blocks) P.placeAt(game, i, j, k, c, true);
      P.refresh(game);
      // призрак-подсказка, куда встанет блок
      const gm = new THREE.Mesh(new THREE.BoxGeometry(2.08, 2.08, 2.08), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }));
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(gm.geometry), new THREE.LineBasicMaterial({ color: 0xffffff }));
      gm.add(edges);
      gm.visible = false;
      game.world.scene.add(gm);
      st.ghost = gm; st.ghostEdges = edges;
      game.bots.forEach((b) => P.onBotAdded(game, b));
    },
    start(game) {
      P.drawHotbar(game);
      game.centerMsg(B.lang() === 'en' ? 'Build! Click to place blocks, 1-3 switch tools' : 'Строй! Щелчок ставит блок, 1-3 - инструменты', 3000);
    },
    // Можно ли занять клетку: не занята, в пределах плиты, не в теле игрока или бота
    cellFree(game, i, j, k) {
      const st = game.state;
      if (st.cells.has(cellKey(i, j, k)) || st.cells.size >= MAX) return false;
      if (j < 0 || j > 60 || Math.abs(i) > HALF || Math.abs(k) > HALF) return false;
      const x = 2 * i + 1, y = 2 * j + 1, z = 2 * k + 1, hx = B.engine.PHYS.HX;
      const bodies = (game.player ? [game.player] : []).concat(game.bots.filter((b) => !b.dead).map((b) => b.body));
      for (const p of bodies) {
        if (x + 1 > p.pos.x - hx - 0.05 && x - 1 < p.pos.x + hx + 0.05 && y + 1 > p.pos.y && y - 1 < p.pos.y + 5 && z + 1 > p.pos.z - hx - 0.05 && z - 1 < p.pos.z + hx + 0.05) return false;
      }
      // не внутри неподвижных деталей (витрина, деревья)
      return game.world.boxFree(x - 0.95, y - 0.95, z - 0.95, x + 0.95, y + 0.95, z + 0.95);
    },
    // Поставить блок в клетку (i, j, k): центр (2i+1, 2j+1, 2k+1). owner - имя бота (иначе блок игрока)
    placeAt(game, i, j, k, c, silent, owner, build) {
      const st = game.state, key = cellKey(i, j, k);
      if (silent) { if (st.cells.has(key) || st.cells.size >= MAX) return false; } else if (!P.cellFree(game, i, j, k)) return false;
      if (owner) {
        if (st.botBlocks >= BOT_LIMIT || P.inSpawn(i, k)) return false;
      }
      const x = 2 * i + 1, y = 2 * j + 1, z = 2 * k + 1;
      const part = game.world.add({ pos: [x, y, z], size: [2, 2, 2], visual: false, tag: 'block', data: { i, j, k } });
      st.cells.set(key, { i, j, k, c: B.clamp(c | 0, 0, PALETTE.length - 1), part, owner: owner || null, build: build || null });
      if (owner) {
        st.botBlocks++; st.botCells[owner] = (st.botCells[owner] || 0) + 1;
        if (!silent && game.player && Math.hypot(game.player.pos.x - x, game.player.pos.z - z) < 30) B.sound.play('place');
        P.refresh(game);
      } else if (!silent) {
        st.placed++;
        B.sound.play('place');
        if (st.placed >= 25) B.acct.completeBadge('sandbox');
        P.refresh(game); P.save(game);
      }
      return true;
    },
    // Убрать блок. owner - убрать можно только свой блок этого бота (блоки игрока боты не трогают)
    removeAt(game, i, j, k, owner) {
      const st = game.state, key = cellKey(i, j, k), b = st.cells.get(key);
      if (!b) return false;
      if (owner !== undefined && b.owner !== owner) return false;
      game.world.remove(b.part);
      st.cells.delete(key);
      if (b.owner) { st.botBlocks--; st.botCells[b.owner] = Math.max(0, (st.botCells[b.owner] || 0) - 1); }
      if (owner === undefined) B.sound.play('pop');
      P.refresh(game);
      if (!b.owner) P.save(game);
      return true;
    },
    inSpawn: (i, k) => Math.abs(i + 0.5) <= SPAWN_R && Math.abs(k + 0.5) <= SPAWN_R,
    // «Оставить»: постройки ботов становятся твоими и сохраняются
    keepBotBuilds(game) {
      const st = game.state;
      let n = 0;
      for (const b of st.cells.values()) if (b.owner) { b.owner = null; b.build = null; n++; }
      st.botBlocks = 0; st.botCells = {};
      for (const bd of st.builds.values()) bd.kept = true;
      st.builds.clear();
      for (const bot of game.bots) if (bot.sb) { bot.sb.build = null; bot.sb.phase = 'admire'; bot.sb.t = 2; }
      P.save(game);
      if (n) B.sound.play('checkpoint');
      P.drawHotbar(game);
      return n;
    },
    paintAt(game, i, j, k, c) {
      const b = game.state.cells.get(cellKey(i, j, k));
      if (!b || b.c === c) return false;
      b.c = c; B.sound.play('paint');
      P.refresh(game); P.save(game);
      return true;
    },
    refresh(game) {
      const st = game.state, im = st.im, m = new THREE.Matrix4(), col = new THREE.Color();
      let n = 0;
      for (const b of st.cells.values()) {
        m.makeTranslation(2 * b.i + 1, 2 * b.j + 1, 2 * b.k + 1);
        im.setMatrixAt(n, m);
        im.setColorAt(n, col.set(PALETTE[b.c]));
        n++;
      }
      im.count = n;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    },
    // Куда указывает мышь: { cell для постройки, block под курсором }
    target(game, cx, cy) {
      const r = B.game.screenRay(game, cx, cy);
      const hit = game.world.rayCast(r.o, r.d, 250, (c) => c.tag === 'block' || c.tag === 'base' || c.solid);
      if (!hit) return null;
      const pt = { x: r.o.x + r.d.x * hit.t, y: r.o.y + r.d.y * hit.t, z: r.o.z + r.d.z * hit.t };
      const n = hit.normal;
      let block = null, cell;
      if (hit.part.tag === 'block') {
        const d = hit.part.data;
        block = { i: d.i, j: d.j, k: d.k };
        cell = { i: d.i + n[0], j: d.j + n[1], k: d.k + n[2] };
      } else {
        const px = pt.x + n[0] * 0.5, py = pt.y + n[1] * 0.5, pz = pt.z + n[2] * 0.5;
        cell = { i: Math.floor(px / 2), j: Math.floor(py / 2), k: Math.floor(pz / 2) };
      }
      return { cell, block };
    },
    onMouseMove(game, cx, cy) { game.state.mouse = { x: cx, y: cy }; },
    render(game) {
      const st = game.state, gm = st.ghost;
      if (!gm) return;
      if (!st.tool || !st.mouse || game.menuOpen || game.dead) { gm.visible = false; return; }
      const t = P.target(game, st.mouse.x, st.mouse.y);
      if (!t) { gm.visible = false; return; }
      const c = st.tool === 'build' ? t.cell : t.block;
      if (!c) { gm.visible = false; return; }
      gm.visible = true;
      gm.position.set(2 * c.i + 1, 2 * c.j + 1, 2 * c.k + 1);
      gm.material.color.set(st.tool === 'delete' ? '#ff3b3b' : st.tool === 'paint' ? PALETTE[st.color] : PALETTE[st.color]);
      st.ghostEdges.material.color.set(st.tool === 'delete' ? '#ff3b3b' : '#ffffff');
    },
    onClick(game, cx, cy) {
      const st = game.state;
      if (!st.tool || game.dead) return false;
      const t = P.target(game, cx, cy);
      if (!t) return true;
      if (st.tool === 'build') P.placeAt(game, t.cell.i, t.cell.j, t.cell.k, st.color);
      else if (st.tool === 'delete' && t.block) P.removeAt(game, t.block.i, t.block.j, t.block.k);
      else if (st.tool === 'paint' && t.block) P.paintAt(game, t.block.i, t.block.j, t.block.k, st.color);
      return true;
    },
    onKey(game, e) {
      const i = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code);
      if (i < 0) return false;
      P.selectTool(game, TOOLS[i].id);
      return true;
    },
    selectTool(game, id) {
      const st = game.state;
      st.tool = st.tool === id ? null : id;
      B.sound.play('click');
      P.drawHotbar(game);
    },
    drawHotbar(game) {
      const st = game.state, hb = document.getElementById('g-hotbar');
      hb.hidden = false;
      const en = B.lang() === 'en';
      hb.innerHTML = `<div class="hb-tools">${TOOLS.map((t) => `<button type="button" class="hb-slot${st.tool === t.id ? ' on' : ''}" data-tool="${t.id}"><span class="hb-key">${t.key}</span><span class="hb-ic hb-${t.id}"></span><span class="hb-name">${en ? t.en : t.ru}</span></button>`).join('')}</div>` +
        (st.tool === 'build' || st.tool === 'paint' ? `<div class="hb-pal">${PALETTE.map((c, i) => `<button type="button" class="hb-col${st.color === i ? ' on' : ''}" data-col="${i}" style="background:${c}" aria-label="${c}"></button>`).join('')}</div>` : '');
      hb.insertAdjacentHTML('afterbegin', '<button type="button" id="hb-keep" class="hb-keep" hidden></button>');
      document.getElementById('hb-keep').addEventListener('click', () => P.keepBotBuilds(game));
      P.updateKeep(game);
      hb.querySelectorAll('[data-tool]').forEach((b) => b.addEventListener('click', () => P.selectTool(game, b.dataset.tool)));
      hb.querySelectorAll('[data-col]').forEach((b) => b.addEventListener('click', () => { st.color = Number(b.dataset.col); B.sound.play('click'); P.drawHotbar(game); }));
    },
    hud(game) {
      const st = game.state;
      return `<div class="hud-pill"><span>${B.lang() === 'en' ? 'Blocks' : 'Блоков'} <b>${st.cells.size}</b></span><span class="hud-sep"></span><span>${B.lang() === 'en' ? 'Placed total' : 'Поставлено всего'} <b>${st.placed}</b>${st.placed < 25 ? '/25' : ' ★'}</span></div>`;
    },
    botSpawn: (g, i) => ({ x: 8 + (i % 3) * 4, y: 0, z: 8 + Math.floor(i / 3) * 4 }),

    // ---------- Боты-строители ----------
    onBotAdded(game, b) {
      const r = game.rng, others = game.bots.filter((x) => x !== b && x.sb).map((x) => x.sb.main);
      const cols = [3, 4, 5, 6, 7, 8, 9, 10].filter((c) => !others.includes(c));
      const main = r.pick(cols.length ? cols : [3, 4, 5, 6, 7, 8, 9, 10]);
      const accent = r.pick([0, 1, 2, 11, 3, 5, 8].filter((c) => c !== main));
      // любимые заготовки: у каждого свой вкус
      const ids = B.data.BLUEPRINTS.map((x) => x.id);
      for (let k = ids.length - 1; k > 0; k--) { const j = r.int(k + 1); const t = ids[k]; ids[k] = ids[j]; ids[j] = t; }
      b.sb = { phase: 'think', t: 0.5 + r() * 2, main, accent, likes: ids.slice(0, 4), build: null, n: 0, home: r() * Math.PI * 2, retry: [] };
    },
    onBotRemoved(game, b) { const bd = b.sb && b.sb.build; if (bd) bd.decay = true; },
    // Свободное место под заготовку (i0, k0 - угол). Далеко от точки появления, игрока и чужих построек
    findSite(game, b, bp) {
      const st = game.state, sz = B.data.blueprintSize(bp), r = game.rng;
      const pl = game.player && game.player.pos;
      const playerCells = Array.from(st.cells.values()).filter((c) => !c.owner);
      for (let tries = 0; tries < 60; tries++) {
        const a = b.sb.home + (r() - 0.5) * 1.6, rad = 10 + r() * 26;
        const i0 = Math.round(Math.cos(a) * rad - sz.w / 2), k0 = Math.round(Math.sin(a) * rad - sz.d / 2);
        const i1 = i0 + sz.w - 1, k1 = k0 + sz.d - 1;
        if (i0 < -HALF + 2 || i1 > HALF - 2 || k0 < -HALF + 2 || k1 > HALF - 2) continue;
        // точка появления - с запасом
        if (i1 >= -SPAWN_R - 2 && i0 <= SPAWN_R + 1 && k1 >= -SPAWN_R - 2 && k0 <= SPAWN_R + 1) continue;
        // игрок рядом
        if (pl && pl.x > 2 * i0 - 8 && pl.x < 2 * i1 + 10 && pl.z > 2 * k0 - 8 && pl.z < 2 * k1 + 10) continue;
        // постройки игрока - не ближе 3 клеток
        if (playerCells.some((c) => c.i >= i0 - 3 && c.i <= i1 + 3 && c.k >= k0 - 3 && c.k <= k1 + 3)) continue;
        // чужие стройки (и занятые, и заявленные) - не ближе 2 клеток
        let clash = false;
        for (const bd of st.builds.values()) if (i0 - 2 <= bd.i1 && i1 + 2 >= bd.i0 && k0 - 2 <= bd.k1 && k1 + 2 >= bd.k0) { clash = true; break; }
        if (clash) continue;
        // место пустое (блоки, витрина, деревья), с краем в клетку
        if (!game.world.boxFree(2 * i0 - 2, 0.05, 2 * k0 - 2, 2 * i1 + 4, 2 * sz.h + 2, 2 * k1 + 4)) continue;
        return { i0, k0, i1, k1 };
      }
      return null;
    },
    startBuild(game, b) {
      const st = game.state, sb = b.sb, r = game.rng;
      const id = r() < 0.7 ? r.pick(sb.likes) : r.pick(B.data.BLUEPRINTS).id;
      const bp = B.data.BLUEPRINTS.find((x) => x.id === id);
      const cells0 = B.data.blueprintCells(bp, sb.main, sb.accent);
      // лимит: сначала пусть исчезнет старая постройка
      const reserved = Array.from(st.builds.values()).filter((x) => !x.done && !x.decay).reduce((n, x) => n + x.cells.length - x.next, 0);
      if (st.botBlocks + reserved + cells0.length > BOT_LIMIT) { P.decayOldest(game); return false; }
      const site = P.findSite(game, b, bp);
      if (!site) { sb.home += 0.9; return false; }
      const bd = {
        id: ++st.buildN, owner: b.name, bp: id, main: sb.main, accent: sb.accent, i0: site.i0, k0: site.k0, i1: site.i1, k1: site.k1,
        cells: cells0.map((c) => ({ i: site.i0 + c.di, j: c.dj, k: site.k0 + c.dk, c: c.c })), next: 0, done: false, doneAt: 0, decay: false, skipped: 0,
      };
      st.builds.set(bd.id, bd);
      sb.build = bd; sb.phase = 'build'; sb.t = 0.4; sb.retry = [];
      B.bots.say(game, b, 'build', { what: B.lang() === 'en' ? bp.en : bp.ru }, true);
      return true;
    },
    decayOldest(game) {
      const st = game.state;
      const done = Array.from(st.builds.values()).filter((bd) => bd.done && !bd.decay).sort((a, c) => a.doneAt - c.doneAt);
      if (done.length) done[0].decay = true;
    },
    // Где встать, чтобы дотянуться до клетки: снаружи стройки, ближе к клетке
    standFor(game, bd, cell) {
      const cx = 2 * cell.i + 1, cz = 2 * cell.k + 1;
      const x0 = 2 * bd.i0 - 2.4, x1 = 2 * bd.i1 + 4.4, z0 = 2 * bd.k0 - 2.4, z1 = 2 * bd.k1 + 4.4;
      const cands = [{ x: x0, z: B.clamp(cz, z0, z1) }, { x: x1, z: B.clamp(cz, z0, z1) }, { x: B.clamp(cx, x0, x1), z: z0 }, { x: B.clamp(cx, x0, x1), z: z1 }];
      cands.sort((a, c) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(c.x - cx, c.z - cz));
      for (const c of cands) if (game.world.boxFree(c.x - 1, 0.05, c.z - 1, c.x + 1, 5, c.z + 1)) return c;
      return cands[0];
    },
    bpName(id) { const bp = B.data.BLUEPRINTS.find((x) => x.id === id); return bp ? (B.lang() === 'en' ? bp.en : bp.ru) : ''; },
    botThink(game, b, dt) {
      const BT = B.bots, st = game.state, pl = b.body, m = b.mind;
      if (!b.sb) P.onBotAdded(game, b);
      const sb = b.sb;
      sb.t -= dt;
      const building = settings.get('botsBuild');
      if (sb.build && (sb.build.decay || !st.builds.has(sb.build.id))) { sb.build = null; sb.phase = 'think'; }
      if (!building && sb.build) { sb.build.decay = true; sb.build = null; sb.phase = 'think'; }
      if (sb.phase === 'think' || sb.phase === 'admire') {
        if (sb.t > 0 || !building) {
          // посмотреть на свою постройку или погулять
          const bd = sb.lastBuild && st.builds.has(sb.lastBuild.id) ? sb.lastBuild : null;
          return bd ? BT.roam(game, b, bd.i0 + bd.i1 + 1, bd.k0 + bd.k1 + 1, 9, 'roam') : BT.roam(game, b, 10, 10, 18, 'roam');
        }
        if (!P.startBuild(game, b)) { sb.t = 1.5 + game.rng() * 2; return BT.roam(game, b, pl.pos.x, pl.pos.z, 6, 'roam'); }
      }
      const bd = sb.build;
      if (!bd) { sb.phase = 'think'; return BT.hold(); }
      // исправить ошибку: убрать блок, поставленный не туда
      if (sb.wrong && sb.t <= 0) {
        P.removeAt(game, sb.wrong.i, sb.wrong.j, sb.wrong.k, b.name);
        BT.say(game, b, 'oops');
        sb.wrong = null; sb.t = 0.4 + game.rng() * 0.4;
      }
      // следующая клетка по таблице (занятые - пропустить; занятые телом - позже)
      while (bd.next < bd.cells.length) {
        const c0 = bd.cells[bd.next], c = st.cells.get(cellKey(c0.i, c0.j, c0.k));
        if (!c) break;
        if (c.build !== bd.id) bd.skipped++;
        bd.next++;
      }
      if (bd.next >= bd.cells.length) {
        if (sb.retry.length) { bd.cells.push(...sb.retry); sb.retry = []; }
        else if (!sb.wrong) {
          bd.done = true; bd.doneAt = game.time; sb.lastBuild = bd; sb.build = null; sb.phase = 'admire'; sb.t = 5 + game.rng() * 8; sb.n++;
          BT.say(game, b, 'done', { what: P.bpName(bd.bp) }, true);
          return BT.hold();
        } else return BT.hold();
      }
      const cell = bd.cells[bd.next];
      const stand = P.standFor(game, bd, cell);
      const cx = 2 * cell.i + 1, cy = 2 * cell.j + 1, cz = 2 * cell.k + 1;
      const reachH = Math.hypot(cx - pl.pos.x, cz - pl.pos.z);
      const far = Math.hypot(stand.x - pl.pos.x, stand.z - pl.pos.z);
      const reachMax = cell.j === 0 ? 10.5 : 8.5;                    // до пола дотянуться легче
      if (reachH > reachMax || (far > 3.5 && reachH > 6.5)) {
        m.goal = 'site';
        BT.progress(b, -far);
        return BT.walkTo(game, b, stand.x, stand.z, { near: 0.8 }) || BT.hold();
      }
      m.goal = 'build';
      const face = Math.atan2(cx - pl.pos.x, cz - pl.pos.z);
      if (sb.t > 0) return { mx: 0, mz: 0, jump: false, face };
      // высоко - подпрыгнуть и поставить в прыжке
      if (cy > pl.pos.y + 10) {
        if (pl.onGround) return { mx: 0, mz: 0, jump: true, face };
        if (cy > pl.pos.y + 10.5 || pl.vel.y > 8) return { mx: 0, mz: 0, jump: false, face };
      }
      const r = game.rng;
      // ошибка: блок в соседнюю клетку того же слоя, потом переставит
      if (!sb.wrong && r() < b.st.err * 0.8) {
        const di = r() < 0.5 ? (r() < 0.5 ? -1 : 1) : 0, dk = di ? 0 : (r() < 0.5 ? -1 : 1);
        const w = { i: cell.i + di, j: cell.j, k: cell.k + dk };
        const near = w.i >= bd.i0 - 1 && w.i <= bd.i1 + 1 && w.k >= bd.k0 - 1 && w.k <= bd.k1 + 1;
        const planned = bd.cells.some((c) => c.i === w.i && c.j === w.j && c.k === w.k);
        if (near && !planned && P.placeAt(game, w.i, w.j, w.k, cell.c, false, b.name, bd.id)) {
          sb.wrong = w; sb.t = 0.8 + r() * 1.2;
          return { mx: 0, mz: 0, jump: false, face };
        }
      }
      if (P.cellFree(game, cell.i, cell.j, cell.k)) {
        if (P.placeAt(game, cell.i, cell.j, cell.k, cell.c, false, b.name, bd.id)) bd.next++;
        else { sb.t = 1; m.goal = 'wait'; return BT.hold(); }          // лимит - подождать
      } else if (!st.cells.has(cellKey(cell.i, cell.j, cell.k))) {
        // в клетке стоит сам - отойти на место; кто-то другой - поставить позже (не больше трёх раз)
        const hx = B.engine.PHYS.HX + 1.1;
        if (Math.abs(pl.pos.x - cx) < hx && Math.abs(pl.pos.z - cz) < hx) { m.goal = 'site'; return BT.walkTo(game, b, stand.x, stand.z, { near: 0.3 }) || BT.hold(); }
        cell.tries = (cell.tries || 0) + 1;
        if (cell.tries <= 3) sb.retry.push(cell); else bd.skipped++;
        bd.next++;
        const p = game.player && game.player.pos;
        if (p && Math.hypot(p.x - cx, p.z - cz) < 3) BT.say(game, b, 'move');
      }
      BT.progress(b, bd.next * 10);
      sb.t = B.lerp(b.st.pause[0], b.st.pause[1], r()) * 0.6 + 0.3;
      return { mx: 0, mz: 0, jump: false, face };
    },
    botPath: () => null,
    botChatVars(game, b) {
      const bd = b.sb && (b.sb.build || b.sb.lastBuild);
      return { what: bd ? P.bpName(bd.bp) : null };
    },
    // Контрольная точка бота - свободное место рядом с его стройкой (или у старта)
    botCheckpoint(game, b) {
      const bd = b.sb && b.sb.build, base = bd ? { x: 2 * bd.i0 - 4, z: 2 * bd.k0 - 4 } : P.botSpawn(game, b.i);
      for (let rr = 0; rr < 12; rr += 2) for (let a = 0; a < 8; a++) {
        const x = base.x + Math.cos(a * 0.785) * rr, z = base.z + Math.sin(a * 0.785) * rr;
        if (game.world.boxFree(x - 1, 0.05, z - 1, x + 1, 5.2, z + 1)) return { x, y: 0, z, idx: 0 };
      }
      return { x: base.x, y: 0, z: base.z, idx: 0 };
    },
    step(game, dt) {
      const st = game.state;
      // готовые постройки ботов стареют и разбираются по блоку сверху
      st.decayT = (st.decayT || 0) - dt;
      for (const bd of st.builds.values()) if (bd.done && !bd.decay && game.time - bd.doneAt > BUILD_TTL) bd.decay = true;
      if (st.decayT <= 0) {
        st.decayT = 0.25;
        for (const bd of Array.from(st.builds.values())) {
          if (!bd.decay) continue;
          let top = null;
          for (const c of st.cells.values()) if (c.build === bd.id && c.owner && (!top || c.j > top.j)) top = c;
          if (!top) { st.builds.delete(bd.id); continue; }
          P.removeAt(game, top.i, top.j, top.k, top.owner);
        }
      }
      // кнопка «Оставить» показывает, сколько блоков у ботов
      st.keepT -= dt;
      if (st.keepT <= 0) { st.keepT = 0.5; P.updateKeep(game); }
    },
    updateKeep(game) {
      const el = document.getElementById('hb-keep');
      if (!el) return;
      const n = game.state.botBlocks;
      el.hidden = !n;
      el.textContent = (B.lang() === 'en' ? 'Keep bot builds' : 'Оставить постройки ботов') + ' (' + n + ')';
    },

    dispose(game) { document.getElementById('g-hotbar').hidden = true; },
    shots: [
      { cam: [-14, 16, 50], look: [-26, 3, 26] },
      { cam: [20, 30, 40], look: [0, 0, 0] },
      { cam: [-50, 12, 10], look: [-30, 4, 30] },
    ],
    thumbAvatar: { x: -22, y: 0, z: 40, facing: 0.9 },
    thumb: { cam: [-4, 9, 56], look: [-30, 4, 30] },
    completeScript(game) {
      for (let n = 0; n < 25; n++) P.placeAt(game, 10 + (n % 5), Math.floor(n / 25), 10 + Math.floor(n / 5), n % 12);
    },
  };
})(window.Blox);
