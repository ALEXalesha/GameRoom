import sys
from PyQt5.QtCore import QUrl
from PyQt5.QtGui import QIcon
from PyQt5.QtWidgets import (
    QApplication, QMainWindow, QToolBar, QAction, QLineEdit,
    QTabWidget, QWidget, QVBoxLayout, QStatusBar
)
from PyQt5.QtWebEngineWidgets import QWebEngineView


class Browser(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Мини-браузер")
        self.resize(1200, 800)

        self.tabs = QTabWidget()
        self.tabs.setTabsClosable(True)
        self.tabs.setMovable(True)
        self.tabs.tabCloseRequested.connect(self.close_tab)
        self.tabs.currentChanged.connect(self.on_tab_changed)
        self.setCentralWidget(self.tabs)

        self.setStatusBar(QStatusBar(self))

        nav = QToolBar("Навигация")
        self.addToolBar(nav)

        back = QAction("←", self)
        back.setStatusTip("Назад")
        back.triggered.connect(lambda: self.current_view().back())
        nav.addAction(back)

        forward = QAction("→", self)
        forward.setStatusTip("Вперёд")
        forward.triggered.connect(lambda: self.current_view().forward())
        nav.addAction(forward)

        reload = QAction("⟳", self)
        reload.setStatusTip("Обновить")
        reload.triggered.connect(lambda: self.current_view().reload())
        nav.addAction(reload)

        home = QAction("🏠", self)
        home.setStatusTip("Домой")
        home.triggered.connect(self.go_home)
        nav.addAction(home)

        new_tab = QAction("+", self)
        new_tab.setStatusTip("Новая вкладка")
        new_tab.triggered.connect(lambda: self.add_tab())
        nav.addAction(new_tab)

        self.url_bar = QLineEdit()
        self.url_bar.returnPressed.connect(self.navigate_to_url)
        nav.addWidget(self.url_bar)

        self.add_tab(QUrl("https://www.google.com"), "Домашняя")

    def add_tab(self, url=None, label="Новая вкладка"):
        if url is None:
            url = QUrl("https://www.google.com")

        view = QWebEngineView()
        view.setUrl(url)

        i = self.tabs.addTab(view, label)
        self.tabs.setCurrentIndex(i)

        view.urlChanged.connect(lambda qurl, v=view: self.update_url_bar(qurl, v))
        view.loadFinished.connect(
            lambda ok, v=view: self.tabs.setTabText(
                self.tabs.indexOf(v), v.page().title()[:20] or "Без названия"
            )
        )

    def close_tab(self, i):
        if self.tabs.count() < 2:
            return
        self.tabs.removeTab(i)

    def current_view(self):
        return self.tabs.currentWidget()

    def on_tab_changed(self, i):
        view = self.current_view()
        if view:
            self.update_url_bar(view.url(), view)

    def update_url_bar(self, qurl, view):
        if view != self.current_view():
            return
        self.url_bar.setText(qurl.toString())
        self.url_bar.setCursorPosition(0)

    def navigate_to_url(self):
        text = self.url_bar.text().strip()
        if not text:
            return
        if "." in text and " " not in text:
            if not text.startswith(("http://", "https://")):
                text = "https://" + text
            self.current_view().setUrl(QUrl(text))
        else:
            self.current_view().setUrl(QUrl(f"https://www.google.com/search?q={text}"))

    def go_home(self):
        self.current_view().setUrl(QUrl("https://www.google.com"))


if __name__ == "__main__":
    app = QApplication(sys.argv)
    app.setApplicationName("Мини-браузер")
    window = Browser()
    window.show()
    sys.exit(app.exec_())
