#!/bin/sh
# examples/video/mapper: the pose a surface gets from its corners, media sizes, the GLB's shape, the selection of points (the editor's maths, no window).
cd "$(dirname "$0")/../.." || exit 2
out=$(ZINC_HEADLESS=1 timeout 60 "$ZINC" run --interp examples/video/mapper/tests/model_check.ts 2>&1 | tail -6)
[ "$(printf '%s' "$out" | tail -1)" = ok ] || { echo "$out"; exit 1; }
