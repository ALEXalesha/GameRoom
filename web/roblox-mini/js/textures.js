// Текстуры рисуются на холсте: шипы-кнопочки сверху деталей, мягкая тень по краям граней,
// лава, стрелки конвейера, лица, рубашки и штаны. Всё своё.
'use strict';
(function (B) {
  const cache = {};
  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function tex(key, w, h, draw, opt = {}) {
    if (cache[key]) return cache[key];
    const c = canvas(w, h);
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    if (opt.repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = opt.aniso || 4;
    if (opt.nearest) { t.magFilter = THREE.NearestFilter; }
    cache[key] = t;
    return t;
  }
  const T = B.tex = {};

  // Кнопочка на 1x1: светлый верх, тень снизу-справа, чуть заметная сетка по краю
  T.studs = () => tex('studs', 64, 64, (g, w) => {
    g.fillStyle = '#ececec'; g.fillRect(0, 0, w, w);
    g.fillStyle = '#e2e2e2'; g.fillRect(0, 0, w, 1); g.fillRect(0, 0, 1, w);
    const cx = w / 2, r = w * 0.3;
    g.fillStyle = 'rgba(0,0,0,0.16)'; g.beginPath(); g.arc(cx + 2.5, cx + 3, r, 0, 7); g.fill();
    const grd = g.createLinearGradient(cx - r, cx - r, cx + r, cx + r);
    grd.addColorStop(0, '#ffffff'); grd.addColorStop(1, '#d6d6d6');
    g.fillStyle = grd; g.beginPath(); g.arc(cx, cx, r, 0, 7); g.fill();
    g.fillStyle = '#f2f2f2'; g.beginPath(); g.arc(cx, cx, r * 0.72, 0, 7); g.fill();
  }, { repeat: true, aniso: 8 });

  // Тень по краям грани (aoMap по второй развёртке 0..1)
  T.edges = () => tex('edges', 64, 64, (g, w) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, w);
    for (let i = 0; i < 4; i++) {
      g.strokeStyle = `rgba(0,0,0,${0.42 - i * 0.1})`;
      g.strokeRect(i + 0.5, i + 0.5, w - 2 * i - 1, w - 2 * i - 1);
    }
  });

  // Лава: пятна и прожилки, повторяется
  T.lava = () => tex('lava', 128, 128, (g, w) => {
    g.fillStyle = '#ff4a12'; g.fillRect(0, 0, w, w);
    const r = B.rng(7);
    for (let i = 0; i < 60; i++) {
      const x = r() * w, y = r() * w, s = 6 + r() * 18;
      g.fillStyle = r() < 0.5 ? 'rgba(255,200,40,0.55)' : 'rgba(150,20,0,0.45)';
      for (const dx of [-w, 0, w]) for (const dy of [-w, 0, w]) { g.beginPath(); g.arc(x + dx, y + dy, s, 0, 7); g.fill(); }
    }
  }, { repeat: true });

  // Стрелки конвейера (смотрят вдоль +v)
  T.conveyor = () => tex('conveyor', 64, 64, (g, w) => {
    g.fillStyle = '#2b2d31'; g.fillRect(0, 0, w, w);
    g.fillStyle = '#ffd23f';
    g.beginPath(); g.moveTo(w * 0.2, w * 0.75); g.lineTo(w * 0.5, w * 0.3); g.lineTo(w * 0.8, w * 0.75); g.lineTo(w * 0.65, w * 0.75); g.lineTo(w * 0.5, w * 0.52); g.lineTo(w * 0.35, w * 0.75); g.fill();
  }, { repeat: true });

  // Снег для горки
  T.snow = () => tex('snow', 64, 64, (g, w) => {
    g.fillStyle = '#f4f8ff'; g.fillRect(0, 0, w, w);
    const r = B.rng(3);
    for (let i = 0; i < 80; i++) { g.fillStyle = r() < 0.5 ? 'rgba(180,200,235,0.35)' : 'rgba(255,255,255,0.9)'; g.fillRect(r() * w, r() * w, 2, 2); }
  }, { repeat: true });

  // Надпись на плите (контрольная точка, старт, финиш)
  T.label = (text, bg, fg) => tex('label:' + text + bg + fg, 256, 128, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 6; g.strokeRect(8, 8, w - 16, h - 16);
    g.fillStyle = fg; g.font = 'bold 54px Segoe UI, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 3);
  });

  // Табличка с именем над головой
  T.nameplate = (text) => {
    const c = canvas(512, 96), g = c.getContext('2d');
    g.font = 'bold 50px Segoe UI, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 9; g.strokeStyle = 'rgba(0,0,0,0.55)'; g.strokeText(text, 256, 50);
    g.fillStyle = '#ffffff'; g.fillText(text, 256, 50);
    const t = new THREE.CanvasTexture(c); t.anisotropy = 4;
    return t;
  };

  // ---------- Лица: на развёртке боковины цилиндра-головы, центр (u=0.5) смотрит вперёд ----------
  function drawFace(g, id, cx, cy, s) {
    g.fillStyle = '#16181c'; g.strokeStyle = '#16181c'; g.lineCap = 'round'; g.lineWidth = s * 0.07;
    const eye = (x, y, rx, ry) => { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 7); g.fill(); };
    const ex = s * 0.2, ey = cy - s * 0.12;
    if (id === 'face_cool') {
      g.fillRect(cx - s * 0.42, ey - s * 0.1, s * 0.84, s * 0.08);
      g.beginPath(); g.roundRect ? g.roundRect(cx - s * 0.4, ey - s * 0.08, s * 0.34, s * 0.2, s * 0.06) : g.rect(cx - s * 0.4, ey - s * 0.08, s * 0.34, s * 0.2); g.fill();
      g.beginPath(); g.roundRect ? g.roundRect(cx + s * 0.06, ey - s * 0.08, s * 0.34, s * 0.2, s * 0.06) : g.rect(cx + s * 0.06, ey - s * 0.08, s * 0.34, s * 0.2); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(cx - s * 0.34, ey - s * 0.04, s * 0.08, s * 0.04); g.fillRect(cx + s * 0.12, ey - s * 0.04, s * 0.08, s * 0.04);
      g.beginPath(); g.moveTo(cx - s * 0.16, cy + s * 0.2); g.quadraticCurveTo(cx + s * 0.05, cy + s * 0.3, cx + s * 0.2, cy + s * 0.14); g.stroke();
      return;
    }
    if (id === 'face_sleepy') {
      g.beginPath(); g.moveTo(cx - ex - s * 0.08, ey); g.lineTo(cx - ex + s * 0.08, ey); g.stroke();
      g.beginPath(); g.moveTo(cx + ex - s * 0.08, ey); g.lineTo(cx + ex + s * 0.08, ey); g.stroke();
      g.beginPath(); g.ellipse(cx, cy + s * 0.2, s * 0.06, s * 0.07, 0, 0, 7); g.stroke();
      g.font = `bold ${s * 0.16}px Arial`; g.fillText('z', cx + s * 0.34, cy - s * 0.3);
      return;
    }
    if (id === 'face_wink') {
      eye(cx - ex, ey, s * 0.055, s * 0.09);
      g.beginPath(); g.moveTo(cx + ex - s * 0.08, ey + s * 0.01); g.quadraticCurveTo(cx + ex, ey - s * 0.07, cx + ex + s * 0.08, ey + s * 0.01); g.stroke();
    } else if (id === 'face_surprised') {
      g.lineWidth = s * 0.045;
      g.beginPath(); g.arc(cx - ex, ey, s * 0.08, 0, 7); g.stroke(); g.beginPath(); g.arc(cx + ex, ey, s * 0.08, 0, 7); g.stroke();
      eye(cx - ex, ey, s * 0.03, s * 0.03); eye(cx + ex, ey, s * 0.03, s * 0.03);
    } else if (id === 'face_angry') {
      eye(cx - ex, ey + s * 0.02, s * 0.055, s * 0.07); eye(cx + ex, ey + s * 0.02, s * 0.055, s * 0.07);
      g.beginPath(); g.moveTo(cx - ex - s * 0.1, ey - s * 0.14); g.lineTo(cx - ex + s * 0.08, ey - s * 0.07); g.stroke();
      g.beginPath(); g.moveTo(cx + ex + s * 0.1, ey - s * 0.14); g.lineTo(cx + ex - s * 0.08, ey - s * 0.07); g.stroke();
    } else {
      eye(cx - ex, ey, s * 0.055, s * 0.09); eye(cx + ex, ey, s * 0.055, s * 0.09);
    }
    if (id === 'face_blush') {
      g.fillStyle = 'rgba(255,90,120,0.45)'; eye(cx - s * 0.32, cy + s * 0.06, s * 0.1, s * 0.05); eye(cx + s * 0.32, cy + s * 0.06, s * 0.1, s * 0.05);
      g.fillStyle = '#16181c';
    }
    // рот
    g.beginPath();
    if (id === 'face_grin') {
      g.moveTo(cx - s * 0.26, cy + s * 0.08); g.quadraticCurveTo(cx, cy + s * 0.46, cx + s * 0.26, cy + s * 0.08); g.closePath(); g.fill();
      g.fillStyle = '#fff'; g.fillRect(cx - s * 0.2, cy + s * 0.09, s * 0.4, s * 0.06);
    } else if (id === 'face_surprised') {
      g.ellipse(cx, cy + s * 0.2, s * 0.07, s * 0.09, 0, 0, 7); g.fill();
    } else if (id === 'face_angry') {
      g.moveTo(cx - s * 0.16, cy + s * 0.24); g.quadraticCurveTo(cx, cy + s * 0.14, cx + s * 0.16, cy + s * 0.24); g.stroke();
    } else {
      g.moveTo(cx - s * 0.22, cy + s * 0.1); g.quadraticCurveTo(cx, cy + s * 0.34, cx + s * 0.22, cy + s * 0.1); g.stroke();
    }
  }
  T.face = (id, skin) => tex('face:' + id + skin, 512, 160, (g, w, h) => {
    g.fillStyle = skin; g.fillRect(0, 0, w, h);
    drawFace(g, id, w / 2, h / 2, h * 0.95);
  });
  // Картинка лица для каталога
  T.faceIcon = (id) => {
    const c = canvas(160, 160), g = c.getContext('2d');
    g.fillStyle = '#eab98a'; g.beginPath(); g.arc(80, 80, 72, 0, 7); g.fill();
    drawFace(g, id, 80, 84, 130);
    return c.toDataURL();
  };

  // ---------- Одежда: грани туловища, рук и ног ----------
  function pattern(g, id, c1, c2, w, h, face) {
    if (id === 'shirt_stripes' || id === 'pants_track') {
      if (id === 'shirt_stripes') { g.fillStyle = c1; g.fillRect(0, 0, w, h); g.fillStyle = c2; for (let y = 0; y < h; y += h / 8) g.fillRect(0, y, w, h / 16); }
      else { g.fillStyle = c1; g.fillRect(0, 0, w, h); if (face === 'side') { g.fillStyle = c2; g.fillRect(w * 0.4, 0, w * 0.2, h); } }
    } else if (id === 'shirt_checker') {
      g.fillStyle = c1; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      for (let x = 0; x < w; x += w / 4) g.fillRect(x, 0, w / 12, h);
      for (let y = 0; y < h; y += h / 4) g.fillRect(0, y, w, h / 12);
    } else if (id === 'pants_camo') {
      g.fillStyle = c1; g.fillRect(0, 0, w, h);
      const r = B.rng(B.hash(face + w));
      for (let i = 0; i < 14; i++) { g.fillStyle = i % 2 ? c2 : '#8a8d5a'; g.beginPath(); g.ellipse(r() * w, r() * h, w * (0.1 + r() * 0.14), h * (0.06 + r() * 0.08), r() * 3, 0, 7); g.fill(); }
    } else if (id === 'pants_jeans') {
      g.fillStyle = c1; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#d9a441'; g.setLineDash([4, 3]); g.lineWidth = 2; g.strokeRect(3, 3, w - 6, h - 6); g.setLineDash([]);
      g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(w * 0.25, h * 0.3, w * 0.5, h * 0.3);
    } else {
      g.fillStyle = c1; g.fillRect(0, 0, w, h);
    }
  }
  // part: torso | arm | leg; face: front | back | side | top | bottom
  T.clothing = (part, face, base, shirt, pants) => {
    const key = ['cl', part, face, base, shirt, pants].join(':');
    return tex(key, 128, 128, (g, w, h) => {
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      const sh = B.data.item(shirt), pa = B.data.item(pants);
      if (part === 'torso' && sh && sh.c1) {
        pattern(g, shirt, sh.c1, sh.c2, w, h, face);
        if (face === 'front') {
          if (shirt === 'shirt_tee') {
            g.fillStyle = sh.c2; g.beginPath();
            const cx = w / 2, cy = h * 0.48, R = w * 0.22, r = R * 0.45;
            for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r : R; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
            g.fill();
          } else if (shirt === 'shirt_hoodie') {
            g.fillStyle = sh.c2; g.fillRect(w * 0.25, h * 0.6, w * 0.5, h * 0.25);
            g.strokeStyle = '#f2f3f3'; g.lineWidth = 3; g.beginPath(); g.moveTo(w * 0.42, 0); g.lineTo(w * 0.42, h * 0.3); g.moveTo(w * 0.58, 0); g.lineTo(w * 0.58, h * 0.3); g.stroke();
          } else if (shirt === 'shirt_sport') {
            g.fillStyle = sh.c2; g.font = `bold ${h * 0.55}px Arial`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('7', w / 2, h * 0.55);
            g.fillRect(0, 0, w, h * 0.08);
          } else if (shirt === 'shirt_suit') {
            g.fillStyle = '#f2f3f3'; g.beginPath(); g.moveTo(w * 0.32, 0); g.lineTo(w * 0.5, h * 0.55); g.lineTo(w * 0.68, 0); g.fill();
            g.fillStyle = sh.c2; g.beginPath(); g.moveTo(w * 0.46, h * 0.06); g.lineTo(w * 0.54, h * 0.06); g.lineTo(w * 0.56, h * 0.45); g.lineTo(w * 0.5, h * 0.55); g.lineTo(w * 0.44, h * 0.45); g.fill();
            g.fillStyle = '#c9ccd1'; for (const y of [0.65, 0.8]) { g.beginPath(); g.arc(w * 0.5, h * y, 3, 0, 7); g.fill(); }
          }
        }
        if (face === 'back' && shirt === 'shirt_sport') { g.fillStyle = sh.c2; g.font = `bold ${h * 0.55}px Arial`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('7', w / 2, h * 0.55); }
      }
      if (part === 'arm' && sh && sh.c1) {
        const sleeve = shirt === 'shirt_tee' || shirt === 'shirt_sport' ? 0.35 : 1;
        g.save(); g.beginPath(); g.rect(0, 0, w, h * sleeve); g.clip();
        pattern(g, shirt, sh.c1, sh.c2, w, h, face); g.restore();
      }
      if (part === 'torso' && pa && pa.c1) {       // пояс штанов на туловище
        g.fillStyle = pa.c1; g.fillRect(0, h * 0.88, w, h * 0.12);
        if (pants === 'pants_jeans') { g.fillStyle = '#6b4a2a'; g.fillRect(0, h * 0.9, w, h * 0.05); }
      }
      if (part === 'leg' && pa && pa.c1) {
        const len = pants === 'pants_shorts' ? 0.45 : 1;
        g.save(); g.beginPath(); g.rect(0, 0, w, h * len); g.clip();
        pattern(g, pants, pa.c1, pa.c2, w, h, face); g.restore();
        if (face === 'bottom' && len < 1) { g.fillStyle = base; g.fillRect(0, 0, w, h); }
      }
      if (face === 'bottom' && part === 'leg' && pants !== 'pants_shorts') g.fillStyle = 'rgba(0,0,0,0.25)', g.fillRect(0, 0, w, h);
    });
  };
})(window.Blox);
