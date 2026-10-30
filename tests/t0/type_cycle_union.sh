#!/bin/sh
# Modules that import each other's types (a pure cycle of `import type`, and a value module whose import has a type-only edge back) check as
# TypeScript does, and a conditional whose branches have different types takes their union (Promise.resolve(null) beside Promise.resolve(r),
# console.log(c ? n : 'none'), Dog beside Cat): interpreter, AOT and QuickJS print what Node 24 prints (expected.out).
cd "$(dirname "$0")/../.." || exit 2
d=tests/data/type_cycle_union
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
ZINC_HEADLESS=1 timeout 60 "$ZINC" run --interp $d/main.ts 2>"$tmp/err" | diff -u $d/expected.out - || { echo "interpreter output differs"; grep -m3 error "$tmp/err"; fail=1; }
ZINC_HEADLESS=1 timeout 60 "$ZINC" run $d/main.ts --engine quickjs 2>/dev/null | diff -u $d/expected.out - || { echo "QuickJS output differs"; fail=1; }
if timeout 300 "$ZINC" build $d/main.ts -o "$tmp/m" >"$tmp/build" 2>&1; then
  ZINC_HEADLESS=1 timeout 60 "$tmp/m" 2>/dev/null | diff -u $d/expected.out - || { echo "AOT output differs"; fail=1; }
else echo "zinc build failed"; grep -m3 error "$tmp/build"; fail=1; fi
exit $fail
