// Ядро «Кубического мира»: таблица блоков, шум, генерация куска и сборка его сетки.
// Функция VoxelCore самодостаточна (ни одной внешней ссылки): её текст целиком уходит
// в Web Worker через Blob, а на главном потоке та же функция служит для проверок
// и для запасного пути, если Worker недоступен. Поэтому мир в потоке и на странице
// получается один и тот же байт в байт.
function VoxelCore() {
  'use strict';
  const CS = 16;            // ширина куска по X и Z
  const CH = 128;           // высота мира
  const SEA = 48;           // уровень моря
  const CVOL = CS * CS * CH;
  const cidx = (x, y, z) => x | (z << 4) | (y << 8);

  // ---------- Плитки атласа (16x16 пикселей, 16 в ряд) ----------
  const TILES = [
    'grass_top', 'grass_side', 'dirt', 'stone', 'cobblestone', 'bedrock', 'sand', 'gravel',
    'sandstone_top', 'sandstone_side', 'sandstone_bottom', 'oak_log', 'oak_log_top', 'birch_log', 'birch_log_top', 'spruce_log',
    'spruce_log_top', 'oak_leaves', 'birch_leaves', 'spruce_leaves', 'oak_planks', 'birch_planks', 'spruce_planks', 'glass',
    'bricks', 'stone_bricks', 'coal_ore', 'iron_ore', 'gold_ore', 'diamond_ore', 'water', 'snow',
    'snow_grass_side', 'ice', 'cactus_side', 'cactus_top', 'cactus_bottom', 'table_top', 'table_side', 'table_front',
    'furnace_front', 'furnace_front_lit', 'furnace_side', 'furnace_top', 'wool_white', 'wool_red', 'wool_blue', 'wool_yellow',
    'wool_green', 'wool_black', 'bookshelf', 'tall_grass', 'dandelion', 'poppy', 'dead_bush', 'torch',
    'oak_leaves_fast', 'birch_leaves_fast', 'spruce_leaves_fast', 'clay', 'obsidian', 'pumpkin_side', 'pumpkin_top', 'glowstone',
    'mossy_cobblestone', 'blue_flower',
  ];
  const T = {};
  TILES.forEach((n, i) => { T[n] = i; });
  const ATLAS_COLS = 16;
  const ATLAS_ROWS = Math.max(1, Math.ceil(TILES.length / ATLAS_COLS));

  // ---------- Блоки ----------
  // render: cube | leaves | glass | water | ice | cross | torch | none
  // tex: all | {top, bottom, side, front}; facing - у блока есть 4 поворота (id..id+3: С, В, Ю, З)
  // tool: чем добывать быстрее; level: наименьший уровень кирки, при котором блок что-то даёт
  // drop: что выпадает (id), 0 - ничего; по умолчанию - сам блок (item)
  const B = {};
  const BLOCKS = [];
  function def(id, key, name, o) {
    const b = Object.assign({
      id, key, name, render: 'cube', solid: true, hardness: 1, tool: null, level: -1, sound: 'stone',
      light: 0, group: 'build', item: id, drop: undefined, facing: false, creative: true,
    }, o);
    if (typeof b.tex === 'string') b.tex = { all: b.tex };
    BLOCKS[id] = b; B[key] = id;
    return b;
  }
  def(0, 'air', 'Воздух', { render: 'none', solid: false, hardness: 0, creative: false });
  def(1, 'grass', 'Блок травы', { tex: { top: 'grass_top', bottom: 'dirt', side: 'grass_side' }, hardness: 0.6, tool: 'shovel', sound: 'grass', drop: 2, group: 'nature' });
  def(2, 'dirt', 'Земля', { tex: 'dirt', hardness: 0.5, tool: 'shovel', sound: 'gravel', group: 'nature' });
  def(3, 'stone', 'Камень', { tex: 'stone', hardness: 1.5, tool: 'pickaxe', level: 0, drop: 4, group: 'nature' });
  def(4, 'cobblestone', 'Булыжник', { tex: 'cobblestone', hardness: 2, tool: 'pickaxe', level: 0 });
  def(5, 'bedrock', 'Бедрок', { tex: 'bedrock', hardness: -1, group: 'nature' });
  def(6, 'sand', 'Песок', { tex: 'sand', hardness: 0.5, tool: 'shovel', sound: 'sand', group: 'nature' });
  def(7, 'gravel', 'Гравий', { tex: 'gravel', hardness: 0.6, tool: 'shovel', sound: 'gravel', group: 'nature' });
  def(8, 'sandstone', 'Песчаник', { tex: { top: 'sandstone_top', bottom: 'sandstone_bottom', side: 'sandstone_side' }, hardness: 0.8, tool: 'pickaxe', level: 0 });
  def(9, 'oak_log', 'Дубовое бревно', { tex: { top: 'oak_log_top', bottom: 'oak_log_top', side: 'oak_log' }, hardness: 2, tool: 'axe', sound: 'wood', group: 'nature' });
  def(10, 'birch_log', 'Берёзовое бревно', { tex: { top: 'birch_log_top', bottom: 'birch_log_top', side: 'birch_log' }, hardness: 2, tool: 'axe', sound: 'wood', group: 'nature' });
  def(11, 'spruce_log', 'Еловое бревно', { tex: { top: 'spruce_log_top', bottom: 'spruce_log_top', side: 'spruce_log' }, hardness: 2, tool: 'axe', sound: 'wood', group: 'nature' });
  def(12, 'oak_leaves', 'Дубовая листва', { render: 'leaves', tex: 'oak_leaves', fast: 'oak_leaves_fast', hardness: 0.2, sound: 'grass', drop: 0, group: 'nature' });
  def(13, 'birch_leaves', 'Берёзовая листва', { render: 'leaves', tex: 'birch_leaves', fast: 'birch_leaves_fast', hardness: 0.2, sound: 'grass', drop: 0, group: 'nature' });
  def(14, 'spruce_leaves', 'Еловая хвоя', { render: 'leaves', tex: 'spruce_leaves', fast: 'spruce_leaves_fast', hardness: 0.2, sound: 'grass', drop: 0, group: 'nature' });
  def(15, 'oak_planks', 'Дубовые доски', { tex: 'oak_planks', hardness: 2, tool: 'axe', sound: 'wood' });
  def(16, 'birch_planks', 'Берёзовые доски', { tex: 'birch_planks', hardness: 2, tool: 'axe', sound: 'wood' });
  def(17, 'spruce_planks', 'Еловые доски', { tex: 'spruce_planks', hardness: 2, tool: 'axe', sound: 'wood' });
  def(18, 'glass', 'Стекло', { render: 'glass', tex: 'glass', hardness: 0.3, sound: 'glass', drop: 0 });
  def(19, 'bricks', 'Кирпичи', { tex: 'bricks', hardness: 2, tool: 'pickaxe', level: 0 });
  def(20, 'stone_bricks', 'Каменные кирпичи', { tex: 'stone_bricks', hardness: 1.5, tool: 'pickaxe', level: 0 });
  def(21, 'coal_ore', 'Угольная руда', { tex: 'coal_ore', hardness: 3, tool: 'pickaxe', level: 0, drop: 257, group: 'nature' });
  def(22, 'iron_ore', 'Железная руда', { tex: 'iron_ore', hardness: 3, tool: 'pickaxe', level: 1, group: 'nature' });
  def(23, 'gold_ore', 'Золотая руда', { tex: 'gold_ore', hardness: 3, tool: 'pickaxe', level: 2, group: 'nature' });
  def(24, 'diamond_ore', 'Алмазная руда', { tex: 'diamond_ore', hardness: 3, tool: 'pickaxe', level: 2, drop: 261, group: 'nature' });
  def(25, 'water', 'Вода', { render: 'water', tex: 'water', solid: false, hardness: -1, sound: 'water', drop: 0, group: 'nature', creative: false });
  def(26, 'snow_grass', 'Заснеженная трава', { tex: { top: 'snow', bottom: 'dirt', side: 'snow_grass_side' }, hardness: 0.6, tool: 'shovel', sound: 'snow', drop: 2, group: 'nature' });
  def(27, 'snow', 'Снег', { tex: 'snow', hardness: 0.2, tool: 'shovel', level: 0, sound: 'snow', group: 'nature' });
  def(28, 'ice', 'Лёд', { render: 'ice', tex: 'ice', hardness: 0.5, tool: 'pickaxe', sound: 'glass', drop: 0, group: 'nature' });
  def(29, 'cactus', 'Кактус', { tex: { top: 'cactus_top', bottom: 'cactus_bottom', side: 'cactus_side' }, hardness: 0.4, sound: 'cloth', group: 'nature' });
  def(30, 'crafting_table', 'Верстак', { tex: { top: 'table_top', bottom: 'oak_planks', side: 'table_side', front: 'table_front' }, hardness: 2.5, tool: 'axe', sound: 'wood', group: 'tools' });
  def(31, 'furnace', 'Печь', { tex: { top: 'furnace_top', bottom: 'furnace_top', side: 'furnace_side', front: 'furnace_front' }, facing: true, hardness: 3.5, tool: 'pickaxe', level: 0, group: 'tools' });
  // 32..34 - повороты печи (В, Ю, З)
  def(35, 'furnace_lit', 'Горящая печь', { tex: { top: 'furnace_top', bottom: 'furnace_top', side: 'furnace_side', front: 'furnace_front_lit' }, facing: true, hardness: 3.5, tool: 'pickaxe', level: 0, light: 13, item: 31, creative: false });
  // 36..38 - повороты горящей печи
  def(40, 'wool_white', 'Белая шерсть', { tex: 'wool_white', hardness: 0.8, sound: 'cloth', group: 'color' });
  def(41, 'wool_red', 'Красная шерсть', { tex: 'wool_red', hardness: 0.8, sound: 'cloth', group: 'color' });
  def(42, 'wool_blue', 'Синяя шерсть', { tex: 'wool_blue', hardness: 0.8, sound: 'cloth', group: 'color' });
  def(43, 'wool_yellow', 'Жёлтая шерсть', { tex: 'wool_yellow', hardness: 0.8, sound: 'cloth', group: 'color' });
  def(44, 'wool_green', 'Зелёная шерсть', { tex: 'wool_green', hardness: 0.8, sound: 'cloth', group: 'color' });
  def(45, 'wool_black', 'Чёрная шерсть', { tex: 'wool_black', hardness: 0.8, sound: 'cloth', group: 'color' });
  def(46, 'bookshelf', 'Книжная полка', { tex: { top: 'oak_planks', bottom: 'oak_planks', side: 'bookshelf' }, hardness: 1.5, tool: 'axe', sound: 'wood' });
  def(47, 'tall_grass', 'Высокая трава', { render: 'cross', tex: 'tall_grass', solid: false, hardness: 0, sound: 'grass', drop: 0, group: 'nature', replaceable: true });
  def(48, 'dandelion', 'Одуванчик', { render: 'cross', tex: 'dandelion', solid: false, hardness: 0, sound: 'grass', group: 'nature' });
  def(49, 'poppy', 'Мак', { render: 'cross', tex: 'poppy', solid: false, hardness: 0, sound: 'grass', group: 'nature' });
  def(50, 'dead_bush', 'Сухой куст', { render: 'cross', tex: 'dead_bush', solid: false, hardness: 0, sound: 'grass', drop: 0, group: 'nature', replaceable: true });
  def(51, 'torch', 'Факел', { render: 'torch', tex: 'torch', solid: false, hardness: 0, sound: 'wood', light: 14, group: 'tools' });
  // 52..55 - факел на стене (С, В, Ю, З: стена с той стороны)
  def(56, 'clay', 'Глина', { tex: 'clay', hardness: 0.6, tool: 'shovel', sound: 'gravel', group: 'nature' });
  def(57, 'obsidian', 'Обсидиан', { tex: 'obsidian', hardness: 50, tool: 'pickaxe', level: 3 });
  def(58, 'pumpkin', 'Тыква', { tex: { top: 'pumpkin_top', bottom: 'pumpkin_top', side: 'pumpkin_side' }, hardness: 1, tool: 'axe', sound: 'wood', group: 'nature' });
  def(59, 'glowstone', 'Светокамень', { tex: 'glowstone', hardness: 0.3, sound: 'glass', light: 15, group: 'color' });
  def(60, 'mossy_cobblestone', 'Замшелый булыжник', { tex: 'mossy_cobblestone', hardness: 2, tool: 'pickaxe', level: 0 });
  def(61, 'blue_flower', 'Василёк', { render: 'cross', tex: 'blue_flower', solid: false, hardness: 0, sound: 'grass', group: 'nature' });
  // повороты: копии с тем же видом и тем же предметом
  for (const [base, n] of [[31, 1], [35, 1]]) {
    for (let r = 1; r < 4; r++) {
      const src = BLOCKS[base];
      BLOCKS[base + r] = Object.assign({}, src, { id: base + r, key: src.key + '_' + r, item: src.item, creative: false, rot: r });
    }
    BLOCKS[base].rot = 0;
  }
  for (let r = 0; r < 4; r++) {
    BLOCKS[52 + r] = Object.assign({}, BLOCKS[51], { id: 52 + r, key: 'wall_torch_' + r, item: 51, creative: false, wall: r });
  }
  const WALL_TORCH = 52;

  // Быстрые таблицы свойств по id (Uint8Array на 256): мешер и свет читают только их
  const RENDER = new Uint8Array(256);   // 0 нет, 1 куб, 2 листва, 3 стекло, 4 вода, 5 лёд, 6 крест, 7 факел
  const RCODE = { none: 0, cube: 1, leaves: 2, glass: 3, water: 4, ice: 5, cross: 6, torch: 7 };
  const SOLID = new Uint8Array(256);
  const EMIT = new Uint8Array(256);
  const FILTER = new Uint8Array(256);   // сколько света гасит клетка (15 - непрозрачная)
  const TEXF = new Int16Array(256 * 6); // плитка грани: 0 -X,1 +X,2 -Y,3 +Y,4 -Z,5 +Z
  const TEXFAST = new Int16Array(256 * 6);
  // стороны света для поворота: 0 - смотрит на -Z (север), 1 - +X, 2 - +Z, 3 - -X
  const FACE_OF_ROT = [4, 1, 5, 0];
  for (let id = 0; id < 256; id++) {
    const b = BLOCKS[id];
    if (!b) continue;
    RENDER[id] = RCODE[b.render];
    SOLID[id] = b.solid ? 1 : 0;
    EMIT[id] = b.light;
    FILTER[id] = b.render === 'cube' ? 15 : (b.render === 'leaves' || b.render === 'water' || b.render === 'ice') ? 1 : 0;
    for (let f = 0; f < 6; f++) {
      const t = b.tex || {};
      let name = t.all || (f === 3 ? t.top : f === 2 ? t.bottom : t.side);
      if (b.facing && t.front && f === FACE_OF_ROT[b.rot || 0]) name = t.front;
      if (!b.facing && t.front && (f === 4 || f === 5)) name = t.front;   // верстак: «лицо» с двух сторон
      TEXF[id * 6 + f] = name ? T[name] : 0;
      TEXFAST[id * 6 + f] = b.fast ? T[b.fast] : TEXF[id * 6 + f];
    }
  }

  // ---------- Случайность и шум ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash3(x, y, z, s) {
    let h = (s | 0) ^ Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(z | 0, 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
    h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
    h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  }
  // Зерно из строки: число берётся как есть, текст - через хеш (как в оригинале)
  function seedFrom(s) {
    s = String(s == null ? '' : s).trim();
    if (s === '') return (Math.random() * 2147483647) | 0;
    if (/^-?\d+$/.test(s)) return Number(BigInt.asIntN(32, BigInt(s)));
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    return h;
  }

  // Симплекс-шум (по Густавсону), перестановка из зерна
  const G3 = new Float32Array([1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1, 0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1]);
  function makeNoise(seed) {
    const rnd = mulberry32(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
    const perm = new Uint8Array(512), pm12 = new Uint8Array(512);
    for (let i = 0; i < 512; i++) { perm[i] = p[i & 255]; pm12[i] = perm[i] % 12; }
    const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
    function n2(xin, yin) {
      const s = (xin + yin) * F2;
      const i = Math.floor(xin + s), j = Math.floor(yin + s);
      const t = (i + j) * G2;
      const x0 = xin - (i - t), y0 = yin - (j - t);
      const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
      const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
      const ii = i & 255, jj = j & 255;
      let n = 0, tt, g;
      tt = 0.5 - x0 * x0 - y0 * y0;
      if (tt > 0) { g = pm12[ii + perm[jj]] * 3; tt *= tt; n += tt * tt * (G3[g] * x0 + G3[g + 1] * y0); }
      tt = 0.5 - x1 * x1 - y1 * y1;
      if (tt > 0) { g = pm12[ii + i1 + perm[jj + j1]] * 3; tt *= tt; n += tt * tt * (G3[g] * x1 + G3[g + 1] * y1); }
      tt = 0.5 - x2 * x2 - y2 * y2;
      if (tt > 0) { g = pm12[ii + 1 + perm[jj + 1]] * 3; tt *= tt; n += tt * tt * (G3[g] * x2 + G3[g + 1] * y2); }
      return 70 * n;
    }
    const F3 = 1 / 3, G3c = 1 / 6;
    function n3(xin, yin, zin) {
      const s = (xin + yin + zin) * F3;
      const i = Math.floor(xin + s), j = Math.floor(yin + s), k = Math.floor(zin + s);
      const t = (i + j + k) * G3c;
      const x0 = xin - (i - t), y0 = yin - (j - t), z0 = zin - (k - t);
      let i1, j1, k1, i2, j2, k2;
      if (x0 >= y0) {
        if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
        else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
        else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
      } else {
        if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
        else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
        else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      }
      const x1 = x0 - i1 + G3c, y1 = y0 - j1 + G3c, z1 = z0 - k1 + G3c;
      const x2 = x0 - i2 + 2 * G3c, y2 = y0 - j2 + 2 * G3c, z2 = z0 - k2 + 2 * G3c;
      const x3 = x0 - 1 + 0.5, y3 = y0 - 1 + 0.5, z3 = z0 - 1 + 0.5;
      const ii = i & 255, jj = j & 255, kk = k & 255;
      let n = 0, tt, g;
      tt = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
      if (tt > 0) { g = pm12[ii + perm[jj + perm[kk]]] * 3; tt *= tt; n += tt * tt * (G3[g] * x0 + G3[g + 1] * y0 + G3[g + 2] * z0); }
      tt = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
      if (tt > 0) { g = pm12[ii + i1 + perm[jj + j1 + perm[kk + k1]]] * 3; tt *= tt; n += tt * tt * (G3[g] * x1 + G3[g + 1] * y1 + G3[g + 2] * z1); }
      tt = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
      if (tt > 0) { g = pm12[ii + i2 + perm[jj + j2 + perm[kk + k2]]] * 3; tt *= tt; n += tt * tt * (G3[g] * x2 + G3[g + 1] * y2 + G3[g + 2] * z2); }
      tt = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
      if (tt > 0) { g = pm12[ii + 1 + perm[jj + 1 + perm[kk + 1]]] * 3; tt *= tt; n += tt * tt * (G3[g] * x3 + G3[g + 1] * y3 + G3[g + 2] * z3); }
      return 32 * n;
    }
    function fbm2(x, y, oct) {
      let a = 1, f = 1, s = 0, m = 0;
      for (let o = 0; o < oct; o++) { s += a * n2(x * f, y * f); m += a; a *= 0.5; f *= 2; }
      return s / m;
    }
    return { n2, n3, fbm2 };
  }

  // ---------- Биомы и высота ----------
  const BIOMES = ['Равнины', 'Лес', 'Пустыня', 'Снежная тундра', 'Горы', 'Океан', 'Пляж', 'Замёрзший океан'];
  const PLAINS = 0, FOREST = 1, DESERT = 2, SNOWY = 3, MOUNTAINS = 4, OCEAN = 5, BEACH = 6, FROZEN = 7;
  const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  const worlds = new Map();   // кэш шумов по зерну
  function worldOf(seed) {
    let w = worlds.get(seed);
    if (w) return w;
    w = {
      seed,
      cont: makeNoise(seed), det: makeNoise(seed + 11), mnt: makeNoise(seed + 23), rid: makeNoise(seed + 37),
      temp: makeNoise(seed + 41), hum: makeNoise(seed + 53), cave: makeNoise(seed + 67), cave2: makeNoise(seed + 71),
      big: makeNoise(seed + 83), floor: makeNoise(seed + 97),
    };
    worlds.set(seed, w);
    return w;
  }
  // Колонка мира: высота поверхности и биом. Чистая функция зерна и координат.
  function column(w, x, z) {
    const c = w.cont.fbm2(x / 720, z / 720, 4);
    const d = w.det.fbm2(x / 96, z / 96, 4);
    const m0 = w.mnt.fbm2(x / 420 + 31.7, z / 420 - 17.3, 3);
    const r1 = 1 - Math.abs(w.rid.n2(x / 170, z / 170));
    const r2 = 1 - Math.abs(w.rid.n2(x / 70 + 9.1, z / 70 - 3.3));
    const ridge = r1 * r1 * 0.75 + r2 * r2 * 0.25;
    const m = smooth(0.04, 0.4, m0) * smooth(-0.12, 0.1, c);
    let h = SEA + 7 + c * 30 + d * 6 + m * (Math.pow(ridge, 1.6) * 58 + d * 8);
    h = Math.max(4, Math.min(CH - 12, Math.floor(h)));
    let temp = w.temp.fbm2(x / 820 + 500, z / 820 - 300, 3) * 1.6;
    if (h > SEA + 34) temp -= (h - SEA - 34) / 30;
    const hum = w.hum.fbm2(x / 610 - 800, z / 610 + 200, 3) * 1.6;
    let biome;
    if (h < SEA - 1) biome = temp < -0.45 ? FROZEN : OCEAN;
    else if (m > 0.55 && h > SEA + 26) biome = MOUNTAINS;
    else if (temp < -0.35) biome = SNOWY;
    else if (h <= SEA + 1) biome = BEACH;
    else if (temp > 0.3 && hum < 0.1) biome = DESERT;
    else if (hum > 0.05) biome = FOREST;
    else biome = PLAINS;
    return { h, biome, m };
  }

  // Какое дерево растёт в колонке (0 - нет). Нужна и соседним кускам: крона переходит границу.
  function treeAt(w, x, z, col) {
    const r = hash3(x, 7, z, w.seed ^ 0x5bd1e995);
    const b = col.biome, h = col.h;
    if (h <= SEA) return 0;
    if (b === FOREST) return r < 1 / 26 ? (hash3(x, 9, z, w.seed) < 0.3 ? 2 : 1) : 0;
    if (b === PLAINS) return r < 1 / 320 ? 1 : 0;
    if (b === SNOWY) return r < 1 / 45 ? 3 : 0;
    if (b === MOUNTAINS) return (h <= SEA + 40 && r < 1 / 120) ? 3 : 0;
    if (b === DESERT) return r < 1 / 140 ? 4 : 0;       // кактус
    return 0;
  }

  // ---------- Генерация куска ----------
  function generate(seed, cx, cz) {
    const w = worldOf(seed);
    const data = new Uint8Array(CVOL);
    const X0 = cx * CS, Z0 = cz * CS;
    const M = 3, W = CS + 2 * M;
    const cols = new Array(W * W);
    for (let dz = 0; dz < W; dz++) for (let dx = 0; dx < W; dx++) cols[dx + dz * W] = column(w, X0 + dx - M, Z0 + dz - M);
    const colAt = (lx, lz) => cols[(lx + M) + (lz + M) * W];
    const set = (x, y, z, id) => { if (x >= 0 && x < CS && z >= 0 && z < CS && y > 0 && y < CH) data[cidx(x, y, z)] = id; };
    const get = (x, y, z) => data[cidx(x, y, z)];

    // рельеф
    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      const col = colAt(x, z), h = col.h, bi = col.biome;
      const wx = X0 + x, wz = Z0 + z;
      data[cidx(x, 0, z)] = B.bedrock;
      for (let y = 1; y <= 4; y++) if (hash3(wx, y, wz, seed) < 0.9 - y * 0.2) data[cidx(x, y, z)] = B.bedrock;
      let top = B.grass, fill = B.dirt, depth = 3 + ((hash3(wx, 1, wz, seed + 5) * 2) | 0), under = 0;
      if (bi === DESERT) { top = B.sand; fill = B.sand; depth = 4; under = B.sandstone; }
      else if (bi === SNOWY) { top = B.snow_grass; }
      else if (bi === BEACH) { top = B.sand; fill = B.sand; under = B.sandstone; }
      else if (bi === MOUNTAINS) {
        if (h > SEA + 58) { top = B.snow; fill = B.stone; depth = 1; }
        else if (h > SEA + 40) { top = B.stone; fill = B.stone; }
      } else if (bi === OCEAN || bi === FROZEN) {
        const f = w.floor.n2(wx / 24, wz / 24);
        top = h > SEA - 7 ? B.sand : f > 0.35 ? B.gravel : f < -0.55 ? B.clay : B.dirt;
        fill = top === B.clay ? B.clay : B.dirt === top ? B.dirt : top;
      }
      for (let y = 1; y <= h; y++) {
        const i = cidx(x, y, z);
        if (data[i]) continue;
        if (y === h) data[i] = top;
        else if (y > h - depth) data[i] = fill;
        else if (under && y > h - depth - 3) data[i] = under;
        else data[i] = B.stone;
      }
      if (h < SEA) {
        for (let y = h + 1; y <= SEA; y++) data[cidx(x, y, z)] = B.water;
        if (bi === FROZEN) data[cidx(x, SEA, z)] = B.ice;
      }
    }
    // пещеры: пересечение двух полос 3D-шума даёт извилистые ходы, редкие залы глубже
    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      const col = colAt(x, z), h = col.h;
      const wx = X0 + x, wz = Z0 + z;
      const wet = h <= SEA + 2;
      const treeCol = treeAt(w, wx, wz, col) !== 0;
      const ymax = wet ? Math.min(h - 7, SEA - 8) : treeCol ? h - 3 : h;
      for (let y = 5; y <= ymax; y++) {
        const a = w.cave.n3(wx / 42, y / 26, wz / 42);
        const b2 = w.cave2.n3(wx / 42, y / 26, wz / 42);
        let carve = a * a + b2 * b2 < 0.0042 * (y < 20 ? 1.6 : 1);
        if (!carve && y < 40) carve = w.big.n3(wx / 64, y / 30, wz / 64) > 0.66;
        if (carve) {
          const i = cidx(x, y, z);
          if (data[i] !== B.bedrock && data[i] !== B.water) data[i] = 0;
        }
      }
    }
    // руда: жилы, начатые в этом куске
    const ores = [[B.coal_ore, 18, 12, 6, 110], [B.iron_ore, 10, 8, 5, 64], [B.gold_ore, 3, 7, 5, 32], [B.diamond_ore, 2, 5, 5, 16], [B.gravel, 6, 16, 8, 90], [B.dirt, 5, 16, 10, 100]];
    const orng = mulberry32((seed ^ Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663)) | 0);
    for (const [id, count, size, ymin, ymaxO] of ores) {
      for (let v = 0; v < count; v++) {
        let x = (orng() * CS) | 0, z = (orng() * CS) | 0, y = ymin + ((orng() * (ymaxO - ymin)) | 0);
        const n = 1 + ((orng() * size) | 0);
        for (let k = 0; k < n; k++) {
          if (x >= 0 && x < CS && z >= 0 && z < CS && y > 0 && y < CH && data[cidx(x, y, z)] === B.stone) data[cidx(x, y, z)] = id;
          const d = (orng() * 6) | 0;
          if (d === 0) x++; else if (d === 1) x--; else if (d === 2) z++; else if (d === 3) z--; else if (d === 4) y++; else y--;
        }
      }
    }
    // растения на поверхности
    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      const col = colAt(x, z), h = col.h;
      if (h >= CH - 2 || h <= SEA) continue;
      const wx = X0 + x, wz = Z0 + z;
      const topId = get(x, h, z);
      if (get(x, h + 1, z) !== 0) continue;
      const r = hash3(wx, 3, wz, seed + 131);
      if (topId === B.grass) {
        const bi = col.biome;
        const pg = bi === PLAINS ? 0.16 : bi === FOREST ? 0.07 : 0.03;
        if (r < pg) data[cidx(x, h + 1, z)] = B.tall_grass;
        else if (r < pg + 0.012) data[cidx(x, h + 1, z)] = B.dandelion;
        else if (r < pg + 0.022) data[cidx(x, h + 1, z)] = B.poppy;
        else if (r < pg + 0.026) data[cidx(x, h + 1, z)] = B.blue_flower;
        else if (bi === PLAINS && r > 0.9993) data[cidx(x, h + 1, z)] = B.pumpkin;
      } else if (topId === B.sand && col.biome === DESERT && r < 0.012) data[cidx(x, h + 1, z)] = B.dead_bush;
    }
    // деревья: свои и соседские, чья крона доходит до куска
    for (let dz = -M; dz < CS + M; dz++) for (let dx = -M; dx < CS + M; dx++) {
      const col = colAt(dx, dz);
      const wx = X0 + dx, wz = Z0 + dz;
      const kind = treeAt(w, wx, wz, col);
      if (!kind) continue;
      const h = col.h;
      if (dx >= 0 && dx < CS && dz >= 0 && dz < CS) {
        const top = get(dx, h, dz);
        const need = kind === 4 ? B.sand : kind === 3 ? -1 : B.grass;
        if (need > 0 && top !== need) continue;
        if (need < 0 && top !== B.grass && top !== B.snow_grass) continue;
      }
      const rnd = mulberry32((seed ^ Math.imul(wx, 668265263) ^ Math.imul(wz, 374761393)) | 0);
      const base = h + 1;
      if (kind === 4) {
        const th = 1 + ((rnd() * 3) | 0);
        for (let k = 0; k < th; k++) set(dx, base + k, dz, B.cactus);
        continue;
      }
      const log = kind === 1 ? B.oak_log : kind === 2 ? B.birch_log : B.spruce_log;
      const leaf = kind === 1 ? B.oak_leaves : kind === 2 ? B.birch_leaves : B.spruce_leaves;
      const putLeaf = (x, y, z) => { if (x >= 0 && x < CS && z >= 0 && z < CS && y > 0 && y < CH) { const i = cidx(x, y, z); const c = data[i]; if (c === 0 || c === B.tall_grass || c === B.snow) data[i] = leaf; } };
      if (kind === 3) {
        const th = 6 + ((rnd() * 4) | 0);
        const pat = [0, 1, 1, 2, 1, 2, 3, 2, 3];
        for (let k = 0, y = base + th; y >= base + 2; y--, k++) {
          const rad = Math.min(pat[Math.min(k, pat.length - 1)], 2 + (th > 7 ? 1 : 0));
          for (let ox = -rad; ox <= rad; ox++) for (let oz = -rad; oz <= rad; oz++) {
            if (rad > 1 && Math.abs(ox) === rad && Math.abs(oz) === rad) continue;
            if (rad === 1 && Math.abs(ox) === 1 && Math.abs(oz) === 1 && k > 1) continue;
            putLeaf(dx + ox, y, dz + oz);
          }
        }
        putLeaf(dx, base + th + 1, dz);
        for (let k = 0; k < th; k++) set(dx, base + k, dz, log);
      } else {
        const th = (kind === 2 ? 5 : 4) + ((rnd() * 3) | 0);
        for (let y = base + th - 3; y <= base + th; y++) {
          const top2 = y >= base + th - 1;
          const rad = top2 ? 1 : 2;
          for (let ox = -rad; ox <= rad; ox++) for (let oz = -rad; oz <= rad; oz++) {
            const corner = Math.abs(ox) === rad && Math.abs(oz) === rad;
            if (corner && (top2 || rnd() < 0.5)) continue;
            if (y === base + th && corner) continue;
            if (y === base + th && (ox !== 0 && oz !== 0)) continue;
            putLeaf(dx + ox, y, dz + oz);
          }
        }
        for (let k = 0; k < th; k++) set(dx, base + k, dz, log);
        if (dx >= 0 && dx < CS && dz >= 0 && dz < CS) data[cidx(dx, h, dz)] = B.dirt;
      }
    }
    return data;
  }

  // Контрольная сумма куска (FNV-1a) - для законов «одно зерно - один мир»
  function checksum(data) {
    let h = 0x811c9dc5;
    for (let i = 0; i < data.length; i++) { h ^= data[i]; h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }

  // Точка появления: ближайшая к началу суша без воды над ней
  function findSpawn(seed) {
    const w = worldOf(seed);
    // сперва открытая местность (равнины, пустыня, тундра), потом любая суша
    for (const open of [true, false]) {
      for (let r = 0; r < 600; r += 4) {
        const n = Math.max(1, Math.floor(r * 0.8));
        for (let a = 0; a < n; a++) {
          const ang = a / n * Math.PI * 2;
          const x = Math.round(Math.cos(ang) * r), z = Math.round(Math.sin(ang) * r);
          const c = column(w, x, z);
          if (c.h <= SEA + 1 || c.h >= SEA + 30 || c.biome === OCEAN || c.biome === FROZEN) continue;
          if (open && c.biome !== PLAINS && c.biome !== DESERT && c.biome !== SNOWY && c.biome !== BEACH) continue;
          let clear = true;
          for (let dz = -3; dz <= 3 && clear; dz++) for (let dx = -3; dx <= 3 && clear; dx++) if (treeAt(w, x + dx, z + dz, column(w, x + dx, z + dz))) clear = false;
          if (clear) return { x, z, h: c.h };
        }
      }
    }
    return { x: 0, z: 0, h: column(w, 0, 0).h };
  }

  // ---------- Сборка сетки куска ----------
  // Область 3x3 куска (48x48xCH), свет считается в ней целиком: заливка от неба и от
  // источников света. Грани - только видимые; у каждой вершины - затенение углов (AO),
  // свет неба и свет факелов (мягкое освещение), яркость грани по направлению.
  const RW = CS * 3, RA = RW * RW, RVOL = RA * CH;
  const ridx = (x, y, z) => x + z * RW + y * RA;
  // грани: нормаль, начало, два ребра (e1 x e2 = нормаль)
  const FACES = [
    { n: [-1, 0, 0], o: [0, 0, 0], e1: [0, 0, 1], e2: [0, 1, 0], shade: 0.6 },
    { n: [1, 0, 0], o: [1, 0, 1], e1: [0, 0, -1], e2: [0, 1, 0], shade: 0.6 },
    { n: [0, -1, 0], o: [0, 0, 0], e1: [1, 0, 0], e2: [0, 0, 1], shade: 0.5 },
    { n: [0, 1, 0], o: [0, 1, 1], e1: [1, 0, 0], e2: [0, 0, -1], shade: 1.0 },
    { n: [0, 0, -1], o: [1, 0, 0], e1: [-1, 0, 0], e2: [0, 1, 0], shade: 0.8 },
    { n: [0, 0, 1], o: [0, 0, 1], e1: [1, 0, 0], e2: [0, 1, 0], shade: 0.8 },
  ];
  // для каждой грани и вершины - угол (0/1 по осям) и сдвиги соседей для AO
  const VERT = FACES.map((f) => {
    const vs = [];
    for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const p = [0, 1, 2].map((k) => f.o[k] + f.e1[k] * a + f.e2[k] * b);
      // стороны: по осям e1, e2 в сторону угла
      const s1 = [0, 1, 2].map((k) => f.e1[k] * (a ? 1 : -1));
      const s2 = [0, 1, 2].map((k) => f.e2[k] * (b ? 1 : -1));
      vs.push({ p, u: a, v: b, s1, s2 });
    }
    return vs;
  });

  function Buf() {
    // позиция - обычные float32: целочисленные 16-битные форматы Direct3D 11 не читает как дробные,
    // и ANGLE перекладывал бы каждый новый буфер на процессоре - заметные рывки при подгрузке
    this.pos = new Float32Array(4096 * 3); this.uv = new Uint16Array(4096 * 2); this.light = new Uint8Array(4096 * 4);
    this.index = new Uint32Array(4096 * 1.5); this.nv = 0; this.ni = 0; this.quads = 0;
  }
  Buf.prototype.grow = function (nv) {
    if (this.nv + nv <= this.pos.length / 3) return;
    const cap = Math.max(this.pos.length / 3 * 2, this.nv + nv);
    const p = new Float32Array(cap * 3); p.set(this.pos); this.pos = p;
    const u = new Uint16Array(cap * 2); u.set(this.uv); this.uv = u;
    const l = new Uint8Array(cap * 4); l.set(this.light); this.light = l;
    const ix = new Uint32Array(cap * 1.5); ix.set(this.index); this.index = ix;
  };
  Buf.prototype.out = function () {
    const nv = this.nv, ni = this.ni;
    const index = nv < 65536 ? Uint16Array.from(this.index.subarray(0, ni)) : this.index.slice(0, ni);
    return { pos: this.pos.slice(0, nv * 3), uv: this.uv.slice(0, nv * 2), light: this.light.slice(0, nv * 4), index, quads: this.quads };
  };

  const TW = 1 / ATLAS_COLS, TH = 1 / ATLAS_ROWS;
  const UVE = 0.0005;
  function tileUV(t, u, v) {
    // u, v - доли плитки 0..1 (v = 0 внизу плитки)
    const col = t % ATLAS_COLS, row = (t / ATLAS_COLS) | 0;
    const U = (col + UVE + u * (1 - 2 * UVE)) * TW;
    const V = 1 - (row + 1 - UVE - v * (1 - 2 * UVE)) * TH;
    return [Math.round(U * 65535), Math.round(V * 65535)];
  }

  function buildMesh(chunks, opt) {
    // chunks: 9 массивов (dx+1)+(dz+1)*3, центр - 4
    const fancy = !opt || opt.fancy !== false;
    const smoothL = !opt || opt.smooth !== false;
    const R = new Uint8Array(RVOL);
    for (let k = 0; k < 9; k++) {
      const src = chunks[k];
      if (!src) continue;
      const ox = (k % 3) * CS, oz = ((k / 3) | 0) * CS;
      for (let y = 0; y < CH; y++) for (let z = 0; z < CS; z++) {
        const s = (y << 8) | (z << 4), d = ox + (oz + z) * RW + y * RA;
        R.set(src.subarray(s, s + CS), d);
      }
    }
    const sky = new Uint8Array(RVOL), blk = new Uint8Array(RVOL);
    // свет неба: над первой «гасящей» клеткой колонки - 15, дальше заливка
    const tops = new Int16Array(RA);
    for (let c = 0; c < RA; c++) {
      let y = CH - 1;
      while (y >= 0 && FILTER[R[c + y * RA]] === 0) { sky[c + y * RA] = 15; y--; }
      tops[c] = y;
    }
    const Q = new Int32Array(RVOL);
    let qh = 0, qt = 0, qn = 0;
    for (let z = 0; z < RW; z++) for (let x = 0; x < RW; x++) {
      const c = x + z * RW;
      let hi = tops[c];
      if (x > 0) hi = Math.max(hi, tops[c - 1]);
      if (x < RW - 1) hi = Math.max(hi, tops[c + 1]);
      if (z > 0) hi = Math.max(hi, tops[c - RW]);
      if (z < RW - 1) hi = Math.max(hi, tops[c + RW]);
      for (let y = tops[c] + 1; y <= hi + 1 && y < CH; y++) { Q[qt++] = c + y * RA; qn++; }
    }
    function flood(L, isSky) {
      while (qn > 0) {
        const i = Q[qh]; qh = qh + 1 === RVOL ? 0 : qh + 1; qn--;
        const l = L[i];
        if (l <= 1) continue;
        const y = (i / RA) | 0, r = i - y * RA, z = (r / RW) | 0, x = r - z * RW;
        for (let d = 0; d < 6; d++) {
          let j;
          if (d === 0) { if (x === 0) continue; j = i - 1; }
          else if (d === 1) { if (x === RW - 1) continue; j = i + 1; }
          else if (d === 2) { if (z === 0) continue; j = i - RW; }
          else if (d === 3) { if (z === RW - 1) continue; j = i + RW; }
          else if (d === 4) { if (y === 0) continue; j = i - RA; }
          else { if (y === CH - 1) continue; j = i + RA; }
          const f = FILTER[R[j]];
          if (f >= 15) continue;
          const nl = (isSky && d === 4 && l === 15 && f === 0) ? 15 : l - (f > 1 ? f : 1);
          if (nl > L[j]) { L[j] = nl; Q[qt] = j; qt = qt + 1 === RVOL ? 0 : qt + 1; qn++; }
        }
      }
    }
    flood(sky, true);
    qh = 0; qt = 0; qn = 0;
    for (let i = 0; i < RVOL; i++) { const e = EMIT[R[i]]; if (e) { blk[i] = e; Q[qt++] = i; qn++; } }
    flood(blk, false);

    const opaque = new Buf(), trans = new Buf();
    const texT = fancy ? TEXF : TEXFAST;
    const isOpq = (id) => { const r = RENDER[id]; return r === 1 || (r === 2 && !fancy); };
    const isAO = (id) => { const r = RENDER[id]; return r === 1 || r === 2; };
    let maxY = 0;
    for (let y = CH - 1; y >= 0 && !maxY; y--) for (let z = CS; z < 2 * CS && !maxY; z++) for (let x = CS; x < 2 * CS; x++) if (R[ridx(x, y, z)]) { maxY = y; break; }

    function emitQuad(buf, verts, t, shade, lights, flip) {
      buf.grow(4);
      const base = buf.nv;
      for (let k = 0; k < 4; k++) {
        const vv = verts[k];
        const o = (base + k) * 3;
        buf.pos[o] = vv[0] / 16; buf.pos[o + 1] = vv[1] / 16; buf.pos[o + 2] = vv[2] / 16;
        const uv = tileUV(t, vv[3], vv[4]);
        buf.uv[(base + k) * 2] = uv[0]; buf.uv[(base + k) * 2 + 1] = uv[1];
        const L = lights[k];
        buf.light[(base + k) * 4] = L[0]; buf.light[(base + k) * 4 + 1] = L[1]; buf.light[(base + k) * 4 + 2] = L[2]; buf.light[(base + k) * 4 + 3] = (shade * 255) | 0;
      }
      const ix = buf.index;
      let n = buf.ni;
      if (flip) { ix[n++] = base; ix[n++] = base + 1; ix[n++] = base + 3; ix[n++] = base; ix[n++] = base + 3; ix[n++] = base + 2; }
      else { ix[n++] = base; ix[n++] = base + 1; ix[n++] = base + 2; ix[n++] = base + 2; ix[n++] = base + 1; ix[n++] = base + 3; }
      buf.ni = n; buf.nv += 4; buf.quads++;
    }

    const verts = [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0]];
    const lights = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];
    const cellLight = (i) => [sky[i] * 17, blk[i] * 17, 255];

    for (let y = 0; y <= Math.min(maxY, CH - 1); y++) for (let z = CS; z < 2 * CS; z++) for (let x = CS; x < 2 * CS; x++) {
      const i = ridx(x, y, z);
      const id = R[i];
      if (!id) continue;
      const rc = RENDER[id];
      const lx = x - CS, lz = z - CS;
      if (rc === 6) {      // крест из двух плоскостей, с двух сторон
        const t = TEXF[id * 6];
        const L = cellLight(i);
        for (let k = 0; k < 4; k++) lights[k] = L;
        const X = lx * 16, Y = y * 16, Z = lz * 16;
        const planes = [[[1.5, 1.5], [14.5, 14.5]], [[14.5, 1.5], [1.5, 14.5]]];
        for (const [[ax, az], [bx, bz]] of planes) {
          for (const back of [false, true]) {
            const A = back ? [bx, bz] : [ax, az], Bp = back ? [ax, az] : [bx, bz];
            verts[0] = [X + A[0], Y, Z + A[1], 0, 0]; verts[1] = [X + Bp[0], Y, Z + Bp[1], 1, 0];
            verts[2] = [X + A[0], Y + 16, Z + A[1], 0, 1]; verts[3] = [X + Bp[0], Y + 16, Z + Bp[1], 1, 1];
            emitQuad(opaque, verts, t, 0.9, lights, false);
          }
        }
        continue;
      }
      if (rc === 7) {      // факел: столбик 2x10 пикселей, на стене - с наклоном
        const t = TEXF[id * 6];
        const L = cellLight(i);
        for (let k = 0; k < 4; k++) lights[k] = [L[0], Math.max(L[1], 14 * 17), 255];
        const wall = BLOCKS[id].wall;
        let bx = 7, bz = 7, tx = 0, tz = 0, by = 0;
        if (wall !== undefined) {
          const dir = [[0, -1], [1, 0], [0, 1], [-1, 0]][wall];   // где стена
          bx = 7 + dir[0] * 7; bz = 7 + dir[1] * 7; tx = -dir[0] * 4; tz = -dir[1] * 4; by = 3;
        }
        const X = lx * 16, Y = y * 16 + by, Z = lz * 16;
        const box = (ox, oz, top) => [X + ox + (top ? tx : 0), Y + (top ? 10 : 0), Z + oz + (top ? tz : 0)];
        const side = (a, b, ua, ub) => {
          verts[0] = box(a[0], a[1], false).concat([ua, 0]); verts[1] = box(b[0], b[1], false).concat([ub, 0]);
          verts[2] = box(a[0], a[1], true).concat([ua, 10 / 16]); verts[3] = box(b[0], b[1], true).concat([ub, 10 / 16]);
          emitQuad(opaque, verts, t, 0.9, lights, false);
        };
        side([bx, bz], [bx, bz + 2], 7 / 16, 9 / 16);           // -X
        side([bx + 2, bz + 2], [bx + 2, bz], 7 / 16, 9 / 16);   // +X
        side([bx + 2, bz], [bx, bz], 7 / 16, 9 / 16);           // -Z
        side([bx, bz + 2], [bx + 2, bz + 2], 7 / 16, 9 / 16);   // +Z
        verts[0] = box(bx, bz + 2, true).concat([7 / 16, 8 / 16]); verts[1] = box(bx + 2, bz + 2, true).concat([9 / 16, 8 / 16]);
        verts[2] = box(bx, bz, true).concat([7 / 16, 10 / 16]); verts[3] = box(bx + 2, bz, true).concat([9 / 16, 10 / 16]);
        emitQuad(opaque, verts, t, 1, lights, false);
        continue;
      }
      const buf = (rc === 4 || rc === 5) ? trans : opaque;
      const waterTop = rc === 4 && R[i + RA] !== B.water && y < CH - 1;
      for (let f = 0; f < 6; f++) {
        const F = FACES[f];
        const nx = x + F.n[0], ny = y + F.n[1], nz = z + F.n[2];
        if (ny < 0) continue;
        const nid = ny >= CH ? 0 : R[ridx(nx, ny, nz)];
        // видна ли грань
        if (isOpq(nid)) continue;
        if ((rc === 3 || rc === 4 || rc === 5) && nid === id) continue;
        if (rc === 4 && (nid === B.ice)) continue;
        if (rc === 2 && fancy === false && RENDER[nid] === 2) continue;
        const t = texT[id * 6 + f];
        const ni = ny >= CH ? -1 : ridx(nx, ny, nz);
        const vs = VERT[f];
        let bsum = [0, 0, 0, 0];
        for (let k = 0; k < 4; k++) {
          const V = vs[k];
          let py = (y + V.p[1]) * 16;
          if (waterTop && V.p[1] === 1) py -= 2;
          verts[k] = [(lx + V.p[0]) * 16, py, (lz + V.p[2]) * 16, V.u, V.v];
          if (waterTop && f !== 3 && f !== 2 && V.v === 1) verts[k][4] = 14 / 16;
          let s = 0, b = 0, ao = 3;
          if (ni < 0) { s = 15; b = 0; }
          else if (!smoothL) { s = sky[ni]; b = blk[ni]; }
          else {
            const ax = nx + V.s1[0], ay = ny + V.s1[1], az = nz + V.s1[2];
            const bx2 = nx + V.s2[0], by2 = ny + V.s2[1], bz2 = nz + V.s2[2];
            const cx2 = nx + V.s1[0] + V.s2[0], cy2 = ny + V.s1[1] + V.s2[1], cz2 = nz + V.s1[2] + V.s2[2];
            const inR = (X, Y, Z) => X >= 0 && X < RW && Z >= 0 && Z < RW && Y >= 0 && Y < CH;
            const i1 = inR(ax, ay, az) ? ridx(ax, ay, az) : -1;
            const i2 = inR(bx2, by2, bz2) ? ridx(bx2, by2, bz2) : -1;
            const i3 = inR(cx2, cy2, cz2) ? ridx(cx2, cy2, cz2) : -1;
            const o1 = i1 >= 0 && isAO(R[i1]), o2 = i2 >= 0 && isAO(R[i2]), o3 = i3 >= 0 && isAO(R[i3]);
            ao = (o1 && o2) ? 0 : 3 - ((o1 ? 1 : 0) + (o2 ? 1 : 0) + (o3 ? 1 : 0));
            let n = 1; s = sky[ni]; b = blk[ni];
            const add = (j, opq) => { if (j >= 0 && !opq && FILTER[R[j]] < 15) { s += sky[j]; b += blk[j]; n++; } };
            add(i1, o1); add(i2, o2); if (!(o1 && o2)) add(i3, o3);
            s /= n; b /= n;
          }
          const L = lights[k];
          L[0] = Math.round(s * 17); L[1] = Math.round(b * 17); L[2] = ao * 85;
          bsum[k] = (Math.max(s, b) + 1) * (ao + 1);
        }
        const flip = bsum[0] + bsum[3] > bsum[1] + bsum[2];
        emitQuad(buf, verts, t, F.shade, lights, flip);
      }
    }
    return { opaque: opaque.out(), trans: trans.out() };
  }

  // Упаковка куска для хранения: пары (длина, значение)
  function rleEncode(d) {
    const out = [];
    let i = 0;
    while (i < d.length) {
      const v = d[i]; let n = 1;
      while (i + n < d.length && d[i + n] === v && n < 255) n++;
      out.push(n, v); i += n;
    }
    return Uint8Array.from(out);
  }
  function rleDecode(r) {
    const d = new Uint8Array(CVOL);
    let p = 0;
    for (let i = 0; i < r.length; i += 2) { d.fill(r[i + 1], p, p + r[i]); p += r[i]; }
    return d;
  }

  return {
    CS, CH, SEA, CVOL, cidx, TILES, T, ATLAS_COLS, ATLAS_ROWS, BLOCKS, B, RENDER, SOLID, EMIT, FILTER, TEXF, WALL_TORCH, FACE_OF_ROT,
    BIOMES, mulberry32, hash3, seedFrom, makeNoise, worldOf, column, treeAt, generate, checksum, findSpawn, buildMesh, rleEncode, rleDecode,
  };
}
if (typeof module !== 'undefined') module.exports = VoxelCore;
