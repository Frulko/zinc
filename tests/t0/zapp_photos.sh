#!/bin/sh
# zinc pack leaves the photographs of the assets as their files (ZN-879): resources.bin carries no decoded JPEG, and the engine decodes the
# file when the program first draws it (gfx_host.cpp photoFromAssets). The .zapp draws the same frame as the project run, where it is baked.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cp -R tests/golden/res_jpeg "$tmp/p"
"$ZINC" pack "$tmp/p" -o "$tmp/p.zapp" > /dev/null 2>&1 || { echo "pack failed"; exit 1; }
# the archive is a ustar: the name of a baked image is in resources.bin, the file itself under assets/
python3 -I - "$tmp/p.zapp" <<'EOF' || exit 1
import sys
d = open(sys.argv[1], 'rb').read(); i = 0; names = {}
while i + 512 <= len(d) and d[i:i + 512] != b'\0' * 512:
    h = d[i:i + 512]; size = int(h[124:136].strip(b'\0 ') or b'0', 8); names[h[:100].rstrip(b'\0').decode()] = d[i + 512:i + 512 + size]
    i += 512 + (size + 511) // 512 * 512
if 'assets/photo.jpg' not in names: sys.exit('the photograph is not in the .zapp')
if b'photo.jpg' in names.get('resources.bin', b''): sys.exit('the photograph was baked into resources.bin')
EOF
run() { ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=2 ZINC_SHOT="$2" "$ZINC" run "$1" > /dev/null 2>&1; }
run "$tmp/p" "$tmp/baked.png" && run "$tmp/p.zapp" "$tmp/file.png" || { echo "a run failed"; exit 1; }
cmp -s "$tmp/baked.png" "$tmp/file.png" || { echo "the .zapp draws the photograph differently from the baked run"; exit 1; }
