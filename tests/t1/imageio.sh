#!/bin/sh
# zinc:imageio (plugins/imageio) on the fixtures of tests/data/imageio: a JPEG stored on its side (EXIF orientation 6, date, camera, lens,
# exposure, GPS), a PNG, a WebP turned over (orientation 3), a HEIC (ImageIO only), an animated GIF (its frames) and a text file. The session (headers and EXIF, a
# thumbnail and loads turned upright, a refused file, a cancelled burst) prints the same lines on the interpreter with the portable reader
# (deterministic), with ImageIO (macOS), and on QuickJS; the drawn loads have the right colours in the right places; the thumbnail cache is
# written, and read back on a second run while the picture itself cannot be read.
cd "$(dirname "$0")/../.." || exit 2
command -v c++ >/dev/null || { echo "skipped: no C++ compiler"; exit 77; }
command -v python3 >/dev/null || { echo "skipped: no python3"; exit 77; }
fail=0
tmp=$(mktemp -d); trap 'chmod -R u+rw "$tmp" 2>/dev/null; rm -rf "$tmp"' EXIT
export ZINC_HOME=${ZINC_HOME:-$tmp/home} ZINC_HEADLESS=1 ZINC_BACKGROUND=1 ZINC_APP_DATA=$tmp/data
out=$("$ZINC" plugin-build imageio 2>&1) && echo "$out" | grep -q "^imageio \(built\|cached\) " || { echo "the imageio plugin does not build: $out"; exit 1; }
mkdir -p "$tmp/img" && cp tests/data/imageio/* "$tmp/img/"
heic=; [ "$(uname)" = Darwin ] && heic=1
want="portrait.jpg 20x40 px 40x20 o6 jpeg true '2024-05-01T12:34:56' 'Zinc' 'Test Camera' 'Test Lens 50mm' iso 200 0.008s f2.8 50mm 48.8584,2.2945
plain.png 30x10 px 30x10 o1 png true '' '' '' '' iso 0 0s f0 0mm nowhere
photo.webp 16x8 px 16x8 o3 webp true '2023-01-02T03:04:05' '' '' '' iso 0 0s f0 0mm nowhere
notes.txt null
missing.jpg null${heic:+
photo.heic 20x40 px 40x20 o6 heic true '2024-05-01T12:34:56' 'Zinc' 'Test Camera' 'Test Lens 50mm' iso 200 0.008s f2.8 50mm 48.8584,2.2945}
thumb 5x10
load 20x40
webp 16x8
fitted 8x4
frames 6x3 3: 100,200,300 ms
still 1 0
bad imageio: not an image it can read: <dir>/notes.txt
burst 40"
# the drawn loads: the JPEG upright (its left half, red, on top), the WebP turned over (its yellow left half now on the right)
pixels() {
  px=$(python3 tests/data/bmp_pixel.py "$1" 10,5 10,35 32,4 42,4 2>&1 | tr '\n' ' ')
  python3 -c "import sys; got = [int(v) for p in sys.argv[1].split() for v in p.split(',')]; want = [255,0,0, 0,0,255, 0,0,0, 255,255,0]
sys.exit(len(got) != 12 or any(abs(a - b) > 6 for a, b in zip(got, want)))" "$px" || { echo "$2: the loads are not drawn upright (pixels $px)"; fail=1; }
}
# the GIF's frames drawn side by side: red, green, blue
frames() {
  px=$(python3 tests/data/bmp_pixel.py "$1" 3,51 13,51 23,51 2>&1 | tr '\n' ' ')
  python3 -c "import sys; got = [int(v) for p in sys.argv[1].split() for v in p.split(',')]; want = [255,0,0, 0,255,0, 0,0,255]
sys.exit(len(got) != 9 or any(abs(a - b) > 6 for a, b in zip(got, want)))" "$px" || { echo "$2: the GIF's frames are not drawn (pixels $px)"; fail=1; }
}
session() {   # name, then the environment and the engine flags
  name=$1; shift
  got=$(env IMAGEIO_DIR="$tmp/img" IMAGEIO_HEIC=$heic ZINC_FRAMES=30 ZINC_SHOT="$tmp/$name.bmp" "$@" 2>&1)
  [ "$got" = "$want" ] || { echo "the session differs on $name: $(echo "$got" | head -12)"; fail=1; return; }
  case "$name" in quickjs) ;; *) pixels "$tmp/$name.bmp" "$name"; frames "$tmp/$name.bmp" "$name";; esac
}
session portable ZINC_DETERMINISTIC=1 timeout 60 "$ZINC" run tests/golden/host/imageio_session.ts
[ -n "$heic" ] && session imageio ZINC_DETERMINISTIC=1 ZINC_IMAGEIO=system timeout 60 "$ZINC" run tests/golden/host/imageio_session.ts
session quickjs ZINC_DETERMINISTIC=1 timeout 60 "$ZINC" run tests/golden/host/imageio_session.ts --engine quickjs
# the cache: written by the sessions; read back for a picture that can no longer be read (same path, size and date)
n=$(ls "$tmp/data/cache/thumbnails" 2>/dev/null | grep -c '\.jpg$')
[ "$n" -ge 2 ] || { echo "the thumbnail cache was not written ($n files)"; fail=1; }
printf "import { thumbnail } from 'zinc:imageio';\nimport { imageWidth } from 'zinc:gfx';\nthumbnail('%s', 10).then((t: number) => console.log('cached ' + imageWidth(t))).catch((e: Error) => console.log(e.message));\n" "$tmp/img/portrait.jpg" > "$tmp/cached.ts"
chmod 000 "$tmp/img/portrait.jpg"
got=$(ZINC_DETERMINISTIC=1 timeout 60 "$ZINC" run "$tmp/cached.ts" 2>&1)
[ "$got" = "cached 5" ] || { echo "the thumbnail cache is not read back: $got"; fail=1; }
chmod 644 "$tmp/img/portrait.jpg"
exit $fail
