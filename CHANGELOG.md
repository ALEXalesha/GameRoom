# Changelog / Журнал изменений

## 1.0.0 - 2026-09-26

**EN**

- New: Igroteka, an Electron desktop app with eight games from `web/` in tabs of one
  window: Cube World, Cube Parkour, 3D Shooting Range, Dino Run, Hop-Skip, Horizon Drift,
  Fire Jungle, Space Shooter.
- Each game has its own storage (`persist:<game>` session): records and saves do not mix
  and survive a restart; one game's data can be cleared in the settings.
- Background tabs are detached from the window (paused, no animation frames) and muted.
- Game pages have no Node and no bridges, no network and no access to files outside
  their folder; external links open in the system browser only after a question.
- Keys: Ctrl+T, Ctrl+W, Ctrl+Tab, Ctrl+Shift+Tab, Ctrl+1..9, F11, F5.
- The window remembers its size, position, maximised state and open tabs.
- Settings: reopen tabs, mute background tabs, volume and mute, dark and light theme,
  clearing one game's data, About.
- Own icon drawn by code (`app/assets/logo.svg` -> `icon.ico` 16-256 px).
- Windows builds: NSIS installer (per-user, Russian) and portable.
- Tests: 35 unit laws, 33 checks of the real app; CI on Gitea and GitHub.

**RU**

- Новое: «Игротека», приложение на Electron: восемь игр из `web/` во вкладках одного окна.
- У каждой игры своё хранилище (сеанс `persist:<игра>`): рекорды и сохранения не
  смешиваются и живут после перезапуска; данные одной игры можно стереть в настройках.
- Фоновая вкладка снимается с окна (пауза, кадры не идут) и молчит.
- У страниц игр нет Node и мостов, нет сети и доступа к файлам вне своей папки; ссылки
  наружу открываются в системном браузере только после вопроса.
- Клавиши: Ctrl+T, Ctrl+W, Ctrl+Tab, Ctrl+Shift+Tab, Ctrl+1..9, F11, F5.
- Окно помнит размер, место, развёрнутость и открытые вкладки.
- Настройки: открывать вкладки прошлого раза, глушить фоновые вкладки, громкость и «без
  звука», тёмная и светлая тема, очистка данных одной игры, «О программе».
- Свой значок, нарисованный кодом (`app/assets/logo.svg` -> `icon.ico` 16-256 px).
- Сборки для Windows: установщик NSIS (для одного пользователя, на русском) и portable.
- Проверки: 35 законов модулей, 33 проверки настоящего приложения; CI на Gitea и GitHub.

## 0.1.0

- Pages in `web/` and programs in `py/` fixed up and covered by tests (see `docs/audit/`).
- Страницы `web/` и программы `py/` приведены в порядок и закрыты проверками (см. `docs/audit/`).
