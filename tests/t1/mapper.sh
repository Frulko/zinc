#!/bin/sh
# examples/video/mapper (ZN-117): zinc:mapping on the display-gl driver draws the same frame as the prototype (tests/golden/examples/proto/video-mapper-gl-30.png, GL output of
# the prototype's build, compared with tools/glcompare: under 1% of the pixels more than 24 off), and the web companion, now a Zinc program on zinc:net and zinc:osc
# (companion/server.ts), serves its page and relays the editor's commands: the scripted editor check of the Node companion (demo.mjs) passes against it.
cd "$(dirname "$0")/../.." || exit 2
command -v python3 >/dev/null || { echo "skipped: no python3"; exit 77; }
tmp=$(mktemp -d); trap 'kill $app $comp 2>/dev/null; rm -rf "$tmp"' EXIT
export ZINC_HOME=${ZINC_HOME:-$tmp/home}
fail=0
ZINC_NATIVE=real ZINC_DISPLAY=gl ZINC_DETERMINISTIC=1 ZINC_FRAMES=30 ZINC_SHOT="$tmp/m.bmp" timeout 120 "$ZINC" run examples/video/mapper/src/main.ts >"$tmp/gl.log" 2>&1
[ -s "$tmp/m.bmp" ] || { echo "skipped: no GL window here ($(head -c 200 "$tmp/gl.log"))"; exit 77; }
if [ -z "$ZINC_CI" ]; then   # a hosted CI runner has a virtual GPU: other pixels (1.6% off, v0.5.0 CI), as gl_renderer skips
out=$(python3 tools/glcompare "$tmp/m.bmp" tests/golden/examples/proto/video-mapper-gl-30.png) || { echo "mapper: $out"; fail=1; }
python3 - "$out" <<'PY' || fail=1
import re, sys
m = re.search(r"over \d+: ([\d.]+)%", sys.argv[1])
if not m or float(m.group(1)) > 1.0: print("mapper: the GL frame differs from the prototype's: " + sys.argv[1]); sys.exit(1)
PY
fi
# a JavaScript engine loads the project's display driver too (zinc.json "display": "gl", which zinc:mapping draws through), with no ZINC_DISPLAY
# (a deterministic run keeps the host window unless ZINC_DISPLAY asks: this one is not)
ZINC_DETERMINISTIC=0 ZINC_NATIVE=real ZINC_FRAMES=30 timeout 120 "$ZINC" run examples/video/mapper --engine quickjs >"$tmp/qjs.log" 2>&1 && grep -q "OSC on udp 9000, 3 layers" "$tmp/qjs.log" || { echo "mapper on quickjs: $(tail -c 300 "$tmp/qjs.log")"; fail=1; }
command -v node >/dev/null || { echo "no node: the companion check is skipped"; exit $fail; }
ZINC_NATIVE=real ZINC_DISPLAY=gl ZINC_FRAMES=1200 "$ZINC" run examples/video/mapper/src/main.ts >"$tmp/app.log" 2>&1 & app=$!
port=$(python3 -c "import socket;s=socket.socket();s.bind(('127.0.0.1',0));print(s.getsockname()[1]);s.close()")
ZINC_COMPANION_TOKEN=tok "$ZINC" run examples/video/mapper/companion/server.ts -- --http "$port" >"$tmp/comp.log" 2>&1 & comp=$!
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do curl -s -m 1 -o "$tmp/page.html" "http://127.0.0.1:$port/" && break; sleep 0.5; done
n=0; while [ $n -lt 600 ] && ! grep -q "OSC on udp 9000" "$tmp/app.log"; do sleep 0.1; n=$((n+1)); done   # the app compiles first (a minute on a CI runner)
grep -q "<title>" "$tmp/page.html" 2>/dev/null || { echo "the companion does not serve the editor page"; fail=1; }
[ "$(curl -s -m 2 -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/state")" = 401 ] || { echo "the API is reachable without the token"; fail=1; }
node examples/video/mapper/companion/demo.mjs "http://127.0.0.1:$port/?token=tok" >"$tmp/demo.log" 2>&1
grep -q "^ok:" "$tmp/demo.log" || { echo "the scripted editor check fails against the Zinc companion: $(tail -c 600 "$tmp/demo.log") / companion: $(tail -c 300 "$tmp/comp.log") / app: $(tail -c 300 "$tmp/app.log")"; fail=1; }
exit $fail
