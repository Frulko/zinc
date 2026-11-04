#!/bin/sh
# zinc:gfx startImageDecode / pollImageDecode / cancelImageDecode: images decoded on a worker thread. A PNG, a JPEG, a cut PNG (-1), a cancelled
# handle, a spent and an unknown handle (-1), forty decodes at once; the pixels equal imageFromBytes' (the two halves of the frame), on the
# interpreter, on QuickJS and as an AOT program with the same output; and the frames stay short while a big image decodes (the longest frame
# of the async decode is under a third of the stall of the synchronous one: a relative check, no milliseconds).
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
python3 -I - "$tmp" <<'EOF' || exit 1
import sys, zlib, struct
def chunk(t, d): c = struct.pack('>I', len(d)) + t + d; return c + struct.pack('>I', zlib.crc32(t + d))
def png(path, n, level):
    raw = b''.join(b'\0' + b''.join(bytes([x * 255 // n, y * 255 // n, (x * y) & 255, 255 if (x // 8 + y // 8) % 3 else 40]) for x in range(n)) for y in range(n))
    open(path, 'wb').write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', n, n, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, level)) + chunk(b'IEND', b''))
png(sys.argv[1] + '/a.png', 200, 6)
png(sys.argv[1] + '/big.png', 2400, 1)
EOF
cp tests/data/images/fixture.jpg "$tmp/a.jpg"
export ZN_PNG="$tmp/a.png" ZN_JPG="$tmp/a.jpg" ZN_BIG="$tmp/big.png" ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=200x200 ZINC_SCALE=1 ZINC_FRAMES=1000000
run() { ZINC_SHOT="$2" "$ZINC" run tests/data/image_decode $3 2>&1 | grep -v '^$'; }
want=$(run x "$tmp/i.png" --interp)
echo "$want" | grep -q "^png 200x200 jpg [0-9]*x[0-9]* bad -1 many ok 40/40$" || { echo "interpreter: unexpected output: $want"; exit 1; }
echo "$want" | grep -q "^shrunk 50x50 16x12 200x200$" || { echo "interpreter: maxSide: $want"; exit 1; }
echo "$want" | grep -q "^spent handle -1 cancelled handle -1 unknown handle -1$" || { echo "interpreter: handles: $want"; exit 1; }
[ "$(run x "$tmp/q.png" "--engine quickjs")" = "$want" ] || { echo "quickjs: another output"; exit 1; }
"$ZINC" build tests/data/image_decode -o "$tmp/aot" > "$tmp/b.log" 2>&1 || { echo "build failed: $(head -c 300 "$tmp/b.log")"; exit 1; }
[ "$(ZINC_SHOT="$tmp/a.shot.png" "$tmp/aot" 2>&1 | grep -v '^$')" = "$want" ] || { echo "aot: another output"; exit 1; }
for f in i q a.shot; do
python3 - "$tmp/$f.png" <<'EOF' || { echo "$f: the async picture differs from imageFromBytes'"; exit 1; }
import sys, importlib.util, importlib.machinery
loader = importlib.machinery.SourceFileLoader('pngdiff', 'tools/pngdiff')
spec = importlib.util.spec_from_loader('pngdiff', loader); m = importlib.util.module_from_spec(spec); loader.exec_module(m)
w, h, bpp, px = m.dec(sys.argv[1])
for y0 in (0, 100):
    for y in range(y0, y0 + 100):
        for x in range(100):
            a = (y * w + x) * bpp; b = (y * w + x + 100) * bpp
            if px[a:a + 3] != px[b:b + 3]: sys.exit(1)
EOF
done
# frames stay short (real clock, the frame loop unpaced; the interpreter: the headless QuickJS run keeps a virtual clock)
out=$(ZINC_REALTIME=1 ZINC_DETERMINISTIC=0 ZINC_FRAMES=100000000 "$ZINC" run tests/data/image_decode_flat --interp 2>&1 | grep -v '^$')
[ "$out" = "flat decoded flat" ] || { echo "frames stall while a big image decodes: $out"; exit 1; }
