#!/usr/bin/env python3
"""check.py <frame.png|frame.bmp> <sheet.png> [slack] [nearest]: the sprites main.ts draws with row(), against the sheet (ZN-432).
The nearest sprites are computed here from the sheet's texels: the texel under each pixel centre, mirrored by the flags, nothing outside
the image, blended like the raster ((c * a + d * (255 - a)) >> 8). The row of the baked image and the row of the decoded one are the same pixels.
A frame larger than 400x180 by a whole factor (the GL window at the screen's density) is averaged down first; slack is what a channel may
be off by (0 for the software raster, whose translucent texels alone get 2: its alpha is a float product cut to an integer).
nearest: the frame is web.ts's, on a canvas of any size: the nearest sprites and the copy, twice, without the linear sprites."""
import importlib.machinery, importlib.util, os, struct, sys

tools = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "tools")
l = importlib.machinery.SourceFileLoader("pngdiff", os.path.join(tools, "pngdiff")); s = importlib.util.spec_from_loader("pngdiff", l); pd = importlib.util.module_from_spec(s); l.exec_module(pd)
W, H, BG = 400, 180, (0x20, 0x30, 0x40)

def load(p):   # width, height, RGB bytes
    if not p.lower().endswith(".bmp"):
        w, h, bpp, d = pd.dec(p)
        return w, h, d if bpp == 3 else b"".join(d[k:k + 3] for k in range(0, len(d), 4))
    d = open(p, "rb").read(); off = struct.unpack("<I", d[10:14])[0]; w, h = struct.unpack("<ii", d[18:26]); bpp = struct.unpack("<H", d[28:30])[0] // 8
    row = (w * bpp + 3) & ~3; out = bytearray()
    for y in range(abs(h)):
        o = off + row * (h - 1 - y if h > 0 else y)   # bottom-up when the height is positive
        for x in range(w): out += bytes((d[o + x * bpp + 2], d[o + x * bpp + 1], d[o + x * bpp]))
    return w, abs(h), bytes(out)

fw, fh, fd = load(sys.argv[1]); sw, sh, sb, sd = pd.dec(sys.argv[2])
slack = int(sys.argv[3]) if len(sys.argv) > 3 else 0
web = len(sys.argv) > 4 and sys.argv[4] == "nearest"
assert (sw, sh, sb) == (32, 16, 4), (sw, sh, sb)
if not web and (fw % W or fh % H or fw // W != fh // H): sys.exit("the frame is %dx%d, not a multiple of %dx%d" % (fw, fh, W, H))
K = 1 if web else fw // W
def frame(x, y):
    acc = [0, 0, 0]
    for j in range(K):
        for i in range(K):
            o = ((y * K + j) * fw + x * K + i) * 3
            for c in range(3): acc[c] += fd[o + c]
    return tuple(v // (K * K) for v in acc)
def texel(x, y): o = (y * sw + x) * 4; return tuple(sd[o:o + 4])
def near(a, b, tol): return all(abs(p - q) <= tol for p, q in zip(a, b))

# x, source x, source y, alpha, flip x, flip y (32x32 pixels for 8x8 texels): the nearest sprites of row()
SPRITES = [(8, 0, 0, 255, 0, 0), (48, 0, 0, 255, 1, 0), (88, 0, 0, 255, 0, 1), (128, 0, 0, 255, 1, 1), (168, 16, 0, 255, 0, 0), (208, 8, 8, 128, 0, 0), (248, 28, 12, 255, 0, 0)]
bad = []
for y0 in (8, 48):
    for (x0, sx, sy, alpha, flipx, flipy) in SPRITES:
        for j in range(32):
            for i in range(32):
                tx, ty = sx + (7 - i // 4 if flipx else i // 4), sy + (7 - j // 4 if flipy else j // 4)
                want, tol = BG, slack
                if tx < sw and ty < sh:
                    r, g, b, a = texel(tx, ty)
                    a = alpha if a == 255 else a * alpha // 255
                    want = (r, g, b) if a >= 255 else BG if a == 0 else tuple((c * a + d * (255 - a)) >> 8 for c, d in zip((r, g, b), BG))
                    if 0 < a < 255: tol = max(slack, 2)
                got = frame(x0 + i, y0 + j)
                if not near(got, want, tol): bad.append("sprite at %d,%d pixel %d,%d: %s, want %s" % (x0, y0, i, j, got, want))
    for j in range(8 if K == 1 else 0):   # the copy: frame 1 of the sheet, pixel for texel (at a higher density it is an enlargement, with its blend)
        for i in range(8):
            if not near(frame(288 + i, y0 + j), texel(8 + i, j)[:3], slack): bad.append("copy at 288,%d pixel %d,%d: %s, want %s" % (y0, i, j, frame(288 + i, y0 + j), texel(8 + i, j)[:3]))
for y in range(8, 40):   # baked and decoded: the same pixels, linear sprites included
    for x in range(W):
        if not near(frame(x, y), frame(x, y + 40), slack): bad.append("baked %s and decoded %s differ at %d,%d" % (frame(x, y), frame(x, y + 40), x, y)); break
drawn = sum(1 for y in range(8, 40) for x in range(304, 376) if frame(x, y) != BG)
if drawn < 1500 and not web: bad.append("the linear sprites drew %d pixels" % drawn)
if any(frame(x, y) != BG for y in range(120, 180) for x in range(236, 400)): bad.append("an empty rectangle or a missing image drew something")
for b in bad[:8]: print(b)
sys.exit(1 if bad else 0)
