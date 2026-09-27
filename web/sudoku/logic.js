// logic.js - «мозг» Судоку: полный перебор (сколько решений), логический решатель человеческими
// приёмами (для уровней, подсказок с объяснением и автопилота) и генератор головоломок.
// Клетки - числа 0..80 (строка * 9 + столбец), кандидаты - битовые маски (бит d - цифра d).
'use strict';
(function () {
  const ROW = (i) => Math.floor(i / 9), COL = (i) => i % 9, BOX = (i) => Math.floor(ROW(i) / 3) * 3 + Math.floor(COL(i) / 3);
  const UNITS = [];                                   // 27 групп: 9 строк, 9 столбцов, 9 квадратов
  for (let r = 0; r < 9; r++) UNITS.push({ kind: 'row', n: r, cells: Array.from({ length: 9 }, (_, c) => r * 9 + c) });
  for (let c = 0; c < 9; c++) UNITS.push({ kind: 'col', n: c, cells: Array.from({ length: 9 }, (_, r) => r * 9 + c) });
  for (let b = 0; b < 9; b++) { const r0 = Math.floor(b / 3) * 3, c0 = (b % 3) * 3; const cells = []; for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) cells.push((r0 + r) * 9 + c0 + c); UNITS.push({ kind: 'box', n: b, cells }); }
  const PEERS = Array.from({ length: 81 }, (_, i) => { const s = new Set(); for (const u of UNITS) if (u.cells.includes(i)) for (const j of u.cells) if (j !== i) s.add(j); return [...s]; });
  const bits = (m) => { let n = 0; for (; m; m &= m - 1) n++; return n; };
  const digits = (m) => { const a = []; for (let d = 1; d <= 9; d++) if (m & (1 << d)) a.push(d); return a; };
  const ALL = 0x3FE;
  const name = (i) => `R${ROW(i) + 1}C${COL(i) + 1}`;
  const unitName = (u) => (u.kind === 'row' ? `строке ${u.n + 1}` : u.kind === 'col' ? `столбце ${u.n + 1}` : `квадрате ${u.n + 1}`);

  // ---------- Перебор: число решений (не больше limit) и первое решение ----------
  function countSolutions(vals, limit = 2, out = null) {
    const b = vals.slice(), rows = Array(9).fill(0), cols = Array(9).fill(0), boxes = Array(9).fill(0);
    for (let i = 0; i < 81; i++) {
      const v = b[i]; if (!v) continue;
      const bit = 1 << v;
      if ((rows[ROW(i)] | cols[COL(i)] | boxes[BOX(i)]) & bit) return 0;
      rows[ROW(i)] |= bit; cols[COL(i)] |= bit; boxes[BOX(i)] |= bit;
    }
    let count = 0;
    (function rec() {
      if (count >= limit) return;
      let best = -1, bm = 0, bn = 10;
      for (let i = 0; i < 81; i++) {
        if (b[i]) continue;
        const m = ~(rows[ROW(i)] | cols[COL(i)] | boxes[BOX(i)]) & ALL, n = bits(m);
        if (n < bn) { bn = n; best = i; bm = m; if (n === 0) return; }
      }
      if (best < 0) { if (count === 0 && out) for (let i = 0; i < 81; i++) out[i] = b[i]; count++; return; }
      const r = ROW(best), c = COL(best), x = BOX(best);
      for (let d = 1; d <= 9; d++) {
        const bit = 1 << d;
        if (!(bm & bit)) continue;
        b[best] = d; rows[r] |= bit; cols[c] |= bit; boxes[x] |= bit;
        rec();
        b[best] = 0; rows[r] &= ~bit; cols[c] &= ~bit; boxes[x] &= ~bit;
        if (count >= limit) return;
      }
    })();
    return count;
  }

  // ---------- Логика: приёмы человека ----------
  function candidates(vals) {
    const cand = Array(81).fill(0);
    for (let i = 0; i < 81; i++) {
      if (vals[i]) continue;
      let m = ALL;
      for (const j of PEERS[i]) if (vals[j]) m &= ~(1 << vals[j]);
      cand[i] = m;
    }
    return cand;
  }
  // Каждый приём возвращает шаг: { place: [клетка, цифра] } или { elim: [[клетка, цифра]...] }, плюс ярус, имя, объяснение, клетки
  const TECH = [];
  // Ярус 1: одиночки
  TECH.push({ tier: 1, name: 'Последний кандидат', find(vals, cand) {
    for (let i = 0; i < 81; i++) if (!vals[i] && bits(cand[i]) === 1) {
      const d = digits(cand[i])[0];
      return { place: [i, d], cells: [i], why: `В клетке ${name(i)} подходит только ${d}: остальные цифры уже есть в её строке, столбце или квадрате.` };
    }
    return null;
  } });
  // Скрытая одиночка в квадрате - приём «Лёгкого»; в строке или столбце - уже «Средний»
  const hiddenSingle = (tier, kinds) => ({ tier, name: 'Скрытая одиночка', find(vals, cand) {
    for (const order of kinds) for (const u of UNITS) {
      if (u.kind !== order) continue;
      for (let d = 1; d <= 9; d++) {
        if (u.cells.some((i) => vals[i] === d)) continue;
        const where = u.cells.filter((i) => !vals[i] && (cand[i] & (1 << d)));
        if (where.length === 1) return { place: [where[0], d], cells: u.cells, why: `В ${unitName(u)} цифра ${d} может стоять только в клетке ${name(where[0])} - в остальных клетках ${unitName(u)} ей мешают строки, столбцы или квадраты.` };
      }
    }
    return null;
  } });
  TECH.push(hiddenSingle(1, ['box']), hiddenSingle(2, ['row', 'col']));
  // Ярус 3: пересечения, пары
  TECH.push({ tier: 3, name: 'Пересечение', find(vals, cand) {
    for (const u of UNITS) for (let d = 1; d <= 9; d++) {
      const where = u.cells.filter((i) => !vals[i] && (cand[i] & (1 << d)));
      if (where.length < 2) continue;
      const kinds = u.kind === 'box' ? ['row', 'col'] : ['box'];
      for (const k of kinds) {
        const key = k === 'row' ? ROW : k === 'col' ? COL : BOX;
        if (!where.every((i) => key(i) === key(where[0]))) continue;
        const other = UNITS.find((v) => v.kind === k && v.n === key(where[0]));
        const elim = other.cells.filter((i) => !u.cells.includes(i) && !vals[i] && (cand[i] & (1 << d))).map((i) => [i, d]);
        if (elim.length) return { elim, cells: where, why: `В ${unitName(u)} цифра ${d} может быть только в ${unitName(other)}, значит, в остальных клетках ${unitName(other)} её быть не может.` };
      }
    }
    return null;
  } });
  function subsets(arr, k, start = 0, pre = [], out = []) { if (pre.length === k) { out.push(pre.slice()); return out; } for (let i = start; i < arr.length; i++) { pre.push(arr[i]); subsets(arr, k, i + 1, pre, out); pre.pop(); } return out; }
  function nakedSet(k, title) {
    return { tier: k === 2 ? 3 : 4, name: title, find(vals, cand) {
      for (const u of UNITS) {
        const open = u.cells.filter((i) => !vals[i] && bits(cand[i]) <= k && bits(cand[i]) >= 2);
        if (open.length < k) continue;
        for (const set of subsets(open, k)) {
          const m = set.reduce((a, i) => a | cand[i], 0);
          if (bits(m) !== k) continue;
          const elim = [];
          for (const i of u.cells) if (!vals[i] && !set.includes(i)) for (const d of digits(cand[i] & m)) elim.push([i, d]);
          if (elim.length) return { elim, cells: set, why: `Клетки ${set.map(name).join(', ')} в ${unitName(u)} вместе могут быть только ${digits(m).join(', ')} - эти цифры займут их, из остальных клеток ${unitName(u)} они убираются.` };
        }
      }
      return null;
    } };
  }
  function hiddenSet(k, title) {
    return { tier: k === 2 ? 3 : 4, name: title, find(vals, cand) {
      for (const u of UNITS) {
        const free = [];
        for (let d = 1; d <= 9; d++) { if (u.cells.some((i) => vals[i] === d)) continue; const w = u.cells.filter((i) => !vals[i] && (cand[i] & (1 << d))); if (w.length >= 1 && w.length <= k) free.push([d, w]); }
        if (free.length < k) continue;
        for (const set of subsets(free, k)) {
          const cells = [...new Set(set.flatMap((x) => x[1]))];
          if (cells.length !== k) continue;
          const keep = set.reduce((a, x) => a | (1 << x[0]), 0);
          const elim = [];
          for (const i of cells) for (const d of digits(cand[i] & ~keep)) elim.push([i, d]);
          if (elim.length) return { elim, cells, why: `Цифры ${set.map((x) => x[0]).join(', ')} в ${unitName(u)} помещаются только в клетки ${cells.map(name).join(', ')} - другим цифрам там места нет.` };
        }
      }
      return null;
    } };
  }
  TECH.push(nakedSet(2, 'Открытая пара'), hiddenSet(2, 'Скрытая пара'));
  // Ярус 4: тройки, «крест» и «рыба-меч»
  TECH.push(nakedSet(3, 'Открытая тройка'), hiddenSet(3, 'Скрытая тройка'));
  function fish(size, title) {
    return { tier: 4, name: title, find(vals, cand) {
      for (let d = 1; d <= 9; d++) for (const byRow of [true, false]) {
        const lines = [];
        for (let a = 0; a < 9; a++) {
          const pos = [];
          for (let b = 0; b < 9; b++) { const i = byRow ? a * 9 + b : b * 9 + a; if (!vals[i] && (cand[i] & (1 << d))) pos.push(b); }
          if (pos.length >= 2 && pos.length <= size) lines.push([a, pos]);
        }
        for (const set of subsets(lines, size)) {
          const cover = [...new Set(set.flatMap((x) => x[1]))];
          if (cover.length !== size) continue;
          const base = set.map((x) => x[0]), elim = [];
          for (const b of cover) for (let a = 0; a < 9; a++) {
            if (base.includes(a)) continue;
            const i = byRow ? a * 9 + b : b * 9 + a;
            if (!vals[i] && (cand[i] & (1 << d))) elim.push([i, d]);
          }
          if (elim.length) {
            const L = byRow ? 'строках' : 'столбцах', O = byRow ? 'столбцы' : 'строки';
            return { elim, cells: set.flatMap((x) => x[1].map((b) => (byRow ? x[0] * 9 + b : b * 9 + x[0]))), why: `В ${L} ${base.map((x) => x + 1).join(', ')} цифра ${d} стоит только в ${O} ${cover.map((x) => x + 1).join(', ')} - в других клетках этих ${byRow ? 'столбцов' : 'строк'} её нет.` };
          }
        }
      }
      return null;
    } };
  }
  TECH.push(fish(2, 'Крест (X-Wing)'), fish(3, 'Рыба-меч'));
  // «Крыло» (XY-Wing): опора {x,y} и две «клешни» {x,z}, {y,z}, которые она видит: z стоит в одной из клешней,
  // поэтому z убирается из клеток, которые видят обе клешни. «Крыло с тремя» (XYZ-Wing) - опора {x,y,z}.
  const sees = (a, b) => PEERS[a].includes(b);
  TECH.push({ tier: 4, name: 'Крыло (XY-Wing)', find(vals, cand) {
    for (let p = 0; p < 81; p++) {
      if (vals[p] || bits(cand[p]) !== 2) continue;
      const pin = PEERS[p].filter((i) => !vals[i] && bits(cand[i]) === 2 && bits(cand[i] & cand[p]) === 1);
      for (const a of pin) for (const b of pin) {
        if (a >= b) continue;
        const z = cand[a] & cand[b] & ~cand[p];
        if (bits(z) !== 1 || (cand[a] | cand[b] | cand[p]) !== (cand[p] | z) || (cand[a] & cand[p]) === (cand[b] & cand[p])) continue;
        const d = digits(z)[0], elim = [];
        for (let i = 0; i < 81; i++) if (i !== a && i !== b && i !== p && !vals[i] && (cand[i] & z) && sees(i, a) && sees(i, b)) elim.push([i, d]);
        if (elim.length) return { elim, cells: [p, a, b], why: `Опора ${name(p)} и клешни ${name(a)}, ${name(b)}: цифра ${d} обязательно стоит в одной из клешней, значит, её нет в клетках, которые видят обе.` };
      }
    }
    return null;
  } });
  TECH.push({ tier: 4, name: 'Крыло с тремя (XYZ-Wing)', find(vals, cand) {
    for (let p = 0; p < 81; p++) {
      if (vals[p] || bits(cand[p]) !== 3) continue;
      const pin = PEERS[p].filter((i) => !vals[i] && bits(cand[i]) === 2 && (cand[i] & ~cand[p]) === 0);
      for (const a of pin) for (const b of pin) {
        if (a >= b || cand[a] === cand[b]) continue;
        const z = cand[a] & cand[b];
        if (bits(z) !== 1) continue;
        const d = digits(z)[0], elim = [];
        for (let i = 0; i < 81; i++) if (i !== a && i !== b && i !== p && !vals[i] && (cand[i] & z) && sees(i, a) && sees(i, b) && sees(i, p)) elim.push([i, d]);
        if (elim.length) return { elim, cells: [p, a, b], why: `Опора ${name(p)} с клешнями ${name(a)}, ${name(b)}: цифра ${d} стоит в одной из трёх клеток, её нет там, где видны все три.` };
      }
    }
    return null;
  } });
  TECH.push(nakedSet(4, 'Открытая четвёрка'), hiddenSet(4, 'Скрытая четвёрка'));

  // Один шаг логики: сначала самый простой приём
  function nextStep(vals, cand) {
    for (const t of TECH) { const s = t.find(vals, cand); if (s) return Object.assign(s, { tier: t.tier, tech: t.name }); }
    return null;
  }
  // Решить логикой: максимальный ярус, шаги; stuck - дальше этими приёмами не продвинуться
  function solveLogic(values, maxSteps = 2000) {
    const vals = values.slice(), cand = candidates(vals);
    let maxTier = 0, steps = 0, filled = vals.filter(Boolean).length;
    while (filled < 81 && steps++ < maxSteps) {
      const s = nextStep(vals, cand);
      if (!s) return { solved: false, maxTier, vals };
      maxTier = Math.max(maxTier, s.tier);
      if (s.place) { const [i, d] = s.place; vals[i] = d; cand[i] = 0; for (const j of PEERS[i]) cand[j] &= ~(1 << d); filled++; }
      else for (const [i, d] of s.elim) cand[i] &= ~(1 << d);
    }
    return { solved: filled === 81, maxTier, vals };
  }
  // Подсказка: шаги до ближайшей постановки цифры (с исключениями перед ней)
  function hintFrom(values) {
    const vals = values.slice(), cand = candidates(vals), elims = [];
    for (let k = 0; k < 200; k++) {
      const s = nextStep(vals, cand);
      if (!s) return { stuck: true, elims };
      if (s.place) return { place: s.place, tech: s.tech, tier: s.tier, why: s.why, cells: s.cells, elims };
      elims.push({ tech: s.tech, why: s.why, cells: s.cells });
      for (const [i, d] of s.elim) cand[i] &= ~(1 << d);
    }
    return { stuck: true, elims };
  }

  // ---------- Генератор ----------
  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function shuffle(a, rnd) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function randomSolution(rnd) {
    const b = Array(81).fill(0);
    (function fill(i) {
      if (i === 81) return true;
      for (const d of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rnd)) {
        if (PEERS[i].some((j) => b[j] === d)) continue;
        b[i] = d; if (fill(i + 1)) return true; b[i] = 0;
      }
      return false;
    })(0);
    return b;
  }
  // Уровни - по приёмам, которых требует решение (и по числу открытых клеток)
  // Уровень = самый трудный приём, без которого не решить: 1 - последний кандидат и одиночка в квадрате,
  // 2 - скрытая одиночка в строке или столбце, 3 - пересечения и пары, 4 - тройки, «крест», «рыба-меч»
  const LEVELS = {
    easy: { name: 'Лёгкий', clues: [34, 42], tier: 1 },
    medium: { name: 'Средний', clues: [28, 36], tier: 2 },
    hard: { name: 'Сложный', clues: [22, 32], tier: 3 },
    expert: { name: 'Эксперт', clues: [20, 30], tier: 4 },
  };
  // Цепочка зёрен: если из зерна не вышло за положенное число попыток, берётся следующее по формуле -
  // у всех одна и та же, поэтому ежедневная головоломка у всех одинаковая. Генератор не возвращает null.
  const nextChainSeed = (s) => (Math.imul(s ^ 0x9E3779B9, 0x85EBCA6B) + 0x6B43A9B5) >>> 0;
  function generate(level, seed) {
    const it = generator(level, seed);
    for (;;) { const r = it.next(); if (r.done) return r.value; }
  }
  // То же по кусочкам: каждая попытка - шаг, чтобы страница не замирала на «Эксперте»
  function generateAsync(level, seed, done) {
    const it = generator(level, seed);
    (function slice() {
      const t = performance.now();
      while (performance.now() - t < 25) { const r = it.next(); if (r.done) { done(r.value); return; } }
      setTimeout(slice, 0);
    })();
  }
  function* generator(level, seed) {
    const L = LEVELS[level];
    let chain = (seed >>> 0) || 1;
    for (let link = 0; ; link++) {
      const rnd = mulberry32(chain);
      for (let attempt = 0; attempt < 40; attempt++) {
        yield attempt;
        const r = yield* oneAttempt(L, rnd);
        if (r) return Object.assign(r, { attempt: link * 40 + attempt, link });
      }
      chain = nextChainSeed(chain);
    }
  }
  // Одна попытка: решение, убираем клетки (решение остаётся единственным); логикой не решается - возвращаем
  // клетки, пока не решится; приём проще нужного - убираем ещё, пока уровень не дорастёт (подъём к уровню).
  function* oneAttempt(L, rnd) {
    const solution = randomSolution(rnd), puzzle = solution.slice();
    const target = L.clues[0] + Math.floor(rnd() * (L.clues[1] - L.clues[0] + 1));
    let clues = 81;
    for (const i of shuffle(Array.from({ length: 81 }, (_, k) => k), rnd)) {
      if (clues <= target) break;
      const keep = puzzle[i]; puzzle[i] = 0;
      if (countSolutions(puzzle, 2) !== 1) puzzle[i] = keep; else clues--;
    }
    let r = solveLogic(puzzle);
    if (!r.solved) {
      for (const i of shuffle(puzzle.map((v, k) => (v ? -1 : k)).filter((k) => k >= 0), rnd)) {
        puzzle[i] = solution[i]; clues++; r = solveLogic(puzzle);
        if (r.solved) break;
      }
    }
    if (!r.solved || r.maxTier > L.tier) return null;
    if (r.maxTier < L.tier) {
      for (const i of shuffle(puzzle.map((v, k) => (v ? k : -1)).filter((k) => k >= 0), rnd)) {
        if (clues <= L.clues[0]) break;
        yield 0;
        const keep = puzzle[i]; puzzle[i] = 0;
        if (countSolutions(puzzle, 2) !== 1) { puzzle[i] = keep; continue; }
        const t = solveLogic(puzzle);
        if (!t.solved || t.maxTier > L.tier) { puzzle[i] = keep; continue; }
        clues--; r = t;
        if (r.maxTier === L.tier) break;
      }
    }
    if (r.maxTier !== L.tier || clues > L.clues[1] || clues < L.clues[0]) return null;
    return { puzzle, solution, clues, tier: r.maxTier };
  }

  window.SudokuLogic = { UNITS, PEERS, ROW, COL, BOX, bits, digits, name, candidates, countSolutions, solveLogic, hintFrom, nextStep, generate, generateAsync, LEVELS, TECH: TECH.map((t) => ({ tier: t.tier, name: t.name })), mulberry32 };
})();
