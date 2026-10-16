#!/bin/sh
# zinc:gfx imageFromPixels / updateImage and ImageFlag.Smooth (ZN-746), headless on the software raster: the image is made from RGBA bytes
# (and refused from too few), updateImage replaces its pixels (frame 3 shows the mirror, frame 4's short update changes nothing), and the
# smooth stretch of a black-to-white step is a ramp whose slope changes gradually (no kink at the texel centres, where the linear one has two).
cd "$(dirname "$0")/../.." || exit 2
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
out=$(ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=200x100 ZINC_SCALE=1 ZINC_SHOT_FRAMES=2,3,4 ZINC_SHOT="$t/f.png" "$ZINC" run --interp tests/data/image_pixels/main.ts 2>&1)
case "$out" in *"image true 4 1 too few bytes -1 empty -1"*) ;; *) echo "image_pixels: $out"; exit 1 ;; esac
python3 - "$t" <<'EOF' || exit 1
import sys, importlib.util, importlib.machinery
loader = importlib.machinery.SourceFileLoader('pngdiff', 'tools/pngdiff')
spec = importlib.util.spec_from_loader('pngdiff', loader); m = importlib.util.module_from_spec(spec); loader.exec_module(m)
def row(path, y):   # the red channel of row y
    w, h, bpp, px = m.dec(path)
    return [px[(y * w + x) * bpp] for x in range(w)]
t = sys.argv[1]
s2, l2 = row(t + '/f-2.png', 25), row(t + '/f-2.png', 75)
s3, s4 = row(t + '/f-3.png', 25), row(t + '/f-4.png', 25)
fail = []
if not (s2[0] < 40 and s2[-1] > 215 and all(s2[i] <= s2[i + 1] for i in range(199))): fail.append('smooth: not a rising ramp %s' % s2[::20])
if not (s3[0] > 215 and s3[-1] < 40): fail.append('updateImage: frame 3 is not the mirror %s' % s3[::20])
if s4 != s3: fail.append('updateImage with too few bytes changed the image')
# second differences: the linear stretch bends sharply at the texel centres (x 25 and 75 of each 50), the spline never does
# (over 4 pixels, above the rounding: a kink of the linear stretch changes the slope by 5 a pixel, the spline's curve by about 0.1)
d2 = lambda r: max(abs(r[i - 4] - 2 * r[i] + r[i + 4]) for i in range(30, 170))
if not (d2(l2) >= 12 and d2(s2) <= 6): fail.append('kinks: linear %d, smooth %d' % (d2(l2), d2(s2)))
print('\n'.join('image_pixels: ' + f for f in fail)) if fail else None
sys.exit(1 if fail else 0)
EOF
# the same frames on QuickJS (the host rows are the same table)
h() { ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=200x100 ZINC_FRAMEHASH=last "$ZINC" run tests/data/image_pixels/main.ts $1 2>&1 | grep framehash; }
[ "$(h --interp)" = "$(h '--engine quickjs')" ] || { echo "image_pixels: QuickJS draws another frame: $(h '--engine quickjs')"; exit 1; }
echo "image_pixels: ok"
