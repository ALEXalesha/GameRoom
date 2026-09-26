// Язык интерфейса: русский (основной) и английский для главных экранов.
// В разметке - data-i18n="ключ" (текст) и data-i18n-ph="ключ" (подсказка в поле).
'use strict';
(function (B) {
  const RU = {
    brand: 'Блоксити', fan: 'фан-концепт, не связан с Roblox Corporation',
    nav_home: 'Главная', nav_places: 'Места', nav_avatar: 'Аватар', nav_catalog: 'Каталог', nav_profile: 'Профиль', nav_settings: 'Настройки',
    search: 'Искать места', hello: 'Привет', continue_row: 'Продолжить игру', recommended: 'Рекомендуем', all_places: 'Все места',
    by: 'от', play: 'Играть', visits: 'посещений', likes: 'нравится', no_votes: 'нет оценок',
    about: 'Описание', stats: 'Статистика', best_results: 'Лучшие результаты', your_best: 'Твой рекорд', your_medal: 'Твоя медаль',
    genre: 'Жанр', max_players: 'Игроков на сервере', created: 'Создано', updated: 'Обновлено', screens: 'Кадры из места',
    back: 'Назад', loading: 'Загрузка', joining: 'Вход на сервер…', cancel: 'Отмена',
    menu: 'Меню', resume: 'Продолжить', reset_char: 'Сбросить персонажа', settings: 'Настройки', leave: 'Выйти из места', help: 'Справка',
    players: 'Игроки', chat_ph: 'Нажми / или Enter, чтобы написать', again: 'Ещё раз', to_launcher: 'В лаунчер',
    save: 'Сохранить', saved: 'Сохранено', revert: 'Отменить', body: 'Тело', clothes: 'Одежда', accessories: 'Аксессуары', faces: 'Лица',
    buy: 'Купить', owned: 'Есть', free: 'Бесплатно', wear: 'Надеть', take_off: 'Снять', not_enough: 'Не хватает кубов',
    badges: 'Значки', about_me: 'О себе', edit: 'Изменить', nickname: 'Ник', display_name: 'Отображаемое имя',
    tab_account: 'Аккаунт', tab_privacy: 'Конфиденциальность', tab_notify: 'Уведомления', tab_look: 'Внешний вид', tab_av: 'Звук и графика',
    theme: 'Тема', theme_dark: 'Тёмная', theme_light: 'Светлая', language: 'Язык', reset_progress: 'Сбросить прогресс',
    reset_confirm: 'Удалить кубы, вещи, рекорды, значки и постройки? Настройки останутся.', yes_reset: 'Да, сбросить',
    defaults: 'Вернуть по умолчанию', currency: 'кубы', balance: 'Баланс',
    completed: 'Пройдено', legend_title: 'Легенда Блоксити!', legend_text: 'Ты прошёл все места платформы. Этот значок есть не у всех.',
    celebrate_ok: 'Ура!', place_count: 'мест', welcome: 'Добро пожаловать в Блоксити',
  };
  const EN = {
    brand: 'Bloxcity', fan: 'fan concept, not affiliated with Roblox Corporation',
    nav_home: 'Home', nav_places: 'Discover', nav_avatar: 'Avatar', nav_catalog: 'Catalog', nav_profile: 'Profile', nav_settings: 'Settings',
    search: 'Search places', hello: 'Hi', continue_row: 'Continue playing', recommended: 'Recommended', all_places: 'All places',
    by: 'by', play: 'Play', visits: 'visits', likes: 'liked', no_votes: 'no ratings',
    about: 'Description', stats: 'Stats', best_results: 'Top results', your_best: 'Your best', your_medal: 'Your medal',
    genre: 'Genre', max_players: 'Server size', created: 'Created', updated: 'Updated', screens: 'Screenshots',
    back: 'Back', loading: 'Loading', joining: 'Joining server…', cancel: 'Cancel',
    menu: 'Menu', resume: 'Resume', reset_char: 'Reset character', settings: 'Settings', leave: 'Leave place', help: 'Help',
    players: 'Players', chat_ph: 'Press / or Enter to chat', again: 'Play again', to_launcher: 'To launcher',
    save: 'Save', saved: 'Saved', revert: 'Revert', body: 'Body', clothes: 'Clothing', accessories: 'Accessories', faces: 'Faces',
    buy: 'Buy', owned: 'Owned', free: 'Free', wear: 'Wear', take_off: 'Take off', not_enough: 'Not enough cubes',
    badges: 'Badges', about_me: 'About me', edit: 'Edit', nickname: 'Username', display_name: 'Display name',
    tab_account: 'Account', tab_privacy: 'Privacy', tab_notify: 'Notifications', tab_look: 'Appearance', tab_av: 'Sound & graphics',
    theme: 'Theme', theme_dark: 'Dark', theme_light: 'Light', language: 'Language', reset_progress: 'Reset progress',
    reset_confirm: 'Delete cubes, items, records, badges and builds? Settings stay.', yes_reset: 'Yes, reset',
    defaults: 'Restore defaults', currency: 'cubes', balance: 'Balance',
    completed: 'Completed', legend_title: 'Bloxcity Legend!', legend_text: 'You completed every place on the platform.',
    celebrate_ok: 'Hooray!', place_count: 'places', welcome: 'Welcome to Bloxcity',
  };
  const DICT = { ru: RU, en: EN };
  B.lang = () => B.settings.get('lang');
  B.t = (k) => (DICT[B.lang()] && DICT[B.lang()][k]) || RU[k] || k;
  B.tn = (obj) => (B.lang() === 'en' && obj.en ? obj.en : obj.name);   // имя вещи/места на текущем языке
  B.applyI18n = function (root) {
    (root || document).querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = B.t(el.dataset.i18n); });
    (root || document).querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = B.t(el.dataset.i18nPh); });
    (root || document).querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = B.t(el.dataset.i18nTitle); });
    document.documentElement.lang = B.lang();
  };
})(window.Blox);
