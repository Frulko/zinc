#!/bin/sh
# A picture in device memory on a hardware layer of the display, and its fallback (ZN-731, tests/data/video_layers). The test's display
# driver composes the frame over the picture as a plane does; the same program runs on the same driver without layers, where the
# rasterizer draws the picture from its pixels, and the two frames are compared.
# - plain: the upright image goes to the layer and its pixels are never asked for; the opaque box, the rounded box, the translucent
#   timeline and the shadow drawn after it are in front of it, within 2 levels of the software frame (the blend's rounding).
# - turned, blend, round, part: no layer is offered, the pixels are asked for once, and the frame is the software one, byte for byte.
cd "$(dirname "$0")/../.." || exit 2
command -v c++ >/dev/null || { echo "no C++ compiler for the test's display driver"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME=${ZINC_HOME:-$tmp/home}
fail=0
shot() {   # mode on|off
  env LAYERTEST=$2 LAYERTEST_OUT="$tmp/$1-$2.ppm" ZINC_DISPLAY=layertest ZINC_LAYER_LOG=1 ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_FRAMES=4 ZINC_RUN=interp \
    timeout 120 "$ZINC" run -q tests/data/video_layers -- $1 >"$tmp/$1-$2.log" 2>&1
  [ -s "$tmp/$1-$2.ppm" ] || { echo "$1 ($2): no frame: $(head -c 300 "$tmp/$1-$2.log")"; fail=1; }
}
for m in plain turned blend round part; do shot $m on; shot $m off; done
[ $fail -eq 0 ] || exit 1
grep -q "is on a hardware layer of the display" "$tmp/plain-on.log" || { echo "plain: the picture did not go to a layer: $(grep -E 'gfx:|layertest' "$tmp/plain-on.log" | head -3)"; fail=1; }
grep -q "layertest: layers offered [1-9][0-9]*, pixels asked 0$" "$tmp/plain-on.log" || { echo "plain: $(grep layertest "$tmp/plain-on.log")"; fail=1; }
for m in turned blend round part; do
  grep -q "layertest: layers offered 0, pixels asked 1$" "$tmp/$m-on.log" || { echo "$m: $(grep layertest "$tmp/$m-on.log")"; fail=1; }
  grep -q "is drawn in software" "$tmp/$m-on.log" || { echo "$m: nothing says it is drawn in software"; fail=1; }
  cmp -s "$tmp/$m-on.ppm" "$tmp/$m-off.ppm" || { echo "$m: the frame is not the software one"; fail=1; }
done
grep -q "it is turned" "$tmp/turned-on.log" && grep -q "it is blended" "$tmp/blend-on.log" || { echo "the reasons of turned and blend are not the ones expected"; fail=1; }
python3 - "$tmp/plain-on.ppm" "$tmp/plain-off.ppm" <<'PY' || fail=1
import sys
def ppm(p):
    b = open(p, "rb").read()
    head = b.split(b"\n", 3)
    w, h = map(int, head[1].split())
    return w, h, head[3]
w, h, a = ppm(sys.argv[1]); _, _, b = ppm(sys.argv[2])
px = lambda d, x, y: tuple(d[(y * w + x) * 3:(y * w + x) * 3 + 3])
worst = max(abs(p - q) for p, q in zip(a, b))
differ = sum(1 for i in range(0, len(a), 3) if a[i:i + 3] != b[i:i + 3])
ok = worst <= 2
# the picture itself comes through the hole untouched; the opaque box and the timeline's blue part are the frame's pixels
for (x, y), want in {(110, 60): px(b, 110, 60), (85, 70): (0xdc, 0x26, 0x26), (100, 133): (0x25, 0x63, 0xeb)}.items():
    if px(a, x, y) != want: ok = False; print("plain: pixel %d,%d is %s, not %s" % (x, y, px(a, x, y), want))
# the translucent timeline lets the picture through: not black, not the picture alone
if px(a, 200, 133) == (0, 0, 0) or px(a, 200, 133) == px(a, 200, 120): ok = False; print("plain: the timeline is not blended with the picture: %s" % (px(a, 200, 133),))
if not ok: print("plain: the frame over the layer differs from the software one by up to %d levels (%d pixels differ; limit 2)" % (worst, differ))
sys.exit(0 if ok else 1)
PY
[ $fail -eq 0 ] && echo "video layers: ok"
exit $fail
