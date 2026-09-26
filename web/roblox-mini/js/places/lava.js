// «Лава поднимается»: башня плит по спирали (строится по зерну), лава поднимается всё быстрее.
// Засчитывается самая большая высота, на которой герой стоял. Вершина на высоте ~125 - прохождение.
// Погиб или дошёл - раунд окончен, лава уходит, через 5 секунд новый раунд.
'use strict';
(function (B) {
  const K = B.kit;
  const LOBBY = { x: 66, y: 0, z: 0 };

  function genTower(rnd) {
    const plats = [];
    let a = rnd() * Math.PI * 2, r = 12, y = 3;
    let prev = { x: Math.cos(a) * 16, z: Math.sin(a) * 16, y: 0, s: 40, arena: true };
    const gapOf = (p, q) => {
      const gx = Math.max(0, Math.abs(p.x - q.x) - (p.s + q.s) / 2), gz = Math.max(0, Math.abs(p.z - q.z) - (p.s + q.s) / 2);
      return Math.hypot(gx, gz);
    };
    // первая плита - у края арены
    let i = 0;
    while (y < 122) {
      const rest = i > 0 && i % 10 === 0;
      const s = rest ? 7 : 4 + rnd.int(3);
      let best = null;
      for (let tries = 0; tries < 60 && !best; tries++) {
        const na = a + 0.45 + rnd() * 0.5, nr = 10 + rnd() * 7;
        const c = { x: Math.cos(na) * nr, z: Math.sin(na) * nr, y, s, a: na };
        const g = prev.arena ? 2 : gapOf(prev, c);
        if (g >= 1.2 && g <= 3.8 && !plats.some((p) => Math.abs(p.y - c.y) < 7 && gapOf(p, c) < 0.5)) best = c;
      }
      if (!best) { best = { x: prev.x * 0.9, z: prev.z * 0.9, y, s, a }; }
      a = best.a || a;
      plats.push(best); prev = best; i++;
      y += 2.4 + rnd() * 0.9;
    }
    return plats;
  }

  const P = B.places.lava = {
    bots: 4,
    statLabel: () => (B.lang() === 'en' ? 'Height' : 'Высота'),
    stat: (g, b) => (b ? Math.round(b.stat) : Math.round(g.state.roundBest)),
    sky: { top: '#6a3f8f', horizon: '#ffb37a', sun: [-0.4, 0.35, 0.5] },

    build(game) {
      const w = game.world, st = game.state, path = game.path = [];
      w.voidY = -40;
      // арена, скала в центре, лобби сбоку
      const arena = w.add({ top: [0, 0, 0], size: [40, 4, 40], color: '#8a8d93', tag: 'arena' });
      path.push(arena);
      w.add({ top: [0, 132, 0], size: [3, 136, 3], color: '#6d7078', mat: 'plastic', tag: 'pillar' });
      const lobby = w.add({ top: [LOBBY.x, LOBBY.y, LOBBY.z], size: [18, 4, 18], color: '#56b05a', tag: 'lobby' });
      K.decal(game, B.lang() === 'en' ? 'LOBBY' : 'ЛОББИ', LOBBY.x, 0, LOBBY.z, 7, 3.5, '#2f74d0', '#fff', Math.PI / 2);
      K.tree(game, LOBBY.x + 6, 0, 6, 0.7); K.pine(game, LOBBY.x + 6, 0, -6, 0.7);
      w.add({ top: [LOBBY.x, -4, 0], size: [16, 4, 16], color: '#8e5a3a', mat: 'smooth', solid: false });
      // башня
      const rnd = B.rng(game.seed ^ 0x1a7a);
      const plats = genTower(rnd);
      const colors = ['#ff9d3b', '#ffd23f', '#3fd0c4', '#8a5cf5', '#ff8fd0', '#a8d65b', '#79c7ff'];
      st.plats = plats.map((p, i) => {
        const part = w.add({ top: [p.x, p.y, p.z], size: [p.s, 1, p.s], color: p.s >= 7 ? '#f2f3f3' : colors[i % colors.length], tag: 'step' });
        path.push(part);
        return part;
      });
      // вершина: широкая золотая плита рядом с последней
      const last = plats[plats.length - 1];
      const la = Math.atan2(last.z, last.x) + 0.9;
      const topY = last.y + 2.8;
      const sx = Math.cos(la) * 9, sz = Math.sin(la) * 9;
      const top = w.add({ top: [sx, topY, sz], size: [10, 1, 10], color: '#ffc21a', tag: 'summit' });
      top.onTouch = (g, part, body) => { if (body === g.player) P.summit(g); };
      path.push(top);
      K.decal(game, B.lang() === 'en' ? 'SUMMIT' : 'ВЕРШИНА', sx, topY, sz, 7, 3.5, '#d62d2d', '#fff');
      K.flag(game, sx + 3.5, topY, sz + 3.5, '#ffc21a');
      st.topY = topY; st.summitPart = top;
      // лава: большой ящик, верх - state.lavaY
      st.lavaY = -3;
      st.lava = w.add({ pos: [0, -103, 0], size: [92, 200, 92], color: '#ff6a2a', mat: 'lava', kill: true, tag: 'lava', move: () => ({ x: 0, y: st.lavaY - 100, z: 0 }) });
      game.spawn = { x: 0, y: 0, z: 8, facing: Math.PI };
    },
    setup(game) {
      Object.assign(game.state, { phase: 'wait', t: 0, wait: 5, roundBest: 0, round: 1, overT: 0 });
      game.bots.forEach((b) => { b.stat = 0; b.nextClimb = 2 + game.rng() * 3; });
    },
    start(game) { game.centerMsg(B.lang() === 'en' ? 'The lava will rise. Climb!' : 'Скоро поднимется лава. Карабкайся!', 2500); },
    speed: (t) => 1.0 + 0.015 * t,
    step(game, dt) {
      const st = game.state, pl = game.player;
      if (st.phase === 'wait') {
        st.lavaY = Math.max(-3, st.lavaY - 30 * dt);
        st.wait -= dt;
        const n = Math.ceil(st.wait);
        if (n !== st.lastN) { st.lastN = n; if (n > 0) game.centerMsg((B.lang() === 'en' ? 'Round starts in ' : 'Раунд через ') + n, 1100); }
        if (st.wait <= 0) { st.phase = 'rise'; st.t = 0; st.roundBest = 0; game.centerMsg(B.lang() === 'en' ? 'The lava is rising!' : 'Лава поднимается!', 1500); }
      } else if (st.phase === 'rise') {
        st.t += dt;
        st.lavaY += P.speed(st.t) * dt;
        if (!game.dead && pl.onGround && pl.ground && pl.ground.tag !== 'lobby') st.roundBest = Math.max(st.roundBest, pl.pos.y);
        if (st.lavaY > st.topY + 12) P.endRound(game, false);
      } else if (st.phase === 'over') {
        st.lavaY = Math.max(-3, st.lavaY - 40 * dt);
        st.overT -= dt;
        if (st.overT <= 0) P.newRound(game);
      }
      // боты карабкаются: время от времени «забираются» на плиту чуть выше лавы
      if (st.phase === 'rise') {
        for (const b of game.bots) {
          if (b.dead || b.out) continue;
          b.nextClimb -= dt;
          if (b.nextClimb <= 0) {
            b.nextClimb = 1.8 + game.rng() * 2.6;
            if (game.rng() < 0.12) continue;             // зазевался
            const cand = st.plats.filter((p) => p.maxY > st.lavaY + 3 && p.maxY < st.lavaY + 16);
            if (cand.length) { const p = game.rng.pick(cand); b.body.teleport(p.cx + (game.rng() - 0.5) * 1.5, p.maxY, p.cz + (game.rng() - 0.5) * 1.5); b.stat = Math.max(b.stat, p.maxY); }
          }
        }
      }
    },
    botArea(game, b) {
      const p = b.body.pos;
      if (b.out) return { x: LOBBY.x, z: LOBBY.z, r: 6 };
      if (game.state.phase === 'rise' && p.y > 1) return { x: p.x, z: p.z, r: 0.8 };
      return { x: 0, z: 0, r: 14 };
    },
    botSpawn(game, i) { const b = game.bots[i]; return b && b.out ? { x: LOBBY.x - 4 + i * 2, y: 0, z: 3 } : { x: -6 + i * 4, y: 0, z: -6 }; },
    onBotDeath(game, b) { if (game.state.phase === 'rise') b.out = true; },
    respawnPoint(game) {
      const st = game.state;
      if (st.phase === 'rise') return { x: LOBBY.x, y: LOBBY.y, z: LOBBY.z, facing: -Math.PI / 2 };
      return game.spawn;
    },
    onDeath(game) { if (game.state.phase === 'rise') P.endRound(game, false); },
    summit(game) {
      const st = game.state;
      if (st.phase !== 'rise' || game.dead) return;
      st.roundBest = Math.max(st.roundBest, game.player.pos.y);
      P.endRound(game, true);
    },
    endRound(game, won) {
      const st = game.state;
      if (st.phase !== 'rise') return;
      st.phase = 'over'; st.overT = won ? 7 : 6;
      const h = Math.round(st.roundBest * 10) / 10;
      let res;
      if (h >= 10 || won) res = K.finishRun(game, h, { complete: won, win: won });
      else {
        let record = false;
        B.acct.updatePlace('lava', (s) => { if (s.best == null || h > s.best) { s.best = h; record = true; } });
        res = { medal: null, reward: 0, record };
        B.sound.play('lose');
      }
      game.showResult({
        title: won ? (B.lang() === 'en' ? 'You escaped the lava!' : 'Ты спасся от лавы!') : (B.lang() === 'en' ? 'The lava got you' : 'Лава догнала'),
        sub: won ? (B.lang() === 'en' ? 'Summit reached - place completed' : 'Вершина покорена - место пройдено') : (B.lang() === 'en' ? 'Next round in a few seconds' : 'Новый раунд через несколько секунд'),
        medal: res.medal, reward: res.reward, record: res.record,
        rows: [[B.lang() === 'en' ? 'Height' : 'Высота', h.toFixed(1)], [B.t('your_best'), (B.acct.placeStats('lava').best || 0).toFixed(1)]],
      });
    },
    newRound(game) {
      const st = game.state;
      Object.assign(st, { phase: 'wait', wait: 5, t: 0, roundBest: 0, lastN: 0 });
      st.round++;
      game.hideResult();
      game.bots.forEach((b, i) => { b.out = false; b.stat = 0; if (b.dead) b.respawnT = 0; else b.body.teleport(-6 + i * 4, 0, -6); });
      if (!game.dead) game.player.teleport(game.spawn.x, game.spawn.y, game.spawn.z, game.spawn.facing);
    },
    restart(game) { if (game.state.phase === 'over') P.newRound(game); },
    hud(game) {
      const st = game.state;
      const best = B.acct.placeStats('lava').best;
      const lava = st.phase === 'rise' ? `<span class="hud-lava">${B.lang() === 'en' ? 'Lava' : 'Лава'} <b>${Math.max(0, st.lavaY).toFixed(1)}</b></span><span class="hud-sep"></span>` : '';
      return `<div class="hud-pill">${lava}<span>${B.lang() === 'en' ? 'You' : 'Ты'} <b>${game.player.pos.y.toFixed(1)}</b></span><span class="hud-sep"></span><span>${B.lang() === 'en' ? 'Record' : 'Рекорд'} <b>${best != null ? best.toFixed(1) : '-'}</b></span></div>`;
    },
    shots: [
      { cam: [-52, 40, 52], look: [0, 30, 0] },
      { cam: [30, 95, 40], look: [0, 80, 0] },
      { cam: [80, 20, 30], look: [0, 18, 0] },
    ],
    thumbAvatar: { x: 2, y: 0, z: 15, facing: 0.45 },
    thumb: { cam: [11, 7, 33], look: [0, 15, 0] },
    thumbLavaY: 8,
    completeScript(game) {
      const st = game.state;
      st.phase = 'rise'; st.t = 0;
      const s = st.summitPart;
      game.player.teleport(s.cx, s.maxY + 0.01, s.cz);
      for (let i = 0; i < 3; i++) game.fixedStep(B.STEP);
    },
  };
})(window.Blox);
