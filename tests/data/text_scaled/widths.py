#!/usr/bin/env python3
"""widths.py frame.png rows.txt: the ink of each line of main.ts against its ruler (tests/t1/text_scaled.sh).
rows.txt: `name scale width textTop textBottom rulerTop rulerBottom` per line, as main.ts prints them. The ruler is the text's width
(textWidth) through the same matrix; its ink must start at x 10 and be scale x width wide. A `mono` line begins and ends with a full
block, so its ink is its ruler's, within a pixel on each side. A `sans` line begins and ends with an H: what the ruler has beyond it
on each side is the H's bearing times the scale, taken from the line at the largest scale; within a pixel and a half, a thin stem that
lies over two columns of pixels being seen from a quarter of coverage. Exit 1 and one line per row out of place."""
import sys, os, importlib.machinery, importlib.util
l = importlib.machinery.SourceFileLoader("pngdiff", os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../../tools/pngdiff"))
pd = importlib.util.module_from_spec(importlib.util.spec_from_loader("pngdiff", l)); l.exec_module(pd)
w, h, bpp, d = pd.dec(sys.argv[1])

def ink(y0, y1, level=128):   # the first and one past the last column with a pixel darker than `level` (128: at least half covered) in rows y0 to y1
    cols = [x for x in range(w) if any(d[(y * w + x) * bpp] < level for y in range(max(0, y0), min(h, y1)))]
    return (cols[0], cols[-1] + 1) if cols else (0, 0)

rows = [r.split() for r in open(sys.argv[2]) if r.split() and r.split()[0] in ("mono", "sans")]
bad = 0
bearing = {}
for name, s, width, t0, t1, r0, r1 in reversed(rows):   # the largest scale first: it gives the bearings
    s, width = float(s), float(width)
    tx0, tx1 = ink(int(t0), int(t1), 128 if name == "mono" else 192); rx0, rx1 = ink(int(r0), int(r1))
    want = 10 + s * width
    err = []
    if abs(rx0 - 10) > 1 or abs(rx1 - want) > 1: err.append("ruler %d to %d, expected 10 to %.1f" % (rx0, rx1, want))
    if name == "mono":
        if abs(tx0 - 10) > 1 or abs(tx1 - want) > 1: err.append("text %d to %d, expected 10 to %.1f" % (tx0, tx1, want))
    else:
        b = bearing.setdefault(name, ((tx0 - rx0) / s, (rx1 - tx1) / s))
        if abs(tx0 - rx0 - b[0] * s) > 1.5 or abs(rx1 - tx1 - b[1] * s) > 1.5: err.append("text %d to %d in a ruler %d to %d: bearings %.2f and %.2f expected" % (tx0, tx1, rx0, rx1, b[0] * s, b[1] * s))
    if err: bad = 1; print("%s at %g: %s" % (name, s, "; ".join(err)))
if len(rows) < 20: bad = 1; print("%d rows measured, 20 expected" % len(rows))
sys.exit(bad)
