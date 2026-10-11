#!/usr/bin/env python3
"""check.py <shot.png>: the Tiled map at (0, 0), LDtk's Level_1 at (272, 0) and the view of the Tiled map from (37, 51) at (540, 0) are the
editors' renders in ref/ (transparent where no tile is) laid over the clear colour 0x202020. The LDtk level has opaque and fully transparent
texels: it must be exact. The Tiled map has translucent layers, which Tiled composites in premultiplied 8-bit colour: at most 2 apart."""
import importlib.machinery, importlib.util, os, sys

here = os.path.dirname(os.path.abspath(__file__))
l = importlib.machinery.SourceFileLoader("pngdiff", os.path.join(here, "../../../tools/pngdiff")); s = importlib.util.spec_from_loader("pngdiff", l)
pd = importlib.util.module_from_spec(s); l.exec_module(pd)
W, H, bpp, shot = pd.dec(sys.argv[1])
BG = (0x20, 0x20, 0x20)

def compare(what, ref, rx, ry, w, h, sx, sy, slack):
    rw, rh, rb, rd = pd.dec(os.path.join(here, "ref", ref))
    over, worst, differ = 0, 0, 0
    for y in range(h):
        for x in range(w):
            o = ((ry + y) * rw + rx + x) * rb
            a = rd[o + 3] if rb == 4 else 255
            want = [(rd[o + k] * a + BG[k] * (255 - a) + 127) // 255 for k in range(3)]
            p = ((sy + y) * W + sx + x) * bpp
            d = max(abs(shot[p + k] - want[k]) for k in range(3))
            worst = max(worst, d); differ += d > 0; over += d > slack
            if d > slack and over == 1: first = (x, y, tuple(shot[p:p + 3]), tuple(want))
    if over:
        x, y, got, want = first
        sys.exit("check: %s: %d pixels more than %d apart from ref/%s, the first at (%d, %d): %s, the editor's %s" % (what, over, slack, ref, x, y, got, want))
    return "%s %dx%d: %d pixels differ, by %d at most" % (what, w, h, differ, worst)

print("; ".join([compare("Tiled", "tiled-temple.png", 0, 0, 260, 275, 0, 0, 2),
                 compare("LDtk Level_1", "ldtk-Level_1.png", 0, 0, 256, 272, 272, 0, 0),
                 compare("view", "tiled-temple.png", 37, 51, 100, 80, 540, 0, 2)]))
