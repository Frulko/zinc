#!/bin/sh
# Temporal dead zone (ZN-162): a function reading a top-level const before its declaration traps naming it; after the declaration it works.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT; fail=0
printf 'function show(): number { return L * 2; }\nconst L: number = 21;\nconsole.log(show());\n' > "$tmp/ok.ts"
printf 'function show(): number { return L * 2; }\nconsole.log(show());\nconst L: number = 21;\n' > "$tmp/bad.ts"
[ "$("$ZINC" run "$tmp/ok.ts" 2>&1)" = "42" ] || { echo "after the declaration: $("$ZINC" run "$tmp/ok.ts" 2>&1)"; fail=1; }
"$ZINC" run "$tmp/bad.ts" 2>&1 | grep -q "Cannot access 'L' before initialization" || { echo "no trap"; fail=1; }
# `arr.length = 0` on such a variable truncates it (its read carries the dead-zone check), on the three engines
printf "function reset(): void { watch.length = 0; }\nconst watch: string[] = ['a'];\nreset();\nconsole.log(watch.length);\n" > "$tmp/len.ts"
[ "$("$ZINC" run --interp "$tmp/len.ts" 2>&1)" = "0" ] || { echo "length (interp): $("$ZINC" run --interp "$tmp/len.ts" 2>&1 | tail -2)"; fail=1; }
[ "$("$ZINC" run "$tmp/len.ts" --engine quickjs 2>/dev/null)" = "0" ] || { echo "length (QuickJS) differs"; fail=1; }
if "$ZINC" build "$tmp/len.ts" -o "$tmp/len" >/dev/null 2>&1; then [ "$("$tmp/len" 2>&1)" = "0" ] || { echo "length (AOT) differs"; fail=1; }
else echo "length: zinc build failed"; fail=1; fi
exit $fail
