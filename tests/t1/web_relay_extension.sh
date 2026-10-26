#!/bin/sh
# Zinc Web relay through the Chrome extension (app/web-relay/extension, --browser extension): a headless Chrome loads the extension
# (Extensions.loadUnpacked over the DevTools pipe: branded Chrome ignores --load-extension), its options page is given the relay's port
# and token, it connects, and the relay renders the fixture in the extension's tab (link map, page picture). The extension's port refuses
# a client that is not an extension and an extension with a wrong token. Off (the switch) disconnects it, and the relay goes back to
# headless Chrome after its wait. No network: the fixture is served by python3 on 127.0.0.1.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
command -v curl >/dev/null && command -v python3 >/dev/null || { echo "SKIP: needs curl and python3"; exit 77; }
[ -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ] || [ -n "$CHROME" ] || { echo "SKIP: needs Google Chrome (or CHROME=<path>)"; exit 77; }
tmp=$(mktemp -d); web=; rel=; drv=
trap 'touch "$tmp/done"; [ -n "$drv" ] && wait $drv 2>/dev/null; [ -n "$rel" ] && kill $rel; [ -n "$web" ] && kill $web; wait 2>/dev/null; rm -rf "$tmp"' EXIT
fail=0
free() { python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])'; }
wp=$(free); rp=$(free)
python3 -m http.server "$wp" --bind 127.0.0.1 --directory app/web-relay/fixture >"$tmp/http.log" 2>&1 & web=$!
"$Z" run app/web-relay -- --port "$rp" --data "$tmp/relay" --no-open --browser extension >"$tmp/relay.log" 2>&1 & rel=$!
for i in $(seq 1 100); do grep -q 'waiting for the Chrome extension' "$tmp/relay.log" && curl -s "http://127.0.0.1:$wp/" >/dev/null && break; sleep 0.2; done
grep -q 'waiting for the Chrome extension' "$tmp/relay.log" || { echo "the relay did not start:"; head -20 "$tmp/relay.log"; exit 1; }
token=$(cat "$tmp/relay/relay.token")
R=http://127.0.0.1:$rp
page=http://127.0.0.1:$wp/index.html
get() { curl -s -H "Authorization: Bearer $token" "$@"; }
logged() { for i in $(seq 1 ${2:-100}); do grep -q "$1" "$tmp/relay.log" && return 0; sleep 0.2; done; return 1; }

# the extension's port: a client without an extension's Origin, then an extension with a wrong token
ws() { curl -s -o /dev/null --max-time 2 -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' "$@"; }
ws "http://127.0.0.1:$((rp + 1))/extension?token=$token"
logged 'refused a connection to the extension port (not an extension)' || { echo "a client that is not an extension was not refused"; fail=1; }
ws -H 'Origin: chrome-extension://abc' "http://127.0.0.1:$((rp + 1))/extension?token=nope"
logged 'refused a connection to the extension port (wrong token)' || { echo "a wrong token was not refused"; fail=1; }

# Chrome with the extension, configured through its options page; it stays until $tmp/done
python3 - "$PWD/app/web-relay/extension" "$rp" "$token" "$tmp" >"$tmp/driver.log" 2>&1 <<'PY' & drv=$!
import os, sys, time
sys.path.insert(0, "tools")
from cdp import Chrome
ext, port, token, tmp = sys.argv[1:]
with Chrome(["--enable-unsafe-extension-debugging", "--user-data-dir=" + tmp + "/profile"]) as c:
    m = c._recv(c._send("Extensions.loadUnpacked", {"path": ext}, session=False), 30)
    if not m or "result" not in m: print("loadUnpacked:", m); sys.exit(1)
    eid = m["result"]["id"]
    print("extension", eid, flush=True)
    c.open("chrome-extension://%s/options.html?port=%s&token=%s" % (eid, port, token))
    while not os.path.exists(tmp + "/off") and not os.path.exists(tmp + "/done"): time.sleep(0.2)
    if os.path.exists(tmp + "/off"): print("off:", c.eval("chrome.storage.local.set({ enabled: false }).then(() => 'ok')"), flush=True)
    while not os.path.exists(tmp + "/done"): time.sleep(0.2)
PY
logged 'the Chrome extension connected' 150 || { echo "the extension did not connect:"; cat "$tmp/driver.log"; tail -5 "$tmp/relay.log"; exit 1; }

# a page rendered in the extension's tab: the link map and a page picture
j=$(get "$R/render?url=$page&w=1620&h=1800")
echo "$j" | python3 -c '
import json, sys
j = json.load(sys.stdin)
hrefs = [l[4] for l in j["links"]]
assert j["width"] == 1620 and j["page"] == 1800 and j["height"] > 3 * 1800, j
assert len(hrefs) == 2 and hrefs[0].endswith("/next.html"), hrefs
' || { echo "render through the extension: $j"; fail=1; }
grep -q "rendering in the user's Chrome (extension)" "$tmp/relay.log" || { echo "the page was not rendered through the extension:"; tail -5 "$tmp/relay.log"; fail=1; }
grep -q 'relay: starting Chrome' "$tmp/relay.log" && { echo "the relay started headless Chrome although the extension was there"; fail=1; }
get -o "$tmp/p1.png" "$R/shot?url=$page&w=1620&h=1800&x=0&y=1800"
s=$(python3 -c 'import struct, sys; d = open(sys.argv[1], "rb").read(24); print("%dx%d" % struct.unpack(">II", d[16:24]) if d[:8] == b"\x89PNG\r\n\x1a\n" else "not-png")' "$tmp/p1.png")
[ "$s" = 1620x1800 ] || { echo "page 2 through the extension: $s"; fail=1; }

# Off: the extension leaves, the next page waits for it, then headless Chrome renders it
touch "$tmp/off"
logged 'the Chrome extension left' || { echo "Off did not disconnect the extension:"; cat "$tmp/driver.log"; fail=1; }
get "$R/render?url=$page&w=1620&h=1800" | grep -q '"links"' || { echo "no page after the extension left"; fail=1; }
grep -q 'no Chrome extension connected in 3 s: headless Chrome until it does' "$tmp/relay.log" && grep -q 'relay: starting Chrome' "$tmp/relay.log" \
  || { echo "the relay did not fall back to headless Chrome:"; tail -5 "$tmp/relay.log"; fail=1; }

[ $fail -eq 0 ] && echo "web relay extension: ok"
exit $fail
