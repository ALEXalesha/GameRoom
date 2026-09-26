// «Собери монетки»: на карте 24 монеты (16 на земле, 8 на горках и башенке), три бота бегают
// за монетами на земле. Все монеты собраны - раунд окончен, у кого больше - тот победил.
'use strict';
(function (B) {
  const K = B.kit;
  const TOTAL = 24;

  const P = B.places.coins = {
    bots: 3,
    botSpeed: 12.5,
    statLabel: () => (B.lang() === 'en' ? 'Coins' : 'Монеты'),
    stat: (g, b) => (b ? b.stat : g.state.mine),
    sky: { top: '#3d8be6', horizon: '#dff1ff', sun: [0.5, 0.6, -0.3] },

    build(game) {
      const w = game.world, st = game.state, rnd = B.rng(game.seed ^ 0xc01);
      w.voidY = -30;
      w.add({ top: [0, 0, 0], size: [150, 4, 150], color: '#56b05a', tag: 'ground' });
      w.add({ top: [0, -4, 0], size: [146, 30, 146], color: '#8e5a3a', mat: 'smooth', solid: false });
      // песочные дорожки крестом
      w.add({ top: [0, 0.05, 0], size: [150, 0.1, 8], color: '#e8d49a', mat: 'smooth', solid: false });
      w.add({ top: [0, 0.05, 0], size: [8, 0.1, 150], color: '#e8d49a', mat: 'smooth', solid: false });
      // горки-ступени и башенка в центре
      const hill = (x, z, dir) => {
        const parts = [];
        for (let i = 0; i < 4; i++) {
          const s = 16 - i * 3.5;
          parts.push(w.add({ top: [x + dir[0] * i * 1.2, 2 + i * 2, z + dir[1] * i * 1.2], size: [s, 2 + i * 2, s], color: ['#6cc36e', '#7fcf6f', '#94d86f', '#a8d65b'][i] }));
        }
        return parts;
      };
      st.hills = [hill(-40, -38, [1, 1]), hill(42, 36, [-1, -1]), hill(38, -42, [-1, 1])];
      const tower = [];
      [[-4, -4], [4, -4], [4, 4], [-4, 4], [-4, -4]].forEach(([x, z], i) => tower.push(w.add({ top: [x, 3 + i * 3, z], size: [5, 1, 5], color: ['#ff9d3b', '#ffd23f', '#3fd0c4', '#8a5cf5', '#ff5c5c'][i] })));
      w.add({ top: [0, 18, 0], size: [2, 18, 2], color: '#8a8d93', mat: 'smooth' });
      st.tower = tower;
      // деревья и камни
      for (let i = 0; i < 18; i++) {
        const a = rnd() * Math.PI * 2, r = 22 + rnd() * 45, x = Math.cos(a) * r, z = Math.sin(a) * r;
        if (Math.abs(x) < 6 || Math.abs(z) < 6) continue;
        if (st.hills.some((h) => Math.hypot(h[0].cx - x, h[0].cz - z) < 12)) continue;
        if (rnd() < 0.6) K.tree(game, x, 0, z, 0.8 + rnd() * 0.4); else w.add({ top: [x, 1.5, z], size: [3, 1.5, 2.5], color: '#8a8d93', mat: 'smooth' });
      }
      // места монет: 16 на земле, 8 наверху
      const spots = [];
      for (let i = 0; spots.length < 16 && i < 400; i++) {
        const x = (rnd() - 0.5) * 120, z = (rnd() - 0.5) * 120;
        if (Math.hypot(x, z + 50) < 10) continue;               // не у самого старта
        if (st.hills.some((h) => Math.abs(h[0].cx - x) < 10 && Math.abs(h[0].cz - z) < 10)) continue;
        if (Math.hypot(x, z) < 8) continue;
        if (!w.boxFree(x - 1.5, 0.1, z - 1.5, x + 1.5, 5, z + 1.5)) continue;
        if (spots.some((s) => Math.hypot(s.x - x, s.z - z) < 9)) continue;
        spots.push({ x, y: 2.5, z, ground: true });
      }
      for (const h of st.hills) { const t = h[3], m = h[2]; spots.push({ x: t.cx, y: t.maxY + 2.5, z: t.cz, ground: false }); spots.push({ x: m.cx + 4, y: m.maxY + 2.5, z: m.cz - 4, ground: false }); }
      spots.push({ x: tower[2].cx, y: tower[2].maxY + 2.5, z: tower[2].cz, ground: false });
      spots.push({ x: tower[4].cx, y: tower[4].maxY + 2.5, z: tower[4].cz, ground: false });
      st.spots = spots.slice(0, TOTAL);
      game.path = [w.parts[0]].concat(tower);
      game.spawn = { x: 0, y: 0, z: -50, facing: 0 };
    },
    setup(game) {
      const st = game.state;
      Object.assign(st, { phase: 'play', t: 0, mine: 0, coins: [], overT: 0 });
      P.spawnCoins(game);
    },
    spawnCoins(game) {
      const st = game.state;
      for (const c of st.coins) game.world.scene.remove(c.mesh);
      st.coins = st.spots.map((s, i) => ({ i, x: s.x, y: s.y, z: s.z, ground: s.ground, taken: false, mesh: K.coin(game, s.x, s.y, s.z) }));
      st.mine = 0; st.t = 0;
      game.bots.forEach((b) => { b.stat = 0; b.goal = null; });
    },
    start(game) { game.centerMsg((B.lang() === 'en' ? 'Collect more coins than the bots! ' : 'Собери больше монет, чем боты! ') + TOTAL + (B.lang() === 'en' ? ' coins on the map' : ' монеты на карте'), 3000); },
    left: (st) => st.coins.filter((c) => !c.taken).length,
    take(game, c, who) {
      const st = game.state;
      c.taken = true; c.mesh.visible = false;
      if (who) who.stat++; else { st.mine++; B.sound.play('coin'); }
      if (P.left(st) === 0) P.endRound(game);
    },
    step(game, dt) {
      const st = game.state;
      if (st.phase === 'over') {
        st.overT -= dt;
        if (st.overT <= 0) P.newRound(game);
        return;
      }
      st.t += dt;
      const near = (body, c) => Math.hypot(body.pos.x - c.x, body.pos.y + 2.5 - c.y, body.pos.z - c.z) < 2.4;
      for (const c of st.coins) {
        if (c.taken) continue;
        if (!game.dead && near(game.player, c)) { P.take(game, c, null); continue; }
        for (const b of game.bots) if (!b.dead && near(b.body, c)) { P.take(game, c, b); break; }
      }
    },
    render(game, alpha, dt) {
      const t = game.time;
      for (const c of game.state.coins) if (!c.taken) { c.mesh.rotation.z = t * 3 + c.i; c.mesh.position.y = c.y + Math.sin(t * 2.5 + c.i) * 0.25; }
    },
    // Боты бегут к ближайшей монете на земле
    botThink(game, b, dt) {
      const st = game.state, p = b.body.pos;
      if (st.phase !== 'play') return game.wander(b, dt);
      if (!b.goal || b.goal.taken) {
        let best = null, bd = Infinity;
        for (const c of st.coins) {
          if (c.taken || !c.ground) continue;
          const d = Math.hypot(c.x - p.x, c.z - p.z) + game.rng() * 6;
          if (d < bd) { bd = d; best = c; }
        }
        b.goal = best;
      }
      if (!b.goal) return game.wander(b, dt);
      const dx = b.goal.x - p.x, dz = b.goal.z - p.z, d = Math.hypot(dx, dz) || 1;
      const stuck = b.body.onGround && Math.hypot(b.body.vel.x, b.body.vel.z) < 3 && d > 3;
      return { mx: dx / d, mz: dz / d, jump: stuck };
    },
    botArea: () => ({ x: 0, z: -44, r: 8 }),
    botSpawn: (g, i) => ({ x: -6 + i * 6, y: 0, z: -46 }),
    endRound(game) {
      const st = game.state;
      if (st.phase === 'over') return;
      st.phase = 'over'; st.overT = 8;
      const bestBot = game.bots.reduce((m, b) => (b.stat > m.stat ? b : m), { stat: -1, name: '' });
      const win = st.mine > bestBot.stat;
      const t = Math.round(st.t * 100) / 100;
      let r;
      if (win) { r = K.finishRun(game, t, { complete: true, win: true }); B.acct.completeBadge('coins'); }
      else { r = K.finishRun(game, null, { medal: null, complete: false }); }
      game.showResult({
        title: win ? (B.lang() === 'en' ? 'You won!' : 'Ты победил!') : (B.lang() === 'en' ? bestBot.name + ' won' : 'Победил ' + bestBot.name),
        sub: B.lang() === 'en' ? 'All coins collected' : 'Все монеты собраны',
        medal: win ? r.medal : null, reward: r.reward, record: win && r.record,
        rows: [[B.lang() === 'en' ? 'Your coins' : 'Твои монеты', String(st.mine)], [B.lang() === 'en' ? 'Best bot' : 'Лучший бот', bestBot.name + ' · ' + bestBot.stat], [B.lang() === 'en' ? 'Time' : 'Время', B.fmtTime(t)]],
      });
    },
    newRound(game) {
      const st = game.state;
      st.phase = 'play';
      game.hideResult();
      P.spawnCoins(game);
      game.bots.forEach((b, i) => b.body.teleport(-6 + i * 6, 0, -46));
      if (!game.dead) game.player.teleport(game.spawn.x, game.spawn.y, game.spawn.z, game.spawn.facing);
      game.centerMsg(B.lang() === 'en' ? 'New round!' : 'Новый раунд!', 1500);
    },
    restart(game) { P.newRound(game); },
    hud(game) {
      const st = game.state;
      return `<div class="hud-pill"><span class="hud-coin">${B.ui.cube(18)}</span><span>${B.lang() === 'en' ? 'Coins' : 'Монеты'} <b>${st.mine}</b></span><span class="hud-sep"></span><span>${B.lang() === 'en' ? 'Left' : 'Осталось'} <b>${P.left(st)}</b>/${TOTAL}</span><span class="hud-sep"></span><span>${B.fmtTime(st.t)}</span></div>`;
    },
    shots: [
      { cam: [0, 40, -80], look: [0, 0, 0] },
      { cam: [60, 22, 60], look: [30, 4, 20] },
      { cam: [-70, 30, 10], look: [-30, 2, -20] },
    ],
    thumbAvatar: { x: 0, y: 0, z: -40, facing: 2.6 },
    completeScript(game) {
      for (const c of game.state.coins) {
        if (c.taken) continue;
        game.player.teleport(c.x, c.y - 2.5, c.z);
        game.fixedStep(B.STEP);
      }
    },
  };
})(window.Blox);
