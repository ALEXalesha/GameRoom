// Браузерная «Игротека»: домашний экран с карточками и вкладки с играми в рамках <iframe>.
//
// Откуда что берётся:
//   window.IGROTEKA_DATA   - таблица игр и демо систем (web/_shared/games-data.js), та же,
//                            что у приложения на Electron;
//   window.IgrotekaTabs    - порядок вкладок (app/tabs.js): открыть, закрыть, куда уйти;
//   window.IgrotekaSettings - настройки и их проверка (app/settings.js).
//
// Чем браузер отличается от приложения:
//   - скрыть рамку так, чтобы игра получила «вкладка скрыта», нельзя. Поэтому игра, с
//     которой ушли, получает сообщение {mix: 'pause'}, а вернувшись - {mix: 'resume'}
//     (протокол оболочек, web/_os-shared/README.md; resume паузу не снимает - её снимает
//     игрок). То же при скрытии самой вкладки браузера;
//   - у всех страниц сайта одно хранилище: игры разводят его приставками ключей
//     (поле storage в таблице), по ним же здесь стираются данные одной игры;
//   - громкость задаётся так же, как в приложении (усилитель на выходе звука страницы), но
//     только когда страница игры доступна этой странице: с сайта или локального сервера.
//     Открытые с диска (file://) страницы браузер считает чужими друг другу.
(() => {
  'use strict';

  const DATA = window.IGROTEKA_DATA;
  const Tabs = window.IgrotekaTabs;
  const Settings = window.IgrotekaSettings;
  const $ = (sel) => document.querySelector(sel);

  const GAMES = DATA.GAMES;
  const SYSTEMS = DATA.SYSTEMS;
  const ITEMS = [...GAMES, ...SYSTEMS];
  const byId = new Map(ITEMS.map((g) => [g.id, g]));
  const KNOWN = ITEMS.map((g) => g.id);

  // Все пути относительные: страница работает и с диска, и из подпапки сайта
  // (https://<имя>.github.io/<репозиторий>/).
  const pageOf = (id) => `web/${id}/index.html`;
  const thumb = (id) => `app/assets/thumbs/${id}.jpg`;

  // Свои ключи в хранилище - с приставкой «igroteka.», у игр приставки другие.
  const KEY_SETTINGS = 'igroteka.web.settings';
  const KEY_TABS = 'igroteka.web.tabs';
  const VOLUME = Symbol.for('igroteka.volume');
  // Что разрешено игре в рамке. Захват мыши нужен шутеру и кубическому миру, весь экран -
  // всем, геймпад - аркадам, autoplay - звуку без лишнего щелчка. Звёздочка обязательна:
  // без списка адресов разрешение даётся только адресу из src, а страница с диска
  // (file://) для браузера - «ничей» адрес, и «Дино-бег» падал на getGamepads().
  const FRAME_ALLOW = 'pointer-lock *; fullscreen *; gamepad *; autoplay *';

  const SPEAKER = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  const SPEAKER_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

  // --- хранилище страницы -------------------------------------------------------------

  function load(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* хранилище закрыто - живём без него */ }
  }

  // Тема по умолчанию - как у системы; выбранная в настройках запоминается.
  function loadSettings() {
    const raw = load(KEY_SETTINGS);
    const s = raw && typeof raw === 'object' ? { ...raw } : {};
    if (!Settings.THEMES.includes(s.theme)) {
      s.theme = window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    return Settings.normalize(s);
  }

  let settings = loadSettings();
  let tabs = Tabs.empty();
  const frames = new Map(); // id -> <iframe> открытой вкладки (создаётся при первом показе)
  let volumeBlocked = false; // страницы игр недоступны (file://): громкость не задать

  // --- мелочи разметки ----------------------------------------------------------------

  function plural(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  function el(tag, attrs, ...children) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else e.setAttribute(k, v);
    }
    for (const c of children) if (c) e.append(c);
    return e;
  }

  // Картинки нет - остаётся градиент карточки, без значка «битой» картинки.
  function img(src, cls) {
    const i = el('img', { src, alt: '', draggable: 'false', loading: 'lazy' });
    if (cls) i.className = cls;
    i.addEventListener('error', () => { i.style.visibility = 'hidden'; });
    return i;
  }

  // --- сообщения игре -----------------------------------------------------------------

  function post(id, mix) {
    const f = frames.get(id);
    if (!f || !f.contentWindow) return;
    try { f.contentWindow.postMessage({ mix }, '*'); } catch { /* рамка ещё грузится */ }
  }

  // --- громкость ----------------------------------------------------------------------
  //
  // Как в приложении (app/game-preload.js): всё, что игра подключает к динамикам WebAudio,
  // подключается к нашему усилителю, а <audio>/<video> получают громкость при play().
  // Ставится в окно игры, как только оно стало доступно, и после каждой перезагрузки игры.

  function installVolume(w, start) {
    if (Object.prototype.hasOwnProperty.call(w, VOLUME)) return;
    let volume = start;
    const gains = new Set();
    const media = new Set();
    const apply = (v) => {
      if (v === undefined) return volume;
      volume = v;
      for (const ref of gains) { const g = ref.deref(); if (g) g.gain.value = v; else gains.delete(ref); }
      for (const ref of media) { const m = ref.deref(); if (m) m.volume = v; else media.delete(ref); }
      try { for (const m of w.document.querySelectorAll('audio, video')) m.volume = v; } catch { /* документа уже нет */ }
      return v;
    };
    Object.defineProperty(w, VOLUME, { value: apply });

    if (w.HTMLMediaElement) {
      const play = w.HTMLMediaElement.prototype.play;
      const seen = new WeakSet();
      Object.defineProperty(w.HTMLMediaElement.prototype, 'play', {
        configurable: true, writable: true,
        value: function (...args) {
          this.volume = volume;
          if (!seen.has(this)) { seen.add(this); media.add(new WeakRef(this)); }
          return play.apply(this, args);
        },
      });
    }
    const AC = w.AudioContext;
    if (!AC || !w.AudioNode) return;
    const masters = new WeakMap();
    const connect = w.AudioNode.prototype.connect;
    const disconnect = w.AudioNode.prototype.disconnect;
    const master = (ctx) => {
      let g = masters.get(ctx);
      if (!g) {
        g = ctx.createGain();
        g.gain.value = volume;
        connect.call(g, ctx.destination);
        masters.set(ctx, g);
        gains.add(new WeakRef(g));
      }
      return g;
    };
    const mapDest = (dest) => (dest instanceof w.AudioDestinationNode && dest.context instanceof AC ? master(dest.context) : dest);
    Object.defineProperty(w.AudioNode.prototype, 'connect', {
      configurable: true, writable: true,
      value: function (dest, ...rest) {
        const real = mapDest(dest);
        const r = connect.call(this, real, ...rest);
        return real === dest ? r : dest;
      },
    });
    Object.defineProperty(w.AudioNode.prototype, 'disconnect', {
      configurable: true, writable: true,
      value: function (...args) {
        if (args.length === 0) return disconnect.call(this);
        const [dest, ...rest] = args;
        if (dest instanceof w.AudioDestinationNode) {
          const g = masters.get(dest.context);
          if (g) return disconnect.call(this, g, ...rest);
        }
        return disconnect.call(this, ...args);
      },
    });
  }

  const volumeFor = (id) => (Settings.isMuted(settings, id, tabs.active) ? 0 : settings.volume / 100);

  // Окно игры, если оно доступно странице, иначе null. Пока рамка на about:blank
  // (игра ещё не начала грузиться) - тоже null, но без вывода «недоступно».
  function gameWindow(f) {
    try {
      const w = f.contentWindow;
      const d = w && w.document;
      if (!d || d.URL === 'about:blank') return null;
      return w;
    } catch {
      volumeBlocked = true; // SecurityError: страница игры чужая (file://)
      renderVolumeHint();
      return null;
    }
  }

  function hookVolume(id, f) {
    let tries = 0;
    const attempt = () => {
      if (frames.get(id) !== f || volumeBlocked) return;
      const w = gameWindow(f);
      if (w) { installVolume(w, volumeFor(id)); return; }
      if (!volumeBlocked && ++tries < 600) requestAnimationFrame(attempt);
    };
    attempt();
    // После перезагрузки игры (F5 внутри рамки) окно новое - ставится заново.
    f.addEventListener('load', () => { const w = gameWindow(f); if (w) installVolume(w, volumeFor(id)); });
  }

  function applyAudio() {
    for (const [id, f] of frames) {
      const w = volumeBlocked ? null : gameWindow(f);
      if (w && w[VOLUME]) w[VOLUME](volumeFor(id));
    }
  }

  // --- вкладки ------------------------------------------------------------------------

  function createFrame(id) {
    const g = byId.get(id);
    const f = document.createElement('iframe');
    f.dataset.id = id;
    f.title = g.name;
    f.setAttribute('allow', FRAME_ALLOW);
    f.setAttribute('allowfullscreen', '');
    f.src = pageOf(id);
    frames.set(id, f);
    $('#stage').append(f);
    hookVolume(id, f);
    return f;
  }

  // Закрытая вкладка освобождает рамку целиком: страница игры выгружается, её звук,
  // кадры и память уходят вместе с ней.
  function destroyFrame(id) {
    const f = frames.get(id);
    if (!f) return;
    frames.delete(id);
    if (document.fullscreenElement === f) document.exitFullscreen().catch(() => {});
    try { f.src = 'about:blank'; } catch { /* уже выгружается */ }
    f.remove();
  }

  function setTabs(next, { persist = true } = {}) {
    const prev = tabs.active;
    tabs = next;
    for (const id of [...frames.keys()]) if (!tabs.open.includes(id)) destroyFrame(id);
    let created = false;
    if (tabs.active !== Tabs.HOME && !frames.has(tabs.active)) { createFrame(tabs.active); created = true; }
    if (prev !== tabs.active) {
      const pf = frames.get(prev);
      if (pf) {
        if (document.fullscreenElement === pf) document.exitFullscreen().catch(() => {});
        post(prev, 'pause');
      }
      if (!created && frames.has(tabs.active)) post(tabs.active, 'resume');
    }
    layout();
    applyAudio();
    if (persist) save(KEY_TABS, tabs);
    renderTabs();
    renderBadges();
  }

  const open = (id) => setTabs(Tabs.openTab(tabs, id));
  const activate = (id) => setTabs(Tabs.activate(tabs, id));
  const close = (id) => setTabs(Tabs.closeTab(tabs, id));

  function layout() {
    const home = tabs.active === Tabs.HOME;
    $('#home').hidden = !home;
    $('#stage').hidden = home;
    $('#fullscreen').hidden = home;
    for (const [id, f] of frames) {
      const on = id === tabs.active;
      f.classList.toggle('active', on);
      // Спрятанная рамка не должна держать фокус: иначе клавиши уходили бы в игру,
      // которой не видно.
      if (!on && document.activeElement === f) f.blur();
    }
    const act = frames.get(tabs.active);
    if (act) act.focus();
  }

  function renderTabs() {
    const box = $('#tabs');
    box.replaceChildren(...tabs.open.map((id) => {
      const g = byId.get(id);
      const x = el('button', { class: 'x', title: 'Закрыть', 'aria-label': 'Закрыть «' + g.name + '»', text: '✕' });
      x.addEventListener('click', (e) => { e.stopPropagation(); close(id); });
      const tab = el('div', { class: 'tab game', role: 'tab', 'data-id': id, title: g.name, tabindex: '0' },
        img(thumb(id), 'icon'), el('span', { class: 'name', text: g.name }), x);
      tab.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });
      tab.addEventListener('auxclick', (e) => { if (e.button === 1) { e.preventDefault(); close(id); } });
      tab.addEventListener('click', () => activate(id));
      tab.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(id); } });
      return tab;
    }));
    for (const t of document.querySelectorAll('.tab')) {
      const on = t.dataset.id === tabs.active;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', String(on));
    }
    const act = box.querySelector('.tab.active');
    if (act) {
      if (act.offsetLeft < box.scrollLeft) box.scrollLeft = act.offsetLeft;
      else if (act.offsetLeft + act.offsetWidth > box.scrollLeft + box.clientWidth) box.scrollLeft = act.offsetLeft + act.offsetWidth - box.clientWidth;
    }
    edges();
    $('#bar').classList.toggle('crowded', tabs.open.length >= 6);
  }

  function edges() {
    const box = $('#tabs');
    box.classList.toggle('scrolled-left', box.scrollLeft > 1);
    box.classList.toggle('scrolled-right', box.scrollLeft + box.clientWidth < box.scrollWidth - 1);
  }

  // --- домашний экран -----------------------------------------------------------------

  function card(g) {
    const play = el('button', { class: 'btn primary play', text: 'Играть' });
    const title = el('h2', {}, el('span', { class: 'open-mark', title: 'Открыто во вкладке', hidden: '' }), g.name);
    if (g.style) title.append(el('span', { class: 'style', text: 'в стиле ' + g.style }));
    const c = el('article', { class: 'card', 'data-id': g.id, tabindex: '0' },
      el('div', { class: 'shot' }, img(thumb(g.id))),
      el('div', { class: 'head' }, title),
      el('p', { class: 'desc', text: g.desc }),
      el('div', { class: 'actions' }, play));
    c.addEventListener('click', () => open(g.id));
    c.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(g.id); } });
    return c;
  }

  function renderHome() {
    const n = GAMES.length;
    $('#subtitle').textContent = `${n} ${plural(n, 'игра', 'игры', 'игр')} без установки. У каждой своя вкладка и свои рекорды.`;
    $('#grid').style.setProperty('--cols', String(Math.min(5, Math.max(4, Math.ceil(n / 2)))));
    $('#grid').replaceChildren(...GAMES.map(card));
    $('#systems').replaceChildren(...SYSTEMS.map(card));
    const styles = SYSTEMS.map((s) => s.style);
    const list = styles.length > 1 ? styles.slice(0, -1).join(', ') + ' и ' + styles[styles.length - 1] : styles.join('');
    $('#systems-note').textContent = `Демо в стиле ${list}, не связано с Apple/Microsoft/Samsung.`;
  }

  function renderBadges() {
    for (const c of document.querySelectorAll('.card')) {
      const isOpen = tabs.open.includes(c.dataset.id);
      c.querySelector('.open-mark').hidden = !isOpen;
      c.classList.toggle('open', isOpen);
      c.querySelector('.play').textContent = isOpen ? 'Вернуться' : (byId.get(c.dataset.id).style ? 'Открыть' : 'Играть');
    }
  }

  // --- настройки ----------------------------------------------------------------------

  function setSetting(key, value) {
    settings = Settings.update(settings, key, value);
    save(KEY_SETTINGS, settings);
    renderSettings();
    applyAudio();
  }

  function renderVolumeHint() {
    $('#volume-hint').hidden = !volumeBlocked;
  }

  function renderSettings() {
    const s = settings;
    document.documentElement.dataset.theme = s.theme;
    $('#set-reopen').checked = s.reopenTabs;
    $('#set-mute-bg').checked = s.muteBackground;
    $('#set-volume').value = s.volume;
    $('#volume-out').textContent = s.volume + '%';
    $('#set-mute').innerHTML = s.muted ? SPEAKER_OFF : SPEAKER;
    $('#set-mute').setAttribute('aria-pressed', String(s.muted));
    $('#set-mute').title = s.muted ? 'Включить звук' : 'Без звука';
    $('.volume').classList.toggle('muted', s.muted);
    for (const b of document.querySelectorAll('#set-theme button')) b.classList.toggle('on', b.dataset.themeValue === s.theme);
    renderVolumeHint();
  }

  const CLEAR_HINT = 'Рекорды и сохранения выбранной игры будут стёрты. Остальные игры это не затронет.';

  function openSettings() { $('#clear-hint').textContent = CLEAR_HINT; $('#settings').hidden = false; $('#settings .close').focus(); }
  function closeSettings() { $('#settings').hidden = true; }

  // Стереть данные одной игры: её ключи localStorage и базы IndexedDB (поле storage).
  async function clearData(id) {
    const g = byId.get(id);
    if (tabs.open.includes(id)) close(id);
    const prefixes = g.storage.filter((p) => !p.startsWith('idb:'));
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (prefixes.some((p) => k.startsWith(p))) keys.push(k);
      }
      for (const k of keys) localStorage.removeItem(k);
    } catch { /* хранилище закрыто */ }
    await Promise.all(g.storage.filter((p) => p.startsWith('idb:')).map((p) => new Promise((resolve) => {
      try {
        const rq = indexedDB.deleteDatabase(p.slice(4));
        rq.onsuccess = rq.onerror = rq.onblocked = () => resolve();
      } catch { resolve(); }
    })));
  }

  function wireSettings() {
    $('#gear').addEventListener('click', openSettings);
    $('#settings').addEventListener('click', (e) => { if (e.target.id === 'settings' || e.target.closest('[data-close]')) closeSettings(); });
    $('#set-reopen').addEventListener('change', (e) => setSetting('reopenTabs', e.target.checked));
    $('#set-mute-bg').addEventListener('change', (e) => setSetting('muteBackground', e.target.checked));
    $('#set-volume').addEventListener('input', (e) => setSetting('volume', Number(e.target.value)));
    $('#set-mute').addEventListener('click', () => setSetting('muted', !settings.muted));
    for (const b of document.querySelectorAll('#set-theme button')) {
      b.addEventListener('click', () => setSetting('theme', b.dataset.themeValue));
    }
    $('#clear-game').replaceChildren(...GAMES.map((g) => el('option', { value: g.id, text: g.name })));
    $('#clear-game').addEventListener('change', () => { $('#clear-hint').textContent = CLEAR_HINT; });
    $('#clear-btn').addEventListener('click', async () => {
      const id = $('#clear-game').value;
      const g = byId.get(id);
      const yes = await ask({
        title: `Стереть данные «${g.name}»?`,
        text: 'Рекорды, сохранения и настройки этой игры пропадут безвозвратно. Если игра открыта, её вкладка закроется. Другие игры это не затронет.',
        ok: 'Стереть',
        cancel: 'Отмена',
      });
      if (!yes) return;
      await clearData(id);
      $('#clear-hint').textContent = `Данные «${g.name}» стёрты.`;
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !$('#settings').hidden && $('#modal').hidden) closeSettings();
    });
  }

  // --- вопрос -------------------------------------------------------------------------

  let modalDone = null;

  // Фокус сразу на «Отмена»: случайный Enter не должен ничего стирать.
  function ask(m) {
    const box = $('#modal');
    $('#modal-title').textContent = m.title;
    $('#modal-text').textContent = m.text;
    const ok = box.querySelector('.ok');
    ok.textContent = m.ok;
    ok.classList.add('danger');
    ok.classList.remove('primary');
    box.querySelector('.cancel').textContent = m.cancel;
    box.hidden = false;
    $('#bar').inert = true;
    box.querySelector('.cancel').focus();
    return new Promise((resolve) => {
      modalDone = (yes) => { box.hidden = true; $('#bar').inert = false; modalDone = null; resolve(yes); };
    });
  }

  function wireModal() {
    const box = $('#modal');
    box.querySelector('.ok').addEventListener('click', () => modalDone && modalDone(true));
    box.querySelector('.cancel').addEventListener('click', () => modalDone && modalDone(false));
    box.addEventListener('click', (e) => { if (e.target === box && modalDone) modalDone(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modalDone) { e.stopPropagation(); modalDone(false); } }, true);
  }

  // --- запуск -------------------------------------------------------------------------

  renderHome();
  wireSettings();
  wireModal();
  renderSettings();

  $('.tab.home').addEventListener('click', () => activate(Tabs.HOME));
  $('#tabs').addEventListener('scroll', edges);
  window.addEventListener('resize', edges);
  $('#tabs').addEventListener('wheel', (e) => { if (e.deltaY) { e.currentTarget.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
  $('#fullscreen').addEventListener('click', () => {
    const f = frames.get(tabs.active);
    if (f && f.requestFullscreen) f.requestFullscreen().catch(() => {});
  });
  // Вкладку браузера скрыли или свернули окно - активная игра встаёт на паузу.
  document.addEventListener('visibilitychange', () => {
    if (tabs.active === Tabs.HOME) return;
    post(tabs.active, document.hidden ? 'pause' : 'resume');
  });

  // Вкладки прошлого раза открываются как в приложении: видна домашняя или та, что была
  // активной, а остальные игры не грузятся, пока на них не переключились.
  const restored = settings.reopenTabs ? Tabs.restore(load(KEY_TABS), KNOWN) : Tabs.empty();
  setTabs(restored, { persist: false });
  document.body.dataset.ready = '1';
})();
