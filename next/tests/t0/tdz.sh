#!/bin/sh
# Temporal dead zone (ZN-162): a function reading a top-level const before its declaration traps naming it; after the declaration it works.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT; fail=0
printf 'function show(): number { return L * 2; }\nconst L: number = 21;\nconsole.log(show());\n' > "$tmp/ok.ts"
printf 'function show(): number { return L * 2; }\nconsole.log(show());\nconst L: number = 21;\n' > "$tmp/bad.ts"
[ "$("$ZINC" run "$tmp/ok.ts" 2>&1)" = "42" ] || { echo "after the declaration: $("$ZINC" run "$tmp/ok.ts" 2>&1)"; fail=1; }
"$ZINC" run "$tmp/bad.ts" 2>&1 | grep -q "Cannot access 'L' before initialization" || { echo "no trap"; fail=1; }
exit $fail
