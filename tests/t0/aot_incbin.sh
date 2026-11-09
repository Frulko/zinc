#!/bin/sh
# zinc build embeds the baked fonts and images with .incbin (ZN-429): the generated C++ names a file beside it instead of carrying the bytes as a
# literal, the file holds exactly what zinc bake makes, the unit's text carries the bytes' size and hash (the build caches key on the text, and
# -MD never lists an .incbin file), the program starts and draws, and the file goes away with the C++.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
mkdir -p "$tmp/p/src"
cat > "$tmp/p/src/main.ts" <<'TS'
import * as gfx from 'zinc:gfx';
gfx.onFrame((dt: number) => {
  gfx.clear(0xff202020);
  gfx.text(10, 10, 'incbin', 0xffffffff, 1);
});
TS
printf '{ "name": "p", "entry": "src/main.ts" }\n' > "$tmp/p/zinc.json"
mkdir "$tmp/out"
ZN_KEEP_CPP=1 "$ZINC" build "$tmp/p" -o "$tmp/out/p" > "$tmp/build.log" 2>&1 || { cat "$tmp/build.log"; exit 1; }
"$ZINC" bake "$tmp/p/src/main.ts" -o "$tmp/blob" > /dev/null
cmp "$tmp/blob" "$tmp/out/p.cpp.res"
python3 - "$tmp" <<'PY'
import pathlib, re, sys
t = pathlib.Path(sys.argv[1])
cpp, blob = (t / 'out/p.cpp').read_text(), (t / 'blob').read_bytes()
assert 'static const char kResources[] =' not in cpp, 'the bytes are still a literal'
assert '.incbin' in cpp and str(t / 'out/p.cpp.res') in cpp.replace('"\n  "', ''), 'no .incbin of the file'
h = 1469598103934665603
for c in blob: h = ((h ^ c) * 1099511628211) & (2**64 - 1)
assert f'// the baked fonts and images: {len(blob)} bytes, fnv1a {h:016x}' in cpp, 'size and hash of the bytes missing from the unit'
assert f'kResourcesSize = {len(blob)};' in cpp
PY
ZINC_HEADLESS=1 ZINC_FRAMES=2 ZINC_SHOT="$tmp/shot.png" timeout 60 "$tmp/out/p" > "$tmp/run.log" 2>&1 || { cat "$tmp/run.log"; exit 1; }
[ -s "$tmp/shot.png" ] || { echo 'no frame drawn'; exit 1; }
"$ZINC" build "$tmp/p" -o "$tmp/out/q" > "$tmp/build.log" 2>&1 || { cat "$tmp/build.log"; exit 1; }
[ ! -e "$tmp/out/q.cpp.res" ] && [ ! -e "$tmp/out/q.cpp" ] || { echo 'the C++ or its .incbin file was left beside the program'; exit 1; }
echo 'aot incbin: ok'
