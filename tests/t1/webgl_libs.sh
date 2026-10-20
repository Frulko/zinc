#!/bin/sh
# Defects of the WebGL binding that real libraries found (ZN-565), each as the smallest page that shows it (tests/golden/webgl):
#   sibling_interfaces    a WebGL 2 context is not `instanceof WebGLRenderingContext` (PixiJS 8 took it for WebGL 1, three.js refused it)
#   essl1_define_in_out   `#define in attribute` / `#define out varying` in GLSL ES 1.00 (every PixiJS 8 shader), a real global `in` still refused
#   essl1_texture_name    a variable, uniform or function named `texture` beside texture2D (Phaser 3's batch shader), and uniforms and
#                         attributes named after words desktop GLSL keeps for itself, found and listed under the page's name
# and three.js on a WebGL 2 context the page made (tests/golden/webenv/three/context.js). The driver may print "UNSUPPORTED (log once)"
# lines on stderr (Apple's GL); they are not part of a golden.
cd "$(dirname "$0")/../.." || exit 2
fail=0
page() {  # page.js [VAR=value...]
  file=$1; shift
  out=$(env ZINC_HEADLESS=1 "$@" "$ZINC" run "$file" --engine quickjs 2>&1 | grep -v UNSUPPORTED)
  [ "$out" = "$(cat "${file%.js}.out")" ] || { echo "webgl_libs: $file differs from ${file%.js}.out:"; echo "$out" | head -12; fail=1; }
}
page tests/golden/webgl/sibling_interfaces.js
page tests/golden/webgl/essl1_define_in_out.js
page tests/golden/webgl/essl1_texture_name.js
page tests/golden/webenv/three/context.js ZINC_WEB=1
exit $fail
