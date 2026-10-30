#!/bin/sh
# The Zinc Inspector stays inside its window, as Chrome DevTools does: attached to tests/data/inspector-storage (a wide SQLite table of 14
# columns and 2000 rows), headless at 900x600 and at a tall narrow 500x1000, each view (Info, Elements, Screen, Network, Storage on the wide
# table, Sources, Performance, Threads) has no node outside what shows it (the window cut by the scroll areas around it, but along an axis
# they scroll) and no text drawing lines wider than its box. The wide grid scrolls sideways inside its pane with its header in sync, and the
# splitter of the program list resizes it when dragged.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'kill $target 2>/dev/null; rm -rf "$tmp"' EXIT
fail=0
for size in 900x600 500x1000; do
  port=$(python3 tests/free_ports.py 1)
  ZINC_DEV=1 ZINC_STORAGE="$tmp/store-$port" ZINC_REALTIME=1 ZINC_HEADLESS=1 ZINC_FRAMES=100000000 ZINC_DEVTOOLS_PORT=$port timeout 120 "$ZINC" run tests/data/inspector-storage > "$tmp/target.log" 2>&1 & target=$!
  n=0; while [ $n -lt $((1200 * ${ZN_WAIT_SCALE:-1})) ] && ! grep -q "zinc devtools:" "$tmp/target.log"; do sleep 0.05; n=$((n+1)); done   # the first run builds the sqlite plugin
  grep -q "localhost:$port)" "$tmp/target.log" || { echo "the target does not listen on $port: $(cat "$tmp/target.log")"; exit 1; }
  sleep 0.5
  ZINC_SIZE=$size ZINC_SCALE=1 ZINC_INSPECTOR_DUMP=layout ZINC_REALTIME=1 ZINC_HEADLESS=1 ZINC_FRAMES=100000000 timeout 90 "$ZINC" run app/inspector/main.tsx -- "$port" > "$tmp/dump" 2>&1 ||
    { echo "the inspector failed at $size: $(head -c 600 "$tmp/dump")"; exit 1; }
  kill $target 2>/dev/null; wait $target 2>/dev/null
  f0=$fail
  want() { grep -qxF -- "$1" "$tmp/dump" || { echo "$size: missing: $1"; fail=1; }; }
  want "window: $(echo $size | tr x ' ' | sed 's/ / x /')"
  for v in info elements screen network storage sources performance threads; do want "layout $v: inside"; done
  want 'grid: 14 columns, wider than its pane'
  want 'grid scrolled 300: header moved 300, rows moved 300, in sync'
  want 'layout storage scrolled: inside'
  want 'splitter dragged 60 px: the program list 240 -> 300'
  want 'layout after the drag: inside'
  [ $fail -eq $f0 ] || grep -v '^  \(engine\|cache\|compile\|plugin\|run \)' "$tmp/dump"
done
exit $fail
