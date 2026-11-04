#!/bin/sh
# Pixel Plays, the pit stop, the spaceship and the rocket launch (day and night), through the real native entry: a scripted run of each, a golden frame, the frames that must move and the white page.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
# ZINC_INPUT is opened from the working directory of the run, which is not this one: its path stays absolute
# a fresh store: the best scores shown on the page must not depend on the machine's earlier games
export ZINC_STORAGE="$tmp/storage.json"
export ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=1000x760 ZINC_BACKGROUND=1
ZINC_FRAMES=620 ZINC_INPUT="$PWD/tests/data/pixel-plays/pitstop-session.input" ZINC_SHOT="$tmp/pit.png" ZINC_SHOT_FRAMES=2,120,230,330,400,470,600 \
  timeout 120 "$ZINC" run examples/pixel-plays/src/native/main.ts -- pitstop > "$tmp/pit.out" 2> "$tmp/pit.err"
ZINC_FRAMES=300 ZINC_INPUT="$PWD/tests/data/pixel-plays/odyssey-session.input" ZINC_SHOT="$tmp/space.png" ZINC_SHOT_FRAMES=2,50,200 \
  timeout 120 "$ZINC" run examples/pixel-plays/src/native/main.ts -- odyssey > "$tmp/space.out" 2> "$tmp/space.err"
ZINC_FRAMES=640 ZINC_INPUT="$PWD/tests/data/pixel-plays/rocket-session.input" ZINC_SHOT="$tmp/rocket.png" ZINC_SHOT_FRAMES=2,150,330,450,620 \
  timeout 120 "$ZINC" run examples/pixel-plays/src/native/main.ts -- rocket > "$tmp/rocket.out" 2> "$tmp/rocket.err"
ZINC_FRAMES=340 ZINC_INPUT="$PWD/tests/data/pixel-plays/rocket-night-session.input" ZINC_SHOT="$tmp/night.png" ZINC_SHOT_FRAMES=2,330 \
  timeout 120 "$ZINC" run examples/pixel-plays/src/native/main.ts -- rocket > "$tmp/night.out" 2> "$tmp/night.err"
for f in pit space rocket night; do [ ! -s "$tmp/$f.err" ] || { cat "$tmp/$f.err"; exit 1; }; done
tools/pngdiff "$tmp/pit-230.png" tests/golden/pixel-plays/pitstop-service.png --tol 2 > "$tmp/diff" || { cat "$tmp/diff"; exit 1; }
tools/pngdiff "$tmp/pit-470.png" tests/golden/pixel-plays/pitstop-launch.png --tol 2 > "$tmp/diff" || { cat "$tmp/diff"; exit 1; }
tools/pngdiff "$tmp/rocket-450.png" tests/golden/pixel-plays/rocket-launch.png --tol 2 > "$tmp/diff" || { cat "$tmp/diff"; exit 1; }
tools/pngdiff "$tmp/space-50.png" tests/golden/pixel-plays/odyssey.png --tol 2 > "$tmp/diff" || { cat "$tmp/diff"; exit 1; }
python3 - "$tmp" <<'CHECK'
from pathlib import Path
from PIL import Image, ImageChops
import sys
p = Path(sys.argv[1])
def frame(name, n): return Image.open(p / f'{name}-{n}.png').convert('RGB')
def moved(name, a, b): return ImageChops.difference(frame(name, a), frame(name, b)).getbbox() is not None
assert moved('pit', 2, 120), 'the car did not arrive'
assert moved('pit', 230, 330), 'the crew did not work'
assert moved('pit', 400, 470), 'the car did not leave'
assert moved('pit', 470, 600), 'the crew did not walk back'
assert moved('space', 2, 200), 'the ship does not turn'
assert moved('rocket', 2, 150), 'the countdown does not show'
assert moved('rocket', 330, 450), 'the engines did not light'
assert moved('rocket', 450, 620), 'the rocket did not climb'
def dark(name, n):
    scene = frame(name, n).crop((170, 154, 830, 606)).convert('L')
    return sum(scene.getdata()) / (660 * 452)
assert dark('night', 330) < dark('rocket', 330) - 40, 'night is not darker than day'
for name, n in (('pit', 230), ('space', 50), ('rocket', 450), ('night', 330)):
    image = frame(name, n)
    assert image.getpixel((0, 0)) == (255, 255, 255), 'the page lost its white'
    assert sum(1 for pixel in image.getdata() if max(pixel) < 120) > 30000, name + ' scene missing'
    scene = image.crop((170, 154, 830, 606))
    assert not ImageChops.difference(scene, scene.resize((330, 226), Image.Resampling.NEAREST).resize((660, 452), Image.Resampling.NEAREST)).getbbox(), 'pixels were smoothed'
CHECK
grep -q 'pixel-plays: native TypeScript, pitstop' "$tmp/pit.out"
echo 'pixel_plays_scenes: pit stop run, spaceship, rocket launch day and night, golden frames, exact pixels PASS'
