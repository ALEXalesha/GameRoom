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
const vm = require('vm');
const DATA = require('../../web/_shared/games-data.js');

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

test('таблица игр одна: приложение читает web/_shared/games-data.js', () => {
  assert.equal(Games.GAMES, DATA.GAMES);
  assert.ok(Object.isFrozen(DATA.GAMES) && DATA.GAMES.every((g) => Object.isFrozen(g)), 'таблица не должна меняться на ходу');
});

// Браузерная страница не может прочитать <title> игры (по file:// чужие страницы не
// читаются), поэтому берёт имя из таблицы. Чтобы карточки в приложении и в браузере
// звались одинаково, имя в таблице обязано совпадать с именем из самой страницы.
test('имя в таблице совпадает с именем из страницы - для игр и демо систем', () => {
  for (const g of [...DATA.GAMES, ...DATA.SYSTEMS]) {
    const html = fs.readFileSync(path.join(ROOT, 'web', g.id, 'index.html'), 'utf8');
    assert.equal(g.name, Games.pageName(html), g.id);
  }
  for (const g of Games.catalog(ROOT)) assert.equal(g.name, DATA.GAMES.find((x) => x.id === g.id).name, g.id);
});

test('имя из метки application-name целиком, без неё - из заголовка', () => {
  assert.equal(Games.appName('<meta name="application-name" content="Операция: Периметр">'), 'Операция: Периметр');
  assert.equal(Games.appName("<meta content='Блоки' name='application-name'>"), 'Блоки');
  assert.equal(Games.appName('<meta name="description" content="не то">'), '');
  assert.equal(Games.pageName('<title>Операция: Периметр</title><meta name="application-name" content="Операция: Периметр">'), 'Операция: Периметр');
  assert.equal(Games.pageName('<title>Дино-бег (фан-версия)</title>'), 'Дино-бег');
});

test('приставки хранилища у игр и систем не пересекаются', () => {
  const all = [...DATA.GAMES, ...DATA.SYSTEMS].flatMap((g) => g.storage.map((p) => ({ id: g.id, p })));
  assert.ok(DATA.GAMES.every((g) => g.storage.length > 0));
  for (const a of all) {
    for (const b of all) {
      if (a.id === b.id) continue;
      assert.ok(!a.p.startsWith(b.p) && !b.p.startsWith(a.p), `${a.id} «${a.p}» и ${b.id} «${b.p}»`);
    }
  }
});

// Общие файлы подключаются в браузере обычным <script> без сборки: проверяется, что
// они кладут свои функции в window и не требуют module/require.
test('общие файлы работают и в браузере: window.IGROTEKA_DATA, IgrotekaTabs, IgrotekaSettings', () => {
  const win = {};
  win.self = win;
  const ctx = vm.createContext(win);
  for (const f of ['web/_shared/games-data.js', 'app/tabs.js', 'app/settings.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  }
  assert.deepEqual(JSON.parse(JSON.stringify(win.IGROTEKA_DATA)), JSON.parse(JSON.stringify(DATA)));
  assert.deepEqual(Object.keys(win.IgrotekaTabs).sort(), Object.keys(require('../../app/tabs')).sort());
  assert.deepEqual(Object.keys(win.IgrotekaSettings).sort(), Object.keys(Settings).sort());
  assert.equal(JSON.stringify(win.IgrotekaTabs.closeTab({ open: ['a', 'b'], active: 'a' }, 'a')), JSON.stringify({ open: ['b'], active: 'b' }));
});

test('демо систем: страница и картинка есть, ходить можно в свою папку, _os-shared и папки игр', () => {
  const sys = Games.systemsCatalog(ROOT);
  assert.deepEqual(sys.map((s) => s.id), ['win11_3', 'macos-tahoe', 'ios26', 'oneui7']);
  for (const s of sys) {
    assert.ok(fs.existsSync(s.page), s.page);
    assert.ok(s.style && s.desc && s.system, s.id);
    assert.ok(fs.existsSync(path.join(ROOT, 'app', 'assets', 'thumbs', s.id + '.jpg')), 'нет картинки ' + s.id);
    const page = url(s.page);
    assert.equal(Security.allowRequest(url(path.join(ROOT, 'web', '_os-shared', 'games.js')), s.folders), true);
    assert.equal(Security.allowRequest(url(path.join(ROOT, 'web', 'dino', 'index.html')), s.folders), true);
    assert.equal(Security.navigation(url(path.join(ROOT, 'web', 'tetris', 'index.html')), s.folders), 'allow');
    assert.equal(Security.allowRequest(page, s.folders), true);
    // Чужое демо, другие страницы web/ и сеть - нельзя.
    for (const other of sys) if (other.id !== s.id) assert.equal(Security.allowRequest(url(other.page), s.folders), false, other.id);
    assert.equal(Security.allowRequest(url(path.join(ROOT, 'web', 'python_ide', 'index.html')), s.folders), false);
    assert.equal(Security.allowRequest('https://example.com/', s.folders), false);
  }
  // Одна папка у игры - как раньше, список у демо - то же правило для каждой.
  assert.equal(Security.allowRequest(url(path.join(ROOT, 'web', 'dino', 'index.html')), [folder]), true);
  assert.equal(Security.allowRequest(url(path.join(ROOT, 'web', 'mario', 'index.html')), [folder]), false);
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

test('в сборку попадают только app/, таблица игр, папки игр и демо систем', () => {
  const files = pkg.build.files.filter((f) => !f.startsWith('!'));
  const expected = ['package.json', 'app/**/*', 'web/_shared/games-data.js', ...Games.IDS.map((id) => `web/${id}/**/*`),
    ...Games.SYSTEM_IDS.map((id) => `web/${id}/**/*`), 'web/_os-shared/**/*'];
  assert.deepEqual([...files].sort(), [...expected].sort());
});

test('имя приложения - одно поле productName, версия 1.x', () => {
  assert.equal(typeof pkg.productName, 'string');
  assert.ok(pkg.productName.length > 0);
  assert.equal(require('../../app/product').name, pkg.productName);
  assert.equal(pkg.build.productName, undefined, 'имя не должно дублироваться в build');
  assert.match(pkg.version, /^1\.\d+\.\d+$/);
});
