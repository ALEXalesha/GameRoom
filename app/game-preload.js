// Предзагрузка страницы игры. Странице она НИЧЕГО не даёт: ни мостов, ни функций.
// Её единственная работа - общая громкость приложения.
//
// У Electron нет громкости для одной веб-страницы, есть только «без звука». Поэтому
// громкость делается внутри страницы: всё, что игра подключает к динамикам WebAudio
// (ctx.destination), подключается к нашему усилителю, а уже он - к динамикам.
// Код ставится в мир страницы ДО её скриптов (executeInMainWorld выполняется сразу),
// так что его застаёт даже контекст, созданный при загрузке. Офлайн-контексты (обсчёт
// звука в буфер) не трогаются: там громкость исказила бы данные, а не звук.
// <audio>/<video> и new Audio() (даже вне документа) получают ту же громкость при
// каждом play() и при каждой смене громкости.
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const KEY = 'igroteka.volume';

// Текущая громкость спрашивается у main при КАЖДОЙ загрузке страницы: после F5 или
// перезапуска после сбоя она должна быть сегодняшней, а не той, что была при создании
// вкладки (раньше приходила один раз через аргументы процесса).
let setup = { volume: 1, test: false };
try {
  setup = ipcRenderer.sendSync('igroteka:page-setup') || setup;
} catch {
  /* main не ответил - громкость по умолчанию */
}

function initialVolume() {
  const v = Number(setup.volume);
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1;
}

// Режим проверок: игра не может захватить мышь человека за компьютером, даже если
// разрешение почему-то пройдёт - настоящий requestPointerLock недостижим. Вместо него подмена,
// которая ведёт себя как браузер и записывает вызовы (их сверяют проверки): document.pointerLockElement,
// pointerlockchange; после выхода по Esc (__browserEsc) захват дают только по новому действию
// человека (щелчок, клавиша кроме Esc), как настоящий Chromium.
if (setup.test) {
  try {
    contextBridge.executeInMainWorld({
      func: () => {
        let pl = null, exitAt = 0, gestureAt = 0;
        window.__lockCalls = 0;
        const fire = (t) => setTimeout(() => document.dispatchEvent(new Event(t)));
        Object.defineProperty(Document.prototype, 'pointerLockElement', { configurable: true, get() { return pl; } });
        const stub = function () {
          window.__lockCalls++;
          if (exitAt && gestureAt <= exitAt) { fire('pointerlockerror'); return Promise.reject(new DOMException('нужен новый щелчок', 'SecurityError')); }
          pl = this; fire('pointerlockchange'); return Promise.resolve();
        };
        Object.defineProperty(Element.prototype, 'requestPointerLock', { configurable: true, writable: true, value: stub });
        Object.defineProperty(Document.prototype, 'exitPointerLock', { configurable: true, writable: true, value: function () { if (!pl) return; pl = null; fire('pointerlockchange'); } });
        for (const t of ['mousedown', 'keydown']) window.addEventListener(t, (e) => { if (e.isTrusted && e.code !== 'Escape') gestureAt = performance.now(); }, { capture: true });
        window.__browserEsc = () => { exitAt = performance.now(); if (!pl) return false; pl = null; document.dispatchEvent(new Event('pointerlockchange')); return true; };
      },
    });
  } catch {
    /* см. ниже */
  }
}

try {
  contextBridge.executeInMainWorld({
    func: (key, start) => {
      let volume = start;
      const liveGains = new Set();
      const liveMedia = new Set();
      const apply = (v) => {
        if (v === undefined) return volume; // без аргумента - текущая громкость (её сверяют проверки)
        volume = v;
        for (const ref of liveGains) {
          const g = ref.deref();
          if (g) g.gain.value = v; else liveGains.delete(ref);
        }
        for (const ref of liveMedia) {
          const m = ref.deref();
          if (m) m.volume = v; else liveMedia.delete(ref);
        }
        for (const m of document.querySelectorAll('audio, video')) m.volume = v;
        return v;
      };
      // Ключ - символ, а не имя: странице он не виден при обходе window, и ничего,
      // кроме своей же громкости, через него не сделать.
      Object.defineProperty(window, Symbol.for(key), { value: apply });

      // <audio>, <video> и new Audio(): громкость ставится перед каждым play(), элемент
      // запоминается, чтобы смена громкости дошла и до него, даже если его нет в документе.
      if (window.HTMLMediaElement) {
        const play = HTMLMediaElement.prototype.play;
        const seen = new WeakSet();
        Object.defineProperty(HTMLMediaElement.prototype, 'play', {
          configurable: true, writable: true,
          value: function (...args) {
            this.volume = volume;
            if (!seen.has(this)) { seen.add(this); liveMedia.add(new WeakRef(this)); }
            return play.apply(this, args);
          },
        });
      }

      const AC = window.AudioContext;
      if (!AC || !window.AudioNode) return;
      const masters = new WeakMap();
      const connect = AudioNode.prototype.connect;
      const disconnect = AudioNode.prototype.disconnect;
      const master = (ctx) => {
        let g = masters.get(ctx);
        if (!g) {
          g = ctx.createGain();
          g.gain.value = volume;
          connect.call(g, ctx.destination);
          masters.set(ctx, g);
          liveGains.add(new WeakRef(g));
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
        value: function (...args) {
          // disconnect() без аргументов - отключить ВСЕ выходы. Передать ему undefined
          // нельзя: disconnect(undefined) понимается как «выход 0».
          if (args.length === 0) return disconnect.call(this);
          const [dest, ...rest] = args;
          if (dest instanceof AudioDestinationNode) {
            const g = masters.get(dest.context);
            if (g) return disconnect.call(this, g, ...rest);
          }
          return disconnect.call(this, ...args);
        },
      });
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
