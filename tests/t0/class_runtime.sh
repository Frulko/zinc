#!/bin/sh
# o.constructor.name and the `any` view of an object of a subclass (its own fields) give what JavaScript gives, on the interpreter, AOT and QuickJS.
# open_records: class instances and interface values shared as records, writes through interface properties, and how they print (D192).
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
for e in --interp --native; do
  "$ZINC" run $e tests/golden/host/class_runtime.ts 2>&1 | grep -v '^  \|^zinc run' | diff -u tests/golden/host/class_runtime.out - || { echo "class_runtime: $e differs"; fail=1; }
done
"$ZINC" run tests/golden/host/class_runtime.ts --engine quickjs 2>&1 | grep -v '^  \|^zinc run' | diff -u tests/golden/host/class_runtime.out - || { echo "class_runtime: QuickJS differs"; fail=1; }
o=tests/golden/host/open_records
ZINC_HEADLESS=1 timeout 60 "$ZINC" run --interp $o.ts 2>/dev/null | diff -u $o.out - || { echo "open_records: interpreter differs"; fail=1; }
ZINC_HEADLESS=1 timeout 60 "$ZINC" run $o.ts --engine quickjs 2>/dev/null | diff -u $o.out - || { echo "open_records: QuickJS differs"; fail=1; }
if timeout 300 "$ZINC" build $o.ts -o "$tmp/o" >/dev/null 2>&1; then
  ZINC_HEADLESS=1 timeout 60 "$tmp/o" 2>/dev/null | diff -u $o.out - || { echo "open_records: AOT differs"; fail=1; }
else echo "open_records: zinc build failed"; fail=1; fi
exit $fail
