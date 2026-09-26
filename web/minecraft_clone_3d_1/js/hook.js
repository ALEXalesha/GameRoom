// Крючок для проверок: window.__voxel. Состояние игры читается без canvas, время
// двигается шагами step(), мир можно создать, открыть и дождаться загрузки.
(function () {
  'use strict';
  const VX = window.VX, G = VX.game, C = VX.core, D = VX.data;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  async function until(fn, ms) {
    const t0 = performance.now();
    while (!fn()) { if (performance.now() - t0 > (ms || 20000)) throw new Error('не дождались'); await wait(20); }
  }
  const H = window.__voxel = {
    get ready() { return !!G.ready; },
    VX, core: C, data: D, game: G,
    get state() { return G.state; },
    get screen() { return VX.ui.current; },
    get mode() { return G.mode; },
    get player() { return G.player; },
    get inv() { return G.inv; },
    get world() { return G.world; },
    get meta() { return G.meta; },
    get settings() { return G.settings; },
    get ticks() { return G.ticks; },
    get storage() { return VX.store.kind; },
    get entities() { return VX.entities; },
    get ach() { return G.meta && G.meta.ach; },
    // моб перед игроком на расстоянии d (для проверок)
    spawnMob(type, dx, dz) { const p = G.player; return VX.entities.spawnMob(type, p.pos.x + (dx || 0), p.pos.y, p.pos.z + (dz === undefined ? -2 : dz)); },
    // создать мир и войти в него (ждём, пока вокруг построятся куски)
    async newWorld(o) {
      const meta = await G.createWorld(o || {});
      await G.openWorld(meta.id);
      await H.waitLoaded();
      return meta.id;
    },
    async openWorld(id) { await G.openWorld(id); await H.waitLoaded(); },
    async waitLoaded() {
      await until(() => G.state !== 'loading' && G.meta && !G.panorama, 30000);
      H.begin();
      await H.waitIdle();
    },
    // играть без захвата мыши
    begin() { G.testMode = true; if (G.state !== 'play') G.play(); },
    // дождаться, пока потоки построят всё вокруг и записи дойдут до хранилища
    async waitIdle(r) {
      const p = G.player;
      await until(() => G.world.readyAround(p.pos.x, p.pos.z, r === undefined ? 1 : r) && !G.world.jobs.size, 30000);
      await VX.store.flush();
    },
    async flush() { G.world.saveDirty(); await G.saveWorld(); await VX.store.flush(); },
    step(dt, n) { for (let i = 0; i < (n || 1); i++) G.simulate(dt); },
    look(yaw, pitch) { G.player.yaw = yaw; G.player.pitch = pitch; },
    key(code, down) { G.keys[code] = down !== false; },
    getBlock: (x, y, z) => G.world.getBlock(x, y, z),
    setBlock: (x, y, z, id) => G.world.setBlock(x, y, z, id),
    target: () => G.target(),
    breakTarget: () => G.breakTarget(),
    place: () => G.useTarget(),
    pick: () => G.pickTarget(),
    select: (i) => G.select(i),
    mineSeconds: (max) => G.mineSeconds(max || 30),
    pause: () => G.pause(),
    resume: () => G.play(),
    exitToTitle: () => G.exitToTitle(),
    listWorlds: () => VX.store.listWorlds(),
    deleteWorld: (id) => VX.store.deleteWorld(id),
    openInventory: () => G.openContainer('inv'),
    openContainer: (kind, pos) => G.openContainer(kind, pos),
    closeInventory: () => G.closeContainer(),
    get container() { return G.container; },
    // один и тот же кусок из генератора (главный поток)
    genChecksum: (seed, cx, cz) => C.checksum(C.generate(C.seedFrom(String(seed)), cx, cz)),
    chunkChecksum(cx, cz) { const ch = G.world.chunk(cx, cz); return ch && ch.data ? C.checksum(ch.data) : null; },
    chunkInfo(cx, cz) { const ch = G.world.chunk(cx, cz); return ch ? { loaded: !!ch.data, quads: ch.meshes ? ch.meshes.quads : 0, tquads: ch.meshes ? ch.meshes.tquads : 0 } : null; },
    counts: () => G.world.counts(),
    perf() { return VX.ui.perfStats(); },
    resetPerf() { G.perf.frames.length = 0; G.perf.work.length = 0; },
    workStats() {
      const w = G.perf.work.slice(-600);
      if (!w.length) return null;
      const s = w.slice().sort((a, b) => b - a);
      return { avg: w.reduce((a, b) => a + b, 0) / w.length, p99: s[Math.max(0, Math.floor(w.length / 100) - 1)] };
    },
  };
})();
