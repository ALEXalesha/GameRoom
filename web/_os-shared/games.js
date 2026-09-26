// Игры «Игротеки» для оболочек-ОС (win11_3, macos-tahoe): одна таблица на все системы.
// Окно игры открывает соседнюю папку репозитория (../<dir>/index.html) - полную версию игры,
// поэтому после слияния веток здесь ничего править не нужно: пути те же, содержимое новое.
// Названия - здесь, в одном месте. Цвета и знак - для своего значка в духе системы.
window.OS_GAMES = [
  { id: 'cubes', dir: 'minecraft_clone_3d_1', title: 'Кубический мир', colors: ['#7ccf5a', '#3e8a2f'], glyph: 'cube' },
  { id: 'blox', dir: 'roblox-mini', title: 'Блоксити', colors: ['#5aa9ff', '#2a5bd7'], glyph: 'figure' },
  { id: 'perimeter', dir: 'fps_1', title: 'Операция: Периметр', colors: ['#8a9199', '#3b4148'], glyph: 'sight' },
  { id: 'drift', dir: 'horizon_drift_offline', title: 'Horizon Drift', colors: ['#ff8a4c', '#d6336c'], glyph: 'car' },
  { id: 'dino', dir: 'dino', title: 'Динозавр', colors: ['#d9d9d9', '#8f8f8f'], glyph: 'dino' },
  { id: 'jumper', dir: 'mario', title: 'Платформер', colors: ['#ff6b5a', '#c0392b'], glyph: 'star' },
  { id: 'jungle', dir: 'jungle-strike', title: 'Jungle Strike', colors: ['#6fcf7f', '#1e7a3c'], glyph: 'leaf' },
  { id: 'space', dir: 'space_shooter', title: 'Space Shooter', colors: ['#7b6cff', '#231a5c'], glyph: 'rocket' },
];
// Белые знаки для значков игр (viewBox 0 0 48 48, центр 24,24)
window.OS_GAME_GLYPHS = {
  cube: '<path d="M24 11l12 6.5v13L24 37l-12-6.5v-13z" fill="#fff" opacity=".95"/><path d="M24 24l12-6.5M24 24v13M24 24l-12-6.5" stroke="#3e8a2f" stroke-width="1.6" fill="none"/>',
  figure: '<rect x="18" y="10" width="12" height="11" rx="2.5" fill="#fff"/><rect x="16" y="22" width="16" height="10" rx="2" fill="#fff"/><rect x="17" y="33" width="6" height="6" rx="1.5" fill="#fff"/><rect x="25" y="33" width="6" height="6" rx="1.5" fill="#fff"/>',
  sight: '<circle cx="24" cy="24" r="10" fill="none" stroke="#fff" stroke-width="2.6"/><path d="M24 9v8M24 31v8M9 24h8M31 24h8" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><circle cx="24" cy="24" r="2.2" fill="#fff"/>',
  car: '<path d="M11 27l3-7c.6-1.4 2-2.3 3.5-2.3h13c1.5 0 2.9.9 3.5 2.3l3 7v5a1.5 1.5 0 01-1.5 1.5H12.5A1.5 1.5 0 0111 32z" fill="#fff"/><circle cx="17" cy="32" r="3" fill="#d6336c"/><circle cx="31" cy="32" r="3" fill="#d6336c"/>',
  dino: '<path d="M24 11h9a2 2 0 012 2v5h-6v3h4v2h-4v3c0 5-3 8-7 9v2h-3v-4l-3 2v2h-3v-5l-3-3v-5h2v3l3 2 3-3v-7a3 3 0 013-3z" fill="#fff"/><rect x="27" y="13" width="2.4" height="2.4" fill="#8f8f8f"/>',
  star: '<path d="M24 10l4.2 8.6 9.4 1.3-6.8 6.6 1.6 9.4L24 31.5l-8.4 4.4 1.6-9.4-6.8-6.6 9.4-1.3z" fill="#fff"/>',
  leaf: '<path d="M13 35c0-13 9-22 23-23-1 14-10 23-23 23z" fill="#fff"/><path d="M14 34c6-7 11-12 18-18" stroke="#1e7a3c" stroke-width="1.8" fill="none" stroke-linecap="round"/>',
  rocket: '<path d="M24 9c5 4 7 10 6 18l-6 5-6-5c-1-8 1-14 6-18z" fill="#fff"/><circle cx="24" cy="19" r="2.8" fill="#231a5c"/><path d="M18 27l-4 5 5 1M30 27l4 5-5 1" fill="#fff"/><path d="M22 34l2 5 2-5" fill="#ffb347"/>',
};
