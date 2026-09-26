"""Законы рабочего стола «Python95»: каждая программа открывается настоящим окном,
панель задач следует за окнами, свёрнутое окно возвращается, завершение работы
уважает несохранённые правки. Данные программ - во временной папке."""

import re

import pytest
from PySide6.QtCore import QEvent, QCoreApplication, Qt
from PySide6.QtTest import QTest
from PySide6.QtWidgets import QApplication

import os_sim
from qt_laws import check_wrapped_labels


def pump(n=5):
    for _ in range(n):
        QApplication.processEvents()
    QCoreApplication.sendPostedEvents(None, QEvent.DeferredDelete)


@pytest.fixture
def desk(qapp, data_dir, tmp_path):
    (tmp_path / "файл.txt").write_text("x", encoding="utf-8")
    d = os_sim.Desktop(explorer_start=tmp_path)
    d.show()
    yield d
    for sub in d.area.subWindowList():
        w = sub.widget()
        if hasattr(w, "ask_unsaved"):
            w.ask_unsaved = lambda: "discard"
    d.close()
    pump()


EXPECTED = {
    "explorer": "ExplorerWindow", "notepad": "NotepadWindow", "paint": "PaintWindow",
    "chat": "ChatWindow", "compiler": "CompilerWindow", "browser": "BrowserWindow",
}


@pytest.mark.parametrize("code", ["explorer", "notepad", "paint", "chat", "compiler", "browser", "trash", "about"])
def test_every_app_opens_as_real_window(desk, code):
    sub = desk.open_app(code)
    assert sub is not None and sub.isVisible()
    if code in EXPECTED:
        assert type(sub.widget()).__name__ == EXPECTED[code]
    assert desk.area.activeSubWindow() is sub
    # у окна свой значок программы, а не логотип Qt по умолчанию
    assert sub.windowIcon().cacheKey() != QApplication.windowIcon().cacheKey()
    btn = desk.task_buttons[sub]
    assert btn.isChecked() and sub.windowTitle()[:5] in btn.text()


def test_start_menu_lists_all_apps_and_shutdown(desk):
    texts = [a.text() for a in desk.start_menu.actions()]
    for _code, _e, title, _f, _s in desk.apps:
        assert any(title in t for t in texts), title
    assert any("Завершение работы" in t for t in texts)


def test_desktop_icon_double_click_opens(desk):
    icon = desk.icons["notepad"]
    QTest.mouseDClick(icon, Qt.LeftButton)
    assert [s.app_code for s in desk.windows()] == ["notepad"]
    icon.setFocus()
    QTest.keyClick(icon, Qt.Key_Return)
    assert len(desk.windows()) == 2


def test_taskbar_minimize_and_restore(desk):
    a = desk.open_app("notepad")
    b = desk.open_app("about")
    desk.toggle(b)  # активное окно - сворачивается
    assert not b.isVisible() and not desk.task_buttons[b].isChecked()
    desk.toggle(b)  # свёрнутое - возвращается и становится активным
    assert b.isVisible() and desk.area.activeSubWindow() is b and desk.task_buttons[b].isChecked()
    desk.toggle(a)  # неактивное - просто становится активным
    assert desk.area.activeSubWindow() is a and b.isVisible()


def test_minimize_button_hides_into_taskbar(desk):
    sub = desk.open_app("about")
    sub.showMinimized()
    pump()
    assert not sub.isVisible()
    assert sub in desk.task_buttons


def test_closing_window_removes_task_button(desk):
    sub = desk.open_app("about")
    btn = desk.task_buttons[sub]
    sub.close()
    pump()
    assert desk.windows() == []
    assert desk.tasks.indexOf(btn) == -1


def test_title_change_updates_task_button(desk):
    sub = desk.open_app("notepad")
    sub.widget().edit.insertPlainText("правка")
    pump()
    assert desk.task_buttons[sub].text().startswith("📝 *")


def test_shutdown_respects_unsaved_changes(desk):
    sub = desk.open_app("notepad")
    note = sub.widget()
    note.edit.insertPlainText("не сохранено")
    note.ask_unsaved = lambda: "cancel"
    assert desk.close() is False
    assert desk.isVisible() and sub.isVisible()
    note.ask_unsaved = lambda: "discard"
    assert desk.close() is True


def test_paint_inside_desktop_asks_before_closing(desk):
    from PySide6.QtCore import QPoint

    sub = desk.open_app("paint")
    pw = sub.widget()
    pw.set_tool("rect")
    pw.canvas.begin(QPoint(10, 10))
    pw.canvas.end(QPoint(80, 80))
    pw.ask_unsaved = lambda: "cancel"
    assert sub.close() is False and sub.isVisible()


def test_notepad_save_and_open(qapp, tmp_path):
    n = os_sim.NotepadWindow(ask_unsaved=lambda: "discard")
    n.edit.setPlainText("Привет, мир\nвторая строка")
    assert n.save_to(tmp_path / "a.txt")
    assert n.windowTitle() == "a.txt - Блокнот"
    (tmp_path / "old.txt").write_bytes("Старый файл".encode("cp1251"))
    n.load(tmp_path / "old.txt")
    assert n.edit.toPlainText() == "Старый файл"  # cp1251 тоже читается
    n.load(tmp_path / "a.txt")
    assert n.edit.toPlainText() == "Привет, мир\nвторая строка"
    n.close()


def test_clock(desk):
    assert re.fullmatch(r"\d\d:\d\d", desk.clock.text())


def test_fan_note(desk):
    assert "фан-концепт" in desk.windowTitle()
    sub = desk.open_app("about")
    assert "не связан с правообладателем" in sub.widget().findChildren(os_sim.QLabel)[0].text()


def test_icons_fit_small_desktop(desk):
    desk.resize(desk.minimumSize())
    pump()
    h = desk.area.viewport().height()
    icons = list(desk.icons.values())
    for icon in icons:
        assert icon.geometry().bottom() <= h, icon.title
    for i, one in enumerate(icons):  # и не лежат друг на друге
        for other in icons[i + 1:]:
            assert not one.geometry().intersects(other.geometry()), (one.title, other.title)


def test_labels_fit(desk):
    desk.open_app("about")
    desk.open_app("trash")
    assert check_wrapped_labels(desk) >= 2
