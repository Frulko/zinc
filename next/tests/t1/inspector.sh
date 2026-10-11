#!/bin/sh
# The Zinc Inspector (ZN-373.01): app/inspector, a Zinc app, finds tests/data/inspector (zinc:devtools on a free port), attaches to it and shows
# its Elements tree, the computed style and box of a node it selects (its padding class), and its console (log and error lines, those from
# before the attach replayed): ZINC_INSPECTOR_DUMP prints what each view shows.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'kill $target 2>/dev/null; rm -rf "$tmp"' EXIT
port=$(python3 tests/free_ports.py)
ZINC_REALTIME=1 ZINC_HEADLESS=1 ZINC_FRAMES=100000000 ZINC_DEVTOOLS_PORT=$port timeout 90 "$ZINC" run tests/data/inspector > "$tmp/target.log" 2>&1 & target=$!
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
[ $fail -eq 0 ] || cat "$tmp/dump"
exit $fail
