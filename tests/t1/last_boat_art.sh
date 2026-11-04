#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
export ZINC_HEADLESS=1 ZINC_WEB=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1
ZINC_FRAMES=1 "$ZINC" run tests/data/pixel-plays/harbor-rules.js --engine quickjs > "$tmp/rules" 2> "$tmp/err"
[ ! -s "$tmp/err" ] || { cat "$tmp/err"; exit 1; }
grep -q 'last-boat rules:.*PASS' "$tmp/rules" || { echo "last_boat_art: the rules of the game failed: $(tail -3 "$tmp/rules")"; exit 1; }
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
assert ImageChops.difference(image(10),image(35)).getbbox(), 'missing throw animation'   # frame 10: the start screen, 35: a parcel in flight
assert not ImageChops.difference(image(90),image(390)).getbbox(), 'pause changed the image'
assert ImageChops.difference(image(390),image(450)).getbbox(), 'resume did not move the scene'
frame=image(10)
assert frame.getpixel((0,0)) == (255,255,255), 'white stage lost'
assert sum(min(pixel)<180 for pixel in frame.getdata())>40000, 'harbor missing'
# Each source pixel must be an exact 3x3 block (the 300x210 crop of the harbor at x 50, y 65), including the boat and animated water; frame 35, below the score line.
scene=image(35).crop((50,122,950,683))
assert not ImageChops.difference(scene,scene.resize((300,187),Image.Resampling.NEAREST).resize((900,561),Image.Resampling.NEAREST)).getbbox(), 'pixel art was smoothed'
CHECK
echo 'last_boat_art: harbor game, exact pixel enlargement, keyboard, mouse and touch throws, pause and resume PASS'
