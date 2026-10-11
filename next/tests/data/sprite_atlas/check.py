#!/usr/bin/env python3
"""check.py <shot.png> <pixels.json> <stdout of main.ts>: the right half of the top band (frames of the atlas) equals the left half (the loose
images) pixel for pixel, and each frame of the sheet and of the Aseprite file is drawn with its source's texels where main.ts printed it."""
import importlib.machinery, importlib.util, json, re, sys

l = importlib.machinery.SourceFileLoader("pngdiff", "tools/pngdiff"); s = importlib.util.spec_from_loader("pngdiff", l)
pd = importlib.util.module_from_spec(s); l.exec_module(pd)
w, h, bpp, d = pd.dec(sys.argv[1])
k = w // 256   # ZINC_SCALE
def px(x, y): o = (y * w + x) * bpp; return tuple(d[o:o + 3])
half, scaled, band = w // 2, 42 * k, 70 * k
# at their size (the rows above `scaled`, drawImage): the same pixels. Scaled by 1.5 (drawImageRect of the whole image) the sample positions
# are float ratios of the texture's size, a page's or the image's: weights a rounding apart, which may turn both the colour and the alpha of
# an edge texel down by one (2 apart once blended; 1 pixel of 4 frames at scale 2)
for rows, slack in ((range(scaled), 0), (range(scaled, band), 2)):
    diff = [(x, y) for y in rows for x in range(half) if max(abs(a - b) for a, b in zip(px(x, y), px(x + half, y))) > slack]
    if diff:
        x, y = diff[0]
        sys.exit("check: %d pixels of the atlas frames differ from the loose images by more than %d at scale %d, the first at (%d, %d): %s, loose %s" % (len(diff), slack, k, x, y, px(x + half, y), px(x, y)))
pixels = json.load(open(sys.argv[2]))
seen = 0
for m in re.finditer(r"^at (\S+) (\d+) (\d+)$", open(sys.argv[3]).read() if k == 1 else "", re.M):   # one pixel a texel: at scale 1
    fw, fh, ox, oy, src = pixels[m.group(1)]
    X, Y = int(m.group(2)), int(m.group(3))
    for v in range(fh):
        for u in range(fw):
            want = tuple(src[v * fw + u][:3]) if src[v * fw + u][3] == 255 else (0x20, 0x20, 0x20)
            got = px((X + ox + u) * k, (Y + oy + v) * k)
            if got != want: sys.exit("check: %s, texel (%d, %d): %s on the screen, %s in its source" % (m.group(1), u, v, got, want))
    seen += 1
print("check: scale %d, the frames are the loose images' pixels%s" % (k, ", and the %d frames of the sheet and the Aseprite file their sources'" % seen if seen else ""))
