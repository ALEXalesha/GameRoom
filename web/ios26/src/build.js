// Сборка web/ios26/index.html из исходников этой папки: node web/ios26/src/build.js
// base.css - стили исходной страницы (с заменой шрифта), extra.css и kit.css - свои дополнения,
// body.html - разметка и сценарий, kit.js - переключатель программ, уведомления, «Файлы» (IndexedDB).
const fs = require('fs');
const path = require('path');
const dir = __dirname;
const read = (f) => fs.existsSync(path.join(dir, f)) ? fs.readFileSync(path.join(dir, f), 'utf8') : '';
const head = '<!DOCTYPE html>\n<html lang="ru">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">\n<title>Телефон «Стекло» (фан-концепт интерфейса, не связан с Microsoft/Apple/Samsung)</title>\n<style>';
let body = read('body.html');
const kit = read('kit.js');
if (kit) body = body.replace('\n</script>\n</body>', '\n' + kit + '\n</script>\n</body>');
// таблица игр «Игротеки» - общая с другими оболочками
body = body.replace("<script>\n'use strict';", "<script src=\"../_os-shared/games.js\"></script>\n<script>\n'use strict';");
const html = head + read('base.css') + read('extra.css') + read('kit.css') + '</style>\n</head>\n' + body;
fs.writeFileSync(path.join(dir, '..', 'index.html'), html);
console.log('index.html:', html.length, 'байт');
