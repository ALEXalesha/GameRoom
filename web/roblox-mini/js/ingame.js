// Сеанс в месте: экран загрузки, герой и боты, камера, меню (Esc), таблица игроков (Tab), чат,
// развал персонажа и возрождение, итоги, настройки в игре, пауза при скрытой вкладке.
'use strict';
(function (B) {
  const E = B.engine, PH = E.PHYS, STEP = B.STEP;
  const G = B.game = { cur: null, loading: null };
  const $ = (id) => document.getElementById(id);
  const RESPAWN = 2.2;
  B.places = B.places || {};

  function nameplate(text) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: B.tex.nameplate(text), depthWrite: false, transparent: true }));
    s.scale.set(4.4, 4.4 * 96 / 512, 1);
    s.position.set(0, 6.4, 0);
    s.userData.text = text;
    s.renderOrder = 5;
    return s;
  }

  // Цвет имени в чате: тёмные и слишком светлые цвета одежды сдвигаются к читаемым на тёмной плашке
  const chatCol = new THREE.Color(), hsl = {};
  function chatColor(c) {
    chatCol.set(c || '#ffffff').getHSL(hsl);
    return '#' + chatCol.setHSL(hsl.h, Math.min(hsl.s, 0.85), B.clamp(hsl.l, 0.62, 0.8)).getHexString();
  }

  function randomAvatar(rnd) {
    const C = B.data.COLORS.map((c) => c[0]);
    const skin = rnd.pick(['#f6d7b0', '#eab98a', '#c98d5e', '#8e5a3a', '#ffd23f']);
    const pick = (list) => rnd.pick(list).id;
    const acc = (slot) => { const l = B.data.ACCESSORIES.filter((a) => a.slot === slot); return rnd() < 0.6 ? rnd.pick(l).id : ''; };
    return {
      colors: { head: skin, torso: rnd.pick(C), armL: skin, armR: skin, legL: rnd.pick(C), legR: '' },
      face: pick(B.data.FACES), shirt: pick(B.data.SHIRTS), pants: pick(B.data.PANTS),
      hat: acc('hat'), hair: rnd() < 0.7 ? acc('hair') : '', faceAcc: rnd() < 0.2 ? 'acc_glasses' : '', back: rnd() < 0.3 ? acc('back') : '',
    };
  }

  G.randomAvatar = (rnd) => { const a = randomAvatar(rnd); a.colors.legR = a.colors.legL; return a; };

  class Game {
    constructor(placeId) {
      this.id = placeId;
      this.meta = B.data.place(placeId);
      this.place = B.places[placeId];
      this.seed = (B.params.seed ^ B.hash(placeId)) >>> 0;
      this.rng = B.rng(this.seed);
      this.world = new E.World(this.seed);
      this.tick = 0; this.time = 0;
      this.paused = false; this.menuOpen = false;
      this.keys = {}; this.bots = []; this.pieces = []; this.dead = false; this.respawnT = 0;
      this.state = {}; this.chatLog = []; this.emote = null; this.moveTarget = null;
      this.spawn = { x: 0, y: 0, z: 0, facing: Math.PI };
      this.frames = []; this.hudCache = ''; this.boardT = 0; this.botChatT = 6 + this.rng() * 6;
      this.result = null; this.listeners = [];
    }

    // ---------- Сборка: по шагам, чтобы экран загрузки показывал ход ----------
    *buildSteps() {
      const w = this.world, P = this.place;
      const skyOpt = Object.assign({ seed: this.seed }, P.sky || {});
      this.skyObj = E.makeSky(w.scene, skyOpt);
      this.lights = E.makeLights(w.scene, this.skyObj.sunDir);
      w.scene.fog = new THREE.Fog(this.skyObj.hor, 200, 600);
      yield 0.15;
      P.build(this);
      yield 0.5;
      w.finalize();
      yield 0.65;
      // герой
      this.avatarCfg = B.acct.avatar();
      this.player = new E.Body(w, this.spawn.x, this.spawn.y, this.spawn.z);
      this.player.facing = this.player.prevFacing = this.spawn.facing;
      this.makePlayerChar();
      // боты
      const n = this.botCount();
      this.botTotal = n;
      this.botNames = B.data.BOT_NAMES.slice();
      for (let i = 0; i < n; i++) this.addBot(i);
      yield 0.8;
      // камера
      this.camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 1500);
      this.rig = new E.CameraRig(this.camera);
      this.rig.yaw = this.spawn.facing + Math.PI;
      if (P.setup) P.setup(this);
      this.applySettings();
      this.updateCamera(0, 0);
      // собрать шейдеры заранее, в том числе у скрытого (призрак блока, ватрушки): иначе заминка при первом показе
      try {
        const hidden = [];
        w.scene.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
        E.renderer.compile(w.scene, this.camera);
        for (const o of hidden) o.visible = false;
      } catch (e) { /* не страшно */ }
      yield 1;
    }

    // Сколько ботов: ?bots=N (замеры) - настройка места - по умолчанию у места
    botCount() {
      if (B.params.bots != null) return B.params.bots;
      const P = this.place;
      return P.botCount ? P.botCount(this) : (P.bots == null ? 3 : P.bots);
    }
    addBot(i) {
      const P = this.place, w = this.world;
      if (!this.botNames.length) this.botNames = B.data.BOT_NAMES.slice();
      const name = this.botNames.splice(this.rng.int(this.botNames.length), 1)[0];
      const sp0 = P.botSpawn ? P.botSpawn(this, i) : { x: this.spawn.x + (i - 1) * 5, y: this.spawn.y, z: this.spawn.z - 6 };
      const sp = B.bots.freeSpot(w, sp0.x, sp0.y, sp0.z);
      const body = new E.Body(w, sp.x, sp.y, sp.z);
      const cfg = randomAvatar(this.rng);
      cfg.colors.legR = cfg.colors.legL;
      const ch = B.avatar.build(cfg);
      const np = nameplate(name); ch.root.add(np);
      w.scene.add(ch.root);
      const b = { name, body, ch, np, cfg, dead: false, respawnT: 0, ai: { t: 0, tx: sp.x, tz: sp.z, jump: 0 }, stat: 0, i };
      this.bots.push(b);
      B.bots.init(this, b, i);
      return b;
    }
    removeBot(b) {
      const i = this.bots.indexOf(b);
      if (i < 0) return;
      this.bots.splice(i, 1);
      this.world.scene.remove(b.ch.root);
      b.ch.dispose();
      if (b.tube) this.world.scene.remove(b.tube);
      this.botNames.push(b.name);
      if (this.place.onBotRemoved) this.place.onBotRemoved(this, b);
    }
    // Число ботов меняется сразу (настройка места)
    setBotCount(n) {
      n = B.clamp(Math.round(n), 0, 6);
      while (this.bots.length > n) this.removeBot(this.bots[this.bots.length - 1]);
      let i = this.bots.length ? Math.max(...this.bots.map((b) => b.i)) + 1 : 0;
      while (this.bots.length < n) { const b = this.addBot(i++); if (this.place.onBotAdded) this.place.onBotAdded(this, b); }
      this.botTotal = n;
      this.drawBoard();
    }

    makePlayerChar() {
      if (this.ch) { this.world.scene.remove(this.ch.root); }
      this.ch = B.avatar.build(this.avatarCfg);
      this.np = nameplate(B.acct.displayName());
      this.ch.root.add(this.np);
      this.world.scene.add(this.ch.root);
    }

    // ---------- Настройки в игре: применяются сразу ----------
    applySettings() {
      const gs = B.gameSettings.all();
      const r = E.renderer;
      const q = B.effectiveQuality();
      const prof = E.qualityProfile(q);
      this.profile = prof;
      // авто-графика тени на ходу не переключает (это пересборка всех шейдеров) - только вручную или при входе
      if (r.shadowMap.enabled !== prof.shadows && (B.gameSettings.get('graphicsMode') === 'manual' || !this.shadowsSet)) {
        this.shadowsSet = true; r.shadowMap.enabled = prof.shadows; this.world.scene.traverse((o) => { if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; }); } }); }
      if (B.gameSettings.get('graphicsMode') === 'manual' || !this.shadowsSet) r.shadowMap.type = prof.softShadows ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
      this.shadowsSet = true;
      const sun = this.lights.sun;
      if (sun.shadow.mapSize.x !== prof.shadowSize) {
        sun.shadow.mapSize.set(prof.shadowSize, prof.shadowSize);
        if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
      }
      if (r.getPixelRatio() !== prof.pixelRatio) { r.setPixelRatio(prof.pixelRatio); r.setSize(innerWidth, innerHeight); }
      this.world.scene.fog.near = prof.drawDistance * 0.35;
      this.world.scene.fog.far = prof.drawDistance;
      this.camera.far = prof.drawDistance + 400; this.camera.updateProjectionMatrix();
      // небо всегда внутри дальней плоскости камеры (иначе на низкой графике вместо неба - чёрный купол)
      this.skyObj.sky.scale.setScalar(this.camera.far * 0.9 / 1000);
      if (this.skyObj.clouds) this.skyObj.clouds.visible = prof.clouds;
      // камера
      if (gs.view === 'first') { this.rig.want = 0.5; }
      else if (this.rig.want < 1) this.rig.want = 16;
      if (!gs.shiftLock) this.shiftLock = false;
      $('g-perf').hidden = !gs.perfStats;
      const chatOff = B.settings.get('chat') === 'off';
      $('g-chat').hidden = chatOff;
      $('g-chat-btn').hidden = chatOff;
      B.sound.applyVolumes();
      this.needsRender = true;
    }

    // ---------- Ввод ----------
    playerInput() {
      const k = this.keys;
      const idle = this.menuOpen || this.chatFocused || this.dead;
      let f = 0, s = 0;
      if (!idle) {
        if (k.KeyW || k.ArrowUp) f += 1;
        if (k.KeyS || k.ArrowDown) f -= 1;
        if (k.KeyD) s += 1;
        if (k.KeyA) s -= 1;
      }
      const fw = this.rig.forward(), rt = this.rig.right();
      let mx = fw.x * f + rt.x * s, mz = fw.z * f + rt.z * s;
      if ((f || s) && this.moveTarget) this.clearMoveTarget();
      if (!f && !s && this.moveTarget && !idle) {
        const dx = this.moveTarget.x - this.player.pos.x, dz = this.moveTarget.z - this.player.pos.z, d = Math.hypot(dx, dz);
        this.moveTarget.t -= STEP;
        if (d < 1.2 || this.moveTarget.t <= 0) this.clearMoveTarget(); else { mx = dx / d; mz = dz / d; }
      }
      const len = Math.hypot(mx, mz);
      if (len > 1) { mx /= len; mz /= len; }
      if (len > 0.01) this.emote = null;
      const lockFace = this.shiftLock || this.rig.first;
      const face = lockFace ? Math.atan2(fw.x, fw.z) : null;
      return { mx, mz, jump: !idle && !!k.Space, face };
    }
    clearMoveTarget() { this.moveTarget = null; if (this.marker) this.marker.visible = false; }

    // ---------- Шаг мира ----------
    fixedStep(dt) {
      if (this.paused) return;
      this.tick++; this.time += dt;
      const w = this.world, P = this.place;
      w.step(dt);
      if (P.step) P.step(this, dt);
      // герой
      if (!this.dead && P.controlsPlayer && P.controlsPlayer(this)) {
        /* героя ведёт само место (ватрушка) */
      } else if (!this.dead) {
        const ev = this.player.step(this.playerInput(), dt);
        for (const c of this.player.touching) if (c.onTouch) c.onTouch(this, c, this.player);
        for (const e of ev) this.onPlayerEvent(e);
      } else {
        this.respawnT -= dt;
        if (this.respawnT <= 0) this.respawn();
      }
      // боты: цель места - путь - шаг тела; после шага - общий присмотр (приземления, застревание, чат)
      for (const b of this.bots) {
        if (b.dead) {
          b.respawnT -= dt;
          if (b.respawnT <= 0) {
            const sp = P.botRespawn ? P.botRespawn(this, b) : P.botSpawn ? P.botSpawn(this, b.i) : this.spawn;
            const f = B.bots.freeSpot(this.world, sp.x, sp.y, sp.z);
            b.body.teleport(f.x, sp.y + 0.01, f.z); b.dead = false; b.ch.setVisible(true); b.np.visible = true;
            B.bots.resetNav(b, sp.idx != null ? sp.idx : 0);
            if (P.onBotRespawn) P.onBotRespawn(this, b);
          }
          continue;
        }
        if (P.controlsBot && P.controlsBot(this, b)) { b.mind.stillT = 0; b.mind.idleT = 0; b.mind.progT = 0; b.mind.anchor.x = b.body.pos.x; b.mind.anchor.z = b.body.pos.z; continue; }
        const input = P.botThink ? P.botThink(this, b, dt) : B.bots.roam(this, b, this.spawn.x, this.spawn.z, 10);
        const ev = b.body.step(input, dt);
        for (const c of b.body.touching) if (c.onTouch && c.botTouch) c.onTouch(this, c, b.body, b);
        if (ev.includes('kill')) { this.killBot(b); continue; }
        B.bots.after(this, b, dt, P.botPath ? P.botPath(this, b) : this.path);
      }
      this.separate();
      if (this.pieces.length) {
        E.stepPieces(w, this.pieces, dt);
        let gone = false;
        for (const pc of this.pieces) if (pc.ttl != null && (pc.ttl -= dt) <= 0) { w.scene.remove(pc.obj); gone = true; }
        if (gone) this.pieces = this.pieces.filter((pc) => pc.ttl == null || pc.ttl > 0);
      }
    }
    // Тела не проходят друг сквозь друга: ближе 1.8 - мягко расталкиваются (через стены не выталкивает)
    separate() {
      const list = this.bots.filter((b) => !b.dead && !(this.place.controlsBot && this.place.controlsBot(this, b))).map((b) => b.body);
      if (!this.dead && !(this.place.controlsPlayer && this.place.controlsPlayer(this))) list.push(this.player);
      const MIN = 1.8;
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const a = list[i].pos, c = list[j].pos;
        if (Math.abs(a.y - c.y) > 4) continue;
        let dx = c.x - a.x, dz = c.z - a.z, d = Math.hypot(dx, dz);
        if (d >= MIN) continue;
        if (d < 1e-3) { const ang = (i * 2.39 + j * 1.7); dx = Math.cos(ang); dz = Math.sin(ang); d = 1; } else { dx /= d; dz /= d; d = Math.hypot(c.x - a.x, c.z - a.z); }
        const push = Math.min(0.12, (MIN - d) * 0.5);
        list[i].sweep('x', -dx * push, false); list[i].sweep('z', -dz * push, false);
        list[j].sweep('x', dx * push, false); list[j].sweep('z', dz * push, false);
      }
    }
    onPlayerEvent(e) {
      if (e === 'jump') B.sound.play('jump');
      else if (e === 'bounce') B.sound.play('boing');
      else if (e === 'speed') B.sound.play('speed');
      else if (e === 'land') B.sound.play('land');
      else if (e === 'kill') this.killPlayer();
    }
    // Бродить в пределах области места (по умолчанию - вокруг точки появления)
    wander(b, dt) {
      const ai = b.ai, p = b.body.pos;
      const area = this.place.botArea ? this.place.botArea(this, b) : { x: this.spawn.x, z: this.spawn.z, r: 10 };
      ai.t -= dt;
      if (ai.t <= 0 || Math.hypot(ai.tx - p.x, ai.tz - p.z) < 1) {
        ai.t = 1.5 + this.rng() * 3;
        const a = this.rng() * Math.PI * 2, r = this.rng() * area.r;
        ai.tx = area.x + Math.cos(a) * r; ai.tz = area.z + Math.sin(a) * r;
        ai.idle = this.rng() < 0.35;
      }
      if (ai.idle) return { mx: 0, mz: 0, jump: false };
      const dx = ai.tx - p.x, dz = ai.tz - p.z, d = Math.hypot(dx, dz) || 1;
      return { mx: dx / d * 0.7, mz: dz / d * 0.7, jump: this.rng() < 0.01 };
    }

    killPlayer() {
      if (this.dead) return;
      this.dead = true; this.respawnT = RESPAWN; this.emote = null; this.clearMoveTarget();
      this.pieces.push(...E.shatter(this.world, this.ch, this.rng));
      this.ch.setVisible(false); this.np.visible = false;
      B.sound.play('ouch');
      B.acct.updatePlace(this.id, (s) => { s.deaths++; });
      if (this.place.onDeath) this.place.onDeath(this);
    }
    killBot(b) {
      if (b.dead) return;
      b.dead = true; b.respawnT = 3; b.deaths = (b.deaths || 0) + 1;
      if (b.mind) B.bots.onFail(b);
      if (b.mind) B.bots.say(this, b, 'fell', this.place.botChatVars ? this.place.botChatVars(this, b) : null);
      const ps = E.shatter(this.world, b.ch, this.rng);
      for (const pc of ps) pc.ttl = 3;                 // обломки бота исчезают сами
      this.pieces.push(...ps);
      b.ch.setVisible(false); b.np.visible = false;
      if (this.place.onBotDeath) this.place.onBotDeath(this, b);
    }
    respawn() {
      for (const pc of this.pieces) this.world.scene.remove(pc.obj);
      this.pieces = this.pieces.filter(() => false);
      const sp = this.place.respawnPoint ? this.place.respawnPoint(this) : this.spawn;
      this.player.teleport(sp.x, sp.y, sp.z, sp.facing != null ? sp.facing : this.player.facing);
      this.rig.yaw = this.player.facing + Math.PI;
      this.dead = false;
      this.ch.setVisible(true); this.np.visible = !this.rig.first;
      if (this.place.onRespawn) this.place.onRespawn(this);
    }

    // ---------- Рисование ----------
    updateCamera(alpha, frameDt) {
      const pp = this.player.lerpPos(alpha);
      const k = this.keys;
      if (!this.menuOpen && !this.chatFocused) {
        if (k.ArrowLeft) this.rig.yaw += 2.4 * frameDt;
        if (k.ArrowRight) this.rig.yaw -= 2.4 * frameDt;
      }
      // «Следование»: камера сама заходит за спину, пока герой бежит
      if (B.gameSettings.get('cameraMode') === 'follow' && !this.rotating && !this.shiftLock && !this.rig.first) {
        const sp = Math.hypot(this.player.vel.x, this.player.vel.z);
        if (sp > 2) {
          let d = (this.player.facing + Math.PI) - this.rig.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
          this.rig.yaw += d * Math.min(1, frameDt * 2.2);
        }
      }
      this.rig.shoulder = this.shiftLock && !this.rig.first ? 1.75 : 0;
      this.rig.update({ x: pp.x, y: pp.y + 4.5, z: pp.z }, this.world, frameDt || 0.016);
      return pp;
    }
    render(alpha, frameDt) {
      const w = this.world;
      w.sync(alpha);
      const pp = this.updateCamera(alpha, frameDt);
      const pl = this.player;
      this.ch.root.position.set(pp.x, pp.y, pp.z);
      this.ch.root.rotation.y = pl.lerpFacing(alpha);
      const hs = Math.hypot(pl.vel.x, pl.vel.z) / PH.WALK;
      this.ch.pose({ dt: frameDt, speed: hs, air: !pl.onGround && pl.airTime > 0.06, emote: this.emote });
      const first = this.rig.first;
      // камера упёрлась почти в героя (стена за спиной) - свой персонаж прячется, чтобы не закрывать экран
      const close = Math.hypot(this.camera.position.x - pp.x, this.camera.position.y - pp.y - 4.5, this.camera.position.z - pp.z) < 2.4;
      if (!this.dead) { this.ch.setVisible(!first && !close); this.np.visible = false; }   // своё имя над собой не видно (как в похожих играх)
      // имена над головой: вблизи камеры гаснут, вдали - не мельчают
      const cam = this.camera.position;
      const plate = (np, x, y, z, show) => {
        const d = Math.hypot(x - cam.x, y + 6.4 - cam.y, z - cam.z);
        const k = B.clamp(d / 20, 0.75, 2.4);
        np.scale.set(4.4 * k, 4.4 * k * 96 / 512, 1);
        np.material.opacity = B.clamp((d - 4) / 5, 0, 1);
        np.visible = show && d > 4;
      };
      if (!this.dead) plate(this.np, pp.x, pp.y, pp.z, false);
      for (const b of this.bots) {
        const bp = b.body.lerpPos(alpha);
        if (!b.dead) plate(b.np, bp.x, bp.y, bp.z, true);
        b.ch.root.position.set(bp.x, bp.y, bp.z);
        b.ch.root.rotation.y = b.body.lerpFacing(alpha);
        b.ch.pose({ dt: frameDt, speed: Math.hypot(b.body.vel.x, b.body.vel.z) / PH.WALK, air: !b.body.onGround && b.body.airTime > 0.06, emote: b.emote });
      }
      // тень следует за героем (с шагом в тексель, чтобы не рябила)
      const sun = this.lights.sun, snap = 2;
      const cx = Math.round(pp.x / snap) * snap, cz = Math.round(pp.z / snap) * snap, cy = Math.round(pp.y / snap) * snap;
      sun.target.position.set(cx, cy, cz);
      sun.position.set(cx, cy, cz).addScaledVector(this.lights.dir, 150);
      if (this.skyObj.sky) this.skyObj.sky.position.copy(this.camera.position);
      if (this.place.render) this.place.render(this, alpha, frameDt);
      E.renderer.render(w.scene, this.camera);
    }

    // ---------- Интерфейс в месте ----------
    say(name, text, color, sys) {
      this.chatLog.push({ name, text, color: color || '#ffffff', sys: !!sys, t: performance.now() });
      if (this.chatLog.length > 60) this.chatLog.shift();
      if (!sys && name !== B.acct.displayName() && B.settings.get('notifyChat')) B.sound.play('chat');
      this.drawChat();
    }
    drawChat() {
      const log = $('g-chat-log');
      log.innerHTML = this.chatLog.slice(-40).map((m) => m.sys
        ? `<div class="msg sys">${B.esc(m.text)}</div>`
        : `<div class="msg"><b style="color:${chatColor(m.color)}">${B.esc(m.name)}:</b> ${B.esc(m.text)}</div>`).join('');
      log.scrollTop = log.scrollHeight;
      $('g-chat').classList.add('active');
      clearTimeout(this.chatFadeT);
      this.chatFadeT = setTimeout(() => { if (!this.chatFocused) $('g-chat').classList.remove('active'); }, 9000);
    }
    sendChat(text) {
      text = text.trim();
      if (!text) return;
      if (text[0] === '/') {
        const cmd = text.toLowerCase();
        if (cmd === '/reset' || cmd === '/re') { this.say('', B.lang() === 'en' ? 'Character reset.' : 'Персонаж сброшен.', null, true); this.killPlayer(); }
        else if (cmd === '/e dance' || cmd === '/dance') this.emote = 'dance';
        else if (cmd === '/e wave' || cmd === '/wave') this.emote = 'wave';
        else if (cmd === '/clear') { this.chatLog = []; this.drawChat(); }
        else this.say('', B.lang() === 'en' ? 'Commands: /reset, /e dance, /e wave, /clear' : 'Команды: /reset, /e dance, /e wave, /clear', null, true);
        return;
      }
      this.say(B.acct.displayName(), text.slice(0, 120), '#79c7ff');
      if (/привет|hello|hi\b/i.test(text) && this.bots.length) {
        const b = this.rng.pick(this.bots);
        setTimeout(() => { if (G.cur === this) this.say(b.name, B.lang() === 'en' ? 'hi!' : 'привет!', b.cfg.colors.torso); }, 900);
      }
    }
    drawBoard() {
      const P = this.place;
      const rows = [{ name: B.acct.displayName(), v: P.stat ? P.stat(this, null) : 0, me: true }]
        .concat(this.bots.map((b) => ({ name: b.name, v: P.stat ? P.stat(this, b) : 0 })));
      const asc = P.statAsc;
      rows.sort((a, b) => {
        const va = a.v == null ? (asc ? Infinity : -Infinity) : a.v, vb = b.v == null ? (asc ? Infinity : -Infinity) : b.v;
        return asc ? va - vb : vb - va;
      });
      const fmt = P.statFmt || ((v) => (v == null ? '-' : String(v)));
      const label = typeof P.statLabel === 'function' ? P.statLabel() : (P.statLabel || '');
      const html = `<div class="board-head"><span>${B.t('players')}</span><span>${B.esc(label)}</span></div>` +
        rows.map((r) => `<div class="board-row${r.me ? ' me' : ''}"><span class="bn">${B.esc(r.name)}</span><span class="bv">${B.esc(fmt(r.v))}</span></div>`).join('');
      if (html !== this.boardCache) { $('g-board').innerHTML = html; this.boardCache = html; }
    }
    drawHud() {
      const h = this.place.hud ? this.place.hud(this) : '';
      if (h !== this.hudCache) { $('g-hud').innerHTML = h; $('g-hud').hidden = !h; this.hudCache = h; }
    }
    centerMsg(text, ms) {
      const el = $('g-center');
      el.textContent = text; el.hidden = !text;
      clearTimeout(this.centerT);
      if (text && ms) this.centerT = setTimeout(() => { el.hidden = true; }, ms);
    }
    // Итоги: { title, sub, medal, reward, record, rows: [[k, v]] }
    showResult(r) {
      this.result = r;
      this.centerMsg('');
      const el = $('g-result');
      el.innerHTML = `<div class="res-card">
        <div class="res-medal">${r.medal ? B.ui.medal(r.medal, 72) : B.ui.icon('trophy', 64)}</div>
        <h2>${B.esc(r.title)}</h2>
        ${r.sub ? `<p class="res-sub">${B.esc(r.sub)}</p>` : ''}
        <div class="res-rows">${(r.rows || []).map(([k, v]) => `<div><span>${B.esc(k)}</span><b>${B.esc(v)}</b></div>`).join('')}</div>
        ${r.reward ? `<div class="res-reward">+${r.reward} ${B.ui.cube(18)}</div>` : ''}
        ${r.record ? `<div class="res-record">${B.lang() === 'en' ? 'New record!' : 'Новый рекорд!'}</div>` : ''}
        <div class="res-btns"><button type="button" class="btn" id="res-again">${B.t('again')}</button><button type="button" class="btn ghost" id="res-leave">${B.t('to_launcher')}</button><button type="button" class="btn ghost" id="res-close">${B.lang() === 'en' ? 'Keep playing' : 'Остаться'}</button></div>
      </div>`;
      el.hidden = false;
      $('res-again').onclick = () => { el.hidden = true; this.result = null; if (this.place.restart) this.place.restart(this); else this.respawn(); };
      $('res-leave').onclick = () => G.leave();
      $('res-close').onclick = () => { el.hidden = true; this.result = null; };
    }
    hideResult() { $('g-result').hidden = true; this.result = null; }

    openMenu(tab) {
      this.menuOpen = true; this.paused = true;
      for (const k in this.keys) this.keys[k] = false;
      this.rotating = false;
      if (document.pointerLockElement) document.exitPointerLock();
      $('g-menu-panel').hidden = false;
      this.menuTab(tab || 'main');
      B.emit('menu', true);
    }
    closeMenu() {
      this.menuOpen = false; this.paused = false;
      G.resetLeave();
      $('g-menu-panel').hidden = true;
      B.sound.resume();
      B.emit('menu', false);
    }
    menuTab(tab) {
      this.menuTabName = tab;
      document.querySelectorAll('#g-menu-panel .mtab').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
      document.querySelectorAll('#g-menu-panel .mview').forEach((v) => { v.hidden = v.dataset.view !== tab; });
      if (tab === 'settings') {
        // настройки этого места (если есть) - над общими
        const ps = $('g-place-set'), P = this.place;
        ps.innerHTML = '';
        if (P.settingsSchema) {
          ps.append(B.ui.el('div', { class: 'place-set-h' }, B.esc((B.lang() === 'en' ? 'This place: ' : 'Это место: ') + B.tn(this.meta))));
          const box = B.ui.el('div');
          ps.append(box);
          B.ui.settingsList(box, P.settingsSchema, P.settingsGroup, (k) => { if (P.onSettings) P.onSettings(this, k); });
        }
        B.ui.settingsList($('g-settings-list'), B.ui.GAME_SCHEMA, B.gameSettings, () => this.applySettings());
      }
    }

    dispose() {
      B.sound.stopMusic();
      for (const pc of this.pieces) this.world.scene.remove(pc.obj);
      if (this.ch) this.ch.dispose();
      for (const b of this.bots) b.ch.dispose();
      for (const pc of this.pieces) this.world.scene.add(pc.obj);        // обломки - тоже освободить
      this.world.dispose();
      const sm = this.lights && this.lights.sun.shadow.map;
      if (sm) { sm.dispose(); this.lights.sun.shadow.map = null; }
      if (this.place.dispose) this.place.dispose(this);
    }
  }
  G.Game = Game;

  // ---------- Вход в место ----------
  G.enter = function (id, opt = {}) {
    if (G.cur || G.loading) return null;
    const meta = B.data.place(id);
    if (!meta || !B.places[id]) return null;
    B.sound.resume();
    const game = new Game(id);
    const load = { game, cancelled: false, progress: 0 };
    G.loading = load;
    const scr = $('loading');
    $('ld-name').textContent = B.tn(meta);
    $('ld-author').textContent = B.t('by') + ' ' + B.t('brand');
    $('ld-bar').style.width = '0%';
    const thumb = B.launcher && B.launcher.thumb(id);
    $('ld-bg').style.backgroundImage = thumb ? `url(${thumb})` : '';
    $('ld-thumb').style.backgroundImage = thumb ? `url(${thumb})` : '';
    $('ld-thumb').style.backgroundColor = meta.color;
    const tips = B.lang() === 'en' ? B.data.TIPS_EN : B.data.TIPS;
    let tipI = game.rng.int(tips.length);
    $('ld-tip').textContent = tips[tipI];
    const tipTimer = setInterval(() => { tipI = (tipI + 1) % tips.length; $('ld-tip').textContent = tips[tipI]; }, 2200);
    scr.hidden = false;
    document.body.classList.add('in-loading');
    B.emit('screen', 'loading');
    const minTime = opt.instant ? 0 : (B.params.fast ? 250 : 1600);
    const t0 = performance.now();
    const steps = game.buildSteps();
    $('ld-error').hidden = true;
    const finish = () => {
      clearInterval(tipTimer);
      G.loading = null;
      scr.hidden = true;
      document.body.classList.remove('in-loading');
      if (load.cancelled) { game.dispose(); B.emit('screen', 'launcher'); return; }
      G.start(game);
    };
    // сборка места упала: не виснуть - сообщение, «Отмена» возвращает в лаунчер, другие места открываются
    const fail = (e) => {
      clearInterval(tipTimer);
      G.loading = null;
      console.warn('место не собралось', id, e);
      try { game.dispose(); } catch (e2) { /* собралось не до конца */ }
      $('ld-error').textContent = (B.lang() === 'en' ? 'Could not load the place. ' : 'Место не загрузилось. ') + String((e && e.message) || e);
      $('ld-error').hidden = false;
      $('ld-cancel').onclick = () => { scr.hidden = true; $('ld-error').hidden = true; document.body.classList.remove('in-loading'); B.emit('screen', 'launcher'); };
    };
    if (opt.instant) {
      try { for (const p of steps) load.progress = p; } catch (e) { fail(e); scr.hidden = true; document.body.classList.remove('in-loading'); return null; }
      finish();
      return game;
    }
    const tick = () => {
      if (load.cancelled) { finish(); return; }
      let r;
      try { r = steps.next(); } catch (e) { fail(e); return; }
      if (!r.done) load.progress = r.value;
      const shown = Math.min(load.progress, (performance.now() - t0) / minTime);
      $('ld-bar').style.width = Math.round(shown * 100) + '%';
      $('ld-pct').textContent = Math.round(shown * 100) + '%';
      if (r.done && performance.now() - t0 >= minTime) { $('ld-bar').style.width = '100%'; setTimeout(finish, 120); return; }
      setTimeout(tick, r.done ? 60 : 16);
    };
    setTimeout(tick, 30);
    $('ld-cancel').onclick = () => { load.cancelled = true; };
    return game;
  };

  G.start = function (game) {
    G.cur = game;
    const pauseNow = G.pausePending || document.hidden;
    G.pausePending = false;
    $('game').hidden = false;
    document.body.classList.add('in-game');
    B.acct.updatePlace(game.id, (s) => { s.visits++; s.last = Date.now(); });
    B.acct.award('first_steps');
    game.chatLog = [];
    game.say('', (B.lang() === 'en' ? 'Welcome to ' : 'Добро пожаловать в «') + B.tn(game.meta) + (B.lang() === 'en' ? '! Type /help for commands.' : '»! Команды - /help.'), null, true);
    $('g-place-name').textContent = B.tn(game.meta);
    $('g-board').hidden = false;
    $('g-result').hidden = true;
    $('g-menu-panel').hidden = true;
    $('g-hotbar').hidden = true;
    game.centerMsg('');
    if (game.place.start) game.place.start(game);
    game.drawBoard(); game.drawHud();
    B.sound.startMusic(game.id);
    B.emit('screen', 'place');
    G.acc = 0; G.last = performance.now();
    if (pauseNow) { game.openMenu(); B.sound.suspend(); }       // пауза пришла во время загрузки
  };

  G.leave = function () {
    const g = G.cur;
    if (!g) return;
    if (document.pointerLockElement) document.exitPointerLock();
    g.dispose();
    G.cur = null;
    $('game').hidden = true;
    document.body.classList.remove('in-game');
    B.emit('screen', 'launcher');
    B.emit('left', g.id);
  };

  // ---------- Главный цикл ----------
  G.acc = 0; G.last = performance.now();
  G.frameTimes = [];
  G.loop = function (now) {
    const dtMs = now - G.last; G.last = now;
    const g = G.cur;
    if (g) {
      G.frameTimes.push(dtMs); if (G.frameTimes.length > 600) G.frameTimes.shift();
      const frameDt = Math.min(0.1, dtMs / 1000);
      if (!B.params.manual) {
        G.acc += Math.min(0.25, dtMs / 1000);
        let n = 0;
        while (G.acc >= STEP && n < 8) { g.fixedStep(STEP); G.acc -= STEP; n++; }
        if (n === 8) G.acc = 0;
      }
      // на паузе (меню) кадр не перерисовывается: холст держит последний; после смены настроек - один раз
      if (!g.paused || g.needsRender) { g.render(B.params.manual ? 1 : G.acc / STEP, g.paused ? 0 : frameDt); g.needsRender = false; }
      g.boardT -= frameDt;
      if (g.boardT <= 0) { g.boardT = 0.25; g.drawBoard(); updatePerf(g); autoQuality(g); }
      g.drawHud();
    }
    requestAnimationFrame(G.loop);
  };
  function updatePerf() {
    const el = $('g-perf');
    if (el.hidden) return;
    const ft = G.frameTimes.slice(-60);
    if (!ft.length) return;
    const avg = ft.reduce((a, b) => a + b, 0) / ft.length;
    el.textContent = `${Math.round(1000 / avg)} fps · ${avg.toFixed(1)} ms · q${B.effectiveQuality()}`;
  }
  // Автоматическая графика: медленно - проще, быстро - красивее
  let aqT = 0, aqSlow = 0, aqFast = 0;
  function autoQuality(g) {
    if (B.gameSettings.get('graphicsMode') !== 'auto' || B.params.manual) return;
    aqT += 0.25;
    if (aqT < 3) return;
    aqT = 0;
    const ft = G.frameTimes.slice(-120).sort((a, b) => a - b);
    if (ft.length < 100) return;
    const med = ft[Math.floor(ft.length / 2)];
    const before = B.autoQuality;
    // гистерезис: вниз - после трёх медленных замеров подряд (9 с), вверх - после пяти быстрых (15 с)
    aqSlow = med > 22 ? aqSlow + 1 : 0;
    aqFast = med < 13 ? aqFast + 1 : 0;
    if (aqSlow >= 3 && B.autoQuality > 3) { B.autoQuality--; aqSlow = 0; }
    else if (aqFast >= 5 && B.autoQuality < 8) { B.autoQuality++; aqFast = 0; }
    if (before !== B.autoQuality) g.applySettings();
  }

  // ---------- Управление в месте ----------
  function bindInput() {
    const canvas = E.renderer.domElement;
    const chatIn = $('g-chat-in');
    const sens = () => 0.0045 * (G.cur && G.cur.rig.first ? B.gameSettings.get('sensFirst') : B.gameSettings.get('sens'));
    const inv = () => (B.gameSettings.get('invert') ? -1 : 1);

    addEventListener('keydown', (e) => {
      const g = G.cur;
      if (!g) return;
      if (e.target === chatIn) {
        if (e.code === 'Enter' || e.code === 'NumpadEnter') { g.sendChat(chatIn.value); chatIn.value = ''; chatIn.blur(); e.preventDefault(); }
        else if (e.code === 'Escape') { chatIn.blur(); e.preventDefault(); }
        return;
      }
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (e.code === 'Escape') { e.preventDefault(); if (g.menuOpen) g.closeMenu(); else g.openMenu(); return; }
      if (g.menuOpen) {
        if (e.code === 'KeyR') { g.closeMenu(); g.killPlayer(); }
        else if (e.code === 'KeyL') G.askLeave();
        return;
      }
      if (e.code === 'Tab') { e.preventDefault(); $('g-board').hidden = !$('g-board').hidden; return; }
      if ((e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Slash') && B.settings.get('chat') !== 'off') { e.preventDefault(); chatIn.focus(); return; }
      if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !e.repeat) {
        if (B.gameSettings.get('shiftLock') && !g.rig.first) {
          g.shiftLock = !g.shiftLock;
          if (!g.shiftLock && document.pointerLockElement) document.exitPointerLock();
          else if (g.shiftLock && canvas.requestPointerLock) { try { const pr = canvas.requestPointerLock(); if (pr && pr.catch) pr.catch(() => {}); } catch (err) { /* нет */ } }
          $('g-shiftlock').hidden = !g.shiftLock;
        }
        return;
      }
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (g.place.onKey && g.place.onKey(g, e)) return;
      g.keys[e.code] = true;
    });
    addEventListener('keyup', (e) => { if (G.cur) G.cur.keys[e.code] = false; });
    chatIn.addEventListener('focus', () => { if (G.cur) { G.cur.chatFocused = true; for (const k in G.cur.keys) G.cur.keys[k] = false; $('g-chat').classList.add('active'); } });
    chatIn.addEventListener('blur', () => { if (G.cur) G.cur.chatFocused = false; });
    addEventListener('blur', () => { if (G.cur) { for (const k in G.cur.keys) G.cur.keys[k] = false; G.cur.rotating = false; } });

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('mousedown', (e) => {
      const g = G.cur;
      if (!g || g.menuOpen) return;
      if (document.activeElement === chatIn) chatIn.blur();
      if (e.button === 2) { g.rotating = true; g.dragMoved = 0; return; }
      if (e.button !== 0) return;
      if ((g.rig.first || g.shiftLock) && !document.pointerLockElement && canvas.requestPointerLock) {
        try { const pr = canvas.requestPointerLock(); if (pr && pr.catch) pr.catch(() => {}); } catch (err) { /* нет */ }
      }
      g.lmbDown = { x: e.clientX, y: e.clientY };
    });
    addEventListener('mouseup', (e) => {
      const g = G.cur;
      if (!g) return;
      if (e.button === 2) g.rotating = false;
      if (e.button === 0 && g.lmbDown && !g.menuOpen) {
        const moved = Math.hypot(e.clientX - g.lmbDown.x, e.clientY - g.lmbDown.y);
        g.lmbDown = null;
        if (moved < 6 && e.target === canvas) G.click(g, e.clientX, e.clientY);
      }
    });
    addEventListener('mousemove', (e) => {
      const g = G.cur;
      if (!g || g.menuOpen) return;
      if (document.pointerLockElement === canvas || g.rotating) {
        g.rig.rotate(e.movementX * sens(), e.movementY * sens() * inv());
      }
      if (g.place.onMouseMove) g.place.onMouseMove(g, e.clientX, e.clientY);
    });
    canvas.addEventListener('wheel', (e) => {
      const g = G.cur;
      if (!g || g.menuOpen) return;
      e.preventDefault();
      if (B.gameSettings.get('view') === 'first') return;
      const steps = B.clamp((e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY) / 100, -6, 6);   // щелчок колеса = 1 ступень
      g.rig.zoom(Math.pow(1.15, steps));
    }, { passive: false });
    addEventListener('resize', () => {
      E.renderer.setSize(innerWidth, innerHeight);
      if (G.cur) { G.cur.camera.aspect = innerWidth / innerHeight; G.cur.camera.updateProjectionMatrix(); }
    });
    // Вкладку спрятали - пауза: меню открыто, звук молчит, ввод сброшен, мышь отпущена. Вернулись - пауза остаётся.
    const pauseAll = () => {
      const g = G.cur;
      if (g) { for (const k in g.keys) g.keys[k] = false; g.rotating = false; g.lmbDown = null; if (!g.menuOpen) g.openMenu(); }
      else if (G.loading) G.pausePending = true;              // место ещё грузится - открыть его на паузе
      if (document.pointerLockElement) document.exitPointerLock();
      B.sound.suspend();
    };
    document.addEventListener('visibilitychange', () => { if (document.hidden) pauseAll(); else if (!G.cur) B.sound.resume(); });   // в лаунчере звук возвращается сам
    // прицел в центре, пока мышь захвачена
    document.addEventListener('pointerlockchange', () => {
      const on = !!document.pointerLockElement && !!G.cur;
      $('g-cross').hidden = !on;
      if (on && G.cur.place.onPointerLock) G.cur.place.onPointerLock(G.cur);
    });
    // Оболочка ОС (игра в iframe): {mix:'pause'} - как скрытая вкладка; {mix:'resume'} - пауза остаётся, её снимает игрок
    addEventListener('message', (e) => {
      const d = e.data;
      if (!d || typeof d !== 'object') return;
      if (d.mix === 'pause') pauseAll();
      else if (d.mix === 'resume' && !G.cur) B.sound.resume();
    });

    $('g-menu').addEventListener('click', () => { const g = G.cur; if (!g) return; if (g.menuOpen) g.closeMenu(); else g.openMenu(); });
    $('g-chat-btn').addEventListener('click', () => { $('g-chat').classList.toggle('collapsed'); });
    $('m-resume').addEventListener('click', () => G.cur && G.cur.closeMenu());
    $('m-reset').addEventListener('click', () => { const g = G.cur; if (!g) return; g.closeMenu(); g.killPlayer(); });
    $('m-settings').addEventListener('click', () => G.cur && G.cur.menuTab('settings'));
    $('m-leave').addEventListener('click', () => G.askLeave());
    $('m-close').addEventListener('click', () => G.cur && G.cur.closeMenu());
    document.querySelectorAll('#g-menu-panel .mtab').forEach((b) => b.addEventListener('click', () => G.cur && G.cur.menuTab(b.dataset.tab)));
    $('m-defaults').addEventListener('click', () => { B.gameSettings.reset(); if (G.cur) { G.cur.applySettings(); G.cur.menuTab('settings'); } });
    $('m-reset2').addEventListener('click', () => { const g = G.cur; if (!g) return; g.closeMenu(); g.killPlayer(); });
    $('m-fullscreen').addEventListener('click', () => G.toggleFullscreen());
    document.addEventListener('fullscreenchange', () => { $('m-fullscreen').classList.toggle('on', !!document.fullscreenElement); });
    B.on('gamesettings', () => { if (G.cur) G.cur.applySettings(); });
    B.on('settings', () => { if (G.cur) G.cur.applySettings(); });
  }
  G.bindInput = bindInput;

  // Выход - с подтверждением: первый раз кнопка спрашивает «Точно выйти?», второй - выходит
  G.askLeave = function () {
    const b = $('m-leave');
    if (b.classList.contains('confirm')) { G.leave(); return; }
    b.classList.add('confirm');
    b.querySelector('b').textContent = B.lang() === 'en' ? 'Leave for sure? (L again)' : 'Точно выйти? (ещё раз L)';
    clearTimeout(G.leaveT);
    G.leaveT = setTimeout(G.resetLeave, 4000);
  };
  G.resetLeave = function () { const b = $('m-leave'); b.classList.remove('confirm'); b.querySelector('b').textContent = B.t('leave'); };

  G.toggleFullscreen = function () {
    try {
      if (document.fullscreenElement) { const p = document.exitFullscreen(); if (p && p.catch) p.catch(() => {}); }
      else if (document.documentElement.requestFullscreen) { const p = document.documentElement.requestFullscreen(); if (p && p.catch) p.catch(() => {}); }
    } catch (e) { /* не поддерживается */ }
  };

  // Луч из камеры через точку экрана
  G.screenRay = function (g, cx, cy) {
    const v = new THREE.Vector3((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1, 0.5).unproject(g.camera);
    const o = g.camera.position;
    const d = v.sub(o).normalize();
    return { o: { x: o.x, y: o.y, z: o.z }, d: { x: d.x, y: d.y, z: d.z } };
  };
  // При захвате мыши (Shift-лок, от первого лица) курсора нет - целимся в центр экрана, где прицел
  G.aim = (cx, cy) => (document.pointerLockElement ? { x: innerWidth / 2, y: innerHeight / 2 } : { x: cx, y: cy });
  G.click = function (g, cx, cy) {
    ({ x: cx, y: cy } = G.aim(cx, cy));
    if (g.place.onClick && g.place.onClick(g, cx, cy)) return;
    if (B.gameSettings.get('movementMode') !== 'click' || g.dead) return;
    const r = G.screenRay(g, cx, cy);
    const hit = g.world.rayCast(r.o, r.d, 400);
    if (!hit || hit.normal[1] !== 1) return;
    const x = r.o.x + r.d.x * hit.t, z = r.o.z + r.d.z * hit.t, y = hit.part.maxY;
    g.moveTarget = { x, z, y, t: 6 };
    if (!g.marker) {
      g.marker = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.12, 6, 24), new THREE.MeshBasicMaterial({ color: 0x3fd0c4 }));
      g.marker.rotation.x = Math.PI / 2;
      g.world.scene.add(g.marker);
    }
    g.marker.position.set(x, y + 0.15, z); g.marker.visible = true;
  };
})(window.Blox);
