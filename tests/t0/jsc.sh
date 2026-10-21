#!/bin/sh
# The JavaScriptCore engine (ZN-773.03): the QuickJS goldens give the same output on `--engine jsc` (modules, promises, virtual timers, Node style
# console.log, stripped TypeScript); an uncaught exception, a rejected top-level await and an unhandled rejection end with 101; a zinc:gfx program
# draws its frames; zinc.json "engine": "jsc" picks it. macOS only (the system's JavaScriptCore): skipped elsewhere until the Linux pack (ZN-773.04).
cd "$(dirname "$0")/../.." || exit 2
[ "$(uname)" = Darwin ] || { echo "skip: JavaScriptCore is the system framework on macOS only"; exit 0; }
fail=0
for t in plain.js strip.ts; do
  "$ZINC" run tests/golden/qjs/$t --engine jsc 2>&1 | diff - tests/golden/qjs/${t%.*}.out >/dev/null || { echo "$t on jsc differs from tests/golden/qjs/${t%.*}.out"; fail=1; }
done
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
printf "console.log('before');\nthrow new Error('boom');\n" > "$tmp/boom.js"
out=$("$ZINC" run "$tmp/boom.js" --engine jsc 2>&1); rc=$?
[ $rc -eq 101 ] && echo "$out" | grep -q "Uncaught Error: boom" || { echo "an uncaught exception does not end with 101 on jsc ($rc): $out"; fail=1; }
printf "await new Promise((r) => setTimeout(r, 10));\nconsole.log('awaited', typeof __ZINC_ENGINE__ === 'string' ? __ZINC_ENGINE__ : '?');\nawait Promise.reject(new Error('late'));\n" > "$tmp/tla.js"
out=$("$ZINC" run "$tmp/tla.js" --engine jsc 2>&1); rc=$?
[ $rc -eq 101 ] && echo "$out" | grep -q "awaited jsc" && echo "$out" | grep -q "Uncaught Error: late" || { echo "top-level await or its rejection is wrong on jsc ($rc): $out"; fail=1; }
printf "Promise.reject(new Error('nobody'));\nsetTimeout(() => console.log('never'), 0);\n" > "$tmp/unhandled.js"
out=$("$ZINC" run "$tmp/unhandled.js" --engine jsc 2>&1); rc=$?
[ $rc -eq 101 ] && echo "$out" | grep -q "Uncaught (in promise) Error: nobody" && ! echo "$out" | grep -q never || { echo "an unhandled rejection does not stop the program on jsc ($rc): $out"; fail=1; }
printf "const p = Promise.reject(new Error('late handler'));\nsetTimeout(() => {}, 0);\np.catch(() => console.log('caught'));\n" > "$tmp/handled.js"
out=$("$ZINC" run "$tmp/handled.js" --engine jsc 2>&1); rc=$?
[ $rc -eq 0 ] && [ "$out" = caught ] || { echo "a rejection handled in the same turn is reported on jsc ($rc): $out"; fail=1; }
mkdir "$tmp/game"
printf '{ "entry": "main.ts", "engine": "jsc", "targets": { "macos": { "width": 200, "height": 100 } } }\n' > "$tmp/game/zinc.json"
printf "import { clear, onFrame } from 'zinc:gfx';\nlet n = 0;\nonFrame(() => { clear(0x102030); n++; if (n === 3) console.log('frames', n, __ZINC_ENGINE__); });\n" > "$tmp/game/main.ts"
out=$(ZINC_HEADLESS=1 ZINC_FRAMES=3 ZINC_SHOT="$tmp/game.png" "$ZINC" run "$tmp/game" 2>&1)
[ "$out" = "frames 3 jsc" ] && file "$tmp/game.png" 2>/dev/null | grep -q '200 x 100' || { echo "a zinc:gfx project with \"engine\": \"jsc\" does not draw its frames: $out"; fail=1; }
exit $fail
