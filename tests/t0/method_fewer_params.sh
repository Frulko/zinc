#!/bin/sh
# A method with fewer parameters than the interface or base method it implements, and an object literal for an interface of methods: the same output
# on the interpreter, AOT and QuickJS; more parameters or other types are still refused.
cd "$(dirname "$0")/../.." || exit 2
d=tests/data/method_fewer_params
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
ZINC_HEADLESS=1 timeout 60 "$ZINC" run --interp $d/main.ts 2>/dev/null | diff -u $d/expected.out - || { echo "interpreter output differs"; fail=1; }
ZINC_HEADLESS=1 timeout 60 "$ZINC" run $d/main.ts --engine quickjs 2>/dev/null | diff -u $d/expected.out - || { echo "QuickJS output differs"; fail=1; }
if timeout 300 "$ZINC" build $d/main.ts -o "$tmp/a" >/dev/null 2>&1; then
  ZINC_HEADLESS=1 timeout 60 "$tmp/a" 2>/dev/null | diff -u $d/expected.out - || { echo "AOT output differs"; fail=1; }
else echo "zinc build failed"; fail=1; fi
for bad in more_params:Z0116 wrong_type:Z0116 literal_more:Z0103 literal_wrong:Z0103; do
  f=${bad%%:*}; code=${bad##*:}
  "$ZINC" check $d/$f.ts 2>&1 | grep -q "$code" || { echo "$f: expected $code"; fail=1; }
done
exit $fail
