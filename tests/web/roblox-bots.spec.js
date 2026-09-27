// Законы Блоксити, часть 5 - боты играют по-настоящему. Время ускорено: мир шагает по команде
// (?manual=1), без рисования, зерно постоянное - прогон повторяется один в один.
// Обби: этапы по контрольным точкам, падение - на свою точку, лучшие доходят до значка.
// Забег: стартуют вместе с игроком, приходят с настоящим временем. Лава: лезут, пока лава не
// догонит, сгоревшие - в лобби. Монеты: собирают, лезут за монетами наверх. Горка: сами садятся
// и катятся раз за разом. Песочница: строят по заготовкам, не трогают игрока и его блоки,
// лимит, исчезновение, «Оставить». Во всех местах: имена над головой, реплики по ситуации,
// нет стояния без дела, нет прохода сквозь стены, застрявший - на контрольную точку.
const { test, expect } = require('@playwright/test');
const { openBlox, enter } = require('./_blox-helpers');

const PLACES = ['obby', 'race', 'lava', 'coins', 'sandbox', 'tube'];

// Прогнать sec секунд мира, каждые every секунд вызвать sample(g) (строкой-функцией внутри страницы)
async function sim(page, sec, every, sample) {
  return page.evaluate(({ sec, every, sample }) => {
    const g = __blox.game, f = sample ? eval('(' + sample + ')') : null, out = [];
    const n = Math.round(sec / every);
    for (let i = 0; i < n; i++) { __blox.run(Math.round(every * 60)); if (f) out.push(f(g, (i + 1) * every)); }
    return out;
  }, { sec, every, sample: sample ? sample.toString() : null });
}

test.describe('roblox-mini (Блоксити): боты', () => {
  test.describe.configure({ timeout: 180000 });

  test('обби: за 90 с хотя бы один бот на 3 этапе, средний этап растёт; этапы видны в таблице игроков', async ({ page }) => {
    await openBlox(page);
    await enter(page, 'obby');
    const s = await sim(page, 150, 30, (g) => ({ max: Math.max(...g.bots.map((b) => b.stat)), avg: g.bots.reduce((a, b) => a + b.best, 0) / g.bots.length }));
    expect(s[2].max).toBeGreaterThanOrEqual(3);                     // к 90 с
    expect(s[4].avg).toBeGreaterThan(s[0].avg);                      // 150 с против 30 с
    const board = await page.evaluate(() => { const g = __blox.game; g.drawBoard(); return { rows: Array.from(document.querySelectorAll('#g-board .board-row')).map((r) => r.textContent), bots: g.bots.map((b) => [b.name, b.stat >= 9 ? '★' : String(b.stat)]) }; });
    for (const [name, st] of board.bots) expect(board.rows).toContain(name + st);
  });

  test('обби: бот, упавший в лаву, появляется на своей контрольной точке', async ({ page }) => {
    await openBlox(page);
    await enter(page, 'obby');
    const r = await page.evaluate(() => {
      const g = __blox.game, b = g.bots[0], pad = g.state.pads[3];
      b.body.teleport(pad.cx, pad.maxY + 0.01, pad.cz); __blox.run(20);          // дошёл до точки 3
      const cp = b.cp;
      b.body.teleport(60, 4, 60);                                                   // шаг в лаву
      __blox.run(30);
      const died = b.deaths;
      __blox.run(60 * 3.3);
      const p = b.body.pos;
      return { cp, died, cpAfter: b.cp, dead: b.dead, on: p.x >= pad.minX && p.x <= pad.maxX && p.z >= pad.minZ && p.z <= pad.maxZ && Math.abs(p.y - pad.maxY) < 0.6 };
    });
    expect(r.cp).toBe(3);
    expect(r.died).toBeGreaterThan(0);
    expect(r.dead).toBe(false);
    expect(r.cpAfter).toBe(3);
    expect(r.on).toBe(true);
  });

  test('обби: хорошие боты доходят до вершины и получают значок', async ({ page }) => {
    await openBlox(page);
    await enter(page, 'obby');
    await sim(page, 240, 60);
    const r = await page.evaluate(() => ({ wins: __blox.game.bots.map((b) => [b.style, b.wins || 0]), chat: __blox.game.chatLog.map((m) => m.text).join('\n') }));
    expect(r.wins.some(([st, w]) => w > 0 && (st === 'pro' || st === 'rusher'))).toBe(true);
    expect(r.chat).toMatch(/получает значок «Покоритель башни»/);
  });

  test('забег: игрок пересёк линию - боты на старте бегут следом; приходят с настоящим временем', async ({ page }) => {
    await openBlox(page);
    await enter(page, 'race');
    const r = await page.evaluate(() => {
      const g = __blox.game, P = g.place;
      __blox.run(60 * 6);                                                           // встали на старт
      const lined = g.bots.filter((b) => b.race.phase === 'line').map((b) => b.name);
      g.player.teleport(12, 0.01, 0); __blox.run(2);                                // герой за линией
      __blox.run(60);
      const running = g.bots.filter((b) => b.race.phase === 'run').map((b) => b.name);
      const x0 = Object.fromEntries(g.bots.map((b) => [b.name, b.body.pos.x]));
      __blox.run(60 * 2);
      const moved = g.bots.filter((b) => b.race.phase === 'run' && b.body.pos.x > x0[b.name] + 10).length;
      __blox.run(60 * 110);
      return { lined, running, moved, heat: g.state.heat && g.state.heat.player !== undefined, best: g.bots.map((b) => b.stat) };
    });
    expect(r.lined.length).toBeGreaterThan(0);
    expect(r.running.sort()).toEqual(r.lined.sort());
    expect(r.moved).toBeGreaterThan(0);
    const times = r.best.filter((t) => t != null);
    expect(times.length).toBeGreaterThan(0);
    for (const t of times) { expect(t).toBeGreaterThan(24); expect(t).toBeLessThan(120); }
  });

  test('забег: бот, упавший в воду, появляется на своей контрольной точке заезда', async ({ page }) => {
    await openBlox(page);
    await enter(page, 'race');
    const r = await page.evaluate(() => {
      const g = __blox.game, b = g.bots[0], cp2 = g.path.find((p) => p.tag === 'cp2');
      b.race.phase = 'run'; b.race.t = 5; b.race.timing = true;
      b.body.teleport(cp2.cx, cp2.maxY + 0.01, cp2.cz); __blox.run(20);
      const cp = b.race.cp;
      b.body.teleport(cp2.cx + 20, 2, 30); __blox.run(60);                           // в воду
      const died = b.deaths;
      __blox.run(60 * 3.2);
      const p = b.body.pos;
      return { cp, died, on: p.x >= cp2.minX && p.x <= cp2.maxX && Math.abs(p.y - cp2.maxY) < 0.6, phase: b.race.phase };
    });
    expect(r.cp).toBe(2);
    expect(r.died).toBeGreaterThan(0);
    expect(r.on).toBe(true);
    expect(r.phase).toBe('run');
  });

  test('лава: боты лезут вверх, пока лава поднимается; живые на башне - выше лавы; сгоревшие - в лобби', async ({ page }) => {
    await openBlox(page);
    await enter(page, 'lava');
    await page.evaluate(() => __blox.game.player.teleport(66, 0.01, 0));            // герой смотрит из лобби
    const s = await sim(page, 90, 1, (g) => {
      const st = g.state;
      return {
        phase: st.phase, lava: st.lavaY,
        bots: g.bots.map((b) => ({ y: b.body.pos.y, x: b.body.pos.x, out: !!b.out, dead: b.dead, ground: !!b.body.onGround, summit: !!b.summit })),
      };
    });
    const rise = s.filter((x) => x.phase === 'rise');
    expect(rise.length).toBeGreaterThan(20);
    const maxY = Math.max(...rise.flatMap((x) => x.bots.map((b) => b.y)));
    expect(maxY).toBeGreaterThan(40);
    for (const x of rise) for (const b of x.bots) {
      if (!b.out && !b.dead && b.ground) expect(b.y).toBeGreaterThan(x.lava - 0.01);   // стоит - значит выше лавы
      if (b.out && !b.dead) expect(b.x).toBeGreaterThan(50);                           // сгоревший - в лобби
    }
    expect(rise.some((x) => x.bots.some((b) => b.out))).toBe(true);                   // кого-то лава догнала
  });

  test('монеты: боты собирают монеты и лезут за ними на горки и башенку', async ({ page }) => {
    await openBlox(page);
    await enter(page, 'coins');
    const r = await page.evaluate(() => {
      const g = __blox.game, P = g.place;
      g.player.teleport(70, 0.01, 70);
      let high = 0, got = 0;
      const take = P.take;
      P.take = (gg, c, who) => { if (who) { got++; if (!c.ground) high++; } take(gg, c, who); };
      __blox.run(60 * 150);
      P.take = take;
      return { got, high };
    });
    expect(r.got).toBeGreaterThanOrEqual(16);
    expect(r.high).toBeGreaterThan(0);
  });

  test('горка: боты сами идут к синей плите, садятся и катятся раз за разом; звёзды 0..20', async ({ page }) => {
    await openBlox(page);
    await enter(page, 'tube');
    const r = await page.evaluate(() => {
      const g = __blox.game, seat = g.state.seatPart, mounts = [];
      const was = new Map();
      for (let i = 0; i < 60 * 150; i++) {
        __blox.run(1);
        for (const b of g.bots) {
          if (b.ride && !was.get(b)) mounts.push({ x: b.body.prev.x, z: b.body.prev.z });
          was.set(b, !!b.ride);
        }
      }
      return { rides: g.bots.map((b) => b.rides), stars: g.bots.map((b) => b.best), mounts, seat: [seat.minX, seat.maxX, seat.minZ, seat.maxZ] };
    });
    for (const n of r.rides) expect(n).toBeGreaterThanOrEqual(2);
    for (const s of r.stars) { expect(s).toBeGreaterThanOrEqual(0); expect(s).toBeLessThanOrEqual(20); }
    // сели на плите (или вплотную у неё), а не где попало
    for (const m of r.mounts) { expect(m.x).toBeGreaterThan(r.seat[0] - 3); expect(m.x).toBeLessThan(r.seat[1] + 3); expect(m.z).toBeGreaterThan(r.seat[2] - 3); expect(m.z).toBeLessThan(r.seat[3] + 3); }
  });

  // ---------- Песочница ----------
  const sandbox = async (page, cfg) => {
    await openBlox(page);
    await page.evaluate((c) => localStorage.setItem('mix.blox.place.sandbox', JSON.stringify(c)), cfg);
    await enter(page, 'sandbox');
  };

  test('песочница: за минуту боты ставят блоки; ни одного - в клетке игрока и в точке появления', async ({ page }) => {
    await sandbox(page, { bots: 6, botsBuild: true });
    const r = await page.evaluate(() => {
      const g = __blox.game, P = g.place, st = g.state, bad = [];
      // каждый блок бота в момент постановки: не в точке появления и не в теле игрока
      const place = P.placeAt;
      P.placeAt = (gg, i, j, k, c, silent, owner, build) => {
        const ok = place(gg, i, j, k, c, silent, owner, build);
        if (ok && owner) {
          const p = gg.player.pos, x = 2 * i + 1, y = 2 * j + 1, z = 2 * k + 1;
          if (P.inSpawn(i, k)) bad.push('spawn ' + i + ',' + k);
          if (x + 1 > p.x - 0.9 && x - 1 < p.x + 0.9 && y + 1 > p.y && y - 1 < p.y + 5 && z + 1 > p.z - 0.9 && z - 1 < p.z + 0.9) bad.push('player ' + i + ',' + k);
        }
        return ok;
      };
      const counts = [];
      for (let s = 0; s < 240; s++) {
        // игрок встаёт прямо в следующую клетку чужой стройки (если там свободно)
        if (s % 4 === 0) {
          const bd = Array.from(st.builds.values()).find((x) => !x.done && x.cells[x.next] && x.cells[x.next].j <= 1);
          const c = bd && bd.cells[bd.next];
          const x = c ? 2 * c.i + 1 : Math.sin(s) * 40, z = c ? 2 * c.k + 1 : Math.cos(s) * 40;
          if (g.world.boxFree(x - 1, 0.05, z - 1, x + 1, 5.1, z + 1)) g.player.teleport(x, 0.01, z);
        }
        __blox.run(30);
        counts.push(st.botBlocks);
      }
      P.placeAt = place;
      return { bad, n60: counts[119], n120: counts[239] };
    });
    expect(r.n60).toBeGreaterThan(20);
    expect(r.n120).toBeGreaterThan(10);
    expect(r.bad).toEqual([]);
  });

  test('песочница: блоки игрока боты не удаляют и не перекрашивают', async ({ page }) => {
    await sandbox(page, { bots: 6, botsBuild: true });
    const r = await page.evaluate(() => {
      const g = __blox.game, P = g.place, mine = [];
      // россыпь блоков игрока по всей плите (там, где любят строить боты)
      for (let a = 0; a < 24; a++) {
        const rad = 8 + (a % 6) * 5, i = Math.round(Math.cos(a) * rad), k = Math.round(Math.sin(a) * rad);
        if (P.placeAt(g, i, 0, k, a % 12, true)) mine.push([i, 0, k, a % 12]);
      }
      P.refresh(g);
      __blox.run(60 * 240);
      const left = mine.filter(([i, j, k, c]) => { const b = g.state.cells.get(i + ',' + j + ',' + k); return b && !b.owner && b.c === c; });
      return { mine: mine.length, left: left.length, bots: g.state.botBlocks };
    });
    expect(r.mine).toBeGreaterThan(15);
    expect(r.left).toBe(r.mine);
    expect(r.bots).toBeGreaterThan(0);
  });

  test('песочница: блоков ботов не больше лимита; старые постройки исчезают', async ({ page }) => {
    await sandbox(page, { bots: 6, botsBuild: true });
    const s = await sim(page, 420, 0.5, (g) => ({ n: g.state.botBlocks, cells: Array.from(g.state.cells.values()).filter((c) => c.owner).length, decaying: Array.from(g.state.builds.values()).some((b) => b.decay) }));
    const limit = await page.evaluate(() => __blox.game.place.BOT_LIMIT);
    const max = Math.max(...s.map((x) => x.n));
    expect(max).toBeLessThanOrEqual(limit);
    expect(max).toBeGreaterThan(limit * 0.6);                        // лимит действительно достигается
    for (const x of s) expect(x.cells).toBe(x.n);                    // счётчик честный
    expect(s.some((x) => x.decaying)).toBe(true);
    // было больше - стало меньше: постройки исчезали
    let drop = false;
    for (let i = 10; i < s.length; i++) if (s[i].n < Math.max(...s.slice(i - 10, i).map((x) => x.n)) - 10) drop = true;
    expect(drop).toBe(true);
  });

  test('песочница: при 0 ботов или выключенной стройке блоков нет', async ({ page }) => {
    await sandbox(page, { bots: 0, botsBuild: true });
    expect(await page.evaluate(() => { __blox.run(60 * 90); return [__blox.game.bots.length, __blox.game.state.botBlocks]; })).toEqual([0, 0]);
    await page.evaluate(() => { __blox.leave(); localStorage.setItem('mix.blox.place.sandbox', JSON.stringify({ bots: 4, botsBuild: false })); __blox.enter('sandbox'); });
    const r = await page.evaluate(() => { __blox.run(60 * 90); const g = __blox.game; return { bots: g.bots.length, blocks: g.state.botBlocks, cells: g.state.cells.size, idle: Math.max(...g.bots.map((b) => b.mind.maxIdle)) }; });
    expect(r.bots).toBe(4);
    expect(r.blocks).toBe(0);
    expect(r.cells).toBe(0);
  });

  test('песочница: заготовка строится до конца точно по таблице', async ({ page }) => {
    await sandbox(page, { bots: 3, botsBuild: true });
    const r = await page.evaluate(() => {
      const g = __blox.game, st = g.state;
      g.player.teleport(110, 0.01, 110);                               // игрок далеко
      let done = null;
      for (let i = 0; i < 60 * 300 && !done; i += 30) { __blox.run(30); done = Array.from(st.builds.values()).find((b) => b.done && !b.decay); }
      if (!done) return null;
      const bp = __blox.B.data.BLUEPRINTS.find((x) => x.id === done.bp);
      const want = __blox.B.data.blueprintCells(bp, done.main, done.accent).map((c) => [done.i0 + c.di, c.dj, done.k0 + c.dk, c.c].join(',')).sort();
      const got = Array.from(st.cells.values()).filter((c) => c.build === done.id).map((c) => [c.i, c.j, c.k, c.c].join(',')).sort();
      return { bp: bp.id, want, got };
    });
    expect(r).not.toBeNull();
    expect(r.got).toEqual(r.want);
  });

  test('песочница: «Оставить» - постройки ботов становятся твоими и переживают перезагрузку', async ({ page }) => {
    await sandbox(page, { bots: 3, botsBuild: true });
    const n = await page.evaluate(() => { __blox.run(60 * 60); return __blox.game.state.botBlocks; });
    expect(n).toBeGreaterThan(10);
    // без «Оставить» блоки ботов не сохраняются
    expect(await page.evaluate(() => (JSON.parse(localStorage.getItem('mix.blox.sandbox') || '{"blocks":[]}').blocks || []).length)).toBe(0);
    await page.evaluate(() => { __blox.step(1); __blox.game.place.updateKeep(__blox.game); });
    await expect(page.locator('#hb-keep')).toBeVisible();
    await page.locator('#hb-keep').click();
    const kept = await page.evaluate(() => ({ bots: __blox.game.state.botBlocks, saved: JSON.parse(localStorage.getItem('mix.blox.sandbox')).blocks.length }));
    expect(kept.bots).toBe(0);
    expect(kept.saved).toBeGreaterThanOrEqual(n);
    await page.reload();
    await page.waitForFunction(() => window.__blox && __blox.ready);
    await page.evaluate(() => localStorage.setItem('mix.blox.place.sandbox', JSON.stringify({ bots: 0, botsBuild: true })));
    await enter(page, 'sandbox');
    expect(await page.evaluate(() => __blox.game.state.cells.size)).toBe(kept.saved);
  });

  test('песочница: в меню места - число ботов 0..6 и «Боты строят», меняются сразу', async ({ page }) => {
    await openBlox(page, 'seed=7&fast=1');
    await page.evaluate(() => __blox.enter('sandbox'));
    await page.keyboard.press('Escape');
    await page.locator('#g-menu-panel .mtab[data-tab="settings"]').click();
    const row = page.locator('#g-place-set .set-row[data-key="bots"] input');
    await expect(row).toBeVisible();
    await row.fill('5');
    expect(await page.evaluate(() => __blox.game.bots.length)).toBe(5);
    await row.fill('0');
    expect(await page.evaluate(() => __blox.game.bots.length)).toBe(0);
    await page.locator('#g-place-set .set-row[data-key="botsBuild"] button.toggle').click();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mix.blox.place.sandbox')))).toEqual({ bots: 0, botsBuild: false });
    await page.keyboard.press('Escape');
  });

  // ---------- Во всех местах ----------
  for (const id of PLACES) {
    test(`${id}: имена над ботами, реплики по ситуации, никто не стоит без дела и не проходит сквозь стены`, async ({ page }) => {
      await openBlox(page);
      await page.evaluate(() => localStorage.setItem('mix.blox.place.sandbox', JSON.stringify({ bots: 4, botsBuild: true })));
      await enter(page, id);
      const r = await page.evaluate(() => {
        const g = __blox.game, w = g.world;
        g.player.teleport(g.spawn.x, g.spawn.y + 0.01, g.spawn.z);
        const plates = g.bots.map((b) => ({ name: b.name, text: b.np.userData.text, visible: b.np.visible }));
        const still = new Map(), worst = {}, inWall = [];
        const aimless = (goal) => !goal || goal === 'idle' || goal === 'arrived';
        for (let i = 0; i < 60 * 180; i++) {
          __blox.run(1);
          for (const b of g.bots) {
            const p = b.body.pos;
            if (i % 10 === 0 && !b.dead && !(b.ride)) {
              // тело бота не внутри неподвижной твёрдой детали
              for (const c of w.query(p.x - 1, p.z - 1, p.x + 1, p.z + 1)) {
                if (!c.solid || c.spin || c.move || (c.fade && c.fade.state !== 'solid')) continue;
                if (p.x + 0.8 > c.minX && p.x - 0.8 < c.maxX && p.y + 4.9 > c.minY && p.y + 0.1 < c.maxY && p.z + 0.8 > c.minZ && p.z - 0.8 < c.maxZ) { inWall.push(b.name + ' ' + (c.tag || '#') + ' ' + g.time.toFixed(1)); break; }
              }
            }
            // стоит на месте без цели: сколько секунд подряд
            const s = still.get(b) || { x: p.x, z: p.z, t: 0 };
            if (Math.hypot(p.x - s.x, p.z - s.z) > 1 || !aimless(b.mind.goal) || b.dead) { s.x = p.x; s.z = p.z; s.t = 0; } else s.t += 1 / 60;
            still.set(b, s);
            worst[b.name] = Math.max(worst[b.name] || 0, s.t);
          }
        }
        const T = __blox.B.data.BOT_CHAT, lang = 'ru';
        const allowed = new Set([].concat(...Object.values(T.common).map((x) => x[lang]), ...Object.values(T[g.id] || {}).map((x) => x[lang])));
        const names = new Set(g.bots.map((b) => b.name));
        const botLines = g.chatLog.filter((m) => names.has(m.name)).map((m) => m.text);
        const pattern = (t) => [...allowed].some((a) => new RegExp('^' + a.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{\w+\}/g, '.+') + '$').test(t));
        return { plates, worst, inWall, lines: botLines.length, foreign: botLines.filter((t) => !pattern(t)) };
      });
      expect(r.plates.length).toBeGreaterThan(0);
      for (const p of r.plates) { expect(p.text).toBe(p.name); expect(p.visible).toBe(true); }
      for (const [name, t] of Object.entries(r.worst)) expect(t, name).toBeLessThan(10);
      expect(r.inWall).toEqual([]);
      expect(r.lines).toBeGreaterThanOrEqual(3);
      expect(r.foreign).toEqual([]);
    });
  }

  test('застрявший бот (в запертой клетке) сбрасывается на свою контрольную точку', async ({ page }) => {
    await openBlox(page);
    await enter(page, 'obby');
    const r = await page.evaluate(() => {
      const g = __blox.game, w = g.world, b = g.bots[0];
      // клетка из стен на лобби, бот внутри - к следующей плите не пройти
      const x = -34, z = 34;
      for (const [dx, dz, sx, sz] of [[-3, 0, 1, 7], [3, 0, 1, 7], [0, -3, 7, 1], [0, 3, 7, 1]]) w.add({ top: [x + dx, 30, z + dz], size: [sx, 29, sz], color: '#333' });
      w.add({ top: [x, 31, z], size: [7, 1, 7], color: '#333' });
      b.body.teleport(x, 1.01, z);
      __blox.B.bots.resetNav(b, 0);
      const r0 = b.resets;
      for (let i = 0; i < 60 * 40 && b.resets === r0; i++) __blox.run(1);
      const p = b.body.pos;
      return { cp: b.cp, resets: b.resets - r0, out: Math.hypot(p.x - x, p.z - z) > 5 };
    });
    expect(r.cp).toBe(0);
    expect(r.resets).toBeGreaterThan(0);
    expect(r.out).toBe(true);
  });
});
