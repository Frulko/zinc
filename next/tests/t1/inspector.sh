#!/bin/sh
# The Zinc Inspector (ZN-373.01): app/inspector, a Zinc app, finds tests/data/inspector (zinc:devtools on a free port), attaches to it and shows
# its Elements tree, the computed style and box of a node it selects (its padding class), and its console (log and error lines, those from
# before the attach replayed): ZINC_INSPECTOR_DUMP prints what each view shows. ZN-373.02: its rules, element.style set to padding-left: 40px
# (the target's frame changes and its console gets the class patch), a frame of its screen. ZN-373.03: its POST in the Network view and the body.
# ZN-373.05: half a second recorded in the Performance view (Tracing.start/end): frames, each with its phases (app, layout... present).
# ZN-373.04: the Sources view against zinc debug --cdp: a breakpoint set on a line, the stop there with the stack, the locals (a Point unfolded)
# and two watches, step into, over and out, the breakpoint removed and the program run to its end.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'kill $target $server $debug 2>/dev/null; rm -rf "$tmp"' EXIT
set -- $(python3 tests/free_ports.py 2); port=$1; http=$2
python3 tests/netlog_servers.py $http > /dev/null 2>&1 & server=$!   # ZN-373.03: the target posts to its /echo
sleep 0.5
INSPECTOR_FETCH=http://127.0.0.1:$http/echo ZINC_REALTIME=1 ZINC_HEADLESS=1 ZINC_FRAMES=100000000 ZINC_DEVTOOLS_PORT=$port timeout 90 "$ZINC" run tests/data/inspector > "$tmp/target.log" 2>&1 & target=$!
n=0; while [ $n -lt 400 ] && ! grep -q "zinc devtools:" "$tmp/target.log"; do sleep 0.05; n=$((n+1)); done
grep -q "localhost:$port)" "$tmp/target.log" || { echo "the target does not listen on $port: $(cat "$tmp/target.log")"; exit 1; }
sleep 0.6   # a few console lines before the inspector attaches
ZINC_INSPECTOR_DUMP=1 ZINC_REALTIME=1 ZINC_HEADLESS=1 ZINC_FRAMES=100000000 timeout 60 "$ZINC" run app/inspector/main.tsx -- "$port" > "$tmp/dump" 2>&1 || { echo "the inspector failed: $(head -c 600 "$tmp/dump")"; exit 1; }
fail=0
want() { grep -qF -- "$1" "$tmp/dump" || { echo "missing in the inspector's views: $1"; fail=1; }; }
want "programs: 1"
want '<view class="flex-col gap-2 p-4">'
want '"Hello inspector"'
want '<view class="w-4 h-4 bg-rose-600">'
want "padding-top: 16px"
want "log: tick 1"
want "error: oops 2"
want ".flex-col.gap-2.p-4 {"   # ZN-373.02: the classes as a rule, element.style edited, the target's frame changed, its screen
want "element.style: padding-left: 40px;"
want "frame changed: true"
want "screen: 320 x 240"
want 'class="flex-col gap-2 p-4 pl-[40px]"'
want "POST 200 /echo N ms 28 B"   # ZN-373.03: the request made before the attach, its status, time and size, and its body
want 'body: {"echo":{"ask":"inspector"}}'
want "frames recorded: true, each with its phases up to present: true"
want "  phase app"
want "  phase layout"
want "  phase present"
grep -q "^  slowest: .*layout.* present$" "$tmp/dump" || { echo "the slowest frame's phases are missing"; fail=1; }
[ $fail -eq 0 ] || cat "$tmp/dump"

timeout 60 "$ZINC" debug --cdp=0 tests/data/debug_cli/main.ts > "$tmp/debug.out" 2> "$tmp/debug.err" & debug=$!
n=0; while [ $n -lt 400 ] && ! grep -q "localhost:" "$tmp/debug.err"; do sleep 0.05; n=$((n+1)); done
dport=$(grep -o 'localhost:[0-9]*' "$tmp/debug.err" | cut -d: -f2)
[ -n "$dport" ] || { echo "zinc debug --cdp does not listen: $(cat "$tmp/debug.err")"; exit 1; }
ZINC_INSPECTOR_DUMP=1 ZINC_REALTIME=1 ZINC_HEADLESS=1 ZINC_FRAMES=100000000 timeout 60 "$ZINC" run app/inspector/main.tsx -- "$dport" > "$tmp/dump" 2>&1 || { echo "the inspector failed on zinc debug: $(head -c 600 "$tmp/dump")"; exit 1; }
wait $debug
f0=$fail
want "main.ts (node)"
want "scripts: main.ts"
want "source: 26 lines, line 9: const sum = a + b;"
want "breakpoints: 19"
want "start: <top level> main.ts:24"
want "paused: run main.ts:19, <top level> main.ts:24"
want "    total: 0"
want "    p: Point"
want "      x: 1"
want "      y: 2"
want '    name: "zinc"'
want "watch: total + 1 = 1"
want "watch: p.x * 10 = 10"
want "step into: add main.ts:9, run main.ts:19"
want "step over: add main.ts:10, run main.ts:19"
want "step out: run main.ts:19, <top level> main.ts:24"
want "breakpoints: 0"
want "ended: true"
grep -q "zinc 6 1" "$tmp/debug.out" || { echo "the program did not run to its end: $(cat "$tmp/debug.out")"; fail=1; }
[ $fail -eq $f0 ] || cat "$tmp/dump"
exit $fail
