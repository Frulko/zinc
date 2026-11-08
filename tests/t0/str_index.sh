#!/bin/sh
# UTF-16 index reads on non-ASCII strings (ZN-1015): charCodeAt, codePointAt, slice, charAt, at, indexOf and split('') give Node's results on the
# interpreter, in a native program (AOT) and on QuickJS (tests/golden/str_index/str_index.out is Node's output), and a charCodeAt loop over 1 MB
# of accented text is linear (it printed nothing in two minutes when each read converted the whole string). A real clock for the timing.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
src=tests/golden/str_index/str_index.ts want=tests/golden/str_index/str_index.out
export ZINC_HEADLESS=1; unset ZINC_DETERMINISTIC
fail=0
timeout 20 "$ZINC" run --interp "$src" > "$tmp/interp.out" 2>/dev/null
cmp -s "$tmp/interp.out" "$want" || { echo "interpreter: $(tr '\n' '|' < "$tmp/interp.out")"; fail=1; }
timeout 120 "$ZINC" build "$src" -o "$tmp/prog" > "$tmp/build.log" 2>&1 || { echo "zinc build failed: $(head -c 300 "$tmp/build.log")"; exit 1; }
timeout 20 "$tmp/prog" > "$tmp/aot.out" 2>/dev/null
cmp -s "$tmp/aot.out" "$want" || { echo "AOT: $(tr '\n' '|' < "$tmp/aot.out")"; fail=1; }
timeout 20 "$ZINC" run "$src" --engine quickjs > "$tmp/qjs.out" 2>/dev/null
cmp -s "$tmp/qjs.out" "$want" || { echo "QuickJS: $(tr '\n' '|' < "$tmp/qjs.out")"; fail=1; }
exit $fail
