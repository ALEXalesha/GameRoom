// «Обби: Башня»: восемь этапов вверх вокруг башни, по стороне на этап, контрольные точки на углах.
// Этапы: прыжки, лава, ездящие плиты, исчезающие плиты, батуты, конвейеры, крутилки, финал.
// Внизу - море лавы, наверху, на крыше башни, кубок и финиш.
'use strict';
(function (B) {
  const K = B.kit;
  const CORNERS = [[-22, 22], [22, 22], [22, -22], [-22, -22]];
  const H = (k) => 1 + 10 * k;                  // верх плиты k-го угла
  const STAGES = ['Прыжки', 'Лава', 'Ездящие плиты', 'Исчезающие плиты', 'Батуты', 'Конвейеры', 'Крутилки', 'Финал'];
  const STAGES_EN = ['Jumps', 'Lava', 'Moving tiles', 'Vanishing tiles', 'Trampolines', 'Conveyors', 'Spinners', 'Final'];

  // Локальные координаты стороны k: s - вдоль пути (0..44), l - наружу от башни, h - над плитой угла
  function side(k) {
    const a = CORNERS[k % 4], b = CORNERS[(k + 1) % 4];
    const dir = [(b[0] - a[0]) / 44, (b[1] - a[1]) / 44];
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], ml = Math.hypot(mid[0], mid[1]);
    const n = [mid[0] / ml, mid[1] / ml];
    const along = Math.abs(dir[0]) > 0.5 ? 'x' : 'z';
    return {
      k, dir, n, along,
      at: (s, l) => [a[0] + dir[0] * s + n[0] * l, a[1] + dir[1] * s + n[1] * l],
      size: (ls, ll, h) => (along === 'x' ? [ls, h, ll] : [ll, h, ls]),
      vec: (vs, vl) => ({ x: dir[0] * vs + n[0] * vl, z: dir[1] * vs + n[1] * vl }),
    };
  }

  const P = B.places.obby = {
    bots: 4,
    statLabel: () => (B.lang() === 'en' ? 'Stage' : 'Этап'),
    stat: (g, b) => (b ? b.stat : g.state.done ? 9 : g.state.cp + 1),
    statFmt: (v) => (v >= 9 ? '★' : String(v)),
    sky: { top: '#3a86e0', horizon: '#d6ecff' },

    build(game) {
      const w = game.world, st = game.state;
      w.voidY = -30;
      const path = game.path = [];
      // море лавы и остров-лобби
      w.add({ top: [0, -2, 0], size: [600, 2, 600], color: '#ff6a2a', mat: 'lava', kill: true, tag: 'lava' });
      const lobby = w.add({ top: [-30, 1, 30], size: [24, 3, 24], color: '#56b05a', mat: 'plastic', tag: 'lobby' });
      w.add({ top: [-30, -2, 30], size: [26, 1, 26], color: '#c98d5e', mat: 'smooth', solid: false });
      path.push(lobby);
      K.decal(game, B.lang() === 'en' ? 'START' : 'СТАРТ', -30, 1, 30, 6, 3, '#2f74d0', '#fff');
      K.tree(game, -38, 1, 38); K.tree(game, -38, 1, 24, 0.8); K.pine(game, -24, 1, 39, 0.9);
      // башня
      w.add({ top: [0, H(8), 0], size: [24, H(8) + 2, 24], color: '#8a8d93', mat: 'plastic', tag: 'core' });
      for (let i = 1; i < 8; i++) w.add({ top: [0, H(i) - 2, 0], size: [24.4, 0.8, 24.4], color: '#6d7078', mat: 'smooth', solid: false });

      st.pads = [];
      const pad = (k) => {
        const c = CORNERS[k % 4];
        const p = K.checkpoint(game, k, c[0], H(k), c[1], 8, 8, (n, part) => P.reach(game, n, part));
        st.pads[k] = p;
        return p;
      };
      const plat = (sd, k, s, l, h, ls, ll, color, extra) => {
        const [x, z] = sd.at(s, l);
        return w.add(Object.assign({ top: [x, H(k) + h, z], size: sd.size(ls, ll, 1), color }, extra || {}));
      };

      for (let k = 0; k < 8; k++) {
        const sd = side(k);
        const seg = [];
        if (k > 0) seg.push(pad(k));
        const C = ['#ff9d3b', '#ff5c5c', '#2f74d0', '#8a5cf5', '#3fae4a', '#ffd23f', '#3fd0c4', '#ff8fd0'][k];
        if (k === 0) {                                          // прыжки
          [[8, 0, 2], [14.5, 1.5, 4], [21, -1.5, 6], [27.5, 1, 7.5], [34, 0, 9]].forEach(([s, l, h]) => seg.push(plat(sd, k, s, l, h, 4, 4, C)));
        } else if (k === 1) {                                   // лава: дорожки с красными полосами
          const a = plat(sd, k, 9, 0, 2, 10, 5, '#c9ccd1'); seg.push(a);
          const b = plat(sd, k, 21, 0, 5, 10, 5, '#c9ccd1'); seg.push(b);
          const c = plat(sd, k, 33, 0, 8, 10, 5, '#c9ccd1'); seg.push(c);
          for (const [s, h] of [[9, 2], [19, 5], [23, 5], [31, 8], [35, 8]]) {
            const [x, z] = sd.at(s, 0);
            w.add({ top: [x, H(k) + h + 0.4, z], size: sd.size(1.4, 5, 0.4), color: '#ff2a2a', mat: 'neon', kill: true, tag: 'killbar' });
          }
        } else if (k === 2) {                                   // ездящие плиты
          seg.push(plat(sd, k, 8, 0, 2, 4, 4, C));
          const [x1, z1] = sd.at(17, 0), v1 = sd.vec(1, 0);
          seg.push(w.add({ top: [x1, H(k) + 4, z1], size: sd.size(4, 4, 1), color: '#f2f3f3', move: (t) => ({ x: x1 + v1.x * Math.sin(t * 1.3) * 3.5, y: H(k) + 3.5, z: z1 + v1.z * Math.sin(t * 1.3) * 3.5 }) }));
          const [x2, z2] = sd.at(26, 0), v2 = sd.vec(0, 1);
          seg.push(w.add({ top: [x2, H(k) + 6, z2], size: sd.size(4, 4, 1), color: '#f2f3f3', move: (t) => ({ x: x2 + v2.x * Math.sin(t * 1.1 + 1) * 4, y: H(k) + 5.5 + Math.sin(t * 0.9) * 0.8, z: z2 + v2.z * Math.sin(t * 1.1 + 1) * 4 }) }));
          seg.push(plat(sd, k, 33.5, 0, 8, 4, 4, C));
        } else if (k === 3) {                                   // исчезающие плиты
          [8, 13.5, 19, 24.5, 30, 35.5].forEach((s, i) => seg.push(plat(sd, k, s, i % 2 ? 1 : -1, 1.5 * (i + 1), 3, 3, '#79c7ff', { mat: 'glass', fade: true })));
        } else if (k === 4) {                                   // батуты
          seg.push(plat(sd, k, 9, 0, -2, 4, 4, '#3fe07a', { mat: 'neon', bounce: 72, tag: 'tramp' }));
          seg.push(plat(sd, k, 17, 0, 7, 4, 4, C));
          seg.push(plat(sd, k, 25, 0, 4, 4, 4, '#3fe07a', { mat: 'neon', bounce: 72, tag: 'tramp' }));
          seg.push(plat(sd, k, 34, 0, 9, 6, 5, C));
        } else if (k === 5) {                                   // конвейеры
          const c1 = sd.vec(-8, 0), c2 = sd.vec(0, 6), c3 = sd.vec(8, 0);
          seg.push(plat(sd, k, 12, 0, 2, 12, 4, '#2b2d31', { conveyor: { x: c1.x, z: c1.z }, tag: 'conveyor' }));
          seg.push(plat(sd, k, 27, 0, 5, 12, 4, '#2b2d31', { conveyor: { x: c2.x, z: c2.z }, tag: 'conveyor' }));
          seg.push(plat(sd, k, 36, 0, 8, 4, 4, '#2b2d31', { conveyor: { x: c3.x, z: c3.z }, tag: 'conveyor' }));
        } else if (k === 6) {                                   // крутилки
          const a = plat(sd, k, 10, 0, 2, 10, 8, C); seg.push(a);
          const b = plat(sd, k, 23, 0, 5, 10, 8, C); seg.push(b);
          seg.push(plat(sd, k, 34, 0, 8, 6, 5, C));
          for (const [s, h, sp] of [[10, 2, 1.7], [23, 5, -2.1]]) {
            const [x, z] = sd.at(s, 0);
            w.add({ pos: [x, H(k) + h + 0.7, z], size: [9, 0.8, 0.8], color: '#ff2a2a', mat: 'neon', kill: true, spin: sp, solid: false, tag: 'spinner' });
            w.add({ top: [x, H(k) + h + 1.2, z], size: [0.8, 1.2, 0.8], color: '#4b4e55', mat: 'smooth' });
          }
        } else {                                                // финал: узкие балки и столбики
          seg.push(plat(sd, k, 10, 0, 2, 10, 1.3, '#f2f3f3'));
          seg.push(plat(sd, k, 17.5, 0, 4, 2, 2, C));
          seg.push(plat(sd, k, 24, 2, 5, 9, 1.3, '#f2f3f3'));
          [[30.5, 2, 6.5], [33.5, 0, 8], [36.5, 0, 9]].forEach(([s, l, h]) => seg.push(plat(sd, k, s, l, h, 1.6, 1.6, C)));
        }
        path.push(...seg);
      }
      // вершина: угловая плита 8 (на месте угла 0), мост и крыша башни с кубком
      const top = w.add({ top: [-22, H(8), 22], size: [8, 1, 8], color: '#ffd23f', tag: 'top' });
      path.push(top);
      w.add({ top: [-15, H(8), 15], size: [8, 1, 8], color: '#ffd23f' });
      const fin = w.add({ top: [0, H(8) + 0.4, 0], size: [8, 0.4, 8], color: '#ffc21a', mat: 'neon', tag: 'finish' });
      fin.onTouch = (g, p, body) => { if (body === g.player) P.finish(g); };
      K.decal(game, B.lang() === 'en' ? 'FINISH' : 'ФИНИШ', 0, H(8) + 0.4, 0, 6, 3, '#d62d2d', '#fff');
      path.push(fin);
      K.trophy(game, 7, H(8), -7);
      st.finishPart = fin;
      game.spawn = { x: -30, y: 1, z: 30, facing: Math.PI / 2 };
    },
    setup(game) {
      Object.assign(game.state, { cp: 0, t: 0, running: false, done: false, botNext: [] });
      game.bots.forEach((b, i) => { b.stat = 1; game.state.botNext[i] = 10 + game.rng() * 20; });
    },
    start(game) { game.centerMsg(B.lang() === 'en' ? 'Reach the top of the tower!' : 'Доберись до вершины башни!', 2500); },
    reach(game, n, part) {
      const st = game.state;
      if (n <= st.cp) return;
      st.cp = n;
      K.lightCheckpoint(part);
      B.sound.play('checkpoint');
      game.centerMsg((B.lang() === 'en' ? 'Stage ' : 'Этап ') + (n + 1) + ': ' + (B.lang() === 'en' ? STAGES_EN : STAGES)[n], 1800);
    },
    step(game, dt) {
      const st = game.state, p = game.player.pos;
      if (!st.running && !st.done && Math.hypot(p.x + 30, p.z - 30) > 10) st.running = true;
      if (st.running) st.t += dt;
      // боты поднимаются по этапам
      game.bots.forEach((b, i) => {
        st.botNext[i] -= dt;
        if (st.botNext[i] <= 0 && b.stat < 8) {
          st.botNext[i] = 18 + game.rng() * 30;
          b.stat++;
          const c = CORNERS[(b.stat - 1) % 4];
          b.body.teleport(c[0] + (game.rng() - 0.5) * 3, H(b.stat - 1), c[1] + (game.rng() - 0.5) * 3);
        }
      });
    },
    botSpawn: (game, i) => ({ x: -34 + i * 2.5, y: 1, z: 26 + (i % 2) * 5 }),
    botArea(game, b) {
      if (b.stat <= 1) return { x: -30, z: 30, r: 8 };
      const c = CORNERS[(b.stat - 1) % 4];
      return { x: c[0], z: c[1], r: 2.2 };
    },
    respawnPoint(game) {
      const k = game.state.cp;
      if (k === 0) return game.spawn;
      const c = CORNERS[k % 4];
      return { x: c[0], y: H(k), z: c[1], facing: game.player.facing };
    },
    finish(game) {
      const st = game.state;
      if (st.done) return;
      st.done = true; st.running = false;
      const r = K.finishRun(game, st.t, { complete: true });
      game.showResult({
        title: B.lang() === 'en' ? 'You reached the top!' : 'Ты на вершине!',
        sub: B.lang() === 'en' ? 'Tower Obby completed' : 'Обби пройдено',
        medal: r.medal, reward: r.reward, record: r.record,
        rows: [[B.lang() === 'en' ? 'Time' : 'Время', B.fmtTime(st.t)], [B.t('your_best'), B.fmtTime(B.acct.placeStats('obby').best)]],
      });
    },
    restart(game) {
      const st = game.state;
      st.cp = 0; st.t = 0; st.running = false; st.done = false;
      game.respawn();
    },
    hud(game) {
      const st = game.state;
      const stage = Math.min(8, st.cp + 1);
      return `<div class="hud-pill"><span>${B.lang() === 'en' ? 'Stage' : 'Этап'} <b>${stage}</b>/8</span><span class="hud-sep"></span><span>${B.fmtTime(st.t)}</span></div>`;
    },
    // Кадры для карточки и страницы места
    shots: [
      { cam: [-58, 30, 62], look: [-4, 20, 4] },
      { cam: [40, 60, 40], look: [0, 45, 0] },
      { cam: [-44, 88, -44], look: [0, 80, 0] },
    ],
    thumbAvatar: { x: -30, y: 1, z: 30, facing: -0.8 },
    // Тест «место можно пройти»: пройти этап за этапом (контрольные точки), потом финиш
    completeScript(game) {
      for (let k = 1; k < 8; k++) { const c = CORNERS[k % 4]; game.player.teleport(c[0], H(k) + 0.01, c[1]); for (let i = 0; i < 3; i++) game.fixedStep(B.STEP); }
      game.player.teleport(0, H(8) + 0.5, 0);
      for (let i = 0; i < 3; i++) game.fixedStep(B.STEP);
    },
  };
})(window.Blox);
