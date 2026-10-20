#!/bin/sh
# zinc:gl (ZN-562.01): examples/gl-cube draws its textured, lit cube with WebGL from compiled Zinc code, interpreted and built with zinc build, and both
# give the same frame; a program that does not import zinc:gl loads nothing of WebGL (zinc) and links none of it (AOT).
cd "$(dirname "$0")/../.." || exit 2
command -v c++ >/dev/null || { echo "skipped: no C++ compiler"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
env="ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=30 ZINC_FRAMEHASH=last"
fail=0
a=$(env $env ZINC_SHOT="$tmp/cube.png" "$ZINC" run ../examples/gl-cube --interp 2>&1)
case "$a" in *"no WebGL"*) echo "skipped: no WebGL context on this machine"; exit 77 ;; esac
a=$(echo "$a" | grep framehash)
[ -n "$a" ] || { echo "no frame from the interpreter"; exit 1; }
"$ZINC" build ../examples/gl-cube -o "$tmp/cube" >"$tmp/build.out" 2>&1 || { echo "zinc build failed: $(tail -5 "$tmp/build.out")"; exit 1; }
b=$(env $env "$tmp/cube" 2>&1 | grep framehash)
[ "$a" = "$b" ] || { echo "interpreter and AOT frames differ: '$a' / '$b'"; fail=1; }
python3 - "$tmp/cube.png" <<'P' || fail=1   # the cube is there: lit checker squares in the middle of the frame
import importlib.machinery, sys
dec = importlib.machinery.SourceFileLoader('pngdiff', 'tools/pngdiff').load_module().dec   # the full decoder (every filter)
w, h, bpp, px = dec(sys.argv[1])
colours = {px[(y * w + x) * bpp:(y * w + x) * bpp + 3] for y in range(h // 3, 2 * h // 3, 7) for x in range(w // 3, 2 * w // 3, 5)}
if len(colours) < 4: print('the cube is not drawn: %d colours in the middle' % len(colours)); sys.exit(1)
P
out=$(DYLD_PRINT_LIBRARIES=1 ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=3 "$ZINC" run ../examples/bouncing-ball --interp 2>&1)
echo "$out" | grep -q "libzn_webgl" && { echo "a program without zinc:gl loaded libzn_webgl"; fail=1; }
"$ZINC" build ../examples/bouncing-ball -o "$tmp/bb" >/dev/null 2>&1 || { echo "zinc build of bouncing-ball failed"; fail=1; }
nm "$tmp/bb" 2>/dev/null | grep -q "zn_webgl_host\|glad_gl" && { echo "a program without zinc:gl links WebGL"; fail=1; }
[ $fail -eq 0 ] && echo "gl cube: ok"
exit $fail
