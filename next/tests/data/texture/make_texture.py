#!/usr/bin/env python3
"""make_texture.py SIZE OUT.png [opaque]: the test texture of tests/t1/texture.sh (ZN-439), the same bytes on every machine: tiles of colour
gradients with fine stripes (block encoders have something to lose), and, unless `opaque`, a disc whose soft edge fades to transparent (the
alpha that premultiplication and the alpha formats are about). Standard library only."""
import struct, sys, zlib

n = int(sys.argv[1])
opaque = len(sys.argv) > 3 and sys.argv[3] == "opaque"
c = n / 2
rows = []
for y in range(n):
    row = bytearray(b"\0")   # filter: none
    ty = (y * 8) // n
    for x in range(n):
        tx = (x * 8) // n
        r = (x * 255 // n + ty * 31) & 255
        g = (y * 255 // n + tx * 47) & 255
        b = ((x ^ y) & 63) * 3 + ((tx + ty) & 1) * 60
        if opaque:
            a = 255
        else:
            d = ((x - c) ** 2 + (y - c) ** 2) ** 0.5 / c   # 0 at the centre, 1 at the edge of the disc
            a = 255 if d < 0.8 else 0 if d > 0.95 else int(255 * (0.95 - d) / 0.15)
        row += bytes((r, g, b & 255, a))
    rows.append(bytes(row))
raw = b"".join(rows)
def chunk(t, d): return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", n, n, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 6)) + chunk(b"IEND", b"")
open(sys.argv[2], "wb").write(png)
