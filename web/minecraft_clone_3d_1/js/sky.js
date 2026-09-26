// Небо: сутки по 20 минут (24000 тиков, как в оригинале: 0 - рассвет, 6000 - полдень,
// 12000 - закат, 18000 - полночь), градиент неба, солнце и луна (нарисованы кодом),
// звёзды, облака (быстрые - плоские, красивые - объёмные). Отсюда же - яркость неба
// для освещения блоков и цвет тумана.
(function () {
  'use strict';
  const VX = window.VX = window.VX || {};
  const DAY_TICKS = 24000, DAY_SECONDS = 1200;

  function lerpColor(a, b, t) { return new THREE.Color(a).lerp(new THREE.Color(b), Math.max(0, Math.min(1, t))); }

  function sunTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const g = c.getContext('2d');
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const d = Math.max(Math.abs(x - 15.5), Math.abs(y - 15.5));
      if (d < 8) g.fillStyle = d < 6 ? '#fffbe0' : '#fff2a8';
      else if (d < 15) g.fillStyle = `rgba(255,236,160,${(0.35 * (15 - d) / 7).toFixed(3)})`;
      else continue;
      g.fillRect(x, y, 1, 1);
    }
    return c;
  }
  function moonTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const g = c.getContext('2d');
    const r = VX.core.mulberry32(77);
    for (let y = 8; y < 24; y++) for (let x = 8; x < 24; x++) {
      g.fillStyle = r() < 0.15 ? '#a9adb8' : r() < 0.3 ? '#d7dbe4' : '#c4c8d2';
      g.fillRect(x, y, 1, 1);
    }
    g.fillStyle = '#9095a2';
    for (const [x, y, w] of [[11, 11, 3], [17, 14, 2], [13, 18, 4], [19, 19, 2]]) g.fillRect(x, y, w, w);
    return c;
  }
  const texOf = (canvas) => { const t = new THREE.CanvasTexture(canvas); t.magFilter = t.minFilter = THREE.NearestFilter; return t; };

  function Sky(scene, seed) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.renderOrder = -10;
    scene.add(this.group);
    // купол: цвет по высоте в шейдере
    this.domeU = { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() }, glow: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3() }, glowK: { value: 0 } };
    const dome = new THREE.Mesh(new THREE.SphereGeometry(500, 24, 16), new THREE.ShaderMaterial({
      uniforms: this.domeU, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform vec3 glow; uniform vec3 sunDir; uniform float glowK; varying vec3 vP;
        void main(){ float h = clamp(vP.y * 1.6 + 0.12, 0.0, 1.0); vec3 c = mix(bottom, top, pow(h, 0.8));
          float s = max(0.0, dot(normalize(vec3(vP.x, 0.0, vP.z)), normalize(vec3(sunDir.x, 0.0, sunDir.z))));
          c = mix(c, glow, glowK * pow(s, 6.0) * (1.0 - h)); gl_FragColor = vec4(c, 1.0); }`,
    }));
    dome.renderOrder = -10;
    this.group.add(dome);
    // звёзды
    const r = VX.core.mulberry32(1234);
    const pts = [];
    for (let i = 0; i < 1400; i++) {
      const u = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      pts.push(Math.cos(a) * s * 420, u * 420, Math.sin(a) * s * 420);
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.stars = new THREE.Points(sg, this.starMat);
    this.stars.renderOrder = -9;
    this.group.add(this.stars);
    // солнце и луна
    const q = (tex, size) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: texOf(tex), transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
      m.renderOrder = -8; this.group.add(m); return m;
    };
    this.sun = q(sunTexture(), 90);
    this.moon = q(moonTexture(), 70);
    this.moon.material.blending = THREE.NormalBlending;
    // облака
    this.cloudMap = this.makeCloudMap(seed || 1);
    this.clouds = null;
    this.cloudMode = 2;
  }
  Sky.prototype.makeCloudMap = function (seed) {
    const n = VX.core.makeNoise(seed + 999);
    const N = 64, map = new Uint8Array(N * N);
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      // бесшовная карта: шум на торе
      const a = x / N * Math.PI * 2, b = z / N * Math.PI * 2;
      const v = n.n3(Math.cos(a) * 2.2, Math.sin(a) * 2.2, Math.cos(b) * 2.2 + Math.sin(b) * 1.3) + 0.5 * n.n3(Math.cos(a) * 5, Math.sin(b) * 5, Math.sin(a) * 5 + Math.cos(b) * 3);
      map[x + z * N] = v > 0.28 ? 1 : 0;
    }
    return { N, map };
  };
  Sky.prototype.setClouds = function (mode) {
    // 0 - нет, 1 - плоские, 2 - объёмные
    this.cloudMode = mode;
    if (this.clouds) { this.scene.remove(this.clouds); this.clouds.geometry.dispose(); this.clouds = null; }
    if (!mode) return;
    const { N, map } = this.cloudMap;
    const S = 12, H = mode === 2 ? 4 : 0;
    const pos = [], col = [];
    const on = (x, z) => map[((x % N) + N) % N + (((z % N) + N) % N) * N];
    const quad = (a, b, c, d, k) => { pos.push(...a, ...b, ...c, ...c, ...b, ...d); for (let i = 0; i < 6; i++) col.push(k, k, k); };
    // карта с запасом в полкарты с каждой стороны: вокруг игрока облака без швов
    for (let z = -N / 2; z < N * 1.5; z++) for (let x = -N / 2; x < N * 1.5; x++) {
      if (!on(x, z)) continue;
      const X = x * S, Z = z * S, X1 = X + S, Z1 = Z + S;
      quad([X, H, Z1], [X1, H, Z1], [X, H, Z], [X1, H, Z], 1.0);
      if (!H) continue;
      quad([X, 0, Z], [X1, 0, Z], [X, 0, Z1], [X1, 0, Z1], 0.72);
      if (!on(x - 1, z)) quad([X, 0, Z], [X, 0, Z1], [X, H, Z], [X, H, Z1], 0.84);
      if (!on(x + 1, z)) quad([X1, 0, Z1], [X1, 0, Z], [X1, H, Z1], [X1, H, Z], 0.84);
      if (!on(x, z - 1)) quad([X1, 0, Z], [X, 0, Z], [X1, H, Z], [X, H, Z], 0.9);
      if (!on(x, z + 1)) quad([X, 0, Z1], [X1, 0, Z1], [X, H, Z1], [X1, H, Z1], 0.9);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    this.cloudU = { uCol: { value: new THREE.Color(1, 1, 1) }, uFar: { value: 400 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.cloudU, transparent: true, depthWrite: mode === 2, side: mode === 2 ? THREE.FrontSide : THREE.DoubleSide, vertexColors: true,
      vertexShader: 'varying vec3 vC; varying float vD; void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0); vD = length(mv.xz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform vec3 uCol; uniform float uFar; varying vec3 vC; varying float vD; void main(){ float a = 0.82 * (1.0 - smoothstep(uFar * 0.55, uFar, vD)); gl_FragColor = vec4(vC * uCol, a); }',
    });
    this.clouds = new THREE.Mesh(g, mat);
    this.clouds.frustumCulled = false;
    this.clouds.renderOrder = 2;
    this.scene.add(this.clouds);
  };

  // Состояние суток по тикам: яркость неба 0.2..1, цвета, положение светил
  function dayState(ticks) {
    const t = ((ticks % DAY_TICKS) + DAY_TICKS) % DAY_TICKS;
    const ang = t / DAY_TICKS * Math.PI * 2;           // 0 - солнце на востоке у горизонта
    const h = Math.sin(ang);                             // высота солнца
    const day = Math.max(0, Math.min(1, h * 2.5 + 0.45));
    const dusk = Math.max(0, 1 - Math.abs(h) * 4);       // рассвет/закат
    return { t, ang, h, day, dusk };
  }
  Sky.prototype.update = function (ticks, cam, underwater, fogFar, renderer) {
    const s = dayState(ticks);
    this.state = s;
    const dayTop = new THREE.Color(0x6f9ff5), dayBot = new THREE.Color(0xbcd6ff);
    const nightTop = new THREE.Color(0x02040c), nightBot = new THREE.Color(0x0b1226);
    const top = nightTop.clone().lerp(dayTop, s.day);
    const bot = nightBot.clone().lerp(dayBot, s.day);
    const glow = lerpColor(0xff9a3c, 0xffc070, 0.3);
    this.domeU.top.value.copy(top);
    this.domeU.bottom.value.copy(bot.clone().lerp(glow, s.dusk * 0.45));
    this.domeU.glow.value.copy(glow);
    this.domeU.glowK.value = s.dusk * 0.9;
    const sunDir = new THREE.Vector3(Math.cos(s.ang), Math.sin(s.ang), 0.15).normalize();
    this.domeU.sunDir.value.copy(sunDir);
    this.group.position.copy(cam.position);
    this.sun.position.copy(sunDir).multiplyScalar(380);
    this.sun.lookAt(cam.position);
    this.moon.position.copy(sunDir).multiplyScalar(-380);
    this.moon.lookAt(cam.position);
    this.sun.visible = sunDir.y > -0.25;
    this.moon.visible = sunDir.y < 0.25;
    this.starMat.opacity = Math.max(0, 1 - s.day * 1.6) * 0.9;
    this.stars.rotation.x = s.ang;
    // туман: у горизонта - цвет низа неба; под водой - синий и близкий
    const fog = underwater ? new THREE.Color(0x14307a).multiplyScalar(0.3 + 0.7 * s.day) : bot.clone().lerp(glow, s.dusk * 0.25);
    if (this.clouds) {
      const S = 64 * 12;
      const wind = (ticks / 20) * 0.6;
      const ox = Math.floor((cam.position.x - wind) / S) * S + wind;
      const oz = Math.floor(cam.position.z / S) * S;
      this.clouds.position.set(ox, 108, oz);
      const k = 0.25 + 0.75 * s.day;
      this.cloudU.uCol.value.setRGB(k, k, k * (1 + s.dusk * 0.05)).lerp(new THREE.Color(1, 0.8, 0.65), s.dusk * 0.35 * s.day);
      this.cloudU.uFar.value = Math.max(260, fogFar * 2.2);
    }
    return { day: s.day, fog, sky: bot };
  };

  VX.Sky = Sky;
  VX.dayState = dayState;
  VX.DAY_TICKS = DAY_TICKS;
  VX.DAY_SECONDS = DAY_SECONDS;
})();
