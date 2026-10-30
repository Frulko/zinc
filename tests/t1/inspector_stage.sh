#!/bin/sh
# The Zinc Inspector on a zinc:stage program: tests/data/inspector_stage (a dev run, ZINC_DEV=1) under app/inspector's ZINC_INSPECTOR_DUMP=elements.
# Elements shows the display tree with each node's class (the program's own GameManager and Box) and name, its properties (alpha, which
# only Box declares), "rendered only" leaves the hidden node out, and an edit of x moves the node's box and changes the program's frame.
# The tree follows the program live (a node it adds and one it removes, the selected node's values), a node turned about its pivot has a
# turned box, and a zinc:ui interface with the scene in a <Canvas> (src/hybrid.tsx) shows both trees, the scene's box in window coordinates.
# The devtools line names the port the system chose for ZINC_DEVTOOLS_PORT=0, on QuickJS too.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'kill $target 2>/dev/null; rm -rf "$tmp"' EXIT
fail=0
inspect() {   # inspect <entry>: the target on a free port, the inspector's dump in $tmp/dump
  port=$(python3 tests/free_ports.py)
  ZINC_DEV=1 ZINC_REALTIME=1 ZINC_HEADLESS=1 ZINC_FRAMES=100000000 ZINC_DEVTOOLS_PORT=$port timeout 60 "$ZINC" run "$1" > "$tmp/target.log" 2>&1 & target=$!
  n=0; while [ $n -lt $((400 * ${ZN_WAIT_SCALE:-1})) ] && ! grep -q "zinc devtools:" "$tmp/target.log"; do sleep 0.05; n=$((n+1)); done
  grep -q "localhost:$port)" "$tmp/target.log" || { echo "the target does not listen on $port: $(cat "$tmp/target.log")"; exit 1; }
  ZINC_INSPECTOR_DUMP=elements ZINC_REALTIME=1 ZINC_HEADLESS=1 ZINC_FRAMES=100000000 timeout 60 "$ZINC" run app/inspector/main.tsx -- "$port" > "$tmp/dump" 2>&1 ||
    { echo "the inspector failed: $(head -c 600 "$tmp/dump")"; exit 1; }
  kill $target 2>/dev/null; wait $target 2>/dev/null
}
want() { grep -qF -- "$1" "$tmp/dump" || { echo "missing in the inspector's views: $1"; fail=1; }; }
section() { awk -v s="$1:" '$0 == s { on = 1; next } /^[a-z].*:/ { on = 0 } on' "$tmp/dump"; }
inspect tests/data/inspector_stage
want '  <Stage name="Stage">'
want '    <GameManager name="game">'
want '      <Box name="ball">'
section elements | grep -qF 'ghost' && { echo "rendered only shows the hidden node"; fail=1; }
section "elements, all" | grep -qF '<Box name="ghost" hidden>' || { echo "without rendered only, the hidden node is missing"; fail=1; }
want 'stage node: <Box name="ball"> name=ball x=40 y=30 width=50 height=40 alpha=1 visible=true children=0 | box 50 × 40'
want 'dev run: true'
want 'stage edit: x 40 -> 140, box left 40 -> 140 | frame changed: true'
want 'bad edit: alpha is a number'
want 'live: spark inserted, ghost removed true | selected y follows true'
want 'turned: <Spin name="spin"> quad 210,80,210,120,190,120,190,80 | 40 × 20'
[ $fail = 0 ] || { echo "--- dump:"; head -c 3000 "$tmp/dump"; }
inspect tests/data/inspector_stage/src/hybrid.tsx
section elements | grep -A1 -F '<Canvas className="w-64 h-40">' | tail -1 | grep -qF '<Stage name="Stage">' || { echo "the scene is not under its Canvas"; fail=1; }
want '<Text className="text-sm">'
want 'stage edit: x 40 -> 140, box left 56 -> 156 | frame changed: true'
[ $fail = 0 ] || { echo "--- hybrid dump:"; head -c 3000 "$tmp/dump"; }
# the real port of ZINC_DEVTOOLS_PORT=0 on QuickJS
ZINC_DEVTOOLS_PORT=0 ZINC_HEADLESS=1 ZINC_FRAMES=100000000 timeout 30 "$ZINC" run tests/data/inspector_stage --engine quickjs > "$tmp/qjs.log" 2>&1 & target=$!
n=0; while [ $n -lt $((400 * ${ZN_WAIT_SCALE:-1})) ] && ! grep -q "zinc devtools:" "$tmp/qjs.log"; do sleep 0.05; n=$((n+1)); done
grep -q "localhost:[1-9][0-9]*)" "$tmp/qjs.log" || { echo "QuickJS does not name the port it listens on: $(cat "$tmp/qjs.log")"; fail=1; }
exit $fail
