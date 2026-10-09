#!/bin/sh
# WebGL out of the zinc binary (ZN-330.01): zinc has no glslang, glad or src/gl (zn::gl) symbol; the module beside it (libzn_webgl) exports zn_webgl_open. A QuickJS program
# runs without the module, and one that asks for WebGL (ZINC_WEBGL=1) is told why it is missing. The WebGL programs themselves: tests/t1/webgl_*.sh, three.sh.
cd "$(dirname "$0")/../.." || exit 2
command -v nm >/dev/null || { echo "webgl_module: no nm"; exit 77; }
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
n=$(nm "$Z" 2>/dev/null | grep -c -i -e glslang -e glad_ -e gladLoad -e __ZN2zn2gl -e _ZN2zn2gl)
[ "$n" = 0 ] || { echo "webgl_module: zinc carries $n WebGL, glad or glslang symbols"; fail=1; }
mod=$(ls "$(dirname "$Z")"/libzn_webgl.* 2>/dev/null | head -1)
if [ -n "$mod" ]; then
  nm -g "$mod" | grep -q "zn_webgl_open" || { echo "webgl_module: $mod does not export zn_webgl_open"; fail=1; }
fi
printf "console.log('plain ' + (typeof document));\n" > "$tmp/plain.js"
[ "$(ZINC_WEBGL_LIB=/nonexistent/libzn_webgl.so "$Z" run "$tmp/plain.js" --engine quickjs 2>&1)" = "plain undefined" ] || { echo "webgl_module: a QuickJS program does not run without the module"; fail=1; }
ZINC_WEBGL=1 ZINC_WEBGL_LIB=/nonexistent/libzn_webgl.so "$Z" run "$tmp/plain.js" --engine quickjs 2>&1 | grep -q "WebGL is not available" || { echo "webgl_module: a program that wants WebGL is not told it is missing"; fail=1; }
exit $fail
