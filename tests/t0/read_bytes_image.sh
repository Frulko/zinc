#!/bin/sh
# readBytes of zinc:assets and zinc:fs, then imageFromBytes: the same byte count, the same checksum and the same pixels on the interpreter, on
# QuickJS and as an AOT program (each reads the bytes in one host call, host.fsBytes); the PNG and its fast-load form (zinc pack).
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/p/assets"
python3 -I - "$tmp/p/assets/big.png" <<'EOF' || exit 1
import sys, zlib, struct
n = 300
raw = b''
for y in range(n):
    raw += b'\0' + b''.join(bytes([x * 255 // n, y * 255 // n, (x ^ y) & 255, 255 if (x // 8 + y // 8) % 3 else 40]) for x in range(n))
def chunk(t, d): c = struct.pack('>I', len(d)) + t + d; return c + struct.pack('>I', zlib.crc32(t + d))
open(sys.argv[1], 'wb').write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', n, n, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
EOF
cat > "$tmp/p/main.ts" <<'EOF'
import { onFrame, clear, drawImage, imageFromBytes } from 'zinc:gfx';
import { readBytes } from 'zinc:assets';
import * as fs from 'zinc:fs';
import { env } from 'zinc:sys';
const bytes = readBytes('big.png');
let sum = 0;
for (let i = 0; i < bytes.length; i++) sum = (sum * 31 + bytes[i]) % 1000003;
const other = fs.readBytes(env('ZN_PNG'));
console.log(`assets ${bytes.length} ${sum} fs ${other.length} ${other[0]} ${other[other.length - 1]}`);
const img = imageFromBytes(bytes);
onFrame((dt: number) => { clear(0x203040); drawImage(img, 10, 10, 200, 200, 255, 0); });
EOF
echo '{"name":"p","entry":"main.ts"}' > "$tmp/p/zinc.json"
export ZN_PNG="$tmp/p/assets/big.png" ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=2
run() { ZINC_SHOT="$2" "$ZINC" run "$1" $3 2>&1 | grep -v "^$" ; }
want=$(run "$tmp/p" "$tmp/i.png")
echo "$want" | grep -q "^assets [0-9]* [0-9]* fs [0-9]* 137 130" || { echo "interpreter: unexpected output: $want"; exit 1; }
[ "$(run "$tmp/p" "$tmp/q.png" "--engine quickjs")" = "$want" ] || { echo "quickjs: another output"; exit 1; }
"$ZINC" build "$tmp/p" -o "$tmp/aot" > "$tmp/b.log" 2>&1 || { echo "build failed: $(head -c 300 "$tmp/b.log")"; exit 1; }
[ "$(ZINC_ASSETS="$tmp/p/assets" ZINC_SHOT="$tmp/a.png" "$tmp/aot" 2>&1 | grep -v '^$')" = "$want" ] || { echo "aot: another output"; exit 1; }
cmp -s "$tmp/i.png" "$tmp/q.png" || { echo "quickjs draws other pixels"; exit 1; }
cmp -s "$tmp/i.png" "$tmp/a.png" || { echo "aot draws other pixels"; exit 1; }
