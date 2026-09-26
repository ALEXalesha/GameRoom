"""Мини-компилятор: маленький язык -> Python.

Этапы: лексер -> парсер -> дерево (AST) -> генератор кода Python -> выполнение
в закрытом пространстве имён (без встроенных функций Python, с лимитом шагов цикла).

Язык:
    x = 10              # присваивание, комментарий до конца строки
    y = x * 2 + 1       # арифметика: + - * /, скобки, унарный минус
    s = "текст"         # строки в двойных кавычках, \\" внутри строки - кавычка
    ok = true           # логические true / false
    print x             # вывод значения
    if x > y            # условие: < > <= >= == !=
      print x
    else
      print y
    end
    while i < 10        # цикл
      i = i + 1
    end

Запуск:
    python compiler.py              окно-редактор (PySide6)
    python compiler.py file.mini    выполнить файл в консоли
    python compiler.py file.mini -v показать токены, дерево и код Python
    python compiler.py --demo       выполнить встроенный пример в консоли
"""

from __future__ import annotations

import keyword
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

# ─── ОШИБКИ ──────────────────────────────────────────────────────────────────


class MiniError(Exception):
    """Ошибка программы на мини-языке: этап, строка исходника и понятный текст."""

    stage = "ошибка"

    def __init__(self, message: str, line: Optional[int] = None):
        self.message = message
        self.line = line
        super().__init__(str(self))

    def __str__(self) -> str:
        where = f"строка {self.line}: " if self.line else ""
        return f"{where}{self.message}"


class LexError(MiniError):
    stage = "лексическая ошибка"


class ParseError(MiniError):
    stage = "синтаксическая ошибка"


class MiniRuntimeError(MiniError):
    stage = "ошибка выполнения"


# ─── ТОКЕНЫ И ЛЕКСЕР ─────────────────────────────────────────────────────────


@dataclass
class Token:
    type: str
    val: Any
    line: int


KEYWORDS = {"if", "else", "end", "while", "print", "true", "false"}
TWO_CHAR = {"<=", ">=", "==", "!="}
ONE_CHAR = set("+-*/=<>()")


def describe(tok: Token) -> str:
    """Токен словами - для сообщений об ошибках."""
    if tok.type == "EOF":
        return "конец программы"
    if tok.type == "STR":
        return f"строка «{tok.val}»"
    return f"«{tok.val}»"


class Lexer:
    def __init__(self, source: str):
        self.src = source
        self.pos = 0
        self.line = 1

    def cur(self) -> str:
        return self.src[self.pos] if self.pos < len(self.src) else ""

    def peek(self) -> str:
        p = self.pos + 1
        return self.src[p] if p < len(self.src) else ""

    def advance(self) -> str:
        c = self.src[self.pos]
        self.pos += 1
        if c == "\n":
            self.line += 1
        return c

    def read_number(self) -> Token:
        ln = self.line
        buf = ""
        while self.cur().isdigit() or self.cur() == ".":
            buf += self.advance()
        if buf.count(".") > 1 or buf.endswith("."):
            raise LexError(f"неправильное число «{buf}»", ln)
        return Token("NUM", float(buf) if "." in buf else int(buf), ln)

    def read_string(self) -> Token:
        ln = self.line
        self.advance()  # открывающая кавычка
        buf = ""
        while self.cur() and self.cur() not in '"\n':
            if self.cur() == "\\" and self.peek() == '"':
                self.advance()
            buf += self.advance()
        if self.cur() != '"':
            raise LexError("строка не закрыта кавычкой", ln)
        self.advance()
        return Token("STR", buf, ln)

    def read_identifier(self) -> Token:
        ln = self.line
        buf = ""
        while self.cur().isalnum() or self.cur() == "_":
            buf += self.advance()
        return Token(buf if buf in KEYWORDS else "ID", buf, ln)

    def tokenize(self) -> list[Token]:
        tokens = []
        while self.pos < len(self.src):
            c = self.cur()
            ln = self.line
            if c in " \t\r\n﻿":
                self.advance()
            elif c == "#":
                while self.cur() and self.cur() != "\n":
                    self.advance()
            elif c == '"':
                tokens.append(self.read_string())
            elif c.isdigit():
                tokens.append(self.read_number())
            elif c.isalpha() or c == "_":
                tokens.append(self.read_identifier())
            elif c + self.peek() in TWO_CHAR:
                two = self.advance() + self.advance()
                tokens.append(Token(two, two, ln))
            elif c in ONE_CHAR:
                tokens.append(Token(self.advance(), c, ln))
            else:
                raise LexError(f"неожиданный символ «{c}»", ln)
        tokens.append(Token("EOF", None, self.line))
        return tokens


# ─── ДЕРЕВО (AST) ────────────────────────────────────────────────────────────


@dataclass
class Num:
    val: float | int


@dataclass
class Str:
    val: str


@dataclass
class Bool:
    val: bool


@dataclass
class Var:
    name: str


@dataclass
class BinOp:
    op: str
    left: Any
    right: Any


@dataclass
class Unary:
    op: str
    val: Any


@dataclass
class Assign:
    name: str
    val: Any
    line: int = 0


@dataclass
class Print:
    val: Any
    line: int = 0


@dataclass
class If:
    cond: Any
    then: list
    else_: Optional[list]
    line: int = 0


@dataclass
class While:
    cond: Any
    body: list
    line: int = 0


@dataclass
class Program:
    body: list


# ─── ПАРСЕР ──────────────────────────────────────────────────────────────────

COMPARE_OPS = {"<", ">", "<=", ">=", "==", "!="}


class Parser:
    """Рекурсивный спуск. Выражения: сравнение -> сложение -> умножение -> унарный -> атом."""

    def __init__(self, tokens: list[Token]):
        self.tokens = tokens
        self.pos = 0

    def cur(self) -> Token:
        return self.tokens[self.pos]

    def eat(self, ttype: str, what: str) -> Token:
        t = self.cur()
        if t.type != ttype:
            raise ParseError(f"ожидалось {what}, а встретилось {describe(t)}", t.line)
        self.pos += 1
        return t

    def parse(self) -> Program:
        body = []
        while self.cur().type != "EOF":
            body.append(self.stmt())
        return Program(body)

    def block(self, stops: tuple, opener: Token) -> list:
        body = []
        while self.cur().type not in stops:
            if self.cur().type == "EOF":
                raise ParseError(
                    f"блок «{opener.val}» из строки {opener.line} не закрыт словом «end»",
                    self.cur().line,
                )
            body.append(self.stmt())
        return body

    def stmt(self):
        t = self.cur()
        if t.type == "if":
            return self.if_stmt()
        if t.type == "while":
            return self.while_stmt()
        if t.type == "print":
            self.pos += 1
            return Print(self.expr(), t.line)
        if t.type == "ID":
            self.pos += 1
            self.eat("=", f"«=» после имени «{t.val}»")
            return Assign(t.val, self.expr(), t.line)
        if t.type in ("else", "end"):
            raise ParseError(f"лишнее «{t.val}»: нет открытого if/while", t.line)
        raise ParseError(f"оператор не может начинаться с {describe(t)}", t.line)

    def if_stmt(self) -> If:
        opener = self.eat("if", "«if»")
        cond = self.expr()
        then = self.block(("else", "end"), opener)
        else_ = None
        if self.cur().type == "else":
            self.pos += 1
            else_ = self.block(("end",), opener)
        self.eat("end", "«end»")
        return If(cond, then, else_, opener.line)

    def while_stmt(self) -> While:
        opener = self.eat("while", "«while»")
        cond = self.expr()
        body = self.block(("end",), opener)
        self.eat("end", "«end»")
        return While(cond, body, opener.line)

    def expr(self):
        left = self.add()
        while self.cur().type in COMPARE_OPS:
            op = self.cur().type
            self.pos += 1
            left = BinOp(op, left, self.add())
        return left

    def add(self):
        left = self.mul()
        while self.cur().type in ("+", "-"):
            op = self.cur().type
            self.pos += 1
            left = BinOp(op, left, self.mul())
        return left

    def mul(self):
        left = self.unary()
        while self.cur().type in ("*", "/"):
            op = self.cur().type
            self.pos += 1
            left = BinOp(op, left, self.unary())
        return left

    def unary(self):
        if self.cur().type == "-":
            self.pos += 1
            return Unary("-", self.unary())
        return self.primary()

    def primary(self):
        t = self.cur()
        self.pos += 1
        if t.type == "NUM":
            return Num(t.val)
        if t.type == "STR":
            return Str(t.val)
        if t.type in ("true", "false"):
            return Bool(t.type == "true")
        if t.type == "ID":
            return Var(t.val)
        if t.type == "(":
            e = self.expr()
            self.eat(")", "закрывающая скобка «)»")
            return e
        self.pos -= 1
        raise ParseError(f"ожидалось значение, а встретилось {describe(t)}", t.line)


# ─── ГЕНЕРАТОР КОДА PYTHON ───────────────────────────────────────────────────

TICK = "__tick__"  # служебная функция лимита шагов (только в исполняемой версии)


def py_name(name: str) -> str:
    """Имя переменной для Python. Ключевые слова Python и имена на «__» переименовываются
    (class -> __v_class), чтобы программа не ломала код и не трогала служебные имена."""
    if keyword.iskeyword(name) or name.startswith("__"):
        return "__v_" + name
    return name


def mini_name(name: str) -> str:
    return name[4:] if name.startswith("__v_") else name


class CodeGen:
    """Дерево -> текст Python. line_map[i] - строка исходника для строки i+1 кода.

    guard=True вставляет вызов лимита шагов в начало каждого цикла (исполняемая версия);
    для показа пользователю генерируется чистый код без него.
    """

    def __init__(self, guard: bool = False):
        self.guard = guard
        self.indent = 0
        self.lines: list[str] = []
        self.line_map: list[int] = []

    def emit(self, text: str, src_line: int):
        self.lines.append("    " * self.indent + text)
        self.line_map.append(src_line)

    def generate(self, program: Program) -> str:
        self.block(program.body, 0)
        return "\n".join(self.lines)

    def block(self, stmts: list, parent_line: int):
        if not stmts:
            self.emit("pass", parent_line)
        for s in stmts:
            self.stmt(s)

    def stmt(self, node):
        match node:
            case Assign(name, val, line):
                self.emit(f"{py_name(name)} = {self.expr(val)}", line)
            case Print(val, line):
                self.emit(f"print({self.expr(val)})", line)
            case If(cond, then, else_, line):
                self.emit(f"if {self.expr(cond)}:", line)
                self.indent += 1
                self.block(then, line)
                self.indent -= 1
                if else_ is not None:
                    self.emit("else:", line)
                    self.indent += 1
                    self.block(else_, line)
                    self.indent -= 1
            case While(cond, body, line):
                self.emit(f"while {self.expr(cond)}:", line)
                self.indent += 1
                if self.guard:
                    self.emit(f"{TICK}()", line)
                self.block(body, line)
                self.indent -= 1
            case _:
                raise TypeError(f"неизвестный оператор: {node!r}")

    def expr(self, node) -> str:
        match node:
            case Num(val):
                return repr(val)
            case Str(val):
                return repr(val)
            case Bool(val):
                return "True" if val else "False"
            case Var(name):
                return py_name(name)
            case Unary(op, val):
                return f"(-{self.expr(val)})"
            case BinOp(op, left, right):
                return f"({self.expr(left)} {op} {self.expr(right)})"
            case _:
                raise TypeError(f"неизвестное выражение: {node!r}")


# ─── ДЕРЕВО ТЕКСТОМ ──────────────────────────────────────────────────────────


def format_ast(node, depth: int = 0) -> str:
    pad = "  " * depth
    out: list[str] = []

    def sub(n, d):
        out.append(format_ast(n, d))

    match node:
        case Program(body):
            out.append(f"{pad}Program")
            for s in body:
                sub(s, depth + 1)
        case Assign(name, val, _):
            out.append(f"{pad}Assign {name}")
            sub(val, depth + 1)
        case Print(val, _):
            out.append(f"{pad}Print")
            sub(val, depth + 1)
        case If(cond, then, else_, _):
            out.append(f"{pad}If")
            out.append(f"{pad}  cond:")
            sub(cond, depth + 2)
            out.append(f"{pad}  then:")
            for s in then:
                sub(s, depth + 2)
            if else_ is not None:
                out.append(f"{pad}  else:")
                for s in else_:
                    sub(s, depth + 2)
        case While(cond, body, _):
            out.append(f"{pad}While")
            out.append(f"{pad}  cond:")
            sub(cond, depth + 2)
            out.append(f"{pad}  body:")
            for s in body:
                sub(s, depth + 2)
        case BinOp(op, left, right):
            out.append(f"{pad}BinOp {op}")
            sub(left, depth + 1)
            sub(right, depth + 1)
        case Unary(op, val):
            out.append(f"{pad}Unary {op}")
            sub(val, depth + 1)
        case Num(val):
            out.append(f"{pad}Num {val}")
        case Str(val):
            out.append(f"{pad}Str {val!r}")
        case Bool(val):
            out.append(f"{pad}Bool {'true' if val else 'false'}")
        case Var(name):
            out.append(f"{pad}Var {name}")
    return "\n".join(out)


# ─── КОМПИЛЯЦИЯ И ВЫПОЛНЕНИЕ ─────────────────────────────────────────────────

MAX_STEPS = 1_000_000  # сколько раз всего может повториться тело циклов
MAX_OUTPUT_LINES = 10_000


def tokenize(source: str) -> list[Token]:
    return Lexer(source).tokenize()


def parse(source: str) -> Program:
    try:
        return Parser(tokenize(source)).parse()
    except RecursionError:
        raise ParseError("слишком глубокая вложенность скобок") from None


def compile_source(source: str) -> str:
    """Исходник -> код Python (чистый, для показа)."""
    return CodeGen().generate(parse(source))


def format_value(value) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


class _StepLimit(Exception):
    pass


class _OutputLimit(Exception):
    pass


@dataclass
class RunResult:
    output: str
    python: str
    ast: str


def _runtime_message(exc: BaseException, max_steps: int) -> str:
    if isinstance(exc, ZeroDivisionError):
        return "деление на ноль"
    if isinstance(exc, NameError):
        name = mini_name(getattr(exc, "name", "") or "?")
        return f"переменная «{name}» не задана (ей ещё ничего не присвоено)"
    if isinstance(exc, TypeError):
        return "несовместимые значения в выражении (например, строка и число)"
    if isinstance(exc, _StepLimit):
        return f"цикл повторился больше {max_steps} раз - похоже, он бесконечный"
    if isinstance(exc, _OutputLimit):
        return f"программа вывела больше {MAX_OUTPUT_LINES} строк - выполнение остановлено"
    if isinstance(exc, (OverflowError, MemoryError)):
        return "слишком большое значение"
    return f"{type(exc).__name__}: {exc}"


def run_source(source: str, max_steps: int = MAX_STEPS, echo=None) -> RunResult:
    """Скомпилировать и выполнить. Возвращает вывод программы, код Python и дерево.

    Ошибки программы - исключения MiniError с номером строки исходника.
    echo(text) - необязательный обработчик каждой выведенной строки (для консоли).
    """
    program = parse(source)
    shown = CodeGen().generate(program)
    gen = CodeGen(guard=True)
    code = gen.generate(program)
    out: list[str] = []
    steps = [0]

    def mini_print(value):
        if len(out) >= MAX_OUTPUT_LINES:
            raise _OutputLimit()
        text = format_value(value)
        out.append(text)
        if echo:
            echo(text)

    def tick():
        steps[0] += 1
        if steps[0] > max_steps:
            raise _StepLimit()

    namespace = {"__builtins__": {}, "print": mini_print, TICK: tick}
    try:
        exec(compile(code, "<mini>", "exec"), namespace)
    except Exception as exc:  # ошибка самой программы на мини-языке
        line = None
        tb = exc.__traceback__
        while tb is not None:
            if tb.tb_frame.f_code.co_filename == "<mini>":
                line = gen.line_map[tb.tb_lineno - 1]
            tb = tb.tb_next
        raise MiniRuntimeError(_runtime_message(exc, max_steps), line) from None
    return RunResult("\n".join(out) + ("\n" if out else ""), shown, format_ast(program))


DEMO = """\
# факториал числа 6
n = 6
result = 1
i = 1
while i <= n
  result = result * i
  i = i + 1
end
print result

# if/else
x = 100
y = 42
if x > y
  print x
else
  print y
end
"""


# ─── КОНСОЛЬ ─────────────────────────────────────────────────────────────────


def cli(argv: list[str]) -> int:
    """Консольный режим. Коды выхода: 0 - успех, 1 - ошибка компиляции,
    2 - ошибка выполнения, 3 - файл не прочитан."""
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(errors="replace")
        except (AttributeError, ValueError):
            pass
    verbose = any(a in ("-v", "--verbose") for a in argv)
    files = [a for a in argv if not a.startswith("-")]
    if files:
        try:
            source = Path(files[0]).read_text(encoding="utf-8-sig")
        except (OSError, UnicodeDecodeError) as e:
            print(f"Не удалось прочитать файл {files[0]}: {e}", file=sys.stderr)
            return 3
    else:
        source = DEMO
    try:
        if verbose:
            print("─── ТОКЕНЫ ───")
            for t in tokenize(source):
                print(f"  {t.line:>3}  {t.type:<6} {t.val!r}")
            program = parse(source)
            print("─── ДЕРЕВО ───")
            print(format_ast(program))
            print("─── PYTHON ───")
            print(compile_source(source))
            print("─── ВЫПОЛНЕНИЕ ───")
        run_source(source, echo=print)
    except MiniRuntimeError as e:
        print(f"Ошибка выполнения, {e}", file=sys.stderr)
        return 2
    except MiniError as e:
        print(f"Ошибка компиляции, {e}", file=sys.stderr)
        return 1
    return 0


# ─── ОКНО (PySide6) ──────────────────────────────────────────────────────────

from PySide6.QtCore import Qt  # noqa: E402
from PySide6.QtGui import QColor, QFont, QKeySequence, QShortcut, QTextCursor, QTextFormat  # noqa: E402
from PySide6.QtWidgets import (  # noqa: E402
    QApplication, QFileDialog, QHBoxLayout, QLabel, QMainWindow, QMessageBox,
    QPlainTextEdit, QPushButton, QSplitter, QTabWidget, QTextEdit, QVBoxLayout, QWidget,
)


def mono_font() -> QFont:
    f = QFont("Consolas")
    f.setStyleHint(QFont.Monospace)
    f.setPointSize(11)
    return f


class CompilerIDE(QWidget):
    """Редактор мини-языка: исходник сверху, вывод / код Python / дерево снизу."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self.path: Optional[Path] = None

        self.btn_run = QPushButton("▶ Выполнить")
        self.btn_run.setToolTip("Ctrl+Enter")
        self.btn_open = QPushButton("Открыть…")
        self.btn_save = QPushButton("Сохранить…")
        self.btn_demo = QPushButton("Пример")
        self.btn_run.clicked.connect(self.run)
        self.btn_open.clicked.connect(self._open_dialog)
        self.btn_save.clicked.connect(self._save_dialog)
        self.btn_demo.clicked.connect(lambda: self.set_source(DEMO))

        bar = QHBoxLayout()
        for b in (self.btn_run, self.btn_open, self.btn_save, self.btn_demo):
            bar.addWidget(b)
        bar.addStretch(1)
        self.status = QLabel("Готово")
        bar.addWidget(self.status)

        self.editor = QPlainTextEdit()
        self.editor.setFont(mono_font())
        self.editor.setLineWrapMode(QPlainTextEdit.NoWrap)
        self.editor.setPlainText(DEMO)
        self.editor.textChanged.connect(self._clear_marks)

        self.output = self._readonly()
        self.python = self._readonly()
        self.ast = self._readonly()
        self.tabs = QTabWidget()
        self.tabs.addTab(self.output, "Вывод")
        self.tabs.addTab(self.python, "Код Python")
        self.tabs.addTab(self.ast, "Дерево")

        split = QSplitter(Qt.Vertical)
        split.addWidget(self.editor)
        split.addWidget(self.tabs)
        split.setSizes([300, 200])

        lay = QVBoxLayout(self)
        lay.addLayout(bar)
        lay.addWidget(split, 1)

        for keys in ("Ctrl+Return", "Ctrl+Enter", "F5"):
            QShortcut(QKeySequence(keys), self, self.run)

    def _readonly(self) -> QPlainTextEdit:
        w = QPlainTextEdit()
        w.setReadOnly(True)
        w.setFont(mono_font())
        return w

    def source(self) -> str:
        return self.editor.toPlainText()

    def set_source(self, text: str):
        self.editor.setPlainText(text)

    def run(self) -> bool:
        """Выполнить программу из редактора; True - без ошибок."""
        src = self.source()
        try:
            result = run_source(src)
        except MiniError as e:
            self.output.setPlainText(f"{e.stage.capitalize()}, {e}")
            self._color_output("#e05a5a")
            try:
                self.python.setPlainText(compile_source(src))
            except MiniError:
                self.python.setPlainText("")
            self.status.setText(f"Ошибка в строке {e.line}" if e.line else "Ошибка")
            if e.line:
                self._mark_line(e.line)
            self.tabs.setCurrentWidget(self.output)
            return False
        self.output.setPlainText(result.output or "(программа ничего не вывела)")
        self._color_output("")
        self.python.setPlainText(result.python)
        self.ast.setPlainText(result.ast)
        self.status.setText("Выполнено без ошибок")
        self.tabs.setCurrentWidget(self.output)
        return True

    def output_text(self) -> str:
        return self.output.toPlainText()

    def _color_output(self, color: str):
        self.output.setStyleSheet(f"color: {color};" if color else "")

    def _mark_line(self, line: int):
        block = self.editor.document().findBlockByLineNumber(line - 1)
        if not block.isValid():
            return
        cursor = QTextCursor(block)
        sel = QTextEdit.ExtraSelection()
        sel.format.setBackground(QColor(224, 90, 90, 70))
        sel.format.setProperty(QTextFormat.FullWidthSelection, True)
        sel.cursor = cursor
        self.editor.blockSignals(True)
        self.editor.setExtraSelections([sel])
        self.editor.setTextCursor(cursor)
        self.editor.blockSignals(False)

    def _clear_marks(self):
        self.editor.setExtraSelections([])

    def load_file(self, path) -> None:
        path = Path(path)
        self.set_source(path.read_text(encoding="utf-8-sig"))
        self.path = path
        self.status.setText(f"Открыт {path.name}")

    def save_file(self, path) -> None:
        path = Path(path)
        path.write_text(self.source(), encoding="utf-8")
        self.path = path
        self.status.setText(f"Сохранён {path.name}")

    def _open_dialog(self):
        name, _ = QFileDialog.getOpenFileName(self, "Открыть программу", "",
                                              "Мини-язык (*.mini *.txt);;Все файлы (*)")
        if name:
            try:
                self.load_file(name)
            except (OSError, UnicodeDecodeError) as e:
                QMessageBox.warning(self, "Не удалось открыть", str(e))

    def _save_dialog(self):
        start = str(self.path) if self.path else "program.mini"
        name, _ = QFileDialog.getSaveFileName(self, "Сохранить программу", start,
                                              "Мини-язык (*.mini);;Все файлы (*)")
        if name:
            try:
                self.save_file(name)
            except OSError as e:
                QMessageBox.warning(self, "Не удалось сохранить", str(e))


class CompilerWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Мини-компилятор → Python")
        self.ide = CompilerIDE()
        self.setCentralWidget(self.ide)
        self.resize(900, 640)
        self.setMinimumSize(520, 380)


def main(argv=None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    if argv:
        return cli([a for a in argv if a != "--demo"])
    import qt_theme

    app = QApplication.instance() or QApplication(sys.argv)
    qt_theme.apply(app)
    win = CompilerWindow()
    win.show()
    return app.exec()


if __name__ == "__main__":
    sys.exit(main())
