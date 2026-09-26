// Игры приложения. Порядок - как их назвал владелец; карточки на домашнем экране идут так же.
//
// Имя на карточке и вкладке берётся из <title> самой страницы (без пометки про
// фан-версию), чтобы переименованная игра не расходилась с приложением. `name` здесь -
// запасное, если заголовка нет. Картинка карточки - app/assets/thumbs/<id>.jpg,
// её снимает tools/make-thumbs.js (npm run thumbs).
'use strict';

const fs = require('fs');
const path = require('path');

const GAMES = [
  { id: 'minecraft_clone_3d_1', name: 'Кубический мир', desc: 'Песочница из кубов: копай, строй, мир сохраняется' },
  { id: 'roblox-mini', name: 'Блоксити', desc: 'Город площадок: выбирай место и наряжай своего героя' },
  { id: 'fps_1', name: 'Тактический шутер', desc: 'Тактический шутер от первого лица: раунды, оружие, точность' },
  { id: 'dino', name: 'Дино-бег', desc: 'Беги, прыгай через кактусы и пригибайся от птиц' },
  { id: 'mario', name: 'Прыг-скок', desc: 'Платформер: жуки, ямы, колонны и подарочные блоки' },
  { id: 'horizon_drift_offline', name: 'Horizon Drift', desc: 'Гонки с дрифтом: три трассы и три режима' },
  { id: 'jungle-strike', name: 'Огненные джунгли', desc: 'Аркада-стрелялка: пробейся через джунгли к боссу' },
  { id: 'space_shooter', name: 'Космический стрелок', desc: 'Отбивайся от волн кораблей и астероидов' },
];

const IDS = GAMES.map((g) => g.id);

// «Прыг-скок: мини-платформер (фан-версия, не связана с правообладателем)» -> «Прыг-скок».
// Отрезается пометка в скобках и пояснение после двоеточия или тире.
function shortTitle(html) {
  const m = /<title>([^<]*)<\/title>/i.exec(String(html || ''));
  if (!m) return '';
  let t = m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  t = t.split(/\s\(|:\s|\s[-–—]\s/)[0];
  return t.trim();
}

/** Каталог с путями: папка игры, страница, картинка и имя из заголовка страницы. */
function catalog(root) {
  return GAMES.map((g) => {
    const dir = path.join(root, 'web', g.id);
    const page = path.join(dir, 'index.html');
    let name = '';
    try {
      name = shortTitle(fs.readFileSync(page, 'utf8'));
    } catch {
      /* страницы нет - останется запасное имя */
    }
    return { ...g, name: name || g.name, dir, page };
  });
}

module.exports = { GAMES, IDS, shortTitle, catalog };
