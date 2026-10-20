#!/bin/sh
# More than 64 runtime images (ZN-670): tests/data/many_images draws 1,000 images of 8 x 8 pixels, each its own colour, in a 40 x 25 grid; every
# cell of the frame has its colour, interpreted and compiled, and through the GL replay (ZINC_DISPLAY=gl, the renderer of the macOS window).
# Past the limit (4,096 on a desktop) createImage answers -1 with one warning, and a destroyed image frees its place.
cd "$(dirname "$0")/../.." || exit 2
command -v python3 >/dev/null || { echo "skipped: no python3"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
cells() {   # image [tolerance]: a 24-bit BMP of the GL driver (at the window's density) or a PNG
  python3 - "$1" "${2:-0}" <<'PY'
import struct, sys, importlib.machinery, importlib.util
spec = importlib.util.spec_from_loader('pd', importlib.machinery.SourceFileLoader('pd', 'tools/pngdiff')); pd = importlib.util.module_from_spec(spec); spec.loader.exec_module(pd)
p = sys.argv[1]
if p.endswith('.bmp'):   # bottom-up 24- or 32-bit BGR
    b = open(p, 'rb').read(); off = struct.unpack('<I', b[10:14])[0]; w, h = struct.unpack('<ii', b[18:26]); bpp = struct.unpack('<H', b[28:30])[0] // 8
    row = (w * bpp + 3) & ~3; h = abs(h)
    px = lambda x, y: tuple(reversed(b[off + row * (h - 1 - y) + x * bpp: off + row * (h - 1 - y) + x * bpp + 3]))
else:
    w, h, bpp, d = pd.dec(p)
    px = lambda x, y: tuple(d[(y * w + x) * bpp: (y * w + x) * bpp + 3])
k = w // 320   # the GL driver draws at the window's density
tol, bad = int(sys.argv[2]), 0
for i in range(1000):
    x, y = ((i % 40) * 8 + 4) * k, ((i // 40) * 8 + 4) * k
    got = px(x, y)
    want = ((i * 37) % 256, (i * 91) % 256, (i * 13) % 256)
    if any(abs(got[c] - want[c]) > tol for c in range(3)): bad += 1
print(f'{bad} of 1000 cells wrong')
sys.exit(1 if bad else 0)
PY
}
for r in interp native; do
  env ZINC_RUN=$r ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_FRAMES=3 ZINC_SHOT="$tmp/$r.png" "$ZINC" run tests/data/many_images >"$tmp/$r.log" 2>&1 || { echo "$r: exit $?: $(head -c 300 "$tmp/$r.log")"; fail=1; continue; }
  for l in "created 1000 of 1000" "limit: 4096 images, then -1 and -1" "one destroyed: created again yes"; do grep -qx "$l" "$tmp/$r.log" || { echo "$r: no line '$l': $(head -c 400 "$tmp/$r.log")"; fail=1; }; done
  [ "$(grep -c 'too many runtime images' "$tmp/$r.log")" = 1 ] || { echo "$r: not one warning past the limit"; fail=1; }
  out=$(cells "$tmp/$r.png") || { echo "$r: $out"; fail=1; }
done
ZINC_RENDERER=gl ZINC_DETERMINISTIC=1 ZINC_DISPLAY=gl ZINC_SCALE=1 ZINC_FRAMES=3 ZINC_SHOT="$tmp/gl.bmp" ZINC_RUN=interp timeout 90 "$ZINC" run tests/data/many_images >"$tmp/gl.log" 2>&1
if [ -s "$tmp/gl.bmp" ]; then out=$(cells "$tmp/gl.bmp" 2) || { echo "GL: $out"; fail=1; }; else echo "GL: no frame (skipped): $(head -c 200 "$tmp/gl.log")"; fi
exit $fail
