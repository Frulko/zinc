#!/bin/sh
# The inspector, the frame, the telemetry and the load of an app on a device (ZN-729.05), on the loopback interface: a UI app deployed with
# zinc:devtools and zinc:telemetry gets its inspector's port from the agent, which says it; `inspect` gives an address a scripted DevTools
# client (tools/cdp-probe) and Zinc Inspector attach to, the second finding the app by itself among the paired devices; `shot` writes the
# frame the app shows (the pixels of the same program run here); `monitor` prints its telemetry in the words of zinc monitor; `top` the
# machine's load and the app's CPU and memory; an app without an inspector is said so. Skips (77) without python3.
cd "$(dirname "$0")/../.." || exit 2
command -v python3 >/dev/null 2>&1 || exit 77
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d)
D="$tmp/device" W="$tmp/work" name="zn-i$$" fail=0
dev() { ZINC_HOME="$W" timeout 60 "$Z" device "$@"; }
bad() { echo "FAIL: $*"; fail=1; }
cleanup() {
  for f in "$D"/agent/run/*.pid; do [ -e "$f" ] && kill -- "-$(head -1 "$f")" 2>/dev/null; done   # apps outlive their agent
  kill $apid $ipid $mpid 2>/dev/null; wait $apid $ipid $mpid 2>/dev/null
  rm -rf "$tmp"
}
trap cleanup EXIT
until_grep() { n=0; while [ $n -lt 100 ] && ! grep -q "$1" "$2" 2>/dev/null; do sleep 0.1; n=$((n+1)); done; grep -q "$1" "$2" 2>/dev/null; }

ZINC_HOME="$D" SHELL=/bin/sh "$Z" agent --bind 127.0.0.1 --port 0 --no-mdns --name "$name" > "$tmp/agent.log" 2>&1 & apid=$!
until_grep "pairing code" "$tmp/agent.log" || { echo "the agent did not start: $(cat "$tmp/agent.log")"; exit 1; }
port=$(sed -n 's/.*listening on 127.0.0.1:\([0-9]*\).*/\1/p' "$tmp/agent.log")
dev pair "127.0.0.1:$port" "$(sed -n 's/.*pairing code: \([0-9]*\).*/\1/p' "$tmp/agent.log")" > /dev/null || { echo "pairing failed"; exit 1; }

# a UI app with an inspector and telemetry: the agent chooses the inspector's port and says it
mkdir -p "$tmp/ui/src"
cp tests/golden/ui-style/radius.tsx "$tmp/ui/src/screen.tsx"
printf "import 'zinc:devtools';\nimport * as telemetry from 'zinc:telemetry';\nimport './screen';\ntelemetry.connect('stdout');\ntelemetry.gauge('temp', 21.25);\ntelemetry.event('boot', 'up');\n" > "$tmp/ui/src/main.tsx"
printf '{"name":"inspected","entry":"src/main.tsx"}\n' > "$tmp/ui/zinc.json"
out=$(dev deploy "$tmp/ui" --no-logs --env ZINC_HEADLESS=1 --env ZINC_REALTIME=1 --env ZINC_FRAMES=100000000 2>&1) || bad "deploy: $out"
n=0; while [ $n -lt 100 ] && ! dev logs inspected 2>/dev/null | grep -q "zinc devtools:"; do sleep 0.1; n=$((n+1)); done
said=$(dev info --json | sed -n 's/.*"name":"inspected"[^}]*"inspector":\([0-9]*\).*/\1/p')
[ -n "$said" ] && dev logs inspected | grep -q "localhost:$said)" || bad "the agent says the inspector is on '$said', the app: $(dev logs inspected | grep devtools)"

# deploy --inspect (ZN-734): a program that does not import zinc:devtools gets it in front, as under zinc dev; without the option it has none
mkdir -p "$tmp/plain/src"
cp tests/golden/ui-style/radius.tsx "$tmp/plain/src/main.tsx"
printf '{"name":"plain","entry":"src/main.tsx"}\n' > "$tmp/plain/zinc.json"
out=$(dev deploy "$tmp/plain" --inspect --no-logs --env ZINC_HEADLESS=1 --env ZINC_REALTIME=1 --env ZINC_FRAMES=100000000 2>&1) || bad "deploy --inspect: $out"
n=0; while [ $n -lt 100 ] && ! dev logs plain 2>/dev/null | grep -q "zinc devtools:"; do sleep 0.1; n=$((n+1)); done
port2=$(dev info --json | sed -n 's/.*"name":"plain"[^}]*"inspector":\([0-9]*\).*/\1/p')
[ -n "$port2" ] && dev logs plain | grep -q "localhost:$port2)" || bad "deploy --inspect: the app has no inspector (the agent says '$port2'): $(dev logs plain | tail -3)"
grep -q "zinc:devtools" "$tmp/plain/src/main.tsx" && bad "deploy --inspect wrote in the program's source"
dev stop plain > /dev/null 2>&1
out=$(dev deploy "$tmp/plain" --no-logs --env ZINC_HEADLESS=1 --env ZINC_REALTIME=1 --env ZINC_FRAMES=20 2>&1) || bad "deploy without --inspect: $out"
n=0; while [ $n -lt 100 ] && ! dev logs plain 2>/dev/null | grep -q '^\[exited'; do sleep 0.1; n=$((n+1)); done
dev logs plain | grep -q "zinc devtools:" && bad "a plain deploy has an inspector: $(dev logs plain | tail -3)"

# inspect: the address, attached to by a DevTools client (the document over the WebSocket) and read as Chrome discovers it
ZINC_HOME="$W" "$Z" device inspect inspected > "$tmp/inspect.log" 2>&1 & ipid=$!   # not through dev(): $! must be the process to end
until_grep "ws://127.0.0.1:" "$tmp/inspect.log" || bad "inspect gave no address: $(cat "$tmp/inspect.log")"
local=$(sed -n 's|.*ws://127.0.0.1:\([0-9]*\)/zinc$|\1|p' "$tmp/inspect.log")
grep -q "devtools://devtools/bundled/inspector.html?ws=127.0.0.1:$local/zinc" "$tmp/inspect.log" || bad "inspect does not print the DevTools address: $(cat "$tmp/inspect.log")"
probe=$(python3 tools/cdp-probe "$local" 2>&1) || bad "a DevTools client does not attach through $local: $probe"
list=$(python3 -c "import sys, urllib.request; sys.stdout.write(urllib.request.urlopen(sys.argv[1], timeout=5).read().decode())" "http://127.0.0.1:$local/json/list" 2>&1)
case $list in *'"webSocketDebuggerUrl"'*"127.0.0.1:$local"*) ;; *) bad "/json/list through the address of inspect: $list";; esac

# shot: the app's frame, the pixels of the same program run on this machine
dev shot inspected "$tmp/shot.png" > "$tmp/shot.log" 2>&1 || bad "shot: $(cat "$tmp/shot.log")"
grep -q "^wrote $tmp/shot.png ([0-9]* x [0-9]*, inspected on $name)" "$tmp/shot.log" || bad "shot does not say what it wrote: $(cat "$tmp/shot.log")"
ZINC_HEADLESS=1 ZINC_FRAMES=3 ZINC_SHOT="$tmp/here.png" ZINC_DEVTOOLS_PORT=0 "$Z" run "$tmp/ui" > /dev/null 2>&1
python3 tools/pngdiff "$tmp/shot.png" "$tmp/here.png" > "$tmp/diff.log" 2>&1 || bad "the frame of shot is not the app's: $(cat "$tmp/diff.log")"

# monitor: the telemetry lines as zinc monitor prints them
ZINC_HOME="$W" "$Z" device monitor inspected > "$tmp/monitor.log" 2>&1 & mpid=$!
until_grep "gauge   temp = 21.25" "$tmp/monitor.log" && grep -q "hello  platform" "$tmp/monitor.log" && grep -q "event   boot  up" "$tmp/monitor.log" || bad "monitor: $(cat "$tmp/monitor.log")"

# top: the machine's line, then the app with its pid, a share of CPU from the second sample on, its memory
dev top -n 2 > "$tmp/top.log" 2>&1 || bad "top: $(cat "$tmp/top.log")"
pid=$(dev apps | sed -n 's/^inspected .*running, pid \([0-9]*\)$/\1/p')
[ "$(grep -c "^$name  load [0-9.]* [0-9.]* [0-9.]*  memory [0-9]* MB free of [0-9]*" "$tmp/top.log")" = 2 ] || bad "top lacks the machine's line: $(cat "$tmp/top.log")"
grep -q "^inspected  *$pid  *-  *[1-9][0-9]*\.[0-9] MB$" "$tmp/top.log" && grep -q "^inspected  *$pid  *[0-9][0-9]*\.[0-9]  *[1-9][0-9]*\.[0-9] MB$" "$tmp/top.log" || bad "top lacks the app's CPU and memory (pid $pid): $(cat "$tmp/top.log")"
dev top -n 1 --json | grep -q '"name":"inspected"[^}]*"cpuMs":[0-9]*,"rss":[1-9]' || bad "top --json lacks the app's numbers"

# Zinc Inspector, started with a port where nothing listens: it finds the app of the paired device and attaches to it
free=$(python3 tests/free_ports.py 1)
ZINC="$Z" ZINC_HOME="$W" ZINC_INSPECTOR_DUMP=1 ZINC_REALTIME=1 ZINC_HEADLESS=1 ZINC_FRAMES=100000000 timeout 40 "$Z" run app/inspector/main.tsx -- "$free" > "$tmp/dump" 2>&1 || bad "Zinc Inspector failed: $(head -c 600 "$tmp/dump")"
for want in "programs: 1" "program: inspected on $name (page)" "elements:" "<view " "screen: "; do
  grep -qF -- "$want" "$tmp/dump" || bad "missing in Zinc Inspector's views: $want ($(head -c 400 "$tmp/dump"))"
done

# an app with no inspector: said so
mkdir -p "$tmp/tool"
printf '#!/bin/sh\nexec sleep 60\n' > "$tmp/tool/run.sh"
dev install "$tmp/tool" --name tool > /dev/null 2>&1 && dev run tool > /dev/null 2>&1 || bad "install and run of the app without an inspector"
dev inspect tool > "$tmp/none.log" 2>&1 && bad "inspect of an app without an inspector succeeded"
grep -q "tool has no inspector" "$tmp/none.log" || bad "no inspector: $(cat "$tmp/none.log")"

[ $fail -eq 0 ] && echo "agent_inspect: ok"
exit $fail
