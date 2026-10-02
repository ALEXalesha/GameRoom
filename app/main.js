// Главный процесс: окно с полосой вкладок и по одной веб-странице (WebContentsView) на
// каждую открытую игру.
//
// Устройство:
//  - окно показывает оболочку (app/renderer): полосу вкладок и домашний экран с карточками;
//  - игра живёт в своём WebContentsView под полосой, со СВОИМ сеансом persist:<игра>:
//    localStorage и IndexedDB одной игры не видны другой и переживают перезапуск;
//  - неактивные вкладки скрыты (страница получает visibilitychange и перестаёт получать
//    кадры) и молчат (setAudioMuted);
//  - вкладка создаётся при первом показе: восстановленные при запуске игры не грузятся,
//    пока на них не переключились;
//  - вопросы (перезапуск, внешняя ссылка) рисует оболочка поверх снимка игры: пока вопрос
//    открыт, игра скрыта и стоит.
'use strict';

const { app, BrowserWindow, WebContentsView, session, ipcMain, shell, screen, Menu, nativeTheme } = require('electron');
const path = require('path');
const PRODUCT = require('./product');
const Tabs = require('./tabs');
const Settings = require('./settings');
const Security = require('./security');
const WindowState = require('./window-state');
const { catalog } = require('./games');

const APP_DIR = __dirname;
const ROOT = path.join(__dirname, '..');
const BAR_H = 40; // высота полосы вкладок, она же высота кнопок окна
const SIZE = { width: 1280, height: 800, minWidth: 800, minHeight: 560 };
const THEMES = {
  dark: { bg: '#110e20', symbol: '#f4f4f8' },
  light: { bg: '#eceaf6', symbol: '#1d1b2e' },
};
// Режим проверок (IGROTEKA_TEST=1: его ставят tests-app и скрипты tools/). Окно не должно
// мешать человеку за этим компьютером: оно стоит за пределами экранов, не берёт фокус и
// не видно в панели задач, игры не могут захватить мышь, а «развернуть» и «на весь
// экран» только отмечаются, но не растягивают окно на настоящий монитор. Чтобы окно за
// экраном всё равно рисовалось, Windows не должна считать его перекрытым.
const TEST = process.env.IGROTEKA_TEST === '1';
const TEST_AREA = { x: -6000, y: 0, width: 1920, height: 1080 };
if (TEST) app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
let testMaximized = false;
let testFullScreen = false;

// Что странице игры можно спросить у приложения: захват мыши и полный экран.
const GAME_PERMISSIONS = new Set(TEST ? ['fullscreen'] : ['pointerLock', 'fullscreen']);

// Папка данных не зависит от имени приложения (см. product.js). Проверки и кадры для
// README запускают приложение со своей папкой через --user-data-dir.
if (app.commandLine.hasSwitch('user-data-dir')) {
  app.setPath('userData', app.commandLine.getSwitchValue('user-data-dir'));
} else {
  app.setPath('userData', path.join(app.getPath('appData'), PRODUCT.dataFolder));
}
app.setName(PRODUCT.name);

const file = (name) => path.join(app.getPath('userData'), name);
const games = catalog(ROOT);
const byId = new Map(games.map((g) => [g.id, g]));
const IDS = games.map((g) => g.id);

let win = null;
let settings = Settings.normalize(null);
let tabs = Tabs.empty();
let fullscreen = false;
let modal = null;
let modalSeq = 0;
let localModal = false;         // вопрос, который оболочка задала сама (стереть данные)
const crashes = new Map();      // id игры -> сбоев подряд
const crashed = new Set();      // игры, которые упали больше CRASH_LIMIT раз подряд
const CRASH_LIMIT = 3;
const LOG_LIMIT = 100;
const views = new Map();       // id игры -> WebContentsView
const errors = {};             // id игры -> ошибки консоли (для проверок)
const blocked = [];            // отменённые запросы (для проверок)
const guardedSessions = new Set();

// Журналы для проверок держат только последние записи: страница, которая сыплет ошибками
// часами, не должна раздувать память приложения.
function log(list, value) {
  list.push(value);
  if (list.length > LOG_LIMIT) list.splice(0, list.length - LOG_LIMIT);
}

// Любой вопрос (свой или оболочки) останавливает вкладки и внешние ссылки.
const busy = () => !!modal || localModal;

// --- сохранение ----------------------------------------------------------------------

const saveSettings = () => WindowState.save(file('settings.json'), settings);
const saveTabs = () => WindowState.save(file('tabs.json'), tabs);

// --- сеансы и безопасность -----------------------------------------------------------

function guardSession(ses, folder) {
  if (guardedSessions.has(ses)) return;
  guardedSessions.add(ses);
  // Сеть закрыта: игры работают без интернета. Пропускаются только файлы своей папки.
  ses.webRequest.onBeforeRequest((details, cb) => {
    const ok = Security.allowRequest(details.url, folder);
    if (!ok) log(blocked, details.url);
    cb({ cancel: !ok });
  });
  const allowed = folder === APP_DIR ? new Set() : GAME_PERMISSIONS;
  ses.setPermissionRequestHandler((_wc, permission, cb) => cb(allowed.has(permission)));
  ses.setPermissionCheckHandler((_wc, permission) => allowed.has(permission));
  ses.setDevicePermissionHandler(() => false);
  // Игры ничего не скачивают: скачивание с их страницы отменяется.
  ses.on('will-download', (e, item) => {
    log(blocked, 'download:' + item.getURL());
    e.preventDefault();
  });
}

// Ссылки и переходы страницы: своя папка - можно, http(s) - в системный браузер после
// вопроса, остальное - нельзя. Новых окон приложение не открывает никогда.
// Спросить про внешнюю ссылку может только страница, которую сейчас видно: фоновая
// вкладка иначе подменяла бы открытый вопрос оболочки своим.
function guardContents(wc, folder, visible = () => true) {
  wc.setWindowOpenHandler(({ url }) => {
    if (Security.navigation(url, folder) === 'external' && visible()) askExternal(url);
    return { action: 'deny' };
  });
  wc.on('will-frame-navigate', (e) => {
    const verdict = Security.navigation(e.url, folder);
    if (verdict === 'allow') return;
    e.preventDefault();
    if (verdict === 'external' && e.isMainFrame && visible()) askExternal(e.url);
  });
  wc.on('will-redirect', (e) => {
    if (Security.navigation(e.url, folder) !== 'allow') e.preventDefault();
  });
}

async function askExternal(url) {
  const ok = await ask({
    title: 'Открыть ссылку в браузере?',
    text: url,
    ok: 'Открыть',
    cancel: 'Отмена',
  });
  if (ok) shell.openExternal(url);
}

// --- вопросы -------------------------------------------------------------------------

// Вопрос рисует оболочка. Игру на это время прячем (она встаёт на паузу), а под вопросом
// показываем её снимок, чтобы было видно, о чём речь. Второй вопрос поверх первого не
// задаётся: страница, которая сыплет window.open, просто получает отказ.
async function ask(opts) {
  if (busy() || !win) return false;
  const id = ++modalSeq;
  modal = { id, resolve: null };
  let snapshot = null;
  const view = tabs.active !== Tabs.HOME ? views.get(tabs.active) : null;
  if (view) {
    try {
      const img = await view.webContents.capturePage();
      if (!img.isEmpty()) snapshot = 'data:image/jpeg;base64,' + img.toJPEG(80).toString('base64');
    } catch {
      /* без снимка - просто тёмный фон */
    }
  }
  if (!win) return false;
  return new Promise((resolve) => {
    modal.resolve = (index) => {
      modal = null;
      layout();
      focusActive();
      resolve(index === 0);
    };
    layout();
    win.webContents.focus();
    win.webContents.send('shell:modal', { id, snapshot, fullscreen, game: !!view, ...opts });
  });
}

// --- вкладки -------------------------------------------------------------------------

function createView(id) {
  const g = byId.get(id);
  const ses = session.fromPartition('persist:' + id);
  guardSession(ses, g.dir);
  const view = new WebContentsView({
    webPreferences: {
      partition: 'persist:' + id,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      preload: path.join(APP_DIR, 'game-preload.js'),
      backgroundThrottling: true,
      spellcheck: false,
      autoplayPolicy: 'no-user-gesture-required',
      devTools: !app.isPackaged,
    },
  });
  view.setBackgroundColor(THEMES[settings.theme].bg);
  const wc = view.webContents;
  wc.setBackgroundThrottling(true);
  guardContents(wc, g.dir, () => !busy() && tabs.active === id && views.get(id) === view);
  wc.on('before-input-event', (event, input) => {
    // Esc игре, которая просила его себе (games.js, escToGame): Chromium клавишу не видит - захват мыши
    // не снимается «по Esc человека», и игра потом может вернуть его без щелчка. Событие отдаётся с
    // действием человека (executeJavaScript userGesture) - запрос захвата проходит наверняка.
    if (g.escToGame && input.code === 'Escape' && !input.control && !input.alt && !input.meta && !busy()) {
      event.preventDefault();
      if (input.type === 'keyDown') wc.executeJavaScript("window.dispatchEvent(new Event('igroteka:esc'))", true).catch(() => {});
      return;
    }
    onKey(event, input);
  });
  errors[id] = errors[id] || [];
  wc.on('console-message', (e) => { if (e.level === 'error') log(errors[id], String(e.message)); });
  wc.on('preload-error', (_e, _p, err) => log(errors[id], 'preload: ' + err));
  // Упавшая страница перезапускается сама, но не больше CRASH_LIMIT раз подряд: игра,
  // которая падает сразу после загрузки, иначе крутилась бы вечно. Дальше - экран
  // «игра упала» с кнопкой. Счёт сбрасывается, если страница прожила 20 секунд.
  let calm = null;
  wc.on('did-finish-load', () => {
    clearTimeout(calm);
    calm = setTimeout(() => crashes.delete(id), 20000);
  });
  wc.on('render-process-gone', (_e, details) => {
    log(errors[id], 'renderer gone: ' + details.reason);
    clearTimeout(calm);
    if (details.reason === 'clean-exit' || views.get(id) !== view) return;
    const n = (crashes.get(id) || 0) + 1;
    crashes.set(id, n);
    if (n > CRASH_LIMIT) {
      crashed.add(id);
      layout();
      focusActive();
      pushState();
    } else {
      setTimeout(() => wc.isDestroyed() || wc.reload(), 300);
    }
  });
  wc.on('enter-html-full-screen', () => setFullscreen(true));
  wc.on('leave-html-full-screen', () => setFullscreen(false));
  views.set(id, view); // на окно её поставит layout(), если вкладка активна
  wc.loadFile(g.page);
  applyAudio();
  return view;
}

// Перед закрытием страницы игра успевает сохраниться. webContents.close() не даёт странице ни
// beforeunload, ни pagehide, и последние секунды игры пропадали (в «Кубическом мире» герой
// оказывался там, где был при последнем самосохранении, а то и в начале мира). Если у страницы есть
// window.igrotekaSave() - ждём её (не дольше SAVE_WAIT), иначе отдаём ей pagehide и чуть ждём записи.
const SAVE_WAIT = 2500;
const SAVE_JS = `(async () => {
  try {
    if (typeof window.igrotekaSave === 'function') { await Promise.race([window.igrotekaSave(), new Promise((r) => setTimeout(r, ${SAVE_WAIT}))]); return 'game'; }
    window.dispatchEvent(new Event('pagehide'));
    await new Promise((r) => setTimeout(r, 300));
  } catch (e) { /* закрываем всё равно */ }
  return 'generic';
})()`;
function savePage(wc) {
  if (!wc || wc.isDestroyed()) return Promise.resolve();
  return Promise.race([wc.executeJavaScript(SAVE_JS, true).catch(() => {}), new Promise((r) => setTimeout(r, SAVE_WAIT + 500))]);
}
const noSave = new Set();      // «стереть данные игры»: страница закрывается без сохранения

function destroyView(id) {
  const view = views.get(id);
  if (!view) return;
  views.delete(id);
  crashed.delete(id);
  crashes.delete(id);
  if (attached.has(view) && win && !win.isDestroyed()) win.contentView.removeChildView(view);
  attached.delete(view);
  const wc = view.webContents;
  if (wc.isDestroyed()) return;
  const skip = noSave.delete(id);
  const close = () => { if (!wc.isDestroyed()) wc.close(); };
  if (skip) close(); else savePage(wc).then(close, close);
}

function setTabs(next) {
  // Игра, с которой ушли, выходит из своего полноэкранного режима (requestFullscreen):
  // иначе, вернувшись, её застали бы на весь экран без полосы вкладок.
  const prev = views.get(tabs.active);
  if (prev && next.active !== tabs.active && !prev.webContents.isDestroyed()) {
    prev.webContents.executeJavaScript('document.fullscreenElement && document.exitFullscreen()', true).catch(() => {});
  }
  tabs = next;
  for (const id of [...views.keys()]) if (!tabs.open.includes(id)) destroyView(id);
  if (tabs.active !== Tabs.HOME && !views.has(tabs.active)) createView(tabs.active);
  if (fullscreen && tabs.active === Tabs.HOME) setFullscreen(false);
  layout();
  applyAudio();
  focusActive();
  saveTabs();
  pushState();
}

// Видна только активная вкладка. Скрытая снимается с окна целиком (removeChildView):
// страница становится hidden (visibilitychange), кадры requestAnimationFrame ей больше не
// приходят. Фокус перед этим уходит в оболочку, чтобы игра получила blur - на него
// встают на паузу почти все игры.
const attached = new Set();

function layout() {
  if (!win || win.isDestroyed()) return;
  const [w, h] = win.getContentSize();
  const bounds = fullscreen ? { x: 0, y: 0, width: w, height: h } : { x: 0, y: BAR_H, width: w, height: Math.max(0, h - BAR_H) };
  for (const [id, view] of views) {
    const show = id === tabs.active && !modal && !crashed.has(id);
    view.setBounds(bounds);
    if (show && !attached.has(view)) {
      view.setVisible(true);
      win.contentView.addChildView(view);
      attached.add(view);
    } else if (!show && attached.has(view)) {
      if (view.webContents.isFocused()) win.webContents.focus();
      view.setVisible(false);
      win.contentView.removeChildView(view);
      attached.delete(view);
    }
  }
}

function focusActive() {
  if (!win || win.isDestroyed() || modal) return;
  const view = crashed.has(tabs.active) ? null : views.get(tabs.active);
  if (view) view.webContents.focus();
  else win.webContents.focus();
}

function applyAudio() {
  for (const [id, view] of views) view.webContents.setAudioMuted(Settings.isMuted(settings, id, tabs.active));
}

function applyVolume() {
  for (const view of views.values()) view.webContents.send('igroteka:volume', settings.volume / 100);
}

function applyTheme() {
  const t = THEMES[settings.theme];
  nativeTheme.themeSource = settings.theme;
  if (!win) return;
  win.setBackgroundColor(t.bg);
  try {
    win.setTitleBarOverlay({ color: '#00000000', symbolColor: t.symbol, height: BAR_H });
  } catch {
    /* не Windows - кнопок окна поверх полосы нет */
  }
  for (const view of views.values()) view.setBackgroundColor(t.bg);
}

function setFullscreen(on) {
  if (on && tabs.active === Tabs.HOME) return;
  if (!win || fullscreen === on) return;
  fullscreen = on;
  if (TEST) testFullScreen = on; else win.setFullScreen(on);
  if (!on) {
    const view = views.get(tabs.active);
    if (view) view.webContents.executeJavaScript('document.fullscreenElement && document.exitFullscreen()', true).catch(() => {});
  }
  layout();
  pushState();
}

async function restartActive() {
  const id = tabs.active;
  const g = byId.get(id);
  if (!g) return;
  const ok = await ask({
    title: 'Начать игру заново?',
    text: `«${g.name}» перезапустится. Рекорды и сохранённое игрой останутся, текущий забег пропадёт.`,
    ok: 'Перезапустить',
    cancel: 'Отмена',
  });
  const view = views.get(id);
  if (ok && view) view.webContents.reload();
}

// --- клавиши -------------------------------------------------------------------------

// Одни и те же клавиши и в оболочке, и внутри игры. Буквы по коду клавиши, а не по
// символу: в русской раскладке Ctrl+T - это Ctrl+Е.
function onKey(event, input) {
  if (input.type !== 'keyDown' || busy()) return;
  const ctrl = input.control || input.meta;
  // Клавиши, которые активная игра забирает себе (games.js, поле keys): оболочка их не
  // трогает. В «Кубическом мире» F5 - вид камеры, а не перезапуск.
  const own = (byId.get(tabs.active) || {}).keys || [];
  if (!ctrl && !input.alt && own.includes(input.code)) return;
  if (ctrl && !input.alt && (input.code === 'KeyR' || input.code === 'F5')) {
    // Ctrl+R и Ctrl+F5 - перезапуск у любой игры, и у той, что забрала F5 себе.
    event.preventDefault();
    if (tabs.active !== Tabs.HOME) restartActive();
    return;
  }
  if (ctrl && !input.alt) {
    let next;
    const digit = /^(?:Digit|Numpad)([1-9])$/.exec(input.code);
    if (input.code === 'KeyT') next = Tabs.activate(tabs, Tabs.HOME);
    else if (input.code === 'KeyW') next = tabs.active === Tabs.HOME ? tabs : Tabs.closeTab(tabs, tabs.active);
    else if (input.code === 'Tab') next = Tabs.cycle(tabs, input.shift ? -1 : 1);
    else if (digit) next = Tabs.byNumber(tabs, Number(digit[1]));
    if (next) {
      event.preventDefault();
      if (next !== tabs) setTabs(next);
    }
    return;
  }
  const plain = !ctrl && !input.alt && !input.shift;
  if (input.code === 'F11' && plain) {
    event.preventDefault();
    setFullscreen(!fullscreen);
  } else if (input.code === 'Escape' && fullscreen) {
    setFullscreen(false); // Esc доходит и до игры: она встанет на паузу или отпустит мышь
  } else if (input.code === 'F5' && plain) {
    event.preventDefault();
    restartActive();
  }
}

// Меню вкладки (правая кнопка): второй способ перезапустить игру, у любой игры.
let lastMenu = null;
function tabMenu(id) {
  if (!byId.has(id) || !tabs.open.includes(id)) return;
  lastMenu = Menu.buildFromTemplate([
    { label: 'Начать заново…', accelerator: 'CmdOrCtrl+R', registerAccelerator: false, click: () => { setTabs(Tabs.activate(tabs, id)); restartActive(); } },
    { type: 'separator' },
    { label: 'Закрыть вкладку', accelerator: 'CmdOrCtrl+W', registerAccelerator: false, click: () => setTabs(Tabs.closeTab(tabs, id)) },
  ]);
  lastMenu.popup({ window: win });
}

// --- связь с оболочкой ---------------------------------------------------------------

function snapshot() {
  return { tabs, fullscreen, settings, crashed: [...crashed] };
}

function pushState() {
  if (win && !win.isDestroyed()) win.webContents.send('shell:state', snapshot());
}

// Команды оболочки принимаются только от её окна: у страниц игр моста нет, но лишняя
// проверка отправителя дёшева.
const fromShell = (e) => !!win && !win.isDestroyed() && !!e && e.sender === win.webContents;
const fromGame = (e) => !!e && [...views.values()].some((v) => v.webContents === e.sender);

// Громкость для предзагрузки страницы игры: спрашивается синхронно при каждой загрузке,
// так что и после F5 или перезапуска после сбоя страница получает текущую, а не ту, что
// была при создании вкладки.
// Заодно предзагрузка узнаёт, не режим ли это проверок: тогда захват мыши выключен и в
// самой странице (requestPointerLock ничего не делает).
ipcMain.on('igroteka:page-setup', (e) => {
  e.returnValue = fromGame(e) ? { volume: settings.volume / 100, test: TEST } : { volume: 1, test: TEST };
});

ipcMain.handle('shell:init', (e) => (!fromShell(e) ? null : {
  product: { name: PRODUCT.name, version: PRODUCT.version },
  games: games.map((g) => ({ id: g.id, name: g.name, desc: g.desc, keys: g.keys || [], escToGame: !!g.escToGame })),
  platform: process.platform,
  ...snapshot(),
}));
// Пока открыт вопрос, вкладки не переключаются и не закрываются: иначе «Перезапустить»
// сработало бы уже не для той игры, о которой спрашивали.
const tabsCommand = (fn) => (e, id) => { if (fromShell(e) && !busy()) fn(id); };
ipcMain.on('tabs:open', tabsCommand((id) => { if (byId.has(id)) setTabs(Tabs.openTab(tabs, id)); }));
ipcMain.on('tabs:activate', tabsCommand((id) => setTabs(Tabs.activate(tabs, id))));
ipcMain.on('tabs:close', tabsCommand((id) => setTabs(Tabs.closeTab(tabs, id))));
ipcMain.on('tabs:menu', tabsCommand((id) => tabMenu(id)));
// Экран «игра упала» -> «Перезапустить»: счёт сбоев с нуля, страница заново.
ipcMain.on('tabs:revive', tabsCommand((id) => {
  const view = views.get(id);
  if (!view || !crashed.has(id)) return;
  crashed.delete(id);
  crashes.delete(id);
  view.webContents.reload();
  layout();
  focusActive();
  pushState();
}));
ipcMain.on('modal:result', (e, id, index) => { if (fromShell(e) && modal && modal.id === id && modal.resolve) modal.resolve(index); });
ipcMain.on('modal:local', (e, open) => { if (fromShell(e)) localModal = !!open; });
ipcMain.handle('settings:set', (e, key, value) => {
  if (!fromShell(e)) return settings;
  settings = Settings.update(settings, key, value);
  saveSettings();
  if (key === 'theme') applyTheme();
  if (key === 'volume') applyVolume();
  applyAudio();
  pushState();
  return settings;
});
// Стереть данные одной игры: рекорды, сохранения, кеш. Открытая вкладка этой игры
// закрывается, иначе страница тут же записала бы свои данные обратно.
ipcMain.handle('games:clear', async (e, id) => {
  if (!fromShell(e) || !byId.has(id)) return false;
  if (tabs.open.includes(id)) { noSave.add(id); setTabs(Tabs.closeTab(tabs, id)); }
  const ses = session.fromPartition('persist:' + id);
  await ses.clearStorageData();
  await ses.clearCache();
  return true;
});

// --- окно ----------------------------------------------------------------------------

function createWindow() {
  const primary = screen.getPrimaryDisplay();
  const areas = TEST ? [TEST_AREA] : [primary, ...screen.getAllDisplays().filter((d) => d.id !== primary.id)].map((d) => d.workArea);
  const placed = WindowState.restore(WindowState.load(file('window-state.json')), areas, SIZE);
  if (TEST && placed.x === undefined) {
    placed.x = TEST_AREA.x + Math.round((TEST_AREA.width - placed.width) / 2);
    placed.y = TEST_AREA.y + Math.round((TEST_AREA.height - placed.height) / 2);
  }
  const t = THEMES[settings.theme];

  win = new BrowserWindow({
    ...(placed.x !== undefined ? { x: placed.x, y: placed.y } : {}),
    width: placed.width,
    height: placed.height,
    minWidth: SIZE.minWidth,
    minHeight: SIZE.minHeight,
    show: false,
    title: PRODUCT.name,
    icon: path.join(APP_DIR, 'assets', 'icon.ico'),
    ...(TEST ? { focusable: false, skipTaskbar: true } : {}),
    backgroundColor: t.bg,
    // Свой заголовок: вкладки стоят прямо в нём, кнопки окна - системные поверх полосы.
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#00000000', symbolColor: t.symbol, height: BAR_H },
    webPreferences: {
      preload: path.join(APP_DIR, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
      devTools: !app.isPackaged,
    },
  });
  if (placed.maximized) { if (TEST) testMaximized = true; else win.maximize(); }

  guardSession(win.webContents.session, APP_DIR);
  guardContents(win.webContents, path.join(APP_DIR, 'renderer'));
  win.webContents.on('before-input-event', onKey);
  win.once('ready-to-show', () => (TEST ? win.showInactive() : win.show()));
  // Место окна пишется и по ходу (после перетаскивания), а не только при закрытии:
  // если приложение упадёт или его снимут, окно всё равно откроется там, где было.
  // Полноэкранный режим и свёрнутое окно не запоминаются.
  const remember = () => {
    if (win && !win.isDestroyed() && !win.isMinimized() && !win.isFullScreen()) {
      const state = WindowState.capture(win);
      if (TEST) state.maximized = testMaximized;
      WindowState.save(file('window-state.json'), state);
    }
  };
  for (const ev of ['resized', 'moved', 'maximize', 'unmaximize']) win.on(ev, remember);
  win.on('close', remember);
  // Окно закрывают (крестик, Alt+F4, выход приложения): сначала открытые игры сохраняются
  let saved = false;
  win.on('close', (e) => {
    if (saved || views.size === 0) return;
    e.preventDefault();
    saved = true;
    Promise.all([...views.values()].map((v) => savePage(v.webContents))).then(() => { if (win && !win.isDestroyed()) win.close(); });
  });
  win.on('closed', () => { win = null; });
  for (const ev of ['resize', 'maximize', 'unmaximize', 'enter-full-screen']) win.on(ev, layout);
  // Полный экран могли снять не мы (Windows, клавиши системы) - полоса возвращается.
  win.on('leave-full-screen', () => { if (fullscreen) setFullscreen(false); else layout(); });
  win.on('focus', focusActive);
  win.loadFile(path.join(APP_DIR, 'renderer', 'index.html'));

  // Открытые в прошлый раз вкладки: создаётся только активная, остальные - при показе.
  if (settings.reopenTabs) {
    tabs = Tabs.restore(WindowState.load(file('tabs.json')), IDS);
    if (tabs.active !== Tabs.HOME) createView(tabs.active);
    layout();
    applyAudio();
  } else {
    saveTabs();
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.on('web-contents-created', (_e, wc) => {
    wc.on('will-attach-webview', (ev) => ev.preventDefault());
  });
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    settings = Settings.normalize(WindowState.load(file('settings.json')));
    nativeTheme.themeSource = settings.theme;
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}

// Ручка для проверок (tests-app): Playwright выполняет код в этом процессе и смотрит
// сюда. Приложению она не нужна и снаружи недоступна.
globalThis.__igroteka = {
  get win() { return win; },
  get tabs() { return tabs; },
  get settings() { return settings; },
  get fullscreen() { return fullscreen; },
  get modalOpen() { return !!modal; },
  get crashed() { return [...crashed]; },
  get lastMenu() { return lastMenu; },
  // Режим проверок: окно за экраном, «развёрнуто» и «весь экран» - только отметки.
  TEST, TEST_AREA,
  get maximized() { return TEST ? testMaximized : !!win && win.isMaximized(); },
  setMaximized(on) { if (TEST) { testMaximized = !!on; if (win) win.emit('maximize'); } else if (win) { if (on) win.maximize(); else win.unmaximize(); } },
  get windowFullScreen() { return TEST ? testFullScreen : !!win && win.isFullScreen(); },
  views, errors, blocked, games, BAR_H,
};
