#!/bin/sh
# Hamlet: the rules headless (three engines), then a scripted mouse session in a window-less run with a picture of the village.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
export ZINC_HEADLESS=1 ZINC_BACKGROUND=1 ZINC_DETERMINISTIC=1 ZINC_APP_DATA="$tmp/data"
for engine in "" "--interp" "--engine quickjs"; do
  case "$engine" in
    --interp) ZINC_FRAMES=1 "$ZINC" run --interp tests/data/hamlet/rules.ts > "$tmp/rules" 2> "$tmp/err" ;;
    "") ZINC_FRAMES=1 "$ZINC" run tests/data/hamlet/rules.ts > "$tmp/rules" 2> "$tmp/err" ;;
    *) ZINC_FRAMES=1 "$ZINC" run tests/data/hamlet/rules.ts --engine quickjs > "$tmp/rules" 2> "$tmp/err" ;;
  esac
  [ ! -s "$tmp/err" ] || { cat "$tmp/err"; exit 1; }
  grep -q 'hamlet rules: ALL PASS' "$tmp/rules" || { cat "$tmp/rules"; exit 1; }
  grep -E 'hamlet rules: [a-z]*hash' "$tmp/rules" >> "$tmp/hashes"
done
[ -z "$(sort "$tmp/hashes" | uniq -c | awk '$1 != 3')" ] || { echo 'the state hash differs between engines:'; cat "$tmp/hashes"; exit 1; }
# the simulation never reads a clock or the system generator, and keeps to + - * / sqrt (no hypot, sin, cos, pow): determinism for replays and servers
if grep -rnE 'Math\.(random|hypot|sin|cos|pow)|Date\.' examples/hamlet/src/world examples/hamlet/src/rules examples/hamlet/src/engine | grep -v 'randomSeed'; then echo 'nondeterministic call in the simulation'; exit 1; fi
# the mouse session: roads by dragging, a house, a sawmill, a lodge; ZINC_INPUT must be an absolute path
ZINC_SIZE=1100x900 ZINC_FRAMES=3200 ZINC_INPUT="$PWD/tests/data/hamlet/session.input" \
ZINC_SHOT="$tmp/frame.png" ZINC_SHOT_FRAMES=300,2200,3150 timeout 300 "$ZINC" run examples/hamlet > "$tmp/out" 2> "$tmp/err"
[ ! -s "$tmp/err" ] || { cat "$tmp/err"; exit 1; }
grep -Eq '^hamlet:save[[:space:]]H[0-9]+;2;24;' "$tmp/data/storage.kv"
python3 - "$tmp" <<'CHECK'
from pathlib import Path
from PIL import Image, ImageChops
import sys
p = Path(sys.argv[1])
a, b = (Image.open(p / f'frame-{n}.png').convert('RGB') for n in (300, 3150))
assert a.getpixel((1000, 600)) != (255, 255, 255), 'the control column is missing'
assert ImageChops.difference(a, b).getbbox(), 'the village did not change'
assert sum(min(px) < 200 for px in b.getdata()) > 150000, 'missing diorama'
save = (p / 'data' / 'storage.kv').read_text()
fields = save.split('\t')[1].split(';')
assert fields[3] and fields[4], 'the session placed no road or building'
assert fields[1] == '2' and fields[2] == '24', 'the typed seed was not used'
assert fields[4].count(',') >= 3, 'the session should place houses, a sawmill and a lodge'
CHECK
# the work session: a road from the gate, a house and a lumberhut beside it; the villagers cut trees (felling effects, stumps) and bring logs home
rm -rf "$tmp/data"
head -7 tests/data/hamlet/session-work.input > "$tmp/new.input"
ZINC_SIZE=1100x900 ZINC_FRAMES=40 ZINC_INPUT="$tmp/new.input" timeout 120 "$ZINC" run examples/hamlet > "$tmp/out" 2> "$tmp/err"
[ ! -s "$tmp/err" ] || { cat "$tmp/err"; exit 1; }
cp "$tmp/data/storage.kv" "$tmp/before.kv"; rm -rf "$tmp/data"
ZINC_SIZE=1100x900 ZINC_FRAMES=2600 ZINC_INPUT="$PWD/tests/data/hamlet/session-work.input" \
ZINC_SHOT="$tmp/work.png" ZINC_SHOT_FRAMES=2500 timeout 120 "$ZINC" run examples/hamlet > "$tmp/out" 2> "$tmp/err"
[ ! -s "$tmp/err" ] || { cat "$tmp/err"; exit 1; }
python3 - "$tmp" <<'CHECK'
from pathlib import Path
import sys
p = Path(sys.argv[1])
def trees(name):
    return len([t for t in (p / name).read_text().split('\t')[1].split(';')[5].split(',') if t])
before, after = trees('before.kv'), trees('data/storage.kv')
assert after < before, f'no tree was felled ({before} -> {after})'
CHECK
echo 'hamlet: rules on three engines, scripted mouse session and save PASS'
