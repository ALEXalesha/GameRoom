// Игры приложения. Сама таблица (порядок, имена, описания, клавиши) живёт в
// web/_shared/games-data.js: её же читает браузерная страница «Игротеки» (index.html в
// корне), чтобы карточки в приложении и в браузере не расходились.
//
// Имя на карточке и вкладке берётся из самой страницы игры: <meta name="application-name">,
// а без неё - <title> без пометки про фан-версию. Так переименованная игра не расходится с
// приложением. `name` в таблице - запасное, если в странице нет ни того, ни другого.
// Картинка карточки - app/assets/thumbs/<id>.jpg, её снимает tools/make-thumbs.js
// (npm run thumbs).
// `keys` - клавиши, которые игра забирает себе: пока она активна, оболочка их не трогает
// (перезапуск тогда - Ctrl+R, Ctrl+F5 или меню вкладки).
'use strict';

const fs = require('fs');
const path = require('path');
const DATA = require('../web/_shared/games-data.js');

const GAMES = DATA.GAMES;
const IDS = GAMES.map((g) => g.id);

const unescape = (t) => t.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

// «Прыг-скок: мини-платформер (фан-версия, не связана с правообладателем)» -> «Прыг-скок».
// Отрезается пометка в скобках и пояснение после двоеточия или тире.
function shortTitle(html) {
  const m = /<title>([^<]*)<\/title>/i.exec(String(html || ''));
  if (!m) return '';
  return unescape(m[1]).split(/\s\(|:\s|\s[-–—]\s/)[0].trim();
}

// Имя, которое игра объявляет сама: <meta name="application-name" content="...">.
// Его не режут: «Операция: Периметр» - это имя целиком, а по <title> вышла бы «Операция».
function appName(html) {
  const s = String(html || '');
  const tag = /<meta\b[^>]*\bname\s*=\s*["']application-name["'][^>]*>/i.exec(s);
  if (!tag) return '';
  const c = /\bcontent\s*=\s*"([^"]*)"|\bcontent\s*=\s*'([^']*)'/i.exec(tag[0]);
  return c ? unescape(c[1] ?? c[2]).trim() : '';
}

// Имя игры по её странице: сначала метка, потом заголовок.
function pageName(html) {
  return appName(html) || shortTitle(html);
}

/** Каталог с путями: папка игры, страница, картинка и имя из самой страницы. */
function catalog(root) {
  return GAMES.map((g) => {
    const dir = path.join(root, 'web', g.id);
    const page = path.join(dir, 'index.html');
    let name = '';
    try {
      name = pageName(fs.readFileSync(page, 'utf8'));
    } catch {
      /* страницы нет - останется запасное имя */
    }
    return { ...g, name: name || g.name, dir, page };
  });
}

module.exports = { GAMES, IDS, shortTitle, appName, pageName, catalog };
