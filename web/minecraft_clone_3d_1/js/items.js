// Предметы с поведением: сахарный тростник (растёт у воды до 3 блоков), компас (стрелка на точку
// появления, в Нижнем мире крутится), часы (день и ночь по кругу), карты (пустая карта ПКМ - карта
// квадрата 128x128 вокруг героя; пока держишь в руке - дорисовывается и видна на экране).
(function () {
  'use strict';
  const VX = window.VX, G = VX.game, C = VX.core, D = VX.data, B = C.B;
  const W = () => G.world;

  // ---------- Тростник ----------
  const CANE_SOIL = new Set([B.sand, B.grass, B.dirt, B.snow_grass]);
  function caneOk(x, y, z) {
    const w = W(), below = w.getBlock(x, y - 1, z);
    if (below === C.SUGAR_CANE) return true;
    if (!CANE_SOIL.has(below)) return false;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = w.getBlock(x + dx, y - 1, z + dz); if (n > 0 && C.FLUID[n] === 1) return true; }
    return false;
  }
  function place(t, held) {
    if (held.id !== C.SUGAR_CANE) return undefined;
    let { x, y, z } = t.place;
    if (C.BLOCKS[t.id].replaceable) { x = t.x; y = t.y; z = t.z; }
    if (W().getBlock(x, y, z) !== 0 || !caneOk(x, y, z)) return null;
    W().setBlock(x, y, z, C.SUGAR_CANE);
    G.crops[x + ',' + y + ',' + z] = 1;
    if (G.mode === 'survival') G.inv.takeHeld(1);
    VX.audio.play('place', { surface: 'grass' });
    G.swing = 1;
    G.emit('place', { id: held.id });
    return { x, y, z };
  }
  // растёт вверх, пока столбик ниже трёх
  function growCane(x, y, z) {
    const w = W();
    let top = y; while (w.getBlock(x, top + 1, z) === C.SUGAR_CANE) top++;
    let bottom = y; while (w.getBlock(x, bottom - 1, z) === C.SUGAR_CANE) bottom--;
    if (top - bottom + 1 >= 3 || w.getBlock(x, top + 1, z) !== 0) return false;
    w.setBlock(x, top + 1, z, C.SUGAR_CANE);
    return true;
  }
  // тростник без опоры (убрали воду или блок под ним) - выпадает
  function after(x, y, z) {
    const w = W();
    for (const [dx, dy, dz] of [[0, 1, 0], [1, 1, 0], [-1, 1, 0], [0, 1, 1], [0, 1, -1]]) {
      const X = x + dx, Y = y + dy, Z = z + dz;
      if (w.getBlock(X, Y, Z) === C.SUGAR_CANE && !caneOk(X, Y, Z)) { w.setBlock(X, Y, Z, 0); G.popDrops(C.SUGAR_CANE, X, Y, Z); after(X, Y, Z); }
    }
  }

  // ---------- Компас и часы: картинка по положению стрелки ----------
  function variant(id) {
    const info = D.info(id);
    if (info.dynamic === 'compass') {
      if (G.dim !== 'over' || !G.meta) return (Math.floor(performance.now() / 150) * 7) % 16;       // в Нижнем мире и Краю крутится
      const p = G.player, sp = G.meta.spawn;
      const target = Math.atan2(sp.x - p.pos.x, sp.z - p.pos.z);          // угол к цели
      const look = Math.atan2(-Math.sin(p.yaw), -Math.cos(p.yaw));        // угол взгляда
      let rel = (look - target) / (Math.PI * 2);            // по часовой: справа - четверть круга
      rel = ((rel % 1) + 1) % 1;
      return Math.round(rel * 16) % 16;
    }
    if (info.dynamic === 'clock') {
      if (G.dim !== 'over') return (Math.floor(performance.now() / 150) * 5) % 16;
      return Math.floor((((G.ticks % 24000) + 24000) % 24000) / 24000 * 16);
    }
    return 0;
  }
  function sig() {
    let s = '';
    for (let i = 0; i < 9; i++) { const it = G.inv.slots[i]; if (it && D.info(it.id) && D.info(it.id).dynamic) s += i + ':' + variant(it.id) + ','; }
    return s;
  }

  // ---------- Карты ----------
  const MAP = 128;
  // цвета карты по блоку: [r, g, b]; 0 - неизвестно
  const PALETTE = [null, [127, 178, 56], [0, 124, 0], [64, 64, 255], [247, 233, 163], [112, 112, 112], [255, 255, 255], [143, 119, 72], [151, 109, 77], [255, 90, 0], [112, 2, 0], [199, 199, 199], [160, 160, 255], [216, 127, 51]];
  function colorOf(id) {
    const b = C.BLOCKS[id];
    if (!b) return 5;
    if (id === B.grass || id === C.SUGAR_CANE || b.render === 'cross') return 1;
    if (b.render === 'leaves' || id === B.cactus) return 2;
    if (C.FLUID[id] === 1) return 3;
    if (C.FLUID[id] === 2) return 9;
    if (id === B.sand || id === B.sandstone) return 4;
    if (id === B.snow || id === B.snow_grass) return 6;
    if (id === B.ice) return 12;
    if (b.sound === 'wood') return 7;
    if (id === B.dirt || id === B.farmland || id === B.gravel) return 8;
    if (id === C.NETHERRACK || id === C.NETHER_BRICKS || id === C.SOUL_SAND) return 10;
    if (id === B.wool_white || id === B.clay) return 11;
    if (id === B.glowstone || id === B.pumpkin) return 13;
    return 5;
  }
  const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return btoa(s); };
  const unb64 = (s) => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
  const live = new Map();          // номер карты -> Uint8Array пикселей (пока мир открыт)
  function mapData(n) {
    const m = G.meta.maps && G.meta.maps[n];
    if (!m) return null;
    if (!live.has(n)) live.set(n, m.px ? unb64(m.px) : new Uint8Array(MAP * MAP));
    return live.get(n);
  }
  function createMap(held) {
    const p = G.player;
    G.meta.maps = G.meta.maps || {};
    const n = G.meta.mapCount = (G.meta.mapCount || 0) + 1;
    const x0 = Math.floor((p.pos.x + 64) / MAP) * MAP - 64, z0 = Math.floor((p.pos.z + 64) / MAP) * MAP - 64;
    G.meta.maps[n] = { x0, z0, dim: G.dim, px: '' };
    live.set(n, new Uint8Array(MAP * MAP));
    for (let k = 0; k < 12; k++) updateMap(n, 400);
    if (G.mode === 'survival') G.inv.takeHeld(1);
    const st = VX.inv.newStack(D.I.filled_map, 1); st.dmg = n;
    if (!G.inv.held()) G.inv.slots[G.inv.selected] = st;
    else { const left = G.inv.add(D.I.filled_map, 1, n); if (left) G.dropItem(st, true); }
    VX.audio.play('page');
    G.emit('map', { n });
    return 'map';
  }
  // дорисовать карту: столбцы вокруг героя (радиус 48), понемногу за кадр
  const cursor = new Map();
  function updateMap(n, budget) {
    const m = G.meta.maps[n], px = mapData(n);
    if (!m || !px || m.dim !== G.dim) return 0;
    const p = G.player, w = W(), R = 48;
    let i = cursor.get(n) || 0, done = 0;
    for (let k = 0; k < budget; k++, i++) {
      const side = R * 2 + 1, cell = i % (side * side);
      const x = Math.floor(p.pos.x) - R + (cell % side), z = Math.floor(p.pos.z) - R + Math.floor(cell / side);
      if ((x - p.pos.x) ** 2 + (z - p.pos.z) ** 2 > R * R) continue;
      const mx = x - m.x0, mz = z - m.z0;
      if (mx < 0 || mz < 0 || mx >= MAP || mz >= MAP || !w.isLoaded(x, z)) continue;
      let y = G.dim === 'nether' ? 100 : C.CH - 1, id = 0;
      while (y > 0 && (id = w.getBlock(x, y, z)) === 0) y--;
      if (G.dim === 'nether') { while (y > 0 && w.getBlock(x, y, z) !== 0) y--; while (y > 0 && (id = w.getBlock(x, y, z)) === 0) y--; }
      let hn = y;
      if (mz > 0) { let yy = C.CH - 1; while (yy > 0 && w.getBlock(x, yy, z - 1) === 0) yy--; hn = yy; }
      const shade = y > hn ? 2 : y < hn ? 0 : 1;
      px[mz * MAP + mx] = colorOf(id) * 3 + shade;
      done++;
    }
    cursor.set(n, i);
    return done;
  }
  function saveMaps() { if (!G.meta || !G.meta.maps) return; for (const [n, px] of live) if (G.meta.maps[n]) G.meta.maps[n].px = b64(px); }
  // карта на экране, пока она в руке
  let view = null, drawT = 0;
  function drawMap(n) {
    if (!view) { view = document.createElement('canvas'); view.width = view.height = MAP; view.id = 'mapView'; document.getElementById('hud').append(view); }
    const m = G.meta.maps[n], px = mapData(n), g = view.getContext('2d'), im = g.createImageData(MAP, MAP);
    for (let i = 0; i < MAP * MAP; i++) {
      const v = px[i], c = PALETTE[(v / 3) | 0];
      const k = [0.71, 0.86, 1][v % 3];
      const o = i * 4;
      if (!c) { im.data[o] = 214; im.data[o + 1] = 190; im.data[o + 2] = 140; im.data[o + 3] = 255; continue; }
      im.data[o] = c[0] * k; im.data[o + 1] = c[1] * k; im.data[o + 2] = c[2] * k; im.data[o + 3] = 255;
    }
    g.putImageData(im, 0, 0);
    // метка героя - стрелка по взгляду
    const p = G.player, hx = p.pos.x - m.x0, hz = p.pos.z - m.z0;
    if (m.dim === G.dim && hx >= 0 && hz >= 0 && hx < MAP && hz < MAP) {
      g.save(); g.translate(hx, hz); g.rotate(-p.yaw);
      g.fillStyle = '#ffffff'; g.strokeStyle = '#000'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(0, -4); g.lineTo(3, 3); g.lineTo(0, 1.5); g.lineTo(-3, 3); g.closePath(); g.fill(); g.stroke();
      g.restore();
    }
  }
  function tick(dt) {
    const held = G.inv && G.inv.held();
    const showing = held && held.id === D.I.filled_map && G.meta && G.meta.maps && G.meta.maps[held.dmg];
    if (view) view.style.display = showing && G.state === 'play' && !G.hideHud ? 'block' : 'none';
    if (!showing) return;
    updateMap(held.dmg, 300);
    drawT -= dt;
    if (drawT <= 0) { drawT = 0.25; drawMap(held.dmg); if (view) view.style.display = G.state === 'play' && !G.hideHud ? 'block' : 'none'; }
  }
  function use(held) {
    const info = D.info(held.id);
    if (info.key === 'empty_map') return createMap(held);
    return undefined;
  }
  function reset() { live.clear(); cursor.clear(); }

  VX.items = { place, growCane, caneOk, after, variant, sig, createMap, updateMap, mapData, saveMaps, tick, use, reset, colorOf, MAP };
})();
