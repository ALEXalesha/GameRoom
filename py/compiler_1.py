"""
Компилятор мини-языка → Python
Этапы: Лексер → Парсер → AST → Кодогенератор

Синтаксис языка:
  x = 10            # присваивание
  y = x * 2 + 1     # арифметика
  print x           # вывод
  if x > y          # условие (без скобок)
    print x
  else
    print y
  end
  while i < 10      # цикл
    i = i + 1
  end
"""

import sys
from dataclasses import dataclass, field
from typing import Any, Optional


# ─── ТОКЕНЫ ────────────────────────────────────────────────────────────────────

@dataclass
class Token:
    type: str
    val: Any
    line: int

    def __repr__(self):
        return f"Token({self.type}, {self.val!r}, line={self.line})"


KEYWORDS = {"if", "else", "end", "while", "print", "true", "false"}


# ─── ЛЕКСЕР ────────────────────────────────────────────────────────────────────

class LexError(Exception):
    pass


class Lexer:
    def __init__(self, source: str):
        self.src = source
        self.pos = 0
        self.line = 1

    def cur(self) -> str:
        return self.src[self.pos] if self.pos < len(self.src) else ""

    def peek(self, offset=1) -> str:
        p = self.pos + offset
        return self.src[p] if p < len(self.src) else ""

    def advance(self) -> str:
        c = self.src[self.pos]
        self.pos += 1
        if c == "\n":
            self.line += 1
        return c

    def skip_whitespace(self):
        while self.cur() in " \t\r":
            self.advance()

    def read_number(self) -> Token:
        ln = self.line
        buf = ""
        while self.cur().isdigit() or self.cur() == ".":
            buf += self.advance()
        val = float(buf) if "." in buf else int(buf)
        return Token("NUM", val, ln)

    def read_string(self) -> Token:
        ln = self.line
        self.advance()  # opening "
        buf = ""
        while self.cur() and self.cur() != '"':
            if self.cur() == "\\" and self.peek() == '"':
                self.advance()
                buf += '"'
            else:
                buf += self.advance()
        if not self.cur():
            raise LexError(f"строка {ln}: незакрытая строка")
        self.advance()  # closing "
        return Token("STR", buf, ln)

    def read_identifier(self) -> Token:
        ln = self.line
        buf = ""
        while self.cur().isalnum() or self.cur() == "_":
            buf += self.advance()
        ttype = buf if buf in KEYWORDS else "ID"
        return Token(ttype, buf, ln)

    def tokenize(self) -> list[Token]:
        tokens = []
        two_char = {"<=", ">=", "==", "!="}

        while self.pos < len(self.src):
            self.skip_whitespace()
            if self.pos >= len(self.src):
                break

            c = self.cur()
            ln = self.line

            if c == "\n":
                self.advance()
                continue

            if c == "#":
                while self.cur() and self.cur() != "\n":
                    self.advance()
                continue

            if c == '"':
                tokens.append(self.read_string())
                continue

            if c.isdigit():
                tokens.append(self.read_number())
                continue

            if c.isalpha() or c == "_":
                tokens.append(self.read_identifier())
                continue

            two = c + self.peek()
            if two in two_char:
                self.advance(); self.advance()
                tokens.append(Token(two, two, ln))
                continue

            if c in "+-*/=<>()":
                self.advance()
                tokens.append(Token(c, c, ln))
                continue

            raise LexError(f"строка {ln}: неожиданный символ '{c}'")

        tokens.append(Token("EOF", None, self.line))
        return tokens


# ─── AST-УЗЛЫ ──────────────────────────────────────────────────────────────────

@dataclass
class Num:
    val: float | int

@dataclass
class Str:
    val: str

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

@dataclass
class Print:
    val: Any

@dataclass
class If:
    cond: Any
    then: list
    else_: Optional[list]

@dataclass
class While:
    cond: Any
    body: list

@dataclass
class Program:
    body: list


# ─── ПАРСЕР ────────────────────────────────────────────────────────────────────

class ParseError(Exception):
    pass


class Parser:
    def __init__(self, tokens: list[Token]):
        self.tokens = tokens
        self.pos = 0

    def cur(self) -> Token:
        return self.tokens[self.pos]

    def eat(self, ttype: str) -> Token:
        t = self.cur()
        if t.type != ttype:
            raise ParseError(
                f"строка {t.line}: ожидалось «{ttype}», получено «{t.type}» ({t.val!r})"
            )
        self.pos += 1
        return t

    def parse(self) -> Program:
        stmts = []
        while self.cur().type != "EOF":
            stmts.append(self.stmt())
        return Program(stmts)

    def stmt(self):
        t = self.cur()
        if t.type == "if":
            return self.if_stmt()
        if t.type == "while":
            return self.while_stmt()
        if t.type == "print":
            return self.print_stmt()
        if t.type == "ID":
            return self.assign_stmt()
        raise ParseError(f"строка {t.line}: неожиданный токен «{t.val or t.type}»")

    def if_stmt(self) -> If:
        self.eat("if")
        cond = self.expr()
        then = []
        while self.cur().type not in ("else", "end", "EOF"):
            then.append(self.stmt())
        else_ = None
        if self.cur().type == "else":
            self.eat("else")
            else_ = []
            while self.cur().type not in ("end", "EOF"):
                else_.append(self.stmt())
        self.eat("end")
        return If(cond, then, else_)

    def while_stmt(self) -> While:
        self.eat("while")
        cond = self.expr()
        body = []
        while self.cur().type not in ("end", "EOF"):
            body.append(self.stmt())
        self.eat("end")
        return While(cond, body)

    def print_stmt(self) -> Print:
        self.eat("print")
        return Print(self.expr())

    def assign_stmt(self) -> Assign:
        name = self.eat("ID").val
        self.eat("=")
        return Assign(name, self.expr())

    # Грамматика выражений:
    # expr → comparison → add → mul → unary → primary

    def expr(self):
        return self.comparison()

    def comparison(self):
        left = self.add()
        ops = {"<", ">", "<=", ">=", "==", "!="}
        while self.cur().type in ops:
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
            return Unary("-", self.primary())
        return self.primary()

    def primary(self):
        t = self.cur()
        self.pos += 1
        if t.type == "NUM":
            return Num(t.val)
        if t.type == "STR":
            return Str(t.val)
        if t.type == "ID":
            return Var(t.val)
        if t.type == "(":
            e = self.expr()
            self.eat(")")
            return e
        raise ParseError(f"строка {t.line}: неожиданное значение «{t.val or t.type}»")


# ─── КОДОГЕНЕРАТОР ─────────────────────────────────────────────────────────────

class CodeGen:
    def __init__(self):
        self.indent = 0
        self.lines = []

    def pad(self) -> str:
        return "    " * self.indent

    def emit(self, s: str):
        self.lines.append(s)

    def generate(self, node) -> str:
        self.visit(node)
        return "\n".join(self.lines)

    def visit(self, node):
        match node:
            case Program(body):
                for s in body:
                    self.visit(s)

            case Assign(name, val):
                self.emit(f"{self.pad()}{name} = {self.expr(val)}")

            case Print(val):
                self.emit(f"{self.pad()}print({self.expr(val)})")

            case If(cond, then, else_):
                self.emit(f"{self.pad()}if {self.expr(cond)}:")
                self.indent += 1
                for s in then:
                    self.visit(s)
                self.indent -= 1
                if else_ is not None:
                    self.emit(f"{self.pad()}else:")
                    self.indent += 1
                    for s in else_:
                        self.visit(s)
                    self.indent -= 1

            case While(cond, body):
                self.emit(f"{self.pad()}while {self.expr(cond)}:")
                self.indent += 1
                for s in body:
                    self.visit(s)
                self.indent -= 1

            case _:
                raise ValueError(f"неизвестный узел: {node}")

    def expr(self, node) -> str:
        match node:
            case Num(val):
                return str(val)
            case Str(val):
                return repr(val)
            case Var(name):
                return name
            case Unary(op, val):
                return f"(-{self.expr(val)})"
            case BinOp(op, left, right):
                return f"({self.expr(left)} {op} {self.expr(right)})"
            case _:
                raise ValueError(f"неизвестное выражение: {node}")


# ─── AST-ПРИНТЕР ───────────────────────────────────────────────────────────────

def print_ast(node, depth=0):
    pad = "  " * depth
    match node:
        case Program(body):
            print(f"{pad}Program")
            for s in body:
                print_ast(s, depth + 1)
        case Assign(name, val):
            print(f"{pad}Assign {name!r}")
            print_ast(val, depth + 1)
        case Print(val):
            print(f"{pad}Print")
            print_ast(val, depth + 1)
        case If(cond, then, else_):
            print(f"{pad}If")
            print(f"{pad}  cond:")
            print_ast(cond, depth + 2)
            print(f"{pad}  then:")
            for s in then:
                print_ast(s, depth + 2)
            if else_:
                print(f"{pad}  else:")
                for s in else_:
                    print_ast(s, depth + 2)
        case While(cond, body):
            print(f"{pad}While")
            print(f"{pad}  cond:")
            print_ast(cond, depth + 2)
            print(f"{pad}  body:")
            for s in body:
                print_ast(s, depth + 2)
        case BinOp(op, left, right):
            print(f"{pad}BinOp {op!r}")
            print_ast(left, depth + 1)
            print_ast(right, depth + 1)
        case Unary(op, val):
            print(f"{pad}Unary {op!r}")
            print_ast(val, depth + 1)
        case Num(val):
            print(f"{pad}Num {val}")
        case Str(val):
            print(f"{pad}Str {val!r}")
        case Var(name):
            print(f"{pad}Var {name!r}")


# ─── ГЛАВНАЯ ФУНКЦИЯ ───────────────────────────────────────────────────────────

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


def compile_source(source: str, verbose: bool = False) -> str:
    # 1. Лексер
    lexer = Lexer(source)
    tokens = lexer.tokenize()

    if verbose:
        print("─── ТОКЕНЫ ───────────────────────────────")
        for t in tokens:
            print(f"  {t}")

    # 2. Парсер → AST
    parser = Parser(tokens)
    ast = parser.parse()

    if verbose:
        print("\n─── AST ──────────────────────────────────")
        print_ast(ast)

    # 3. Кодогенерация
    gen = CodeGen()
    python_code = gen.generate(ast)

    return python_code


def main():
    verbose = "-v" in sys.argv or "--verbose" in sys.argv

    if len(sys.argv) >= 2 and sys.argv[1] not in ("-v", "--verbose"):
        path = sys.argv[1]
        with open(path) as f:
            source = f.read()
    else:
        source = DEMO

    try:
        print("─── ИСХОДНИК ─────────────────────────────")
        print(source)
        code = compile_source(source, verbose=verbose)
        print("─── PYTHON КОД ───────────────────────────")
        print(code)
        print("\n─── ВЫПОЛНЕНИЕ ───────────────────────────")
        exec(compile(code, "<compiled>", "exec"))
    except (LexError, ParseError) as e:
        print(f"\nОшибка компиляции: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
