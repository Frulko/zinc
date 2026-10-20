#!/usr/bin/env python3
"""check.py golden|paint|esp32 <frame.png>: the gradients of ZN-261 checked from their CSS definitions.

golden (tests/golden/style-gradient at 780x280, scale 1): the three-stop vertical gradient (chained two-stop rects) equals the two stacked
bg-gradient-to-b boxes pixel for pixel; pixels of the 45-degree linear, the radial and the conic boxes equal the CSS geometry (gradient line
of length |w sin a| + |h cos a| through the centre; ellipse farthest-corner = sqrt 2 x the farthest sides; conic angle clockwise from the top)
and raster.cpp's interpolation (a weight out of 256, channels rounded down), within one unit.
paint (tests/data/style_gradient/paint.ts at 400x260): each paint record equals its chained gradient() rects pixel for pixel.
esp32 (the golden on --profile esp32): what tier T0 keeps, two stops along an axis, and the conic drawn as one colour."""
import importlib.machinery, importlib.util, math, os, re, sys

here = os.path.dirname(os.path.abspath(__file__))
tools = os.path.join(here, "..", "..", "..", "tools")
lp = importlib.machinery.SourceFileLoader("pngdiff", os.path.join(tools, "pngdiff")); sp = importlib.util.spec_from_loader("pngdiff", lp)
pd = importlib.util.module_from_spec(sp); lp.exec_module(pd)
w, h, bpp, data = pd.dec(sys.argv[2])
def px(x, y): o = (y * w + x) * bpp; return tuple(data[o:o + 3])
fails = []
def region_equal(name, x0, y0, x1, y1, dx):
    bad = sum(1 for y in range(y0, y1) for x in range(x0, x1) if px(x, y) != px(x + dx, y))
    if bad: fails.append(f"{name}: {bad} pixels differ")

if sys.argv[1] == "paint":
    region_equal("vertical paint vs chained rects", 0, 0, 128, 128, 128)
    region_equal("horizontal paint vs chained rects", 0, 128, 128, 256, 128)
elif sys.argv[1] == "esp32":   # tier T0: the 45-degree box is a vertical two-stop gradient (rows of one colour), the conic one a solid colour
    if any(px(x, y) != px(200, y) for y in (30, 64, 100) for x in (180, 230, 268)): fails.append("esp32: the 45-degree box is not vertical")
    if len({px(x, y) for x in (380, 400, 420) for y in (190, 208, 230)}) != 1: fails.append("esp32: the conic box is not one colour")
else:
    region_equal("via- vs stacked bg-gradient-to-b", 16, 16, 80, 144, 80)
    pal = open(os.path.join(here, "..", "..", "..", "..", "lib", "std", "palette.ts")).read()
    fam = {m.group(1): [int(c, 16) for c in m.group(2).split(",")] for m in re.finditer(r"'([a-z]+):([0-9a-f,]+);'", pal)}
    shades = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]
    def tw(name): f, s = name.rsplit("-", 1); return fam[f][shades.index(int(s))]
    def lerp(a, b, t):   # raster.cpp lerp_color
        k = int(min(max(t * 256, 0), 256))
        return tuple(((((a >> s) & 255) * (256 - k) + ((b >> s) & 255) * k) >> 8) for s in (16, 8, 0))
    def at(stops, t):
        if t <= stops[0][0]: c = stops[0][1]; return tuple((c >> s) & 255 for s in (16, 8, 0))
        for (t0, c0), (t1, c1) in zip(stops, stops[1:]):
            if t <= t1: return lerp(c0, c1, (t - t0) / (t1 - t0))
        c = stops[-1][1]; return tuple((c >> s) & 255 for s in (16, 8, 0))
    def expect(name, box, stops, tfn):
        bx, by, bw, bh = box
        for fy in (0.2, 0.5, 0.8):
            for fx in (0.2, 0.5, 0.8):
                x, y = int(bx + fx * bw), int(by + fy * bh)
                want, got = at(stops, tfn(x + 0.5 - bx, y + 0.5 - by, bw, bh)), px(x, y)
                if max(abs(a - b) for a, b in zip(want, got)) > 1: fails.append(f"{name} at ({x}, {y}): {got} != {want}")
    a = math.radians(45)
    expect("bg-linear-45", (176, 16, 96, 96), [(0, tw("indigo-500")), (0.5, tw("purple-500")), (1, tw("pink-500"))],
           lambda x, y, bw, bh: ((x - bw / 2) * math.sin(a) - (y - bh / 2) * math.cos(a)) / (bw * math.sin(a) + bh * math.cos(a)) + 0.5)
    expect("bg-radial", (16, 160, 96, 96), [(0, 0xffffff), (1, tw("blue-600"))],
           lambda x, y, bw, bh: math.hypot((x - bw / 2) / (bw / 2 * math.sqrt(2)), (y - bh / 2) / (bh / 2 * math.sqrt(2))))
    expect("bg-conic", (352, 160, 96, 96), [(0, tw("red-500")), (0.5, tw("green-500")), (1, tw("red-500"))],
           lambda x, y, bw, bh: (math.atan2(x - bw / 2, -(y - bh / 2)) / (2 * math.pi)) % 1.0)
print("\n".join(fails) if fails else "ok")
sys.exit(1 if fails else 0)
