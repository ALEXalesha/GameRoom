// Инвентарь как в оригинале: 36 ячеек (0..8 - панель быстрого доступа, 9..35 - рюкзак),
// стопки до 64 (инструменты по одному), предмет «на курсоре», щелчки левой/правой,
// Shift+щелчок - быстрый перенос, протягивание с зажатой кнопкой - раскладка поровну.
// Здесь только логика, без DOM: её проверяют законы и ею пользуется интерфейс.
(function () {
  'use strict';
  const VX = window.VX = window.VX || {};
  const D = VX.data;

  const stackOf = (id) => D.maxStack(id);
  // Особые данные стопки: чары и имя с наковальни. Такие стопки не сливаются с обычными.
  const extraOf = (s) => (s && (s.ench || s.name || s.rep) ? { ench: s.ench, name: s.name, rep: s.rep } : null);
  const same = (a, b) => a && b && a.id === b.id && stackOf(a.id) > 1 && !extraOf(a) && !extraOf(b);
  function newStack(id, count, dmg, x) {
    const st = { id, count, dmg: dmg || 0 };
    if (x && x.ench && x.ench.length) st.ench = x.ench.map((e) => e.slice());
    if (x && x.name) st.name = x.name;
    if (x && x.rep) st.rep = x.rep;        // сколько раз была на наковальне
    return st;
  }
  const clone = (s) => (s ? newStack(s.id, s.count, s.dmg, extraOf(s)) : null);

  // Контейнер - именованный массив ячеек. У инвентаря игрока их несколько.
  function Inventory() {
    this.slots = new Array(36).fill(null);
    this.armor = [null, null, null, null];     // шлем, нагрудник, поножи, ботинки
    this.selected = 0;
    this.cursor = null;          // что держим мышью в открытом окне
  }
  Inventory.prototype.held = function () { return this.slots[this.selected]; };
  Inventory.prototype.clear = function () { this.slots.fill(null); this.armor.fill(null); this.cursor = null; };
  Inventory.prototype.toJSON = function () { return { slots: this.slots.map(clone), armor: this.armor.map(clone), selected: this.selected }; };
  Inventory.prototype.load = function (o) {
    this.clear();
    if (!o) return;
    (o.slots || []).forEach((s, i) => { if (i < 36 && s && s.id && s.count > 0) this.slots[i] = clone(s); });
    (o.armor || []).forEach((s, i) => { if (i < 4 && s && s.id) this.armor[i] = clone(s); });
    this.selected = Math.max(0, Math.min(8, o.selected | 0));
  };
  Inventory.prototype.count = function (id) { let n = 0; for (const s of this.slots) if (s && s.id === id) n += s.count; return n; };

  // Положить в ряд ячеек (по порядку order): сначала доложить к таким же, потом в пустые.
  // Возвращает, сколько не влезло.
  function addTo(slots, order, id, count, dmg, x) {
    const max = stackOf(id);
    if (max > 1 && !x) {
      for (const i of order) {
        const s = slots[i];
        if (count <= 0) break;
        if (s && s.id === id && s.count < max) { const k = Math.min(max - s.count, count); s.count += k; count -= k; }
      }
    }
    for (const i of order) {
      if (count <= 0) break;
      if (!slots[i]) { const k = Math.min(max, count); slots[i] = newStack(id, k, dmg, x); count -= k; }
    }
    return count;
  }
  const HOTBAR = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  const MAIN = []; for (let i = 9; i < 36; i++) MAIN.push(i);
  const ALL = HOTBAR.concat(MAIN);

  // Подобранный предмет: сначала к таким же везде, затем в пустые - панель, потом рюкзак
  Inventory.prototype.add = function (id, count, dmg, x) {
    const max = stackOf(id);
    if (max > 1 && !x) {
      for (const i of ALL) {
        const s = this.slots[i];
        if (count <= 0) break;
        if (s && s.id === id && s.count < max) { const k = Math.min(max - s.count, count); s.count += k; count -= k; }
      }
    }
    return addTo(this.slots, ALL, id, count, dmg, x);
  };
  // Взять n штук из выбранной ячейки (поставить блок, съесть)
  Inventory.prototype.takeHeld = function (n) {
    const s = this.slots[this.selected];
    if (!s) return null;
    const out = newStack(s.id, Math.min(n, s.count), s.dmg, extraOf(s));
    s.count -= out.count;
    if (s.count <= 0) this.slots[this.selected] = null;
    return out;
  };
  // Потратить прочность инструмента в руке; сломался - ячейка пустеет
  Inventory.prototype.wearHeld = function () {
    const s = this.slots[this.selected];
    const t = s && D.toolOf(s.id);
    if (!t) return false;
    if (VX.enchant && !VX.enchant.wears(s, false)) return false;         // прочность: иногда без износа
    s.dmg = (s.dmg || 0) + 1;
    if (s.dmg >= t.dur) { this.slots[this.selected] = null; return true; }
    return false;
  };
  Inventory.prototype.remove = function (id, n) {
    for (let i = 35; i >= 0 && n > 0; i--) {
      const s = this.slots[i];
      if (s && s.id === id) { const k = Math.min(n, s.count); s.count -= k; n -= k; if (!s.count) this.slots[i] = null; }
    }
    return n === 0;
  };

  // ---------- Щелчок по ячейке открытого окна ----------
  // view - объект окна: get(i), set(i, s), canPut(i, s) (ячейка результата - нельзя класть),
  // isOutput(i), takeOutput(i) - забрать результат (крафт), shiftTarget(i) - куда уходит по Shift.
  // button: 0 левая, 2 правая.
  function click(inv, view, i, button, shift) {
    if (view.isOutput && view.isOutput(i)) return clickOutput(inv, view, i, shift);
    const s = view.get(i);
    if (shift) {
      if (!s) return;
      const left = view.shiftMove(i, s);
      if (left <= 0) view.set(i, null);
      else if (left !== s.count) view.set(i, newStack(s.id, left, s.dmg, extraOf(s)));
      return;
    }
    const c = inv.cursor;
    if (button === 0) {
      if (!c) { view.set(i, null); inv.cursor = s; return; }
      if (view.canPut && !view.canPut(i, c)) return;
      if (!s) { view.set(i, c); inv.cursor = null; return; }
      if (same(s, c)) {
        const k = Math.min(stackOf(s.id) - s.count, c.count);
        s.count += k; c.count -= k; view.set(i, s);
        if (!c.count) inv.cursor = null;
        return;
      }
      view.set(i, c); inv.cursor = s;          // обмен
      return;
    }
    // правая кнопка: взять половину / положить одну
    if (!c) {
      if (!s) return;
      const half = Math.ceil(s.count / 2);
      inv.cursor = newStack(s.id, half, s.dmg, extraOf(s));
      s.count -= half;
      view.set(i, s.count ? s : null);
      return;
    }
    if (view.canPut && !view.canPut(i, c)) return;
    if (!s) { view.set(i, newStack(c.id, 1, c.dmg, extraOf(c))); c.count--; if (!c.count) inv.cursor = null; return; }
    if (same(s, c) && s.count < stackOf(s.id)) { s.count++; c.count--; view.set(i, s); if (!c.count) inv.cursor = null; return; }
    if (!same(s, c)) { view.set(i, c); inv.cursor = s; }
  }
  function clickOutput(inv, view, i, shift) {
    const out = view.get(i);
    if (!out) return;
    if (shift) {
      // собрать всё, что можно, пока рецепт выполняется и есть место
      let guard = 0;
      while (guard++ < 64) {
        const o = view.get(i);
        if (!o) break;
        const probe = inv.slots.map(clone);
        if (addTo(probe, ALL, o.id, o.count, o.dmg, extraOf(o)) > 0) break;
        view.takeOutput(i);
        inv.add(o.id, o.count, o.dmg, extraOf(o));
      }
      return;
    }
    const c = inv.cursor;
    if (c && (!same(c, out) || c.count + out.count > stackOf(c.id))) return;
    view.takeOutput(i);
    if (c) c.count += out.count; else inv.cursor = clone(out);
  }
  // Протягивание: курсор раскладывается по ячейкам поровну (левая) или по одной (правая)
  function drag(inv, view, cells, button) {
    const c = inv.cursor;
    if (!c || !cells.length) return;
    const ok = cells.filter((i) => {
      if (view.isOutput && view.isOutput(i)) return false;
      if (view.canPut && !view.canPut(i, c)) return false;
      const s = view.get(i);
      return !s || (same(s, c) && s.count < stackOf(s.id));
    });
    if (!ok.length) return;
    const per = button === 0 ? Math.max(1, Math.floor(c.count / ok.length)) : 1;
    for (const i of ok) {
      if (!c.count) break;
      const s = view.get(i);
      const room = s ? stackOf(s.id) - s.count : stackOf(c.id);
      const k = Math.min(per, room, c.count);
      if (s) { s.count += k; view.set(i, s); } else view.set(i, newStack(c.id, k, c.dmg, extraOf(c)));
      c.count -= k;
    }
    if (!c.count) inv.cursor = null;
  }

  // Окно «инвентарь игрока» (+ сетка крафта 2x2 или 3x3 у верстака).
  // Номера ячеек окна: 0..35 - ячейки игрока, 100.. - сетка, 200 - результат.
  function PlayerView(inv, gridSize) {
    this.inv = inv;
    this.size = gridSize;
    this.grid = new Array(gridSize * gridSize).fill(null);
  }
  PlayerView.prototype.get = function (i) {
    if (i < 36) return this.inv.slots[i];
    if (i >= 40 && i < 44) return this.inv.armor[i - 40];
    if (i >= 100 && i < 200) return this.grid[i - 100];
    if (i === 200) { const r = this.recipe(); return r ? newStack(r.outId, r.count) : null; }
    return null;
  };
  PlayerView.prototype.set = function (i, s) {
    if (s && s.count <= 0) s = null;
    if (i < 36) this.inv.slots[i] = s;
    else if (i >= 40 && i < 44) { this.inv.armor[i - 40] = s; if (s && this.onEquip) this.onEquip(s); }
    else if (i >= 100 && i < 200) this.grid[i - 100] = s;
  };
  // в ячейку брони - только своя часть брони
  PlayerView.prototype.canPut = function (i, s) {
    if (i >= 40 && i < 44) { const a = D.armorOf(s.id); return !!a && a.slot === i - 40 && s.count === 1; }
    return i !== 200;
  };
  PlayerView.prototype.isOutput = (i) => i === 200;
  PlayerView.prototype.recipe = function () { return D.matchRecipe(this.grid.map((s) => (s ? s.id : 0)), this.size); };
  PlayerView.prototype.takeOutput = function () {
    const r = this.recipe();
    if (!r) return null;
    for (let k = 0; k < this.grid.length; k++) {
      const s = this.grid[k];
      if (s) { s.count--; if (!s.count) this.grid[k] = null; }
    }
    if (this.onCraft) this.onCraft(r);
    return r;
  };
  // Shift: панель <-> рюкзак, сетка -> инвентарь
  PlayerView.prototype.shiftMove = function (i, s) {
    const a = D.armorOf(s.id);
    if (a && i < 36 && !this.inv.armor[a.slot]) { this.set(40 + a.slot, clone(s)); return 0; }   // Shift по броне - надеть
    const order = i >= 40 ? MAIN.concat(HOTBAR) : i < 9 ? MAIN : HOTBAR;
    const probe = this.inv.slots;
    const left = addTo(probe, order, s.id, s.count, s.dmg, extraOf(s));
    return left;
  };
  // Закрыть окно: сетка и курсор возвращаются в инвентарь, что не влезло - выпадает
  PlayerView.prototype.close = function () {
    const spill = [];
    for (let k = 0; k < this.grid.length; k++) {
      const s = this.grid[k];
      if (s) { const left = this.inv.add(s.id, s.count, s.dmg, extraOf(s)); if (left) spill.push(newStack(s.id, left, s.dmg, extraOf(s))); this.grid[k] = null; }
    }
    const c = this.inv.cursor;
    if (c) { const left = this.inv.add(c.id, c.count, c.dmg, extraOf(c)); if (left) spill.push(newStack(c.id, left, c.dmg, extraOf(c))); this.inv.cursor = null; }
    return spill;
  };

  // Окно сундука: 500.. - ячейки сундука (27, у двойного - 54), 0..35 - игрок
  function ChestView(inv, chests) { this.inv = inv; this.chests = chests; this.size = chests.length * 27; }
  ChestView.prototype.get = function (i) {
    if (i < 36) return this.inv.slots[i];
    const k = i - 500;
    return k >= 0 && k < this.size ? this.chests[(k / 27) | 0][k % 27] : null;
  };
  ChestView.prototype.set = function (i, s) {
    if (s && s.count <= 0) s = null;
    if (i < 36) { this.inv.slots[i] = s; return; }
    const k = i - 500;
    if (k >= 0 && k < this.size) this.chests[(k / 27) | 0][k % 27] = s;
  };
  const R27 = []; for (let k = 0; k < 27; k++) R27.push(k);
  ChestView.prototype.shiftMove = function (i, s) {
    if (i >= 500) return addTo(this.inv.slots, HOTBAR.slice().reverse().concat(MAIN.slice().reverse()), s.id, s.count, s.dmg, extraOf(s));
    let left = s.count;
    for (const ch of this.chests) { if (left <= 0) break; left = addTo(ch, R27, s.id, left, s.dmg, extraOf(s)); }
    return left;
  };
  ChestView.prototype.close = function () {
    const spill = [];
    const c = this.inv.cursor;
    if (c) { const left = this.inv.add(c.id, c.count, c.dmg, extraOf(c)); if (left) spill.push(newStack(c.id, left, c.dmg, extraOf(c))); this.inv.cursor = null; }
    return spill;
  };

  // Окно печи: 300 - сырьё, 301 - топливо, 302 - результат; furnace - состояние печи из мира
  function FurnaceView(inv, furnace) { this.inv = inv; this.f = furnace; }
  FurnaceView.prototype.get = function (i) {
    if (i < 36) return this.inv.slots[i];
    return this.f.slots[i - 300] || null;
  };
  FurnaceView.prototype.set = function (i, s) {
    if (s && s.count <= 0) s = null;
    if (i < 36) this.inv.slots[i] = s; else this.f.slots[i - 300] = s;
  };
  FurnaceView.prototype.isOutput = (i) => i === 302;
  FurnaceView.prototype.canPut = function (i, s) {
    if (i === 301) return D.fuelOf(s.id) > 0;
    return i !== 302;
  };
  FurnaceView.prototype.takeOutput = function () {
    const o = this.f.slots[2]; this.f.slots[2] = null;
    if (this.f.xp && VX.xp && VX.game) { VX.xp.addFrac(VX.game.player, this.f.xp); this.f.xp = 0; }       // опыт за переплавку
    return o;
  };
  FurnaceView.prototype.shiftMove = function (i, s) {
    if (i >= 300) return addTo(this.inv.slots, MAIN.concat(HOTBAR), s.id, s.count, s.dmg, extraOf(s));
    // из инвентаря: что плавится - в сырьё, что горит - в топливо
    const target = D.smeltOf(s.id) ? 0 : D.fuelOf(s.id) ? 1 : -1;
    if (target < 0) return addTo(this.inv.slots, i < 9 ? MAIN : HOTBAR, s.id, s.count, s.dmg, extraOf(s));
    const cur = this.f.slots[target];
    if (!cur) { this.f.slots[target] = newStack(s.id, s.count, s.dmg, extraOf(s)); return 0; }
    if (cur.id !== s.id) return s.count;
    const k = Math.min(stackOf(s.id) - cur.count, s.count);
    cur.count += k;
    return s.count - k;
  };
  FurnaceView.prototype.close = function () {
    const spill = [];
    const c = this.inv.cursor;
    if (c) { const left = this.inv.add(c.id, c.count, c.dmg, extraOf(c)); if (left) spill.push(newStack(c.id, left, c.dmg, extraOf(c))); this.inv.cursor = null; }
    return spill;
  };

  // Печь в мире: сырьё, топливо, результат, сколько горит и сколько готово
  function newFurnace() { return { slots: [null, null, null], burn: 0, burnMax: 0, cook: 0 }; }
  // Один шаг печи; возвращает true, если печь горит (для вида блока)
  function tickFurnace(f, dt, onSmelt) {
    const src = f.slots[0];
    const rec = src && D.smeltOf(src.id);
    const out = f.slots[2];
    const canOut = rec && (!out || (out.id === rec.out && out.count < stackOf(out.id)));
    if (f.burn <= 0 && canOut) {
      const fuel = f.slots[1];
      const fv = fuel ? D.fuelOf(fuel.id) : 0;
      if (fv > 0) {
        f.burn = f.burnMax = fv;
        const back = (D.info(fuel.id) || {}).fuelLeft;       // ведро лавы сгорает, ведро остаётся
        fuel.count--; if (!fuel.count) f.slots[1] = back ? newStack(back, 1) : null;
      }
    }
    const burning = f.burn > 0;
    if (burning) f.burn = Math.max(0, f.burn - dt);
    if (burning && canOut) {
      f.cook += dt;
      if (f.cook >= D.SMELT_TIME) {
        f.cook -= D.SMELT_TIME;
        src.count--; if (!src.count) f.slots[0] = null;
        if (f.slots[2]) f.slots[2].count++; else f.slots[2] = newStack(rec.out, 1);
        f.xp = (f.xp || 0) + (rec.xp || 0);
        if (onSmelt) onSmelt(rec.out);
      }
    } else f.cook = Math.max(0, f.cook - dt * 2);
    return burning;
  }

  VX.inv = { extraOf, Inventory, click, drag, addTo, PlayerView, FurnaceView, ChestView, newFurnace, tickFurnace, newStack, clone, HOTBAR, MAIN, ALL };
})();
