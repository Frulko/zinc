#!/usr/bin/env python3
"""check.py <frame.png>: the boxes of main.tsx at scale 1 (360x100) inset their content by their border (ZN-882)."""
import importlib.machinery, importlib.util, os, sys

tools = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "tools")
l = importlib.machinery.SourceFileLoader("pngdiff", os.path.join(tools, "pngdiff")); s = importlib.util.spec_from_loader("pngdiff", l); pd = importlib.util.module_from_spec(s); l.exec_module(pd)
w, h, bpp, d = pd.dec(sys.argv[1])
G, B, W = (0x23, 0xa5, 0x5a), (0x58, 0x65, 0xf2), (0xff, 0xff, 0xff)
def px(x, y): o = (y * w + x) * bpp; return tuple(d[o:o + 3])
probes = [   # (x, y, colour, what)
  (17, 40, G, "ring: its left border, beside the avatar"), (40, 17, G, "ring: its top border"), (40, 40, B, "ring: the avatar inside"), (62, 40, G, "ring: its right border (48 px wide)"),
  (81, 48, G, "fixed box: its left border"), (85, 48, B, "fixed box: the child inside the border"), (142, 48, G, "fixed box: its right border, not covered"), (110, 78, G, "fixed box: its bottom border"),
  (162, 48, G, "per side: the left border, 8 px"), (166, 48, G, "per side: still the left border"), (169, 48, B, "per side: the child after the left border"), (190, 17, G, "per side: the top border, 2 px"),
  (190, 19, B, "per side: the child under the top border"), (222, 48, B, "per side: no right border"),
  (241, 30, G, "box-content: its border"), (245, 30, W, "box-content: its padding"), (260, 30, B, "box-content: the 32 px content"), (282, 30, W, "box-content: its right padding"), (286, 30, G, "box-content: its right border at 32 + 8 + 8"),
]
bad = [f"{what}: ({x},{y}) is {px(x, y)}, want {c}" for x, y, c, what in probes if max(abs(a - b) for a, b in zip(px(x, y), c)) > 8]
print("\n".join(bad) if bad else "border box: ok")
sys.exit(1 if bad else 0)
