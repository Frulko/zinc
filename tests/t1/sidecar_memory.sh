#!/bin/sh
# display-sidecar streaming frames that change everywhere (a video in a web view) keeps its memory flat: its compression threads last one
# frame, and each kept a zstd context (~490 KB) that nothing freed, until macOS ended the process.
[ "$(uname)" = Darwin ] || exit 0   # the peak footprint of /usr/bin/time -l
cd "$(dirname "$0")/../.." || exit 2
root=$(pwd)
tmp=$(mktemp -d); trap 'kill $screen 2>/dev/null; rm -rf "$tmp"' EXIT
cat > "$tmp/zinc.json" <<'J'
{ "name": "sidecar-memory", "entry": "main.tsx", "displays": ["sidecar"], "targets": { "macos": { "width": 720, "height": 450 } } }
J
cat > "$tmp/main.tsx" <<'J'
import { render, createSignal } from 'zinc:ui/solid';
const [on, setOn] = createSignal<boolean>(false);
setInterval(() => { setOn(!on()); }, 16);
render(() => <View className={on() ? 'h-full bg-red-500' : 'h-full bg-blue-500'} />, 0, null);
J
out=$("$ZINC" build "$tmp" -o "$tmp/app" 2>&1) || { echo "build failed: $out"; exit 1; }
python3 "$root/tests/native/sidecar/ack_screen.py" > "$tmp/screen" & screen=$!
while [ ! -s "$tmp/screen" ]; do sleep 0.1; done
ZINC_DISPLAY=sidecar ZINC_SIDECAR=127.0.0.1:$(head -1 "$tmp/screen") ZINC_SIDECAR_LOG=1 ZINC_FRAMES=300 /usr/bin/time -l "$tmp/app" > "$tmp/log" 2>&1
sent=$(awk '/frames\/s sent/ { n += $2 } END { print n + 0 }' "$tmp/log")
peak=$(awk '/peak memory footprint/ { print int($1 / 1048576) }' "$tmp/log")
[ "$sent" -gt 50 ] || { echo "sidecar_memory: only $sent frames sent: $(tail -c 400 "$tmp/log")"; exit 1; }
[ -n "$peak" ] && [ "$peak" -lt 100 ] || { echo "sidecar_memory: peak footprint ${peak} MB for $sent frames"; exit 1; }
echo "peak footprint ${peak} MB for $sent frames"
