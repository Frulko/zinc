#!/bin/sh
# PixiJS on the web environment (ZN-568): the unmodified pixi.min.mjs (third_party/pixi) written as its guide writes it, with no shim of the
# test's own. PixiJS 7.4.3: new Application() on WebGL 2, its view in the document, a sprite turning on the ticker and read back red at
# frames 2 and 8, and a scripted pointer reaching the sprite through PixiJS's own listeners (pointermove on the document, pointerup on the
# window, both in the capture phase). PixiJS 8.22.0 runs the same page of its API (await app.init, a Graphics square): it needs a WebGL 2
# context that is not `instanceof WebGLRenderingContext` and shaders that say `#define in attribute` (ZN-565).
# A picture from a file (ZN-569), picture.js in both versions: `await Assets.load(url)` with no preference set by the page, a Sprite of it,
# and the pixels read back inside its blocks are the file's own colours (tests/data/images/fixture.png). PixiJS loads it through an image
# element: the environment has no createImageBitmap while it has no Worker, which PixiJS would otherwise make without looking for one.
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
page() {  # version directory, page name, frames [VAR=value...]
  v=$1; name=$2; frames=$3; shift 3
  env ZINC_HEADLESS=1 ZINC_WEB=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_FRAMES="$frames" "$@" "$ZINC" run "tests/golden/webenv/pixi/$v/$name.js" --engine quickjs > "$tmp/$v-$name.out" 2> "$tmp/$v-$name.err" \
    || { echo "webenv_pixi: $v/$name.js failed: $(grep -v '^zinc: Canvas 2D' "$tmp/$v-$name.err" | head -c 300)"; fail=1; }
  diff "$tmp/$v-$name.out" "tests/golden/webenv/pixi/$v/$name.out" > "$tmp/$v-$name.diff" || { echo "webenv_pixi: $v/$name.js differs from tests/golden/webenv/pixi/$v/$name.out:"; head -20 "$tmp/$v-$name.diff"; fail=1; }
  grep -q "Uncaught" "$tmp/$v-$name.err" && { echo "webenv_pixi: PixiJS $v threw in $name.js: $(grep -m1 Uncaught "$tmp/$v-$name.err" | cut -c1-200)"; fail=1; }
}
for v in v7 v8; do
  page $v page 10 ZINC_INPUT=tests/golden/webenv/pixi/pointer.input
  page $v picture 4
done
exit $fail
