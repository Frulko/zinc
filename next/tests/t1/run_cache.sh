#!/bin/sh
# zinc run's compiled-run cache (ZN-605): a hit starts the cached executable without compiling; editing an imported module or an asset compiles once
# and builds again; a touched file or an edited zinc.json is compiled, and the executable is kept when its C++ did not change. A headless compiled run
# (ZINC_RUN=native) of a small project with an import and a baked image; the program prints both.
cd "$(dirname "$0")/../.." || exit 2
command -v python3 >/dev/null || { echo "skipped: no python3"; exit 77; }
[ -n "$CXX" ] || command -v c++ >/dev/null || { echo "skipped: no C++ compiler"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME="$tmp/home" ZINC_RUN=native ZINC_HEADLESS=1 ZINC_FRAMES=2 ZINC_STEPS=1
p="$tmp/app"; mkdir -p "$p/src" "$p/assets"
png() {   # png <file> <width>: a 1-pixel-high white PNG
  python3 - "$1" "$2" <<'PY'
import struct, sys, zlib
w = int(sys.argv[2])
def chunk(t, d): return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
raw = b"\0" + b"\xff\xff\xff\xff" * w
open(sys.argv[1], "wb").write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, 1, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))
PY
}
printf '{ "name": "cache", "entry": "src/main.ts" }\n' > "$p/zinc.json"
printf "export const LABEL: string = 'a';\n" > "$p/src/label.ts"
cat > "$p/src/main.ts" <<'EOF'
import { onFrame, clear, rect, image, imageWidth } from 'zinc:gfx';
import { LABEL } from './label';
console.log('out ' + LABEL + ' ' + imageWidth(image('dot.png')));
onFrame((dt: number) => { clear(0); rect(0, 0, 4, 4, 0xffffff); });
EOF
png "$p/assets/dot.png" 3
fail=0
# step <what> <expected program line> <compiled: yes|no> <native build: yes|no>
step() {
  out=$("$ZINC" run "$p" 2>&1)
  printf '%s\n' "$out" | grep -q "^$2\$" || { echo "run_cache: $1: expected '$2', got: $out"; fail=1; return; }
  c=no; printf '%s\n' "$out" | grep -q '^  compile ' && c=yes
  b=no; printf '%s\n' "$out" | grep -q 'native build' && b=yes
  [ "$c:$b" = "$3:$4" ] || { echo "run_cache: $1: compiled $c (want $3), native build $b (want $4): $out"; fail=1; }
}
step "first run" "out a 3" yes yes
step "cache hit" "out a 3" no no
printf "export const LABEL: string = 'b';\n" > "$p/src/label.ts"
step "imported module edited" "out b 3" yes yes
png "$p/assets/dot.png" 5
step "asset edited" "out b 5" yes yes
step "cache hit after the asset" "out b 5" no no
touch -t 203001010000 "$p/src/label.ts"
step "touched module" "out b 5" yes no
printf '{ "name": "cache", "entry": "src/main.ts", "description": "edited" }\n' > "$p/zinc.json"
step "zinc.json edited" "out b 5" yes no
exit $fail
