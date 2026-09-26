# Ход работы над приложением «Игротека» (ветка shell)

Сделано:
- app/: main.js (WebContentsView на игру, сеансы persist:<игра>, скрытие снятием с окна,
  звук, клавиши, вопросы поверх снимка игры, место окна), preload.js, game-preload.js
  (громкость), renderer/ (полоса вкладок, карточки, настройки), tabs.js, settings.js,
  security.js, games.js, product.js (имя - productName в package.json), window-state.js.
- Значок: app/assets/logo.svg -> tools/make-icon.js -> app/assets/icon.ico (16-256) и icon.png.
- Картинки карточек: tools/make-thumbs.js -> app/assets/thumbs/*.jpg.
- tools/probe-background.js: все 8 игр встают на паузу в фоне (blur/hidden).
- tests-app/unit: законы вкладок, настроек, адресов, каталога, места окна (node --test).

Дальше:
- тест значка (кадры 16/32 непустые и контрастные, build.win.icon существует) + мутация;
- tests-app/*.spec.js (Playwright _electron) и playwright.app.config.js;
- сборка electron-builder, размеры; кадры docs/screens/app-*.png;
- README.md / README.ru.md, CHANGELOG.md, docs/release-notes/v1.0.0.md;
- CI .gitea и .github, tools/publish_github.sh; мутации; отчёт.
