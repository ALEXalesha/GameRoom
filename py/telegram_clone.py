"""Локальный чат в стиле Telegram - фан-концепт, не связан с правообладателем.

Никакой сети и никаких токенов: собеседники - демо-боты на этом же компьютере,
переписка хранится в JSON-файле py/data/chat.json и переживает перезапуск.

Запуск: python telegram_clone.py
"""

from __future__ import annotations

import json
import os
import random
import sys
from datetime import datetime
from pathlib import Path
from typing import Callable, Optional

from PySide6.QtCore import QRectF, QSize, Qt, QTimer, Signal
from PySide6.QtGui import QColor, QFont, QPainter
from PySide6.QtWidgets import (
    QApplication, QFrame, QHBoxLayout, QLabel, QLineEdit, QListWidget, QListWidgetItem,
    QMainWindow, QMenu, QMessageBox, QPushButton, QScrollArea, QSizePolicy, QToolButton,
    QVBoxLayout, QWidget,
)

import qt_theme

APP_TITLE = "Чат · фан-концепт в стиле Telegram"

# ─── ДАННЫЕ ──────────────────────────────────────────────────────────────────

AVATAR_COLORS = ["#c03d2f", "#e8a838", "#2f7fc0", "#2fa86e", "#9c59b6", "#d35d8f", "#3aa3a3", "#7a8b99"]

SAVED_ID = "saved"  # «Избранное»: заметки себе, бот не отвечает

DEMO_CHATS = [
    ("anna", "Анна", True, [("in", "Привет!"), ("in", "Как дела?"),
                            ("out", "Привет! Всё хорошо, работаю над проектом"),
                            ("in", "Что за проект?"), ("out", "Чат на Python и Qt"),
                            ("in", "Покажешь потом?")]),
    ("work", "Рабочий чат", False, [("in", "Всем привет!"), ("in", "Завтра встреча в 10:00")]),
    ("boris", "Борис", True, [("out", "Скинешь отчёт?"), ("in", "Окей, понял")]),
    ("vika", "Вика", False, [("in", "Фото отправила")]),
    ("dev", "Команда разработки", False, [("in", "Сборка зелёная, можно выкладывать")]),
    ("news", "Новости", False, [("in", "Дайджест недели готов")]),
    (SAVED_ID, "Избранное", False, [("out", "Купить молоко")]),
]
DEMO_UNREAD = {"anna": 1, "work": 2, "vika": 1, "news": 1}

REPLIES = ["Понял 👍", "Окей!", "Хорошо, спасибо!", "Ага, увидел", "Отлично!", "😄",
           "Интересно, расскажи подробнее", "Договорились"]


def now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


class ChatStore:
    """Чаты и сообщения в JSON-файле. Каждая правка сразу записывается на диск
    (через временный файл, чтобы сбой посреди записи не портил переписку)."""

    def __init__(self, path: Path):
        self.path = Path(path)
        self.problem = ""  # что случилось при загрузке (показывается в окне)
        self.chats: list[dict] = []
        self.messages: dict[str, list[dict]] = {}
        self.unread: dict[str, int] = {}
        self.seq = 0  # сквозной номер сообщения: по нему порядок чатов в списке
        self.load()

    # загрузка / запись

    def load(self):
        if self.path.exists():
            try:
                data = json.loads(self.path.read_text(encoding="utf-8"))
                self.chats = list(data["chats"])
                self.messages = {c["id"]: list(data["messages"].get(c["id"], [])) for c in self.chats}
                self.unread = {k: int(v) for k, v in data.get("unread", {}).items()}
                self.seq = int(data.get("seq", 0))
                return
            except (OSError, ValueError, KeyError, TypeError) as e:
                broken = self.path.with_suffix(".broken.json")
                try:
                    os.replace(self.path, broken)
                    self.problem = f"Файл переписки повреждён ({e}); он сохранён как {broken.name}, начат новый."
                except OSError:
                    self.problem = f"Файл переписки не читается ({e}); начат новый."
        self._seed()
        self.save()

    def _seed(self):
        stamp = now_iso()
        self.chats, self.messages, self.seq = [], {}, 0
        for i, (cid, name, online, msgs) in enumerate(DEMO_CHATS):
            self.chats.append({"id": cid, "name": name, "online": online,
                               "color": AVATAR_COLORS[i % len(AVATAR_COLORS)]})
        # номера сообщений: у первого демо-чата самые свежие - он сверху списка
        for cid, _name, _online, msgs in reversed(DEMO_CHATS):
            self.messages[cid] = []
            for d, t in msgs:
                self.seq += 1
                self.messages[cid].append({"dir": d, "text": t, "ts": stamp, "n": self.seq})
        self.unread = dict(DEMO_UNREAD)

    def save(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".tmp")
        data = {"version": 1, "seq": self.seq, "chats": self.chats, "messages": self.messages,
                "unread": self.unread}
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
        os.replace(tmp, self.path)

    # чтение

    def chat(self, chat_id: str) -> dict:
        return next(c for c in self.chats if c["id"] == chat_id)

    def last(self, chat_id: str) -> Optional[dict]:
        msgs = self.messages.get(chat_id) or []
        return msgs[-1] if msgs else None

    def ordered_ids(self) -> list[str]:
        """Чаты по времени последнего сообщения, свежие сверху."""
        def key(c):
            m = self.last(c["id"])
            return (m.get("n", 0), m["ts"]) if m else (-1, "")
        return [c["id"] for c in sorted(self.chats, key=key, reverse=True)]

    def search(self, query: str) -> list[str]:
        q = query.strip().casefold()
        ids = self.ordered_ids()
        if not q:
            return ids
        return [cid for cid in ids
                if q in self.chat(cid)["name"].casefold()
                or any(q in m["text"].casefold() for m in self.messages.get(cid, []))]

    # правка

    def add(self, chat_id: str, direction: str, text: str, unread: bool = False) -> Optional[dict]:
        text = text.strip()
        if not text:
            return None
        self.seq += 1
        msg = {"dir": direction, "text": text, "ts": now_iso(), "n": self.seq}
        self.messages.setdefault(chat_id, []).append(msg)
        if unread:
            self.unread[chat_id] = self.unread.get(chat_id, 0) + 1
        self.save()
        return msg

    def mark_read(self, chat_id: str):
        if self.unread.pop(chat_id, 0):
            self.save()

    def clear(self, chat_id: str):
        self.messages[chat_id] = []
        self.unread.pop(chat_id, None)
        self.save()


# ─── ВИДЖЕТЫ ─────────────────────────────────────────────────────────────────

BG_PANEL = "#1f2833"
BG_CHAT = "#0e1621"
BG_OUT = "#2b5278"
BG_IN = "#182533"
TEXT_SEC = "#7d8e9e"
ONLINE = "#4dcd5e"
ACCENT = "#5288c1"

MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа",
          "сентября", "октября", "ноября", "декабря"]


def short_time(ts: str) -> str:
    d = datetime.fromisoformat(ts)
    if d.date() == datetime.now().date():
        return d.strftime("%H:%M")
    return f"{d.day:02d}.{d.month:02d}"


def day_title(ts: str) -> str:
    d = datetime.fromisoformat(ts).date()
    if d == datetime.now().date():
        return "Сегодня"
    return f"{d.day} {MONTHS[d.month - 1]}"


def drop(widget):
    """Убрать виджет сразу: deleteLater сработал бы только в цикле событий,
    а до того старые пузыри оставались бы видны поверх новых."""
    if widget is not None:
        widget.hide()
        widget.setParent(None)
        widget.deleteLater()


class Avatar(QWidget):
    """Кружок с первой буквой имени (и точкой «в сети»)."""

    def __init__(self, name: str, color: str, size: int = 44, online: bool = False):
        super().__init__()
        self.letter = (name[:1] or "?").upper()
        self.color = QColor(color)
        self.online = online
        self.setFixedSize(size, size)

    def paintEvent(self, _):
        p = QPainter(self)
        p.setRenderHint(QPainter.Antialiasing)
        s = self.width()
        p.setPen(Qt.NoPen)
        p.setBrush(self.color)
        p.drawEllipse(QRectF(1, 1, s - 2, s - 2))
        f = QFont(self.font())
        f.setPixelSize(int(s * 0.42))
        f.setBold(True)
        p.setFont(f)
        p.setPen(QColor("white"))
        p.drawText(QRectF(0, 0, s, s), Qt.AlignCenter, self.letter)
        if self.online:
            d = s * 0.28
            p.setBrush(QColor(BG_PANEL))
            p.drawEllipse(QRectF(s - d - 1, s - d - 1, d + 1, d + 1))
            p.setBrush(QColor(ONLINE))
            p.drawEllipse(QRectF(s - d + 1, s - d + 1, d - 3, d - 3))


class ChatRow(QWidget):
    """Строка списка чатов: аватар, имя, время, последнее сообщение, счётчик."""

    def __init__(self, store: ChatStore, chat_id: str):
        super().__init__()
        chat = store.chat(chat_id)
        last = store.last(chat_id)
        lay = QHBoxLayout(self)
        lay.setContentsMargins(8, 6, 8, 6)
        lay.addWidget(Avatar(chat["name"], chat["color"], 44, chat["online"]))
        col = QVBoxLayout()
        col.setSpacing(2)
        top = QHBoxLayout()
        self.name = QLabel(chat["name"])
        self.name.setStyleSheet("font-weight: bold;")
        self.name.setMinimumWidth(10)
        self.name.setSizePolicy(QSizePolicy.Ignored, QSizePolicy.Preferred)
        top.addWidget(self.name, 1)
        top.addWidget(self._dim(short_time(last["ts"]) if last else ""))
        col.addLayout(top)
        bottom = QHBoxLayout()
        preview = ("Вы: " if last and last["dir"] == "out" else "") + (last["text"] if last else "нет сообщений")
        self.preview = self._dim(preview.replace("\n", " "))
        self.preview.setMinimumWidth(10)
        self.preview.setSizePolicy(QSizePolicy.Ignored, QSizePolicy.Preferred)
        bottom.addWidget(self.preview, 1)
        n = store.unread.get(chat_id, 0)
        self.badge = QLabel(str(n))
        self.badge.setVisible(n > 0)
        self.badge.setAlignment(Qt.AlignCenter)
        self.badge.setMinimumWidth(22)
        self.badge.setStyleSheet(f"background:{ACCENT}; color:white; border-radius:9px;"
                                 "padding:1px 6px; font-weight:bold;")
        bottom.addWidget(self.badge)
        col.addLayout(bottom)
        lay.addLayout(col, 1)

    @staticmethod
    def _dim(text):
        lbl = QLabel(text)
        lbl.setStyleSheet(f"color:{TEXT_SEC};")
        return lbl


class Bubble(QWidget):
    """Сообщение: пузырь справа (своё) или слева (входящее)."""

    def __init__(self, msg: dict):
        super().__init__()
        out = msg["dir"] == "out"
        row = QHBoxLayout(self)
        row.setContentsMargins(12, 2, 12, 2)
        frame = QFrame()
        frame.setObjectName("bubble")
        frame.setStyleSheet(f"#bubble {{ background:{BG_OUT if out else BG_IN}; border-radius:10px; }}")
        frame.setMaximumWidth(520)
        inner = QVBoxLayout(frame)
        inner.setContentsMargins(10, 6, 10, 4)
        inner.setSpacing(1)
        self.text = QLabel(msg["text"])
        self.text.setWordWrap(True)
        self.text.setTextInteractionFlags(Qt.TextSelectableByMouse)
        self.text.setStyleSheet("color:white;")
        inner.addWidget(self.text)
        stamp = QLabel(short_time(msg["ts"]) + ("  ✓✓" if out else ""))
        stamp.setStyleSheet(f"color:{TEXT_SEC}; font-size:8pt;")
        stamp.setAlignment(Qt.AlignRight)
        inner.addWidget(stamp)
        if out:
            row.addStretch(1)
        row.addWidget(frame, 4)
        if not out:
            row.addStretch(1)


class ChatWidget(QWidget):
    """Весь чат: список слева, переписка справа. Встраивается и в «Python95»."""

    message_added = Signal(str)  # id чата

    def __init__(self, store: Optional[ChatStore] = None, reply_delay_ms: int = 1200,
                 confirm: Optional[Callable[[str], bool]] = None, parent=None):
        super().__init__(parent)
        self.store = store or ChatStore(qt_theme.data_path("chat.json"))
        self.reply_delay_ms = reply_delay_ms
        self.confirm = confirm or self._ask
        self.active: Optional[str] = None
        self._build()
        self.refresh_list()
        ids = self.store.ordered_ids()
        if ids:
            self.open_chat(ids[0])

    # построение

    def _build(self):
        root = QHBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)

        left = QFrame()
        left.setObjectName("left")
        left.setStyleSheet(f"#left {{ background:{BG_PANEL}; }}")
        left.setMinimumWidth(230)
        left.setMaximumWidth(340)
        lv = QVBoxLayout(left)
        lv.setContentsMargins(8, 8, 8, 8)
        self.search = QLineEdit()
        self.search.setPlaceholderText("Поиск по чатам и сообщениям")
        self.search.setClearButtonEnabled(True)
        self.search.textChanged.connect(self.refresh_list)
        lv.addWidget(self.search)
        self.list = QListWidget()
        self.list.setHorizontalScrollBarPolicy(Qt.ScrollBarAlwaysOff)
        self.list.setResizeMode(QListWidget.Adjust)  # строки ужимаются, когда появляется прокрутка
        self.list.setStyleSheet(f"QListWidget {{ background:{BG_PANEL}; border:none; }}"
                                "QListWidget::item:selected { background:#2b3a4d; }")
        # Список перестраивается при открытии чата, поэтому открываем после обработки
        # сигнала (нельзя удалять строку списка, пока Qt ещё рассылает её сигнал).
        self.list.currentItemChanged.connect(
            lambda it, _prev: it and QTimer.singleShot(0, lambda cid=it.data(Qt.UserRole): self._open_if_new(cid)))
        lv.addWidget(self.list, 1)
        self.empty = QLabel("Ничего не найдено")
        self.empty.setStyleSheet(f"color:{TEXT_SEC};")
        self.empty.setAlignment(Qt.AlignCenter)
        self.empty.hide()
        lv.addWidget(self.empty)
        self.note = QLabel(qt_theme.FAN_NOTE + ". Сеть не используется, переписка хранится на этом компьютере.")
        self.note.setWordWrap(True)
        self.note.setStyleSheet(f"color:{TEXT_SEC}; font-size:8pt;")
        lv.addWidget(self.note)
        if self.store.problem:
            self.problem = QLabel(self.store.problem)
            self.problem.setWordWrap(True)
            self.problem.setStyleSheet("color:#e0a05a;")
            lv.addWidget(self.problem)
        root.addWidget(left)

        right = QFrame()
        right.setObjectName("right")
        right.setStyleSheet(f"#right {{ background:{BG_CHAT}; }}")
        rv = QVBoxLayout(right)
        rv.setContentsMargins(0, 0, 0, 0)
        rv.setSpacing(0)

        header = QFrame()
        header.setObjectName("header")
        header.setStyleSheet(f"#header {{ background:{BG_PANEL}; }}")
        hv = QHBoxLayout(header)
        hv.setContentsMargins(12, 6, 8, 6)
        self.header_avatar_slot = QHBoxLayout()
        hv.addLayout(self.header_avatar_slot)
        names = QVBoxLayout()
        names.setSpacing(0)
        self.header_name = QLabel()
        self.header_name.setStyleSheet("font-weight:bold; font-size:11pt;")
        self.header_status = QLabel()
        names.addWidget(self.header_name)
        names.addWidget(self.header_status)
        hv.addLayout(names, 1)
        self.menu_btn = QToolButton()
        self.menu_btn.setText("⋮")
        self.menu_btn.setToolTip("Действия с чатом")
        self.menu_btn.setPopupMode(QToolButton.InstantPopup)
        menu = QMenu(self.menu_btn)
        menu.addAction("Очистить историю…", self.clear_active)
        self.menu_btn.setMenu(menu)
        hv.addWidget(self.menu_btn)
        rv.addWidget(header)

        self.scroll = QScrollArea()
        self.scroll.setWidgetResizable(True)
        self.scroll.setFrameShape(QFrame.NoFrame)
        self.scroll.setStyleSheet(f"QScrollArea {{ background:{BG_CHAT}; }}")
        self.feed = QWidget()
        self.feed.setObjectName("feed")
        self.feed.setStyleSheet(f"#feed {{ background:{BG_CHAT}; }}")
        self.feed_lay = QVBoxLayout(self.feed)
        self.feed_lay.setContentsMargins(0, 8, 0, 8)
        self.feed_lay.setSpacing(2)
        self.scroll.setWidget(self.feed)
        self.scroll.verticalScrollBar().rangeChanged.connect(
            lambda _lo, hi: self.scroll.verticalScrollBar().setValue(hi))
        rv.addWidget(self.scroll, 1)

        bar = QFrame()
        bar.setObjectName("bar")
        bar.setStyleSheet(f"#bar {{ background:{BG_PANEL}; }}")
        bv = QHBoxLayout(bar)
        bv.setContentsMargins(10, 8, 10, 8)
        self.input = QLineEdit()
        self.input.setPlaceholderText("Написать сообщение…")
        self.input.returnPressed.connect(self.send_current)
        self.input.textChanged.connect(lambda t: self.send_btn.setEnabled(bool(t.strip())))
        bv.addWidget(self.input, 1)
        self.send_btn = QPushButton("➤")
        self.send_btn.setToolTip("Отправить (Enter)")
        self.send_btn.setEnabled(False)
        self.send_btn.clicked.connect(self.send_current)
        bv.addWidget(self.send_btn)
        rv.addWidget(bar)
        root.addWidget(right, 1)

    # список чатов

    def refresh_list(self):
        ids = self.store.search(self.search.text())
        self.list.blockSignals(True)
        self.list.clear()
        for cid in ids:
            item = QListWidgetItem()
            item.setData(Qt.UserRole, cid)
            row = ChatRow(self.store, cid)
            item.setSizeHint(QSize(200, max(58, row.sizeHint().height())))
            self.list.addItem(item)
            self.list.setItemWidget(item, row)
            if cid == self.active:
                self.list.setCurrentItem(item)
        self.list.blockSignals(False)
        self.empty.setVisible(not ids)

    def visible_chat_ids(self) -> list[str]:
        return [self.list.item(i).data(Qt.UserRole) for i in range(self.list.count())]

    # переписка

    def _open_if_new(self, chat_id: str):
        if chat_id != self.active:
            self.open_chat(chat_id)

    def open_chat(self, chat_id: str):
        self.active = chat_id
        chat = self.store.chat(chat_id)
        self.store.mark_read(chat_id)
        while self.header_avatar_slot.count():
            drop(self.header_avatar_slot.takeAt(0).widget())
        self.header_avatar_slot.addWidget(Avatar(chat["name"], chat["color"], 36))
        self.header_name.setText(chat["name"])
        if chat_id == SAVED_ID:
            status, color = "заметки для себя", TEXT_SEC
        elif chat["online"]:
            status, color = "в сети", ONLINE
        else:
            status, color = "был(а) недавно", TEXT_SEC
        self.header_status.setText(status)
        self.header_status.setStyleSheet(f"color:{color};")
        self.render_messages()
        self.refresh_list()
        self.input.setFocus()

    def render_messages(self):
        while self.feed_lay.count():
            drop(self.feed_lay.takeAt(0).widget())
        day = None
        for msg in self.store.messages.get(self.active, []):
            title = day_title(msg["ts"])
            if title != day:
                day = title
                lbl = QLabel(title)
                lbl.setAlignment(Qt.AlignCenter)
                lbl.setStyleSheet(f"color:{TEXT_SEC}; padding:6px;")
                self.feed_lay.addWidget(lbl)
            bubble = Bubble(msg)
            self.feed_lay.addWidget(bubble)
            bubble.show()
        if not self.store.messages.get(self.active):
            lbl = QLabel("Сообщений пока нет")
            lbl.setAlignment(Qt.AlignCenter)
            lbl.setStyleSheet(f"color:{TEXT_SEC}; padding:20px;")
            self.feed_lay.addWidget(lbl)
        self.feed_lay.addStretch(1)

    def message_texts(self) -> list[str]:
        return [b.text.text() for b in self.feed.findChildren(Bubble)]

    def send_current(self):
        text = self.input.text()
        if self.active and self.send(self.active, text):
            self.input.clear()

    def send(self, chat_id: str, text: str) -> bool:
        if not self.store.add(chat_id, "out", text):
            return False
        self._after_change(chat_id)
        if chat_id != SAVED_ID:
            # таймер привязан к виджету: закрыли окно раньше ответа - ответа просто не будет
            QTimer.singleShot(self.reply_delay_ms, self, lambda cid=chat_id: self.bot_reply(cid))
        return True

    def bot_reply(self, chat_id: str, text: Optional[str] = None):
        """Ответ демо-собеседника приходит в тот чат, куда писали, даже если открыт другой."""
        self.store.add(chat_id, "in", text or random.choice(REPLIES), unread=chat_id != self.active)
        self._after_change(chat_id)

    def _after_change(self, chat_id: str):
        if chat_id == self.active:
            self.render_messages()
        self.refresh_list()
        self.message_added.emit(chat_id)

    def clear_active(self):
        if not self.active:
            return
        name = self.store.chat(self.active)["name"]
        if self.confirm(f"Удалить всю переписку с «{name}»? Это действие не отменить."):
            self.store.clear(self.active)
            self.render_messages()
            self.refresh_list()

    def _ask(self, question: str) -> bool:
        return QMessageBox.question(self, "Очистить историю", question) == QMessageBox.Yes


class ChatWindow(QMainWindow):
    def __init__(self, store: Optional[ChatStore] = None, **kw):
        super().__init__()
        self.setWindowTitle(APP_TITLE)
        self.chat = ChatWidget(store, **kw)
        self.setCentralWidget(self.chat)
        self.resize(1000, 680)
        self.setMinimumSize(640, 440)


def main() -> int:
    app = QApplication.instance() or QApplication(sys.argv)
    qt_theme.apply(app)
    win = ChatWindow()
    win.show()
    return app.exec()


if __name__ == "__main__":
    sys.exit(main())
