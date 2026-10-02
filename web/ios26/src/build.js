// Сборка web/ios26/index.html из исходников этой папки: node web/ios26/src/build.js
// base.css - стили исходной страницы (с заменой шрифта), extra.css и kit.css - свои дополнения,
// body.html - разметка и сценарий, kit.js - переключатель программ, уведомления, «Файлы» (IndexedDB).
// Вид iOS 26: glass.css - стили, glass.js - Жидкое стекло (техника LiquidGlass), wall.js - обои на холсте,
// look.js - где стекло, часы блокировки, пружинное раскрытие программ, «Поиск».
const fs = require('fs');
const path = require('path');
const dir = __dirname;
const read = (f) => fs.existsSync(path.join(dir, f)) ? fs.readFileSync(path.join(dir, f), 'utf8') : '';
const head = '<!DOCTYPE html>\n<html lang="ru">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">\n<title>Телефон «Стекло» (фан-концепт интерфейса, не связан с Microsoft/Apple/Samsung)</title>\n<style>';
let body = read('body.html');
const kit = ['kit.js', 'glass.js', 'wall.js', 'look.js'].map(read).filter(Boolean).join('\n');
// концы строк любые (\n или \r\n при autocrlf): иначе сценарии молча не попадают в сборку
if (kit) body = body.replace(/\r?\n<\/script>\r?\n<\/body>/, (m) => m.replace('</script>', kit + '\n</script>'));
// таблица игр «Игротеки» - общая с другими оболочками
body = body.replace(/<script>(\r?\n)'use strict';/, (m, nl) => '<script src="../_os-shared/games.js"></script>' + nl + m);
const html = head + read('base.css') + read('extra.css') + read('kit.css') + read('glass.css') + '</style>\n</head>\n' + body;
fs.writeFileSync(path.join(dir, '..', 'index.html'), html);
console.log('index.html:', html.length, 'байт');
