// Настройки приложения: что можно поменять шестерёнкой на домашнем экране.
// normalize - чистая функция: из чего угодно (испорченный файл, старая версия, чужие
// поля) делает правильные настройки, недостающее берёт по умолчанию.
//
// Тот же файл подключает браузерная страница «Игротеки» (index.html в корне) обычным
// тегом <script>: там функции лежат в window.IgrotekaSettings.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.IgrotekaSettings = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULTS = Object.freeze({
    reopenTabs: true,       // при запуске открыть вкладки, которые были открыты
    muteBackground: true,   // вкладка в фоне молчит
    muted: false,           // общий «без звука»
    volume: 80,             // общая громкость, 0..100
    theme: 'dark',          // оформление оболочки: 'dark' | 'light'
  });

  const THEMES = ['dark', 'light'];

  function normalize(raw) {
    const s = raw && typeof raw === 'object' ? raw : {};
    const bool = (k) => (typeof s[k] === 'boolean' ? s[k] : DEFAULTS[k]);
    const vol = Number.isFinite(s.volume) ? Math.round(Math.min(100, Math.max(0, s.volume))) : DEFAULTS.volume;
    return {
      reopenTabs: bool('reopenTabs'),
      muteBackground: bool('muteBackground'),
      muted: bool('muted'),
      volume: vol,
      theme: THEMES.includes(s.theme) ? s.theme : DEFAULTS.theme,
    };
  }

  // Поменять одно поле; неизвестное поле ничего не меняет.
  function update(current, key, value) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULTS, key)) return normalize(current);
    return normalize({ ...current, [key]: value });
  }

  // Молчит ли вкладка: общий «без звука» или фоновая при включённой настройке.
  function isMuted(settings, id, activeId) {
    return settings.muted || (settings.muteBackground && id !== activeId);
  }

  return { DEFAULTS, THEMES, normalize, update, isMuted };
});
