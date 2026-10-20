#!/bin/sh
# three.js on the web environment (ZN-568): the unmodified three.module.js r186 (third_party/three) written as its own examples are, with no
# shim of the test's own: new WebGLRenderer() makes its canvas, the canvas goes in the document, setAnimationLoop runs on
# requestAnimationFrame, and a spinning red cube is read back at frames 1 and 8. OrbitControls hears a scripted drag on the canvas: 60 px
# across a 240 px window turn the camera by a quarter (azimuth -1.571).
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
env ZINC_HEADLESS=1 ZINC_WEB=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_FRAMES=10 ZINC_INPUT=tests/golden/webenv/three/cube.input "$ZINC" run tests/golden/webenv/three/cube.js --engine quickjs > "$tmp/out" 2> "$tmp/err" \
  || { echo "webenv_three: cube.js failed: $(head -c 300 "$tmp/err")"; fail=1; }
diff "$tmp/out" tests/golden/webenv/three/cube.out > "$tmp/diff" || { echo "webenv_three: cube.js differs from tests/golden/webenv/three/cube.out:"; head -20 "$tmp/diff"; fail=1; }
[ -s "$tmp/err" ] && { echo "webenv_three: three.js wrote on stderr: $(head -c 300 "$tmp/err")"; fail=1; }
# a picture from a file (ZN-569): TextureLoader's image element, uploaded when it has loaded; the twelve blocks read back are the file's colours
env ZINC_HEADLESS=1 ZINC_WEB=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_FRAMES=3 "$ZINC" run tests/golden/webenv/three/texture.js --engine quickjs > "$tmp/texture.out" 2> "$tmp/texture.err" \
  || { echo "webenv_three: texture.js failed: $(head -c 300 "$tmp/texture.err")"; fail=1; }
diff "$tmp/texture.out" tests/golden/webenv/three/texture.out > "$tmp/texture.diff" || { echo "webenv_three: texture.js differs from tests/golden/webenv/three/texture.out:"; head -20 "$tmp/texture.diff"; fail=1; }
[ -s "$tmp/texture.err" ] && { echo "webenv_three: three.js wrote on stderr with a texture: $(head -c 300 "$tmp/texture.err")"; fail=1; }
exit $fail
