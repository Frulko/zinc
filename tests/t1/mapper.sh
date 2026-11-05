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
cut = band(.37, 1); cut["corners"] = [.75, .37, .85, .37, .85, .62, .75, .62]; cut["edge"] = [0, .5, 0, 0, 1]; cut["inset"] = [0, .25, 0, 0]   # outside, a cut brings the far end back: .05 past the edge becomes .025
def moved(top, direction, offset):   # a band .1 wide, a gradient worth .05 of the output, its start moved by .025
    b = band(top, direction); b["corners"] = [.75, top, .85, top, .85, top + .25, .75, top + .25]; b["edge"] = [0, .5, 0, 0, 1]; b["edgeoffset"] = [0, offset, 0, 0]; return b
print(json.dumps({"version": [1], "layers": [band(.05, 0), band(.37, 1), band(.69, 2), cut, moved(.05, 0, .25), moved(.69, 1, -.25)]}))
PY
ZINC_NATIVE=real ZINC_DISPLAY=gl ZINC_DETERMINISTIC=1 ZINC_FRAMES=30 ZINC_SHOT="$tmp/e.bmp" timeout 120 "$ZINC" run "$edges/src/main.ts" -- --port 0 --web off >"$tmp/edges.log" 2>&1
python3 - "$tmp/e.bmp" <<'PY' || fail=1
import struct, sys
b = open(sys.argv[1], "rb").read()
start = struct.unpack("<I", b[10:14])[0]; w, h = struct.unpack("<ii", b[18:26]); depth = struct.unpack("<H", b[28:30])[0] // 8
stride = (w * depth + 3) & ~3
def light(x, y):   # a BMP's rows go from the bottom up
    return b[start + (h - 1 - int(y * h)) * stride + int(x * w) * depth]
want = {"inside": (.175, {.48: 255, .55: 128, .595: 0, .65: 0}), "outside": (.495, {.48: 255, .595: 255, .65: 128, .705: 0}), "both": (.815, {.48: 255, .6: 128, .705: 0}),
        "outside cut": (.495, {.84: 255, .8625: 128, .89: 0}),
        "inside, offset inward": (.175, {.77: 255, .8: 128, .83: 0}), "outside, offset outward": (.815, {.87: 255, .9: 128, .93: 0})}
problems = [f"{name} at x={x}: {light(x, y)}, not {v}" for name, (y, row) in want.items() for x, v in row.items() if abs(light(x, y) - v) > 40]
if problems: print("edge direction: " + "; ".join(problems)); sys.exit(1)
PY
# masks: an ellipse by Bézier handles with a clean edge on the left half, a feathered square on the right
masks="$tmp/masks"; cp -R "$project" "$masks"
python3 - >"$masks/mapping.json" <<'PY'
import json
def half(left): return {"name": ["half"], "source": ["solid"], "color": [1, 1, 1], "corners": [left, 0, left + .5, 0, left + .5, 1, left, 1]}
curved = half(0); curved["mask/0"] = [0, 0, .3, .5, .5, .2, .7, .5, .5, .8]
curved["maskcurve/0"] = [0, .165, 0, -.165, -.11, 0, .11, 0, 0, -.165, 0, .165, .11, 0, -.11, 0]
soft = half(.5); soft["mask/0"] = [.1, 0, .25, .25, .75, .25, .75, .75, .25, .75]
print(json.dumps({"version": [1], "layers": [curved, soft]}))
PY
ZINC_NATIVE=real ZINC_DISPLAY=gl ZINC_DETERMINISTIC=1 ZINC_FRAMES=30 ZINC_SHOT="$tmp/k.bmp" timeout 120 "$ZINC" run "$masks/src/main.ts" -- --port 0 --web off >"$tmp/masks.log" 2>&1
python3 - "$tmp/k.bmp" <<'PY' || fail=1
import struct, sys
b = open(sys.argv[1], "rb").read()
start = struct.unpack("<I", b[10:14])[0]; w, h = struct.unpack("<ii", b[18:26]); depth = struct.unpack("<H", b[28:30])[0] // 8
stride = (w * depth + 3) & ~3
def light(x, y): return b[start + (h - 1 - int(y * h)) * stride + int(x * w) * depth]
problems = []
# surface x / 2 on the left half: outside the diamond of the four points, inside the ellipse through them; then outside the ellipse
if light(.62 / 2, .32) < 215: problems.append(f"a curve does not bulge: {light(.62 / 2, .32)}")
if light(.68 / 2, .25) > 40: problems.append(f"a curve is not cut: {light(.68 / 2, .25)}")
between = lambda x0, x1: sum(1 for x in range(int(x0 * w), int(x1 * w)) if 20 < light(x / w, .5) < 235)
if between(.3, .4) > 4: problems.append(f"the edge of a mask with no feather is {between(.3, .4)} pixels wide")
if between(.55, .7) < w * .03: problems.append(f"a feather is {between(.55, .7)} pixels wide of {w}")
if problems: print("masks: " + "; ".join(problems)); sys.exit(1)
PY
# one canvas on two outputs: a white band over the middle of the canvas fills the right half of the left part, the left half of the right part
parts="$tmp/parts"; cp -R "$project" "$parts"
python3 - >"$parts/mapping.json" <<'PY'
import json
print(json.dumps({"version": [1], "layers": [{"name": ["band"], "source": ["solid"], "color": [1, 1, 1], "corners": [.25, 0, .75, 0, .75, 1, .25, 1]}]}))
PY
for part in "0,0,.5,1 left" ".5,0,.5,1 right"; do
  set -- $part
  ZINC_NATIVE=real ZINC_DISPLAY=gl ZINC_DETERMINISTIC=1 ZINC_FRAMES=30 ZINC_SHOT="$tmp/$2.bmp" timeout 120 "$ZINC" run "$parts/src/main.ts" -- --port 0 --web off --fleet-port 0 --viewport "$1" >"$tmp/$2.log" 2>&1
done
python3 - "$tmp" <<'PY' || fail=1
import struct, sys
def light(name, x):
    b = open(f"{sys.argv[1]}/{name}.bmp", "rb").read()
    start = struct.unpack("<I", b[10:14])[0]; w, h = struct.unpack("<ii", b[18:26]); depth = struct.unpack("<H", b[28:30])[0] // 8
    return b[start + (h // 2) * ((w * depth + 3) & ~3) + int(x * w) * depth]
want = [("left", .25, 0), ("left", .75, 255), ("right", .25, 255), ("right", .75, 0)]
problems = [f"{name} at {x}: {light(name, x)}, not {v}" for name, x, v in want if abs(light(name, x) - v) > 40]
if problems: print("viewport: " + "; ".join(problems)); sys.exit(1)
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
def placed(left, picture):   # under the others, stretched: each band is a quarter of the width
    z = zone(left, "stretch"); y, side, tall = .68, .1125, .2; z["corners"] = [left, y, left + side, y, left + side, y + tall, left, y + tall]; z["picture"] = list(picture); return z
json.dump({"version": [1], "layers": [zone(.01, "cover"), zone(.26, "contain"), zone(.51, "height", (-1, 0, 1)), zone(.76, "width"),
  placed(.01, (.5, 0, 0, 1)), placed(.26, (0, 0, 90, 1)), placed(.51, (0, 0, 0, .5))]}, open(sys.argv[1] + "/mapping.json", "w"))
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
# the picture in its zone: moved half a zone right (empty on the left, its first half on the right), a quarter turn (its left at the top), half its opacity
for name, x, y, c in [("moved, empty", .01 + .1125 * .25, .78, K), ("moved, its first band", .01 + .1125 * .6, .78, R),
                      ("turned, its left", .26 + .1125 * .5, .69, R), ("turned, its right", .26 + .1125 * .5, .87, W),
                      ("half opacity", .51 + .1125 * .9, .78, (128, 128, 128))]:
    got = colour(x, y)
    if max(abs(got[k] - c[k]) for k in range(3)) > 60: problems.append(f"{name}: {got}, not {c}")
if problems: print("fit: " + "; ".join(problems)); sys.exit(1)
PY
# a JavaScript engine loads the project's display driver too (zinc.json "display": "gl", which zinc:mapping draws through), with no ZINC_DISPLAY
# (a deterministic run keeps the host window unless ZINC_DISPLAY asks: this one is not)
ZINC_DETERMINISTIC=0 ZINC_NATIVE=real ZINC_FRAMES=30 timeout 120 "$ZINC" run "$project" --engine quickjs -- --web off >"$tmp/qjs.log" 2>&1 && grep -q ", 3 layers" "$tmp/qjs.log" || { echo "mapper on quickjs: $(tail -c 300 "$tmp/qjs.log")"; fail=1; }
# the app serves its web editor and API by itself: the token, a byte-exact upload, then the scripted editor check
command -v node >/dev/null || { echo "no node: the editor check is skipped"; exit $fail; }
web=$(python3 -c "import socket;s=socket.socket();s.bind(('127.0.0.1',0));print(s.getsockname()[1]);s.close()")
media="$tmp/media"; mkdir -p "$media"
# the frames are only a ceiling if this script dies (its exit kills the app): 1800, half a minute, ended the app before a slow CI runner had finished asking it
ZINC_DETERMINISTIC=0 ZINC_NATIVE=real ZINC_DISPLAY=gl ZINC_FRAMES=100000 "$ZINC" run "$project/src/main.ts" -- --port 0 --web "$web" --media "$media" >"$tmp/app.log" 2>&1 & app=$!
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
# a playing clip moved to another layer by the page: the old layer no longer shows it, the new one does
api -X PUT -d '{"columns":[{"name":"a","cells":[]},{"name":"b","cells":[{},{"label":"Green","source":"solid","color":[0,1,0]}]}],"active":1,"playing":[-1,1],"setPlaying":true}' "http://127.0.0.1:$web/show" >/dev/null; sleep 0.3
api "http://127.0.0.1:$web/state" >"$tmp/s3.json"
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
s3 = load("s3")["layers"]
if s3[0]["source"][0] != "none" or s3[1]["color"][1] != 1 or s3[1]["color"][2] != 0: problems.append(f"a moved clip does not follow: {s3[:2]}")
if load("show3")["active"] != 1: problems.append("a save from the page changes what plays")
if problems: print("; ".join(problems)); sys.exit(1)
PY
# a second mapper follows the first: paired once, it takes the setup, the show, the commands and the time, and comes back after a restart
python3 - "$ZINC" "$project" "$tmp" <<'PY' || fail=1
import json, os, re, shutil, socket, struct, subprocess, sys, time, urllib.request
zinc, project, tmp = sys.argv[1:4]
def free(kind):
    s = socket.socket(socket.AF_INET, kind); s.bind(("127.0.0.1", 0)); p = s.getsockname()[1]; s.close(); return p
env = dict(os.environ, ZINC_DETERMINISTIC="0", ZINC_NATIVE="real", ZINC_DISPLAY="gl")
procs, tokens, web, oscs = {}, {}, {}, {}
def start(name):
    d = f"{tmp}/{name}"
    if not os.path.exists(d):
        shutil.copytree(project, d)
        web[name] = free(socket.SOCK_STREAM)
        oscs[name] = free(socket.SOCK_DGRAM)
    log = f"{d}/run.log"
    procs[name] = subprocess.Popen([zinc, "run", "src/main.ts", "--", "--port", str(oscs[name]), "--web", str(web[name]), "--fleet-port", str(free(socket.SOCK_DGRAM)), "--keys", "link.keys", "--name", name], cwd=d, env=env, stdout=open(log, "w"), stderr=subprocess.STDOUT)
    for _ in range(600):
        m = re.search(r"token=(\S+)", open(log).read())
        if m: tokens[name] = m.group(1); return
        time.sleep(0.1)
    sys.exit(f"{name} did not start: {open(log).read()[-400:]}")
def call(name, path, body=None, method=None):
    r = urllib.request.Request(f"http://127.0.0.1:{web[name]}{path}", data=None if body is None else body.encode(), headers={"x-zinc-token": tokens[name]}, method=method or ("GET" if body is None else "POST"))
    text = urllib.request.urlopen(r, timeout=5).read().decode()
    return json.loads(text) if text else None
def osc(name, *message): call(name, "/osc", json.dumps([list(message)]))
def wait(what, test, seconds=15):
    end = time.time() + seconds
    while time.time() < end:
        if test(): return
        time.sleep(0.1)
    sys.exit(f"the fleet: {what}; master {json.dumps(call('master', '/fleet'))[:400]}; player {json.dumps(call('player', '/fleet'))[:300]}")
try:
    start("master"); start("player")
    port = call("player", "/fleet")["self"]["linkPort"]
    call("player", "/pair/ask", "")
    wait("no code", lambda: "pairing code" in open(f"{tmp}/player/run.log").read())
    code = re.findall(r"pairing code (\d+)", open(f"{tmp}/player/run.log").read())[-1]
    osc("master", "/fleet/add", f"127.0.0.1:{port}", "000000" if code != "000000" else "111111")
    wait("a wrong code is said", lambda: call("master", "/fleet")["problem"] != "")
    if call("master", "/fleet")["devices"]: sys.exit("a wrong code paired")
    osc("master", "/fleet/add", f"127.0.0.1:{port}", code)
    online = lambda: any(d["online"] for d in call("master", "/fleet")["devices"])
    wait("the player is not online", online)
    wait("the player does not report", lambda: call("master", "/fleet")["devices"][0]["fps"] > 0)
    wait("the player has no time", lambda: call("player", "/fleet")["self"]["synced"] and call("player", "/fleet")["self"]["master"] != "")
    me = call("player", "/fleet")["self"]
    if me["masterName"] != "master" or me["rttMs"] > 20: sys.exit(f"the player's clock: {me}")
    opacity = lambda: call("player", "/state")["layers"][0]["opacity"][0]
    osc("master", "/layer/0/opacity", 0.42)
    wait("a command does not arrive", lambda: abs(opacity() - 0.42) < 0.001)
    # a change no command carries: the show, sent whole; then a column runs on both
    show = call("master", "/show")
    show["columns"] = [{"name": "one", "cells": [{"source": "white"}]}, {"name": "two", "cells": [{"source": "red"}]}]
    call("master", "/show", json.dumps(show), "PUT")
    wait("the show does not arrive", lambda: len(call("player", "/show")["columns"]) == 2)
    osc("master", "/column", 1)
    wait("a column does not run on the master", lambda: call("master", "/show")["active"] == 1)
    wait("a column does not run on the player", lambda: call("player", "/show")["active"] == 1)
    osc("master", "/fleet/sidebyside")
    wait("the place does not arrive", lambda: call("player", "/fleet")["self"]["viewport"] == [0.5, 0, 0.5, 1])
    if call("master", "/fleet")["self"]["viewport"] != [0, 0, 0.5, 1]: sys.exit("the master's own place")
    # the media come by themselves, and a film stays on the master's: a column of a file the player does not have yet, then the same name with new content
    A, B = "examples/video/looper/media/02-bars.mp4", "examples/video/looper/media/03-life.mp4"
    def media_on(name):
        path = f"{tmp}/player/media/clip.mp4"
        return os.path.exists(path) and open(path, "rb").read() == open(name, "rb").read()
    def send_media(name):
        r = urllib.request.Request(f"http://127.0.0.1:{web['master']}/media/clip.mp4", data=open(name, "rb").read(), headers={"x-zinc-token": tokens["master"]}, method="POST")
        urllib.request.urlopen(r, timeout=20).read()
    send_media(A)
    show = call("master", "/show")
    show["columns"].append({"name": "film", "cells": [{"media": "clip.mp4"}]})
    call("master", "/show", json.dumps(show), "PUT")
    osc("master", "/column", 2)
    wait("the media does not reach the player", lambda: media_on(A))
    wait("the film does not play on the player", lambda: call("player", "/state")["layers"][0]["media"][0] == "clip.mp4")
    device = lambda: call("master", "/fleet")["devices"][0]
    wait("the film stays away from the master's", lambda: device()["videoMs"] < 60 and device()["videoMs"] > 0 and device()["media"]["left"] == 0, 20)
    send_media(B)
    wait("a changed media does not reach the player", lambda: media_on(B))
    if device()["media"]["problem"] != "": sys.exit(f"the copy says: {device()['media']}")
    # OSC from a desk made for another program: the words of Resolume and Millumin, a bundle, and what the mapper tells back in each one's words
    def pad(b): return b + b"\0" * (4 - len(b) % 4)
    def packet(address, *args):
        tags, body = ",", b""
        for a in args:
            if isinstance(a, str): tags += "s"; body += pad(a.encode())
            elif isinstance(a, float): tags += "f"; body += struct.pack(">f", a)
            else: tags += "i"; body += struct.pack(">i", a)
        return pad(address.encode()) + pad(tags.encode()) + body
    def read(raw):
        end = raw.index(b"\0"); address = raw[:end].decode(); at = (end + 4) & ~3
        end = raw.index(b"\0", at); tags = raw[at + 1:end].decode(); at = (end + 4) & ~3
        out = []
        for t in tags:
            if t == "s": end = raw.index(b"\0", at); out.append(raw[at:end].decode()); at = (end + 4) & ~3
            elif t == "f": out.append(struct.unpack(">f", raw[at:at + 4])[0]); at += 4
            elif t == "i": out.append(struct.unpack(">i", raw[at:at + 4])[0]); at += 4
        return address, out
    def desk():
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); s.bind(("127.0.0.1", 0)); s.settimeout(0.05); return s
    resolume, millumin, native = desk(), desk(), desk()
    to = ("127.0.0.1", oscs["master"])
    def said(sock, address, seconds=5, test=lambda args: True):
        end = time.time() + seconds
        while time.time() < end:
            try: a, args = read(sock.recv(2048))
            except socket.timeout: continue
            if a == address and test(args): return args
        sys.exit(f"nobody said {address}")
    resolume.sendto(packet("/feedback/subscribe", "resolume"), to)
    millumin.sendto(packet("/feedback/subscribe", "millumin"), to)
    native.sendto(packet("/feedback/subscribe"), to)
    said(resolume, "/composition/columns/3/connect", test=lambda a: a == [1])       # told what is on as soon as it asks
    said(millumin, "/millumin/board/launchedColumn", test=lambda a: a == [3, "film"])
    said(native, "/layer/0/time")                                                   # the film's time, while it plays
    resolume.sendto(packet("/composition/layers/1/video/opacity", 0.5), to)
    wait("Resolume's opacity", lambda: abs(opacity() - 0.5) < 0.001)                # on the player too
    said(native, "/layer/0/opacity", test=lambda a: abs(a[0] - 0.5) < 0.001)
    resolume.sendto(packet("/composition/columns/1/connect", 0), to); time.sleep(0.2)   # a button let go does nothing
    if call("master", "/show")["active"] != 2: sys.exit("a button let go launched a column")
    millumin.sendto(packet("/millumin/action/launchColumn", "two"), to)             # by name, and from 1 by number
    said(millumin, "/millumin/board/stoppedColumn", test=lambda a: a == [3, "film"])
    said(millumin, "/millumin/board/launchedColumn", test=lambda a: a == [2, "two"])
    wait("Millumin's column on the player", lambda: call("player", "/show")["active"] == 1)
    bundle = pad(b"#bundle") + b"\0" * 7 + b"\1"
    for message in (packet("/composition/columns/3/connect", 1), packet("/layer/0/opacity", 0.7)): bundle += struct.pack(">i", len(message)) + message
    native.sendto(bundle, to)
    said(resolume, "/composition/layers/1/video/opacity", test=lambda a: abs(a[0] - 0.7) < 0.001)
    said(native, "/column/launched", test=lambda a: a == [2, "film"])
    # the film on command: where the master goes, the player goes; pause holds both, Millumin's words
    millumin.sendto(packet("/index:1/media/speed", 0.5), to)
    def films(): return (device()["videoMs"], call("master", "/fleet")["devices"][0]["online"])
    time.sleep(1.5)
    if device()["videoMs"] > 60: sys.exit(f"the player does not follow a slow film: {device()}")
    millumin.sendto(packet("/index:1/pauseMedia"), to)
    said(native, "/layer/0/paused", test=lambda a: a == [1])
    native.sendto(packet("/layer/0/time", 0.5), to); time.sleep(1)
    if device()["videoMs"] > 40: sys.exit(f"the player does not stay on a film moved while paused: {device()}")
    native.sendto(packet("/transport", "play"), to)
    said(native, "/layer/0/paused", test=lambda a: a == [0])
    native.sendto(packet("/layer/0/speed", 1.0), to)
    resolume.sendto(packet("/composition/layers/1/video/opacity", 1.0), to)
    resolume.sendto(packet("/nothing/of/mine", "?"), to)                            # a question answers whatever the address
    said(resolume, "/composition/layers/1/video/opacity")
    # what the Chataigne project sends is all understood: it was written without a Chataigne to try it
    log = f"{tmp}/master/run.log"
    project_file = json.load(open("examples/video/mapper/chataigne/mapper-control.noisette"))
    before = open(log).read().count("ignored")
    for action in project_file["states"]["items"][0]["processors"]["items"]:
        for step in action.get("consequences", {}).get("items", []):
            args = [a["param"]["value"] for a in step["command"]["argManager"]["items"]]
            native.sendto(packet(step["command"]["parameters"][0]["value"], *args), to)
    time.sleep(0.5)
    if open(log).read().count("ignored") != before: sys.exit("the Chataigne project sends what the mapper ignores: " + open(log).read()[-300:])
    for s in (resolume, millumin, native): s.close()
    # a player that restarts catches up, with no code
    procs["player"].kill(); procs["player"].wait()
    wait("a dead player looks online", lambda: not online())
    osc("master", "/layer/0/opacity", 0.3)
    start("player")
    wait("the player does not come back", online, 40)
    wait("the player did not catch up", lambda: abs(opacity() - 0.3) < 0.001)
    # a master that restarts knows its players
    procs["master"].kill(); procs["master"].wait()
    start("master")
    wait("the master forgot its player", online, 40)
    osc("master", "/fleet/remove", call("master", "/fleet")["devices"][0]["id"])
    wait("a removed player stays", lambda: call("master", "/fleet")["devices"] == [])
finally:
    for p in procs.values(): p.kill()
PY
# the device tells what it runs: an upload shows while it arrives, and is gone after
api "http://127.0.0.1:$web/device" >"$tmp/d0.json"
curl -s -m 20 -o /dev/null --limit-rate 1M -H "x-zinc-token: $token" --data-binary @"$tmp/clip.bin" "http://127.0.0.1:$web/media/slow.bin" & slow=$!
n=0; while [ $n -lt 30 ]; do api "http://127.0.0.1:$web/device" >"$tmp/d1.json"; grep -q 'slow.bin' "$tmp/d1.json" && break; sleep 0.1; n=$((n+1)); done   # on a busy machine it starts late
wait $slow; api "http://127.0.0.1:$web/device" >"$tmp/d2.json"
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
