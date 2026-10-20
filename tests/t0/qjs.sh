#!/bin/sh
# QuickJS engine (ZN-051): plain JavaScript (modules, promises, virtual timers, Node style console.log) and TypeScript stripped by blanking
# (tests/golden/qjs), an uncaught exception ends with exit code 101, an unknown engine is refused.
cd "$(dirname "$0")/../.." || exit 2
fail=0
for t in plain.js strip.ts; do
  "$ZINC" run tests/golden/qjs/$t --engine quickjs 2>&1 | diff -q - tests/golden/qjs/${t%.*}.out >/dev/null || { echo "$t on quickjs differs from tests/golden/qjs/${t%.*}.out"; fail=1; }
done
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
printf "console.log('before');\nthrow new Error('boom');\n" > "$tmp/boom.js"
"$ZINC" run "$tmp/boom.js" --engine quickjs >/dev/null 2>&1; [ $? -eq 101 ] || { echo "an uncaught exception does not end with 101 on quickjs"; fail=1; }
"$ZINC" run "$tmp/boom.js" --engine nope >/dev/null 2>&1; [ $? -eq 2 ] || { echo "an unknown engine is not refused"; fail=1; }
printf "const x: number = 1;\ninterface;\n" > "$tmp/bad.ts"
"$ZINC" run "$tmp/bad.ts" --engine quickjs 2>&1 | grep -q "bad.ts:2" || { echo "a type error position is not reported on quickjs"; fail=1; }
# a project's zinc.json window size reaches the QuickJS run as it reaches the typed engines (game-2d opened at 320x240)
mkdir "$tmp/sized"
printf '{ "entry": "main.ts", "targets": { "macos": { "width": 200, "height": 100 }, "linux": { "width": 200, "height": 100 } } }\n' > "$tmp/sized/zinc.json"
printf "import { clear, onFrame } from 'zinc:gfx';\nonFrame(() => { clear(0x102030); });\n" > "$tmp/sized/main.ts"
ZINC_HEADLESS=1 ZINC_FRAMES=2 ZINC_SHOT="$tmp/sized.png" "$ZINC" run "$tmp/sized" --engine quickjs >/dev/null 2>&1
file "$tmp/sized.png" 2>/dev/null | grep -q '200 x 100' || { echo "zinc.json's window size does not reach a quickjs run"; fail=1; }
exit $fail
