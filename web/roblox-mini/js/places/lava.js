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
    sky: { top: '#6a3f8f', horizon: '#ffb37a', sun: [-0.4, 0.35, 0.5], cloudY: 190 },

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
      game.bots.forEach((b) => P.botFresh(game, b));
    },
    botFresh(game, b) { b.stat = 0; b.out = false; b.summit = false; b.emote = null; b.hurrySaid = false; },
    onBotAdded(game, b) { P.botFresh(game, b); },
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
        st.lavaY = Math.min(st.topY - 0.6, st.lavaY + P.speed(st.t) * dt);   // вершина - спасение
        if (!game.dead && pl.onGround && pl.ground && pl.ground.tag !== 'lobby') st.roundBest = Math.max(st.roundBest, pl.pos.y);
        const botsLeft = game.bots.some((b) => !b.out && !b.summit);
        const playerOff = st.playerDone || (game.player.pos.x > LOBBY.x - 12 && game.player.pos.y < 2);   // герой в лобби - не лезет
        if (st.lavaY >= st.topY - 0.7) st.capT = (st.capT || 0) + dt;
        if (st.capT > 8 || (playerOff && !botsLeft)) P.endRound(game);
      } else if (st.phase === 'over') {
        st.lavaY = Math.max(-3, st.lavaY - 40 * dt);
        st.overT -= dt;
        if (st.overT <= 0) P.newRound(game);
      }
    },
    // ---------- Боты: ждут у башни, с началом раунда лезут по плитам, торопятся, когда лава близко ----------
    botThink(game, b, dt) {
      const BT = B.bots, st = game.state, pl = b.body, m = b.mind;
      // сгорел - смотрит из лобби на тех, кто ещё лезет, и болеет за них
      if (b.out) return BT.pastime(game, b, { x: LOBBY.x - 3, z: LOBBY.z, r: 5, sights: () => BT.others(game, b, (x) => !x.out && x.body.pos.y > 2) });
      if (st.phase === 'wait') {
        const f = game.path[1];
        return BT.roam(game, b, f.cx * 0.6, f.cz * 0.6, 7, 'round');
      }
      if (st.phase === 'over') { b.emote = b.summit ? 'dance' : null; m.goal = 'round'; return BT.hold(); }
      if (b.summit) { b.emote = 'dance'; m.goal = 'dance'; return BT.hold(); }
      // лава в нескольких шагах - без раздумий
      m.hurry = st.lavaY > pl.pos.y - 7;
      if (m.hurry && !b.hurrySaid) { b.hurrySaid = BT.say(game, b, 'hurry'); }
      if (pl.onGround && pl.ground && pl.ground.tag !== 'lobby') b.stat = Math.max(b.stat, pl.pos.y);
      const inp = BT.follow(game, b, game.path);
      BT.progressPath(b, game.path);
      return inp;
    },
    onBotReach(game, b, j, part) {
      if (part === game.state.summitPart && game.state.phase === 'rise' && !b.summit) {
        b.summit = true; b.stat = Math.max(b.stat, part.maxY);
        B.bots.say(game, b, 'finish', null, true);
        const bd = B.data.badge('lava_top');
        B.bots.system(game, B.lang() === 'en' ? `${b.name} earned the badge "${bd.en}"` : `${b.name} получает значок «${bd.name}»`);
      }
    },
    botChatVars: (game, b) => ({ n: b.out || b.body.pos.y < 2 ? null : Math.round(b.body.pos.y) }),
    // «Контрольная точка» бота в раунде - плита, на которой он стоял последней
    botCheckpoint(game, b) { const p = game.path[b.mind.idx] || game.path[0]; return { x: p.cx, y: p.maxY, z: p.cz, idx: b.mind.idx }; },
    botSpawn(game, i) { return { x: -6 + (i % 4) * 4, y: 0, z: -6 - Math.floor(i / 4) * 3 }; },
    // сгоревший в раунде бот смотрит из лобби; вне раунда - у башни
    botRespawn(game, b) {
      if (b.out) return { x: LOBBY.x - 4 + (b.i % 4) * 2.5, y: LOBBY.y, z: 3 - Math.floor(b.i / 4) * 3, idx: 0 };
      const sp = P.botSpawn(game, b.i); sp.idx = 0; return sp;
    },
    onBotDeath(game, b) { if (game.state.phase === 'rise') b.out = true; },
    respawnPoint(game) {
      const st = game.state;
      if (st.phase === 'rise') return { x: LOBBY.x, y: LOBBY.y, z: LOBBY.z, facing: -Math.PI / 2 };
      return game.spawn;
    },
    onDeath(game) { if (game.state.phase === 'rise') P.playerResult(game, false); },
    summit(game) {
      const st = game.state;
      if (st.phase !== 'rise' || game.dead || st.playerDone) return;
      st.roundBest = Math.max(st.roundBest, game.player.pos.y);
      P.playerResult(game, true);
    },
    // Раунд окончен для всех: лава выше вершины или никого не осталось на башне
    endRound(game) {
      const st = game.state;
      if (st.phase !== 'rise') return;
      if (!st.playerDone) P.playerResult(game, false);
      st.phase = 'over'; st.overT = 6;
    },
    // Итог раунда для игрока (сгорел или на вершине); боты доигрывают раунд
    playerResult(game, won) {
      const st = game.state;
      if (st.playerDone) return;
      st.playerDone = true;
      const h = Math.round(st.roundBest * 10) / 10;
      let res;
      if (h >= 10 || won) res = K.finishRun(game, h, { complete: won, win: won });
      else {
        let record = false;
        B.acct.updatePlace('lava', (s) => { if (h > 0 && (s.best == null || h > s.best)) { s.best = h; record = true; } });
        res = { medal: null, reward: 0, record };
        B.sound.play('lose');
      }
      game.showResult({
        title: won ? (B.lang() === 'en' ? 'You escaped the lava!' : 'Ты спасся от лавы!') : (B.lang() === 'en' ? 'The lava got you' : 'Лава догнала'),
        sub: won ? (B.lang() === 'en' ? 'Summit reached - place completed' : 'Вершина покорена - место пройдено') : game.bots.some((b) => !b.out && !b.summit) ? (B.lang() === 'en' ? 'The bots are still climbing - watch from the lobby' : 'Боты ещё лезут - смотри из лобби') : h < 10 ? (B.lang() === 'en' ? 'Climb above 10 to earn cubes. Next round soon' : 'Поднимись выше 10 - будут кубы. Новый раунд скоро') : (B.lang() === 'en' ? 'Next round in a few seconds' : 'Новый раунд через несколько секунд'),
        medal: res.medal, reward: res.reward, record: res.record,
        rows: [[B.lang() === 'en' ? 'Height' : 'Высота', h.toFixed(1)], [B.t('your_best'), (B.acct.placeStats('lava').best || 0).toFixed(1)]],
      });
    },
    newRound(game) {
      const st = game.state;
      Object.assign(st, { phase: 'wait', wait: 5, t: 0, roundBest: 0, lastN: 0, playerDone: false, capT: 0 });
      st.round++;
      game.hideResult();
      game.bots.forEach((b, i) => { P.botFresh(game, b); if (b.dead) b.respawnT = 0; else { const sp = P.botSpawn(game, b.i), f = B.bots.freeSpot(game.world, sp.x, sp.y, sp.z); b.body.teleport(f.x, 0.01, f.z); B.bots.resetNav(b, 0); } });
      if (!game.dead) game.player.teleport(game.spawn.x, game.spawn.y, game.spawn.z, game.spawn.facing);
    },
    restart(game) { if (game.state.phase === 'over') P.newRound(game); else game.hideResult(); },
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
