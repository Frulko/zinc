#!/bin/sh
# examples/video/mapper (ZN-117): zinc:mapping on the display-gl driver draws the same frame as the prototype (tests/golden/examples/proto/video-mapper-gl-30.png, GL output of
# the prototype's build, compared with tools/glcompare: under 1% of the pixels more than 24 off), and the app serves its web editor's API (services/web.ts).
cd "$(dirname "$0")/../.." || exit 2
command -v python3 >/dev/null || { echo "skipped: no python3"; exit 77; }
tmp=$(mktemp -d); trap 'kill $app 2>/dev/null; rm -rf "$tmp"' EXIT
export ZINC_HOME=${ZINC_HOME:-$tmp/home}
fail=0
# a copy of the project: a run saves its setup and its token in its folder, and starts from a saved setup when there is one
project="$tmp/mapper"; mkdir -p "$project"; cp -R examples/video/mapper/src examples/video/mapper/zinc.json "$project/"
ZINC_NATIVE=real ZINC_DISPLAY=gl ZINC_DETERMINISTIC=1 ZINC_FRAMES=30 ZINC_SHOT="$tmp/m.bmp" timeout 120 "$ZINC" run "$project/src/main.ts" -- --web off >"$tmp/gl.log" 2>&1
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
ZINC_DETERMINISTIC=0 ZINC_NATIVE=real ZINC_FRAMES=30 timeout 120 "$ZINC" run "$project" --engine quickjs -- --web off >"$tmp/qjs.log" 2>&1 && grep -q ", 3 layers" "$tmp/qjs.log" || { echo "mapper on quickjs: $(tail -c 300 "$tmp/qjs.log")"; fail=1; }
# the app serves its web editor and API by itself: the token, a byte-exact upload, then the scripted editor check
command -v node >/dev/null || { echo "no node: the editor check is skipped"; exit $fail; }
web=$(python3 -c "import socket;s=socket.socket();s.bind(('127.0.0.1',0));print(s.getsockname()[1]);s.close()")
media="$tmp/media"; mkdir -p "$media"
ZINC_NATIVE=real ZINC_DISPLAY=gl ZINC_FRAMES=1200 "$ZINC" run "$project/src/main.ts" -- --port 0 --web "$web" --media "$media" >"$tmp/app.log" 2>&1 & app=$!
n=0; while [ $n -lt 600 ] && ! grep -q "editor at" "$tmp/app.log"; do sleep 0.1; n=$((n+1)); done   # the app compiles first (a minute on a CI runner)
url=$(sed -n 's/^mapper: editor at //p' "$tmp/app.log")
token=${url##*token=}
[ -n "$token" ] || { echo "the app prints no editor address: $(tail -c 300 "$tmp/app.log")"; exit 1; }
[ "$(curl -s -m 2 -o /dev/null -w '%{http_code}' "http://127.0.0.1:$web/state")" = 401 ] || { echo "the API is reachable without the token"; fail=1; }
head -c 3000000 /dev/urandom >"$tmp/clip.bin"
curl -s -m 20 -o /dev/null -H "x-zinc-token: $token" --data-binary @"$tmp/clip.bin" "http://127.0.0.1:$web/media/clip.bin"
cmp -s "$tmp/clip.bin" "$media/clip.bin" || { echo "an upload does not arrive byte for byte"; fail=1; }
[ "$(curl -s -m 2 -o /dev/null -w '%{http_code}' -H "x-zinc-token: $token" --data-binary x "http://127.0.0.1:$web/media/..%2Fevil")" = 400 ] || { echo "a media name with a path is accepted"; fail=1; }
# no QR code at hand: anyone can ask for the code on screen, only that code gives the token, and three wrong ones close it
post() { curl -s -m 3 -o /dev/null -w '%{http_code}' -d "$2" "http://127.0.0.1:$web$1"; }
[ "$(post /pair/ask '')" = 200 ] || { echo "a code cannot be asked for"; fail=1; }
n=0; while [ $n -lt 30 ] && ! grep -q "pairing code" "$tmp/app.log"; do sleep 0.1; n=$((n+1)); done
pairing=$(sed -n 's/^mapper: pairing code //p' "$tmp/app.log" | tail -1)
[ "$(post /pair 000000)" = 403 ] || { echo "a wrong code is not refused"; fail=1; }
curl -s -m 3 -d "$pairing" "http://127.0.0.1:$web/pair" | grep -q "\"$token\"" || { echo "the code on screen gives no token ($pairing)"; fail=1; }
[ "$(post /pair "$pairing")" = 403 ] || { echo "a code works twice"; fail=1; }
# the show: a clip fires alone, a column empties the layers it has no clip for, what plays survives what the page saves
api() { curl -s -m 3 -H "x-zinc-token: $token" "$@"; }
api -X PUT -d '{"columns":[{"name":"a","cells":[{"label":"Red","source":"solid","color":[1,0,0]},{"label":"Blue","source":"solid","color":[0,0,1]}]},{"name":"b","cells":[{"label":"Green","source":"solid","color":[0,1,0]},null]}]}' "http://127.0.0.1:$web/show"
api -d '[["/add","pattern","one"],["/add","pattern","two"],["/cell",0,1]]' "http://127.0.0.1:$web/osc" >/dev/null; sleep 0.3
api "http://127.0.0.1:$web/state" >"$tmp/s1.json"; api "http://127.0.0.1:$web/show" >"$tmp/show1.json"
api -d '[["/column",1]]' "http://127.0.0.1:$web/osc" >/dev/null; sleep 0.3
api "http://127.0.0.1:$web/state" >"$tmp/s2.json"; api "http://127.0.0.1:$web/show" >"$tmp/show2.json"
api -X PUT -d '{"columns":[]}' "http://127.0.0.1:$web/show"; api "http://127.0.0.1:$web/show" >"$tmp/show3.json"
python3 - "$tmp" <<'PY' || fail=1
import json, sys
t = sys.argv[1]; load = lambda n: json.load(open(f"{t}/{n}.json"))
s1, s2 = load("s1")["layers"], load("s2")["layers"]
n = len(s1) - 2   # the project's own layers come first; the cells above are for layers 0 and 1
problems = []
if s1[1]["source"][0] != "solid" or s1[1]["color"][2] != 1: problems.append(f"/cell does not play its clip: {s1[1]}")
if load("show1")["playing"][1] != 0: problems.append(f"/cell is not remembered: {load('show1')}")
if s2[0]["color"][1] != 1: problems.append(f"/column does not play its clip: {s2[0]}")
if s2[1]["source"][0] != "none": problems.append(f"/column does not empty a layer with no clip: {s2[1]}")
if load("show2")["active"] != 1: problems.append("/column is not remembered")
if load("show3")["active"] != 1: problems.append("a save from the page changes what plays")
if problems: print("; ".join(problems)); sys.exit(1)
PY
node examples/video/mapper/tests/editor-check.mjs "http://127.0.0.1:$web/?token=$token" >"$tmp/check.log" 2>&1
grep -q "^ok:" "$tmp/check.log" || { echo "the scripted editor check fails: $(tail -c 600 "$tmp/check.log") / app: $(tail -c 300 "$tmp/app.log")"; fail=1; }
exit $fail
