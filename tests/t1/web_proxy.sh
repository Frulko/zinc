#!/bin/sh
# The fetch proxy of an exported page (docs/targets/web.md, "Fetch proxy"): the web-proxy fixture lists 127.0.0.1 in zinc.json targets.web.proxy. In headless Chrome its
# fetch to a server of that host that sends no CORS headers answers through serve.py's /__proxy, and its fetch to localhost (not listed) is refused. The proxy itself
# refuses an unlisted host, a POST and a file: address; the deployable proxy.mjs (run by Node) answers the same.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
export ZINC_BACKGROUND=1
exec timeout 150 python3 -I - "$Z" "$(pwd)" <<'PY'
import http.server, json, os, shutil, socket, subprocess, sys, tempfile, threading, time, urllib.error, urllib.request
zinc, repo = sys.argv[1], sys.argv[2]
sys.path.insert(0, os.path.join(repo, 'tools'))
from cdp import find_chrome
def fail(msg): print('web_proxy: ' + msg); sys.exit(1)
tmp = tempfile.mkdtemp()
procs = []
try:
    class Plain(http.server.BaseHTTPRequestHandler):   # a site that sends no CORS headers
        def do_GET(self):
            self.send_response(200); self.send_header('Content-Type', 'text/plain'); self.end_headers(); self.wfile.write(b'proxied-ok\n')
        def log_message(self, *a): pass
    target = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Plain)
    threading.Thread(target=target.serve_forever, daemon=True).start()
    tp = target.server_address[1]
    app = os.path.join(tmp, 'app')
    shutil.copytree(os.path.join(repo, 'tests/fixtures/web-proxy'), app, ignore=shutil.ignore_patterns('build'))
    open(os.path.join(app, 'data/target.txt'), 'w').write('http://127.0.0.1:%d/data.txt\nhttp://localhost:%d/data.txt\n' % (tp, tp))
    site = os.path.join(tmp, 'site')
    r = subprocess.run([zinc, 'export', app, '--target', 'web', '-o', site], capture_output=True, text=True)
    if r.returncode: fail('the export failed: ' + r.stderr[-600:])
    if json.load(open(os.path.join(site, 'proxy.json'))) != {'hosts': ['127.0.0.1']}: fail('proxy.json')
    s = socket.socket(); s.bind(('127.0.0.1', 0)); sp = s.getsockname()[1]; s.close()
    srv = subprocess.Popen([sys.executable, '-I', os.path.join(site, 'serve.py'), str(sp)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); procs.append(srv)
    base = 'http://127.0.0.1:%d' % sp
    for _ in range(50):
        try: urllib.request.urlopen(base + '/index.html', timeout=1).read(); break
        except OSError: time.sleep(0.1)
    def get(path, method='GET'):
        try:
            with urllib.request.urlopen(urllib.request.Request(base + path, method=method), timeout=10) as r: return r.status, r.read().decode()
        except urllib.error.HTTPError as e: return e.code, ''
    q = '/__proxy?url=' + urllib.request.quote('http://127.0.0.1:%d/data.txt' % tp, safe='')
    if get(q) != (200, 'proxied-ok\n'): fail('a listed host through serve.py: %r' % (get(q),))
    if get('/__proxy?url=' + urllib.request.quote('http://localhost:%d/data.txt' % tp, safe=''))[0] != 403: fail('an unlisted host was not refused')
    if get(q, 'POST')[0] != 405: fail('a POST was not refused')
    if get('/__proxy?url=file:///etc/passwd')[0] != 403: fail('a file: address was not refused')
    # the deployable proxy, on Node's fetch
    if shutil.which('node'):
        js = ("const m = await import(%s); const h = m.default.fetch; const at = (u, o) => h(new Request('https://proxy.example/?url=' + encodeURIComponent(u), o));"
              "const a = await at('http://127.0.0.1:%d/data.txt'); const b = await at('http://localhost:%d/data.txt'); const c = await at('http://127.0.0.1:%d/', { method: 'POST' });"
              "console.log(a.status, (await a.text()).trim(), a.headers.get('access-control-allow-origin'), b.status, c.status);") % (json.dumps('file://' + os.path.join(site, 'proxy.mjs')), tp, tp, tp)
        r = subprocess.run(['node', '--input-type=module', '-e', js], capture_output=True, text=True, timeout=30)
        if r.stdout.strip() != '200 proxied-ok * 403 405': fail('proxy.mjs: %r %r' % (r.stdout, r.stderr[-400:]))
    else: print('web_proxy: no Node: proxy.mjs not run')
    if not find_chrome(): print('web_proxy: no Chrome: the page part is skipped'); sys.exit(0)
    r = subprocess.run([sys.executable, '-I', os.path.join(repo, 'tools/web-browser-test'), base + '/', '--wait', '3'], capture_output=True, text=True, timeout=90)
    if 'listed: 200 proxied-ok' not in r.stdout: fail('the page did not get the listed host through the proxy: ' + r.stdout[-800:] + r.stderr[-300:])
    if 'unlisted: refused' not in r.stdout: fail('the page reached an unlisted host: ' + r.stdout[-800:])
finally:
    for p in procs: p.kill()
    shutil.rmtree(tmp, ignore_errors=True)
PY
