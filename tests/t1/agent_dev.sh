#!/bin/sh
# zinc dev --device (ZN-729.03), on the loopback interface: a project that packs its assets runs on the device and its output comes back;
# a saved source file is running there (its new line read here) and only the program was sent; a saved asset reaches the running program
# without a restart (assets.onReload reads the new text); a compile error is the red box on the device, the diagnostics in the program it
# runs and its bar on the frame it draws; the next good save replaces it, with the new asset in its packs; the program ends with the
# session and the agent keeps its app (ZN-820), not the session's files. Prints the time from a save to the new version's first line. Skips (77) without python3.
cd "$(dirname "$0")/../.." || exit 2
command -v python3 >/dev/null 2>&1 || exit 77
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
root=$PWD
tmp=$(mktemp -d)
D="$tmp/device" W="$tmp/work" name="zn-d$$" fail=0
bad() { echo "FAIL: $*"; fail=1; }
cleanup() { kill $dpid $apid 2>/dev/null; wait $dpid $apid 2>/dev/null; rm -rf "$tmp"; }
trap cleanup EXIT
now_ms() { python3 -c 'import time; print(int(time.time()*1000))'; }
until_grep() { n=0; while [ $n -lt 200 ] && ! grep -q "$1" "$2" 2>/dev/null; do sleep 0.05; n=$((n+1)); done; grep -q "$1" "$2" 2>/dev/null; }
log="$tmp/dev.log"

# the device: headless, a frame of what it draws kept (the red box)
ZINC_HOME="$D" ZINC_HEADLESS=1 ZINC_REALTIME=1 ZINC_FRAMES=100000000 ZINC_SHOT="$tmp/shot.png" ZINC_SHOT_FRAMES=3 \
  "$Z" agent --bind 127.0.0.1 --port 0 --no-mdns --name "$name" > "$tmp/agent.log" 2>&1 & apid=$!
until_grep "pairing code" "$tmp/agent.log" || { echo "the agent did not start: $(cat "$tmp/agent.log")"; exit 1; }
port=$(sed -n 's/.*listening on 127.0.0.1:\([0-9]*\).*/\1/p' "$tmp/agent.log")
ZINC_HOME="$W" "$Z" device pair "127.0.0.1:$port" "$(sed -n 's/.*pairing code: \([0-9]*\).*/\1/p' "$tmp/agent.log")" > /dev/null || { echo "pairing failed"; exit 1; }

P="$tmp/devd"
mkdir -p "$P/src" "$P/assets"
printf '{"name":"devd","entry":"src/main.ts","assets":{"dir":"assets","rules":[{"match":"*.txt","as":"copy"}]}}\n' > "$P/zinc.json"
printf 'first note' > "$P/assets/note.txt"
cat > "$P/src/main.ts" <<'TS'
import * as assets from 'zinc:assets';
console.log('one: ' + assets.readText('note.txt'));
assets.onReload('note.txt', (name: string) => { console.log('reloaded: ' + assets.readText(name)); });
setInterval(() => {}, 1000);
TS

ZINC_HOME="$W" "$Z" dev "$P" --device "$name" > "$log" 2>&1 & dpid=$!   # directly: $! must be the process to end
until_grep "^one: first note" "$log" || { echo "the project did not start on the device: $(cat "$log" "$tmp/agent.log")"; exit 1; }
grep -q "v1 started on the device" "$log" || bad "no v1: $(cat "$log")"

# a saved source file: its line comes back from the device, and the program alone was sent
sed 's/one: /two: /' "$P/src/main.ts" > "$tmp/main.new"
t0=$(now_ms); mv "$tmp/main.new" "$P/src/main.ts"
until_grep "^two: first note" "$log" || bad "the saved source is not running on the device: $(cat "$log")"
ms=$(( $(now_ms) - t0 ))
[ "$ms" -le 5000 ] || bad "the saved source ran $ms ms after the save"   # under a second on a quiet machine; the bound is for a loaded one
sed -n '/v1 started/,$p' "$log" | grep -q "zinc dev: 1 file(s)" || bad "the save did not send the program alone: $(cat "$log")"

# a saved asset: the running program reads the new text, and it was not restarted
printf 'second note' > "$tmp/note.new"; mv "$tmp/note.new" "$P/assets/note.txt"
until_grep "^reloaded: second note" "$log" || bad "the saved asset did not reach the running program: $(cat "$log")"
grep -q "v3 started" "$log" && bad "the asset restarted the program: $(cat "$log")"

# a compile error: the red box runs on the device with the diagnostics, its bar on the frame it draws
cp "$P/src/main.ts" "$tmp/main.good"
printf 'let x: number = "not a number";\n' >> "$P/src/main.ts"
until_grep "red box on the device" "$log" || bad "no red box: $(cat "$log")"
grep -q "compile error: .*Z0103" "$log" || bad "the diagnostics are not said here: $(cat "$log")"
grep -aq "Z0103" "$D"/agent/dev/*/program.zbc || bad "the program on the device does not hold the diagnostics"
ls "$D"/agent/dev/*/zinc.json > /dev/null 2>&1 || bad "the red box took the project's files away: they would be sent again at the fix"
n=0; while [ $n -lt 100 ] && [ ! -s "$tmp/shot-3.png" ]; do sleep 0.05; n=$((n+1)); done; sleep 0.2
bar=$(python3 - "$root" "$tmp/shot-3.png" 2>&1 <<'PY'
import sys, importlib.machinery, importlib.util
l = importlib.machinery.SourceFileLoader("pd", sys.argv[1] + "/tools/pngdiff"); s = importlib.util.spec_from_loader("pd", l); m = importlib.util.module_from_spec(s); l.exec_module(m)
w, h, b, d = m.dec(sys.argv[2]); i = (4 * w + 40) * b
print(d[i], d[i + 1], d[i + 2])
PY
)
[ "$bar" = "220 38 38" ] || bad "the red box's bar should be 220 38 38 on the device's frame, got '$bar'"

# the next good save replaces it; the asset saved meanwhile is in its packs
sed 's/two: /three: /' "$tmp/main.good" > "$tmp/main.new"; mv "$tmp/main.new" "$P/src/main.ts"
until_grep "^three: second note" "$log" || bad "the good save did not replace the red box: $(cat "$log")"
grep -q "v3 started on the device" "$log" || bad "no v3: $(cat "$log")"

# the end of the session ends the program, and the agent keeps nothing of it
kill $dpid; wait $dpid 2>/dev/null
n=0; while [ $n -lt 100 ] && [ -n "$(ls "$D/agent/dev" 2>/dev/null)" ]; do sleep 0.05; n=$((n+1)); done
[ -z "$(ls "$D/agent/dev" 2>/dev/null)" ] || bad "the agent kept the session's files: $(ls "$D/agent/dev")"
# ...but its app, which the player's launcher lists marked DEV and starts again through run.sh (ZN-820)
meta=$(cat "$D/agent/apps/devd/app.json" 2>&1)
case $meta in *'"name":"devd","title":"devd"'*'"dev":true'*) ;; *) bad "app.json of the dev session's app: $meta";; esac
ZINC_ENGINE="$Z" ZINC_HOME="$W" sh "$D/agent/apps/devd/run.sh" > "$tmp/kept.log" 2>&1 & kpid=$!   # run.sh execs zinc: $! is the program
until_grep "^three: second note" "$tmp/kept.log" || bad "the kept app does not start again: $(cat "$tmp/kept.log")"
kill $kpid; wait $kpid 2>/dev/null
pgrep -f "$D/agent/dev/" > /dev/null && bad "the program outlived its session"

ZINC_HOME="$W" "$Z" dev "$P" --device nosuch > "$tmp/nosuch" 2>&1 && bad "a device that is not paired was accepted"
grep -q "no paired device named nosuch" "$tmp/nosuch" || bad "not paired: $(cat "$tmp/nosuch")"

# a project on QuickJS ("engine": "quickjs", circular imports the typed engines refuse, as examples/fatty has) runs its sources there
Q="$tmp/devq"; mkdir -p "$Q/src"
printf '{"name":"devq","entry":"src/main.ts","engine":"quickjs"}\n' > "$Q/zinc.json"
printf "import { b } from './b';\nexport const a = 'a';\nconsole.log('quickjs: ' + a + b());\n" > "$Q/src/main.ts"
printf "import { a } from './main';\nexport function b() { return a + 'b'; }\n" > "$Q/src/b.ts"
ZINC_HOME="$W" "$Z" dev "$Q" --device "$name" > "$tmp/q.log" 2>&1 & qpid=$!
until_grep "^quickjs: aab" "$tmp/q.log" || bad "the QuickJS project did not run on the device: $(cat "$tmp/q.log")"
kill $qpid; wait $qpid 2>/dev/null

# an agent that stops takes the program with it, and zinc dev says the device is gone
ZINC_HOME="$W" "$Z" dev "$P" --device "$name" > "$log" 2>&1 & dpid=$!
until_grep "^three: second note" "$log" || bad "the second session did not start: $(cat "$log")"
kill $apid; wait $apid 2>/dev/null
until_grep "the session with the device ended" "$log" || bad "zinc dev did not see the agent stop: $(cat "$log")"
wait $dpid; [ $? -eq 1 ] || bad "zinc dev should end with 1 when the device is gone"
n=0; while [ $n -lt 60 ] && pgrep -f "$D/agent/dev/" > /dev/null; do sleep 0.05; n=$((n+1)); done
pgrep -f "$D/agent/dev/" > /dev/null && bad "the program outlived its agent"

[ $fail -eq 0 ] && echo "agent_dev: ok (a saved source running on the device $ms ms after the save)"
exit $fail
