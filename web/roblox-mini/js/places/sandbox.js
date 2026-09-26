// «Песочница»: серая плита с шипами, блоки 2x2x2 по сетке. Инструменты внизу, как рюкзак:
// 1 - строить, 2 - ломать, 3 - красить; щелчок ЛКМ по миру. Постройка хранится в mix.blox.sandbox.
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

  const P = B.places.sandbox = {
    bots: 2,
    PALETTE, MAX,
    statLabel: () => (B.lang() === 'en' ? 'Blocks' : 'Блоки'),
    stat: (g, b) => (b ? b.stat : g.state.cells.size),
    sky: { top: '#3f8fe6', horizon: '#e7f2ff' },

    load() { const s = B.store.get('sandbox', { blocks: [], placed: 0 }); if (!Array.isArray(s.blocks)) s.blocks = []; return s; },
    save(game) {
      const st = game.state;
      B.store.set('sandbox', { blocks: Array.from(st.cells.values()).map((b) => [b.i, b.j, b.k, b.c]), placed: st.placed });
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
      Object.assign(st, { cells: new Map(), placed: saved.placed || 0, tool: 'build', color: 3, ghost: null, mouse: null });
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
      game.bots.forEach((b, i) => { b.stat = 12 + i * 23 + game.rng.int(20); });
    },
    start(game) {
      P.drawHotbar(game);
      game.centerMsg(B.lang() === 'en' ? 'Build! Click to place blocks, 1-3 switch tools' : 'Строй! Щелчок ставит блок, 1-3 - инструменты', 3000);
    },
    // Поставить блок в клетку (i, j, k): центр (2i+1, 2j+1, 2k+1)
    placeAt(game, i, j, k, c, silent) {
      const st = game.state, key = cellKey(i, j, k);
      if (st.cells.has(key) || st.cells.size >= MAX) return false;
      if (j < 0 || j > 60 || Math.abs(i) > HALF || Math.abs(k) > HALF) return false;
      const x = 2 * i + 1, y = 2 * j + 1, z = 2 * k + 1;
      if (!silent) {
        const p = game.player.pos, hx = B.engine.PHYS.HX;
        if (x + 1 > p.x - hx && x - 1 < p.x + hx && y + 1 > p.y && y - 1 < p.y + 5 && z + 1 > p.z - hx && z - 1 < p.z + hx) return false;
      }
      const part = game.world.add({ pos: [x, y, z], size: [2, 2, 2], visual: false, tag: 'block', data: { i, j, k } });
      st.cells.set(key, { i, j, k, c: B.clamp(c | 0, 0, PALETTE.length - 1), part });
      if (!silent) {
        st.placed++;
        B.sound.play('place');
        if (st.placed >= 25) B.acct.completeBadge('sandbox');
        P.refresh(game); P.save(game);
      }
      return true;
    },
    removeAt(game, i, j, k) {
      const st = game.state, key = cellKey(i, j, k), b = st.cells.get(key);
      if (!b) return false;
      game.world.remove(b.part);
      st.cells.delete(key);
      B.sound.play('pop');
      P.refresh(game); P.save(game);
      return true;
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
      hb.querySelectorAll('[data-tool]').forEach((b) => b.addEventListener('click', () => P.selectTool(game, b.dataset.tool)));
      hb.querySelectorAll('[data-col]').forEach((b) => b.addEventListener('click', () => { st.color = Number(b.dataset.col); B.sound.play('click'); P.drawHotbar(game); }));
    },
    hud(game) {
      const st = game.state;
      return `<div class="hud-pill"><span>${B.lang() === 'en' ? 'Blocks' : 'Блоков'} <b>${st.cells.size}</b></span><span class="hud-sep"></span><span>${B.lang() === 'en' ? 'Placed total' : 'Поставлено всего'} <b>${st.placed}</b>${st.placed < 25 ? '/25' : ' ★'}</span></div>`;
    },
    botArea: () => ({ x: 10, z: 10, r: 18 }),
    botSpawn: (g, i) => ({ x: 6 + i * 4, y: 0, z: 6 }),
    dispose(game) { document.getElementById('g-hotbar').hidden = true; },
    shots: [
      { cam: [-14, 16, 50], look: [-26, 3, 26] },
      { cam: [20, 30, 40], look: [0, 0, 0] },
      { cam: [-50, 12, 10], look: [-30, 4, 30] },
    ],
    thumbAvatar: { x: -24, y: 0, z: 40, facing: 2.6 },
    completeScript(game) {
      for (let n = 0; n < 25; n++) P.placeAt(game, 10 + (n % 5), Math.floor(n / 25), 10 + Math.floor(n / 5), n % 12);
    },
  };
})(window.Blox);
