// «Скоростной забег»: трасса вдоль +X над водой. Таймер - с линии старта до финиша, три
// контрольные точки, ускорители, узкие балки, батут, ездящие красные стенки. Медали по порогам.
'use strict';
(function (B) {
  const K = B.kit;
  const START_X = 10, FINISH_X = 312;
  const CPS = [{ x: 80, y: 0 }, { x: 150, y: 4 }, { x: 241, y: 6 }];

  const P = B.places.race = {
    bots: 3,
    statLabel: () => (B.lang() === 'en' ? 'Best' : 'Лучшее'),
    statAsc: true,
    stat: (g, b) => (b ? b.stat : B.acct.placeStats('race').best),
    statFmt: (v) => (v == null || !isFinite(v) ? '-' : v.toFixed(2)),
    sky: { top: '#2f7fe0', horizon: '#e4f3ff', sun: [0.3, 0.55, 0.6] },

    build(game) {
      const w = game.world, path = game.path = [];
      w.voidY = -6;
      w.add({ top: [150, -8, 0], size: [900, 1, 600], color: '#2f8fd8', mat: 'glass', solid: false, tag: 'water' });
      w.add({ top: [150, -20, 0], size: [900, 1, 600], color: '#1e5a8f', mat: 'smooth', solid: false });
      const plat = (x0, x1, y, z, wz, color, extra) => w.add(Object.assign({ top: [(x0 + x1) / 2, y, z], size: [x1 - x0, 1, wz], color }, extra || {}));
      // старт
      path.push(plat(-24, 11, 0, 0, 22, '#56b05a', { tag: 'start' }));
      K.decal(game, B.lang() === 'en' ? 'START' : 'СТАРТ', 6, 0, 0, 8, 4, '#2f74d0', '#fff', Math.PI / 2);
      for (const z of [-10, 10]) w.add({ top: [START_X, 9, z], size: [1.2, 9, 1.2], color: '#f2f3f3', mat: 'smooth' });
      w.add({ pos: [START_X, 9.6, 0], size: [1, 1.4, 21], color: '#2f74d0', mat: 'neon', solid: false });
      K.tree(game, -2, 0, -9, 0.8); K.tree(game, -6, 0, 9, 0.7);
      // A: широкие плиты с пропастями и ускоритель
      w.add({ top: [4, 0.1, 0], size: [4, 0.2, 6], color: '#3fe07a', mat: 'neon', speed: 1.4, tag: 'speed' });
      for (const [x0, x1] of [[16, 28], [33, 45], [50, 62], [67, 75]]) path.push(plat(x0, x1, 0, 0, 8, '#c9ccd1'));
      w.add({ top: [34, 0.1, 0], size: [3, 0.2, 5], color: '#3fe07a', mat: 'neon', speed: 1.2, tag: 'speed' });
      // КТ 1
      const cp = (i, x0, x1, y) => {
        const p = K.checkpoint(game, i + 1, (x0 + x1) / 2, y, 0, x1 - x0, 12, (n, part) => P.reach(game, n, part));
        path.push(p); return p;
      };
      cp(0, 75, 85, 0);
      // B: зигзаг узких балок
      path.push(plat(87, 101, 1, -3, 1.6, '#ff9d3b'));
      path.push(plat(101, 115, 2, 1, 1.6, '#ff9d3b'));
      path.push(plat(115, 129, 3, -3, 1.6, '#ff9d3b'));
      path.push(plat(129, 143, 4, 1, 1.6, '#ff9d3b'));
      cp(1, 145, 155, 4);
      // C: ступени, батут, высокая площадка, спуск
      path.push(plat(158, 164, 7, 0, 6, '#8a5cf5'));
      path.push(plat(168, 174, 10, 0, 6, '#8a5cf5'));
      path.push(plat(178, 184, 13, 0, 6, '#8a5cf5'));
      path.push(plat(188, 194, 9, 0, 6, '#3fe07a', { mat: 'neon', bounce: 70, tag: 'tramp' }));
      path.push(plat(199, 213, 16, 0, 8, '#8a5cf5'));
      w.add({ top: [206, 16.1, 0], size: [3, 0.2, 5], color: '#3fe07a', mat: 'neon', speed: 1.2, tag: 'speed' });
      path.push(plat(217, 223, 13, 0, 6, '#8a5cf5'));
      path.push(plat(227, 233, 10, 0, 6, '#8a5cf5'));
      cp(2, 236, 246, 6);
      // D: мост с ездящими красными стенками
      path.push(plat(248, 300, 6, 0, 10, '#c9ccd1'));
      [[262, 0], [276, 2], [290, 4]].forEach(([x, ph]) => {
        w.add({ top: [x, 9, 0], size: [1.5, 3, 4], color: '#ff2a2a', mat: 'neon', kill: true, tag: 'mover', move: (t) => ({ x, y: 7.5, z: Math.sin(t * 1.4 + ph) * 3.2 }) });
      });
      w.add({ top: [252, 6.1, 0], size: [3, 0.2, 5], color: '#3fe07a', mat: 'neon', speed: 1.2, tag: 'speed' });
      // финиш
      path.push(plat(305, 330, 6, 0, 20, '#56b05a', { tag: 'finishpad' }));
      for (const z of [-9, 9]) w.add({ top: [FINISH_X, 15, z], size: [1.2, 9, 1.2], color: '#f2f3f3', mat: 'smooth' });
      w.add({ pos: [FINISH_X, 15.6, 0], size: [1, 1.4, 19], color: '#ffc21a', mat: 'neon', solid: false });
      K.decal(game, B.lang() === 'en' ? 'FINISH' : 'ФИНИШ', 318, 6, 0, 8, 4, '#d62d2d', '#fff', Math.PI / 2);
      K.trophy(game, 326, 6, -6);
      K.tree(game, 326, 6, 7, 0.8);
      game.spawn = { x: -12, y: 0, z: 0, facing: Math.PI / 2 };
    },
    setup(game) {
      Object.assign(game.state, { cp: 0, t: 0, running: false, done: false });
      const base = [29.8, 37.4, 46.1, 52.9];
      game.bots.forEach((b, i) => { b.stat = Math.round((base[i] + game.rng() * 4) * 100) / 100; });
    },
    start(game) { game.centerMsg(B.lang() === 'en' ? 'Cross the start line - the timer starts!' : 'Пересеки линию старта - таймер пойдёт!', 2500); },
    reach(game, n, part) {
      const st = game.state;
      if (n <= st.cp || !st.running) return;
      st.cp = n;
      K.lightCheckpoint(part);
      B.sound.play('checkpoint');
      game.centerMsg((B.lang() === 'en' ? 'Checkpoint ' : 'Контрольная точка ') + n + ' · ' + B.fmtTime(st.t), 1500);
    },
    step(game, dt) {
      const st = game.state, x = game.player.pos.x;
      if (!st.running && !st.done && x > START_X && x < START_X + 6 && !game.dead) { st.running = true; st.t = 0; st.cp = 0; B.sound.play('speed'); }
      if (st.running) {
        st.t += dt;
        if (x >= FINISH_X && !game.dead) P.finish(game);
      }
    },
    botArea: () => ({ x: -10, z: 0, r: 7 }),
    botSpawn: (g, i) => ({ x: -16 + i * 3, y: 0, z: -5 + i * 4 }),
    respawnPoint(game) {
      const st = game.state;
      if (!st.running || st.cp === 0) return game.spawn;
      const c = CPS[st.cp - 1];
      return { x: c.x, y: c.y, z: 0, facing: Math.PI / 2 };
    },
    finish(game) {
      const st = game.state;
      if (st.done) return;
      st.done = true; st.running = false;
      const t = Math.round(st.t * 1000) / 1000;
      const r = K.finishRun(game, t);
      if (r.medal === 'gold') B.acct.award('race_gold');
      const m = game.meta.medals;
      game.showResult({
        title: r.medal ? (B.lang() === 'en' ? 'Finish!' : 'Финиш!') : (B.lang() === 'en' ? 'Finished, no medal' : 'Финиш без медали'),
        sub: `${B.ui.medalName('gold')} ≤ ${m.gold} с · ${B.ui.medalName('silver')} ≤ ${m.silver} с · ${B.ui.medalName('bronze')} ≤ ${m.bronze} с`,
        medal: r.medal, reward: r.reward, record: r.record,
        rows: [[B.lang() === 'en' ? 'Time' : 'Время', B.fmtTime(t)], [B.t('your_best'), B.fmtTime(B.acct.placeStats('race').best)]],
      });
    },
    restart(game) {
      Object.assign(game.state, { cp: 0, t: 0, running: false, done: false });
      game.respawn();
    },
    hud(game) {
      const st = game.state;
      const cls = st.running ? 'run' : st.done ? 'done' : '';
      return `<div class="hud-pill timer ${cls}"><span>${B.fmtTime(st.t)}</span>${st.running ? `<span class="hud-sep"></span><span>${B.lang() === 'en' ? 'CP' : 'КТ'} ${st.cp}/3</span>` : ''}</div>`;
    },
    shots: [
      { cam: [-30, 22, 30], look: [30, 0, 0] },
      { cam: [160, 30, 34], look: [190, 8, 0] },
      { cam: [290, 20, -26], look: [310, 6, 0] },
    ],
    thumbAvatar: { x: 6, y: 0, z: 3, facing: -0.9 },
    thumb: { cam: [-8, 8, 17], look: [22, 3, -3] },
    // Для проверок: забег за заданное время (секунды) - старт, КТ, финиш
    scriptedRun(game, seconds) {
      game.player.teleport(START_X + 1, 0, 0);
      game.fixedStep(B.STEP);
      const n = Math.round(seconds / B.STEP) - 2;
      for (let i = 0; i < n; i++) { game.player.teleport(0, 0, 0); game.fixedStep(B.STEP); }
      game.player.teleport(FINISH_X + 1, 6, 0);
      game.fixedStep(B.STEP);
    },
    completeScript(game) { P.scriptedRun(game, 30); },
  };
})(window.Blox);
