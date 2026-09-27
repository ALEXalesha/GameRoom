// Названия игр из самих игр: node web/_os-shared/build-games.js
// Читает <meta name="application-name" content="..."> в ../<dir>/index.html и переписывает title в games.js.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const file = path.join(__dirname, 'games.js');
let src = fs.readFileSync(file, 'utf8');
const ctx = { window: {} };
vm.runInNewContext(src, ctx);
const missing = [];
for (const g of ctx.window.OS_GAMES) {
  const page = path.join(__dirname, '..', g.dir, 'index.html');
  const html = fs.existsSync(page) ? fs.readFileSync(page, 'utf8') : '';
  const m = /<meta\s+name=["']application-name["']\s+content=["']([^"']+)["']/i.exec(html);
  if (!m) { missing.push(g.dir); continue; }
  const marker = "dir: '" + g.dir + "', title: '";
  const at = src.indexOf(marker);
  if (at < 0) continue;
  const start = at + marker.length, end = src.indexOf("'", start);
  src = src.slice(0, start) + m[1].split("'").join('’') + src.slice(end);
}
fs.writeFileSync(file, src);
console.log(missing.length ? 'Нет <meta name="application-name"> в: ' + missing.join(', ') + ' - названия оставлены из таблицы' : 'Все названия взяты из игр');
