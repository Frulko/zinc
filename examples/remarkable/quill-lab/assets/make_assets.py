#!/usr/bin/env python3
# Regenerates the two baked pictures of the lab (Pillow). The tablet has nothing to compute: dithering is done once, here.
#   wave-bw.png: the colour photo, 8x8 Bayer dithered to pure black and white at the panel's width (image_demo's look)
#   bounce.png:  a strip of 24 dithered frames of a bouncing sphere (gif_demo's content, no GIF decoder on the tablet)
import math, pathlib
from PIL import Image, ImageDraw
HERE = pathlib.Path(__file__).parent
B = [[0,48,12,60,3,51,15,63],[32,16,44,28,35,19,47,31],[8,56,4,52,11,59,7,55],[40,24,36,20,43,27,39,23],
     [2,50,14,62,1,49,13,61],[34,18,46,30,33,17,45,29],[10,58,6,54,9,57,5,53],[42,26,38,22,41,25,37,21]]
def dither(gray):
    out = Image.new('1', gray.size); s, d = gray.load(), out.load()
    for y in range(gray.height):
        for x in range(gray.width):
            d[x, y] = 255 if s[x, y] >= B[y & 7][x & 7] * 255 // 63 else 0
    return out
wave = Image.open(HERE / 'great-wave.jpg').convert('L')
dither(wave.resize((1620, wave.height * 1620 // wave.width), Image.LANCZOS)).save(HERE / 'wave-bw.png', optimize=True)
FW, FH, N, COLS = 480, 360, 24, 6
sheet = Image.new('1', (FW * COLS, FH * (N // COLS)), 255)
for i in range(N):
    t = i / N; f = Image.new('L', (FW, FH), 235); px = f.load()
    ground = FH - 40; r = 62
    cy = ground - r - abs(math.sin(math.pi * t)) * 190 + 0; cx = FW / 2 + math.sin(2 * math.pi * t) * 130
    ImageDraw.Draw(f).rectangle((0, ground, FW, FH), fill=120)
    h = (ground - r - cy) / 190; sw = r * (1 - h * .5)     # the shadow shrinks as the sphere rises
    ImageDraw.Draw(f).ellipse((cx - sw, ground + 6, cx + sw, ground + 26), fill=40)
    for y in range(int(cy - r), int(cy + r) + 1):
        for x in range(int(cx - r), int(cx + r) + 1):
            dx, dy = (x - cx) / r, (y - cy) / r
            if dx * dx + dy * dy <= 1:
                nz = math.sqrt(1 - dx * dx - dy * dy)
                px[x, y] = int(25 + 220 * max(0, -.45 * dx - .55 * dy + .7 * nz))
    sheet.paste(dither(f), ((i % COLS) * FW, (i // COLS) * FH))
sheet.save(HERE / 'bounce.png', optimize=True)
