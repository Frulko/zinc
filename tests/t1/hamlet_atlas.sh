#!/bin/sh
# Hamlet's sprite atlas: the export (PNG sheets, index.json, atlas-preview.png) and the Cite view loading the shipped sheets of assets/atlas.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
export ZINC_HEADLESS=1 ZINC_BACKGROUND=1 ZINC_DETERMINISTIC=1 ZINC_HAMLET_VIEW=cite ZINC_HAMLET_STILL=1 ZINC_HAMLET="3,64,0"
ZINC_APP_DATA="$tmp/data" ZINC_SIZE=2100x1250 ZINC_FRAMES=60 ZINC_HAMLET_ATLAS_DUMP="$tmp/out" ZINC_HAMLET_ATLAS_SCALES=1 \
  timeout 300 "$ZINC" run --interp examples/hamlet > "$tmp/out.txt" 2> "$tmp/err" || { cat "$tmp/err"; exit 1; }
python3 - "$tmp/out" <<'CHECK'
import json, struct, sys, zlib
from pathlib import Path
d = Path(sys.argv[1])
idx = json.loads((d / 'index.json').read_text())
assert idx['version'] == 1 and len(idx['groups']) > 50 and len(idx['sheets']) == 8
for s in idx['sheets']:
    b = (d / '1x' / (s['name'] + '.png')).read_bytes()
    assert b[:8] == b'\x89PNG\r\n\x1a\n', s['name']
    w, h = struct.unpack('>II', b[16:24])
    assert (w, h) == (s['w'], s['h']), (s['name'], w, h)
    raw = zlib.decompress(b[b.index(b'IDAT') + 4:b.index(b'IEND') - 8])      # one IDAT: the whole picture must inflate
    assert len(raw) == h * (w * 4 + 1), s['name']
assert (d / 'atlas-preview.png').stat().st_size > 10000
CHECK
# the shipped sheets: the view loads them and draws
ZINC_APP_DATA="$tmp/data2" ZINC_SIZE=1100x900 ZINC_FRAMES=40 ZINC_HAMLET_TRACE=1 ZINC_HAMLET_CROWD=40,20 ZINC_INPUT="$PWD/tests/data/hamlet/cite.input" \
  timeout 300 "$ZINC" run --interp examples/hamlet > "$tmp/run.txt" 2> "$tmp/err2" || { cat "$tmp/err2"; exit 1; }
grep -q "atlas 1x files" "$tmp/run.txt" || { cat "$tmp/run.txt"; echo "the Cite view did not load assets/atlas"; exit 1; }
echo "hamlet atlas: ALL PASS"
