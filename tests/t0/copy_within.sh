#!/bin/sh
# Array.copyWithin(target, start, end?): same output as the standard method on the interpreter, the default engine, QuickJS and AOT (overlap, negative indexes, a reference array).
cd "$(dirname "$0")/../.." || exit 2
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
for e in "--interp" "" "--engine quickjs"; do
  ZINC_HEADLESS=1 "$ZINC" run tests/data/copy_within/main.ts $e > "$t/o" 2>&1
  cmp -s "$t/o" tests/data/copy_within/expected.txt || { echo "copy_within ($e): $(cat "$t/o")"; exit 1; }
done
"$ZINC" build tests/data/copy_within/main.ts -o "$t/bin" >/dev/null 2>&1 && "$t/bin" > "$t/o" 2>&1
cmp -s "$t/o" tests/data/copy_within/expected.txt || { echo "copy_within (aot): $(cat "$t/o")"; exit 1; }
echo "copy_within: ok"
