#!/bin/sh
# Hamlet's Cité view (ZINC_HAMLET_VIEW=cite): a few frames on the interpreter and AOT, a picture of each that must show the drawn world.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
export ZINC_HEADLESS=1 ZINC_BACKGROUND=1 ZINC_DETERMINISTIC=1 ZINC_HAMLET_VIEW=cite ZINC_HAMLET_STILL=1 ZINC_HAMLET_CROWD=40,20 ZINC_HAMLET="3,64,0"
for engine in --interp --native; do
  ZINC_APP_DATA="$tmp/data$engine" ZINC_SIZE=1100x900 ZINC_FRAMES=120 ZINC_INPUT="$PWD/tests/data/hamlet/cite.input" \
  ZINC_SHOT="$tmp/frame$engine.png" ZINC_SHOT_FRAMES=119 timeout 300 "$ZINC" run "$engine" examples/hamlet > "$tmp/out" 2> "$tmp/err"
  [ ! -s "$tmp/err" ] || { cat "$tmp/err"; exit 1; }
done
python3 - "$tmp" <<'CHECK'
from pathlib import Path
from PIL import Image
import sys
p = Path(sys.argv[1])
for e in ('--interp', '--native'):
    im = Image.open(p / f'frame{e}-119.png').convert('RGB')
    cols = len(set(im.resize((110, 90)).getdata()))
    assert cols > 150, f'{e}: the Cité view looks empty ({cols} colours)'
print('hamlet cite: ALL PASS')
CHECK
