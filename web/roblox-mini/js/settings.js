// Настройки в два уровня, как у настоящей платформы:
//  - настройки платформы (лаунчер): тема, язык, конфиденциальность, уведомления - ключ mix.blox.settings;
//  - настройки в игре (меню места): камера, движение, мышь, графика, звук, статистика - mix.blox.gamesettings.
// Звук и графика «по умолчанию» в лаунчере правят те же значения, что и меню в месте.
'use strict';
(function (B) {
  const PLATFORM_DEFAULTS = {
    theme: 'dark',            // dark | light
    lang: 'ru',               // ru | en
    profileVisible: 'all',    // all | friends | me
    chat: 'all',              // all | off  (off - чат в местах скрыт)
    notifyBadges: true,       // всплывашки о значках
    notifyCurrency: true,     // всплывашки о кубах
    notifyChat: true,         // звук нового сообщения в чате
  };
  const GAME_DEFAULTS = {
    cameraMode: 'classic',    // classic | follow (камера сама заходит за спину)
    view: 'third',            // third | first (от первого лица)
    movementMode: 'keyboard', // keyboard | click (идти туда, куда щёлкнул)
    shiftLock: true,          // разрешён ли Shift-лок
    sens: 1,                  // чувствительность мыши 0.1..4
    sensFirst: 1,             // она же от первого лица
    invert: false,            // перевёрнутая камера по вертикали
    graphicsMode: 'auto',     // auto | manual
    quality: 7,               // 1..10 при manual
    volMaster: 0.8, volMusic: 0.5, volSfx: 0.9,
    perfStats: false,         // fps/мс на экране
  };
  const LIMITS = {
    sens: [0.1, 4], sensFirst: [0.1, 4], quality: [1, 10], volMaster: [0, 1], volMusic: [0, 1], volSfx: [0, 1], bots: [0, 6],
  };
  const ENUMS = {
    theme: ['dark', 'light'], lang: ['ru', 'en'], profileVisible: ['all', 'friends', 'me'], chat: ['all', 'off'],
    cameraMode: ['classic', 'follow'], view: ['third', 'first'], movementMode: ['keyboard', 'click'], graphicsMode: ['auto', 'manual'],
  };

  function sanitize(obj, defs) {
    const out = {};
    for (const k in defs) {
      let v = obj && k in obj ? obj[k] : defs[k];
      if (typeof defs[k] === 'boolean') v = !!v;
      else if (typeof defs[k] === 'number') { v = Number(v); if (!isFinite(v)) v = defs[k]; if (LIMITS[k]) v = B.clamp(v, LIMITS[k][0], LIMITS[k][1]); }
      else if (ENUMS[k] && !ENUMS[k].includes(v)) v = defs[k];
      out[k] = v;
    }
    return out;
  }

  function makeGroup(key, defs, evt) {
    let cache = null;
    const g = {
      DEFAULTS: defs,
      all() { if (!cache) cache = sanitize(B.store.get(key, {}), defs); return cache; },
      get(k) { return g.all()[k]; },
      set(k, v) {
        const cur = Object.assign({}, g.all()); cur[k] = v;
        cache = sanitize(cur, defs);
        B.store.set(key, cache);
        B.emit(evt, { key: k, value: cache[k], all: cache });
        return cache[k];
      },
      reset(keys) {
        const cur = Object.assign({}, g.all());
        for (const k of keys || Object.keys(defs)) cur[k] = defs[k];
        cache = sanitize(cur, defs);
        B.store.set(key, cache);
        B.emit(evt, { key: '*', all: cache });
      },
      reload() { cache = null; return g.all(); },
    };
    return g;
  }

  B.settings = makeGroup('settings', PLATFORM_DEFAULTS, 'settings');
  // Настройки одного места (меню места, раздел «Это место»): ключ mix.blox.place.<id>
  B.placeSettings = (id, defs) => makeGroup('place.' + id, defs, 'placesettings');
  B.gameSettings = makeGroup('gamesettings', GAME_DEFAULTS, 'gamesettings');

  // Уровень качества 1..10, с которым сейчас рисуем: вручную - как выбрано, автоматически - по
  // замеру кадров (B.autoQuality меняет движок).
  B.autoQuality = 7;
  B.effectiveQuality = () => (B.gameSettings.get('graphicsMode') === 'manual' ? B.gameSettings.get('quality') : B.autoQuality);
})(window.Blox);
