// ================================================================
// Обои в духе iOS 26: слои изогнутых полупрозрачных «стёкол» с яркой кромкой поверх глубокого фона.
// Рисуются на холсте (сети нет), светлый и тёмный вариант по теме. Верх оставлен спокойным - там часы.
// По готовой картинке считается сетка средних цветов 8x8 пкс: по ней стекло выбирает подложку
// и цвет текста (контраст 4.5), а часы блокировки - светлые они или тёмные.
// Градиент из WALLS по-прежнему стоит в style.background (на случай, если холст не нарисован).
// ================================================================
const Wall = (() => {
  // r: [левый край, правый край, толщина, цвет1, цвет2, прозрачность, изгиб]
  const P = {
    liquid: {
      dark: { base: ['#060c2a', '#0a1c52', '#02040e'], glow: [[0.85, 0.12, 0.65, 'rgba(70,120,255,0.38)'], [0.05, 0.92, 0.75, 'rgba(20,184,166,0.28)']],
        r: [[0.66, 0.30, 0.15, '#1d4ed8', '#22d3ee', 0.85, 0.10], [0.82, 0.47, 0.13, '#4f46e5', '#a78bfa', 0.80, -0.08], [0.97, 0.64, 0.17, '#0369a1', '#38bdf8', 0.85, 0.12], [1.10, 0.83, 0.19, '#ea580c', '#fb7185', 0.78, -0.06]] },
      light: { base: ['#dce9ff', '#c4d8ff', '#eef4ff'], glow: [[0.85, 0.12, 0.65, 'rgba(255,255,255,0.55)'], [0.05, 0.92, 0.75, 'rgba(125,211,252,0.45)']],
        r: [[0.66, 0.30, 0.15, '#3b82f6', '#7dd3fc', 0.75, 0.10], [0.82, 0.47, 0.13, '#6366f1', '#c4b5fd', 0.70, -0.08], [0.97, 0.64, 0.17, '#0ea5e9', '#a5f3fc', 0.75, 0.12], [1.10, 0.83, 0.19, '#fb923c', '#fda4af', 0.72, -0.06]] },
    },
    pearl: { base: ['#fff7fb', '#f6f1ff', '#fff6ec'], glow: [[0.2, 0.15, 0.6, 'rgba(255,255,255,0.8)'], [0.9, 0.8, 0.6, 'rgba(254,215,170,0.5)']],
      r: [[0.70, 0.40, 0.15, '#fbcfe8', '#fde68a', 0.85, 0.08], [0.86, 0.55, 0.13, '#ddd6fe', '#bfdbfe', 0.85, -0.07], [1.00, 0.70, 0.16, '#fecaca', '#fed7aa', 0.85, 0.10], [1.12, 0.86, 0.18, '#e9d5ff', '#fbcfe8', 0.85, -0.05]] },
    aurora: { base: ['#1a0033', '#140a3c', '#0d0d2b'], glow: [[0.3, 0.2, 0.6, 'rgba(255,126,179,0.30)'], [0.7, 0.6, 0.6, 'rgba(120,115,245,0.35)']],
      r: [[0.64, 0.32, 0.15, '#ff7eb3', '#7873f5', 0.85, 0.10], [0.80, 0.50, 0.13, '#7873f5', '#4ac1ff', 0.80, -0.08], [0.96, 0.66, 0.16, '#4ac1ff', '#a5f3fc', 0.80, 0.12], [1.10, 0.84, 0.19, '#ff9a8b', '#ff6b9d', 0.78, -0.06]] },
    ocean: { base: ['#0c4a6e', '#075985', '#082f49'], glow: [[0.5, 0.3, 0.6, 'rgba(103,232,249,0.30)']],
      r: [[0.64, 0.32, 0.15, '#22d3ee', '#67e8f9', 0.80, 0.10], [0.80, 0.50, 0.13, '#0ea5e9', '#38bdf8', 0.80, -0.08], [0.96, 0.66, 0.16, '#155e75', '#22d3ee', 0.85, 0.12], [1.10, 0.84, 0.19, '#0369a1', '#7dd3fc', 0.80, -0.06]] },
    sunset: { base: ['#312e81', '#be185d', '#fb923c'], glow: [[0.5, 0.95, 0.6, 'rgba(253,230,138,0.45)']],
      r: [[0.64, 0.32, 0.15, '#f97316', '#fde68a', 0.80, 0.10], [0.80, 0.50, 0.13, '#be185d', '#fb7185', 0.80, -0.08], [0.96, 0.66, 0.16, '#7c3aed', '#f472b6', 0.80, 0.12], [1.10, 0.84, 0.19, '#fb923c', '#fef3c7', 0.80, -0.06]] },
    forest: { base: ['#064e3b', '#14532d', '#052e16'], glow: [[0.7, 0.3, 0.55, 'rgba(134,239,172,0.30)']],
      r: [[0.64, 0.32, 0.15, '#16a34a', '#86efac', 0.80, 0.10], [0.80, 0.50, 0.13, '#15803d', '#4ade80', 0.80, -0.08], [0.96, 0.66, 0.16, '#065f46', '#34d399', 0.85, 0.12], [1.10, 0.84, 0.19, '#365314', '#a3e635', 0.80, -0.06]] },
  };
  const palette = (id, dark) => { const p = P[id] || P.liquid; return p.dark ? (dark ? p.dark : p.light) : p; };

  // Слой-«стекло»: полоса между двумя кривыми, светлая кромка сверху и тень снизу
  function ribbon(x, W, H, r, q) {
    const [yl, yr, th, c1, c2, a, bend] = r;
    const top = (t) => [W * (-0.15 + 1.3 * t), H * (yl + (yr - yl) * t + bend * Math.sin(t * Math.PI))];
    const bot = (t) => { const [px, py] = top(t); return [px, py + H * th * (0.75 + 0.5 * Math.sin(t * Math.PI * 0.9 + 0.4))]; };
    const path = () => {
      x.beginPath();
      for (let i = 0; i <= 24; i++) { const [px, py] = top(i / 24); i ? x.lineTo(px, py) : x.moveTo(px, py); }
      for (let i = 24; i >= 0; i--) { const [px, py] = bot(i / 24); x.lineTo(px, py); }
      x.closePath();
    };
    const [ax, ay] = top(0.5), [, by] = bot(0.5);
    const g = x.createLinearGradient(0, ay - H * 0.05, W, by + H * 0.08);
    g.addColorStop(0, c1); g.addColorStop(1, c2);
    x.save();
    x.globalAlpha = a;
    x.shadowColor = 'rgba(0,0,0,0.35)'; x.shadowBlur = 30 * q; x.shadowOffsetY = 10 * q;
    path(); x.fillStyle = g; x.fill();
    x.restore();
    // внутренний объём: к нижнему краю темнее
    x.save(); path(); x.clip();
    const s = x.createLinearGradient(0, ay, 0, by + H * 0.06);
    s.addColorStop(0, 'rgba(255,255,255,0.18)'); s.addColorStop(0.45, 'rgba(255,255,255,0)'); s.addColorStop(1, 'rgba(0,0,20,0.28)');
    x.fillStyle = s; x.fillRect(0, 0, W, H);
    x.restore();
    // кромка: тонкая яркая линия и мягкое свечение
    const edge = (lw, col, blur) => {
      x.save(); x.filter = blur ? 'blur(' + blur + 'px)' : 'none';
      x.beginPath();
      for (let i = 0; i <= 24; i++) { const [px, py] = top(i / 24); i ? x.lineTo(px, py) : x.moveTo(px, py); }
      x.strokeStyle = col; x.lineWidth = lw; x.stroke(); x.restore();
    };
    edge(10 * q, 'rgba(255,255,255,0.16)', 6 * q);
    edge(1.4 * q, 'rgba(255,255,255,0.65)', 0);
    return ax;
  }
  function paint(cv, id, dark, W, H, q) {
    cv.width = Math.round(W * q); cv.height = Math.round(H * q);
    const x = cv.getContext('2d'), w = cv.width, h = cv.height, p = palette(id, dark);
    const b = x.createLinearGradient(0, 0, 0, h);
    b.addColorStop(0, p.base[0]); b.addColorStop(0.55, p.base[1]); b.addColorStop(1, p.base[2]);
    x.fillStyle = b; x.fillRect(0, 0, w, h);
    for (const [gx, gy, gr, c] of p.glow) {
      const r = x.createRadialGradient(w * gx, h * gy, 0, w * gx, h * gy, Math.max(w, h) * gr);
      r.addColorStop(0, c); r.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = r; x.fillRect(0, 0, w, h);
    }
    for (const r of p.r) ribbon(x, w, h, r, q);
    if (dark && !P[id].dark) { x.fillStyle = 'rgba(0,0,0,0.22)'; x.fillRect(0, 0, w, h); }
  }

  const CELL = 8;
  let key = '', grid = null, gw = 0, gh = 0, gW = 393, gH = 852;
  function size() {
    const s = document.getElementById('screen');
    return [s.offsetWidth || 393, s.offsetHeight || 852];
  }
  function canvasIn(holder) {
    let cv = holder.querySelector('canvas.wall-cv');
    if (!cv) { cv = document.createElement('canvas'); cv.className = 'wall-cv'; cv.setAttribute('aria-hidden', 'true'); holder.appendChild(cv); }
    return cv;
  }
  function sync() {
    const [W, H] = size();
    const k = S.wallpaper + ':' + (S.dark ? 1 : 0) + ':' + W + 'x' + H;
    if (k === key) return false;
    const q = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const lock = canvasIn(document.getElementById('lock-wall')), home = canvasIn(document.getElementById('home-wall'));
    paint(lock, S.wallpaper, S.dark, W, H, q);
    home.width = lock.width; home.height = lock.height;
    home.getContext('2d').drawImage(lock, 0, 0);
    // сетка средних цветов для подбора подложки стекла
    gw = Math.ceil(W / CELL); gh = Math.ceil(H / CELL); gW = W; gH = H;
    const s = document.createElement('canvas'); s.width = gw; s.height = gh;
    const sx = s.getContext('2d'); sx.imageSmoothingQuality = 'high';
    sx.drawImage(lock, 0, 0, gw, gh);
    grid = sx.getImageData(0, 0, gw, gh).data;
    key = k;
    return true;
  }
  function sample(r) {
    if (!grid) return [];
    const x0 = Math.max(0, Math.floor(r.x / CELL)), y0 = Math.max(0, Math.floor(r.y / CELL));
    const x1 = Math.min(gw - 1, Math.floor((r.x + r.w) / CELL)), y1 = Math.min(gh - 1, Math.floor((r.y + r.h) / CELL));
    const out = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = (y * gw + x) * 4; out.push([grid[i], grid[i + 1], grid[i + 2]]); }
    return out;
  }
  function thumb(cv, id) { paint(cv, id, S.dark, 60, 130, 2); }
  return { sync, sample, thumb, palette, ready: () => !!grid && key.startsWith(S.wallpaper + ':' + (S.dark ? 1 : 0)), get key() { return key; } };
})();
