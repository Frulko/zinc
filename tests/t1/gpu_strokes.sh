#!/bin/sh
# STROKE commands (ZN-590.01): a display that replays the lists on the GPU gets the polylines of stroke() and draws them itself. The software
# raster draws a STROKE it meets with the outline stroke() would have recorded (same frames at scale 1, ZINC_GPU_STROKES=1 forces the
# commands); the GL window draws navigation without tessellating a stroke or rasterizing a LINE/POLY tile on the CPU per frame.
cd "$(dirname "$0")/../.." || exit 2
fail=0
for p in tests/visual/shapes.ts examples/maps/navigation/src/main.tsx; do
  h() { env "$@" ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_FRAMES=12 ZINC_FRAMEHASH=all "$ZINC" run "$p" 2>&1 | grep framehash; }
  a=$(h ZINC_GPU_STROKES=0); b=$(h ZINC_GPU_STROKES=1)
  [ -n "$a" ] && [ "$a" = "$b" ] || { echo "$p: the software frames of STROKE commands differ from the outlines'"; fail=1; }
done
[ "$(uname)" = Darwin ] && launchctl managername 2>/dev/null | grep -q Aqua || { echo "skipped the window part: no GUI session"; exit $fail; }
s=$(env -u ZINC_DETERMINISTIC ZINC_GL_STATS=1 ZINC_RENDERER=gl ZINC_FRAMES=60 timeout 90 "$ZINC" run examples/maps/navigation 2>&1 | grep "renderer gl:")
case "$s" in
  "") echo "skipped the window part: no GL window here";;
  *", 0.0 strokes tessellated"*) ;;
  *) echo "navigation in the GL window tessellates strokes: $s"; fail=1;;
esac
t=$(printf '%s\n' "$s" | sed -n 's/.*per frame \([0-9.]*\) LINE\/POLY tiles.*/\1/p')
[ -z "$s" ] || awk -v t="${t:-999}" 'BEGIN { exit !(t < 1) }' || { echo "navigation in the GL window rasterizes $t LINE/POLY tiles per frame on the CPU"; fail=1; }
exit $fail
