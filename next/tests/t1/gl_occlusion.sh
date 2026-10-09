#!/bin/sh
# GL occlusion and culling (ZN-412.01): tests/data/tiles (6141 commands: opaque covers, rounded and nested clips, translucent boxes, text,
# shadows, polygons) gives the same GL frame with the occlusion pass and the culling as without them (ZINC_GL_OCCLUDE=0 ZINC_GL_CULL=0).
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME=${ZINC_HOME:-$tmp/home}
for v in 1 0; do
  ZINC_GL_OCCLUDE=$v ZINC_GL_CULL=$v ZINC_RENDERER=gl ZINC_DISPLAY=gl ZINC_DETERMINISTIC=1 ZINC_FRAMES=6 ZINC_SHOT="$tmp/gl$v.bmp" timeout 90 "$ZINC" run tests/data/tiles >"$tmp/log$v" 2>&1
  [ -s "$tmp/gl$v.bmp" ] || { echo "skipped: no GL window here ($(head -c 200 "$tmp/log$v"))"; exit 77; }
done
cmp -s "$tmp/gl1.bmp" "$tmp/gl0.bmp" || { echo "gl_occlusion: the GL frame changes with the occlusion pass and the culling"; exit 1; }
