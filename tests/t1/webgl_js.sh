#!/bin/sh
# WebGL in JavaScript on the QuickJS engine: each page of tests/golden/webgl prints what it drew, read back and the errors it saw, and equals its .out golden.
#   triangle              WebGL1 through gl.*, pixels read back (red centre, as the C++ test), the spec's errors (ZN-203.03)
#   antialias             the multisampled canvas (ZN-576)
#   draw_caches           the draw checks' caches follow the data (ZN-567)
#   webgl2                ES 3.00 shaders, a VAO, instanced attributes, a uniform buffer, buffer copies and the new errors (ZN-203.05)
#   webgl2_tex            textures, samplers, queries, sync, transform feedback, blits (ZN-203.07)
# and the defects of the binding that real libraries found (ZN-565), each as the smallest page that shows it:
#   sibling_interfaces    a WebGL 2 context is not `instanceof WebGLRenderingContext` (PixiJS 8 took it for WebGL 1, three.js refused it)
#   essl1_define_in_out   `#define in attribute` / `#define out varying` in GLSL ES 1.00 (every PixiJS 8 shader), a real global `in` still refused
#   essl1_texture_name    a variable, uniform or function named `texture` beside texture2D (Phaser 3's batch shader), and uniforms and
#                         attributes named after words desktop GLSL keeps for itself, found and listed under the page's name
#   switch_continue       `continue` inside a `switch` in a loop (ES 3.00): Apple's GL failed the link with an empty log (Spline's metaball pass)
#   three/context         three.js on a WebGL 2 context the page made (tests/golden/webenv)
# The driver may print "UNSUPPORTED (log once)" lines on stderr (Apple's GL); they are not part of a golden.
cd "$(dirname "$0")/../.." || exit 2
fail=0
page() {  # page.js [VAR=value...]
  file=$1; shift
  out=$(env ZINC_HEADLESS=1 "$@" "$ZINC" run "$file" --engine quickjs 2>&1 | grep -v UNSUPPORTED)
  [ "$out" = "$(cat "${file%.js}.out")" ] || { echo "webgl_js: $file differs from ${file%.js}.out:"; echo "$out" | diff - "${file%.js}.out" | head -12; fail=1; }
}
for p in triangle antialias draw_caches webgl2 webgl2_tex sibling_interfaces essl1_define_in_out essl1_texture_name switch_continue; do page tests/golden/webgl/$p.js; done
page tests/golden/webenv/three/context.js ZINC_WEB=1
[ $fail -eq 0 ] && echo "webgl_js: ok"
exit $fail
