#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
export ZINC_HEADLESS=1 ZINC_WEB=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1
ZINC_FRAMES=1 "$ZINC" run tests/data/pixel-plays/rules.js --engine quickjs > "$tmp/rules" 2> "$tmp/err"
[ ! -s "$tmp/err" ] || { cat "$tmp/err"; exit 1; }
grep -q 'pixel-plays rules:.*PASS' "$tmp/rules"
ZINC_SIZE=1000x760 ZINC_FRAMES=625 ZINC_INPUT=tests/data/pixel-plays/session.input \
ZINC_SHOT="$tmp/frame.png" ZINC_SHOT_FRAMES=140,180,190,490,620 \
timeout 45 "$ZINC" run tests/data/pixel-plays/session.js --engine quickjs > "$tmp/out" 2> "$tmp/err"
[ ! -s "$tmp/err" ] || { cat "$tmp/err"; exit 1; }
for proof in 'mouse launch' 'keyboard launch' 'touch launch' '300 paused frames'; do
  grep -q "pixel-plays input: $proof PASS" "$tmp/out"
done
tools/pngdiff "$tmp/frame-140.png" tests/golden/pixel-plays/scene.png --tol 2 > "$tmp/diff" || { cat "$tmp/diff"; exit 1; }
python3 - "$tmp" <<'CHECK'
from pathlib import Path
from PIL import Image, ImageChops
import sys
p = Path(sys.argv[1])
def frame(n):
    return Image.open(p / f'frame-{n}.png').convert('RGB')
assert ImageChops.difference(frame(140), frame(180)).getbbox(), 'throw did not animate'
assert not ImageChops.difference(frame(190), frame(490)).getbbox(), 'paused image changed'
image = frame(620)
assert image.getpixel((0,0)) == (255,255,255), 'window background is not white'
assert sum(min(pixel) < 180 for pixel in image.getdata()) > 20000, 'missing diorama'
CHECK
echo 'pixel_plays: scene, rules, mouse/keyboard/touch and 300 paused frames PASS'
