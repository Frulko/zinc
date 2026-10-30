#!/bin/sh
# The Zinc Inspector (ZN-373.01): app/inspector, a Zinc app, finds tests/data/inspector (zinc:devtools on a free port, a dev run: ZINC_DEV=1),
# attaches to it and goes through its panels; ZINC_INSPECTOR_DUMP prints what each one shows.
# Elements: the component tree of a dev run (<Card> and <Squares> around their host nodes, with file:line and props), "rendered only" (the
# default) hiding a display: none node and the rows a virtual list keeps beyond its view, components only, a search that opens what it finds,
# a component selected (its props, its first host node styled); live styling: a class added (the computed width follows), switched off and
# on, completion of the known classes, element.style set, switched off, on and deleted. ZN-373.02: the classes as a rule, element.style
# padding-left: 40px (the target's frame changes and its console gets the class patch), a frame of its screen. The console (log and error
# lines, those from before the attach replayed). Network (ZN-373.03): the POST with its status, body, payload, headers, timing phases, JSON
# preview, cURL, the filters, a WebSocket with its messages and the HAR export. ZN-373.05: half a second in the Performance view.
# Chrome's tree: folded by default (Alt-click folds or opens a subtree), the long className of an iPod-like row wrapped, the arrow keys, a class
# edited in place, a Text's properties (font size stepped, alignment), its text edited in its row (DOM.setNodeValue).
# The same program not in a dev run: no component names, and the class, element.style and text edits refused with the message.
# ZN-373.04: the Sources view against zinc debug --cdp: a breakpoint set on a line, the stop there with the stack, the locals (a Point
# unfolded) and two watches, step into, over and out, the breakpoint removed and the program run to its end.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'kill $target $server $debug 2>/dev/null; rm -rf "$tmp"' EXIT
set -- $(python3 tests/free_ports.py 3); port=$1; http=$2; port2=$3
python3 tests/netlog_servers.py $http > /dev/null 2>&1 & server=$!   # ZN-373.03: the target posts to its /echo and opens a WebSocket to its /ws
sleep 0.5
start() {   # start <port> <log> <ZINC_DEV>: the target, until it listens
  ZINC_DEV=$3 INSPECTOR_FETCH=http://127.0.0.1:$http/echo ZINC_REALTIME=1 ZINC_HEADLESS=1 ZINC_FRAMES=100000000 ZINC_DEVTOOLS_PORT=$1 timeout 90 "$ZINC" run tests/data/inspector > "$2" 2>&1 & target=$!
  n=0; while [ $n -lt $((400 * ${ZN_WAIT_SCALE:-1})) ] && ! grep -q "zinc devtools:" "$2"; do sleep 0.05; n=$((n+1)); done
  grep -q "localhost:$1)" "$2" || { echo "the target does not listen on $1: $(cat "$2")"; exit 1; }
}
inspect() {   # inspect <port> <mode>: the inspector's dump in $tmp/dump
  ZINC_INSPECTOR_HAR="$tmp/out.har" ZINC_INSPECTOR_DUMP=$2 ZINC_REALTIME=1 ZINC_HEADLESS=1 ZINC_FRAMES=100000000 timeout 60 "$ZINC" run app/inspector/main.tsx -- "$1" > "$tmp/dump" 2>&1 ||
    { echo "the inspector failed: $(head -c 600 "$tmp/dump")"; exit 1; }
}
start $port "$tmp/target.log" 1
sleep 0.6   # a few console lines before the inspector attaches
inspect $port 1
fail=0
want() { grep -qF -- "$1" "$tmp/dump" || { echo "missing in the inspector's views: $1"; fail=1; }; }
section() { awk -v s="$1:" '$0 == s { on = 1; next } /^[a-z].*:/ { on = 0 } on' "$tmp/dump"; }   # the lines under a title of the dump
want "programs: 1"
want '<View className="flex-col gap-2 p-4">'
want '"Hello inspector"'
want '<View className="w-4 h-4 bg-rose-600">'
want '      <Card>'   # the components of a dev run, around their host nodes
want '          <Squares>'
want "component: <Card> tests/data/inspector/src/main.tsx:$(grep -n '<Card title' tests/data/inspector/src/main.tsx | cut -d: -f1) title=\"First card\" | styles <View className=\"flex-col p-2 rounded bg-slate-100\">"
section elements > "$tmp/rendered"; section "elements, all" > "$tmp/all"
grep -qF '"Row 0"' "$tmp/rendered" && grep -qF '"Row 3"' "$tmp/rendered" || { echo "rendered only: the rows in the list's view are missing"; fail=1; }
grep -qF 'Never shown' "$tmp/rendered" && { echo "rendered only shows a display: none node"; fail=1; }
grep -qF '"Row 7"' "$tmp/rendered" && { echo "rendered only shows a row of the virtual list outside its view"; fail=1; }
grep -qF 'Never shown' "$tmp/all" && grep -qF '"Row 7"' "$tmp/all" || { echo "without rendered only, the hidden node and the kept rows are missing"; fail=1; }
[ "$(section 'components only' | tr -d ' ' | tr '\n' ' ')" = "<Card> <Squares> " ] || { echo "components only: $(section 'components only')"; fail=1; }
section "search rose" | grep -qF '<View className="w-4 h-4 bg-rose-600">' && ! section "search rose" | grep -qF 'bg-sky-600' || { echo "the search does not show its match alone with its ancestors"; fail=1; }
want "dev run: true"
section "elements, folded" | tr -d ' ' | tr '\n' ' ' | grep -qF '<View> <ViewclassName="flex-colgap-2p-4">…</View> </View>' || { echo "not folded by default: $(section 'elements, folded')"; fail=1; }   # the root open, the rest folded
want "alt-click folds: 1 rows"
want "long row: 3 lines"   # the iPod row's long className wraps under its tag, nothing clipped
want "clipped false"
want "class edited in place: width 48px | <View className=\"w-4 h-4 bg-rose-600 w-12\">"
want "text properties: font-size font-weight line-height letter-spacing text-align color"
want "text style edit: font-size 18px -> 28px, text-align center, removed 18px left"
want "keys: down moves true, up comes back true"
want "text edit: program text true"
want 'class edit: width 16px -> 32px, off 16px, on 32px | <View className="w-4 h-4 bg-rose-600 w-8">'
want "completion bg-ros: bg-rose-50 bg-rose-100 bg-rose-200"
want "style edit: width 50px, off 32px, on 50px, deleted 32px | element.style "
want "padding-top: 16px"
want "log: tick 1"
want "error: oops 2"
want ".flex-col.gap-2.p-4 {"   # ZN-373.02: the classes as a rule, element.style edited, the target's frame changed, its screen
want "element.style: padding-left: 40px;"
want "frame changed: true"
want "screen: 320 x 240"
want 'class="flex-col gap-2 p-4 pl-[40px]"'
want "POST 200 /echo N ms 28 B"   # ZN-373.03: the request made before the attach, its status, time and size, and its details
want 'body: {"echo":{"ask":"inspector"}}'
want 'payload: {"ask":"inspector"}'
want "request headers: Content-Type: application/json"
want "response headers: true, mime application/json, size 28"
want "timing: DNS lookup, Initial connection, Request sent, Waiting for server response, Content download"
want 'preview: - {1} | - echo: {1} | ask: "inspector"'
want "-X POST -H 'Host: 127.0.0.1:$http'"
want "--data-raw '{\"ask\":\"inspector\"}'"
want "filter 5xx: 0"
want "filter 2xx: 1"
want "filter ws: 1"
want "ws: /ws 101 >> hello, << echo: hello, >> [close], << [close]"
want "filter echo: 1"
want "har: out.har"
python3 -c "
import json, sys
e = json.load(open(sys.argv[1]))['log']['entries']
post = [x for x in e if x['request']['method'] == 'POST'][0]
assert post['response']['status'] == 200 and post['timings']['wait'] >= 0 and 'inspector' in post['response']['content']['text'], post
assert any(x.get('_webSocketMessages') for x in e), 'no WebSocket messages'
" "$tmp/out.har" || { echo "the HAR export is not the log"; fail=1; }
want "frames recorded: true, each with its phases up to present: true"
want "  phase app"
want "  phase layout"
want "  phase present"
grep -q "^  slowest: .*layout.* present$" "$tmp/dump" || { echo "the slowest frame's phases are missing"; fail=1; }
[ $fail -eq 0 ] || cat "$tmp/dump"
kill $target 2>/dev/null

f0=$fail   # not a dev run: no component names, the edits refused
start $port2 "$tmp/target2.log" 0
inspect $port2 elements
want "dev run: false"
want "class refused: live styling works in dev runs only (zinc dev): this program was not started by zinc dev, and nothing was changed"
want "style refused: live styling works in dev runs only (zinc dev)"
want "width still 16px"
want "text edit: refused: live styling works in dev runs only"
grep -qF '<Card>' "$tmp/dump" && { echo "a run that is not a dev run has component names"; fail=1; }
[ $fail -eq $f0 ] || cat "$tmp/dump"
kill $target 2>/dev/null

timeout 60 "$ZINC" debug --cdp=0 tests/data/debug_cli/main.ts > "$tmp/debug.out" 2> "$tmp/debug.err" & debug=$!
n=0; while [ $n -lt $((400 * ${ZN_WAIT_SCALE:-1})) ] && ! grep -q "localhost:" "$tmp/debug.err"; do sleep 0.05; n=$((n+1)); done
dport=$(grep -o 'localhost:[0-9]*' "$tmp/debug.err" | cut -d: -f2)
[ -n "$dport" ] || { echo "zinc debug --cdp does not listen: $(cat "$tmp/debug.err")"; exit 1; }
inspect $dport 1
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
