#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
[ -z "${ZINC_CI:-}" ] || { echo 'skipped: needs a real GPU'; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT HUP INT TERM
for frame in 3 7 11; do
  for cached in 0 1; do
    env -u ZINC_HEADLESS ZINC_BACKGROUND=1 ZINC_DISPLAY=gl ZINC_RENDERER=gl ZINC_GL_PAINT_CACHE="$cached" ZINC_GL_MASK_CLIP=1 ZINC_GL_CLIP_DEPTH=1 ZINC_GL_TRACE=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=2 ZINC_FRAMES="$frame" ZINC_SHOT="$tmp/$cached.bmp" timeout 90 "$ZINC" run tests/data/gl_paint_cache --interp > "$tmp/$cached.log" 2>&1
  done
  if rg -q "shader:|not build" "$tmp/1.log"; then cat "$tmp/1.log"; exit 1; fi
  result=$(python3 tools/glcompare "$tmp/1.bmp" "$tmp/0.bmp")
  python3 - "$result" <<'PY'
import re,sys
m=re.search(r'over \d+: ([\d.]+)%, mae ([\d.]+)',sys.argv[1])
assert m and float(m[1]) <= 1 and float(m[2]) <= 1,sys.argv[1]
PY
  rg -q 'zinc paint cache: uses=[1-9]' "$tmp/1.log" || { cat "$tmp/1.log"; exit 1; }
done
echo 'gl_paint_cache: Retina cold/hit, fractional translation, invalidation, premultiplied alpha and nested clipping match uncached rendering'
