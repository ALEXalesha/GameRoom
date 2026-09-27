// Лаунчер Блоксити: верхняя полоса (аватар, ник, кубы), разделы слева, карточки мест с картинками,
// снятыми из самих мест (с твоим аватаром), страница места, редактор аватара, каталог, профиль, настройки.
'use strict';
(function (B) {
  const E = B.engine, U = B.ui;
  const $ = (id) => document.getElementById(id);
  const L = B.launcher = { section: 'home', placeId: null, thumbs: {}, shots: {}, icons: {} };

  // ---------- Картинки: отдельный рисовальщик вне экрана ----------
  let thumbR = null;
  function tr() {
    if (thumbR) return thumbR;
    thumbR = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
    thumbR.shadowMap.enabled = true; thumbR.shadowMap.type = THREE.PCFSoftShadowMap;
    thumbR.setPixelRatio(1);
    return thumbR;
  }
  function snap(scene, cam, w, h, type) {
    const r = tr();
    r.setSize(w, h, false);
    cam.aspect = w / h; cam.updateProjectionMatrix();
    r.render(scene, cam);
    return r.domElement.toDataURL(type || 'image/jpeg', 0.86);
  }

  // Построить место без игры - только для кадров
  function stagePlace(id) {
    const place = B.places[id], meta = B.data.place(id);
    const seed = (B.params.seed ^ B.hash(id)) >>> 0;
    const fake = { id, meta, place, seed, rng: B.rng(seed), world: new E.World(seed), state: {}, bots: [], path: [], spawn: { x: 0, y: 0, z: 0, facing: 0 }, time: 0, centerMsg() {} };
    const w = fake.world;
    const sky = E.makeSky(w.scene, Object.assign({ seed }, place.sky || {}));
    const lights = E.makeLights(w.scene, sky.sunDir);
    w.scene.fog = new THREE.Fog(sky.hor, 250, 900);
    lights.sun.shadow.mapSize.set(2048, 2048);
    const sc = lights.sun.shadow.camera; sc.left = sc.bottom = -160; sc.right = sc.top = 160; sc.updateProjectionMatrix();
    place.build(fake);
    w.finalize();
    if (id !== 'tube') { try { place.setup(fake); } catch (e) { /* кадр обойдётся без этого */ } }
    if (id === 'lava') fake.state.lavaY = place.thumbLavaY || 6;
    w.step(0.5);
    w.sync(1);
    if (place.render) { try { place.render(fake, 1, 0.016); } catch (e) { /* ничего */ } }
    const ta = place.thumbAvatar;
    if (ta) {
      const ch = B.avatar.build(B.acct.avatar());
      ch.root.position.set(ta.x, ta.y, ta.z); ch.root.rotation.y = ta.facing;
      ch.pose({ dt: 0.016, speed: 0 });
      ch.pivots.armR.rotation.x = Math.PI * 0.8; ch.pivots.armR.rotation.z = 0.2;
      w.scene.add(ch.root);
    }
    return { fake, w, lights };
  }
  function shotsOf(id, which) {
    const place = B.places[id];
    const { w, lights } = stagePlace(id);
    const cam = new THREE.PerspectiveCamera(55, 16 / 9, 0.5, 2000);
    const out = [];
    for (const s of which) {
      cam.position.set(...s.cam); cam.lookAt(...s.look);
      const look = new THREE.Vector3(...s.look);
      lights.sun.target.position.copy(look); lights.sun.position.copy(look).addScaledVector(lights.dir, 200);
      out.push(snap(w.scene, cam, s.w || 640, s.h || 360));
    }
    w.dispose();
    return out;
  }
  // Карточка места: первый кадр с аватаром
  L.thumb = (id) => L.thumbs[id] || null;
  function makeThumb(id) {
    const place = B.places[id];
    const s = Object.assign({}, place.thumb || place.shots[0]);
    s.w = 480; s.h = 270;
    L.thumbs[id] = shotsOf(id, [s])[0];
    return L.thumbs[id];
  }
  let thumbQueue = [];
  function queueThumbs(force) {
    if (force) { L.thumbs = {}; L.shots = {}; }
    thumbQueue = B.data.PLACES.map((p) => p.id).filter((id) => !L.thumbs[id]);
    pumpThumbs();
  }
  let pumping = false;                   // один насос на очередь: иначе два таймера делят одну картинку
  function pumpThumbs() {
    if (pumping || !thumbQueue.length) return;
    pumping = true;
    setTimeout(() => {
      pumping = false;
      if (!thumbQueue.length) return;
      if (B.game.cur || B.game.loading) { setTimeout(pumpThumbs, 500); return; }
      const id = thumbQueue.shift();
      try { makeThumb(id); } catch (e) { console.warn('кадр', id, e); }
      document.querySelectorAll(`[data-thumb="${id}"]`).forEach((el) => { el.style.backgroundImage = `url(${L.thumbs[id]})`; el.classList.add('ready'); });
      pumpThumbs();
    }, 60);
  }

  // Портрет и полный рост аватара
  function avatarScene(cfg) {
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 0.75));
    const d = new THREE.DirectionalLight(0xffffff, 0.7); d.position.set(4, 8, 10); scene.add(d);
    const ch = B.avatar.build(cfg);
    ch.pose({ dt: 0.016, speed: 0 });
    scene.add(ch.root);
    return { scene, ch };
  }
  L.headshot = function (cfg) {
    const { scene, ch } = avatarScene(cfg || B.acct.avatar());
    ch.root.rotation.y = -0.35;
    const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    cam.position.set(0, 5.2, 6.2); cam.lookAt(0, 4.75, 0);
    return snap(scene, cam, 160, 160, 'image/png');
  };
  L.fullbody = function (cfg) {
    const { scene, ch } = avatarScene(cfg || B.acct.avatar());
    ch.root.rotation.y = -0.45;
    ch.pivots.armR.rotation.x = -0.3; ch.pivots.armL.rotation.x = 0.2;
    const cam = new THREE.PerspectiveCamera(30, 0.8, 0.1, 100);
    cam.position.set(0, 3.6, 14.5); cam.lookAt(0, 2.9, 0);
    return snap(scene, cam, 320, 400, 'image/png');
  };
  // Картинка вещи для каталога
  function itemIcon(id) {
    if (L.icons[id]) return L.icons[id];
    const it = B.data.item(id);
    if (it.type === 'face') return (L.icons[id] = B.tex.faceIcon(id));
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 0.8));
    const d = new THREE.DirectionalLight(0xffffff, 0.6); d.position.set(4, 8, 10); scene.add(d);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    if (it.type === 'accessory') {
      const g = B.avatar.buildItem(id);
      // голова-манекен для масштаба
      if (it.slot !== 'back') {
        const head = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 1.2, 24), new THREE.MeshLambertMaterial({ color: 0xd9dde3 }));
        head.position.y = 0.6; g.add(head);
      } else g.rotation.y = Math.PI * 0.85;
      scene.add(g);
      const box = new THREE.Box3().setFromObject(g), c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
      const r = Math.max(sz.x, sz.y, sz.z);
      cam.position.set(c.x + r * 1.1, c.y + r * 0.8, c.z + r * 2.6); cam.lookAt(c);
    } else {
      const cfg = B.data.defaultAvatar();
      cfg.hair = ''; cfg.face = 'face_smile';
      cfg.colors = { head: '#d9dde3', torso: '#d9dde3', armL: '#d9dde3', armR: '#d9dde3', legL: '#d9dde3', legR: '#d9dde3' };
      cfg.shirt = it.type === 'shirt' ? id : 'shirt_none'; cfg.pants = it.type === 'pants' ? id : 'pants_none';
      const { ch } = (() => { const ch = B.avatar.build(cfg); ch.pose({ dt: 0.016, speed: 0 }); scene.add(ch.root); return { ch }; })();
      ch.root.rotation.y = -0.3;
      if (it.type === 'shirt') { cam.position.set(0, 3.2, 9); cam.lookAt(0, 3, 0); } else { cam.position.set(0, 1.8, 9); cam.lookAt(0, 1.6, 0); }
    }
    return (L.icons[id] = snap(scene, cam, 160, 160, 'image/png'));
  }
  L.itemIcon = itemIcon;

  // ---------- Верхняя полоса ----------
  function drawTop() {
    $('bal').textContent = B.fmtNum(B.acct.balance());
    $('me-nick').textContent = B.acct.displayName();
    $('me-img').src = L.head || '';
  }
  function refreshAvatarImages() {
    try { L.head = L.headshot(); } catch (e) { L.head = ''; }
    L.full = null;
    drawTop();
  }

  // ---------- Карточки мест ----------
  function likeText(id) {
    const v = B.acct.votes()[id] || 0;
    return v === 1 ? '100%' : v === -1 ? '0%' : '—';
  }
  function card(p) {
    const st = B.acct.placeStats(p.id);
    const done = B.acct.completed(p.id);
    return `<div class="card" data-place="${p.id}" tabindex="0" role="button" aria-label="${B.esc(B.tn(p))}">
      <div class="thumb${L.thumbs[p.id] ? ' ready' : ''}" data-thumb="${p.id}" style="${L.thumbs[p.id] ? `background-image:url(${L.thumbs[p.id]})` : `background-color:${p.color}`}">
        ${done ? `<span class="done-tag">✓ ${B.t('completed')}</span>` : ''}
        <span class="play-hover">${U.icon('play', 34)}</span>
      </div>
      <div class="card-title">${B.esc(B.tn(p))}</div>
      <div class="card-meta"><span title="${B.t('likes')}">${U.icon('thumb', 13)} ${likeText(p.id)}</span><span title="${B.t('visits')}">${U.icon('people', 14)} ${B.fmtNum(st.visits)}</span></div>
    </div>`;
  }
  function bindCards(root) {
    root.querySelectorAll('.card[data-place]').forEach((c) => {
      const open = () => L.openPlace(c.dataset.place);
      c.addEventListener('click', open);
      c.addEventListener('keydown', (e) => { if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); open(); } });
    });
  }

  // ---------- Разделы ----------
  const SECTIONS = ['home', 'places', 'place', 'avatar', 'catalog', 'profile', 'settings'];
  L.show = function (sec) {
    if (L.section === 'avatar' && sec !== 'avatar') stopLive();
    L.section = sec;
    for (const s of SECTIONS) $('sec-' + s).hidden = s !== sec;
    document.querySelectorAll('.sidenav [data-sec]').forEach((b) => b.classList.toggle('on', b.dataset.sec === sec || (sec === 'place' && b.dataset.sec === 'places')));
    $('content').scrollTop = 0;
    ({ home: drawHome, places: drawPlaces, place: drawPlace, avatar: drawAvatar, catalog: drawCatalog, profile: drawProfile, settings: drawSettings })[sec]();
    B.emit('section', sec);
  };

  // Друзья: придуманные игроки платформы, их аватары и где они сейчас
  function friends() {
    if (L.friendList) return L.friendList;
    const p = B.acct.profile(), rnd = B.rng(B.hash(p.nick + p.created));
    const names = B.data.BOT_NAMES.slice();
    L.friendList = Array.from({ length: 7 }, () => {
      const name = names.splice(rnd.int(names.length), 1)[0];
      const r = rnd();
      const place = r < 0.55 ? rnd.pick(B.data.PLACES) : null;
      return { name, cfg: B.game.randomAvatar(rnd), status: place ? 'game' : r < 0.8 ? 'online' : 'offline', place, img: null };
    });
    return L.friendList;
  }
  function friendRow() {
    const list = friends();
    const en = B.lang() === 'en';
    return `<h2 class="row-h">${en ? 'Friends' : 'Друзья'} <span class="muted">(${list.length})</span></h2><div class="friends">${list.map((f, i) => {
      if (!f.img) { try { f.img = L.headshot(f.cfg); } catch (e) { f.img = ''; } }
      const st = f.status === 'game' ? B.tn(f.place) : f.status === 'online' ? (en ? 'Online' : 'В сети') : (en ? 'Offline' : 'Не в сети');
      return `<button type="button" class="friend ${f.status}" data-fi="${i}" title="${B.esc(st)}"><span class="f-img"><img src="${f.img}" alt=""><i></i></span><b>${B.esc(f.name)}</b><small>${B.esc(st)}</small></button>`;
    }).join('')}</div>`;
  }

  function drawHome() {
    const prof = B.acct.profile();
    const recent = B.data.PLACES.filter((p) => B.acct.placeStats(p.id).visits > 0).sort((a, b) => (B.acct.placeStats(b.id).last || 0) - (B.acct.placeStats(a.id).last || 0));
    const done = B.acct.completedCount(), total = B.data.PLACES.length;
    const legend = !!B.acct.badges().legend;
    $('sec-home').innerHTML = `
      <div class="hello">
        <img class="hello-img" src="${L.head || ''}" alt="">
        <div><h1>${B.t('hello')}, ${B.esc(B.acct.displayName())}!</h1><div class="muted">@${B.esc(prof.nick)} · ${B.t('welcome')}</div></div>
        <div class="progress-card${legend ? ' legend' : ''}">
          <div class="pc-top"><b>${legend ? B.t('legend_title') : (B.lang() === 'en' ? 'Platform progress' : 'Прогресс по платформе')}</b><span>${done}/${total}</span></div>
          <div class="pc-bar"><i style="width:${Math.round(done / total * 100)}%"></i></div>
          <div class="muted small">${legend ? B.t('legend_text') : (B.lang() === 'en' ? 'Complete every place to become a Bloxcity Legend' : 'Пройди все места и стань Легендой Блоксити')}</div>
        </div>
      </div>
      ${friendRow()}
      ${recent.length ? `<h2 class="row-h">${B.t('continue_row')}</h2><div class="row">${recent.map(card).join('')}</div>` : ''}
      <h2 class="row-h">${B.t('recommended')}</h2><div class="row">${B.data.PLACES.map(card).join('')}</div>`;
    bindCards($('sec-home'));
    $('sec-home').querySelectorAll('[data-fi]').forEach((b) => b.addEventListener('click', () => { const f = friends()[b.dataset.fi]; if (f.place) L.openPlace(f.place.id); }));
  }
  function drawPlaces() {
    const q = ($('search').value || '').trim().toLowerCase();
    const list = B.data.PLACES.filter((p) => !q || (p.name + ' ' + p.en + ' ' + p.genre + ' ' + p.genreEn).toLowerCase().includes(q));
    $('sec-places').innerHTML = `<h1>${B.t('all_places')} <span class="muted">· ${list.length} ${B.t('place_count')}</span></h1>
      <div class="grid">${list.map(card).join('') || `<p class="muted">${B.lang() === 'en' ? 'Nothing found' : 'Ничего не нашлось'}</p>`}</div>`;
    bindCards($('sec-places'));
  }

  L.openPlace = function (id) { L.placeId = id; B.sound.play('click'); L.show('place'); };
  function drawPlace() {
    const p = B.data.place(L.placeId), st = B.acct.placeStats(p.id), v = B.acct.votes()[p.id] || 0;
    const fmt = (val) => (val == null ? '-' : p.metric === 'time' ? B.fmtTime(val) : p.metric === 'blocks' ? String(val) : Number(val).toFixed(p.metric === 'height' ? 1 : 0));
    const rnd = B.rng(B.hash(p.id));
    // таблица лучших: ты и боты-завсегдатаи (придуманные результаты)
    const rows = B.data.BOT_NAMES.slice(0, 5).map((n, i) => {
      let val;
      if (p.metric === 'time') val = p.medals.gold === Infinity ? 60 : (p.id === 'obby' ? 118 : p.id === 'coins' ? 38 : p.medals.gold * 0.85) * (1 + i * 0.12 + rnd() * 0.05);
      else if (p.metric === 'height') val = 125 - i * 14 - rnd() * 5;
      else if (p.metric === 'score') val = 20 - i * 2 - rnd.int(2);
      else val = 400 - i * 60 - rnd.int(30);
      return { name: n, val: p.metric === 'time' ? Math.round(val * 100) / 100 : Math.round(val * 10) / 10 };
    });
    if (st.best != null) rows.push({ name: B.acct.displayName(), val: st.best, me: true });
    if (p.metric === 'blocks') { const saved = B.places.sandbox.load(); rows.push({ name: B.acct.displayName(), val: saved.blocks.length, me: true }); }
    rows.sort((a, b) => (p.lower ? a.val - b.val : b.val - a.val));
    const shots = L.shots[p.id];
    $('sec-place').innerHTML = `
      <button type="button" class="back-btn" id="pl-back">${U.icon('back', 18)} ${B.t('back')}</button>
      <div class="place-top">
        <div class="media">
          <div class="media-main" id="pl-main" style="${shots ? `background-image:url(${shots[0]})` : (L.thumbs[p.id] ? `background-image:url(${L.thumbs[p.id]})` : `background-color:${p.color}`)}"></div>
          <div class="media-strip" id="pl-strip">${(shots || []).map((s, i) => `<button type="button" class="ms${i === 0 ? ' on' : ''}" data-i="${i}" style="background-image:url(${s})" aria-label="${i + 1}"></button>`).join('')}</div>
        </div>
        <div class="place-info">
          <h1>${B.esc(B.tn(p))}</h1>
          <div class="muted">${B.t('by')} <b class="link">${B.t('brand')}</b>${B.acct.completed(p.id) ? ` · <span class="done-inline">✓ ${B.t('completed')}</span>` : ''}</div>
          <button type="button" class="play-big" id="pl-play" aria-label="${B.t('play')}">${U.icon('play', 30)}<span>${B.t('play')}</span></button>
          <div class="votes">
            <button type="button" class="vote${v === 1 ? ' on' : ''}" id="pl-up">${U.icon('thumb', 18)} <span>${v === 1 ? 1 : 0}</span></button>
            <button type="button" class="vote${v === -1 ? ' on' : ''}" id="pl-down">${U.icon('thumbdown', 18)} <span>${v === -1 ? 1 : 0}</span></button>
            <div class="vote-bar"><i style="width:${v === 1 ? 100 : v === -1 ? 0 : 50}%"></i></div>
          </div>
          <div class="my-best">
            <div><span class="muted">${B.t('your_best')}</span><b>${fmt(p.metric === 'blocks' ? B.places.sandbox.load().blocks.length : st.best)}</b></div>
            <div><span class="muted">${B.t('your_medal')}</span><b>${st.medal ? U.medal(st.medal, 20) + ' ' + U.medalName(st.medal) : '-'}</b></div>
          </div>
        </div>
      </div>
      <div class="place-cols">
        <div class="panel">
          <h2>${B.t('about')}</h2>
          <p>${B.esc(B.lang() === 'en' ? p.descEn : p.desc)}</p>
          <div class="stat-grid">
            <div><span class="muted">${B.lang() === 'en' ? 'Visits' : 'Посещения'}</span><b>${B.fmtNum(st.visits)}</b></div>
            <div><span class="muted">${B.t('genre')}</span><b>${B.esc(B.lang() === 'en' ? p.genreEn : p.genre)}</b></div>
            <div><span class="muted">${B.t('max_players')}</span><b>${p.maxPlayers}</b></div>
            <div><span class="muted">${B.t('created')}</span><b>26.09.2026</b></div>
          </div>
          ${p.medals ? `<div class="medal-row">${['gold', 'silver', 'bronze'].map((m) => `<div>${U.medal(m, 26)}<span>${U.medalName(m)}</span><b>${p.medals[m] === Infinity ? (B.lang() === 'en' ? 'finish' : 'финиш') : (p.metric === 'time' ? (p.lower ? '≤ ' : '') + p.medals[m] + ' с' : '≥ ' + p.medals[m])}</b><small>+${B.REWARD[m]} ${U.cube(12)}</small></div>`).join('')}</div>` : ''}
        </div>
        <div class="panel">
          <h2>${B.t('best_results')}</h2>
          <div class="lb">${rows.slice(0, 7).map((r, i) => `<div class="lb-row${r.me ? ' me' : ''}"><span class="lb-n">${i + 1}</span><span class="lb-name">${B.esc(r.name)}</span><b>${fmt(r.val)}</b></div>`).join('')}</div>
        </div>
      </div>`;
    $('pl-back').onclick = () => L.show('home');
    $('pl-play').onclick = () => B.game.enter(p.id);
    $('pl-up').onclick = () => { B.acct.vote(p.id, 1); drawPlace(); };
    $('pl-down').onclick = () => { B.acct.vote(p.id, -1); drawPlace(); };
    const bindStrip = () => $('pl-strip').querySelectorAll('.ms').forEach((b) => b.addEventListener('click', () => {
      $('pl-main').style.backgroundImage = `url(${L.shots[p.id][b.dataset.i]})`;
      $('pl-strip').querySelectorAll('.ms').forEach((x) => x.classList.toggle('on', x === b));
    }));
    bindStrip();
    if (!shots) {
      setTimeout(() => {
        if (L.section !== 'place' || L.placeId !== p.id || B.game.cur) return;
        try { L.shots[p.id] = shotsOf(p.id, B.places[p.id].shots); } catch (e) { console.warn(e); return; }
        if (L.section === 'place' && L.placeId === p.id) drawPlace();
      }, 80);
    }
  }

  // ---------- Аватар ----------
  let live = null;
  function startLive() {
    if (live) return;
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    r.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 0.7));
    const d = new THREE.DirectionalLight(0xffffff, 0.75); d.position.set(5, 10, 8); d.castShadow = true; scene.add(d);
    r.shadowMap.enabled = true;
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 0.3, 40), new THREE.MeshLambertMaterial({ color: 0x9aa3b2 }));
    floor.position.y = -0.15; floor.receiveShadow = true; scene.add(floor);
    const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    live = { r, scene, cam, ch: null, yaw: -0.4, drag: null, idle: 0, raf: 0 };
    const cv = r.domElement; cv.className = 'live-cv';
    cv.addEventListener('pointerdown', (e) => { live.drag = e.clientX; live.idle = 0; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', (e) => { if (live.drag != null) { live.yaw += (e.clientX - live.drag) * 0.012; live.drag = e.clientX; } });
    cv.addEventListener('pointerup', () => { live.drag = null; });
    const loop = () => {
      if (!live) return;
      const box = $('av-live');
      if (box && cv.parentNode !== box) box.appendChild(cv);
      const w = box ? box.clientWidth : 300, h = box ? box.clientHeight : 360;
      if (cv.width !== Math.round(w * r.getPixelRatio()) || cv.height !== Math.round(h * r.getPixelRatio())) { r.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix(); }
      if (live.drag == null) { live.idle += 0.016; if (live.idle > 2.5) live.yaw += 0.006; }
      if (live.ch) { live.ch.root.rotation.y = live.yaw; live.ch.pose({ dt: 0.016, speed: 0 }); }
      cam.position.set(0, 3.4, 15.5); cam.lookAt(0, 2.8, 0);
      r.render(scene, cam);
      live.raf = requestAnimationFrame(loop);
    };
    live.raf = requestAnimationFrame(loop);
  }
  function stopLive() {
    if (!live) return;
    cancelAnimationFrame(live.raf);
    if (live.ch) live.scene.remove(live.ch.root);
    live.r.dispose();
    try { live.r.forceContextLoss(); } catch (e) { /* нет */ }
    live = null;
  }
  function setLiveAvatar(cfg) {
    if (!live) return;
    if (live.ch) { live.scene.remove(live.ch.root); live.ch.dispose(); }
    live.ch = B.avatar.build(cfg);
    live.scene.add(live.ch.root);
  }

  const PARTS = [['head', 'Голова', 'Head'], ['torso', 'Туловище', 'Torso'], ['armL', 'Левая рука', 'Left arm'], ['armR', 'Правая рука', 'Right arm'], ['legL', 'Левая нога', 'Left leg'], ['legR', 'Правая нога', 'Right leg']];
  L.draft = null; L.avTab = 'body'; L.avPart = 'all';
  function dirty() { return JSON.stringify(L.draft) !== JSON.stringify(B.acct.avatar()); }
  function drawAvatar() {
    if (!L.draft) L.draft = B.acct.avatar();
    const en = B.lang() === 'en';
    $('sec-avatar').innerHTML = `
      <h1>${en ? 'Avatar Editor' : 'Редактор аватара'}</h1>
      <div class="av-wrap">
        <div class="av-left">
          <div id="av-live" class="av-live" title="${en ? 'Drag to rotate' : 'Потяни, чтобы повернуть'}"></div>
          <div class="av-actions">
            <button type="button" class="btn primary" id="av-save">${B.t('save')}</button>
            <button type="button" class="btn ghost" id="av-revert">${B.t('revert')}</button>
          </div>
          <div class="muted small" id="av-note"></div>
        </div>
        <div class="av-right">
          <div class="tabs" id="av-tabs">${[['body', B.t('body')], ['clothes', B.t('clothes')], ['acc', B.t('accessories')], ['faces', B.t('faces')]].map(([k, n]) => `<button type="button" class="tab${L.avTab === k ? ' on' : ''}" data-tab="${k}">${n}</button>`).join('')}</div>
          <div id="av-panel" class="av-panel"></div>
        </div>
      </div>`;
    startLive();
    setLiveAvatar(L.draft);
    $('av-tabs').querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => { L.avTab = b.dataset.tab; drawAvatar(); }));
    $('av-save').onclick = () => {
      L.draft = B.acct.saveAvatar(L.draft);
      B.sound.play('buy');
      refreshAvatarImages(); queueThumbs(true);
      U.toast(B.t('saved'), 'ok');
      avNote();
    };
    $('av-revert').onclick = () => { L.draft = B.acct.avatar(); drawAvatar(); };
    drawAvPanel();
    avNote();
  }
  function avNote() { const n = $('av-note'); if (n) n.textContent = dirty() ? (B.lang() === 'en' ? 'Unsaved changes' : 'Есть несохранённые изменения') : ''; }
  function itemTile(it, worn) {
    const own = B.acct.owns(it.id);
    return `<button type="button" class="item${worn ? ' worn' : ''}${own ? '' : ' locked'}" data-item="${it.id}">
      <span class="item-img" style="background-image:url(${itemIcon(it.id)})"></span>
      <span class="item-name">${B.esc(B.tn(it))}</span>
      <span class="item-price">${own ? (worn ? '✓ ' + (B.lang() === 'en' ? 'Worn' : 'Надето') : B.t('owned')) : U.cube(13) + ' ' + it.price}</span>
    </button>`;
  }
  function drawAvPanel() {
    const d = L.draft, en = B.lang() === 'en', box = $('av-panel');
    if (L.avTab === 'body') {
      box.innerHTML = `<div class="chips">${[['all', 'Все', 'All']].concat(PARTS).map(([k, ru, e]) => `<button type="button" class="chip${L.avPart === k ? ' on' : ''}" data-part="${k}">${en ? e : ru}${k !== 'all' ? `<i style="background:${d.colors[k]}"></i>` : ''}</button>`).join('')}</div>
        <div class="palette">${B.data.COLORS.map(([c, n]) => `<button type="button" class="sw" data-color="${c}" style="background:${c}" title="${n}" aria-label="${n}"></button>`).join('')}</div>`;
      box.querySelectorAll('[data-part]').forEach((b) => b.addEventListener('click', () => { L.avPart = b.dataset.part; drawAvPanel(); }));
      box.querySelectorAll('[data-color]').forEach((b) => b.addEventListener('click', () => {
        const keys = L.avPart === 'all' ? PARTS.map((p) => p[0]) : [L.avPart];
        for (const k of keys) d.colors[k] = b.dataset.color;
        B.sound.play('click'); setLiveAvatar(d); drawAvPanel(); avNote();
      }));
      return;
    }
    let groups;
    if (L.avTab === 'clothes') groups = [[en ? 'Shirts' : 'Рубашки', B.data.SHIRTS.map((s) => B.data.item(s.id))], [en ? 'Pants' : 'Штаны', B.data.PANTS.map((s) => B.data.item(s.id))]];
    else if (L.avTab === 'faces') groups = [[B.t('faces'), B.data.FACES.map((s) => B.data.item(s.id))]];
    else groups = [[en ? 'Hats' : 'Шапки', 'hat'], [en ? 'Hair' : 'Причёски', 'hair'], [en ? 'Face' : 'На лицо', 'faceAcc'], [en ? 'Back' : 'На спину', 'back']].map(([n, slot]) => [n, B.data.ACCESSORIES.filter((a) => a.slot === slot).map((a) => B.data.item(a.id))]);
    box.innerHTML = groups.map(([n, items]) => `<h3>${n}</h3><div class="items">${items.map((it) => itemTile(it, d[it.slot] === it.id)).join('')}</div>`).join('');
    box.querySelectorAll('[data-item]').forEach((b) => b.addEventListener('click', () => {
      const it = B.data.item(b.dataset.item);
      if (!B.acct.owns(it.id)) { openBuy(it.id, () => drawAvPanel()); return; }
      const cur = d[it.slot];
      if (cur === it.id) {       // снять можно шапку, волосы и прочее; лицо и одежду - заменить на «нет»
        if (it.type === 'accessory') d[it.slot] = '';
        else if (it.type === 'shirt') d.shirt = 'shirt_none';
        else if (it.type === 'pants') d.pants = 'pants_none';
      } else d[it.slot] = it.id;
      B.sound.play('click'); setLiveAvatar(d); drawAvPanel(); avNote();
    }));
  }

  // ---------- Каталог ----------
  L.catFilter = 'all';
  function drawCatalog() {
    const en = B.lang() === 'en';
    const F = [['all', 'Все', 'All'], ['hat', 'Шапки', 'Hats'], ['hair', 'Причёски', 'Hair'], ['faceAcc', 'Аксессуары', 'Accessories'], ['face', 'Лица', 'Faces'], ['shirt', 'Рубашки', 'Shirts'], ['pants', 'Штаны', 'Pants']];
    const items = Object.values(B.data.ITEMS).filter((it) => !/_none$/.test(it.id)).filter((it) => L.catFilter === 'all' || it.slot === L.catFilter || (L.catFilter === 'faceAcc' && it.slot === 'back'));
    items.sort((a, b) => a.price - b.price);
    $('sec-catalog').innerHTML = `<h1>${B.t('nav_catalog')} <span class="muted">· ${B.t('balance')}: ${U.cube(18)} <b id="cat-bal">${B.acct.balance()}</b></span></h1>
      <p class="muted">${en ? 'Earn cubes with medals in places and spend them here. The first items are free.' : 'Кубы дают за медали в местах - трать их здесь. Первые вещи бесплатные.'}</p>
      <div class="chips">${F.map(([k, ru, e]) => `<button type="button" class="chip${L.catFilter === k ? ' on' : ''}" data-f="${k}">${en ? e : ru}</button>`).join('')}</div>
      <div class="items cat">${items.map((it) => { const own = B.acct.owns(it.id); return `<button type="button" class="item${own ? '' : ' locked'}" data-item="${it.id}"><span class="item-img" style="background-image:url(${itemIcon(it.id)})"></span><span class="item-name">${B.esc(B.tn(it))}</span><span class="item-price">${own ? (it.price === 0 ? B.t('free') : '✓ ' + B.t('owned')) : U.cube(13) + ' ' + it.price}</span></button>`; }).join('')}</div>`;
    $('sec-catalog').querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => { L.catFilter = b.dataset.f; drawCatalog(); }));
    $('sec-catalog').querySelectorAll('[data-item]').forEach((b) => b.addEventListener('click', () => openBuy(b.dataset.item, drawCatalog)));
  }
  function openBuy(id, after) {
    const it = B.data.item(id), own = B.acct.owns(id), en = B.lang() === 'en';
    const bal = B.acct.balance(), can = bal >= it.price;
    const m = $('modal');
    m.innerHTML = `<div class="modal-card">
      <button type="button" class="x" id="mb-x" aria-label="close">${U.icon('close', 18)}</button>
      <div class="mb-img" style="background-image:url(${itemIcon(id)})"></div>
      <h2>${B.esc(B.tn(it))}</h2>
      <div class="muted">${B.t('by')} ${B.t('brand')} · ${{ face: B.t('faces'), shirt: en ? 'Shirt' : 'Рубашка', pants: en ? 'Pants' : 'Штаны', accessory: B.t('accessories') }[it.type]}</div>
      <div class="mb-price">${own ? '✓ ' + B.t('owned') : it.price === 0 ? B.t('free') : U.cube(20) + ' <b>' + it.price + '</b>'}</div>
      ${!own && !can ? `<div class="warn" id="mb-warn">${B.t('not_enough')}: ${bal} / ${it.price}</div>` : ''}
      <div class="mb-btns">
        ${own ? `<button type="button" class="btn primary" id="mb-wear">${B.t('wear')}</button>` : `<button type="button" class="btn primary" id="mb-buy" ${can ? '' : 'disabled'}>${B.t('buy')}</button>`}
        <button type="button" class="btn ghost" id="mb-cancel">${B.t('cancel')}</button>
      </div></div>`;
    m.hidden = false;
    const close = () => { m.hidden = true; m.innerHTML = ''; };
    $('mb-x').onclick = close; $('mb-cancel').onclick = close;
    m.onclick = (e) => { if (e.target === m) close(); };
    if ($('mb-buy')) $('mb-buy').onclick = () => {
      const r = B.acct.buy(id);
      if (r.ok) { B.sound.play('buy'); U.toast((en ? 'Bought: ' : 'Куплено: ') + B.esc(B.tn(it)), 'ok'); close(); if (after) after(); }
      else U.toast(B.esc(r.reason), 'bad');
    };
    if ($('mb-wear')) $('mb-wear').onclick = () => {
      const a = L.draft || B.acct.avatar(); a[it.slot] = id;
      L.draft = B.acct.saveAvatar(a);
      refreshAvatarImages(); queueThumbs(true);
      close(); if (after) after();
      U.toast(B.t('saved'), 'ok');
    };
  }
  L.openBuy = openBuy;

  // ---------- Профиль ----------
  function drawProfile() {
    const p = B.acct.profile(), en = B.lang() === 'en';
    if (!L.full) { try { L.full = L.fullbody(); } catch (e) { L.full = ''; } }
    const badges = B.acct.badges();
    const vis = B.settings.get('profileVisible');
    const visTxt = { all: en ? 'Everyone' : 'Все', friends: en ? 'Friends' : 'Друзья', me: en ? 'Only me' : 'Только я' }[vis];
    const tot = B.data.PLACES.reduce((s, pl) => s + B.acct.placeStats(pl.id).visits, 0);
    $('sec-profile').innerHTML = `
      <div class="prof-head">
        <img class="prof-img" src="${L.full}" alt="">
        <div class="prof-info">
          <h1 id="pf-name">${B.esc(B.acct.displayName())}</h1>
          <div class="muted">@<span id="pf-nick">${B.esc(p.nick)}</span> · ${en ? 'Profile visible to' : 'Профиль видят'}: ${visTxt}</div>
          <p class="about">${p.about ? B.esc(p.about) : `<span class="muted">${en ? 'Nothing about you yet.' : 'Пока ничего о себе.'}</span>`}</p>
          <div class="prof-stats">
            <div><b>${B.acct.completedCount()}/${B.data.PLACES.length}</b><span>${en ? 'places completed' : 'мест пройдено'}</span></div>
            <div><b>${tot}</b><span>${B.t('visits')}</span></div>
            <div><b>${Object.keys(badges).length}</b><span>${B.t('badges')}</span></div>
            <div><b>${U.cube(16)} ${B.acct.balance()}</b><span>${B.t('currency')}</span></div>
            <div><b>${B.esc(p.created)}</b><span>${en ? 'joined' : 'с нами с'}</span></div>
          </div>
          <button type="button" class="btn ghost" id="pf-edit">${U.icon('pencil', 16)} ${B.t('edit')}</button>
        </div>
      </div>
      <form class="panel prof-form" id="pf-form" hidden>
        <label>${B.t('nickname')}<input id="pf-nick-in" maxlength="20" value="${B.esc(p.nick)}" autocomplete="off"></label>
        <label>${B.t('display_name')}<input id="pf-disp-in" maxlength="24" value="${B.esc(p.display || '')}" autocomplete="off"></label>
        <label>${B.t('about_me')}<textarea id="pf-about-in" maxlength="300" rows="3">${B.esc(p.about || '')}</textarea></label>
        <div class="warn" id="pf-err" hidden></div>
        <div><button type="submit" class="btn primary">${B.t('save')}</button> <button type="button" class="btn ghost" id="pf-cancel">${B.t('cancel')}</button></div>
      </form>
      <div class="panel"><h2>${B.t('stats')}</h2>
        <table class="tbl"><thead><tr><th>${en ? 'Place' : 'Место'}</th><th>${B.t('visits')}</th><th>${B.t('your_best')}</th><th>${B.t('your_medal')}</th><th>${B.t('completed')}</th></tr></thead><tbody>
        ${B.data.PLACES.map((pl) => { const s = B.acct.placeStats(pl.id); const best = pl.metric === 'blocks' ? B.places.sandbox.load().blocks.length : s.best; return `<tr><td>${B.esc(B.tn(pl))}</td><td>${s.visits}</td><td>${best == null ? '-' : pl.metric === 'time' ? B.fmtTime(best) : best}</td><td>${s.medal ? U.medal(s.medal, 18) : '-'}</td><td>${B.acct.completed(pl.id) ? '✓' : '-'}</td></tr>`; }).join('')}
        </tbody></table></div>
      <div class="panel"><h2>${B.t('badges')} <span class="muted">${Object.keys(badges).length}/${B.data.BADGES.length}</span></h2>
        <div class="badges">${B.data.BADGES.map((b) => `<div class="badge${badges[b.id] ? ' got' : ''}" title="${B.esc(b.desc)}"><span class="b-ic" style="--c:${b.color}">${badgeIcon(b.icon)}</span><b>${B.esc(B.tn(b))}</b><small>${badges[b.id] ? badges[b.id] : B.esc(b.desc)}</small></div>`).join('')}</div></div>`;
    $('pf-edit').onclick = () => { $('pf-form').hidden = !$('pf-form').hidden; };
    $('pf-cancel').onclick = () => { $('pf-form').hidden = true; };
    $('pf-form').onsubmit = (e) => {
      e.preventDefault();
      const nick = $('pf-nick-in').value.trim();
      if (!B.acct.validNick(nick)) { $('pf-err').hidden = false; $('pf-err').textContent = en ? 'Username: 3-20 letters, digits or _' : 'Ник: 3-20 букв, цифр или _'; return; }
      B.acct.setProfile({ nick, display: $('pf-disp-in').value.trim().slice(0, 24), about: $('pf-about-in').value.trim().slice(0, 300) });
      drawTop(); drawProfile();
      U.toast(B.t('saved'), 'ok');
    };
  }
  function badgeIcon(name) {
    const P = {
      foot: '<path d="M8 3c2 0 3 2 3 5s-1 6-3 6-3-2-3-5 1-6 3-6zm8 6c2 0 3 2 3 5s-1 6-3 6-3-2-3-5 1-6 3-6z"/>',
      tower: '<path d="M8 21V9l-2-2V3h3v2h2V3h2v2h2V3h3v4l-2 2v12z"/>',
      medal: '<path d="M7 2h4l2 6H9zm6 0h4l-2 6h-4z"/><circle cx="12" cy="15" r="6"/>',
      flame: '<path d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-3-1-6 1-9z"/>',
      coin: '<circle cx="12" cy="12" r="8"/>',
      brick: '<path d="M3 8h18v10H3z"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="6" r="2"/>',
      star: '<path d="m12 2 3 7 7 .6-5.3 4.7 1.6 7.1L12 17.8 5.7 21.4l1.6-7.1L2 9.6 9 9z"/>',
      bag: '<path d="M5 8h14l-1 13H6zM9 8a3 3 0 0 1 6 0" />',
      cube: '<path d="M12 2 21 7v10l-9 5-9-5V7z"/>',
      crown: '<path d="m3 8 5 4 4-7 4 7 5-4-2 11H5z"/>',
    };
    return `<svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor" aria-hidden="true">${P[name] || P.star}</svg>`;
  }

  // ---------- Настройки платформы ----------
  L.setTab = 'account';
  function drawSettings() {
    const en = B.lang() === 'en', p = B.acct.profile();
    const tabs = [['account', B.t('tab_account')], ['privacy', B.t('tab_privacy')], ['notify', B.t('tab_notify')], ['look', B.t('tab_look')], ['av', B.t('tab_av')]];
    $('sec-settings').innerHTML = `<h1>${B.t('nav_settings')}</h1>
      <div class="set-wrap">
        <div class="set-tabs" role="tablist">${tabs.map(([k, n]) => `<button type="button" role="tab" class="set-tab${L.setTab === k ? ' on' : ''}" data-st="${k}">${n}</button>`).join('')}</div>
        <div class="panel set-body" id="set-body"></div>
      </div>`;
    $('sec-settings').querySelectorAll('[data-st]').forEach((b) => b.addEventListener('click', () => { L.setTab = b.dataset.st; drawSettings(); }));
    const body = $('set-body');
    const L2 = (ru, e) => () => (B.lang() === 'en' ? e : ru);
    if (L.setTab === 'account') {
      body.innerHTML = `<h2>${B.t('tab_account')}</h2>
        <form id="acc-form" class="prof-form">
          <label>${B.t('nickname')}<input id="acc-nick" maxlength="20" value="${B.esc(p.nick)}" autocomplete="off"></label>
          <label>${B.t('display_name')}<input id="acc-disp" maxlength="24" value="${B.esc(p.display || '')}" autocomplete="off"></label>
          <label>${B.t('about_me')}<textarea id="acc-about" maxlength="300" rows="3">${B.esc(p.about || '')}</textarea></label>
          <div class="warn" id="acc-err" hidden></div>
          <div><button type="submit" class="btn primary" id="acc-save">${B.t('save')}</button></div>
        </form>
        <div class="danger-zone"><div><b>${B.t('reset_progress')}</b><div class="muted small">${B.t('reset_confirm')}</div></div><button type="button" class="btn danger" id="acc-reset">${B.t('reset_progress')}</button></div>`;
      $('acc-form').onsubmit = (e) => {
        e.preventDefault();
        const nick = $('acc-nick').value.trim();
        if (!B.acct.validNick(nick)) { $('acc-err').hidden = false; $('acc-err').textContent = en ? 'Username: 3-20 letters, digits or _' : 'Ник: 3-20 букв, цифр или _'; return; }
        $('acc-err').hidden = true;
        B.acct.setProfile({ nick, display: $('acc-disp').value.trim().slice(0, 24), about: $('acc-about').value.trim().slice(0, 300) });
        drawTop(); U.toast(B.t('saved'), 'ok');
      };
      $('acc-reset').onclick = () => {
        const m = $('modal');
        m.innerHTML = `<div class="modal-card"><h2>${B.t('reset_progress')}?</h2><p>${B.t('reset_confirm')}</p><div class="mb-btns"><button type="button" class="btn danger" id="rs-yes">${B.t('yes_reset')}</button><button type="button" class="btn ghost" id="rs-no">${B.t('cancel')}</button></div></div>`;
        m.hidden = false;
        $('rs-no').onclick = () => { m.hidden = true; };
        $('rs-yes').onclick = () => {
          B.acct.resetProgress(); m.hidden = true; L.draft = null;
          refreshAvatarImages(); queueThumbs(true); drawSettings();
          U.toast(en ? 'Progress reset' : 'Прогресс сброшен', 'ok');
        };
      };
    } else if (L.setTab === 'privacy') {
      body.innerHTML = `<h2>${B.t('tab_privacy')}</h2><div id="set-list"></div><p class="muted small">${en ? 'Everything is stored only in this browser.' : 'Всё хранится только в этом браузере.'}</p>`;
      U.settingsList($('set-list'), [
        { key: 'profileVisible', label: L2('Кто видит мой профиль', 'Who can see my profile'), type: 'choice', options: [['all', L2('Все', 'Everyone')], ['friends', L2('Друзья', 'Friends')], ['me', L2('Только я', 'Only me')]] },
        { key: 'chat', label: L2('Чат в местах', 'Chat in places'), type: 'choice', options: [['all', L2('Включён', 'On')], ['off', L2('Скрыт', 'Hidden')]] },
      ], B.settings);
    } else if (L.setTab === 'notify') {
      body.innerHTML = `<h2>${B.t('tab_notify')}</h2><div id="set-list"></div>`;
      U.settingsList($('set-list'), [
        { key: 'notifyBadges', label: L2('Новые значки', 'New badges'), type: 'toggle' },
        { key: 'notifyCurrency', label: L2('Получены кубы', 'Cubes earned'), type: 'toggle' },
        { key: 'notifyChat', label: L2('Звук сообщений в чате', 'Chat message sound'), type: 'toggle' },
      ], B.settings);
    } else if (L.setTab === 'look') {
      body.innerHTML = `<h2>${B.t('tab_look')}</h2><div id="set-list"></div>`;
      U.settingsList($('set-list'), [
        { key: 'theme', label: L2('Тема', 'Theme'), type: 'choice', options: [['dark', L2('Тёмная', 'Dark')], ['light', L2('Светлая', 'Light')]] },
        { key: 'lang', label: L2('Язык', 'Language'), type: 'choice', options: [['ru', () => 'Русский'], ['en', () => 'English']] },
      ], B.settings, () => { L.applyLook(); drawSettings(); });
    } else {
      body.innerHTML = `<h2>${B.t('tab_av')}</h2><p class="muted small">${en ? 'Defaults for every place. The same values are in the in-game menu.' : 'Значения для всех мест. Те же самые - в меню внутри места.'}</p><div id="set-list"></div>
        <div class="set-foot"><button type="button" class="btn ghost" id="set-def">${B.t('defaults')}</button></div>`;
      U.settingsList($('set-list'), B.ui.GAME_SCHEMA.filter((d) => U.AV_KEYS.includes(d.key)), B.gameSettings);
      $('set-def').onclick = () => { B.gameSettings.reset(); B.settings.reset(['notifyBadges', 'notifyCurrency', 'notifyChat', 'profileVisible', 'chat']); drawSettings(); U.toast(B.t('saved'), 'ok'); };
    }
  }

  // Тема и язык
  L.applyLook = function () {
    document.body.classList.toggle('theme-light', B.settings.get('theme') === 'light');
    B.applyI18n();
    drawTop();
  };

  // ---------- Праздник: Легенда Блоксити ----------
  L.celebrate = function () {
    if (!B.store.get('celebrate', false)) return false;
    const c = $('celebrate');
    const conf = Array.from({ length: 70 }, (_, i) => `<i style="left:${(i * 37) % 100}%;background:${['#ff5c5c', '#ffd23f', '#3fd0c4', '#8a5cf5', '#ff9d3b', '#a8d65b'][i % 6]};animation-delay:${(i % 14) * 0.15}s;animation-duration:${2.4 + (i % 5) * 0.4}s"></i>`).join('');
    c.innerHTML = `<div class="confetti">${conf}</div><div class="cel-card"><div class="cel-badge">${badgeIcon('crown')}</div><h1>${B.t('legend_title')}</h1><p>${B.t('legend_text')}</p><button type="button" class="btn primary" id="cel-ok">${B.t('celebrate_ok')}</button></div>`;
    c.hidden = false;
    B.sound.play('win');
    $('cel-ok').onclick = () => { c.hidden = true; B.store.remove('celebrate'); if (L.section === 'home') drawHome(); };
    return true;
  };

  // ---------- Запуск ----------
  L.init = function () {
    $('logo-btn').innerHTML = U.logo(30) + `<span class="brand" data-i18n="brand">${B.t('brand')}</span>`;
    $('bal-ic').innerHTML = U.cube(18);
    document.querySelectorAll('.sidenav [data-sec]').forEach((b) => {
      b.querySelector('.ni').innerHTML = U.icon(b.dataset.icon, 22);
      b.addEventListener('click', () => { B.sound.play('click'); L.show(b.dataset.sec); });
    });
    $('logo-btn').onclick = () => L.show('home');
    $('me-btn').onclick = () => L.show('profile');
    $('bal-btn').onclick = () => L.show('catalog');
    $('search-ic').innerHTML = U.icon('search', 16);
    $('search').addEventListener('input', () => { if (L.section !== 'places') L.show('places'); else drawPlaces(); });
    $('g-menu').innerHTML = U.logo(26);
    $('g-chat-btn').innerHTML = U.icon('chat', 20);
    B.on('wallet', (w) => {
      drawTop();
      if (w.delta > 0 && B.settings.get('notifyCurrency')) U.toast(`+${w.delta} ${U.cube(16)}`, 'cube');
    });
    B.on('badge', (id) => {
      const b = B.data.badge(id);
      if (b && B.settings.get('notifyBadges')) { U.toast(`${B.lang() === 'en' ? 'New badge' : 'Новый значок'}: <b>${B.esc(B.tn(b))}</b>`, 'badge'); B.sound.play('badge'); }
    });
    B.on('profile', drawTop);
    B.on('reset', () => { drawTop(); });
    B.on('screen', (s) => {
      $('launcher').hidden = s !== 'launcher';
      if (s === 'launcher') { L.show(L.section === 'place' ? 'place' : L.section); L.celebrate(); pumpThumbs(); }
      else stopLive();
    });
    L.applyLook();
    refreshAvatarImages();
    L.show('home');
    queueThumbs();
    L.celebrate();
  };
})(window.Blox);
