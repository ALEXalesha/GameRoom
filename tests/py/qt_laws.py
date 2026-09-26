"""Общие законы окон Qt, которые проверяются у каждой программы.

1. Подпись с переносом строк (QLabel.wordWrap) не ограничена по высоте: только
   setMinimumHeight, никогда setFixedHeight/setMaximumHeight. На настоящем экране
   текст шире, чем в offscreen, и перенесётся на лишнюю строку - она должна влезть.
2. В окне минимального размера со шрифтом на 10% крупнее текст таких подписей
   помещается целиком: heightForWidth(ширина) <= высота.
"""

from PySide6.QtWidgets import QApplication, QLabel

QWIDGETSIZE_MAX = 16777215


def wrapped_labels(window):
    return [
        lbl for lbl in window.findChildren(QLabel)
        if lbl.wordWrap() and lbl.isVisibleTo(window) and lbl.text()
    ]


def check_wrapped_labels(window):
    """Проверить оба закона; вернуть число проверенных подписей."""
    window.show()
    QApplication.processEvents()
    labels = wrapped_labels(window)
    for lbl in labels:
        assert lbl.maximumHeight() == QWIDGETSIZE_MAX, (
            f"у подписи «{lbl.text()[:40]}» ограничена высота ({lbl.maximumHeight()})"
        )

    window.resize(window.minimumSizeHint().expandedTo(window.minimumSize()))
    for lbl in labels:
        font = lbl.font()
        font.setPointSizeF(font.pointSizeF() * 1.1)
        lbl.setFont(font)
    for _ in range(3):
        QApplication.processEvents()
        if window.layout():
            window.layout().activate()
    for lbl in labels:
        need = lbl.heightForWidth(lbl.width())
        assert need <= lbl.height(), (
            f"подпись «{lbl.text()[:40]}» не влезает: нужно {need}px, есть {lbl.height()}px"
        )
    return len(labels)
