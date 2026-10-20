#!/bin/sh
# Image codecs (ZN-115): PNG, JPEG, BMP and GIF fixtures decode to their stored pixels, encoders round trip, and a screenshot (ZINC_SHOT) is a compressed PNG.
BUILD=${BUILD:-build}
[ -x "$BUILD/codec_test" ] || { echo "skipped: codec_test is not built"; exit 77; }
"$BUILD/codec_test" tests/data/images | grep -q 'all checks passed' || { "$BUILD/codec_test" tests/data/images; exit 1; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=2 ZINC_SHOT="$tmp/s.png" "$ZINC" run tests/golden/res_jpeg/main.ts >/dev/null 2>&1
[ -s "$tmp/s.png" ] || { echo "no screenshot written"; exit 1; }
size=$(wc -c < "$tmp/s.png")
dims=$(python3 -c "import struct;d=open('$tmp/s.png','rb').read();print(struct.unpack('>II',d[16:24]))")
raw=$(python3 -c "import struct;d=open('$tmp/s.png','rb').read();w,h=struct.unpack('>II',d[16:24]);print(w*h*3)")
[ "$size" -lt $((raw / 4)) ] || { echo "the screenshot is $size bytes for $raw raw: not compressed"; exit 1; }
