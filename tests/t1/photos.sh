#!/bin/sh
# zinc:photos (plugins/photos) on the fake library (ZINC_FAKE_PHOTOS=<folder>): the plugin builds; a session (access, albums, assets newest
# first and paged, thumbnail and whole picture, saves to the library and to an album, errors) prints the frozen lines on the interpreter
# and on QuickJS; the thumbnail drawn by zinc:gfx has the picture's colour; a denied fake library refuses listing; a project whose
# permissions lack "photos" is refused when enforced. No real photo library is read.
cd "$(dirname "$0")/../.." || exit 2
command -v c++ >/dev/null || { echo "skipped: no C++ compiler"; exit 77; }
command -v python3 >/dev/null || { echo "skipped: no python3"; exit 77; }
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME=${ZINC_HOME:-$tmp/home} ZINC_HEADLESS=1 ZINC_BACKGROUND=1
out=$("$ZINC" plugin-build photos 2>&1) && echo "$out" | grep -q "^photos \(built\|cached\) " || { echo "the photos plugin does not build: $out"; exit 1; }
# the library: three pictures at the top (one a screenshot), one in the album Trips; dated so the newest is the red one
lib() {
  rm -rf "$1"; mkdir -p "$1/Trips"
  python3 - "$1" <<'EOF'
import struct, sys, zlib
def png(path, w, h, rgb):
    raw = b''.join(b'\0' + bytes(rgb) * w for _ in range(h))
    chunk = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    open(path, 'wb').write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b''))
d = sys.argv[1]
png(d + '/red.png', 64, 48, (255, 0, 0))
png(d + '/blue.png', 10, 10, (0, 0, 255))
png(d + '/Screenshot 1.png', 20, 40, (0, 255, 0))
png(d + '/Trips/beach.png', 30, 30, (255, 255, 0))
EOF
  touch -t 202601010000 "$1/blue.png"; touch -t 202602010000 "$1/Screenshot 1.png"; touch -t 202603010000 "$1/Trips/beach.png"; touch -t 202604010000 "$1/red.png"
}
want="status granted add granted
request granted
albums Recents(smart,4) Screenshots(smart,1) Trips(user,1)
all red.png Trips/beach.png Screenshot 1.png blue.png
first red.png 64x48 image true true
page Trips/beach.png Screenshot 1.png
trips Trips/beach.png
shots Screenshot 1.png
thumb 32x24
full 64x48
missing photos: no asset 'nope.png'
saved Zinc/IMG_0001.png
saved Zinc/IMG_0002.png
zinc Zinc/IMG_0001.png Zinc/IMG_0002.png
bad photos: the bytes are not a PNG or JPEG picture
limited picker true
albums Recents(smart,6) Screenshots(smart,1) Trips(user,1) Zinc(user,2)"
lib "$tmp/lib"
got=$(ZINC_FAKE_PHOTOS="$tmp/lib" ZINC_FRAMES=20 ZINC_SHOT="$tmp/shot.bmp" timeout 60 "$ZINC" run tests/golden/host/photos_session.ts 2>&1)
[ "$got" = "$want" ] || { echo "the session differs on the interpreter: $(echo "$got" | head -8)"; fail=1; }
px=$(python3 tests/data/bmp_pixel.py "$tmp/shot.bmp" 10,10 2>&1)
[ "$px" = "255,0,0" ] || { echo "the thumbnail is not on screen (pixel $px)"; fail=1; }
lib "$tmp/lib"
got=$(ZINC_FAKE_PHOTOS="$tmp/lib" timeout 60 "$ZINC" run tests/golden/host/photos_session.ts --engine quickjs 2>&1)
[ "$got" = "$want" ] || { echo "the session differs on QuickJS: $(echo "$got" | head -8)"; fail=1; }
# examples/photos: tap "Save a generated picture", then the newest thumbnail, which opens the saved picture whole (its disc in the middle)
lib "$tmp/lib"
printf '20 move 195 230\n21 down\n23 up\n60 move 70 320\n61 down\n63 up\n' > "$tmp/input"
got=$(ZINC_FAKE_PHOTOS="$tmp/lib" ZINC_INPUT="$tmp/input" ZINC_FRAMES=100 ZINC_SHOT="$tmp/demo.bmp" timeout 120 "$ZINC" run examples/photos 2>&1 | grep '^photos:')
[ "$got" = "photos: 3 albums
photos: album smart:recents: 4 pictures
photos: saved Zinc/IMG_0001.png
photos: 4 albums
photos: album smart:recents: 5 pictures
photos: showing Zinc/IMG_0001.png" ] || { echo "the demo's session differs: $got"; fail=1; }
px=$(python3 tests/data/bmp_pixel.py "$tmp/demo.bmp" 155,365 2>&1)
[ "$px" = "255,70,64" ] || { echo "the demo does not show the saved picture (pixel $px)"; fail=1; }
# a denied library: listing rejects, the status says so
printf "import { permissionStatus, albums } from 'zinc:photos';\nconsole.log(permissionStatus());\nalbums().then(() => console.log('listed')).catch((e: Error) => console.log(e.message));\n" > "$tmp/denied.ts"
got=$(ZINC_FAKE_PHOTOS="$tmp/lib" ZINC_FAKE_PHOTOS_ACCESS=denied timeout 60 "$ZINC" run "$tmp/denied.ts" 2>&1)
[ "$got" = "denied
photos: access to the library is not granted (requestPermission first)" ] || { echo "a denied library is listed: $got"; fail=1; }
# zinc.json permissions: without "photos", listing is refused when enforced
mkdir -p "$tmp/p" && printf '{ "name": "p", "entry": "main.ts", "permissions": ["fs"] }\n' > "$tmp/p/zinc.json" && cp "$tmp/denied.ts" "$tmp/p/main.ts"
got=$(cd "$tmp/p" && ZINC_PERMISSIONS=enforce ZINC_FAKE_PHOTOS="$tmp/lib" timeout 60 "$ZINC" run . 2>&1)
echo "$got" | grep -q 'needs the permission "photos"' || { echo "an undeclared photo library is not refused: $got"; fail=1; }
exit $fail
