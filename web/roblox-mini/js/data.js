// Данные Блоксити: палитра, лица, одежда, аксессуары, места, значки, боты, подсказки.
// Всё придумано здесь; ни логотипов, ни названий чужой компании.
'use strict';
(function (B) {
  const COLORS = [
    ['#f2f3f3', 'Белый'], ['#c9ccd1', 'Светло-серый'], ['#8a8d93', 'Серый'], ['#4b4e55', 'Графит'], ['#1f2227', 'Чёрный'],
    ['#f6d7b0', 'Персик'], ['#eab98a', 'Песочный'], ['#c98d5e', 'Карамель'], ['#8e5a3a', 'Какао'], ['#5a3a28', 'Шоколад'],
    ['#ff5c5c', 'Коралл'], ['#d62d2d', 'Красный'], ['#8f1e2e', 'Вишня'], ['#ff9d3b', 'Оранжевый'], ['#ffd23f', 'Жёлтый'],
    ['#f6e7a1', 'Лимонад'], ['#a8d65b', 'Салатовый'], ['#3fae4a', 'Зелёный'], ['#1f6f43', 'Ель'], ['#3fd0c4', 'Бирюза'],
    ['#79c7ff', 'Небесный'], ['#2f74d0', 'Синий'], ['#1e3f8f', 'Ночь'], ['#8a5cf5', 'Фиалка'], ['#5b2f9e', 'Слива'],
    ['#ff8fd0', 'Розовый'], ['#d63f95', 'Малина'], ['#b8a07a', 'Хаки'], ['#6b7f3a', 'Олива'], ['#ffe9f4', 'Зефир'],
  ];
  const SKIN = '#eab98a';

  // Лица: рисуются в textures.js по id
  const FACES = [
    { id: 'face_smile', name: 'Улыбка', en: 'Smile', price: 0 },
    { id: 'face_grin', name: 'Широкая улыбка', en: 'Big grin', price: 0 },
    { id: 'face_wink', name: 'Подмигивание', en: 'Wink', price: 0 },
    { id: 'face_surprised', name: 'Удивление', en: 'Surprised', price: 15 },
    { id: 'face_sleepy', name: 'Сонный', en: 'Sleepy', price: 20 },
    { id: 'face_angry', name: 'Суровый', en: 'Stern', price: 25 },
    { id: 'face_blush', name: 'Смущение', en: 'Blush', price: 30 },
    { id: 'face_cool', name: 'Крутые очки', en: 'Shades', price: 45 },
  ];
  const SHIRTS = [
    { id: 'shirt_none', name: 'Без рубашки', en: 'No shirt', price: 0 },
    { id: 'shirt_tee', name: 'Футболка «Звезда»', en: 'Star tee', price: 0, c1: '#2f74d0', c2: '#ffd23f' },
    { id: 'shirt_stripes', name: 'Тельняшка', en: 'Striped shirt', price: 0, c1: '#f2f3f3', c2: '#1e3f8f' },
    { id: 'shirt_hoodie', name: 'Худи с карманом', en: 'Hoodie', price: 35, c1: '#3fae4a', c2: '#1f6f43' },
    { id: 'shirt_checker', name: 'Рубашка в клетку', en: 'Plaid shirt', price: 25, c1: '#d62d2d', c2: '#1f2227' },
    { id: 'shirt_sport', name: 'Спортивная майка 7', en: 'Jersey 7', price: 30, c1: '#ff9d3b', c2: '#f2f3f3' },
    { id: 'shirt_suit', name: 'Пиджак с галстуком', en: 'Suit', price: 60, c1: '#1f2227', c2: '#d62d2d' },
  ];
  const PANTS = [
    { id: 'pants_none', name: 'Без штанов', en: 'No pants', price: 0 },
    { id: 'pants_jeans', name: 'Джинсы', en: 'Jeans', price: 0, c1: '#2f5aa0', c2: '#1e3f8f' },
    { id: 'pants_shorts', name: 'Шорты', en: 'Shorts', price: 20, c1: '#b8a07a', c2: '#8e7a58' },
    { id: 'pants_track', name: 'Спортивки с лампасами', en: 'Track pants', price: 25, c1: '#1f2227', c2: '#f2f3f3' },
    { id: 'pants_camo', name: 'Камуфляж', en: 'Camo', price: 35, c1: '#6b7f3a', c2: '#3b4a22' },
  ];
  // Аксессуары: slot - hat | hair | faceAcc | back; строятся в avatar.js по id
  const ACCESSORIES = [
    { id: 'hat_cap', slot: 'hat', name: 'Кепка', en: 'Cap', price: 0 },
    { id: 'hat_beanie', slot: 'hat', name: 'Шапка с помпоном', en: 'Beanie', price: 0 },
    { id: 'hat_top', slot: 'hat', name: 'Цилиндр', en: 'Top hat', price: 50 },
    { id: 'hat_cowboy', slot: 'hat', name: 'Ковбойская шляпа', en: 'Cowboy hat', price: 60 },
    { id: 'hat_wizard', slot: 'hat', name: 'Колпак волшебника', en: 'Wizard hat', price: 80 },
    { id: 'hat_headphones', slot: 'hat', name: 'Наушники', en: 'Headphones', price: 45 },
    { id: 'hat_halo', slot: 'hat', name: 'Нимб', en: 'Halo', price: 120 },
    { id: 'hat_crown', slot: 'hat', name: 'Корона', en: 'Crown', price: 150 },
    { id: 'hair_spiky', slot: 'hair', name: 'Ёжик', en: 'Spiky hair', price: 0 },
    { id: 'hair_bob', slot: 'hair', name: 'Каре', en: 'Bob', price: 20 },
    { id: 'hair_ponytail', slot: 'hair', name: 'Хвостик', en: 'Ponytail', price: 25 },
    { id: 'acc_glasses', slot: 'faceAcc', name: 'Очки', en: 'Glasses', price: 15 },
    { id: 'back_backpack', slot: 'back', name: 'Рюкзак', en: 'Backpack', price: 30 },
    { id: 'back_sword', slot: 'back', name: 'Меч за спиной', en: 'Sword', price: 70 },
    { id: 'back_wings', slot: 'back', name: 'Крылья', en: 'Wings', price: 200 },
  ];

  const ITEMS = {};
  for (const f of FACES) ITEMS[f.id] = Object.assign({ type: 'face', slot: 'face' }, f);
  for (const s of SHIRTS) ITEMS[s.id] = Object.assign({ type: 'shirt', slot: 'shirt' }, s);
  for (const p of PANTS) ITEMS[p.id] = Object.assign({ type: 'pants', slot: 'pants' }, p);
  for (const a of ACCESSORIES) ITEMS[a.id] = Object.assign({ type: 'accessory' }, a);

  // Места. medals - пороги: для времени (меньше - лучше) или высоты/очков (больше - лучше)
  const PLACES = [
    {
      id: 'obby', name: 'Обби: Башня', en: 'Tower Obby', genre: 'Обби', genreEn: 'Obby', color: '#ff9d3b',
      desc: 'Восемь этапов вверх вокруг башни: простые прыжки, лава, ездящие и исчезающие плиты, батуты, конвейеры и крутилки. Контрольные точки запоминают этап.',
      descEn: 'Eight stages up around a tower: jumps, lava, moving and vanishing tiles, trampolines, conveyors and spinners. Checkpoints save your stage.',
      metric: 'time', lower: true, medals: { gold: 150, silver: 240, bronze: Infinity }, maxPlayers: 12, created: '2026-09-26',
    },
    {
      id: 'race', name: 'Скоростной забег', en: 'Speed Run', genre: 'Гонки', genreEn: 'Racing', color: '#3fd0c4',
      desc: 'Длинная трасса на время: ускорители, узкие балки, прыжки через пропасти. Таймер стартует на линии. Золото - быстрее 34 секунд.',
      descEn: 'A long timed course: speed pads, narrow beams and gaps. The timer starts at the line. Gold is under 34 seconds.',
      metric: 'time', lower: true, medals: { gold: 34, silver: 44, bronze: 58 }, maxPlayers: 8, created: '2026-09-26',
    },
    {
      id: 'lava', name: 'Лава поднимается', en: 'The Floor Is Lava', genre: 'Выживание', genreEn: 'Survival', color: '#ff5c5c',
      desc: 'Лава поднимается всё быстрее. Карабкайся по платформам как можно выше - засчитывается самая большая высота за раунд.',
      descEn: 'The lava keeps rising faster. Climb as high as you can - the best height of the round counts.',
      metric: 'height', lower: false, medals: { gold: 90, silver: 60, bronze: 30 }, maxPlayers: 10, created: '2026-09-26',
    },
    {
      id: 'coins', name: 'Собери монетки', en: 'Coin Rush', genre: 'Соревнование', genreEn: 'Competitive', color: '#ffd23f',
      desc: 'Кто первым соберёт 10 монет - ты или три бота? Монеты появляются по всей карте, боты не ждут.',
      descEn: 'Who gets 10 coins first - you or three bots? Coins pop up all over the map, and the bots do not wait.',
      metric: 'time', lower: true, medals: { gold: 45, silver: 70, bronze: Infinity }, maxPlayers: 4, goal: 10, created: '2026-09-26',
    },
    {
      id: 'sandbox', name: 'Песочница', en: 'Sandbox', genre: 'Строительство', genreEn: 'Building', color: '#a8d65b',
      desc: 'Своя плита для стройки: ставь, крась и ломай блоки. Постройка сохраняется и ждёт тебя при следующем входе.',
      descEn: 'Your own plate to build on: place, paint and break blocks. Your build is saved for next time.',
      metric: 'blocks', lower: false, medals: null, maxPlayers: 6, created: '2026-09-26',
    },
    {
      id: 'tube', name: 'Горка на ватрушке', en: 'Tube Slide', genre: 'Приключения', genreEn: 'Adventure', color: '#79c7ff',
      desc: 'Садись на ватрушку и мчись вниз по снежной горке. Рули A/D, собирай звёзды в кольцах, объезжай ёлки.',
      descEn: 'Hop on a snow tube and race down the slope. Steer with A/D, grab stars through the rings, dodge the trees.',
      metric: 'score', lower: false, medals: { gold: 18, silver: 12, bronze: 6 }, maxPlayers: 8, created: '2026-09-27',
    },
  ];

  // complete: место, прохождение которого даёт значок. Все шесть - и «Легенда Блоксити».
  const BADGES = [
    { id: 'first_steps', name: 'Первые шаги', en: 'First steps', desc: 'Зайти в любое место', icon: 'foot', color: '#79c7ff' },
    { id: 'obby_first', name: 'Покоритель башни', en: 'Tower climber', desc: 'Пройти «Обби: Башня» до вершины', icon: 'tower', color: '#ff9d3b', complete: 'obby' },
    { id: 'race_medal', name: 'Призёр забега', en: 'Race medalist', desc: 'Взять медаль в «Скоростном забеге»', icon: 'medal', color: '#3fd0c4', complete: 'race' },
    { id: 'lava_top', name: 'Выше лавы', en: 'Above the lava', desc: 'Добраться до вершины в «Лава поднимается»', icon: 'flame', color: '#ff5c5c', complete: 'lava' },
    { id: 'coins_win', name: 'Монетный магнат', en: 'Coin tycoon', desc: 'Собрать больше монет, чем боты', icon: 'coin', color: '#ffd23f', complete: 'coins' },
    { id: 'builder', name: 'Строитель', en: 'Builder', desc: 'Поставить 25 блоков в «Песочнице»', icon: 'brick', color: '#a8d65b', complete: 'sandbox' },
    { id: 'tube_finish', name: 'Снежный гонщик', en: 'Snow racer', desc: 'Скатиться до финиша на «Горке» с медалью', icon: 'star', color: '#79c7ff', complete: 'tube' },
    { id: 'race_gold', name: 'Золотой забег', en: 'Golden run', desc: 'Золото в «Скоростном забеге»', icon: 'medal', color: '#ffc21a' },
    { id: 'shopper', name: 'Модник', en: 'Fashionista', desc: 'Купить первую вещь в каталоге', icon: 'bag', color: '#ff8fd0' },
    { id: 'rich', name: 'Копилка', en: 'Piggy bank', desc: 'Накопить 200 кубов', icon: 'cube', color: '#8a5cf5' },
    { id: 'legend', name: 'Легенда Блоксити', en: 'Bloxcity Legend', desc: 'Пройти все шесть мест', icon: 'crown', color: '#ffc21a' },
  ];

  const BOT_NAMES = ['КубоМастер', 'Пиксель_2012', 'ЛаваЛапка', 'Прыгун77', 'МиссБлок', 'ТурбоЁж', 'Снежок_Пи', 'Капитан_Кирпич', 'НеонКот', 'Бублик', 'ЗвёздныйТапок', 'Ракета_Z'];
  const BOT_PHRASES = [
    'привет всем!', 'кто со мной?', 'ааа лава', 'я почти дошёл', 'как пройти этот этап?', 'хаха', 'гг',
    'классная карта', 'кто быстрее?', 'ой', 'погнали', 'у меня лагает камера)', 'смотрите какая шапка', 'ещё разок',
    'тут надо разбежаться', 'ура!', 'я на батуте', 'не толкайтесь', 'легко', 'сложно...',
  ];
  // Реплики ботов по ситуации: место -> случай -> строки. {n}, {what}, {t} подставляются.
  const L2 = (ru, en) => ({ ru, en });
  const BOT_CHAT = {
    common: {
      cheer: L2(['давай, {name}!', 'почти, {name}!', '{name}, ты сможешь', 'ого, {name}'], ['go {name}!', 'almost, {name}!', 'you got this {name}', 'wow {name}']),
      watch: L2(['красиво!', 'вот это да', 'классно сделано'], ['nice!', 'wow', 'well made']),
      idle: L2(['привет всем!', 'кто со мной?', 'классная карта', 'гг', 'ещё разок'], ['hi all!', 'who is with me?', 'nice map', 'gg', 'one more time']),
      fell: L2(['ой', 'почти!', 'ну вот...', 'эх'], ['oops', 'so close!', 'ugh...', 'nooo']),
      stuck: L2(['застрял, начну с точки', 'что-то я застрял', 'ресет'], ['stuck, going back to checkpoint', 'lol i got stuck', 'reset']),
      finish: L2(['ура!', 'есть!', 'гг'], ['yay!', 'got it!', 'gg']),
    },
    obby: {
      idle: L2(['кто на {n} этапе?', 'я на {n} этапе', 'этот этап сложный', 'не толкайтесь', 'тут надо разбежаться'], ['who is on stage {n}?', 'i am on stage {n}', 'this stage is hard', 'dont push', 'need a running start here']),
      cp: L2(['этап {n}!', 'дошёл до {n}', 'уже {n} этап', 'фух, контрольная точка'], ['stage {n}!', 'made it to {n}', 'stage {n} already', 'phew, checkpoint']),
      fell: L2(['почти!', 'ааа лава', 'ой, упал', 'опять с точки...', 'не допрыгнул'], ['so close!', 'aaa lava', 'oops, fell', 'back to checkpoint...', 'too short']),
      wait: L2(['жду плиту', 'сейчас подъедет'], ['waiting for the tile', 'here it comes']),
      finish: L2(['я на вершине!!', 'прошёл башню!', 'ура, кубок!'], ['i made it to the top!!', 'tower done!', 'yay, trophy!']),
    },
    race: {
      idle: L2(['кто быстрее?', 'погнали ещё', 'мой рекорд {t}', 'узкие балки - жесть'], ['who is faster?', 'lets go again', 'my record is {t}', 'those beams are brutal']),
      start: L2(['погнали!', 'на старт!', 'вперёд!'], ['go go go!', 'ready!', 'lets go!']),
      fell: L2(['в воду...', 'ой, упал', 'почти!'], ['splash...', 'oops, fell', 'so close!']),
      finish: L2(['финиш! {t}', '{t}, неплохо', 'обогнал?'], ['finish! {t}', '{t}, not bad', 'did i win?']),
      cp: L2(['контрольная {n}', 'КТ {n}'], ['checkpoint {n}', 'cp {n}']),
    },
    lava: {
      idle: L2(['лава скоро', 'наверх!', 'кто выше всех?', 'я на {n}'], ['lava soon', 'go up!', 'who is highest?', 'i am at {n}']),
      hurry: L2(['лава близко!', 'ааа лава', 'быстрее!!'], ['lava is close!', 'aaa lava', 'faster!!']),
      fell: L2(['сгорел...', 'лава догнала', 'эх, в лобби'], ['burned...', 'the lava got me', 'back to the lobby']),
      finish: L2(['я на вершине!', 'спасся!'], ['i made it to the summit!', 'escaped!']),
    },
    coins: {
      idle: L2(['у меня {n}', 'где ещё монеты?', 'кто больше собрал?'], ['i have {n}', 'where are more coins?', 'who has more?']),
      coin: L2(['моя!', '+1', 'ещё одна'], ['mine!', '+1', 'another one']),
      high: L2(['лезу за монетой на горку', 'наверху монета!'], ['climbing for that coin', 'coin up there!']),
    },
    tube: {
      idle: L2(['кто катится?', 'моя очередь', 'рекорд {n} звёзд'], ['who is sliding?', 'my turn', 'record {n} stars']),
      start: L2(['поехали вниз!', 'уиии', 'погнали!'], ['here we go!', 'wheee', 'lets go!']),
      tree: L2(['ёлка!!', 'ай, ёлка', 'в ёлку...'], ['tree!!', 'ouch, tree', 'hit a tree...']),
      finish: L2(['{n} звёзд!', 'доехал, {n}★', 'ещё разок!'], ['{n} stars!', 'made it, {n}★', 'again!']),
    },
    sandbox: {
      idle: L2(['строю {what}', 'кто строит рядом?', 'красиво получается', 'смотрите мою постройку'], ['building a {what}', 'who is building nearby?', 'looks nice', 'check out my build']),
      build: L2(['строю {what}', 'начинаю {what}', 'буду строить {what}'], ['building a {what}', 'starting a {what}', 'a {what} coming up']),
      done: L2(['достроил {what}!', 'закончил {what}', 'смотрите, я построил {what}'], ['{what} done!', 'finished my {what}', 'look at my {what}']),
      oops: L2(['ой, не туда', 'переставлю', 'криво, переделаю'], ['oops, wrong spot', 'moving it', 'crooked, redo']),
      move: L2(['подвинься :)', 'ты стоишь на моей стройке'], ['move a bit :)', 'you are on my build']),
    },
  };
  // Заготовки построек ботов в «Песочнице»: слои снизу вверх, ряды через «/» (ряд - вдоль X, ряды - вдоль Z).
  // M - основной цвет бота, A - второй цвет; буквы - цвета палитры песочницы; «.» - пусто.
  const BLUEPRINTS = [
    { id: 'house', ru: 'домик', en: 'house', layers: ['MMMMM/M...M/M...M/M...M/MM.MM', 'MMMMM/M...M/M...M/M...M/MM.MM', 'MMMMM/M...M/W...W/M...M/MMMMM', 'AAAAA/AAAAA/AAAAA/AAAAA/AAAAA', '...../.AAA./.AAA./.AAA./.....'] },
    { id: 'tower', ru: 'башню', en: 'tower', layers: ['MMM/M.M/MMM', 'MMM/M.M/MMM', 'MMM/M.M/MMM', 'MMM/M.M/MMM', 'MMM/M.M/MMM', 'MMM/M.M/MMM', 'A.A/.../A.A'] },
    { id: 'wall', ru: 'стену', en: 'wall', layers: ['MMMMMMM', 'MMMMMMM', 'MMMMMMM', 'A.A.A.A'] },
    // мост - через свою речку (синие блоки под ним), иначе через ровное место он не читается
    { id: 'bridge', ru: 'мост через речку', en: 'bridge over a creek', layers: ['.M.M./...../UUUUU/UUUUU/UUUUU/UUUUU/UUUUU/...../.M.M.', '.M.M./...../...../...../...../...../...../...../.M.M.', '.SSS./.SSS./.SSS./.SSS./.SSS./.SSS./.SSS./.SSS./.SSS.', '.A.A./...../.A.A./...../.A.A./...../.A.A./...../.A.A.'] },
    { id: 'tree', ru: 'дерево', en: 'tree', layers: ['.../.B./...', '.../.B./...', '.../.B./...', 'GGG/GBG/GGG', 'GGG/GGG/GGG', '.../.G./...'] },
    { id: 'fence', ru: 'забор', en: 'fence', layers: ['M.M.M.M.M', 'MMMMMMMMM'] },
    // пиксель-арт - картина на щите (стоит), с земли плоский рисунок не разглядеть
    { id: 'heart', ru: 'картину с сердцем', en: 'heart picture', layers: ['SSSSSSS', 'WWWRWWW', 'WWRRRWW', 'WRRRRRW', 'RRRRRRR', 'RRRRRRR', 'WRRWRRW'] },
    { id: 'smile', ru: 'картину со смайликом', en: 'smiley picture', layers: ['SSSSSSS', 'WYYYYYW', 'YYKKKYY', 'YKYYYKY', 'YYYYYYY', 'YYKYKYY', 'WYYYYYW'] },
  ];
  const BP_COLORS = { W: 0, S: 1, K: 2, R: 3, O: 4, Y: 5, G: 6, C: 7, U: 8, P: 9, N: 10, B: 11 };
  // Развернуть заготовку в клетки { di, dj, dk, c } по порядку постройки; main/accent - цвета бота
  function blueprintCells(bp, main, accent) {
    const out = [];
    bp.layers.forEach((layer, j) => layer.split('/').forEach((row, k) => row.split('').forEach((ch, i) => {
      if (ch === '.' || ch === ' ') return;
      const c = ch === 'M' ? main : ch === 'A' ? accent : BP_COLORS[ch];
      out.push({ di: i, dj: j, dk: k, c });
    })));
    return out;
  }
  function blueprintSize(bp) {
    const rows = bp.layers[0].split('/');
    return { w: Math.max(...bp.layers.map((l) => Math.max(...l.split('/').map((r) => r.length)))), d: Math.max(...bp.layers.map((l) => l.split('/').length)), h: bp.layers.length, rows: rows.length };
  }
  const TIPS = [
    'Зажми правую кнопку мыши и веди - камера повернётся вокруг героя.',
    'Колесо мыши приближает камеру. Если приблизить до упора - вид от первого лица.',
    'Esc открывает меню места: там сброс персонажа, настройки и выход.',
    'Tab прячет и показывает таблицу игроков.',
    'Enter или / - написать в чат. Команда /reset сбрасывает персонажа.',
    'Shift включает Shift-лок: камера за плечом, герой смотрит туда же.',
    'Прыжок можно нажать чуть позже края - игра прощает опоздание.',
    'Кубы за медали тратятся в каталоге на шапки, лица и одежду.',
  ];
  const TIPS_EN = [
    'Hold the right mouse button and drag to orbit the camera.',
    'Mouse wheel zooms. Zoom all the way in for first person.',
    'Esc opens the place menu: reset, settings and leave.',
    'Tab hides and shows the player list.',
    'Enter or / to chat. The /reset command respawns you.',
    'Shift toggles shift lock: over-the-shoulder camera.',
    'You can press jump a little after the edge - the game forgives it.',
    'Spend cubes from medals in the catalog on hats, faces and clothes.',
  ];

  B.data = {
    COLORS, SKIN, FACES, SHIRTS, PANTS, ACCESSORIES, ITEMS, PLACES, BADGES, BOT_NAMES, BOT_PHRASES, BOT_CHAT, BLUEPRINTS, blueprintCells, blueprintSize, TIPS, TIPS_EN,
    item: (id) => ITEMS[id] || null,
    place: (id) => PLACES.find((p) => p.id === id) || null,
    badge: (id) => BADGES.find((b) => b.id === id) || null,
    defaultAvatar() {
      return {
        colors: { head: SKIN, torso: '#2f74d0', armL: SKIN, armR: SKIN, legL: '#4b4e55', legR: '#4b4e55' },
        face: 'face_smile', shirt: 'shirt_tee', pants: 'pants_jeans', hat: '', hair: 'hair_spiky', faceAcc: '', back: '',
      };
    },
    // Медаль за результат по порогам места
    medalFor(placeId, value) {
      const p = B.data.place(placeId);
      if (!p || !p.medals || value == null) return null;
      for (const m of ['gold', 'silver', 'bronze']) {
        const th = p.medals[m];
        if (p.lower ? value <= th : value >= th) return m;
      }
      return null;
    },
  };
})(window.Blox);
