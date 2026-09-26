// Каждая страница из web/ проверяется в Chromium по файловому адресу: страницы
// самостоятельные, сервер им не нужен. Общие законы для всех - tests/all-pages.spec.js,
// законы одной страницы - tests/web/<имя>.spec.js.
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  timeout: process.env.CI ? 90_000 : 30_000,
  reporter: [['list']],
  use: {
    viewport: { width: 1280, height: 800 },
    launchOptions: { args: ['--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required'] },
  },
});
