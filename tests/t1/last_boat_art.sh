#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
export ZINC_HEADLESS=1 ZINC_WEB=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1
ZINC_SIZE=1000x760 ZINC_FRAMES=780 ZINC_INPUT=tests/data/pixel-plays/harbor-session.input \
ZINC_SHOT="$tmp/scene.png" ZINC_SHOT_FRAMES=10,35,90,390,450,570,770 \
timeout 45 "$ZINC" run tests/data/pixel-plays/harbor-session.js --engine quickjs > "$tmp/out" 2> "$tmp/err"
[ ! -s "$tmp/err" ] || { cat "$tmp/err"; exit 1; }
for proof in 'keyboard and cooldown' '300 frozen frames' mouse touch; do
  grep -q "last-boat: $proof PASS" "$tmp/out"
done
tools/pngdiff "$tmp/scene-10.png" tests/golden/last-boat/scene.png --tol 2 > "$tmp/diff" || { cat "$tmp/diff"; exit 1; }
python3 - "$tmp" <<'CHECK'
from pathlib import Path
from PIL import Image, ImageChops
import sys
p=Path(sys.argv[1])
def image(n):
    return Image.open(p/f'scene-{n}.png').convert('RGB')
assert ImageChops.difference(image(10),image(35)).getbbox(), 'missing throw animation'
assert not ImageChops.difference(image(90),image(390)).getbbox(), 'pause changed the image'
assert ImageChops.difference(image(390),image(450)).getbbox(), 'resume did not move the scene'
frame=image(10)
assert frame.getpixel((0,0)) == (255,255,255), 'white stage lost'
assert sum(min(pixel)<180 for pixel in frame.getdata())>40000, 'harbor missing'
# Each source pixel must be an exact 2x2 block, including the boat and animated water.
scene=frame.crop((140,100,860,660))
assert not ImageChops.difference(scene,scene.resize((360,280),Image.Resampling.NEAREST).resize((720,560),Image.Resampling.NEAREST)).getbbox(), 'pixel art was smoothed'
CHECK
echo 'last_boat_art: diorama, exact pixel enlargement, rehearsal inputs, pause and resume PASS'
