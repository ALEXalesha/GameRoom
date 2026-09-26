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
    this.fallTop = null; this.dead = false; this.lastDamage = null;
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

  // Твёрдо ли в клетке (незагруженный кусок - твёрдый: не провалиться, пока мир грузится)
  function solidAt(world, x, y, z) {
    if (y < 0) return true;
    if (y >= C.CH) return false;
    const b = world.getBlock(x, y, z);
    return b < 0 ? true : C.SOLID[b] === 1;
  }
  function boxHits(world, b) {
    for (let x = Math.floor(b[0]); x <= Math.floor(b[3] - EPS); x++)
      for (let y = Math.floor(b[1]); y <= Math.floor(b[4] - EPS); y++)
        for (let z = Math.floor(b[2]); z <= Math.floor(b[5] - EPS); z++)
          if (solidAt(world, x, y, z)) return true;
    return false;
  }
  // Сколько можно сдвинуться по оси (0 x, 1 y, 2 z) на d, не войдя в блок
  function sweep(world, b, axis, d) {
    if (d === 0) return 0;
    const lo = b.slice(0, 3), hi = b.slice(3);
    const mn = lo.slice(), mx = hi.slice();
    if (d > 0) mx[axis] += d; else mn[axis] += d;
    for (let x = Math.floor(mn[0]); x <= Math.floor(mx[0] - EPS); x++)
      for (let y = Math.floor(mn[1]); y <= Math.floor(mx[1] - EPS); y++)
        for (let z = Math.floor(mn[2]); z <= Math.floor(mx[2] - EPS); z++) {
          if (!solidAt(world, x, y, z)) continue;
          const bl = [x, y, z], bh = [x + 1, y + 1, z + 1];
          let overlap = true;
          for (let k = 0; k < 3 && overlap; k++) if (k !== axis && (hi[k] <= bl[k] + EPS || lo[k] >= bh[k] - EPS)) overlap = false;
          if (!overlap) continue;
          if (d > 0 && hi[axis] <= bl[axis] + EPS) d = Math.min(d, bl[axis] - hi[axis]);
          else if (d < 0 && lo[axis] >= bh[axis] - EPS) d = Math.max(d, bh[axis] - lo[axis]);
        }
    return d;
  }
  function moveBox(world, p, dx, dy, dz) {
    let b = p.box();
    const ry = sweep(world, b, 1, dy);
    p.pos.y += ry; b = p.box();
    const rx = sweep(world, b, 0, dx);
    p.pos.x += rx; b = p.box();
    const rz = sweep(world, b, 2, dz);
    p.pos.z += rz;
    return { cx: rx !== dx, cy: ry !== dy, cz: rz !== dz, down: dy < 0 && ry !== dy };
  }

  // Вода: коробка касается воды ногами и головой
  function waterAt(world, x, y, z) { return world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)) === C.B.water; }

  // input: { f, b, l, r, jump, sneak, sprint } - кнопки; mode: 'creative' | 'survival'
  Player.prototype.update = function (dt, input, world, mode, ev) {
    const creative = mode === 'creative';
    if (this.dead) return;
    if (!creative && this.flying) this.flying = false;
    this.sneaking = !!input.sneak && !this.flying;
    this.inWater = waterAt(world, this.pos.x, this.pos.y + 0.4, this.pos.z);
    this.headInWater = waterAt(world, this.pos.x, this.eye() + 0.1, this.pos.z);
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
    else if (this.sneaking) speed = SPEED.sneak;
    else speed = this.sprinting ? SPEED.sprint : SPEED.walk;
    // разгон: на земле быстрый, в воздухе - по инерции
    const acc = this.flying ? 10 : this.onGround ? 22 : this.inWater ? 8 : 3.2;
    const k = 1 - Math.exp(-acc * dt);
    this.vel.x += (mx * speed - this.vel.x) * k;
    this.vel.z += (mz * speed - this.vel.z) * k;

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
      if (input.jump && this.onGround && this.jumpCool <= 0) {
        this.vel.y = JUMP; this.onGround = false; this.jumpCool = 0.1;
        if (ev) ev('jump');
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
    const hit = moveBox(world, this, dx, dy, dz);
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
    if (this.flying || this.inWater || creative) this.fallTop = null;
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

    if (!creative) this.survivalTick(dt, ev);
    this.hurtCool = Math.max(0, this.hurtCool - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
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
  Player.prototype.damage = function (n, cause, ev, ignoreCool) {
    if (this.dead || n <= 0) return false;
    if (this.hurtCool > 0 && !ignoreCool && cause !== 'fall') return false;
    this.health = Math.max(0, this.health - n);
    this.hurtCool = 0.5; this.hurtFlash = 0.35;
    this.lastDamage = { n, cause };
    this.exhaust(0.1);
    if (ev) ev('hurt', { n, cause });
    if (this.health <= 0) { this.dead = true; if (ev) ev('death', cause); }
    return true;
  };
  Player.prototype.eat = function (food) {
    this.food = Math.min(20, this.food + food.h);
    this.saturation = Math.min(this.food, this.saturation + food.sat);
  };
  Player.prototype.toJSON = function () {
    const r = (v) => Math.round(v * 1000) / 1000;
    return { pos: [r(this.pos.x), r(this.pos.y), r(this.pos.z)], yaw: r(this.yaw), pitch: r(this.pitch), flying: this.flying, health: this.health, food: this.food, saturation: this.saturation, air: this.air };
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
  };

  VX.Player = Player;
  VX.phys = { boxHits, sweep, solidAt, HALF, HEIGHT, EYE, SPEED };
})();
