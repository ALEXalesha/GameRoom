"""Законы проводника. Всё происходит во временной папке теста; настоящая Корзина
не трогается - вместо неё подставляется запоминающая функция."""

import os
from pathlib import Path

import pytest
from PySide6.QtCore import QFile, Qt
from PySide6.QtTest import QTest

import explorer as ex
from qt_laws import check_wrapped_labels


@pytest.fixture
def tree(tmp_path):
    root = tmp_path / "root"
    (root / "Папка Б").mkdir(parents=True)
    (root / "папка а").mkdir()
    (root / "Папка Б" / "внутри.txt").write_text("вложенный", encoding="utf-8")
    (root / "b.txt").write_text("bbb", encoding="utf-8")
    (root / "A.py").write_text("print(1)", encoding="utf-8")
    (root / ".скрытый").write_text("x", encoding="utf-8")
    return root


class FakeTrash:
    """Вместо Корзины: запоминает, что туда отправили. Сам ничего не удаляет."""

    def __init__(self):
        self.sent = []

    def __call__(self, path):
        self.sent.append(Path(path))


# ─── операции без окна ───────────────────────────────────────────────────────


def test_list_dir_order_and_hidden(tree):
    names = [e.name for e in ex.list_dir(tree)]
    assert names == ["папка а", "Папка Б", "A.py", "b.txt"]
    assert ".скрытый" in [e.name for e in ex.list_dir(tree, show_hidden=True)]
    b = next(e for e in ex.list_dir(tree) if e.name == "b.txt")
    assert b.size == 3 and b.kind == "Текст" and not b.is_dir


def test_list_dir_errors_are_friendly(tmp_path, monkeypatch):
    with pytest.raises(ex.FileOpsError, match="не найдена"):
        ex.list_dir(tmp_path / "нет")

    def denied(_p):
        raise PermissionError(13, "Access is denied")

    monkeypatch.setattr(ex.os, "scandir", denied)
    with pytest.raises(ex.FileOpsError, match="Нет доступа"):
        ex.list_dir(tmp_path)


def test_trash_only_after_confirmation(tree):
    fake = FakeTrash()
    target = [tree / "b.txt", tree / "Папка Б"]
    assert ex.trash(target, confirm=lambda paths: False, send=fake) == []
    assert fake.sent == []
    asked = []
    done = ex.trash(target, confirm=lambda paths: asked.append(paths) or True, send=fake)
    assert asked == [target]
    assert fake.sent == target == done
    # проводник сам ничего не удалил: всё удаление - только через функцию Корзины
    assert (tree / "b.txt").exists() and (tree / "Папка Б" / "внутри.txt").exists()


def test_default_trash_uses_recycle_bin_and_never_deletes(tree, monkeypatch):
    calls = []
    monkeypatch.setattr(QFile, "moveToTrash", staticmethod(lambda p: calls.append(p) or False))
    with pytest.raises(ex.FileOpsError, match="Файл не удалён"):
        ex.default_trash(tree / "b.txt")
    assert calls == [str(tree / "b.txt")]
    assert (tree / "b.txt").read_text(encoding="utf-8") == "bbb"


def test_source_has_no_permanent_delete():
    src = Path(ex.__file__).read_text(encoding="utf-8")
    for bad in ("rmtree", "os.remove", "os.unlink", ".unlink(", ".rmdir(", "send2trash"):
        assert bad not in src, bad


def test_names_are_validated(tree):
    for bad in ("", "  ", "a/b", "a\\b", "что?", "CON", "com1.txt", "точка.", ".."):
        with pytest.raises(ex.FileOpsError):
            ex.validate_name(bad)
    assert ex.validate_name("  нормальное имя.txt ") == "нормальное имя.txt"


def test_new_folder_and_file_do_not_overwrite(tree):
    assert ex.new_folder(tree, "Новая").is_dir()
    with pytest.raises(ex.FileOpsError, match="уже есть"):
        ex.new_folder(tree, "Новая")
    with pytest.raises(ex.FileOpsError, match="уже есть"):
        ex.new_file(tree, "b.txt")
    assert (tree / "b.txt").read_text(encoding="utf-8") == "bbb"


def test_rename(tree):
    assert ex.rename(tree / "b.txt", "c.txt") == tree / "c.txt"
    with pytest.raises(ex.FileOpsError, match="уже есть"):
        ex.rename(tree / "c.txt", "A.py")
    assert ex.rename(tree / "c.txt", "C.txt").name == "C.txt"  # только регистр


def test_copy_never_overwrites(tree):
    (tree / "папка а" / "b.txt").write_text("старое", encoding="utf-8")
    done = ex.copy_into([tree / "b.txt"], tree / "папка а")
    assert done == [tree / "папка а" / "b (2).txt"]
    assert (tree / "папка а" / "b.txt").read_text(encoding="utf-8") == "старое"
    # копия в ту же папку
    assert ex.copy_into([tree / "b.txt"], tree) == [tree / "b (2).txt"]
    assert ex.copy_into([tree / "Папка Б"], tree) == [tree / "Папка Б (2)"]
    assert (tree / "Папка Б (2)" / "внутри.txt").exists()


def test_folder_cannot_go_into_itself(tree):
    with pytest.raises(ex.FileOpsError, match="внутрь"):
        ex.copy_into([tree / "Папка Б"], tree / "Папка Б")
    ex.new_folder(tree / "Папка Б", "дочь")
    with pytest.raises(ex.FileOpsError, match="внутрь"):
        ex.move_into([tree / "Папка Б"], tree / "Папка Б" / "дочь")
    assert (tree / "Папка Б" / "внутри.txt").exists()


def test_move(tree):
    assert ex.move_into([tree / "b.txt"], tree) == [tree / "b.txt"]  # в ту же папку - ничего
    done = ex.move_into([tree / "b.txt", tree / "Папка Б"], tree / "папка а")
    assert [p.name for p in done] == ["b.txt", "Папка Б"]
    assert not (tree / "b.txt").exists()
    assert (tree / "папка а" / "Папка Б" / "внутри.txt").exists()


# ─── окно ────────────────────────────────────────────────────────────────────


@pytest.fixture
def win(qapp, tree):
    state = {"confirm": True, "asked": [], "errors": [], "text": None}
    fake = FakeTrash()

    def confirm(paths):
        state["asked"].append(list(paths))
        return state["confirm"]

    w = ex.ExplorerWindow(tree, confirm=confirm, trash_fn=fake,
                          ask_text=lambda *_a: state["text"],
                          show_error=state["errors"].append)
    w.show()
    w.activateWindow()
    QTest.qWaitForWindowActive(w)
    w.explorer.list.setFocus()
    w.state, w.fake = state, fake
    yield w
    w.close()


def test_window_lists_folder(win, tree):
    e = win.explorer
    assert e.visible_names() == ["папка а", "Папка Б", "A.py", "b.txt"]
    assert e.path_edit.text() == str(tree)


def test_delete_key_asks_then_sends_to_trash(win, tree):
    e = win.explorer
    e.select_names({"b.txt"})
    win.state["confirm"] = False
    QTest.keyClick(e.list, Qt.Key_Delete)
    assert win.state["asked"] == [[tree / "b.txt"]]
    assert win.fake.sent == []
    win.state["confirm"] = True
    e.select_names({"b.txt", "A.py"})
    QTest.keyClick(e.list, Qt.Key_Delete)
    assert sorted(win.fake.sent) == sorted([tree / "b.txt", tree / "A.py"])
    assert (tree / "b.txt").exists()  # удаляет только Корзина, окно - нет


def test_trash_error_is_shown_not_crash(win, tree):
    def broken(_p):
        raise ex.FileOpsError("Корзина недоступна. Файл не удалён.")

    win.explorer.trash_fn = broken
    win.explorer.select_names({"b.txt"})
    win.explorer.delete_selected()
    assert win.state["errors"] == ["Корзина недоступна. Файл не удалён."]
    assert (tree / "b.txt").exists()


def test_navigation_back_forward_up(win, tree):
    e = win.explorer
    e.select_names({"Папка Б"})
    e.open_selected()
    assert e.current == tree / "Папка Б" and e.visible_names() == ["внутри.txt"]
    e.back()
    assert e.current == tree
    e.forward()
    assert e.current == tree / "Папка Б"
    e.up()
    assert e.current == tree
    assert not e.btn_forward.isEnabled()


def test_typed_bad_path_shows_error(win, tree):
    e = win.explorer
    e.path_edit.setText(str(tree / "нет такой"))
    QTest.keyClick(e.path_edit, Qt.Key_Return)
    assert e.current == tree
    assert "не найдена" in win.state["errors"][0]
    assert e.path_edit.text() == str(tree)


def test_search_filters(win):
    e = win.explorer
    e.search.setText("ПАП")
    assert e.visible_names() == ["папка а", "Папка Б"]
    e.search.setText("")
    assert len(e.visible_names()) == 4


def test_copy_paste_and_cut_paste(win, tree):
    e = win.explorer
    e.select_names({"b.txt"})
    QTest.keyClick(e.list, Qt.Key_C, Qt.ControlModifier)
    e.navigate(tree / "папка а")
    QTest.keyClick(e.list, Qt.Key_V, Qt.ControlModifier)
    assert (tree / "папка а" / "b.txt").exists() and (tree / "b.txt").exists()
    e.navigate(tree)
    e.select_names({"A.py"})
    e.cut_selected()
    e.navigate(tree / "Папка Б")
    e.paste()
    assert (tree / "Папка Б" / "A.py").exists() and not (tree / "A.py").exists()
    assert e.clipboard == []


def test_rename_and_new_folder_via_window(win, tree):
    e = win.explorer
    e.select_names({"b.txt"})
    win.state["text"] = "переименован.txt"
    e.rename_selected()
    assert (tree / "переименован.txt").exists()
    win.state["text"] = "a/b"
    e.select_names({"переименован.txt"})
    e.rename_selected()
    assert "нельзя" in win.state["errors"][-1]
    win.state["text"] = "Свежая"
    e.create_folder()
    assert (tree / "Свежая").is_dir()
    win.state["text"] = None  # «Отмена» в диалоге
    e.create_folder()
    assert sorted(os.listdir(tree)).count("Свежая") == 1


def test_labels_fit(win):
    check_wrapped_labels(win)
