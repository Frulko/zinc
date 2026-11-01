#!/bin/sh
# Hamlet windows: F3 shows the technical overlay then the window, windows stack (a press on one brings it to the front), Esc closes the topmost first.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
export ZINC_HEADLESS=1 ZINC_BACKGROUND=1 ZINC_DETERMINISTIC=1 ZINC_APP_DATA="$tmp/data"
ZINC_SIZE=1100x900 ZINC_FRAMES=90 ZINC_INPUT="$PWD/tests/data/hamlet/windows.input" \
ZINC_SHOT="$tmp/f.png" ZINC_SHOT_FRAMES=20,50,65,85 timeout 120 "$ZINC" run examples/hamlet > "$tmp/out" 2> "$tmp/err"
[ ! -s "$tmp/err" ] || { cat "$tmp/err"; exit 1; }
python3 - "$tmp" <<'CHECK'
from pathlib import Path
from PIL import Image, ImageChops
import sys
p = Path(sys.argv[1])
f = {n: Image.open(p / f'f-{n}.png').convert('RGB') for n in (20, 50, 65, 85)}
def diff(a, b, box):
    d = ImageChops.difference(f[a].crop(box), f[b].crop(box)).convert('L')
    return sum(1 for v in d.getdata() if v > 24)
compact = diff(20, 85, (8, 42, 308, 140))             # F3 once: the compact overlay
debug_only = (790, 420, 850, 560)                       # inside the debug window, outside the campaign window
campaign_only = (205, 300, 255, 420)                    # inside the campaign window, outside the debug window
assert compact > 2000, f'F3 drew no overlay ({compact})'
assert diff(50, 85, debug_only) > 3000, 'the debug window is missing when stacked (the press must bring it to the front)'
assert diff(50, 85, campaign_only) > 1000, 'the campaign window did not stack with the debug window'
assert diff(65, 85, debug_only) < 1500, 'Esc did not close the topmost window (the debug window)'
assert diff(65, 85, campaign_only) > 1000, 'Esc closed the wrong window: the campaign window must remain'
CHECK
echo 'hamlet windows: F3 overlay, stacking, click to front and Esc order PASS'
