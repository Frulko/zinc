#!/bin/sh
# The host layout engine through the runtime (ZN-284.01): tests/golden/layout-bridge wraps 100 random strings with the engine and compares them with the lines of
# lib/std/ui.ts, and lays out the owner's flex: 1 text case; the interpreter, the AOT and --engine quickjs print the same golden (no call back into the program).
# The program imports zinc:__layout itself, so its classic AOT build still installs and links the engine (ZN-355).
# Also covers two QuickJS fixes found on the way: a project directory runs its entry, and zinc:ui's relative import of ./palette resolves.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1
g=tests/golden/layout-bridge
fail=0
"$ZINC" run $g > "$tmp/int" 2>&1; diff -q "$tmp/int" $g/main.out >/dev/null || { echo "interpreter: $(diff "$tmp/int" $g/main.out | head -5)"; fail=1; }
"$ZINC" run $g --engine quickjs > "$tmp/qjs" 2>&1; diff -q "$tmp/qjs" $g/main.out >/dev/null || { echo "quickjs: $(diff "$tmp/qjs" $g/main.out | head -5)"; fail=1; }
"$ZINC" build $g/main.ts -o "$tmp/aot" > "$tmp/build" 2>&1 || { echo "aot build: $(tail -3 "$tmp/build")"; fail=1; }
[ -x "$tmp/aot" ] && { "$tmp/aot" > "$tmp/aot.out" 2>&1; diff -q "$tmp/aot.out" $g/main.out >/dev/null || { echo "aot: $(diff "$tmp/aot.out" $g/main.out | head -5)"; fail=1; }; }
grep -q "same lines 100 of 100" $g/main.out || { echo "the golden itself lost lines"; fail=1; }
[ $fail -eq 0 ] && echo "layout bridge: ok"
exit $fail
