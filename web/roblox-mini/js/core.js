// Блоксити: общее ядро - параметры адреса, случайные числа с зерном, хранилище с приставкой
// mix.blox. (все страницы на file:// делят одно хранилище), учётная запись игрока: кошелёк,
// вещи, аватар, статистика мест, значки, настройки.
'use strict';
window.Blox = window.Blox || {};
(function (B) {
  const qs = new URLSearchParams(location.search);
  function B_clampBots(n) { return Math.max(0, Math.min(6, Math.round(n))); }
  B.params = {
    seeded: qs.has('seed'),
    seed: qs.has('seed') ? (Number(qs.get('seed')) >>> 0) : ((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0),
    manual: qs.get('manual') === '1',     // шаги мира делают только проверки
    fast: qs.get('fast') === '1',         // короткий экран загрузки
    place: qs.get('place') || '',         // сразу войти в место
    bots: qs.get('bots') !== null && qs.get('bots') !== '' && isFinite(+qs.get('bots')) ? B_clampBots(+qs.get('bots')) : null,   // число ботов во всех местах (замеры)
  };
  B.STEP = 1 / 60;                          // шаг физики, секунды

  // ---------- Случайные числа: mulberry32 ----------
  B.rng = function (seed) {
    let a = seed >>> 0;
    const f = () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.int = (n) => Math.floor(f() * n);
    f.range = (lo, hi) => lo + (hi - lo) * f();
    f.pick = (arr) => arr[Math.floor(f() * arr.length)];
    return f;
  };
  B.hash = function (s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };

  B.clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  B.lerp = (a, b, t) => a + (b - a) * t;
  B.fmtTime = (s) => {
    if (s == null || !isFinite(s)) return '-';
    const m = Math.floor(s / 60), r = s - m * 60;
    return m > 0 ? m + ':' + (r < 10 ? '0' : '') + r.toFixed(2) : r.toFixed(2) + ' с';
  };
  B.fmtNum = (n) => (n >= 10000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1) + 'K' : String(n));
  B.esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- События ----------
  const handlers = {};
  B.on = (name, fn) => { (handlers[name] = handlers[name] || []).push(fn); };
  B.emit = (name, data) => { for (const fn of handlers[name] || []) { try { fn(data); } catch (e) { console.warn(e); } } };

  // ---------- Хранилище ----------
  const PREFIX = 'mix.blox.';
  const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
  B.store = {
    PREFIX,
    get(key, def) {
      try {
        const v = localStorage.getItem(PREFIX + key);
        if (v == null) return clone(def);
        const x = JSON.parse(v);
        // null и чужой тип (массив вместо объекта, строка вместо массива) - значение по умолчанию
        if (def !== undefined && def !== null && (x === null || typeof x !== typeof def || Array.isArray(x) !== Array.isArray(def))) return clone(def);
        return x;
      } catch (e) { return clone(def); }
    },
    set(key, val) { try { localStorage.setItem(PREFIX + key, JSON.stringify(val)); } catch (e) { /* хранилище недоступно */ } },
    remove(key) { try { localStorage.removeItem(PREFIX + key); } catch (e) { /* нет */ } },
    keys() {
      const out = [];
      try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(PREFIX)) out.push(k.slice(PREFIX.length)); } } catch (e) { /* нет */ }
      return out;
    },
  };

  // ---------- Учётная запись ----------
  const MEDAL_RANK = { gold: 3, silver: 2, bronze: 1 };
  B.REWARD = { gold: 30, silver: 20, bronze: 10, none: 5 };
  B.medalRank = (m) => MEDAL_RANK[m] || 0;

  function defaultNick() { return 'Гость_' + (1000 + (B.params.seed % 9000)); }

  const acct = B.acct = {
    profile() {
      const p = B.store.get('profile', null);
      if (p && typeof p === 'object' && typeof p.nick === 'string' && p.nick) {
        for (const k of ['display', 'about', 'created']) if (typeof p[k] !== 'string') p[k] = '';
        return p;
      }
      const fresh = { nick: defaultNick(), display: '', about: '', created: new Date().toISOString().slice(0, 10) };
      B.store.set('profile', fresh);
      return fresh;
    },
    setProfile(patch) {
      const p = Object.assign(acct.profile(), patch);
      B.store.set('profile', p);
      B.emit('profile', p);
      return p;
    },
    validNick(n) { return /^[A-Za-zА-Яа-яЁё0-9_]{3,20}$/.test(n); },
    displayName() { const p = acct.profile(); return p.display || p.nick; },

    balance() { return Math.max(0, Math.floor(Number(B.store.get('wallet', { balance: 0 }).balance) || 0)); },
    addCurrency(n, why) {
      n = Math.floor(n);
      if (!(n > 0)) return acct.balance();
      const b = acct.balance() + n;
      B.store.set('wallet', { balance: b });
      B.emit('wallet', { balance: b, delta: n, why });
      if (b >= 200) acct.award('rich');
      return b;
    },
    // Списать n: false, если не хватает (баланс в минус не уходит)
    spend(n) {
      n = Math.floor(n);
      const b = acct.balance();
      if (!(n >= 0) || n > b) return false;
      B.store.set('wallet', { balance: b - n });
      B.emit('wallet', { balance: b - n, delta: -n });
      return true;
    },

    owned() { return B.store.get('owned', []).filter((x) => typeof x === 'string'); },
    owns(id) {
      const it = B.data.item(id);
      return !!it && (it.price === 0 || acct.owned().includes(id));
    },
    buy(id) {
      const it = B.data.item(id);
      if (!it) return { ok: false, reason: 'нет такой вещи' };
      if (acct.owns(id)) return { ok: true, already: true };
      if (!acct.spend(it.price)) return { ok: false, reason: 'не хватает кубов' };
      const o = acct.owned(); o.push(id); B.store.set('owned', o);
      acct.award('shopper');
      B.emit('owned', id);
      return { ok: true };
    },

    avatar() {
      const a = B.store.get('avatar', null), d = B.data.defaultAvatar();
      if (!a || typeof a !== 'object' || Array.isArray(a)) return d;
      // проверка формы: цвета - строки #rrggbb, вещи - только те, что есть в каталоге этого слота
      const out = Object.assign({}, d);
      const cols = a.colors && typeof a.colors === 'object' ? a.colors : {};
      for (const k in d.colors) out.colors[k] = typeof cols[k] === 'string' && /^#[0-9a-f]{6}$/i.test(cols[k]) ? cols[k] : d.colors[k];
      for (const slot of ['face', 'shirt', 'pants', 'hat', 'hair', 'faceAcc', 'back']) {
        const v = a[slot];
        if (v === '' && !['face', 'shirt', 'pants'].includes(slot)) out[slot] = '';
        else if (typeof v === 'string' && B.data.item(v) && B.data.item(v).slot === slot) out[slot] = v;
      }
      return out;
    },
    saveAvatar(a) {
      // надеть можно только то, что есть
      const clean = Object.assign(B.data.defaultAvatar(), JSON.parse(JSON.stringify(a)));
      for (const slot of ['face', 'shirt', 'pants', 'hat', 'hair', 'faceAcc', 'back']) {
        if (clean[slot] && !acct.owns(clean[slot])) clean[slot] = B.data.defaultAvatar()[slot];
      }
      B.store.set('avatar', clean);
      B.emit('avatar', clean);
      return clean;
    },

    stats() { return B.store.get('stats', {}); },
    placeStats(id) { return Object.assign({ visits: 0, best: null, medal: null, finishes: 0, deaths: 0 }, acct.stats()[id] || {}); },
    updatePlace(id, fn) {
      const all = acct.stats();
      const cur = Object.assign({ visits: 0, best: null, medal: null, finishes: 0, deaths: 0 }, all[id] || {});
      fn(cur);
      all[id] = cur;
      B.store.set('stats', all);
      B.emit('stats', { id, stats: cur });
      return cur;
    },
    // Итог забега: better(a,b) - новое лучше старого? Возвращает { record, reward, medal }
    finish(id, value, medal, lowerIsBetter) {
      let record = false;
      acct.updatePlace(id, (s) => {
        s.finishes++;
        if (value != null && (s.best == null || (lowerIsBetter ? value < s.best : value > s.best))) { s.best = value; record = true; }
        if (medal && B.medalRank(medal) > B.medalRank(s.medal)) s.medal = medal;
      });
      const reward = B.REWARD[medal || 'none'];
      acct.addCurrency(reward, id);
      return { record, reward, medal };
    },

    badges() { return B.store.get('badges', {}); },
    award(id) {
      const b = acct.badges();
      if (b[id]) return false;
      b[id] = new Date().toISOString().slice(0, 10);
      B.store.set('badges', b);
      B.emit('badge', id);
      // все значки прохождения мест собраны - «Легенда Блоксити»
      if (id !== 'legend' && acct.completedCount() === B.data.PLACES.length && !b.legend) {
        acct.award('legend');
        B.store.set('celebrate', true);
        B.emit('legend');
      }
      return true;
    },
    completed(placeId) { const bd = B.data.BADGES.find((x) => x.complete === placeId); return !!(bd && acct.badges()[bd.id]); },
    completedCount() { return B.data.PLACES.filter((p) => acct.completed(p.id)).length; },
    completeBadge(placeId) { const bd = B.data.BADGES.find((x) => x.complete === placeId); return bd ? acct.award(bd.id) : false; },

    votes() { return B.store.get('votes', {}); },
    vote(id, v) { const all = acct.votes(); all[id] = all[id] === v ? 0 : v; B.store.set('votes', all); return all[id]; },

    // Сбросить прогресс: всё, кроме настроек
    resetProgress() {
      for (const k of B.store.keys()) if (k !== 'settings' && k !== 'gamesettings' && !k.startsWith('place.')) B.store.remove(k);
      B.emit('reset');
    },
  };
})(window.Blox);
