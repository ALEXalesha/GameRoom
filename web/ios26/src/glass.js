// ================================================================
// Жидкое стекло. Техника из проекта LiquidGlass (index.html): SVG-фильтр внутри backdrop-filter.
// Для формы элемента строится поле расстояний (SDF) скруглённого прямоугольника или суперэллипса,
// из него профиль высоты кромки h(t) = sqrt(1 - (1 - t)^2), а из профиля три текстуры:
//   disp  - R и G смещение фона, B кольцо кромки (feDisplacementMap + маска насыщенного свечения);
//   spec  - белый с альфой блика (Блинн-Фонг + френель по нормали из того же поля высот);
//   shade - чёрный с альфой самозатенения.
// Цепочка фильтра: три прохода смещения с разным масштабом для R, G, B (дисперсия), кривая
// читаемости, насыщенное кольцо по краю. Масштаб отрицательный: кромка тянет внутрь то, что снаружи.
// Текстур три, а не четыре: каждый toDataURL стоит ~1 мс независимо от размера.
// Кэш по форме (ширина, высота, радиус, фаска, вид угла): одинаковые кнопки пекутся один раз,
// повторное открытие панели не печёт ничего. Печь - в простое главного потока, форма за формой.
// Слабое устройство, ?lite, «понижение прозрачности» или браузер без SVG в backdrop-filter -
// дешёвое стекло: размытие, насыщенность и нарисованная кромка.
// ================================================================
const LG = (() => {
  // ---------- пиксельная математика (как в LiquidGlass) ----------
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function byte(v) { return v < 0 ? 0 : v > 255 ? 255 : v | 0; }
  // n-норма: n=2 - круглый угол, n=4 - непрерывный угол (суперэллипс), как у значков
  function corner(a, b, n) {
    if (a <= 0) return b <= 0 ? 0 : b;
    if (b <= 0) return a;
    if (n === 2) return Math.sqrt(a * a + b * b);
    return Math.pow(Math.pow(a, n) + Math.pow(b, n), 1 / n);
  }
  function sdf(px, py, hw, hh, r, n) {
    const qx = Math.abs(px) - (hw - r), qy = Math.abs(py) - (hh - r);
    return corner(qx, qy, n) + Math.min(Math.max(qx, qy), 0) - r;
  }
  function pow46(x) { const a = x * x, b = a * a, c = b * b, d = c * c, e = d * d; return e * c * b * a; }
  function pow26(x) { const a = x * x, b = a * a, c = b * b, d = c * c; return d * c * a; }

  // поле расстояний прямоугольной формы в пикселях карты
  function rectField(cw, ch, r, n) {
    const D = new Float32Array(cw * ch), hw = cw / 2, hh = ch / 2;
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) D[y * cw + x] = sdf(x + 0.5 - hw, y + 0.5 - hh, hw, hh, r, n);
    return D;
  }
  // поле расстояний произвольной маски (буквы часов): двухпроходный фаскный обход 3-4
  function maskField(alpha, cw, ch) {
    const BIG = 1e9, d = new Float32Array(cw * ch);
    for (let i = 0; i < d.length; i++) d[i] = alpha[i] >= 128 ? BIG : 0;
    const at = (x, y) => (x < 0 || y < 0 || x >= cw || y >= ch) ? 0 : d[y * cw + x];
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) { const i = y * cw + x; if (!d[i]) continue; d[i] = Math.min(d[i], at(x - 1, y) + 3, at(x, y - 1) + 3, at(x - 1, y - 1) + 4, at(x + 1, y - 1) + 4); }
    for (let y = ch - 1; y >= 0; y--) for (let x = cw - 1; x >= 0; x--) { const i = y * cw + x; if (!d[i]) continue; d[i] = Math.min(d[i], at(x + 1, y) + 3, at(x, y + 1) + 3, at(x + 1, y + 1) + 4, at(x - 1, y + 1) + 4); }
    const D = new Float32Array(cw * ch);
    for (let i = 0; i < D.length; i++) D[i] = d[i] ? -(d[i] / 3) + 0.5 : 0.5 + (1 - alpha[i] / 255);
    return D;
  }

  // Текстуры из поля расстояний D (отрицательно внутри). Тело - bakeFields из LiquidGlass,
  // только поле приходит готовым: прямоугольник или буквы.
  function bakeFields(cw, ch, D, bevel, dpr, lightDeg, opp) {
    if (opp === undefined) opp = 0.28;   // вторая, тусклая кромка со стороны, противоположной свету
    const bv = Math.max(2, bevel * dpr);
    const H = new Float32Array(cw * ch), T = new Float32Array(cw * ch), A = new Float32Array(cw * ch);
    const deepLo = new Int32Array(ch), deepHi = new Int32Array(ch);
    for (let y = 0; y < ch; y++) {
      let lo = -1, hi = -2;
      for (let x = 0; x < cw; x++) {
        const i = y * cw + x, d = D[i], t = clamp(-d / bv, 0, 1);
        T[i] = t;
        H[i] = t >= 1 ? 1 : (t <= 0 ? 0 : Math.sqrt(2 * t - t * t));
        A[i] = clamp(-d / dpr + 0.5, 0, 1);
        if (t >= 1) { if (lo < 0) lo = x; hi = x; }
      }
      deepLo[y] = lo; deepHi[y] = hi;
    }
    const rad = lightDeg * Math.PI / 180;
    const lx = Math.cos(rad), ly = -Math.sin(rad), lz = 0.60;
    const ll = Math.sqrt(lx * lx + ly * ly + lz * lz);
    const Lx = lx / ll, Ly = ly / ll, Lz = lz / ll;
    const hh3 = Math.sqrt(Lx * Lx + Ly * Ly + (Lz + 1) * (Lz + 1));
    const Hx = Lx / hh3, Hy = Ly / hh3, Hz = (Lz + 1) / hh3;
    const Fx = -Lx, Fy = -Ly, Fz = Lz;
    const fh = Math.sqrt(Fx * Fx + Fy * Fy + (Fz + 1) * (Fz + 1));
    const Gx = Fx / fh, Gy = Fy / fh, Gz = (Fz + 1) / fh;
    const disp = new ImageData(cw, ch), spec = new ImageData(cw, ch), shade = new ImageData(cw, ch);
    const dp = disp.data, sp = spec.data, sh = shade.data;
    const SLOPE = 0.34, NSTR = 1.35, EDGE = clamp(2.2 * dpr / bv, 0.03, 0.45);
    const flatLine = Math.exp(-(1 / EDGE) * Math.sqrt(1 / EDGE) * 2.4);
    const flatSpec = byte(clamp(pow46(Math.max(Hz, 0)) * 1.55 + pow26(Math.max(Gz, 0)) * 0.40 + flatLine * (0.24 + 0.66 * clamp(Lz, 0, 1) + opp * clamp(Fz, 0, 1)), 0, 1) * 255);
    const flatShade = byte(clamp(flatLine * Math.max(-Lz, 0) * 0.55, 0, 1) * 255);
    for (let y = 0; y < ch; y++) {
      const yUp = y > 0 ? y - 1 : 0, yDn = y < ch - 1 ? y + 1 : ch - 1;
      let flatLo = -1, flatHi = -2;
      if (deepLo[y] >= 0 && deepLo[yUp] >= 0 && deepLo[yDn] >= 0) {
        flatLo = Math.max(deepLo[y], deepLo[yUp], deepLo[yDn]) + 1;
        flatHi = Math.min(deepHi[y], deepHi[yUp], deepHi[yDn]) - 1;
      }
      for (let x = 0; x < cw; x++) {
        // плоская середина: наклон, блик и кольцо нулевые - одно значение на весь отрезок
        if (x >= flatLo && x <= flatHi) {
          for (; x <= flatHi; x++) {
            const i = (y * cw + x) * 4;
            dp[i] = 128; dp[i + 1] = 128; dp[i + 2] = 0; dp[i + 3] = 255;
            sp[i] = sp[i + 1] = sp[i + 2] = 255; sp[i + 3] = flatSpec;
            sh[i] = sh[i + 1] = sh[i + 2] = 0; sh[i + 3] = flatShade;
          }
          x--;
          continue;
        }
        const xl = H[y * cw + (x > 0 ? x - 1 : 0)], xr = H[y * cw + (x < cw - 1 ? x + 1 : cw - 1)];
        const yt = H[yUp * cw + x], yb = H[yDn * cw + x];
        const gx = (xr - xl) * 0.5 * bv, gy = (yb - yt) * 0.5 * bv;
        const i = (y * cw + x) * 4;
        dp[i] = byte(128 + 127 * Math.tanh(gx * SLOPE));
        dp[i + 1] = byte(128 + 127 * Math.tanh(gy * SLOPE));
        dp[i + 3] = 255;
        const nx = -gx * NSTR, ny = -gy * NSTR, nl = Math.sqrt(nx * nx + ny * ny + 1);
        const Nx = nx / nl, Ny = ny / nl, Nz = 1 / nl;
        const ndh = Nx * Hx + Ny * Hy + Nz * Hz, ndl = Nx * Lx + Ny * Ly + Nz * Lz;
        const ndg = Nx * Gx + Ny * Gy + Nz * Gz, ndf = Nx * Fx + Ny * Fy + Nz * Fz;
        const fres = Math.pow(1 - Nz, 2.6);
        const k = y * cw + x, inside = A[k], u = T[k] / EDGE;
        const line = Math.exp(-u * Math.sqrt(u) * 2.4);
        const hi = clamp(pow46(Math.max(ndh, 0)) * 1.55 + pow26(Math.max(ndg, 0)) * 0.40 + line * (0.24 + 0.66 * clamp(ndl, 0, 1) + opp * clamp(ndf, 0, 1)) + fres * 0.09, 0, 1) * inside;
        const lo = clamp(line * Math.max(-ndl, 0) * 0.55 + fres * 0.12, 0, 1) * inside;
        sp[i] = sp[i + 1] = sp[i + 2] = 255; sp[i + 3] = byte(hi * 255);
        sh[i] = sh[i + 1] = sh[i + 2] = 0; sh[i + 3] = byte(lo * 255);
        dp[i + 2] = byte(clamp(fres * 1.7, 0, 1) * inside * 255);
      }
    }
    return { cw, ch, disp, spec, shade };
  }

  // ---------- режим ----------
  const NS = 'http://www.w3.org/2000/svg';
  const DPR = Math.min(2, window.devicePixelRatio || 1);
  const LIGHT = 118;   // свет сверху слева, как у системного стекла
  const SQUIRCLE = typeof CSS !== 'undefined' && CSS.supports('corner-shape', 'squircle');
  const SVG_OK = typeof CSS !== 'undefined' && CSS.supports('backdrop-filter', 'url(#a)') && !/^((?!chrome|chromium|android).)*safari/i.test(navigator.userAgent);
  const q = location.search + location.hash;
  // «понижение прозрачности» в системе - плотная подложка; слабое устройство или ?lite - дешёвое стекло
  const SOLID = !!(window.matchMedia && matchMedia('(prefers-reduced-transparency: reduce)').matches);
  const WEAK = /[?&#]lite\b/.test(q) || (navigator.hardwareConcurrency || 8) <= 2 || (navigator.deviceMemory && navigator.deviceMemory <= 2);
  const BASE = SVG_OK && !WEAK && !SOLID ? 'full' : 'lite';
  // «Меньше стекла» в настройках - текстуры не пекутся вовсе
  const fewer = () => document.body.classList.contains('no-glass') || (typeof S !== 'undefined' && S.glass === false);
  let mode = BASE === 'full' && !fewer() ? 'full' : 'lite';
  document.documentElement.classList.toggle('lg-lite', mode === 'lite');
  document.documentElement.classList.toggle('lg-solid', SOLID);

  // Оптика по видам. refr - сила преломления (пкс), ab - дисперсия, rim - свечение кромки,
  // leg - кривая читаемости (feComponentTransfer - самая дорогая стадия, только там, где на стекле текст),
  // blur/sat - размытие и насыщенность фона, spec/shade - сила блика и самозатенения,
  // opp - вторая кромка со стороны, противоположной свету (у кнопок пункта управления - почти как первая).
  const PRESETS = {
    dock: { bevel: 14, refr: 40, ab: 0.08, rim: 0.30, leg: 0, blur: 1.5, sat: 180, spec: 0.8, shade: 0.2, opp: 0.45 },
    widget: { bevel: 12, refr: 32, ab: 0.08, rim: 0.25, leg: 0.28, blur: 8, sat: 165, spec: 0.7, shade: 0.18, opp: 0.45 },
    tile: { bevel: 5, refr: 16, ab: 0.10, rim: 0, leg: 0, blur: 1, sat: 170, spec: 0.75, shade: 0.08, opp: 0.75 },
    // крупные модули пункта управления: самая большая площадь фильтра, дисперсия на плоском стекле почти не видна - один проход
    module: { bevel: 6, refr: 18, ab: 0, rim: 0, leg: 0, blur: 1, sat: 170, spec: 0.7, shade: 0.08, opp: 0.7 },
    button: { bevel: 9, refr: 22, ab: 0.10, rim: 0.30, leg: 0, blur: 2, sat: 175, spec: 0.75, shade: 0.15, opp: 0.55 },
    card: { bevel: 10, refr: 26, ab: 0.08, rim: 0.20, leg: 0.30, blur: 12, sat: 170, spec: 0.65, shade: 0.15, opp: 0.45 },
    panel: { bevel: 14, refr: 40, ab: 0.08, rim: 0.25, leg: 0.18, blur: 5, sat: 170, spec: 0.7, shade: 0.18, opp: 0.45 },
    bar: { bevel: 11, refr: 28, ab: 0.08, rim: 0.25, leg: 0.22, blur: 6, sat: 185, spec: 0.7, shade: 0.15, opp: 0.5 },
    glyph: { bevel: 7, refr: 14, ab: 0.12, rim: 0.35, leg: 0, blur: 0.6, sat: 190, spec: 0.5, shade: 0.08, opp: 0.6 },
  };
  for (const k in PRESETS) PRESETS[k].name = k;
  const FILTER_CAP = 48;

  const holder = document.createElementNS(NS, 'svg');
  holder.setAttribute('aria-hidden', 'true');
  holder.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
  const defs = document.createElementNS(NS, 'defs');
  holder.appendChild(defs);
  document.body.appendChild(holder);

  const maps = new Map();      // форма|вид -> { disp, spec, shade }
  const filters = new Map();   // форма|вид -> id фильтра
  const state = new WeakMap(); // элемент -> { p, key, applied, wall, fid }
  const items = new Set();
  const waiting = new Set();   // элементы, которым нужна выпечка
  const stats = { bakes: 0, filters: 0, bakeMs: 0 };
  let fid = 0, pumping = 0;

  function encode(img, k) {
    if (k !== undefined && k !== 1) { const d = img.data; for (let i = 3; i < d.length; i += 4) d[i] = d[i] * k; }
    const cv = document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    cv.getContext('2d').putImageData(img, 0, 0);
    return cv.toDataURL();
  }
  function bakeShape(w, h, r, bevel, n, p) {
    const t0 = performance.now();
    let dpr = DPR;
    if (w * h * dpr * dpr > 4e5) dpr = Math.sqrt(4e5 / (w * h));   // крупная панель - карта грубее, бюджет пикселей
    const cw = Math.max(4, Math.round(w * dpr)), ch = Math.max(4, Math.round(h * dpr));
    const f = bakeFields(cw, ch, rectField(cw, ch, Math.min(r, Math.min(w, h) / 2) * dpr, n), bevel, dpr, LIGHT, p.opp);
    const m = { disp: encode(f.disp), spec: encode(f.spec, p.spec), shade: encode(f.shade, p.shade) };
    stats.bakes++; stats.bakeMs += performance.now() - t0;
    return m;
  }

  // ---------- фильтр ----------
  const ONLY_R = '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0';
  const ONLY_G = '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0';
  const ONLY_B = '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0';
  // кривая читаемости: поднимает тёмное и прижимает светлое, белый текст держит контраст
  const CALM_FROM = [0.00, 0.20, 0.40, 0.60, 0.80, 1.00];
  const CALM_TO = [0.10, 0.26, 0.42, 0.56, 0.68, 0.78];
  const calmTable = (a) => CALM_FROM.map((v, i) => v + (CALM_TO[i] - v) * a);
  function filterMarkup(id, disp, w, h, p) {
    const s = -p.refr, ab = p.ab, sel = 'xChannelSelector="R" yChannelSelector="G"';
    let body = '<feImage href="' + disp + '" x="0" y="0" width="' + w + '" height="' + h + '" preserveAspectRatio="none" result="map"/>';
    if (!ab) body += '<feDisplacementMap in="SourceGraphic" in2="map" scale="' + s.toFixed(2) + '" ' + sel + ' result="ref"/>';
    else body +=
      '<feDisplacementMap in="SourceGraphic" in2="map" scale="' + (s * (1 + ab)).toFixed(2) + '" ' + sel + ' result="dR"/>' +
      '<feColorMatrix in="dR" type="matrix" values="' + ONLY_R + '" result="cR"/>' +
      '<feDisplacementMap in="SourceGraphic" in2="map" scale="' + s.toFixed(2) + '" ' + sel + ' result="dG"/>' +
      '<feColorMatrix in="dG" type="matrix" values="' + ONLY_G + '" result="cG"/>' +
      '<feDisplacementMap in="SourceGraphic" in2="map" scale="' + (s * (1 - ab)).toFixed(2) + '" ' + sel + ' result="dB"/>' +
      '<feColorMatrix in="dB" type="matrix" values="' + ONLY_B + '" result="cB"/>' +
      '<feComposite in="cR" in2="cG" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="cRG"/>' +
      '<feComposite in="cRG" in2="cB" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="ref"/>';
    let last = 'ref';
    if (p.leg > 0) {
      const f = 'type="table" tableValues="' + calmTable(p.leg).map((v) => v.toFixed(4)).join(' ') + '"';
      body += '<feComponentTransfer in="ref" result="calm"><feFuncR ' + f + '/><feFuncG ' + f + '/><feFuncB ' + f + '/></feComponentTransfer>';
      last = 'calm';
    }
    if (p.rim > 0) {
      body += '<feColorMatrix in="map" type="matrix" result="ring" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 1 0 0"/>' +
        '<feColorMatrix in="' + last + '" type="saturate" values="' + (1 + p.rim * 2.4).toFixed(2) + '" result="vivid"/>' +
        '<feComposite in="vivid" in2="ring" operator="in" result="glow"/>' +
        '<feComposite in="glow" in2="' + last + '" operator="arithmetic" k1="0" k2="' + (p.rim * 0.7).toFixed(2) + '" k3="1" k4="0" result="lit"/>';
    }
    // область фильтра - только докуда достаёт смещение: половина масштаба (канал 0..1 вокруг 0.5) с дисперсией
    const pad = Math.ceil(p.refr * (1 + p.ab) / 2 + p.blur * 3 + 3);
    return '<filter id="' + id + '" filterUnits="userSpaceOnUse" x="' + (-pad) + '" y="' + (-pad) + '" width="' + (w + pad * 2) + '" height="' + (h + pad * 2) + '" color-interpolation-filters="sRGB">' + body + '</filter>';
  }
  // фильтров в документе не больше FILTER_CAP: те, на которые не ссылается ни один элемент, уходят
  function pruneFilters() {
    const used = new Set();
    for (const el of items) { const st = state.get(el); if (st && st.fid && el.isConnected) used.add(st.fid); }
    for (const [k, id] of filters) if (!used.has(id)) { const n = document.getElementById(id); if (n) n.remove(); filters.delete(k); }
  }
  function filterFor(key, p, m, w, h) {
    let id = filters.get(key);
    if (id && document.getElementById(id)) return id;
    if (filters.size >= FILTER_CAP) pruneFilters();
    id = 'lgf' + (fid++);
    const node = new DOMParser().parseFromString('<svg xmlns="' + NS + '">' + filterMarkup(id, m.disp, w, h, p) + '</svg>', 'image/svg+xml').querySelector('filter');
    defs.appendChild(document.importNode(node, true));
    filters.set(key, id);
    stats.filters++;
    return id;
  }

  // ---------- элементы ----------
  function metrics(el) {
    const w = el.offsetWidth, h = el.offsetHeight;
    if (!w || !h) return null;
    const cs = getComputedStyle(el);
    const raw = cs.borderTopLeftRadius;
    let r = raw.endsWith('%') ? parseFloat(raw) / 100 * Math.min(w, h) : parseFloat(raw) || 0;
    r = Math.min(r, Math.min(w, h) / 2);
    const capsule = r >= Math.min(w, h) / 2 - 0.6;
    el.classList.toggle('capsule', capsule);
    const n = SQUIRCLE && !capsule && cs.getPropertyValue('corner-shape').trim() !== 'round' ? 4 : 2;
    return { w, h, r, n };
  }
  const cheapOf = (p) => 'blur(' + Math.max(8, p.blur + 6) + 'px) saturate(' + p.sat + '%)';
  function setBF(el, v) { el.style.backdropFilter = v; el.style.webkitBackdropFilter = v; }
  function sync(el) {
    const st = state.get(el);
    if (!st || !el.isConnected) return;
    const m = metrics(el);
    if (!m) return;
    const bevel = Math.min(st.p.bevel, Math.min(m.w, m.h) / 2.2);
    const key = [m.w, m.h, m.r.toFixed(1), bevel.toFixed(1), m.n, DPR, st.p.name].join(':');
    if (st.wall) tone(el);
    if (key === st.key && st.applied === mode) return;
    st.key = key; st.m = m; st.bevel = bevel;
    if (mode !== 'full') {
      setBF(el, cheapOf(st.p)); el.style.removeProperty('--lg-spec'); el.style.removeProperty('--lg-shade');
      st.applied = 'lite'; st.fid = ''; return;
    }
    const hit = maps.get(key);
    if (hit) { apply(el, st, hit); return; }
    // пока карты пекутся, элемент уже читается как стекло - обычным размытием
    if (st.applied !== 'full') setBF(el, cheapOf(st.p));
    waiting.add(el);
    pump();
  }
  function apply(el, st, m) {
    const id = filterFor(st.key, st.p, m, st.m.w, st.m.h);
    st.fid = id;
    el.style.setProperty('--lg-spec', 'url("' + m.spec + '")');
    el.style.setProperty('--lg-shade', 'url("' + m.shade + '")');
    setBF(el, 'blur(' + st.p.blur + 'px) saturate(' + st.p.sat + '%) url(#' + id + ')');
    st.applied = 'full';
    el.dataset.lgf = id;
  }
  // выпечка в простое: по одной форме, пока в кадре есть время; пока что-то едет - ждём
  function pump() {
    if (pumping || !waiting.size) return;
    const run = () => {
      pumping = 0;
      if (document.querySelector('.lg-moving, .lg-under') || relQ.length) { pumping = setTimeout(() => { pumping = 0; pump(); }, 120); return; }
      const until = performance.now() + 6;
      let baked = 0;
      for (const el of [...waiting]) {
        const st = state.get(el);
        if (!st || !el.isConnected || !st.m || mode !== 'full') { waiting.delete(el); continue; }
        if (!maps.has(st.key)) {
          if (baked && performance.now() > until) break;
          baked++;
          if (maps.size > 80) maps.clear();
          maps.set(st.key, bakeShape(st.m.w, st.m.h, st.m.r, st.bevel, st.m.n, st.p));
        }
        waiting.delete(el);
        // все, кто ждёт ту же форму, получают её сразу
        for (const o of [...waiting]) { const so = state.get(o); if (so && so.key === st.key) { apply(o, so, maps.get(st.key)); waiting.delete(o); } }
        apply(el, st, maps.get(st.key));
      }
      if (waiting.size) pump();
    };
    pumping = window.requestIdleCallback ? requestIdleCallback(run, { timeout: 120 }) : setTimeout(run, 16);
  }
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver((es) => es.forEach((e) => sync(e.target))) : null;

  function add(el, preset, opts) {
    if (!el || state.has(el)) return;
    const p = PRESETS[preset] || PRESETS.card;
    state.set(el, { p, key: '', applied: '', wall: !!(opts && opts.wall), fid: '' });
    items.add(el);
    el.classList.add('lg');
    el.dataset.lg = p.name;
    el.style.setProperty('--lg-cheap', cheapOf(p));
    if (ro) ro.observe(el);
    sync(el);
  }
  // «Меньше стекла» переключили - стекло пересобирается в нужном режиме
  function refresh() {
    const m = BASE === 'full' && !fewer() ? 'full' : 'lite';
    if (m === mode) return;
    mode = m;
    document.documentElement.classList.toggle('lg-lite', mode === 'lite');
    for (const el of items) { const st = state.get(el); if (st) st.key = ''; sync(el); }
  }

  // ---------- автоматическая регистрация ----------
  const AUTO = [];
  function scan(root) {
    if (!root || root.nodeType !== 1) return;
    for (const [sel, preset, opts] of AUTO) {
      if (root.matches(sel)) add(root, preset, opts);
      root.querySelectorAll(sel).forEach((e) => add(e, preset, opts));
    }
  }
  const mo = new MutationObserver((list) => {
    for (const r of list) r.addedNodes.forEach(scan);
    for (const el of items) if (!el.isConnected) { items.delete(el); waiting.delete(el); if (ro) ro.unobserve(el); }
  });
  function auto(rules) { AUTO.push(...rules); scan(document.body); mo.observe(document.body, { childList: true, subtree: true }); }

  // ---------- тон: стекло отвечает на то, что под ним ----------
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  function calm(c, leg) {
    if (!leg) return c;
    const t = calmTable(leg);
    return c.map((v) => { const x = v / 255 * 5, i = Math.min(4, Math.floor(x)); return (t[i] + (t[i + 1] - t[i]) * (x - i)) * 255; });
  }
  // Подбор подложки: белый текст на тёмной дымке или тёмный на светлой - что требует меньше дымки
  // для контраста на самом неудобном участке фона. Запас до 5.6: под стеклом фон ещё насыщен и преломлён.
  function solve(cells, leg, darkPref) {
    const W = 1, D = 0.0122, need = 5.6;
    const bg = cells.map((c) => calm(c, leg));
    let aw = 1, ad = 1;
    for (let a = 0; a <= 0.86; a += 0.02) { const mx = Math.max(...bg.map((c) => lum(c.map((v) => v * (1 - a))))); if (ratio(W, mx) >= need) { aw = a; break; } }
    for (let a = 0; a <= 0.86; a += 0.02) { const mn = Math.min(...bg.map((c) => lum(c.map((v) => v * (1 - a) + 255 * a)))); if (ratio(mn, D) >= need) { ad = a; break; } }
    const light = darkPref ? ad + 0.12 < aw : !(aw + 0.12 < ad);
    return light ? { tone: 'light', a: ad } : { tone: 'dark', a: aw };
  }
  // место на экране телефона по раскладке, без преобразований: баннер ещё едет, а тон нужен для того, где он встанет
  function layoutRect(el) {
    const s = document.getElementById('screen');
    let x = 0, y = 0, e = el;
    while (e && e !== s) { x += e.offsetLeft; y += e.offsetTop; e = e.offsetParent; }
    return { x, y, w: el.offsetWidth, h: el.offsetHeight };
  }
  function tone(el) {
    const st = state.get(el);
    if (!st || !window.Wall || !Wall.ready() || !el.offsetWidth) return;
    const cells = Wall.sample(layoutRect(el));
    if (!cells.length) return;
    const t = solve(cells, mode === 'full' ? st.p.leg : 0, document.body.classList.contains('dark'));
    el.dataset.tone = t.tone;
    // на стекле с текстом подложка плотнее расчётной: под буквами ещё самозатенение и втянутый с краёв фон
    const a = st.p.leg > 0 ? Math.min(0.9, t.a + 0.15) : t.a;
    el.style.setProperty('--lg-tint', t.tone === 'light' ? 'rgba(255,255,255,' + Math.max(0.16, a).toFixed(2) + ')' : 'rgba(0,0,0,' + Math.max(0.06, a).toFixed(2) + ')');
  }
  function retone() { for (const el of items) { const st = state.get(el); if (st && st.wall) tone(el); } }

  // ---------- движение ----------
  // Пока панель едет, её стекло - размытие с подкраской (lg-moving), а стекло под ней - только подкраска
  // (lg-under): цепочка с картой смещения считается на процессоре, и любое движение в слое заставляет
  // пересчитать её у всех стёкол каждый кадр. Когда встало, стекло возвращается одним шагом в следующем кадре.
  // Возврат по одному-два за кадр проверен и отвергнут замером: каждый шаг заново считает уже включённые
  // цепочки (их фон меняется вместе с соседом), и вместо одного тяжёлого кадра выходит несколько,
  // а процессора уходит на треть больше (3 открытия пункта управления: 3.9 с против 3.1 с). perFrame можно задать.
  const timers = new Map();
  const relQ = [];
  let relRaf = 0, perFrame = Infinity;
  function relStep() {
    relRaf = 0;
    relQ.splice(0, perFrame).forEach((e) => e.classList.remove('lg-hold'));
    if (relQ.length) relRaf = requestAnimationFrame(relStep);
    else pump();
  }
  function release(el, cls) {
    if (!el.classList.contains(cls)) return;
    for (const e of items) {
      const st = state.get(e);
      if ((e === el || el.contains(e)) && st && st.applied === 'full' && !e.classList.contains('lg-hold')) { e.classList.add('lg-hold'); relQ.push(e); }
    }
    el.classList.remove(cls);
    if (relQ.length && !relRaf) relRaf = requestAnimationFrame(relStep);
  }
  function hold(el, cls, ms) {
    if (!el) return;
    el.classList.add(cls);
    const k = cls + ':' + (el.id || ''), t = timers.get(el) || {};
    clearTimeout(t[cls]);
    t[cls] = setTimeout(() => release(el, cls), ms);
    timers.set(el, t);
  }
  const moving = (el, ms) => hold(el, 'lg-moving', ms);
  const under = (el, ms) => hold(el, 'lg-under', ms);

  // Заранее испечь формы скрытой страницы: на время замера она видима, но невидима глазу
  function prewarm(root) {
    if (!root || mode !== 'full') return;
    root.classList.add('lg-measure');
    for (const el of items) if (root.contains(el)) sync(el);
    root.classList.remove('lg-measure');
  }

  // Стеклянные буквы (часы блокировки): поле расстояний строится по маске самих букв
  const glyphCache = new Map();
  function glyphs(alpha, cw, ch, w, h, key) {
    if (mode !== 'full') return null;
    let g = glyphCache.get(key);
    if (g) return clockFilter(g);
    const t0 = performance.now(), dpr = cw / w, p = PRESETS.glyph;
    const f = bakeFields(cw, ch, maskField(alpha, cw, ch), p.bevel, dpr, LIGHT, p.opp);
    g = { disp: encode(f.disp), spec: encode(f.spec, p.spec), shade: encode(f.shade, p.shade), w, h, key };
    stats.bakes++; stats.bakeMs += performance.now() - t0;
    if (glyphCache.size > 6) glyphCache.clear();
    glyphCache.set(key, g);
    return clockFilter(g);
  }
  // у букв часов один узел фильтра: при смене времени он пересобирается с новой картой
  function clockFilter(g) {
    const old = document.getElementById('lg-clock');
    if (!old || old.dataset.key !== g.key) {
      const node = new DOMParser().parseFromString('<svg xmlns="' + NS + '">' + filterMarkup('lg-clock', g.disp, g.w, g.h, PRESETS.glyph) + '</svg>', 'image/svg+xml').querySelector('filter');
      const fresh = document.importNode(node, true);
      fresh.dataset.key = g.key;
      if (old) old.replaceWith(fresh); else defs.appendChild(fresh);
    }
    g.id = 'lg-clock';
    return g;
  }

  return {
    PRESETS, stats, add, auto, sync, tone, retone, moving, under, release, prewarm, glyphs, solve, refresh, bakeFields, rectField, maskField, layoutRect,
    get mode() { return mode; },
    get perFrame() { return perFrame; }, set perFrame(n) { perFrame = n === Infinity ? n : Math.max(1, n | 0); },
    // готово - значит видно полное стекло: карты на месте и фильтр действует (не едет, не закрыт панелью)
    ready: (el) => { const st = el && state.get(el); return !!(st && st.applied === mode && (mode !== 'full' || getComputedStyle(el).backdropFilter.includes('url('))); },
    idle: () => waiting.size === 0 && !pumping && !relQ.length,
    resyncAll: () => items.forEach(sync),
  };
})();
