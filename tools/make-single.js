#!/usr/bin/env node
// Игротека одним файлом: dist/igroteka-single.html.
// Внутрь вкладываются домашняя страница, все игры и демо систем из web/_shared/games-data.js,
// их скрипты, стили, значки и превью карточек. Сети и соседних файлов файл не требует.
// Как это работает: каждая страница игры лежит строкой в window.__IGRO.pages, а рамки
// <iframe>, которые просят web/<id>/index.html или ../<id>/index.html, получают её через
// srcdoc. Так работают и вкладки Игротеки, и окна игр внутри демо систем. Большие одинаковые
// скрипты (three.min.js в четырёх играх) хранятся один раз.
// Запуск: node tools/make-single.js
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist', 'igroteka-single.html');
const SHARED_MIN = 20000;          // скрипты длиннее этого хранятся один раз
const shared = {};                 // хэш -> текст скрипта

const read = (p) => fs.readFileSync(p, 'utf8');
const isLocal = (u) => !/^(?:[a-z]+:|\/\/|#)/i.test(u);
const MIME = { '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon' };
function dataUri(p) {
  const mime = MIME[path.extname(p).toLowerCase()];
  if (!mime) throw new Error('неизвестный тип файла: ' + p);
  return `data:${mime};base64,${fs.readFileSync(p).toString('base64')}`;
}
const attr = (tag, name) => { const m = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i').exec(tag); return m && m[1]; };
const safeScript = (s) => s.replace(/<\/script/gi, '<\\/script');

// Подмена рамок: страница из реестра вместо пути на диске. Работает и на домашней странице,
// и внутри каждой вложенной страницы (окна игр в демо систем).
const SHIM = `(function(){var T;try{T=window.top.__IGRO}catch(e){}if(!T)return;
function key(u){var m=/(?:^|\\/)([\\w-]+)\\/index\\.html(?:[?#].*)?$/.exec(String(u));return m&&T.pages[m[1]]?m[1]:null}
function fill(f,u){var k=key(u);if(!k)return false;sa.call(f,'data-igro',k);f.removeAttribute('src');f.srcdoc=T.build(k);return true}
var P=HTMLIFrameElement.prototype,d=Object.getOwnPropertyDescriptor(P,'src'),sa=Element.prototype.setAttribute;
Object.defineProperty(P,'src',{configurable:true,enumerable:true,get:function(){return d.get.call(this)},set:function(v){if(!fill(this,v))d.set.call(this,v)}});
Element.prototype.setAttribute=function(n,v){if(this instanceof HTMLIFrameElement&&String(n).toLowerCase()==='src'&&fill(this,v))return;return sa.call(this,n,v)};
function scan(n){if(n.nodeType!==1)return;var l=n.tagName==='IFRAME'?[n]:n.querySelectorAll('iframe[src]');for(var i=0;i<l.length;i++){var s=l[i].getAttribute('src');if(s)fill(l[i],s)}}
new MutationObserver(function(ms){ms.forEach(function(m){m.addedNodes.forEach(scan)})}).observe(document.documentElement,{childList:true,subtree:true});})();`;

// Вложить в HTML всё, на что он ссылается: скрипты, стили, картинки.
// dedupe: большие скрипты заменяются меткой /*@igro:хэш*/, текст уходит в shared.
function inlineHtml(file, dedupe) {
  const dir = path.dirname(file);
  let html = read(file);
  html = html.replace(/<script\b([^>]*)>\s*<\/script>/gi, (tag, attrs) => {
    const src = attr(tag, 'src');
    if (!src || !isLocal(src)) return tag;
    const sp = path.join(dir, src.split(/[?#]/)[0]);
    if (!fs.existsSync(sp)) return tag;      // строка внутри кода страницы, а не настоящий тег
    const code = read(sp);
    const rest = attrs.replace(/\s*\bsrc\s*=\s*"[^"]*"/i, '');
    if (dedupe && code.length > SHARED_MIN) {
      const h = crypto.createHash('sha1').update(code).digest('hex').slice(0, 12);
      shared[h] = code;
      return `<script${rest}>/*@igro:${h}*/</script>`;
    }
    return `<script${rest}>${safeScript(code)}</script>`;
  });
  html = html.replace(/<link\b[^>]*>/gi, (tag) => {
    const href = attr(tag, 'href');
    const rel = (attr(tag, 'rel') || '').toLowerCase();
    if (!href || !isLocal(href)) return tag;
    const p = path.join(dir, href.split(/[?#]/)[0]);
    if (!fs.existsSync(p)) return tag;
    if (rel === 'stylesheet') {
      const css = read(p);
      if (/url\(\s*['"]?(?![a-z]+:|#)/i.test(css)) throw new Error('в стилях есть относительный url(): ' + p);
      return `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>`;
    }
    if (rel.includes('icon')) return tag.replace(href, dataUri(p));
    return tag;
  });
  html = html.replace(/<img\b[^>]*>/gi, (tag) => {
    const src = attr(tag, 'src');
    const p = src && isLocal(src) && path.join(dir, src);
    return p && fs.existsSync(p) ? tag.replace(src, dataUri(p)) : tag;
  });
  return html;
}

// Подмена рамок должна сработать раньше скриптов страницы.
const withShim = (html) => html.replace(/<head([^>]*)>/i, (m) => `${m}<script>${SHIM}</script>`);

function main() {
  const gamesSrc = read(path.join(ROOT, 'web/_shared/games-data.js'));
  const ids = [...gamesSrc.matchAll(/\bid:\s*'([^']+)'/g)].map((m) => m[1]);
  const pages = {};
  for (const id of ids) {
    const file = path.join(ROOT, 'web', id, 'index.html');
    if (!fs.existsSync(file)) throw new Error('нет страницы игры: ' + file);
    pages[id] = withShim(inlineHtml(file, true));
  }
  const thumbs = {};
  for (const id of ids) {
    const p = path.join(ROOT, 'app/assets/thumbs', id + '.jpg');
    if (fs.existsSync(p)) thumbs[id] = dataUri(p);
  }

  let home = inlineHtml(path.join(ROOT, 'index.html'), false);
  const thumbLine = 'const thumb = (id) => `app/assets/thumbs/${id}.jpg`;';
  if (!home.includes(thumbLine)) throw new Error('launcher.js: не найдена строка thumb(), обнови сборщик');
  home = home.replace(thumbLine, 'const thumb = (id) => (window.__IGRO.thumbs[id] || `app/assets/thumbs/${id}.jpg`);');

  // Строки страниц внутри <script>: </script> и <!-- не должны закрыть или сломать тег.
  const lit = (v) => JSON.stringify(v).replace(/<\//g, '<\\/').replace(/<!--/g, '<\\!--');
  const data = `window.__IGRO={pages:${lit(pages)},shared:${lit(shared)},thumbs:${lit(thumbs)},
build:function(k){var s=this.shared;return this.pages[k].replace(/\\/\\*@igro:([0-9a-f]+)\\*\\//g,function(m,h){return s[h].replace(/<\\/script/gi,'<\\\\/script')})}};`;
  home = home.replace(/<head([^>]*)>/i, (m) => `${m}<script>${data}</script><script>${SHIM}</script>`);

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, home);
  const mb = (fs.statSync(OUT).size / 1048576).toFixed(1);
  console.log(`${path.relative(ROOT, OUT)}: ${mb} МБ, страниц ${ids.length}, общих скриптов ${Object.keys(shared).length}`);
}

main();
