#!/bin/sh
# examples/agents: OpenCode Go's usage, headless. The fake `opencode auth export` gives a fake Go key among other entries and
# AGENTS_GO_USAGE_FILE stands for opencode.ai's usage route (nothing goes to the network). The Agents panel shows the 5-hour, week
# and month bars, the rate-limited week in red; the status bar shows them short and its hover in full. Settings' toggle turns the
# reading off (kept in settings.json, and a restart asks for no key): « unknown » and why, with the console link, as for each refusal
# (revoked, expired, a route that changed, an answer it does not know, no Go key). The key never shows in the app's data, its
# output, the scene, nor the arguments or the environment of any child. KEEP=dir keeps the frames and the logs.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
export ZINC_HOME="${ZINC_HOME:-$HOME/.zinc}"
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
home="$tmp/home" proj="$tmp/home/proj" KEY=sk-go-FAKE-7f3a9c2e1d
mkdir -p "$home/.config/opencode" "$proj" "$tmp/bin"
echo '{}' > "$home/.config/opencode/opencode.json"
proj=$(cd "$proj" && pwd -P)
for n in claude codex opencode; do ln -s "$(pwd)/tests/data/agents/fake_agent.py" "$tmp/bin/$n"; done   # no real CLI starts
# the route's answers: three windows (the week rate-limited), then each refusal
python3 - "$tmp" <<'PY'
import json, sys, time
t = sys.argv[1]
def at(s): return time.strftime('%Y-%m-%dT%H:%M:%S.000Z', time.gmtime(time.time() + s))
w = lambda st, p, s: {"status": st, "percent": p, "resetsAt": at(s)}
answers = {"ok": (200, json.dumps({"usage": {"rolling": w("ok", 12, 2 * 3600 + 600), "weekly": w("rate-limited", 100, 5 * 86400 + 600),
                                             "monthly": w("ok", 46, 20 * 86400 + 600)}})),
           "revoked": (401, '{"type":"error","error":{"type":"AuthError","message":"Unauthorized"}}'),
           "expired": (401, '{"error":{"type":"authentication_error","code":"api_key_expired","message":"expired"}}'),
           "moved": (404, 'Not Found'), "unknown": (200, '{"limits":[]}')}
for n, (s, b) in answers.items(): open('%s/%s.txt' % (t, n), 'w').write('%d\n%s' % (s, b))
PY

# run <name> <frames> <shots> [env...]: one start of the app on $tmp/<name>.in
run() {
  n=$1 frames=$2 shots=$3; shift 3
  [ -f "$tmp/$n.in" ] || printf '5 move 24 110\n6 down\n7 up\n' > "$tmp/$n.in"   # the Agents panel
  env HOME="$home" PATH="$tmp/bin:$PATH" FAKE_AGENT_LOG="$tmp/agents.log" FAKE_AGENT_ENV="$tmp/env.txt" ZINC_HEADLESS=1 ZINC_SCALE=1 \
    AGENTS_GO_USAGE_FILE="$tmp/ok.txt" "$@" \
    ZINC_INPUT="$tmp/$n.in" ZINC_FRAMES=$frames ZINC_SHOT="$tmp/$n.png" ZINC_SHOT_FRAMES=$shots \
    ZINC_SCENE_DUMP="$tmp/$n.scn" timeout 100 "$Z" run ../examples/agents -- "$proj" > "$tmp/$n.out" 2>&1 \
    || { echo "agents go: the $n run failed: $(tail -5 "$tmp/$n.out")"; exit 1; }
}
# the bars, then the status bar's hover, then Settings' toggle off and the Agents panel again
cat > "$tmp/ok.in" <<'IN'
5 move 24 110
6 down
7 up
10 move 1054 56
11 down
12 up
30000 move 1235 848
30500 move 24 814
30501 down
30502 up
30510 move 297 195
30511 down
30512 up
30600 move 24 110
30601 down
30602 up
IN
run ok 32000 29990,30400,31900
cp "$tmp/agents.log" "$tmp/ok.log"; : > "$tmp/agents.log"
run restart 30000 29990
cp "$tmp/agents.log" "$tmp/restart.log"
for n in revoked expired moved unknown nokey; do
  run $n 30000 29990 AGENTS_DATA="$tmp/data-$n" AGENTS_GO_USAGE_FILE="$tmp/$n.txt" FAKE_GO_KEYS=$([ $n = nokey ] && echo none)
done
printf '5 move 1054 56\n6 down\n7 up\n30000 move 1235 848\n' > "$tmp/hover.in"   # opencode's tab, then the status bar's hover
run hover 30500 30490 AGENTS_DATA="$tmp/data-hover" AGENTS_GO_USAGE_FILE="$tmp/expired.txt"
[ -n "$KEEP" ] && mkdir -p "$KEEP" && cp "$tmp"/*.png "$tmp"/*.scn "$tmp"/*.out "$tmp"/*.log "$KEEP/" 2>/dev/null
fail=0
texts() { tools/scene-texts "$tmp/$1.scn" 2>/dev/null | tr '\n' ' '; }   # one line: a wrapped text reads whole
has() { texts "$1" | grep -qF -- "$2" || { echo "agents go: $1 does not show: $2"; fail=1; }; }
hasnt() { ! texts "$1" | grep -qF -- "$2" || { echo "agents go: $1 shows: $2"; fail=1; }; }
# the windows, the week red and full
has ok-29990 '5-hour session'
has ok-29990 '12% used'
has ok-29990 '100% used · rate-limited'
has ok-29990 'Month'
has ok-29990 '46% used'
python3 - "$tmp/ok-29990.png" <<'PY' || { echo "agents go: the rate-limited week is not red"; fail=1; }
import struct, sys, zlib
d = open(sys.argv[1], 'rb').read(); i = 8; idat = b''
while i < len(d):
    n, t = struct.unpack('>I4s', d[i:i + 8]); body = d[i + 8:i + 8 + n]; i += 12 + n
    if t == b'IHDR': w, h, ct = struct.unpack('>II', body[:8]) + (body[9],)
    elif t == b'IDAT': idat += body
raw = zlib.decompress(idat); bpp = {2: 3, 6: 4}[ct]
# unfiltered rows are not guaranteed: count strongly red pixels after undoing the filters
stride = w * bpp; prev = bytearray(stride); k = 0; red = 0
for y in range(h):
    f = raw[k]; line = bytearray(raw[k + 1:k + 1 + stride]); k += 1 + stride
    for x in range(stride):
        a = line[x - bpp] if x >= bpp else 0; b = prev[x]; c = prev[x - bpp] if x >= bpp else 0
        if f == 1: line[x] = (line[x] + a) & 255
        elif f == 2: line[x] = (line[x] + b) & 255
        elif f == 3: line[x] = (line[x] + (a + b) // 2) & 255
        elif f == 4:
            p = a + b - c; pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
            line[x] = (line[x] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
    prev = line
    if y < 800:   # the side panel's bars, not the status bar
        for x in range(48, 328):
            r, g, bl = line[x * bpp:x * bpp + 3]
            if r > 180 and g < 110 and bl < 110: red += 1
sys.exit(0 if red > 200 else 1)
PY
# the status bar, short and in its hover
has ok-29990 'mo 46%'
has ok-30400 'opencode plan limits'
has ok-30400 '100% used · rate-limited · resets in '
# off: unknown and why, the console link, kept in settings.json; a restart asks for no key
has ok-31900 'Usage limits: unknown (reading them with the Go key is off in Settings)'
has ok-31900 'See them on opencode.ai/console'
hasnt ok-31900 '46% used'
[ "$(cat "$home/.zinc-agents/settings.json")" = '{"limitsRefresh":5,"goUsage":false}' ] || { echo "agents go: the toggle is not kept off: $(cat "$home/.zinc-agents/settings.json")"; fail=1; }
has restart-29990 'Usage limits: unknown (reading them with the Go key is off in Settings)'
grep -q '^opencode \["auth", "export"\]' "$tmp/ok.log" || { echo "agents go: the Go key was not asked with opencode auth export"; fail=1; }
! grep -q '"auth"' "$tmp/restart.log" || { echo "agents go: the key was asked with the toggle off"; fail=1; }
# each refusal: a short reason and the console link
has revoked-29990 'Usage limits: unknown (the Go key was refused or revoked)'
has expired-29990 'Usage limits: unknown (the Go key has expired)'
has moved-29990 'Usage limits: unknown (the usage route has changed (404))'
has unknown-29990 'Usage limits: unknown (the usage route has changed (an answer the app does not know))'
has nokey-29990 'Usage limits: unknown (no active OpenCode Go key in opencode)'
for n in revoked expired moved unknown nokey; do has $n-29990 'See them on opencode.ai/console'; done
has hover-30490 'Unknown: the Go key has expired'
has hover-30490 'limits ?'
# the key stays in memory: not in the data, the output, the scenes, nor a child's arguments or environment
[ -s "$tmp/env.txt" ] || { echo "agents go: no child's environment was recorded"; fail=1; }
# (every file of the run: the home and its settings, the data folders, the outputs, scenes, frames and logs; bin holds the fake)
leaks=$(grep -rlF --exclude-dir=bin -- "$KEY" "$tmp" 2>/dev/null)
[ -z "$leaks" ] || { echo "agents go: the Go key was written or passed on: $leaks"; fail=1; }
[ $fail -eq 0 ] && echo "agents go: ok"
exit $fail
