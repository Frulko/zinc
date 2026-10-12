#!/bin/sh
# zinc:gfx under a matrix that only scales and moves (ZN-730, tests/data/xform_plain): a rect, a rounded rect, a border, a shadow, the
# gradients and an image (whole, rounded, a part of it) at five scales, and what has no radius under two scales, are recorded as the
# commands the program would give directly at their place and size. `matrix` draws them through gfx.setTransform, `direct` works the
# boxes out itself: the same command list, byte for byte (so the same code draws them, at the same speed), and the same frame,
# interpreted and compiled; the GL replay draws it as the software raster does (the limits of gfx_transform). Under a matrix that turns
# nothing changed: tests/t1/gfx_transform.sh keeps its golden.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
shot() {   # name interp|native mode
  env ZINC_RUN=$2 ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_FRAMES=2 ZINC_SHOT="$tmp/$1.png" ZINC_SCENE_DUMP="$tmp/$1.zscn" "$ZINC" run -q tests/data/xform_plain -- $3 >"$tmp/$1.log" 2>&1
  [ -s "$tmp/$1.png" ] && [ -s "$tmp/$1.zscn" ] || { echo "$1: no frame: $(head -c 300 "$tmp/$1.log")"; fail=1; }
}
shot matrix interp matrix
shot direct interp direct
shot native native matrix
cmp -s "$tmp/matrix.zscn" "$tmp/direct.zscn" || { echo "the commands under the matrix are not the direct ones: $(cmp "$tmp/matrix.zscn" "$tmp/direct.zscn" 2>&1 | head -1)"; fail=1; }
tools/pngdiff "$tmp/matrix.png" "$tmp/direct.png" >"$tmp/d" 2>&1 || { echo "the frame under the matrix differs from the direct one: $(head -1 "$tmp/d")"; fail=1; }
tools/pngdiff "$tmp/native.png" "$tmp/matrix.png" >"$tmp/d" 2>&1 || { echo "the compiled frame differs from the interpreted one: $(head -1 "$tmp/d")"; fail=1; }
# the scene is not empty: 5 columns of 10 commands and 3 more, after the clear
n=$(python3 -c 'import struct,sys; print(struct.unpack("<8I", open(sys.argv[1],"rb").read(32))[5])' "$tmp/matrix.zscn" 2>/dev/null)
[ "$n" = 54 ] || { echo "the frame holds $n commands, not 54"; fail=1; }
ZINC_RENDERER=gl ZINC_DETERMINISTIC=1 ZINC_DISPLAY=gl ZINC_SCALE=1 ZINC_FRAMES=3 ZINC_SHOT="$tmp/gl.bmp" ZINC_RUN=interp timeout 90 "$ZINC" run -q tests/data/xform_plain -- matrix >"$tmp/gl.log" 2>&1
if [ -s "$tmp/gl.bmp" ]; then
  out=$(python3 tools/glcompare "$tmp/gl.bmp" "$tmp/matrix.png") || { echo "GL: $out"; fail=1; }
  python3 - "$out" <<'PY' || fail=1
import re, sys
m = re.search(r"over \d+: ([\d.]+)%, mae ([\d.]+)", sys.argv[1])
if not m or float(m.group(1)) > 5 or float(m.group(2)) > 3: print("GL: the frame differs from the software one: %s (limits 5%% / 3)" % sys.argv[1]); sys.exit(1)
PY
else echo "GL replay skipped: no GL window here"; fi
[ $fail -eq 0 ] && echo "xform plain: ok"
exit $fail
