#!/bin/sh
# Hamlet's understanding screens in the Cité view: the advisor tabs (each must draw its own page) and the building window.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
export ZINC_HEADLESS=1 ZINC_BACKGROUND=1 ZINC_DETERMINISTIC=1 ZINC_HAMLET_VIEW=cite ZINC_HAMLET_STILL=1 ZINC_HAMLET_CROWD=40,20 ZINC_HAMLET="3,64,0" ZINC_APP_DATA="$tmp/data"
ZINC_SIZE=1100x800 ZINC_FRAMES=64 ZINC_INPUT="$PWD/tests/data/hamlet/advisors.input" ZINC_SHOT="$tmp/f.png" ZINC_SHOT_FRAMES=8,17,25,33,41,49,62 timeout 240 "$ZINC" run --interp examples/hamlet > "$tmp/out" 2> "$tmp/err"
[ ! -s "$tmp/err" ] || { cat "$tmp/err"; exit 1; }
python3 - "$tmp" <<'CHECK'
from pathlib import Path
from PIL import Image, ImageChops
import sys
p = Path(sys.argv[1])
def shot(n): return Image.open(p / f'f-{n}.png').convert('RGB')
def diff(a, b, box):
    return sum(1 for px in ImageChops.difference(shot(a).crop(box), shot(b).crop(box)).getdata() if max(px) > 24)
win = (215, 270, 800, 700)                                 # the advisor page
for a, b in ((17, 25), (25, 33), (33, 41), (41, 49)):
    assert diff(a, b, win) > 1200, f'advisor tabs of frames {a} and {b} draw the same page'
assert diff(49, 62, (20, 60, 430, 560)) > 2500, 'the building window did not open'
print('hamlet advisors: ALL PASS')
CHECK
