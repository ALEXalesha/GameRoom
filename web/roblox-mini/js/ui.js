// Общие кусочки интерфейса: строки настроек (переключатель, выбор ‹ ›, ползунок), всплывашки.
'use strict';
(function (B) {
  const U = B.ui = {};
  U.el = function (tag, attrs, html) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) { if (k === 'class') e.className = attrs[k]; else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]); else e.setAttribute(k, attrs[k]); }
    if (html != null) e.innerHTML = html;
    return e;
  };

  const L = (ru, en) => () => (B.lang() === 'en' ? en : ru);
  // Настройки в игре, как в меню места у настоящей платформы
  U.GAME_SCHEMA = [
    { key: 'cameraMode', label: L('Режим камеры', 'Camera Mode'), type: 'choice', options: [['classic', L('Классика', 'Classic')], ['follow', L('Следование', 'Follow')]] },
    { key: 'view', label: L('Вид', 'View'), type: 'choice', options: [['third', L('От третьего лица', 'Third person')], ['first', L('От первого лица', 'First person')]] },
    { key: 'movementMode', label: L('Управление движением', 'Movement Mode'), type: 'choice', options: [['keyboard', L('Клавиатура', 'Keyboard')], ['click', L('Щелчок мышью', 'Click to move')]] },
    { key: 'shiftLock', label: L('Переключатель Shift-лока', 'Shift Lock Switch'), type: 'toggle' },
    { key: 'sens', label: L('Чувствительность мыши', 'Mouse Sensitivity'), type: 'slider', min: 0.1, max: 4, step: 0.1, fmt: (v) => v.toFixed(1) },
    { key: 'sensFirst', label: L('Чувствительность от первого лица', 'First Person Sensitivity'), type: 'slider', min: 0.1, max: 4, step: 0.1, fmt: (v) => v.toFixed(1) },
    { key: 'invert', label: L('Инверсия камеры', 'Camera Inverted'), type: 'toggle' },
    { key: 'graphicsMode', label: L('Режим графики', 'Graphics Mode'), type: 'choice', options: [['auto', L('Автоматически', 'Automatic')], ['manual', L('Вручную', 'Manual')]] },
    { key: 'quality', label: L('Качество графики', 'Graphics Quality'), type: 'slider', min: 1, max: 10, step: 1, fmt: (v) => String(v), disabled: () => B.gameSettings.get('graphicsMode') !== 'manual' },
    { key: 'volMaster', label: L('Общая громкость', 'Master Volume'), type: 'slider', min: 0, max: 1, step: 0.05, fmt: (v) => Math.round(v * 100) + '%' },
    { key: 'volMusic', label: L('Музыка', 'Music'), type: 'slider', min: 0, max: 1, step: 0.05, fmt: (v) => Math.round(v * 100) + '%' },
    { key: 'volSfx', label: L('Эффекты', 'Sound Effects'), type: 'slider', min: 0, max: 1, step: 0.05, fmt: (v) => Math.round(v * 100) + '%' },
    { key: 'perfStats', label: L('Статистика производительности', 'Performance Stats'), type: 'toggle' },
  ];
  U.AV_KEYS = ['graphicsMode', 'quality', 'volMaster', 'volMusic', 'volSfx'];

  // Одна строка настройки. group - B.settings или B.gameSettings
  U.settingRow = function (def, group, onChange) {
    const row = U.el('div', { class: 'set-row', 'data-key': def.key });
    const lab = U.el('div', { class: 'set-label' }, B.esc(def.label()));
    const ctl = U.el('div', { class: 'set-ctl' });
    row.append(lab, ctl);
    const refresh = () => {
      const v = group.get(def.key);
      const dis = def.disabled && def.disabled();
      row.classList.toggle('disabled', !!dis);
      if (def.type === 'toggle') {
        ctl.querySelector('button').classList.toggle('on', !!v);
        ctl.querySelector('button').setAttribute('aria-pressed', String(!!v));
        ctl.querySelector('span').textContent = v ? (B.lang() === 'en' ? 'On' : 'Вкл') : (B.lang() === 'en' ? 'Off' : 'Выкл');
      } else if (def.type === 'choice') {
        const opt = def.options.find((o) => o[0] === v) || def.options[0];
        ctl.querySelector('.choice-val').textContent = opt[1]();
      } else {
        const inp = ctl.querySelector('input');
        inp.value = v; inp.disabled = !!dis;
        ctl.querySelector('.slider-val').textContent = def.fmt(Number(v));
      }
    };
    const set = (v) => { group.set(def.key, v); B.sound.play('click'); refresh(); if (onChange) onChange(def.key, group.get(def.key)); };
    if (def.type === 'toggle') {
      const b = U.el('button', { class: 'toggle', type: 'button', 'aria-label': def.label() }, '<i></i>');
      b.addEventListener('click', () => set(!group.get(def.key)));
      ctl.append(U.el('span', { class: 'toggle-txt' }), b);
    } else if (def.type === 'choice') {
      const step = (d) => {
        const i = def.options.findIndex((o) => o[0] === group.get(def.key));
        set(def.options[(i + d + def.options.length) % def.options.length][0]);
      };
      ctl.append(U.el('button', { class: 'arrow', type: 'button', 'aria-label': '<', onclick: () => step(-1) }, '&#8249;'),
        U.el('span', { class: 'choice-val' }),
        U.el('button', { class: 'arrow', type: 'button', 'aria-label': '>', onclick: () => step(1) }, '&#8250;'));
    } else {
      const inp = U.el('input', { type: 'range', min: def.min, max: def.max, step: def.step, 'aria-label': def.label() });
      inp.addEventListener('input', () => { group.set(def.key, Number(inp.value)); refresh(); if (onChange) onChange(def.key, group.get(def.key)); });
      ctl.append(inp, U.el('span', { class: 'slider-val' }));
    }
    row.refresh = refresh;
    refresh();
    return row;
  };
  U.settingsList = function (container, schema, group, onChange) {
    container.innerHTML = '';
    const rows = schema.map((d) => U.settingRow(d, group, (k, v) => { rows.forEach((r) => r.refresh()); if (onChange) onChange(k, v); }));
    rows.forEach((r) => container.appendChild(r));
    return rows;
  };

  // Всплывашка в углу
  U.toast = function (html, kind, where) {
    const box = document.getElementById(where || 'toasts');
    if (!box) return;
    const t = U.el('div', { class: 'toast ' + (kind || '') }, html);
    box.appendChild(t);
    // не больше четырёх сразу: старые уходят, стопка не закрывает экран
    const live = Array.from(box.children).filter((x) => !x.classList.contains('out'));
    for (const old of live.slice(0, Math.max(0, live.length - 4))) { old.classList.add('out'); setTimeout(() => old.remove(), 400); }
    setTimeout(() => t.classList.add('out'), 3200);
    setTimeout(() => t.remove(), 3700);
  };

  // Значки (SVG): простые свои рисунки
  U.icon = function (name, size = 20) {
    const P = {
      home: 'M4 11 12 4l8 7v9h-5v-6H9v6H4z',
      compass: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm4 6-2.5 5.5L8 16l2.5-5.5z',
      person: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-8 9c0-4 4-6 8-6s8 2 8 6z',
      bag: 'M6 7h12l1 14H5zM9 7a3 3 0 0 1 6 0',
      card: 'M3 5h18v14H3zm3 4h5v5H6zm7 0h5m-5 3h5',
      gear: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm8.5 5.5-1.8.3a7 7 0 0 1-.8 1.9l1 1.5-1.9 1.9-1.5-1a7 7 0 0 1-1.9.8l-.3 1.8h-2.6l-.3-1.8a7 7 0 0 1-1.9-.8l-1.5 1-1.9-1.9 1-1.5a7 7 0 0 1-.8-1.9l-1.8-.3v-2.6l1.8-.3a7 7 0 0 1 .8-1.9l-1-1.5 1.9-1.9 1.5 1a7 7 0 0 1 1.9-.8l.3-1.8h2.6l.3 1.8a7 7 0 0 1 1.9.8l1.5-1 1.9 1.9-1 1.5a7 7 0 0 1 .8 1.9l1.8.3z',
      thumb: 'M7 10v10H3V10zm2 10h8.5a2 2 0 0 0 2-1.6l1.3-6A2 2 0 0 0 18.8 10H14l.8-4a1.6 1.6 0 0 0-3-1L9 10z',
      thumbdown: 'M7 14V4H3v10zm2-10h8.5a2 2 0 0 1 2 1.6l1.3 6A2 2 0 0 1 18.8 14H14l.8 4a1.6 1.6 0 0 1-3 1L9 14z',
      people: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm7 0a3 3 0 1 0 0-6M2 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5zm15.5-5.3c2.5.4 4.5 2 4.5 5.3h-4',
      play: 'M7 4v16l13-8z',
      chat: 'M4 4h16v11H9l-5 4z',
      search: 'M10.5 3a7.5 7.5 0 1 0 4.6 13.4L20 21.3l1.3-1.3-4.9-4.9A7.5 7.5 0 0 0 10.5 3zm0 2a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11z',
      back: 'M15 4 7 12l8 8',
      trophy: 'M7 3h10v5a5 5 0 0 1-10 0zM4 4h3v3a3 3 0 0 1-3-3zm16 0h-3v3a3 3 0 0 0 3-3zM10 14h4v3h3v3H7v-3h3z',
      pencil: 'M4 20h4L19 9l-4-4L4 16zm11-15 4 4',
      close: 'M5 5l14 14M19 5 5 19',
    };
    const stroke = ['back', 'close', 'bag'].includes(name);
    return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><path d="${P[name] || ''}" ${stroke ? 'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"' : 'fill="currentColor"'}/></svg>`;
  };
  // Куб - значок валюты
  U.cube = (size = 16) => `<svg class="cube-ic" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 21 7v10l-9 5-9-5V7z" fill="#ffc21a"/><path d="M12 12 21 7v10l-9 5z" fill="#e0a000"/><path d="M12 12 3 7l9-5 9 5z" fill="#ffe27a"/></svg>`;
  // Логотип Блоксити: три кубика лесенкой
  U.logo = (size = 28) => `<svg class="logo-ic" width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true"><rect x="2" y="16" width="13" height="13" rx="3" fill="#3fd0c4"/><rect x="17" y="16" width="13" height="13" rx="3" fill="#ff9d3b"/><rect x="9.5" y="2" width="13" height="13" rx="3" fill="#ff5c5c"/><circle cx="16" cy="8.5" r="2.4" fill="#fff" opacity=".85"/><circle cx="8.5" cy="22.5" r="2.4" fill="#fff" opacity=".85"/><circle cx="23.5" cy="22.5" r="2.4" fill="#fff" opacity=".85"/></svg>`;
  U.medal = (m, size = 22) => {
    if (!m) return '';
    const c = { gold: ['#ffc21a', '#e09a00'], silver: ['#dfe3ea', '#9aa3b2'], bronze: ['#e6a063', '#a8622f'] }[m];
    return `<svg class="medal-ic" width="${size}" height="${size}" viewBox="0 0 24 24" aria-label="${m}"><path d="M7 2h4l2 6H9zM13 2h4l-2 6h-4z" fill="#d62d2d"/><circle cx="12" cy="15" r="7" fill="${c[0]}" stroke="${c[1]}" stroke-width="2"/><path d="m12 11 1.2 2.5 2.7.3-2 1.9.5 2.7-2.4-1.3-2.4 1.3.5-2.7-2-1.9 2.7-.3z" fill="${c[1]}"/></svg>`;
  };
  U.medalName = (m) => (B.lang() === 'en' ? { gold: 'Gold', silver: 'Silver', bronze: 'Bronze' } : { gold: 'Золото', silver: 'Серебро', bronze: 'Бронза' })[m] || (B.lang() === 'en' ? 'No medal' : 'Без медали');
})(window.Blox);
