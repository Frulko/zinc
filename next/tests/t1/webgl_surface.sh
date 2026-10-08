#!/bin/sh
# A WebGL canvas in a zinc:ui page (ZN-205): a zinc:script context with zinc.json "webgl": true draws a triangle, gl.zincPresent fills a Surface node, which scrolls and clips with its page (frame hash).
cd "$(dirname "$0")/../.." || exit 2
d=tests/golden/webgl-surface
out=$(ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=160x140 ZINC_FRAMES=5 ZINC_FRAMEHASH=last "$ZINC" run $d 2>&1)
echo "$out" | grep -q '^present true$' || { echo "webgl-surface: the script did not present: $out"; exit 1; }
got=$(echo "$out" | sed -n 's/^zinc: framehash [0-9]* [0-9x]* //p')
[ "$got" = "$(cat $d/frame.hash)" ] || { echo "webgl-surface: frame $got, golden $(cat $d/frame.hash)"; exit 1; }
echo "webgl_surface: ok"
