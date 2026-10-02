// Жители деревень: появляются, когда герой подходит к деревне (по одному на дом, у дома - профессия),
// гуляют по деревне, ночью уходят домой. ПКМ - торговля за изумруды: у каждой профессии свои сделки,
// сделка работает 12 раз, утром запас восстанавливается. За сделку герою - опыт.
(function () {
  'use strict';
  const VX = window.VX, G = VX.game, C = VX.core, D = VX.data, B = C.B;
  const idOf = (k) => (typeof k === 'number' ? k : D.idOf(k));
  const PROF = {
    farmer: { name: 'Фермер', offers: [['buy', 'wheat', 20, 1], ['buy', 'pumpkin', 6, 1], ['sell', 'bread', 6, 1], ['sell', 'apple', 4, 1], ['sell', 'cooked_chicken', 8, 1]] },
    librarian: { name: 'Библиотекарь', offers: [['buy', 'paper', 24, 1], ['buy', 'book', 4, 1], ['sell', 'bookshelf', 1, 9], ['sell', 'glass', 4, 1], ['sell', 'compass', 1, 5], ['sell', 'clock', 1, 5]] },
    smith: { name: 'Кузнец', offers: [['buy', 'coal', 15, 1], ['buy', 'iron_ingot', 4, 1], ['sell', 'iron_sword', 1, 7], ['sell', 'iron_pickaxe', 1, 8], ['sell', 'iron_chestplate', 1, 12], ['sell', 'shield', 1, 5]] },
    cleric: { name: 'Священник', offers: [['buy', 'rotten_flesh', 32, 1], ['buy', 'gold_ingot', 3, 1], ['sell', C.WIRE, 2, 1], ['sell', 'lapis', 1, 1], ['sell', 'glowstone', 1, 4], ['sell', 'ender_pearl', 1, 5]] },
  };
  const KINDS = Object.keys(PROF);
  // сделки жителя: «покупает» - вещи за изумруд, «продаёт» - вещь за изумруды
  function makeTrades(prof) {
    const list = PROF[prof].offers.map(([how, item, n, em]) => (how === 'buy'
      ? { cost: [[idOf(item), n]], out: [D.I.emerald, em], uses: 0, max: 12 }
      : { cost: [[D.I.emerald, em]], out: [idOf(item), n], uses: 0, max: 12 }));
    // библиотекарь: зачарованная книга (чара и уровень - свои у каждого), цена 5 + 3 за уровень
    if (prof === 'librarian' && VX.enchant) {
      const keys = Object.keys(VX.enchant.ENCH), k = keys[(Math.random() * keys.length) | 0], lv = 1 + ((Math.random() * VX.enchant.ENCH[k].max) | 0);
      list.push({ cost: [[D.I.emerald, 5 + lv * 3], [D.I.book, 1]], out: [D.I.enchanted_book, 1], ench: [[k, lv]], uses: 0, max: 12 });
    }
    return list;
  }
  const canAfford = (tr) => tr.cost.every(([id, n]) => G.inv.count(id) >= n);
  function trade(m, i) {
    const tr = m.trades && m.trades[i];
    if (!tr || tr.uses >= tr.max || !canAfford(tr)) { VX.audio.play('villager_no'); return false; }
    for (const [id, n] of tr.cost) G.inv.remove(id, n);
    const extra = tr.ench ? { ench: tr.ench } : null;
    const left = G.inv.add(tr.out[0], tr.out[1], 0, extra);
    if (left) G.dropItem(VX.inv.newStack(tr.out[0], left, 0, extra), true);
    tr.uses++;
    if (VX.xp) VX.xp.add(G.player, 3 + Math.floor(Math.random() * 4));
    VX.audio.play('villager_yes');
    G.emit('trade', { id: tr.out[0], prof: m.color });
    return true;
  }

  // ---------- Появление жителей ----------
  let t = 0, lastDay = -1;
  function tick(dt) {
    if (!G.meta || G.panorama || G.dim !== 'over') return;
    // утро: запас сделок восстанавливается
    const day = Math.floor(G.ticks / 24000);
    if (day !== lastDay) { if (lastDay >= 0) for (const m of VX.entities.mobs) if (m.trades) for (const tr of m.trades) tr.uses = 0; lastDay = day; }
    t -= dt;
    if (t > 0) return;
    t = 2;
    const p = G.player, w = G.world;
    const v = C.villageNear(w.seed, p.pos.x, p.pos.z, w.gen);
    if (!v || Math.hypot(v.x - p.pos.x, v.z - p.pos.z) > 96) return;
    G.meta.villages = G.meta.villages || {};
    if (G.meta.villages[v.id]) return;
    if (!v.houses.every((h) => w.isLoaded(h.x, h.z))) return;
    let k = 0;
    for (const h of v.houses) {
      if (h.kind === 'farm') continue;
      const prof = PROF[h.kind] ? h.kind : KINDS[(k++ + v.x) % KINDS.length];
      const m = VX.entities.spawnMob('villager', h.x + 0.5, h.y, h.z + 0.5);
      m.color = prof; m.home = { x: h.x + 0.5, y: h.y, z: h.z + 0.5 }; m.village = v.id;
      m.trades = makeTrades(prof);
    }
    G.meta.villages[v.id] = Date.now();
    G.emit('village', { id: v.id });
  }
  function reset() { t = 0; lastDay = -1; }

  VX.villages = { PROF, makeTrades, trade, canAfford, tick, reset };
})();
