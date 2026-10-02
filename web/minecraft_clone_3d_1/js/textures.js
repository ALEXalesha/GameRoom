// Текстуры «Кубического мира»: каждая плитка 16x16 нарисована кодом на canvas (ни одной
// картинки из оригинала). Атлас блоков с ручными уровнями детализации (каждая плитка
// уменьшается сама по себе, без заплывания соседей), атлас предметов, стадии трещин,
// значки блоков для интерфейса (изометрический кубик) и фактуры кнопок.
(function () {
  'use strict';
  const VX = window.VX = window.VX || {};
  const C = VX.core;

  function rng(seed) { return C.mulberry32(seed); }
  function hex(c) { const n = parseInt(c.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function shadeHex(c, k) { const [r, g, b] = hex(c); const f = (v) => Math.max(0, Math.min(255, Math.round(v * k))).toString(16).padStart(2, '0'); return '#' + f(r) + f(g) + f(b); }

  // Плитка рисуется в ImageData 16x16: px(x, y, цвет, прозрачность)
  function Tile() { this.d = new Uint8ClampedArray(16 * 16 * 4); }
  Tile.prototype.px = function (x, y, c, a = 255) {
    if (x < 0 || y < 0 || x > 15 || y > 15) return;
    const [r, g, b] = typeof c === 'string' ? hex(c) : c;
    const i = (y * 16 + x) * 4; this.d[i] = r; this.d[i + 1] = g; this.d[i + 2] = b; this.d[i + 3] = a;
  };
  Tile.prototype.get = function (x, y) { const i = (y * 16 + x) * 4; return [this.d[i], this.d[i + 1], this.d[i + 2], this.d[i + 3]]; };
  Tile.prototype.noise = function (pal, r, w) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) this.px(x, y, pal[pick(pal.length, r, w)]);
    return this;
  };
  Tile.prototype.mul = function (x, y, k) {
    const i = (y * 16 + x) * 4;
    this.d[i] = Math.min(255, this.d[i] * k); this.d[i + 1] = Math.min(255, this.d[i + 1] * k); this.d[i + 2] = Math.min(255, this.d[i + 2] * k);
  };
  function pick(n, r, w) {
    if (!w) return (r() * n) | 0;
    let s = 0; for (const v of w) s += v;
    let t = r() * s;
    for (let i = 0; i < n; i++) { t -= w[i]; if (t <= 0) return i; }
    return n - 1;
  }

  // ---------- Рисунки плиток ----------
  const P = {
    grass: ['#5f9e37', '#6bab3f', '#528d2e', '#78b948', '#5b9633', '#4a8229'],
    dirt: ['#86603f', '#7a5536', '#966c48', '#6c4a2f', '#8f6a45', '#5f4128'],
    stone: ['#808080', '#757575', '#8a8a8a', '#6e6e6e', '#7b7b7b'],
    sand: ['#dcd3a0', '#e4dba9', '#d4ca95', '#cdc28c', '#e9e1b3'],
    snow: ['#f4f8fb', '#ffffff', '#e7eef3', '#eef3f7'],
  };
  function blob(t, r, n, pal, size) {
    for (let k = 0; k < n; k++) {
      let x = (r() * 16) | 0, y = (r() * 16) | 0;
      const c = pal[(r() * pal.length) | 0];
      const m = size[0] + ((r() * (size[1] - size[0] + 1)) | 0);
      for (let i = 0; i < m; i++) {
        t.px(x & 15, y & 15, c);
        const d = (r() * 4) | 0;
        if (d === 0) x++; else if (d === 1) x--; else if (d === 2) y++; else y--;
      }
    }
  }
  function cells(t, r, n, pal, line) {
    // ячейки Вороного с переносом через край: булыжник, гравий
    const pts = [];
    for (let i = 0; i < n; i++) pts.push([r() * 16, r() * 16, pal[(r() * pal.length) | 0]]);
    const near = (x, y) => {
      let b = 1e9, b2 = 1e9, bi = 0;
      for (let i = 0; i < pts.length; i++) {
        for (let ox = -16; ox <= 16; ox += 16) for (let oy = -16; oy <= 16; oy += 16) {
          const dx = x - pts[i][0] - ox, dy = y - pts[i][1] - oy, d = Math.sqrt(dx * dx + dy * dy);
          if (d < b) { b2 = b; b = d; bi = i; } else if (d < b2) b2 = d;
        }
      }
      return [bi, b2 - b];
    };
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const [i, edge] = near(x + 0.5, y + 0.5);
      let c = pts[i][2];
      if (edge < 1.1) c = line;
      t.px(x, y, c);
      if (edge >= 1.1 && r() < 0.18) t.mul(x, y, r() < 0.5 ? 0.9 : 1.1);
    }
  }
  function planks(t, r, base) {
    const pal = [base, shadeHex(base, 0.92), shadeHex(base, 1.06), shadeHex(base, 0.97)];
    t.noise(pal, r, [5, 2, 2, 3]);
    for (let row = 0; row < 4; row++) {
      const y0 = row * 4;
      for (let x = 0; x < 16; x++) t.px(x, y0 + 3, shadeHex(base, 0.62));
      const cut = (row * 7 + 3) % 16;
      for (let y = y0; y < y0 + 3; y++) t.px(cut, y, shadeHex(base, 0.7));
      for (let x = 0; x < 16; x++) if (r() < 0.2) t.px(x, y0 + 1, shadeHex(base, 0.86));
    }
  }
  function logSide(t, r, pal, dash) {
    for (let x = 0; x < 16; x++) {
      const c = pal[(r() * pal.length) | 0];
      for (let y = 0; y < 16; y++) t.px(x, y, r() < 0.8 ? c : pal[(r() * pal.length) | 0]);
    }
    if (dash) for (let k = 0; k < 9; k++) { const x = (r() * 14) | 0, y = (r() * 16) | 0, w = 1 + ((r() * 3) | 0); for (let i = 0; i < w; i++) t.px(x + i, y, dash); }
  }
  function logTop(t, r, bark, rings) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const edge = x === 0 || y === 0 || x === 15 || y === 15;
      if (edge) { t.px(x, y, bark); continue; }
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      t.px(x, y, rings[Math.floor(d) % 2 === 0 ? 0 : 1]);
      if (r() < 0.08) t.mul(x, y, 0.92);
    }
  }
  function leaves(t, r, pal, fast, dark) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      if (r() < 0.27) { if (fast) t.px(x, y, dark); else t.px(x, y, '#000000', 0); }
      else t.px(x, y, pal[(r() * pal.length) | 0]);
    }
  }
  function ore(t, r, spots, dark) {
    t.noise(P.stone, r, [4, 3, 2, 2, 3]);
    blob(t, r, 5, ['#6a6a6a', '#8e8e8e'], [2, 5]);
    const centers = [[3, 3], [11, 4], [6, 10], [12, 12], [2, 12]];
    for (const [cx, cy] of centers) {
      const n = 3 + ((r() * 3) | 0);
      for (let i = 0; i < n; i++) {
        const x = cx + ((r() * 3) | 0) - 1, y = cy + ((r() * 3) | 0) - 1;
        t.px(x, y, spots[(r() * spots.length) | 0]);
        if (dark && r() < 0.5) t.px(x + 1, y + 1, dark);
      }
    }
  }
  function wool(t, r, base) {
    const pal = [base, shadeHex(base, 0.93), shadeHex(base, 1.05), shadeHex(base, 0.97)];
    t.noise(pal, r, [6, 2, 2, 3]);
    for (let y = 0; y < 16; y += 2) for (let x = (y / 2) % 2; x < 16; x += 3) t.mul(x, y, 0.94);
  }
  function plant(t, draw) { for (let i = 0; i < 256; i++) t.d[i * 4 + 3] = 0; draw(); }

  const DRAW = {
    grass_top(t, r) { t.noise(P.grass, r, [4, 3, 3, 2, 3, 1]); },
    dirt(t, r) { t.noise(P.dirt, r, [4, 4, 3, 2, 3, 1]); blob(t, r, 3, ['#5f4128', '#9b7550'], [1, 3]); },
    grass_side(t, r) {
      DRAW.dirt(t, r);
      for (let x = 0; x < 16; x++) {
        const h = 3 + ((r() * 3) | 0) - (r() < 0.3 ? 1 : 0);
        for (let y = 0; y < h; y++) t.px(x, y, P.grass[(r() * P.grass.length) | 0]);
        if (r() < 0.35) t.px(x, h, P.grass[2]);
      }
    },
    stone(t, r) { t.noise(P.stone, r, [4, 3, 2, 2, 3]); blob(t, r, 6, ['#696969', '#8f8f8f', '#727272'], [2, 6]); },
    cobblestone(t, r) { cells(t, r, 9, ['#8c8c8c', '#7a7a7a', '#999999', '#6f6f6f', '#848484'], '#4f4f4f'); },
    mossy_cobblestone(t, r) { DRAW.cobblestone(t, r); blob(t, r, 7, ['#5b7a36', '#4d6b2d', '#6a8c3f'], [2, 5]); },
    bedrock(t, r) { t.noise(['#565656', '#3a3a3a', '#1e1e1e', '#6e6e6e', '#2c2c2c'], r); blob(t, r, 6, ['#111111', '#7a7a7a'], [2, 4]); },
    sand(t, r) { t.noise(P.sand, r, [4, 3, 3, 2, 1]); },
    gravel(t, r) { cells(t, r, 14, ['#8a8580', '#6f6a66', '#9d9892', '#7e746c', '#5c5854', '#a39d96'], '#5a5550'); },
    sandstone_top(t, r) { t.noise(['#d9cf9c', '#dfd6a5', '#d3c893'], r); },
    sandstone_bottom(t, r) { t.noise(['#d6cb96', '#ccc08a', '#dcd19f'], r); for (let x = 0; x < 16; x++) t.px(x, 0, '#c2b67f'); },
    sandstone_side(t, r) {
      t.noise(['#d9cf9c', '#d1c690', '#dfd6a6'], r);
      for (let x = 0; x < 16; x++) { t.px(x, 3, '#c3b680'); t.px(x, 4, '#e3dab0'); t.px(x, 11, '#c3b680'); if (r() < 0.4) t.px(x, 12, '#cbbf88'); }
    },
    oak_log(t, r) { logSide(t, r, ['#6b5130', '#5c4428', '#76593a', '#4f3a22']); },
    oak_log_top(t, r) { logTop(t, r, '#5c4428', ['#b48d57', '#9d7746']); },
    birch_log(t, r) { logSide(t, r, ['#e3e0d6', '#d8d4c8', '#eeebe3'], '#2b2b28'); },
    birch_log_top(t, r) { logTop(t, r, '#dcd8cc', ['#c9b27a', '#b39c68']); },
    spruce_log(t, r) { logSide(t, r, ['#3f2c19', '#4a3520', '#35251a', '#523b24']); },
    spruce_log_top(t, r) { logTop(t, r, '#3f2c19', ['#80623b', '#6c5231']); },
    oak_leaves(t, r) { leaves(t, r, ['#3f8a26', '#4d9a30', '#347a1f', '#5aa83a']); },
    birch_leaves(t, r) { leaves(t, r, ['#6d9e45', '#7eae52', '#5e8f3a', '#86b85a']); },
    spruce_leaves(t, r) { leaves(t, r, ['#2f5a33', '#3a6a3d', '#264d2a', '#41744a']); },
    oak_leaves_fast(t, r) { leaves(t, r, ['#3f8a26', '#4d9a30', '#347a1f', '#5aa83a'], true, '#1f4a14'); },
    birch_leaves_fast(t, r) { leaves(t, r, ['#6d9e45', '#7eae52', '#5e8f3a', '#86b85a'], true, '#3a5a24'); },
    spruce_leaves_fast(t, r) { leaves(t, r, ['#2f5a33', '#3a6a3d', '#264d2a', '#41744a'], true, '#16301a'); },
    oak_planks(t, r) { planks(t, r, '#a8834f'); },
    birch_planks(t, r) { planks(t, r, '#cdb77d'); },
    spruce_planks(t, r) { planks(t, r, '#6e5233'); },
    glass(t, r) {
      for (let i = 0; i < 256; i++) t.d[i * 4 + 3] = 0;
      for (let k = 0; k < 16; k++) { t.px(k, 0, '#dbeef3', 230); t.px(k, 15, '#a9c9d1', 230); t.px(0, k, '#dbeef3', 230); t.px(15, k, '#a9c9d1', 230); }
      for (let k = 0; k < 4; k++) { t.px(3 + k, 5 - k, '#ffffff', 200); t.px(9 + k, 12 - k, '#ffffff', 180); t.px(10 + k, 12 - k, '#ffffff', 120); }
    },
    bricks(t, r) {
      t.noise(['#9b4b3a', '#a65644', '#8e4334', '#b0604c'], r);
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const row = y >> 2, off = row % 2 ? 4 : 0;
        if (y % 4 === 3 || (x + off) % 8 === 7) t.px(x, y, r() < 0.8 ? '#b9ad9c' : '#a39886');
      }
    },
    stone_bricks(t, r) {
      t.noise(['#7d7d7d', '#858585', '#747474', '#8c8c8c'], r);
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const row = y >> 3, off = row % 2 ? 4 : 0;
        if (y % 8 === 7 || (x + off) % 8 === 7) t.px(x, y, '#4e4e4e');
        else if (y % 8 === 0 || (x + off) % 8 === 0) t.px(x, y, '#959595');
      }
    },
    coal_ore(t, r) { ore(t, r, ['#1c1c1c', '#2e2e2e', '#101010'], null); },
    iron_ore(t, r) { ore(t, r, ['#d8af93', '#c49a7e', '#e6c4ac'], '#8a6a55'); },
    gold_ore(t, r) { ore(t, r, ['#fcee4b', '#e8c62a', '#fff79a'], '#a08010'); },
    diamond_ore(t, r) { ore(t, r, ['#5decf5', '#2fc9d4', '#b5fbff'], '#1a8f98'); },
    water(t, r) {
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const w = Math.sin((x + y * 0.5) * 0.8) + Math.sin((x * 0.4 - y) * 0.9);
        const c = w > 1.2 ? '#4f8fe0' : w > 0 ? '#3a74d0' : '#3068c4';
        t.px(x, y, c, 185);
      }
    },
    snow(t, r) { t.noise(P.snow, r, [4, 2, 2, 3]); },
    snow_grass_side(t, r) {
      DRAW.dirt(t, r);
      for (let x = 0; x < 16; x++) { const h = 3 + ((r() * 2) | 0); for (let y = 0; y < h; y++) t.px(x, y, P.snow[(r() * 4) | 0]); }
    },
    ice(t, r) {
      t.noise(['#9ec3f5', '#a9ccf8', '#93b9ee'], r);
      for (let i = 0; i < 256; i++) t.d[i * 4 + 3] = 200;
      for (let k = 0; k < 6; k++) { t.px(2 + k, 2 + k * 2, '#e8f3ff', 230); t.px(9 + k, 12 - k, '#e8f3ff', 230); }
    },
    cactus_side(t, r) {
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const edge = x === 0 || x === 15;
        const rib = x % 4 === 1;
        t.px(x, y, edge ? '#0f3d12' : rib ? '#1d6e22' : (r() < 0.5 ? '#2a8a2e' : '#248027'));
      }
      for (let k = 0; k < 10; k++) t.px(((r() * 14) | 0) + 1, (r() * 16) | 0, '#d8e8b0');
    },
    cactus_top(t, r) {
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const e = x === 0 || y === 0 || x === 15 || y === 15;
        const ring = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)) > 5;
        t.px(x, y, e ? '#0f3d12' : ring ? '#2a8a2e' : '#4aa84a');
      }
    },
    cactus_bottom(t, r) { DRAW.cactus_top(t, r); for (let y = 3; y < 13; y++) for (let x = 3; x < 13; x++) t.px(x, y, '#8fb55e'); },
    table_top(t, r) {
      planks(t, r, '#a8834f');
      for (let k = 0; k < 16; k++) { t.px(k, 0, '#5a3f22'); t.px(k, 15, '#5a3f22'); t.px(0, k, '#5a3f22'); t.px(15, k, '#5a3f22'); }
      for (let k = 2; k < 14; k++) { t.px(k, 5, '#6d4d2b'); t.px(k, 10, '#6d4d2b'); t.px(5, k, '#6d4d2b'); t.px(10, k, '#6d4d2b'); }
    },
    table_side(t, r) {
      planks(t, r, '#8a6a3e');
      for (let x = 0; x < 16; x++) { t.px(x, 0, '#b48d57'); t.px(x, 1, '#a07b47'); t.px(x, 2, '#5a3f22'); }
      // пила и молоток
      for (let x = 3; x < 8; x++) { t.px(x, 6, '#bdbdbd'); t.px(x, 7, '#9a9a9a'); }
      t.px(8, 6, '#5a3f22'); t.px(9, 6, '#5a3f22'); t.px(9, 7, '#5a3f22');
      for (let y = 5; y < 12; y++) t.px(12, y, '#5a3f22');
      t.px(11, 5, '#707070'); t.px(13, 5, '#707070'); t.px(11, 4, '#707070'); t.px(12, 4, '#8a8a8a'); t.px(13, 4, '#707070');
    },
    table_front(t, r) {
      DRAW.table_side(t, r);
      for (let y = 5; y < 12; y++) for (let x = 2; x < 14; x++) t.px(x, y, shadeHex('#8a6a3e', 0.95 + r() * 0.1));
      for (let y = 6; y < 12; y++) t.px(4, y, '#5a3f22');
      t.px(3, 6, '#cfcfcf'); t.px(5, 6, '#cfcfcf'); t.px(3, 5, '#cfcfcf'); t.px(5, 5, '#cfcfcf');
      for (let y = 5; y < 12; y++) t.px(10, y, '#5a3f22');
      for (let x = 8; x < 13; x++) t.px(x, 5, '#7c7c7c');
    },
    furnace_side(t, r) {
      t.noise(['#7a7a7a', '#707070', '#848484'], r);
      for (let k = 0; k < 16; k++) { t.px(k, 0, '#5c5c5c'); t.px(k, 15, '#555555'); t.px(0, k, '#606060'); t.px(15, k, '#555555'); }
      for (let x = 1; x < 15; x++) t.px(x, 3, '#626262');
    },
    furnace_top(t, r) {
      t.noise(['#7a7a7a', '#727272', '#828282'], r);
      for (let k = 0; k < 16; k++) { t.px(k, 0, '#555555'); t.px(k, 15, '#555555'); t.px(0, k, '#555555'); t.px(15, k, '#555555'); }
      for (let k = 3; k < 13; k++) { t.px(k, 3, '#606060'); t.px(k, 12, '#8e8e8e'); t.px(3, k, '#606060'); t.px(12, k, '#8e8e8e'); }
    },
    furnace_front(t, r, lit) {
      DRAW.furnace_side(t, r);
      for (let y = 8; y < 14; y++) for (let x = 3; x < 13; x++) t.px(x, y, '#1c1c1c');
      for (let x = 3; x < 13; x++) { t.px(x, 7, '#4a4a4a'); t.px(x, 14, '#8a8a8a'); }
      for (let x = 4; x < 12; x += 2) t.px(x, 4, '#4a4a4a');
      if (lit) {
        for (let x = 4; x < 12; x++) {
          const h = 2 + ((r() * 4) | 0);
          for (let y = 13; y > 13 - h; y--) t.px(x, y, y > 12 - h / 2 ? '#ffb020' : '#ffe070');
          t.px(x, 13, '#ff6a00');
        }
      }
    },
    furnace_front_lit(t, r) { DRAW.furnace_front(t, r, true); },
    wool_white(t, r) { wool(t, r, '#e9ecec'); },
    wool_red(t, r) { wool(t, r, '#a12722'); },
    wool_blue(t, r) { wool(t, r, '#35399d'); },
    wool_yellow(t, r) { wool(t, r, '#f8c627'); },
    wool_green(t, r) { wool(t, r, '#546d1b'); },
    wool_black(t, r) { wool(t, r, '#1f1f24'); },
    bookshelf(t, r) {
      planks(t, r, '#a8834f');
      const cols = ['#7a2a22', '#2a4a7a', '#3a6a2a', '#8a6a2a', '#5a2a6a', '#2a6a6a'];
      for (const y0 of [1, 9]) {
        for (let x = 1; x < 15;) {
          const w = 1 + ((r() * 2) | 0), c = cols[(r() * cols.length) | 0], h = 5 + ((r() * 2) | 0);
          for (let i = 0; i < w && x < 15; i++, x++) for (let y = y0 + 6 - h; y < y0 + 6; y++) t.px(x, y, i === 0 ? shadeHex(c, 1.2) : c);
          if (r() < 0.2) x++;
        }
        for (let x = 0; x < 16; x++) t.px(x, y0 + 6, '#5a3f22');
      }
    },
    tall_grass(t, r) {
      plant(t, () => {
        for (let k = 0; k < 7; k++) {
          const x0 = 1 + ((r() * 14) | 0), h = 6 + ((r() * 9) | 0), lean = r() < 0.5 ? -1 : 1;
          for (let y = 0; y < h; y++) t.px(x0 + ((y > h * 0.6) ? lean : 0), 15 - y, P.grass[(r() * 5) | 0]);
        }
      });
    },
    dandelion(t, r) {
      plant(t, () => {
        for (let y = 9; y < 16; y++) t.px(7, y, '#3f8a26');
        t.px(6, 12, '#4d9a30'); t.px(8, 13, '#4d9a30');
        for (const [x, y] of [[6, 6], [7, 6], [8, 6], [6, 7], [7, 7], [8, 7], [6, 8], [7, 8], [8, 8], [7, 5]]) t.px(x, y, '#f5d31a');
        t.px(7, 7, '#e0a000');
      });
    },
    poppy(t, r) {
      plant(t, () => {
        for (let y = 9; y < 16; y++) t.px(7, y, '#3f8a26');
        t.px(8, 12, '#4d9a30'); t.px(9, 11, '#4d9a30');
        for (const [x, y] of [[6, 5], [7, 5], [8, 5], [5, 6], [6, 6], [7, 6], [8, 6], [9, 6], [5, 7], [6, 7], [8, 7], [9, 7], [6, 8], [7, 8], [8, 8]]) t.px(x, y, '#d8261f');
        t.px(7, 7, '#2a1a10');
      });
    },
    blue_flower(t, r) {
      plant(t, () => {
        for (let y = 9; y < 16; y++) t.px(7, y, '#3f8a26');
        t.px(6, 13, '#4d9a30');
        for (const [x, y] of [[7, 4], [6, 5], [8, 5], [5, 6], [9, 6], [6, 7], [8, 7], [7, 8], [7, 6]]) t.px(x, y, '#4a6ae8');
        t.px(7, 6, '#e8e070'); t.px(7, 5, '#7a94ff');
      });
    },
    dead_bush(t, r) {
      plant(t, () => {
        for (let y = 9; y < 16; y++) t.px(7, y, '#7a5a30');
        const br = [[6, 10], [5, 9], [4, 8], [8, 10], [9, 9], [10, 8], [10, 7], [6, 12], [5, 12], [4, 11], [9, 12], [10, 12], [11, 11], [3, 7], [7, 8], [7, 7], [8, 6]];
        for (const [x, y] of br) t.px(x, y, r() < 0.5 ? '#8a6a3a' : '#6a4a25');
      });
    },
    torch(t, r) {
      plant(t, () => {
        for (let y = 8; y < 16; y++) { t.px(7, y, '#6b4f2a'); t.px(8, y, '#8a6a3a'); }
        t.px(7, 7, '#ffd84a'); t.px(8, 7, '#ffb020'); t.px(7, 6, '#fff3b0'); t.px(8, 6, '#ffd84a');
      });
    },
    clay(t, r) { t.noise(['#a1a7b2', '#9aa0ab', '#a8aeb9', '#939aa5'], r); },
    obsidian(t, r) { t.noise(['#1a1426', '#140f1e', '#241a36', '#0e0a16'], r); blob(t, r, 4, ['#3a2a5a', '#2a1f40'], [2, 4]); },
    pumpkin_side(t, r) {
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const rib = x % 4 === 0;
        t.px(x, y, rib ? '#b76a10' : (r() < 0.5 ? '#e08a1c' : '#d67f16'));
      }
      for (let x = 0; x < 16; x++) t.px(x, 0, '#9a5a0e');
    },
    pumpkin_top(t, r) {
      DRAW.pumpkin_side(t, r);
      for (let y = 6; y < 10; y++) for (let x = 6; x < 10; x++) t.px(x, y, '#5a6a20');
      t.px(7, 7, '#7a8a30');
    },
    glowstone(t, r) { cells(t, r, 10, ['#f7d27a', '#e8b54a', '#ffe7a6', '#c98f33'], '#8a5a20'); },
    lava(t, r) {
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const w = Math.sin(x * 0.7 + y * 0.3) + Math.sin(y * 0.9 - x * 0.4) + r() * 0.8;
        t.px(x, y, w > 1.4 ? '#ffe070' : w > 0.6 ? '#ff9a20' : w > -0.4 ? '#e86010' : '#b83808');
      }
    },
    fire(t, r) {
      plant(t, () => {
        for (let x = 0; x < 16; x++) {
          const h = 6 + ((r() * 9) | 0);
          for (let y = 15; y > 15 - h; y--) { const k = (15 - y) / h; t.px(x, y, k < 0.35 ? '#ff4a00' : k < 0.7 ? '#ff9a10' : '#ffe060', 235); }
        }
      });
    },
    farmland(t, r) {
      t.noise(['#5a3a20', '#4e321c', '#664428', '#3f2816'], r);
      for (let y = 1; y < 16; y += 4) for (let x = 0; x < 16; x++) t.px(x, y, '#35220f');
    },
    wheat_0(t, r) { plant(t, () => { for (let k = 0; k < 5; k++) { const x = 2 + k * 3; for (let y = 13; y < 16; y++) t.px(x, y, '#5aa83a'); } }); },
    wheat_1(t, r) { plant(t, () => { for (let k = 0; k < 5; k++) { const x = 2 + k * 3; for (let y = 10; y < 16; y++) t.px(x + (y < 12 ? 1 : 0), y, '#4f9a30'); } }); },
    wheat_2(t, r) { plant(t, () => { for (let k = 0; k < 5; k++) { const x = 1 + k * 3; for (let y = 7; y < 16; y++) t.px(x + (y < 10 ? 1 : 0), y, y < 9 ? '#8aa83a' : '#5a9a30'); } }); },
    wheat_3(t, r) { plant(t, () => { for (let k = 0; k < 5; k++) { const x = 1 + k * 3; for (let y = 4; y < 16; y++) t.px(x + (y < 8 ? 1 : 0), y, y < 8 ? '#b8a840' : '#7a9a30'); } }); },
    wheat_4(t, r) {
      plant(t, () => {
        for (let k = 0; k < 5; k++) {
          const x = 1 + k * 3;
          for (let y = 2; y < 16; y++) t.px(x + (y < 7 ? 1 : 0), y, y < 7 ? (y % 2 ? '#e0c050' : '#c8a030') : '#a89040');
        }
      });
    },
    door_wood_lower(t, r) {
      planks(t, r, '#9a7646');
      for (let k = 0; k < 16; k++) { t.px(0, k, '#5a3f22'); t.px(15, k, '#5a3f22'); t.px(k, 15, '#5a3f22'); }
      for (let y = 3; y < 13; y++) { t.px(4, y, '#6d4d2b'); t.px(11, y, '#6d4d2b'); }
      t.px(12, 2, '#cfcfcf'); t.px(12, 3, '#9a9a9a');
    },
    door_wood_upper(t, r) {
      planks(t, r, '#9a7646');
      for (let k = 0; k < 16; k++) { t.px(0, k, '#5a3f22'); t.px(15, k, '#5a3f22'); t.px(k, 0, '#5a3f22'); }
      for (const [x0, y0] of [[2, 3], [9, 3]]) for (let y = y0; y < y0 + 5; y++) for (let x = x0; x < x0 + 5; x++) t.px(x, y, x === x0 || y === y0 ? '#2a3a4a' : '#6a8aa8', 255);
    },
    door_iron_lower(t, r) {
      t.noise(['#d8d8d8', '#cccccc', '#e2e2e2'], r);
      for (let k = 0; k < 16; k++) { t.px(0, k, '#8a8a8a'); t.px(15, k, '#8a8a8a'); t.px(k, 15, '#8a8a8a'); t.px(k, 7, '#a8a8a8'); }
      for (let y = 9; y < 14; y++) for (let x = 3; x < 13; x += 3) t.px(x, y, '#9a9a9a');
    },
    door_iron_upper(t, r) {
      t.noise(['#d8d8d8', '#cccccc', '#e2e2e2'], r);
      for (let k = 0; k < 16; k++) { t.px(0, k, '#8a8a8a'); t.px(15, k, '#8a8a8a'); t.px(k, 0, '#8a8a8a'); }
      for (let y = 3; y < 10; y++) for (let x = 3; x < 13; x++) t.px(x, y, (x - 3) % 3 === 0 ? '#8a8a8a' : '#2a2a30');
    },
    chest_top(t, r) {
      planks(t, r, '#a87a3a');
      for (let k = 0; k < 16; k++) { t.px(k, 0, '#4a3018'); t.px(k, 15, '#4a3018'); t.px(0, k, '#4a3018'); t.px(15, k, '#4a3018'); }
    },
    chest_side(t, r) {
      planks(t, r, '#a87a3a');
      for (let k = 0; k < 16; k++) { t.px(k, 0, '#4a3018'); t.px(k, 15, '#4a3018'); t.px(0, k, '#4a3018'); t.px(15, k, '#4a3018'); t.px(k, 5, '#4a3018'); }
    },
    chest_front(t, r) {
      DRAW.chest_side(t, r);
      for (let y = 4; y < 8; y++) for (let x = 7; x < 9; x++) t.px(x, y, y === 4 ? '#e8e8e8' : '#b8b8b8');
      t.px(7, 7, '#2a2a2a'); t.px(8, 7, '#2a2a2a');
    },
    bed_head_top(t, r) {
      wool(t, r, '#b02828');
      for (let y = 0; y < 7; y++) for (let x = 1; x < 15; x++) t.px(x, y, y === 6 ? '#c8c8c8' : (r() < 0.8 ? '#f0f0f0' : '#dedede'));
    },
    bed_foot_top(t, r) { wool(t, r, '#b02828'); for (let x = 0; x < 16; x++) t.px(x, 15, '#801818'); },
    bed_side_head(t, r) { planks(t, r, '#a8834f'); for (let y = 0; y < 6; y++) for (let x = 0; x < 16; x++) t.px(x, y, x < 7 ? '#f0f0f0' : '#b02828'); },
    bed_side_foot(t, r) { planks(t, r, '#a8834f'); for (let y = 0; y < 6; y++) for (let x = 0; x < 16; x++) t.px(x, y, '#b02828'); },
    lever(t, r) { plant(t, () => { for (let y = 5; y < 16; y++) { t.px(7, y, '#6b4f2a'); t.px(8, y, '#8a6a3a'); } t.px(7, 4, '#5a4020'); t.px(8, 4, '#5a4020'); }); },
    trapdoor(t, r) {
      planks(t, r, '#9a7646');
      for (let k = 0; k < 16; k++) { t.px(k, 0, '#5a3f22'); t.px(k, 15, '#5a3f22'); t.px(0, k, '#5a3f22'); t.px(15, k, '#5a3f22'); }
      // окошки: сквозь люк видно
      for (const [x0, y0] of [[2, 2], [9, 2], [2, 9], [9, 9]]) for (let y = y0; y < y0 + 5; y++) for (let x = x0; x < x0 + 5; x++) if ((x - x0 + y - y0) % 4 !== 3) t.px(x, y, '#000000', 0);
    },
    iron_trapdoor(t, r) {
      t.noise(['#d8d8d8', '#cccccc', '#e2e2e2'], r);
      for (let k = 0; k < 16; k++) { t.px(k, 0, '#8a8a8a'); t.px(k, 15, '#8a8a8a'); t.px(0, k, '#8a8a8a'); t.px(15, k, '#8a8a8a'); }
      for (let y = 3; y < 13; y += 3) for (let x = 3; x < 13; x++) t.px(x, y, '#9a9a9a');
      for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13]]) t.px(x, y, '#6a6a6a');
    },
    ladder(t, r) {
      plant(t, () => {
        for (let y = 0; y < 16; y++) { t.px(2, y, '#6b4f2a'); t.px(3, y, '#8a6a3a'); t.px(12, y, '#6b4f2a'); t.px(13, y, '#8a6a3a'); }
        for (const y of [1, 5, 9, 13]) for (let x = 4; x < 12; x++) { t.px(x, y, '#9a7646'); t.px(x, y + 1, '#6b4f2a'); }
      });
    },
    netherrack(t, r) {
      t.noise(['#6e2a28', '#7e3230', '#5e2220', '#8a3a36', '#6a2624'], r, [4, 3, 3, 2, 3]);
      for (let k = 0; k < 18; k++) { const x = (r() * 16) | 0, y = (r() * 16) | 0; t.px(x, y, '#4a1614'); t.px((x + 1) & 15, y, '#9a4642'); }
    },
    soul_sand(t, r) {
      t.noise(['#54402f', '#4a3828', '#5e4836', '#40302a'], r, [4, 3, 2, 2]);
      // лица в песке
      for (const [x0, y0] of [[2, 3], [9, 9]]) { t.px(x0, y0, '#2a1e16'); t.px(x0 + 2, y0, '#2a1e16'); t.px(x0 + 1, y0 + 2, '#2a1e16'); t.px(x0, y0 + 2, '#34261c'); t.px(x0 + 2, y0 + 2, '#34261c'); }
    },
    nether_bricks(t, r) {
      t.noise(['#3e1a20', '#482228', '#361820', '#522a32'], r);
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const row = y >> 2, off = row % 2 ? 4 : 0; if (y % 4 === 3 || (x + off) % 8 === 7) t.px(x, y, '#1c0a0c'); }
      for (let y = 0; y < 16; y += 4) for (let x = 0; x < 16; x++) if (r() < 0.3) t.px(x, y, '#643238');
    },
    quartz_ore(t, r) {
      DRAW.netherrack(t, r);
      for (const [cx, cy] of [[3, 4], [11, 3], [6, 11], [12, 12]]) for (let k = 0; k < 4; k++) t.px(cx + ((r() * 3) | 0) - 1, cy + ((r() * 3) | 0) - 1, r() < 0.5 ? '#f0ece4' : '#d8d0c4');
    },
    portal(t, r) {
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const a = Math.atan2(y - 7.5, x - 7.5), d = Math.hypot(x - 7.5, y - 7.5);
        const w = Math.sin(a * 3 + d * 0.9);
        t.px(x, y, w > 0.4 ? '#c070ff' : w > -0.3 ? '#8a30e0' : '#5a10a8', w > 0.4 ? 230 : 190);
      }
    },
    nether_wart_0(t) { plant(t, () => { for (const x of [4, 8, 11]) { t.px(x, 15, '#7a1a20'); t.px(x, 14, '#9a2028'); t.px(x + 1, 14, '#7a1a20'); } }); },
    nether_wart_1(t) { plant(t, () => { for (const x of [3, 7, 11]) for (let y = 11; y < 16; y++) { t.px(x + (y < 13 ? 1 : 0), y, y < 13 ? '#b02a30' : '#7a1a20'); if (y < 13) t.px(x + 2, y, '#9a2028'); } }); },
    nether_wart_2(t) { plant(t, () => { for (const x of [2, 7, 11]) for (let y = 7; y < 16; y++) { t.px(x + (y < 11 ? 1 : 0), y, y < 11 ? '#c8303a' : '#8a1a22'); if (y < 11) { t.px(x, y, '#a82830'); t.px(x + 2, y, '#e04a50'); } } }); },
    spawner(t) {
      plant(t, () => {
        for (let k = 0; k < 16; k++) { t.px(k, 0, '#1a2430'); t.px(k, 15, '#1a2430'); t.px(0, k, '#1a2430'); t.px(15, k, '#1a2430'); }
        for (let k = 1; k < 15; k++) for (const g of [5, 10]) { t.px(g, k, '#2a3848'); t.px(k, g, '#2a3848'); }
        for (let k = 2; k < 14; k += 4) t.px(k, k, '#ff8a10', 200);
      });
    },
    dust_0(t, r) { DRAW.dust(t, r, ['#4a0808', '#5a0a0a', '#3a0606']); },
    dust_1(t, r) { DRAW.dust(t, r, ['#8a1010', '#7a0c0c', '#9a1414']); },
    dust_2(t, r) { DRAW.dust(t, r, ['#c01818', '#b01414', '#d02020']); },
    dust_3(t, r) { DRAW.dust(t, r, ['#ff2a1a', '#f01810', '#ff5a3a']); },
    dust(t, r, pal) { plant(t, () => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (r() < 0.62) t.px(x, y, pal[(r() * pal.length) | 0]); }); },
    redstone_torch_on(t) { plant(t, () => { for (let y = 6; y < 16; y++) { t.px(7, y, '#6b4f2a'); t.px(8, y, '#8a6a3a'); } for (const [x, y] of [[7, 6], [8, 6], [7, 7], [8, 7]]) t.px(x, y, '#ff3020'); t.px(7, 5, '#ffa090'); t.px(8, 5, '#ff5040'); }); },
    redstone_torch_off(t) { plant(t, () => { for (let y = 6; y < 16; y++) { t.px(7, y, '#6b4f2a'); t.px(8, y, '#8a6a3a'); } for (const [x, y] of [[7, 6], [8, 6], [7, 7], [8, 7], [7, 5], [8, 5]]) t.px(x, y, '#5a1010'); }); },
    repeater(t, r) {
      t.noise(['#a0a0a0', '#989898', '#aaaaaa'], r);
      for (let k = 0; k < 16; k++) { t.px(k, 0, '#707070'); t.px(k, 15, '#707070'); t.px(0, k, '#707070'); t.px(15, k, '#707070'); }
      for (let y = 3; y < 14; y++) t.px(7, y, '#b01414'), t.px(8, y, '#8a1010');
      for (let k = 0; k < 3; k++) { t.px(7 - k, 3 + k, '#b01414'); t.px(8 + k, 3 + k, '#b01414'); }     // стрелка к выходу (вверх плитки = -Z)
    },
    lamp_off(t, r) {
      t.noise(['#6a4a2a', '#5a3e22', '#7a5632'], r);
      for (let y = 1; y < 15; y++) for (let x = 1; x < 15; x++) if ((x + y) % 5 && (x - y + 16) % 5) t.px(x, y, ['#8a6a4a', '#7a5a3a', '#9a7a5a'][(r() * 3) | 0]);
    },
    lamp_on(t, r) {
      t.noise(['#b8783a', '#a86a2a', '#c8884a'], r);
      for (let y = 1; y < 15; y++) for (let x = 1; x < 15; x++) if ((x + y) % 5 && (x - y + 16) % 5) t.px(x, y, ['#ffe090', '#fff0b0', '#ffd070'][(r() * 3) | 0]);
    },
    piston_top(t, r) { planks(t, r, '#b8945a'); for (let y = 5; y < 11; y++) for (let x = 5; x < 11; x++) t.px(x, y, x === 5 || y === 5 || x === 10 || y === 10 ? '#6a6a6a' : '#c8c8c8'); },
    piston_top_sticky(t, r) { DRAW.piston_top(t, r); for (let y = 1; y < 15; y++) for (let x = 1; x < 15; x++) if (r() < 0.55) t.px(x, y, ['#6ab84a', '#5aa83a', '#7ac85a'][(r() * 3) | 0]); },
    piston_side(t, r) {
      cells(t, r, 9, ['#8c8c8c', '#7a7a7a', '#999999', '#6f6f6f'], '#4f4f4f');
      for (let y = 0; y < 4; y++) for (let x = 0; x < 16; x++) t.px(x, y, y === 3 ? '#6a4f2a' : ['#b8945a', '#a8844a'][(r() * 2) | 0]);
      for (let y = 4; y < 16; y++) { t.px(7, y, '#5a5a5a'); t.px(8, y, '#b0b0b0'); }
    },
    piston_bottom(t, r) { cells(t, r, 9, ['#8c8c8c', '#7a7a7a', '#999999', '#6f6f6f'], '#4f4f4f'); for (let y = 6; y < 10; y++) for (let x = 6; x < 10; x++) t.px(x, y, '#3a3a3a'); },
    piston_inner(t, r) { cells(t, r, 9, ['#7c7c7c', '#6a6a6a', '#898989'], '#3f3f3f'); for (let y = 5; y < 11; y++) for (let x = 5; x < 11; x++) t.px(x, y, '#9a9a9a'); },
    redstone_ore(t, r) { ore(t, r, ['#ff2a1a', '#c01818', '#ff6a5a'], '#7a0c0c'); },
    redstone_block(t, r) { t.noise(['#c01818', '#b01414', '#d02020', '#a81010'], r); for (let k = 0; k < 16; k++) { t.px(k, 0, '#8a0c0c'); t.px(0, k, '#8a0c0c'); t.px(k, 15, '#700808'); t.px(15, k, '#700808'); } for (let k = 3; k < 13; k += 3) { t.px(k, k, '#ff5a4a'); t.px(15 - k, k, '#ff5a4a'); } },
    sugar_cane(t) {
      plant(t, () => { for (const x of [3, 8, 12]) for (let y = 0; y < 16; y++) { t.px(x, y, y % 5 === 0 ? '#6a9a3a' : '#9ad060'); t.px(x + 1, y, y % 5 === 0 ? '#5a8a2a' : '#7ab848'); } for (const [x, y] of [[5, 4], [6, 3], [10, 9], [11, 8], [1, 12], [2, 11]]) t.px(x, y, '#8ac050'); });
    },
    melon_side(t, r) { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) t.px(x, y, (x + ((y / 4) | 0)) % 4 < 2 ? '#5a8a2a' : '#8ab83a'); },
    melon_top(t, r) { t.noise(['#6a9a2a', '#5a8a24', '#7aaa34'], r); for (let k = 0; k < 4; k++) t.px(7 + (k % 2), 7 + ((k / 2) | 0), '#3a5a1a'); },
    carrots_0(t) { plant(t, () => { for (const x of [3, 8, 12]) { t.px(x, 15, '#3a8a2a'); t.px(x, 14, '#5aa83a'); } }); },
    carrots_1(t) { plant(t, () => { for (const x of [2, 7, 11]) for (let y = 11; y < 16; y++) { t.px(x + (y < 13 ? 1 : 0), y, '#4a9a30'); } }); },
    carrots_2(t) { plant(t, () => { for (const x of [2, 7, 11]) for (let y = 8; y < 16; y++) { t.px(x + (y < 11 ? 1 : 0), y, '#4a9a30'); if (y < 11) t.px(x + 2, y, '#5aa83a'); } }); },
    carrots_3(t) { plant(t, () => { for (const x of [2, 7, 11]) { for (let y = 6; y < 13; y++) { t.px(x + (y < 9 ? 1 : 0), y, '#4a9a30'); t.px(x + 2, y, '#5aa83a'); } t.px(x + 1, 13, '#f08a20'); t.px(x + 1, 14, '#e07a10'); t.px(x + 1, 15, '#f09a30'); } }); },
    brewing_base(t, r) { t.noise(['#7a7a7a', '#6a6a6a', '#848484'], r); for (let k = 0; k < 16; k++) { t.px(k, 0, '#4a4a4a'); t.px(0, k, '#4a4a4a'); } },
    brewing_stand(t, r) { t.noise(['#f8c820', '#e89a10', '#fff080'], r); },
    ench_top(t, r) {
      t.noise(['#9a1a1a', '#8a1414', '#aa2020'], r);
      for (let k = 0; k < 16; k++) { t.px(k, 0, '#1a1428'); t.px(k, 15, '#1a1428'); t.px(0, k, '#1a1428'); t.px(15, k, '#1a1428'); }
      for (const [x, y] of [[1, 1], [14, 1], [1, 14], [14, 14]]) { t.px(x, y, '#40e8e0'); }
      for (let y = 5; y < 11; y++) for (let x = 4; x < 12; x++) t.px(x, y, x === 7 || x === 8 ? '#4a2a0a' : '#f0e8d0');      // раскрытая книга
    },
    ench_side(t, r) { DRAW.obsidian(t, r); for (let y = 0; y < 5; y++) for (let x = 0; x < 16; x++) t.px(x, y, y === 4 ? '#6a1010' : ['#9a1a1a', '#8a1414'][(r() * 2) | 0]); for (let x = 1; x < 16; x += 4) t.px(x, 6, '#40e8e0'); },
    anvil_top(t, r) { t.noise(['#4a4a4a', '#444444', '#525252'], r); for (let k = 0; k < 16; k++) { t.px(k, 0, '#2a2a2a'); t.px(k, 15, '#2a2a2a'); } for (let y = 3; y < 13; y++) t.px(7, y, '#5a5a5a'); },
    anvil_side(t, r) { t.noise(['#444444', '#3c3c3c', '#4c4c4c'], r); for (let k = 0; k < 16; k++) { t.px(k, 0, '#5a5a5a'); t.px(0, k, '#2a2a2a'); } },
    // Край: камень Края, рамка портала, портал, яйцо дракона; кирпичи крепости
    end_stone(t, r) { t.noise(['#dedea0', '#e8e8b2', '#d2d292', '#eeeec0'], r); blob(t, r, 5, ['#c4c486', '#cfcf90'], [1, 3]); for (let k = 0; k < 5; k++) t.px((r() * 16) | 0, (r() * 16) | 0, '#b8b87a'); },
    end_frame_top(t, r) {
      t.noise(['#3e7a66', '#35705c', '#4a8a74'], r);
      for (let k = 0; k < 16; k++) { t.px(k, 0, '#d8d89a'); t.px(k, 15, '#d8d89a'); t.px(0, k, '#d8d89a'); t.px(15, k, '#d8d89a'); t.px(k, 1, '#c4c486'); t.px(1, k, '#c4c486'); }
      for (let y = 4; y < 12; y++) for (let x = 4; x < 12; x++) t.px(x, y, (x === 4 || x === 11 || y === 4 || y === 11) ? '#1e4a3c' : '#12302a');
    },
    end_frame_side(t, r) { DRAW.end_stone(t, r); for (let y = 0; y < 4; y++) for (let x = 0; x < 16; x++) t.px(x, y, y === 3 ? '#2a5a4a' : ['#3e7a66', '#35705c', '#4a8a74'][(r() * 3) | 0]); for (let x = 2; x < 16; x += 5) t.px(x, 4, '#2a5a4a'); },
    end_frame_eye(t, r) { t.noise(['#2a8a5a', '#1e7a4c', '#34a06a'], r); for (let y = 5; y < 11; y++) for (let x = 6; x < 10; x++) t.px(x, y, '#0a1a12'); t.px(5, 5, '#8ae8b0'); t.px(6, 4, '#8ae8b0'); },
    end_portal(t, r) {
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) t.px(x, y, ['#06060e', '#0a0a16', '#0c0a1a'][(r() * 3) | 0]);
      for (let k = 0; k < 14; k++) t.px((r() * 16) | 0, (r() * 16) | 0, ['#3ae0c0', '#e0f0ff', '#7a5ad0', '#2a8ab0'][(r() * 4) | 0]);
    },
    dragon_egg(t, r) { t.noise(['#0c0812', '#140c1c', '#100a18', '#08060c'], r); blob(t, r, 6, ['#2a1440', '#3a1a5a'], [1, 3]); for (let k = 0; k < 4; k++) t.px((r() * 16) | 0, (r() * 16) | 0, '#6a3aa0'); },
    mossy_stone_bricks(t, r) { DRAW.stone_bricks(t, r); blob(t, r, 6, ['#5b7a36', '#4d6b2d', '#6a8c3f'], [2, 5]); },
    cracked_stone_bricks(t, r) { DRAW.stone_bricks(t, r); let x = 3, y = 1; for (let k = 0; k < 14; k++) { t.px(x, y, '#3e3e3e'); y++; x += ((r() * 3) | 0) - 1; } x = 11; y = 9; for (let k = 0; k < 6; k++) { t.px(x, y, '#3e3e3e'); x++; y += (r() * 2) | 0; } },
    // рельсы: шпалы поперёк, две полосы вдоль (по v); поворот - дуги от нижнего и правого края
    rail(t, r, pal) {
      pal = pal || { tie: ['#6b4f2a', '#5a4020'], rail: ['#a8a8a8', '#6a6a6a'], mid: null };
      for (let y = 1; y < 16; y += 4) for (let x = 1; x < 15; x++) { t.px(x, y, pal.tie[0]); t.px(x, y + 1, pal.tie[1]); }
      for (let y = 0; y < 16; y++) { t.px(3, y, pal.rail[0]); t.px(4, y, pal.rail[1]); t.px(11, y, pal.rail[0]); t.px(12, y, pal.rail[1]); if (pal.mid) { t.px(7, y, pal.mid); t.px(8, y, pal.mid); } }
    },
    rail_corner(t) {
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const d = Math.hypot(x + 0.5 - 16, y + 0.5 - 16), a = Math.atan2(16 - y, 16 - x);
        if (d > 2 && d < 15 && Math.round(a / (Math.PI / 2) * 5 * 2) % 3 === 0 && d > 3) t.px(x, y, d % 2 < 1 ? '#6b4f2a' : '#5a4020');
      }
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const d = Math.hypot(x + 0.5 - 16, y + 0.5 - 16);
        if ((d >= 3.6 && d < 5.2) || (d >= 11.2 && d < 12.8)) t.px(x, y, d < 4.4 || (d > 11.2 && d < 12) ? '#a8a8a8' : '#6a6a6a');
      }
    },
    powered_rail(t, r) { DRAW.rail(t, r, { tie: ['#4a3420', '#3a2818'], rail: ['#f0c830', '#b08a13'], mid: '#6a1010' }); },
    powered_rail_on(t, r) { DRAW.rail(t, r, { tie: ['#4a3420', '#3a2818'], rail: ['#f0c830', '#b08a13'], mid: '#ff3a2a' }); },
    iron_block(t, r) { t.noise(['#d8d8d8', '#e0e0e0', '#cfcfcf'], r); for (let k = 0; k < 16; k++) { t.px(k, 0, '#f4f4f4'); t.px(0, k, '#f4f4f4'); t.px(k, 15, '#9a9a9a'); t.px(15, k, '#9a9a9a'); } for (let x = 2; x < 14; x += 4) for (let y = 2; y < 14; y++) t.px(x, y, '#c4c4c4'); },
    lapis_ore(t, r) { ore(t, r, ['#2a50c8', '#1a3aa0', '#4a70e8'], '#0a2070'); },
    path_top(t, r) { t.noise(['#9a7a48', '#8a6a3a', '#a8885a', '#94743f'], r, [4, 3, 2, 3]); for (let k = 0; k < 10; k++) t.px((r() * 16) | 0, (r() * 16) | 0, '#b8986a'); },
    path_side(t, r) { DRAW.dirt(t, r); for (let x = 0; x < 16; x++) { t.px(x, 0, '#9a7a48'); t.px(x, 1, '#8a6a3a'); if (r() < 0.5) t.px(x, 2, '#94743f'); } },
    emerald_ore(t, r) { ore(t, r, ['#3ae070', '#17a84a', '#8affb0'], '#0a6a2a'); },
    water_flow(t, r) {
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const w = Math.sin((x * 0.5 + y) * 0.9) + Math.sin(x * 0.3 - y * 0.2);
        t.px(x, y, w > 1.1 ? '#5a98e8' : w > -0.2 ? '#3a74d0' : '#2f66c0', 185);
      }
    },
  };

  // Трещины: 10 стадий, прозрачный фон, линии растут от центра
  function drawCracks(canvas) {
    const g = canvas.getContext('2d');
    const r = rng(99);
    const lines = [];
    for (let k = 0; k < 40; k++) {
      let x = 8, y = 8;
      const pts = [];
      const a = r() * Math.PI * 2;
      for (let s = 0; s < 9; s++) { x += Math.cos(a + (r() - 0.5) * 1.6); y += Math.sin(a + (r() - 0.5) * 1.6); pts.push([x | 0, y | 0]); }
      lines.push(pts);
    }
    for (let st = 0; st < 10; st++) {
      const n = 3 + st * 4, len = 2 + Math.floor(st * 0.8);
      for (let k = 0; k < n; k++) for (let s = 0; s < Math.min(len, 9); s++) {
        const [x, y] = lines[k][s];
        if (x < 0 || y < 0 || x > 15 || y > 15) continue;
        g.fillStyle = st > 6 && s % 2 ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0.7)';
        g.fillRect(st * 16 + x, y, 1, 1);
      }
    }
  }

  // ---------- Атлас блоков с уровнями детализации ----------
  function buildBlockAtlas() {
    const cols = C.ATLAS_COLS, rows = C.ATLAS_ROWS;
    const W = cols * 16, H = rows * 16;
    const base = document.createElement('canvas');
    base.width = W; base.height = H;
    const g = base.getContext('2d');
    const tiles = [];
    C.TILES.forEach((name, i) => {
      const t = new Tile();
      const draw = DRAW[name];
      if (draw) draw(t, rng(1000 + i * 7919)); else t.noise(['#ff00ff', '#000000'], rng(i));
      tiles.push(t);
      const img = new ImageData(t.d, 16, 16);
      g.putImageData(img, (i % cols) * 16, ((i / cols) | 0) * 16);
    });
    // уровни: пока плитка больше пикселя - уменьшаем каждую отдельно (среднее 2x2, прозрачность учтена)
    const levels = [base];
    let prev = g.getImageData(0, 0, W, H), w = W, h = H, ts = 16;
    while (w > 1 || h > 1) {
      const nw = Math.max(1, w >> 1), nh = Math.max(1, h >> 1);
      const out = new ImageData(nw, nh);
      for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
        let r = 0, gg = 0, b = 0, a = 0, n = 0;
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
          const sx = Math.min(w - 1, x * 2 + dx), sy = Math.min(h - 1, y * 2 + dy);
          const i = (sy * w + sx) * 4, al = prev.data[i + 3];
          r += prev.data[i] * al; gg += prev.data[i + 1] * al; b += prev.data[i + 2] * al; a += al; n++;
        }
        const o = (y * nw + x) * 4;
        if (a > 0) { out.data[o] = r / a; out.data[o + 1] = gg / a; out.data[o + 2] = b / a; }
        // вырезанные (листва) не должны исчезать вдали: прозрачность округляем к порогу
        const avg = a / n;
        out.data[o + 3] = ts >= 4 ? (avg > 100 ? Math.max(avg, 200) : avg) : avg;
      }
      const c = document.createElement('canvas'); c.width = nw; c.height = nh;
      c.getContext('2d').putImageData(out, 0, 0);
      levels.push(c);
      prev = out; w = nw; h = nh; ts >>= 1;
    }
    return { canvas: base, levels, tiles };
  }

  // ---------- Предметы ----------
  const MAT = {
    wood: ['#a0773f', '#6b4f2a', '#c09a5c'], stone: ['#8e8e8e', '#5c5c5c', '#adadad'], iron: ['#e2e2e2', '#9a9a9a', '#ffffff'],
    gold: ['#f5d13b', '#b08a13', '#fff08a'], diamond: ['#5de8dc', '#1f9c93', '#c8fff9'],
  };
  const STICK = ['#8a6a3a', '#5a4020'];
  function handle(t, x0, y0, len) {
    for (let k = 0; k < len; k++) { t.px(x0 + k, y0 - k, STICK[0]); t.px(x0 + k + 1, y0 - k, STICK[1]); }
  }
  const ITEM_DRAW = {
    stick(t) { handle(t, 3, 12, 10); },
    coal(t, r, dark) {
      const pal = dark ? ['#2a1f18', '#3a2c20', '#1a120c', '#4a3828'] : ['#1f1f1f', '#2f2f2f', '#111111', '#484848'];
      for (let y = 4; y < 13; y++) for (let x = 3; x < 13; x++) if (Math.hypot(x - 7.5, y - 8.5) < 5 - ((x * 7 + y * 3) % 5 === 0 ? 1 : 0)) t.px(x, y, pal[(r() * 4) | 0]);
      t.px(6, 6, pal[3]); t.px(7, 6, pal[3]); t.px(5, 7, pal[3]);
    },
    charcoal(t, r) { ITEM_DRAW.coal(t, r, true); },
    ingot(t, r, c) {
      for (let y = 6; y < 12; y++) for (let x = 2; x < 14; x++) {
        const inside = x >= 2 + Math.max(0, y - 9) && x <= 13 - Math.max(0, 8 - y);
        if (inside) t.px(x, y, y === 6 ? c[2] : y >= 10 ? c[1] : c[0]);
      }
      for (let x = 4; x < 10; x++) t.px(x, 7, c[2]);
    },
    iron_ingot(t, r) { ITEM_DRAW.ingot(t, r, MAT.iron); },
    gold_ingot(t, r) { ITEM_DRAW.ingot(t, r, MAT.gold); },
    diamond(t) {
      const c = MAT.diamond;
      const rows = [[6, 9], [4, 11], [3, 12], [4, 11], [5, 10], [6, 9], [7, 8]];
      rows.forEach(([a, b], k) => { for (let x = a; x <= b; x++) t.px(x, 4 + k, k === 0 ? c[2] : x === a || x === b ? c[1] : c[0]); });
      t.px(6, 6, c[2]); t.px(7, 6, c[2]); t.px(5, 7, c[2]);
    },
    pickaxe(t, r, m) {
      handle(t, 2, 13, 9);
      const c = MAT[m];
      const head = [[4, 2], [5, 2], [6, 2], [7, 2], [8, 2], [9, 3], [10, 3], [11, 4], [12, 5], [12, 6], [13, 7], [13, 8], [13, 9], [13, 10], [3, 3]];
      for (const [x, y] of head) { t.px(x, y, c[0]); t.px(x, y + 1, c[1]); }
      for (const [x, y] of head.slice(0, 7)) t.px(x, y, c[2]);
    },
    axe(t, r, m) {
      handle(t, 2, 13, 9);
      const c = MAT[m];
      const blade = [[7, 2], [8, 2], [9, 2], [6, 3], [7, 3], [8, 3], [9, 3], [10, 3], [6, 4], [7, 4], [8, 4], [9, 4], [10, 4], [11, 4], [6, 5], [7, 5], [8, 5], [11, 5], [12, 5], [7, 6], [12, 6], [13, 6]];
      for (const [x, y] of blade) t.px(x, y, y < 4 ? c[2] : x < 8 ? c[1] : c[0]);
    },
    shovel(t, r, m) {
      handle(t, 2, 13, 8);
      const c = MAT[m];
      const blade = [[10, 2], [11, 2], [12, 2], [9, 3], [10, 3], [11, 3], [12, 3], [13, 3], [9, 4], [10, 4], [11, 4], [12, 4], [13, 4], [10, 5], [11, 5], [12, 5], [11, 6]];
      for (const [x, y] of blade) t.px(x, y, y === 2 ? c[2] : x === 9 || y === 6 ? c[1] : c[0]);
    },
    sword(t, r, m) {
      const c = MAT[m];
      for (let k = 0; k < 9; k++) { t.px(5 + k, 10 - k, c[0]); t.px(6 + k, 10 - k, c[2]); t.px(5 + k, 11 - k, c[1]); }
      t.px(14, 1, c[2]);
      for (const [x, y] of [[3, 9], [4, 10], [5, 11], [6, 12], [4, 9], [6, 11]]) t.px(x, y, '#4a3520');
      handle(t, 1, 14, 3);
    },
    meat(t, r, pal, fat) {
      for (let y = 4; y < 13; y++) for (let x = 2; x < 14; x++) {
        const d = Math.hypot((x - 7.5) / 1.3, y - 8.5);
        if (d < 4.2) t.px(x, y, d > 3.4 ? pal[1] : pal[(r() * 2) | 0 ? 0 : 2]);
      }
      if (fat) for (let x = 4; x < 12; x++) t.px(x, 11 - ((x / 3) | 0) % 2, fat);
      t.px(12, 9, '#f0e8d8'); t.px(13, 10, '#f0e8d8'); t.px(13, 9, '#d8d0c0');
    },
    raw_porkchop(t, r) { ITEM_DRAW.meat(t, r, ['#f09a9a', '#c86a6a', '#f8b4b4'], '#fff0e8'); },
    cooked_porkchop(t, r) { ITEM_DRAW.meat(t, r, ['#b8804a', '#7a4f25', '#cf9a5f'], '#e8c890'); },
    raw_mutton(t, r) { ITEM_DRAW.meat(t, r, ['#d24a4a', '#9a2a2a', '#e06a6a'], '#f4e0d8'); },
    cooked_mutton(t, r) { ITEM_DRAW.meat(t, r, ['#8a5a30', '#5a3818', '#a06a3a'], '#c8a070'); },
    rotten_flesh(t, r) { ITEM_DRAW.meat(t, r, ['#8a6a3a', '#5a6a2a', '#a07a4a'], '#6a8a3a'); },
    apple(t, r) {
      for (let y = 4; y < 14; y++) for (let x = 3; x < 13; x++) {
        const d = Math.hypot(x - 7.5, (y - 9) * 1.1);
        if (d < 4.8) t.px(x, y, d > 4 ? '#8a1010' : (x < 6 && y < 8) ? '#ff8a8a' : '#d42020');
      }
      t.px(8, 3, '#5a3a1a'); t.px(8, 2, '#5a3a1a'); t.px(9, 2, '#3f8a26'); t.px(10, 1, '#3f8a26'); t.px(10, 2, '#4d9a30');
    },
    heart(t) {
      const rows = ['..rr..rr..', '.rRRrrRRr.', 'rRWRRRRRRr', 'rRRRRRRRRr', 'rRRRGRRRRr', '.rRRRRRRr.', '..rRRRRr..', '...rRRr...', '....rr....'];
      const col = { r: '#8a0f1e', R: '#e0263c', W: '#ffd0d8', G: '#ffe07a' };
      rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (col[row[x]]) t.px(3 + x, 3 + y, col[row[x]]); });
      for (const [x, y] of [[2, 2], [13, 2], [2, 12], [13, 12], [7, 1], [8, 13]]) t.px(x, y, '#ffe07a');
    },
    // шаблон: строки с буквами, палитра - цвета букв
    tpl(t, rows, pal, ox, oy) { rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) { const c = pal[row[x]]; if (c) t.px((ox || 0) + x, (oy || 0) + y, c); } }); },
    armor(t, r, spec) {
      const [piece, mat] = spec.split('-');
      const M = { leather: ['#8a5a30', '#a8753f', '#4a2e14'], iron: ['#d8d8d8', '#f4f4f4', '#6a6a6a'], gold: ['#f0c830', '#fff08a', '#8a6a10'], diamond: ['#4ad8cc', '#b8fff6', '#1a7a72'] }[mat];
      const pal = { a: M[0], b: M[1], '#': M[2] };
      const T = {
        helmet: ['', '', '....########....', '...#aaaaaaaa#...', '..#abbbbbbbba#..', '..#ab######ba#..', '..#a#......#a#..', '..#a#......#a#..', '..###......###..'],
        chestplate: ['', '..###......###..', '..#ab#....#ba#..', '..#aaa####aaa#..', '..#abaaaaaaba#..', '...##aaaaaa##...', '....#abaaba#....', '....#aabbaa#....', '....#aaaaaa#....', '....#abaaba#....', '....#aaaaaa#....', '....########....'],
        leggings: ['', '....########....', '....#abbbbba#...', '....#aaaaaaa#...', '....#aa##aaa#...', '....#aa##aaa#...', '....#ab#.#ba#...', '....#aa#.#aa#...', '....#ab#.#ba#...', '....#aa#.#aa#...', '....###..###....'],
        boots: ['', '', '', '', '', '...###...###....', '...#a#...#a#....', '...#b#...#b#....', '...#a#...#a#....', '..##a#..##a#....', '.#aaa#.#aaa#....', '.#bba#.#bba#....', '.#####.#####....'],
      }[piece];
      ITEM_DRAW.tpl(t, T, pal);
    },
    bucket(t, r, fill) {
      const inner = fill === 'water' ? '#3a74d0' : fill === 'lava' ? '#ff8a10' : '#404040';
      ITEM_DRAW.tpl(t, ['', '', '', '...##########...', '..#bbbbbbbbbb#..', '..#cccccccccc#..', '...#aaaaaaaa#...', '...#abaaaaaa#...', '...#aaaaaaaa#...', '....#aaaaaa#....', '....#abaaaa#....', '....########....'], { a: '#c8c8c8', b: '#f0f0f0', c: inner, '#': '#5a5a5a' });
    },
    shears(t) {
      ITEM_DRAW.tpl(t, ['', '.........#......', '........#a#.....', '.......#a#......', '......#a#.......', '.....#a#..##....', '....#a#..#aa#...', '...##b#.#aa#....', '..#bb##.#a#.....', '..#bb#...#......', '...##...........'], { a: '#e0e0e0', b: '#b83a2a', '#': '#404040' });
    },
    bow(t) {
      ITEM_DRAW.tpl(t, ['', '.......###......', '.....##...s.....', '....#.....s.....', '...#......s.....', '..#.......s.....', '..#.......s.....', '..#.......s.....', '...#......s.....', '....#.....s.....', '.....##...s.....', '.......###......'], { '#': '#7a5a30', s: '#e8e8e8' });
    },
    arrow(t) {
      for (let k = 0; k < 9; k++) t.px(4 + k, 11 - k, '#8a6a3a');
      ITEM_DRAW.tpl(t, ['.....aa', '....aba', '.....a.'], { a: '#8a8a8a', b: '#d0d0d0' }, 8, 1);
      ITEM_DRAW.tpl(t, ['w.', 'ww', '.w'], { w: '#f0f0f0' }, 2, 11);
      t.px(3, 13, '#f0f0f0'); t.px(2, 12, '#e0e0e0');
    },
    string(t) { for (let k = 0; k < 12; k++) t.px(2 + k, 8 + Math.round(Math.sin(k * 0.9) * 2), '#f0f0f0'); },
    feather(t) {
      for (let k = 0; k < 10; k++) { t.px(3 + k, 13 - k, '#c8c8c8'); t.px(4 + k, 13 - k, '#ffffff'); t.px(4 + k, 12 - k, '#f0f0f0'); if (k > 2) t.px(5 + k, 13 - k, '#e0e0e0'); }
    },
    flint(t) { ITEM_DRAW.tpl(t, ['', '', '', '.....###.....', '....#aab#....', '...#aaaab#...', '...#aaaaa#...', '..#aabaaa#...', '..#aaaaaa#...', '...#aaaa#....', '....####.....'], { a: '#4a4a4a', b: '#7a7a7a', '#': '#1e1e1e' }, 1, 1); },
    leather(t, r) { ITEM_DRAW.tpl(t, ['', '', '...##....##....', '..#aa####aa#...', '..#aaabaaaa#...', '...#aaaaaab#...', '...#abaaaaa#...', '...#aaaaaaa#...', '..#aaaaabaa#...', '..#aa####aa#...', '...##....##....'], { a: '#9a6030', b: '#b87840', '#': '#4a2a10' }, 1, 1); },
    raw_beef(t, r) { ITEM_DRAW.meat(t, r, ['#c83a3a', '#8a2020', '#e05a5a'], '#f0e0d0'); },
    steak(t, r) { ITEM_DRAW.meat(t, r, ['#7a4a22', '#4a2a10', '#9a6030'], '#b88a5a'); },
    raw_chicken(t, r) { ITEM_DRAW.meat(t, r, ['#f0c8b8', '#c89a8a', '#f8dcd0'], null); },
    cooked_chicken(t, r) { ITEM_DRAW.meat(t, r, ['#c88a40', '#8a5a20', '#e0a860'], null); },
    wheat(t) { for (let k = 0; k < 4; k++) { for (let y = 5; y < 15; y++) t.px(4 + k * 2 + (y > 11 ? 1 : 0), y, '#b89a40'); for (let y = 1; y < 6; y++) t.px(4 + k * 2, y, y % 2 ? '#e8c860' : '#c8a030'); } },
    seeds(t) { for (const [x, y] of [[4, 6], [7, 5], [10, 7], [5, 9], [8, 9], [11, 10], [6, 12], [9, 12]]) { t.px(x, y, '#3a7a20'); t.px(x + 1, y, '#5aa030'); t.px(x, y + 1, '#2a5a18'); } },
    bread(t) { ITEM_DRAW.tpl(t, ['', '', '', '', '.....######.....', '...##aabaaba##..', '..#aabaabaabaa#.', '..#aaaaaaaaaaa#.', '..#cccccccccccc#', '...############.'], { a: '#c8903a', b: '#e0b060', c: '#8a5a20', '#': '#5a3a14' }); },
    dye(t, r, col) {
      const c = { red: '#c82020', yellow: '#f0d020', blue: '#2a40c8', green: '#3a7a20', black: '#1e1e22', white: '#f0f0e8' }[col];
      for (let y = 4; y < 13; y++) for (let x = 3; x < 13; x++) { const d = Math.hypot(x - 7.5, (y - 8.5) * 1.2); if (d < 4.6) t.px(x, y, d > 3.8 ? shadeHex(c, 0.6) : (x < 6 && y < 7) ? shadeHex(c, 1.3) : c); }
    },
    door(t, r, kind) {
      const w = kind === 'iron' ? ['#d8d8d8', '#8a8a8a', '#2a2a30'] : ['#9a7646', '#5a3f22', '#6a8aa8'];
      for (let y = 1; y < 15; y++) for (let x = 4; x < 12; x++) t.px(x, y, x === 4 || x === 11 || y === 1 || y === 14 ? w[1] : w[0]);
      for (let y = 3; y < 7; y++) for (let x = 6; x < 10; x++) t.px(x, y, w[2]);
      t.px(10, 9, '#e0e0e0');
    },
    bed(t) { ITEM_DRAW.tpl(t, ['', '', '', '', '', '...wwwwrrrrrrr..', '..#wwwwrrrrrrr#.', '..#############.', '..#p#.......#p#.', '..###.......###.'], { w: '#f0f0f0', r: '#b02828', '#': '#5a3a14', p: '#a8834f' }); },
    egg(t, r, mob) {
      const c = { villager: ['#6a4a3a', '#b08a6a'], enderman: ['#161616', '#000000'], slime: ['#6ab84a', '#3a7a2a'], zombie_pigman: ['#e8a0a0', '#5a8a3a'], ghast: ['#f4f4f4', '#b0b0b0'], blaze: ['#f0c020', '#f89a10'], creeper: ['#5aa83a', '#101010'], pig: ['#f0a0a0', '#d06a7a'], sheep: ['#e8e8e8', '#b8a898'], cow: ['#5a3a20', '#e8e8e8'], chicken: ['#f0f0f0', '#e02020'], zombie: ['#2aa6a6', '#4f8a3a'], skeleton: ['#c8c8c8', '#6a6a6a'], spider: ['#3a2a2a', '#c02020'] }[mob];
      for (let y = 2; y < 15; y++) for (let x = 3; x < 13; x++) { const d = Math.hypot((x - 7.5) / 4.6, (y - 8.8) / 6.2); if (d < 1) t.px(x, y, d > 0.85 ? shadeHex(c[0], 0.65) : c[0]); }
      for (const [x, y] of [[6, 5], [9, 8], [5, 10], [8, 12], [10, 5]]) { t.px(x, y, c[1]); t.px(x + 1, y, c[1]); }
    },
    hoe(t, r, m) {
      handle(t, 2, 13, 9);
      const c = MAT[m];
      for (const [x, y] of [[8, 2], [9, 2], [10, 2], [11, 2], [12, 3], [8, 3], [9, 3], [10, 3], [11, 3]]) t.px(x, y, y === 2 ? c[2] : c[0]);
      t.px(12, 4, c[1]);
    },
    gunpowder(t, r) { for (let k = 0; k < 40; k++) { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 5; t.px(Math.round(7.5 + Math.cos(a) * d * 1.1), Math.round(9 + Math.sin(a) * d * 0.7), ['#5a5a5a', '#3a3a3a', '#7a7a7a', '#2a2a2a'][(r() * 4) | 0]); } },
    sugar(t, r) { for (let k = 0; k < 44; k++) { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 5; t.px(Math.round(7.5 + Math.cos(a) * d * 1.1), Math.round(9 + Math.sin(a) * d * 0.7), ['#ffffff', '#e8e8f0', '#d8d8e0'][(r() * 3) | 0]); } },
    paper(t) { ITEM_DRAW.tpl(t, ['', '', '...#########...', '...#wwwwwww#...', '...#wlllllw#...', '...#wwwwwww#...', '...#wlllllw#...', '...#wwwwwww#...', '...#wllllww#...', '...#wwwwwww#...', '...#########...'], { w: '#f4f4ec', l: '#c8c8c0', '#': '#9a9a90' }, 1, 1); },
    book(t) { ITEM_DRAW.tpl(t, ['', '', '...##########..', '..#bbbbbbbbbw#.', '..#bggbbbbbbw#.', '..#bbbbbbbbbw#.', '..#bbbbbbbbbw#.', '..#bbbbbbbbbw#.', '..#bbbbbbbbbw#.', '..#bbbbbbbbbw#.', '...##########..'], { b: '#8a4a1a', g: '#e0c050', w: '#f0f0e8', '#': '#4a2a0a' }, 1, 1); },
    compass(t, r, v) {
      ITEM_DRAW.tpl(t, ['', '', '.....######.....', '...##ffffff##...', '..#ffffffffff#..', '..#ffffffffff#..', '.#ffffffffffff#.', '.#ffffffffffff#.', '.#ffffffffffff#.', '.#ffffffffffff#.', '..#ffffffffff#..', '..#ffffffffff#..', '...##ffffff##...', '.....######.....'], { f: '#c8c8c8', '#': '#6a6a6a' });
      const a = (+v || 0) / 16 * Math.PI * 2;
      for (let k = -4; k <= 4; k++) { const x = Math.round(7.5 + Math.sin(a) * k * 0.9), y = Math.round(7.5 - Math.cos(a) * k * 0.9); t.px(x, y, k > 0 ? '#e02020' : '#404040'); }
    },
    clock(t, r, v) {
      const ph = (+v || 0) / 16;
      for (let y = 2; y < 14; y++) for (let x = 2; x < 14; x++) {
        const d = Math.hypot(x - 7.5, y - 7.5);
        if (d > 6) continue;
        if (d > 5.1) { t.px(x, y, '#b08a13'); continue; }
        const a = Math.atan2(x - 7.5, -(y - 7.5)) / (Math.PI * 2) + 0.5;      // 0..1 по кругу
        const day = ((a + ph) % 1) < 0.5;
        t.px(x, y, day ? '#6ab8f0' : '#1a2450');
      }
      t.px(7, 3, '#f8e040'); t.px(8, 3, '#f8e040'); t.px(7, 4, '#f8e040'); t.px(8, 4, '#f8e040');
    },
    map(t, r, filled) {
      ITEM_DRAW.tpl(t, ['', '..############..', '..#pppppppppp#..', '..#pppppppppp#..', '..#pppppppppp#..', '..#pppppppppp#..', '..#pppppppppp#..', '..#pppppppppp#..', '..#pppppppppp#..', '..#pppppppppp#..', '..#pppppppppp#..', '..#pppppppppp#..', '..############..'], { p: '#e8dcb0', '#': '#9a8a5a' });
      if (+filled) for (let k = 0; k < 30; k++) t.px(3 + ((r() * 10) | 0), 2 + ((r() * 10) | 0), ['#6a9a3a', '#3a6ab0', '#b8a868'][(r() * 3) | 0]);
    },
    ender_pearl(t) {
      for (let y = 3; y < 13; y++) for (let x = 3; x < 13; x++) { const d = Math.hypot(x - 7.5, y - 7.5); if (d < 5) t.px(x, y, d > 4.2 ? '#0a3a3a' : d < 2 ? '#2a8a7a' : (x + y) % 3 ? '#135a52' : '#1a6a60'); }
      t.px(6, 5, '#8ae8d8'); t.px(5, 6, '#6ad0c0');
    },
    fishing_rod(t, r, cast) {
      handle(t, 2, 13, 11);
      if (+cast) return;
      for (let y = 3; y < 14; y++) t.px(13, y, '#e8e8e8');
      t.px(13, 14, '#8a8a8a'); t.px(12, 14, '#8a8a8a');
    },
    fish(t, r, kind) {
      const pal = kind === 'salmon' ? { b: '#b04a3a', l: '#d87a5a', d: '#6a2a20', f: '#8a6a4a' } : { b: '#b89a6a', l: '#d8c49a', d: '#6a5a3a', f: '#8a7a5a' };
      if (kind && kind.startsWith('c')) { pal.b = '#a0662e'; pal.l = '#c8884a'; pal.d = '#5a3418'; pal.f = '#7a4a22'; }
      ITEM_DRAW.tpl(t, ['', '', '', '', '...........ff..', '..dddddd...f...', '.dbbbbbbd.ff...', 'd.bllbbbbdf....', 'dbbbbbbbbbf....', '.dbbbbbbd.ff...', '..dddddd...f...', '...........ff..'], { b: pal.b, l: pal.l, d: pal.d, f: pal.f });
    },
    boat(t) { ITEM_DRAW.tpl(t, ['', '', '', '', '', '', '#............#', '#pppppppppppp#', '#pPpppppppPpp#', '.#pppppppppp#.', '..##########..'], { p: '#a0773f', P: '#c09a5c', '#': '#5a4020' }, 1, 1); },
    minecart(t) { ITEM_DRAW.tpl(t, ['', '', '', '', '', '#............#', '#iiiiiiiiiiii#', '#iIiiiiiiiIii#', '#iiiiiiiiiiii#', '.############.', '..oo......oo..', '..oo......oo..'], { i: '#8a8a8a', I: '#c8c8c8', '#': '#3a3a3a', o: '#2a2a2a' }, 1, 1); },
    eye_of_ender(t) {
      for (let y = 3; y < 13; y++) for (let x = 3; x < 13; x++) { const d = Math.hypot(x - 7.5, y - 7.5); if (d < 5) t.px(x, y, d > 4.2 ? '#0a3a2a' : (x + y) % 3 ? '#2a9a6a' : '#3ab07a'); }
      for (let y = 5; y < 11; y++) { t.px(7, y, '#0a140e'); t.px(8, y, '#0a140e'); }
      t.px(5, 5, '#b8f8d8'); t.px(6, 4, '#8ae8b0');
    },
    lapis(t, r) { ITEM_DRAW.tpl(t, ['', '', '', '....##.##......', '...#bb#bb#.....', '..#bBbbbBb#....', '..#bbbbbbbb#...', '...#bBbbbb#....', '....#bbbbB#....', '.....#bb##.....', '......##.......'], { b: '#2a50c8', B: '#8aa8ff', '#': '#0a2070' }, 1, 1); },
    emerald(t) { ITEM_DRAW.tpl(t, ['', '', '......###......', '.....#ggg#.....', '....#gwggg#....', '...#gwgggGg#...', '...#ggggggg#...', '...#gggggGg#...', '....#gggGg#....', '.....#gGg#.....', '......###......'], { g: '#3ae070', w: '#c8ffd8', G: '#17a84a', '#': '#0a6a2a' }, 1, 1); },
    potion(t, r, spec) {
      const [c, splash] = (spec || '#3a74d0').split(',');
      const isSplash = splash === 's';
      ITEM_DRAW.tpl(t, ['', '......##......', '......gg......', '.....#gg#.....', '....#gggg#....', isSplash ? '...#lllll#....' : '...#gggggg#...', '..#llllllll#..', '..#lLllllll#..', '..#llllllll#..', '..#llllllll#..', '...#llllll#...', '....######....'], { g: '#c8e0f0', l: c, L: '#ffffff', '#': '#50607a' }, 1, 2);
    },
    glass_bottle(t) { ITEM_DRAW.tpl(t, ['', '......##......', '......gg......', '.....#gg#.....', '....#gggg#....', '...#gggggg#...', '..#gggggggg#..', '..#gLgggggg#..', '..#gggggggg#..', '..#gggggggg#..', '...#gggggg#...', '....######....'], { g: '#dfeef5', L: '#ffffff', '#': '#6a7a8a' }, 1, 2); },
    melon_slice(t) { ITEM_DRAW.tpl(t, ['', '', '', '', '..#..........#..', '..g#........#g..', '..grr#....#rrg..', '...grrr##rrrg...', '....grrrrrrg....', '.....ggggggg....', '......gggg......'], { g: '#5a9a2a', r: '#e83a3a', '#': '#2a1a1a' }); },
    glistering_melon(t) { ITEM_DRAW.melon_slice(t); for (const [x, y] of [[4, 5], [9, 7], [12, 4], [7, 9]]) t.px(x, y, '#ffe060'); },
    carrot(t) { for (let k = 0; k < 9; k++) { t.px(4 + k, 12 - k, '#f08a20'); t.px(5 + k, 12 - k, '#e07a10'); } for (const [x, y] of [[12, 2], [13, 1], [14, 3], [11, 1]]) t.px(x, y, '#4a9a30'); },
    golden_carrot(t) { for (let k = 0; k < 9; k++) { t.px(4 + k, 12 - k, '#f8d040'); t.px(5 + k, 12 - k, '#d8a820'); } for (const [x, y] of [[12, 2], [13, 1], [14, 3], [11, 1]]) t.px(x, y, '#f0e080'); },
    magma_cream(t, r) { ITEM_DRAW.tpl(t, ['', '', '', '', '.....####......', '....#oyoo#.....', '...#oooyoo#....', '...#ooyoooo#...', '...#ooooyo#....', '....#oooo#.....', '.....####......'], { o: '#e05a10', y: '#f8c820', '#': '#6a2a08' }, 1, 1); },
    slimeball(t) { ITEM_DRAW.tpl(t, ['', '', '', '', '.....####......', '....#gggg#.....', '...#gGggggg#...', '...#gggggGg#...', '...#ggGgggg#...', '....#gggggg#...', '.....######....'], { g: '#6ab84a', G: '#b8f09a', '#': '#3a7a2a' }); },
    flint_and_steel(t) {
      ITEM_DRAW.tpl(t, ['', '', '..####..........', '.#iiii#.........', '.#i##i#.........', '.#i#.#i#........', '..#..#ii#.......', '......#ii#......', '.......###......', '.........##.....', '........#ff#....', '.......#ffff#...', '.......#fbff#...', '........#ff#....', '.........##.....'], { i: '#b8b8b8', '#': '#3a3a3a', f: '#4a4a4a', b: '#7a7a7a' });
    },
    quartz(t) { ITEM_DRAW.tpl(t, ['', '', '', '.....##.........', '....#ww#........', '...#wwgw#.......', '...#wgww##......', '..#wwwgwww#.....', '..#gwwwwgw#.....', '...#wwgwwww#....', '....##wwgw#.....', '......####......'], { w: '#f4f0e8', g: '#d8d0c4', '#': '#9a9088' }); },
    nether_wart(t) { ITEM_DRAW.tpl(t, ['', '', '', '', '.....##.##......', '....#rr#rr#.....', '...#rRrrrRr#....', '...#rrrRrrr#....', '....#rrrrr#.....', '.....##s##......', '.......s........', '.......s........'], { r: '#b02a30', R: '#e04a50', s: '#6a1a1e', '#': '#5a1014' }); },
    blaze_rod(t) { for (let k = 0; k < 12; k++) { t.px(3 + k, 13 - k, '#f8c820'); t.px(4 + k, 13 - k, '#e89a10'); t.px(3 + k, 12 - k, '#fff080'); } },
    blaze_powder(t, r) { for (let k = 0; k < 44; k++) { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 5; t.px(Math.round(7.5 + Math.cos(a) * d * 1.1), Math.round(9 + Math.sin(a) * d * 0.7), ['#f8c820', '#e89a10', '#fff080', '#d06008'][(r() * 4) | 0]); } },
    ghast_tear(t) { ITEM_DRAW.tpl(t, ['', '', '', '.......#........', '......#w#.......', '.....#wbw#......', '....#wbbbw#.....', '....#bbbbb#.....', '....#bbwbb#.....', '.....#bbb#......', '......###.......'], { w: '#ffffff', b: '#c8e8f0', '#': '#7a9aa8' }); },
    gold_nugget(t) { ITEM_DRAW.tpl(t, ['', '', '', '', '', '......##........', '.....#gg#.......', '....#gyggg#.....', '....#ggggo#.....', '.....#gog#......', '......###.......'], { g: '#f5d13b', y: '#fff08a', o: '#b08a13', '#': '#7a5a0a' }); },
    nether_brick(t) { ITEM_DRAW.ingot(t, null, ['#4a2026', '#2a1014', '#6a3038']); },
    shield(t) {
      ITEM_DRAW.tpl(t, ['', '..############..', '..#pppppppppp#..', '..#pppppppppp#..', '..#ppppiipppp#..', '..#pppiiiippp#..', '..#pppiiiippp#..', '..#ppppiipppp#..', '..#pppppppppp#..', '...#pppppppp#...', '....#pppppp#....', '.....#pppp#.....', '......####......'], { p: '#9a7646', i: '#c8c8c8', '#': '#6a6a6a' });
    },
    bone(t) { for (let k = 0; k < 9; k++) t.px(4 + k, 11 - k, '#e8e4d8'); for (const [x, y] of [[3, 11], [4, 12], [12, 3], [13, 4], [3, 12], [13, 3]]) t.px(x, y, '#d8d4c8'); },
  };

  function buildItemAtlas(items) {
    const cols = 16, rows = Math.max(1, Math.ceil(items.length / cols));
    const c = document.createElement('canvas');
    c.width = cols * 16; c.height = rows * 16;
    const g = c.getContext('2d');
    items.forEach((it, i) => {
      const t = new Tile();
      for (let k = 0; k < 256; k++) t.d[k * 4 + 3] = 0;
      const r = rng(5000 + i * 131);
      const d = it.draw.split(':');
      ITEM_DRAW[d[0]](t, r, d[1]);
      g.putImageData(new ImageData(t.d, 16, 16), (i % cols) * 16, ((i / cols) | 0) * 16);
      it.itile = i;
    });
    return c;
  }

  // ---------- Значки для интерфейса ----------
  function tileCanvas(atlas, t) {
    const c = document.createElement('canvas'); c.width = c.height = 16;
    c.getContext('2d').drawImage(atlas, (t % C.ATLAS_COLS) * 16, ((t / C.ATLAS_COLS) | 0) * 16, 16, 16, 0, 0, 16, 16);
    return c;
  }
  function isoIcon(atlas, id) {
    const S = 64;                       // рисуем крупно (2 пикселя экрана на пиксель плитки), показываем 32
    const c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    const k = S / 32;
    const T = C.TEXF;
    // каждая грань рисуется на своём слое: затемнение не задевает соседнюю
    const faceTo = (tile, m, dark) => {
      const tmp = document.createElement('canvas'); tmp.width = tmp.height = S;
      const tg = tmp.getContext('2d'); tg.imageSmoothingEnabled = false;
      tg.setTransform(m[0] * k, m[1] * k, m[2] * k, m[3] * k, m[4] * k, m[5] * k);
      tg.drawImage(tileCanvas(atlas, tile), 0, 0);
      if (dark) { tg.setTransform(1, 0, 0, 1, 0, 0); tg.globalCompositeOperation = 'source-atop'; tg.fillStyle = `rgba(0,0,0,${dark})`; tg.fillRect(0, 0, S, S); }
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(tmp, 0, 0);
    };
    faceTo(T[id * 6 + 5], [15 / 16, 7 / 16, 0, 1, 1, 8], 0.22);        // левая (к зрителю +Z)
    faceTo(T[id * 6 + 1], [15 / 16, -7 / 16, 0, 1, 16, 15], 0.4);      // правая (+X)
    faceTo(T[id * 6 + 3], [15 / 16, 7 / 16, -15 / 16, 7 / 16, 16, 1], 0); // верх
    return c;
  }
  // Значок блока не во всю клетку (плита, ступени, забор, калитка, сундук): каждая коробка
  // рисуется своими гранями в той же проекции, что и кубик; сзади наперёд, снизу вверх
  function isoShapeIcon(atlas, id, shp) {
    const S = 64, k = S / 32;
    const c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    const tileOf = (bx, f) => (bx[6] ? C.T[bx[6]] : C.TEXF[id * 6 + f]);
    const face = (tile, m, sx, sy, w, h, dark) => {
      if (w <= 0 || h <= 0) return;
      const tmp = document.createElement('canvas'); tmp.width = tmp.height = S;
      const tg = tmp.getContext('2d'); tg.imageSmoothingEnabled = false;
      tg.setTransform(m[0] * k, m[1] * k, m[2] * k, m[3] * k, m[4] * k, m[5] * k);
      tg.drawImage(tileCanvas(atlas, tile), sx, sy, w, h, sx, sy, w, h);
      if (dark) { tg.setTransform(1, 0, 0, 1, 0, 0); tg.globalCompositeOperation = 'source-atop'; tg.fillStyle = `rgba(0,0,0,${dark})`; tg.fillRect(0, 0, S, S); }
      g.drawImage(tmp, 0, 0);
    };
    const boxes = shp.slice().sort((a, b) => (a[1] - b[1]) || ((a[0] + a[2]) - (b[0] + b[2])));
    for (const b of boxes) {
      const [x0, y0, z0, x1, y1, z1] = b;
      // экран: X = 16 + 15/16 (x - z), Y = 1 + 7/16 (x + z) + (16 - y)
      face(tileOf(b, 5), [15 / 16, 7 / 16, 0, 1, 16 - 15 / 16 * z1, 1 + 7 / 16 * z1], x0, 16 - y1, x1 - x0, y1 - y0, 0.22);
      face(tileOf(b, 1), [15 / 16, -7 / 16, 0, 1, 1 + 15 / 16 * x1, 8 + 7 / 16 * x1], 16 - z1, 16 - y1, z1 - z0, y1 - y0, 0.4);
      face(tileOf(b, 3), [15 / 16, 7 / 16, -15 / 16, 7 / 16, 16, 1 + 16 - y1], x0, z0, x1 - x0, z1 - z0, 0);
    }
    return c;
  }
  function flatIcon(src, sx, sy) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    g.drawImage(src, sx, sy, 16, 16, 0, 0, 64, 64);
    return c;
  }

  // Фактура кнопок и полосок (свой рисунок: серый камень с фаской)
  function buttonTexture(state) {
    const c = document.createElement('canvas'); c.width = 200; c.height = 20;
    const g = c.getContext('2d');
    const r = rng(state === 'hover' ? 7 : state === 'off' ? 9 : 5);
    const base = state === 'hover' ? [124, 138, 190] : state === 'off' ? [60, 60, 60] : [112, 112, 112];
    for (let y = 0; y < 20; y++) for (let x = 0; x < 200; x++) {
      const k = 0.9 + r() * 0.2;
      g.fillStyle = `rgb(${base[0] * k | 0},${base[1] * k | 0},${base[2] * k | 0})`;
      g.fillRect(x, y, 1, 1);
    }
    g.fillStyle = state === 'off' ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.35)'; g.fillRect(1, 1, 198, 1); g.fillRect(1, 1, 1, 17);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(1, 17, 198, 2); g.fillRect(197, 1, 2, 18);
    g.strokeStyle = state === 'hover' ? '#ffffff' : '#000000'; g.lineWidth = 1; g.strokeRect(0.5, 0.5, 199, 19);
    return c.toDataURL();
  }
  function darkTile() {
    const t = new Tile(); DRAW.dirt(t, rng(42));
    const c = document.createElement('canvas'); c.width = c.height = 16;
    c.getContext('2d').putImageData(new ImageData(t.d, 16, 16), 0, 0);
    return c.toDataURL();
  }

  // ---------- Надпись названия из пиксельных букв (своих) ----------
  const GLYPHS = {
    'К': ['1001', '1010', '1100', '1100', '1010', '1001', '1001'],
    'У': ['1001', '1001', '1001', '0111', '0001', '0001', '1110'],
    'Б': ['1111', '1000', '1000', '1110', '1001', '1001', '1110'],
    'И': ['1001', '1001', '1011', '1101', '1001', '1001', '1001'],
    'Ч': ['1001', '1001', '1001', '0111', '0001', '0001', '0001'],
    'Е': ['1111', '1000', '1000', '1110', '1000', '1000', '1111'],
    'С': ['0111', '1000', '1000', '1000', '1000', '1000', '0111'],
    'Й': ['0110', '1001', '1001', '1011', '1101', '1001', '1001', '1001'],   // 8 строк: кратка над буквой
    'М': ['10001', '11011', '10101', '10001', '10001', '10001', '10001'],
    'Р': ['1110', '1001', '1001', '1110', '1000', '1000', '1000'],
    ' ': ['00', '00', '00', '00', '00', '00', '00'],
  };
  function titleCanvas(text, px) {
    const letters = [...text];
    let w = 0;
    for (const ch of letters) w += (GLYPHS[ch] || GLYPHS[' '])[0].length + 1;
    const c = document.createElement('canvas');
    c.width = (w + 2) * px; c.height = 10 * px;
    const g = c.getContext('2d');
    const stone = new Tile(); DRAW.stone(stone, rng(3));
    let x0 = 1;
    const cellsOn = [];
    for (const ch of letters) {
      const gl = GLYPHS[ch] || GLYPHS[' '];
      const top = gl.length === 8 ? 0 : 1;
      for (let y = 0; y < gl.length; y++) for (let x = 0; x < gl[y].length; x++) if (gl[y][x] === '1') cellsOn.push([x0 + x, y + top]);
      x0 += gl[0].length + 1;
    }
    // объём: тёмный сдвиг вниз-вправо, потом лицо с каменной фактурой
    for (const [x, y] of cellsOn) { g.fillStyle = '#1b1b1b'; g.fillRect(x * px + px * 0.35, y * px + px * 0.55, px, px); }
    for (const [x, y] of cellsOn) {
      for (let sy = 0; sy < px; sy++) for (let sx = 0; sx < px; sx++) {
        const [r, gg, b] = stone.get((x * px + sx) % 16, (y * px + sy) % 16);
        const light = sy < px * 0.18 ? 1.25 : sy > px * 0.82 ? 0.75 : 1;
        g.fillStyle = `rgb(${Math.min(255, r * light) | 0},${Math.min(255, gg * light) | 0},${Math.min(255, b * light) | 0})`;
        g.fillRect(x * px + sx, y * px + sy, 1, 1);
      }
    }
    return c;
  }

  // Пламя в окне печи: пиксельный огонёк (горящий) и его серый контур (печь не горит)
  function flameIcon(lit) {
    const rows = ['......#......', '.....###.....', '....#####....', '....#####.#..', '...###o###...', '..####o####..', '..###ooo###..', '.###ooyoo###.', '.##ooyyyoo##.', '.#ooyyyyyoo#.', '.#ooyyyyyoo#.', '..#oooyooo#..', '...#######...'];
    const c = document.createElement('canvas'); c.width = c.height = 13;
    const g = c.getContext('2d');
    const pal = lit ? { '#': '#e0400a', o: '#ff8a10', y: '#ffe060' } : { '#': '#6f6f6f', o: '#7b7b7b', y: '#7b7b7b' };
    rows.forEach((r, y) => { for (let x = 0; x < 13; x++) if (pal[r[x]]) { g.fillStyle = pal[r[x]]; g.fillRect(x, y, 1, 1); } });
    return c.toDataURL();
  }
  // отдельная картинка предмета (компас и часы рисуются заново по положению стрелки)
  function itemTile(draw, seed) {
    const t = new Tile();
    for (let k = 0; k < 256; k++) t.d[k * 4 + 3] = 0;
    const d = draw.split(':');
    ITEM_DRAW[d[0]](t, rng(seed || 5), d[1]);
    const c = document.createElement('canvas'); c.width = c.height = 16;
    c.getContext('2d').putImageData(new ImageData(t.d, 16, 16), 0, 0);
    return c;
  }
  VX.tex = { itemTile, flameIcon, buildBlockAtlas, buildItemAtlas, isoIcon, isoShapeIcon, flatIcon, tileCanvas, drawCracks, buttonTexture, darkTile, titleCanvas, Tile, DRAW };
})();
