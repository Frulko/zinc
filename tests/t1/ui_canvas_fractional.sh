#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
[ -z "${ZINC_CI:-}" ] || { echo 'skipped: needs a real GPU'; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT HUP INT TERM
for cached in 0 1; do
  env -u ZINC_HEADLESS ZINC_BACKGROUND=1 ZINC_DISPLAY=gl ZINC_RENDERER=gl ZINC_GL_DMG=1 ZINC_GL_DIRECT=2 ZINC_GL_PAINT_CACHE="$cached" ZINC_GL_TRACE=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=2 ZINC_FRAMES=16 ZINC_SHOT="$tmp/$cached.bmp" timeout 90 "$ZINC" run tests/data/ui_canvas_fractional --interp > "$tmp/$cached.log" 2>&1
done
python3 - "$tmp/1.log" <<'PY'
import pathlib,re,sys
s=pathlib.Path(sys.argv[1]).read_text()
hashes=re.findall(r'zinc paint group: first=\d+ commands=\d+ hash=([0-9a-f]+)',s)
assert len(hashes)>=8 and len(set(hashes))==1,hashes
assert re.search(r'zinc paint cache: uses=[1-9]',s),s
assert 'not build' not in s,s
PY
result=$(python3 tools/glcompare "$tmp/1.bmp" "$tmp/0.bmp")
python3 - "$result" <<'PY'
import re,sys
m=re.search(r'over \d+: ([\d.]+)%, mae ([\d.]+)',sys.argv[1])
assert m and float(m[1]) <= 1 and float(m[2]) <= 1,sys.argv[1]
PY
echo 'ui_canvas_fractional: Retina translated Canvas/text subtree retains one content identity and matches uncached pixels'
