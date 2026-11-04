#!/bin/sh
# Hamlet's sprite atlas, two modes with the same frames: `computed` (baked from the generators of the old view: the Pixel Plays models, figures and light) and
# `files` (the exported PNG sheets of assets/atlas). The test bakes and exports, compares the export with the shipped sheets byte for byte (so the shipped files are
# what the generators make now, the generator hash included), checks that a baked person and house equal the old view's own frames, and that a picture drawn from the
# files equals one drawn from the generators (1x and 2x sets). It also exports a single group (ZINC_HAMLET_ATLAS_ONLY).
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
export ZINC_HEADLESS=1 ZINC_BACKGROUND=1 ZINC_DETERMINISTIC=1 ZINC_HAMLET_VIEW=cite ZINC_HAMLET_STILL=1 ZINC_HAMLET="3,64,0"
# 1. bake from the generators and export (1x), and the pipeline check
ZINC_APP_DATA="$tmp/data" ZINC_SIZE=3400x1500 ZINC_FRAMES=60 ZINC_HAMLET_ATLAS_DUMP="$tmp/out" ZINC_HAMLET_ATLAS_SCALES=1 ZINC_HAMLET_ATLAS_CHECK=1 \
  timeout 300 "$ZINC" run --interp examples/hamlet > "$tmp/out.txt" 2> "$tmp/err" || { cat "$tmp/err"; exit 1; }
grep -q "atlas check: [0-9]* lit pixels, 0 differ" "$tmp/out.txt" || { cat "$tmp/out.txt"; echo "a baked frame differs from the old view's frame"; exit 1; }
python3 - "$tmp/out" "$PWD/examples/hamlet/assets/atlas" <<'CHECK'
import json, struct, sys, zlib
from pathlib import Path
d, shipped = Path(sys.argv[1]), Path(sys.argv[2])
idx = json.loads((d / 'index.json').read_text())
assert idx['version'] == 2 and len(idx['groups']) > 90 and len(idx['sheets']) == 8
assert all('generator' in g for g in idx['groups'])
ship = json.loads((shipped / 'index.json').read_text())
assert ship['generator'] == idx['generator'], 'assets/atlas was exported by other generators: re-export it (examples/hamlet/ASSETS.md)'
assert ship['groups'] == idx['groups'] and ship['sheets'] == idx['sheets']
for s in idx['sheets']:
    b = (d / '1x' / (s['name'] + '.png')).read_bytes()
    assert b[:8] == b'\x89PNG\r\n\x1a\n', s['name']
    w, h = struct.unpack('>II', b[16:24])
    assert (w, h) == (s['w'], s['h']), (s['name'], w, h)
    raw = zlib.decompress(b[b.index(b'IDAT') + 4:b.index(b'IEND') - 8])      # one IDAT: the whole picture must inflate
    assert len(raw) == h * (w * 4 + 1), s['name']
    assert b == (shipped / '1x' / (s['name'] + '.png')).read_bytes(), s['name'] + ': the shipped sheet is not what the generators bake'
assert (d / 'atlas-preview.png').stat().st_size > 10000
CHECK
# 2. one group only: the other cells stay empty
ZINC_APP_DATA="$tmp/data" ZINC_SIZE=3400x1500 ZINC_FRAMES=60 ZINC_HAMLET_ATLAS_DUMP="$tmp/one" ZINC_HAMLET_ATLAS_SCALES=1 ZINC_HAMLET_ATLAS_ONLY=building/house \
  timeout 300 "$ZINC" run --interp examples/hamlet > "$tmp/one.txt" 2> "$tmp/err" || { cat "$tmp/err"; exit 1; }
[ "$(wc -c < "$tmp/one/1x/people.png")" -lt "$(( $(wc -c < "$tmp/out/1x/people.png") / 4 ))" ] || { echo "ZINC_HAMLET_ATLAS_ONLY baked groups it was not asked for"; exit 1; }
[ "$(wc -c < "$tmp/one/1x/buildings.png")" -gt 3000 ] && [ "$(wc -c < "$tmp/one/1x/buildings.png")" -lt "$(wc -c < "$tmp/out/1x/buildings.png")" ] || { echo "ZINC_HAMLET_ATLAS_ONLY baked nothing"; exit 1; }
# 3. the two modes draw the same picture: files, and computed (zoom 1 and 2.5: the 1x and the 2x sets)
for cam in "" "40,24,2.5"; do
  for m in files computed; do
    ZINC_APP_DATA="$tmp/data-$m-${cam:-0}" ZINC_SIZE=1100x900 ZINC_FRAMES=60 ZINC_HAMLET_TRACE=1 ZINC_HAMLET_CROWD=40,20 ZINC_HAMLET_CAM="$cam" ZINC_HAMLET_ATLAS=$m ZINC_INPUT="$PWD/tests/data/hamlet/cite.input" \
      ZINC_SHOT="$tmp/$m-${cam:-0}.png" ZINC_SHOT_FRAMES=59 timeout 300 "$ZINC" run --interp examples/hamlet > "$tmp/run-$m.txt" 2> "$tmp/err2" || { cat "$tmp/err2"; exit 1; }
  done
  grep -q "atlas 1x files" "$tmp/run-files.txt" || { cat "$tmp/run-files.txt"; echo "the Cite view did not load assets/atlas"; exit 1; }
  grep -q "atlas 1x computed" "$tmp/run-computed.txt" || { cat "$tmp/run-computed.txt"; echo "the Cite view did not bake from the generators"; exit 1; }
  cmp "$tmp/files-${cam:-0}-59.png" "$tmp/computed-${cam:-0}-59.png" || { echo "files and computed draw different pictures (cam '$cam')"; exit 1; }
done
echo "hamlet atlas: ALL PASS"
