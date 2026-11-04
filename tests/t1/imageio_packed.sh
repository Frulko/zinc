#!/bin/sh
# zinc:imageio reads the fast-load PNG that zinc pack makes (ZNI1, src/res/codec.cpp): the file taken out of a packed app gives the same header, the
# same thumbnail and the same downscaled load as the plain PNG, on the interpreter (portable reader) and on QuickJS.
cd "$(dirname "$0")/../.." || exit 2
command -v c++ >/dev/null || { echo "skipped: no C++ compiler"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME=${ZINC_HOME:-$tmp/home} ZINC_HEADLESS=1 ZINC_BACKGROUND=1 ZINC_APP_DATA=$tmp/data
out=$("$ZINC" plugin-build imageio 2>&1) && echo "$out" | grep -q "^imageio \(built\|cached\) " || { echo "the imageio plugin does not build: $out"; exit 1; }
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
printf 'import { onFrame } from "zinc:gfx";\nonFrame((dt: number) => {});\n' > "$tmp/p/main.ts"
"$ZINC" pack "$tmp/p" -o "$tmp/p.zapp" > "$tmp/pack.log" 2>&1 || { echo "pack failed: $(cat "$tmp/pack.log")"; exit 1; }
python3 -I - "$tmp/p.zapp" "$tmp/packed.png" <<'EOF' || { echo "big.png is not in the .zapp"; exit 1; }
import sys
d = open(sys.argv[1], 'rb').read(); i = 0
while i + 512 <= len(d) and d[i:i + 512] != b'\0' * 512:
    h = d[i:i + 512]; size = int(h[124:136].strip(b'\0 ') or b'0', 8)
    if h[:100].rstrip(b'\0').decode() == 'assets/big.png': open(sys.argv[2], 'wb').write(d[i + 512:i + 512 + size]); sys.exit(0)
    i += 512 + (size + 511) // 512 * 512
sys.exit(1)
EOF
head -c 4 "$tmp/packed.png" | grep -q ZNI1 || { echo "the packed PNG is not the fast-load image"; exit 1; }
cp "$tmp/p/assets/big.png" "$tmp/plain.png"
fail=0
session() {   # engine flag, file name
  for f in plain packed; do
    IMAGEIO_FILE="$tmp/$f.png" ZINC_DETERMINISTIC=1 ZINC_FRAMES=30 ZINC_SHOT="$tmp/$f$2.bmp" timeout 60 "$ZINC" run "$tmp/s.ts" $1 > "$tmp/$f$2.out" 2>&1
  done
  cmp -s "$tmp/plain$2.out" "$tmp/packed$2.out" || { echo "$2: the packed PNG gives other answers: $(cat "$tmp/plain$2.out") / $(cat "$tmp/packed$2.out")"; fail=1; }
  grep -q "^info 300x300 300x300 png true" "$tmp/packed$2.out" && grep -q "load 150x150" "$tmp/packed$2.out" || { echo "$2: unexpected output: $(cat "$tmp/packed$2.out")"; fail=1; }
  cmp -s "$tmp/plain$2.bmp" "$tmp/packed$2.bmp" || { echo "$2: the packed PNG is drawn differently"; fail=1; }
}
cp tests/golden/host/imageio_packed.ts "$tmp/s.ts"
session "" interp
session "--engine quickjs" quickjs
exit $fail
