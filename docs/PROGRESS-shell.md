# Ход работы над приложением «Игротека» (ветка shell)

Всё из задания и из разбора ревьюера сделано (27.09.2026): приложение app/ (10 игр: добавлены tetris и sudoku), значок, картинки карточек, сборка
(dist/Igroteka-1.0.0-Setup.exe и -Portable.exe, по 98 МБ), проверки (35 законов модулей,
60 проверок настоящего приложения в режиме IGROTEKA_TEST (окно за экраном, без захвата мыши), 18 + 29 мутаций), README EN/RU, CHANGELOG,
docs/release-notes/v1.0.0.md, CI на Gitea и GitHub, tools/publish_github.sh.

После переделки игр (minecraft_clone_3d_1, roblox-mini, fps_1, jungle-strike):
- `npm run thumbs` - снять картинки карточек заново;
- `npm run probe:background` - проверить, что игры встают на паузу в фоне;
- `npm run test:app` и `npm run screenshots`.
Имя карточки берётся из <title> страницы, описание - из app/games.js (поправить, если
игра стала другой).

Известное: tests/all-pages.spec.js падает на web/explorer_1 (шрифты Google с сети) - это
не часть приложения, страница не чинена ещё с исходного коммита.
