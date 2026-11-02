#!/bin/sh
# Hamlet Cité: the ground is never black. A fast pan across a size 256 map (the four arrow keys held, then wheel zooms in and out) with the ground regions baked a slice a frame:
# the sampled frames must show no pixel of the background colour inside the map (a missing region is drawn from the overview, never left empty). Reports the share of fallback-drawn area.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
export ZINC_HEADLESS=1 ZINC_BACKGROUND=1 ZINC_AUDIO=null ZINC_DETERMINISTIC=1 ZINC_HAMLET_VIEW=cite ZINC_HAMLET_STILL=1 ZINC_HAMLET="3,256,0" ZINC_HAMLET_CAM=128,128,1 ZINC_HAMLET_PERF=560 ZINC_HAMLET_BAKE_DIAGS=${BAKE_DIAGS:-12}
ZINC_APP_DATA="$tmp/data" ZINC_SIZE=1100x900 ZINC_FRAMES=561 ZINC_INPUT="$PWD/tests/data/hamlet/ground.input" ZINC_SHOT="$tmp/f.png" ZINC_SHOT_FRAMES="$(seq -s, 0 1 12),$(seq -s, 14 6 510)" \
  timeout 600 "$ZINC" run --native examples/hamlet > "$tmp/out" 2> "$tmp/err"
grep -v 'compiling for this machine' "$tmp/err" > "$tmp/err2" || true
[ ! -s "$tmp/err2" ] || { cat "$tmp/err2"; exit 1; }
grep 'ground regions missing' "$tmp/out" | tail -1 | sed 's/.*| ground regions missing/ground regions missing/; s/ | bakes.*//' || true
python3 - "$tmp" <<'CHECK'
from pathlib import Path
from PIL import Image
import sys
bad = 0
shots = sorted(Path(sys.argv[1]).glob('f-*.png'))
print(len(shots), 'frames checked')
for f in sorted(Path(sys.argv[1]).glob('f-*.png')):
    im = Image.open(f).convert('RGB')
    w, h = im.size
    px = im.getdata()   # the whole window: the walk stays inside the map (camera starts at its middle)
    holes = sum(1 for r, g, b in px if (r, g, b) == (21, 26, 23))
    if holes: print(f.name, 'background pixels:', holes); bad += holes
assert bad == 0, f'{bad} background pixels: a ground region was drawn empty'
print('hamlet ground: ALL PASS')
CHECK
