#!/usr/bin/env python3
"""bmp_pixel.py <file.bmp> x,y [x,y...]: prints "r,g,b" of each pixel of an uncompressed 24 or 32-bit BMP (what ZINC_SHOT writes), one per line."""
import struct
import sys

data = open(sys.argv[1], 'rb').read()
offset, = struct.unpack_from('<I', data, 10)
w, h, _, bpp = struct.unpack_from('<iiHH', data, 18)
row = (w * bpp // 8 + 3) & ~3
for arg in sys.argv[2:]:
    x, y = (int(v) for v in arg.split(','))
    yy = y if h < 0 else abs(h) - 1 - y   # rows are bottom-up unless the height is negative
    p = offset + yy * row + x * bpp // 8
    b, g, r = data[p], data[p + 1], data[p + 2]
    print(f'{r},{g},{b}')
