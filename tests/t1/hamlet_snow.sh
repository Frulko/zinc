#!/bin/sh
# Hamlet Cité: the thaw's snow lies in patches, never as dithered white noise (seed 3, size 256, the start view): most white pixels of the map have a crowd of white pixels around them.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
export ZINC_HEADLESS=1 ZINC_BACKGROUND=1 ZINC_AUDIO=null ZINC_DETERMINISTIC=1 ZINC_HAMLET_VIEW=cite ZINC_HAMLET="3,256"
ZINC_APP_DATA="$tmp/data" ZINC_SIZE=1100x900 ZINC_FRAMES=60 ZINC_SHOT="$tmp/f.png" timeout 300 "$ZINC" run --native examples/hamlet > "$tmp/out" 2> "$tmp/err" || { cat "$tmp/err"; exit 1; }
python3 - "$tmp" <<'CHECK'
from pathlib import Path
from PIL import Image
import sys
f = sorted(Path(sys.argv[1]).glob('f*.png'))[-1]
im = Image.open(f).convert('RGB').crop((0, 200, 900, 860)); w, h = im.size; p = im.load()
W = [[min(p[x, y]) >= 200 for x in range(w)] for y in range(h)]
n = solid = 0
for y in range(1, h - 1):
    for x in range(1, w - 1):
        if W[y][x]:
            n += 1
            if sum(W[y + b][x + a] for a in (-1, 0, 1) for b in (-1, 0, 1)) - 1 >= 5: solid += 1
share = solid / max(n, 1)
print(f'white pixels {n}, solid share {share:.2f}')
assert n < 2000 or share >= .7, 'snow is dithered white noise'
print('hamlet snow: ALL PASS')
CHECK
