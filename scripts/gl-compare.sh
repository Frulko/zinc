#!/bin/sh
# Compares the software and the GPU renderer of display-gl on the gl-check scenes (and any other program built with
# --display gl): scripts/gl-compare.sh <app binary> <outdir> [scene...]; extra env is passed through.
#   node compiler/bin/zinc.mjs build examples/ui/gl-check --display gl
#   scripts/gl-compare.sh examples/ui/gl-check/build/macos-gl/cmake/app /tmp/glcmp rects text
app=$1; out=$2; shift 2
mkdir -p "$out"
for s in "$@"; do
  ZINC_SCENE=$s ZINC_RENDERER=cpu ZINC_FRAMES=${ZINC_FRAMES:-3} ZINC_SHOT="$out/$s-cpu.bmp" "$app" >/dev/null 2>&1
  ZINC_SCENE=$s ZINC_RENDERER=gl ZINC_FRAMES=${ZINC_FRAMES:-3} ZINC_SHOT="$out/$s-gl.bmp" ZINC_GL_STATS=1 "$app" 2>&1 | grep -v '^$' | sed "s/^/  [$s] /"
  node "$(dirname "$0")/pixel-diff.mjs" "$out/$s-cpu.bmp" "$out/$s-gl.bmp" --threshold "${THRESHOLD:-8}" --out "$out/$s-diff.png" --label "$s"
done
