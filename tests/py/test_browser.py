"""Законы браузера: запуск без сети, честная страница ошибки, адресная строка,
история и закладки переживают перезапуск. В интернет проверки не ходят:
только локальные файлы и закрытый порт на 127.0.0.1."""

import socket
from urllib.parse import parse_qs
import time

import pytest
from PySide6.QtCore import QUrl
from PySide6.QtTest import QTest
from PySide6.QtWidgets import QApplication

import browser as br
from qt_laws import check_wrapped_labels


def wait_until(cond, timeout=15.0):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        QApplication.processEvents()
        if cond():
            return True
        QTest.qWait(30)
    return cond()


def free_closed_port() -> int:
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()  # порт свободен и закрыт: подключение будет отклонено
    return port


# ─── адресная строка ─────────────────────────────────────────────────────────

URLS = [
    ("example.com", "https://example.com"),
    ("пример.рф", "https://пример.рф"),
    ("docs.python.org/3/library", "https://docs.python.org/3/library"),
    ("localhost:8000", "http://localhost:8000"),
    ("127.0.0.1:5000/api", "http://127.0.0.1:5000/api"),
    ("http://site.org", "http://site.org"),
    ("about:blank", "about:blank"),
]


@pytest.mark.parametrize("text,url", URLS)
def test_to_url_addresses(text, url):
    assert br.to_url(text).toString() == QUrl(url).toString()


@pytest.mark.parametrize("text", ["как сварить борщ", "C++ & Rust", "python", "1+1=2 #ответ"])
def test_to_url_search_is_encoded(text):
    url = br.to_url(text, search_url="https://search.test/?q={}")
    assert url.host() == "search.test"
    assert parse_qs(url.query(QUrl.FullyEncoded))["q"] == [text]


def test_to_url_empty_and_file(tmp_path):
    assert br.to_url("   ") is None
    f = tmp_path / "a.html"
    assert br.to_url(str(f)).toLocalFile().lower() == str(f).replace("\\", "/").lower()


# ─── история и закладки ──────────────────────────────────────────────────────


def test_history_and_bookmarks_survive_restart(tmp_path):
    d = br.BrowserData(tmp_path / "b.json")
    d.visit("https://a.test/", "")
    d.visit("https://a.test/", "Сайт А")  # заголовок пришёл позже - та же запись
    d.visit("https://b.test/", "Б")
    d.visit("about:blank", "мусор")  # служебные страницы в историю не пишутся
    assert len(br.BrowserData(tmp_path / "b.json").history) == 2  # записано сразу, без закрытия окна
    assert d.toggle_bookmark("https://b.test/", "Б") is True
    d2 = br.BrowserData(tmp_path / "b.json")
    assert [(h["url"], h["title"]) for h in d2.history] == [("https://a.test/", "Сайт А"), ("https://b.test/", "Б")]
    assert d2.is_bookmarked("https://b.test/")
    assert d2.toggle_bookmark("https://b.test/", "Б") is False
    assert not br.BrowserData(tmp_path / "b.json").is_bookmarked("https://b.test/")
    d2.clear_history()
    assert br.BrowserData(tmp_path / "b.json").history == []


def test_history_limit_and_broken_file(tmp_path):
    d = br.BrowserData(tmp_path / "b.json")
    for i in range(br.HISTORY_LIMIT + 5):
        d.history.append({"url": f"https://x.test/{i}", "title": "", "time": ""})
    d.visit("https://last.test/", "")
    assert len(d.history) == br.HISTORY_LIMIT
    (tmp_path / "c.json").write_text("{битый", encoding="utf-8")
    assert br.BrowserData(tmp_path / "c.json").history == []
    assert (tmp_path / "c.broken.json").exists()


# ─── окно ────────────────────────────────────────────────────────────────────


@pytest.fixture
def win(qapp, tmp_path):
    asked = []
    w = br.BrowserWindow(data=br.BrowserData(tmp_path / "b.json"), profile=br.make_profile(off_the_record=True),
                         ask_download=lambda name: asked.append(name) or False)
    w.asked = asked
    w.show()
    yield w
    w.close()
    for i in range(w.tabs.count()):
        w.tabs.widget(i).view.setPage(None)


def test_starts_offline_with_start_page(win):
    tab = win.tab()
    assert tab.is_start_page() and tab.title() == br.START_TITLE
    assert win.url_bar.text() == ""
    assert not win.btn_bookmark.isEnabled()
    assert wait_until(lambda: not tab.loading)
    assert not tab.view.url().toString().startswith("http")  # ничего не грузилось из сети


def test_unreachable_address_shows_honest_error(win):
    port = free_closed_port()
    win.url_bar.setText(f"127.0.0.1:{port}")
    win.navigate_from_bar()
    tab = win.tab()
    assert wait_until(lambda: tab.error is not None), "страница ошибки не появилась"
    assert "отклонил" in tab.error
    assert tab.title() == "Страница недоступна"
    assert win.url_bar.text().rstrip("/") == f"http://127.0.0.1:{port}"  # в строке - то, что не открылось
    assert wait_until(lambda: tab.view.title() == "Страница недоступна")
    text = []
    tab.page.toPlainText(text.append)
    assert wait_until(lambda: text)
    assert "Не удалось открыть страницу" in text[0] and "Повторить" in text[0]
    assert win.data.history == []  # неоткрывшаяся страница не попадает в историю


def test_retry_reloads_target_not_error_page(win):
    port = free_closed_port()
    tab = win.tab()
    tab.load(QUrl(f"http://127.0.0.1:{port}/x"))
    assert wait_until(lambda: tab.error is not None)
    tab.error = "x"  # метка: новая попытка заменит её настоящей ошибкой
    tab.page.retry_requested.emit()  # кнопка «Повторить» на странице
    assert tab.target_url == f"http://127.0.0.1:{port}/x"
    assert wait_until(lambda: tab.error not in (None, "x"))


def test_local_page_opens_and_goes_to_history(win, tmp_path):
    page = tmp_path / "страница.html"
    page.write_text("<html><head><title>Локальная</title></head><body><a id=a href='two.html'>дальше</a></body></html>",
                    encoding="utf-8")
    (tmp_path / "two.html").write_text("<title>Вторая</title>ok", encoding="utf-8")
    win.url_bar.setText(str(page))
    win.navigate_from_bar()
    tab = win.tab()
    assert wait_until(lambda: tab.title() == "Локальная")
    assert tab.error is None
    assert wait_until(lambda: any(h["title"] == "Локальная" for h in win.data.history))
    assert win.tabs.tabText(win.tabs.currentIndex()) == "Локальная"
    win.toggle_bookmark()
    assert win.btn_bookmark.text() == "★"
    assert win.data.is_bookmarked(tab.url())


def test_error_then_back_to_real_page_clears_error(win, tmp_path):
    (tmp_path / "ok.html").write_text("<title>Хорошая</title>", encoding="utf-8")
    tab = win.tab()
    tab.load(QUrl.fromLocalFile(str(tmp_path / "ok.html")))
    assert wait_until(lambda: tab.title() == "Хорошая")
    tab.load(QUrl(f"http://127.0.0.1:{free_closed_port()}/"))
    assert wait_until(lambda: tab.error is not None)
    tab.load(QUrl.fromLocalFile(str(tmp_path / "ok.html")))
    assert wait_until(lambda: tab.error is None and tab.title() == "Хорошая")


def test_tabs_new_close_last_becomes_start(win):
    win.new_tab()
    assert win.tabs.count() == 2
    win.close_tab(1)
    assert wait_until(lambda: win.tabs.count() == 1)
    win.close_tab(0)
    assert win.tabs.count() == 1 and win.isVisible()  # окно не закрылось
    assert win.tab().is_start_page()


def test_find_bar(win):
    win.open_find()
    assert win.find_bar.isVisible()
    win.close_find()
    assert not win.find_bar.isVisible()


def test_labels_fit(win):
    check_wrapped_labels(win)
