// Персонаж: кубический, шесть частей (голова, туловище, 2 руки, 2 ноги), начало координат - в ступнях,
// лицом смотрит в +Z. Цвета частей, лицо, рубашка, штаны, шапка, причёска, очки, вещь на спине.
'use strict';
(function (B) {
  const A = B.avatar = {};
  const matCache = {};
  function lambert(color, opt = {}) {
    const key = color + JSON.stringify(opt);
    if (!matCache[key]) { matCache[key] = new THREE.MeshLambertMaterial(Object.assign({ color }, opt)); matCache[key].userData.shared = true; }
    return matCache[key];
  }
  function phong(color, opt = {}) {
    const key = 'p' + color + JSON.stringify(opt);
    if (!matCache[key]) { matCache[key] = new THREE.MeshPhongMaterial(Object.assign({ color, shininess: 40, specular: 0x333333 }, opt)); matCache[key].userData.shared = true; }
    return matCache[key];
  }
  const geoCache = {};
  const keep = (g) => { g.userData.shared = true; return g; };
  function box(w, h, d) { const k = 'b' + w + ',' + h + ',' + d; return geoCache[k] || (geoCache[k] = keep(new THREE.BoxGeometry(w, h, d))); }
  function cyl(rt, rb, h, seg = 20, open = false) { const k = 'c' + [rt, rb, h, seg, open]; return geoCache[k] || (geoCache[k] = keep(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open))); }
  function mesh(geo, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; return m; }

  const HEAD_R = 0.62, HEAD_H = 1.2;
  const HEAD_GEO = new THREE.CylinderGeometry(HEAD_R, HEAD_R, HEAD_H, 28, 1, false, Math.PI, Math.PI * 2);
  HEAD_GEO.userData.shared = true;

  // Ящик части тела с развёрткой под атлас 3x2 и без групп: один материал - одна отрисовка
  function atlasBox(w, h, d) {
    const k = 'ab' + w + ',' + h + ',' + d;
    if (geoCache[k]) return geoCache[k];
    const g = new THREE.BoxGeometry(w, h, d), uv = g.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) {
      const f = Math.floor(i / 4), col = f % 3, row = Math.floor(f / 3);
      uv.setXY(i, (col + uv.getX(i)) / 3, 1 - (row + 1) / 2 + uv.getY(i) / 2);
    }
    g.clearGroups();
    return (geoCache[k] = keep(g));
  }
  function clothMat(part, color, shirt, pants) {
    const t = B.tex.clothingAtlas(part, color, shirt, pants), key = 'atlas' + t.uuid;
    if (!matCache[key]) { matCache[key] = new THREE.MeshLambertMaterial({ map: t }); matCache[key].userData.shared = true; }
    return matCache[key];
  }
  // Голова: боковина с лицом, крышки - цветом кожи из той же текстуры (угол слева, где затылок)
  const HEAD_ONE = HEAD_GEO.clone();
  (function () {
    const uv = HEAD_ONE.getAttribute('uv'), side = HEAD_GEO.groups[0];
    const idx = HEAD_ONE.index, capStart = side.start + side.count, seen = new Set();
    for (let n = capStart; n < idx.count; n++) { const v = idx.getX(n); if (!seen.has(v)) { seen.add(v); uv.setXY(v, 0.01, 0.5); } }
    HEAD_ONE.clearGroups();
    HEAD_ONE.userData.shared = true;
  })();
  function headMat(faceTex) {
    const key = 'head' + faceTex.uuid;
    if (!matCache[key]) { matCache[key] = new THREE.MeshLambertMaterial({ map: faceTex }); matCache[key].userData.shared = true; }
    return matCache[key];
  }
  // Вещь из нескольких деталей - одна сетка с цветами вершин (одна отрисовка)
  const vcMat = {};
  function mergeItem(src) {
    src.updateMatrixWorld(true);
    const pos = [], nor = [], col = [], c = new THREE.Color();
    let double = false;
    src.traverse((o) => {
      if (!o.isMesh) return;
      const geo = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(o.matrixWorld);
      if (!geo.getAttribute('normal')) geo.computeVertexNormals();
      const p = geo.getAttribute('position'), nn = geo.getAttribute('normal');
      c.copy(o.material.color || c.set('#ffffff'));
      if (o.material.side === THREE.DoubleSide) double = true;
      for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(nn.getX(i), nn.getY(i), nn.getZ(i)); col.push(c.r, c.g, c.b); }
      geo.dispose();
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeBoundingSphere();
    g.userData.shared = true;
    const key = double ? 'd' : 's';
    if (!vcMat[key]) { vcMat[key] = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 40, specular: 0x333333, side: double ? THREE.DoubleSide : THREE.FrontSide }); vcMat[key].userData.shared = true; }
    return new THREE.Mesh(g, vcMat[key]);
  }
  const itemCache = {};
  function itemMesh(id, c) {
    const key = id + (c || '');
    if (!itemCache[key]) { const tmp = new THREE.Group(); ACC[id](tmp, c); itemCache[key] = mergeItem(tmp); }
    const m = new THREE.Mesh(itemCache[key].geometry, itemCache[key].material);
    m.castShadow = false;
    return m;
  }

  // ---------- Аксессуары: строятся от шеи (голова: центр y=0.6, макушка 1.2) или от центра туловища ----------
  const ACC = {
    hat_cap(g) {
      g.add(mesh(cyl(0.66, 0.66, 0.34), phong('#d62d2d'), 0, 1.22, 0));
      g.add(mesh(cyl(0.2, 0.2, 0.06), phong('#d62d2d'), 0, 1.42, 0));
      const visor = mesh(box(0.9, 0.08, 0.6), phong('#f2f3f3'), 0, 1.1, 0.72); g.add(visor);
    },
    hat_beanie(g) {
      g.add(mesh(cyl(0.6, 0.67, 0.5), phong('#3fd0c4'), 0, 1.28, 0));
      g.add(mesh(cyl(0.68, 0.68, 0.16), phong('#f2f3f3'), 0, 1.06, 0));
      g.add(mesh(new THREE.SphereGeometry(0.2, 12, 8), phong('#f2f3f3'), 0, 1.62, 0));
    },
    hat_top(g) {
      g.add(mesh(cyl(0.95, 0.95, 0.07), phong('#1f2227'), 0, 1.2, 0));
      g.add(mesh(cyl(0.55, 0.55, 1.0), phong('#1f2227'), 0, 1.72, 0));
      g.add(mesh(cyl(0.56, 0.56, 0.16), phong('#d62d2d'), 0, 1.34, 0));
    },
    hat_cowboy(g) {
      const brim = mesh(cyl(1.15, 1.15, 0.08), phong('#8e5a3a'), 0, 1.16, 0); brim.scale.z = 0.85; g.add(brim);
      g.add(mesh(cyl(0.5, 0.6, 0.55), phong('#8e5a3a'), 0, 1.45, 0));
      g.add(mesh(cyl(0.61, 0.61, 0.12), phong('#5a3a28'), 0, 1.25, 0));
    },
    hat_wizard(g) {
      g.add(mesh(cyl(1.0, 1.0, 0.07), phong('#5b2f9e'), 0, 1.18, 0));
      const cone = mesh(new THREE.ConeGeometry(0.66, 1.7, 20), phong('#5b2f9e'), 0, 2.05, -0.05); cone.rotation.x = -0.12; g.add(cone);
      g.add(mesh(box(0.22, 0.22, 0.05), phong('#ffd23f', { emissive: 0x554400 }), 0.2, 1.7, 0.52));
    },
    hat_headphones(g) {
      const band = mesh(new THREE.TorusGeometry(0.72, 0.07, 8, 24, Math.PI), phong('#1f2227'), 0, 0.72, 0); g.add(band);
      for (const s of [-1, 1]) { const cup = mesh(cyl(0.3, 0.3, 0.22), phong('#ff5c5c'), s * 0.72, 0.62, 0); cup.rotation.z = Math.PI / 2; g.add(cup); }
    },
    hat_halo(g) {
      const h = mesh(new THREE.TorusGeometry(0.55, 0.07, 8, 28), new THREE.MeshBasicMaterial({ color: 0xffe066 }), 0, 1.6, 0);
      h.rotation.x = Math.PI / 2; h.castShadow = false; g.add(h);
    },
    hat_crown(g) {
      g.add(mesh(cyl(0.58, 0.6, 0.3, 20, true), phong('#ffc21a', { side: THREE.DoubleSide, shininess: 90, specular: 0x886600 }), 0, 1.33, 0));
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2, sp = mesh(new THREE.ConeGeometry(0.12, 0.3, 4), phong('#ffc21a', { shininess: 90 }), Math.sin(a) * 0.55, 1.62, Math.cos(a) * 0.55); g.add(sp);
      }
      g.add(mesh(box(0.14, 0.14, 0.05), phong('#d62d2d'), 0, 1.33, 0.6));
    },
    hair_spiky(g, c) {
      const m = phong(c || '#5a3a28');
      g.add(mesh(cyl(0.66, 0.66, 0.3), m, 0, 1.12, -0.02));
      const r = B.rng(11);
      for (let i = 0; i < 9; i++) {
        const sp = mesh(new THREE.ConeGeometry(0.2, 0.55, 4), m, (r() - 0.5) * 0.9, 1.4, (r() - 0.5) * 0.9 - 0.05);
        sp.rotation.set((r() - 0.5) * 0.8, r() * 3, (r() - 0.5) * 0.8); g.add(sp);
      }
    },
    hair_bob(g, c) {
      const m = phong(c || '#1f2227');
      g.add(mesh(cyl(0.7, 0.7, 0.28), m, 0, 1.22, 0));
      g.add(mesh(box(1.42, 1.0, 0.5), m, 0, 0.7, -0.45));
      for (const s of [-1, 1]) g.add(mesh(box(0.2, 0.95, 0.9), m, s * 0.66, 0.72, -0.1));
      g.add(mesh(box(1.1, 0.22, 0.2), m, 0, 1.05, 0.58));
    },
    hair_ponytail(g, c) {
      const m = phong(c || '#ff9d3b');
      g.add(mesh(cyl(0.68, 0.68, 0.26), m, 0, 1.2, 0));
      g.add(mesh(box(0.5, 0.2, 0.35), m, 0, 1.02, -0.62));
      const tail = mesh(box(0.34, 1.0, 0.3), m, 0, 0.55, -0.8); tail.rotation.x = 0.25; g.add(tail);
    },
    acc_glasses(g) {
      const m = phong('#1f2227');
      for (const s of [-1, 1]) g.add(mesh(box(0.34, 0.26, 0.06), m, s * 0.24, 0.72, 0.64));
      g.add(mesh(box(0.2, 0.05, 0.05), m, 0, 0.76, 0.64));
      for (const s of [-1, 1]) g.add(mesh(box(0.05, 0.05, 0.62), m, s * 0.43, 0.76, 0.34));
    },
    back_backpack(g) {
      g.add(mesh(box(1.4, 1.5, 0.6), phong('#ff9d3b'), 0, -0.1, -0.82));
      g.add(mesh(box(1.0, 0.5, 0.2), phong('#d6792a'), 0, -0.45, -1.15));
      for (const s of [-1, 1]) g.add(mesh(box(0.2, 1.8, 0.08), phong('#5a3a28'), s * 0.5, 0.1, 0.52));
    },
    back_sword(g) {
      const s = new THREE.Group(); s.position.set(0, 0, -0.62); s.rotation.z = 0.6;
      s.add(mesh(box(0.22, 2.6, 0.08), phong('#dfe6ee', { shininess: 120, specular: 0xffffff }), 0, 0.5, 0));
      s.add(mesh(box(0.8, 0.14, 0.16), phong('#ffc21a'), 0, -0.8, 0));
      s.add(mesh(box(0.16, 0.6, 0.16), phong('#5a3a28'), 0, -1.15, 0));
      g.add(s);
    },
    back_wings(g) {
      for (const s of [-1, 1]) {
        const w = new THREE.Group(); w.position.set(s * 0.3, 0.3, -0.6); w.rotation.y = s * 0.5; w.rotation.z = s * -0.25;
        w.add(mesh(box(1.9, 1.1, 0.1), phong('#f2f3f3'), s * 0.95, 0.2, 0));
        w.add(mesh(box(1.4, 0.8, 0.1), phong('#e3e8f0'), s * 0.8, -0.55, 0));
        w.add(mesh(box(0.9, 0.6, 0.1), phong('#d6dde8'), s * 0.6, -1.1, 0));
        g.add(w);
      }
    },
  };
  A.accessoryIds = Object.keys(ACC);

  A.build = function (cfg, opt = {}) {
    cfg = Object.assign(B.data.defaultAvatar(), cfg || {});
    const col = cfg.colors;
    const root = new THREE.Group();
    const body = new THREE.Group(); root.add(body);        // для покачивания в танце
    const parts = {}, pivots = {};

    const torso = mesh(atlasBox(2, 2, 1), clothMat('torso', col.torso, cfg.shirt, cfg.pants), 0, 3, 0);
    torso.userData = { part: 'torso', color: col.torso }; body.add(torso); parts.torso = torso;

    const neck = new THREE.Group(); neck.position.set(0, 4, 0); body.add(neck); pivots.neck = neck;
    const faceTex = B.tex.face(cfg.face, col.head);
    const head = mesh(HEAD_ONE, headMat(faceTex), 0, 0.6, 0);
    head.userData = { part: 'head', color: col.head, face: cfg.face }; neck.add(head); parts.head = head;

    function limb(name, x, y, color, kind) {
      const p = new THREE.Group(); p.position.set(x, y, 0); body.add(p);
      const m = mesh(atlasBox(1, 2, 1), clothMat(kind, color, cfg.shirt, cfg.pants), 0, -(kind === 'arm' ? 0.5 : 1), 0);
      if (kind === 'arm') m.castShadow = false;                   // тень - от туловища, головы и ног
      if (kind === 'arm') m.position.y = -0.5;
      m.userData = { part: name, color }; p.add(m);
      parts[name] = m; pivots[name] = p;
    }
    // Лицом в +Z: правая рука героя - на -X
    limb('armR', -1.5, 3.5, col.armR, 'arm');
    limb('armL', 1.5, 3.5, col.armL, 'arm');
    limb('legR', -0.5, 2, col.legR, 'leg');
    limb('legL', 0.5, 2, col.legL, 'leg');

    const items = [];
    for (const slot of ['hat', 'hair', 'faceAcc', 'back']) {
      const id = cfg[slot];
      if (!id || !ACC[id]) continue;
      const g = new THREE.Group(); g.userData = { item: id, slot };
      g.add(itemMesh(id));
      if (slot === 'back') { g.position.set(0, 3, 0); body.add(g); } else neck.add(g);
      items.push(id);
    }

    const ch = { root, body, parts, pivots, items, cfg, phase: 0, t: 0 };
    ch.meshes = () => { const out = []; root.traverse((o) => { if (o.isMesh) out.push(o); }); return out; };
    ch.setVisible = (v) => { body.visible = v; };
    // state: { speed (0..1+), air, vy, emote, dt }
    ch.pose = function (st) {
      ch.t += st.dt;
      const P = pivots;
      let aL = 0, aR = 0, lL = 0, lR = 0, bob = 0, headYaw = 0, armZ = 0;
      if (st.emote === 'dance') {
        const s = Math.sin(ch.t * 8);
        aL = Math.PI * 0.9 + s * 0.3; aR = Math.PI * 0.9 - s * 0.3; lL = s * 0.4; lR = -s * 0.4; bob = Math.abs(s) * 0.25; headYaw = s * 0.3;
      } else if (st.emote === 'wave') {
        aR = Math.PI * 0.85; armZ = Math.sin(ch.t * 10) * 0.35;
      } else if (st.air) {
        aL = aR = Math.PI * 0.95;                     // классическая поза прыжка: руки вверх
        lL = 0.25; lR = -0.1;
      } else if (st.speed > 0.05) {
        ch.phase += st.dt * (6 + 6 * Math.min(1.6, st.speed));
        const s = Math.sin(ch.phase) * Math.min(1, st.speed) * 0.95;
        aL = s; aR = -s; lL = -s; lR = s;
      } else {
        const s = Math.sin(ch.t * 1.6) * 0.05;
        aL = s; aR = -s;
      }
      const k = Math.min(1, st.dt * 18);
      P.armL.rotation.x += (aL - P.armL.rotation.x) * k;
      P.armR.rotation.x += (aR - P.armR.rotation.x) * k;
      P.legL.rotation.x += (lL - P.legL.rotation.x) * k;
      P.legR.rotation.x += (lR - P.legR.rotation.x) * k;
      P.armR.rotation.z += (armZ - P.armR.rotation.z) * k;
      body.position.y += (bob - body.position.y) * k;
      P.neck.rotation.y += (headYaw - P.neck.rotation.y) * k;
    };
    ch.dispose = () => {
      root.traverse((o) => { if (o.isMesh) { const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) if (!Object.values(matCache).includes(m)) m.dispose(); } });
    };
    return ch;
  };

  // Отдельная вещь для картинки каталога
  A.buildItem = function (id) {
    const g = new THREE.Group();
    if (ACC[id]) g.add(itemMesh(id));
    return g;
  };
  // Сколько отрисовок даёт персонаж (для законов): сетки, у каждой - число групп материалов
  A.drawCalls = (ch) => { let n = 0; ch.root.traverse((o) => { if (o.isMesh && o.visible) n += Array.isArray(o.material) ? Math.max(1, o.geometry.groups.length) : 1; }); return n; };
})(window.Blox);
