#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
export ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1
ZINC_SIZE=480x310 ZINC_FRAMES=320 ZINC_INPUT=tests/data/pro-threads/session.input \
ZINC_SHOT="$tmp/frame.png" ZINC_SHOT_FRAMES=3,6,12,14,20,310 \
timeout 45 "$ZINC" run examples/pro-threads > "$tmp/out" 2> "$tmp/err" || { cat "$tmp/out" "$tmp/err"; exit 1; }
grep -q 'pro-threads: shader ready' "$tmp/out"
grep -q 'palette Graphite' "$tmp/out"
grep -q 'effect Calm' "$tmp/out"
grep -q 'paused true' "$tmp/out"
[ ! -s "$tmp/err" ] || { cat "$tmp/err"; exit 1; }
python3 - "$tmp" <<'CHECK'
from pathlib import Path
from PIL import Image, ImageChops
import sys
p = Path(sys.argv[1])
images = {i: Image.open(p / f'frame-{i}.png').convert('RGB') for i in [3,6,12,14,20,310]}
assert sum(max(c) > 50 for c in images[3].getdata()) > 10000, 'missing threads'
assert ImageChops.difference(images[3], images[6]).getbbox(), 'palette did not change'
assert ImageChops.difference(images[12], images[14]).getbbox(), 'animation did not advance'
assert not ImageChops.difference(images[20], images[310]).getbbox(), 'pause is not stable'
CHECK
echo 'pro_threads: original shader, palette, effect, letters, motion and 300 paused frames ok'
