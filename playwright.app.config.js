// Проверки НАСТОЯЩЕГО приложения «Игротека»: запускается Electron, а не страница в
// браузере. Медленные (секунды на запуск) и открывают окна, поэтому отдельной командой:
// npm run test:app. Законы чистых модулей - npm run test:unit, страницы игр - npm test.
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests-app',
  testMatch: '**/*.spec.js',
  fullyParallel: false, // окна на одном экране, замки, фокус - по одному
  workers: 1,
  // Запуск Electron под нагрузкой (другие прогоны на той же машине) доходил до 12 с, а
  // проверка перезапуска запускает и закрывает приложение дважды - запас нужен и дома.
  timeout: 120_000,
  reporter: [['list']],
});
