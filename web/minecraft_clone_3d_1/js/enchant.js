// Чары и наковальня по правилам оригинала.
// Стол зачарований: книжные полки через клетку от стола (до 15) поднимают уровни трёх предложений:
// основа = 1..8 + полки/2 + 0..полки; верх = основа/3, середина = основа*2/3+1, низ = max(основа, 2*полки).
// Предложение i стоит i+1 лазурита и i+1 уровня (нужно не меньше показанного уровня).
// Чары: острота, небесная кара, бич членистоногих, защита, эффективность, прочность, сила (лук).
// Наковальня: предмет + книга (чары переходят), + такой же предмет (прочность складывается с добавкой 12%,
// чары объединяются), + материал (починка на четверть за штуку), новое имя; дороже 39 уровней - нельзя.
(function () {
  'use strict';
  const VX = window.VX, G = VX.game, C = VX.core, D = VX.data, B = C.B;
  const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
  const ENCH = {
    sharpness: { name: 'Острота', max: 5, on: ['sword', 'axe'], group: 'damage' },
    smite: { name: 'Небесная кара', max: 5, on: ['sword', 'axe'], group: 'damage' },
    bane: { name: 'Бич членистоногих', max: 5, on: ['sword', 'axe'], group: 'damage' },
    protection: { name: 'Защита', max: 4, on: ['armor'] },
    efficiency: { name: 'Эффективность', max: 5, on: ['pickaxe', 'axe', 'shovel', 'hoe', 'shears'] },
    unbreaking: { name: 'Прочность', max: 3, on: ['pickaxe', 'axe', 'shovel', 'hoe', 'shears', 'sword', 'armor', 'bow', 'shield', 'igniter'] },
    power: { name: 'Сила', max: 5, on: ['bow'] },
  };
  const UNDEAD = new Set(['zombie', 'skeleton', 'zombie_pigman']);
  const kindOf = (id) => { const i = D.info(id); if (!i) return null; if (i.armor) return 'armor'; if (i.key === 'book' || i.key === 'enchanted_book') return 'book'; return i.tool ? i.tool.type : null; };
  function enchantability(id) {
    const i = D.info(id);
    if (!i) return 0;
    if (i.key === 'book') return 1;
    if (i.armor) return { leather: 15, iron: 9, gold: 25, diamond: 10 }[i.armor.mat] || 9;
    const m = (i.key.split('_')[0]);
    return { wood: 15, stone: 5, iron: 14, gold: 22, diamond: 10 }[m] || 1;
  }
  const applicable = (key, id) => { const k = kindOf(id); return !!k && (k === 'book' || ENCH[key].on.includes(k)); };
  const level = (stack, key) => { if (!stack || !stack.ench) return 0; const e = stack.ench.find((q) => q[0] === key); return e ? e[1] : 0; };
  const enchName = (key, lv) => ENCH[key].name + ' ' + ROMAN[lv];
  // уровень чар по силе (как «минимальная сила» оригинала: 1 + 10 на каждый уровень)
  const lvlFor = (key, power) => { let lv = 0; for (let k = 1; k <= ENCH[key].max; k++) if (power >= 1 + (k - 1) * 10) lv = k; return lv; };

  // ---------- Стол ----------
  // полки через клетку от стола (между ними воздух), на уровне стола и на один выше
  function shelves(x, y, z) {
    const w = G.world;
    let n = 0;
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== 2) continue;
      const mx = x + Math.trunc(dx / 2), mz = z + Math.trunc(dz / 2);       // клетка между полкой и столом
      for (let dy = 0; dy <= 1; dy++) {
        if (w.getBlock(mx, y + dy, mz) !== 0) continue;
        if (w.getBlock(x + dx, y + dy, z + dz) === B.bookshelf) n++;
      }
    }
    return Math.min(15, n);
  }
  function rng(seed) { return C.mulberry32(seed | 0); }
  // Три предложения для предмета: уровни и первая чара (подсказка)
  function offers(stack, nShelves, seed) {
    if (!stack || !kindOf(stack.id) || (stack.ench && stack.ench.length) || stack.count !== 1 && kindOf(stack.id) !== 'book') return null;
    const r = rng(seed ^ (stack.id * 7919));
    const base = 1 + ((r() * 8) | 0) + (nShelves >> 1) + ((r() * (nShelves + 1)) | 0);
    const lv = [Math.max((base / 3) | 0, 1), ((base * 2 / 3) | 0) + 1, Math.max(base, nShelves * 2)];
    return lv.map((L, i) => ({ level: L, lapis: i + 1, ench: pick(stack.id, L, rng(seed * 31 + i * 1013 + stack.id)) }));
  }
  function pick(id, L, r) {
    const e = enchantability(id);
    let power = L + 1 + ((r() * (e / 4 + 1)) | 0) + ((r() * (e / 4 + 1)) | 0);
    power = Math.max(1, Math.round(power * (1 + (r() + r() - 1) * 0.15)));
    const pool = Object.keys(ENCH).filter((k) => applicable(k, id) && lvlFor(k, power) > 0);
    const out = [];
    while (pool.length) {
      const k = pool.splice((r() * pool.length) | 0, 1)[0];
      if (out.some(([q]) => ENCH[q].group && ENCH[q].group === ENCH[k].group)) continue;
      out.push([k, lvlFor(k, power)]);
      if (r() > (power + 1) / 50) break;
      power = power >> 1;
    }
    return out;
  }
  // Зачаровать: предложение i. Возвращает новую стопку или null
  function enchant(view, i) {
    const st = view.item, o = view.offers && view.offers[i], p = G.player;
    if (!st || !o || !o.ench.length) return null;
    const lap = view.lapis;
    const creative = G.mode === 'creative';
    if (!creative && ((p.level || 0) < o.level || !lap || lap.count < o.lapis)) return null;
    let out;
    if (kindOf(st.id) === 'book') out = VX.inv.newStack(D.I.enchanted_book, 1, 0, { ench: [o.ench[0]] });
    else { out = VX.inv.clone(st); out.ench = o.ench.map((e) => e.slice()); }
    if (!creative) { VX.xp.spend(p, o.lapis); lap.count -= o.lapis; if (!lap.count) view.lapis = null; }
    view.item = out;
    G.meta.enchSeed = ((G.meta.enchSeed || 1) * 1103515245 + 12345) & 0x7fffffff;      // новые предложения
    view.refresh();
    VX.audio.play('enchant');
    G.emit('enchant', { id: out.id });
    return out;
  }
  function EnchantView(inv, pos) { this.inv = inv; this.pos = pos; this.item = null; this.lapis = null; this.refresh(); }
  EnchantView.prototype.refresh = function () { this.shelves = shelves(this.pos.x, this.pos.y, this.pos.z); this.offers = offers(this.item, this.shelves, G.meta ? (G.meta.enchSeed || 1) : 1); };
  EnchantView.prototype.get = function (i) { if (i < 36) return this.inv.slots[i]; if (i === 700) return this.item; if (i === 701) return this.lapis; return null; };
  EnchantView.prototype.set = function (i, s) { if (s && s.count <= 0) s = null; if (i < 36) this.inv.slots[i] = s; else if (i === 700) { this.item = s; this.refresh(); } else if (i === 701) this.lapis = s; };
  EnchantView.prototype.canPut = function (i, s) { if (i === 701) return s.id === D.I.lapis; if (i === 700) return !!kindOf(s.id); return true; };
  EnchantView.prototype.shiftMove = function (i, s) {
    if (i >= 700) { const left = this.inv.add(s.id, s.count, s.dmg, VX.inv.extraOf(s)); return left; }
    if (s.id === D.I.lapis) { if (!this.lapis) { this.lapis = VX.inv.clone(s); return 0; } if (this.lapis.id === s.id) { const k = Math.min(64 - this.lapis.count, s.count); this.lapis.count += k; return s.count - k; } return s.count; }
    if (!this.item && kindOf(s.id)) { this.item = VX.inv.clone(s); this.refresh(); return 0; }
    return s.count;
  };
  EnchantView.prototype.close = function () {
    const spill = [];
    for (const s of [this.item, this.lapis, this.inv.cursor]) if (s) { const left = this.inv.add(s.id, s.count, s.dmg, VX.inv.extraOf(s)); if (left) spill.push(VX.inv.clone(Object.assign({}, s, { count: left }))); }
    this.item = this.lapis = this.inv.cursor = null;
    return spill;
  };

  // ---------- Наковальня ----------
  const REPAIR = { wood: '#planks', stone: 'cobblestone', iron: 'iron_ingot', gold: 'gold_ingot', diamond: 'diamond', leather: 'leather' };
  function durOf(id) { const t = D.toolOf(id); if (t) return t.dur; const a = D.armorOf(id); return a ? a.dur : 0; }
  function repairMat(id) {
    const i = D.info(id);
    const m = i.armor ? i.armor.mat : i.key.split('_')[0];
    const k = REPAIR[m];
    if (!k) return null;
    return k[0] === '#' ? D.TAGS[k.slice(1)] : [D.idOf(k)];
  }
  // Итог наковальни: { out, cost, used } или null
  function anvilResult(left, right, name) {
    if (!left) return null;
    const out = VX.inv.clone(left);
    out.count = 1;
    let cost = 0, used = 0;
    const dur = durOf(left.id);
    if (right) {
      const mats = repairMat(left.id);
      if (right.id === D.I.enchanted_book || (right.id === left.id && dur)) {
        if (right.id === left.id && dur) {
          const rem = (dur - (left.dmg || 0)) + (dur - (right.dmg || 0)) + Math.floor(dur * 0.12);
          const nd = Math.max(0, dur - rem);
          if (nd < (left.dmg || 0)) { out.dmg = nd; cost += 2; }
        }
        const ench = (out.ench || []).map((e) => e.slice());
        for (const [k, lv] of right.ench || []) {
          if (!applicable(k, left.id) && left.id !== D.I.enchanted_book) continue;
          if (ench.some(([q]) => q !== k && ENCH[q].group && ENCH[q].group === ENCH[k].group)) continue;
          const cur = ench.find((e) => e[0] === k);
          const nl = cur ? (cur[1] === lv ? Math.min(ENCH[k].max, lv + 1) : Math.max(cur[1], lv)) : lv;
          if (cur) cur[1] = nl; else ench.push([k, nl]);
          cost += nl * (right.id === D.I.enchanted_book ? 1 : 2);
        }
        if (ench.length) out.ench = ench;
        used = 1;
      } else if (mats && mats.includes(right.id) && dur && left.dmg) {
        let dmg = left.dmg;
        while (dmg > 0 && used < right.count) { dmg = Math.max(0, dmg - Math.floor(dur / 4)); used++; cost++; }
        out.dmg = dmg;
      } else return null;
      if (!cost) return null;
    }
    if (name !== undefined && name !== null && name.trim() && name.trim() !== (left.name || D.info(left.id).name)) { out.name = name.trim().slice(0, 35); cost += 1; }
    if (!cost) return null;
    // штраф за прошлые работы: каждый раз на наковальне удваивает (2^n - 1), как в оригинале
    cost += Math.pow(2, left.rep || 0) - 1 + (right && right.id !== D.I.enchanted_book && durOf(right.id) ? Math.pow(2, right.rep || 0) - 1 : right && right.id === D.I.enchanted_book ? Math.pow(2, right.rep || 0) - 1 : 0);
    out.rep = Math.max(left.rep || 0, right ? right.rep || 0 : 0) + 1;
    return { out, cost, used, tooExpensive: cost >= 40 };
  }
  function AnvilView(inv, pos) { this.inv = inv; this.pos = pos; this.left = null; this.right = null; this.name = ''; }
  AnvilView.prototype.result = function () { return anvilResult(this.left, this.right, this.name); };
  AnvilView.prototype.get = function (i) {
    if (i < 36) return this.inv.slots[i];
    if (i === 710) return this.left; if (i === 711) return this.right;
    if (i === 712) { const r = this.result(); return r && (!r.tooExpensive || G.mode === 'creative') && (G.mode === 'creative' || (G.player.level || 0) >= r.cost) ? r.out : null; }
    return null;
  };
  AnvilView.prototype.set = function (i, s) { if (s && s.count <= 0) s = null; if (i < 36) this.inv.slots[i] = s; else if (i === 710) { this.left = s; this.name = s ? (s.name || '') : ''; } else if (i === 711) this.right = s; };
  AnvilView.prototype.isOutput = (i) => i === 712;
  AnvilView.prototype.canPut = (i) => i !== 712;
  AnvilView.prototype.takeOutput = function () {
    const r = this.result();
    if (!r) return null;
    if (G.mode !== 'creative') VX.xp.spend(G.player, r.cost);
    this.left = null;
    if (this.right) { this.right.count -= r.used; if (this.right.count <= 0) this.right = null; }
    this.name = '';
    VX.audio.play('anvil');
    G.emit('anvil', { id: r.out.id });
    return r.out;
  };
  AnvilView.prototype.shiftMove = function (i, s) {
    if (i >= 700) return this.inv.add(s.id, s.count, s.dmg, VX.inv.extraOf(s));
    if (!this.left) { this.set(710, VX.inv.clone(s)); return 0; }
    if (!this.right) { this.right = VX.inv.clone(s); return 0; }
    return s.count;
  };
  AnvilView.prototype.close = function () {
    const spill = [];
    for (const s of [this.left, this.right, this.inv.cursor]) if (s) { const left = this.inv.add(s.id, s.count, s.dmg, VX.inv.extraOf(s)); if (left) spill.push(VX.inv.clone(Object.assign({}, s, { count: left }))); }
    this.left = this.right = this.inv.cursor = null;
    return spill;
  };

  // ---------- Действие чар ----------
  // добавка к удару мечом/топором
  function bonusDamage(stack, mob) {
    let d = 0;
    const s = level(stack, 'sharpness'); if (s) d += 0.5 * s + 0.5;
    const sm = level(stack, 'smite'); if (sm && mob && UNDEAD.has(mob.type)) d += 2.5 * sm;
    const bn = level(stack, 'bane'); if (bn && mob && mob.type === 'spider') d += 2.5 * bn;
    return d;
  }
  // защита: 4% за уровень всех надетых вещей, не больше 80%
  function protection(armor) { let epf = 0; for (const s of armor || []) epf += level(s, 'protection'); return Math.min(20, epf) * 0.04; }
  // прочность: износ с вероятностью 1/(ур+1), у брони 60% + 40%/(ур+1)
  function wears(stack, isArmor, r) {
    const u = level(stack, 'unbreaking');
    if (!u) return true;
    const p = isArmor ? 0.6 + 0.4 / (u + 1) : 1 / (u + 1);
    return (r || Math.random)() < p;
  }
  const efficiency = (stack) => { const e = level(stack, 'efficiency'); return e ? e * e + 1 : 0; };
  const power = (stack) => { const p = level(stack, 'power'); return p ? 1 + 0.25 * (p + 1) : 1; };
  function lines(stack) { return (stack && stack.ench || []).map(([k, lv]) => enchName(k, lv)); }

  VX.enchant = { ENCH, ROMAN, kindOf, applicable, level, enchName, shelves, offers, pick, enchant, EnchantView, AnvilView, anvilResult, bonusDamage, protection, wears, efficiency, power, lines, enchantability, UNDEAD };
})();
