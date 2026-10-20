#!/bin/sh
# Phaser 3 on the web environment (ZN-569, ZN-565): the unmodified phaser.min.js 3.90.0 (third_party/phaser) and a game of one scene, loaded
# as the two script elements of a page, boot to their frames with no shim of the test's own. Its WebGLRenderer compiles its shaders on a
# WebGL 1 context (its batch shader names a variable `texture`), its default textures decode (data: PNGs set as Image.src), its loader
# brings a picture from a file (XMLHttpRequest of a blob, a blob: URL, an image element), and at frames 2 and 8 the pixels read back after
# its render are the picture's own colours (tests/data/images/fixture.png), the rectangle's red and the background. A scripted key reaches
# its keyboard on the window (the left cursor key is up before it and down after) and a scripted button its pointer on the canvas.
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
env ZINC_HEADLESS=1 ZINC_WEB=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_FRAMES=12 ZINC_INPUT=tests/golden/webenv/phaser/game.input "$ZINC" run tests/golden/webenv/phaser/page.js --engine quickjs > "$tmp/out" 2> "$tmp/err" \
  || { echo "webenv_phaser: the page failed: $(grep -v '^zinc: Canvas 2D\|UNSUPPORTED' "$tmp/err" | head -c 300)"; fail=1; }
diff "$tmp/out" tests/golden/webenv/phaser/page.out > "$tmp/diff" || { echo "webenv_phaser: the page differs from tests/golden/webenv/phaser/page.out:"; head -20 "$tmp/diff"; fail=1; }
grep -q "Uncaught" "$tmp/err" && { echo "webenv_phaser: Phaser threw: $(grep -m1 -A3 Uncaught "$tmp/err" | cut -c1-200)"; fail=1; }
exit $fail
