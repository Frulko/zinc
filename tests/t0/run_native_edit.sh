#!/bin/sh
# zinc run --native after an interpreted run: the executable is built from the cached bytecode, and must still list the program's file as its input,
# so an edit of a one-file program runs the new code, not the old executable. Skips (77) without a C++ compiler.
cd "$(dirname "$0")/../.." || exit 2
[ -n "$CXX" ] || command -v c++ >/dev/null || exit 77
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME="$tmp/home"
unset ZINC_DETERMINISTIC ZINC_NO_CACHE ZINC_RUN
echo "console.log('one');" > "$tmp/x.ts"
"$ZINC" run --interp "$tmp/x.ts" >/dev/null 2>&1   # caches the bytecode
out=$("$ZINC" run --native "$tmp/x.ts" 2>/dev/null)
[ "$out" = one ] || { echo "run_native_edit: first native run printed '$out'"; exit 1; }
echo "console.log('two');" > "$tmp/x.ts"
out=$("$ZINC" run --native "$tmp/x.ts" 2>/dev/null)
[ "$out" = two ] || { echo "run_native_edit: the edit was not run, printed '$out'"; exit 1; }
