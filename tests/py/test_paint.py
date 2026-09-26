"""Законы Paint: рисование меняет картинку, отмена возвращает её до пикселя,
сохранение и открытие дают те же пиксели, ни один инструмент не падает."""

from pathlib import Path

import numpy as np
import pytest
from PySide6.QtCore import QPoint, QSize, Qt
from PySide6.QtGui import QColor, QImage
from PySide6.QtTest import QTest
from PySide6.QtWidgets import QCheckBox, QLabel

import paint as pt
from qt_laws import check_wrapped_labels


@pytest.fixture
def win(qapp):
    errors, answers = [], []
    w = pt.PaintWindow(ask_unsaved=lambda: answers.pop(0) if answers else "discard",
                       show_error=errors.append)
    w.errors, w.answers = errors, answers
    w.resize_canvas(200, 150)
    w.doc.undo_stack.clear()
    w.doc.dirty = False
    w.canvas.ask_text = lambda: ("Привет", 24)
    yield w
    w.doc.dirty = False
    w.close()


def snap(w) -> QImage:
    return w.doc.image.copy()


def drag(w, tool, a, b, secondary=False, via_mouse=False):
    w.set_tool(tool)
    c = w.canvas
    if via_mouse:
        m = c.MARGIN
        btn = Qt.RightButton if secondary else Qt.LeftButton
        QTest.mousePress(c, btn, Qt.NoModifier, QPoint(a[0] + m, a[1] + m))
        mid = ((a[0] + b[0]) // 2 + m, (a[1] + b[1]) // 2 + m)
        QTest.mouseMove(c, QPoint(*mid))
        QTest.mouseMove(c, QPoint(b[0] + m, b[1] + m))
        QTest.mouseRelease(c, btn, Qt.NoModifier, QPoint(b[0] + m, b[1] + m))
    else:
        c.begin(QPoint(*a), secondary)
        c.move_to(QPoint(*b))
        c.end(QPoint(*b))


def test_mouse_drawing_changes_picture_and_undo_restores(win):
    before = snap(win)
    drag(win, "brush", (20, 20), (150, 100), via_mouse=True)
    drawn = snap(win)
    assert not pt.same_pixels(before, drawn)
    assert win.doc.dirty and win.windowTitle().startswith("*")
    win.undo()
    assert pt.same_pixels(win.doc.image, before)
    win.redo()
    assert pt.same_pixels(win.doc.image, drawn)


def test_right_button_draws_second_color(win):
    win.set_color(QColor("#00ff00"), secondary=True)
    drag(win, "brush", (30, 30), (100, 30), secondary=True, via_mouse=True)
    assert win.doc.image.pixelColor(60, 30) == QColor("#00ff00")


ALL_DRAWING = ["brush", "pencil", "airbrush", "calligraphy", "line", "rect", "ellipse",
               "triangle", "star", "fill", "text"]


@pytest.mark.parametrize("tool", ALL_DRAWING)
def test_every_tool_changes_picture_and_undoes(win, tool):
    before = snap(win)
    drag(win, tool, (40, 30), (160, 120))
    assert not pt.same_pixels(before, win.doc.image), tool
    assert len(win.doc.undo_stack) == 1
    win.undo()
    assert pt.same_pixels(win.doc.image, before)


@pytest.mark.parametrize("tool", ["rect", "ellipse", "triangle", "star", "line"])
def test_shapes_drawn_backwards(win, tool):
    """Было (PIL): прямоугольник и эллипс «справа налево» роняли программу (x1 < x0)."""
    drag(win, tool, (170, 130), (20, 15))
    arr = pt.pixels(win.doc.image)
    assert (arr != arr[0, 0]).sum() > 50


def test_eraser_paints_second_color(win):
    drag(win, "rect", (10, 10), (190, 140))
    win.fill_check.setChecked(True)
    drag(win, "rect", (10, 10), (190, 140))
    assert win.doc.image.pixelColor(100, 75) == QColor("black")
    drag(win, "eraser", (60, 75), (140, 75))
    assert win.doc.image.pixelColor(100, 75) == QColor("white")


def test_brush_opacity_is_even_across_stroke(win):
    """Полупрозрачный мазок не темнеет на перехлёстах (было: каждый кружок кисти
    ложился поверх предыдущего, и штрих шёл пятнами; в PIL-версии вообще дырявил картинку)."""
    win.opacity_slider.setValue(50)
    win.size_spin.setValue(12)
    c = win.canvas
    win.set_tool("brush")
    c.begin(QPoint(20, 75))
    for x in range(20, 180, 3):  # много мелких шагов - много перехлёстов
        c.move_to(QPoint(x, 75))
    c.move_to(QPoint(100, 75))  # и обратно по уже нарисованному
    c.end(QPoint(100, 75))
    col = win.doc.image.pixelColor(100, 75)
    assert abs(col.red() - 128) <= 2 and col.alpha() == 255
    assert win.doc.image.pixelColor(60, 75) == col


def test_fill_stays_inside_outline(win):
    drag(win, "rect", (50, 40), (150, 110))
    win.set_color(QColor("red"))
    win.set_tool("fill")
    win.canvas.begin(QPoint(100, 75))
    img = win.doc.image
    assert img.pixelColor(100, 75) == QColor("red")
    assert img.pixelColor(60, 50) == QColor("red")
    assert img.pixelColor(10, 10) == QColor("white")
    assert img.pixelColor(190, 140) == QColor("white")


def test_fill_same_color_adds_no_undo_step(win):
    win.set_color(QColor("white"))
    win.set_tool("fill")
    win.canvas.begin(QPoint(10, 10))
    assert win.doc.undo_stack == []


def test_fill_big_canvas_is_fast(qapp):
    import time

    w = pt.PaintWindow(ask_unsaved=lambda: "discard")
    w.set_tool("fill")
    w.set_color(QColor("blue"))
    t = time.perf_counter()
    w.canvas.begin(QPoint(5, 5))
    assert time.perf_counter() - t < 2.0  # 1200×800 (было: питоновский цикл по пикселям)
    assert w.doc.image.pixelColor(1199, 799) == QColor("blue")
    w.doc.dirty = False
    w.close()


def test_eyedropper_picks_color_without_undo_step(win):
    drag(win, "rect", (10, 10), (100, 100))
    n = len(win.doc.undo_stack)
    win.set_color(QColor("red"))
    win.set_tool("eyedropper")
    win.canvas.begin(QPoint(10, 50))
    assert win.canvas.primary == QColor("black")
    assert len(win.doc.undo_stack) == n


def test_text_cancel_changes_nothing(win):
    win.canvas.ask_text = lambda: None
    before = snap(win)
    drag(win, "text", (10, 10), (10, 10))
    assert pt.same_pixels(before, win.doc.image) and win.doc.undo_stack == []


def test_escape_cancels_stroke(win):
    before = snap(win)
    win.set_tool("brush")
    win.canvas.begin(QPoint(10, 10))
    win.canvas.move_to(QPoint(100, 100))
    win.canvas.cancel()
    assert pt.same_pixels(before, win.doc.image) and win.doc.undo_stack == []


def test_undo_limit(win):
    for i in range(pt.UNDO_LIMIT + 10):
        drag(win, "pencil", (5, 5 + i % 100), (50, 5 + i % 100))
    assert len(win.doc.undo_stack) == pt.UNDO_LIMIT


@pytest.mark.parametrize("ext", [".png", ".bmp"])
def test_save_and_open_same_pixels(win, tmp_path, ext):
    drag(win, "ellipse", (20, 20), (180, 130))
    win.set_color(QColor(12, 200, 99))
    drag(win, "brush", (10, 140), (190, 10))
    path = tmp_path / f"картинка{ext}"
    assert win.save_to(path)
    assert not win.doc.dirty and win.windowTitle().startswith("картинка")
    saved = snap(win)
    win.new_image()
    assert not pt.same_pixels(saved, win.doc.image)
    assert win.open_file(path)
    assert pt.same_pixels(saved, win.doc.image)
    assert win.doc.undo_stack == [] and not win.doc.dirty


def test_save_jpg_and_without_extension(win, tmp_path):
    drag(win, "rect", (20, 20), (100, 100))
    assert win.save_to(tmp_path / "a.jpg")
    assert QImage(str(tmp_path / "a.jpg")).size() == QSize(200, 150)
    assert win.save_to(tmp_path / "без_расширения")
    assert (tmp_path / "без_расширения.png").exists()


def test_open_broken_file_shows_error_and_keeps_picture(win, tmp_path):
    drag(win, "rect", (20, 20), (100, 100))
    before = snap(win)
    bad = tmp_path / "битый.png"
    bad.write_bytes(b"not an image")
    assert not win.open_file(bad)
    assert "не открывается" in win.errors[0]
    assert pt.same_pixels(before, win.doc.image)


def test_save_error_is_shown(win, tmp_path):
    drag(win, "rect", (20, 20), (100, 100))
    assert not win.save_to(tmp_path / "нет-папки" / "a.png")
    assert "Не удалось записать" in win.errors[0]
    assert win.doc.dirty and win.doc.path is None


def test_unsaved_changes_are_asked_about(win, tmp_path):
    drag(win, "rect", (20, 20), (100, 100))
    drawn = snap(win)
    win.answers.append("cancel")
    win.new_image()
    assert pt.same_pixels(drawn, win.doc.image)  # «Отмена» - картинка на месте
    win.answers.append("discard")
    win.new_image()
    assert not pt.same_pixels(drawn, win.doc.image)


def test_close_with_changes_can_be_cancelled(win):
    win.show()
    drag(win, "rect", (20, 20), (100, 100))
    win.answers.append("cancel")
    assert win.close() is False
    assert win.isVisible()


@pytest.mark.parametrize("name", ["blur", "sharpen", "edges", "invert", "gray"])
def test_filters_change_and_undo(win, name):
    win.set_color(QColor("#3070d0"))
    win.fill_check.setChecked(True)
    drag(win, "ellipse", (30, 20), (170, 130))
    before = snap(win)
    win.filter(name)
    assert not pt.same_pixels(before, win.doc.image)
    assert (pt.channels(win.doc.image)[:, :, 3] == 255).all()
    win.undo()
    assert pt.same_pixels(before, win.doc.image)


def test_rotate_flip_resize(win):
    drag(win, "line", (0, 0), (40, 0))
    win.transform("rot_cw")
    assert win.doc.image.size() == QSize(150, 200)
    assert win.canvas.width() == 150 + 2 * win.canvas.MARGIN
    win.transform("rot_ccw")
    win.transform("flip_h")
    assert win.doc.image.pixelColor(195, 0) != QColor("white")
    win.resize_canvas(300, 50)
    assert win.doc.image.size() == QSize(300, 50)
    assert win.doc.image.pixelColor(250, 25) == QColor("white")
    for _ in range(4):
        win.undo()
    assert win.doc.image.size() == QSize(200, 150)


def test_flood_mask_matches_simple_fill():
    rng = np.random.default_rng(3)
    arr = rng.integers(0, 2, (40, 50)).astype(np.uint32)
    mask = pt.flood_mask(arr, 7, 9)
    # эталон: обычный обход в ширину
    ref = np.zeros_like(mask)
    stack = [(7, 9)]
    while stack:
        x, y = stack.pop()
        if 0 <= x < 50 and 0 <= y < 40 and not ref[y, x] and arr[y, x] == arr[9, 7]:
            ref[y, x] = True
            stack += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
    assert np.array_equal(mask, ref)


def test_toolbar_text_not_cut_at_min_size(win):
    win.show()
    win.resize(win.minimumSize())
    qapp_process(win)
    found = win.centralWidget().findChildren(QLabel) + win.centralWidget().findChildren(QCheckBox)
    for wdg in found:
        if wdg.isVisible() and wdg.text():
            assert wdg.width() >= wdg.sizeHint().width(), wdg.text()
    check_wrapped_labels(win)


def qapp_process(w):
    from PySide6.QtWidgets import QApplication

    for _ in range(3):
        QApplication.processEvents()
