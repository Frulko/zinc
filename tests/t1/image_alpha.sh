#!/bin/sh
# zinc:gfx transparent render targets (createImage(w, h, true)) and updatePixelsRect: tests/data/image_alpha/main.ts draws boxes of partial alpha and a
# nearest-sampled sheet into a transparent target, shows it over a blue frame, changes a rectangle of another image and clears the target.
# Headless on the software raster the pixels of frames 1 and 3 are the expected blends (4 of slack: the target recovers its alpha from two renders);
# the interpreter, AOT and QuickJS draw the same frame hash; on the GL replay (a window, ZINC_RENDERER=gl: skipped where there is none) the frame is the
# software frame's within a small tolerance.
cd "$(dirname "$0")/../.." || exit 2
command -v python3 >/dev/null || { echo "skipped: no python3"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME=${ZINC_HOME:-$tmp/home} ZINC_BACKGROUND=1 ZINC_AUDIO=null
d=tests/data/image_alpha
ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=200x100 ZINC_SCALE=1 ZINC_SHOT_FRAMES=1,3 ZINC_SHOT="$tmp/f.png" "$ZINC" run --interp $d/main.ts >"$tmp/out.txt" 2>&1
grep -q "images true true true true" "$tmp/out.txt" || { echo "image_alpha: $(cat "$tmp/out.txt")"; exit 1; }
python3 - "$tmp" <<'EOF' || exit 1
import sys, importlib.machinery, importlib.util
loader = importlib.machinery.SourceFileLoader('pngdiff', 'tools/pngdiff')
spec = importlib.util.spec_from_loader('pngdiff', loader); m = importlib.util.module_from_spec(spec); loader.exec_module(m)
def frame(name):
    w, h, bpp, px = m.dec(sys.argv[1] + '/' + name)
    return lambda x, y: tuple(px[(y * w + x) * bpp:(y * w + x) * bpp + 3])
f1, f3 = frame('f-1.png'), frame('f-3.png')
BLUE = (0, 0, 255)
want = [   # frame 1: target at (10, 10), part at (100, 10), opaque at (120, 10)
    ('green 50% over blue', f1(12, 12), (0, 100, 127)),
    ('opaque white over green', f1(17, 17), (255, 255, 255)),
    ('white alone', f1(22, 22), (255, 255, 255)),
    ('red 50% twice = 192', f1(35, 12), (192, 0, 63)),
    ('nothing outside the boxes', f1(55, 25), BLUE),
    ('nearest sheet: red texel', f1(11, 27), (255, 0, 0)),
    ('nearest sheet: transparent texel', f1(15, 27), BLUE),
    ('updatePixels row of red at 50%', f1(101, 10), (128, 0, 127)),
    ('part of the image the rectangle left alone', f1(105, 10), BLUE),
    ('updatePixelsRect green', f1(102, 14), (0, 255, 0)),
    ('rectangle outside the image changed nothing', f1(107, 17), BLUE),
    ('opaque image: the rectangle, alpha forced', f1(121, 11), (255, 255, 255)),
    ('opaque image: the rest black', f1(124, 14), (0, 0, 0)),
    ('clearImage: nothing of the target (box)', f3(12, 12), BLUE),
    ('clearImage: nothing of the target (sheet)', f3(11, 27), BLUE),
]
bad = ['%s: %s, wanted %s' % (n, g, w) for n, g, w in want if max(abs(a - b) for a, b in zip(g, w)) > 4]
print('\n'.join('image_alpha: ' + b for b in bad)) if bad else None
sys.exit(1 if bad else 0)
EOF
h() { ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=200x100 ZINC_FRAMEHASH=last "$ZINC" run $d/main.ts $1 2>&1 | grep framehash; }
a=$(h --interp); [ -n "$a" ] || { echo "image_alpha: no frame hash"; exit 1; }
[ "$a" = "$(h '--engine quickjs')" ] || { echo "image_alpha: QuickJS draws another frame: $(h '--engine quickjs') against $a"; exit 1; }
[ "$a" = "$(h '')" ] || { echo "image_alpha: the compiled program draws another frame: $(h '') against $a"; exit 1; }
# the GL replay
ZINC_GL_STATS=1 ZINC_RENDERER=gl ZINC_DETERMINISTIC=1 ZINC_DISPLAY=gl ZINC_SIZE=200x100 ZINC_FRAMES=3 ZINC_SHOT="$tmp/gl.bmp" timeout 90 "$ZINC" run $d/main.ts >"$tmp/gl.log" 2>&1
if [ -s "$tmp/gl.bmp" ] && grep -q "renderer gl:" "$tmp/gl.log"; then
  k=$(python3 -c "import struct, sys; print(struct.unpack('<i', open(sys.argv[1], 'rb').read()[18:22])[0] // 200)" "$tmp/gl.bmp")
  ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE="$k" ZINC_SIZE=200x100 ZINC_FRAMES=3 ZINC_SHOT="$tmp/sw.png" "$ZINC" run $d/main.ts >/dev/null 2>&1
  o=$(python3 tools/glcompare "$tmp/gl.bmp" "$tmp/sw.png") || { echo "image_alpha: GL: $o"; exit 1; }
  python3 - "$o" <<'PY' || exit 1
import re, sys
m = re.search(r"scale 1, pixels over \d+: ([\d.]+)%, mae ([\d.]+)", sys.argv[1])
if not m or float(m.group(1)) > 1 or float(m.group(2)) > 1: print("image_alpha: the GL frame differs from the software frame: " + sys.argv[1]); sys.exit(1)
PY
  echo "image_alpha: ok ($o)"
else
  echo "image_alpha: ok (software and three engines; GL skipped: no window)"
fi
