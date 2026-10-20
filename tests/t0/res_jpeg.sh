#!/bin/sh
# JPEG assets (ZN-105): a .jpg in the assets directory is decoded (stb_image: PNG, JPEG, BMP, GIF) and baked like a PNG.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
"$ZINC" bake tests/golden/res_jpeg/main.ts -o "$tmp/blob.bin" || { echo "zinc bake failed on a JPEG"; exit 1; }
python3 - "$tmp/blob.bin" <<'PY' || { echo "the JPEG was not baked as expected"; exit 1; }
import struct, sys
b = open(sys.argv[1], 'rb').read(); p = 4
def u32():
    global p
    v = struct.unpack_from('<I', b, p)[0]; p += 4; return v
def s32():
    global p
    v = struct.unpack_from('<i', b, p)[0]; p += 4; return v
def string():
    global p
    n = u32(); s = b[p:p+n].decode(); p += n; return s
for _ in range(u32()):
    string(); [s32() for _ in range(4)]
    ng = u32(); p += ng * 28; nb = u32(); p += nb
imgs = {}
for _ in range(u32()):
    n = string(); w = s32(); h = s32(); sc = s32(); px = b[p:p+w*h*4]; p += w*h*4
    imgs[n] = (w, h, px)
w, h, px = imgs['photo.jpg']
assert (w, h) == (24, 16), (w, h)
def at(x, y): o = (y * w + x) * 4; return px[o], px[o+1], px[o+2]
for (x, y, want) in [(2, 8, (20, 104, 90)), (20, 8, (200, 104, 220))]:   # the gradient of the fixture, within JPEG's loss
    got = at(x, y)
    assert all(abs(g - e) <= 14 for g, e in zip(got, want)), (x, y, got, want)
PY
