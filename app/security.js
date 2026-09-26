// Куда странице можно ходить. Чистые функции без Electron, их проверяют обычные тесты.
//
// Игры работают без сети и целиком лежат в своей папке. Поэтому:
//  - запросы (скрипты, картинки, fetch) - только файлы своей папки, data: и blob:;
//    любой http(s), ws(s) и файл из чужой папки отменяется;
//  - переход страницы - только внутри своей папки. Ссылка на http(s) не открывается
//    в окне игры, а уходит в системный браузер после вопроса пользователю.
'use strict';

const path = require('path');
const { fileURLToPath } = require('url');

function parse(raw) {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

// Лежит ли файл по адресу file:// внутри папки (или это сама папка).
function insideFolder(u, folder) {
  let p;
  try {
    p = fileURLToPath(u);
  } catch {
    return false; // закодированный разделитель и прочие странные адреса
  }
  const norm = (x) => {
    const r = path.resolve(x);
    return process.platform === 'win32' ? r.toLowerCase() : r;
  };
  const rel = path.relative(norm(folder), norm(p));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** Запрос за ресурсом: true - пропустить, false - отменить. */
function allowRequest(raw, folder) {
  const u = parse(raw);
  if (!u) return false;
  switch (u.protocol) {
    case 'file:': return insideFolder(u, folder);
    case 'data:':
    case 'blob:':
    case 'devtools:':
      return true;
    default:
      return false;
  }
}

/**
 * Переход страницы (ссылка, location, window.open):
 *  'allow'    - своя папка, остаёмся в окне;
 *  'external' - http(s), спросить и открыть в системном браузере;
 *  'block'    - всё остальное, молча не пускать.
 */
function navigation(raw, folder) {
  const u = parse(raw);
  if (!u) return 'block';
  if (u.protocol === 'http:' || u.protocol === 'https:') return 'external';
  if (u.protocol === 'file:' && insideFolder(u, folder)) return 'allow';
  // Пустая рамка (about:blank, about:srcdoc) ничего не грузит - её можно.
  if (u.protocol === 'about:' && (u.pathname === 'blank' || u.pathname === 'srcdoc')) return 'allow';
  return 'block';
}

module.exports = { allowRequest, navigation, insideFolder };
