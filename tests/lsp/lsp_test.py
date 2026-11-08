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

# 7b. (ZN-998) the diagnostics carry the version of the change; a change to a document that is not open is ignored
notify("textDocument/didChange", {"textDocument": {"uri": uri, "version": 7}, "contentChanges": [{"text": bad}]})
while not any(m.get("method") == "textDocument/publishDiagnostics" and m["params"]["uri"] == uri for m in inbox): inbox.append(read())
pub = next(m for m in inbox if m.get("method") == "textDocument/publishDiagnostics" and m["params"]["uri"] == uri)
inbox.remove(pub)
check(pub["params"].get("version") == 7, "diagnostics carry the document version: %r" % pub["params"].get("version"))
ghost = "file://" + os.path.join(tmp, "never-opened.ts")
notify("textDocument/didChange", {"textDocument": {"uri": ghost, "version": 1}, "contentChanges": [{"text": "const x: number = 'a';\n"}]})
check(request("textDocument/hover", {"textDocument": {"uri": ghost}, "position": {"line": 0, "character": 6}}) is None, "an unopened document is not served")
check(not any(m.get("method") == "textDocument/publishDiagnostics" and m["params"]["uri"] == ghost for m in inbox), "a change to an unopened document publishes nothing")
notify("textDocument/didChange", {"textDocument": {"uri": uri, "version": 8}, "contentChanges": [{"text": text}]})
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

# 9. platform files (ZN-745): the definition is in the file the tsconfig's moduleSuffixes name first, as tsc and the editor resolve it
plat = os.path.join(tmp, "plat")
os.mkdir(plat)
open(os.path.join(plat, "tsconfig.json"), "w").write('{ "compilerOptions": { "moduleSuffixes": [".android", ".native", ""] } }\n')
for f in ("Screen.tsx", "Screen.native.tsx", "Screen.android.tsx"):
    open(os.path.join(plat, f), "w").write("export function screen(): string { return '%s'; }\n" % f)
main = "import { screen } from './Screen';\nconsole.log(screen());\n"
uri3 = "file://" + os.path.join(plat, "main.ts")
open(os.path.join(plat, "main.ts"), "w").write(main)
notify("textDocument/didOpen", {"textDocument": {"uri": uri3, "languageId": "typescript", "version": 1, "text": main}})
check(diagnostics(uri3) == [], "platform files: diagnostics")
d = request("textDocument/definition", {"textDocument": {"uri": uri3}, "position": pos_of(main, "screen()", 0, 1)})
check(d and d["uri"].endswith("/plat/Screen.android.tsx"), "definition through moduleSuffixes: %r" % d)

# 10. (ZN-1020) completion in four more places: the braces of an import, JSX element names, JSX attribute names, string and array members
sk = os.path.join(tmp, "sketch")
os.mkdir(sk)
def open_doc(name, t):
    u = "file://" + os.path.join(sk, name)
    open(os.path.join(sk, name), "w").write(t)
    notify("textDocument/didOpen", {"textDocument": {"uri": u, "languageId": "typescriptreact", "version": 1, "text": t}})
    return u, diagnostics(u)
def change(u, t, v):
    notify("textDocument/didChange", {"textDocument": {"uri": u, "version": v}, "contentChanges": [{"text": t}]})
def complete(u, line, ch):
    return request("textDocument/completion", {"textDocument": {"uri": u}, "position": {"line": line, "character": ch}})
ui = ("/** A card with a title. */\nfunction Card(p: { title: string; count: number }): i32 { return <View className=\"p-2\"><Text>{p.title}</Text></View>; }\n"
      "render(() => <Card title=\"a\" count={1} />, 0xffffff, (dt: number) => {});\n")
uiu, dg = open_doc("app.tsx", "import { render } from 'zinc:ui/solid';\n" + ui)
check(dg == [], "app.tsx has diagnostics: %r" % dg)
t = "import { r } from 'zinc:gfx';\n" + ui; change(uiu, t, 2); diagnostics(uiu)
it = {i["label"]: i for i in complete(uiu, 0, 10)["items"]}
check(it.get("rrect", {}).get("detail", "").startswith("rrect(x: number") and "Rounded rectangle" in it["rrect"].get("documentation", "") and "onFrame" in it, "the exports in the braces of an import: %r" % sorted(it)[:8])
t = "import { render } from 'zinc:ui/solid';\n" + ui + "const x = <Ca\n"; change(uiu, t, 3); diagnostics(uiu)
it = {i["label"]: i for i in complete(uiu, 4, 13)["items"]}
check("Card" in it and "View" in it and "ScrollView" in it and it["Card"].get("documentation") == "A card with a title." and "render" not in it, "JSX element names: %r" % sorted(it))
t = "import { render } from 'zinc:ui/solid';\n" + ui + "const y = <Card ti\nconst z = <View cl\n"; change(uiu, t, 4); diagnostics(uiu)
it = {i["label"]: i for i in complete(uiu, 4, 18)["items"]}
check(set(it) == {"title", "count"} and it["title"]["detail"] == "string", "a component's attributes are its props: %r" % it)
it = {i["label"]: i for i in complete(uiu, 5, 18)["items"]}
check("className" in it and "onPointerDown" in it and "style" in it, "a host tag's attributes: %r" % sorted(it))
t = "const s = 'abc';\nconst a = [1, 2];\ns.\n"; change(uiu, t, 5); diagnostics(uiu)
it = {i["label"]: i for i in complete(uiu, 2, 2)["items"]}
check(it.get("padStart", {}).get("detail") == "padStart(n: i32, fill?: string): string" and "white space" in it.get("trim", {}).get("documentation", "") and it.get("length", {}).get("kind") == 5, "string members with signatures: %r" % it.get("padStart"))
t = "const s = 'abc';\nconst a = [1, 2];\na.\n"; change(uiu, t, 51); diagnostics(uiu)
it = {i["label"]: i for i in complete(uiu, 2, 2)["items"]}
check(it.get("push", {}).get("detail", "").startswith("push(") and "map" in it and "length" in it, "array members with signatures: %r" % it.get("push"))

# 11. auto-import: a name not imported is proposed with where it comes from, and accepting it adds the import (a new line, or into the braces)
t = "const k = 1;\nrr\n"; change(uiu, t, 6); diagnostics(uiu)
c = complete(uiu, 1, 2); it = {i["label"]: i for i in c["items"]}
r = it.get("rrect", {})
check(c["isIncomplete"] and r.get("labelDetails", {}).get("description") == "zinc:gfx" and r.get("additionalTextEdits") == [{"range": {"start": {"line": 0, "character": 0}, "end": {"line": 0, "character": 0}}, "newText": "import { rrect } from 'zinc:gfx';\n"}], "auto-import of rrect: %r" % r)
t = "import { rect } from 'zinc:gfx';\nrr\n"; change(uiu, t, 7); diagnostics(uiu)
r = {i["label"]: i for i in complete(uiu, 1, 2)["items"]}.get("rrect", {})
check(r.get("additionalTextEdits") == [{"range": {"start": {"line": 0, "character": 13}, "end": {"line": 0, "character": 13}}, "newText": ", rrect"}], "auto-import into the braces: %r" % r.get("additionalTextEdits"))
lib, _ = open_doc("shapes.ts", "/** A star. */\nexport function star(n: number): number { return n; }\n")
t = "st\n"; change(uiu, t, 8); diagnostics(uiu)
r = {i["label"]: i for i in complete(uiu, 0, 2)["items"]}.get("star", {})
check(r.get("labelDetails", {}).get("description") == "./shapes" and r.get("documentation") == "A star." and "import { star } from './shapes';" in json.dumps(r.get("additionalTextEdits")), "auto-import from the sketch's files: %r" % r)

# 12. editing a module publishes the diagnostics of the open documents that import it
change(uiu, "import { star } from './shapes';\nconsole.log(star(2));\n", 9)
check(diagnostics(uiu) == [], "the importer is clean")
change(lib, "export function starry(n: number): number { return n; }\n", 2)
diagnostics(lib)
check(len(diagnostics(uiu)) > 0, "the importer is published again when its import goes away")
change(lib, "export function star(n: number): number { return n; }\n", 3)
diagnostics(lib)
check(diagnostics(uiu) == [], "and again when it comes back")

# 12b. zinc lint's target rules in a project that names its targets (ZN-1063): on open, and again on save
check(caps.get("textDocumentSync", {}).get("save") is True, "save notifications asked for: %r" % caps.get("textDocumentSync"))
lp = os.path.join(tmp, "linted")
os.makedirs(os.path.join(lp, "src"))
open(os.path.join(lp, "zinc.json"), "w").write('{ "name": "p", "entry": "src/main.tsx", "targets": { "esp32": {} } }\n')
lt = "import { render } from 'zinc:ui/solid';\nfunction App(): i32 {\n  return <View className=\"w-[480px]\" />;\n}\nrender(App, 0xffffff, null);\n"
lpath = os.path.join(lp, "src", "main.tsx")
open(lpath, "w").write(lt)
luri = "file://" + lpath
notify("textDocument/didOpen", {"textDocument": {"uri": luri, "languageId": "typescriptreact", "version": 1, "text": lt}})
ld = diagnostics(luri)
check([(d["code"], d["severity"], d["range"]["start"]["line"]) for d in ld] == [("screen-size", 2, 2)] and ld[0]["message"].startswith("[esp32] w-[480px]"), "lint on open: %r" % ld)
open(lpath, "w").write(lt.replace("w-[480px]", "w-full"))
notify("textDocument/didSave", {"textDocument": {"uri": luri}})
check(diagnostics(luri) == [], "lint again on save")

request("shutdown", None)
notify("exit", None)
check(proc.wait(timeout=5) == 0, "exit code")

# 13. the order of the protocol: a request before initialize gets ServerNotInitialized, after shutdown InvalidRequest
proc = subprocess.Popen([Z, "lsp"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
def raw(method, params, i):
    send({"jsonrpc": "2.0", "id": i, "method": method, "params": params})
    while True:
        m = read()
        if m.get("id") == i: return m
notify("textDocument/didOpen", {"textDocument": {"uri": uri, "languageId": "typescript", "version": 1, "text": text}})
early = raw("textDocument/hover", {"textDocument": {"uri": uri}, "position": {"line": 0, "character": 0}}, 1)
check(early.get("error", {}).get("code") == -32002 and "result" not in early, "a request before initialize: %r" % early)
check("result" in raw("initialize", {"processId": None, "rootUri": None, "capabilities": {}}, 2), "initialize after the refused request")
check(raw("textDocument/hover", {"textDocument": {"uri": uri}, "position": {"line": 0, "character": 0}}, 3).get("result") is None, "the didOpen sent before initialize was dropped")
raw("shutdown", None, 4)
late = raw("textDocument/hover", {"textDocument": {"uri": uri}, "position": {"line": 0, "character": 0}}, 5)
check(late.get("error", {}).get("code") == -32600, "a request after shutdown: %r" % late)
notify("exit", None)
check(proc.wait(timeout=5) == 0, "exit code after shutdown")
if failures:
    print("\n".join("FAIL " + f for f in failures)); sys.exit(1)
print("lsp_test: ok")
