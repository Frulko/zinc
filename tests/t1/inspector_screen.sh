#!/bin/sh
# The Zinc Inspector's Screen view on tests/data/inspector_screen (a dev run): the frames the program streams never carry the highlight (a
# node highlighted on a still screen sends no frame; the inspector draws the box itself), DOM.getNodeForLocation finds the inner box at a
# point (and says so when there is nothing), and a pick on the screen highlights that node (ArrowUp its parent, ArrowDown back), then
# selects what is highlighted in Elements (its row shown), ends the pick and leaves no highlight in the program; Escape ends a pick.
# Then two seconds of the animated program: the frame rate, the size of a frame, its decoding and latency (printed, not checked).
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'kill $target 2>/dev/null; rm -rf "$tmp"' EXIT
fail=0
inspect() {   # inspect <mode> <INSPECTOR_ANIM>: the target on a free port, the inspector's dump in $tmp/dump
  port=$(python3 tests/free_ports.py)
  INSPECTOR_ANIM=$2 ZINC_DEV=1 ZINC_REALTIME=1 ZINC_HEADLESS=1 ZINC_FRAMES=100000000 ZINC_DEVTOOLS_PORT=$port timeout 60 "$ZINC" run tests/data/inspector_screen > "$tmp/target.log" 2>&1 & target=$!
  n=0; while [ $n -lt $((400 * ${ZN_WAIT_SCALE:-1})) ] && ! grep -q "zinc devtools:" "$tmp/target.log"; do sleep 0.05; n=$((n+1)); done
  grep -q "localhost:$port)" "$tmp/target.log" || { echo "the target does not listen on $port: $(cat "$tmp/target.log")"; exit 1; }
  ZINC_INSPECTOR_DUMP=$1 ZINC_REALTIME=1 ZINC_HEADLESS=1 ZINC_FRAMES=100000000 timeout 60 "$ZINC" run app/inspector/main.tsx -- "$port" > "$tmp/dump" 2>&1 ||
    { echo "the inspector failed: $(head -c 600 "$tmp/dump")"; exit 1; }
  kill $target 2>/dev/null; wait $target 2>/dev/null
}
want() { grep -qF -- "$1" "$tmp/dump" || { echo "missing in the inspector's views: $1"; fail=1; }; }
inspect screen 0
want 'frames sent while a node is highlighted: 0'
want 'node at 60,60: <View className="w-[40px] h-[30px] bg-rose-600">'
want 'node at -5,-5: No node found at given location'
grep -q '^screen hover: \([0-9]*\) = \1, drawn box 48,48,40,30$' "$tmp/dump" || { echo "the hover on the screen is not the node there, drawn at its box"; fail=1; }
sky='<View className="absolute left-[40px] top-[40px] w-[120px] h-[60px] p-2 bg-sky-600">'
want "screen parent: $sky, back true | tip "   # ArrowUp while picking: the parent of the node under the pointer, ArrowDown back
want "screen pick: $sky selected, view elements, picking false, row true, highlight left in the program false"   # the click picks what is highlighted
want 'escape: picking false, highlight left false'
[ $fail = 0 ] || { echo "--- dump:"; head -c 3000 "$tmp/dump"; }
inspect screenfps 1
grep '^screen fps: ' "$tmp/dump" || { echo "no frame rate: $(head -c 600 "$tmp/dump")"; fail=1; }
exit $fail
