# Writes the media of tests/t1/ipod_demo.sh into the folder given: song.wav (two seconds of silence) and two 64x64 PNG covers
# (cover-a.png: a violet to orange gradient with a sun; cover-b.png: green stripes).
import struct, sys, zlib, os

out = sys.argv[1]
n = 8000 * 2 * 2
open(os.path.join(out, 'song.wav'), 'wb').write(b'RIFF' + struct.pack('<I', 36 + n) + b'WAVEfmt ' + struct.pack('<IHHIIHH', 16, 1, 1, 8000, 16000, 2, 16) + b'data' + struct.pack('<I', n) + b'\0' * n)

def png(path, pixel):
    w = h = 64
    raw = b''.join(b'\0' + b''.join(bytes(pixel(x, y)) for x in range(w)) for y in range(h))
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    open(path, 'wb').write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))

def sunset(x, y):
    if (x - 32) ** 2 + (y - 40) ** 2 < 14 ** 2: return (255, 214, 102)
    t = y / 63
    return (int(88 + 167 * t), int(40 + 70 * t), int(160 - 110 * t))

def stripes(x, y):
    return (34, 120, 80) if (x + y) // 8 % 2 else (180, 214, 150)

png(os.path.join(out, 'cover-a.png'), sunset)
png(os.path.join(out, 'cover-b.png'), stripes)
