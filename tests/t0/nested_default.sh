#!/bin/sh
# A nested function declaration called by name takes the default of an omitted parameter (ZN-934): the call used to pass null (a number default read 0,
# an array default trapped on `.slice()`), in the interpreter and in AOT.
cd "$(dirname "$0")/../.." || exit 2
for mode in --interp --native; do
  out=$("$ZINC" run tests/data/nested-default.ts $mode 2>&1 | tr '\n' ' ')
  [ "$out" = "6 1 " ] || { echo "nested default $mode: $out"; exit 1; }
done
echo "nested default: ok"
