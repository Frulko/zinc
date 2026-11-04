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
# a side's gradient goes inside, outside the surface or across its edge: one white band of each, its right side at x = .6, a gradient worth .1 of the output
edges="$tmp/edges"; cp -R "$project" "$edges"
python3 - >"$edges/mapping.json" <<'PY'
import json
def band(top, direction):
    return {"name": ["band"], "source": ["solid"], "color": [1, 1, 1], "corners": [.2, top, .6, top, .6, top + .25, .2, top + .25], "edge": [0, .25, 0, 0, 1], "edgedir": [0, direction, 0, 0]}
print(json.dumps({"version": [1], "layers": [band(.05, 0), band(.37, 1), band(.69, 2)]}))
PY
ZINC_NATIVE=real ZINC_DISPLAY=gl ZINC_DETERMINISTIC=1 ZINC_FRAMES=30 ZINC_SHOT="$tmp/e.bmp" timeout 120 "$ZINC" run "$edges/src/main.ts" -- --port 0 --web off >"$tmp/edges.log" 2>&1
python3 - "$tmp/e.bmp" <<'PY' || fail=1
import struct, sys
b = open(sys.argv[1], "rb").read()
start = struct.unpack("<I", b[10:14])[0]; w, h = struct.unpack("<ii", b[18:26]); depth = struct.unpack("<H", b[28:30])[0] // 8
stride = (w * depth + 3) & ~3
def light(x, y):   # a BMP's rows go from the bottom up
    return b[start + (h - 1 - int(y * h)) * stride + int(x * w) * depth]
want = {"inside": (.175, {.48: 255, .55: 128, .595: 0, .65: 0}), "outside": (.495, {.48: 255, .595: 255, .65: 128, .705: 0}), "both": (.815, {.48: 255, .6: 128, .705: 0})}
problems = [f"{name} at x={x}: {light(x, y)}, not {v}" for name, (y, row) in want.items() for x, v in row.items() if abs(light(x, y) - v) > 40]
if problems: print("edge direction: " + "; ".join(problems)); sys.exit(1)
PY
# a picture 2:1 of four bands (red, green, blue, white) in square zones: what each fit shows of it
fits="$tmp/fits"; cp -R "$project" "$fits"; mkdir -p "$fits/media"
python3 - "$fits" <<'PY'
import json, struct, sys, zlib
w, h = 200, 100
bands = [(255, 0, 0), (0, 255, 0), (0, 0, 255), (255, 255, 255)]
row = b"\0" + b"".join(bytes(bands[x * 4 // w]) for x in range(w))
chunk = lambda kind, data: struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
open(sys.argv[1] + "/media/bands.png", "wb").write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(row * h)) + chunk(b"IEND", b""))
def zone(left, fit, frame=(0, 0, 1)):
    x, y, side, tall = left, .25, .225, .4   # 16:9: square
    return {"name": ["z"], "media": ["bands.png"], "fit": [fit], "frame": list(frame), "corners": [x, y, x + side, y, x + side, y + tall, x, y + tall]}
json.dump({"version": [1], "layers": [zone(.01, "cover"), zone(.26, "contain"), zone(.51, "height", (-1, 0, 1)), zone(.76, "width")]}, open(sys.argv[1] + "/mapping.json", "w"))
PY
ZINC_NATIVE=real ZINC_DISPLAY=gl ZINC_DETERMINISTIC=1 ZINC_FRAMES=30 ZINC_SHOT="$tmp/f.bmp" timeout 120 "$ZINC" run "$fits/src/main.ts" -- --port 0 --web off >"$tmp/fits.log" 2>&1
python3 - "$tmp/f.bmp" <<'PY' || fail=1
import struct, sys
b = open(sys.argv[1], "rb").read()
start = struct.unpack("<I", b[10:14])[0]; w, h = struct.unpack("<ii", b[18:26]); depth = struct.unpack("<H", b[28:30])[0] // 8
stride = (w * depth + 3) & ~3
def colour(x, y):
    at = start + (h - 1 - int(y * h)) * stride + int(x * w) * depth
    return (b[at + 2], b[at + 1], b[at])
R, G, B, W, K = (255, 0, 0), (0, 255, 0), (0, 0, 255), (255, 255, 255), (0, 0, 0)
Y = .45; SIDE = .225; TOP = .27
want = [("cover middle", .01, Y, G, 0.1), ("cover middle", .01, Y, B, 0.9),   # the middle half: green then blue
        ("contain whole", .26, Y, R, 0.05), ("contain whole", .26, Y, W, 0.95), ("contain bar", .26, TOP, K, 0.5),
        ("height at the start", .51, Y, R, 0.1), ("height at the start", .51, Y, G, 0.9),   # the first half
        ("width whole", .76, Y, R, 0.05), ("width whole", .76, Y, W, 0.95)]
problems = []
for name, left, y, c, along in want:
    got = colour(left + SIDE * along, y)
    if max(abs(got[k] - c[k]) for k in range(3)) > 60: problems.append(f"{name} at {along}: {got}, not {c}")
if problems: print("fit: " + "; ".join(problems)); sys.exit(1)
PY
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
# the device tells what it runs: an upload shows while it arrives, and is gone after
api "http://127.0.0.1:$web/device" >"$tmp/d0.json"
curl -s -m 20 -o /dev/null --limit-rate 1M -H "x-zinc-token: $token" --data-binary @"$tmp/clip.bin" "http://127.0.0.1:$web/media/slow.bin" & slow=$!
sleep 1; api "http://127.0.0.1:$web/device" >"$tmp/d1.json"; wait $slow; api "http://127.0.0.1:$web/device" >"$tmp/d2.json"
python3 - "$tmp" <<'PY' || fail=1
import json, sys
t = sys.argv[1]; load = lambda n: json.load(open(f"{t}/{n}.json"))
d0, d1, d2 = load("d0"), load("d1"), load("d2")
problems = []
if d0["tasks"] != [] or not d0["fps"] or not d0["system"] or not d0["totalMemory"]: problems.append(f"no device facts: {d0}")
if not d1["tasks"] or d1["tasks"][0]["name"] != "slow.bin" or not 0 < d1["tasks"][0]["done"] < d1["tasks"][0]["total"]: problems.append(f"an upload is not followed: {d1}")
if d2["tasks"] != [] or d2["mediaFiles"] != d0["mediaFiles"] + 1: problems.append(f"an upload does not end: {d2}")
if problems: print("device: " + "; ".join(problems)); sys.exit(1)
PY
# the history: a burst of commands is one action, firing a clip is none, undo and redo come back, a removed layer returns
at() { sleep 1.1; api "http://127.0.0.1:$web/history"; }
step() { api -X POST "http://127.0.0.1:$web/history/$1" >/dev/null; api "http://127.0.0.1:$web/state"; }
api -X PUT -d '{"columns":[{"name":"a","cells":[{"label":"Red","source":"solid","color":[1,0,0]},{"label":"Blue","source":"solid","color":[0,0,1]}]}]}' "http://127.0.0.1:$web/show"
at >"$tmp/h0.json"
api -d '[["/layer/0/corner",0,0.11,0.12],["/layer/0/corner",1,0.61,0.12]]' "http://127.0.0.1:$web/osc" >/dev/null; api -d '[["/layer/0/corner",1,0.62,0.12]]' "http://127.0.0.1:$web/osc" >/dev/null
at >"$tmp/h1.json"
api -d '[["/cell",0,1]]' "http://127.0.0.1:$web/osc" >/dev/null
at >"$tmp/h2.json"
step undo >"$tmp/u.json"; step redo >"$tmp/r.json"
api -d '[["/remove",0]]' "http://127.0.0.1:$web/osc" >/dev/null
at >"$tmp/h3.json"
step undo >"$tmp/back.json"
python3 - "$tmp" <<'PY' || fail=1
import json, sys
t = sys.argv[1]; load = lambda n: json.load(open(f"{t}/{n}.json"))
h0, h1, h2, h3 = load("h0"), load("h1"), load("h2"), load("h3")
problems = []
if len(h1["entries"]) != len(h0["entries"]) + 1 or "corners" not in h1["entries"][-1]: problems.append(f"a burst is not one action: {h1}")
if h2 != h1: problems.append(f"firing a clip is an action: {h2}")
if abs(load("u")["layers"][0]["corners"][0] - 0.11) < 1e-3: problems.append("undo does not bring the corner back")
if abs(load("r")["layers"][0]["corners"][0] - 0.11) > 1e-3: problems.append("redo does not bring the corner again")
if h3["entries"][-1] != "Layer removed": problems.append(f"no entry for a removed layer: {h3}")
if len(load("back")["layers"]) != len(load("r")["layers"]) or load("back")["layers"][0]["name"] != load("r")["layers"][0]["name"]: problems.append("undo does not bring a removed layer back")
if problems: print("history: " + "; ".join(problems)); sys.exit(1)
PY
node examples/video/mapper/tests/editor-check.mjs "http://127.0.0.1:$web/?token=$token" >"$tmp/check.log" 2>&1
grep -q "^ok:" "$tmp/check.log" || { echo "the scripted editor check fails: $(tail -c 600 "$tmp/check.log") / app: $(tail -c 300 "$tmp/app.log")"; fail=1; }
exit $fail
