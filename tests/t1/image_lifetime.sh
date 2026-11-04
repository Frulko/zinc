#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
[ -z "${ZINC_CI:-}" ] || { echo 'skipped: needs a real GPU'; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT HUP INT TERM
env -u ZINC_HEADLESS ZINC_BACKGROUND=1 ZINC_DISPLAY=gl ZINC_RENDERER=gl ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=160x160 timeout 60 "$ZINC" run tests/data/image_lifetime --interp > "$tmp/log" 2>&1 || { cat "$tmp/log"; exit 1; }
python3 - "$tmp/log" <<'PY'
import json,sys
samples={k:[] for k in ('live','freed')}
for line in open(sys.argv[1]):
    kind,_,value=line.partition(' ')
    if kind in samples: samples[kind].append(json.loads(value))
assert all(len(v)==3 for v in samples.values()),open(sys.argv[1]).read()
for cycle,(live,freed) in enumerate(zip(samples['live'],samples['freed'])):
    assert live['images']['objects']==1,live
    assert live['renderer.textures']['gpuBytesEstimate']>=128*128*4,live
    assert freed['images']['objects']==(1 if cycle==2 else 0),freed
    assert freed['renderer.textures']['objects']==0,freed
print('image_lifetime: CPU and GL textures released over three cycles, including idle frames')
PY
