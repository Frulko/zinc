#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
ZINC_HEADLESS=1 ZINC_WEB=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=64x64 ZINC_SCALE=2 \
ZINC_FRAMES=7 ZINC_SHOT="$tmp/image.png" ZINC_SHOT_FRAMES=2,4,6 \
"$ZINC" run tests/data/webenv-pixelated/main.js --engine quickjs > "$tmp/out" 2> "$tmp/err"
[ ! -s "$tmp/err" ] || { cat "$tmp/err"; exit 1; }
python3 - "$tmp" <<'CHECK'
from PIL import Image
from pathlib import Path
import sys
p=Path(sys.argv[1])
colors={(255,0,0),(0,255,0),(0,0,255),(255,255,255)}
for n in [2,6]:
    im=Image.open(p/f'image-{n}.png').convert('RGB')
    assert im.size==(128,128), 'Retina fixture did not scale by two'
    assert set(im.getdata())==colors, 'pixelated presentation blended texels'
    for box,color in [((0,0,64,64),(255,0,0)),((64,0,128,64),(0,255,0)),((0,64,64,128),(0,0,255)),((64,64,128,128),(255,255,255))]:
        assert set(im.crop(box).getdata())=={color}, 'nearest quadrant has an edge seam'
auto=Image.open(p/'image-4.png').convert('RGB')
assert len(set(auto.getdata()))>4, 'auto presentation lost linear filtering'
CHECK
echo 'webenv_pixelated: pixelated/crisp-edges stay exact at 2x, auto stays linear PASS'
