// Достижения: события игры сверяются с таблицей D.ACH (data.js), полученное хранится в мире,
// о каждом - всплывающее окно. Финал игры - победа над эндер-драконом: выход домой через портал
// Края после неё («Конец.») в выживании открывает экран победы с титрами; играть можно дальше.
// «Сердце мира» - обычное достижение (ступень на пути, не второй конец).
(function () {
  'use strict';
  const VX = window.VX;
  const C = VX.core, D = VX.data, B = C.B;
  const G = VX.game;

  function state() {
    if (!G.meta || G.panorama) return null;
    const a = G.meta.ach || (G.meta.ach = { got: {}, progress: {} });
    a.got = a.got || {}; a.progress = a.progress || {};
    return a;
  }
  function on(ev, data) {
    const st = state();
    if (!st) return [];
    const got = D.achieveOn(ev, data, st.progress, st.got);
    for (const a of got) {
      st.got[a.id] = Date.now();
      if (VX.ui && VX.ui.toast) VX.ui.toast(a);
      VX.audio.play('achievement');
      if (a.final) win();
    }
    return got.map((a) => a.id);
  }
  function win() {
    G.meta.won = true;
    VX.audio.play('victory');
    G.saveWorld();
    if (G.mode !== 'survival') return;        // финал с титрами - цель выживания
    // экран победы ждёт своей очереди: если за полторы секунды игрок ушёл в паузу или скрыл
    // вкладку, титры покажутся при возврате в игру, а не потеряются
    G.victoryPending = true;
    G.victoryT = setTimeout(showVictory, G.testMode ? 0 : 1500);
  }
  function showVictory() {
    if (!G.victoryPending) return false;
    if (G.state !== 'play' && G.state !== 'inv') return false;
    G.victoryPending = false;
    if (G.state === 'inv') G.closeContainer();
    G.state = 'victory';
    G.releaseKeys();
    G.unlock();
    if (VX.ui) VX.ui.show('victory');
    return true;
  }
  G.showVictory = showVictory;

  // Дом: из клетки игрока заливка по проходимым клеткам; комната закрыта (заливка
  // не вырвалась наружу), в ней от 6 клеток, а стены, пол и крыша - больше чем наполовину
  // из строительных блоков (пещера не считается)
  const BUILT = new Set([B.oak_planks, B.birch_planks, B.spruce_planks, B.cobblestone, B.bricks, B.stone_bricks, B.glass, B.sandstone,
    B.wool_white, B.wool_red, B.wool_blue, B.wool_yellow, B.wool_green, B.wool_black, B.bookshelf, B.crafting_table, B.mossy_cobblestone,
    B.oak_log, B.birch_log, B.spruce_log, B.furnace, B.furnace + 1, B.furnace + 2, B.furnace + 3, B.furnace_lit, B.furnace_lit + 1, B.furnace_lit + 2, B.furnace_lit + 3]);
  function isHouse(x0, y0, z0) {
    const w = G.world;
    const seen = new Set(), q = [[x0, y0, z0]];
    let built = 0, other = 0;
    const key = (x, y, z) => x + ',' + y + ',' + z;
    seen.add(key(x0, y0, z0));
    while (q.length) {
      const [x, y, z] = q.pop();
      if (seen.size > 300 || y >= C.CH - 2) return false;
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const X = x + dx, Y = y + dy, Z = z + dz, k = key(X, Y, Z);
        if (seen.has(k)) continue;
        const id = w.getBlock(X, Y, Z);
        if (id < 0) return false;
        if (id > 0 && C.SOLID[id]) { seen.add(k); if (BUILT.has(id)) built++; else other++; continue; }
        seen.add(k);
        q.push([X, Y, Z]);
      }
    }
    const inside = seen.size - built - other;
    return inside >= 6 && built > other;
  }
  function checkHouse() {
    const st = state();
    if (!st || st.got.house) return false;
    const p = G.player;
    const ok = isHouse(Math.floor(p.pos.x), Math.floor(p.pos.y + 0.1), Math.floor(p.pos.z));
    if (ok) on('house', {});
    return ok;
  }

  VX.ach = { on, checkHouse, isHouse, win };
})();
