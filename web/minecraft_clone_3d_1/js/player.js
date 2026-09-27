// Игрок и столкновения: коробка 0.6 x 1.8 (глаза на 1.62), движение по осям по очереди
// (сначала Y, потом X и Z) с отсечением по блокам, как в оригинале. Ходьба 4.3 м/с,
// бег 5.6, красться 1.3 (и не упасть с края), прыжок на 1.25 блока, плавание, полёт
// в творческом режиме. Здесь же здоровье, голод, воздух и урон от падения.
(function () {
  'use strict';
  const VX = window.VX = window.VX || {};
  const C = VX.core;
  const HALF = 0.3, HEIGHT = 1.8, EYE = 1.62, EYE_SNEAK = 1.32;
  const G = 28.2, JUMP = 8.4, TERMINAL = 78;
  const CLIMB = 2.35, FLOW_ACC = 11;        // подъём по лестнице, м/с; снос течением, м/с²
  const SPEED = { walk: 4.317, sprint: 5.612, sneak: 1.31, fly: 10.9, flySprint: 21.8, swim: 2.2 };
  const EPS = 1e-6;

  function Player() {
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.onGround = false; this.flying = false; this.sneaking = false; this.sprinting = false;
    this.inWater = false; this.headInWater = false;
    this.reset();
  }
  Player.prototype.reset = function () {
    this.health = 20; this.food = 20; this.saturation = 5; this.exhaustion = 0;
    this.air = 15; this.hurtCool = 0; this.hurtFlash = 0; this.regenT = 0; this.starveT = 0; this.drownT = 0;
    this.fallTop = null; this.dead = false; this.lastDamage = null; this.fireT = 0; this.burnT = 0;
    this.level = 0; this.xpPoints = 0; this.xpTotal = 0;
    this.vel.set(0, 0, 0);
  };
  Player.prototype.eye = function () { return this.pos.y + (this.sneaking && !this.flying ? EYE_SNEAK : EYE); };
  Player.prototype.box = function (x, y, z) {
    x = x === undefined ? this.pos.x : x; y = y === undefined ? this.pos.y : y; z = z === undefined ? this.pos.z : z;
    return [x - HALF, y, z - HALF, x + HALF, y + HEIGHT, z + HALF];
  };
  Player.prototype.forward = function () {
    const cp = Math.cos(this.pitch);
    return new THREE.Vector3(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  };

  // Коробки столкновения блока в мировых координатах: полный куб или своя форма (дверь, кровать,
  // сундук, грядка, кактус). Незагруженный кусок - твёрдый: не провалиться, пока мир грузится.
  const FULL = [[0, 0, 0, 16, 16, 16]];
  function boxesAt(world, x, y, z) {
    if (y < 0) return FULL;
    if (y >= C.CH) return null;
    const b = world.getBlock(x, y, z);
    if (b < 0) return FULL;
    if (C.SOLID[b] !== 1) return null;
    const s = C.shapeOf(b, (dx, dy, dz) => world.getBlock(x + dx, y + dy, z + dz), 'collide');
    return s ? (s.length ? s : null) : FULL;
  }
  function solidAt(world, x, y, z) { return !!boxesAt(world, x, y, z); }
  function boxHits(world, b) {
    for (let x = Math.floor(b[0]); x <= Math.floor(b[3] - EPS); x++)
      for (let y = Math.floor(b[1] - 0.5); y <= Math.floor(b[4] - EPS); y++)
        for (let z = Math.floor(b[2]); z <= Math.floor(b[5] - EPS); z++) {
          const bx = boxesAt(world, x, y, z);
          if (!bx) continue;
          for (const s of bx) {
            if (b[0] < x + s[3] / 16 - EPS && b[3] > x + s[0] / 16 + EPS && b[1] < y + s[4] / 16 - EPS && b[4] > y + s[1] / 16 + EPS && b[2] < z + s[5] / 16 - EPS && b[5] > z + s[2] / 16 + EPS) return true;
          }
        }
    return false;
  }
  // Сколько можно сдвинуться по оси (0 x, 1 y, 2 z) на d, не войдя в блок
  function sweep(world, b, axis, d) {
    if (d === 0) return 0;
    const lo = b.slice(0, 3), hi = b.slice(3);
    const mn = lo.slice(), mx = hi.slice();
    if (d > 0) mx[axis] += d; else mn[axis] += d;
    for (let x = Math.floor(mn[0]); x <= Math.floor(mx[0] - EPS); x++)
      for (let y = Math.floor(mn[1] - 0.5); y <= Math.floor(mx[1] - EPS); y++)
        for (let z = Math.floor(mn[2]); z <= Math.floor(mx[2] - EPS); z++) {
          const bx = boxesAt(world, x, y, z);
          if (!bx) continue;
          for (const s of bx) {
            const bl = [x + s[0] / 16, y + s[1] / 16, z + s[2] / 16], bh = [x + s[3] / 16, y + s[4] / 16, z + s[5] / 16];
            let overlap = true;
            for (let k = 0; k < 3 && overlap; k++) if (k !== axis && (hi[k] <= bl[k] + EPS || lo[k] >= bh[k] - EPS)) overlap = false;
            if (!overlap) continue;
            if (d > 0 && hi[axis] <= bl[axis] + EPS) d = Math.min(d, bl[axis] - hi[axis]);
            else if (d < 0 && lo[axis] >= bh[axis] - EPS) d = Math.max(d, bh[axis] - lo[axis]);
          }
        }
    return d;
  }
  // Движение по осям; на земле невысокая ступень (до 0.6: кровать, грядка) берётся шагом, как в оригинале
  function moveBox(world, p, dx, dy, dz, canStep) {
    const x0 = p.pos.x, y0 = p.pos.y, z0 = p.pos.z;
    let b = p.box();
    const ry = sweep(world, b, 1, dy);
    p.pos.y += ry; b = p.box();
    const rx = sweep(world, b, 0, dx);
    p.pos.x += rx; b = p.box();
    const rz = sweep(world, b, 2, dz);
    p.pos.z += rz;
    const res = { cx: rx !== dx, cy: ry !== dy, cz: rz !== dz, down: dy < 0 && ry !== dy };
    if (canStep && (res.cx || res.cz)) {
      const sx = p.pos.x, sy = p.pos.y, sz = p.pos.z;
      p.pos.set(x0, y0, z0);
      let bb = p.box();
      const up = sweep(world, bb, 1, 0.6);
      p.pos.y += up; bb = p.box();
      const ax = sweep(world, bb, 0, dx); p.pos.x += ax; bb = p.box();
      const az = sweep(world, bb, 2, dz); p.pos.z += az; bb = p.box();
      const down = sweep(world, bb, 1, -up + Math.min(0, dy)); p.pos.y += down;
      if (Math.hypot(p.pos.x - x0, p.pos.z - z0) > Math.hypot(sx - x0, sz - z0) + 1e-4 && up > 0) {
        return { cx: ax !== dx, cy: true, cz: az !== dz, down: true, stepped: true };
      }
      p.pos.set(sx, sy, sz);
    }
    return res;
  }

  // Вода: коробка касается воды ногами и головой
  const fluidAt = (world, x, y, z) => { const b = world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)); return b > 0 ? C.FLUID[b] : 0; };
  function waterAt(world, x, y, z) { return fluidAt(world, x, y, z) === 1; }
  // Касается ли коробка блока с id из набора (кактус - чуть шире коробки, огонь и лава - клетка)
  function touching(world, box, ids, pad) {
    for (let x = Math.floor(box[0] - pad); x <= Math.floor(box[3] + pad - EPS); x++)
      for (let y = Math.floor(box[1] - pad); y <= Math.floor(box[4] + pad - EPS); y++)
        for (let z = Math.floor(box[2] - pad); z <= Math.floor(box[5] + pad - EPS); z++) {
          const b = world.getBlock(x, y, z);
          if (b <= 0 || !ids(b)) continue;
          const qs = C.shapeOf(b, (dx, dy, dz) => world.getBlock(x + dx, y + dy, z + dz), 'outline') || FULL;
          for (const q of qs) if (box[0] - pad < x + q[3] / 16 && box[3] + pad > x + q[0] / 16 && box[1] - pad < y + q[4] / 16 && box[4] + pad > y + q[1] / 16 && box[2] - pad < z + q[5] / 16 && box[5] + pad > z + q[2] / 16) return [x + 0.5, y, z + 0.5];
        }
    return null;
  }
  // Течение воды в клетке: к соседям с меньшим уровнем (и туда, где вода падает вниз), как в оригинале.
  // Возвращает единичный вектор [x, z] и признак падающей воды или null.
  const FLEV = (id) => (C.FLUID[id] === 1 ? (C.FFALL[id] ? 0 : C.FLEVEL[id]) : -1);
  function flowAt(world, x, y, z) {
    const id = world.getBlock(x, y, z);
    if (id <= 0 || C.FLUID[id] !== 1) return null;
    const L = FLEV(id);
    let fx = 0, fz = 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = world.getBlock(x + dx, y, z + dz);
      if (n < 0) continue;
      let diff = 0;
      if (C.FLUID[n] === 1) diff = FLEV(n) - L;
      else if (n === 0 || !C.SOLID[n]) {
        const below = world.getBlock(x + dx, y - 1, z + dz);
        if (below === 0 || C.FLUID[below] === 1) diff = 8 - L;      // туда вода уходит вниз
      }
      if (diff > 0) { fx += dx * diff; fz += dz * diff; }
    }
    const len = Math.hypot(fx, fz);
    const fall = !!C.FFALL[id];
    if (len < 1e-6 && !fall) return null;
    return { x: len ? fx / len : 0, z: len ? fz / len : 0, fall };
  }
  const isLadder = (b) => b > 0 && C.BLOCKS[b].ladder !== undefined;
  const isCactus = (b) => b === C.B.cactus;
  const isLava = (b) => C.FLUID[b] === 2;
  const isFire = (b) => b === C.B.fire;

  // input: { f, b, l, r, jump, sneak, sprint } - кнопки; mode: 'creative' | 'survival'
  Player.prototype.update = function (dt, input, world, mode, ev) {
    const creative = mode === 'creative';
    if (this.dead) return;
    if (!creative && this.flying) this.flying = false;
    this.sneaking = !!input.sneak && !this.flying;
    this.inWater = waterAt(world, this.pos.x, this.pos.y + 0.4, this.pos.z);
    this.headInWater = waterAt(world, this.pos.x, this.eye() + 0.1, this.pos.z);
    this.inLava = !!touching(world, this.box(), isLava, 0);
    if (this.inLava) this.inWater = true;           // в лаве двигаешься как в воде, только медленнее и больно
    // направление по кнопкам в плоскости взгляда
    let mx = 0, mz = 0;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    if (input.f) { mx += fx; mz += fz; }
    if (input.b) { mx -= fx; mz -= fz; }
    if (input.r) { mx -= fz; mz += fx; }
    if (input.l) { mx += fz; mz -= fx; }
    const len = Math.hypot(mx, mz);
    if (len > 0) { mx /= len; mz /= len; }
    const canSprint = input.f && (creative || this.food > 6) && !this.sneaking;
    if (!canSprint || len === 0) this.sprinting = false;
    else if (input.sprint) this.sprinting = true;
    let speed;
    if (this.flying) speed = this.sprinting ? SPEED.flySprint : SPEED.fly;
    else if (this.inWater) speed = SPEED.swim * (this.sprinting ? 1.3 : 1);
    else if (this.sneaking || this.blocking) speed = SPEED.sneak;
    else speed = this.sprinting ? SPEED.sprint : SPEED.walk;
    // песок душ вязкий: идёшь в 2.5 раза медленнее
    if (!this.flying && world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y - 0.05), Math.floor(this.pos.z)) === C.SOUL_SAND) speed *= 0.4;
    // разгон: на земле быстрый, в воздухе - по инерции
    const acc = this.flying ? 10 : this.onGround ? 22 : this.inWater ? 8 : 3.2;
    const k = 1 - Math.exp(-acc * dt);
    this.vel.x += (mx * speed - this.vel.x) * k;
    this.vel.z += (mz * speed - this.vel.z) * k;
    // течение воды сносит (в полёте - нет)
    this.current = null;
    if (this.inWater && !this.flying && !this.inLava) {
      const f = flowAt(world, Math.floor(this.pos.x), Math.floor(this.pos.y + 0.2), Math.floor(this.pos.z)) || flowAt(world, Math.floor(this.pos.x), Math.floor(this.pos.y + 1), Math.floor(this.pos.z));
      if (f) {
        this.current = f;
        this.vel.x += f.x * FLOW_ACC * dt; this.vel.z += f.z * FLOW_ACC * dt;
        if (f.fall) this.vel.y -= FLOW_ACC * 0.5 * dt;
      }
    }
    // лестница: в клетке ног или головы
    const lx = Math.floor(this.pos.x), lz = Math.floor(this.pos.z);
    this.onLadder = !this.flying && (isLadder(world.getBlock(lx, Math.floor(this.pos.y + 0.05), lz)) || isLadder(world.getBlock(lx, Math.floor(this.pos.y + 1), lz)));

    const wasGround = this.onGround;
    if (this.flying) {
      const vy = (input.jump ? 1 : 0) - (input.sneak ? 1 : 0);
      this.vel.y += (vy * SPEED.fly * 0.75 - this.vel.y) * (1 - Math.exp(-10 * dt));
    } else if (this.inWater) {
      this.vel.y -= 9 * dt;
      if (input.jump) this.vel.y += 24 * dt;
      this.vel.y *= Math.pow(0.12, dt);
      this.vel.y = Math.max(-3.5, Math.min(3.2, this.vel.y));
    } else {
      this.vel.y = Math.max(-TERMINAL, this.vel.y - G * dt);
      if (input.jump && this.onGround && this.jumpCool <= 0 && !this.onLadder) {
        this.vel.y = JUMP; this.onGround = false; this.jumpCool = 0.1;
        if (ev) ev('jump');
      }
      if (this.onLadder) {
        // по лестнице: вверх - упором в неё или прыжком, вниз - не быстрее 3 м/с, крадясь - висишь
        this.vel.y = Math.max(this.vel.y, -3);
        if (this.sneaking) this.vel.y = Math.max(this.vel.y, 0);
        if (input.jump || this.pushWall) this.vel.y = CLIMB;
        this.vel.x = Math.max(-3, Math.min(3, this.vel.x)); this.vel.z = Math.max(-3, Math.min(3, this.vel.z));
      }
    }
    this.jumpCool = Math.max(0, (this.jumpCool || 0) - dt);

    let dx = this.vel.x * dt, dy = this.vel.y * dt, dz = this.vel.z * dt;
    // красться: не сходить с края, пока стоишь на земле
    if (this.sneaking && this.onGround && !this.flying) {
      const b = this.box();
      const off = (ox, oz) => [b[0] + ox, b[1] - 0.6, b[2] + oz, b[3] + ox, b[1] - 0.01, b[5] + oz];
      const stepv = 0.05;
      while (dx !== 0 && !boxHits(world, off(dx, 0))) dx = Math.abs(dx) < stepv ? 0 : dx - Math.sign(dx) * stepv;
      while (dz !== 0 && !boxHits(world, off(0, dz))) dz = Math.abs(dz) < stepv ? 0 : dz - Math.sign(dz) * stepv;
      while (dx !== 0 && dz !== 0 && !boxHits(world, off(dx, dz))) {
        dx = Math.abs(dx) < stepv ? 0 : dx - Math.sign(dx) * stepv;
        dz = Math.abs(dz) < stepv ? 0 : dz - Math.sign(dz) * stepv;
      }
      if (dx === 0) this.vel.x = 0;
      if (dz === 0) this.vel.z = 0;
    }
    const y0 = this.pos.y;
    const hit = moveBox(world, this, dx, dy, dz, (this.onGround || this.flying) && !this.inWater);
    this.pushWall = (hit.cx || hit.cz) && len > 0;
    if (hit.cx) this.vel.x = 0;
    if (hit.cz) this.vel.z = 0;
    if (hit.cy) {
      if (this.vel.y < 0) this.onGround = true;
      this.vel.y = 0;
    } else this.onGround = false;
    if (this.onGround && this.flying) this.flying = false;     // приземлился - полёт кончился
    // выпрыгнуть из воды на берег
    if (this.inWater && input.jump && (hit.cx || hit.cz)) this.vel.y = 6.5;

    // путь - для шагов и голода
    this.walked = (this.walked || 0) + (this.onGround ? Math.hypot(dx, dz) : 0);
    if (!creative) {
      this.exhaust((this.sprinting ? 0.1 : 0.01) * Math.hypot(dx, dz) * (this.onGround || this.inWater ? 1 : 0));
    }

    // падение: высшая точка в воздухе минус точка приземления
    if (this.flying || this.inWater || creative || this.onLadder) this.fallTop = null;
    else if (!this.onGround) { if (this.fallTop === null || this.pos.y > this.fallTop) this.fallTop = Math.max(this.pos.y, y0); }
    if (this.onGround && !wasGround) {
      if (this.fallTop !== null && !creative) {
        const fall = this.fallTop - this.pos.y;
        const dmg = Math.max(0, Math.ceil(fall - 3 - 0.01));
        if (dmg > 0) this.damage(dmg, 'fall', ev);
        if (ev) ev('land', fall);
      }
      this.fallTop = null;
    }
    if (this.onGround) this.fallTop = null;
    if (this.pos.y < -64) { this.damage(creative ? 0 : 1000, 'void', ev); if (creative) { this.pos.y = C.CH + 10; this.vel.y = 0; } }

    if (!creative) { this.contactTick(dt, world, ev); this.survivalTick(dt, ev); }
    this.hurtCool = Math.max(0, this.hurtCool - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
  };

  // Лава, огонь, кактус: урон при касании, горение после выхода из огня
  Player.prototype.contactTick = function (dt, world, ev) {
    const box = this.box();
    if (this.inLava) {
      this.fireT = 15;
      this.damage(4, 'lava', ev);
    } else if (touching(world, box, isFire, 0)) {
      this.fireT = Math.max(this.fireT || 0, 8);
      this.damage(1, 'fire', ev);
    }
    const c = touching(world, box, isCactus, 0.02);
    if (c && this.damage(1, 'cactus', ev)) {
      const dx = this.pos.x - c[0], dz = this.pos.z - c[2], d = Math.hypot(dx, dz) || 1;
      this.vel.x += dx / d * 3; this.vel.z += dz / d * 3;
    }
    if (this.inWater && !this.inLava) this.fireT = 0;
    if (this.fireT > 0) {
      this.fireT -= dt;
      this.burnT = (this.burnT || 0) + dt;
      if (this.burnT >= 1) { this.burnT -= 1; this.damage(1, 'burn', ev, true); }
    } else this.burnT = 0;
  };
  Player.prototype.exhaust = function (v) {
    this.exhaustion += v;
    while (this.exhaustion >= 4) {
      this.exhaustion -= 4;
      if (this.saturation > 0) this.saturation = Math.max(0, this.saturation - 1);
      else this.food = Math.max(0, this.food - 1);
    }
  };
  // Здоровье, голод и воздух (раз в 4 секунды - лечение от сытости или урон от голода)
  Player.prototype.survivalTick = function (dt, ev) {
    if (this.headInWater) {
      this.air -= dt;
      if (this.air <= 0) {
        this.air = 0;
        this.drownT += dt;
        if (this.drownT >= 1) { this.drownT -= 1; this.damage(2, 'drown', ev, true); }
      }
    } else { this.air = Math.min(15, this.air + dt * 5); this.drownT = 0; }
    if (this.food >= 18 && this.health < 20) {
      this.regenT += dt;
      if (this.regenT >= 4) { this.regenT -= 4; this.health = Math.min(20, this.health + 1); this.exhaust(6); }
    } else this.regenT = 0;
    if (this.food <= 0) {
      this.starveT += dt;
      if (this.starveT >= 4) { this.starveT -= 4; if (this.health > 1) this.damage(1, 'starve', ev, true); }
    } else this.starveT = 0;
  };
  // Урон. Возвращает true, если прошёл (после удара полсекунды неуязвимости)
  // from - откуда удар ({x, z}): щит спереди (в пределах 90° от взгляда) гасит удары мобов, стрелы и взрывы
  const BLOCKABLE = new Set(['slime', 'zombie', 'skeleton', 'spider', 'arrow', 'explosion', 'mob', 'fireball', 'zombie_pigman', 'blaze']);
  Player.prototype.damage = function (n, cause, ev, ignoreCool, from) {
    if (this.dead || n <= 0) return false;
    if (this.hurtCool > 0 && !ignoreCool && cause !== 'fall') return false;
    if (from && this.blocking && BLOCKABLE.has(cause)) {
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw), dx = from.x - this.pos.x, dz = from.z - this.pos.z;
      if (fx * dx + fz * dz > 0) { if (this.onShield) this.onShield(n, cause); if (ev) ev('blocked', { n, cause }); return false; }
    }
    n = this.armorReduce(n, cause);
    this.health = Math.max(0, Math.round((this.health - n) * 100) / 100);
    this.hurtCool = 0.5; this.hurtFlash = 0.35;
    this.lastDamage = { n, cause };
    this.exhaust(0.1);
    if (ev) ev('hurt', { n, cause });
    if (this.health <= 0) { this.dead = true; if (ev) ev('death', cause); }
    return true;
  };
  // Броня по формуле оригинала: урон x (1 - min(20, max(броня/5, броня - урон/(2 + прочность/4)))/25).
  // Падение, утопление, голод, горение и пустота броней не гасятся.
  const ARMORED = new Set(['slime', 'zombie', 'skeleton', 'spider', 'arrow', 'cactus', 'lava', 'fire', 'mob', 'explosion', 'fireball', 'zombie_pigman', 'blaze']);
  Player.prototype.armorPoints = function () {
    const a = this.armorSlots ? this.armorSlots() : null;
    let pts = 0, tough = 0;
    if (a) for (const s of a) { const ar = s && VX.data.armorOf(s.id); if (ar) { pts += ar.pts; tough += ar.tough; } }
    return { pts, tough };
  };
  Player.prototype.armorReduce = function (n, cause) {
    if (!ARMORED.has(cause)) return n;
    const { pts, tough } = this.armorPoints();
    if (!pts) return n;
    const cut = Math.min(20, Math.max(pts / 5, pts - n / (2 + tough / 4)));
    // каждая надетая вещь теряет прочность: не меньше 1 за удар
    const a = this.armorSlots();
    const wear = Math.max(1, Math.floor(n / 4));
    for (let i = 0; i < 4; i++) {
      const s = a[i];
      const ar = s && VX.data.armorOf(s.id);
      if (!ar) continue;
      s.dmg = (s.dmg || 0) + wear;
      if (s.dmg >= ar.dur) { a[i] = null; if (VX.audio) VX.audio.play('break', { surface: 'stone' }); }
    }
    return n * (1 - cut / 25);
  };
  Player.prototype.eat = function (food) {
    this.food = Math.min(20, this.food + food.h);
    this.saturation = Math.min(this.food, this.saturation + food.sat);
  };
  Player.prototype.toJSON = function () {
    const r = (v) => Math.round(v * 1000) / 1000;
    return { pos: [r(this.pos.x), r(this.pos.y), r(this.pos.z)], yaw: r(this.yaw), pitch: r(this.pitch), flying: this.flying, health: this.health, food: this.food, saturation: this.saturation, air: this.air, level: this.level || 0, xp: this.xpPoints || 0, score: this.xpTotal || 0 };
  };
  Player.prototype.load = function (o) {
    this.reset();
    if (!o) return;
    this.pos.set(o.pos[0], o.pos[1], o.pos[2]);
    this.yaw = o.yaw || 0; this.pitch = o.pitch || 0; this.flying = !!o.flying;
    if (typeof o.health === 'number') this.health = o.health;
    if (typeof o.food === 'number') this.food = o.food;
    if (typeof o.saturation === 'number') this.saturation = o.saturation;
    if (typeof o.air === 'number') this.air = o.air;
    if (typeof o.level === 'number') { this.level = o.level; this.xpPoints = o.xp || 0; this.xpTotal = o.score || 0; }
  };

  VX.Player = Player;
  VX.phys = { boxHits, sweep, solidAt, boxesAt, touching, flowAt, isLadder, isCactus, isLava, isFire, HALF, HEIGHT, EYE, SPEED, fluidAt };
})();
