#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
[ -z "${ZINC_CI:-}" ] || { echo 'skipped: needs a real GPU'; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT HUP INT TERM
env -u ZINC_DISPLAY ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_FRAMES=3 ZINC_SHOT="$tmp/sw.png" "$ZINC" run tests/data/gl_clip_pixels --interp > "$tmp/sw.log" 2>&1
for mode in analytic sampled tiles; do
  sampled=0; poly=1
  [ "$mode" != sampled ] || sampled=1
  if [ "$mode" = tiles ]; then sampled=1; poly=0; fi
  env -u ZINC_HEADLESS ZINC_BACKGROUND=1 ZINC_DISPLAY=gl ZINC_RENDERER=gl ZINC_GL_MASK_CLIP="$sampled" ZINC_GL_POLY="$poly" ZINC_GL_CLIP_DEPTH="$sampled" ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_FRAMES=3 ZINC_SHOT="$tmp/gl.bmp" timeout 90 "$ZINC" run tests/data/gl_clip_pixels --interp > "$tmp/gl.log" 2>&1
  [ -s "$tmp/gl.bmp" ] || { cat "$tmp/gl.log"; exit 1; }
  result=$(python3 tools/glcompare "$tmp/gl.bmp" "$tmp/sw.png")
  python3 - "$result" <<'PY'
import re,sys
m=re.search(r'over \d+: ([\d.]+)%, mae ([\d.]+)',sys.argv[1])
assert m and float(m[1]) <= 5 and float(m[2]) <= 3, sys.argv[1]
PY
done
echo 'gl_clip_pixels: analytic/sampled clips, nested fractional edges, cache eviction and transformed borders match the software reference'
