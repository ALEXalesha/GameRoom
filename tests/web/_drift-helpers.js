// Помощники проверок «Horizon Drift»: открыть игру без сети с ?seed=, дождаться window.__drift,
// поставить низкую графику (чтобы трассы грузились быстро), запустить заезд без рисования шагов.
const { pageUrl } = require('../helpers');

async function openDrift(page, opts = {}) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String((e && e.stack) || e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.route(/^https?:\/\//, (route) => route.abort());
  if (opts.clear !== false) {
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('drift-test-cleared')) { localStorage.clear(); sessionStorage.setItem('drift-test-cleared', '1'); }
    });
  }
  await page.goto(pageUrl('horizon_drift_offline') + '?seed=' + (opts.seed || 1));
  await page.waitForFunction(() => window.__drift && window.__drift.ready === true);
  if (opts.low !== false) await page.evaluate(() => { __drift.setSetting('quality', 'low'); });
  return errors;
}

// Быстрая гонка без хода времени от кадров: шаги физики делает сама проверка через __drift.step.
async function startQuick(page, o) {
  return page.evaluate(async (o) => {
    __drift.manual = true;
    const r = await __drift.startQuick(o);
    return { track: r.track.id, cars: r.cars.length, phase: r.phase };
  }, o);
}

module.exports = { openDrift, startQuick };
