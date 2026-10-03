// Игры «Игротеки» - одна таблица для приложения на Electron (app/games.js читает её через
// require) и для браузерной страницы (index.html в корне подключает её тегом <script> и
// получает window.IGROTEKA_DATA). Порядок - как назвал владелец; карточки идут так же.
//
// Поля игры:
//   id       - папка игры в web/ (страница web/<id>/index.html, картинка карточки
//              app/assets/thumbs/<id>.jpg - её снимает npm run thumbs);
//   name     - имя на карточке и вкладке. Совпадает с <meta name="application-name">
//              страницы игры (это сверяет закон в tests-app/unit/rules.test.js): приложение
//              читает имя из самой страницы, а браузерная страница берёт его отсюда;
//   desc     - строка под именем на карточке;
//   keys     - клавиши, которые игра забирает себе: пока она активна, приложение их не
//              трогает (перезапуск тогда - Ctrl+R, Ctrl+F5 или меню вкладки);
//   escToGame - Esc перехватывает приложение и отдаёт игре само (событие 'igroteka:esc'),
//              см. app/games.js и app/main.js; браузерной странице поле не нужно;
//   storage  - чем игра пользуется в хранилище браузера: приставки ключей localStorage и
//              базы IndexedDB (с пометкой «idb:»). В приложении у каждой игры свой сеанс, а
//              в браузере все страницы одного сайта делят одно хранилище, поэтому приставки
//              игр не должны пересекаться (закон в tests/weblauncher.spec.js проверяет, что
//              игра пишет только под своими). По ним же браузерная страница стирает данные
//              одной игры.
//
// SYSTEMS - демо интерфейсов в духе настольных и телефонных систем. В приложение они не
// входят, на браузерной странице это отдельный раздел «Демо систем».
(function (root, factory) {
  const data = factory();
  if (typeof module === 'object' && module.exports) module.exports = data;
  else root.IGROTEKA_DATA = data;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const GAMES = [
    { id: 'minecraft_clone_3d_1', name: 'Кубический мир', desc: 'Песочница из кубов: копай, строй, мир сохраняется', keys: ['F1', 'F2', 'F3', 'F5'], escToGame: true, storage: ['idb:cubeworld', 'cw2_', 'cubeworld_'] },
    { id: 'roblox-mini', name: 'Блоксити', desc: 'Город площадок: выбирай место и наряжай своего героя', storage: ['mix.blox.'] },
    { id: 'fps_1', name: 'Операция: Периметр', desc: 'Тактический шутер от первого лица: раунды, оружие, точность', storage: ['mix.tactical.'] },
    { id: 'dino', name: 'Дино-бег', desc: 'Беги, прыгай через кактусы и пригибайся от птиц', storage: ['dino:'] },
    { id: 'mario', name: 'Прыг-скок', desc: 'Платформер: жуки, ямы, колонны и подарочные блоки', storage: ['jumper:'] },
    { id: 'horizon_drift_offline', name: 'Horizon Drift', desc: 'Гонки с дрифтом: три трассы и три режима', storage: ['mix.drift.'] },
    { id: 'jungle-strike', name: 'Огненные джунгли', desc: 'Аркада-стрелялка: пробейся через джунгли к боссу', storage: ['jungle:'] },
    { id: 'space_shooter', name: 'Космический стрелок', desc: 'Отбивайся от волн кораблей и астероидов', storage: ['space:'] },
    // Добавлены 27.09.2026 по выбору владельца; описания временные, их уточнят после
    // слияния доработанных игр.
    { id: 'tetris', name: 'Блоки', desc: 'Падающие фигуры: собирай ряды, держи запас, крути фигуры', storage: ['blocks:'] },
    { id: 'sudoku', name: 'Судоку', desc: 'Судоку четырёх уровней с подсказками, паузой и рекордами', storage: ['sudoku:'] },
  ];

  // style - на что похоже демо: это попадает в подпись «демо в стиле ...».
  const SYSTEMS = [
    { id: 'win11_3', name: 'Win-подобная оболочка', desc: 'Рабочий стол: окна, «Пуск», свои программы и папка «Игры»', style: 'Windows 11', storage: ['idb:win11_3', 'win11_3.'] },
    { id: 'macos-tahoe', name: 'Тахо', desc: 'Стекло, Dock, Mission Control, Launchpad и папка «Игры»', style: 'macOS', storage: ['idb:macos-tahoe', 'macos-tahoe.'] },
    { id: 'ios26', name: 'Телефон «Стекло»', desc: 'Телефон: стеклянные значки, уведомления, переключатель и игры', style: 'iOS', storage: ['idb:ios26', 'ios26.'] },
    { id: 'oneui7', name: 'Телефон «Волна»', desc: 'Телефон: шторка, недавние приложения, свои файлы и игры', style: 'One UI', storage: ['idb:oneui7', 'oneui7.'] },
  ];

  for (const g of GAMES) { g.keys = g.keys || []; Object.freeze(g.keys); Object.freeze(g.storage); Object.freeze(g); }
  for (const s of SYSTEMS) { Object.freeze(s.storage); Object.freeze(s); }
  return Object.freeze({ GAMES: Object.freeze(GAMES), SYSTEMS: Object.freeze(SYSTEMS) });
});
