// Общие помощники проверок: адрес страницы и сбор ошибок консоли.
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const WEB = path.join(__dirname, '..', 'web');

function pages() {
  return fs.readdirSync(WEB).filter((d) => fs.existsSync(path.join(WEB, d, 'index.html'))).sort();
}

function pageUrl(name) {
  return pathToFileURL(path.join(WEB, name, 'index.html')).href;
}

// Открыть страницу и собирать всё, что она роняет: исключения и console.error.
// Внешние запросы (шрифты, CDN) отсекаются: страница обязана работать без сети.
async function open(page, name) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.stack || e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.route(/^https?:\/\//, (route) => route.abort());
  await page.goto(pageUrl(name));
  return errors;
}

module.exports = { WEB, pages, pageUrl, open };
