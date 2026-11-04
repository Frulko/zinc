#!/bin/sh
# The Metal renderer (ZINC_RENDERER=metal, targets/macos/hal_metal.mm): tests/data/image_alpha draws a transparent render target on the GPU (a pass over an
# MTLTexture, alpha blended, nearest sheet, partial update, clearImage); the frame the GPU presents (ZINC_METAL_SHOT, a BMP of the drawable) is the software
# frame's within 8 levels on any channel and a mean error under 0.5. Opens a window: skipped where there is no Metal.
cd "$(dirname "$0")/../.." || exit 2
[ "$(uname)" = Darwin ] || { echo "skipped: not macOS"; exit 77; }
command -v python3 >/dev/null || { echo "skipped: no python3"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME=${ZINC_HOME:-$tmp/home} ZINC_BACKGROUND=1 ZINC_AUDIO=null
d=tests/data/image_alpha
env -u ZINC_DETERMINISTIC ZINC_METAL_LOG=1 ZINC_METAL_SHOT="$tmp/m-%d.bmp" ZINC_RENDERER=metal ZINC_FRAMES=3 ZINC_SIZE=200x100 ZINC_SCALE=1 timeout 90 "$ZINC" run --interp $d/main.ts >"$tmp/m.log" 2>&1
[ -s "$tmp/m-1.bmp" ] || { echo "skipped: no Metal window here"; exit 77; }
grep -q "1 passes" "$tmp/m.log" || { echo "metal_replay: the render target was not drawn on the GPU: $(tail -3 "$tmp/m.log")"; exit 1; }
ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=200x100 ZINC_SCALE=1 ZINC_SHOT_FRAMES=1,3 ZINC_SHOT="$tmp/s.png" "$ZINC" run --interp $d/main.ts >/dev/null 2>&1
for n in 1 3; do
  o=$(python3 tools/glcompare "$tmp/m-$n.bmp" "$tmp/s-$n.png") || { echo "metal_replay: frame $n: $o"; exit 1; }
  python3 - "$o" "$n" <<'PY' || exit 1
import re, sys
m = re.search(r"mae ([\d.]+), max (\d+)", sys.argv[1])
if not m or float(m.group(1)) > 0.5 or int(m.group(2)) > 8: print("metal_replay: frame %s differs from the software frame: %s" % (sys.argv[2], sys.argv[1])); sys.exit(1)
PY
done
echo "metal_replay: ok ($o)"
