#!/usr/bin/env python3
"""check.py golden|esp32 <frame.png>: images in a box (ZN-262), tests/golden/style-image at 544x224, scale 1, checked from CSS's definitions.

The image is 64x32 (2:1): red, green, blue and white stripes 16 px wide over a black bottom quarter; the boxes are 48x48 (1:1) at
(16 + 64 i, 16 + 64 j). Probes sit inside the stripes (object-fit fill, contain, cover, none, scale-down and object-position; background
cover, contain, position, space, round; the tint is raster.cpp's multiply, (c * t + 127) / 255, within one unit). The 8x8 tiles of the
third background box are counted from the frame: 6 x 6 on the desktop, 4 x 4 (16 commands) on esp32, where the budget enlarges them."""
import importlib.machinery, importlib.util, os, sys

here = os.path.dirname(os.path.abspath(__file__))
lp = importlib.machinery.SourceFileLoader("pngdiff", os.path.join(here, "..", "..", "..", "tools", "pngdiff"))
sp = importlib.util.spec_from_loader("pngdiff", lp); pd = importlib.util.module_from_spec(sp); lp.exec_module(pd)
w, h, bpp, data = pd.dec(sys.argv[2])
def px(x, y): o = (y * w + x) * bpp; return tuple(data[o:o + 3])
R, G, B, W, K, Z, P = (255, 0, 0), (0, 255, 0), (0, 0, 255), (255, 255, 255), (0, 0, 0), (228, 228, 231), (255, 255, 255)
def tint(c, t): return tuple((c[k] * t[k] + 127) // 255 for k in range(3))
fails = []
def at(row, col, x, y, want, name):
    got = px(16 + 64 * col + x, 16 + 64 * row + y)
    if max(abs(got[k] - want[k]) for k in range(3)) > 1: fails.append(f"{name} ({x}, {y}): {got}, want {want}")
def runs(pts, test):   # how many runs of pixels pass `test` along the points
    n, inside = 0, False
    for p in pts:
        t = test(px(*p))
        if t and not inside: n += 1
        inside = t
    return n
red = lambda c: c[0] > 160 and c[1] < 100 and c[2] < 100
black = lambda c: max(c) < 60
def tiles(col, x, y, name):   # red runs along row y and black runs down column x of background box col
    ox, oy = 16 + 64 * col, 16 + 64
    return runs([(ox + i, oy + y) for i in range(48)], red), runs([(ox + x, oy + j) for j in range(48)], black)

if sys.argv[1] == "esp32":
    t = tiles(2, 1, 2, "tiles")
    if t != (4, 4): fails.append(f"esp32: the 8x8 tiles are {t[0]} x {t[1]}, want 4 x 4 (16 at most on tier T0)")
else:
    contain = [(6, 20, R), (18, 20, G), (30, 20, B), (42, 20, W), (24, 33, K), (24, 6, Z), (24, 42, Z)]
    for x, y, c in [(6, 18, R), (18, 18, G), (30, 18, B), (42, 18, W), (24, 42, K)]: at(0, 0, x, y, c, "fill")
    for x, y, c in contain: at(0, 1, x, y, c, "contain"); at(0, 4, x, y, c, "scale-down")
    for x, y, c in [(12, 18, G), (36, 18, B), (24, 42, K)]: at(0, 2, x, y, c, "cover"); at(1, 0, x, y, c, "bg-cover bg-center")
    for x, y, c in [(4, 20, R), (16, 20, G), (32, 20, B), (44, 20, W), (24, 36, K), (24, 4, Z), (24, 44, Z)]: at(0, 3, x, y, c, "none")
    for x, y, c in [(12, 18, R), (36, 18, G)]: at(0, 5, x, y, c, "cover object-left")
    for x, y, c in [(8, 12, R), (24, 12, G), (40, 12, B), (24, 28, K), (24, 40, Z)]: at(0, 6, x, y, c, "none object-top-left")
    for x, y, c in [(12, 18, G), (36, 18, B), (1, 1, P)]: at(0, 7, x, y, c, "cover rounded")
    for x, y, c in contain: at(1, 1, x, y, c, "bg-contain")
    if tiles(2, 1, 2, "tiles") != (6, 6): fails.append(f"bg-size-[8px_8px]: {tiles(2, 1, 2, 'tiles')} tiles, want 6 x 6")
    if tiles(3, 1, 22, "") [0] != 3 or px(16 + 64 * 3 + 24, 16 + 64 + 4) != P: fails.append("bg-repeat-x: not three tiles in the middle row")
    if tiles(4, 2, 2, "") != (2, 4) or px(16 + 64 * 4 + 24, 16 + 64 + 2) != P: fails.append(f"bg-repeat-space: {tiles(4, 2, 2, '')}, want 2 x 4 with a gap")
    if tiles(5, 2, 2, "") != (2, 5): fails.append(f"bg-repeat-round: {tiles(5, 2, 2, '')}, want 2 x 5")
    for x, y, c in [(12, 18, B), (36, 18, W), (24, 42, K), (1, 1, P)]: at(1, 6, x, y, c, "backgroundImage style")
    top, low = px(16 + 64 * 7 + 12, 16 + 64 + 1), px(16 + 64 * 7 + 12, 16 + 64 + 35)
    if top[0] < 240 or not 100 < low[0] < 200: fails.append(f"gradient over the image: {top} at the top, {low} below")
    t1 = (0x80, 0xc0, 0xff)
    for x, y, c in [(6, 18, R), (18, 18, G), (30, 18, B), (42, 18, W)]: at(2, 0, x, y, tint(c, t1), "tint-[#80c0ff]")
    t2 = (0xff, 0x80, 0x00)
    for x, y, c in [(6, 20, R), (18, 20, G), (30, 20, B), (42, 20, W)]: at(2, 1, x, y, tint(c, t2), "tintColor, resizeMode contain")
    at(2, 1, 24, 6, Z, "tintColor, resizeMode contain")
    for x, y, c in [(6, 9, R), (6, 33, R), (6, 21, K), (6, 45, K), (42, 9, W)]: at(2, 2, x, y, c, "resizeMode repeat")
    t3 = (0x6e, 0xe7, 0xb7)
    for x, y, c in [(12, 18, tint(G, t3)), (36, 18, tint(B, t3)), (1, 1, P)]: at(2, 3, x, y, c, "cover rounded tint-emerald-300")
    for x, y, c in [(16, 20, R), (32, 20, G), (48, 20, B), (64, 20, W), (40, 36, K), (4, 20, Z), (40, 4, Z)]: at(2, 4, x, y, c, "resizeMode center")
for f in fails: print(f)
sys.exit(1 if fails else 0)
