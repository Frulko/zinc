#!/bin/sh
# zinc pack stores the large PNGs of the assets as the fast-load image at the same path (src/res/codec.cpp, ZNI1): a 300 x 300 PNG with alpha becomes
# one, a 16 x 16 one stays a PNG, the output is the same on every pack, --no-optimize and "assets": { "optimize": false } keep the files, and the packed
# program draws the same frame as the project run on its plain PNG, on the interpreter and on QuickJS. The source files are not touched.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/p/assets" "$tmp/q/assets"
python3 -I - "$tmp/p/assets" <<'EOF' || exit 1
import sys, zlib, struct
def png(path, n):
    raw = b''
    for y in range(n):
        raw += b'\0' + b''.join(bytes([x * 255 // n, y * 255 // n, (x ^ y) & 255, 255 if (x // 8 + y // 8) % 3 else 40 * (x % 4)]) for x in range(n))
    def chunk(t, d): c = struct.pack('>I', len(d)) + t + d; return c + struct.pack('>I', zlib.crc32(t + d))
    open(path, 'wb').write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', n, n, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
png(sys.argv[1] + '/big.png', 300)
png(sys.argv[1] + '/small.png', 16)
EOF
cat > "$tmp/p/main.ts" <<'EOF'
import { onFrame, clear, drawImage, imageFromBytes } from 'zinc:gfx';
import { readBytes } from 'zinc:assets';
const big = imageFromBytes(readBytes('big.png')), small = imageFromBytes(readBytes('small.png'));
onFrame((dt: number) => { clear(0x203040); drawImage(big, 10, 10, 200, 200, 255, 0); drawImage(small, 220, 10, 32, 32, 255, 0); });
EOF
cp -R "$tmp/p/." "$tmp/q/"
printf '{ "name": "q", "entry": "main.ts", "engine": "quickjs" }\n' > "$tmp/q/zinc.json"
sha_before=$(cksum "$tmp/p/assets/big.png")
members() {   # the archive is a ustar: print "name size first-4-bytes" of the assets
  python3 -I - "$1" <<'EOF'
import sys
d = open(sys.argv[1], 'rb').read(); i = 0
while i + 512 <= len(d) and d[i:i + 512] != b'\0' * 512:
    h = d[i:i + 512]; size = int(h[124:136].strip(b'\0 ') or b'0', 8); n = h[:100].rstrip(b'\0').decode()
    if n.startswith('assets/') and n.endswith('.png'): print(n, d[i + 512:i + 516].decode('latin1').replace('\x89', ''))
    i += 512 + (size + 511) // 512 * 512
EOF
}
for d in p q; do
  "$ZINC" pack "$tmp/$d" -o "$tmp/$d.zapp" > "$tmp/$d.log" 2>&1 || { echo "pack $d failed: $(cat "$tmp/$d.log")"; exit 1; }
  grep -q "optimized 1 PNG image" "$tmp/$d.log" || { echo "$d: pack does not say what it optimized: $(cat "$tmp/$d.log")"; exit 1; }
  m=$(members "$tmp/$d.zapp")
  echo "$m" | grep -q "assets/big.png ZNI1" || { echo "$d: big.png is not the fast-load image: $m"; exit 1; }
  echo "$m" | grep -q "assets/small.png PNG" || { echo "$d: small.png was not left as it is: $m"; exit 1; }
  "$ZINC" pack "$tmp/$d" -o "$tmp/$d.2.zapp" > /dev/null 2>&1
  cmp -s "$tmp/$d.zapp" "$tmp/$d.2.zapp" || { echo "$d: two packs differ"; exit 1; }
  "$ZINC" pack "$tmp/$d" --no-optimize -o "$tmp/$d.raw.zapp" > /dev/null 2>&1
  members "$tmp/$d.raw.zapp" | grep -q "ZNI1" && { echo "$d: --no-optimize still optimized"; exit 1; }
done
[ "$sha_before" = "$(cksum "$tmp/p/assets/big.png")" ] || { echo "the source PNG was modified"; exit 1; }
# zinc.json: assets.optimize false
mkdir -p "$tmp/r" && cp -R "$tmp/q/." "$tmp/r/" && printf '{ "name": "r", "entry": "main.ts", "engine": "quickjs", "assets": { "optimize": false } }\n' > "$tmp/r/zinc.json"
"$ZINC" pack "$tmp/r" -o "$tmp/r.zapp" > /dev/null 2>&1
members "$tmp/r.zapp" | grep -q "ZNI1" && { echo "assets.optimize false still optimized"; exit 1; }
run() { ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=2 ZINC_SHOT="$2" "$ZINC" run "$1" $3 > /dev/null 2>&1; }
run "$tmp/p" "$tmp/plain.png" && run "$tmp/p.zapp" "$tmp/packed.png" && run "$tmp/q" "$tmp/qplain.png" && run "$tmp/q.zapp" "$tmp/qpacked.png" || { echo "a run failed"; exit 1; }
cmp -s "$tmp/plain.png" "$tmp/packed.png" || { echo "interpreter: the packed program draws another frame"; exit 1; }
cmp -s "$tmp/qplain.png" "$tmp/qpacked.png" || { echo "quickjs: the packed program draws another frame"; exit 1; }
cmp -s "$tmp/plain.png" "$tmp/qplain.png" || { echo "the engines draw different frames"; exit 1; }
