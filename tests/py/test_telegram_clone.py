"""Законы локального чата: переписка переживает перезапуск, ответ приходит в свой чат,
поиск работает, очистка - только после подтверждения, сети и токенов нет."""

import json
import re
from pathlib import Path

import pytest
from PySide6.QtCore import Qt
from PySide6.QtTest import QTest
from PySide6.QtWidgets import QApplication

import telegram_clone as tg
from qt_laws import check_wrapped_labels


@pytest.fixture
def store_path(tmp_path):
    return tmp_path / "chat.json"


def make(qapp, store_path, **kw):
    kw.setdefault("reply_delay_ms", 0)
    return tg.ChatWindow(tg.ChatStore(store_path), **kw)


def pump(n=5):
    for _ in range(n):
        QApplication.processEvents()


def test_message_survives_restart(qapp, store_path):
    w = make(qapp, store_path)
    w.chat.open_chat("boris")
    w.chat.input.setText("Сообщение до перезапуска")
    QTest.keyClick(w.chat.input, Qt.Key_Return)
    assert w.chat.input.text() == ""
    w.close()

    w2 = make(qapp, store_path)
    w2.chat.open_chat("boris")
    assert "Сообщение до перезапуска" in w2.chat.message_texts()
    data = json.loads(store_path.read_text(encoding="utf-8"))
    assert data["messages"]["boris"][-1]["text"] == "Сообщение до перезапуска"
    w2.close()


def test_default_storage_is_json_in_data_dir(qapp, data_dir):
    w = tg.ChatWindow(reply_delay_ms=0)
    assert w.chat.store.path == data_dir / "chat.json"
    assert (data_dir / "chat.json").exists()
    w.close()


def test_reply_goes_to_chat_where_message_was_sent(qapp, store_path):
    """Было: ответ через секунду падал в тот чат, который открыт в этот момент."""
    w = make(qapp, store_path, reply_delay_ms=50)
    w.chat.open_chat("anna")
    w.chat.send("anna", "Ты тут?")
    w.chat.open_chat("boris")
    before_boris = list(w.chat.store.messages["boris"])
    QTest.qWait(200)
    store = w.chat.store
    assert store.messages["anna"][-1]["dir"] == "in"
    assert store.messages["anna"][-2]["text"] == "Ты тут?"
    assert store.messages["boris"] == before_boris
    assert store.unread.get("anna") == 1  # пришло в закрытый чат - счётчик
    w.chat.open_chat("anna")
    assert "anna" not in store.unread
    w.close()


def test_feed_shows_each_message_once(qapp, store_path):
    """Старые пузыри убираются сразу, а не остаются под новыми до цикла событий."""
    w = make(qapp, store_path)
    w.chat.open_chat("anna")
    w.chat.send("anna", "раз")
    w.chat.bot_reply("anna", "два")
    texts = w.chat.message_texts()
    assert texts == [m["text"] for m in w.chat.store.messages["anna"]]
    w.close()


def test_window_closed_before_reply_does_not_crash(qapp, store_path):
    """Было (нашлось тестом): окно закрыли, а таймер ответа сработал по удалённому виджету."""
    from PySide6.QtCore import QCoreApplication, QEvent

    w = make(qapp, store_path, reply_delay_ms=30)
    w.chat.send("anna", "и сразу закрыл")
    w.close()
    w.deleteLater()
    QCoreApplication.sendPostedEvents(None, QEvent.DeferredDelete)
    del w
    QTest.qWait(100)
    assert tg.ChatStore(store_path).messages["anna"][-1]["text"] == "и сразу закрыл"


def test_saved_messages_get_no_bot_reply(qapp, store_path):
    w = make(qapp, store_path)
    w.chat.open_chat(tg.SAVED_ID)
    n = len(w.chat.store.messages[tg.SAVED_ID])
    w.chat.send(tg.SAVED_ID, "заметка")
    QTest.qWait(50)
    assert len(w.chat.store.messages[tg.SAVED_ID]) == n + 1
    w.close()


def test_empty_message_is_not_sent(qapp, store_path):
    w = make(qapp, store_path)
    w.chat.open_chat("anna")
    n = len(w.chat.store.messages["anna"])
    w.chat.input.setText("   ")
    assert not w.chat.send_btn.isEnabled()
    w.chat.send_current()
    assert len(w.chat.store.messages["anna"]) == n
    w.chat.input.setText("x")
    assert w.chat.send_btn.isEnabled()
    w.close()


def test_search_filters_by_name_and_text(qapp, store_path):
    w = make(qapp, store_path)
    c = w.chat
    c.search.setText("борис")
    assert c.visible_chat_ids() == ["boris"]
    c.search.setText("МОЛОКО")  # текст сообщения, регистр не важен
    assert c.visible_chat_ids() == [tg.SAVED_ID]
    c.search.setText("такого нигде нет")
    assert c.visible_chat_ids() == [] and c.empty.isVisibleTo(w)
    c.search.setText("")
    assert len(c.visible_chat_ids()) == len(tg.DEMO_CHATS)
    w.close()


def test_new_message_moves_chat_to_top(qapp, store_path):
    w = make(qapp, store_path)
    w.chat.send("news", "вверх")
    assert w.chat.visible_chat_ids()[0] == "news"
    w.close()


def test_clicking_chat_in_list_opens_it(qapp, store_path):
    w = make(qapp, store_path)
    w.show()
    ids = w.chat.visible_chat_ids()
    target = ids[2]
    w.chat.list.setCurrentRow(2)
    pump()
    assert w.chat.active == target
    assert w.chat.header_name.text() == w.chat.store.chat(target)["name"]
    w.close()


def test_clear_history_needs_confirmation(qapp, store_path):
    answers = []
    w = make(qapp, store_path, confirm=lambda q: answers.pop())
    w.chat.open_chat("anna")
    answers.append(False)
    w.chat.clear_active()
    assert w.chat.store.messages["anna"]
    answers.append(True)
    w.chat.clear_active()
    assert w.chat.store.messages["anna"] == []
    assert tg.ChatStore(store_path).messages["anna"] == []
    w.close()


def test_broken_file_is_kept_and_app_starts(qapp, store_path):
    store_path.write_text("{ это не json", encoding="utf-8")
    w = make(qapp, store_path)
    assert w.chat.store.problem
    assert (store_path.parent / "chat.broken.json").read_text(encoding="utf-8") == "{ это не json"
    assert len(w.chat.store.chats) == len(tg.DEMO_CHATS)
    w.close()


def test_no_network_and_no_tokens_in_source():
    src = Path(tg.__file__).read_text(encoding="utf-8")
    for bad in ("import socket", "urllib", "requests", "http://", "https://", "QtNetwork", "api_id", "bot_token"):
        assert bad not in src, bad
    assert not re.search(r"\d{8,10}:[A-Za-z0-9_-]{30,}", src)  # похожее на токен бота


def test_fan_note_and_title(qapp, store_path):
    w = make(qapp, store_path)
    assert "фан-концепт" in w.windowTitle().lower()
    assert "не связан с правообладателем" in w.chat.note.text()
    w.close()


def test_labels_fit_min_window(qapp, store_path):
    w = make(qapp, store_path)
    w.chat.send("anna", "Длинное сообщение, которое обязательно перенесётся на несколько строк в узком окне " * 3)
    assert check_wrapped_labels(w) >= 2
    w.close()
