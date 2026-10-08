"""A tiny Chrome DevTools Protocol client over --remote-debugging-pipe (no websocket library): `with Chrome() as c: c.open(url); c.eval("...")` (ZN-135, ZN-253)."""
import json, os, select, subprocess, time

CHROME_MAC = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

def find_chrome():
    for c in (os.environ.get("CHROME"), CHROME_MAC, "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"):
        if c and os.path.exists(c): return c
    return None

class Chrome:
    def __init__(self, args=(), chrome=None):
        self.chrome = chrome or find_chrome()
        if not self.chrome: raise RuntimeError("no Chrome")
        self.args = list(args); self.buf = b""; self.id = 0; self.console = []; self.session = None

    def __enter__(self):
        spare = [os.dup(0) for _ in range(6)]   # so the pipes do not land on fds 3 and 4
        r_in, self.w_in = os.pipe(); self.r_out, w_out = os.pipe()
        def child(): os.dup2(r_in, 3); os.dup2(w_out, 4); os.set_inheritable(3, True); os.set_inheritable(4, True)
        self.proc = subprocess.Popen([self.chrome, "--headless=new", "--no-first-run", "--hide-scrollbars", "--remote-debugging-pipe"] + self.args + ["about:blank"], preexec_fn=child, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, close_fds=False)
        os.close(r_in); os.close(w_out)
        for f in spare: os.close(f)
        t = self.call("Target.createTarget", {"url": "about:blank"})["targetId"]
        self.session = self.call("Target.attachToTarget", {"targetId": t, "flatten": True})["sessionId"]
        self.call("Runtime.enable"); self.call("Page.enable")
        return self

    def __exit__(self, *a):
        self.proc.terminate()
        try: self.proc.wait(5)
        except Exception: self.proc.kill()

    def _send(self, method, params=None, session=True):
        self.id += 1
        m = {"id": self.id, "method": method, "params": params or {}}
        if session and self.session: m["sessionId"] = self.session
        os.write(self.w_in, json.dumps(m).encode() + b"\0"); return self.id

    def _recv(self, until_id, timeout):
        end = time.time() + timeout
        while time.time() < end:
            while b"\0" in self.buf:
                raw, self.buf = self.buf.split(b"\0", 1); m = json.loads(raw)
                if m.get("method") == "Runtime.consoleAPICalled": self.console.append(" ".join(str(a.get("value", a.get("description", ""))) for a in m["params"]["args"]))
                if m.get("method") == "Runtime.exceptionThrown": self.console.append("EXCEPTION " + str(m["params"]["exceptionDetails"].get("exception", {}).get("description", ""))[:300])
                if m.get("id") == until_id: return m
            if select.select([self.r_out], [], [], 0.2)[0]:
                d = os.read(self.r_out, 1 << 22)
                if not d: break
                self.buf += d
        return None

    def call(self, method, params=None, timeout=60):
        i = self._send(method, params, session=not method.startswith("Target.")); m = self._recv(i, timeout)
        return (m or {}).get("result", {})

    def open(self, url): self.call("Page.navigate", {"url": url})

    def eval(self, expr, timeout=120):
        r = self.call("Runtime.evaluate", {"expression": expr, "returnByValue": True, "awaitPromise": True}, timeout)
        return r.get("result", {}).get("value")
