// Замер кадров «Кубического мира» на настоящей видеокарте: дальность 8, мир построен,
// герой идёт вперёд и поворачивается (новые куски догружаются на ходу). Средний кадр и
// 1% худших кадров. Запуск: VOXEL_PERF=1 npx playwright test tests/web/minecraft_perf.spec.js
// (в обычном прогоне пропускается: без видеокарты, на программной отрисовке, цифры ничего не значат).
const { test, expect } = require('@playwright/test');
const { openVoxel, newWorld } = require('./_voxel-helpers');

test.use({ launchOptions: { args: ['--allow-file-access-from-files', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] } });

test.describe('minecraft_clone_3d_1: замер кадров', () => {
  test.skip(!process.env.VOXEL_PERF, 'только по VOXEL_PERF=1');
  test.setTimeout(180000);

  for (const scene of [{ name: 'стоя, дальность 8', move: false }, { name: 'на ходу, дальность 8', move: true }]) {
    test(scene.name, async ({ page }) => {
      await openVoxel(page);
      const gpu = await page.evaluate(() => { const gl = __voxel.game.renderer.getContext(); const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'нет'; });
      await newWorld(page, { seed: 12345, radius: 8 });
      await page.evaluate(() => __voxel.waitIdle(5));   // квадрат 11x11 целиком внутри круга дальности 8
      await page.waitForTimeout(1000);
      const res = await page.evaluate(async (move) => {
        const v = __voxel, p = v.player;
        v.resetPerf();
        if (move) { v.key('KeyW'); v.key('ControlLeft'); }
        const t0 = performance.now();
        await new Promise((resolve) => {
          const spin = () => { p.yaw += 0.004; if (performance.now() - t0 < 12000) requestAnimationFrame(spin); else resolve(); };
          requestAnimationFrame(spin);
        });
        v.key('KeyW', false); v.key('ControlLeft', false);
        const f = v.game.perf.frames.filter((x) => x > 0 && x < 2000);
        const s = f.slice().sort((a, b) => b - a);
        const k = Math.max(1, Math.floor(f.length / 100));
        const work = v.workStats();
        return { frames: f.length, avg: f.reduce((a, b) => a + b, 0) / f.length, worst1: s.slice(0, k).reduce((a, b) => a + b, 0) / k, workAvg: work.avg, workP99: work.p99, counts: v.counts(), walked: Math.round(Math.hypot(p.pos.x, p.pos.z)), slow: v.game.perf.slow.filter((x) => x.at > t0) };
      }, scene.move);
      console.log(`[замер] ${scene.name} | ${gpu} | кадров ${res.frames}, средний кадр ${res.avg.toFixed(2)} мс (${(1000 / res.avg).toFixed(1)} к/с), 1% худших ${res.worst1.toFixed(2)} мс | работа кадра на ЦП: средняя ${res.workAvg.toFixed(2)} мс, 99-й процентиль ${res.workP99.toFixed(2)} мс | ${res.counts.meshed} кусков с сеткой, ${Math.round(res.counts.quads / 1000)} тыс. граней, ${res.counts.draws} отрисовок`);
      if (res.slow.length) console.log('[медленные кадры]', JSON.stringify(res.slow.slice(-12)));
      test.info().annotations.push({ type: 'замер', description: JSON.stringify({ gpu, ...res }) });
      expect(res.frames).toBeGreaterThan(300);
    });
  }
});
