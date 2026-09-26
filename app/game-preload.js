// Предзагрузка страницы игры. Странице она НИЧЕГО не даёт: ни мостов, ни функций.
// Её единственная работа - общая громкость приложения.
//
// У Electron нет громкости для одной веб-страницы, есть только «без звука». Поэтому
// громкость делается внутри страницы: всё, что игра подключает к динамикам WebAudio
// (ctx.destination), подключается к нашему усилителю, а уже он - к динамикам.
// Код ставится в мир страницы ДО её скриптов (executeInMainWorld выполняется сразу),
// так что его застаёт даже контекст, созданный при загрузке. Офлайн-контексты (обсчёт
// звука в буфер) не трогаются: там громкость исказила бы данные, а не звук.
// Элементы <audio>/<video> получают ту же громкость через свойство volume.
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const KEY = 'igroteka.volume';

function initialVolume() {
  const arg = (process.argv || []).find((a) => a.startsWith('--igroteka-volume='));
  const v = arg ? Number(arg.split('=')[1]) : 1;
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1;
}

try {
  contextBridge.executeInMainWorld({
    func: (key, start) => {
      const AC = window.AudioContext;
      if (!AC || !window.AudioNode) return;
      let volume = start;
      const masters = new WeakMap();
      const live = new Set();
      const connect = AudioNode.prototype.connect;
      const disconnect = AudioNode.prototype.disconnect;
      const master = (ctx) => {
        let g = masters.get(ctx);
        if (!g) {
          g = ctx.createGain();
          g.gain.value = volume;
          connect.call(g, ctx.destination);
          masters.set(ctx, g);
          live.add(new WeakRef(g));
        }
        return g;
      };
      const mapDest = (dest) =>
        dest instanceof AudioDestinationNode && dest.context instanceof AC ? master(dest.context) : dest;
      Object.defineProperty(AudioNode.prototype, 'connect', {
        configurable: true, writable: true,
        value: function (dest, ...rest) {
          const real = mapDest(dest);
          const r = connect.call(this, real, ...rest);
          return real === dest ? r : dest; // как у настоящего connect: вернуть то, к чему подключили
        },
      });
      Object.defineProperty(AudioNode.prototype, 'disconnect', {
        configurable: true, writable: true,
        value: function (dest, ...rest) {
          if (dest instanceof AudioDestinationNode) {
            const g = masters.get(dest.context);
            if (g) return disconnect.call(this, g, ...rest);
          }
          return disconnect.call(this, dest, ...rest);
        },
      });
      const media = () => document.querySelectorAll('audio, video');
      const apply = (v) => {
        volume = v;
        for (const ref of live) {
          const g = ref.deref();
          if (g) g.gain.value = v; else live.delete(ref);
        }
        for (const m of media()) m.volume = v;
      };
      // Ключ - символ, а не имя: странице он не виден при обходе window, и ничего,
      // кроме своей же громкости, через него не сделать.
      Object.defineProperty(window, Symbol.for(key), { value: apply });
      document.addEventListener('play', (e) => { if (e.target && 'volume' in e.target) e.target.volume = volume; }, true);
    },
    args: [KEY, initialVolume()],
  });
} catch {
  /* нет executeInMainWorld - игра просто звучит на полную, мутить всё равно можно */
}

ipcRenderer.on('igroteka:volume', (_e, v) => {
  try {
    contextBridge.executeInMainWorld({
      func: (key, value) => { const f = window[Symbol.for(key)]; if (f) f(value); },
      args: [KEY, v],
    });
  } catch {
    /* см. выше */
  }
});
