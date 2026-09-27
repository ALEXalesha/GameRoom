// Звук Блоксити: всё синтезируется на лету (Web Audio), никаких файлов и чужих семплов.
// Общая громкость -> музыка и эффекты, значения из настроек в игре.
'use strict';
(function (B) {
  let ctx = null, master = null, musicBus = null, sfxBus = null, noiseBuf = null;
  const S = B.sound = { played: [] };

  function ensure() {
    if (ctx) return ctx;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.connect(ctx.destination);
      musicBus = ctx.createGain(); musicBus.connect(master);
      sfxBus = ctx.createGain(); sfxBus.connect(master);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      let x = 12345;
      for (let i = 0; i < d.length; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; d[i] = x / 0x3fffffff - 1; }
      S.applyVolumes();
    } catch (e) { ctx = null; }
    return ctx;
  }
  S.applyVolumes = function () {
    if (!ctx) return;
    const g = B.gameSettings.all();
    master.gain.value = g.volMaster;
    musicBus.gain.value = g.volMusic * 0.35;
    sfxBus.gain.value = g.volSfx;
  };
  B.on('gamesettings', S.applyVolumes);
  S.resume = () => { if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {}); };
  S.suspend = () => { if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {}); };
  S.state = () => (ctx ? ctx.state : 'none');
  S.levels = () => (ctx ? { master: master.gain.value, music: musicBus.gain.value, sfx: sfxBus.gain.value } : null);

  function tone(freq, dur, opt = {}) {
    if (!ensure()) return;
    const t = ctx.currentTime + (opt.delay || 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = opt.type || 'triangle';
    o.frequency.setValueAtTime(freq, t);
    if (opt.to) o.frequency.exponentialRampToValueAtTime(opt.to, t + dur);
    const v = opt.vol == null ? 0.2 : opt.vol;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + (opt.attack || 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(opt.bus || sfxBus);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur, opt = {}) {
    if (!ensure()) return;
    const t = ctx.currentTime + (opt.delay || 0);
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = opt.filter || 'bandpass';
    f.frequency.setValueAtTime(opt.freq || 1200, t);
    if (opt.to) f.frequency.exponentialRampToValueAtTime(opt.to, t + dur);
    f.Q.value = opt.q || 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(opt.vol || 0.15, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(sfxBus);
    src.start(t); src.stop(t + dur + 0.05);
  }

  const FX = {
    click() { tone(900, 0.05, { type: 'square', vol: 0.05 }); },
    jump() { noise(0.16, { freq: 500, to: 1800, q: 0.8, vol: 0.09 }); tone(260, 0.1, { to: 420, vol: 0.05 }); },
    land() { noise(0.08, { freq: 300, filter: 'lowpass', vol: 0.12 }); },
    coin() { tone(988, 0.08, { type: 'square', vol: 0.07 }); tone(1319, 0.22, { type: 'square', vol: 0.07, delay: 0.07 }); },
    checkpoint() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, { delay: i * 0.07, vol: 0.12 })); },
    boing() { tone(180, 0.35, { type: 'sine', to: 520, vol: 0.25 }); },
    speed() { noise(0.3, { freq: 800, to: 3000, vol: 0.1 }); },
    place() { noise(0.06, { freq: 900, q: 2, vol: 0.2 }); tone(220, 0.07, { type: 'square', vol: 0.05 }); },
    pop() { tone(700, 0.09, { type: 'sine', to: 200, vol: 0.2 }); noise(0.06, { freq: 2000, vol: 0.08 }); },
    paint() { noise(0.12, { freq: 3000, q: 0.5, vol: 0.06 }); },
    win() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.3, { delay: i * 0.11, vol: 0.13, type: 'triangle' })); },
    lose() { [392, 330, 262].forEach((f, i) => tone(f, 0.3, { delay: i * 0.16, vol: 0.12 })); },
    badge() { [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.25, { delay: i * 0.09, vol: 0.1, type: 'sine' })); },
    chat() { tone(1200, 0.06, { type: 'sine', vol: 0.05 }); },
    buy() { tone(1319, 0.1, { type: 'square', vol: 0.06 }); tone(1760, 0.2, { type: 'square', vol: 0.06, delay: 0.08 }); },
    // Своё «ой» при развале персонажа: пила через два формантных фильтра, голос падает вниз.
    ouch() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(330, t); o.frequency.exponentialRampToValueAtTime(165, t + 0.32);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);
      for (const [fr, q, v] of [[700, 6, 1], [1150, 8, 0.6]]) {
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(fr, t); f.frequency.linearRampToValueAtTime(fr * 0.6, t + 0.3); f.Q.value = q;
        const fg = ctx.createGain(); fg.gain.value = v;
        o.connect(f); f.connect(fg); fg.connect(g);
      }
      g.connect(sfxBus); o.start(t); o.stop(t + 0.4);
      noise(0.25, { freq: 600, to: 150, vol: 0.12, delay: 0.05 });   // стук разлетающихся деталей
    },
  };
  S.play = function (name) {
    S.played.push(name); if (S.played.length > 50) S.played.shift();
    if (FX[name]) FX[name]();
  };

  // ---------- Музыка: мягкий цикл аккордов, свой для каждого места ----------
  const PROG = {
    obby: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [4, 7, 11]],
    race: [[0, 3, 7], [8, 12, 15], [10, 14, 17], [7, 10, 14]],
    lava: [[0, 3, 7], [1, 5, 8], [0, 3, 7], [-2, 2, 5]],
    coins: [[0, 4, 7], [9, 12, 16], [5, 9, 12], [7, 11, 14]],
    sandbox: [[0, 4, 7, 11], [5, 9, 12, 16], [2, 5, 9, 12], [7, 11, 14, 17]],
    tube: [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]],
  };
  let music = null;
  S.startMusic = function (id) {
    S.stopMusic();
    if (!ensure()) return;
    const prog = PROG[id] || PROG.obby;
    const base = id === 'lava' ? 196 : id === 'race' ? 220 : 262;
    const beat = id === 'race' || id === 'lava' ? 0.3 : 0.4;
    let next = ctx.currentTime + 0.2, step = 0;
    const rnd = B.rng(B.hash(id));
    const mel = Array.from({ length: 16 }, () => rnd.int(3));
    const hz = (semi) => base * Math.pow(2, semi / 12);
    const timer = setInterval(() => {
      if (!ctx) return;
      while (next < ctx.currentTime + 0.5) {
        const chord = prog[Math.floor(step / 8) % prog.length];
        const d = next - ctx.currentTime;
        if (step % 8 === 0) for (const n of chord) tone(hz(n - 12), beat * 8, { type: 'sine', vol: 0.05, attack: 0.3, delay: d, bus: musicBus });
        if (step % 2 === 0) tone(hz(chord[mel[step % 16]] + 12), beat * 1.6, { type: 'triangle', vol: 0.035, delay: d, bus: musicBus });
        if (step % 4 === 0) tone(hz(chord[0] - 24), beat * 2, { type: 'sine', vol: 0.08, delay: d, bus: musicBus });
        next += beat; step++;
      }
    }, 120);
    music = { id, timer };
  };
  S.stopMusic = function () { if (music) { clearInterval(music.timer); music = null; } };
  S.musicId = () => (music ? music.id : null);
})(window.Blox);
