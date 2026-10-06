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
exit $fail
