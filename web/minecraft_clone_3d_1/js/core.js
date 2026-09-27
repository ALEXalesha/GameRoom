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
    'lava', 'fire', 'farmland', 'wheat_0', 'wheat_1', 'wheat_2', 'wheat_3', 'wheat_4',
    'door_wood_lower', 'door_wood_upper', 'door_iron_lower', 'door_iron_upper', 'chest_top', 'chest_side', 'chest_front', 'bed_head_top',
    'bed_foot_top', 'bed_side_head', 'bed_side_foot', 'lever', 'water_flow',
    'trapdoor', 'iron_trapdoor', 'ladder',
    'netherrack', 'soul_sand', 'nether_bricks', 'quartz_ore', 'portal', 'nether_wart_0', 'nether_wart_1', 'nether_wart_2', 'spawner',
    'dust_0', 'dust_1', 'dust_2', 'dust_3', 'redstone_torch_on', 'redstone_torch_off', 'repeater', 'lamp_off', 'lamp_on',
    'piston_top', 'piston_top_sticky', 'piston_side', 'piston_bottom', 'piston_inner', 'redstone_ore', 'redstone_block',
    'sugar_cane', 'emerald_ore', 'lapis_ore', 'path_top', 'path_side',
    'ench_top', 'ench_side', 'anvil_top', 'anvil_side', 'iron_block',
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
  // ---- третий заход: огонь, грядка, пшеница, жидкости с уровнями, двери, сундук, кровать, рычаг
  const ITEM_DOOR_WOOD = 349, ITEM_DOOR_IRON = 350, ITEM_BED = 351;       // предметы (см. data.js)
  def(62, 'fire', 'Огонь', { render: 'cross', tex: 'fire', solid: false, hardness: 0, light: 15, drop: 0, creative: false, sound: 'wood' });
  def(63, 'farmland', 'Грядка', { render: 'box', shape: [[0, 0, 0, 16, 15, 16]], tex: { top: 'farmland', bottom: 'dirt', side: 'dirt' }, hardness: 0.6, tool: 'shovel', sound: 'gravel', drop: 2, group: 'nature' });
  for (let st = 0; st < 8; st++) def(64 + st, 'wheat_' + st, 'Пшеница', { render: 'crop', tex: 'wheat_' + [0, 0, 1, 1, 2, 2, 3, 4][st], solid: false, hardness: 0, sound: 'grass', creative: false, crop: st, drop: 0 });
  // вода: 25 - источник, 72..78 - течение уровней 1..7, 79 - падающая; лава: 80 - источник, 81..83 - уровни 2, 4, 6, 84 - падающая
  const water = { render: 'water', tex: 'water', solid: false, hardness: -1, sound: 'water', drop: 0, creative: false, fluid: 1 };
  BLOCKS[25].fluid = 1; BLOCKS[25].level = 0;
  for (let l = 1; l <= 7; l++) def(71 + l, 'water_' + l, 'Вода', Object.assign({}, water, { tex: 'water_flow', level: l }));
  def(79, 'water_fall', 'Вода', Object.assign({}, water, { tex: 'water_flow', level: 0, falling: true }));
  const lava = { render: 'lava', tex: 'lava', solid: false, hardness: -1, sound: 'water', drop: 0, creative: false, fluid: 2, light: 15, level: 0 };
  def(80, 'lava', 'Лава', lava);
  for (let l = 1; l <= 3; l++) def(80 + l, 'lava_' + l, 'Лава', Object.assign({}, lava, { level: l * 2 }));
  def(84, 'lava_fall', 'Лава', Object.assign({}, lava, { falling: true }));
  // двери: id = начало + край*4 + открыта*2 + верх; край - сторона клетки, у которой стоит закрытая створка
  const PLATE = [[0, 0, 0, 16, 16, 3], [13, 0, 0, 16, 16, 16], [0, 0, 13, 16, 16, 16], [0, 0, 0, 3, 16, 16]];
  const DOOR_WOOD = 86, DOOR_IRON = 102;
  for (const [base, kind, name, o] of [[DOOR_WOOD, 'wood', 'Деревянная дверь', { hardness: 3, tool: 'axe', sound: 'wood' }], [DOOR_IRON, 'iron', 'Железная дверь', { hardness: 5, tool: 'pickaxe', level: 0, sound: 'stone' }]]) {
    for (let e = 0; e < 4; e++) for (let op = 0; op < 2; op++) for (let up = 0; up < 2; up++) {
      const id = base + e * 4 + op * 2 + up;
      def(id, 'door_' + kind + '_' + id, name, Object.assign({ render: 'box', shape: [PLATE[op ? (e + 1) % 4 : e]], tex: 'door_' + kind + (up ? '_upper' : '_lower'),
        creative: false, door: kind, edge: e, open: !!op, upper: !!up, drop: up ? 0 : (kind === 'wood' ? ITEM_DOOR_WOOD : ITEM_DOOR_IRON) }, o));
    }
  }
  def(118, 'chest', 'Сундук', { render: 'box', shape: [[1, 0, 1, 15, 14, 15]], tex: { top: 'chest_top', bottom: 'chest_top', side: 'chest_side', front: 'chest_front' }, facing: true, hardness: 2.5, tool: 'axe', sound: 'wood', group: 'tools' });
  // кровать: ноги 122+dir, изголовье 126+dir; dir - куда смотрел игрок (0 -Z, 1 -X, 2 +Z, 3 +X), изголовье дальше
  for (let d = 0; d < 4; d++) for (let hd = 0; hd < 2; hd++) {
    def(122 + hd * 4 + d, 'bed_' + (hd ? 'head_' : 'foot_') + d, 'Кровать', { render: 'box', shape: [[0, 0, 0, 16, 9, 16]], rot: d,
      tex: { top: hd ? 'bed_head_top' : 'bed_foot_top', bottom: 'oak_planks', side: hd ? 'bed_side_head' : 'bed_side_foot' }, hardness: 0.2, sound: 'cloth', creative: false, bed: true, bedDir: d, bedHead: !!hd, drop: hd ? 0 : ITEM_BED });
  }
  def(130, 'lever', 'Рычаг', { render: 'box', shape: [[5, 0, 4, 11, 2, 12, 'cobblestone'], [6, 2, 7, 8, 11, 9, 'lever']], tex: 'lever', solid: false, hardness: 0.5, sound: 'wood', group: 'tools' });
  def(131, 'lever_on', 'Рычаг', { render: 'box', shape: [[5, 0, 4, 11, 2, 12, 'cobblestone'], [8, 2, 7, 10, 11, 9, 'lever']], tex: 'lever', solid: false, hardness: 0.5, sound: 'wood', creative: false, item: 130, drop: 130 });
  BLOCKS[29].render = 'box'; BLOCKS[29].shape = [[1, 0, 1, 15, 16, 15]];      // кактус чуть уже клетки: его можно коснуться

  // ---- четвёртый заход: строительные формы (id от 1024). Порядок не менять: id хранятся в мирах
  // стороны dir: 0 -Z, 1 -X, 2 +Z, 3 +X (куда смотрел игрок при установке)
  const swapXZ = (b) => { const r = [b[2], b[1], b[0], b[5], b[4], b[3]]; if (b[6]) r.push(b[6]); return r; };
  const flipY = (b) => { const r = [b[0], 16 - b[4], b[2], b[3], 16 - b[1], b[5]]; if (b[6]) r.push(b[6]); return r; };
  const half = (d) => [[0, 0, 0, 16, 16, 8], [0, 0, 0, 8, 16, 16], [0, 0, 8, 16, 16, 16], [8, 0, 0, 16, 16, 16]][d];
  const MATS = [
    ['oak', 15, 'Дубовая плита', 'Дубовые ступени'], ['birch', 16, 'Берёзовая плита', 'Берёзовые ступени'],
    ['spruce', 17, 'Еловая плита', 'Еловые ступени'], ['cobblestone', 4, 'Булыжная плита', 'Булыжные ступени'],
    ['stone', 3, 'Каменная плита', 'Каменные ступени'], ['stone_brick', 20, 'Плита из каменных кирпичей', 'Ступени из каменных кирпичей'],
    ['brick', 19, 'Кирпичная плита', 'Кирпичные ступени'], ['sandstone', 8, 'Песчаниковая плита', 'Песчаниковые ступени'],
  ];
  const SLAB = 1024, STAIRS = 1048;
  const like = (src, o) => Object.assign({ tex: src.tex, hardness: src.hardness, tool: src.tool, level: src.level, sound: src.sound, group: 'build' }, o);
  MATS.forEach(([k, src, slabName, stairsName], m) => {
    const s = BLOCKS[src], id = SLAB + m * 3;
    def(id, k + '_slab', slabName, like(s, { render: 'box', shape: [[0, 0, 0, 16, 8, 16]], slab: m, half: 0, mat: src }));
    def(id + 1, k + '_slab_top', slabName, like(s, { render: 'box', shape: [[0, 8, 0, 16, 16, 16]], creative: false, item: id, slab: m, half: 1, mat: src }));
    def(id + 2, k + '_slab_double', 'Двойная плита', like(s, { creative: false, item: id, drop: id, dropCount: 2, slab: m, half: 2, mat: src }));
    for (let d = 0; d < 4; d++) for (let up = 0; up < 2; up++) {
      const lo = [0, 0, 0, 16, 8, 16], hi = half(d).slice(); hi[1] = 8;
      const shape = up ? [flipY(lo), flipY(hi)] : [lo, hi];
      def(STAIRS + m * 8 + d * 2 + up, k + '_stairs' + (d || up ? '_' + d + up : ''), stairsName,
        like(s, { render: 'box', shape, creative: !d && !up, item: STAIRS + m * 8, stairs: m, dir: d, up: !!up, mat: src }));
    }
  });
  const FENCE = 1112, GATE = 1113, TRAPDOOR = 1121, IRON_TRAPDOOR = 1137, PANE = 1153, LADDER = 1154;
  const wood = { hardness: 2, tool: 'axe', sound: 'wood' };
  def(FENCE, 'oak_fence', 'Дубовый забор', Object.assign({ render: 'box', dyn: 1, tex: 'oak_planks', shape: [[6, 0, 6, 10, 16, 10], [0, 6, 7, 6, 9, 9], [10, 6, 7, 16, 9, 9], [0, 12, 7, 6, 15, 9], [10, 12, 7, 16, 15, 9]] }, wood));
  for (let d = 0; d < 4; d++) for (let op = 0; op < 2; op++) {
    const posts = [[0, 5, 7, 2, 16, 9], [14, 5, 7, 16, 16, 9]];
    const toMinus = d === 0 || d === 1;           // открывается от игрока
    const leaf = toMinus ? [1, 7] : [9, 15];
    const body = op ? [[0, 6, leaf[0], 2, 15, leaf[1]], [14, 6, leaf[0], 16, 15, leaf[1]]]
      : [[2, 6, 7, 14, 9, 9], [2, 12, 7, 14, 15, 9], [6, 9, 7, 7, 12, 9], [9, 9, 7, 10, 12, 9]];
    let shape = posts.concat(body), coll = op ? [] : [[0, 0, 6, 16, 24, 10]];
    if (d % 2) { shape = shape.map(swapXZ); coll = coll.map(swapXZ); }
    def(GATE + d * 2 + op, 'oak_gate' + (d || op ? '_' + d + op : ''), 'Дубовая калитка', Object.assign({ render: 'box', tex: 'oak_planks', shape, collide: coll, creative: !d && !op, item: GATE, gate: true, dir: d, open: !!op }, wood));
  }
  for (const [base, kind, name, o] of [[TRAPDOOR, 'wood', 'Деревянный люк', wood], [IRON_TRAPDOOR, 'iron', 'Железный люк', { hardness: 5, tool: 'pickaxe', level: 0, sound: 'stone' }]]) {
    for (let d = 0; d < 4; d++) for (let op = 0; op < 2; op++) for (let top = 0; top < 2; top++) {
      const shape = [op ? [[0, 0, 0, 16, 16, 3], [0, 0, 0, 3, 16, 16], [0, 0, 13, 16, 16, 16], [13, 0, 0, 16, 16, 16]][d] : top ? [0, 13, 0, 16, 16, 16] : [0, 0, 0, 16, 3, 16]];
      def(base + d * 4 + op * 2 + top, (kind === 'wood' ? 'trapdoor' : 'iron_trapdoor') + (d || op || top ? '_' + d + op + top : ''), name,
        Object.assign({ render: 'box', tex: kind === 'wood' ? 'trapdoor' : 'iron_trapdoor', shape, creative: !d && !op && !top, item: base, trapdoor: kind, dir: d, open: !!op, top: !!top }, o));
    }
  }
  def(PANE, 'glass_pane', 'Стеклянная панель', { render: 'box', dyn: 2, tex: 'glass', shape: [[7, 0, 0, 9, 16, 16]], hardness: 0.3, sound: 'glass', drop: 0 });
  for (let w = 0; w < 4; w++) {
    const plate = [[0, 0, 0, 16, 16, 1], [15, 0, 0, 16, 16, 16], [0, 0, 15, 16, 16, 16], [0, 0, 0, 1, 16, 16]][w];     // стена: 0 -Z, 1 +X, 2 +Z, 3 -X
    const coll = [[0, 0, 0, 16, 16, 3], [13, 0, 0, 16, 16, 16], [0, 0, 13, 16, 16, 16], [0, 0, 0, 3, 16, 16]][w];
    def(LADDER + w, 'ladder' + (w ? '_' + w : ''), 'Лестница', { render: 'box', tex: 'ladder', shape: [plate], collide: [coll], hardness: 0.4, tool: 'axe', sound: 'wood', creative: !w, item: LADDER, ladder: w, group: 'tools' });
  }

  // повороты: копии с тем же видом и тем же предметом
  for (const [base, n] of [[31, 1], [35, 1], [118, 1]]) {
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

  // id блоков: 0..255 и 1024..4095 (256..1023 - предметы); клетка куска - 16 бит
  const MAXID = 4096;
  const isBlock = (id) => (id < 256 || (id >= 1024 && id < MAXID)) && !!BLOCKS[id];
  // ---- Нижний мир (id с 1158)
  const NETHERRACK = 1158, SOUL_SAND = 1159, NETHER_BRICKS = 1160, NETHER_FENCE = 1161, QUARTZ_ORE = 1162, PORTAL = 1163, NETHER_WART = 1165, SPAWNER = 1169, NB_SLAB = 1170, NB_STAIRS = 1173;
  const ITEM_QUARTZ = 404, ITEM_WART = 405;
  def(NETHERRACK, 'netherrack', 'Незерак', { tex: 'netherrack', hardness: 0.4, tool: 'pickaxe', level: 0, group: 'nature', blast: 0.4 });
  def(SOUL_SAND, 'soul_sand', 'Песок душ', { render: 'box', shape: [[0, 0, 0, 16, 14, 16]], tex: 'soul_sand', hardness: 0.5, tool: 'shovel', sound: 'sand', group: 'nature' });
  def(NETHER_BRICKS, 'nether_bricks', 'Незер-кирпичи', { tex: 'nether_bricks', hardness: 2, tool: 'pickaxe', level: 0 });
  def(NETHER_FENCE, 'nether_fence', 'Забор из незер-кирпича', { render: 'box', dyn: 3, tex: 'nether_bricks', shape: [[6, 0, 6, 10, 16, 10], [0, 6, 7, 6, 9, 9], [10, 6, 7, 16, 9, 9], [0, 12, 7, 6, 15, 9], [10, 12, 7, 16, 15, 9]], hardness: 2, tool: 'pickaxe', level: 0 });
  def(QUARTZ_ORE, 'quartz_ore', 'Кварцевая руда', { tex: 'quartz_ore', hardness: 3, tool: 'pickaxe', level: 0, drop: ITEM_QUARTZ, group: 'nature' });
  // портал: плоскость в клетке; 1163 - рамка вдоль X (тонкий по Z), 1164 - вдоль Z
  def(PORTAL, 'portal', 'Портал', { render: 'box', shape: [[0, 0, 6, 16, 16, 10]], tex: 'portal', solid: false, hardness: -1, light: 11, drop: 0, creative: false, portal: 'x', transBox: true, sound: 'glass' });
  def(PORTAL + 1, 'portal_z', 'Портал', { render: 'box', shape: [[6, 0, 0, 10, 16, 16]], tex: 'portal', solid: false, hardness: -1, light: 11, drop: 0, creative: false, portal: 'z', transBox: true, sound: 'glass' });
  for (let st = 0; st < 4; st++) def(NETHER_WART + st, 'nether_wart_' + st, 'Адский нарост', { render: 'crop', tex: 'nether_wart_' + [0, 1, 1, 2][st], solid: false, hardness: 0, sound: 'grass', creative: false, wart: st, drop: 0 });
  def(SPAWNER, 'spawner', 'Рассадник чудовищ', { render: 'glass', tex: 'spawner', hardness: 5, tool: 'pickaxe', level: 0, drop: 0, creative: false });
  {
    const s = BLOCKS[NETHER_BRICKS], id = NB_SLAB;
    def(id, 'nether_brick_slab', 'Плита из незер-кирпича', like(s, { render: 'box', shape: [[0, 0, 0, 16, 8, 16]], slab: 8, half: 0, mat: NETHER_BRICKS }));
    def(id + 1, 'nether_brick_slab_top', 'Плита из незер-кирпича', like(s, { render: 'box', shape: [[0, 8, 0, 16, 16, 16]], creative: false, item: id, slab: 8, half: 1, mat: NETHER_BRICKS }));
    def(id + 2, 'nether_brick_slab_double', 'Двойная плита', like(s, { creative: false, item: id, drop: id, dropCount: 2, slab: 8, half: 2, mat: NETHER_BRICKS }));
    for (let d = 0; d < 4; d++) for (let up = 0; up < 2; up++) {
      const lo = [0, 0, 0, 16, 8, 16], hi = half(d).slice(); hi[1] = 8;
      def(NB_STAIRS + d * 2 + up, 'nether_brick_stairs' + (d || up ? '_' + d + up : ''), 'Ступени из незер-кирпича',
        like(s, { render: 'box', shape: up ? [flipY(lo), flipY(hi)] : [lo, hi], creative: !d && !up, item: NB_STAIRS, stairs: 8, dir: d, up: !!up, mat: NETHER_BRICKS }));
    }
  }
  // ---- красный камень (id с 1181)
  // стороны в 6 направлениях: 0 -Z, 1 +X, 2 +Z, 3 -X, 4 +Y, 5 -Y (у кнопки и факела на стене - сторона стены)
  const FDIR = [[0, 0, -1], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 1, 0], [0, -1, 0]];
  const FACE_OF_DIR6 = [4, 1, 5, 0, 3, 2];     // номер грани (0 -X, 1 +X, 2 -Y, 3 +Y, 4 -Z, 5 +Z) для стороны
  // коробка, заданная для «лицом к -Z», повернуть лицом в сторону f
  const rotBox = (b, f) => {
    let r;
    if (f === 0) r = b.slice(0, 6);
    else if (f === 2) r = [b[0], b[1], 16 - b[5], b[3], b[4], 16 - b[2]];
    else if (f === 1) r = [16 - b[5], b[1], b[0], 16 - b[2], b[4], b[3]];
    else if (f === 3) r = [b[2], b[1], 16 - b[3], b[5], b[4], 16 - b[0]];
    else if (f === 4) r = [b[0], 16 - b[5], b[1], b[3], 16 - b[2], b[4]];
    else r = [b[0], b[2], 16 - b[4], b[3], b[5], 16 - b[1]];
    if (b[6]) r.push(b[6]);
    return r;
  };
  const WIRE = 1181, RS_TORCH = 1197, RS_TORCH_OFF = 1202, REPEATER = 1207, BUTTON = 1239, WOOD_BUTTON = 1251, RS_PLATE = 1263, RS_WOOD_PLATE = 1265, LAMP = 1267, PISTON = 1269, PISTON_HEAD = 1293, REDSTONE_ORE = 1305, REDSTONE_BLOCK = 1306;
  const dustTile = (p) => (p === 0 ? 'dust_0' : p < 6 ? 'dust_1' : p < 11 ? 'dust_2' : 'dust_3');
  for (let p = 0; p < 16; p++) def(WIRE + p, 'redstone' + (p ? '_' + p : ''), 'Красная пыль', { render: 'box', dyn: 4, tex: dustTile(p), shape: [[3, 0, 3, 13, 1, 13]], solid: false, hardness: 0, sound: 'stone', creative: !p, item: WIRE, drop: WIRE, group: 'redstone', wire: p });
  for (const [base, on] of [[RS_TORCH, true], [RS_TORCH_OFF, false]]) {
    def(base, on ? 'redstone_torch' : 'redstone_torch_off', 'Красный факел', { render: 'torch', tex: on ? 'redstone_torch_on' : 'redstone_torch_off', solid: false, hardness: 0, sound: 'wood', light: on ? 7 : 0, creative: on, item: RS_TORCH, drop: RS_TORCH, group: 'redstone', rsTorch: on ? 1 : 0 });
    for (let r = 0; r < 4; r++) BLOCKS[base + 1 + r] = Object.assign({}, BLOCKS[base], { id: base + 1 + r, key: BLOCKS[base].key + '_wall_' + r, creative: false, wall: r });
  }
  for (let d = 0; d < 4; d++) for (let dl = 1; dl <= 4; dl++) for (let pw = 0; pw < 2; pw++) {
    // сторона выхода d (как у ступеней: 0 -Z, 1 -X, 2 +Z, 3 +X); задняя свеча у входа, передняя - по задержке
    const post = (t) => [7, 2, t, 9, 7, t + 2, pw ? 'redstone_torch_on' : 'redstone_torch_off'];
    let shape = [[0, 0, 0, 16, 2, 16], post(12), post(2 + (dl - 1) * 2)];
    const f6 = [0, 3, 2, 1][d];
    shape = shape.map((b) => rotBox(b, f6));
    def(REPEATER + d * 8 + (dl - 1) * 2 + pw, 'repeater' + (d || dl > 1 || pw ? '_' + d + dl + pw : ''), 'Повторитель', { render: 'box', shape, tex: { top: 'repeater', bottom: 'stone', side: 'stone' }, rot: d, solid: true, hardness: 0, sound: 'stone', creative: !d && dl === 1 && !pw, item: REPEATER, drop: REPEATER, group: 'redstone', repeater: true, dir: d, delay: dl, powered: !!pw });
  }
  const BTN = [[5, 6, 0, 11, 10, 2], [14, 6, 5, 16, 10, 11], [5, 6, 14, 11, 10, 16], [0, 6, 5, 2, 10, 11], [5, 0, 6, 11, 2, 10], [5, 14, 6, 11, 16, 10]];
  const BTN_P = [[5, 6, 0, 11, 10, 1], [15, 6, 5, 16, 10, 11], [5, 6, 15, 11, 10, 16], [0, 6, 5, 1, 10, 11], [5, 0, 6, 11, 1, 10], [5, 15, 6, 11, 16, 10]];
  for (const [base, wood] of [[BUTTON, false], [WOOD_BUTTON, true]]) for (let f = 0; f < 6; f++) for (let pr = 0; pr < 2; pr++) {
    def(base + f * 2 + pr, (wood ? 'wood_button' : 'stone_button') + (f || pr ? '_' + f + pr : ''), wood ? 'Деревянная кнопка' : 'Каменная кнопка', { render: 'box', shape: [(pr ? BTN_P : BTN)[f]], tex: wood ? 'oak_planks' : 'stone', solid: false, hardness: 0.5, sound: wood ? 'wood' : 'stone', creative: !f && !pr, item: base, drop: base, group: 'redstone', button: wood ? 'wood' : 'stone', face: f, pressed: !!pr });
  }
  for (const [base, wood] of [[RS_PLATE, false], [RS_WOOD_PLATE, true]]) for (let pr = 0; pr < 2; pr++) {
    def(base + pr, (wood ? 'wood_plate' : 'stone_plate') + (pr ? '_on' : ''), wood ? 'Деревянная нажимная плита' : 'Каменная нажимная плита', { render: 'box', shape: [[1, 0, 1, 15, pr ? 0.5 : 1, 15]], tex: wood ? 'oak_planks' : 'stone', solid: false, hardness: 0.5, sound: wood ? 'wood' : 'stone', creative: !pr, item: base, drop: base, group: 'redstone', plate: wood ? 'wood' : 'stone', pressed: !!pr });
  }
  def(LAMP, 'redstone_lamp', 'Лампа', { tex: 'lamp_off', hardness: 0.3, sound: 'glass', group: 'redstone', lamp: 0 });
  def(LAMP + 1, 'redstone_lamp_on', 'Лампа', { tex: 'lamp_on', hardness: 0.3, sound: 'glass', light: 15, creative: false, item: LAMP, drop: LAMP, lamp: 1 });
  // поршень: сторона лица f (6 направлений), выдвинут, липкий; голова - в соседней клетке
  for (let f = 0; f < 6; f++) for (let ext = 0; ext < 2; ext++) for (let st = 0; st < 2; st++) {
    const faces = ['piston_side', 'piston_side', 'piston_side', 'piston_side', 'piston_side', 'piston_side'];
    faces[FACE_OF_DIR6[f]] = ext ? 'piston_inner' : st ? 'piston_top_sticky' : 'piston_top';
    faces[FACE_OF_DIR6[[2, 3, 0, 1, 5, 4][f]]] = 'piston_bottom';
    const o = { tex: { faces }, hardness: 1.5, tool: 'pickaxe', sound: 'stone', creative: !f && !ext, item: PISTON + st, drop: PISTON + st, group: 'redstone', piston: st ? 'sticky' : 'normal', face: f, extended: !!ext };
    if (ext) { o.render = 'box'; o.shape = [rotBox([0, 0, 4, 16, 16, 16], f)]; }
    def(PISTON + f * 4 + ext * 2 + st, (st ? 'sticky_piston' : 'piston') + (f || ext ? '_' + f + ext : ''), st ? 'Липкий поршень' : 'Поршень', o);
  }
  for (let f = 0; f < 6; f++) for (let st = 0; st < 2; st++) {
    def(PISTON_HEAD + f * 2 + st, 'piston_head_' + f + st, 'Головка поршня', { render: 'box', shape: [rotBox([0, 0, 0, 16, 16, 4, st ? 'piston_top_sticky' : 'piston_top'], f), rotBox([6, 6, 4, 10, 10, 16, 'piston_side'], f)], tex: 'piston_side',
      hardness: 1.5, sound: 'stone', creative: false, drop: 0, pistonHead: true, face: f, sticky: !!st });
  }
  def(REDSTONE_ORE, 'redstone_ore', 'Руда красного камня', { tex: 'redstone_ore', hardness: 3, tool: 'pickaxe', level: 2, drop: WIRE, dropCount: 4, group: 'nature' });
  def(REDSTONE_BLOCK, 'redstone_block', 'Блок красного камня', { tex: 'redstone_block', hardness: 5, tool: 'pickaxe', level: 0, group: 'redstone', rsBlock: true });

  // ---- тростник и изумрудная руда
  const SUGAR_CANE = 1307, EMERALD_ORE = 1308, ITEM_EMERALD = 423;
  def(SUGAR_CANE, 'sugar_cane', 'Сахарный тростник', { render: 'cross', tex: 'sugar_cane', solid: false, hardness: 0, sound: 'grass', group: 'nature', cane: true });
  const LAPIS_ORE = 1309, PATH = 1310, ITEM_LAPIS = 425;
  def(LAPIS_ORE, 'lapis_ore', 'Лазуритовая руда', { tex: 'lapis_ore', hardness: 3, tool: 'pickaxe', level: 1, drop: ITEM_LAPIS, dropCount: 6, group: 'nature' });
  def(PATH, 'path', 'Тропинка', { render: 'box', shape: [[0, 0, 0, 16, 15, 16]], tex: { top: 'path_top', bottom: 'dirt', side: 'path_side' }, hardness: 0.6, tool: 'shovel', sound: 'gravel', drop: 2, group: 'nature' });
  // стол зачарований, наковальня (4 поворота), железный блок
  const ENCH_TABLE = 1311, ANVIL = 1312, IRON_BLOCK = 1316;
  def(ENCH_TABLE, 'enchanting_table', 'Стол зачарований', { render: 'box', shape: [[0, 0, 0, 16, 12, 16]], tex: { top: 'ench_top', bottom: 'obsidian', side: 'ench_side' }, hardness: 5, tool: 'pickaxe', level: 0, light: 7, group: 'tools' });
  for (let d = 0; d < 4; d++) {
    let shape = [[2, 0, 2, 14, 4, 14], [4, 4, 5, 12, 10, 11], [0, 10, 3, 16, 16, 13]];
    if (d % 2) shape = shape.map(swapXZ);
    def(ANVIL + d, 'anvil' + (d ? '_' + d : ''), 'Наковальня', { render: 'box', shape, tex: { top: 'anvil_top', bottom: 'anvil_side', side: 'anvil_side' }, hardness: 5, tool: 'pickaxe', level: 0, sound: 'stone', creative: !d, item: ANVIL, drop: ANVIL, group: 'tools', anvil: d });
  }
  def(IRON_BLOCK, 'iron_block', 'Железный блок', { tex: 'iron_block', hardness: 5, tool: 'pickaxe', level: 1 });
  def(EMERALD_ORE, 'emerald_ore', 'Изумрудная руда', { tex: 'emerald_ore', hardness: 3, tool: 'pickaxe', level: 2, drop: ITEM_EMERALD, group: 'nature' });

  // плиты и ступени по номеру материала (8 - незер-кирпич, у него свой диапазон id)
  const slabBase = (m) => (m < 8 ? SLAB + m * 3 : NB_SLAB);
  const stairsBase = (m) => (m < 8 ? STAIRS + m * 8 : NB_STAIRS);

  // Быстрые таблицы свойств по id: мешер и свет читают только их
  const RENDER = new Uint8Array(MAXID);   // 0 нет, 1 куб, 2 листва, 3 стекло, 4 вода, 5 лёд, 6 крест, 7 факел, 8 коробки, 9 посев, 10 лава
  const RCODE = { none: 0, cube: 1, leaves: 2, glass: 3, water: 4, ice: 5, cross: 6, torch: 7, box: 8, crop: 9, lava: 10 };
  const FLUID = new Uint8Array(MAXID);    // 1 вода, 2 лава
  const FLEVEL = new Uint8Array(MAXID);   // уровень течения (0 - источник или падающая)
  const FFALL = new Uint8Array(MAXID);
  const SHAPE = [];                     // коробки не во всю клетку, в шестнадцатых: [x0, y0, z0, x1, y1, z1]
  const CSHAPE = [];                    // своя коробка столкновения (калитка, лестница), [] - проходим
  const DYN = new Uint8Array(MAXID);    // форма зависит от соседей: 1 забор, 2 стеклянная панель, 3 забор из незер-кирпича, 4 красная пыль
  const TBOX = new Uint8Array(MAXID);
  const RS_CONNECT = new Uint8Array(MAXID);   // к чему тянется пыль: 1 - со всех сторон, 2 - повторитель (вход и выход)   // коробки в прозрачной сетке (портал)
  const SOLID = new Uint8Array(MAXID);
  const EMIT = new Uint8Array(MAXID);
  const FILTER = new Uint8Array(MAXID);   // сколько света гасит клетка (15 - непрозрачная)
  const TEXF = new Int16Array(MAXID * 6); // плитка грани: 0 -X,1 +X,2 -Y,3 +Y,4 -Z,5 +Z
  const TEXFAST = new Int16Array(MAXID * 6);
  // стороны света для поворота: 0 - смотрит на -Z (север), 1 - +X, 2 - +Z, 3 - -X
  const FACE_OF_ROT = [4, 1, 5, 0];
  for (let id = 0; id < MAXID; id++) {
    const b = BLOCKS[id];
    if (!b) continue;
    RENDER[id] = RCODE[b.render];
    SOLID[id] = b.solid ? 1 : 0;
    EMIT[id] = b.light;
    FILTER[id] = b.render === 'cube' ? 15 : (b.render === 'leaves' || b.render === 'water' || b.render === 'ice' || b.render === 'lava') ? 1 : 0;
    FLUID[id] = b.fluid || 0; FLEVEL[id] = b.level || 0; FFALL[id] = b.falling ? 1 : 0;
    if (b.shape) SHAPE[id] = b.shape;
    if (b.collide) CSHAPE[id] = b.collide;
    DYN[id] = b.dyn || 0;
    RS_CONNECT[id] = b.wire !== undefined || b.rsTorch !== undefined || b.button || b.plate || b.rsBlock || id === 130 || id === 131 ? 1 : b.repeater ? 2 : 0;
    TBOX[id] = b.transBox ? 1 : 0;
    for (let f = 0; f < 6; f++) {
      const t = b.tex || {};
      let name = t.all || (t.faces ? t.faces[f] : f === 3 ? t.top : f === 2 ? t.bottom : t.side);
      if (b.facing && t.front && f === FACE_OF_ROT[b.rot || 0]) name = t.front;
      if (!b.facing && t.front && (f === 4 || f === 5)) name = t.front;   // верстак: «лицо» с двух сторон
      TEXF[id * 6 + f] = name ? T[name] : 0;
      TEXFAST[id * 6 + f] = b.fast ? T[b.fast] : TEXF[id * 6 + f];
    }
  }

  // Форма блока с учётом соседей. nb(dx, dy, dz) - id соседа; mode: 'render' | 'collide' | 'outline'.
  // Забор цепляется к заборам, калиткам и полным блокам, панель - к панелям, стеклу и полным блокам.
  const ARMS = [[0, -1], [-1, 0], [0, 1], [1, 0]];
  // Куда тянется красная пыль: к пыли рядом (и на ступень вверх или вниз), к факелам, рычагам, кнопкам,
  // плитам, блоку красного камня и к повторителю с его входа или выхода. Одна связь - линия насквозь.
  function wireLinks(nb) {
    const up = nb(0, 1, 0), upSolid = up > 0 && RENDER[up] === 1 && SOLID[up] === 1;
    const links = [0, 0, 0, 0], climb = [0, 0, 0, 0];     // стороны 0 -Z, 1 +X, 2 +Z, 3 -X
    for (let a = 0; a < 4; a++) {
      const d = FDIR[a], n = nb(d[0], 0, d[2]);
      const nSolid = n > 0 && RENDER[n] === 1 && SOLID[n] === 1;
      if (n > 0 && RS_CONNECT[n] === 1) links[a] = 1;
      else if (n > 0 && RS_CONNECT[n] === 2) { const rd = BLOCKS[n].dir; if (FDIR6_OF_DIR4[rd] === a || FDIR6_OF_DIR4[rd] === (a + 2) % 4) links[a] = 1; }
      else if (nSolid && !upSolid && BLOCKS[Math.max(0, nb(d[0], 1, d[2]))].wire !== undefined) { links[a] = 1; climb[a] = 1; }
      else if (!nSolid && BLOCKS[Math.max(0, nb(d[0], -1, d[2]))].wire !== undefined) links[a] = 1;
    }
    const n = links.reduce((s, v) => s + v, 0);
    if (n === 1) for (let a = 0; a < 4; a++) if (links[a]) links[(a + 2) % 4] = 1;
    return { links, climb, count: n };
  }
  // сторона выхода повторителя (0 -Z, 1 -X, 2 +Z, 3 +X) -> сторона из FDIR
  const FDIR6_OF_DIR4 = [0, 3, 2, 1];
  function shapeOf(id, nb, mode) {
    const k = DYN[id];
    if (!k) return mode === 'collide' && CSHAPE[id] ? CSHAPE[id] : (SHAPE[id] || null);
    if (k === 4) {
      const { links, climb, count } = wireLinks(nb);
      const out = [];
      if (!count) return [[3, 0, 3, 13, 1, 13]];
      out.push([5, 0, 5, 11, 1, 11]);
      const span = [[5, 0, 11, 5], [11, 5, 16, 11], [5, 11, 11, 16], [0, 5, 5, 11]];     // x0, z0, x1, z1 от центра к стороне
      for (let a = 0; a < 4; a++) if (links[a]) { const q = span[a]; out.push([q[0], 0, q[1], q[2], 1, q[3]]); }
      const wall = [[5, 0, 0, 11, 16, 1], [15, 0, 5, 16, 16, 11], [5, 0, 15, 11, 16, 16], [0, 0, 5, 1, 16, 11]];
      for (let a = 0; a < 4; a++) if (climb[a]) out.push(wall[a]);
      return out;
    }
    const full = (n) => n > 0 && RENDER[n] === 1 && SOLID[n] === 1;
    const out = [];
    if (k === 1 || k === 3) {
      const top = mode === 'collide' ? 24 : 16;
      out.push(mode === 'render' ? [6, 0, 6, 10, 16, 10] : [6, 0, 6, 10, top, 10]);
      for (let a = 0; a < 4; a++) {
        const n = nb(ARMS[a][0], 0, ARMS[a][1]);
        if (!(full(n) || DYN[n] === k || (k === 1 && n > 0 && BLOCKS[n].gate))) continue;
        const span = [[7, 0, 9, 6], [0, 7, 6, 9], [7, 10, 9, 16], [10, 7, 16, 9]][a];   // x0, z0, x1, z1
        if (mode === 'render') { out.push([span[0], 6, span[1], span[2], 9, span[3]], [span[0], 12, span[1], span[2], 15, span[3]]); }
        else out.push([span[0], 0, span[1], span[2], top, span[3]]);
      }
      return out;
    }
    // стеклянная панель: стойка и крылья к соседям; одиночная - крестом во всю клетку
    const conn = [];
    for (let a = 0; a < 4; a++) { const n = nb(ARMS[a][0], 0, ARMS[a][1]); conn.push(full(n) || DYN[n] === 2 || RENDER[n] === 3); }
    if (!conn.some(Boolean)) return [[7, 0, 0, 9, 16, 16], [0, 0, 7, 16, 16, 9]];
    out.push([7, 0, 7, 9, 16, 9]);
    const span = [[7, 0, 9, 7], [0, 7, 7, 9], [7, 9, 9, 16], [9, 7, 16, 9]];
    for (let a = 0; a < 4; a++) if (conn[a]) { const q = span[a]; out.push([q[0], 0, q[1], q[2], 16, q[3]]); }
    return out;
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

  // ---------- Старая версия игры (остров 48x48, 32 в высоту) ----------
  // Постройки старой версии хранились только отличиями от её мира. Чтобы они встали на место,
  // мир «Старый мир» повторяет прежний остров клетка в клетку (та же формула высоты, те же 18
  // деревьев от того же зерна), поднятый на LEG_DY, а вокруг - море и дальше обычный мир.
  const LEG_HALF = 24, LEG_DY = 44, LEG_SEED = 20240926;
  const LEG_MAP = [0, 1, 2, 3, 9, 12, 6, 15];            // старые id -> новые (трава, земля, камень, бревно, листва, песок, доски)
  const legHeight = (x, z) => Math.round(Math.sin(x * 0.15) * 2 + Math.cos(z * 0.18) * 2 + Math.sin((x + z) * 0.08) * 3 + Math.cos(x * 0.05) * 2.5 + Math.sin(z * 0.07) * 2) + 8;
  let legacyCells = null;
  function legacyIsland() {
    if (legacyCells) return legacyCells;
    const SX = 48, SY = 32, H = LEG_HALF;
    const c = new Uint8Array(SX * SY * SX);
    const inW = (x, y, z) => x >= -H && x < H && y >= 0 && y < SY && z >= -H && z < H;
    const ix = (x, y, z) => ((y * SX) + (z + H)) * SX + (x + H);
    const get = (x, y, z) => (inW(x, y, z) ? c[ix(x, y, z)] : 0);
    for (let x = -H; x < H; x++) for (let z = -H; z < H; z++) {
      const h = legHeight(x, z);
      for (let y = 0; y <= h; y++) c[ix(x, y, z)] = y === h ? (h < 6 ? 6 : 1) : y > h - 3 ? 2 : 3;
    }
    const rnd = mulberry32(LEG_SEED);
    for (let i = 0; i < 18; i++) {
      const x = Math.floor((rnd() - 0.5) * SX * 0.8), z = Math.floor((rnd() - 0.5) * SX * 0.8);
      const h = legHeight(x, z);
      if (get(x, h, z) !== 1) continue;
      const th = 4 + Math.floor(rnd() * 2);
      for (let k = 1; k <= th; k++) if (inW(x, h + k, z)) c[ix(x, h + k, z)] = 4;
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = th - 1; dy <= th + 2; dy++) {
        if (Math.abs(dx) + Math.abs(dz) + Math.abs(dy - th - 0.5) > 3.5) continue;
        if (dx === 0 && dz === 0 && dy <= th) continue;
        const X = x + dx, Y = h + dy, Z = z + dz;
        if (inW(X, Y, Z) && !get(X, Y, Z)) c[ix(X, Y, Z)] = 5;
      }
    }
    legacyCells = { get: (x, y, z) => LEG_MAP[get(x, y, z)], top: (x, z) => { let y = SY - 1; while (y > 0 && !get(x, y, z)) y--; return y; } };
    return legacyCells;
  }
  const inLegacy = (x, z) => x >= -LEG_HALF && x < LEG_HALF && z >= -LEG_HALF && z < LEG_HALF;

  const worlds = new Map();   // кэш шумов по зерну
  function worldOf(seed, gen) {
    const key = seed + '|' + (gen || '');
    let w = worlds.get(key);
    if (w) return w;
    w = {
      seed, legacy: gen === 'legacy',
      cont: makeNoise(seed), det: makeNoise(seed + 11), mnt: makeNoise(seed + 23), rid: makeNoise(seed + 37),
      temp: makeNoise(seed + 41), hum: makeNoise(seed + 53), cave: makeNoise(seed + 67), cave2: makeNoise(seed + 71),
      big: makeNoise(seed + 83), floor: makeNoise(seed + 97),
    };
    worlds.set(key, w);
    return w;
  }
  // Колонка мира: высота поверхности и биом. Чистая функция зерна и координат.
  function column(w, x, z) {
    if (w.legacy) {
      if (inLegacy(x, z)) { const oh = legHeight(x, z); return { h: oh + LEG_DY, biome: oh < 6 ? BEACH : PLAINS, m: 0, legacy: true }; }
      // вокруг острова - море, дальше обычный мир
      const d = Math.max(Math.max(-LEG_HALF - x, x - LEG_HALF + 1), Math.max(-LEG_HALF - z, z - LEG_HALF + 1));
      const base = normalColumn(w, x, z);
      if (d >= 56) return base;
      const t = smooth(24, 56, d);
      const h = Math.floor((SEA - 6) * (1 - t) + base.h * t);
      return { h, biome: h < SEA - 1 ? OCEAN : h <= SEA + 1 ? BEACH : base.biome, m: base.m * t };
    }
    return normalColumn(w, x, z);
  }
  function normalColumn(w, x, z) {
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

  // ---------- Деревни ----------
  // Сетка 384x384 блока, в клетке не больше одной деревни (на равнине или в пустыне): колодец в центре,
  // крест дорог, дома у дорог (фермер, библиотекарь, кузнец, священник, простые), поля пшеницы, фонари.
  const VIL_CELL = 384, VIL_R = 30;
  const VIL_KINDS = ['farmer', 'librarian', 'smith', 'cleric', 'house', 'farm', 'house', 'farm', 'house'];
  function villageAt(w, cellX, cellZ) {
    w.villages = w.villages || new Map();
    const key = cellX + ',' + cellZ;
    if (w.villages.has(key)) return w.villages.get(key);
    let v = null;
    const seed = w.seed;
    if (!w.legacy && hash3(cellX, 313, cellZ, seed ^ 0x51ed) < 0.6) {
      const x = cellX * VIL_CELL + 80 + Math.floor(hash3(cellX, 1, cellZ, seed ^ 0x51ed) * 224);
      const z = cellZ * VIL_CELL + 80 + Math.floor(hash3(cellX, 2, cellZ, seed ^ 0x51ed) * 224);
      const col = column(w, x, z);
      let flat = col.h > SEA + 1 && (col.biome === PLAINS || col.biome === DESERT);
      if (flat) for (const [dx, dz] of [[20, 0], [-20, 0], [0, 20], [0, -20]]) { const c2 = column(w, x + dx, z + dz); if (Math.abs(c2.h - col.h) > 5 || c2.h <= SEA) flat = false; }
      if (flat) {
        v = { id: 'v' + cellX + '_' + cellZ, x, z, h: col.h, desert: col.biome === DESERT, houses: [] };
        // места у дорог: сторона дороги (0 +X, 1 -X, 2 +Z, 3 -Z), расстояние 10 или 20, по какую сторону
        const slots = [];
        for (let road = 0; road < 4; road++) for (const dist of [10, 20]) for (const side of [-1, 1]) slots.push([road, dist, side]);
        const order = slots.map((s, i) => [hash3(i, 5, cellX * 7 + cellZ, seed), s]).sort((a, b) => a[0] - b[0]).map((q) => q[1]);
        const n = 6 + Math.floor(hash3(cellX, 4, cellZ, seed) * 3);
        for (let i = 0; i < n; i++) {
          const [road, dist, side] = order[i], kind = VIL_KINDS[i];
          const along = [[1, 0], [-1, 0], [0, 1], [0, -1]][road], across = [along[1], along[0]];
          const off = kind === 'farm' ? 8 : 7;
          const hx = x + along[0] * dist + across[0] * side * off, hz = z + along[1] * dist + across[1] * side * off;
          // дверь смотрит на дорогу
          const doorDir = road < 2 ? (side > 0 ? 0 : 2) : (side > 0 ? 3 : 1);    // 0 -Z, 1 +X, 2 +Z, 3 -X
          const big = kind === 'librarian' || kind === 'smith';
          const wx = kind === 'farm' ? 7 : road < 2 ? (big ? 7 : 5) : 5, wz = kind === 'farm' ? 9 : road < 2 ? 5 : (big ? 7 : 5);
          v.houses.push({ kind, x: hx, z: hz, w: kind === 'farm' && road >= 2 ? 9 : wx, d: kind === 'farm' && road >= 2 ? 7 : wz, door: doorDir, y: column(w, hx, hz).h + 1 });
        }
      }
    }
    w.villages.set(key, v);
    return v;
  }
  function villageNear(seed, x, z, gen) {
    const w = worldOf(seed, gen);
    const cx = Math.floor(x / VIL_CELL), cz = Math.floor(z / VIL_CELL);
    let best = null, bd = Infinity;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const v = villageAt(w, cx + dx, cz + dz);
      if (!v) continue;
      const d = Math.hypot(v.x - x, v.z - z);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }
  const inVillage = (w, x, z) => { const v = villageAt(w, Math.floor(x / VIL_CELL), Math.floor(z / VIL_CELL)); return v && Math.abs(x - v.x) < VIL_R + 6 && Math.abs(z - v.z) < VIL_R + 6; };
  function buildVillages(w, data, X0, Z0, colAt) {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const v = villageAt(w, Math.floor(X0 / VIL_CELL) + dx, Math.floor(Z0 / VIL_CELL) + dz);
      if (!v || Math.abs(v.x - (X0 + 8)) > VIL_R + 20 || Math.abs(v.z - (Z0 + 8)) > VIL_R + 20) continue;
      buildVillage(w, v, data, X0, Z0, colAt);
    }
  }
  function buildVillage(w, v, data, X0, Z0, colAt) {
    const inC = (x, z) => x >= X0 && x < X0 + CS && z >= Z0 && z < Z0 + CS;
    const put = (x, y, z, id) => { if (inC(x, z) && y > 0 && y < CH) data[cidx(x - X0, y, z - Z0)] = id; };
    const at = (x, y, z) => (inC(x, z) && y >= 0 && y < CH ? data[cidx(x - X0, y, z - Z0)] : -1);
    const wall = v.desert ? B.sandstone : B.oak_planks, corner = v.desert ? B.sandstone : B.oak_log, base = v.desert ? B.sandstone : B.cobblestone;
    // дороги: тропинки по рельефу
    for (let k = -VIL_R; k <= VIL_R; k++) for (let s = -1; s <= 1; s++) {
      for (const [x, z] of [[v.x + k, v.z + s], [v.x + s, v.z + k]]) {
        if (!inC(x, z)) continue;
        const h = colAt(x - X0, z - Z0).h;
        if (at(x, h, z) === B.water) { put(x, h, z, B.oak_planks); continue; }        // мостик через воду
        put(x, h, z, v.desert ? B.sandstone : PATH);
        for (let y = h + 1; y < h + 4; y++) { const c = at(x, y, z); if (c > 0 && (BLOCKS[c].render === 'cross' || BLOCKS[c].render === 'leaves' || c === B.snow)) put(x, y, z, 0); }
      }
    }
    // колодец
    const wy = v.h;
    for (let x = -2; x <= 1; x++) for (let z = -2; z <= 1; z++) {
      const X = v.x + x, Z = v.z + z, edge = x === -2 || x === 1 || z === -2 || z === 1;
      for (let y = wy - 3; y <= wy; y++) put(X, y, Z, edge ? B.cobblestone : B.water);
      put(X, wy + 1, Z, edge ? B.cobblestone : 0);
      for (let y = wy + 2; y <= wy + 3; y++) put(X, y, Z, (x === -2 || x === 1) && (z === -2 || z === 1) ? FENCE : 0);
      put(X, wy + 4, Z, SLAB + 3 * 3);
    }
    // фонари на перекрёстке дорог
    for (const [lx, lz] of [[v.x + 4, v.z + 4], [v.x - 5, v.z - 5]]) {
      if (!inC(lx, lz)) continue;
      const h = colAt(lx - X0, lz - Z0).h;
      put(lx, h + 1, lz, FENCE); put(lx, h + 2, lz, FENCE); put(lx, h + 3, lz, B.wool_black); put(lx, h + 3, lz + 1, WALL_TORCH + 0);
    }
    for (const hs of v.houses) {
      const x0 = hs.x - (hs.w >> 1), z0 = hs.z - (hs.d >> 1), x1 = x0 + hs.w - 1, z1 = z0 + hs.d - 1, y0 = hs.y;
      if (x1 < X0 - 1 || x0 > X0 + CS || z1 < Z0 - 1 || z0 > Z0 + CS) continue;
      if (hs.kind === 'farm') {
        for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
          const edge = x === x0 || x === x1 || z === z0 || z === z1;
          const mid = hs.w > hs.d ? z === (z0 + z1) >> 1 : x === (x0 + x1) >> 1;
          for (let y = y0 - 3; y < y0 - 1; y++) if (at(x, y, z) === 0 || at(x, y, z) === B.water) put(x, y, z, B.dirt);
          put(x, y0 - 1, z, edge ? B.oak_log : mid ? B.water : B.farmland);
          for (let y = y0; y < y0 + 4; y++) put(x, y, z, 0);
          if (!edge && !mid) put(x, y0, z, 64 + 3 + Math.floor(hash3(x, y0, z, w.seed) * 5));
        }
        continue;
      }
      // фундамент, пол, стены с окнами, потолок и двускатная крыша
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
        for (let y = y0 - 1; y > y0 - 6; y--) { const c = at(x, y, z); if (y === y0 - 1 || c === 0 || c === B.water || (c > 0 && BLOCKS[c].render === 'cross')) put(x, y, z, base); else break; }
        const edgeX = x === x0 || x === x1, edgeZ = z === z0 || z === z1;
        for (let y = y0; y < y0 + 4; y++) {
          let id = 0;
          if (edgeX && edgeZ) id = corner;
          else if (edgeX || edgeZ) id = y === y0 + 1 && ((edgeX ? z : x) - (edgeX ? z0 : x0)) % 2 === 0 ? PANE : wall;
          if (y === y0 + 3) id = edgeX || edgeZ ? corner : wall;
          put(x, y, z, id);
        }
        for (let y = y0 + 4; y < y0 + 9; y++) put(x, y, z, 0);
      }
      // крыша: ступени вдоль длинной стороны
      const alongX = hs.w >= hs.d;
      const span = alongX ? hs.d : hs.w, W2 = span + 2, rows = W2 >> 1;
      const lo = (alongX ? z0 : x0) - 1, hi2 = (alongX ? z1 : x1) + 1;
      const cell = (t, s) => (alongX ? [t, s] : [s, t]);
      for (let k = 0; k <= rows; k++) {
        const y = y0 + 4 + k;
        for (let t = (alongX ? x0 : z0) - 1; t <= (alongX ? x1 : z1) + 1; t++) {
          if (v.desert) { if (k === 0) for (let s = lo + 1; s < hi2; s++) { const c = cell(t, s); put(c[0], y0 + 4, c[1], SLAB + 7 * 3); } continue; }
          if (k === rows) { if (W2 % 2) { const c = cell(t, lo + k); put(c[0], y, c[1], wall); } continue; }     // конёк
          const a = cell(t, lo + k), b2 = cell(t, hi2 - k);
          put(a[0], y, a[1], STAIRS + (alongX ? 2 : 3) * 2);     // скаты: ступенька к коньку
          put(b2[0], y, b2[1], STAIRS + (alongX ? 0 : 1) * 2);
        }
        if (v.desert) break;
        // фронтоны: стена под скатами на торцах
        for (let s = lo + k + 1; s < hi2 - k; s++) for (const t of alongX ? [x0, x1] : [z0, z1]) { const c = cell(t, s); put(c[0], y, c[1], wall); }
      }
      if (v.desert) for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) put(x, y0 + 4, z, 0);
      // дверь в середине стены к дороге и крыльцо
      const cx = (x0 + x1) >> 1, cz = (z0 + z1) >> 1;
      const door = [[cx, z0], [x1, cz], [cx, z1], [x0, cz]][hs.door];
      const edge = [0, 1, 2, 3][hs.door];
      put(door[0], y0, door[1], DOOR_WOOD + edge * 4); put(door[0], y0 + 1, door[1], DOOR_WOOD + edge * 4 + 1);
      const out = FDIR[hs.door === 0 ? 0 : hs.door === 1 ? 1 : hs.door === 2 ? 2 : 3];
      put(door[0] + out[0], y0 - 1, door[1] + out[2], base); put(door[0] + out[0], y0, door[1] + out[2], 0); put(door[0] + out[0], y0 + 1, door[1] + out[2], 0);
      // внутри - по профессии
      const inside = [[x0 + 1, z0 + 1], [x1 - 1, z0 + 1], [x0 + 1, z1 - 1], [x1 - 1, z1 - 1]].filter(([ix, iz]) => Math.abs(ix - door[0]) + Math.abs(iz - door[1]) > 1);
      const furn = { farmer: [B.crafting_table], librarian: [B.bookshelf, B.bookshelf, B.crafting_table], smith: [B.furnace, B.chest, B.crafting_table], cleric: [B.glowstone, B.crafting_table], house: [B.crafting_table] }[hs.kind] || [];
      furn.forEach((id, k) => { if (inside[k]) put(inside[k][0], y0, inside[k][1], id); });
      put(cx, y0 + 2, cz, 0);
      const tw = [[cx, z0 + 1, 2], [cx, z1 - 1, 0]][hs.door === 0 ? 1 : 0];       // факел на стене напротив двери
      put(tw[0], y0 + 2, tw[1], WALL_TORCH + tw[2]);
    }
  }

  // Какое дерево растёт в колонке (0 - нет). Нужна и соседним кускам: крона переходит границу.
  function treeAt(w, x, z, col) {
    if (col.legacy) return 0;
    if (inVillage(w, x, z)) return 0;
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
  // ---------- Нижний мир ----------
  // Плотность из 3D-шума на решётке 4x8x4 с интерполяцией (как в оригинале), у пола и потолка гуще;
  // лавовое море до высоты 31, песок душ у берегов, светокамень гроздьями с потолка, кварц,
  // крепости из незер-кирпича: крест коридоров на опорах и зал с рассадником ифритов.
  const NETHER_SEA = 31, FORT_CELL = 128;
  function fortressAt(seed, cellX, cellZ) {
    const r = hash3(cellX, 911, cellZ, seed ^ 0x1f2e3d4c);
    if (r > 0.55) return null;
    const fx = cellX * FORT_CELL + 32 + Math.floor(hash3(cellX, 1, cellZ, seed) * 64), fz = cellZ * FORT_CELL + 32 + Math.floor(hash3(cellX, 2, cellZ, seed) * 64);
    return { x: fx, z: fz, y: 58 + Math.floor(hash3(cellX, 3, cellZ, seed) * 10), arm: 40 };
  }
  function fortressNear(seed, x, z) {
    const cxl = Math.floor(x / FORT_CELL), czl = Math.floor(z / FORT_CELL);
    let best = null, bd = Infinity;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const f = fortressAt(seed, cxl + dx, czl + dz);
      if (!f) continue;
      const d = Math.hypot(f.x - x, f.z - z);
      if (d < bd) { bd = d; best = f; }
    }
    return best;
  }
  function generateNether(seed, cx, cz) {
    const w = worldOf(seed, 'nether');
    const data = new Uint16Array(CVOL);
    const X0 = cx * CS, Z0 = cz * CS;
    // решётка плотности 5 x 17 x 5
    const GX = 5, GY = 17, dens = new Float32Array(GX * GY * GX);
    for (let gz = 0; gz < GX; gz++) for (let gx = 0; gx < GX; gx++) for (let gy = 0; gy < GY; gy++) {
      const wx = X0 + gx * 4, wz = Z0 + gz * 4, y = gy * 8;
      let d = w.cave.n3(wx / 64, y / 34, wz / 64) * 0.85 + w.cave2.n3(wx / 24, y / 14, wz / 24) * 0.35 + w.big.n3(wx / 140, y / 60, wz / 140) * 0.25;
      d += Math.max(0, (26 - y) / 26) * 1.1 + Math.max(0, (y - 92) / 28) * 1.2;
      dens[gy + GY * (gx + GX * gz)] = d;
    }
    const D = (gx, gy, gz) => dens[gy + GY * (gx + GX * gz)];
    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      const wx = X0 + x, wz = Z0 + z;
      const gx = x >> 2, gz = z >> 2, fx = (x & 3) / 4, fz = (z & 3) / 4;
      for (let y = 0; y < CH; y++) {
        const i = cidx(x, y, z);
        if (y === 0 || y === CH - 1 || (y < 5 && hash3(wx, y, wz, seed) < 0.9 - y * 0.2) || (y > CH - 6 && hash3(wx, y, wz, seed + 3) < 0.9 - (CH - 1 - y) * 0.2)) { data[i] = B.bedrock; continue; }
        const gy = Math.min(GY - 2, y >> 3), fy = (y - gy * 8) / 8;
        const a = D(gx, gy, gz) + (D(gx + 1, gy, gz) - D(gx, gy, gz)) * fx, b = D(gx, gy, gz + 1) + (D(gx + 1, gy, gz + 1) - D(gx, gy, gz + 1)) * fx;
        const c2 = D(gx, gy + 1, gz) + (D(gx + 1, gy + 1, gz) - D(gx, gy + 1, gz)) * fx, d2 = D(gx, gy + 1, gz + 1) + (D(gx + 1, gy + 1, gz + 1) - D(gx, gy + 1, gz + 1)) * fx;
        const lo = a + (b - a) * fz, hi = c2 + (d2 - c2) * fz, v = lo + (hi - lo) * fy;
        if (v > 0.06) data[i] = NETHERRACK;
        else if (y <= NETHER_SEA) data[i] = LAVA;
      }
      // песок душ и гравий у берегов лавового моря
      const patch = w.floor.n2(wx / 18, wz / 18);
      for (let y = NETHER_SEA - 2; y < NETHER_SEA + 8; y++) {
        const i = cidx(x, y, z);
        if (data[i] === NETHERRACK && data[i + 256] === 0) {
          const kind = patch > 0.25 ? SOUL_SAND : patch < -0.45 ? B.gravel : 0;
          if (kind) for (let k = 0; k < 3 && y - k > 4; k++) if (data[i - k * 256] === NETHERRACK) data[i - k * 256] = kind;
        }
      }
    }
    const orng = mulberry32((seed ^ Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663) ^ 0x7777) | 0);
    // кварц
    for (let v = 0; v < 14; v++) {
      let x = (orng() * CS) | 0, z = (orng() * CS) | 0, y = 10 + ((orng() * 108) | 0);
      const n = 2 + ((orng() * 10) | 0);
      for (let k = 0; k < n; k++) {
        if (x >= 0 && x < CS && z >= 0 && z < CS && y > 0 && y < CH && data[cidx(x, y, z)] === NETHERRACK) data[cidx(x, y, z)] = QUARTZ_ORE;
        const d = (orng() * 6) | 0;
        if (d === 0) x++; else if (d === 1) x--; else if (d === 2) z++; else if (d === 3) z--; else if (d === 4) y++; else y--;
      }
    }
    // светокамень: гроздья с потолка пещер
    for (let v = 0; v < 8; v++) {
      const x0 = 2 + ((orng() * 12) | 0), z0 = 2 + ((orng() * 12) | 0);
      let y0 = 50 + ((orng() * 60) | 0);
      if (data[cidx(x0, y0, z0)] !== 0) continue;
      while (y0 < CH - 6 && data[cidx(x0, y0 + 1, z0)] === 0) y0++;         // до потолка пещеры
      if (y0 >= CH - 6 || data[cidx(x0, y0 + 1, z0)] !== NETHERRACK) continue;
      data[cidx(x0, y0, z0)] = B.glowstone;
      for (let k = 0; k < 40; k++) {
        const x = x0 + ((orng() * 5) | 0) - 2, z = z0 + ((orng() * 5) | 0) - 2, y = y0 - ((orng() * 5) | 0);
        if (x < 0 || x >= CS || z < 0 || z >= CS || y < 6) continue;
        const i = cidx(x, y, z);
        if (data[i] !== 0) continue;
        const nbs = [i + 256, i - 256, x > 0 ? i - 1 : -1, x < CS - 1 ? i + 1 : -1, z > 0 ? i - 16 : -1, z < CS - 1 ? i + 16 : -1];
        if (nbs.filter((j) => j >= 0 && data[j] === B.glowstone).length === 1) data[i] = B.glowstone;
      }
    }
    // крепости
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const f = fortressAt(seed, Math.floor(X0 / FORT_CELL) + dx, Math.floor(Z0 / FORT_CELL) + dz);
      if (f) buildFortress(data, X0, Z0, f);
    }
    return data;
  }
  function buildFortress(data, X0, Z0, f) {
    const Y = f.y, A = f.arm;
    const put = (x, y, z, id) => { if (y > 0 && y < CH - 1) data[cidx(x, y, z)] = id; };
    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      const wx = X0 + x, wz = Z0 + z, dx = wx - f.x, dz = wz - f.z;
      const room = Math.abs(dx) <= 6 && Math.abs(dz) <= 6;
      const alongX = Math.abs(dz) <= 2 && Math.abs(dx) <= A, alongZ = Math.abs(dx) <= 2 && Math.abs(dz) <= A;
      if (room) {
        const edge = Math.abs(dx) === 6 || Math.abs(dz) === 6;
        put(x, Y, z, NETHER_BRICKS);
        for (let y = Y + 1; y <= Y + 5; y++) {
          const door = edge && (Math.abs(dx) <= 1 || Math.abs(dz) <= 1) && y <= Y + 3;
          put(x, y, z, edge && !door ? NETHER_BRICKS : 0);
        }
        put(x, Y + 6, z, NETHER_BRICKS);
        // сад адского нароста у западной стены
        if (dx === -4 && Math.abs(dz) <= 3) { put(x, Y, z, SOUL_SAND); put(x, Y + 1, z, NETHER_WART + 3); }
        if (dx === 0 && dz === 0) put(x, Y + 1, z, SPAWNER);
        // колонны зала до земли
        if (Math.abs(dx) === 6 && Math.abs(dz) === 6) for (let y = Y - 1; y > 4 && (data[cidx(x, y, z)] === 0 || data[cidx(x, y, z)] === LAVA); y--) put(x, y, z, NETHER_BRICKS);
        continue;
      }
      if (!alongX && !alongZ) continue;
      const off = alongX ? Math.abs(dz) : Math.abs(dx), along = alongX ? dx : dz;
      put(x, Y, z, NETHER_BRICKS);
      for (let y = Y + 1; y <= Y + 3; y++) {
        if (off === 2) put(x, y, z, y === Y + 2 && ((along % 4) + 4) % 4 === 0 ? NETHER_FENCE : NETHER_BRICKS);
        else put(x, y, z, 0);
      }
      put(x, Y + 4, z, NETHER_BRICKS);
      // опоры моста каждые 8 блоков
      if (((along % 8) + 8) % 8 === 0 && off <= 1) for (let y = Y - 1; y > 4 && (data[cidx(x, y, z)] === 0 || data[cidx(x, y, z)] === LAVA); y--) put(x, y, z, NETHER_BRICKS);
    }
  }

  function generate(seed, cx, cz, gen) {
    if (gen === 'nether') return generateNether(seed, cx, cz);
    const w = worldOf(seed, gen);
    const data = new Uint16Array(CVOL);
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
      if (col.legacy) {
        const isl = legacyIsland();
        for (let y = 1; y < CH; y++) {
          const i = cidx(x, y, z);
          if (data[i]) continue;
          if (y < LEG_DY) data[i] = B.stone;
          else if (y < LEG_DY + 32) data[i] = isl.get(wx, y - LEG_DY, wz);
        }
        continue;
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
      if (col.legacy) continue;
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
          // глубоко в пещерах - озёра лавы, как в оригинале (ниже 11)
          if (data[i] !== B.bedrock && data[i] !== B.water) data[i] = y <= 10 ? LAVA : 0;
        }
      }
    }
    // руда: жилы, начатые в этом куске
    const ores = [[B.coal_ore, 18, 12, 6, 110], [B.iron_ore, 10, 8, 5, 64], [B.gold_ore, 3, 7, 5, 32], [B.diamond_ore, 2, 5, 5, 16], [REDSTONE_ORE, 6, 7, 5, 16], [LAPIS_ORE, 2, 6, 5, 30], [B.gravel, 6, 16, 8, 90], [B.dirt, 5, 16, 10, 100], [B.glowstone, 2, 6, 5, 26]];
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
    // тростник: на песке, траве и земле у самой воды (берег на уровне моря)
    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      const col = colAt(x, z), h = col.h;
      if (col.legacy || h < SEA || h > SEA + 1) continue;
      const top = get(x, h, z);
      if ((top !== B.sand && top !== B.grass && top !== B.dirt) || get(x, h + 1, z) !== 0) continue;
      let wet = false;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (colAt(x + dx, z + dz).h < SEA) wet = true;
      const wx = X0 + x, wz = Z0 + z;
      if (wet && hash3(wx, 5, wz, seed + 777) < 0.2) { const n = 1 + ((hash3(wx, 6, wz, seed) * 3) | 0); for (let k = 1; k <= n; k++) data[cidx(x, h + k, z)] = SUGAR_CANE; }
    }
    // изумруды: по одному в камне гор
    for (let v = 0; v < 6; v++) {
      const x = (orng() * CS) | 0, z = (orng() * CS) | 0, y = 4 + ((orng() * 28) | 0);
      if (colAt(x, z).biome === MOUNTAINS && data[cidx(x, y, z)] === B.stone) data[cidx(x, y, z)] = EMERALD_ORE;
    }
    // растения на поверхности
    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      const col = colAt(x, z), h = col.h;
      if (h >= CH - 2 || h <= SEA || col.legacy) continue;
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
    if (!w.legacy) buildVillages(w, data, X0, Z0, colAt);
    return data;
  }

  // Контрольная сумма куска (FNV-1a) - для законов «одно зерно - один мир»
  function checksum(data) {
    let h = 0x811c9dc5;
    for (let i = 0; i < data.length; i++) { h ^= data[i]; h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }

  // Точка появления: ближайшая к началу суша без воды над ней
  function findSpawn(seed, gen) {
    if (gen === 'legacy') return { x: 0, z: 0, h: legacyIsland().top(0, 0) + LEG_DY };
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
    const R = new Uint16Array(RVOL);
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

    // высота жидкости в клетке (в шестнадцатых): над ней та же жидкость - во всю клетку
    const fluidH = (ri, rid) => {
      if (ri + RA < RVOL && FLUID[R[ri + RA]] === FLUID[rid]) return 16;
      const l = FLEVEL[rid];
      return FFALL[rid] || l === 0 ? 14 : (8 - l) / 9 * 16;
    };
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
        for (let k = 0; k < 4; k++) lights[k] = [L[0], Math.max(L[1], EMIT[id] ? 14 * 17 : 0), 255];
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
      if (rc === 4 || rc === 10) {      // вода и лава: высота по уровню, грани к своей жидкости - только ступенька
        const fam = FLUID[id];
        const hh = fluidH(i, id);
        const bufF = rc === 4 ? trans : opaque;
        for (let f = 0; f < 6; f++) {
          const F = FACES[f];
          const nx = x + F.n[0], ny = y + F.n[1], nz = z + F.n[2];
          if (ny < 0) continue;
          const nid = ny >= CH ? 0 : R[ridx(nx, ny, nz)];
          if (isOpq(nid)) continue;
          let lo = 0;
          if (FLUID[nid] === fam) {
            if (f === 2 || f === 3) continue;
            const nh = fluidH(ridx(nx, ny, nz), nid);
            if (nh >= hh) continue;
            lo = nh;
          }
          if (f === 3 && hh === 16) continue;
          if (rc === 4 && nid === B.ice) continue;
          const ni = ny >= CH ? -1 : ridx(nx, ny, nz);
          const L = ni < 0 ? [255, 0, 255] : [sky[ni] * 17, blk[ni] * 17, 255];
          const vs = VERT[f];
          for (let k = 0; k < 4; k++) {
            const V = vs[k];
            let py = V.p[1] ? hh : lo;
            if (f === 2) py = 0;
            if (f === 3) py = hh;
            verts[k] = [(lx + V.p[0]) * 16, y * 16 + py, (lz + V.p[2]) * 16, V.u, f === 2 || f === 3 ? V.v : py / 16];
            lights[k] = L;
          }
          emitQuad(bufF, verts, texT[id * 6 + f], F.shade, lights, false);
        }
        continue;
      }
      if (rc === 9) {      // посев: четыре плоскости решёткой, с двух сторон
        const t = TEXF[id * 6];
        const L = cellLight(i);
        for (let k = 0; k < 4; k++) lights[k] = L;
        const X = lx * 16, Y = y * 16 - 1, Z = lz * 16;
        for (const [p0, p1] of [[[4, 0], [4, 16]], [[12, 0], [12, 16]], [[0, 4], [16, 4]], [[0, 12], [16, 12]]]) {
          for (const back of [false, true]) {
            const A = back ? p1 : p0, Bq = back ? p0 : p1;
            verts[0] = [X + A[0], Y, Z + A[1], 0, 0]; verts[1] = [X + Bq[0], Y, Z + Bq[1], 1, 0];
            verts[2] = [X + A[0], Y + 16, Z + A[1], 0, 1]; verts[3] = [X + Bq[0], Y + 16, Z + Bq[1], 1, 1];
            emitQuad(opaque, verts, t, 0.9, lights, false);
          }
        }
        continue;
      }
      if (rc === 8) {      // коробки не во всю клетку: двери, кровать, сундук, грядка, кактус, рычаг
        const rot = BLOCKS[id].rot || 0;
        const shp = DYN[id] ? shapeOf(id, (dx, dy, dz) => R[ridx(x + dx, y + dy, z + dz)], 'render') : SHAPE[id];
        for (const bx of shp) {
          const lo = [bx[0], bx[1], bx[2]], hi = [bx[3], bx[4], bx[5]];
          for (let f = 0; f < 6; f++) {
            const F = FACES[f];
            const ax = F.n[0] ? 0 : F.n[1] ? 1 : 2, pos = F.n[ax] > 0;
            const edge = pos ? hi[ax] === 16 : lo[ax] === 0;
            let ni = i;
            if (edge) {
              const nx = x + F.n[0], ny = y + F.n[1], nz = z + F.n[2];
              if (ny < 0) continue;
              if (ny < CH) { const nid = R[ridx(nx, ny, nz)]; if (isOpq(nid)) continue; ni = ridx(nx, ny, nz); } else ni = -1;
            }
            const L = ni < 0 ? [255, 0, 255] : [Math.max(sky[ni], sky[i]) * 17, Math.max(blk[ni], blk[i]) * 17, 255];
            const t = bx[6] ? T[bx[6]] : texT[id * 6 + f];
            const vs = VERT[f];
            const a1 = F.e1[0] ? 0 : F.e1[1] ? 1 : 2, s1 = F.e1[a1];
            const a2 = F.e2[0] ? 0 : F.e2[1] ? 1 : 2, s2 = F.e2[a2];
            for (let k = 0; k < 4; k++) {
              const V = vs[k];
              const c = [V.p[0] ? hi[0] : lo[0], V.p[1] ? hi[1] : lo[1], V.p[2] ? hi[2] : lo[2]];
              let u = s1 > 0 ? c[a1] / 16 : 1 - c[a1] / 16;
              let v = s2 > 0 ? c[a2] / 16 : 1 - c[a2] / 16;
              if (f === 3 && rot) { for (let r2 = 0; r2 < rot; r2++) { const tu = u; u = v; v = 1 - tu; } }
              verts[k] = [lx * 16 + c[0], y * 16 + c[1], lz * 16 + c[2], u, v];
              lights[k] = L;
            }
            emitQuad(TBOX[id] ? trans : opaque, verts, t, F.shade, lights, false);
          }
        }
        continue;
      }
      const buf = rc === 5 ? trans : opaque;
      const waterTop = false;
      for (let f = 0; f < 6; f++) {
        const F = FACES[f];
        const nx = x + F.n[0], ny = y + F.n[1], nz = z + F.n[2];
        if (ny < 0) continue;
        const nid = ny >= CH ? 0 : R[ridx(nx, ny, nz)];
        // видна ли грань
        if (isOpq(nid)) continue;
        if ((rc === 3 || rc === 5) && nid === id) continue;
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
  const LAVA = 80;

  // Упаковка куска для хранения: пары (длина, значение) по 16 бит, в начале метка 0,0
  // (старый формат - пары по байту, длина там не бывает нулём, поэтому метка их различает)
  function rleEncode(d) {
    const out = [0];
    let i = 0;
    while (i < d.length) {
      const v = d[i]; let n = 1;
      while (i + n < d.length && d[i + n] === v && n < 65535) n++;
      out.push(n, v); i += n;
    }
    const u16 = Uint16Array.from(out), u8 = new Uint8Array(u16.length * 2);
    for (let k = 0; k < u16.length; k++) { u8[k * 2] = u16[k] & 255; u8[k * 2 + 1] = u16[k] >> 8; }
    return u8;
  }
  function rleDecode(r) {
    const d = new Uint16Array(CVOL);
    let p = 0;
    if (r.length >= 2 && r[0] === 0 && r[1] === 0) {
      for (let i = 2; i + 3 < r.length; i += 4) {
        const n = r[i] | (r[i + 1] << 8), v = r[i + 2] | (r[i + 3] << 8);
        d.fill(v, p, Math.min(CVOL, p + n)); p += n;
      }
      return d;
    }
    for (let i = 0; i < r.length; i += 2) { d.fill(r[i + 1], p, p + r[i]); p += r[i]; }
    return d;
  }

  return {
    CS, CH, SEA, CVOL, MAXID, isBlock, cidx, TILES, T, ATLAS_COLS, ATLAS_ROWS, BLOCKS, B, RENDER, SOLID, EMIT, FILTER, TEXF, WALL_TORCH, FACE_OF_ROT,
    FLUID, FLEVEL, FFALL, SHAPE, CSHAPE, DYN, TBOX, shapeOf, ENCH_TABLE, ANVIL, IRON_BLOCK, SUGAR_CANE, EMERALD_ORE, LAPIS_ORE, PATH, villageAt, villageNear, VIL_CELL, VIL_R, wireLinks, FDIR, FDIR6_OF_DIR4, FACE_OF_DIR6, rotBox, WIRE, RS_TORCH, RS_TORCH_OFF, REPEATER, BUTTON, WOOD_BUTTON, RS_PLATE, RS_WOOD_PLATE, LAMP, PISTON, PISTON_HEAD, REDSTONE_ORE, REDSTONE_BLOCK, RS_CONNECT, NETHERRACK, SOUL_SAND, NETHER_BRICKS, NETHER_FENCE, QUARTZ_ORE, PORTAL, NETHER_WART, SPAWNER, NB_SLAB, NB_STAIRS, slabBase, stairsBase, NETHER_SEA, fortressAt, fortressNear, FACES, VERT, SLAB, STAIRS, MATS, FENCE, GATE, TRAPDOOR, IRON_TRAPDOOR, PANE, LADDER, DOOR_WOOD, DOOR_IRON, LEG_DY, LEG_HALF, LEG_MAP, legHeight, legacyIsland, inLegacy,
    BIOMES, mulberry32, hash3, seedFrom, makeNoise, worldOf, column, treeAt, generate, checksum, findSpawn, buildMesh, rleEncode, rleDecode,
  };
}
if (typeof module !== 'undefined') module.exports = VoxelCore;
