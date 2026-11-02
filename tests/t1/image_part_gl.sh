#!/bin/sh
# updatePixelsRect (tests/data/image_part): on the GL replay the ten 16 x 16 rectangles of a 512 x 512 image upload 1 KB each after the first full upload
# (1 MB), by the counters of ZINC_GL_STATS; the software frame is the same on the interpreter and QuickJS. Opens a window: skipped where there is none.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME=${ZINC_HOME:-$tmp/home} ZINC_BACKGROUND=1 ZINC_AUDIO=null
d=tests/data/image_part
h() { ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=200x200 ZINC_FRAMEHASH=last "$ZINC" run $d/main.ts $1 2>&1 | grep framehash; }
a=$(h --interp); [ -n "$a" ] && [ "$a" = "$(h '--engine quickjs')" ] || { echo "image_part: the engines draw different frames: $a"; exit 1; }
ZINC_GL_STATS=1 ZINC_RENDERER=gl ZINC_DETERMINISTIC=1 ZINC_DISPLAY=gl ZINC_SIZE=200x200 ZINC_FRAMES=12 timeout 90 "$ZINC" run $d/main.ts >"$tmp/gl.log" 2>&1
grep -q "renderer gl:" "$tmp/gl.log" || { echo "skipped: no GL window here"; exit 77; }
grep -q "^stat 6 1 1024$" "$tmp/gl.log" || { echo "image_part: frameStat did not report one draw and 1024 bytes uploaded: $(grep '^stat' "$tmp/gl.log" | tr '\n' ' ')"; exit 1; }
line=$(grep "uploads of runtime images" "$tmp/gl.log")
python3 - "$line" <<'PY' || exit 1
import re, sys
m = re.search(r"(\d+) uploads of runtime images \((\d+) of a rectangle only\), (\d+) bytes", sys.argv[1])
if not m: print("image_part: no upload line: " + sys.argv[1]); sys.exit(1)
ups, part, b = map(int, m.groups())
# one whole upload (1 MB) and a rectangle a frame
if not (part >= 8 and b <= 512 * 512 * 4 + 12 * 1024): print("image_part: %d uploads, %d of a rectangle, %d bytes (wanted at most %d)" % (ups, part, b, 512 * 512 * 4 + 12 * 1024)); sys.exit(1)
print("image_part: ok (%d uploads, %d of a rectangle, %d bytes)" % (ups, part, b))
PY
