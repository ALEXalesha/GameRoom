"""Проводник: просмотр папок, копирование, перенос, переименование.

Удаление - только в Корзину системы (QFile.moveToTrash) и только после вопроса
«Переместить в Корзину?». Навсегда файлы этот проводник не удаляет: если
Корзина недоступна, файл остаётся на месте и показывается ошибка.

Запуск: python explorer.py [папка]
"""

from __future__ import annotations

import os
import shutil
import stat
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Callable, Iterable, Optional

from PySide6.QtCore import QDir, QFile, QFileInfo, QSize, Qt, QUrl
from PySide6.QtGui import QDesktopServices, QKeySequence, QShortcut
from PySide6.QtWidgets import (
    QAbstractItemView, QApplication, QFileIconProvider, QFileSystemModel, QHBoxLayout,
    QHeaderView, QInputDialog, QLabel, QLineEdit, QListWidget, QListWidgetItem, QMainWindow,
    QMenu, QMessageBox, QSplitter, QToolButton, QTreeView, QTreeWidget, QTreeWidgetItem,
    QVBoxLayout, QWidget,
)

import qt_theme

# ─── ОПЕРАЦИИ С ФАЙЛАМИ (без окна) ───────────────────────────────────────────


class FileOpsError(Exception):
    """Понятная ошибка операции с файлами - показывается пользователю как есть."""


INVALID_CHARS = '<>:"/\\|?*'
RESERVED = {"CON", "PRN", "AUX", "NUL", *(f"COM{i}" for i in range(1, 10)),
            *(f"LPT{i}" for i in range(1, 10))}

KINDS = {
    "Изображение": {".png", ".jpg", ".jpeg", ".gif", ".bmp", ".svg", ".webp", ".ico"},
    "Видео": {".mp4", ".mkv", ".avi", ".mov", ".wmv", ".webm"},
    "Звук": {".mp3", ".wav", ".flac", ".ogg", ".aac", ".m4a"},
    "Архив": {".zip", ".tar", ".gz", ".rar", ".7z", ".bz2"},
    "Код": {".py", ".js", ".ts", ".html", ".css", ".c", ".cpp", ".cs", ".java", ".rs", ".go", ".sh"},
    "PDF": {".pdf"},
    "Текст": {".txt", ".md", ".log", ".csv", ".json", ".xml", ".yaml", ".yml", ".ini"},
}


def kind_of(path: Path, is_dir: bool) -> str:
    if is_dir:
        return "Папка"
    ext = path.suffix.lower()
    for kind, exts in KINDS.items():
        if ext in exts:
            return kind
    return f"Файл {ext[1:].upper()}" if ext else "Файл"


def fmt_size(size: Optional[int]) -> str:
    if size is None:
        return ""
    value = float(size)
    for unit in ("Б", "КБ", "МБ", "ГБ"):
        if value < 1024:
            return f"{value:.0f} {unit}" if unit == "Б" else f"{value:.1f} {unit}"
        value /= 1024
    return f"{value:.1f} ТБ"


def fmt_date(ts: Optional[float]) -> str:
    return datetime.fromtimestamp(ts).strftime("%d.%m.%Y %H:%M") if ts else ""


@dataclass
class Entry:
    path: Path
    name: str
    is_dir: bool
    size: Optional[int]
    mtime: Optional[float]
    hidden: bool

    @property
    def kind(self) -> str:
        return kind_of(self.path, self.is_dir)


def _is_hidden(entry: os.DirEntry, st) -> bool:
    if entry.name.startswith("."):
        return True
    attrs = getattr(st, "st_file_attributes", 0) if st else 0  # есть только на Windows
    return bool(attrs & stat.FILE_ATTRIBUTE_HIDDEN)


def list_dir(folder: Path, show_hidden: bool = False) -> list[Entry]:
    """Содержимое папки: сначала папки, потом файлы, по имени без учёта регистра."""
    folder = Path(folder)
    try:
        items = list(os.scandir(folder))
    except PermissionError:
        raise FileOpsError(f"Нет доступа к папке «{folder}».") from None
    except FileNotFoundError:
        raise FileOpsError(f"Папка «{folder}» не найдена.") from None
    except NotADirectoryError:
        raise FileOpsError(f"«{folder}» - это не папка.") from None
    except OSError as e:
        raise FileOpsError(f"Не удалось открыть «{folder}»: {e.strerror or e}") from None
    result = []
    for it in items:
        try:
            st = it.stat()
            is_dir = it.is_dir()
        except OSError:  # битая ссылка, файл удалили на лету, нет прав
            st, is_dir = None, False
        hidden = _is_hidden(it, st)
        if hidden and not show_hidden:
            continue
        result.append(Entry(Path(it.path), it.name, is_dir,
                            None if is_dir or st is None else st.st_size,
                            st.st_mtime if st else None, hidden))
    result.sort(key=lambda e: (not e.is_dir, e.name.casefold()))
    return result


def validate_name(name: str) -> str:
    """Проверить имя файла или папки для Windows; вернуть очищенное имя."""
    name = (name or "").strip()
    if not name or name in (".", ".."):
        raise FileOpsError("Имя не может быть пустым.")
    bad = sorted({c for c in name if c in INVALID_CHARS or ord(c) < 32})
    if bad:
        raise FileOpsError("В имени нельзя использовать символы: " + " ".join(bad))
    if name.endswith("."):
        raise FileOpsError("Имя не может заканчиваться точкой.")
    if name.split(".")[0].upper() in RESERVED:
        raise FileOpsError(f"Имя «{name}» зарезервировано Windows.")
    if len(name) > 255:
        raise FileOpsError("Имя длиннее 255 символов.")
    return name


def unique_target(folder: Path, name: str) -> Path:
    """Свободное имя в папке: «файл.txt», «файл (2).txt», «файл (3).txt»…"""
    target = folder / name
    if not target.exists():
        return target
    p = Path(name)
    stem, suffix = (p.stem, p.suffix) if not (folder / name).is_dir() else (name, "")
    n = 2
    while (folder / f"{stem} ({n}){suffix}").exists():
        n += 1
    return folder / f"{stem} ({n}){suffix}"


def new_folder(parent: Path, name: str) -> Path:
    target = Path(parent) / validate_name(name)
    if target.exists():
        raise FileOpsError(f"«{target.name}» уже есть в этой папке.")
    target.mkdir()
    return target


def new_file(parent: Path, name: str) -> Path:
    target = Path(parent) / validate_name(name)
    try:
        with open(target, "x", encoding="utf-8"):
            pass
    except FileExistsError:
        raise FileOpsError(f"«{target.name}» уже есть в этой папке.") from None
    return target


def rename(path: Path, new_name: str) -> Path:
    path = Path(path)
    new_name = validate_name(new_name)
    target = path.with_name(new_name)
    if new_name == path.name:
        return path
    # смена только регистра букв («a.txt» -> «A.txt») на Windows - тот же файл
    if target.exists() and new_name.casefold() != path.name.casefold():
        raise FileOpsError(f"«{new_name}» уже есть в этой папке - выберите другое имя.")
    path.rename(target)
    return target


def _inside(child: Path, parent: Path) -> bool:
    child, parent = child.resolve(), parent.resolve()
    return child == parent or parent in child.parents


def copy_into(paths: Iterable[Path], dest: Path) -> list[Path]:
    """Скопировать в папку. Существующие файлы не перезаписываются - копия получает имя «(2)»."""
    dest = Path(dest)
    done = []
    for src in map(Path, paths):
        if src.is_dir() and _inside(dest, src):
            raise FileOpsError(f"Нельзя скопировать папку «{src.name}» внутрь неё самой.")
        target = unique_target(dest, src.name)
        if src.is_dir():
            shutil.copytree(src, target)
        else:
            shutil.copy2(src, target)
        done.append(target)
    return done


def move_into(paths: Iterable[Path], dest: Path) -> list[Path]:
    """Перенести в папку. Перенос в ту же папку ничего не делает; чужие файлы не затираются."""
    dest = Path(dest)
    done = []
    for src in map(Path, paths):
        if src.parent.resolve() == dest.resolve():
            done.append(src)
            continue
        if src.is_dir() and _inside(dest, src):
            raise FileOpsError(f"Нельзя перенести папку «{src.name}» внутрь неё самой.")
        target = unique_target(dest, src.name)
        shutil.move(str(src), str(target))
        done.append(target)
    return done


def default_trash(path: Path) -> None:
    """Переместить в Корзину системы. Если не вышло - ошибка, файл остаётся на месте."""
    if not QFile.moveToTrash(str(path)):
        raise FileOpsError(f"Не удалось переместить «{Path(path).name}» в Корзину. Файл не удалён.")


def trash(paths: list[Path], confirm: Callable[[list[Path]], bool],
          send: Callable[[Path], None] = default_trash) -> list[Path]:
    """Удалить в Корзину, но только если confirm(paths) ответил «да».

    Возвращает то, что ушло в Корзину. Ошибки по отдельным файлам собираются
    и поднимаются одной FileOpsError после попытки для всех.
    """
    paths = [Path(p) for p in paths]
    if not paths or not confirm(paths):
        return []
    done, errors = [], []
    for p in paths:
        try:
            send(p)
            done.append(p)
        except FileOpsError as e:
            errors.append(str(e))
        except OSError as e:
            errors.append(f"«{p.name}»: {e.strerror or e}")
    if errors:
        raise FileOpsError("\n".join(errors))
    return done


def open_with_system(path: Path) -> bool:
    return QDesktopServices.openUrl(QUrl.fromLocalFile(str(path)))


# ─── ОКНО ────────────────────────────────────────────────────────────────────


def places() -> list[tuple[str, Path]]:
    home = Path.home()
    result = [("Домашняя папка", home)]
    for title, sub in (("Рабочий стол", "Desktop"), ("Документы", "Documents"),
                       ("Загрузки", "Downloads"), ("Изображения", "Pictures")):
        if (home / sub).is_dir():
            result.append((title, home / sub))
    for drive in QDir.drives():
        result.append((f"Диск {drive.absolutePath()}", Path(drive.absolutePath())))
    return result


class ExplorerWidget(QWidget):
    """Проводник. confirm/trash/ask_text/show_error подменяются в тестах."""

    COLS = ("Имя", "Размер", "Тип", "Изменён")

    def __init__(self, start: Optional[Path] = None,
                 confirm: Optional[Callable[[list[Path]], bool]] = None,
                 trash_fn: Callable[[Path], None] = default_trash,
                 ask_text: Optional[Callable[[str, str, str], Optional[str]]] = None,
                 show_error: Optional[Callable[[str], None]] = None,
                 parent=None):
        super().__init__(parent)
        self.confirm = confirm or self._ask_confirm
        self.trash_fn = trash_fn
        self.ask_text = ask_text or self._ask_text
        self.show_error = show_error or self._show_error
        self.current: Optional[Path] = None
        self.history: list[Path] = []
        self.history_pos = -1
        self.clipboard: list[Path] = []
        self.clipboard_op = ""
        self.show_hidden = False
        self.icons = QFileIconProvider()
        self._build()
        self.navigate(Path(start) if start else Path.home())

    # построение

    def _tool(self, text, tip, slot):
        b = QToolButton()
        b.setText(text)
        b.setToolTip(tip)
        b.clicked.connect(slot)
        return b

    def _build(self):
        top = QHBoxLayout()
        self.btn_back = self._tool("◀", "Назад (Alt+←)", self.back)
        self.btn_forward = self._tool("▶", "Вперёд (Alt+→)", self.forward)
        self.btn_up = self._tool("▲", "Вверх (Backspace)", self.up)
        for b in (self.btn_back, self.btn_forward, self.btn_up,
                  self._tool("⟳", "Обновить (F5)", self.refresh)):
            top.addWidget(b)
        self.path_edit = QLineEdit()
        self.path_edit.setPlaceholderText("Путь к папке")
        self.path_edit.returnPressed.connect(self._go_typed_path)
        top.addWidget(self.path_edit, 1)
        self.search = QLineEdit()
        self.search.setPlaceholderText("Поиск в папке")
        self.search.setClearButtonEnabled(True)
        self.search.setMaximumWidth(220)
        self.search.textChanged.connect(lambda _t: self._fill())
        top.addWidget(self.search)

        self.places = QListWidget()
        for title, path in places():
            item = QListWidgetItem(self.icons.icon(QFileInfo(str(path))), title)
            item.setData(Qt.UserRole, str(path))
            item.setToolTip(str(path))
            self.places.addItem(item)
        self.places.itemClicked.connect(lambda it: self.navigate(Path(it.data(Qt.UserRole))))

        self.dir_model = QFileSystemModel(self)
        self.dir_model.setFilter(QDir.AllDirs | QDir.NoDotAndDotDot | QDir.Drives)
        self.dir_model.setRootPath("")
        self.tree = QTreeView()
        self.tree.setModel(self.dir_model)
        for col in (1, 2, 3):
            self.tree.hideColumn(col)
        self.tree.setHeaderHidden(True)
        self.tree.clicked.connect(lambda idx: self.navigate(Path(self.dir_model.filePath(idx))))

        side = QSplitter(Qt.Vertical)
        side.addWidget(self.places)
        side.addWidget(self.tree)
        side.setSizes([160, 300])

        self.list = QTreeWidget()
        self.list.setHeaderLabels(self.COLS)
        self.list.setRootIsDecorated(False)
        self.list.setSelectionMode(QAbstractItemView.ExtendedSelection)
        self.list.setSortingEnabled(False)
        self.list.setUniformRowHeights(True)
        self.list.setIconSize(QSize(18, 18))
        hdr = self.list.header()
        hdr.setSectionResizeMode(0, QHeaderView.Stretch)
        for col in (1, 2, 3):
            hdr.setSectionResizeMode(col, QHeaderView.ResizeToContents)
        self.list.itemActivated.connect(lambda _it, _c: self.open_selected())
        self.list.itemSelectionChanged.connect(self._update_status)
        self.list.setContextMenuPolicy(Qt.CustomContextMenu)
        self.list.customContextMenuRequested.connect(self._context_menu)

        split = QSplitter(Qt.Horizontal)
        split.addWidget(side)
        split.addWidget(self.list)
        split.setStretchFactor(1, 1)
        split.setSizes([220, 700])

        self.status = QLabel()
        self.status.setStyleSheet(f"color:{qt_theme.TEXT_DIM};")

        lay = QVBoxLayout(self)
        lay.addLayout(top)
        lay.addWidget(split, 1)
        lay.addWidget(self.status)

        keys = {
            "Del": self.delete_selected, "F2": self.rename_selected, "F5": self.refresh,
            "Ctrl+C": self.copy_selected, "Ctrl+X": self.cut_selected, "Ctrl+V": self.paste,
            "Backspace": self.up, "Alt+Up": self.up, "Alt+Left": self.back, "Alt+Right": self.forward,
            "Ctrl+Shift+N": self.create_folder, "Ctrl+A": self.list.selectAll,
        }
        for seq, slot in keys.items():
            sc = QShortcut(QKeySequence(seq), self.list, slot)
            sc.setContext(Qt.WidgetWithChildrenShortcut)

    # навигация

    def navigate(self, path: Path, remember: bool = True) -> bool:
        path = Path(path)
        try:
            entries = list_dir(path, self.show_hidden)
        except FileOpsError as e:
            self.show_error(str(e))
            if self.current:
                self.path_edit.setText(str(self.current))
            return False
        if remember and path != self.current:
            del self.history[self.history_pos + 1:]
            self.history.append(path)
            self.history_pos = len(self.history) - 1
        self.current = path
        self.entries = entries
        self.path_edit.setText(str(path))
        self.search.blockSignals(True)
        self.search.clear()
        self.search.blockSignals(False)
        self._fill()
        self._update_nav()
        return True

    def _go_typed_path(self):
        text = self.path_edit.text().strip().strip('"')
        self.navigate(Path(os.path.expandvars(os.path.expanduser(text))))

    def back(self):
        if self.history_pos > 0:
            self.history_pos -= 1
            self.navigate(self.history[self.history_pos], remember=False)

    def forward(self):
        if self.history_pos < len(self.history) - 1:
            self.history_pos += 1
            self.navigate(self.history[self.history_pos], remember=False)

    def up(self):
        if self.current and self.current.parent != self.current:
            self.navigate(self.current.parent)

    def refresh(self):
        if self.current:
            selected = {p.name for p in self.selected_paths()}
            query = self.search.text()
            self.navigate(self.current, remember=False)
            self.search.setText(query)
            self.select_names(selected)

    def _update_nav(self):
        self.btn_back.setEnabled(self.history_pos > 0)
        self.btn_forward.setEnabled(self.history_pos < len(self.history) - 1)
        self.btn_up.setEnabled(bool(self.current) and self.current.parent != self.current)

    # список

    def _fill(self):
        q = self.search.text().strip().casefold()
        self.list.clear()
        for e in self.entries:
            if q and q not in e.name.casefold():
                continue
            item = QTreeWidgetItem([e.name, fmt_size(e.size), e.kind, fmt_date(e.mtime)])
            item.setData(0, Qt.UserRole, str(e.path))
            item.setIcon(0, self.icons.icon(QFileInfo(str(e.path))))
            item.setTextAlignment(1, Qt.AlignRight | Qt.AlignVCenter)
            if e.hidden:
                item.setForeground(0, self.palette().placeholderText())
            self.list.addTopLevelItem(item)
        self._update_status()

    def visible_names(self) -> list[str]:
        return [self.list.topLevelItem(i).text(0) for i in range(self.list.topLevelItemCount())]

    def select_names(self, names):
        self.list.clearSelection()
        for i in range(self.list.topLevelItemCount()):
            item = self.list.topLevelItem(i)
            if item.text(0) in names:
                item.setSelected(True)
                self.list.scrollToItem(item)

    def selected_paths(self) -> list[Path]:
        return [Path(it.data(0, Qt.UserRole)) for it in self.list.selectedItems()]

    def _update_status(self):
        shown = self.list.topLevelItemCount()
        text = f"Элементов: {shown}"
        sel = self.selected_paths()
        if sel:
            size = sum(e.size or 0 for e in self.entries if e.path in sel)
            text += f"   Выбрано: {len(sel)}" + (f" ({fmt_size(size)})" if size else "")
        if self.clipboard:
            what = "скопировано" if self.clipboard_op == "copy" else "вырезано"
            text += f"   В буфере: {len(self.clipboard)} ({what})"
        self.status.setText(text)

    # действия

    def _run(self, action, *args):
        """Выполнить операцию; ошибку показать, а не уронить окно."""
        try:
            return action(*args)
        except FileOpsError as e:
            self.show_error(str(e))
        except OSError as e:
            self.show_error(f"Операция не выполнена: {e.strerror or e}"
                            + (f" ({e.filename})" if e.filename else ""))
        return None

    def open_selected(self):
        paths = self.selected_paths()
        if not paths:
            return
        p = paths[0]
        if p.is_dir():
            self.navigate(p)
        elif not open_with_system(p):
            self.show_error(f"Не удалось открыть «{p.name}»: нет программы для этого типа файлов.")

    def delete_selected(self):
        paths = self.selected_paths()
        if not paths:
            return
        done = self._run(trash, paths, self.confirm, self.trash_fn)
        self.refresh()
        if done:
            self.status.setText(f"В Корзину перемещено: {len(done)}")

    def rename_selected(self):
        paths = self.selected_paths()
        if not paths:
            return
        p = paths[0]
        name = self.ask_text("Переименовать", "Новое имя:", p.name)
        if name is not None and name != p.name:
            target = self._run(rename, p, name)
            self.refresh()
            if target:
                self.select_names({target.name})

    def create_folder(self):
        name = self.ask_text("Новая папка", "Имя папки:", unique_target(self.current, "Новая папка").name)
        if name is not None:
            target = self._run(new_folder, self.current, name)
            self.refresh()
            if target:
                self.select_names({target.name})

    def create_file(self):
        name = self.ask_text("Новый файл", "Имя файла:", unique_target(self.current, "Новый файл.txt").name)
        if name is not None:
            target = self._run(new_file, self.current, name)
            self.refresh()
            if target:
                self.select_names({target.name})

    def copy_selected(self):
        self._to_clipboard("copy")

    def cut_selected(self):
        self._to_clipboard("cut")

    def _to_clipboard(self, op):
        paths = self.selected_paths()
        if paths:
            self.clipboard, self.clipboard_op = paths, op
            self._update_status()

    def paste(self):
        if not self.clipboard or not self.current:
            return
        missing = [p for p in self.clipboard if not p.exists()]
        if missing:
            self.show_error("Эти файлы уже не существуют: " + ", ".join(p.name for p in missing))
            self.clipboard = [p for p in self.clipboard if p.exists()]
        op = copy_into if self.clipboard_op == "copy" else move_into
        done = self._run(op, self.clipboard, self.current)
        if self.clipboard_op == "cut" and done is not None:
            self.clipboard, self.clipboard_op = [], ""
        self.refresh()
        if done:
            self.select_names({p.name for p in done})

    def properties_text(self, p: Path) -> str:
        try:
            st = p.stat()
        except OSError as e:
            return f"Не удалось прочитать свойства: {e.strerror or e}"
        if p.is_dir():
            try:
                count = sum(1 for _ in os.scandir(p))
                size = f"{count} объектов внутри"
            except OSError:
                size = "нет доступа к содержимому"
        else:
            size = f"{fmt_size(st.st_size)} ({st.st_size:,} байт)".replace(",", " ")
        return (f"Имя: {p.name}\nПапка: {p.parent}\nТип: {kind_of(p, p.is_dir())}\n"
                f"Размер: {size}\nСоздан: {fmt_date(st.st_ctime)}\nИзменён: {fmt_date(st.st_mtime)}")

    def show_properties(self):
        paths = self.selected_paths()
        if paths:
            QMessageBox.information(self, f"Свойства - {paths[0].name}", self.properties_text(paths[0]))

    def toggle_hidden(self):
        self.show_hidden = not self.show_hidden
        self.refresh()

    @staticmethod
    def open_recycle_bin():
        if sys.platform == "win32":
            os.startfile("shell:RecycleBinFolder")

    def _context_menu(self, pos):
        sel = self.selected_paths()
        m = QMenu(self)
        if sel:
            m.addAction("Открыть", self.open_selected)
            m.addSeparator()
            m.addAction("Копировать\tCtrl+C", self.copy_selected)
            m.addAction("Вырезать\tCtrl+X", self.cut_selected)
        if self.clipboard:
            m.addAction("Вставить\tCtrl+V", self.paste)
        if sel:
            m.addSeparator()
            m.addAction("Переименовать\tF2", self.rename_selected)
            m.addAction("Удалить в Корзину\tDel", self.delete_selected)
            m.addSeparator()
            m.addAction("Свойства", self.show_properties)
        m.addSeparator()
        m.addAction("Новая папка\tCtrl+Shift+N", self.create_folder)
        m.addAction("Новый текстовый файл", self.create_file)
        m.addSeparator()
        act = m.addAction("Показывать скрытые", self.toggle_hidden)
        act.setCheckable(True)
        act.setChecked(self.show_hidden)
        m.addAction("Обновить\tF5", self.refresh)
        if sys.platform == "win32":
            m.addAction("Открыть Корзину", self.open_recycle_bin)
        m.exec(self.list.viewport().mapToGlobal(pos))

    # диалоги по умолчанию

    def _ask_confirm(self, paths: list[Path]) -> bool:
        names = "\n".join(p.name for p in paths[:8])
        if len(paths) > 8:
            names += f"\n…и ещё {len(paths) - 8}"
        box = QMessageBox(QMessageBox.Question, "Удаление в Корзину",
                          f"Переместить в Корзину ({len(paths)})?\n\n{names}",
                          QMessageBox.Yes | QMessageBox.No, self)
        box.setDefaultButton(QMessageBox.No)
        return box.exec() == QMessageBox.Yes

    def _ask_text(self, title, label, value):
        text, ok = QInputDialog.getText(self, title, label, QLineEdit.Normal, value)
        return text if ok else None

    def _show_error(self, text):
        QMessageBox.warning(self, "Проводник", text)


class ExplorerWindow(QMainWindow):
    def __init__(self, start: Optional[Path] = None, **kw):
        super().__init__()
        self.setWindowTitle("Проводник")
        self.explorer = ExplorerWidget(start, **kw)
        self.setCentralWidget(self.explorer)
        self.resize(1100, 680)
        self.setMinimumSize(640, 400)


def main() -> int:
    app = QApplication.instance() or QApplication(sys.argv)
    qt_theme.apply(app)
    start = Path(sys.argv[1]) if len(sys.argv) > 1 else None
    win = ExplorerWindow(start)
    win.show()
    return app.exec()


if __name__ == "__main__":
    sys.exit(main())
