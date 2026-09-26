"""Законы мини-компилятора: таблица программ -> ожидаемый вывод или ошибка со строкой."""

import subprocess
import sys

import pytest

import compiler as c

# (название, программа, ожидаемый вывод)
PROGRAMS = [
    ("демо: факториал и if/else", c.DEMO, "720\n100\n"),
    ("приоритет операций", "print 2 + 3 * 4", "14\n"),
    ("скобки", "print (2 + 3) * 4", "20\n"),
    ("деление дробное", "print 7 / 2", "3.5\n"),
    ("унарный минус", "print -2 * 3", "-6\n"),
    ("двойной минус", "print --3", "3\n"),
    ("минус у скобок", "x = 5\nprint -(x - 7)", "2\n"),
    ("дробные числа", "print 0.5 + 0.25", "0.75\n"),
    ("строки и кириллица", 'print "привет"', "привет\n"),
    ("кавычка внутри строки", 'print "он сказал \\"да\\""', 'он сказал "да"\n'),
    ("склейка строк", 's = "аб"\nprint s + "в"', "абв\n"),
    ("true/false", "t = true\nprint t\nprint false", "true\nfalse\n"),
    ("сравнение даёт true/false", "print 3 > 2\nprint 3 == 4", "true\nfalse\n"),
    ("if без else, условие ложно", "if 1 > 2\n print 1\nend\nprint 0", "0\n"),
    ("пустой if", "x = 1\nif x > 0\nend\nprint x", "1\n"),
    ("пустой while", "i = 0\nwhile i > 5\nend\nprint i", "0\n"),
    ("пустая ветка else", "if 1 < 2\n print 1\nelse\nend", "1\n"),
    ("вложенные циклы", "i = 0\ns = 0\nwhile i < 3\n j = 0\n while j < 3\n  s = s + 1\n  j = j + 1\n end\n i = i + 1\nend\nprint s", "9\n"),
    ("имена-ключевые слова Python", "class = 5\ndef = 2\nprint class + def", "7\n"),
    ("имя None и True как переменные", "None = 1\nTrue = 2\nprint None + True", "3\n"),
    ("имена на двойное подчёркивание", "__tick__ = 1\n__builtins__ = 2\nprint __tick__ + __builtins__", "3\n"),
    ("class и class_ - разные переменные", "class = 1\nclass_ = 2\nprint class", "1\n"),
    ("имена встроенных функций - просто переменные", "len = 3\nprint len", "3\n"),
    ("комментарии", "# только комментарий\nx = 1 # хвост\nprint x", "1\n"),
    ("программа без вывода", "x = 1", ""),
    ("пустая программа", "", ""),
    ("BOM в начале файла", "﻿print 1", "1\n"),
    ("цепочка сравнений", "print 1 < 2 < 3", "true\n"),
]


@pytest.mark.parametrize("name,src,expected", PROGRAMS, ids=[p[0] for p in PROGRAMS])
def test_program_output(name, src, expected):
    assert c.run_source(src).output == expected


# (название, программа, класс ошибки, строка, кусок текста)
ERRORS = [
    ("неизвестный символ", "x = 1\ny = 2 $ 3", c.LexError, 2, "«$»"),
    ("незакрытая строка", 'print "abc', c.LexError, 1, "не закрыта"),
    ("строка через перенос", 'print "ab\nc"', c.LexError, 1, "не закрыта"),
    ("число с двумя точками", "x = 1.2.3", c.LexError, 1, "1.2.3"),
    ("число с точкой в конце", "x = 1.", c.LexError, 1, "«1.»"),
    ("нет end у while", "while 1 < 2\n print 1", c.ParseError, 2, "не закрыт"),
    ("нет end у if", "x = 1\nif x > 0\n print x", c.ParseError, 3, "из строки 2"),
    ("лишний end", "x = 1\nend", c.ParseError, 2, "лишнее «end»"),
    ("лишний else", "else", c.ParseError, 1, "лишнее «else»"),
    ("нет = в присваивании", "x 5", c.ParseError, 1, "«=»"),
    ("пустое выражение", "print", c.ParseError, 1, "конец программы"),
    ("незакрытая скобка", "print (1 + 2", c.ParseError, 1, "«)»"),
    ("строка с числа", "5 = x", c.ParseError, 1, "не может начинаться"),
    ("глубокая вложенность", "print " + "(" * 3000 + "1" + ")" * 3000, c.ParseError, None, "вложенность"),
    ("деление на ноль", "x = 0\nprint 1 / x", c.MiniRuntimeError, 2, "деление на ноль"),
    ("переменная не задана", "print 1\nprint y + 1", c.MiniRuntimeError, 2, "«y» не задана"),
    ("ключевое слово Python не задано", "print class", c.MiniRuntimeError, 1, "«class» не задана"),
    ("строка плюс число", 'x = 1\nprint "a" + x', c.MiniRuntimeError, 2, "несовместимые"),
    ("ошибка в условии цикла", "i = 0\nwhile i < k\nend", c.MiniRuntimeError, 2, "«k»"),
    ("ошибка внутри цикла", "i = 0\nwhile i < 3\n i = i + 1\n print 10 / (i - 2)\nend", c.MiniRuntimeError, 4, "деление на ноль"),
]


@pytest.mark.parametrize("name,src,cls,line,text", ERRORS, ids=[e[0] for e in ERRORS])
def test_program_error(name, src, cls, line, text):
    with pytest.raises(cls) as info:
        c.run_source(src)
    assert info.value.line == line
    assert text in str(info.value)


def test_infinite_loop_is_stopped():
    with pytest.raises(c.MiniRuntimeError) as info:
        c.run_source("i = 0\nwhile 1 < 2\n i = i + 1\nend", max_steps=5000)
    assert info.value.line == 2
    assert "бесконечный" in str(info.value)


def test_step_limit_counts_loop_iterations():
    """Лимит считает повторы тела цикла: 100 повторов при лимите 100 можно, 101 - нет."""
    loop = "i = 0\nwhile i < {n}\n i = i + 1\nend\nprint i"
    assert c.run_source(loop.format(n=100), max_steps=100).output == "100\n"
    with pytest.raises(c.MiniRuntimeError):
        c.run_source(loop.format(n=101), max_steps=100)


def test_output_limit():
    with pytest.raises(c.MiniRuntimeError) as info:
        c.run_source("while true\n print 1\nend")
    assert "строк" in str(info.value)


def test_output_printed_before_error_is_kept_by_echo():
    seen = []
    with pytest.raises(c.MiniRuntimeError):
        c.run_source("print 1\nprint 2\nprint 1 / 0", echo=seen.append)
    assert seen == ["1", "2"]


def test_program_cannot_reach_python():
    """Выполнение изолировано: нет встроенных функций, программа не трогает компилятор."""
    for src in ("print open", "print __import__", "print exec"):
        with pytest.raises(c.MiniRuntimeError):
            c.run_source(src)
    c.run_source("compile_source = 1\nrun_source = 2")
    assert callable(c.compile_source) and callable(c.run_source)


def test_shown_python_code_is_clean_and_valid():
    code = c.compile_source(c.DEMO)
    assert c.TICK not in code
    compile(code, "<shown>", "exec")
    assert "while (i <= n):" in code


def test_generated_python_for_empty_blocks_is_valid():
    compile(c.compile_source("if 1 < 2\nelse\nend\nwhile false\nend"), "<x>", "exec")


def test_ast_text():
    tree = c.run_source("x = -1\nprint x").ast
    assert tree.splitlines()[:3] == ["Program", "  Assign x", "    Unary -"]


def run_cli(tmp_path, *args, source=None):
    if source is not None:
        f = tmp_path / "prog.mini"
        f.write_text(source, encoding="utf-8")
        args = (str(f),) + args
    return subprocess.run(
        [sys.executable, str(c.__file__), *args], capture_output=True,
        encoding="utf-8", errors="replace", timeout=60,
    )


def test_cli_runs_file_with_cyrillic(tmp_path):
    r = run_cli(tmp_path, source='print "привет, мир"\n')
    assert r.returncode == 0
    assert r.stdout.strip() == "привет, мир"


def test_cli_exit_codes(tmp_path):
    assert run_cli(tmp_path, source="x = $").returncode == 1
    r = run_cli(tmp_path, source="print 1 / 0")
    assert r.returncode == 2 and "деление на ноль" in r.stderr
    assert run_cli(tmp_path, str(tmp_path / "нет-такого.mini")).returncode == 3


def test_cli_demo_and_verbose(tmp_path):
    r = run_cli(tmp_path, "--demo")
    assert r.returncode == 0 and r.stdout.split() == ["720", "100"]
    r = run_cli(tmp_path, "-v", source="print 1")
    assert "ТОКЕНЫ" in r.stdout and "PYTHON" in r.stdout and r.stdout.rstrip().endswith("1")


# ─── окно ────────────────────────────────────────────────────────────────────


@pytest.fixture
def ide(qapp):
    w = c.CompilerWindow()
    yield w.ide
    w.close()
    w.deleteLater()


def test_ide_runs_program(ide):
    ide.set_source("print 6 * 7")
    assert ide.run() is True
    assert ide.output_text().strip() == "42"
    assert "print((6 * 7))" in ide.python.toPlainText()


def test_ide_shows_error_line(ide):
    ide.set_source("x = 1\nprint y")
    assert ide.run() is False
    assert "строка 2" in ide.output_text()
    assert ide.editor.textCursor().blockNumber() == 1
    assert len(ide.editor.extraSelections()) == 1


def test_ide_save_and_open_roundtrip(ide, tmp_path):
    ide.set_source('print "файл"\n')
    ide.save_file(tmp_path / "a.mini")
    ide.set_source("")
    ide.load_file(tmp_path / "a.mini")
    assert ide.source() == 'print "файл"\n'
    assert ide.run() and ide.output_text().strip() == "файл"


def test_ide_labels_fit(qapp):
    from qt_laws import check_wrapped_labels

    w = c.CompilerWindow()
    check_wrapped_labels(w)
    w.close()
