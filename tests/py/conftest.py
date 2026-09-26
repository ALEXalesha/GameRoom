"""Общая настройка проверок программ из py/.

Qt работает без экрана (offscreen), шрифты берутся из папки Windows - иначе буквы в
кадрах превращаются в квадраты. QApplication одна на весь прогон (фикстура qapp).
"""

import os
import sys
from pathlib import Path

import pytest

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
if sys.platform == "win32":
    os.environ.setdefault("QT_QPA_FONTDIR", r"C:\Windows\Fonts")

PY_DIR = Path(__file__).resolve().parents[2] / "py"
if str(PY_DIR) not in sys.path:
    sys.path.insert(0, str(PY_DIR))


@pytest.fixture(scope="session")
def qapp():
    from PySide6.QtCore import QCoreApplication, Qt
    from PySide6.QtWidgets import QApplication

    # Нужно до создания приложения, чтобы в том же прогоне работал QtWebEngine (браузер).
    QCoreApplication.setAttribute(Qt.AA_ShareOpenGLContexts)
    app = QApplication.instance() or QApplication([])
    import qt_theme

    qt_theme.apply(app)
    yield app


@pytest.fixture
def data_dir(tmp_path, monkeypatch):
    """Данные программ пишутся только во временную папку теста."""
    import qt_theme

    monkeypatch.setattr(qt_theme, "DATA_DIR", tmp_path / "data")
    return tmp_path / "data"
