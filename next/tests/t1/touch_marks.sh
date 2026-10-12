#!/bin/sh
# The fingers of a touch screen are drawn where they press (runtime/gfx.cpp taps_update): with ZINC_TOUCHES=1 a frame with two fingers down
# differs from the same frame without them exactly around the two fingers; a deterministic run without the switch shows none (the goldens).
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
shot() {   # $1 name, $2 extra environment
  env $2 ZINC_INPUT=tests/golden/ui/spread.input ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=320x240 ZINC_FRAMES=6 ZINC_SHOT="$tmp/$1.png" "$ZINC" run --interp tests/golden/ui/spread.tsx >/dev/null 2>"$tmp/err" || { echo "touch_marks: $1 did not run: $(head -c 300 "$tmp/err")"; exit 1; }
}
shot off "ZINC_TOUCHES=0"; shot unset ""; shot on "ZINC_TOUCHES=1"
python3 tools/pngdiff "$tmp/off.png" "$tmp/unset.png" >/dev/null || { echo "touch_marks: a deterministic run drew the fingers without being asked"; exit 1; }
box=$(python3 tools/pngdiff "$tmp/off.png" "$tmp/on.png" --bbox | grep '^bbox')
# fingers at (100, 100) and (300, 100), a 26 pixel disc each: the differing pixels lie within x 73..327, y 73..127 and reach both fingers
set -- $box
[ -n "$box" ] && [ "$2" -ge 73 ] && [ "$2" -le 76 ] && [ "$3" -ge 73 ] && [ "$4" -ge 318 ] && [ "$4" -le 328 ] && [ "$5" -le 128 ] || { echo "touch_marks: the marks are not around the two fingers: $box"; exit 1; }
echo "touch_marks: ok"
