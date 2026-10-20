#!/usr/bin/env python3
"""xform_check.py <frame.png|frame.bmp> <sheet.png> [slack]: the nearest sprites xform.ts draws through a matrix, against the sheet (ZN-432).
For each pixel of the frame the centre goes back through the inverse of the sprite's matrix; where it lands inside a texel of frame 0, a
local pixel away from the texel's and the sprite's edges (so neither the edge's coverage nor a neighbouring texel is involved), the pixel
is that texel, mirrored by the flags. A frame larger than 400x180 by a whole factor (the GL window) is averaged down first."""
import importlib.machinery, importlib.util, os, struct, sys

tools = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "tools")
l = importlib.machinery.SourceFileLoader("pngdiff", os.path.join(tools, "pngdiff")); s = importlib.util.spec_from_loader("pngdiff", l); pd = importlib.util.module_from_spec(s); l.exec_module(pd)
W, H = 400, 180

def load(p):   # width, height, RGB bytes
    if not p.lower().endswith(".bmp"):
        w, h, bpp, d = pd.dec(p)
        return w, h, d if bpp == 3 else b"".join(d[k:k + 3] for k in range(0, len(d), 4))
    d = open(p, "rb").read(); off = struct.unpack("<I", d[10:14])[0]; w, h = struct.unpack("<ii", d[18:26]); bpp = struct.unpack("<H", d[28:30])[0] // 8
    row = (w * bpp + 3) & ~3; out = bytearray()
    for y in range(abs(h)):
        o = off + row * (h - 1 - y if h > 0 else y)
        for x in range(w): out += bytes((d[o + x * bpp + 2], d[o + x * bpp + 1], d[o + x * bpp]))
    return w, abs(h), bytes(out)

fw, fh, fd = load(sys.argv[1]); sw, sh, sb, sd = pd.dec(sys.argv[2])
slack = int(sys.argv[3]) if len(sys.argv) > 3 else 0
if fw % W or fh % H or fw // W != fh // H: sys.exit("the frame is %dx%d, not a multiple of %dx%d" % (fw, fh, W, H))
K = fw // W
def frame(x, y):
    acc = [0, 0, 0]
    for j in range(K):
        for i in range(K):
            o = ((y * K + j) * fw + x * K + i) * 3
            for c in range(3): acc[c] += fd[o + c]
    return tuple(v // (K * K) for v in acc)
def texel(x, y): o = (y * sw + x) * 4; return tuple(sd[o:o + 3])

# cx, cy, cos, sin, scale x, scale y, flip x, flip y: the first five sprites of xform.ts (frame 0 on -16, -16, 32, 32, four local pixels a texel)
SPRITES = [(40, 44, 0.8, 0.6, 1, 1, 0, 0), (120, 44, 1, 0, 2, 0.75, 0, 0), (210, 44, 0.8, 0.6, 1.5, 0.75, 0, 0), (290, 44, 0.8, 0.6, 1.5, 0.75, 1, 0), (360, 44, 0.6, -0.8, 1, 1.25, 0, 1)]
bad, seen = [], 0
for (cx, cy, co, si, sx, sy, flipx, flipy) in SPRITES:
    a, b, c, d = co * sx, si * sx, -si * sy, co * sy   # x' = a x + c y + cx, y' = b x + d y + cy
    det = a * d - b * c; n = 0
    for py in range(max(0, cy - 60), min(H, cy + 60)):
        for px in range(max(0, cx - 60), min(W, cx + 60)):
            X, Y = px + 0.5 - cx, py + 0.5 - cy
            lx, ly = (d * X - c * Y) / det + 16, (-b * X + a * Y) / det + 16   # in the sprite, 0..32
            if not (0 <= lx < 32 and 0 <= ly < 32): continue
            if min(lx % 4, 4 - lx % 4, ly % 4, 4 - ly % 4) < 1.0: continue   # too close to another texel, or to the edge
            tx, ty = int(lx // 4), int(ly // 4)
            want = texel(7 - tx if flipx else tx, 7 - ty if flipy else ty); got = frame(px, py); n += 1
            if any(abs(p - q) > slack for p, q in zip(got, want)): bad.append("sprite at %d,%d pixel %d,%d (texel %d,%d): %s, want %s" % (cx, cy, px, py, tx, ty, got, want))
    if n < 150: bad.append("sprite at %d,%d: only %d pixels could be checked" % (cx, cy, n))
    seen += n
for b in bad[:8]: print(b)
if not bad: print("xform_check: %d pixels inside the texels of 5 sprites" % seen)
sys.exit(1 if bad else 0)
