#!/bin/sh
# Gradients (ZN-261). tests/golden/style-gradient renders to its frame hash and its pixels follow the CSS definitions (tests/data/style_gradient/
# check.py: the via- gradient equals the two stacked two-stop boxes pixel for pixel; the 45-degree, radial and conic boxes match the CSS
# geometry); gfx.gradientPaint equals the chained gradient() rects pixel for pixel. The GL replay draws both within one unit of the software
# frame at the same density, the golden with no CPU tile (eight stops and fewer are the shader's). On the esp32 profile (tier T0) the
# gradients keep two stops along an axis and the conic one colour, with one log line for each.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_DETERMINISTIC=1 ZINC_FRAMES=3
export ZINC_HOME=${ZINC_HOME:-$tmp/home}
g=tests/golden/style-gradient d=tests/data/style_gradient
fail=0
h=$(ZINC_HEADLESS=1 ZINC_SCALE=1 ZINC_SIZE=780x280 ZINC_FRAMEHASH=last "$ZINC" run $g 2>&1 | grep framehash)
[ "$h" = "$(cat $g/frame.hash)" ] || { echo "style gradient: $h"; fail=1; }
ZINC_HEADLESS=1 ZINC_SCALE=1 ZINC_SIZE=780x280 ZINC_SHOT="$tmp/g.png" "$ZINC" run $g >/dev/null 2>&1
python3 $d/check.py golden "$tmp/g.png" || fail=1
ZINC_HEADLESS=1 ZINC_SCALE=1 ZINC_SIZE=400x260 ZINC_SHOT="$tmp/p.png" "$ZINC" run $d/paint.ts >/dev/null 2>&1
python3 $d/check.py paint "$tmp/p.png" || fail=1
out=$(ZINC_HEADLESS=1 ZINC_SCALE=1 ZINC_SIZE=780x280 ZINC_SHOT="$tmp/e.png" timeout 120 "$ZINC" run --profile esp32 $g 2>&1)
for l in "a gradient beyond two stops along an axis is drawn from its first to its last colour on this profile (tier T0)" \
         "a conic gradient is drawn as the average of its stops on this profile (tier T0)"; do
  [ "$(echo "$out" | grep -cF "zinc:ui: $l")" = 1 ] || { echo "esp32: not once: $l"; fail=1; }
done
python3 $d/check.py esp32 "$tmp/e.png" || fail=1
# gl <program> <size> <name>: the GL frame against the software one at the GL window's density
gl() {
  ZINC_GL_STATS=1 ZINC_RENDERER=gl ZINC_DISPLAY=gl ZINC_SIZE=$2 ZINC_SHOT="$tmp/$3.bmp" timeout 90 "$ZINC" run $1 >"$tmp/$3.log" 2>&1
  [ -s "$tmp/$3.bmp" ] || return 77
  grep -q "renderer gl:" "$tmp/$3.log" || { echo "$3: ZINC_RENDERER=gl did not start the GL renderer"; return 1; }
  k=$(python3 -c "import struct, sys; print(struct.unpack('<i', open(sys.argv[1], 'rb').read()[18:22])[0] // int(sys.argv[2]))" "$tmp/$3.bmp" "${2%x*}")
  ZINC_HEADLESS=1 ZINC_SCALE=$k ZINC_SIZE=$2 ZINC_SHOT="$tmp/$3.png" "$ZINC" run $1 >/dev/null 2>&1
  o=$(python3 tools/glcompare "$tmp/$3.bmp" "$tmp/$3.png")
  python3 - "$o" <<'PY' || { echo "$3: the GL frame differs from the software frame: $o"; return 1; }
import re, sys
m = re.search(r"scale 1, pixels over \d+: ([\d.]+)%, mae ([\d.]+)", sys.argv[1])
sys.exit(0 if m and float(m.group(1)) <= 0.01 and float(m.group(2)) <= 0.1 else 1)
PY
}
gl $g 780x280 golden; rc=$?
if [ $rc -eq 77 ]; then echo "GL skipped: no GL window here"
else
  [ $rc -eq 0 ] || fail=1
  grep -q "per frame 0.0 LINE/POLY tiles" "$tmp/golden.log" || { echo "golden: gradients drawn from CPU tiles: $(grep -o 'per frame [0-9.]* LINE/POLY tiles' "$tmp/golden.log")"; fail=1; }
  gl $d/paint.ts 400x260 paint || fail=1
fi
[ $fail -eq 0 ] && echo "style gradient: ok"
exit $fail
