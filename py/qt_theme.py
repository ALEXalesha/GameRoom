"""Общая тёмная тема для Qt-программ сборника (PySide6).

Одна палитра на всех: стиль Fusion + тёмная QPalette + немного QSS для полей ввода
и кнопок. Каждая программа вызывает apply(app) в main(); виджеты, встроенные в
чужое окно (например, в «Python95»), берут тему у приложения.
"""

from __future__ import annotations

from pathlib import Path

from PySide6.QtGui import QColor, QPalette
from PySide6.QtWidgets import QApplication

# Цвета темы
BG = "#1e1f24"
PANEL = "#26282f"
PANEL_2 = "#2f323b"
BORDER = "#3a3d47"
TEXT = "#e6e6ea"
TEXT_DIM = "#9a9cab"
ACCENT = "#4f8fdf"
DANGER = "#e05a5a"

# Пометка для программ «в стиле» чужих продуктов (Telegram, Windows).
FAN_NOTE = "Фан-концепт, не связан с правообладателем"

# Данные программ (история, чаты) лежат рядом со скриптами, в py/data/ (в git не попадает).
DATA_DIR = Path(__file__).resolve().parent / "data"

STYLE = f"""
QToolTip {{ color: {TEXT}; background: {PANEL_2}; border: 1px solid {BORDER}; }}
QLineEdit, QPlainTextEdit, QTextEdit, QSpinBox {{
    background: {PANEL}; color: {TEXT}; border: 1px solid {BORDER};
    border-radius: 4px; padding: 3px 6px; selection-background-color: {ACCENT};
}}
QLineEdit:focus, QPlainTextEdit:focus, QTextEdit:focus {{ border: 1px solid {ACCENT}; }}
QPushButton, QToolButton {{
    background: {PANEL_2}; color: {TEXT}; border: 1px solid {BORDER};
    border-radius: 4px; padding: 4px 10px;
}}
QPushButton:hover, QToolButton:hover {{ border-color: {ACCENT}; }}
QPushButton:pressed, QToolButton:pressed, QToolButton:checked {{ background: {ACCENT}; color: white; }}
QPushButton:disabled {{ color: {TEXT_DIM}; }}
QMenu {{ background: {PANEL}; color: {TEXT}; border: 1px solid {BORDER}; }}
QMenu::item:selected {{ background: {ACCENT}; color: white; }}
QStatusBar {{ color: {TEXT_DIM}; }}
"""


def dark_palette() -> QPalette:
    p = QPalette()
    roles = {
        QPalette.Window: BG, QPalette.WindowText: TEXT, QPalette.Base: PANEL,
        QPalette.AlternateBase: PANEL_2, QPalette.ToolTipBase: PANEL_2,
        QPalette.ToolTipText: TEXT, QPalette.Text: TEXT, QPalette.Button: PANEL_2,
        QPalette.ButtonText: TEXT, QPalette.BrightText: DANGER, QPalette.Highlight: ACCENT,
        QPalette.HighlightedText: "#ffffff", QPalette.Link: ACCENT,
        QPalette.PlaceholderText: TEXT_DIM,
    }
    for role, color in roles.items():
        p.setColor(role, QColor(color))
    for role in (QPalette.WindowText, QPalette.Text, QPalette.ButtonText):
        p.setColor(QPalette.Disabled, role, QColor(TEXT_DIM))
    return p


def apply(app: QApplication) -> None:
    """Включить тёмную тему для всего приложения."""
    app.setStyle("Fusion")
    app.setPalette(dark_palette())
    app.setStyleSheet(STYLE)


def data_path(name: str) -> Path:
    """Путь к файлу данных программы в py/data/ (папка создаётся при записи)."""
    return DATA_DIR / name
