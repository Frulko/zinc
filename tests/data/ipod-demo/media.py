# Writes the media of tests/t1/ipod_demo.sh and tests/t0/ipod.sh into the folder given: song.wav (two seconds of silence),
# tone-1.wav to tone-9.wav (two seconds of a tone each, one per song, all of song.wav's size: their bytes differ), melody-a.wav and
# melody-b.wav (twelve seconds of two different melodies, for the audio fingerprints) and two 64x64 PNG covers (cover-a.png: a
# violet to orange gradient with a sun; cover-b.png: green stripes).
import math, random, struct, sys, zlib, os

out = sys.argv[1]

def wav(name, rate, samples):
    data = b''.join(struct.pack('<h', s) for s in samples)
    open(os.path.join(out, name), 'wb').write(b'RIFF' + struct.pack('<I', 36 + len(data)) + b'WAVEfmt ' + struct.pack('<IHHIIHH', 16, 1, 1, rate, rate * 2, 2, 16) + b'data' + struct.pack('<I', len(data)) + data)

wav('song.wav', 8000, [0] * 16000)
for k in range(1, 10):
    f = 200 + 60 * k
    wav(f'tone-{k}.wav', 8000, [int(6000 * math.sin(2 * math.pi * f * i / 8000)) for i in range(16000)])

def melody(name, seed, rate=22050, secs=12):
    rnd = random.Random(seed)
    notes = [rnd.choice([220, 247, 262, 294, 330, 349, 392, 440, 494, 523]) for _ in range(secs * 4)]
    samples = []
    for i in range(rate * secs):
        t = i / rate
        f = notes[min(int(t * 4), len(notes) - 1)]
        env = 1 - (t * 4 % 1) * 0.7
        v = env * (0.5 * math.sin(2 * math.pi * f * t) + 0.25 * math.sin(4 * math.pi * f * t) + 0.12 * math.sin(6 * math.pi * f * t))
        samples.append(int(max(-1, min(1, v)) * 20000))
    wav(name, rate, samples)

melody('melody-a.wav', 1)
melody('melody-b.wav', 2)

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
