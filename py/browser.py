"""PyBrowser: браузер с вкладками на PySide6 + QtWebEngine (движок Chromium).

При запуске сеть не нужна: первая вкладка - своя стартовая страница с закладками.
Если страница не открылась (нет сети, сайт не существует, сервер не отвечает),
вкладка честно показывает, что случилось, и даёт кнопку «Повторить».
История и закладки хранятся в py/data/browser.json.

Запуск: python browser.py [адрес]
"""

from __future__ import annotations

import html
import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Callable, Optional
from urllib.parse import quote_plus

from PySide6.QtCore import QCoreApplication, QSize, Qt, QUrl, Signal
from PySide6.QtGui import QAction, QKeySequence
from PySide6.QtWidgets import (
    QApplication, QDialog, QHBoxLayout, QLabel, QLineEdit, QListWidget, QListWidgetItem,
    QMainWindow, QMenu, QMessageBox, QProgressBar, QPushButton, QTabWidget, QToolBar,
    QToolButton, QVBoxLayout, QWidget,
)

import qt_theme

SEARCH_URL = "https://duckduckgo.com/?q={}"
HISTORY_LIMIT = 2000
START_TITLE = "Новая вкладка"

# ─── АДРЕСНАЯ СТРОКА ─────────────────────────────────────────────────────────

_HOST_RE = re.compile(
    r"^(localhost|\d{1,3}(\.\d{1,3}){3}|\[[0-9a-fA-F:]+\]|([\w-]+\.)+[a-zA-ZЀ-ӿ]{2,})(:\d{1,5})?([/?#].*)?$"
)


def to_url(text: str, search_url: str = SEARCH_URL) -> Optional[QUrl]:
    """Что ввели в адресную строку -> адрес. Не похоже на адрес - поиск."""
    text = text.strip()
    if not text:
        return None
    low = text.lower()
    if re.match(r"^(https?|file|about|data):", low):
        return QUrl(text)
    if re.match(r"^[a-zA-Z]:[\\/]", text) or text.startswith("\\\\"):
        return QUrl.fromLocalFile(text)
    if " " not in text and _HOST_RE.match(text):
        local = low.startswith(("localhost", "127.", "[")) or re.match(r"^\d{1,3}(\.\d{1,3}){3}", low)
        return QUrl(("http://" if local else "https://") + text)
    return QUrl(search_url.format(quote_plus(text)))


# ─── ИСТОРИЯ И ЗАКЛАДКИ ──────────────────────────────────────────────────────


class BrowserData:
    """История и закладки в JSON. Пишется сразу после изменения."""

    def __init__(self, path: Path):
        self.path = Path(path)
        self.history: list[dict] = []
        self.bookmarks: list[dict] = []
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
            self.history = [h for h in data.get("history", []) if "url" in h][-HISTORY_LIMIT:]
            self.bookmarks = [b for b in data.get("bookmarks", []) if "url" in b]
        except FileNotFoundError:
            pass
        except (OSError, ValueError, AttributeError):
            os.replace(self.path, self.path.with_suffix(".broken.json"))

    def save(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps({"history": self.history, "bookmarks": self.bookmarks},
                                  ensure_ascii=False, indent=1), encoding="utf-8")
        os.replace(tmp, self.path)

    def visit(self, url: str, title: str):
        if not url.startswith(("http://", "https://", "file:")):
            return
        if self.history and self.history[-1]["url"] == url:
            self.history[-1]["title"] = title or url  # заголовок пришёл позже адреса
        else:
            self.history.append({"url": url, "title": title or url,
                                 "time": datetime.now().strftime("%d.%m.%Y %H:%M")})
            del self.history[:-HISTORY_LIMIT]
        self.save()

    def clear_history(self):
        self.history = []
        self.save()

    def is_bookmarked(self, url: str) -> bool:
        return any(b["url"] == url for b in self.bookmarks)

    def toggle_bookmark(self, url: str, title: str) -> bool:
        """Добавить или убрать закладку; True - теперь в закладках."""
        if self.is_bookmarked(url):
            self.bookmarks = [b for b in self.bookmarks if b["url"] != url]
            self.save()
            return False
        self.bookmarks.append({"url": url, "title": title or url})
        self.save()
        return True

    def remove_bookmark(self, url: str):
        self.bookmarks = [b for b in self.bookmarks if b["url"] != url]
        self.save()


# ─── СТРАНИЦЫ БРАУЗЕРА ───────────────────────────────────────────────────────

PAGE_CSS = """
body { background:#1e1f24; color:#e6e6ea; font-family:'Segoe UI',Arial,sans-serif;
       margin:0; padding:48px 24px; }
main { max-width:680px; margin:0 auto; }
h1 { font-weight:600; font-size:26px; margin:0 0 12px; }
p { color:#9a9cab; line-height:1.5; }
a { color:#6fa8ef; text-decoration:none; } a:hover { text-decoration:underline; }
ul { list-style:none; padding:0; } li { padding:8px 0; border-bottom:1px solid #2f323b; }
.url { color:#9a9cab; font-size:12px; word-break:break-all; }
code { background:#2f323b; padding:2px 6px; border-radius:4px; }
button { background:#4f8fdf; color:white; border:0; border-radius:6px; padding:8px 18px;
         font-size:14px; cursor:pointer; }
"""


def start_page(bookmarks: list[dict]) -> str:
    items = "".join(
        f'<li><a href="{html.escape(b["url"])}">{html.escape(b["title"])}</a>'
        f'<div class="url">{html.escape(b["url"])}</div></li>' for b in bookmarks
    ) or "<li>Закладок пока нет - нажмите ☆ в строке адреса.</li>"
    return (f"<!doctype html><html><head><meta charset='utf-8'><title>{START_TITLE}</title>"
            f"<style>{PAGE_CSS}</style></head><body><main><h1>PyBrowser</h1>"
            "<p>Введите адрес или запрос в строке сверху (Ctrl+L).</p>"
            f"<h2>Закладки</h2><ul>{items}</ul></main></body></html>")


ERROR_TEXTS = {
    -105: "Адрес не найден. Нет подключения к интернету, или такого сайта не существует.",
    -106: "Нет подключения к интернету.",
    -109: "Адрес недоступен.",
    -102: "Сервер отклонил подключение (на этом адресе ничего не запущено).",
    -118: "Сервер не ответил вовремя.",
    -7: "Сервер не ответил вовремя.",
    -101: "Соединение было сброшено.",
    -21: "Сеть изменилась во время загрузки.",
    -137: "Не удалось найти DNS-сервер: похоже, нет сети.",
    -312: "Этот порт браузер не открывает из соображений безопасности.",
    -6: "Файл не найден.",
}


def error_reason(code: int, domain_is_cert: bool = False) -> str:
    if domain_is_cert or -299 <= code <= -200:
        return "Сертификат сайта недействителен, подключение небезопасно."
    return ERROR_TEXTS.get(code, "Страницу не удалось загрузить.")


def error_page(url: str, reason: str, detail: str) -> str:
    return (f"<!doctype html><html><head><meta charset='utf-8'><title>Страница недоступна</title>"
            f"<style>{PAGE_CSS}</style></head><body><main><h1>Не удалось открыть страницу</h1>"
            f"<p id='reason'>{html.escape(reason)}</p><p class='url'>{html.escape(url)}</p>"
            f"<p>Код ошибки: <code>{html.escape(detail)}</code></p>"
            "<p><button onclick=\"location.href='pybrowser:retry'\">Повторить</button></p>"
            "</main></body></html>")


# ─── ВКЛАДКА ─────────────────────────────────────────────────────────────────

from PySide6.QtWebEngineCore import (  # noqa: E402
    QWebEngineDownloadRequest, QWebEngineLoadingInfo, QWebEnginePage, QWebEngineProfile,
    QWebEngineSettings,
)
from PySide6.QtWebEngineWidgets import QWebEngineView  # noqa: E402


class Page(QWebEnginePage):
    """Перехватывает кнопку «Повторить» на странице ошибки."""

    retry_requested = Signal()

    def acceptNavigationRequest(self, url, nav_type, is_main_frame):
        if url.scheme() == "pybrowser":
            self.retry_requested.emit()
            return False
        return super().acceptNavigationRequest(url, nav_type, is_main_frame)


class View(QWebEngineView):
    """Ссылки target=_blank и window.open открываются в новой вкладке."""

    def __init__(self, tab: "BrowserTab"):
        super().__init__()
        self.tab = tab

    def createWindow(self, _type):
        return self.tab.open_new_tab()


class BrowserTab(QWidget):
    url_changed = Signal(str)
    title_changed = Signal(str)
    loading_changed = Signal(bool)
    visited = Signal(str, str)

    def __init__(self, profile: QWebEngineProfile, open_new_tab: Callable[[], "View"],
                 start_html: Callable[[], str]):
        super().__init__()
        self.open_new_tab = open_new_tab
        self.start_html = start_html
        self.target_url = ""  # что пользователь хотел открыть (для «Повторить»)
        self.error: Optional[str] = None  # текст ошибки, если страница не открылась
        self._error_html_pending = False
        self.loading = False
        self.progress = QProgressBar()
        self.progress.setFixedHeight(3)
        self.progress.setTextVisible(False)
        self.progress.hide()
        self.view = View(self)
        self.page = Page(profile, self.view)
        self.view.setPage(self.page)
        self.page.settings().setAttribute(QWebEngineSettings.ErrorPageEnabled, False)
        self.page.retry_requested.connect(self.reload)
        self.page.loadingChanged.connect(self._on_loading)
        self.view.loadProgress.connect(self.progress.setValue)
        self.view.urlChanged.connect(lambda u: self.url_changed.emit(self.url()))
        self.view.titleChanged.connect(self._on_title)
        lay = QVBoxLayout(self)
        lay.setContentsMargins(0, 0, 0, 0)
        lay.setSpacing(0)
        lay.addWidget(self.progress)
        lay.addWidget(self.view, 1)

    def url(self) -> str:
        if self.is_start_page():
            return ""
        return self.target_url if self.error else self.view.url().toString()

    def title(self) -> str:
        if self.is_start_page():
            return START_TITLE
        if self.error:
            return "Страница недоступна"
        return self.view.title() or self.url() or START_TITLE

    def is_start_page(self) -> bool:
        return not self.target_url and not self.error

    def show_start(self):
        self.target_url, self.error = "", None
        self.view.setHtml(self.start_html(), QUrl("about:blank"))
        self.url_changed.emit("")
        self.title_changed.emit(START_TITLE)

    def load(self, url: QUrl):
        self.target_url = url.toString()
        self.error = None
        self.view.load(url)
        self.url_changed.emit(self.target_url)

    def reload(self):
        if self.error or (self.target_url and self.view.url().isEmpty()):
            self.load(QUrl(self.target_url))
        elif self.is_start_page():
            self.show_start()
        else:
            self.view.reload()

    def stop(self):
        self.view.stop()

    def _on_title(self, _title):
        self.title_changed.emit(self.title())
        if not self.error and not self.is_start_page():
            self.visited.emit(self.url(), self.title())

    def _on_loading(self, info: QWebEngineLoadingInfo):
        status = info.status()
        url = info.url()
        real = url.scheme() not in ("about", "data", "")
        self.loading = status == QWebEngineLoadingInfo.LoadStartedStatus
        self.progress.setVisible(self.loading)
        self.loading_changed.emit(self.loading)
        if status == QWebEngineLoadingInfo.LoadStartedStatus and real:
            self.error = None  # новая настоящая загрузка (в т.ч. «Назад» со страницы ошибки)
            self.target_url = url.toString()
        elif status == QWebEngineLoadingInfo.LoadSucceededStatus:
            if real:
                self.target_url = url.toString()
                self.visited.emit(self.url(), self.title())
            elif self._error_html_pending:
                self._error_html_pending = False  # это загрузилась наша страница ошибки
            else:
                self.target_url, self.error = "", None  # вернулись на стартовую
            self.url_changed.emit(self.url())
            self.title_changed.emit(self.title())
        elif status == QWebEngineLoadingInfo.LoadFailedStatus:
            code = info.errorCode()
            if code == -3 or info.errorDomain() == QWebEngineLoadingInfo.HttpStatusCodeDomain:
                return  # загрузку отменили (Стоп, новый адрес) или сервер ответил своей страницей
            failed = url.toString() or self.target_url
            cert = info.errorDomain() == QWebEngineLoadingInfo.CertificateErrorDomain
            self.target_url = failed
            self.error = error_reason(code, cert)
            self._error_html_pending = True
            self.view.setHtml(error_page(failed, self.error, info.errorString() or str(code)),
                              QUrl("about:blank"))
            self.url_changed.emit(failed)
            self.title_changed.emit(self.title())


# ─── ДИАЛОГИ ─────────────────────────────────────────────────────────────────


class ListDialog(QDialog):
    """История или закладки: двойной щелчок открывает, кнопки - удалить/очистить."""

    def __init__(self, title: str, entries: list[dict], on_remove=None, on_clear=None, parent=None):
        super().__init__(parent)
        self.setWindowTitle(title)
        self.resize(640, 480)
        self.selected_url: Optional[str] = None
        lay = QVBoxLayout(self)
        self.filter = QLineEdit()
        self.filter.setPlaceholderText("Найти…")
        self.filter.textChanged.connect(self._apply_filter)
        lay.addWidget(self.filter)
        self.list = QListWidget()
        for e in entries:
            extra = f"   ·   {e['time']}" if "time" in e else ""
            item = QListWidgetItem(f"{e['title']}\n{e['url']}{extra}")
            item.setData(Qt.UserRole, e["url"])
            self.list.addItem(item)
        self.list.itemActivated.connect(self._open)
        lay.addWidget(self.list, 1)
        row = QHBoxLayout()
        if on_remove:
            b = QPushButton("Удалить выбранную")
            b.clicked.connect(lambda: self._remove(on_remove))
            row.addWidget(b)
        if on_clear:
            b = QPushButton("Очистить всё")
            b.clicked.connect(lambda: (on_clear(), self.list.clear()))
            row.addWidget(b)
        row.addStretch(1)
        close = QPushButton("Закрыть")
        close.clicked.connect(self.reject)
        row.addWidget(close)
        lay.addLayout(row)

    def _apply_filter(self, text):
        q = text.casefold()
        for i in range(self.list.count()):
            it = self.list.item(i)
            it.setHidden(q not in it.text().casefold())

    def _open(self, item):
        self.selected_url = item.data(Qt.UserRole)
        self.accept()

    def _remove(self, on_remove):
        item = self.list.currentItem()
        if item:
            on_remove(item.data(Qt.UserRole))
            self.list.takeItem(self.list.row(item))


# ─── ОКНО ────────────────────────────────────────────────────────────────────


def make_profile(off_the_record: bool = False) -> QWebEngineProfile:
    if off_the_record:
        return QWebEngineProfile(QCoreApplication.instance())
    profile = QWebEngineProfile("PyBrowser", QCoreApplication.instance())
    store = qt_theme.data_path("browser_profile")
    profile.setPersistentStoragePath(str(store))
    profile.setCachePath(str(store / "cache"))
    return profile


class BrowserWindow(QMainWindow):
    def __init__(self, start_url: Optional[str] = None, data: Optional[BrowserData] = None,
                 profile: Optional[QWebEngineProfile] = None,
                 ask_download: Optional[Callable[[str], bool]] = None):
        super().__init__()
        self.setWindowTitle("PyBrowser")
        self.resize(1280, 800)
        self.setMinimumSize(640, 420)
        self.data = data or BrowserData(qt_theme.data_path("browser.json"))
        self.profile = profile or make_profile()
        self.profile.downloadRequested.connect(self._on_download)
        self.ask_download = ask_download or self._ask_download
        self._build()
        self.new_tab(start_url)

    # построение

    def _build(self):
        bar = QToolBar()
        bar.setMovable(False)
        bar.setIconSize(QSize(18, 18))
        self.addToolBar(bar)

        def btn(text, tip, slot):
            b = QToolButton()
            b.setText(text)
            b.setToolTip(tip)
            b.clicked.connect(slot)
            bar.addWidget(b)
            return b

        self.btn_back = btn("←", "Назад (Alt+←)", lambda: self.tab().view.back())
        self.btn_forward = btn("→", "Вперёд (Alt+→)", lambda: self.tab().view.forward())
        self.btn_reload = btn("↻", "Обновить (F5)", self._reload_or_stop)
        btn("⌂", "Стартовая страница (Alt+Home)", lambda: self.tab().show_start())
        self.url_bar = QLineEdit()
        self.url_bar.setPlaceholderText("Адрес или поисковый запрос")
        self.url_bar.returnPressed.connect(self.navigate_from_bar)
        bar.addWidget(self.url_bar)
        self.btn_bookmark = btn("☆", "Закладка (Ctrl+D)", self.toggle_bookmark)
        btn("+", "Новая вкладка (Ctrl+T)", lambda: self.new_tab())
        self.btn_menu = btn("⋮", "Меню", self._show_menu)

        self.find_bar = QWidget()
        fl = QHBoxLayout(self.find_bar)
        fl.setContentsMargins(6, 2, 6, 2)
        fl.addWidget(QLabel("Найти на странице:"))
        self.find_edit = QLineEdit()
        self.find_edit.returnPressed.connect(lambda: self.find(self.find_edit.text()))
        self.find_edit.textChanged.connect(self.find)
        fl.addWidget(self.find_edit, 1)
        for text, back in (("▲", True), ("▼", False)):
            b = QToolButton()
            b.setText(text)
            b.clicked.connect(lambda _c=False, bk=back: self.find(self.find_edit.text(), bk))
            fl.addWidget(b)
        self.find_status = QLabel()
        fl.addWidget(self.find_status)
        close = QToolButton()
        close.setText("✕")
        close.clicked.connect(self.close_find)
        fl.addWidget(close)
        self.find_bar.hide()

        self.tabs = QTabWidget()
        self.tabs.setTabsClosable(True)
        self.tabs.setMovable(True)
        self.tabs.setDocumentMode(True)
        self.tabs.tabCloseRequested.connect(self.close_tab)
        self.tabs.currentChanged.connect(self._on_tab_switch)

        central = QWidget()
        cl = QVBoxLayout(central)
        cl.setContentsMargins(0, 0, 0, 0)
        cl.setSpacing(0)
        cl.addWidget(self.tabs, 1)
        cl.addWidget(self.find_bar)
        self.setCentralWidget(central)

        shortcuts = {
            "Ctrl+T": lambda: self.new_tab(), "Ctrl+W": lambda: self.close_tab(self.tabs.currentIndex()),
            "F5": lambda: self.tab().reload(), "Ctrl+R": lambda: self.tab().reload(),
            "Ctrl+L": self._focus_url, "Alt+D": self._focus_url, "Ctrl+D": self.toggle_bookmark,
            "Ctrl+H": self.show_history, "Ctrl+Shift+O": self.show_bookmarks,
            "Ctrl+F": self.open_find, "Escape": self.close_find,
            "Ctrl+Tab": lambda: self._cycle(1), "Ctrl+Shift+Tab": lambda: self._cycle(-1),
            "Alt+Left": lambda: self.tab().view.back(), "Alt+Right": lambda: self.tab().view.forward(),
            "Alt+Home": lambda: self.tab().show_start(),
        }
        for keys, slot in shortcuts.items():
            act = QAction(self)
            act.setShortcut(QKeySequence(keys))
            act.triggered.connect(slot)
            self.addAction(act)

    # вкладки

    def tab(self) -> BrowserTab:
        return self.tabs.currentWidget()

    def new_tab(self, url: Optional[str] = None, switch: bool = True) -> BrowserTab:
        tab = BrowserTab(self.profile, lambda: self.new_tab(switch=True).view,
                         lambda: start_page(self.data.bookmarks))
        tab.url_changed.connect(lambda u, t=tab: self._on_url(t, u))
        tab.title_changed.connect(lambda title, t=tab: self._on_title(t, title))
        tab.loading_changed.connect(lambda busy, t=tab: self._on_busy(t, busy))
        tab.visited.connect(self.data.visit)
        idx = self.tabs.addTab(tab, START_TITLE)
        if switch:
            self.tabs.setCurrentIndex(idx)
        target = to_url(url) if url else None
        if target:
            tab.load(target)
        else:
            tab.show_start()
            self._focus_url()
        return tab

    def close_tab(self, idx: int):
        if idx < 0:
            return
        tab = self.tabs.widget(idx)
        if self.tabs.count() == 1:
            tab.show_start()  # последняя вкладка не закрывает окно, а становится стартовой
            return
        self.tabs.removeTab(idx)
        tab.view.setPage(None)
        tab.page.deleteLater()
        tab.deleteLater()

    def _cycle(self, step: int):
        self.tabs.setCurrentIndex((self.tabs.currentIndex() + step) % self.tabs.count())

    def _on_tab_switch(self, _idx):
        tab = self.tab()
        if tab:
            self.url_bar.setText(tab.url())
            self._update_bookmark_btn()
            self._on_busy(tab, tab.loading)
            self.setWindowTitle(f"{tab.title()} - PyBrowser")

    def _on_url(self, tab, url):
        if tab is self.tab():
            self.url_bar.setText(url)
            self.url_bar.setCursorPosition(0)
            self._update_bookmark_btn()

    def _on_title(self, tab, title):
        idx = self.tabs.indexOf(tab)
        if idx >= 0:
            self.tabs.setTabText(idx, title if len(title) <= 24 else title[:22] + "…")
            self.tabs.setTabToolTip(idx, title)
        if tab is self.tab():
            self.setWindowTitle(f"{title} - PyBrowser")

    def _on_busy(self, tab, busy):
        if tab is self.tab():
            self.btn_reload.setText("✕" if busy else "↻")
            self.btn_reload.setToolTip("Остановить (Esc)" if busy else "Обновить (F5)")

    # навигация

    def navigate_from_bar(self):
        url = to_url(self.url_bar.text())
        if url:
            self.tab().load(url)
            self.tab().view.setFocus()

    def _reload_or_stop(self):
        if self.tab().loading:
            self.tab().stop()
        else:
            self.tab().reload()

    def _focus_url(self):
        self.url_bar.setFocus()
        self.url_bar.selectAll()

    # закладки и история

    def _update_bookmark_btn(self):
        url = self.tab().url() if self.tab() else ""
        self.btn_bookmark.setEnabled(bool(url))
        self.btn_bookmark.setText("★" if url and self.data.is_bookmarked(url) else "☆")

    def toggle_bookmark(self):
        tab = self.tab()
        if not tab.url():
            return
        added = self.data.toggle_bookmark(tab.url(), tab.title())
        self._update_bookmark_btn()
        self.statusBar().showMessage("Закладка добавлена" if added else "Закладка удалена", 2500)

    def show_history(self):
        dlg = ListDialog("История", list(reversed(self.data.history)),
                         on_clear=self.data.clear_history, parent=self)
        if dlg.exec() and dlg.selected_url:
            self.tab().load(QUrl(dlg.selected_url))

    def show_bookmarks(self):
        dlg = ListDialog("Закладки", self.data.bookmarks, on_remove=self._remove_bookmark, parent=self)
        if dlg.exec() and dlg.selected_url:
            self.tab().load(QUrl(dlg.selected_url))

    def _remove_bookmark(self, url):
        self.data.remove_bookmark(url)
        self._update_bookmark_btn()

    def _show_menu(self):
        m = QMenu(self)
        m.addAction("Новая вкладка\tCtrl+T", lambda: self.new_tab())
        m.addAction("История\tCtrl+H", self.show_history)
        m.addAction("Закладки\tCtrl+Shift+O", self.show_bookmarks)
        m.addAction("Найти на странице\tCtrl+F", self.open_find)
        m.addSeparator()
        m.addAction("Закрыть вкладку\tCtrl+W", lambda: self.close_tab(self.tabs.currentIndex()))
        m.exec(self.btn_menu.mapToGlobal(self.btn_menu.rect().bottomLeft()))

    # поиск на странице

    def open_find(self):
        self.find_bar.show()
        self.find_edit.setFocus()
        self.find_edit.selectAll()

    def close_find(self):
        if self.find_bar.isVisible():
            self.find_bar.hide()
            self.tab().page.findText("")
        elif self.tab().loading:
            self.tab().stop()

    def find(self, text: str, backward: bool = False):
        flags = QWebEnginePage.FindFlag.FindBackward if backward else QWebEnginePage.FindFlag(0)

        def done(result):
            n = result.numberOfMatches()
            self.find_status.setText(f"{result.activeMatch()} из {n}" if n else ("нет совпадений" if text else ""))

        self.tab().page.findText(text, flags, done)

    # загрузки

    def _on_download(self, req: QWebEngineDownloadRequest):
        name = req.downloadFileName()
        if not self.ask_download(name):
            req.cancel()
            return
        folder = Path.home() / "Downloads"
        req.setDownloadDirectory(str(folder if folder.is_dir() else Path.home()))
        req.accept()
        self.statusBar().showMessage(f"Скачивается: {name}", 4000)

    def _ask_download(self, name: str) -> bool:
        return QMessageBox.question(self, "Загрузка", f"Скачать файл «{name}» в папку «Загрузки»?") == QMessageBox.Yes


def main() -> int:
    QCoreApplication.setAttribute(Qt.AA_ShareOpenGLContexts)
    app = QApplication.instance() or QApplication(sys.argv)
    qt_theme.apply(app)
    win = BrowserWindow(sys.argv[1] if len(sys.argv) > 1 else None)
    win.show()
    return app.exec()


if __name__ == "__main__":
    sys.exit(main())
