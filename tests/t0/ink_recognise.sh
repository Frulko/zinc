#!/bin/sh
# zinc:ink's recognise, recogniseAsync and loadModel (ZN-933): the same lines, to the sixth decimal of every score, on the interpreter, the AOT
# and QuickJS, and equal to tests/data/ink-recognise/expected.out (INK_RECOGNISE_UPDATE=1 rewrites it).
cd "$(dirname "$0")/../.." || exit 2
export INK_SET="$PWD/tools/ink-train/data/ink-set.json"
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export INK_TMP="$tmp"
fail=0
for e in --interp --native "--engine quickjs"; do
  ZINC_HEADLESS=1 ZINC_BACKGROUND=1 timeout 300 "$ZINC" run tests/data/ink-recognise $e >"$tmp/out" 2>"$tmp/err" || { echo "$e: failed"; tail -5 "$tmp/err"; fail=1; continue; }
  if [ "$INK_RECOGNISE_UPDATE" = 1 ] && [ "$e" = --interp ]; then cp "$tmp/out" tests/data/ink-recognise/expected.out; fi
  diff -u tests/data/ink-recognise/expected.out "$tmp/out" >"$tmp/diff" || { echo "$e: differs from expected.out"; head -20 "$tmp/diff"; fail=1; }
done
exit $fail
