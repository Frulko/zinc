#!/usr/bin/env python3
# Regenerates the image fixtures of tests/native/codec_test.cpp (needs Pillow): one 32x24 picture with 12 flat colours (so GIF and PNG are exact) in each format,
# and fixture.rgba, its raw RGBA bytes. fixture.jpg is lossy: its expected decode is jpg.rgba, frozen from stb_image and checked to be within 6 of Pillow's.
from PIL import Image
W, H = 32, 24
cols = [(220, 30, 30, 255), (30, 160, 60, 255), (30, 60, 200, 255), (240, 220, 40, 255), (255, 255, 255, 255), (0, 0, 0, 255),
        (120, 120, 120, 255), (200, 100, 20, 255), (90, 20, 140, 255), (20, 180, 190, 255), (250, 150, 180, 255), (60, 60, 20, 255)]
im = Image.new("RGBA", (W, H))
for y in range(H):
    for x in range(W):
        im.putpixel((x, y), cols[(x // 8 + 4 * (y // 8)) % 12])
raw = im.tobytes()
open("fixture.rgba", "wb").write(raw)
im.save("fixture.png"); im.convert("RGB").save("fixture.bmp"); im.convert("P", palette=Image.ADAPTIVE, colors=16).save("fixture.gif")
im.convert("RGB").save("fixture.jpg", quality=92, subsampling=0)
