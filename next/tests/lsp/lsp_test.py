#!/usr/bin/env python3
"""LSP conformance script (ZN-142): initialize, didOpen, didChange, hover, completion, definition, documentSymbol, shutdown against `zinc lsp`; the diagnostics equal `zinc check --json`.
usage: lsp_test.py <zinc>   exit 0 when every check passes"""
import json, os, subprocess, sys, tempfile

Z = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
proc = subprocess.Popen([Z, "lsp"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
seq = 0
inbox = []
failures = []

def check(cond, what):
    if not cond: failures.append(what)

def send(obj):
    data = json.dumps(obj).encode()
    proc.stdin.write(b"Content-Length: %d\r\n\r\n" % len(data) + data); proc.stdin.flush()

def read():
    n = 0
    while True:
        line = proc.stdout.readline()
        if not line: raise EOFError("server closed")
        line = line.strip()
        if not line: break
        if line.lower().startswith(b"content-length:"): n = int(line.split(b":")[1])
    return json.loads(proc.stdout.read(n))

def request(method, params):
    global seq
    seq += 1
    send({"jsonrpc": "2.0", "id": seq, "method": method, "params": params})
    while True:
        m = read()
        if m.get("id") == seq: return m.get("result")
        inbox.append(m)

def notify(method, params): send({"jsonrpc": "2.0", "method": method, "params": params})

def diagnostics(uri):
    while True:
        for i, m in enumerate(inbox):
            if m.get("method") == "textDocument/publishDiagnostics" and m["params"]["uri"] == uri:
                del inbox[i]; return m["params"]["diagnostics"]
        inbox.append(read())

def pos_of(text, needle, nth=0, delta=0):
    i = -1
    for _ in range(nth + 1): i = text.index(needle, i + 1)
    i += delta
    line = text.count("\n", 0, i); return {"line": line, "character": i - (text.rfind("\n", 0, i) + 1)}

init = request("initialize", {"processId": None, "rootUri": None, "capabilities": {}})
caps = init["capabilities"]
check(caps.get("hoverProvider") and caps.get("definitionProvider") and caps.get("documentSymbolProvider") and "completionProvider" in caps, "capabilities")
check(caps.get("signatureHelpProvider", {}).get("triggerCharacters") == ["(", ","], "signature help capability")
notify("initialized", {})

tmp = tempfile.mkdtemp()
path = os.path.join(tmp, "sample.ts")
uri = "file://" + path
text = open(os.path.join(HERE, "sample.ts")).read()
open(path, "w").write(text)

# 1. a clean file has no diagnostics
notify("textDocument/didOpen", {"textDocument": {"uri": uri, "languageId": "typescript", "version": 1, "text": text}})
check(diagnostics(uri) == [], "clean file has diagnostics")

# 2. hover on a variable and on a function call
h = request("textDocument/hover", {"textDocument": {"uri": uri}, "position": pos_of(text, "total", 0, 1)})
check(h and "total: f64" in h["contents"]["value"], "hover on total: %r" % h)
h = request("textDocument/hover", {"textDocument": {"uri": uri}, "position": pos_of(text, "origin", 0, 1)})
check(h and "Point" in h["contents"]["value"], "hover on origin: %r" % h)

# 3. definition of the call twice(...) is the function declaration
d = request("textDocument/definition", {"textDocument": {"uri": uri}, "position": pos_of(text, "twice(origin", 0, 1)})
check(d and d["uri"] == uri and d["range"]["start"]["line"] == 7, "definition of twice: %r" % d)
d = request("textDocument/definition", {"textDocument": {"uri": uri}, "position": pos_of(text, "origin.length", 0, 1)})
check(d and d["range"]["start"]["line"] == 11, "definition of origin: %r" % d)

# 4. document symbols
syms = request("textDocument/documentSymbol", {"textDocument": {"uri": uri}})
names = [s["name"] for s in syms]
check(names == ["Point", "twice", "origin", "total"], "symbols: %r" % names)
check([c["name"] for c in syms[0]["children"]] == ["x", "y", "constructor", "length"], "class members")

# 5. completion after a dot lists the members, and the module specifiers
text2 = text + "origin.\n"
notify("textDocument/didChange", {"textDocument": {"uri": uri, "version": 2}, "contentChanges": [{"text": text2}]})
diagnostics(uri)
c = request("textDocument/completion", {"textDocument": {"uri": uri}, "position": {"line": text2.count("\n") - 1, "character": 7}})
labels = [i["label"] for i in c["items"]]
check({"x", "y", "length"} <= set(labels), "member completion: %r" % labels)
text3 = "import { rect } from 'zinc:g'\n"
notify("textDocument/didChange", {"textDocument": {"uri": uri, "version": 3}, "contentChanges": [{"text": text3}]})
diagnostics(uri)
c = request("textDocument/completion", {"textDocument": {"uri": uri}, "position": {"line": 0, "character": 28}})
check("zinc:gfx" in [i["label"] for i in c["items"]], "import completion")
text4 = text + "const fo = tw\n"
notify("textDocument/didChange", {"textDocument": {"uri": uri, "version": 4}, "contentChanges": [{"text": text4}]})
diagnostics(uri)
c = request("textDocument/completion", {"textDocument": {"uri": uri}, "position": {"line": text4.count("\n") - 1, "character": 13}})
check("twice" in [i["label"] for i in c["items"]], "name completion")

# 6. diagnostics of an edit equal `zinc check --json`
bad = text + "const wrong: number = 'text';\nundefinedName();\n"
notify("textDocument/didChange", {"textDocument": {"uri": uri, "version": 5}, "contentChanges": [{"text": bad}]})
got = diagnostics(uri)
open(path, "w").write(bad)
ref = subprocess.run([Z, "check", "--json", path], capture_output=True, text=True)
want = json.loads(ref.stdout)
norm = lambda items: sorted((x["range"]["start"]["line"], x["range"]["start"]["character"], x["code"], x["message"]) for x in items)
check(len(got) >= 2 and norm(got) == norm(want), "diagnostics differ from check --json:\n  lsp  %r\n  json %r" % (norm(got), norm(want)))

# 7. a fix clears them; shutdown and exit
notify("textDocument/didChange", {"textDocument": {"uri": uri, "version": 6}, "contentChanges": [{"text": text}]})
check(diagnostics(uri) == [], "fix leaves diagnostics")

# 8. signatures and doc comments (ZN-732): completion items, signature help, hover; a member's definition
uri2 = "file://" + os.path.join(tmp, "docs.ts")
docs = open(os.path.join(HERE, "docs.ts")).read()
def edit(t, version=[10]):
    version[0] += 1
    notify("textDocument/didChange" if version[0] > 11 else "textDocument/didOpen", {"textDocument": {"uri": uri2, "languageId": "typescript", "version": version[0], "text": t}, "contentChanges": [{"text": t}]})
    return diagnostics(uri2)
def items_at(t, line, ch):
    return {i["label"]: i for i in request("textDocument/completion", {"textDocument": {"uri": uri2}, "position": {"line": line, "character": ch}})["items"]}
def sig_at(t, needle, delta):
    return request("textDocument/signatureHelp", {"textDocument": {"uri": uri2}, "position": pos_of(t, needle, 0, delta)})
check(edit(docs) == [], "docs.ts has diagnostics")
last = docs.count("\n")
t = docs + "b.\n"; edit(t); it = items_at(t, last, 2)
check(it.get("step", {}).get("detail") == "step(dt: number, w: number): void" and it["step"].get("documentation") == "Moves the ball.", "a method's signature and doc: %r" % it.get("step"))
check(it.get("x", {}).get("detail") == "f64" and it["x"].get("documentation") == "Position, in pixels.", "a field's type and doc: %r" % it.get("x"))
t = docs + "b.st\n"; edit(t); it = items_at(t, last, 4)
check("step" in it and "x" in it, "members while a name is typed after the dot: %r" % sorted(it))
t = docs + "tw\n"; edit(t); it = items_at(t, last, 2)
check(it.get("twice", {}).get("detail") == "twice(n: number): number" and it["twice"].get("documentation") == "Twice a number.", "a function's signature and its // doc: %r" % it.get("twice"))
check("Ball" in it and "const" in it, "names are not cut to the typed prefix: the editor filters")
check(it.get("rrect", {}).get("detail", "").startswith("rrect(x: number, y: number") and "Rounded rectangle" in it["rrect"].get("documentation", ""), "a standard function's signature and doc: %r" % it.get("rrect"))
t = docs + "sys.\n"; edit(t); it = items_at(t, last, 4)
check("clock" in it and "Monotonic clock" in it["clock"].get("documentation", "") and it["clock"]["detail"].startswith("clock("), "the exports of a namespace import: %r" % it.get("clock"))
edit(docs)
h = sig_at(docs, "b.step(1, 2)", 10)
s0 = h["signatures"][0] if h else {}
check(s0.get("label") == "step(dt: number, w: number): void" and h["activeParameter"] == 1 and s0.get("documentation") == "Moves the ball.", "signature help in a method call: %r" % h)
check([p["label"] for p in s0.get("parameters", [])] == [[5, 15], [17, 26]] and s0["parameters"][1].get("documentation") == "the width of the field", "its parameters and their docs: %r" % s0.get("parameters"))
h = sig_at(docs, "twice(3)", 6)
check(h and h["signatures"][0]["label"] == "twice(n: number): number" and h["activeParameter"] == 0, "signature help in a function call: %r" % h)
h = sig_at(docs, "new Ball()", 9)
check(h and h["signatures"][0]["label"] == "new Ball()" and h["signatures"][0].get("documentation") == "A ball that bounces.", "signature help in a constructor call: %r" % h)
check(sig_at(docs, "const b", 3) is None, "no signature help outside a call")
t = docs + "b.step(1, "; edit(t)
h = request("textDocument/signatureHelp", {"textDocument": {"uri": uri2}, "position": {"line": last, "character": 10}})
check(h and h["signatures"][0]["label"] == "step(dt: number, w: number): void" and h["activeParameter"] == 1, "signature help while the call is being typed: %r" % h)
edit(docs)
h = request("textDocument/hover", {"textDocument": {"uri": uri2}, "position": pos_of(docs, "b.step(1, 2)", 0, 3)})
check(h and "step(dt: number, w: number): void" in h["contents"]["value"] and "Moves the ball." in h["contents"]["value"], "hover on a method: %r" % h)
h = request("textDocument/hover", {"textDocument": {"uri": uri2}, "position": pos_of(docs, "twice(3)", 0, 1)})
check(h and "twice(n: number): number" in h["contents"]["value"] and "Twice a number." in h["contents"]["value"], "hover on a function: %r" % h)
d = request("textDocument/definition", {"textDocument": {"uri": uri2}, "position": pos_of(docs, "b.step(1, 2)", 0, 3)})
check(d and d["uri"] == uri2 and d["range"]["start"]["line"] == docs[:docs.index("  step(")].count("\n"), "definition of a member: %r" % d)

request("shutdown", None)
notify("exit", None)
check(proc.wait(timeout=5) == 0, "exit code")
if failures:
    print("\n".join("FAIL " + f for f in failures)); sys.exit(1)
print("lsp_test: ok")
