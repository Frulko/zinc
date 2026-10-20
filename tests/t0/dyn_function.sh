#!/bin/sh
# DynFunction (ZN-168): typed functions passed where a dynamic host function is expected get an adapter that converts the arguments like JavaScript.
cd "$(dirname "$0")/../.." || exit 2
"$ZINC" run tests/golden/host/dyn_function.ts 2>&1 | diff -u tests/golden/host/dyn_function.out - || { echo "dyn_function output differs"; exit 1; }
