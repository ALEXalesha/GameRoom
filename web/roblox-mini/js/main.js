// Запуск Блоксити и крючок для проверок window.__blox.
// Адрес: ?seed=N - повторяемые случайности; ?manual=1 - мир шагает только по команде проверки;
// ?fast=1 - короткий экран загрузки; ?place=id - сразу войти в место.
'use strict';
(function (B) {
  const E = B.engine, G = B.game, STEP = B.STEP;

  E.initRenderer(document.getElementById('gl'));
  G.bindInput();
  B.launcher.init();
  document.addEventListener('pointerdown', () => B.sound.resume(), { once: true });
  requestAnimationFrame(G.loop);
  if (B.params.place && B.places[B.params.place]) G.enter(B.params.place);

  // ---------- Проверка прыжка между соседними плитами пути (настоящая физика) ----------
  function tryJump(g, A, Bp) {
    const pl = g.player;
    const inside = (p, x, z, m) => x > p.minX + m && x < p.maxX - m && z > p.minZ + m && z < p.maxZ - m;
    const aimOn = () => {
      const m = (lo, hi) => (hi - lo > 2.2 ? 1 : (hi - lo) / 2);
      return { x: B.clamp(A.cx, Bp.minX + m(Bp.minX, Bp.maxX), Bp.maxX - m(Bp.minX, Bp.maxX)), z: B.clamp(A.cz, Bp.minZ + m(Bp.minZ, Bp.maxZ), Bp.maxZ - m(Bp.minZ, Bp.maxZ)) };
    };
    const reset = () => { for (const p of g.world.dyn) if (p.fade) { p.fade.state = 'solid'; p.solid = true; } };
    for (const wait of [0, 0.7, 1.4, 2.1, 2.8, 3.5, 4.2]) {
      for (let i = 0; i < Math.round(wait / STEP); i++) g.world.step(STEP);
      reset();
      const aim = aimOn();
      let base = { x: A.cx - aim.x, z: A.cz - aim.z };
      let bl = Math.hypot(base.x, base.z);
      if (bl < 0.01) { base = { x: 1, z: 0 }; bl = 1; }
      base = { x: base.x / bl, z: base.z / bl };
      let start = null;
      for (const run of [6, 4, 2.5]) {
        for (const ang of [0, 0.5, -0.5, 1, -1, 1.5, -1.5, Math.PI]) {
          const c = Math.cos(ang), s = Math.sin(ang);
          const dx = base.x * c - base.z * s, dz = base.x * s + base.z * c;
          const sx = aim.x + dx * run, sz = aim.z + dz * run;
          if (!inside(A, sx, sz, 0.95)) continue;
          if (!g.world.boxFree(sx - 0.9, A.maxY + 0.01, sz - 0.9, sx + 0.9, A.maxY + 5, sz + 0.9)) continue;
          start = { x: sx, z: sz }; break;
        }
        if (start) break;
      }
      if (!start) start = { x: B.clamp(aim.x, A.minX + 0.95, A.maxX - 0.95), z: B.clamp(aim.z, A.minZ + 0.95, A.maxZ - 0.95) };
      pl.teleport(start.x, A.maxY + 0.01, start.z); pl.lastLand = null;
      g.dead = false;
      let ok = false, n = 0, blocked = 0;
      for (; n < 60 * 5; n++) {
        const air = !pl.onGround;
        const tgt = air ? { x: Bp.cx, z: Bp.cz } : aimOn();
        let dx = tgt.x - pl.pos.x, dz = tgt.z - pl.pos.z; const d = Math.hypot(dx, dz) || 1;
        dx /= d; dz /= d;
        let jump = false;
        if (pl.onGround && pl.ground !== Bp) {
          const nx = pl.pos.x + pl.vel.x * STEP * 2, nz = pl.pos.z + pl.vel.z * STEP * 2;
          const onA = pl.ground === A;
          if (onA && !inside(A, nx, nz, -0.05) && n > 3) jump = true;
          if (Math.hypot(pl.vel.x, pl.vel.z) < 2 && n > 15) { blocked++; if (blocked > 3) jump = true; } else blocked = 0;
          if (d < 3.5 && Bp.maxY > pl.pos.y + 1.1) jump = true;
        }
        const ev = pl.step({ mx: d > 0.3 ? dx : 0, mz: d > 0.3 ? dz : 0, jump }, STEP);
        g.world.step(STEP);
        if (pl.lastLand === Bp) { ok = true; break; }
        if (pl.pos.y < Math.min(A.maxY, Bp.maxY) - 10 || ev.includes('kill') && !Bp.kill && false) break;
      }
      if (ok) return { ok: true, wait, steps: n };
    }
    return { ok: false };
  }

  function colorAt(tex, x, y) {
    const img = tex && tex.image;
    if (!img || !img.getContext) return null;
    const d = img.getContext('2d').getImageData(Math.round(x * (img.width - 1)), Math.round(y * (img.height - 1)), 1, 1).data;
    return '#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join('');
  }

  window.__blox = {
    ready: true,
    B, params: B.params,
    get screen() { return G.cur ? 'place' : G.loading ? 'loading' : 'launcher'; },
    get section() { return B.launcher.section; },
    get game() { return G.cur; },
    places: B.data.PLACES.map((p) => p.id),
    enter(id) { return !!G.enter(id, { instant: true }); },
    leave() { G.leave(); },
    // n шагов без рисования (быстро); until - шагать, пока условие не выполнится (не больше max)
    run(n = 1) { const g = G.cur; for (let i = 0; i < n; i++) g.fixedStep(STEP); },
    until(cond, max = 3600) { const g = G.cur; let n = 0; while (n < max && !cond(g)) { g.fixedStep(STEP); n++; } g.render(1, STEP); return n; },
    step(n = 1) { const g = G.cur; for (let i = 0; i < n; i++) g.fixedStep(STEP); g.render(1, STEP); g.drawHud(); g.drawBoard(); },
    player() { const p = G.cur.player; return { x: p.pos.x, y: p.pos.y, z: p.pos.z, vx: p.vel.x, vy: p.vel.y, vz: p.vel.z, onGround: p.onGround, dead: G.cur.dead, facing: p.facing }; },
    teleport(x, y, z) { G.cur.player.teleport(x, y, z); },
    key(code, down) { G.cur.keys[code] = down !== false; },
    state() { return G.cur.state; },
    balance() { return B.acct.balance(); },
    // Цвета частей героя в месте: и записанные в сетке, и снятые с текстуры (затылок головы, низ руки)
    meshColors() {
      const ch = G.cur.ch, out = {};
      for (const k of ['head', 'torso', 'armL', 'armR', 'legL', 'legR']) out[k] = ch.parts[k].userData.color;
      out.headPixel = colorAt(ch.parts.head.material.map, 0.01, 0.5);
      out.armLPixel = colorAt(ch.parts.armL.material.map, 0.5 / 3, 0.95 / 2);   // атлас 3x2: грань +x - левая верхняя клетка
      out.items = ch.items.slice();
      out.face = ch.parts.head.userData.face;
      return out;
    },
    nameplate() { const np = G.cur.np; np.updateMatrixWorld(true); const wp = np.getWorldPosition(new THREE.Vector3()); return { text: np.userData.text, visible: np.visible, y: wp.y - G.cur.ch.root.position.y }; },
    pathLength() { return (G.cur.path || []).length; },
    tryJump(i) {
      const g = G.cur, A = g.path[i], Bp = g.path[i + 1];
      g.safe = true;
      const r = tryJump(g, A, Bp);
      g.safe = false;
      return Object.assign({ i, a: A.tag + '@' + [A.cx, A.maxY, A.cz].map((v) => v.toFixed(1)).join(','), b: Bp.tag + '@' + [Bp.cx, Bp.maxY, Bp.cz].map((v) => v.toFixed(1)).join(',') }, r);
    },
    complete() { G.cur.place.completeScript(G.cur); },
    renderInfo() {
      const r = E.renderer, g = G.cur;
      return { shadows: r.shadowMap.enabled, pixelRatio: r.getPixelRatio(), fogFar: g && g.world.scene.fog.far, shadowSize: g && g.lights.sun.shadow.mapSize.x, clouds: g && g.skyObj.clouds && g.skyObj.clouds.visible, quality: B.effectiveQuality() };
    },
    // Замер кадров: средний и 1% худших (мс) за ms миллисекунд
    measure(ms) {
      return new Promise((res) => {
        const t = []; let last = performance.now(); const t0 = last;
        const f = (now) => { t.push(now - last); last = now; if (now - t0 < ms) requestAnimationFrame(f); else { t.shift(); const s = t.slice().sort((a, b) => a - b); const worst = s.slice(Math.floor(s.length * 0.99)); res({ frames: t.length, avg: t.reduce((a, b) => a + b, 0) / t.length, p99: worst.length ? worst.reduce((a, b) => a + b, 0) / worst.length : 0, max: s[s.length - 1] }); } };
        requestAnimationFrame(f);
      });
    },
  };
})(window.Blox);
