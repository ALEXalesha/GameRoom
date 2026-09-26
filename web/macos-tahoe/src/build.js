// Сборка web/macos-tahoe/index.html из исходников этой папки: node web/macos-tahoe/src/build.js
const fs = require('fs');
const path = require('path');
const dir = __dirname;
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
const html = '<!DOCTYPE html>\n<html lang="ru">\n<head>\n<meta charset="utf-8">\n' +
  '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
  '<meta name="description" content="Фан-концепт интерфейса, не связан с Microsoft/Apple/Samsung. Собрано из src/ скриптом src/build.js - правьте исходники.">\n' +
  '<title>Тахо: оболочка в духе настольных систем (фан-концепт интерфейса, не связан с Microsoft/Apple/Samsung)</title>\n' +
  '<style>\n' + read('style.css') + '\n</style>\n</head>\n<body data-theme="light">\n' +
  read('markup.html') + '\n<script>\n' + read('icons.js') + '\n' + read('core.js') + '\n' + read('apps.js') + '\n</script>\n</body>\n</html>\n';
fs.writeFileSync(path.join(dir, '..', 'index.html'), html);
console.log('index.html:', html.length, 'байт');
