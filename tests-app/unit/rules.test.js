// Законы настроек, адресов и каталога игр. Чистые функции, Electron не нужен.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const Settings = require('../../app/settings');
const Security = require('../../app/security');
const Games = require('../../app/games');
const pkg = require('../../package.json');

const ROOT = path.join(__dirname, '..', '..');

// --- настройки ---

test('настройки из мусора - по умолчанию, лишние поля выбрасываются', () => {
  for (const junk of [null, undefined, 'x', 5, [], { theme: 'purple', volume: 'громко', muted: 'да', extra: 1 }]) {
    assert.deepEqual(Settings.normalize(junk), { ...Settings.DEFAULTS });
  }
});

test('громкость зажата в 0..100 и целая', () => {
  assert.equal(Settings.normalize({ volume: 150 }).volume, 100);
  assert.equal(Settings.normalize({ volume: -3 }).volume, 0);
  assert.equal(Settings.normalize({ volume: 33.6 }).volume, 34);
  assert.equal(Settings.normalize({ volume: NaN }).volume, Settings.DEFAULTS.volume);
});

test('update меняет одно поле, неизвестное поле ничего не меняет', () => {
  const s = Settings.normalize(null);
  assert.equal(Settings.update(s, 'theme', 'light').theme, 'light');
  assert.deepEqual(Settings.update(s, 'hack', 1), s);
});

test('фоновая вкладка молчит, активная звучит; общий «без звука» глушит всех', () => {
  const s = Settings.normalize(null);
  assert.equal(Settings.isMuted(s, 'a', 'a'), false);
  assert.equal(Settings.isMuted(s, 'b', 'a'), true);
  assert.equal(Settings.isMuted({ ...s, muteBackground: false }, 'b', 'a'), false);
  assert.equal(Settings.isMuted({ ...s, muted: true }, 'a', 'a'), true);
});

// --- адреса ---

const folder = path.join(ROOT, 'web', 'dino');
const url = (p) => pathToFileURL(p).href;

test('запросы: своя папка - да, чужая папка и сеть - нет', () => {
  assert.equal(Security.allowRequest(url(path.join(folder, 'index.html')), folder), true);
  assert.equal(Security.allowRequest(url(path.join(folder, 'vendor', 'x.js')), folder), true);
  assert.equal(Security.allowRequest(url(path.join(ROOT, 'web', 'mario', 'index.html')), folder), false);
  assert.equal(Security.allowRequest(url(path.join(ROOT, 'web', 'dino-evil', 'x.js')), folder), false);
  assert.equal(Security.allowRequest(url(path.join(folder, '..', 'mario', 'index.html')), folder), false);
  assert.equal(Security.allowRequest('file:///C:/Windows/win.ini', folder), false);
  for (const net of ['https://example.com/', 'http://127.0.0.1:8080/x', 'ws://localhost/', 'wss://a.b/', 'ftp://a/']) {
    assert.equal(Security.allowRequest(net, folder), false, net);
  }
  assert.equal(Security.allowRequest('data:text/plain,1', folder), true);
  assert.equal(Security.allowRequest('blob:file:///abc', folder), true);
  assert.equal(Security.allowRequest('не адрес', folder), false);
});

test('в Windows регистр букв пути не важен', { skip: process.platform !== 'win32' }, () => {
  assert.equal(Security.allowRequest(url(path.join(folder, 'index.html')).toUpperCase().replace('FILE:', 'file:'), folder), true);
});

test('переходы: своя папка остаётся, http(s) - наружу через вопрос, остальное нельзя', () => {
  assert.equal(Security.navigation(url(path.join(folder, 'index.html')) + '?seed=3', folder), 'allow');
  assert.equal(Security.navigation('https://example.com/', folder), 'external');
  assert.equal(Security.navigation('http://example.com/', folder), 'external');
  assert.equal(Security.navigation(url(path.join(ROOT, 'web', 'mario', 'index.html')), folder), 'block');
  assert.equal(Security.navigation('javascript:alert(1)', folder), 'block');
  assert.equal(Security.navigation('data:text/html,<b>x</b>', folder), 'block');
  assert.equal(Security.navigation('mailto:a@b.c', folder), 'block');
  assert.equal(Security.navigation('about:blank', folder), 'allow');
});

// --- каталог игр ---

test('десять игр владельца, у каждой есть страница, описание и картинка карточки', () => {
  assert.deepEqual(Games.IDS, ['minecraft_clone_3d_1', 'roblox-mini', 'fps_1', 'dino', 'mario', 'horizon_drift_offline', 'jungle-strike', 'space_shooter', 'tetris', 'sudoku']);
  for (const g of Games.catalog(ROOT)) {
    assert.ok(fs.existsSync(g.page), g.page);
    assert.ok(g.name && g.desc, g.id);
    assert.ok(fs.existsSync(path.join(ROOT, 'app', 'assets', 'thumbs', g.id + '.jpg')), 'нет картинки ' + g.id);
  }
});

test('имя из заголовка: без пометки о фан-версии и без пояснений', () => {
  const t = (s) => Games.shortTitle(`<title>${s}</title>`);
  assert.equal(t('Прыг-скок: мини-платформер (фан-версия, не связана с правообладателем)'), 'Прыг-скок');
  assert.equal(t('Horizon Drift (фан-версия)'), 'Horizon Drift');
  assert.equal(t('Тир 3D'), 'Тир 3D');
  assert.equal(t('Дино-бег - аркада'), 'Дино-бег');
  assert.equal(t('Дино-бег'), 'Дино-бег');
  assert.equal(Games.shortTitle('<p>нет заголовка</p>'), '');
});

// --- сборка ---

test('в сборку попадают только app/ и папки игр каталога', () => {
  const files = pkg.build.files.filter((f) => !f.startsWith('!'));
  const expected = ['package.json', 'app/**/*', ...Games.IDS.map((id) => `web/${id}/**/*`)];
  assert.deepEqual([...files].sort(), [...expected].sort());
});

test('имя приложения - одно поле productName, версия 1.x', () => {
  assert.equal(typeof pkg.productName, 'string');
  assert.ok(pkg.productName.length > 0);
  assert.equal(require('../../app/product').name, pkg.productName);
  assert.equal(pkg.build.productName, undefined, 'имя не должно дублироваться в build');
  assert.match(pkg.version, /^1\.\d+\.\d+$/);
});
