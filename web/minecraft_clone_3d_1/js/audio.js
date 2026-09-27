// Звуки синтезируются WebAudio прямо в игре (ни одного файла): шаги по траве, камню,
// дереву, песку, гравию и снегу, удары и слом блоков, установка, всплеск, урон, подбор,
// щелчок кнопок, голоса животных и зомби, фанфары достижения.
(function () {
  'use strict';
  const VX = window.VX = window.VX || {};
  let ctx = null, master = null, noiseBuf = null;
  let volume = 0.7, muted = false;
  const counts = {};             // сколько раз звучал каждый звук - для проверок

  function init() {
    if (ctx) { if (ctx.state === 'suspended' && !muted) ctx.resume().catch(() => {}); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : volume;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      let seed = 12345;
      for (let i = 0; i < d.length; i++) { seed = (seed * 16807) % 2147483647; d[i] = seed / 1073741823.5 - 1; }
    } catch (e) { ctx = null; }
  }
  function setVolume(v) { volume = Math.max(0, Math.min(1, v)); if (master) master.gain.value = muted ? 0 : volume; }
  function mute(on) {
    muted = !!on;
    if (master) master.gain.value = muted ? 0 : volume;
    if (ctx) { if (muted) ctx.suspend().catch(() => {}); else ctx.resume().catch(() => {}); }
  }

  function env(g, t, a, d, peak) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  function noise(t, dur, type, freq, q, peak, attack) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q || 1;
    const g = ctx.createGain();
    env(g, t, attack || 0.004, dur, peak);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
    return f;
  }
  function tone(t, dur, type, f0, f1, peak, attack) {
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    env(g, t, attack || 0.005, dur, peak);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
    return o;
  }
  // Поверхность: [фильтр, частота, добротность, длительность, громкость]
  const SURF = {
    grass: ['lowpass', 900, 0.7, 0.07, 0.35], stone: ['highpass', 1800, 0.8, 0.05, 0.3], wood: ['bandpass', 420, 1.6, 0.08, 0.5],
    sand: ['bandpass', 3200, 0.6, 0.1, 0.25], gravel: ['bandpass', 1400, 0.9, 0.09, 0.4], snow: ['lowpass', 1600, 0.5, 0.1, 0.3],
    cloth: ['lowpass', 600, 0.5, 0.08, 0.3], glass: ['highpass', 3000, 1, 0.06, 0.25], water: ['lowpass', 700, 0.6, 0.12, 0.2],
  };
  function surf(name) { return SURF[name] || SURF.stone; }

  const SOUNDS = {
    step(t, o) { const s = surf(o.surface); const r = 0.85 + Math.random() * 0.3; noise(t, s[3], s[0], s[1] * r, s[2], s[4] * 0.55); if (o.surface === 'stone') tone(t, 0.04, 'sine', 160, 90, 0.08); },
    hit(t, o) { const s = surf(o.surface); noise(t, s[3] * 0.8, s[0], s[1] * 1.2, s[2], s[4] * 0.45); },
    break(t, o) {
      const s = surf(o.surface);
      for (let k = 0; k < 3; k++) noise(t + k * 0.03, s[3] * 2.2, s[0], s[1] * (0.8 + Math.random() * 0.4), s[2], s[4] * 0.8);
      if (o.surface === 'glass') for (let k = 0; k < 4; k++) tone(t + k * 0.025, 0.12, 'sine', 2400 + Math.random() * 1600, 1800, 0.08);
    },
    place(t, o) { const s = surf(o.surface); noise(t, s[3] * 1.4, s[0], s[1] * 0.8, s[2], s[4]); tone(t, 0.05, 'sine', 140, 80, 0.12); },
    splash() { const t = ctx.currentTime; const f = noise(t, 0.45, 'bandpass', 900, 0.8, 0.5, 0.01); f.frequency.exponentialRampToValueAtTime(260, t + 0.45); },
    swim(t) { noise(t, 0.2, 'bandpass', 500, 0.7, 0.15, 0.02); },
    hurt(t) { tone(t, 0.16, 'square', 320, 140, 0.18); noise(t, 0.08, 'lowpass', 800, 0.6, 0.2); },
    pop(t) { tone(t, 0.08, 'sine', 700 + Math.random() * 200, 1400, 0.2); },
    click(t) { tone(t, 0.04, 'square', 1000, 700, 0.07); noise(t, 0.02, 'highpass', 3000, 1, 0.08); },
    eat(t) { for (let k = 0; k < 3; k++) noise(t + k * 0.13, 0.07, 'bandpass', 1200 + k * 200, 1.4, 0.35); },
    burp(t) { tone(t, 0.25, 'sawtooth', 110, 70, 0.12, 0.03); },
    pig(t) { const o = tone(t, 0.28, 'sawtooth', 190, 150, 0.12, 0.02); o.detune.setValueAtTime(0, t); o.detune.linearRampToValueAtTime(-300, t + 0.28); },
    sheep(t) { for (let k = 0; k < 4; k++) tone(t + k * 0.08, 0.1, 'sawtooth', 430, 400, 0.08, 0.01); },
    zombie(t) { const o = tone(t, 0.9, 'sawtooth', 95, 70, 0.14, 0.15); o.detune.linearRampToValueAtTime(-200, t + 0.9); noise(t, 0.8, 'lowpass', 300, 0.8, 0.1, 0.2); },
    mobhurt(t) { tone(t, 0.12, 'square', 420, 260, 0.12); },
    fire(t) { noise(t, 0.4, 'bandpass', 2500, 0.5, 0.12, 0.05); },
    door_open(t, o) { const s = surf(o.surface); noise(t, 0.12, s[0], s[1] * 0.7, s[2], 0.35); tone(t + 0.02, 0.18, 'sawtooth', 180, 120, 0.05, 0.02); },
    door_close(t, o) { const s = surf(o.surface); noise(t, 0.08, s[0], s[1] * 0.9, s[2], 0.5); tone(t, 0.06, 'sine', 120, 70, 0.2); },
    cow(t) { const o = tone(t, 0.7, 'sawtooth', 120, 95, 0.12, 0.08); o.detune.linearRampToValueAtTime(-150, t + 0.7); },
    chicken(t) { for (let k = 0; k < 3; k++) tone(t + k * 0.07, 0.05, 'square', 900 + k * 80, 700, 0.05); },
    skeleton(t) { for (let k = 0; k < 4; k++) noise(t + k * 0.06, 0.04, 'bandpass', 2200 + k * 300, 4, 0.2); },
    spider(t) { noise(t, 0.35, 'bandpass', 700, 3, 0.18, 0.05); },
    bow(t) { noise(t, 0.15, 'bandpass', 1500, 1.5, 0.3); tone(t, 0.12, 'triangle', 300, 180, 0.08); },
    arrow_hit(t) { noise(t, 0.05, 'bandpass', 1200, 2, 0.35); },
    fizz(t) { noise(t, 0.5, 'highpass', 3500, 0.7, 0.2, 0.02); },
    shear(t) { noise(t, 0.05, 'highpass', 4000, 1, 0.3); noise(t + 0.08, 0.05, 'highpass', 4200, 1, 0.3); },
    hiss(t) { const f = noise(t, 1.4, 'highpass', 2500, 0.5, 0.22, 0.3); f.frequency.linearRampToValueAtTime(4000, t + 1.4); },
    creeper(t) { noise(t, 0.3, 'bandpass', 1800, 1.2, 0.08, 0.05); },
    explode(t) {
      const f = noise(t, 1.6, 'lowpass', 1400, 0.7, 0.9, 0.005); f.frequency.exponentialRampToValueAtTime(120, t + 1.4);
      tone(t, 0.9, 'sine', 70, 30, 0.6, 0.005);
    },
    shield(t) { noise(t, 0.08, 'bandpass', 500, 1.5, 0.5); tone(t, 0.1, 'sine', 160, 90, 0.2); },
    portal(t) { const o = tone(t, 1.8, 'sawtooth', 110, 60, 0.08, 0.4); o.detune.linearRampToValueAtTime(600, t + 1.8); noise(t, 1.6, 'bandpass', 600, 2, 0.12, 0.4); },
    ghast(t) { const o = tone(t, 1.3, 'triangle', 520, 380, 0.12, 0.2); o.detune.linearRampToValueAtTime(-400, t + 1.3); },
    ghast_shoot(t) { tone(t, 0.35, 'sawtooth', 900, 300, 0.12); noise(t, 0.4, 'bandpass', 800, 1, 0.3, 0.05); },
    blaze(t) { noise(t, 0.7, 'bandpass', 400, 0.8, 0.18, 0.2); tone(t, 0.5, 'sawtooth', 90, 70, 0.05, 0.2); },
    blaze_shoot(t) { noise(t, 0.25, 'lowpass', 900, 0.8, 0.3, 0.01); },
    pigman(t) { const o = tone(t, 0.4, 'sawtooth', 150, 110, 0.12, 0.03); o.detune.linearRampToValueAtTime(-300, t + 0.4); },
    piston(t) { noise(t, 0.12, 'bandpass', 700, 1.2, 0.35); tone(t, 0.1, 'square', 220, 140, 0.06); },
    slime(t) { noise(t, 0.18, 'lowpass', 500, 2, 0.3, 0.02); tone(t, 0.15, 'sine', 180, 90, 0.1); },
    achievement(t) { [523, 659, 784, 1047].forEach((f, k) => tone(t + k * 0.09, 0.35, 'triangle', f, f, 0.16)); },
    victory(t) { [392, 523, 659, 784, 659, 784, 1047].forEach((f, k) => tone(t + k * 0.16, 0.5, 'triangle', f, f, 0.18)); },
  };
  function play(name, o) {
    counts[name] = (counts[name] || 0) + 1;
    if (!ctx || muted || volume <= 0) return;
    const fn = SOUNDS[name];
    if (!fn) return;
    try { fn(ctx.currentTime + 0.005, o || {}); } catch (e) { /* звук не обязателен */ }
  }

  VX.audio = { init, play, setVolume, mute, counts, get muted() { return muted; }, get ready() { return !!ctx; }, get state() { return ctx ? ctx.state : 'none'; } };
})();
