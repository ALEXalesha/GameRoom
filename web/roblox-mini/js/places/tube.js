// «Горка на ватрушке»: снежный жёлоб с поворотами. Вставь героя на синюю плиту наверху - он сядет
// на ватрушку. Руль A/D, звёзды в кольцах (20 штук), ёлки на трассе тормозят. Внизу - финиш и плита «Наверх».
// Движение по жёлобу - своё: координата вдоль трассы s, поперёк u, скорость v.
'use strict';
(function (B) {
  const K = B.kit;
  const W = 12, STEP_S = 2;
  const SEGS = [
    [40, 0, 0.16], [60, 0.9, 0.22], [50, -1.4, 0.25], [40, 0, 0.3], [60, 1.6, 0.22], [50, -0.8, 0.28],
    [60, -1.0, 0.2], [40, 0.6, 0.25], [60, 1.2, 0.18], [50, 0, 0.12], [34, 0, 0.02],
  ];

  function buildTrack(x0, y0, z0, th0) {
    const pts = [];
    let x = x0, y = y0, z = z0, th = th0, s = 0;
    pts.push({ x, y, z, th, s, slope: SEGS[0][2], k: 0 });
    for (const [len, turn, slope] of SEGS) {
      const n = Math.round(len / STEP_S), dth = turn / n;
      for (let i = 0; i < n; i++) {
        th += dth;
        x += Math.sin(th) * STEP_S; z += Math.cos(th) * STEP_S; y -= slope * STEP_S; s += STEP_S;
        pts.push({ x, y, z, th, s, slope, k: dth / STEP_S });
      }
    }
    return pts;
  }
  // Точка трассы по s (линейно между образцами)
  function at(pts, s) {
    const f = B.clamp(s / STEP_S, 0, pts.length - 1.001), i = Math.floor(f), t = f - i;
    const a = pts[i], b = pts[i + 1];
    let dth = b.th - a.th;
    return { x: B.lerp(a.x, b.x, t), y: B.lerp(a.y, b.y, t), z: B.lerp(a.z, b.z, t), th: a.th + dth * t, slope: b.slope, k: b.k };
  }
  const lateral = (th) => ({ x: Math.cos(th), z: -Math.sin(th) });   // u > 0 - налево по ходу

  function ribbon(pts) {
    const pos = [], uv = [], nor = [], idx = [], wpos = [], widx = [], wnor = [];
    pts.forEach((p, i) => {
      const L = lateral(p.th);
      for (const sgn of [1, -1]) {
        pos.push(p.x + L.x * W / 2 * sgn, p.y, p.z + L.z * W / 2 * sgn);
        uv.push(sgn * W / 8, p.s / 4); nor.push(0, 1, 0);
      }
      if (i > 0) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      // бортики
      for (const sgn of [1, -1]) {
        const bx = p.x + L.x * W / 2 * sgn, bz = p.z + L.z * W / 2 * sgn;
        wpos.push(bx, p.y - 0.4, bz, bx, p.y + 1.6, bz);
        wnor.push(-L.x * sgn, 0, -L.z * sgn, -L.x * sgn, 0, -L.z * sgn);
      }
      if (i > 0) {
        const a = (i - 1) * 4;
        widx.push(a, a + 4, a + 1, a + 1, a + 4, a + 5);
        widx.push(a + 2, a + 3, a + 6, a + 3, a + 7, a + 6);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(wpos, 3));
    wg.setAttribute('normal', new THREE.Float32BufferAttribute(wnor, 3));
    wg.setIndex(widx);
    return { g, wg };
  }

  // Состояние ватрушки: s, u, v (вдоль), vu (поперёк)
  function newRide(u) { return { s: 1, u: u || 0, v: 6, vu: 0, stars: 0, t: 0, hitT: 0, ringI: 0, treeI: 0, done: false }; }
  function stepRide(game, r, steer, dt, who) {
    const st = game.state, pts = st.pts;
    const p = at(pts, r.s);
    const a = 62 * p.slope - 0.012 * r.v * r.v - 0.8;
    r.v = Math.max(3, r.v + a * dt);
    if (r.hitT > 0) r.hitT -= dt;
    // руль и занос на поворотах
    r.vu += (steer * 38 - p.k * r.v * r.v * 0.55) * dt;
    r.vu *= Math.exp(-2.2 * dt);
    r.u += r.vu * dt;
    const lim = W / 2 - 1.3;
    if (Math.abs(r.u) > lim) { r.u = Math.sign(r.u) * lim; r.vu = -r.vu * 0.3; r.v *= 0.985; }
    const s0 = r.s;
    r.s += r.v * dt; r.t += dt;
    // кольца со звёздами
    for (const ring of st.rings) {
      if (ring.s > s0 && ring.s <= r.s && Math.abs(r.u - ring.u) < 2.1) {
        r.stars++;
        if (!who) { B.sound.play('coin'); ring.flash = 0.5; }
      }
    }
    // ёлки
    for (const tr of st.trees) {
      if (r.hitT <= 0 && Math.abs(r.s - tr.s) < 1.6 && Math.abs(r.u - tr.u) < 2.0) {
        r.v *= 0.35; r.vu = (r.u >= tr.u ? 1 : -1) * 9; r.hitT = 0.6;
        if (!who) B.sound.play('pop');
      }
    }
    if (r.s >= st.len - 1) { r.s = st.len - 1; r.done = true; }
  }
  // Руль бота (и сценария проверки): к следующему кольцу, мимо ёлок
  function autoSteer(game, r) {
    const st = game.state;
    let target = 0;
    const ring = st.rings.find((q) => q.s > r.s + 2 && q.s < r.s + 70);
    if (ring) target = ring.u;
    for (const tr of st.trees) if (tr.s > r.s && tr.s < r.s + 22 && Math.abs(target - tr.u) < 2.6) target = tr.u + (tr.u > 0 ? -3.2 : 3.2);
    const err = target - r.u;
    return B.clamp(err * 0.6 - r.vu * 0.18, -1, 1);
  }

  const P = B.places.tube = {
    bots: 3,
    statLabel: () => (B.lang() === 'en' ? 'Stars' : 'Звёзды'),
    stat: (g, b) => (b ? b.stat : g.state.lastStars),
    sky: { top: '#3f86e0', horizon: '#b9d8f5', sun: [0.2, 0.5, -0.6], cloudY: 230 },

    build(game) {
      const w = game.world, st = game.state, rnd = B.rng(game.seed ^ 0x70be);
      w.voidY = -30;
      const pts = buildTrack(0, 120, 0, 0);
      st.pts = pts; st.len = pts[pts.length - 1].s;
      // земля в снегу и ёлки вокруг
      w.add({ top: [60, 0, 160], size: [700, 2, 700], color: '#f4f8ff', mat: 'snow', tag: 'ground' });
      for (let i = 0; i < 70; i++) {
        const x = 60 + (rnd() - 0.5) * 560, z = 160 + (rnd() - 0.5) * 560;
        if (pts.some((p) => Math.hypot(p.x - x, p.z - z) < 14)) continue;
        K.pine(game, x, 0, z, 1 + rnd() * 0.8, true);
      }
      // опоры под жёлобом
      for (let i = 10; i < pts.length; i += 14) {
        const p = pts[i];
        if (p.y < 6) continue;
        w.add({ top: [p.x, p.y - 0.6, p.z], size: [2, p.y - 0.6, 2], color: '#8e5a3a', mat: 'smooth', solid: false });
      }
      // сам жёлоб
      const rb = ribbon(pts);
      const surf = new THREE.Mesh(rb.g, new THREE.MeshLambertMaterial({ map: B.tex.snow() }));
      surf.receiveShadow = true;
      const walls = new THREE.Mesh(rb.wg, new THREE.MeshPhongMaterial({ color: 0xbfe3ff, side: THREE.DoubleSide, shininess: 60 }));
      walls.castShadow = true; walls.receiveShadow = true;
      w.scene.add(surf, walls);
      // старт: площадка и синяя плита «Садись»
      const top = pts[0];
      w.add({ top: [top.x, top.y, top.z - 12], size: [20, 2, 16], color: '#c9ccd1', tag: 'topdeck' });
      const seat = w.add({ top: [top.x, top.y + 0.2, top.z - 5], size: [8, 0.4, 3], color: '#2f74d0', mat: 'neon', tag: 'seat' });
      seat.onTouch = (g, part, body) => { if (body === g.player) P.mount(g); };
      K.decal(game, B.lang() === 'en' ? 'SIT HERE' : 'САДИСЬ', top.x, top.y + 0.2, top.z - 5, 6, 2.2, '#2f74d0', '#fff', Math.PI);
      K.pine(game, top.x - 8, top.y, top.z - 17, 0.8, true); K.pine(game, top.x + 8, top.y, top.z - 17, 0.7, true);
      // финиш внизу: площадка и плита «Наверх»
      const end = pts[pts.length - 1];
      const L = lateral(end.th);
      st.bottom = { x: end.x + Math.sin(end.th) * 10, y: end.y, z: end.z + Math.cos(end.th) * 10 };
      w.add({ top: [st.bottom.x, end.y, st.bottom.z], size: [26, 2, 26], color: '#c9ccd1', tag: 'bottomdeck' });
      const up = w.add({ top: [st.bottom.x + L.x * 8, end.y + 0.2, st.bottom.z + L.z * 8], size: [4, 0.4, 4], color: '#8a5cf5', mat: 'neon', tag: 'up' });
      up.onTouch = (g, part, body) => { if (body === g.player && !g.state.riding) g.respawn(); };
      st.upPart = up; st.seatPart = seat;
      K.decal(game, B.lang() === 'en' ? 'UP' : 'НАВЕРХ', up.cx, up.maxY, up.cz, 3.6, 1.8, '#8a5cf5', '#fff');
      // ворота финиша
      for (const sg of [1, -1]) w.add({ top: [end.x + L.x * (W / 2 + 0.8) * sg, end.y + 8, end.z + L.z * (W / 2 + 0.8) * sg], size: [1, 8, 1], color: '#d62d2d', mat: 'smooth' });
      // кольца со звёздами и ёлки на трассе
      st.rings = []; st.trees = [];
      const ringGeo = new THREE.TorusGeometry(2, 0.22, 8, 24), ringMat = new THREE.MeshPhongMaterial({ color: 0xffd23f, emissive: 0x554000 });
      const starMat = new THREE.MeshBasicMaterial({ color: 0xfff4a0 });
      const starShape = new THREE.Shape();
      for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? 0.35 : 0.8; if (i === 0) starShape.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else starShape.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      const starGeo = new THREE.ShapeGeometry(starShape);
      for (let i = 0; i < 20; i++) {
        const s = 40 + i * (st.len - 80) / 19 + (rnd() - 0.5) * 8, u = (rnd() - 0.5) * (W - 4);
        const p = at(pts, s), La = lateral(p.th);
        const g = new THREE.Group();
        g.position.set(p.x + La.x * u, p.y + 2.2, p.z + La.z * u);
        g.rotation.y = p.th;
        g.add(new THREE.Mesh(ringGeo, ringMat));
        const star = new THREE.Mesh(starGeo, starMat); star.material.side = THREE.DoubleSide; g.add(star);
        w.scene.add(g);
        st.rings.push({ s, u, g, star });
      }
      for (let i = 0; i < 14; i++) {
        const s = 70 + i * (st.len - 120) / 13 + (rnd() - 0.5) * 10;
        const u = (rnd() < 0.5 ? -1 : 1) * (1 + rnd() * 3.5);
        if (st.rings.some((r) => Math.abs(r.s - s) < 8 && Math.abs(r.u - u) < 3)) continue;
        const p = at(pts, s), La = lateral(p.th);
        const tx = p.x + La.x * u, tz = p.z + La.z * u;
        const tree = new THREE.Group();
        const trunk = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.6, 0.8), new THREE.MeshLambertMaterial({ color: 0x8e5a3a })); trunk.position.y = 0.8; tree.add(trunk);
        [[3.6, 1.6, 0x2f6f4a], [2.6, 3.0, 0xf4f8ff], [1.6, 4.2, 0x2f6f4a]].forEach(([sz, y, c]) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sz, 1.4, sz), new THREE.MeshLambertMaterial({ color: c })); m.position.y = y + 0.4; m.castShadow = true; tree.add(m); });
        tree.position.set(tx, p.y, tz);
        w.scene.add(tree);
        st.trees.push({ s, u });
      }
      game.path = [];
      game.spawn = { x: top.x, y: top.y, z: top.z - 14, facing: 0 };
    },
    setup(game) {
      const st = game.state;
      Object.assign(st, { riding: null, lastStars: null, best: null });
      // ватрушки: своя для героя и для каждого бота
      const tubeGeo = new THREE.TorusGeometry(1.7, 0.75, 10, 24);
      const mk = (c) => { const m = new THREE.Mesh(tubeGeo, new THREE.MeshPhongMaterial({ color: c, shininess: 80, specular: 0x444444 })); m.castShadow = true; m.visible = false; game.world.scene.add(m); return m; };
      st.tube = mk(0x3fd0c4);
      game.ch.root.rotation.order = 'YXZ';
      game.bots.forEach((b) => { b.ch.root.rotation.order = 'YXZ'; });
      st.mkTube = mk; st.seatT = -10;
      game.bots.forEach((b) => P.onBotAdded(game, b));
    },
    start(game) { game.centerMsg(B.lang() === 'en' ? 'Step on the blue pad to sit on the tube' : 'Встань на синюю плиту - сядешь на ватрушку', 3000); },
    onBotAdded(game, b) {
      const st = game.state;
      if (!b.tube && st.mkTube) b.tube = st.mkTube([0xff5c5c, 0xffd23f, 0x8a5cf5, 0xff9d3b, 0x3fae4a, 0xff8fd0][b.i % 6]);
      if (b.ch.root.rotation.order !== 'YXZ') b.ch.root.rotation.order = 'YXZ';
      b.ride = null; b.stat = null; b.best = null; b.rides = 0; b.phase = 'walk'; b.steer = 0; b.slip = 0;
      b.wait = 0.5 + b.i * 1.2 + game.rng();
    },
    mount(game) {
      const st = game.state;
      if (st.riding || game.dead) return;
      st.riding = newRide(0);
      st.tube.visible = true;
      game.emote = null;
      B.sound.play('boing');
    },
    dismount(game) {
      const st = game.state, r = st.riding;
      st.riding = null; st.tube.visible = false;
      const b = st.bottom;
      game.player.teleport(b.x, b.y + 0.01, b.z, game.player.facing);
      const stars = r.stars;
      st.lastStars = stars;
      const res = K.finishRun(game, stars);
      game.showResult({
        title: B.lang() === 'en' ? 'Finish!' : 'Финиш!',
        sub: `${B.ui.medalName('gold')} ${game.meta.medals.gold}★ · ${B.ui.medalName('silver')} ${game.meta.medals.silver}★ · ${B.ui.medalName('bronze')} ${game.meta.medals.bronze}★`,
        medal: res.medal, reward: res.reward, record: res.record,
        rows: [[B.lang() === 'en' ? 'Stars' : 'Звёзды', stars + ' / 20'], [B.lang() === 'en' ? 'Time' : 'Время', B.fmtTime(r.t)], [B.t('your_best'), String(B.acct.placeStats('tube').best)]],
      });
    },
    step(game, dt) {
      const st = game.state, pl = game.player;
      // упал с верхней площадки на снег (наверх оттуда не забраться) - через полторы секунды снова наверху
      if (!st.riding && !game.dead && pl.onGround && pl.ground && pl.ground.tag === 'ground') {
        st.fallT = (st.fallT || 0) + dt;
        if (st.fallT > 1.5) { st.fallT = 0; game.respawn(); }
      } else st.fallT = 0;
      if (st.riding && !game.dead) {
        const k = game.keys, idle = game.menuOpen || game.chatFocused;
        const steer = idle ? 0 : (k.KeyA || k.ArrowLeft ? 1 : 0) - (k.KeyD || k.ArrowRight ? 1 : 0);
        stepRide(game, st.riding, st.autoSteer ? autoSteer(game, st.riding) : steer, dt);
        const p = at(st.pts, st.riding.s), L = lateral(p.th);
        pl.prev.x = pl.pos.x; pl.prev.y = pl.pos.y; pl.prev.z = pl.pos.z; pl.prevFacing = pl.facing;
        pl.pos.x = p.x + L.x * st.riding.u; pl.pos.y = p.y + 0.9; pl.pos.z = p.z + L.z * st.riding.u;
        pl.facing = p.th; pl.vel.x = pl.vel.y = pl.vel.z = 0; pl.onGround = true; pl.airTime = 0;
        if (st.riding.done) P.dismount(game);
      }
      // боты на ватрушках: руль с запаздыванием по стилю, у новичка - промахи (едет в ёлку)
      for (const b of game.bots) {
        if (!b.ride) continue;
        const r = b.ride;
        let want = autoSteer(game, r);
        b.slip -= dt;
        if (b.slip <= 0 && game.rng() < b.st.err * dt * 1.6) b.slip = 0.5 + game.rng() * 0.6;   // зазевался
        if (b.slip > 0) want = -want * 0.6;
        b.steer += (want - b.steer) * Math.min(1, dt / Math.max(0.05, b.st.react * 0.5));
        const hit0 = r.hitT;
        stepRide(game, r, B.clamp(b.steer, -1, 1), dt, b);
        if (r.hitT > hit0 + 0.3) B.bots.say(game, b, 'tree');
        const p = at(st.pts, r.s), L = lateral(p.th), bd = b.body;
        bd.prev.x = bd.pos.x; bd.prev.y = bd.pos.y; bd.prev.z = bd.pos.z; bd.prevFacing = bd.facing;
        bd.pos.x = p.x + L.x * r.u; bd.pos.y = p.y + 0.9; bd.pos.z = p.z + L.z * r.u; bd.facing = p.th;
        if (r.done) {
          b.stat = r.stars; b.best = Math.max(b.best || 0, r.stars); b.rides++;
          b.ride = null; b.tube.visible = false; b.phase = 'up';
          const bt = st.bottom;
          bd.teleport(bt.x + (game.rng() - 0.5) * 6, bt.y + 0.01, bt.z + (game.rng() - 0.5) * 6, p.th);
          B.bots.resetNav(b, 0);
          B.bots.say(game, b, 'finish', { n: r.stars }, true);
        }
      }
    },
    // ---------- Боты: дойти до синей плиты, сесть (по очереди), скатиться, внизу - на «Наверх» ----------
    botThink(game, b, dt) {
      const BT = B.bots, st = game.state, pl = b.body;
      if (b.phase === 'up') {
        const u = st.upPart;
        b.mind.goal = 'up';
        BT.progress(b, -Math.hypot(u.cx - pl.pos.x, u.cz - pl.pos.z));
        const inp = BT.walkTo(game, b, u.cx, u.cz, { near: 1.2 });
        if (inp) return inp;
        const sp = P.botSpawn(game, b.i);
        pl.teleport(sp.x, sp.y + 0.01, sp.z, 0); BT.resetNav(b, 0);
        b.phase = 'walk'; b.wait = 0.5 + game.rng() * 2;
        return BT.hold();
      }
      if (b.wait > 0) { b.wait -= dt; return BT.roam(game, b, st.pts[0].x, st.pts[0].z - 12, 4, 'queue'); }
      const seat = st.seatPart, lane = ((b.i % 3) - 1) * 2.2;
      b.mind.goal = 'seat';
      BT.progress(b, -Math.hypot(seat.cx + lane - pl.pos.x, seat.cz - pl.pos.z));
      const inp = BT.walkTo(game, b, seat.cx + lane, seat.cz, { near: 1 });
      if (inp) return inp;
      // на плите: подождать, если только что сел другой
      if (game.time - st.seatT < 1.6 || st.riding && st.riding.s < 12) { b.mind.goal = 'queue'; return BT.hold(); }
      st.seatT = game.time;
      b.ride = newRide(B.clamp((pl.pos.x - seat.cx) * 0.8, -4, 4)); b.tube.visible = true; b.steer = 0;
      BT.say(game, b, 'start');
      return BT.hold();
    },
    botChatVars: (game, b) => ({ n: b.best }),
    controlsPlayer: (g) => !!g.state.riding,
    controlsBot: (g, b) => !!b.ride,
    botPath: () => null,
    botSpawn(game, i) { const t = game.state.pts[0]; return { x: t.x - 6 + (i % 4) * 4, y: t.y, z: t.z - 11 - Math.floor(i / 4) * 2.5 }; },   // на площадке, мимо ёлок
    botCheckpoint(game, b) { b.phase = 'walk'; const sp = P.botSpawn(game, b.i); sp.idx = 0; return sp; },
    render(game, alpha, dt) {
      const st = game.state;
      const place = (tube, body, ch, ride) => {
        if (!ride) { ch.root.position.y += 0; return; }
        const p = at(st.pts, ride.s);
        tube.position.set(ch.root.position.x, ch.root.position.y - 0.3, ch.root.position.z);
        tube.rotation.order = 'YXZ';
        tube.rotation.set(Math.PI / 2 + Math.atan(p.slope), p.th, 0);
        ch.root.rotation.x = Math.atan(p.slope);
        const P2 = ch.pivots;
        P2.legL.rotation.x = P2.legR.rotation.x = -1.45;
        P2.armL.rotation.x = P2.armR.rotation.x = -0.5 + Math.sin(game.time * 3) * 0.1;
        ch.body.position.y = -1.6;
      };
      if (st.riding) place(st.tube, game.player, game.ch, st.riding); else { game.ch.root.rotation.x = 0; game.ch.body.position.y = 0; }
      for (const b of game.bots) { if (b.ride) place(b.tube, b.body, b.ch, b.ride); else { b.ch.root.rotation.x = 0; b.ch.body.position.y = 0; } }
      for (const r of st.rings) { r.star.rotation.y = game.time * 2; }
      // камера за спиной на трассе
      if (st.riding && !game.rotating) {
        let d = (game.player.facing + Math.PI) - game.rig.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
        game.rig.yaw += d * Math.min(1, dt * 3);
      }
    },
    respawnPoint(game) { const st = game.state; if (st.riding) { st.riding = null; st.tube.visible = false; } return game.spawn; },
    restart(game) { game.respawn(); },
    hud(game) {
      const st = game.state, r = st.riding;
      if (!r) return `<div class="hud-pill"><span>${B.lang() === 'en' ? 'Best' : 'Рекорд'} <b>${B.acct.placeStats('tube').best != null ? B.acct.placeStats('tube').best + '★' : '-'}</b></span></div>`;
      return `<div class="hud-pill"><span>★ <b>${r.stars}</b>/20</span><span class="hud-sep"></span><span><b>${Math.round(r.v * 3.6 / 2)}</b> ${B.lang() === 'en' ? 'km/h' : 'км/ч'}</span><span class="hud-sep"></span><span>${Math.round(r.s / st.len * 100)}%</span></div>`;
    },
    shots: [
      { cam: [-30, 140, -40], look: [20, 110, 40] },
      { cam: [120, 80, 120], look: [60, 60, 180] },
      { cam: [40, 30, 380], look: [60, 10, 300] },
    ],
    thumbAvatar: null,
    thumb: { cam: [-22, 128, -30], look: [14, 104, 40] },
    // Проверка: съехать от старта до финиша с автоматическим рулём
    completeScript(game) {
      const st = game.state;
      P.mount(game);
      st.autoSteer = true;
      for (let i = 0; i < 60 * 120 && st.riding; i++) game.fixedStep(B.STEP);
      st.autoSteer = false;
    },
  };
})(window.Blox);
