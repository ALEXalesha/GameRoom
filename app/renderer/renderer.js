// Оболочка: полоса вкладок, домашний экран с карточками, настройки и вопросы.
// Всё состояние живёт в main; сюда оно приходит целиком (shell:state), и страница
// просто перерисовывает то, что изменилось.
'use strict';

const api = window.igroteka;
const $ = (sel) => document.querySelector(sel);

let info = null;          // что не меняется: имя, версия, список игр
let state = null;         // вкладки, полный экран, настройки
const thumb = (id) => `../assets/thumbs/${id}.jpg`;

const SPEAKER = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
const SPEAKER_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

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
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const c of children) if (c) e.append(c);
  return e;
}

// Картинки нет (не сняли) - вместо неё остаётся градиент карточки, без значка «битой».
function img(src, cls) {
  const i = el('img', { class: cls, src, alt: '', draggable: 'false' });
  i.addEventListener('error', () => { i.style.visibility = 'hidden'; });
  return i;
}

const gameById = (id) => info.games.find((g) => g.id === id);

// --- полоса вкладок ------------------------------------------------------------------

function renderTabs() {
  const box = $('#tabs');
  box.replaceChildren(...state.tabs.open.map((id) => {
    const g = gameById(id);
    const close = el('button', { class: 'x', title: 'Закрыть (Ctrl+W)', 'aria-label': 'Закрыть', text: '✕' });
    close.addEventListener('click', (e) => { e.stopPropagation(); api.close(id); });
    const tab = el('div', { class: 'tab game', role: 'tab', 'data-id': id, title: g.name },
      img(thumb(id), 'icon'), el('span', { class: 'name', text: g.name }), close);
    tab.addEventListener('mousedown', (e) => { if (e.button === 1) { e.preventDefault(); api.close(id); } });
    tab.addEventListener('click', () => api.activate(id));
    tab.addEventListener('contextmenu', (e) => { e.preventDefault(); api.menu(id); });
    return tab;
  }));
  for (const t of document.querySelectorAll('.tab')) t.classList.toggle('active', t.dataset.id === state.tabs.active);
  // Вкладок больше, чем влезает: полоса прокручивается, активная всегда на виду.
  // Прокрутка своя, не scrollIntoView: тот сдвигал бы и саму страницу оболочки.
  const act = box.querySelector('.tab.active');
  if (act) {
    if (act.offsetLeft < box.scrollLeft) box.scrollLeft = act.offsetLeft;
    else if (act.offsetLeft + act.offsetWidth > box.scrollLeft + box.clientWidth) box.scrollLeft = act.offsetLeft + act.offsetWidth - box.clientWidth;
  }
  edges();
  // Много вкладок - у домашней остаётся только значок, имя игр важнее.
  $('#bar').classList.toggle('crowded', state.tabs.open.length >= 6);
}

// Какие края полосы вкладок сейчас за краем (для растворения краёв в CSS).
function edges() {
  const box = $('#tabs');
  box.classList.toggle('scrolled-left', box.scrollLeft > 1);
  box.classList.toggle('scrolled-right', box.scrollLeft + box.clientWidth < box.scrollWidth - 1);
}

// --- домашний экран ------------------------------------------------------------------

function renderGrid() {
  $('#grid').style.setProperty('--cols', String(Math.min(5, Math.max(4, Math.ceil(info.games.length / 2)))));
  $('#grid').replaceChildren(...info.games.map((g) => {
    const play = el('button', { class: 'btn primary play', text: 'Играть' });
    // Три части карточки - строки общей сетки (subgrid): имена и описания карточек
    // одного ряда стоят на одной высоте, даже если одно имя переносится.
    const card = el('article', { class: 'card', 'data-id': g.id, tabindex: '0' },
      el('div', { class: 'shot' }, img(thumb(g.id))),
      el('div', { class: 'head' },
        el('h2', {}, el('span', { class: 'open-mark', title: 'Игра открыта во вкладке', hidden: '' }), g.name)),
      el('p', { class: 'desc', text: g.desc }),
      el('div', { class: 'actions' }, play));
    card.addEventListener('click', () => api.open(g.id));
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); api.open(g.id); } });
    return card;
  }));
}

function renderBadges() {
  for (const card of document.querySelectorAll('.card')) {
    const open = state.tabs.open.includes(card.dataset.id);
    card.querySelector('.open-mark').hidden = !open;
    card.classList.toggle('open', open);
    card.querySelector('.play').textContent = open ? 'Вернуться' : 'Играть';
  }
}

// --- настройки -----------------------------------------------------------------------

function renderSettings() {
  const s = state.settings;
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
}

const CLEAR_HINT = 'Рекорды и сохранения выбранной игры будут стёрты. Остальные игры это не затронет.';
function openSettings() { $('#clear-hint').textContent = CLEAR_HINT; $('#settings').hidden = false; $('#settings .close').focus(); }
function closeSettings() { $('#settings').hidden = true; }

function wireSettings() {
  $('#gear').addEventListener('click', openSettings);
  $('#settings').addEventListener('click', (e) => { if (e.target.id === 'settings' || e.target.closest('[data-close]')) closeSettings(); });
  $('#set-reopen').addEventListener('change', (e) => api.setSetting('reopenTabs', e.target.checked));
  $('#set-mute-bg').addEventListener('change', (e) => api.setSetting('muteBackground', e.target.checked));
  $('#set-volume').addEventListener('input', (e) => {
    $('#volume-out').textContent = e.target.value + '%';
    api.setSetting('volume', Number(e.target.value));
  });
  $('#set-mute').addEventListener('click', () => api.setSetting('muted', !state.settings.muted));
  for (const b of document.querySelectorAll('#set-theme button')) {
    b.addEventListener('click', () => api.setSetting('theme', b.dataset.themeValue));
  }
  $('#clear-game').replaceChildren(...info.games.map((g) => el('option', { value: g.id, text: g.name })));
  $('#clear-game').addEventListener('change', () => { $('#clear-hint').textContent = CLEAR_HINT; });
  $('#clear-btn').addEventListener('click', async () => {
    const id = $('#clear-game').value;
    const g = gameById(id);
    const yes = await showLocalModal({
      title: `Стереть данные «${g.name}»?`,
      text: 'Рекорды, сохранения и настройки этой игры пропадут безвозвратно. Если игра открыта, её вкладка закроется. Другие игры это не затронет.',
      ok: 'Стереть',
      cancel: 'Отмена',
      danger: true,
    });
    if (!yes) return;
    await api.clearData(id);
    $('#clear-hint').textContent = `Данные «${g.name}» стёрты.`;
  });
  $('#about-games').replaceChildren(...info.games.map((g) => el('li', { text: g.name })));
  // Какие игры забирают себе F-клавиши - в подсказке клавиш.
  const own = info.games.filter((g) => g.keys.includes('F5')).map((g) => `«${g.name}»`);
  $('#keys-own').textContent = own.length
    ? `В ${own.join(', ')} F5 и другие F-клавиши принадлежат игре: там начать заново - Ctrl+R или правой кнопкой по вкладке.`
    : '';
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#settings').hidden && $('#modal').hidden) closeSettings();
  });
}

// --- вопрос --------------------------------------------------------------------------

let modalDone = null;

// 0 - «да» (ok), 1 - «нет» (cancel). Esc и щелчок мимо - «нет». Фокус сразу на «нет»:
// случайный Enter не должен ничего стирать и никуда уходить.
function showModal(m) {
  const box = $('#modal');
  const shot = $('#modal-shot');
  if (m.snapshot) { shot.src = m.snapshot; shot.hidden = false; } else { shot.removeAttribute('src'); shot.hidden = true; }
  box.classList.toggle('fullscreen', !!m.fullscreen);
  box.classList.toggle('cover', !!m.game && !m.snapshot);
  $('#modal-title').textContent = m.title;
  $('#modal-text').textContent = m.text;
  const ok = box.querySelector('.ok');
  ok.textContent = m.ok;
  ok.classList.toggle('danger', !!m.danger);
  ok.classList.toggle('primary', !m.danger);
  box.querySelector('.cancel').textContent = m.cancel;
  box.hidden = false;
  // Пока вопрос открыт, полоса вкладок не работает: иначе можно было бы уйти на другую
  // вкладку или закрыть ту игру, о которой спрашивают.
  $('#bar').inert = true;
  box.querySelector('.cancel').focus();
  return new Promise((resolve) => {
    modalDone = (index) => { box.hidden = true; $('#bar').inert = false; modalDone = null; resolve(index === 0); };
  });
}

// Свой вопрос оболочки (стереть данные): main знает о нём и на это время не принимает
// команды вкладок и не задаёт своих вопросов.
async function showLocalModal(m) {
  api.modalLocal(true);
  try {
    return await showModal(m);
  } finally {
    api.modalLocal(false);
  }
}

function wireModal() {
  const box = $('#modal');
  box.querySelector('.ok').addEventListener('click', () => modalDone && modalDone(0));
  box.querySelector('.cancel').addEventListener('click', () => modalDone && modalDone(1));
  box.addEventListener('click', (e) => { if ((e.target === box || e.target.id === 'modal-shot') && modalDone) modalDone(1); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modalDone) { e.stopPropagation(); modalDone(1); } }, true);
  api.onModal(async (m) => {
    // Вопрос уже открыт - второй его не подменяет: ответ «нет».
    if (modalDone) { api.modalResult(m.id, 1); return; }
    const yes = await showModal(m);
    api.modalResult(m.id, yes ? 0 : 1);
  });
}

// --- запуск --------------------------------------------------------------------------

function renderCrashed() {
  const id = state.tabs.active;
  const down = (state.crashed || []).includes(id);
  $('#crashed').hidden = !down;
  if (down) $('#crashed-name').textContent = gameById(id).name;
}

function apply(s) {
  state = s;
  renderTabs();
  renderBadges();
  renderSettings();
  renderCrashed();
}

(async () => {
  const init = await api.init();
  info = { product: init.product, games: init.games };
  document.title = init.product.name;
  for (const p of document.querySelectorAll('.product')) p.textContent = init.product.name;
  $('#version').textContent = 'версия ' + init.product.version;
  const n = init.games.length;
  $('#subtitle').textContent = `${n} ${plural(n, 'игра', 'игры', 'игр')} без интернета. У каждой своя вкладка и свои рекорды.`;
  $('.tab.home').addEventListener('click', () => api.activate('home'));
  $('#crashed .btn').addEventListener('click', () => api.revive(state.tabs.active));
  // Колесо мыши над полосой вкладок прокручивает её вбок.
  $('#tabs').addEventListener('scroll', edges);
  window.addEventListener('resize', edges);
  $('#tabs').addEventListener('wheel', (e) => { if (e.deltaY) { e.currentTarget.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
  renderGrid();
  wireSettings();
  wireModal();
  apply({ tabs: init.tabs, fullscreen: init.fullscreen, settings: init.settings });
  api.onState(apply);
  document.body.dataset.ready = '1';
})();
