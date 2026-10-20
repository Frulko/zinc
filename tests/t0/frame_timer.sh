#!/bin/sh
# The frame loop and a long timer coexist (ZN-082): a 60 fps app with a 1 s interval keeps its frame rate; the interval fires once a second of frame time.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cat > "$tmp/app.ts" <<'TS'
import { onFrame, clear } from 'zinc:gfx'
let frames = 0
let ticks = 0
setInterval(() => { ticks++ }, 1000)
onFrame((dt: number) => {
  clear(0)
  frames++
  if (frames === 130) console.log('frames', frames, 'ticks', ticks)
})
TS
out=$(ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=130 "$ZINC" run "$tmp/app.ts" 2>&1)
[ "$out" = "frames 130 ticks 2" ] || { echo "frame loop with a 1 s interval: $out"; exit 1; }
