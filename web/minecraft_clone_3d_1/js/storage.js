// Хранилище миров. Основное - IndexedDB (в Chromium работает и по file://): куски мира
// большие, localStorage для них мал. Если IndexedDB нет - localStorage (с предупреждением,
// что места мало), если нет и его - память вкладки (мир не переживёт перезагрузку, и игра
// честно об этом пишет в списке миров).
(function () {
  'use strict';
  const VX = window.VX = window.VX || {};
  const C = VX.core;
  const DB_NAME = 'cubeworld', DB_VER = 1;
  const LS = 'cw2_';

  let db = null;
  let kind = 'memory';
  const mem = { worlds: new Map(), chunks: new Map() };
  let pending = 0;
  const waiters = [];
  function begin() { pending++; }
  function done() { pending--; if (pending === 0) while (waiters.length) waiters.shift()(); }

  function lsOk() {
    try { localStorage.setItem(LS + 'probe', '1'); localStorage.removeItem(LS + 'probe'); return true; } catch (e) { return false; }
  }
  function init() {
    return new Promise((resolve) => {
      let finished = false;
      const fallback = () => { if (finished) return; finished = true; kind = lsOk() ? 'local' : 'memory'; resolve(kind); };
      try {
        if (!window.indexedDB) return fallback();
        const rq = indexedDB.open(DB_NAME, DB_VER);
        rq.onupgradeneeded = () => {
          const d = rq.result;
          if (!d.objectStoreNames.contains('worlds')) d.createObjectStore('worlds', { keyPath: 'id' });
          if (!d.objectStoreNames.contains('chunks')) d.createObjectStore('chunks');
        };
        rq.onsuccess = () => { if (finished) return; finished = true; db = rq.result; kind = 'idb'; resolve(kind); };
        rq.onerror = fallback;
        rq.onblocked = fallback;
        setTimeout(fallback, 3000);
      } catch (e) { fallback(); }
    });
  }
  function tx(store, mode, fn) {
    return new Promise((resolve, reject) => {
      begin();
      let t;
      try { t = db.transaction(store, mode); } catch (e) { done(); reject(e); return; }
      const os = t.objectStore(store);
      let result;
      Promise.resolve(fn(os, (r) => { result = r; })).catch(() => {});
      t.oncomplete = () => { done(); resolve(result); };
      t.onerror = () => { done(); reject(t.error); };
      t.onabort = () => { done(); reject(t.error); };
    });
  }
  const req = (r, set) => { r.onsuccess = () => set(r.result); };
  const chunkKey = (w, cx, cz) => w + '|' + cx + '|' + cz;

  // Упаковка в строку для localStorage
  function toB64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return btoa(s); }
  function fromB64(s) { const b = atob(s); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }

  // ---------- Миры ----------
  async function listWorlds() {
    let list = [];
    if (kind === 'idb') list = await tx('worlds', 'readonly', (os, set) => req(os.getAll(), set)) || [];
    else if (kind === 'local') {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k.startsWith(LS + 'w_')) try { list.push(JSON.parse(localStorage.getItem(k))); } catch (e) { /* битая запись */ }
      }
    } else list = [...mem.worlds.values()].map((w) => JSON.parse(JSON.stringify(w)));
    for (const w of list) w.size = await worldSize(w.id, w);
    list.sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0));
    return list;
  }
  async function getWorld(id) {
    if (kind === 'idb') return tx('worlds', 'readonly', (os, set) => req(os.get(id), set));
    if (kind === 'local') { try { return JSON.parse(localStorage.getItem(LS + 'w_' + id)); } catch (e) { return null; } }
    const w = mem.worlds.get(id); return w ? JSON.parse(JSON.stringify(w)) : null;
  }
  async function putWorld(w) {
    const copy = JSON.parse(JSON.stringify(w));
    if (kind === 'idb') return tx('worlds', 'readwrite', (os) => { os.put(copy); });
    if (kind === 'local') { try { localStorage.setItem(LS + 'w_' + w.id, JSON.stringify(copy)); } catch (e) { VX.onStorageFull && VX.onStorageFull(); } return; }
    mem.worlds.set(w.id, copy);
  }
  async function deleteWorld(id) {
    if (kind === 'idb') {
      await tx('chunks', 'readwrite', (os) => { os.delete(IDBKeyRange.bound(id + '|', id + '|￿')); });
      return tx('worlds', 'readwrite', (os) => { os.delete(id); });
    }
    if (kind === 'local') {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k === LS + 'w_' + id || k.startsWith(LS + 'c_' + id + '|')) keys.push(k); }
      keys.forEach((k) => localStorage.removeItem(k));
      return;
    }
    mem.worlds.delete(id);
    for (const k of [...mem.chunks.keys()]) if (k.startsWith(id + '|')) mem.chunks.delete(k);
  }
  async function worldSize(id, meta) {
    let n = JSON.stringify(meta || {}).length;
    if (kind === 'idb') {
      n += await tx('chunks', 'readonly', (os, set) => {
        let s = 0;
        const cur = os.openCursor(IDBKeyRange.bound(id + '|', id + '|￿'));
        cur.onsuccess = () => { const c = cur.result; if (c) { s += c.value.byteLength || 0; c.continue(); } else set(s); };
      }) || 0;
    } else if (kind === 'local') {
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith(LS + 'c_' + id + '|')) n += localStorage.getItem(k).length * 0.75; }
    } else for (const [k, v] of mem.chunks) if (k.startsWith(id + '|')) n += v.byteLength;
    return Math.round(n);
  }

  // ---------- Куски ----------
  async function getChunk(w, cx, cz) {
    const k = chunkKey(w, cx, cz);
    let packed = null;
    if (kind === 'idb') packed = await tx('chunks', 'readonly', (os, set) => req(os.get(k), set));
    else if (kind === 'local') { const s = localStorage.getItem(LS + 'c_' + k); packed = s ? fromB64(s) : null; }
    else packed = mem.chunks.get(k) || null;
    return packed ? C.rleDecode(new Uint8Array(packed)) : null;
  }
  // Набор кусков одной транзакцией: ключи 'cx,cz' -> данные или null
  async function getChunks(w, list) {
    const out = new Map();
    if (kind === 'idb') {
      await tx('chunks', 'readonly', (os) => {
        for (const [cx, cz] of list) {
          const r = os.get(chunkKey(w, cx, cz));
          r.onsuccess = () => out.set(cx + ',' + cz, r.result ? C.rleDecode(new Uint8Array(r.result)) : null);
        }
      });
      return out;
    }
    for (const [cx, cz] of list) out.set(cx + ',' + cz, await getChunk(w, cx, cz));
    return out;
  }
  async function putChunk(w, cx, cz, data) {
    const packed = C.rleEncode(data);
    const k = chunkKey(w, cx, cz);
    if (kind === 'idb') return tx('chunks', 'readwrite', (os) => { os.put(packed, k); });
    if (kind === 'local') { try { localStorage.setItem(LS + 'c_' + k, toB64(packed)); } catch (e) { VX.onStorageFull && VX.onStorageFull(); } return; }
    mem.chunks.set(k, packed);
  }

  // Дождаться, пока все записи дойдут до диска
  function flush() { return pending === 0 ? Promise.resolve() : new Promise((r) => waiters.push(r)); }

  // ---------- Настройки (маленькие - в localStorage) ----------
  const SET_KEY = 'cubeworld_settings_v2';
  function loadSettings() { try { return JSON.parse(localStorage.getItem(SET_KEY) || 'null'); } catch (e) { return null; } }
  function saveSettings(s) { try { localStorage.setItem(SET_KEY, JSON.stringify(s)); return true; } catch (e) { return false; } }

  VX.store = {
    init, listWorlds, getWorld, putWorld, deleteWorld, getChunk, getChunks, putChunk, flush, worldSize, loadSettings, saveSettings,
    get kind() { return kind; }, get pending() { return pending; },
  };
})();
