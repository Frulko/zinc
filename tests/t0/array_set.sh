#!/bin/sh
# Array.set(source, offset?): same output as the standard method on the interpreter, the default engine, QuickJS and AOT (offset, negative offset, overflow left out, the same array, a reference array).
cd "$(dirname "$0")/../.." || exit 2
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
for e in "--interp" "" "--engine quickjs"; do
  ZINC_HEADLESS=1 "$ZINC" run tests/data/array_set/main.ts $e > "$t/o" 2>&1
  cmp -s "$t/o" tests/data/array_set/expected.txt || { echo "array_set ($e): $(cat "$t/o")"; exit 1; }
done
"$ZINC" build tests/data/array_set/main.ts -o "$t/bin" >/dev/null 2>&1 && "$t/bin" > "$t/o" 2>&1
cmp -s "$t/o" tests/data/array_set/expected.txt || { echo "array_set (aot): $(cat "$t/o")"; exit 1; }
echo "array_set: ok"
