#!/bin/sh
# The JavaScriptCore engine (ZN-773.03): the QuickJS goldens give the same output on `--engine jsc` (modules, promises, virtual timers, Node style
# console.log, stripped TypeScript); an uncaught exception, a rejected top-level await and an unhandled rejection end with 101; a zinc:gfx program
# draws its frames; zinc.json "engine": "jsc" picks it; WebGL clears and reads back. macOS only (the system's JavaScriptCore): skipped elsewhere until the Linux pack (ZN-773.04).
# tests/t0/v8.sh runs the same checks on V8 (`jsc.sh v8`).
e=${1:-jsc}
cd "$(dirname "$0")/../.." || exit 2
[ "$e" != jsc ] || [ "$(uname)" = Darwin ] || { echo "skip: JavaScriptCore is the system framework on macOS only"; exit 0; }
fail=0
for t in plain.js strip.ts; do   # the program's output only: on a fresh ZINC_HOME, stderr also says that esbuild is downloaded (once)
  "$ZINC" run tests/golden/qjs/$t --engine $e 2>/dev/null | diff - tests/golden/qjs/${t%.*}.out || { echo "$t on $e differs from tests/golden/qjs/${t%.*}.out"; fail=1; }
done
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
printf "console.log('before');\nthrow new Error('boom');\n" > "$tmp/boom.js"
out=$("$ZINC" run "$tmp/boom.js" --engine $e 2>&1); rc=$?
[ $rc -eq 101 ] && echo "$out" | grep -q "Uncaught Error: boom" || { echo "an uncaught exception does not end with 101 on $e ($rc): $out"; fail=1; }
printf "await new Promise((r) => setTimeout(r, 10));\nconsole.log('awaited', typeof __ZINC_ENGINE__ === 'string' ? __ZINC_ENGINE__ : '?');\nawait Promise.reject(new Error('late'));\n" > "$tmp/tla.js"
out=$("$ZINC" run "$tmp/tla.js" --engine $e 2>&1); rc=$?
[ $rc -eq 101 ] && echo "$out" | grep -q "awaited $e" && echo "$out" | grep -q "Uncaught Error: late" || { echo "top-level await or its rejection is wrong on $e ($rc): $out"; fail=1; }
printf "Promise.reject(new Error('nobody'));\nsetTimeout(() => console.log('never'), 0);\n" > "$tmp/unhandled.js"
out=$("$ZINC" run "$tmp/unhandled.js" --engine $e 2>&1); rc=$?
[ $rc -eq 101 ] && echo "$out" | grep -q "Uncaught (in promise) Error: nobody" && ! echo "$out" | grep -q never || { echo "an unhandled rejection does not stop the program on $e ($rc): $out"; fail=1; }
printf "const p = Promise.reject(new Error('late handler'));\nsetTimeout(() => {}, 0);\np.catch(() => console.log('caught'));\n" > "$tmp/handled.js"
out=$("$ZINC" run "$tmp/handled.js" --engine $e 2>&1); rc=$?
[ $rc -eq 0 ] && [ "$out" = caught ] || { echo "a rejection handled in the same turn is reported on $e ($rc): $out"; fail=1; }
mkdir "$tmp/game"
printf '{ "entry": "main.ts", "engine": "%s", "targets": { "macos": { "width": 200, "height": 100 } } }\n' "$e" > "$tmp/game/zinc.json"
printf "import { clear, onFrame } from 'zinc:gfx';\nlet n = 0;\nonFrame(() => { clear(0x102030); n++; if (n === 3) console.log('frames', n, __ZINC_ENGINE__); });\n" > "$tmp/game/main.ts"
out=$(ZINC_HEADLESS=1 ZINC_FRAMES=3 ZINC_SHOT="$tmp/game.png" "$ZINC" run "$tmp/game" 2>&1)
[ "$out" = "frames 3 $e" ] && file "$tmp/game.png" 2>/dev/null | grep -q '200 x 100' || { echo "a zinc:gfx project with \"engine\": \"$e\" does not draw its frames: $out"; fail=1; }
if [ -f "$(dirname "$ZINC")/libzn_webgl.dylib" ]; then   # WebGL from libzn_webgl through this engine's Node-API (ZN-773.02)
  printf "const c = document.createElement('canvas'); c.width = 4; c.height = 4;\nconst gl = c.getContext('webgl');\ngl.clearColor(1, 0.5, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);\nconst px = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);\nconsole.log(gl instanceof WebGLRenderingContext, Array.from(px).join());\n" > "$tmp/gl.js"
  out=$(ZINC_WEB=1 ZINC_HEADLESS=1 "$ZINC" run "$tmp/gl.js" --engine $e 2>&1)
  [ "$out" = "true 255,128,0,255" ] || { echo "WebGL does not clear and read back on $e: $out"; fail=1; }
fi
exit $fail
