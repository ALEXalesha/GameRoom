# Кубический мир (web/minecraft_clone_3d_1): ход работы

## Сделано
- Этап 1 (код написан, идёт проверка): ядро js/core.js (блоки 45+, шум, биомы, пещеры, руда, деревья, свет, сетка из видимых граней, AO), потоки через Blob (js/world.js), атлас текстур кодом (js/textures.js), хранилище IndexedDB (js/storage.js), инвентарь (js/inventory.js), игрок и столкновения (js/player.js), небо и сутки (js/sky.js), звуки WebAudio (js/audio.js), игра и ввод (js/game.js), экраны (js/ui.js), крючок __voxel (js/hook.js).
- Законы этапа 1: tests/web/minecraft_clone_3d_1.spec.js, помощник tests/web/_voxel-helpers.js.

## Дальше
- Прогнать законы этапа 1, починить, мутации, снимки, замер кадров.
- Этап 2: js/entities.js (выпадение, мобы), js/ach.js (достижения, победа), законы выживания.
