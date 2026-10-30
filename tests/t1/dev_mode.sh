#!/bin/sh
# zinc dev (ZN-141): edit a file and the running program is replaced within 2 s, a compile error puts the red box on the screen, a fix replaces it; the inspector answers a scripted CDP client; zinc monitor prints telemetry.
# ZN-710: the edit adds a plugin import and the fix takes it away: each version's run prints the plugins it imports (`zinc: plugins: ...`).
cd "$(dirname "$0")/../.." || exit 2
Z="$ZINC"; case "$Z" in /*) ;; *) Z="$PWD/$Z" ;; esac
root=$PWD
t=$(mktemp -d); trap 'kill $dev 2>/dev/null; pkill -f "zinc-dev-test-$$" 2>/dev/null; rm -rf "$t"' EXIT
fail=0
now_ms() { python3 -c 'import time; print(int(time.time()*1000))'; }
pixel() { python3 - "$1" "$2" "$3" "$root" <<'P'
import sys, importlib.machinery, importlib.util
l = importlib.machinery.SourceFileLoader("pd", sys.argv[4] + "/tools/pngdiff"); s = importlib.util.spec_from_loader("pd", l); m = importlib.util.module_from_spec(s); l.exec_module(m)
w, h, b, d = m.dec(sys.argv[1]); x, y = int(sys.argv[2]), int(sys.argv[3]); i = (y * w + x) * b
print(d[i], d[i+1], d[i+2])
P
}
waitfor() { # file pattern seconds
  n=0; while [ $n -lt $(( $3 * 20 )) ]; do grep -q "$2" "$1" 2>/dev/null && return 0; sleep 0.05; n=$((n+1)); done; return 1; }
cd "$t" && "$Z" init app --template game >/dev/null && cd app || exit 2
export ZINC_DEVTOOLS_PORT=0 ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=200000 ZINC_SIZE=64x48 ZINC_SHOT="$t/frame.png" ZINC_SHOT_FRAMES=3
ZINC_STEPS=1 "$Z" dev > "$t/dev.log" 2>&1 &
dev=$!
waitfor "$t/dev.log" "v1 started" 5 || { echo "dev did not start: $(cat "$t/dev.log")"; fail=1; }
waitfor "$t/frame-3.png" "PNG" 5; [ -f "$t/frame-3.png" ] || sleep 1
p1=$(pixel "$t/frame-3.png" 1 1)
# 1. a good edit: the background changes, the new version is on screen within 2 s
t0=$(now_ms)
cp src/main.ts src/main.ts.bak
{ echo "import 'zinc:gestures';"; sed 's/clear(0x101820)/clear(0x204010)/' src/main.ts.bak; } > "$t/main.new" && mv "$t/main.new" src/main.ts
waitfor "$t/dev.log" "v2 started" 2 || { echo "no reload within 2 s: $(cat "$t/dev.log")"; fail=1; }
sleep 0.4
p2=$(pixel "$t/frame-3.png" 1 1)
[ "$p1" != "$p2" ] || { echo "the frame did not change after the edit ($p1)"; fail=1; }
echo "$p2" | grep -q "^32 64 16$" || { echo "new background should be 32 64 16, got $p2"; fail=1; }
echo "reload took $(( $(now_ms) - t0 )) ms (limit 2000 incl. the 0.4 s wait)" >/dev/null
# 2. a compile error: red box
rm -f "$t/frame-3.png"
printf 'let x: number = "not a number";\nconsole.log(x);\n' >> src/main.ts
waitfor "$t/dev.log" "compile error" 2 || { echo "no compile error reported: $(cat "$t/dev.log")"; fail=1; }
waitfor "$t/dev.log" "red box on screen" 2 || { echo "no red box"; fail=1; }
sleep 0.6
rb=$(pixel "$t/frame-3.png" 40 4 2>/dev/null)
[ "$rb" = "220 38 38" ] || { echo "the red box bar should be 220 38 38, got '$rb'"; fail=1; }
# 3. the fix replaces the red box
cp src/main.ts.bak src/main.ts && sed -i.bak 's/clear(0x101820)/clear(0x204010)/' src/main.ts
waitfor "$t/dev.log" "v3 started" 2 || { echo "the fix did not restart the program: $(cat "$t/dev.log")"; fail=1; }
since() { awk -v m="$1" 'index($0, m) {f=1} f' "$t/dev.log"; }   # the log from the last version's start
n=0; while [ $n -lt 100 ] && ! since "v3 started" | grep -q "run        interpreter"; do sleep 0.05; n=$((n+1)); done
since "v2 started" | grep -q "^zinc: plugins: .*gestures" || { echo "v2 imports zinc:gestures, its run does not say so: $(cat "$t/dev.log")"; fail=1; }
since "v3 started" | grep -q "run        interpreter" || { echo "v3 did not run: $(cat "$t/dev.log")"; fail=1; }
since "v3 started" | grep -q "gestures" && { echo "v3 no longer imports zinc:gestures: $(cat "$t/dev.log")"; fail=1; }
# ZINC_DEVTOOLS_PORT=0: the first version binds a free port and tells zinc dev, which names it; the next versions listen on the same one
ip=$(sed -n 's/.*the inspector listens on port \([0-9]*\).*/\1/p' "$t/dev.log" | head -1)
[ -n "$ip" ] && [ "$(grep -c "localhost:$ip)" "$t/dev.log")" -ge 2 ] || { echo "the inspector's port is not reported and kept across versions: $(cat "$t/dev.log")"; fail=1; }
kill $dev; wait $dev 2>/dev/null
# 4. the inspector: a UI program under dev answers a scripted CDP client, on the port its zinc.json gives (a free one, ZN-633)
cd "$t" && "$Z" init ui --template remarkable >/dev/null 2>&1; cd "$t" || exit 2
port=$(python3 "$root/tests/free_ports.py")
mkdir -p uiapp/src && cp "$root/tests/golden/ui-style/radius.tsx" uiapp/src/main.tsx && printf '{"name":"uiapp","entry":"src/main.tsx","plugins":{"devtools":{"port":%s}}}\n' "$port" > uiapp/zinc.json
cd uiapp || exit 2
unset ZINC_SHOT ZINC_SHOT_FRAMES ZINC_DEVTOOLS_PORT
"$Z" dev > "$t/dev2.log" 2>&1 &
dev=$!
waitfor "$t/dev2.log" "with the inspector on port $port" 5 || { echo "no inspector on port $port: $(cat "$t/dev2.log")"; fail=1; }
sleep 1.5
python3 "$root/tools/cdp-probe" "$port" > "$t/cdp.out" 2>&1 || { echo "cdp client: $(cat "$t/cdp.out")"; fail=1; }
kill $dev; wait $dev 2>/dev/null
# 4b. a project on QuickJS ("engine": "quickjs") runs there under dev, circular imports included (examples/fatty)
mkdir -p "$t/qjs/src" && cd "$t/qjs" || exit 2
printf '{"name":"qjs","entry":"src/main.ts","engine":"quickjs"}\n' > zinc.json
printf "import { b } from './b';\nexport function a(): string { return 'a'; }\nconsole.log('cycle ' + b());\n" > src/main.ts
printf "import { a } from './main';\nexport function b(): string { return a() + 'b'; }\n" > src/b.ts
"$Z" dev > "$t/dev3.log" 2>&1 &
dev=$!
waitfor "$t/dev3.log" "cycle ab" 5 || { echo "a quickjs project under dev: $(cat "$t/dev3.log")"; fail=1; }
kill $dev; wait $dev 2>/dev/null
grep -q "inspector on port" "$t/dev3.log" && { echo "a script (no frame loop) got the inspector: $(cat "$t/dev3.log")"; fail=1; }
# 4c. a zinc:stage program on QuickJS gets the inspector, and reads the project's assets from dev's wrapper entry (examples/fatty); port 0
# in zinc.json: the program binds a free port and tells zinc dev, which names it
port=0
mkdir -p "$t/stg/src" "$t/stg/assets" && cd "$t/stg" || exit 2
printf '{"name":"stg","entry":"src/main.ts","engine":"quickjs","plugins":{"devtools":{"port":%s}}}\n' "$port" > zinc.json
printf 'stage asset' > assets/note.txt
printf "import { onFrame } from 'zinc:gfx';\nimport { Stage } from 'zinc:stage';\nimport { readText } from 'zinc:assets';\nconsole.log('read ' + readText('note.txt'));\nconst stage = new Stage();\nonFrame((dt: number) => stage.frame(dt));\n" > src/main.ts
"$Z" dev > "$t/dev4.log" 2>&1 &
dev=$!
waitfor "$t/dev4.log" "read stage asset" 8 || { echo "a zinc:stage project on QuickJS under dev: $(cat "$t/dev4.log")"; fail=1; }
waitfor "$t/dev4.log" "inspector listens on port" 5
port=$(sed -n 's/.*the inspector listens on port \([0-9]*\).*/\1/p' "$t/dev4.log")
[ -n "$port" ] && [ "$port" != 0 ] && waitfor "$t/dev4.log" "localhost:$port)" 5 || { echo "zinc dev does not name the inspector's real port: $(cat "$t/dev4.log")"; fail=1; }
kill $dev; wait $dev 2>/dev/null
# 5. monitor: telemetry lines read from a file
cat > "$t/tele.jsonl" <<'T'
{"type":"hello","ts":1,"seq":0,"payload":{"version":"0.1","platform":"macos","features":["perf"]}}
{"type":"metric","ts":2500,"seq":1,"payload":{"kind":"gauge","name":"temp","value":21.5}}
{"type":"event","ts":3000,"seq":2,"payload":{"name":"button","data":"pin 27"}}
{"type":"state_snapshot","ts":4000,"seq":3,"payload":{"vars":{"hits":3,"x":1.5}}}
plain line
T
"$Z" monitor "$t/tele.jsonl" > "$t/mon.out"
[ "$(cat "$t/mon.out")" = "    0.001 s  hello  platform macos
    2.500 s  gauge   temp = 21.5
    3.000 s  event   button  pin 27
    4.000 s  state   hits=3  x=1.5
plain line" ] || { echo "monitor output:"; cat "$t/mon.out"; fail=1; }
[ $fail -eq 0 ] && echo "dev_mode: ok"
exit $fail
