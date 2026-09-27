// Набор деталей для мест: надписи на плитах, флажки контрольных точек, ёлки и деревья,
// кубок, монеты, итоги с медалью и наградой.
'use strict';
(function (B) {
  const K = B.kit = {};
  B.places = B.places || {};

  // Плоская надпись поверх детали (не участвует в столкновениях)
  K.decal = function (game, text, x, y, z, w, d, bg, fg, rotY) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ map: B.tex.label(text, bg, fg), polygonOffset: true, polygonOffsetFactor: -2 }));
    m.rotation.x = -Math.PI / 2; m.rotation.z = rotY || 0;
    m.position.set(x, y + 0.02, z);
    m.receiveShadow = true;
    game.world.scene.add(m);
    return m;
  };

  // Флажок: шест и полотнище (детали без столкновений)
  K.flag = function (game, x, y, z, color) {
    const w = game.world;
    w.add({ top: [x, y + 7, z], size: [0.3, 7, 0.3], color: '#dfe3ea', mat: 'smooth', solid: false });
    const cloth = w.add({ pos: [x + 1.3, y + 6, z], size: [2.4, 1.6, 0.12], color: color || '#d62d2d', mat: 'smooth', solid: false, dynamic: true });
    return cloth;
  };

  // Ёлка из кубиков
  K.pine = function (game, x, y, z, s = 1, snow) {
    const w = game.world;
    w.add({ top: [x, y + 2 * s, z], size: [1 * s, 2 * s, 1 * s], color: '#8e5a3a', mat: 'smooth', solid: true });
    const g = snow ? ['#2f6f4a', '#f4f8ff'] : ['#1f6f43', '#2f8f53'];
    for (let i = 0; i < 3; i++) {
      const sz = (5 - i * 1.4) * s;
      w.add({ top: [x, y + (2 + (i + 1) * 1.8) * s, z], size: [sz, 1.8 * s, sz], color: i % 2 ? g[1] : g[0], mat: 'smooth', solid: i === 0 });
    }
  };
  // Круглое дерево (крона - кубы)
  K.tree = function (game, x, y, z, s = 1) {
    const w = game.world;
    w.add({ top: [x, y + 4 * s, z], size: [1.2 * s, 4 * s, 1.2 * s], color: '#8e5a3a', mat: 'smooth' });
    w.add({ top: [x, y + 8 * s, z], size: [5 * s, 4 * s, 5 * s], color: '#3fae4a', mat: 'plastic', solid: false });
    w.add({ top: [x, y + 9 * s, z], size: [3 * s, 1 * s, 3 * s], color: '#56c45f', mat: 'plastic', solid: false });
  };

  // Кубок на вершине
  K.trophy = function (game, x, y, z) {
    const g = new THREE.Group();
    const gold = new THREE.MeshPhongMaterial({ color: 0xffc21a, shininess: 100, specular: 0xffee99, emissive: 0x332200 });
    const add = (geo, py) => { const m = new THREE.Mesh(geo, gold); m.position.y = py; m.castShadow = true; g.add(m); return m; };
    add(new THREE.BoxGeometry(3, 0.8, 3), 0.4);
    add(new THREE.CylinderGeometry(0.4, 0.6, 2, 12), 1.8);
    add(new THREE.CylinderGeometry(1.8, 0.7, 2.6, 16, 1, true), 4.1).material.side = THREE.DoubleSide;
    for (const s of [-1, 1]) { const h = add(new THREE.TorusGeometry(0.7, 0.18, 8, 16), 4.3); h.position.x = s * 1.9; h.rotation.y = Math.PI / 2; }
    g.position.set(x, y, z);
    game.world.scene.add(g);
    return g;
  };

  // Монета: вращающийся золотой диск
  let coinGeo = null, coinMat = null;
  K.coin = function (game, x, y, z) {
    coinGeo = coinGeo || new THREE.CylinderGeometry(1, 1, 0.3, 24);
    coinMat = coinMat || new THREE.MeshPhongMaterial({ color: 0xffc21a, emissive: 0x6a4a00, shininess: 90, specular: 0xffffcc });
    coinGeo.userData.shared = coinMat.userData.shared = true;
    const m = new THREE.Mesh(coinGeo, coinMat);
    m.rotation.x = Math.PI / 2; m.position.set(x, y, z); m.castShadow = true;
    m.userData.shared = true;
    game.world.scene.add(m);
    return m;
  };

  // Итог забега: медаль, кубы, рекорд, значки
  K.finishRun = function (game, value, opt = {}) {
    const meta = game.meta;
    const medal = opt.medal !== undefined ? opt.medal : B.data.medalFor(meta.id, value);
    const res = B.acct.finish(meta.id, value, medal, meta.lower);
    if (opt.complete !== false && (opt.complete || medal)) B.acct.completeBadge(meta.id);
    B.sound.play(medal || opt.win ? 'win' : 'lose');
    game.lastFinish = { value, medal, reward: res.reward, record: res.record };
    B.emit('finish', { id: meta.id, value, medal, reward: res.reward });
    return game.lastFinish;
  };

  // Точка контрольного пункта: плита с номером, флажок; касание - сохранить этап
  K.checkpoint = function (game, n, x, y, z, w, d, onReach, rot) {
    const part = game.world.add({ top: [x, y, z], size: [w, 1, d], color: '#c9ccd1', mat: 'plastic', tag: 'cp' + n, data: { n } });
    part.onTouch = (g, p, body) => { if (body === g.player) onReach(n, p); };
    const dec = K.decal(game, String(n), x, y, z, Math.min(w, d) * 0.7, Math.min(w, d) * 0.35, '#2f74d0', '#ffffff', rot);
    part.data.decal = dec;
    const flag = K.flag(game, x - w / 2 + 0.8, y, z - d / 2 + 0.8, '#8a8d93');
    part.data.flag = flag;
    return part;
  };
  K.lightCheckpoint = function (part) {
    const f = part.data.flag;
    if (f && f.mesh) {
      const col = f.mesh.geometry.getAttribute('color');
      for (let i = 0; i < col.count; i++) col.setXYZ(i, 0.25, 0.8, 0.35);
      col.needsUpdate = true;
    }
    if (part.data.decal) part.data.decal.material.map = B.tex.label(String(part.data.n), '#3fae4a', '#ffffff');
  };
  // Погасить флажок (новый забег): серый флажок, синий номер
  K.unlightCheckpoint = function (part) {
    const f = part.data.flag;
    if (f && f.mesh) {
      const col = f.mesh.geometry.getAttribute('color'), c = new THREE.Color('#8a8d93');
      for (let i = 0; i < col.count; i++) col.setXYZ(i, c.r, c.g, c.b);
      col.needsUpdate = true;
    }
    if (part.data.decal) part.data.decal.material.map = B.tex.label(String(part.data.n), '#2f74d0', '#ffffff');
  };
})(window.Blox);
