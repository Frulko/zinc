#!/usr/bin/env python3
"""The raster sources of the sprite_atlas test (tests/t1/sprite_atlas.sh), written into <project>/assets: PNG frames (with transparent
borders, a translucent pixel, an @2x one, numbered ones), a TexturePacker JSON hash sheet with a trimmed and a rotated frame, an Aseprite
file of three frames and a pingpong tag, and the frames of the `small` atlas. Prints, as JSON, the source pixels of the sheet's and the
Aseprite file's frames (what the atlas must give back) for check.py."""
import json, os, struct, sys, zlib

root = os.path.join(sys.argv[1], "assets")

def png(path, w, h, px):
    raw = b"".join(b"\0" + bytes(c for p in px[y * w:(y + 1) * w] for c in p) for y in range(h))
    def chunk(t, d): return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, "wb").write(data)

T = (0, 0, 0, 0)
def colour(i): return ((i * 67) % 256, (i * 151 + 40) % 256, (i * 29 + 90) % 256, 255)
def pattern(w, h, seed, border=0):
    """Opaque texels inside a transparent border of `border`, each one different."""
    return [colour(seed + x * 7 + y * 13) if border <= x < w - border and border <= y < h - border else T for y in range(h) for x in range(w)]

s = os.path.join(root, "sprites")
dot = pattern(12, 12, 1, 2)
dot[5 * 12 + 5] = (250, 120, 30, 128)   # translucent: the atlas keeps straight alpha, as the loose image has it
png(os.path.join(s, "dot.png"), 12, 12, dot)
png(os.path.join(s, "hero@2x.png"), 16, 16, [T if (x < 2 or x > 13) and (y < 2 or y > 13) else colour(x * 3 + y * 5) for y in range(16) for x in range(16)])
png(os.path.join(s, "walk_1.png"), 6, 6, pattern(6, 6, 50))
png(os.path.join(s, "walk_2.png"), 6, 6, pattern(6, 6, 90, 1))

# the sheet: gem.png (6 x 5, trimmed out of 8 x 8 at 1, 2) at (0, 0); arrow.png (5 x 3) turned clockwise at (8, 0), 3 x 5 in the sheet
gem, arrow = pattern(6, 5, 7), pattern(5, 3, 31)
sheet = [T] * (16 * 8)
for v in range(5):
    for u in range(6): sheet[v * 16 + u] = gem[v * 6 + u]
for v in range(3):
    for u in range(5): sheet[u * 16 + 8 + (3 - 1 - v)] = arrow[v * 5 + u]   # clockwise: (u, v) of the sprite at (h - 1 - v, u) of its place
png(os.path.join(s, "sheet.png"), 16, 8, sheet)
json.dump({
    "frames": {
        "gem.png": {"frame": {"x": 0, "y": 0, "w": 6, "h": 5}, "rotated": False, "trimmed": True, "spriteSourceSize": {"x": 1, "y": 2, "w": 6, "h": 5},
                    "sourceSize": {"w": 8, "h": 8}, "pivot": {"x": 0.25, "y": 1}, "duration": 80},
        "arrow.png": {"frame": {"x": 8, "y": 0, "w": 5, "h": 3}, "rotated": True, "trimmed": False, "spriteSourceSize": {"x": 0, "y": 0, "w": 5, "h": 3},
                      "sourceSize": {"w": 5, "h": 3}, "duration": 120}},
    "animations": {"pair": ["arrow.png", "gem.png"]},
    "meta": {"image": "sheet.png", "size": {"w": 16, "h": 8}, "frameTags": [{"name": "shine", "from": 0, "to": 1, "direction": "pingpong"}]},
}, open(os.path.join(s, "sheet.json"), "w"), indent=1)

# blink.aseprite: 8 x 8, three frames of one layer (raw cels and a compressed one), the tag "blink" (frames 1 to 2, pingpong)
def chunk(t, d): return struct.pack("<IH", 6 + len(d), t) + d
def string(t): return struct.pack("<H", len(t)) + t.encode()
frames, ase = [], []
for i, ms in enumerate((100, 150, 200)):
    px = pattern(8, 8, 120 + 40 * i, 1 + (i == 2))
    frames.append(px)
    cs = []
    if i == 0:
        cs.append(chunk(0x2004, struct.pack("<HHHHHHB3s", 3, 0, 0, 0, 0, 0, 255, b"") + string("body")))
        cs.append(chunk(0x2018, struct.pack("<H8s", 1, b"") + struct.pack("<HHBH6s3BB", 1, 2, 2, 0, b"", 255, 0, 0, 0) + string("blink")))
    raw = bytes(c for p in px for c in p)   # the middle frame as Aseprite saves cels: compressed (type 2, zlib)
    cs.append(chunk(0x2005, struct.pack("<HhhBHh5s", 0, 0, 0, 255, 2 if i == 1 else 0, 0, b"") + struct.pack("<HH", 8, 8) + (zlib.compress(raw) if i == 1 else raw)))
    body = b"".join(cs)
    ase.append(struct.pack("<IHHH2sI", 16 + len(body), 0xF1FA, len(cs), ms, b"", len(cs)) + body)
body = b"".join(ase)
head = struct.pack("<IHHHHHIHII B3s H BB hhHH 84s".replace(" ", ""), 128 + len(body), 0xA5E0, 3, 8, 8, 32, 1, 100, 0, 0, 0, b"", 0, 1, 1, 0, 0, 16, 16, b"")
assert len(head) == 128
open(os.path.join(s, "blink.aseprite"), "wb").write(head + body)

# the small atlas: five opaque 12 x 12 frames in pages of 32 texels (4 to a page)
for i in range(5): png(os.path.join(root, "small", "s%d.png" % i), 12, 12, pattern(12, 12, 200 + i))

json.dump({"gem.png": [6, 5, 1, 2, gem], "arrow.png": [5, 3, 0, 0, arrow], **{"sprites/blink.aseprite#%d" % i: [8, 8, 0, 0, f] for i, f in enumerate(frames)}}, sys.stdout)
