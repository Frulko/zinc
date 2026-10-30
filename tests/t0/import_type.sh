#!/bin/sh
# `import type`, `{ type A }`, `import type * as ns` and an import read in types only add no run-time code: the module they alone reach does not run
# (interpreter, AOT, QuickJS), a worker that names a type of a module that draws is not refused (D181), and a worker that imports zinc:gfx by value still is.
cd "$(dirname "$0")/../.." || exit 2
d=tests/data/import_type
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
ZINC_HEADLESS=1 timeout 60 "$ZINC" run --interp $d/main.ts 2>/dev/null | diff -u $d/expected.out - || { echo "interpreter output differs"; fail=1; }
ZINC_HEADLESS=1 timeout 60 "$ZINC" run $d/main.ts --engine quickjs 2>/dev/null | diff -u $d/expected.out - || { echo "QuickJS output differs"; fail=1; }
ZINC_HEADLESS=1 timeout 60 "$ZINC" run --interp $d/wmain.ts 2>/dev/null | grep -qx "worker got Song" || { echo "the worker that imports a type is refused or silent"; fail=1; }
if timeout 300 "$ZINC" build $d/wmain.ts -o "$tmp/w" >/dev/null 2>&1 && timeout 300 "$ZINC" build $d/main.ts -o "$tmp/m" >/dev/null 2>&1; then
  ZINC_HEADLESS=1 timeout 60 "$tmp/m" 2>/dev/null | diff -u $d/expected.out - || { echo "AOT output differs"; fail=1; }
  ZINC_HEADLESS=1 timeout 60 "$tmp/w" 2>/dev/null | grep -qx "worker got Song" || { echo "the AOT worker that imports a type is silent"; fail=1; }
else echo "zinc build failed"; fail=1; fi
[ "$(ZINC_HEADLESS=1 timeout 60 "$ZINC" run --interp $d/class.ts 2>/dev/null)" = true ] || { echo "import type of a class runs its module or fails"; fail=1; }
ZINC_HEADLESS=1 timeout 60 "$ZINC" run --interp $d/fn.ts 2>&1 | grep -q "is not a type: \`import type\`" || { echo "import type of a function of a types-only module is not explained"; fail=1; }
ZINC_HEADLESS=1 timeout 60 "$ZINC" run --interp tests/data/worker_draw/main.ts 2>&1 | grep -q "a worker cannot draw" || { echo "a worker importing zinc:gfx by value is not refused"; fail=1; }
exit $fail
