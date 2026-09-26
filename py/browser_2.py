import sys
import json
import os
from datetime import datetime
from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QLineEdit, QPushButton, QTabWidget, QTabBar, QLabel, QToolBar,
    QStatusBar, QProgressBar, QMenu, QDialog, QListWidget,
    QListWidgetItem, QSplitter, QFrame, QSizePolicy
)
from PyQt6.QtWebEngineWidgets import QWebEngineView
from PyQt6.QtWebEngineCore import QWebEngineProfile, QWebEnginePage
from PyQt6.QtCore import Qt, QUrl, QSize, pyqtSignal, QThread
from PyQt6.QtGui import QIcon, QAction, QKeySequence, QFont, QColor, QPalette, QPixmap


HISTORY_FILE = os.path.expanduser("~/.pybrowser_history.json")
BOOKMARKS_FILE = os.path.expanduser("~/.pybrowser_bookmarks.json")

HOME_URL = "https://www.google.com"

STYLE = """
QMainWindow {
    background: #1a1a2e;
}
QWidget {
    background: #1a1a2e;
    color: #e0e0e0;
    font-family: 'Segoe UI', Arial, sans-serif;
    font-size: 13px;
}
QTabWidget::pane {
    border: none;
    background: #16213e;
}
QTabBar {
    background: #0f3460;
}
QTabBar::tab {
    background: #16213e;
    color: #aaa;
    padding: 6px 16px;
    border: none;
    border-right: 1px solid #0f3460;
    min-width: 120px;
    max-width: 220px;
}
QTabBar::tab:selected {
    background: #1a1a2e;
    color: #e94560;
    border-bottom: 2px solid #e94560;
}
QTabBar::tab:hover:!selected {
    background: #1e2a4a;
    color: #ddd;
}
QLineEdit {
    background: #16213e;
    border: 1px solid #0f3460;
    border-radius: 20px;
    padding: 5px 16px;
    color: #e0e0e0;
    font-size: 13px;
    selection-background-color: #e94560;
}
QLineEdit:focus {
    border: 1px solid #e94560;
    background: #1e2a4a;
}
QPushButton {
    background: transparent;
    border: none;
    color: #aaa;
    font-size: 18px;
    padding: 4px 8px;
    border-radius: 6px;
}
QPushButton:hover {
    background: #16213e;
    color: #e94560;
}
QPushButton:pressed {
    background: #0f3460;
}
QToolBar {
    background: #0f3460;
    border: none;
    padding: 4px 8px;
    spacing: 4px;
}
QStatusBar {
    background: #0f3460;
    color: #888;
    font-size: 11px;
}
QProgressBar {
    background: transparent;
    border: none;
    height: 2px;
}
QProgressBar::chunk {
    background: #e94560;
}
QMenu {
    background: #16213e;
    border: 1px solid #0f3460;
    border-radius: 6px;
    padding: 4px;
}
QMenu::item {
    padding: 6px 20px;
    border-radius: 4px;
}
QMenu::item:selected {
    background: #e94560;
    color: #fff;
}
QMenu::separator {
    height: 1px;
    background: #0f3460;
    margin: 4px 0;
}
QDialog {
    background: #1a1a2e;
}
QListWidget {
    background: #16213e;
    border: 1px solid #0f3460;
    border-radius: 6px;
}
QListWidget::item {
    padding: 8px;
    border-bottom: 1px solid #1a1a2e;
}
QListWidget::item:selected {
    background: #e94560;
    color: #fff;
}
QListWidget::item:hover:!selected {
    background: #1e2a4a;
}
QScrollBar:vertical {
    background: #16213e;
    width: 8px;
    border: none;
}
QScrollBar::handle:vertical {
    background: #0f3460;
    border-radius: 4px;
    min-height: 20px;
}
QScrollBar::handle:vertical:hover {
    background: #e94560;
}
QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {
    height: 0;
}
"""


def load_json(path):
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return []


def save_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


class BrowserTab(QWidget):
    url_changed = pyqtSignal(str)
    title_changed = pyqtSignal(str)
    load_progress = pyqtSignal(int)
    icon_changed = pyqtSignal(object)

    def __init__(self, parent=None):
        super().__init__(parent)
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        self.progress_bar = QProgressBar()
        self.progress_bar.setFixedHeight(2)
        self.progress_bar.setTextVisible(False)
        self.progress_bar.setRange(0, 100)
        self.progress_bar.setValue(0)
        layout.addWidget(self.progress_bar)

        self.webview = QWebEngineView()
        layout.addWidget(self.webview)

        self.webview.urlChanged.connect(lambda u: self.url_changed.emit(u.toString()))
        self.webview.titleChanged.connect(self.title_changed.emit)
        self.webview.loadProgress.connect(self._on_progress)
        self.webview.iconChanged.connect(self.icon_changed.emit)

    def _on_progress(self, val):
        self.progress_bar.setValue(val)
        self.progress_bar.setVisible(val < 100)
        self.load_progress.emit(val)

    def load(self, url):
        if not url.startswith(("http://", "https://", "file://")):
            url = "https://" + url
        self.webview.load(QUrl(url))

    def url(self):
        return self.webview.url().toString()

    def title(self):
        return self.webview.title() or "Новая вкладка"


class HistoryDialog(QDialog):
    def __init__(self, history, parent=None):
        super().__init__(parent)
        self.setWindowTitle("История")
        self.resize(600, 500)
        self.selected_url = None

        layout = QVBoxLayout(self)

        self.list = QListWidget()
        for entry in reversed(history[-200:]):
            item = QListWidgetItem(f"{entry['title']}\n{entry['url']}  •  {entry['time']}")
            item.setData(Qt.ItemDataRole.UserRole, entry["url"])
            self.list.addItem(item)
        self.list.itemDoubleClicked.connect(self._open)
        layout.addWidget(self.list)

        btn_close = QPushButton("Закрыть")
        btn_close.clicked.connect(self.close)
        layout.addWidget(btn_close)

    def _open(self, item):
        self.selected_url = item.data(Qt.ItemDataRole.UserRole)
        self.accept()


class BookmarksDialog(QDialog):
    def __init__(self, bookmarks, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Закладки")
        self.resize(600, 500)
        self.selected_url = None
        self.bookmarks = bookmarks

        layout = QVBoxLayout(self)

        self.list = QListWidget()
        for bm in bookmarks:
            item = QListWidgetItem(f"⭐  {bm['title']}\n    {bm['url']}")
            item.setData(Qt.ItemDataRole.UserRole, bm["url"])
            self.list.addItem(item)
        self.list.itemDoubleClicked.connect(self._open)
        layout.addWidget(self.list)

        btn_row = QHBoxLayout()
        btn_del = QPushButton("Удалить выбранную")
        btn_del.clicked.connect(self._delete)
        btn_close = QPushButton("Закрыть")
        btn_close.clicked.connect(self.close)
        btn_row.addWidget(btn_del)
        btn_row.addStretch()
        btn_row.addWidget(btn_close)
        layout.addLayout(btn_row)

    def _open(self, item):
        self.selected_url = item.data(Qt.ItemDataRole.UserRole)
        self.accept()

    def _delete(self):
        row = self.list.currentRow()
        if row >= 0:
            self.list.takeItem(row)
            del self.bookmarks[row]


class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("PyBrowser")
        self.resize(1280, 800)

        self.history = load_json(HISTORY_FILE)
        self.bookmarks = load_json(BOOKMARKS_FILE)

        self._build_ui()
        self._build_shortcuts()
        self.add_tab(HOME_URL)

    def _build_ui(self):
        self.setStyleSheet(STYLE)

        # Toolbar
        toolbar = QToolBar()
        toolbar.setMovable(False)
        toolbar.setIconSize(QSize(18, 18))
        self.addToolBar(toolbar)

        self.btn_back = QPushButton("←")
        self.btn_back.setToolTip("Назад (Alt+Left)")
        self.btn_back.clicked.connect(self._go_back)
        toolbar.addWidget(self.btn_back)

        self.btn_forward = QPushButton("→")
        self.btn_forward.setToolTip("Вперёд (Alt+Right)")
        self.btn_forward.clicked.connect(self._go_forward)
        toolbar.addWidget(self.btn_forward)

        self.btn_reload = QPushButton("↻")
        self.btn_reload.setToolTip("Обновить (F5)")
        self.btn_reload.clicked.connect(self._reload)
        toolbar.addWidget(self.btn_reload)

        self.btn_home = QPushButton("⌂")
        self.btn_home.setToolTip("Домой")
        self.btn_home.clicked.connect(lambda: self._current_tab().load(HOME_URL))
        toolbar.addWidget(self.btn_home)

        self.url_bar = QLineEdit()
        self.url_bar.setPlaceholderText("Введите адрес или поисковый запрос...")
        self.url_bar.returnPressed.connect(self._navigate)
        toolbar.addWidget(self.url_bar)

        self.btn_bookmark = QPushButton("☆")
        self.btn_bookmark.setToolTip("Добавить закладку (Ctrl+D)")
        self.btn_bookmark.clicked.connect(self._toggle_bookmark)
        toolbar.addWidget(self.btn_bookmark)

        btn_menu = QPushButton("⋮")
        btn_menu.setToolTip("Меню")
        btn_menu.clicked.connect(self._show_menu)
        toolbar.addWidget(btn_menu)

        btn_new_tab = QPushButton("+")
        btn_new_tab.setToolTip("Новая вкладка (Ctrl+T)")
        btn_new_tab.clicked.connect(lambda: self.add_tab(HOME_URL))
        toolbar.addWidget(btn_new_tab)

        # Tabs
        self.tabs = QTabWidget()
        self.tabs.setTabsClosable(True)
        self.tabs.tabCloseRequested.connect(self.close_tab)
        self.tabs.currentChanged.connect(self._on_tab_switch)
        self.setCentralWidget(self.tabs)

        # Status bar
        self.status = QStatusBar()
        self.setStatusBar(self.status)

    def _build_shortcuts(self):
        QAction("new_tab", self, shortcut=QKeySequence("Ctrl+T"),
                triggered=lambda: self.add_tab(HOME_URL)).setParent(self)
        self.addAction(QAction("new_tab", self, shortcut=QKeySequence("Ctrl+T"),
                               triggered=lambda: self.add_tab(HOME_URL)))
        self.addAction(QAction("close_tab", self, shortcut=QKeySequence("Ctrl+W"),
                               triggered=lambda: self.close_tab(self.tabs.currentIndex())))
        self.addAction(QAction("reload", self, shortcut=QKeySequence("F5"),
                               triggered=self._reload))
        self.addAction(QAction("focus_url", self, shortcut=QKeySequence("Ctrl+L"),
                               triggered=lambda: self.url_bar.selectAll() or self.url_bar.setFocus()))
        self.addAction(QAction("bookmark", self, shortcut=QKeySequence("Ctrl+D"),
                               triggered=self._toggle_bookmark))
        self.addAction(QAction("history", self, shortcut=QKeySequence("Ctrl+H"),
                               triggered=self._show_history))
        self.addAction(QAction("next_tab", self, shortcut=QKeySequence("Ctrl+Tab"),
                               triggered=self._next_tab))
        self.addAction(QAction("prev_tab", self, shortcut=QKeySequence("Ctrl+Shift+Tab"),
                               triggered=self._prev_tab))

    def add_tab(self, url=HOME_URL):
        tab = BrowserTab()
        tab.url_changed.connect(lambda u, t=tab: self._on_url_changed(u, t))
        tab.title_changed.connect(lambda title, t=tab: self._on_title_changed(title, t))
        tab.load_progress.connect(lambda val, t=tab: self._on_progress(val, t))

        idx = self.tabs.addTab(tab, "Загрузка...")
        self.tabs.setCurrentIndex(idx)
        tab.load(url)

    def close_tab(self, idx):
        if self.tabs.count() > 1:
            self.tabs.removeTab(idx)
        else:
            self.close()

    def _current_tab(self):
        return self.tabs.currentWidget()

    def _navigate(self):
        text = self.url_bar.text().strip()
        if not text:
            return
        if "." in text and " " not in text:
            url = text
        else:
            url = f"https://www.google.com/search?q={text.replace(' ', '+')}"
        self._current_tab().load(url)

    def _go_back(self):
        self._current_tab().webview.back()

    def _go_forward(self):
        self._current_tab().webview.forward()

    def _reload(self):
        self._current_tab().webview.reload()

    def _on_url_changed(self, url, tab):
        if tab == self._current_tab():
            self.url_bar.setText(url)
            self._update_bookmark_btn(url)
        self._add_to_history(tab)

    def _on_title_changed(self, title, tab):
        idx = self.tabs.indexOf(tab)
        if idx >= 0:
            short = (title[:18] + "...") if len(title) > 20 else title
            self.tabs.setTabText(idx, short or "Новая вкладка")
            if tab == self._current_tab():
                self.setWindowTitle(f"{title} - PyBrowser")

    def _on_progress(self, val, tab):
        if tab == self._current_tab():
            icon = "✕" if val < 100 else "↻"
            self.btn_reload.setText(icon)

    def _on_tab_switch(self, idx):
        tab = self.tabs.widget(idx)
        if tab:
            url = tab.url()
            self.url_bar.setText(url)
            self._update_bookmark_btn(url)
            self.setWindowTitle(f"{tab.title()} - PyBrowser")

    def _add_to_history(self, tab):
        url = tab.url()
        title = tab.title()
        if url and url not in ("about:blank", ""):
            self.history.append({
                "url": url,
                "title": title or url,
                "time": datetime.now().strftime("%d.%m.%Y %H:%M")
            })
            if len(self.history) > 2000:
                self.history = self.history[-2000:]

    def _toggle_bookmark(self):
        tab = self._current_tab()
        url = tab.url()
        title = tab.title()
        existing = [i for i, b in enumerate(self.bookmarks) if b["url"] == url]
        if existing:
            for i in reversed(existing):
                del self.bookmarks[i]
            self.btn_bookmark.setText("☆")
            self.status.showMessage("Закладка удалена", 2000)
        else:
            self.bookmarks.append({"url": url, "title": title})
            self.btn_bookmark.setText("★")
            self.status.showMessage(f"Добавлено: {title}", 2000)

    def _update_bookmark_btn(self, url):
        is_bm = any(b["url"] == url for b in self.bookmarks)
        self.btn_bookmark.setText("★" if is_bm else "☆")

    def _show_menu(self):
        menu = QMenu(self)
        menu.addAction("📖  История  Ctrl+H", self._show_history)
        menu.addAction("⭐  Закладки", self._show_bookmarks)
        menu.addSeparator()
        menu.addAction("🔍  Найти на странице  Ctrl+F", self._find_in_page)
        menu.addSeparator()
        menu.addAction("🏠  Домашняя страница", lambda: self._current_tab().load(HOME_URL))
        menu.addAction("❌  Закрыть вкладку  Ctrl+W",
                       lambda: self.close_tab(self.tabs.currentIndex()))
        menu.exec(self.btn_home.mapToGlobal(self.btn_home.rect().bottomLeft()))

    def _show_history(self):
        dlg = HistoryDialog(self.history, self)
        if dlg.exec() and dlg.selected_url:
            self._current_tab().load(dlg.selected_url)

    def _show_bookmarks(self):
        dlg = BookmarksDialog(self.bookmarks, self)
        if dlg.exec() and dlg.selected_url:
            self._current_tab().load(dlg.selected_url)

    def _find_in_page(self):
        self.status.showMessage("Ctrl+F: поиск пока не реализован в этой версии", 3000)

    def _next_tab(self):
        i = (self.tabs.currentIndex() + 1) % self.tabs.count()
        self.tabs.setCurrentIndex(i)

    def _prev_tab(self):
        i = (self.tabs.currentIndex() - 1) % self.tabs.count()
        self.tabs.setCurrentIndex(i)

    def closeEvent(self, event):
        save_json(HISTORY_FILE, self.history)
        save_json(BOOKMARKS_FILE, self.bookmarks)
        event.accept()


if __name__ == "__main__":
    app = QApplication(sys.argv)
    app.setApplicationName("PyBrowser")

    window = MainWindow()
    window.show()
    sys.exit(app.exec())
