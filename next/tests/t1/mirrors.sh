#!/bin/sh
# Mirrors and proxies (ZN-339.01): ZINC_MIRRORS lists sources tried before the origin, each answer is checked (here a target of the signed index against its
# signed SHA-256): a mirror that serves a modified archive is reported and refused, the next mirror serves it; an index served over HTTP is read through an
# HTTP proxy (every request goes through it), and NO_PROXY bypasses it.
cd "$(dirname "$0")/../.." || exit 2
ZINC=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC") exec python3 - "$PWD/tools/index-repo" <<'PY'
import http.server, importlib.machinery, importlib.util, os, shutil, socketserver, subprocess, sys, tempfile, threading, urllib.request
loader = importlib.machinery.SourceFileLoader("ir", sys.argv[1]); spec = importlib.util.spec_from_loader("ir", loader); ir = importlib.util.module_from_spec(spec); loader.exec_module(ir)
Z = os.environ["ZINC"]; tmp = tempfile.mkdtemp(); fails = []
keys = {r: [ir.keygen()] for r in ir.ROLES}
data = b"a published plugin archive\n"
origin = os.path.join(tmp, "origin")
ir.build(origin, keys, {"binaries/macos/p-1.tar": (data, None)})
for m, body in (("m1", b"a modified plugin archive!\n"), ("m2", data)):
    os.makedirs(os.path.join(tmp, m, "index", "targets", "binaries", "macos"))
    open(os.path.join(tmp, m, "index", "targets", "binaries", "macos", "p-1.tar"), "wb").write(body)
os.remove(os.path.join(origin, "targets", "binaries", "macos", "p-1.tar"))   # only the mirrors have it
def get(url, cache, path=None, env=None):
    if os.path.isdir(cache): shutil.rmtree(cache)
    os.makedirs(cache); shutil.copy(os.path.join(origin, "root.json"), cache)
    e = dict(os.environ, **(env or {}))
    r = subprocess.run([Z, "index-get", url, cache] + ([path] if path else []), capture_output=True, text=True, env=e)
    return r.returncode, r.stdout, r.stderr
rc, out, err = get("file://" + origin, tmp + "/c1", "binaries/macos/p-1.tar", {"ZINC_MIRRORS": "file://%s/m1 file://%s/m2" % (tmp, tmp)})
if rc != 0 or "p-1.tar 27" not in out: fails.append("the second mirror was not used: %s %s" % (out, err))
if "m1/index/targets/binaries/macos/p-1.tar served" not in err or "refused" not in err: fails.append("the modified mirror is not reported: " + err)
rc, out, err = get("file://" + origin, tmp + "/c2", "binaries/macos/p-1.tar", {"ZINC_MIRRORS": "file://%s/m1" % tmp})
if rc == 0: fails.append("a modified archive was accepted when no other source has it")
# an HTTP origin and a forward proxy that counts what goes through it
shutil.copy(os.path.join(tmp, "m2", "index", "targets", "binaries", "macos", "p-1.tar"), os.path.join(origin, "targets", "binaries", "macos", "p-1.tar"))
class Quiet(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=origin, **k)
    def log_message(self, *a): pass
seen = []
class Proxy(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        seen.append(self.path)
        try:
            with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(self.path) as r: body, code = r.read(), r.status
        except urllib.error.HTTPError as e: body, code = b"", e.code
        self.send_response(code); self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)
servers = []
for h in (Quiet, Proxy):
    s = socketserver.ThreadingTCPServer(("127.0.0.1", 0), h); s.daemon_threads = True
    threading.Thread(target=s.serve_forever, daemon=True).start(); servers.append(s)
o_port, p_port = servers[0].server_address[1], servers[1].server_address[1]
url = "http://127.0.0.1:%d" % o_port
env = {"http_proxy": "http://127.0.0.1:%d" % p_port, "NO_PROXY": "", "no_proxy": "", "ZINC_MIRRORS": ""}
rc, out, err = get(url, tmp + "/c3", "binaries/macos/p-1.tar", env)
if rc != 0 or "p-1.tar 27" not in out: fails.append("through the proxy: %s %s" % (out, err))
got = {p.replace(url, "") for p in seen}
if not {"/timestamp.json", "/snapshot.json", "/targets.json", "/targets/binaries/macos/p-1.tar"} <= got: fails.append("not every request went through the proxy: %s" % sorted(got))
n = len(seen)
rc, out, err = get(url, tmp + "/c4", "binaries/macos/p-1.tar", dict(env, NO_PROXY="127.0.0.1", no_proxy="127.0.0.1"))
if rc != 0 or len(seen) != n: fails.append("NO_PROXY is not honoured (%d requests went through the proxy)" % (len(seen) - n))
for f in fails: print("mirrors:", f)
sys.exit(1 if fails else 0)
PY
