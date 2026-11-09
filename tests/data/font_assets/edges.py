"""edges.py REF.png LABEL.png...: the pixels of each frame that are neither paper nor ink (red 40 to 215): its edge. A label that stays sharp
has about as many as the font rasterized at its size; a resampled bitmap has its blur's width of them (8 times as many at 8x). Exit 1 when
a label has more than 1.5 times the reference's."""
import sys, importlib.machinery, importlib.util, os
loader = importlib.machinery.SourceFileLoader('pngdiff', os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../../tools/pngdiff'))
png = importlib.util.module_from_spec(importlib.util.spec_from_loader('pngdiff', loader))
loader.exec_module(png)

def edge(p):
    w, h, bpp, d = png.dec(p)
    return sum(1 for i in range(0, len(d), bpp) if 40 <= d[i] <= 215)

ref = edge(sys.argv[1])
bad = 0
for p in sys.argv[2:]:
    n = edge(p)
    print(f'{os.path.basename(p)}: {n} edge pixels, reference {ref}')
    bad |= n > ref * 1.5
sys.exit(1 if bad or ref == 0 else 0)
