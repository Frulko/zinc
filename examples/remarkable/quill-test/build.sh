#!/bin/sh
# Host-only build. Fetches pinned MIT sources and the upstream SDK-built adapter; never writes to the tablet.
set -eu
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REV=39262ee0bef69915e3ead3ac218d5973916f422a
mkdir -p "$HERE/build" "$HERE/dist/quill-test"
SRC="$HERE/build/quill"
OUT="$HERE/dist/quill-test"
if [ ! -d "$SRC/.git" ]; then git clone https://github.com/MaximeRivest/quill.git "$SRC"; fi
git -C "$SRC" checkout --detach "$REV"
[ "$(git -C "$SRC" rev-parse HEAD)" = "$REV" ]
git -C "$SRC" diff --exit-code HEAD -- src/scribble.c
curl -fL --retry 2 --connect-timeout 15 --max-time 120 \
    https://github.com/MaximeRivest/quill/releases/download/v0.1.0/libquill.so -o "$OUT/libquill.so"
python3 - "$OUT/libquill.so" <<'PY'
import hashlib, pathlib, sys
assert hashlib.sha256(pathlib.Path(sys.argv[1]).read_bytes()).hexdigest() == 'e395af8e7ffb614dedf4370ef5fa2acc5ffa1f195da415b9049fd4f7d96f9929', 'Quill release checksum mismatch'
PY
docker run --rm --platform linux/arm64 -v "$HERE:/work" -w /work zinc/sdk-rmpp \
    sh -c 'gcc -O2 -Wall -Wextra build/quill/src/scribble.c -Ldist/quill-test -lquill -Wl,--allow-shlib-undefined -o dist/quill-test/scribble'
cp "$HERE/launch.sh" "$HERE/external.manifest.json" "$OUT/"
cp "$SRC/LICENSE" "$OUT/QUILL-LICENSE"
printf 'Quill source: %s\nAdapter: upstream v0.1.0 release (SDK 3.26)\n' "$REV" > "$OUT/PROVENANCE"
chmod +x "$OUT/launch.sh" "$OUT/scribble"
python3 - "$OUT" <<'PY'
import hashlib, pathlib, sys
p = pathlib.Path(sys.argv[1])
(p / 'SHA256SUMS').write_text(''.join(f'{hashlib.sha256((p / n).read_bytes()).hexdigest()}  {n}\n' for n in ['libquill.so', 'scribble', 'launch.sh', 'external.manifest.json']))
PY
echo "Ready: $OUT (not deployed)"
