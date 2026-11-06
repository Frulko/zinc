#!/usr/bin/env python3
"""Spike, not a product: typed Python to Zinc TSX, for the study in ../03-static-front-end.md.

Usage: pyzn.py in.py > out.tsx. It uses CPython's own ast module, so whatever parses here is real Python.
ponytail: a throwaway proof. No source map, block scoping is only approximated, the method table is a sample.
"""
import ast
import re
import sys

TYPES = {"float": "number", "int": "i32", "str": "string", "bool": "boolean", "None": "void", "Any": "any", "i32": "i32", "i64": "i64", "f32": "f32", "u8": "u8"}
METHODS = {"append": "push", "upper": "toUpperCase", "lower": "toLowerCase", "startswith": "startsWith", "endswith": "endsWith", "strip": "trim", "extend": "push"}
CMP = {ast.Eq: "===", ast.NotEq: "!==", ast.Lt: "<", ast.LtE: "<=", ast.Gt: ">", ast.GtE: ">="}
BIN = {ast.Add: "+", ast.Sub: "-", ast.Mult: "*", ast.Div: "/", ast.Mod: "%", ast.Pow: "**", ast.BitAnd: "&", ast.BitOr: "|", ast.BitXor: "^", ast.LShift: "<<", ast.RShift: ">>"}


BUILTIN_TAGS = {"View", "Text", "Image", "ScrollView", "Canvas", "Input", "TextArea"}   # the JSX lowering knows them, nothing to import


def camel(s):
    return re.sub(r"_([a-z0-9])", lambda m: m.group(1).upper(), s)


class T:
    def __init__(self):
        self.out, self.scopes, self.classes, self.zinc, self.mods = [], [set()], set(), set(), set()
        self.depth = 0

    def emit(self, s):
        self.out.append("  " * self.depth + s)

    def ty(self, a):
        if a is None:
            return "any"
        if isinstance(a, ast.Constant):
            return "void" if a.value is None else str(a.value)
        if isinstance(a, ast.Name):
            return TYPES.get(a.id, a.id)
        if isinstance(a, ast.Subscript):
            base, arg = a.value.id, a.slice
            arg = getattr(arg, "value", arg) if type(arg).__name__ == "Index" else arg   # Python 3.8 and older
            if base in ("list", "List"):
                return self.ty(arg) + "[]"
            if base in ("dict", "Dict"):
                return f"Map<{self.ty(arg.elts[0])}, {self.ty(arg.elts[1])}>"
            if base == "Optional":
                return self.ty(arg) + " | null"
            if base == "Callable":
                ps = ", ".join(f"p{i}: {self.ty(x)}" for i, x in enumerate(arg.elts[0].elts))
                return f"(({ps}) => {self.ty(arg.elts[1])})"
        raise SyntaxError(f"line {a.lineno}: type not handled by the spike")

    # ---- expressions
    def jsx(self, e):
        kids, attrs = [], []
        for k in e.keywords:
            name = "className" if k.arg == "class_name" else camel(k.arg)
            attrs.append(f' {name}="{k.value.value}"' if isinstance(k.value, ast.Constant) and isinstance(k.value.value, str) else f" {name}={{{self.x(k.value)}}}")
        for a in e.args:
            kids.append(self.x(a) if self.is_el(a) else "{" + self.x(a) + "}")
        tag = e.func.id
        return f"<{tag}{''.join(attrs)}>{''.join(kids)}</{tag}>" if kids else f"<{tag}{''.join(attrs)} />"

    def is_el(self, e):
        return isinstance(e, ast.Call) and isinstance(e.func, ast.Name) and e.func.id[0].isupper() and e.func.id in self.zinc

    def x(self, e):
        if isinstance(e, ast.Constant):
            if e.value is None:
                return "null"
            if e.value is True or e.value is False:
                return str(e.value).lower()
            return repr(e.value) if isinstance(e.value, (str, int, float)) else str(e.value)
        if isinstance(e, ast.Name):
            return "this" if e.id == "self" else camel(e.id) if e.id in self.zinc else e.id
        if isinstance(e, ast.BinOp):
            if isinstance(e.op, ast.FloorDiv):
                return f"Math.floor({self.x(e.left)} / {self.x(e.right)})"
            return f"({self.x(e.left)} {BIN[type(e.op)]} {self.x(e.right)})"
        if isinstance(e, ast.UnaryOp):
            return {ast.USub: "-", ast.Not: "!", ast.UAdd: "+", ast.Invert: "~"}[type(e.op)] + self.x(e.operand)
        if isinstance(e, ast.BoolOp):
            return "(" + (" && " if isinstance(e.op, ast.And) else " || ").join(self.x(v) for v in e.values) + ")"
        if isinstance(e, ast.Compare):
            parts, left = [], e.left
            for op, r in zip(e.ops, e.comparators):
                if isinstance(op, (ast.In, ast.NotIn)):
                    parts.append(("!" if isinstance(op, ast.NotIn) else "") + f"{self.x(r)}.includes({self.x(left)})")
                elif isinstance(op, (ast.Is, ast.IsNot)):
                    parts.append(f"{self.x(left)} {'===' if isinstance(op, ast.Is) else '!=='} {self.x(r)}")
                else:
                    parts.append(f"{self.x(left)} {CMP[type(op)]} {self.x(r)}")
                left = r
            return "(" + " && ".join(parts) + ")"
        if isinstance(e, ast.IfExp):
            return f"({self.x(e.test)} ? {self.x(e.body)} : {self.x(e.orelse)})"
        if isinstance(e, ast.List):
            return "[" + ", ".join(self.x(v) for v in e.elts) + "]"
        if isinstance(e, ast.Dict):
            return "new Map([" + ", ".join(f"[{self.x(k)}, {self.x(v)}]" for k, v in zip(e.keys, e.values)) + "])"
        if isinstance(e, ast.JoinedStr):
            return "`" + "".join(self.x(v.value) and "${" + self.x(v.value) + "}" if isinstance(v, ast.FormattedValue) else v.value.replace("`", "\\`") for v in e.values) + "`"
        if isinstance(e, ast.Attribute):
            if isinstance(e.value, ast.Name) and e.value.id == "math":
                return "Math." + {"pi": "PI", "e": "E"}.get(e.attr, e.attr)
            return f"{self.x(e.value)}.{e.attr}"
        if isinstance(e, ast.Subscript):
            i = e.slice.value if type(e.slice).__name__ == "Index" else e.slice
            if isinstance(i, ast.UnaryOp) and isinstance(i.op, ast.USub):
                return f"{self.x(e.value)}[{self.x(e.value)}.length - {self.x(i.operand)}]"
            return f"{self.x(e.value)}[{self.x(i)}]"
        if isinstance(e, ast.Lambda):
            ps = ", ".join(a.arg for a in e.args.args)
            return f"(({ps}) => {self.x(e.body)})"
        if isinstance(e, ast.ListComp):
            g = e.generators[0]
            src = self.x(g.iter)
            if isinstance(g.iter, ast.Call) and getattr(g.iter.func, "id", "") == "range":
                src = f"Array.from({{ length: {self.x(g.iter.args[0])} }}, (_, i) => i)"
            for c in g.ifs:
                src += f".filter(({g.target.id}) => {self.x(c)})"
            return f"{src}.map(({g.target.id}) => {self.x(e.elt)})"
        if isinstance(e, ast.Call):
            return self.call(e)
        raise SyntaxError(f"line {e.lineno}: {type(e).__name__} not handled by the spike")

    def call(self, e):
        args = [self.x(a) for a in e.args]
        if isinstance(e.func, ast.Attribute):
            m = e.func.attr
            if isinstance(e.func.value, ast.Name) and e.func.value.id == "math":
                return f"Math.{m}({', '.join(args)})"
            return f"{self.x(e.func.value)}.{METHODS.get(m, camel(m) if False else m)}({', '.join(args)})"
        f = e.func.id
        if self.is_el(e):
            return self.jsx(e)
        if f == "print":
            return f"console.log({', '.join(args)})"
        if f == "len":
            return f"{args[0]}.length"
        if f == "str":
            return f"String({args[0]})"
        if f in ("abs", "min", "max", "sqrt", "floor"):
            return f"Math.{f}({', '.join(args)})"
        if f == "float":
            return f"({args[0]} as number)"
        if f == "int":
            return f"(Math.trunc({args[0]}) as i32)"
        if f in self.classes:
            return f"new {f}({', '.join(args)})"
        return f"{self.x(e.func)}({', '.join(args)})"

    # ---- statements
    def declared(self, name):
        return any(name in s for s in self.scopes)

    def params(self, fn, skip_self=False):
        a = fn.args.args[1:] if skip_self else fn.args.args
        defaults = [None] * (len(a) - len(fn.args.defaults)) + list(fn.args.defaults)
        ps = []
        for p, d in zip(a, defaults):
            self.scopes[-1].add(p.arg)
            ps.append(f"{p.arg}: {self.ty(p.annotation)}" + (f" = {self.x(d)}" if d is not None else ""))
        return ", ".join(ps)

    def body(self, stmts):
        self.depth += 1
        for s in stmts:
            self.s(s)
        self.depth -= 1

    def function(self, s):
        self.scopes.append(set())
        ps = self.params(s)
        ret = self.ty(s.returns) if s.returns is not None else ""
        if not ret and s.name[0].isupper():
            ret = "i32"   # a component returns a node
        elif not ret and any(isinstance(n, ast.Return) and n.value is not None for n in ast.walk(s)):
            ret = "any"   # no annotation: the dynamic path
        self.emit(f"function {s.name}({ps}){': ' + ret if ret else ''} {{")
        self.body(s.body)
        self.emit("}")
        self.scopes.pop()
        for d in reversed(s.decorator_list):
            self.emit(f"{self.x(d)}({s.name});")

    def klass(self, s):
        self.classes.add(s.name)
        ext = f" extends {s.bases[0].id}" if s.bases else ""
        self.emit(f"class {s.name}{ext} {{")
        self.depth += 1
        init = next((m for m in s.body if isinstance(m, ast.FunctionDef) and m.name == "__init__"), None)
        seen = set()
        for m in s.body:
            if isinstance(m, ast.AnnAssign):
                self.emit(f"{m.target.id}: {self.ty(m.annotation)};")
                seen.add(m.target.id)
        if init:   # the fields a class assigns in __init__, typed by the annotated parameter or the literal they come from
            anns = {a.arg: a.annotation for a in init.args.args}
            for st in init.body:
                if isinstance(st, (ast.Assign, ast.AnnAssign)):
                    t = st.targets[0] if isinstance(st, ast.Assign) else st.target
                    if isinstance(t, ast.Attribute) and t.attr not in seen:
                        v = st.value
                        ty = self.ty(st.annotation) if isinstance(st, ast.AnnAssign) else self.ty(anns[v.id]) if isinstance(v, ast.Name) and v.id in anns else \
                            "boolean" if isinstance(v, ast.Constant) and isinstance(v.value, bool) else "string" if isinstance(v, ast.Constant) and isinstance(v.value, str) else "number"
                        self.emit(f"{t.attr}: {ty};")
                        seen.add(t.attr)
        for m in s.body:
            if isinstance(m, ast.FunctionDef):
                self.scopes.append(set())
                ps = self.params(m, True)
                name = "constructor" if m.name == "__init__" else m.name
                ret = ": " + self.ty(m.returns) if m.returns is not None and name != "constructor" else ""
                self.emit(f"{name}({ps}){ret} {{")
                self.body(m.body)
                self.emit("}")
                self.scopes.pop()
        self.depth -= 1
        self.emit("}")

    def s(self, s):
        if isinstance(s, ast.ImportFrom):
            if s.module.split(".")[0] == "zinc":
                names = [a.name for a in s.names]
                self.zinc |= set(names)
                spec = "zinc:" + "/".join(s.module.split(".")[1:])
                self.emit("import { " + ", ".join(camel(n) if n[0].islower() else n for n in names if n not in BUILTIN_TAGS) + f" }} from '{spec}';")
            # typing and the rest exist only for the Python tools
        elif isinstance(s, ast.Import):
            self.mods |= {a.name for a in s.names}
        elif isinstance(s, ast.FunctionDef):
            self.function(s)
        elif isinstance(s, ast.ClassDef):
            self.klass(s)
        elif isinstance(s, (ast.Global, ast.Nonlocal, ast.Pass)):
            pass
        elif isinstance(s, ast.AnnAssign):
            self.scopes[-1].add(s.target.id)
            self.emit(f"let {s.target.id}: {self.ty(s.annotation)}" + (f" = {self.x(s.value)};" if s.value else ";"))
        elif isinstance(s, ast.Assign):
            t = s.targets[0]
            if isinstance(t, ast.Tuple):
                names = [v.id for v in t.elts]
                if all(self.declared(n) for n in names):
                    self.emit(f"[{', '.join(names)}] = {self.x(s.value)};")
                else:
                    self.scopes[-1].update(names)
                    self.emit(f"const [{', '.join(camel(n) if False else n for n in names)}] = {self.x(s.value)};")
            elif isinstance(t, ast.Name) and not self.declared(t.id):
                self.scopes[-1].add(t.id)
                self.emit(f"let {t.id} = {self.x(s.value)};")
            else:
                self.emit(f"{self.x(t)} = {self.x(s.value)};")
        elif isinstance(s, ast.AugAssign):
            if isinstance(s.op, ast.FloorDiv):
                self.emit(f"{self.x(s.target)} = Math.floor({self.x(s.target)} / {self.x(s.value)});")
            else:
                self.emit(f"{self.x(s.target)} {BIN[type(s.op)]}= {self.x(s.value)};")
        elif isinstance(s, ast.Expr):
            if not (isinstance(s.value, ast.Constant) and isinstance(s.value.value, str)):   # a docstring
                self.emit(self.x(s.value) + ";")
        elif isinstance(s, ast.Return):
            self.emit("return" + (" " + self.x(s.value) if s.value else "") + ";")
        elif isinstance(s, ast.Break):
            self.emit("break;")
        elif isinstance(s, ast.Continue):
            self.emit("continue;")
        elif isinstance(s, ast.While):
            self.emit(f"while ({self.x(s.test)}) {{")
            self.body(s.body)
            self.emit("}")
        elif isinstance(s, ast.If):
            if isinstance(s.test, ast.Compare) and getattr(s.test.left, "id", "") == "__name__":   # the main guard: top-level code here
                for b in s.body:
                    self.s(b)
                return
            self.emit(f"if ({self.x(s.test)}) {{")
            self.body(s.body)
            if s.orelse:
                self.emit("} else {")
                self.body(s.orelse)
            self.emit("}")
        elif isinstance(s, ast.For):
            self.for_(s)
        else:
            raise SyntaxError(f"line {s.lineno}: {type(s).__name__} not handled by the spike")

    def for_(self, s):
        it = s.iter
        self.scopes.append(set())
        if isinstance(it, ast.Call) and getattr(it.func, "id", "") == "range":
            a = [self.x(v) for v in it.args]
            lo, hi, step = ("0", a[0], "1") if len(a) == 1 else (a[0], a[1], "1") if len(a) == 2 else tuple(a)
            v = s.target.id
            self.scopes[-1].add(v)
            self.emit(f"for (let {v}: i32 = {lo}; {v} < {hi}; {v} += {step}) {{")
        else:
            self.scopes[-1].add(s.target.id)
            self.emit(f"for (const {s.target.id} of {self.x(it)}) {{")
        self.body(s.body)
        self.emit("}")
        self.scopes.pop()


def main():
    t = T()
    src = open(sys.argv[1]).read()
    for st in ast.parse(src).body:
        if isinstance(st, ast.ClassDef):
            t.classes.add(st.name)
    for st in ast.parse(src).body:
        t.s(st)
    print("\n".join(t.out))


if __name__ == "__main__":
    main()
