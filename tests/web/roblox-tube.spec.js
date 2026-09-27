// Законы Блоксити, часть 7 - горка на ватрушке: жёлоб сплошной. С нескольких точек (за героем на
// трассе, сбоку, снизу у старта) полоса жёлоба закрывает фон: рисуем только жёлоб на пурпурном фоне
// и проверяем пиксели в точках жёлоба - пурпура там быть не должно (фон сквозь жёлоб не виден).
// Ещё: опоры доходят до низа жёлоба, у жёлоба насыщенный цвет, отличный от снега.
const { test, expect } = require('@playwright/test');
const { openBlox, enter } = require('./_blox-helpers');

test.describe('roblox-mini (Блоксити): горка', () => {
  test.describe.configure({ timeout: 120000 });

  test('жёлоб сплошной: за героем, сбоку и снизу сквозь него не видно фона', async ({ page }) => {
    await openBlox(page);
    await enter(page, 'tube');
    const r = await page.evaluate(() => {
      const g = __blox.game, st = g.state, R = __blox.B.engine.renderer, sc = g.world.scene, cam = g.camera;
      const pts = st.pts, n = pts.length;
      // сетки жёлоба: st.chute (если есть) или длинные ленты вдоль трассы
      const chute = st.chute || sc.children.filter((o) => o.isMesh && o.material.type !== 'ShaderMaterial' && [n * 2, n * 4].includes(o.geometry.getAttribute('position').count));
      const at = (s) => { const f = Math.min(n - 1.001, s / 2), i = Math.floor(f), t = f - i, a = pts[i], b = pts[i + 1]; return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, th: a.th + (b.th - a.th) * t }; };
      const lat = (th) => ({ x: Math.cos(th), z: -Math.sin(th) });
      // только жёлоб, фон - пурпур
      const vis = new Map();
      sc.traverse((o) => { vis.set(o, o.visible); });
      sc.traverse((o) => { if (o !== sc && !o.isLight) o.visible = false; });   // свет остаётся
      for (const m of chute) { let o = m; while (o && o !== sc) { o.visible = true; o = o.parent; } }
      const bg = sc.background, fog = sc.fog;
      sc.background = new THREE.Color('#ff00ff'); sc.fog = null;
      const W = R.domElement.width, H = R.domElement.height, gl = R.getContext(), px = new Uint8Array(4);
      const views = {};
      const shoot = (name, eye, look, samples) => {
        cam.position.set(eye.x, eye.y, eye.z); cam.lookAt(look.x, look.y, look.z); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
        R.render(sc, cam);
        let seen = 0, bad = 0, light = 0;
        for (const s of samples) {
          const v = new THREE.Vector3(s.x, s.y, s.z).project(cam);
          if (v.z > 1 || Math.abs(v.x) > 0.95 || Math.abs(v.y) > 0.95) continue;
          const x = Math.round((v.x + 1) / 2 * W), y = Math.round((v.y + 1) / 2 * H);
          gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
          seen++; light += (px[0] + px[1] + px[2]) / 3;
          if (px[0] > 230 && px[1] < 40 && px[2] > 230) bad++;
        }
        views[name] = { seen, bad, light: seen ? light / seen : 0 };
      };
      // 1. за героем на трассе: дно жёлоба впереди
      { const s = 70, p = at(s), f = { x: Math.sin(p.th), z: Math.cos(p.th) };
        const samples = []; for (let d = 6; d <= 40; d += 2) { const q = at(s + d); samples.push({ x: q.x, y: q.y + 0.05, z: q.z }); }
        shoot('behind', { x: p.x - f.x * 10, y: p.y + 6, z: p.z - f.z * 10 }, at(s + 18), samples); }
      // 2. сбоку: наружная стенка жёлоба
      { const s = 160, p = at(s), L = lat(p.th), samples = [];
        for (let d = -10; d <= 10; d += 2) { const q = at(s + d), Lq = lat(q.th); for (const dy of [0.3, -0.8]) samples.push({ x: q.x + Lq.x * 6.3, y: q.y + dy, z: q.z + Lq.z * 6.3 }); }   // и ниже дна: у жёлоба есть толщина
        shoot('side', { x: p.x + L.x * 30, y: p.y + 1, z: p.z + L.z * 30 }, p, samples); }
      // 3. снизу у старта: низ жёлоба
      { const s = 24, p = at(s), L = lat(p.th), samples = [];
        for (let d = -10; d <= 10; d += 2) { const q = at(s + d); samples.push({ x: q.x, y: q.y - 0.5, z: q.z }); }
        shoot('below', { x: p.x + L.x * 4, y: p.y - 22, z: p.z + L.z * 4 }, p, samples); }
      // вернуть сцену
      for (const [o, v] of vis) o.visible = v;
      sc.background = bg; sc.fog = fog;
      // опоры: верх опоры касается низа жёлоба (зазор меньше 0.3)
      const posts = g.world.parts.filter((p) => p.tag === 'post');
      const gaps = posts.map((p) => { const d = pts.reduce((m, q) => (Math.hypot(q.x - p.cx, q.z - p.cz) < m.d ? { d: Math.hypot(q.x - p.cx, q.z - p.cz), q } : m), { d: 1e9 }); return d.q.y - (st.chuteDepth || 0) - p.maxY; });
      // цвет наружной стенки заметен на снегу: насыщенность
      const c = st.chuteColor ? new THREE.Color(st.chuteColor) : new THREE.Color(0xbfe3ff), hsl = {}; c.getHSL(hsl);
      return { views, posts: posts.length, maxGap: gaps.length ? Math.max(...gaps.map(Math.abs)) : 99, sat: hsl.s, light: hsl.l };
    });
    for (const [name, v] of Object.entries(r.views)) {
      expect(v.seen, name + ': точки жёлоба в кадре').toBeGreaterThan(4);
      expect(v.bad, name + ': сквозь жёлоб виден фон').toBe(0);
    }
    expect(r.views.behind.light, 'за героем видно светлое дно жёлоба (не изнанку)').toBeGreaterThan(120);
    expect(r.posts).toBeGreaterThan(10);
    expect(r.maxGap).toBeLessThan(0.3);
    expect(r.sat).toBeGreaterThan(0.5);
    expect(r.light).toBeLessThan(0.6);
  });

  test('жёлоб - одна-две сетки (не десятки отрисовок), опоры склеены со статикой', async ({ page }) => {
    await openBlox(page);
    await enter(page, 'tube');
    const r = await page.evaluate(() => { const st = __blox.game.state; return { chute: (st.chute || []).length, dynPosts: __blox.game.world.dyn.filter((p) => p.tag === 'post').length }; });
    expect(r.chute).toBeGreaterThan(0);
    expect(r.chute).toBeLessThanOrEqual(3);
    expect(r.dynPosts).toBe(0);
  });
});
