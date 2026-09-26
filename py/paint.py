"""Paint: простой графический редактор на PySide6.

Инструменты: кисть, карандаш, аэрограф, каллиграфия, ластик, линия, прямоугольник,
эллипс, треугольник, звезда, заливка, пипетка, текст. Левая кнопка мыши рисует
основным цветом, правая - вторым. Прозрачность кисти действует на весь мазок
целиком (штрих не темнеет на перехлёстах). Отмена/повтор до 50 шагов,
фильтры, повороты, размер холста, сетка, открытие/сохранение PNG, JPG, BMP.

Запуск: python paint.py [картинка]
"""

from __future__ import annotations

import math
import random
import sys
from pathlib import Path
from typing import Callable, Optional

import numpy as np
from PySide6.QtCore import QPoint, QPointF, QRect, QRectF, QSize, Qt, Signal
from PySide6.QtGui import (
    QAction, QColor, QFont, QImage, QKeySequence, QPainter, QPainterPath, QPen, QPolygonF,
    QTransform,
)
from PySide6.QtWidgets import (
    QApplication, QButtonGroup, QCheckBox, QColorDialog, QDialog, QDialogButtonBox,
    QFileDialog, QFormLayout, QGridLayout, QHBoxLayout, QInputDialog, QLabel, QMainWindow,
    QMessageBox, QPushButton, QScrollArea, QSlider, QSpinBox, QToolButton, QVBoxLayout,
    QWidget,
)

import qt_theme

UNDO_LIMIT = 50
DEFAULT_SIZE = QSize(1200, 800)
IMAGE_FORMAT = QImage.Format_ARGB32

PALETTE = [
    "#000000", "#ffffff", "#808080", "#c0c0c0", "#800000", "#ff0000", "#ff6600", "#ff9900",
    "#ffff00", "#00ff00", "#008000", "#00ffff", "#0000ff", "#000080", "#800080", "#ff00ff",
    "#ff69b4", "#ffd700", "#a52a2a", "#deb887", "#5f9ea0", "#7fff00", "#d2691e", "#6495ed",
    "#dc143c", "#00ced1", "#ff1493", "#1e90ff", "#adff2f", "#ff4500", "#da70d6", "#eee8aa",
]

# (код, значок, подсказка, клавиша)
TOOLS = [
    ("brush", "🖌", "Кисть", "B"),
    ("pencil", "✏", "Карандаш", "P"),
    ("airbrush", "💨", "Аэрограф", "A"),
    ("calligraphy", "✒", "Каллиграфия", "K"),
    ("eraser", "▭", "Ластик (рисует вторым цветом)", "E"),
    ("line", "╱", "Линия (Shift - ровно)", "L"),
    ("rect", "▢", "Прямоугольник (Shift - квадрат)", "R"),
    ("ellipse", "◯", "Эллипс (Shift - круг)", "O"),
    ("triangle", "△", "Треугольник", "T"),
    ("star", "☆", "Звезда", "S"),
    ("fill", "🪣", "Заливка", "F"),
    ("eyedropper", "💧", "Пипетка", "I"),
    ("text", "A", "Текст", "X"),
]
STROKE_TOOLS = {"brush", "pencil", "airbrush", "calligraphy", "eraser"}
SHAPE_TOOLS = {"line", "rect", "ellipse", "triangle", "star"}


# ─── ПИКСЕЛИ ─────────────────────────────────────────────────────────────────


def pixels(img: QImage) -> np.ndarray:
    """Пиксели QImage (ARGB32) как массив uint32 [высота, ширина] - общая память.
    Картинка должна жить, пока жив массив (массив память не держит)."""
    h, w = img.height(), img.width()
    arr = np.frombuffer(img.bits(), np.uint32).reshape(h, img.bytesPerLine() // 4)
    return arr[:, :w]


def channels(img: QImage) -> np.ndarray:
    """Каналы [высота, ширина, 4] в порядке B, G, R, A - общая память."""
    h, w = img.height(), img.width()
    arr = np.frombuffer(img.bits(), np.uint8).reshape(h, img.bytesPerLine())
    return arr[:, : w * 4].reshape(h, w, 4)


def same_pixels(a: QImage, b: QImage) -> bool:
    # картинки держим в переменных: массив смотрит в их память, а не владеет ею
    a2, b2 = a.convertToFormat(IMAGE_FORMAT), b.convertToFormat(IMAGE_FORMAT)
    return a2.size() == b2.size() and np.array_equal(pixels(a2), pixels(b2))


def flood_mask(arr: np.ndarray, x: int, y: int) -> np.ndarray:
    """Область одного цвета вокруг (x, y), по 4 соседям. Построчная заливка на numpy."""
    h, w = arr.shape
    target = arr[y, x]
    mask = np.zeros((h, w), bool)
    stack = [(x, y)]
    while stack:
        sx, sy = stack.pop()
        if mask[sy, sx] or arr[sy, sx] != target:
            continue
        row_ok = (arr[sy] == target) & ~mask[sy]
        left = np.flatnonzero(~row_ok[:sx])
        right = np.flatnonzero(~row_ok[sx:])
        lo = left[-1] + 1 if left.size else 0
        hi = sx + right[0] - 1 if right.size else w - 1
        mask[sy, lo:hi + 1] = True
        for ny in (sy - 1, sy + 1):
            if 0 <= ny < h:
                seg = (arr[ny, lo:hi + 1] == target) & ~mask[ny, lo:hi + 1]
                if seg.any():
                    edges = np.diff(np.concatenate(([0], seg.astype(np.int8), [0])))
                    for start in np.flatnonzero(edges == 1):
                        stack.append((lo + int(start), ny))
    return mask


def blend(color: QColor, under: int, opacity: float) -> int:
    """Цвет color с прозрачностью opacity поверх пикселя under (ARGB32 числом)."""
    ur, ug, ub = (under >> 16) & 255, (under >> 8) & 255, under & 255
    a = opacity * color.alphaF()
    r = round(color.red() * a + ur * (1 - a))
    g = round(color.green() * a + ug * (1 - a))
    b = round(color.blue() * a + ub * (1 - a))
    return (0xFF << 24) | (r << 16) | (g << 8) | b


def _shifted_sum(ch: np.ndarray, kernel: np.ndarray) -> np.ndarray:
    pad = np.pad(ch.astype(np.float32), ((1, 1), (1, 1), (0, 0)), mode="edge")
    h, w = ch.shape[:2]
    out = np.zeros(ch.shape, np.float32)
    for dy in range(3):
        for dx in range(3):
            k = kernel[dy, dx]
            if k:
                out += k * pad[dy:dy + h, dx:dx + w]
    return out


FILTERS = {
    "blur": ("Размытие", np.full((3, 3), 1 / 9, np.float32), 2),
    "sharpen": ("Резкость", np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]], np.float32), 1),
    "edges": ("Контуры", np.array([[-1, -1, -1], [-1, 8, -1], [-1, -1, -1]], np.float32), 1),
}


def apply_filter(img: QImage, name: str) -> QImage:
    out = img.convertToFormat(IMAGE_FORMAT).copy()
    ch = channels(out)
    rgb = ch[:, :, :3]
    if name == "invert":
        rgb[:] = 255 - rgb
    elif name == "gray":
        g = (0.114 * rgb[:, :, 0] + 0.587 * rgb[:, :, 1] + 0.299 * rgb[:, :, 2]).round().astype(np.uint8)
        rgb[:] = g[:, :, None]
    else:
        _title, kernel, passes = FILTERS[name]
        data = rgb.copy()
        for _ in range(passes):
            data = np.clip(_shifted_sum(data, kernel), 0, 255).round().astype(np.uint8)
        if name == "edges":
            data = np.abs(data)
        rgb[:] = data
    ch[:, :, 3] = 255
    return out


def star_polygon(rect: QRectF, points: int = 5) -> QPolygonF:
    c = rect.center()
    outer = min(rect.width(), rect.height()) / 2
    inner = outer * 0.4
    poly = QPolygonF()
    for i in range(points * 2):
        ang = math.pi * i / points - math.pi / 2
        r = outer if i % 2 == 0 else inner
        poly.append(QPointF(c.x() + r * math.cos(ang), c.y() + r * math.sin(ang)))
    return poly


# ─── ДОКУМЕНТ ────────────────────────────────────────────────────────────────


class Document:
    """Картинка, история отмен и файл. Ничего не знает об окне."""

    def __init__(self, size: QSize = DEFAULT_SIZE, background: QColor = QColor("white")):
        self.image = QImage(size, IMAGE_FORMAT)
        self.image.fill(background)
        self.undo_stack: list[QImage] = []
        self.redo_stack: list[QImage] = []
        self.path: Optional[Path] = None
        self.dirty = False

    def checkpoint(self):
        """Запомнить состояние перед изменением."""
        self.undo_stack.append(self.image.copy())
        del self.undo_stack[:-UNDO_LIMIT]
        self.redo_stack.clear()
        self.dirty = True

    def drop_checkpoint(self):
        """Изменения не было (например, клик пипеткой) - убрать лишний шаг отмены."""
        if self.undo_stack:
            self.undo_stack.pop()

    def undo(self) -> bool:
        if not self.undo_stack:
            return False
        self.redo_stack.append(self.image)
        self.image = self.undo_stack.pop()
        self.dirty = True
        return True

    def redo(self) -> bool:
        if not self.redo_stack:
            return False
        self.undo_stack.append(self.image)
        self.image = self.redo_stack.pop()
        self.dirty = True
        return True

    def replace(self, image: QImage):
        """Заменить картинку целиком (фильтр, поворот, размер) с шагом отмены."""
        self.checkpoint()
        self.image = image.convertToFormat(IMAGE_FORMAT)

    def load(self, path) -> None:
        img = QImage(str(path))
        if img.isNull():
            raise OSError(f"«{Path(path).name}» не открывается как картинка (файл повреждён или формат не поддерживается).")
        opaque = QImage(img.size(), IMAGE_FORMAT)
        opaque.fill(QColor("white"))
        p = QPainter(opaque)
        p.drawImage(0, 0, img)  # прозрачные места PNG становятся белыми, как в Paint
        p.end()
        self.image = opaque
        self.undo_stack.clear()
        self.redo_stack.clear()
        self.path = Path(path)
        self.dirty = False

    def save(self, path) -> None:
        path = Path(path)
        img = self.image
        if path.suffix.lower() in (".jpg", ".jpeg", ".bmp"):
            img = img.convertToFormat(QImage.Format_RGB32)
        if not img.save(str(path)):
            raise OSError(f"Не удалось записать «{path.name}» (нет доступа к папке или неизвестное расширение).")
        self.path = path
        self.dirty = False


# ─── ХОЛСТ ───────────────────────────────────────────────────────────────────


class Canvas(QWidget):
    """Рисование мышью по Document. Мазок копится в отдельном слое и кладётся на
    картинку целиком с прозрачностью - так перехлёсты не темнеют."""

    changed = Signal()
    cursor_moved = Signal(object)  # QPoint или None
    color_picked = Signal(QColor, bool)  # цвет, для второго цвета

    MARGIN = 16

    def __init__(self, doc: Document, parent=None):
        super().__init__(parent)
        self.doc = doc
        self.tool = "brush"
        self.primary = QColor("black")
        self.secondary = QColor("white")
        self.size = 6
        self.opacity = 1.0
        self.fill_shapes = False
        self.show_grid = False
        self.ask_text: Callable[[], Optional[tuple[str, int]]] = self._ask_text
        self._active = False
        self._color = QColor("black")
        self._start = QPoint()
        self._last = QPoint()
        self._base: Optional[QImage] = None
        self._layer: Optional[QImage] = None
        self._rng = random.Random(1)
        self.setMouseTracking(True)
        self.setCursor(Qt.CrossCursor)
        self.setFocusPolicy(Qt.StrongFocus)
        self.sync_size()

    def sync_size(self):
        s = self.doc.image.size()
        self.setFixedSize(s.width() + 2 * self.MARGIN, s.height() + 2 * self.MARGIN)
        self.update()

    def to_image(self, pos) -> QPoint:
        return QPoint(int(pos.x()) - self.MARGIN, int(pos.y()) - self.MARGIN)

    def inside(self, p: QPoint) -> bool:
        return self.doc.image.rect().contains(p)

    # отрисовка

    def paintEvent(self, _):
        p = QPainter(self)
        p.fillRect(self.rect(), QColor("#3a3d47"))
        p.drawImage(self.MARGIN, self.MARGIN, self.doc.image)
        if self.show_grid:
            p.setPen(QPen(QColor(0, 0, 0, 60), 1))
            w, h = self.doc.image.width(), self.doc.image.height()
            for x in range(0, w, 32):
                p.drawLine(self.MARGIN + x, self.MARGIN, self.MARGIN + x, self.MARGIN + h)
            for y in range(0, h, 32):
                p.drawLine(self.MARGIN, self.MARGIN + y, self.MARGIN + w, self.MARGIN + y)
        p.setPen(QPen(QColor("#15161a"), 1))
        p.drawRect(self.MARGIN - 1, self.MARGIN - 1, self.doc.image.width() + 1, self.doc.image.height() + 1)

    # мышь

    def mousePressEvent(self, e):
        if e.button() not in (Qt.LeftButton, Qt.RightButton) or self._active:
            return
        pt = self.to_image(e.position())
        secondary = e.button() == Qt.RightButton
        self.begin(pt, secondary, e.modifiers())

    def mouseMoveEvent(self, e):
        pt = self.to_image(e.position())
        self.cursor_moved.emit(pt if self.inside(pt) else None)
        if self._active:
            self.move_to(pt, e.modifiers())

    def mouseReleaseEvent(self, e):
        if self._active:
            self.end(self.to_image(e.position()), e.modifiers())

    # действия (их же вызывают тесты)

    def begin(self, pt: QPoint, secondary: bool = False, mods=Qt.NoModifier):
        tool = self.tool
        color = QColor(self.secondary if secondary else self.primary)
        if tool == "eraser":
            color = QColor(self.primary if secondary else self.secondary)
        if tool == "eyedropper":
            if self.inside(pt):
                self.color_picked.emit(self.doc.image.pixelColor(pt), secondary)
            return
        if tool == "fill":
            if self.inside(pt):
                self.doc.checkpoint()
                if not self.flood_fill(pt, color):
                    self.doc.drop_checkpoint()
                self._done()
            return
        if tool == "text":
            got = self.ask_text()
            if got and got[0].strip():
                self.doc.checkpoint()
                self.draw_text(pt, got[0], got[1], color)
                self._done()
            return
        self.doc.checkpoint()
        self._active = True
        self._color = color
        self._start = self._last = pt
        self._base = self.doc.image.copy()
        self._layer = QImage(self.doc.image.size(), QImage.Format_ARGB32_Premultiplied)
        self._layer.fill(Qt.transparent)
        if tool in STROKE_TOOLS:
            self._stroke(pt, pt)
        self._compose(pt, mods)

    def move_to(self, pt: QPoint, mods=Qt.NoModifier):
        if not self._active:
            return
        if self.tool in STROKE_TOOLS:
            self._stroke(self._last, pt)
        self._last = pt
        self._compose(pt, mods)

    def end(self, pt: QPoint, mods=Qt.NoModifier):
        if not self._active:
            return
        self.move_to(pt, mods)
        self._active = False
        self._base = self._layer = None
        self._done()

    def cancel(self):
        """Esc посреди мазка: вернуть как было."""
        if self._active:
            self._active = False
            self.doc.image = self._base
            self.doc.drop_checkpoint()
            self._base = self._layer = None
            self.update()

    def _done(self):
        self.update()
        self.changed.emit()

    # мазки

    def _pen(self, width=None, cap=Qt.RoundCap):
        c = QColor(self._color)
        c.setAlpha(255)
        return QPen(c, width or self.size, Qt.SolidLine, cap, Qt.RoundJoin)

    def _stroke(self, a: QPoint, b: QPoint):
        p = QPainter(self._layer)
        tool = self.tool
        if tool in ("brush", "eraser"):
            p.setRenderHint(QPainter.Antialiasing, tool == "brush")
            width = self.size if tool == "brush" else self.size * 2
            p.setPen(self._pen(width))
            p.drawLine(a, b) if a != b else p.drawPoint(a)
        elif tool == "pencil":
            p.setPen(self._pen(max(1, self.size // 3), Qt.SquareCap))
            p.drawLine(a, b) if a != b else p.drawPoint(a)
        elif tool == "airbrush":
            c = QColor(self._color)
            radius = self.size * 3
            for _ in range(self.size * 4):
                ang = self._rng.uniform(0, 2 * math.pi)
                dist = self._rng.uniform(0, 1) ** 0.7 * radius
                c.setAlphaF(max(0.0, 1 - dist / radius))
                p.setPen(QPen(c, 1))
                p.drawPoint(QPointF(b.x() + dist * math.cos(ang), b.y() + dist * math.sin(ang)))
        elif tool == "calligraphy":
            p.setRenderHint(QPainter.Antialiasing)
            w, h = max(1, self.size), max(1, self.size // 3)
            off = QPointF(w * 0.7, -w * 0.7)
            poly = QPolygonF([QPointF(a) + off, QPointF(a) - off * (h / w),
                              QPointF(b) - off * (h / w), QPointF(b) + off])
            p.setPen(Qt.NoPen)
            p.setBrush(self._pen().color())
            p.drawPolygon(poly)
        p.end()

    def shape_rect(self, a: QPoint, b: QPoint, square: bool) -> QRectF:
        if square:
            side = max(abs(b.x() - a.x()), abs(b.y() - a.y()))
            b = QPoint(a.x() + (side if b.x() >= a.x() else -side), a.y() + (side if b.y() >= a.y() else -side))
        return QRectF(QPointF(a), QPointF(b)).normalized()

    def _shape(self, p: QPainter, a: QPoint, b: QPoint, mods):
        shift = bool(mods & Qt.ShiftModifier)
        p.setRenderHint(QPainter.Antialiasing)
        p.setPen(self._pen(cap=Qt.RoundCap))
        p.setBrush(self._pen().color() if self.fill_shapes else Qt.NoBrush)
        if self.tool == "line":
            if shift:  # по 45°
                dx, dy = b.x() - a.x(), b.y() - a.y()
                ang = round(math.atan2(dy, dx) / (math.pi / 4)) * (math.pi / 4)
                length = math.hypot(dx, dy)
                b = QPoint(round(a.x() + length * math.cos(ang)), round(a.y() + length * math.sin(ang)))
            p.drawLine(a, b)
            return
        r = self.shape_rect(a, b, shift)
        if self.tool == "rect":
            p.drawRect(r)
        elif self.tool == "ellipse":
            p.drawEllipse(r)
        elif self.tool == "triangle":
            p.drawPolygon(QPolygonF([QPointF(r.center().x(), r.top()), r.bottomLeft(), r.bottomRight()]))
        elif self.tool == "star":
            p.drawPolygon(star_polygon(r))

    def _compose(self, pt: QPoint, mods):
        """Картинка = снимок до мазка + слой мазка (или фигура) с прозрачностью."""
        img = self._base.copy()
        p = QPainter(img)
        p.setOpacity(self.opacity * self._color.alphaF())
        if self.tool in SHAPE_TOOLS:
            layer = QImage(img.size(), QImage.Format_ARGB32_Premultiplied)
            layer.fill(Qt.transparent)
            lp = QPainter(layer)
            self._shape(lp, self._start, pt, mods)
            lp.end()
            p.drawImage(0, 0, layer)
        else:
            p.drawImage(0, 0, self._layer)
        p.end()
        self.doc.image = img
        self.update()

    def flood_fill(self, pt: QPoint, color: QColor) -> bool:
        arr = pixels(self.doc.image)
        old = int(arr[pt.y(), pt.x()])
        new = blend(color, old, self.opacity)
        if new == old:
            return False
        mask = flood_mask(arr, pt.x(), pt.y())
        arr[mask] = new
        return True

    def draw_text(self, pt: QPoint, text: str, size: int, color: QColor):
        p = QPainter(self.doc.image)
        p.setRenderHint(QPainter.TextAntialiasing)
        p.setOpacity(self.opacity)
        f = QFont("Arial")
        f.setPixelSize(max(6, size))
        p.setFont(f)
        p.setPen(color)
        rect = QRect(pt, QSize(self.doc.image.width() - pt.x(), self.doc.image.height() - pt.y()))
        p.drawText(rect, Qt.AlignLeft | Qt.AlignTop | Qt.TextWordWrap, text)
        p.end()

    def _ask_text(self):
        text, ok = QInputDialog.getMultiLineText(self, "Текст", "Что написать:")
        if not ok or not text.strip():
            return None
        size, ok = QInputDialog.getInt(self, "Текст", "Размер шрифта (пикселей):", max(16, self.size * 4), 6, 400)
        return (text, size) if ok else None


# ─── ОКНО ────────────────────────────────────────────────────────────────────


class ColorButton(QToolButton):
    def __init__(self, color: QColor, tip: str):
        super().__init__()
        self.setFixedSize(30, 30)
        self.setToolTip(tip)
        self.set_color(color)

    def set_color(self, color: QColor):
        self.color = QColor(color)
        self.setStyleSheet(f"QToolButton {{ background:{self.color.name()}; border:2px solid #888; border-radius:4px; }}")


class Swatch(QToolButton):
    picked = Signal(QColor, bool)

    def __init__(self, color: str):
        super().__init__()
        self.color = QColor(color)
        self.setFixedSize(20, 20)
        self.setToolTip(f"{color}: левая кнопка - основной, правая - второй цвет")
        self.setStyleSheet(f"QToolButton {{ background:{color}; border:1px solid #555; border-radius:3px; }}")

    def mousePressEvent(self, e):
        self.picked.emit(self.color, e.button() == Qt.RightButton)


class CanvasSizeDialog(QDialog):
    def __init__(self, size: QSize, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Размер холста")
        form = QFormLayout(self)
        self.w = QSpinBox()
        self.h = QSpinBox()
        for sb, v in ((self.w, size.width()), (self.h, size.height())):
            sb.setRange(1, 10000)
            sb.setValue(v)
            sb.setSuffix(" px")
        form.addRow("Ширина:", self.w)
        form.addRow("Высота:", self.h)
        bb = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
        bb.accepted.connect(self.accept)
        bb.rejected.connect(self.reject)
        form.addRow(bb)


IMAGE_FILTER = "Изображения (*.png *.jpg *.jpeg *.bmp *.gif *.webp);;Все файлы (*)"
SAVE_FILTER = "PNG (*.png);;JPEG (*.jpg *.jpeg);;BMP (*.bmp)"


class PaintWindow(QMainWindow):
    """Окно редактора. ask_unsaved/show_error подменяются в тестах."""

    def __init__(self, path: Optional[str] = None,
                 ask_unsaved: Optional[Callable[[], str]] = None,
                 show_error: Optional[Callable[[str], None]] = None):
        super().__init__()
        self.ask_unsaved = ask_unsaved or self._ask_unsaved
        self.show_error = show_error or (lambda t: QMessageBox.warning(self, "Paint", t))
        self.doc = Document()
        self.canvas = Canvas(self.doc)
        self.canvas.changed.connect(self._update_title)
        self.canvas.cursor_moved.connect(self._show_cursor)
        self.canvas.color_picked.connect(self.set_color)
        self._build()
        self.set_tool("brush")
        self.resize(1200, 820)
        self.setMinimumSize(900, 560)
        if path:
            self.open_file(path)
        self._update_title()

    # построение

    def _build(self):
        self._build_menu()

        tools = QWidget()
        grid = QGridLayout(tools)
        grid.setContentsMargins(4, 4, 4, 4)
        grid.setSpacing(3)
        self.tool_group = QButtonGroup(self)
        self.tool_buttons: dict[str, QToolButton] = {}
        for i, (code, icon, tip, key) in enumerate(TOOLS):
            b = QToolButton()
            b.setText(icon)
            b.setToolTip(f"{tip} ({key})")
            b.setCheckable(True)
            b.setFixedSize(36, 36)
            b.setStyleSheet("QToolButton { font-size:16px; padding:0px; }")
            b.clicked.connect(lambda _c=False, t=code: self.set_tool(t))
            self.tool_group.addButton(b)
            self.tool_buttons[code] = b
            grid.addWidget(b, i // 2, i % 2)
            act = QAction(self)
            act.setShortcut(QKeySequence(key))
            act.triggered.connect(lambda _c=False, t=code: self.set_tool(t))
            self.addAction(act)
        grid.setRowStretch(len(TOOLS), 1)

        top = QHBoxLayout()
        top.addWidget(QLabel("Размер:"))
        self.size_slider = QSlider(Qt.Horizontal)
        self.size_slider.setRange(1, 80)
        self.size_slider.setFixedWidth(100)
        self.size_spin = QSpinBox()
        self.size_spin.setRange(1, 80)
        self.size_slider.valueChanged.connect(self.size_spin.setValue)
        self.size_spin.valueChanged.connect(self.size_slider.setValue)
        self.size_spin.valueChanged.connect(lambda v: setattr(self.canvas, "size", v))
        self.size_spin.setValue(self.canvas.size)
        top.addWidget(self.size_slider)
        top.addWidget(self.size_spin)
        top.addSpacing(12)
        top.addWidget(QLabel("Непрозрачность:"))
        self.opacity_slider = QSlider(Qt.Horizontal)
        self.opacity_slider.setRange(1, 100)
        self.opacity_slider.setValue(100)
        self.opacity_slider.setFixedWidth(100)
        self.opacity_label = QLabel("100%")
        self.opacity_label.setMinimumWidth(40)
        self.opacity_slider.valueChanged.connect(self._set_opacity)
        top.addWidget(self.opacity_slider)
        top.addWidget(self.opacity_label)
        top.addSpacing(12)
        self.fill_check = QCheckBox("Заливать фигуры")
        self.fill_check.toggled.connect(lambda v: setattr(self.canvas, "fill_shapes", v))
        top.addWidget(self.fill_check)
        top.addStretch(1)

        palette = QHBoxLayout()
        palette.setSpacing(4)
        self.btn_primary = ColorButton(self.canvas.primary, "Основной цвет (левая кнопка мыши)")
        self.btn_secondary = ColorButton(self.canvas.secondary, "Второй цвет (правая кнопка мыши, ластик)")
        self.btn_primary.clicked.connect(lambda: self._choose_color(False))
        self.btn_secondary.clicked.connect(lambda: self._choose_color(True))
        swap = QToolButton()
        swap.setText("⇄")
        swap.setToolTip("Поменять цвета местами (Ctrl+Shift+X)")
        swap.clicked.connect(self.swap_colors)
        palette.addWidget(self.btn_primary)
        palette.addWidget(swap)
        palette.addWidget(self.btn_secondary)
        palette.addSpacing(8)
        pal_grid = QGridLayout()
        pal_grid.setSpacing(2)
        for i, c in enumerate(PALETTE):
            sw = Swatch(c)
            sw.picked.connect(self.set_color)
            pal_grid.addWidget(sw, i // 16, i % 16)
        palette.addLayout(pal_grid)
        more = QPushButton("Другой цвет…")
        more.clicked.connect(lambda: self._choose_color(False))
        palette.addWidget(more)
        palette.addStretch(1)

        self.scroll = QScrollArea()
        self.scroll.setWidget(self.canvas)
        self.scroll.setAlignment(Qt.AlignCenter)
        self.scroll.setStyleSheet("QScrollArea { background:#2b2d33; border:none; }")

        center = QWidget()
        cv = QVBoxLayout(center)
        cv.setContentsMargins(0, 0, 0, 0)
        cv.addLayout(top)
        cv.addWidget(self.scroll, 1)
        cv.addLayout(palette)

        body = QWidget()
        bl = QHBoxLayout(body)
        bl.setContentsMargins(6, 6, 6, 6)
        bl.addWidget(tools)
        bl.addWidget(center, 1)
        self.setCentralWidget(body)

        self.pos_label = QLabel()
        self.size_label = QLabel()
        self.statusBar().addWidget(self.pos_label)
        self.statusBar().addPermanentWidget(self.size_label)

    def _build_menu(self):
        mb = self.menuBar()

        def add(menu, text, slot, keys=None):
            act = menu.addAction(text)
            act.triggered.connect(slot)
            if keys:
                act.setShortcut(QKeySequence(keys))
            return act

        f = mb.addMenu("Файл")
        add(f, "Новый", self.new_image, QKeySequence.New)
        add(f, "Открыть…", self._open_dialog, QKeySequence.Open)
        f.addSeparator()
        add(f, "Сохранить", self.save, QKeySequence.Save)
        add(f, "Сохранить как…", self.save_as, "Ctrl+Shift+S")
        f.addSeparator()
        add(f, "Выход", self.close)

        e = mb.addMenu("Правка")
        self.act_undo = add(e, "Отменить", self.undo, QKeySequence.Undo)
        self.act_redo = add(e, "Повторить", self.redo, "Ctrl+Y")
        e.addSeparator()
        add(e, "Очистить холст", self.clear, "Ctrl+Shift+Del")
        add(e, "Поменять цвета местами", self.swap_colors, "Ctrl+Shift+X")

        im = mb.addMenu("Изображение")
        for code, (title, _k, _p) in FILTERS.items():
            add(im, title, lambda _c=False, n=code: self.filter(n))
        add(im, "Негатив", lambda: self.filter("invert"))
        add(im, "Оттенки серого", lambda: self.filter("gray"))
        im.addSeparator()
        add(im, "Отразить по горизонтали", lambda: self.transform("flip_h"))
        add(im, "Отразить по вертикали", lambda: self.transform("flip_v"))
        add(im, "Повернуть на 90° по часовой", lambda: self.transform("rot_cw"), "Ctrl+R")
        add(im, "Повернуть на 90° против часовой", lambda: self.transform("rot_ccw"))
        im.addSeparator()
        add(im, "Размер холста…", self._resize_dialog)

        v = mb.addMenu("Вид")
        self.act_grid = add(v, "Сетка", self.toggle_grid, "Ctrl+G")
        self.act_grid.setCheckable(True)

    # состояние

    def set_tool(self, code: str):
        self.canvas.tool = code
        self.tool_buttons[code].setChecked(True)
        tip = next(t for c, _i, t, _k in TOOLS if c == code)
        self.statusBar().showMessage(tip, 2000)

    def set_color(self, color: QColor, secondary: bool = False):
        if secondary:
            self.canvas.secondary = QColor(color)
            self.btn_secondary.set_color(color)
        else:
            self.canvas.primary = QColor(color)
            self.btn_primary.set_color(color)

    def swap_colors(self):
        a, b = self.canvas.primary, self.canvas.secondary
        self.set_color(b)
        self.set_color(a, True)

    def _set_opacity(self, v: int):
        self.canvas.opacity = v / 100
        self.opacity_label.setText(f"{v}%")

    def _choose_color(self, secondary: bool):
        start = self.canvas.secondary if secondary else self.canvas.primary
        c = QColorDialog.getColor(start, self, "Цвет")
        if c.isValid():
            self.set_color(c, secondary)

    def toggle_grid(self):
        self.canvas.show_grid = not self.canvas.show_grid
        self.act_grid.setChecked(self.canvas.show_grid)
        self.canvas.update()

    def _show_cursor(self, pt):
        self.pos_label.setText(f"x={pt.x()}, y={pt.y()}" if pt is not None else "")

    def _update_title(self):
        name = self.doc.path.name if self.doc.path else "Без имени"
        self.setWindowTitle(f"{'*' if self.doc.dirty else ''}{name} - Paint")
        s = self.doc.image.size()
        self.size_label.setText(f"{s.width()} × {s.height()}")
        self.act_undo.setEnabled(bool(self.doc.undo_stack))
        self.act_redo.setEnabled(bool(self.doc.redo_stack))

    def _changed(self):
        self.canvas.sync_size()
        self._update_title()

    # правка

    def undo(self):
        self.canvas.cancel()
        if self.doc.undo():
            self._changed()

    def redo(self):
        if self.doc.redo():
            self._changed()

    def clear(self):
        img = QImage(self.doc.image.size(), IMAGE_FORMAT)
        img.fill(self.canvas.secondary)
        self.doc.replace(img)
        self._changed()

    def filter(self, name: str):
        self.doc.replace(apply_filter(self.doc.image, name))
        self._changed()

    def transform(self, how: str):
        img = self.doc.image
        if how == "flip_h":
            img = img.flipped(Qt.Horizontal)
        elif how == "flip_v":
            img = img.flipped(Qt.Vertical)
        else:
            img = img.transformed(QTransform().rotate(90 if how == "rot_cw" else -90))
        self.doc.replace(img)
        self._changed()

    def resize_canvas(self, w: int, h: int):
        if (w, h) == (self.doc.image.width(), self.doc.image.height()):
            return
        img = QImage(w, h, IMAGE_FORMAT)
        img.fill(self.canvas.secondary)
        p = QPainter(img)
        p.drawImage(0, 0, self.doc.image)
        p.end()
        self.doc.replace(img)
        self._changed()

    def _resize_dialog(self):
        dlg = CanvasSizeDialog(self.doc.image.size(), self)
        if dlg.exec():
            self.resize_canvas(dlg.w.value(), dlg.h.value())

    # файлы

    def maybe_save(self) -> bool:
        """Есть несохранённые правки - спросить. False - пользователь передумал."""
        if not self.doc.dirty:
            return True
        answer = self.ask_unsaved()
        if answer == "save":
            return self.save()
        return answer == "discard"

    def _ask_unsaved(self) -> str:
        r = QMessageBox.question(self, "Paint", "Сохранить изменения в картинке?",
                                 QMessageBox.Save | QMessageBox.Discard | QMessageBox.Cancel,
                                 QMessageBox.Save)
        return {QMessageBox.Save: "save", QMessageBox.Discard: "discard"}.get(r, "cancel")

    def _reset(self, doc: Document):
        self.doc = doc
        self.canvas.doc = doc
        self._changed()

    def new_image(self):
        if self.maybe_save():
            self._reset(Document(self.doc.image.size(), self.canvas.secondary))

    def open_file(self, path) -> bool:
        doc = Document()
        try:
            doc.load(path)
        except OSError as e:
            self.show_error(str(e))
            return False
        self._reset(doc)
        return True

    def _open_dialog(self):
        if not self.maybe_save():
            return
        name, _ = QFileDialog.getOpenFileName(self, "Открыть картинку", "", IMAGE_FILTER)
        if name:
            self.open_file(name)

    def save(self) -> bool:
        if self.doc.path is None:
            return self.save_as()
        return self.save_to(self.doc.path)

    def save_as(self) -> bool:
        start = str(self.doc.path) if self.doc.path else "рисунок.png"
        name, _ = QFileDialog.getSaveFileName(self, "Сохранить как", start, SAVE_FILTER)
        return bool(name) and self.save_to(name)

    def save_to(self, path) -> bool:
        path = Path(path)
        if not path.suffix:
            path = path.with_suffix(".png")
        try:
            self.doc.save(path)
        except OSError as e:
            self.show_error(str(e))
            return False
        self._update_title()
        self.statusBar().showMessage(f"Сохранено: {path}", 4000)
        return True

    def keyPressEvent(self, e):
        if e.key() == Qt.Key_Escape:
            self.canvas.cancel()
        super().keyPressEvent(e)

    def closeEvent(self, e):
        if self.maybe_save():
            e.accept()
        else:
            e.ignore()


def main() -> int:
    app = QApplication.instance() or QApplication(sys.argv)
    qt_theme.apply(app)
    win = PaintWindow(sys.argv[1] if len(sys.argv) > 1 else None)
    win.show()
    return app.exec()


if __name__ == "__main__":
    sys.exit(main())
