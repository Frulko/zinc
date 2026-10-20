#!/bin/sh
# zinc.json targets.macos.pixelScale (ZN-425): "logical" draws a window's frames at 1x (pixelScale() is 1, the window magnifies them with square
# pixels); without it the scale stays the zoom times the screen density (2 or more for a 320x240 program, which opens at zoom 2).
[ "$(uname)" = Darwin ] || { echo "skipped: macOS only"; exit 77; }
launchctl managername 2>/dev/null | grep -q Aqua || { echo "skipped: no GUI session"; exit 77; }
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
unset ZINC_HEADLESS ZINC_DETERMINISTIC ZINC_PIXEL_SCALE ZINC_SCALE
mkdir -p "$tmp/app"
cat > "$tmp/app/main.ts" <<'T'
import { onFrame, clear, rect, pixelScale, width, height } from 'zinc:gfx';
let n = 0;
onFrame((dt: number) => { clear(0x102030); rect(10, 10, 20, 20, 0xffcc00); if (++n === 2) console.log('scale', pixelScale(), 'size', width(), height()); });
T
run() { ZINC_FRAMES=4 ZINC_RUN=interp "$ZINC" run "$tmp/app" 2>&1 | grep '^scale'; }
printf '{ "name": "px", "entry": "main.ts", "targets": { "macos": { "pixelScale": "logical" } } }\n' > "$tmp/app/zinc.json"
out=$(run); [ "$out" = "scale 1 size 320 240" ] || { echo "pixelScale logical: $out"; fail=1; }
printf '{ "name": "px", "entry": "main.ts" }\n' > "$tmp/app/zinc.json"
out=$(run); case "$out" in "scale 1 "*|"") echo "the default scale should follow the zoom and the density: $out"; fail=1 ;; esac
[ $fail -eq 0 ] && echo "pixel scale: ok"
exit $fail
