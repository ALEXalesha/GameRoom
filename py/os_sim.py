"""Python95 - рабочий стол в стиле Windows 95 (фан-концепт, не связан с правообладателем).

Окна программ живут внутри рабочего стола (QMdiArea): их можно двигать,
сворачивать в панель задач, разворачивать и закрывать. Программы настоящие -
те же, что лежат рядом: Paint, Проводник, Чат, Мини-компилятор, Браузер,
плюс Блокнот, Корзина и «О системе».

Запуск: python os_sim.py
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Callable, Optional

from PySide6.QtCore import QCoreApplication, QEvent, QPoint, QSize, Qt, QTime, QTimer, Signal
from PySide6.QtGui import QBrush, QColor, QFont, QIcon, QKeySequence, QPainter, QPalette, QPixmap
from PySide6.QtWidgets import (
    QApplication, QFileDialog, QFrame, QHBoxLayout, QLabel, QMainWindow, QMdiArea,
    QMdiSubWindow, QMenu, QMessageBox, QPlainTextEdit, QPushButton, QSizePolicy, QStyle,
    QStyleOption, QVBoxLayout, QWidget,
)

import qt_theme

FAN_NOTE_95 = "Фан-концепт в стиле Windows 95, не связан с правообладателем."
DESKTOP = "#008080"
BAR = "#c0c0c0"

BAR_STYLE = f"""
#taskbar {{ background:{BAR}; border-top:2px solid #ffffff; }}
#taskbar QPushButton {{
    background:{BAR}; color:black; border:2px outset #ffffff; border-radius:0;
    padding:2px 8px; text-align:left;
}}
#taskbar QPushButton:checked {{ border:2px inset #808080; background:#d4d4d4; font-weight:bold; }}
#taskbar QPushButton#start {{ font-weight:bold; text-align:center; }}
#clock {{ color:black; border:1px inset #808080; padding:2px 8px; }}
"""

# ─── БЛОКНОТ ─────────────────────────────────────────────────────────────────


class NotepadWindow(QMainWindow):
    """Простой блокнот: открыть, сохранить, вопрос о несохранённом."""

    def __init__(self, ask_unsaved: Optional[Callable[[], str]] = None):
        super().__init__()
        self.ask_unsaved = ask_unsaved or self._ask_unsaved
        self.path: Optional[Path] = None
        self.edit = QPlainTextEdit()
        f = QFont("Consolas")
        f.setStyleHint(QFont.Monospace)
        f.setPointSize(11)
        self.edit.setFont(f)
        self.edit.document().modificationChanged.connect(lambda _m: self._title())
        self.setCentralWidget(self.edit)
        m = self.menuBar().addMenu("Файл")
        for text, slot, keys in (("Новый", self.new, QKeySequence.New),
                                 ("Открыть…", self._open_dialog, QKeySequence.Open),
                                 ("Сохранить", self.save, QKeySequence.Save),
                                 ("Сохранить как…", self.save_as, "Ctrl+Shift+S")):
            act = m.addAction(text)
            act.triggered.connect(slot)
            act.setShortcut(QKeySequence(keys))
        self._title()

    def _title(self):
        name = self.path.name if self.path else "Без имени"
        self.setWindowTitle(f"{'*' if self.edit.document().isModified() else ''}{name} - Блокнот")

    def maybe_save(self) -> bool:
        if not self.edit.document().isModified():
            return True
        answer = self.ask_unsaved()
        if answer == "save":
            return self.save()
        return answer == "discard"

    def _ask_unsaved(self) -> str:
        r = QMessageBox.question(self, "Блокнот", "Сохранить изменения?",
                                 QMessageBox.Save | QMessageBox.Discard | QMessageBox.Cancel)
        return {QMessageBox.Save: "save", QMessageBox.Discard: "discard"}.get(r, "cancel")

    def new(self):
        if self.maybe_save():
            self.edit.clear()
            self.path = None
            self.edit.document().setModified(False)
            self._title()

    def load(self, path) -> None:
        raw = Path(path).read_bytes()
        try:
            text = raw.decode("utf-8-sig")
        except UnicodeDecodeError:
            text = raw.decode("cp1251", errors="replace")  # старые файлы Windows
        self.edit.setPlainText(text)
        self.path = Path(path)
        self.edit.document().setModified(False)
        self._title()

    def save_to(self, path) -> bool:
        try:
            Path(path).write_text(self.edit.toPlainText(), encoding="utf-8")
        except OSError as e:
            QMessageBox.warning(self, "Блокнот", f"Не удалось сохранить: {e.strerror or e}")
            return False
        self.path = Path(path)
        self.edit.document().setModified(False)
        self._title()
        return True

    def save(self) -> bool:
        return self.save_to(self.path) if self.path else self.save_as()

    def save_as(self) -> bool:
        name, _ = QFileDialog.getSaveFileName(self, "Сохранить как", str(self.path or "текст.txt"),
                                              "Текст (*.txt);;Все файлы (*)")
        return bool(name) and self.save_to(name)

    def _open_dialog(self):
        if not self.maybe_save():
            return
        name, _ = QFileDialog.getOpenFileName(self, "Открыть", "", "Текст (*.txt *.md *.log);;Все файлы (*)")
        if name:
            try:
                self.load(name)
            except OSError as e:
                QMessageBox.warning(self, "Блокнот", f"Не удалось открыть: {e.strerror or e}")

    def closeEvent(self, e):
        e.accept() if self.maybe_save() else e.ignore()


# ─── МАЛЕНЬКИЕ ОКНА ──────────────────────────────────────────────────────────


def text_panel(title: str, text: str, button: Optional[tuple[str, Callable]] = None) -> QWidget:
    w = QWidget()
    w.setWindowTitle(title)
    lay = QVBoxLayout(w)
    lbl = QLabel(text)
    lbl.setWordWrap(True)
    lbl.setAlignment(Qt.AlignTop | Qt.AlignLeft)
    lbl.setMinimumWidth(200)
    lay.addWidget(lbl)
    if button:
        b = QPushButton(button[0])
        b.clicked.connect(button[1])
        lay.addWidget(b, 0, Qt.AlignLeft)
    lay.addStretch(1)
    return w


def emoji_icon(emoji: str) -> QIcon:
    pm = QPixmap(32, 32)
    pm.fill(Qt.transparent)
    p = QPainter(pm)
    f = QFont("Segoe UI Emoji")
    f.setPixelSize(24)
    p.setFont(f)
    p.drawText(pm.rect(), Qt.AlignCenter, emoji)
    p.end()
    return QIcon(pm)


def open_system_recycle_bin():
    if sys.platform == "win32":
        os.startfile("shell:RecycleBinFolder")


# ─── РАБОЧИЙ СТОЛ ────────────────────────────────────────────────────────────


class DesktopIcon(QWidget):
    """Значок на рабочем столе: двойной щелчок (или Enter) открывает программу."""

    activated = Signal()

    def __init__(self, emoji: str, title: str, parent=None):
        super().__init__(parent)
        self.title = title
        self.setFixedWidth(96)
        self.setFocusPolicy(Qt.StrongFocus)
        self.setCursor(Qt.PointingHandCursor)
        lay = QVBoxLayout(self)
        lay.setContentsMargins(2, 2, 2, 2)
        lay.setSpacing(0)
        icon = QLabel(emoji)
        icon.setAlignment(Qt.AlignCenter)
        icon.setStyleSheet("font-size:26px; background:transparent;")
        name = QLabel(title)
        name.setWordWrap(True)
        name.setAlignment(Qt.AlignHCenter | Qt.AlignTop)
        name.setStyleSheet("color:white; background:transparent;")
        lay.addWidget(icon)
        lay.addWidget(name)
        self.setToolTip(f"{title} - двойной щелчок")
        self.adjustSize()

    def focusInEvent(self, e):
        self.setStyleSheet("DesktopIcon { background: rgba(0,0,128,110); }")
        super().focusInEvent(e)

    def focusOutEvent(self, e):
        self.setStyleSheet("")
        super().focusOutEvent(e)

    def paintEvent(self, e):
        opt = QStyleOption()
        opt.initFrom(self)
        p = QPainter(self)
        self.style().drawPrimitive(QStyle.PE_Widget, opt, p, self)

    def mouseDoubleClickEvent(self, e):
        self.activated.emit()

    def keyPressEvent(self, e):
        if e.key() in (Qt.Key_Return, Qt.Key_Enter):
            self.activated.emit()
        else:
            super().keyPressEvent(e)


class Desktop(QMainWindow):
    """Рабочий стол «Python95»."""

    def __init__(self, explorer_start: Optional[Path] = None):
        super().__init__()
        self.setWindowTitle("Python95 - фан-концепт")
        self.resize(1280, 800)
        self.setMinimumSize(800, 560)
        self.explorer_start = explorer_start
        self.task_buttons: dict[QMdiSubWindow, QPushButton] = {}
        self._cascade = 0

        # (код, значок, название, фабрика окна, размер)
        self.apps = [
            ("explorer", "💻", "Мой компьютер", self._make_explorer, QSize(900, 560)),
            ("notepad", "📝", "Блокнот", NotepadWindow, QSize(560, 400)),
            ("paint", "🎨", "Paint", self._make_paint, QSize(980, 640)),
            ("chat", "💬", "Чат", self._make_chat, QSize(860, 560)),
            ("compiler", "⚙", "Компилятор", self._make_compiler, QSize(760, 540)),
            ("browser", "🌐", "Интернет", self._make_browser, QSize(1000, 640)),
            ("trash", "🗑", "Корзина", self._make_trash, QSize(420, 220)),
            ("about", "ℹ", "О системе", self._make_about, QSize(440, 260)),
        ]

        self.area = QMdiArea()
        self.area.setBackground(QBrush(QColor(DESKTOP)))
        self.area.setActivationOrder(QMdiArea.ActivationHistoryOrder)
        self.area.subWindowActivated.connect(self._sync_taskbar)
        self.area.viewport().installEventFilter(self)
        pal = self.area.palette()
        pal.setColor(QPalette.Highlight, QColor("#000080"))  # заголовок активного окна
        self.area.setPalette(pal)

        self.icons: dict[str, DesktopIcon] = {}
        for i, (code, emoji, title, _f, _s) in enumerate(self.apps):
            icon = DesktopIcon(emoji, title, self.area.viewport())
            icon.activated.connect(lambda c=code: self.open_app(c))
            icon.lower()
            self.icons[code] = icon

        self.taskbar = QFrame()
        self.taskbar.setObjectName("taskbar")
        self.taskbar.setStyleSheet(BAR_STYLE)
        self.taskbar.setFixedHeight(38)
        tb = QHBoxLayout(self.taskbar)
        tb.setContentsMargins(4, 3, 4, 3)
        tb.setSpacing(4)
        self.start_btn = QPushButton("🪟 Пуск")
        self.start_btn.setObjectName("start")
        self.start_btn.setSizePolicy(QSizePolicy.Fixed, QSizePolicy.Fixed)
        self.start_menu = self._build_start_menu()
        self.start_btn.clicked.connect(self.show_start_menu)
        tb.addWidget(self.start_btn)
        self.tasks = QHBoxLayout()
        self.tasks.setSpacing(3)
        self.tasks.addStretch(1)
        tb.addLayout(self.tasks, 1)
        self.clock = QLabel()
        self.clock.setObjectName("clock")
        tb.addWidget(self.clock)
        self._tick()
        self.timer = QTimer(self)
        self.timer.timeout.connect(self._tick)
        self.timer.start(1000)

        central = QWidget()
        cl = QVBoxLayout(central)
        cl.setContentsMargins(0, 0, 0, 0)
        cl.setSpacing(0)
        cl.addWidget(self.area, 1)
        cl.addWidget(self.taskbar)
        self.setCentralWidget(central)

    def eventFilter(self, obj, event):
        if obj is self.area.viewport() and event.type() == QEvent.Resize:
            self.layout_icons()
        return super().eventFilter(obj, event)

    def layout_icons(self):
        """Значки столбиками сверху вниз, сколько влезает по высоте стола."""
        step = 84
        per_column = max(1, (self.area.viewport().height() - 8) // step)
        for i, icon in enumerate(self.icons.values()):
            icon.move(8 + (i // per_column) * 100, 8 + (i % per_column) * step)

    # фабрики программ (импорт по требованию: окно стола открывается быстро)

    def _make_explorer(self):
        import explorer

        return explorer.ExplorerWindow(self.explorer_start)

    def _make_paint(self):
        import paint

        return paint.PaintWindow()

    def _make_chat(self):
        import telegram_clone

        return telegram_clone.ChatWindow()

    def _make_compiler(self):
        import compiler

        return compiler.CompilerWindow()

    def _make_browser(self):
        import browser

        return browser.BrowserWindow()

    def _make_trash(self):
        return text_panel("Корзина", "Проводник удаляет файлы не навсегда, а в Корзину Windows. "
                                     "Вернуть их можно оттуда.",
                          ("Открыть Корзину Windows", open_system_recycle_bin) if sys.platform == "win32" else None)

    def _make_about(self):
        return text_panel("О системе", "Python95 - учебный рабочий стол на Python и Qt (PySide6).\n\n"
                                       + FAN_NOTE_95 + " Логотипы и названия чужих продуктов не используются.")

    # пуск

    def _build_start_menu(self) -> QMenu:
        m = QMenu(self)
        head = m.addAction("Python95")
        head.setEnabled(False)
        m.addSeparator()
        for code, emoji, title, _f, _s in self.apps:
            act = m.addAction(f"{emoji}  {title}")
            act.triggered.connect(lambda _c=False, c=code: self.open_app(c))
        m.addSeparator()
        m.addAction("⊞  Упорядочить окна", self.area.tileSubWindows)
        m.addAction("⏻  Завершение работы…", self.close)
        return m

    def show_start_menu(self):
        pos = self.start_btn.mapToGlobal(QPoint(0, 0))
        self.start_menu.popup(QPoint(pos.x(), pos.y() - self.start_menu.sizeHint().height()))

    def _tick(self):
        self.clock.setText(QTime.currentTime().toString("HH:mm"))

    # окна

    def open_app(self, code: str) -> Optional[QMdiSubWindow]:
        _c, emoji, title, factory, size = next(a for a in self.apps if a[0] == code)
        try:
            widget = factory()
        except Exception as e:  # программа не запустилась - стол продолжает работать
            QMessageBox.warning(self, title, f"Программа «{title}» не запустилась:\n{e}")
            return None
        widget.setAttribute(Qt.WA_DeleteOnClose)
        sub = self.area.addSubWindow(widget)
        sub.setWindowIcon(emoji_icon(emoji))  # вместо значка Qt по умолчанию
        sub.setAttribute(Qt.WA_DeleteOnClose)
        sub.setWindowTitle(widget.windowTitle() or title)
        sub.app_code = code
        sub.app_title = title
        sub.app_emoji = emoji
        area = self.area.viewport().size()
        w, h = min(size.width(), area.width() - 40), min(size.height(), area.height() - 40)
        sub.resize(max(w, 320), max(h, 200))
        self._cascade = (self._cascade + 1) % 8
        sub.move(110 + self._cascade * 26, 10 + self._cascade * 22)
        widget.windowTitleChanged.connect(lambda t, s=sub: (s.setWindowTitle(t), self._label(s)))
        sub.windowStateChanged.connect(lambda _old, new, s=sub: self._on_state(s, new))
        sub.destroyed.connect(lambda _o=None, s=sub: self._remove_task(s))
        btn = QPushButton()
        btn.setCheckable(True)
        btn.setMaximumWidth(180)
        btn.setMinimumWidth(60)
        btn.setSizePolicy(QSizePolicy.Preferred, QSizePolicy.Fixed)
        btn.clicked.connect(lambda _c=False, s=sub: self.toggle(s))
        self.task_buttons[sub] = btn
        self.tasks.insertWidget(self.tasks.count() - 1, btn)
        self._label(sub)
        sub.show()
        self.area.setActiveSubWindow(sub)
        return sub

    def _label(self, sub):
        btn = self.task_buttons.get(sub)
        if btn:
            text = f"{sub.app_emoji} {sub.windowTitle()}"
            btn.setText(text if len(text) <= 24 else text[:23] + "…")
            btn.setToolTip(sub.windowTitle())

    def _on_state(self, sub, state):
        if state & Qt.WindowMinimized:
            # Как в Windows 95: свёрнутое окно остаётся только в панели задач. Прятать
            # после сигнала - иначе QMdiArea сама снова покажет свёрнутую полоску.
            QTimer.singleShot(0, sub, lambda s=sub: self.minimize(s))

    def minimize(self, sub: QMdiSubWindow):
        sub.hide()
        nxt = next((w for w in reversed(self.area.subWindowList(QMdiArea.ActivationHistoryOrder))
                    if w is not sub and w.isVisible()), None)
        self.area.setActiveSubWindow(nxt)
        self._sync_taskbar(nxt)

    def toggle(self, sub: QMdiSubWindow):
        """Кнопка в панели задач: свернуть активное, иначе показать и сделать активным."""
        if sub.isVisible() and self.area.activeSubWindow() is sub and not sub.isMinimized():
            self.minimize(sub)
            return
        else:
            sub.showNormal()
            sub.show()
            self.area.setActiveSubWindow(sub)
        self._sync_taskbar(self.area.activeSubWindow())

    def _sync_taskbar(self, active):
        for sub, btn in self.task_buttons.items():
            btn.setChecked(sub is active and sub.isVisible())

    def _remove_task(self, sub):
        btn = self.task_buttons.pop(sub, None)
        if btn:
            self.tasks.removeWidget(btn)
            btn.hide()
            btn.deleteLater()

    def windows(self) -> list[QMdiSubWindow]:
        return list(self.task_buttons)

    def closeEvent(self, e):
        """Завершение работы: каждая программа может отказаться (несохранённое)."""
        for sub in self.area.subWindowList():
            if not sub.close():
                e.ignore()
                return
        e.accept()


def main() -> int:
    QCoreApplication.setAttribute(Qt.AA_ShareOpenGLContexts)  # для «Интернета» (QtWebEngine)
    app = QApplication.instance() or QApplication(sys.argv)
    qt_theme.apply(app)
    win = Desktop()
    win.show()
    return app.exec()


if __name__ == "__main__":
    sys.exit(main())
