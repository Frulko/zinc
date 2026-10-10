#!/bin/sh
# PixiJS on the web environment (ZN-568): the unmodified pixi.min.mjs (third_party/pixi) written as its guide writes it, with no shim of the
# test's own. PixiJS 7.4.3: new Application() on WebGL 2, its view in the document, a sprite turning on the ticker and read back red at
# frames 2 and 8, and a scripted pointer reaching the sprite through PixiJS's own listeners (pointermove on the document, pointerup on the
# window, both in the capture phase). PixiJS 8.22 runs the same page of its API (await app.init, a Graphics square) once the WebGL binding has
# ZN-565's fixes: until then it stops at "Vertex Array Objects are not supported", because a WebGL 2 context is also
# `instanceof WebGLRenderingContext`, and this test says so in its log without failing.
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
page() {  # version directory
  env ZINC_HEADLESS=1 ZINC_WEB=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_FRAMES=10 ZINC_INPUT=tests/golden/webenv/pixi/pointer.input "$ZINC" run "tests/golden/webenv/pixi/$1/page.js" --engine quickjs > "$tmp/$1.out" 2> "$tmp/$1.err" \
    || { echo "webenv_pixi: the $1 page failed: $(grep -v '^zinc: Canvas 2D' "$tmp/$1.err" | head -c 300)"; fail=1; }
  diff "$tmp/$1.out" "tests/golden/webenv/pixi/$1/page.out" > "$tmp/$1.diff" || { echo "webenv_pixi: the $1 page differs from tests/golden/webenv/pixi/$1/page.out:"; head -20 "$tmp/$1.diff"; fail=1; }
  grep -q "Uncaught" "$tmp/$1.err" && { echo "webenv_pixi: PixiJS $1 threw: $(grep -m1 Uncaught "$tmp/$1.err" | cut -c1-200)"; fail=1; }
}
page v7
printf "console.log(document.createElement('canvas').getContext('webgl2') instanceof WebGLRenderingContext);\n" > "$tmp/zn565.js"
if [ "$(env ZINC_HEADLESS=1 ZINC_WEB=1 "$ZINC" run "$tmp/zn565.js" --engine quickjs 2>/dev/null)" = "false" ]; then page v8
else echo "webenv_pixi: PixiJS 8.22 not run: a WebGL 2 context is instanceof WebGLRenderingContext (ZN-565)"; fi
exit $fail
