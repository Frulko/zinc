#!/usr/bin/env python3
"""Chrome's own DevTools frontend against Zinc's CDP targets, driven through its UI in headless Chrome (ZN-709, ZN-704).

  tests/devtools_frontend_check.py sources <zinc> <main.ts>   zinc debug --cdp: js_app.html lists the file, a click in the gutter sets a
                                                              breakpoint, the Resume button runs to it, the Scope pane shows the locals
  tests/devtools_frontend_check.py styles <port>              a dev run's inspector: inspector.html selects a box, the Styles pane shows its
                                                              rules, an edit of the box model changes the app's frame

The frontend's WebSocket is watched through Chrome's Network domain: every method it calls and every error it gets back is logged, and a
reply with an error or an exception in the frontend fails the check. One line per check; exit 1 when one fails, 77 without Chrome."""
import json, os, re, subprocess, sys, time
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tools"))
import cdp

failed = False
def check(ok, what):
    global failed
    print(("ok   " if ok else "FAIL ") + what)
    if not ok: failed = True

# Finds elements through the frontend's shadow roots; text() is what a person reads in them.
DEEP = """window.__deep = (sel, root = document) => { const out = [];
  const walk = r => { for (const e of r.querySelectorAll('*')) { if (e.matches(sel)) out.push(e); if (e.shadowRoot) walk(e.shadowRoot); } };
  walk(root); return out; };
window.__text = e => { let s = ''; const walk = n => { if (n.nodeType === 3) s += n.data; for (const c of (n.shadowRoot ? [...n.shadowRoot.childNodes, ...n.childNodes] : n.childNodes)) walk(c); }; walk(e); return s; };
window.__rect = e => { e.scrollIntoViewIfNeeded?.(); const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; };"""

class Frontend:
    """A DevTools frontend page in headless Chrome, with the protocol it speaks to the target."""
    def __init__(self, chrome):
        self.c, self.sent, self.log, self.errors = chrome, {}, [], []
        chrome.on_event = self.event
        chrome.call("Network.enable")   # the frontend's own WebSocket frames come as Network events

    def event(self, m):
        p = m.get("params", {})
        if m["method"] in ("Network.webSocketFrameSent", "Network.webSocketFrameReceived"):
            f = json.loads(p["response"]["payloadData"])
            if m["method"].endswith("Sent"):
                self.sent[f["id"]] = f["method"]; self.log.append((">", f["method"], f.get("params", {})))
            elif "id" in f:
                self.log.append(("<", self.sent.get(f["id"], "?"), f.get("result", f.get("error"))))
                if "error" in f: self.errors.append("%s: %s" % (self.sent.get(f["id"]), f["error"].get("message")))
            else: self.log.append(("<", f["method"], f.get("params", {})))

    def open(self, url):
        self.c.open(url); self.c.pump(1); self.c.eval(DEEP)

    def wait(self, js, seconds=10):   # until the expression is truthy; its value
        end = time.monotonic() + seconds
        while time.monotonic() < end:
            v = self.c.eval(js)
            if v: return v
            self.c.pump(0.2)
        return None

    def saw(self, direction, method, pred=lambda p: True, seconds=5):   # a frame of the log, waited for
        end = time.monotonic() + seconds
        while True:
            hit = next((p for d, m, p in self.log if d == direction and m == method and p is not None and pred(p)), None)
            if hit is not None or time.monotonic() > end: return hit
            self.c.pump(0.2)

    def click(self, js):   # a real click on the element the expression finds
        xy = self.wait(f"(() => {{ const e = {js}; return e ? __rect(e) : null; }})()")
        if xy: self.c.click(*xy)
        return bool(xy)

    def report(self):
        check(not self.errors, "no error reply to the frontend%s" % ("" if not self.errors else ": " + "; ".join(self.errors[:5])))
        exc = [t for k, t in self.c.problems if k == "exception"]
        check(not exc, "no exception in the frontend%s" % ("" if not exc else ": " + exc[0]))
        if os.environ.get("CDP_LOG"):
            with open(os.environ["CDP_LOG"], "w") as f:
                for d, m, p in self.log: f.write("%s %s %s\n" % (d, m, json.dumps(p)[:300]))


def sources(zinc, program):
    program = os.path.abspath(program)
    p = subprocess.Popen(["timeout", "60", zinc, "debug", "--cdp=0", program], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        port, err = None, ""
        while port is None:
            line = p.stderr.readline()
            if not line: print("FAIL zinc debug ended: " + err); return
            err += line
            m = re.search(r"localhost:(\d+)", line)
            if m: port = int(m.group(1))
        with cdp.Chrome(["--window-size=1400,900"]) as c:
            fe = Frontend(c)
            fe.open(f"devtools://devtools/bundled/js_app.html?ws=127.0.0.1:{port}/zinc-debug")
            name = os.path.basename(program)
            # paused at the first statement (runIfWaitingForDebugger), the frontend shows the file in Sources
            listed = fe.wait(f"__deep('.navigator-file-tree-item').map(__text).find(t => t.includes({json.dumps(name)}))")
            check(bool(listed), f"the Sources panel lists {name}")
            gutter = f"__deep('.cm-lineNumbers .cm-gutterElement').find(e => e.textContent === '19')"
            check(fe.click(gutter), "line 19 of the editor clicked")
            bp = fe.saw("<", "Debugger.setBreakpointByUrl")
            check(bool(bp and bp.get("locations") and bp["locations"][0]["lineNumber"] == 18), f"the click set a breakpoint: {bp}")
            check(fe.click("__deep('[aria-label=\"Resume script execution\"]')[0]"), "Resume clicked")
            hit = fe.saw("<", "Debugger.paused", lambda q: q.get("hitBreakpoints"))
            check(bool(hit) and hit["callFrames"][0]["location"]["lineNumber"] == 18, "stopped at the breakpoint")
            local = "__deep('.scope-chain-sidebar-pane-section').filter(e => __text(e) === 'Local').flatMap(e => __deep('.name-and-value', e.parentElement)).map(__text)"
            scope = fe.wait(f"(() => {{ const v = {local}; return ['total: 0', 'name: \"zinc\"', 'v: 1', 'p: Point'].every(x => v.includes(x)) ? v : null; }})()")
            check(bool(scope), "the Scope pane shows the locals: %s" % ", ".join(scope or fe.c.eval(local) or []))
            fe.log.clear()   # DevTools closed and opened again: the paused program is shown again
            fe.open(f"devtools://devtools/bundled/js_app.html?ws=127.0.0.1:{port}/zinc-debug")
            again = fe.saw("<", "Debugger.paused")
            check(bool(again) and again["callFrames"][0]["location"]["lineNumber"] == 18 and bool(fe.wait(f"{local}.includes('total: 0')")), "a new frontend finds the program paused at line 19 with its locals")
            fe.report()
    finally:
        p.kill()


if __name__ == "__main__":
    if not cdp.find_chrome(): print("skip: no Chrome"); sys.exit(77)
    mode = sys.argv[1] if len(sys.argv) > 1 else ""
    if mode == "sources" and len(sys.argv) == 4: sources(sys.argv[2], sys.argv[3])
    else: print(__doc__); sys.exit(2)
    sys.exit(1 if failed else 0)
