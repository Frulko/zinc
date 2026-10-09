#!/bin/sh
# Unreachable functions are dropped (ZN-431): what is reached only through objects stays (promise jobs, timers, onFrame, a sort comparator,
# the any values JSON.parse builds in the runtime), in the interpreter and the AOT build; a class nothing builds loses its methods.
cd "$(dirname "$0")/../.." || exit 2
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
app=tests/data/reach_callbacks/main.ts
export ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=3
fail=0
"$ZINC" --interp run "$app" >"$t/i" 2>&1; cmp -s "$t/i" tests/data/reach_callbacks/expected.txt || { echo "interpreter:"; cat "$t/i"; fail=1; }
"$ZINC" build "$app" -o "$t/app" >/dev/null 2>&1 && "$t/app" >"$t/a" 2>&1; cmp -s "$t/a" tests/data/reach_callbacks/expected.txt || { echo "aot:"; cat "$t/a"; fail=1; }
n=$("$ZINC" --emit=zbc "$app" 2>&1 | grep -cE '^func @(Unused|Never)\.')
[ "$n" = 0 ] || { echo "methods of classes nothing builds are still there ($n)"; fail=1; }
[ $fail -eq 0 ] && echo "reach_callbacks: ok"
exit $fail
