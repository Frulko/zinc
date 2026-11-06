#!/usr/bin/env python3
"""Spike, not a product: annotated Lua to Zinc TSX, for the study in ../03-static-front-end.md.

Usage: luazn.py in.lua > out.tsx. Types come from LuaLS comments (---@param, ---@return, ---@type), so the file stays
valid Lua that lua and luajit run unchanged. ponytail: a throwaway proof. Tables are arrays or records told apart by
their constructor, indices are shifted by one, no metatables, no coroutines, one return value, no source map.
"""
import re
import sys

TOK = re.compile(r"""(?P<ann>---@[^\n]*)|(?P<com>--[^\n]*)|(?P<ws>\s+)|(?P<num>0[xX][0-9a-fA-F]+|\d+\.?\d*(?:[eE][+-]?\d+)?)|(?P<str>"[^"]*"|'[^']*')|(?P<id>[A-Za-z_]\w*)|(?P<op>\.\.\.|\.\.|==|~=|<=|>=|//|[-+*/%^#<>=(){}\[\];:,.])""")
KW = {"local", "function", "end", "if", "then", "elseif", "else", "while", "do", "for", "in", "return", "break", "not", "and", "or", "nil", "true", "false", "repeat", "until"}
PREC = {"or": 1, "and": 2, "<": 3, ">": 3, "<=": 3, ">=": 3, "==": 3, "~=": 3, "..": 4, "+": 5, "-": 5, "*": 6, "/": 6, "%": 6, "//": 6, "^": 8}
TYPES = {"number": "number", "integer": "i32", "string": "string", "boolean": "boolean", "nil": "void", "any": "any"}
MATH = {"sqrt", "floor", "abs", "min", "max", "sin", "cos", "pi"}
BUILTIN_TAGS = {"View", "Text", "Image", "ScrollView", "Canvas", "Input", "TextArea"}


def camel(s):
    return re.sub(r"_([a-z0-9])", lambda m: m.group(1).upper(), s)


def ty(t):
    t = t.strip()
    if t.endswith("[]"):
        return ty(t[:-2]) + "[]"
    return TYPES.get(t, t)


class P:
    def __init__(self, src):
        self.t, pos = [], 0
        while pos < len(src):
            m = TOK.match(src, pos)
            if not m:
                raise SyntaxError(f"bad character at {pos}: {src[pos:pos + 20]!r}")
            pos = m.end()
            if m.lastgroup in ("ws", "com"):
                continue
            self.t.append((m.lastgroup, m.group()))
        self.t.append(("eof", ""))
        self.i, self.out, self.depth = 0, [], 0
        self.scopes, self.zinc, self.pending, self.records = [set()], set(), [], {}

    # ---- tokens
    def peek(self):
        return self.t[self.i][1]

    def next(self):
        self.i += 1
        return self.t[self.i - 1][1]

    def accept(self, v):
        if self.peek() == v and self.t[self.i][0] != "str":
            self.i += 1
            return True
        return False

    def expect(self, v):
        if not self.accept(v):
            raise SyntaxError(f"expected {v!r}, found {self.peek()!r}")

    def emit(self, s):
        self.out.append("  " * self.depth + s)

    def annotations(self):
        while self.t[self.i][0] == "ann":
            self.pending.append(self.next()[4:])
        if self.pending and self.pending[0].startswith("class"):   # ---@class Name and its ---@field lines
            a = self.take()
            self.pending = [w for w in a[1:] if not w.startswith("field")]
            self.emit(f"interface {a[0].split()[1]} {{ " + " ".join(f"{w.split()[1]}: {ty(w.split()[2])};" for w in a[1:] if w.startswith("field")) + " }")

    def take(self):
        a, self.pending = self.pending, []
        return a

    def declared(self, n):
        return any(n in s for s in self.scopes)

    # ---- statements
    def block(self, *ends):
        self.depth += 1
        self.scopes.append(set())
        while True:
            self.annotations()
            if self.peek() in ends and self.t[self.i][0] != "str":
                break
            self.stmt()
        self.scopes.pop()
        self.depth -= 1

    def function(self, name, keyword="function"):
        anns = self.take()
        params, rets = {}, ""
        for a in anns:
            w = a.split()
            if w[0] == "param":
                params[w[1]] = ty(w[2])
            if w[0] == "return":
                rets = ty(w[1])
        self.expect("(")
        names = []
        while not self.accept(")"):
            names.append(self.next())
            self.accept(",")
        ps = ", ".join(f"{n}: {params.get(n, 'any')}" for n in names)
        if not rets and name and name[0].isupper():
            rets = "i32"
        head = f"{keyword} {name}({ps}){': ' + rets if rets else ''} {{"
        self.emit(head)
        self.scopes.append(set(names))
        self.block("end")
        self.scopes.pop()
        self.expect("end")
        self.emit("}")

    def stmt(self):
        p = self.peek()
        if self.accept(";"):
            return
        if p == "local":
            self.next()
            if self.accept("function"):
                n = self.next()
                self.scopes[-1].add(n)
                return self.function(n)
            names = [self.next()]
            while self.accept(","):
                names.append(self.next())
            anns = self.take()
            t = next((": " + ty(a.split()[1]) for a in anns if a.startswith("type")), "")
            self.scopes[-1].update(names)
            if self.accept("="):
                v = self.expr()
                if len(names) == 1:
                    self.emit(f"let {names[0]}{t} = {v};")
                else:
                    self.emit(f"const [{', '.join(names)}] = {v};")
            else:
                self.emit(f"let {names[0]}{t};")
            return
        if p == "function":
            self.next()
            return self.function(self.next())
        if p == "if":
            self.next()
            self.emit(f"if ({self.expr()}) {{")
            self.expect("then")
            while True:
                self.block("end", "else", "elseif")
                if self.accept("elseif"):
                    self.emit(f"}} else if ({self.expr()}) {{")
                    self.expect("then")
                elif self.accept("else"):
                    self.emit("} else {")
                else:
                    self.expect("end")
                    self.emit("}")
                    return
        if p == "while":
            self.next()
            self.emit(f"while ({self.expr()}) {{")
            self.expect("do")
            self.block("end")
            self.expect("end")
            self.emit("}")
            return
        if p == "for":
            self.next()
            v = self.next()
            if self.accept("="):
                lo = self.expr()
                self.expect(",")
                hi = self.expr()
                step = self.expr() if self.accept(",") else "1"
                self.emit(f"for (let {v}: i32 = {lo}; {v} {'>=' if step.startswith('-') else '<='} {hi}; {v} += {step}) {{")
                self.scopes.append({v})
            else:   # for _, x in ipairs(t)
                self.expect(",")
                x = self.next()
                self.expect("in")
                self.expect("ipairs")
                self.expect("(")
                it = self.expr()
                self.expect(")")
                self.emit(f"for (const {x} of {it}) {{")
                self.scopes.append({x})
            self.expect("do")
            self.block("end")
            self.expect("end")
            self.scopes.pop()
            self.emit("}")
            return
        if p == "return":
            self.next()
            self.emit("return;" if self.peek() in ("end", "else", "elseif") else f"return {self.expr()};")
            return
        if p == "break":
            self.next()
            self.emit("break;")
            return
        e = self.suffixed()
        if self.accept("="):
            v = self.expr()
            if re.fullmatch(r"\w+", e) and not self.declared(e):
                self.scopes[0].add(e)
                self.emit(f"let {e} = {v};")   # a Lua global
            else:
                self.emit(f"{e} = {v};")
        else:
            self.emit(e + ";")

    # ---- expressions
    def expr(self, limit=0):
        p = self.peek()
        if p == "not":
            self.next()
            left = "!" + self.expr(7)
        elif p == "-":
            self.next()
            left = "-" + self.expr(7)
        elif p == "#":
            self.next()
            left = self.expr(7) + ".length"
        else:
            left = self.simple()
        while self.t[self.i][0] != "str" and PREC.get(self.peek(), 0) > limit:
            op = self.next()
            right = self.expr(PREC[op] - (1 if op in ("^", "..") else 0))
            if op == "//":
                left = f"Math.floor({left} / {right})"
            elif op == "..":
                left = f"(`${{{left}}}${{{right}}}`)"
            else:
                left = f"({left} {dict({'~=': '!==', '==': '===', 'and': '&&', 'or': '||', '^': '**'}).get(op, op)} {right})"
        return left

    def simple(self):
        k, v = self.t[self.i]
        if k == "num":
            self.i += 1
            return v
        if k == "str":
            self.i += 1
            return v
        if v in ("true", "false"):
            self.i += 1
            return v
        if v == "nil":
            self.i += 1
            return "null"
        if v == "{":
            return self.render_table(self.table())
        if v == "function":
            self.next()
            self.expect("(")
            names = []
            while not self.accept(")"):
                names.append(self.next())
                self.accept(",")
            mark = len(self.out)
            self.scopes.append(set(names))
            self.block("end")
            self.scopes.pop()
            self.expect("end")
            body = " ".join(x.strip() for x in self.out[mark:])
            del self.out[mark:]
            return f"(({', '.join(names)}) => {{ {body} }})"
        return self.suffixed()

    def table(self):
        self.expect("{")
        items, named = [], []
        while not self.accept("}"):
            if self.t[self.i][0] == "id" and self.t[self.i + 1][1] == "=":
                k = self.next()
                self.next()
                named.append((k, self.expr()))
            else:
                items.append(self.expr())
            if not self.accept(","):
                self.accept(";")
        return items, named

    def render_table(self, tb):
        items, named = tb
        if named and not items:
            return "{ " + ", ".join(f"{k}: {v}" for k, v in named) + " }"
        return "[" + ", ".join(items) + "]"

    def jsx(self, tag, tb):
        kids, attrs = tb
        at = ""
        for k, v in attrs:
            name = "className" if k == "class_name" else camel(k)
            at += f' {name}={v}' if v[0] in "\"'" else f" {name}={{{v}}}"
        body = "".join(c if c.startswith("<") else "{" + c + "}" for c in kids)
        return f"<{tag}{at}>{body}</{tag}>" if body else f"<{tag}{at} />"

    def args(self):
        self.expect("(")
        a = []
        while not self.accept(")"):
            a.append(self.expr())
            self.accept(",")
        return a

    def suffixed(self):
        if self.accept("("):
            e = self.expr()
            self.expect(")")
        else:
            e = self.next()
            if e in self.zinc:
                e = camel(e) if e[0].islower() else e
        while True:
            p, k = self.peek(), self.t[self.i][0]
            if p == "." and k == "op":
                self.next()
                f = self.next()
                e = ("Math.PI" if f == "pi" else f"Math.{f}") if e == "math" and f in MATH else f"{e}.{f}"
            elif p == "[" and k == "op":
                self.next()
                i = self.expr()
                self.expect("]")
                e = f"{e}[{i} - 1]"   # Lua counts from 1
            elif p == ":" and k == "op":
                self.next()
                e = f"{e}.{self.next()}"
            elif p == "(" and k == "op":
                a = self.args()
                if e == "print":
                    e = f"console.log({', '.join(a)})"
                elif e == "table.insert":
                    e = f"{a[0]}.push({a[1]})"
                elif e == "require":
                    return e
                else:
                    e = f"{e}({', '.join(a)})"
            elif p == "{" and k == "op" and e[0].isupper():
                e = self.jsx(e, self.table())
            else:
                return e

    def imports(self):
        # local a, b = require("zinc.gfx"): the one form the spike takes for imports
        src = self.src_lines
        for m in re.finditer(r"^local ([\w, ]+) = require\(\"zinc[./]([\w./]+)\"\)", src, re.M):
            names = [n.strip() for n in m.group(1).split(",")]
            self.zinc |= set(names)
            shown = [camel(n) if n[0].islower() else n for n in names if n not in BUILTIN_TAGS]
            self.emit("import { " + ", ".join(shown) + f" }} from 'zinc:{m.group(2).replace('.', '/')}';")


def main():
    src = open(sys.argv[1]).read()
    body = re.sub(r"^local [\w, ]+ = require\(\"zinc[./][\w./]+\"\).*$", "", src, flags=re.M)
    p = P(body)
    p.src_lines = src
    p.imports()
    while True:
        p.annotations()
        if p.t[p.i][0] == "eof":
            break
        p.stmt()
    print("\n".join(p.out))


if __name__ == "__main__":
    main()
