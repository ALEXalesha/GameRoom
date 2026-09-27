// Боты-игроки: общий ИИ для всех мест. Место даёт цель (botThink), бот идёт к ней по пути из деталей:
// бег, прыжок у края, ожидание едущей или исчезнувшей плиты, прыжок через лаву и крутилки.
// Ошибки по стилю (прыгнул рано, не прыгнул, промахнулся в воздухе), контрольная точка после
// падения, сброс на неё при застревании, короткие реплики в чат по ситуации.
'use strict';
(function (B) {
  const E = B.engine, PH = E.PHYS, STEP = B.STEP;
  const BT = B.bots = {};

  // Стили: speed - доля скорости бега, err - доля прыжков с ошибкой, pause - раздумье перед прыжком (с),
  // react - запаздывание руля/старта (с), chat - болтливость, patience - множитель терпения при застревании
  BT.STYLES = {
    pro: { ru: 'профи', en: 'pro', speed: 0.96, err: 0.04, air: 1, pause: [0.25, 0.8], react: 0.12, chat: 0.6, patience: 1 },
    careful: { ru: 'осторожный', en: 'careful', speed: 0.84, err: 0.06, air: 0.95, pause: [0.4, 1.2], react: 0.3, chat: 0.8, patience: 1.3 },
    rusher: { ru: 'торопыга', en: 'rusher', speed: 1, err: 0.14, air: 0.9, pause: [0, 0.1], react: 0.18, chat: 1, patience: 0.8 },
    novice: { ru: 'новичок', en: 'novice', speed: 0.8, err: 0.26, air: 0.74, pause: [0.3, 1.5], react: 0.5, chat: 1, patience: 1 },
  };
  const ORDER = ['pro', 'careful', 'rusher', 'novice', 'careful', 'rusher'];
  BT.STILL_LIMIT = 9;       // стоять без цели дольше - нельзя (ум сам находит новое дело)
  BT.STUCK_T = 14;          // столько секунд без продвижения к цели - сброс на контрольную точку
  // цели «иду к чему-то» (должно быть продвижение) и цели, при которых стоять можно
  BT.TOWARD = ['path', 'walk', 'coin', 'seat', 'up', 'site', 'line-walk'];
  BT.LEGIT_STILL = ['wait', 'look', 'build', 'dance', 'round', 'ride', 'line', 'queue', 'out', 'watch', 'paint'];

  BT.init = function (game, b, i) {
    if (!game.botStyles) {
      const n = Math.max(game.botTotal || 0, i + 1, 4);
      const list = ORDER.slice(0, Math.min(n, ORDER.length));
      for (let k = list.length - 1; k > 0; k--) { const j = game.rng.int(k + 1); const t = list[k]; list[k] = list[j]; list[j] = t; }
      game.botStyles = list;
    }
    b.style = game.botStyles[i % game.botStyles.length];
    b.st = BT.STYLES[b.style];
    const P = game.place;
    b.baseWalk = P.botSpeed || PH.WALK;
    b.body.walk = b.baseWalk * b.st.speed;
    b.mind = {
      idx: 0, seg: null, goal: '', stillT: 0, idleT: 0, progT: 0, progBest: -Infinity, anchor: { x: b.body.pos.x, z: b.body.pos.z },
      chatT: 6 + game.rng() * 14, chatCd: 0, blocked: 0, air: 0, maxIdle: 0, maxStuck: 0,
    };
    b.cp = 0; b.resets = 0; b.deaths = 0; b.practice = {};
  };
  // Неудача на отрезке: в следующий раз получится чуть лучше (набивает руку)
  BT.onFail = function (b) {
    const m = b.mind;
    const k = m.jumpFrom != null ? m.jumpFrom : m.seg ? m.seg.from : m.idx;
    b.practice[k] = (b.practice[k] || 0) + 1;
  };

  // ---------- Путь из деталей ----------
  function pathMap(path) {
    if (!path._map || path._map.size !== path.length) { path._map = new Map(); path.forEach((p, i) => { if (!path._map.has(p)) path._map.set(p, i); }); }
    return path._map;
  }
  BT.pathIndex = (path, part) => { const v = pathMap(path).get(part); return v == null ? -1 : v; };
  const inside = (p, x, z, m) => x > p.minX + m && x < p.maxX - m && z > p.minZ + m && z < p.maxZ - m;
  const margin = (lo, hi) => (hi - lo > 2.2 ? 1 : (hi - lo) / 2);
  // Точка на B, ближайшая к центру A (с запасом от края)
  // lane - сдвиг «дорожки» по детали (например, по краю плиты с крутилкой)
  const laneX = (p) => p.cx + (p.data && p.data.lane ? p.data.lane.x : 0);
  const laneZ = (p) => p.cz + (p.data && p.data.lane ? p.data.lane.z : 0);
  function aimOn(A, Bp, off) {
    const mx = margin(Bp.minX, Bp.maxX), mz = margin(Bp.minZ, Bp.maxZ);
    const ln = (A.data && A.data.lane) || (Bp.data && Bp.data.lane) || { x: 0, z: 0 };
    let x = B.clamp(A.cx + ln.x, Bp.minX + mx, Bp.maxX - mx), z = B.clamp(A.cz + ln.z, Bp.minZ + mz, Bp.maxZ - mz);
    if (off) { x = B.clamp(x + off.x, Bp.minX + mx, Bp.maxX - mx); z = B.clamp(z + off.z, Bp.minZ + mz, Bp.maxZ - mz); }
    return { x, z };
  }
  // Зазор между ящиками по горизонтали
  function gap(a, b, bx, bz) {
    const hx = (b.maxX - b.minX) / 2, hz = (b.maxZ - b.minZ) / 2;
    const cx = bx == null ? b.cx : bx, cz = bz == null ? b.cz : bz;
    const gx = Math.max(0, Math.max(a.minX - (cx + hx), (cx - hx) - a.maxX));
    const gz = Math.max(0, Math.max(a.minZ - (cz + hz), (cz - hz) - a.maxZ));
    return Math.hypot(gx, gz);
  }
  // Сколько пролетит прыжком по горизонтали, если цель выше на dy
  function reach(speed, dy) {
    const v = PH.JUMP, g = PH.GRAV, d = v * v - 2 * g * Math.max(0, dy);
    if (d < 0) return 0;
    return speed * (v + Math.sqrt(d)) / g;
  }
  BT.reach = reach;

  // Впереди опасность (лава, красная стенка, крутилка), через которую надо перепрыгнуть
  function hazardAhead(game, b, dx, dz) {
    const p = b.body.pos, w = game.world;
    const sp = Math.max(4, Math.hypot(b.body.vel.x, b.body.vel.z));
    for (const c of w.query(p.x - 5, p.z - 5, p.x + 5, p.z + 5)) {
      if (!c.kill || c.tag === 'lava') continue;
      if (c.spin) {
        // крутилка: достанет ли рука за ближайшие четверть секунды
        const a0 = c.angle;
        for (const tau of [0.04, 0.1, 0.16, 0.22]) {
          c.angle = a0 + c.spin * tau;
          const x = p.x + dx * sp * tau, z = p.z + dz * sp * tau;
          const hit = E.spinTouch(c, x - PH.HX - 0.3, p.y, z - PH.HX - 0.3, x + PH.HX + 0.3, p.y + PH.HEIGHT, z + PH.HX + 0.3);
          if (hit) { c.angle = a0; return c; }
        }
        c.angle = a0;
        continue;
      }
      if (c.maxY < p.y - 0.1 || c.minY > p.y + 3.2 || c.maxY > p.y + 4.6) continue;
      // прыгать так, чтобы к краю опасности уже подняться выше неё
      const h = c.maxY - p.y + 0.15, disc = PH.JUMP * PH.JUMP - 2 * PH.GRAV * h;
      const tRise = disc > 0 ? (PH.JUMP - Math.sqrt(disc)) / PH.GRAV : 0.25;
      const trig = Math.max(0.45, sp * tRise) + 0.3;
      for (let k = 0; k <= trig + 0.01; k += 0.3) {
        const x = p.x + dx * k, z = p.z + dz * k;
        if (x + PH.HX > c.minX - 0.1 && x - PH.HX < c.maxX + 0.1 && z + PH.HX > c.minZ - 0.1 && z - PH.HX < c.maxZ + 0.1) return c;
      }
    }
    return null;
  }
  BT.hazardAhead = hazardAhead;

  // Запас до ближайшей опасности у точки (x, z) на опоре высотой top: сколько ещё можно сдвинуться телом
  function killClear(game, x, z, top) {
    let best = Infinity;
    for (const c of game.world.query(x - 6, z - 6, x + 6, z + 6)) {
      if (!c.kill || c.tag === 'lava' || c.spin) continue;
      if (c.maxY < top - 0.5 || c.minY > top + 3) continue;
      const ox = Math.max(c.minX - x, x - c.maxX), oz = Math.max(c.minZ - z, z - c.maxZ);
      best = Math.min(best, Math.max(ox, oz) - PH.HX);
    }
    return best;
  }
  // Лучшая точка на прямой от (x0,z0) по (ux,uz) от t0 до t1 внутри P: первая с запасом >= want, иначе самая безопасная
  function safeAlong(game, P, x0, z0, ux, uz, t0, t1, want) {
    let best = null, bc = -Infinity;
    for (let t = t0; t <= t1 + 0.01; t += 0.25) {
      const x = x0 + ux * t, z = z0 + uz * t;
      if (!inside(P, x, z, 0.45)) continue;
      const c = killClear(game, x, z, P.maxY);
      if (c >= want) return { x, z };
      if (c > bc) { bc = c; best = { x, z }; }
    }
    return best;
  }
  // Куда садиться на B: от ближнего края внутрь, подальше от лавы-полос
  function safeLanding(game, A, Bp, aim) {
    let ux = laneX(Bp) - aim.x, uz = laneZ(Bp) - aim.z;
    const ul = Math.hypot(ux, uz);
    if (ul > 0.01) { ux /= ul; uz /= ul; } else { ux = 0; uz = 0; }
    return safeAlong(game, Bp, aim.x, aim.z, ux, uz, -0.5, Math.max(0, ul * 2), 0.9) || { x: aim.x, z: aim.z };
  }
  // Точка сразу за опасностью по ходу (куда допрыгнуть через полосу)
  function hopPast(game, A, c, px, pz, dx, dz) {
    let far = 0;
    for (const x of [c.minX, c.maxX]) for (const z of [c.minZ, c.maxZ]) far = Math.max(far, (x - px) * dx + (z - pz) * dz);
    const h = safeAlong(game, A, px, pz, dx, dz, far + PH.HX + 0.1, far + 4, 0.8);
    if (!h) return null;
    return { x: h.x, z: h.z, fx: px + dx * (far + PH.HX + 0.2), fz: pz + dz * (far + PH.HX + 0.2) };
  }

  // Руль в воздухе: такой ввод, чтобы сесть ровно в точку tgt на высоте top. Скорость в воздухе догоняет
  // ввод как v' = (u*W - v)*9, поэтому путь за время T: u*W*(T - f) + v*f, где f = (1 - e^-9T)/9.
  function airSteer(pl, tgt, top) {
    const g = PH.GRAV, vy = pl.vel.y, disc = vy * vy + 2 * g * (pl.pos.y - top);
    const dx = tgt.x - pl.pos.x, dz = tgt.z - pl.pos.z;
    const d = Math.hypot(dx, dz);
    if (disc < 0) { const k = d > 0.05 ? 1 / d : 0; return { mx: dx * k, mz: dz * k, jump: false }; }
    const T = Math.max(0.02, (vy + Math.sqrt(disc)) / g);
    const f = (1 - Math.exp(-9 * T)) / 9, W = pl.walk * (pl.boost > 0 ? 1.8 : 1), den = Math.max(1e-3, W * (T - f));
    let mx = (dx - pl.vel.x * f) / den, mz = (dz - pl.vel.z * f) / den;
    const l = Math.hypot(mx, mz);
    if (l > 1) { mx /= l; mz /= l; }
    return { mx, mz, jump: false };
  }

  // Пройдёт ли рука крутилки у точки за время полёта (0.3..0.8 с)
  // tFly - настоящее время полёта до посадки; care - запас (после двух падений на этом прыжке - больше)
  function armNear(game, x, z, top, tFly, care) {
    for (const c of game.world.query(x - 6, z - 6, x + 6, z + 6)) {
      if (!c.spin || !c.kill) continue;
      const a0 = c.angle;
      let hit = false;
      const pad = care ? 1.3 : 0.5;
      for (let tau = Math.max(0.05, tFly - 0.3 - care * 0.2); tau <= tFly + 0.45 + care * 0.35 && !hit; tau += 0.05) {
        c.angle = a0 + c.spin * tau;
        hit = E.spinTouch(c, x - PH.HX - pad, top, z - PH.HX - pad, x + PH.HX + pad, top + PH.HEIGHT, z + PH.HX + pad);
      }
      c.angle = a0;
      if (hit) return true;
    }
    return false;
  }

  // Новый отрезок пути: бросить кубик ошибки, решить, сколько подумать перед прыжком
  function newSeg(game, b, from, to) {
    const r = game.rng, st = b.st, m = b.mind;
    let err = null;
    // ошибка реже, если уже падал на этом месте (учится); на узкой балке - осторожнее
    const learn = Math.pow(0.7, b.practice[from] || 0);
    // набил руку - и разбегается смелее (новичок после нескольких падений бежит почти как все)
    if (b.baseWalk) b.body.walk = b.baseWalk * Math.min(1, st.speed + 0.04 * (b.practice[from] || 0));
    if (r() < st.err * learn * (m.hurry ? 1.4 : 1)) { const q = r(); err = q < 0.35 ? 'early' : q < 0.55 ? 'late' : q < 0.8 ? 'drift' : 'weak'; }
    const pause = m.hurry ? 0 : B.lerp(st.pause[0], st.pause[1], r());
    const off = { x: (r() - 0.5) * 1.2, z: (r() - 0.5) * 1.2 };
    m.seg = { from, to, err, pause, off, drift: err === 'drift' ? { x: (r() < 0.5 ? -1 : 1) * (1.4 + r() * 1.4), z: (r() < 0.5 ? -1 : 1) * (1.4 + r() * 1.4) } : null, waitT: 0, blocked: 0 };
    return m.seg;
  }

  // Идти по цепочке деталей path от m.idx к концу (или к детали с индексом stop).
  // Возвращает ввод для тела. m.goal - что сейчас делает (для законов и отладки).
  BT.follow = function (game, b, path, stop) {
    const m = b.mind, pl = b.body;
    const end = stop == null ? path.length - 1 : Math.min(stop, path.length - 1);
    if (m.idx >= end) { m.goal = 'arrived'; return BT.hold(); }
    const A = path[Math.max(0, m.idx)], Bp = path[m.idx + 1];
    let seg = m.seg;
    if (!seg || seg.from !== m.idx || seg.to !== m.idx + 1) seg = newSeg(game, b, m.idx, m.idx + 1);
    const onB = pl.onGround && pl.ground === Bp;
    if (onB) return BT.hold();
    const air = !pl.onGround;
    const aim = aimOn(A, Bp, seg.off);
    if (!seg.land) {
      // на батут садиться ближе к следующей плите - он подбросит дальше
      const C = path[m.idx + 2];
      const l = Bp.bounce && C ? aimOn(C, Bp) : safeLanding(game, A, Bp, aim);
      seg.land = { x: l.x - Bp.cx, z: l.z - Bp.cz };
    }
    let tgt, airIn = null;
    if (air) {
      if (seg.hop) tgt = seg.hop;
      else {
        tgt = { x: Bp.cx + seg.land.x, z: Bp.cz + seg.land.z };        // посадка едет вместе с плитой
        if (seg.drift) { tgt.x += seg.drift.x; tgt.z += seg.drift.z; }
      }
      // через полосу - во весь опор, пока не пролетел её; потом - точно в точку посадки
      airIn = airSteer(pl, tgt, seg.hop ? A.maxY : Bp.maxY);
      // руль в воздухе не сильнее умения (у новичка длинные прыжки выходят короче)
      const cap = seg.err === 'weak' ? 0.55 : Math.min(1, b.st.air + 0.07 * (b.practice[seg.from] || 0)), al = Math.hypot(airIn.mx, airIn.mz);
      if (al > cap) { airIn.mx *= cap / al; airIn.mz *= cap / al; }
      // над самой полосой не тормозить, пока высоты мало
      if (seg.hop && pl.pos.y < A.maxY + 1.2 && (seg.hop.fx - pl.pos.x) * seg.hop.dx + (seg.hop.fz - pl.pos.z) * seg.hop.dz > 0) airIn = { mx: seg.hop.dx, mz: seg.hop.dz, jump: false };
    } else {
      seg.hop = null;
      // сначала добежать до места отрыва на своей плите (ближайшая к цели точка), потом - к цели
      const tx = B.clamp(aim.x, A.minX + 0.6, A.maxX - 0.6), tz = B.clamp(aim.z, A.minZ + 0.6, A.maxZ - 0.6);
      tgt = pl.ground === A && Math.hypot(tx - pl.pos.x, tz - pl.pos.z) > 1.3 ? { x: tx, z: tz } : aim;
    }
    let dx = tgt.x - pl.pos.x, dz = tgt.z - pl.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d; dz /= d;
    if (airIn) { m.goal = 'path'; return airIn; }
    // подумать перед прыжком (стоя на опоре)
    if (!air && seg.pause > 0 && pl.ground === A && !A.fade && !A.move && !A.conveyor && !A.data.danger) {
      seg.pause -= STEP;
      m.goal = 'look';
      return { mx: 0, mz: 0, jump: false, face: Math.atan2(dx, dz) };
    }
    // ждать: следующая плита исчезла или уехала слишком далеко
    if (!air && pl.ground === A) {
      const speed = pl.walk;
      let wait = false;
      if (Bp.fade && Bp.fade.state !== 'solid') wait = true;
      // на плиту с крутилкой прыгать, когда рука будет далеко от места посадки
      if (Bp.data.danger) {
        const lx = Bp.cx + seg.land.x, lz = Bp.cz + seg.land.z;
        const dy = Bp.maxY - A.maxY, disc = PH.JUMP * PH.JUMP - 2 * PH.GRAV * dy;
        const tUp = disc > 0 ? (PH.JUMP + Math.sqrt(disc)) / PH.GRAV : 0.5;
        const run = Math.max(0, Math.hypot(lx - pl.pos.x, lz - pl.pos.z) - pl.walk * tUp) / pl.walk;   // добежать до края
        const fails = b.practice[m.idx] || 0;
        if (armNear(game, lx, lz, Bp.maxY, run + tUp, fails >= 2 ? 1 : 0)) wait = true;
      }
      if (Bp.move || A.move) {
        const tAir = 0.42;
        const nb = Bp.move ? Bp.move(game.world.time + tAir, Bp) : { x: Bp.cx, z: Bp.cz };
        const g = gap(A, Bp, nb.x, nb.z);
        if (g > reach(speed, Bp.maxY - A.maxY) * 0.62) wait = true;
      }
      if (wait && seg.waitT < 9) {
        seg.waitT += STEP;
        m.goal = 'wait';
        // стоять у края, лицом к плите
        const edge = { x: B.clamp(aim.x, A.minX + 1.2, A.maxX - 1.2), z: B.clamp(aim.z, A.minZ + 1.2, A.maxZ - 1.2) };
        const ex = edge.x - pl.pos.x, ez = edge.z - pl.pos.z, ed = Math.hypot(ex, ez);
        // ждёт на плите с крутилкой - перепрыгивает руку на месте
        const hop = !!hazardAhead(game, b, ex / (ed || 1), ez / (ed || 1));
        if (ed > 0.6) return { mx: ex / ed * 0.6, mz: ez / ed * 0.6, jump: hop };
        return { mx: 0, mz: 0, jump: hop, face: Math.atan2(Bp.cx - pl.pos.x, Bp.cz - pl.pos.z) };
      }
    }
    m.goal = 'path';
    let jump = false;
    if (pl.onGround && pl.ground !== Bp) {
      const look = seg.err === 'early' ? 0.24 : STEP * 2;
      const nx = pl.pos.x + pl.vel.x * look, nz = pl.pos.z + pl.vel.z * look;
      const onA = pl.ground === A;
      const joined = gap(A, Bp) < 0.3 && Bp.maxY <= A.maxY + PH.STEP_UP;   // плиты вплотную - просто шагнуть
      if (onA && !joined && !inside(A, nx, nz, -0.05) && seg.err !== 'late') jump = true;
      const moved = seg.lp ? Math.hypot(pl.pos.x - seg.lp.x, pl.pos.z - seg.lp.z) : 1;
      seg.lp = { x: pl.pos.x, z: pl.pos.z };
      if (moved < pl.walk * STEP * 0.25) { seg.blocked++; if (seg.blocked > 18) { jump = true; seg.blocked = 0; } } else seg.blocked = 0;
      // следующая плита выше ступеньки и уже прямо перед нами
      const toB = Math.hypot(Math.max(0, Bp.minX - pl.pos.x, pl.pos.x - Bp.maxX), Math.max(0, Bp.minZ - pl.pos.z, pl.pos.z - Bp.maxZ));
      if (toB < PH.HX + 1.1 && Bp.maxY > pl.pos.y + PH.STEP_UP) jump = true;
      const hz = hazardAhead(game, b, dx, dz);
      if (hz && !(seg.err === 'late' && game.rng() < 0.5)) {
        jump = true;
        // прыжок через полосу внутри опоры: сесть сразу за ней, а не улететь
        if (!hz.spin && onA) {
          const h = hopPast(game, A, hz, pl.pos.x, pl.pos.z, dx, dz);
          if (h) seg.hop = { x: h.x, z: h.z, fx: h.fx, fz: h.fz, dx, dz };
        }
      }
      // цель прямо под ногами, но ниже - сойти с края
      if (d < 0.5 && Bp.maxY <= pl.pos.y) { dx = Bp.cx - pl.pos.x; dz = Bp.cz - pl.pos.z; const dd = Math.hypot(dx, dz) || 1; dx /= dd; dz /= dd; }
    }
    if (jump) m.jumpFrom = seg.from;
    // узкая балка: неопытные идут медленнее (и тем медленнее, чем чаще отсюда падали)
    const narrow = Math.min(A.sx, A.sz) < 2.5 && pl.ground === A;
    const slow = narrow && b.style !== 'pro' && b.style !== 'rusher' ? Math.max(0.55, 0.8 - 0.05 * (b.practice[m.idx] || 0)) : 1;
    const move = (d > 0.3 ? 1 : 0) * slow;
    return { mx: dx * move, mz: dz * move, jump };
  };

  // Идти к точке по ровному месту: прыгать через невысокое, обходить стену боком
  BT.walkTo = function (game, b, x, z, opt = {}) {
    const pl = b.body, m = b.mind;
    let dx = x - pl.pos.x, dz = z - pl.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < (opt.near || 0.8)) return null;               // дошёл
    dx /= d; dz /= d;
    let jump = false;
    const slow = opt.speed || 1;
    // упёрся: скорость есть, а с места не сдвинулся (тело упирается в стену)
    const moved = m.wpos ? Math.hypot(pl.pos.x - m.wpos.x, pl.pos.z - m.wpos.z) : 1;
    m.wpos = { x: pl.pos.x, z: pl.pos.z };
    if (pl.onGround) {
      if (moved < pl.walk * slow * STEP * 0.3) m.blocked++; else m.blocked = Math.max(0, m.blocked - 2);
      if (m.blocked > 14) jump = true;
      if (hazardAhead(game, b, dx, dz)) jump = true;
      // стена выше прыжка - обойти боком
      if (m.blocked > 50) { const s = (b.i % 2 ? 1 : -1); const t = dx; dx = -dz * s; dz = t * s; }
      if (m.blocked > 110) m.blocked = 0;
    }
    // не шагать с обрыва (крыша башни, край площадки): впереди нет опоры в пределах 4 - стоп
    if (opt.safe && pl.onGround) {
      const ax = pl.pos.x + dx * 1.3, az = pl.pos.z + dz * 1.3;
      const hit = game.world.rayCast({ x: ax, y: pl.pos.y + 0.5, z: az }, { x: 0, y: -1, z: 0 }, 4.5);
      if (!hit || hit.part.kill) { m.ledge = true; return { mx: 0, mz: 0, jump: false }; }
    }
    m.ledge = false;
    return { mx: dx * slow, mz: dz * slow, jump };
  };
  BT.hold = () => ({ mx: 0, mz: 0, jump: false });

  // Бродить вокруг точки: цель - «гулять», пауза не дольше пары секунд
  BT.roam = function (game, b, cx, cz, r, goal) {
    const m = b.mind, p = b.body.pos;
    if (!m.roam || m.roam.t <= 0 || Math.hypot(m.roam.x - p.x, m.roam.z - p.z) < 1) {
      const a = game.rng() * Math.PI * 2, rr = game.rng() * r;
      m.roam = { x: cx + Math.cos(a) * rr, z: cz + Math.sin(a) * rr, t: 1.5 + game.rng() * 3, idle: game.rng() < 0.3 ? 0.4 + game.rng() * 1.6 : 0 };
    }
    m.roam.t -= STEP;
    m.goal = goal || 'roam';
    if (m.roam.idle > 0) { m.roam.idle -= STEP; return BT.hold(); }
    const inp = BT.walkTo(game, b, m.roam.x, m.roam.z, { speed: 0.7, safe: true });
    if (m.ledge) m.roam.t = 0;
    return inp || BT.hold();
  };

  // Досуг вместо бесцельного брожения: разглядывать (других игроков, постройки), болеть за них,
  // танцевать, пройтись. Каждое дело - несколько секунд, потом другое.
  // opt: { x, z, r - где можно ходить; sights() - [{ x, y, z, name }] на что смотреть }
  BT.pastime = function (game, b, opt) {
    const m = b.mind, r = game.rng, pl = b.body;
    let p = m.pas;
    if (!p || p.t <= 0) {
      const sights = opt.sights ? opt.sights() : [];
      const kinds = sights.length ? ['watch', 'watch', 'dance', 'stroll'] : ['dance', 'stroll', 'stroll'];
      let kind = r.pick(kinds);
      if (p && kind === p.kind && kind !== 'watch') kind = kind === 'dance' ? 'stroll' : 'dance';
      p = m.pas = { kind, t: 4 + r() * 4 };
      if (kind === 'watch') {
        const s = r.pick(sights), a = Math.atan2(pl.pos.z - s.z, pl.pos.x - s.x) + (r() - 0.5);
        const d = 5 + r() * 5;
        p.sight = s;
        p.x = B.clamp(s.x + Math.cos(a) * d, opt.x - opt.r, opt.x + opt.r); p.z = B.clamp(s.z + Math.sin(a) * d, opt.z - opt.r, opt.z + opt.r);
        p.t += 3;
      } else if (kind === 'stroll') { const a = r() * Math.PI * 2, d = r() * opt.r; p.x = opt.x + Math.cos(a) * d; p.z = opt.z + Math.sin(a) * d; }
    }
    p.t -= STEP;
    b.emote = null;
    if (p.kind === 'dance') { b.emote = 'dance'; m.goal = 'dance'; return BT.hold(); }
    const inp = BT.walkTo(game, b, p.x, p.z, { near: 1, speed: 0.75, safe: true });
    if (m.ledge) p.t = 0;                                  // у края - заняться другим
    if (inp && p.kind === 'stroll') { m.goal = 'stroll'; return inp; }
    if (inp) { m.goal = 'stroll'; if (m.blocked > 40) p.t = 0; return inp; }
    if (p.kind === 'stroll') { p.t = 0; m.goal = 'stroll'; return BT.hold(); }
    // смотрит и иногда болеет: машет и пишет
    const s = p.sight;
    m.goal = 'watch';
    if (!p.cheered && r() < 0.004) { p.cheered = true; b.emote = 'wave'; p.waveT = 1.2; BT.say(game, b, s.name && opt.cheer ? 'cheer' : 'watch', { name: s.name }); }
    if (p.waveT > 0) { p.waveT -= STEP; b.emote = 'wave'; }
    return { mx: 0, mz: 0, jump: false, face: Math.atan2(s.x - pl.pos.x, s.z - pl.pos.z) };
  };
  // Кто сейчас играет: другие боты (живые, не этот) и игрок - на них можно смотреть
  BT.others = function (game, b, filter) {
    const out = game.bots.filter((x) => x !== b && !x.dead && (!filter || filter(x))).map((x) => ({ x: x.body.pos.x, y: x.body.pos.y, z: x.body.pos.z, name: x.name }));
    if (game.player && !game.dead) out.push({ x: game.player.pos.x, y: game.player.pos.y, z: game.player.pos.z, name: B.acct.displayName() });
    return out;
  };

  // Продвижение к цели: чем больше value, тем ближе. Нет продвижения STUCK_T - сброс.
  BT.progress = function (b, value) {
    const m = b.mind;
    if (value > m.progBest + 0.5) { m.progBest = value; m.progT = 0; }
  };
  BT.progressPath = function (b, path) {
    const m = b.mind, pl = b.body, next = path[Math.min(path.length - 1, m.idx + 1)];
    BT.progress(b, m.idx * 1000 - Math.hypot(next.cx - pl.pos.x, next.cz - pl.pos.z, next.maxY - pl.pos.y));
  };
  // Начать путь заново с индекса idx (после смерти, сброса, нового раунда)
  BT.resetNav = function (b, idx) {
    const m = b.mind;
    m.idx = idx || 0; m.seg = null; m.progBest = -Infinity; m.progT = 0; m.stillT = 0; m.idleT = 0; m.blocked = 0; m.roam = null;
    m.anchor = { x: b.body.pos.x, z: b.body.pos.z }; m.seenLand = null; b.body.lastLand = null;
  };
  // Ближайшее к (x, y, z) место, где тело бота ни во что не упирается (поиск по спирали)
  BT.freeSpot = function (world, x, y, z) {
    const fits = (px, pz) => world.boxFree(px - PH.HX - 0.05, y + 0.02, pz - PH.HX - 0.05, px + PH.HX + 0.05, y + PH.HEIGHT + 0.1, pz + PH.HX + 0.05);
    if (fits(x, z)) return { x, y, z };
    for (let r = 0.75; r <= 6; r += 0.75) for (let a = 0; a < 12; a++) {
      const px = x + Math.cos(a * Math.PI / 6) * r, pz = z + Math.sin(a * Math.PI / 6) * r;
      if (fits(px, pz)) return { x: px, y, z: pz };
    }
    return { x, y, z };
  };

  // Сбросить на контрольную точку (застрял)
  BT.reset = function (game, b, why) {
    const P = game.place;
    const sp = P.botCheckpoint ? P.botCheckpoint(game, b) : P.botSpawn ? P.botSpawn(game, b.i) : game.spawn;
    const f = BT.freeSpot(game.world, sp.x, sp.y, sp.z);
    b.body.teleport(f.x, sp.y + 0.01, f.z);
    b.resets++;
    BT.onFail(b);
    BT.resetNav(b, sp.idx != null ? sp.idx : b.mind.idx);
    if (P.onBotReset) P.onBotReset(game, b, why);
    BT.say(game, b, 'stuck');
  };

  // После шага тела: приземление на деталь пути, неподвижность, застревание, болтовня
  BT.after = function (game, b, dt, path) {
    const m = b.mind, pl = b.body, P = game.place;
    // опора пути под ногами или только что коснулся (батут подбрасывает раньше, чем «стоит»)
    let land = null;
    if (pl.lastLand && pl.lastLand !== m.seenLand) { land = pl.lastLand; m.seenLand = land; }
    else if (pl.onGround && pl.ground) land = pl.ground;
    if (path && land) {
      let j = BT.pathIndex(path, land);
      // стоит на накладке поверх плиты пути (ускоритель, надпись) - считать саму плиту
      if (j < 0 && pl.onGround) {
        for (let k = Math.max(0, m.idx - 1); k <= Math.min(path.length - 1, m.idx + 3); k++) {
          const q = path[k];
          if (inside(q, pl.pos.x, pl.pos.z, -PH.HX + 0.1) && Math.abs(pl.pos.y - q.maxY) < 0.6) { j = k; break; }
        }
      }
      // стоит на стыке двух плит пути - считать дальнюю, если центр уже над ней
      if (j >= 0 && pl.onGround) {
        for (let k = j + 1; k <= Math.min(path.length - 1, j + 2); k++) {
          const q = path[k];
          if (inside(q, pl.pos.x, pl.pos.z, 0) && Math.abs(pl.pos.y - q.maxY) < 0.6) j = k;
        }
      }
      if (j >= 0 && j !== m.idx) {
        const up = j > m.idx;
        m.idx = j; m.seg = null;
        if (up && P.onBotReach) P.onBotReach(game, b, j, path[j]);
      }
    }
    // стоит ли на месте
    const moved = Math.hypot(pl.pos.x - m.anchor.x, pl.pos.z - m.anchor.z);
    if (moved > 1) { m.anchor.x = pl.pos.x; m.anchor.z = pl.pos.z; m.stillT = 0; } else m.stillT += dt;
    const aimless = !m.goal || m.goal === 'idle' || m.goal === 'arrived';
    m.idleT = aimless && m.stillT > 0 ? m.idleT + dt : 0;
    m.maxIdle = Math.max(m.maxIdle, m.idleT);
    if (m.idleT > BT.STILL_LIMIT * 0.6) { m.roam = null; m.goal = 'roam'; m.idleT = 0; }
    // застревание: идёт к цели, а ближе не становится; или стоит столбом там, где должен двигаться
    if (BT.TOWARD.includes(m.goal)) m.progT += dt; else m.progT = Math.max(0, m.progT - dt);
    const standing = !BT.LEGIT_STILL.includes(m.goal) && m.stillT > BT.STILL_LIMIT;
    m.maxStuck = Math.max(m.maxStuck, m.progT);
    if ((m.progT > BT.STUCK_T * b.st.patience || standing) && !b.dead) BT.reset(game, b, 'stuck');
    // реплика «от скуки» по ситуации места
    m.chatCd -= dt; m.chatT -= dt;
    if (m.chatT <= 0) { m.chatT = 14 + game.rng() * 22; BT.say(game, b, 'idle', P.botChatVars ? P.botChatVars(game, b) : null); }
  };

  // ---------- Чат ----------
  BT.say = function (game, b, kind, vars, force) {
    const m = b.mind;
    // общий чат не засыпать: между репликами ботов 5-8 с (важное - finish, значок - можно раньше, но не чаще 2 с)
    if ((game.chatCd || 0) > game.time + (force ? -3 : 0) || (!force && m.chatCd > 0)) return false;
    if (!force && game.rng() > b.st.chat) { m.chatCd = 3; return false; }
    const table = B.data.BOT_CHAT, en = B.lang() === 'en';
    const place = table[game.id] || {}, common = table.common;
    const list = (place[kind] || common[kind]);
    if (!list) return false;
    // только строки, для которых есть все подстановки
    const fill = (t) => (vars ? t.replace(/\{(\w+)\}/g, (s, k) => vars[k]) : t);
    const recent = game.botLines || (game.botLines = []);
    // только строки со всеми подстановками и без повтора недавних
    const lines = (en ? list.en : list.ru).filter((t) => (t.match(/\{(\w+)\}/g) || []).every((k) => vars && vars[k.slice(1, -1)] != null)).map(fill).filter((t) => !recent.includes(t));
    if (!lines.length) return false;
    const text = game.rng.pick(lines);
    recent.push(text); if (recent.length > 10) recent.shift();
    game.say(b.name, text, b.cfg.colors.torso);
    m.chatCd = 12 + game.rng() * 10;
    game.chatCd = game.time + 5 + game.rng() * 3;
    b.lastSaid = { kind, text, t: game.time };
    return true;
  };
  // Системная строка в чат (значок бота и т. п.)
  BT.system = function (game, text) { game.say('', text, null, true); };
})(window.Blox);
