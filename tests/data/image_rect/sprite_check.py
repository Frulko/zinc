#!/usr/bin/env python3
"""sprite_check.py <frame.png|frame.bmp> <sheet.png> [slack]: the tinted and blended sprites of sprite.ts's first two rows, computed from the
sheet's texels with the formulas of raster.cpp (ZN-581): each channel of a texel times the tint, (c t + 127) / 255; the alpha a (the texel's
times the sprite's); then over the background d: normal (c a + d (255 - a)) >> 8, add d + c a / 256, multiply d (c a / 255 + 255 - a) / 256,
screen d + c a / 256 - d (c a / 256) / 255 (c and 255 from a = 255 on). A frame larger than 400x180 by a whole factor (the GL window) is
averaged down first; slack is what a channel may be off by (0 for the software raster, 2 on translucent texels: its alpha is a float product)."""
import importlib.machinery, importlib.util, os, sys

here = os.path.dirname(os.path.abspath(__file__))
tools = os.path.join(here, "..", "..", "..", "tools")
lp = importlib.machinery.SourceFileLoader("pngdiff", os.path.join(tools, "pngdiff")); s = importlib.util.spec_from_loader("pngdiff", lp); pd = importlib.util.module_from_spec(s); lp.exec_module(pd)
W, H = 400, 180
DARK, GREY = (0x20, 0x30, 0x40), (0x80, 0x80, 0x80)
TINT = (0xff, 0x80, 0x40)

def load(p):   # width, height, RGB bytes (check.py's reader)
    import struct
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
assert (sw, sh, sb) == (32, 16, 4), (sw, sh, sb)
if fw % W or fh % H or fw // W != fh // H: sys.exit("the frame is %dx%d, not a multiple of %dx%d" % (fw, fh, W, H))
K = fw // W
def frame(x, y):
    acc = [0, 0, 0]
    for j in range(K):
        for i in range(K):
            o = ((y * K + j) * fw + x * K + i) * 3
            for c in range(3): acc[c] += fd[o + c]
    return tuple(v // (K * K) for v in acc)
def texel(x, y): o = (y * sw + x) * 4; return tuple(sd[o:o + 4])

def blend(d, c, a, mode):
    if a <= 0: return d
    if mode == 0: return c if a >= 255 else tuple((cc * a + dd * (255 - a)) >> 8 for cc, dd in zip(c, d))
    a = min(a, 255)
    out = []
    for cc, dd in zip(c, d):
        sa = cc if a == 255 else cc * a >> 8
        if mode == 1: v = dd + sa
        elif mode == 2: v = (dd * cc + 127) // 255 if a == 255 else dd * (cc * a // 255 + 255 - a) >> 8
        else: v = sa + dd - (dd * sa + 127) // 255
        out.append(min(v, 255))
    return tuple(out)

# x, y, source frame, alpha, tint, mode, background: what sprite.ts's modes() draws (keep the two in step)
SPRITES = []
for y, (fx, fy), bg in ((4, (0, 0), DARK), (50, (24, 8), GREY)):
    for k in range(4):
        SPRITES.append((8 + 40 * k, y, fx, fy, 255, TINT, k, bg))
        SPRITES.append((168 + 40 * k, y, fx, fy, 128, TINT, k, bg))
    SPRITES.append((328, y, 16, 0, 255, TINT, 3, bg))
    SPRITES.append((368, y, 8, 8, 255, (0x40, 0xc0, 0xff), 2, bg))
bad = []
for (x0, y0, fx, fy, alpha, tint, mode, bg) in SPRITES:
    for j in range(32):
        for i in range(32):
            r, g, b, ta = texel(fx + i // 4, fy + j // 4)
            a = alpha if ta == 255 else ta * alpha // 255
            c = tuple((v * t + 127) // 255 for v, t in zip((r, g, b), tint))
            want, tol = blend(bg, c, a, mode), slack if ta == 255 else max(slack, 2)
            got = frame(x0 + i, y0 + j)
            if any(abs(p - q) > tol for p, q in zip(got, want)): bad.append("sprite at %d,%d (mode %d) pixel %d,%d: %s, want %s" % (x0, y0, mode, i, j, got, want))
for b in bad[:8]: print(b)
if bad: print("%d pixels differ" % len(bad))
sys.exit(1 if bad else 0)
