#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
case $ZINC in /*) ;; *) ZINC=$PWD/$ZINC ;; esac
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT HUP INT TERM
export ZINC_SIZE=128x64 ZINC_SCALE=1
mkdir -p "$tmp/project/assets"
cp tests/data/photo_files/main.ts "$tmp/project/main.ts"
cp tests/data/photo_files/wide.jpg "$tmp/project/assets/wide.jpg"
python3 - "$tmp/project/assets" <<'PY'
import pathlib,shutil,sys
for i in range(100): shutil.copy('tests/golden/res_jpeg/assets/photo.jpg',pathlib.Path(sys.argv[1])/('p'*200+'.jpg' if i==99 else f'p{i}.jpg'))
PY
for engine in '--interp' '--native' '--engine quickjs'; do
  ZINC_HEADLESS=1 ZINC_BACKGROUND=1 ZINC_DETERMINISTIC=1 ZINC_FRAMEHASH=last ZINC_FRAMES=3 timeout 60 "$ZINC" run "$tmp/project" $engine > "$tmp/log" 2>&1 || { cat "$tmp/log"; exit 1; }
  sed -n 's/^zinc: framehash .* //p' "$tmp/log" > "$tmp/hash"
  [ -s "$tmp/hash" ] || { cat "$tmp/log"; exit 1; }
  if [ -f "$tmp/reference" ]; then cmp "$tmp/reference" "$tmp/hash"; else cp "$tmp/hash" "$tmp/reference"; fi
  python3 - "$tmp/log" <<'PY'
import json,sys
lines=[x for x in open(sys.argv[1]) if x.startswith('photo_files: ')]
assert len(lines)==1,open(sys.argv[1]).read()
s=json.loads(lines[0].split(': ',1)[1]); assert s['baked.images']['objects']==1,s
assert s['images']['objects']==100,s
PY
done
"$ZINC" build "$tmp/project" -o "$tmp/app" > "$tmp/build" 2>&1 || { cat "$tmp/build"; exit 1; }
ZINC_HEADLESS=1 ZINC_BACKGROUND=1 ZINC_DETERMINISTIC=1 ZINC_FRAMEHASH=last ZINC_FRAMES=3 timeout 20 "$tmp/app" > "$tmp/log" 2>&1 || { cat "$tmp/log"; exit 1; }
sed -n 's/^zinc: framehash .* //p' "$tmp/log" > "$tmp/hash"
cmp "$tmp/reference" "$tmp/hash"
python3 - "$tmp/log" <<'PY'
import json,sys
s=json.loads(next(x.split(': ',1)[1] for x in open(sys.argv[1]) if x.startswith('photo_files: ')))
assert s['baked.images']['objects']==101 and s['images']['objects']==0,s
PY
if [ "$(uname)" = Darwin ]; then
  printf '%s\n' '{"entry":"main.ts","app":{"id":"dev.zinc.test.photo-files","name":"Photos"}}' > "$tmp/project/zinc.json"
  "$ZINC" build --bundle "$tmp/project" -o "$tmp/Photos.app" > "$tmp/build" 2>&1 || { cat "$tmp/build"; exit 1; }
  (cd "$tmp"; ZINC_HEADLESS=1 ZINC_BACKGROUND=1 ZINC_DETERMINISTIC=1 ZINC_FRAMEHASH=last ZINC_FRAMES=3 timeout 20 "$tmp/Photos.app/Contents/MacOS/Photos") > "$tmp/log" 2>&1 || { cat "$tmp/log"; exit 1; }
  sed -n 's/^zinc: framehash .* //p' "$tmp/log" > "$tmp/hash"
  cmp "$tmp/reference" "$tmp/hash"
  python3 - "$tmp/log" <<'PY'
import json,sys
s=json.loads(next(x.split(': ',1)[1] for x in open(sys.argv[1]) if x.startswith('photo_files: ')))
assert s['baked.images']['objects']==1 and s['images']['objects']==100,s
PY
fi
echo 'photo_files: 100 assets cached, destroyed/reused handles reload, runtime-sized photos external, oversized fallback embedded; interpreter/AOT/QuickJS'
