// Таблицы данных: предметы, инструменты, еда, топливо, рецепты верстака и печи, достижения.
// Всё поведение строится по этим таблицам, а не по цепочкам if: новый рецепт или предмет -
// это одна строка здесь.
(function () {
  'use strict';
  const VX = window.VX = window.VX || {};
  const C = VX.core, B = C.B;

  // ---------- Предметы (id от 256; блоки - это id < 256) ----------
  const TIERS = [
    { key: 'wood', name: 'Деревянн', speed: 2, dur: 59, level: 0, dmg: 0 },
    { key: 'stone', name: 'Каменн', speed: 4, dur: 131, level: 1, dmg: 1 },
    { key: 'iron', name: 'Железн', speed: 6, dur: 250, level: 2, dmg: 2 },
    { key: 'diamond', name: 'Алмазн', speed: 8, dur: 1561, level: 3, dmg: 3 },
  ];
  const TOOL_KINDS = [
    { type: 'pickaxe', name: (t) => t + 'ая кирка', base: 2 },
    { type: 'axe', name: (t) => t + 'ый топор', base: 3 },
    { type: 'shovel', name: (t) => t + 'ая лопата', base: 1.5 },
    { type: 'sword', name: (t) => t + 'ый меч', base: 4 },
  ];
  const ITEMS = [];
  const I = {};
  function item(id, key, name, o) {
    const it = Object.assign({ id, key, name, stack: 64, draw: key }, o);
    ITEMS.push(it); I[key] = id;
    return it;
  }
  item(256, 'stick', 'Палка', { fuel: 5 });
  item(257, 'coal', 'Уголь', { fuel: 80 });
  item(258, 'charcoal', 'Древесный уголь', { fuel: 80 });
  item(259, 'iron_ingot', 'Железный слиток');
  item(260, 'gold_ingot', 'Золотой слиток');
  item(261, 'diamond', 'Алмаз');
  let tid = 262;
  for (const k of TOOL_KINDS) for (const t of TIERS) {
    item(tid++, t.key + '_' + k.type, k.name(t.name), {
      stack: 1, draw: k.type + ':' + t.key, fuel: t.key === 'wood' ? 10 : 0,
      tool: { type: k.type, speed: t.speed, level: t.level, dur: t.dur, dmg: k.base + t.dmg },
    });
  }
  item(278, 'raw_porkchop', 'Сырая свинина', { food: { h: 3, sat: 1.8 } });
  item(279, 'cooked_porkchop', 'Жареная свинина', { food: { h: 8, sat: 12.8 } });
  item(280, 'raw_mutton', 'Сырая баранина', { food: { h: 2, sat: 1.2 } });
  item(281, 'cooked_mutton', 'Жареная баранина', { food: { h: 6, sat: 9.6 } });
  item(282, 'rotten_flesh', 'Гнилая плоть', { food: { h: 4, sat: 0.8 } });
  item(283, 'apple', 'Яблоко', { food: { h: 4, sat: 2.4 } });
  item(284, 'bone', 'Кость');
  item(285, 'world_heart', 'Сердце мира', { stack: 1, draw: 'heart' });

  // ---------- Третий заход (id с 300; прежние id не сдвигаются - сохранённые миры читаются) ----------
  const GOLD = { key: 'gold', name: 'Золот', speed: 12, dur: 32, level: 0, dmg: 0 };
  const GOLD_NAMES = { pickaxe: 'Золотая кирка', axe: 'Золотой топор', shovel: 'Золотая лопата', sword: 'Золотой меч' };
  let gid = 300;
  for (const k of TOOL_KINDS) {
    item(gid++, 'gold_' + k.type, GOLD_NAMES[k.type], { stack: 1, draw: k.type + ':gold', tool: { type: k.type, speed: GOLD.speed, level: GOLD.level, dur: GOLD.dur, dmg: k.base + GOLD.dmg } });
  }
  const ALL_TIERS = [TIERS[0], TIERS[1], TIERS[2], GOLD, TIERS[3]];
  const HOE_NAMES = { wood: 'Деревянная мотыга', stone: 'Каменная мотыга', iron: 'Железная мотыга', gold: 'Золотая мотыга', diamond: 'Алмазная мотыга' };
  for (const t of ALL_TIERS) item(gid++, t.key + '_hoe', HOE_NAMES[t.key], { stack: 1, draw: 'hoe:' + t.key, fuel: t.key === 'wood' ? 10 : 0, tool: { type: 'hoe', speed: t.speed, level: t.level, dur: t.dur, dmg: 1 } });
  // броня: очки защиты и прочность как в оригинале (прочность = основа материала x множитель части)
  const ARMOR_MATS = [
    { key: 'leather', base: 5, pts: [1, 3, 2, 1], tough: 0, names: ['Кожаный шлем', 'Кожаный нагрудник', 'Кожаные поножи', 'Кожаные ботинки'] },
    { key: 'iron', base: 15, pts: [2, 6, 5, 2], tough: 0, names: ['Железный шлем', 'Железный нагрудник', 'Железные поножи', 'Железные ботинки'] },
    { key: 'gold', base: 7, pts: [2, 5, 3, 1], tough: 0, names: ['Золотой шлем', 'Золотой нагрудник', 'Золотые поножи', 'Золотые ботинки'] },
    { key: 'diamond', base: 33, pts: [3, 8, 6, 3], tough: 2, names: ['Алмазный шлем', 'Алмазный нагрудник', 'Алмазные поножи', 'Алмазные ботинки'] },
  ];
  const PIECES = [{ key: 'helmet', mult: 11 }, { key: 'chestplate', mult: 16 }, { key: 'leggings', mult: 15 }, { key: 'boots', mult: 13 }];
  let aid = 310;
  for (const m of ARMOR_MATS) PIECES.forEach((pc, slot) => {
    item(aid++, m.key + '_' + pc.key, m.names[slot], { stack: 1, draw: 'armor:' + pc.key + '-' + m.key, armor: { slot, pts: m.pts[slot], dur: m.base * pc.mult, tough: m.tough, mat: m.key } });
  });
  item(326, 'bucket', 'Ведро', { stack: 16 });
  item(327, 'water_bucket', 'Ведро воды', { stack: 1, draw: 'bucket:water', fluid: 25 });
  item(328, 'lava_bucket', 'Ведро лавы', { stack: 1, draw: 'bucket:lava', fluid: 80, fuel: 1000, fuelLeft: 326 });
  item(329, 'shears', 'Ножницы', { stack: 1, tool: { type: 'shears', speed: 1, level: 0, dur: 238, dmg: 1 } });
  item(330, 'bow', 'Лук', { stack: 1, tool: { type: 'bow', speed: 1, level: 0, dur: 384, dmg: 1 } });
  item(331, 'arrow', 'Стрела');
  item(332, 'string', 'Нить');
  item(333, 'feather', 'Перо');
  item(334, 'flint', 'Кремень');
  item(335, 'leather', 'Кожа');
  item(336, 'raw_beef', 'Сырая говядина', { food: { h: 3, sat: 1.8 } });
  item(337, 'steak', 'Стейк', { food: { h: 8, sat: 12.8 } });
  item(338, 'raw_chicken', 'Сырая курица', { food: { h: 2, sat: 1.2 } });
  item(339, 'cooked_chicken', 'Жареная курица', { food: { h: 6, sat: 7.2 } });
  item(340, 'wheat', 'Пшеница');
  item(341, 'seeds', 'Семена пшеницы', { plant: B.wheat_0 });
  item(342, 'bread', 'Хлеб', { food: { h: 5, sat: 6 } });
  item(343, 'bone_meal', 'Костная мука', { draw: 'dye:white', fertilizer: true, dye: 'white' });
  const DYES = [['red', 'Красный'], ['yellow', 'Жёлтый'], ['blue', 'Синий'], ['green', 'Зелёный'], ['black', 'Чёрный']];
  DYES.forEach(([c, n], k) => item(344 + k, c + '_dye', n + ' краситель', { draw: 'dye:' + c, dye: c }));
  item(349, 'oak_door', 'Деревянная дверь', { draw: 'door:wood', places: 'door', door: C.DOOR_WOOD, group: 'build' });
  item(350, 'iron_door', 'Железная дверь', { draw: 'door:iron', places: 'door', door: C.DOOR_IRON, group: 'build' });
  item(351, 'bed', 'Кровать', { stack: 1, draw: 'bed', places: 'bed', group: 'build' });
  const EGG_MOBS = [['pig', 'свинья'], ['sheep', 'овца'], ['cow', 'корова'], ['chicken', 'курица'], ['zombie', 'зомби'], ['skeleton', 'скелет'], ['spider', 'паук']];
  EGG_MOBS.forEach(([m, n], k) => item(352 + k, 'egg_' + m, 'Яйцо призыва: ' + n, { draw: 'egg:' + m, egg: m, creativeOnly: true }));
  // цвет шерсти по красителю
  const WOOL_OF = { white: B.wool_white, red: B.wool_red, yellow: B.wool_yellow, blue: B.wool_blue, green: B.wool_green, black: B.wool_black };

  // ---------- Общий доступ к свойствам любого id ----------
  const BY = [];
  for (const it of ITEMS) BY[it.id] = it;
  function info(id) {
    if (id < 256) {
      const b = C.BLOCKS[id];
      return b ? { id, key: b.key, name: b.name, stack: 64, block: true, fuel: BLOCK_FUEL[id] || 0 } : null;
    }
    return BY[id] || null;
  }
  const BLOCK_FUEL = {};
  for (const k of ['oak_log', 'birch_log', 'spruce_log', 'oak_planks', 'birch_planks', 'spruce_planks', 'crafting_table', 'bookshelf']) BLOCK_FUEL[B[k]] = 15;
  const maxStack = (id) => (info(id) || { stack: 64 }).stack;
  const toolOf = (id) => { const it = BY[id]; return it && it.tool ? it.tool : null; };
  const armorOf = (id) => { const it = BY[id]; return it && it.armor ? it.armor : null; };

  // ---------- Добыча: время по формуле оригинала ----------
  // время = твёрдость x (1.5, если блок с этим инструментом что-то даёт, иначе 5) / скорость
  function canHarvest(blockId, toolId) {
    const b = C.BLOCKS[blockId];
    if (!b || b.level < 0) return true;
    const t = toolOf(toolId);
    return !!t && t.type === b.tool && t.level >= b.level;
  }
  function breakTime(blockId, toolId) {
    const b = C.BLOCKS[blockId];
    if (!b || b.hardness < 0) return Infinity;
    if (b.hardness === 0) return 0;
    const t = toolOf(toolId);
    let speed = t && t.type === b.tool ? t.speed : 1;
    if (t && t.type === 'shears') { if (b.render === 'leaves') speed = 15; else if (b.sound === 'cloth') speed = 5; }
    return b.hardness * (canHarvest(blockId, toolId) ? 1.5 : 5) / speed;
  }
  // Что выпадает из блока (массив [id, n]); rnd - для случайных (яблоко из листвы)
  function dropsOf(blockId, toolId, rnd) {
    const b = C.BLOCKS[blockId];
    if (!b) return [];
    if (!canHarvest(blockId, toolId)) return [];
    const t = toolOf(toolId);
    if (t && t.type === 'shears' && (b.render === 'leaves' || b.key === 'tall_grass')) return [[blockId, 1]];
    if (b.key === 'oak_leaves' && rnd() < 0.06) return [[I.apple, 1]];
    if (b.key === 'tall_grass') return rnd() < 0.125 ? [[I.seeds, 1]] : [];
    if (b.key === 'gravel' && rnd() < 0.1) return [[I.flint, 1]];
    if (b.crop !== undefined) return b.crop === 7 ? [[I.wheat, 1], [I.seeds, (rnd() * 4) | 0]].filter((d) => d[1] > 0) : [[I.seeds, 1]];
    const d = b.drop === undefined ? b.item : b.drop;
    return d ? [[d, 1]] : [];
  }

  // ---------- Рецепты верстака ----------
  // shape - строки узора (узор можно ставить в любое место сетки и отражать), keys - что значит буква;
  // значение ключа - id, имя блока/предмета или метка группы '#planks'
  const TAGS = {
    planks: [B.oak_planks, B.birch_planks, B.spruce_planks],
    logs: [B.oak_log, B.birch_log, B.spruce_log],
    coals: [I.coal, I.charcoal],
    wool: [B.wool_white, B.wool_red, B.wool_blue, B.wool_yellow, B.wool_green, B.wool_black],
  };
  const RECIPES = [
    { out: ['oak_planks', 4], shapeless: ['oak_log'] },
    { out: ['birch_planks', 4], shapeless: ['birch_log'] },
    { out: ['spruce_planks', 4], shapeless: ['spruce_log'] },
    { out: ['stick', 4], shape: ['P', 'P'], keys: { P: '#planks' } },
    { out: ['crafting_table', 1], shape: ['PP', 'PP'], keys: { P: '#planks' } },
    { out: ['furnace', 1], shape: ['CCC', 'C C', 'CCC'], keys: { C: 'cobblestone' } },
    { out: ['torch', 4], shape: ['K', 'S'], keys: { K: '#coals', S: 'stick' } },
    { out: ['sandstone', 1], shape: ['SS', 'SS'], keys: { S: 'sand' } },
    { out: ['stone_bricks', 4], shape: ['SS', 'SS'], keys: { S: 'stone' } },
    { out: ['bookshelf', 1], shape: ['PPP', 'SSS', 'PPP'], keys: { P: '#planks', S: 'stick' } },
    { out: ['red_dye', 1], shapeless: ['poppy'] },
    { out: ['yellow_dye', 1], shapeless: ['dandelion'] },
    { out: ['blue_dye', 1], shapeless: ['blue_flower'] },
    { out: ['black_dye', 1], shapeless: ['#coals'] },
    { out: ['bone_meal', 3], shapeless: ['bone'] },
    { out: ['wool_yellow', 1], shapeless: ['wool_white', 'yellow_dye'] },
    { out: ['wool_red', 1], shapeless: ['wool_white', 'red_dye'] },
    { out: ['wool_blue', 1], shapeless: ['wool_white', 'blue_dye'] },
    { out: ['wool_green', 1], shapeless: ['wool_white', 'green_dye'] },
    { out: ['wool_black', 1], shapeless: ['wool_white', 'black_dye'] },
    { out: ['bucket', 1], shape: ['I I', ' I '], keys: { I: 'iron_ingot' } },
    { out: ['shears', 1], shape: [' I', 'I '], keys: { I: 'iron_ingot' } },
    { out: ['bow', 1], shape: [' SX', 'S X', ' SX'], keys: { S: 'stick', X: 'string' } },
    { out: ['arrow', 4], shape: ['F', 'S', 'E'], keys: { F: 'flint', S: 'stick', E: 'feather' } },
    { out: ['bread', 1], shape: ['WWW'], keys: { W: 'wheat' } },
    { out: ['chest', 1], shape: ['PPP', 'P P', 'PPP'], keys: { P: '#planks' } },
    { out: ['oak_door', 3], shape: ['PP', 'PP', 'PP'], keys: { P: '#planks' } },
    { out: ['iron_door', 3], shape: ['II', 'II', 'II'], keys: { I: 'iron_ingot' } },
    { out: ['bed', 1], shape: ['WWW', 'PPP'], keys: { W: '#wool', P: '#planks' } },
    { out: ['lever', 1], shape: ['S', 'C'], keys: { S: 'stick', C: 'cobblestone' } },
    { out: ['mossy_cobblestone', 1], shapeless: ['cobblestone', 'tall_grass'] },
    { out: ['world_heart', 1], shape: ['GDG', 'DAD', 'GDG'], keys: { G: 'gold_ingot', D: 'diamond', A: 'apple' } },
  ];
  const MATS = { wood: '#planks', stone: 'cobblestone', iron: 'iron_ingot', gold: 'gold_ingot', diamond: 'diamond' };
  for (const t of ALL_TIERS) RECIPES.push({ out: [t.key + '_hoe', 1], shape: ['MM', ' S', ' S'], keys: { M: MATS[t.key], S: 'stick' } });
  const ARMOR_IN = { leather: 'leather', iron: 'iron_ingot', gold: 'gold_ingot', diamond: 'diamond' };
  const ARMOR_SHAPES = { helmet: ['MMM', 'M M'], chestplate: ['M M', 'MMM', 'MMM'], leggings: ['MMM', 'M M', 'M M'], boots: ['M M', 'M M'] };
  for (const m of ARMOR_MATS) for (const pc of PIECES) RECIPES.push({ out: [m.key + '_' + pc.key, 1], shape: ARMOR_SHAPES[pc.key], keys: { M: ARMOR_IN[m.key] } });
  for (const t of ALL_TIERS) {
    const M = MATS[t.key];
    RECIPES.push({ out: [t.key + '_pickaxe', 1], shape: ['MMM', ' S ', ' S '], keys: { M, S: 'stick' } });
    RECIPES.push({ out: [t.key + '_axe', 1], shape: ['MM', 'MS', ' S'], keys: { M, S: 'stick' } });
    RECIPES.push({ out: [t.key + '_shovel', 1], shape: ['M', 'S', 'S'], keys: { M, S: 'stick' } });
    RECIPES.push({ out: [t.key + '_sword', 1], shape: ['M', 'M', 'S'], keys: { M, S: 'stick' } });
  }
  const idOf = (k) => (typeof k === 'number' ? k : B[k] !== undefined ? B[k] : I[k]);
  function matcher(k) {
    if (k[0] === '#') { const set = TAGS[k.slice(1)]; return (id) => set.includes(id); }
    const id = idOf(k);
    if (id === undefined) throw new Error('нет такого блока или предмета: ' + k);
    return (x) => x === id;
  }
  for (const r of RECIPES) {
    r.outId = idOf(r.out[0]); r.count = r.out[1];
    if (r.outId === undefined) throw new Error('рецепт без результата: ' + r.out[0]);
    if (r.shape) {
      r.w = Math.max(...r.shape.map((s) => s.length)); r.h = r.shape.length;
      r.cells = [];
      for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
        const ch = r.shape[y][x] || ' ';
        r.cells.push(ch === ' ' ? null : matcher(r.keys[ch]));
      }
    } else r.parts = r.shapeless.map(matcher);
  }
  // grid - массив id (0 - пусто) размером size x size. Возвращает рецепт или null.
  function matchRecipe(grid, size) {
    let x0 = size, y0 = size, x1 = -1, y1 = -1;
    const items = [];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const v = grid[y * size + x];
      if (!v) continue;
      items.push(v);
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    if (!items.length) return null;
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    for (const r of RECIPES) {
      if (r.shape) {
        if (r.w !== w || r.h !== h) continue;
        for (const mirror of [false, true]) {
          let ok = true;
          for (let y = 0; y < h && ok; y++) for (let x = 0; x < w && ok; x++) {
            const cell = r.cells[y * w + (mirror ? w - 1 - x : x)];
            const v = grid[(y0 + y) * size + x0 + x];
            ok = cell ? !!v && cell(v) : !v;
          }
          if (ok) return r;
        }
      } else {
        if (r.parts.length !== items.length) continue;
        const left = items.slice();
        let ok = true;
        for (const p of r.parts) {
          const k = left.findIndex(p);
          if (k < 0) { ok = false; break; }
          left.splice(k, 1);
        }
        if (ok) return r;
      }
    }
    return null;
  }

  // ---------- Печь ----------
  const SMELT = [
    ['cobblestone', 'stone'], ['sand', 'glass'], ['iron_ore', 'iron_ingot'], ['gold_ore', 'gold_ingot'],
    ['oak_log', 'charcoal'], ['birch_log', 'charcoal'], ['spruce_log', 'charcoal'],
    ['raw_porkchop', 'cooked_porkchop'], ['raw_mutton', 'cooked_mutton'], ['clay', 'bricks'], ['cactus', 'green_dye'],
    ['raw_beef', 'steak'], ['raw_chicken', 'cooked_chicken'],
  ].map(([a, b]) => ({ in: idOf(a), out: idOf(b) }));
  const SMELT_TIME = 10;     // секунд на один предмет, как в оригинале
  const smeltOf = (id) => SMELT.find((s) => s.in === id) || null;
  const fuelOf = (id) => { const i = info(id); return i && i.fuel ? i.fuel : 0; };

  // ---------- Творческий инвентарь: вкладки ----------
  const TABS = [
    { key: 'build', name: 'Строительство', icon: B.bricks },
    { key: 'nature', name: 'Природа', icon: B.grass },
    { key: 'color', name: 'Цвет', icon: B.wool_red },
    { key: 'tools', name: 'Инструменты', icon: I.iron_pickaxe },
    { key: 'food', name: 'Еда и прочее', icon: I.apple },
    { key: 'search', name: 'Поиск', icon: null },
    { key: 'inv', name: 'Инвентарь', icon: B.crafting_table },
  ];
  const MATERIAL_KEYS = ['stick', 'coal', 'charcoal', 'iron_ingot', 'gold_ingot', 'diamond', 'world_heart', 'bucket', 'water_bucket', 'lava_bucket', 'arrow', 'string', 'feather', 'flint', 'leather'];
  const groupOf = (it) => (it.group || (it.tool || it.armor || MATERIAL_KEYS.includes(it.key) ? 'tools' : 'food'));
  function tabItems(key, query) {
    const out = [];
    for (const b of C.BLOCKS) if (b && b.creative && (key === 'search' || b.group === key)) out.push(b.id);
    for (const it of ITEMS) if (key === 'search' || groupOf(it) === key) out.push(it.id);
    if (key === 'search' && query && query.trim()) {
      const q = query.trim().toLowerCase();
      return out.filter((id) => info(id).name.toLowerCase().includes(q));
    }
    return out;
  }

  // ---------- Мобы ----------
  const MOBS = {
    pig: { name: 'Свинья', hp: 10, speed: 1.2, w: 0.9, h: 0.9, drops: [['raw_porkchop', 1, 3]], day: true, sound: 'pig' },
    sheep: { name: 'Овца', hp: 8, speed: 1.1, w: 0.9, h: 1.3, drops: [['wool_white', 1, 1], ['raw_mutton', 1, 2]], day: true, sound: 'sheep' },
    zombie: { name: 'Зомби', hp: 20, speed: 2.3, w: 0.6, h: 1.95, drops: [['rotten_flesh', 0, 2]], hostile: true, dmg: 3, sound: 'zombie', burns: true },
    cow: { name: 'Корова', hp: 10, speed: 1.1, w: 0.9, h: 1.4, drops: [['leather', 0, 2], ['raw_beef', 1, 3]], day: true, sound: 'cow' },
    chicken: { name: 'Курица', hp: 4, speed: 1.1, w: 0.4, h: 0.7, drops: [['feather', 0, 2], ['raw_chicken', 1, 1]], day: true, sound: 'chicken', flutter: true },
    skeleton: { name: 'Скелет', hp: 20, speed: 2.1, w: 0.6, h: 1.99, drops: [['bone', 0, 2], ['arrow', 0, 2]], hostile: true, dmg: 2, ranged: true, sound: 'skeleton', burns: true },
    spider: { name: 'Паук', hp: 16, speed: 2.8, w: 1.4, h: 0.9, drops: [['string', 0, 2]], hostile: true, dmg: 2, climber: true, sound: 'spider' },
  };
  for (const k in MOBS) MOBS[k].drops = MOBS[k].drops.map(([n, a, b]) => [idOf(n), a, b]);

  // ---------- Достижения ----------
  // on - событие игры; cond - условие на данные события; count - сколько раз; parent - ветка дерева
  const ACH = [
    { id: 'root', name: 'Кубический мир', desc: 'Войти в мир', on: 'enter', icon: B.grass },
    { id: 'wood', parent: 'root', name: 'Добыть дерево', desc: 'Подобрать бревно', on: 'pickup', items: '#logs', icon: B.oak_log },
    { id: 'planks', parent: 'wood', name: 'Доски', desc: 'Сделать доски из бревна', on: 'craft', items: '#planks', icon: B.oak_planks },
    { id: 'bench', parent: 'planks', name: 'Мастерская', desc: 'Сделать верстак', on: 'craft', items: ['crafting_table'], icon: B.crafting_table },
    { id: 'wood_pick', parent: 'bench', name: 'Пора копать', desc: 'Сделать деревянную кирку', on: 'craft', items: ['wood_pickaxe'], icon: I.wood_pickaxe },
    { id: 'sword', parent: 'bench', name: 'Время приключений', desc: 'Сделать любой меч', on: 'craft', items: ['wood_sword', 'stone_sword', 'iron_sword', 'gold_sword', 'diamond_sword'], icon: I.wood_sword },
    { id: 'stone', parent: 'wood_pick', name: 'Каменный век', desc: 'Добыть булыжник', on: 'pickup', items: ['cobblestone'], icon: B.cobblestone },
    { id: 'stone_pick', parent: 'stone', name: 'Апгрейд', desc: 'Сделать каменную кирку', on: 'craft', items: ['stone_pickaxe'], icon: I.stone_pickaxe },
    { id: 'furnace', parent: 'stone', name: 'Горячая тема', desc: 'Сделать печь', on: 'craft', items: ['furnace'], icon: B.furnace },
    { id: 'coal', parent: 'wood_pick', name: 'Уголёк', desc: 'Добыть уголь', on: 'pickup', items: '#coals', icon: I.coal },
    { id: 'torch', parent: 'coal', name: 'Да будет свет', desc: 'Сделать факелы', on: 'craft', items: ['torch'], icon: B.torch },
    { id: 'deep', parent: 'stone_pick', name: 'Глубже и глубже', desc: 'Спуститься ниже высоты 16', on: 'depth', below: 16, icon: B.diamond_ore },
    { id: 'iron', parent: 'furnace', name: 'Железный век', desc: 'Выплавить железный слиток', on: 'smelt', items: ['iron_ingot'], icon: I.iron_ingot },
    { id: 'iron_pick', parent: 'iron', name: 'Крепкая кирка', desc: 'Сделать железную кирку', on: 'craft', items: ['iron_pickaxe'], icon: I.iron_pickaxe },
    { id: 'gold', parent: 'iron_pick', name: 'Золотая лихорадка', desc: 'Выплавить золотой слиток', on: 'smelt', items: ['gold_ingot'], icon: I.gold_ingot },
    { id: 'diamond', parent: 'iron_pick', name: 'Алмазы!', desc: 'Добыть алмаз', on: 'pickup', items: ['diamond'], icon: I.diamond },
    { id: 'diamond_pick', parent: 'diamond', name: 'Алмазная кирка', desc: 'Сделать алмазную кирку', on: 'craft', items: ['diamond_pickaxe'], icon: I.diamond_pickaxe },
    { id: 'zombie', parent: 'sword', name: 'Охотник на монстров', desc: 'Победить зомби', on: 'kill', mob: 'zombie', icon: I.rotten_flesh },
    { id: 'zombie10', parent: 'zombie', name: 'Гроза нежити', desc: 'Победить 10 зомби', on: 'kill', mob: 'zombie', count: 10, icon: I.iron_sword },
    { id: 'food', parent: 'root', name: 'Сытный обед', desc: 'Съесть жареное мясо', on: 'eat', items: ['cooked_porkchop', 'cooked_mutton', 'steak', 'cooked_chicken'], icon: I.cooked_porkchop },
    { id: 'wool', parent: 'root', name: 'Мягкая шерсть', desc: 'Добыть шерсть', on: 'pickup', items: ['wool_white'], icon: B.wool_white },
    { id: 'explorer', parent: 'root', name: 'Путешественник', desc: 'Побывать в 4 разных биомах', on: 'biome', count: 4, icon: B.sand },
    { id: 'house', parent: 'planks', name: 'Свой угол', desc: 'Построить дом: закрытая комната со стенами и крышей', on: 'house', icon: B.bricks },
    { id: 'armor', parent: 'iron', name: 'Броня!', desc: 'Надеть любую броню', on: 'equip', items: ITEMS.filter((it) => it.armor).map((it) => it.id), icon: I.iron_chestplate },
    { id: 'hot_stuff', parent: 'iron', name: 'Горячая штучка', desc: 'Набрать в ведро лаву', on: 'bucket', items: ['lava_bucket'], icon: I.lava_bucket },
    { id: 'obsidian', parent: 'diamond_pick', name: 'Обсидиан', desc: 'Добыть обсидиан: вода плюс лава и алмазная кирка', on: 'pickup', items: ['obsidian'], icon: B.obsidian },
    { id: 'sleep', parent: 'wool', name: 'Сладких снов', desc: 'Проспать ночь в кровати', on: 'sleep', icon: I.bed },
    { id: 'bread', parent: 'root', name: 'Хлеб насущный', desc: 'Вырастить пшеницу и сделать хлеб', on: 'craft', items: ['bread'], icon: I.bread },
    { id: 'archer', parent: 'sword', name: 'Меткий стрелок', desc: 'Победить скелета стрелой из лука', on: 'kill', mob: 'skeleton', cause: 'arrow', icon: I.bow },
    { id: 'heart', parent: 'diamond_pick', name: 'Сердце мира', desc: 'Собрать Сердце мира: золото, алмазы и яблоко', on: 'craft', items: ['world_heart'], icon: I.world_heart, final: true },
  ];
  for (const a of ACH) {
    if (a.items) a.set = typeof a.items === 'string' ? TAGS[a.items.slice(1)].slice() : a.items.map(idOf);
  }
  // Проверка одного события против таблицы: какие достижения оно даёт
  // progress - счётчики (kill:zombie, biome:набор), got - уже полученные
  function achieveOn(ev, data, progress, got) {
    const out = [];
    if (ev === 'kill') progress['kill:' + data.mob] = (progress['kill:' + data.mob] || 0) + 1;
    if (ev === 'biome') { const s = new Set(progress.biomes || []); s.add(data.biome); progress.biomes = [...s]; }
    for (const a of ACH) {
      if (got[a.id] || a.on !== ev) continue;
      let ok = false;
      if (a.set) ok = a.set.includes(data.id);
      else if (ev === 'kill') ok = data.mob === a.mob && (!a.cause || data.cause === a.cause) && progress['kill:' + a.mob] >= (a.count || 1);
      else if (ev === 'biome') ok = (progress.biomes || []).length >= (a.count || 1);
      else if (ev === 'depth') ok = data.y < a.below;
      else ok = true;
      if (ok) out.push(a);
    }
    return out;
  }

  VX.data = { TIERS, ALL_TIERS, ARMOR_MATS, WOOL_OF, armorOf, ITEMS, I, info, maxStack, toolOf, canHarvest, breakTime, dropsOf, TAGS, RECIPES, matchRecipe, SMELT, SMELT_TIME, smeltOf, fuelOf, TABS, tabItems, MOBS, ACH, achieveOn, idOf };
})();
