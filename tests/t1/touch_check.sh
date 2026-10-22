#!/bin/sh
# examples/touch-check on the computer: two rounds of the eight crosses tapped through a known distortion (a scale, a shear and an offset,
# rounded to whole pixels, as a panel reports them), then Again between them and Apply after: the fitted map is that distortion undone,
# it leaves the taps under a pixel off, the confidence in it is over 90%, and Apply says the system owns the touch here.
cd "$(dirname "$0")/../.." || exit 2
T=$(mktemp -d) && trap 'rm -rf "$T"' EXIT
fail=0
# the crosses of src/constants.ts, tapped at x = 0.9 tx + 0.08 ty + 6, y = 0.02 tx + 1.05 ty - 4 (rounded)
python3 - "$T/input" <<'PY'
import sys
xs = [20, 220, 120, 20, 220, 60, 180, 120]; ys = [20, 20, 160, 300, 300, 298, 298, 60]
out, f = [], 6
def tap(x, y):
    global f
    out.extend(['%d move %d %d' % (f, x, y), '%d down' % (f + 1), '%d up' % (f + 3)]); f += 5
for round_ in range(2):
    for x, y in zip(xs, ys): tap(round(0.9 * x + 0.08 * y + 6), round(0.02 * x + 1.05 * y - 4))
    tap(28 + 28, 232 + 15) if round_ == 0 else tap(28 + 64 + 28, 232 + 15)   # Again, then Apply (src/constants.ts BUTTONS_Y)
open(sys.argv[1], 'w').write('\n'.join(out) + '\n')
PY
ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=100 ZINC_INPUT="$T/input" "$ZINC" run examples/touch-check > "$T/log" 2>&1 || { echo "touch_check: the demo failed"; tail -20 "$T/log"; fail=1; }
# the map undoing the distortion: x = 1.112 rx - 0.085 ry - 7.0, y = -0.021 rx + 0.954 ry + 3.9
grep -q "^touch: round 2, 16 taps: off by .* x = 1.11[0-9] rx -0.08[4-6] ry -[67]\.[0-9], y = -0.02[0-2] rx +0.95[3-5] ry +[34]\.[0-9] leaves 0\.[0-9] px (0\.[0-9] at most); confidence 9[0-9]%" "$T/log" ||
  { echo "touch_check: expected round 2 to fit the distortion back with a confidence over 90%:"; grep "^touch:" "$T/log" | tail -4; fail=1; }
grep -q "^touch: the system owns this touch: the map is shown, not applied$" "$T/log" || { echo "touch_check: Apply did not answer"; grep "^touch:" "$T/log" | tail -2; fail=1; }
exit $fail
