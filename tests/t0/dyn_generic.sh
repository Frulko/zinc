#!/bin/sh
# Generic code over Dyn (D181's workers need it): `v as T` from `any`, a T into `any` and JSON.stringify of a T, checked per instance.
cd "$(dirname "$0")/../.." || exit 2
"$ZINC" run tests/golden/host/dyn_generic.ts 2>&1 | diff -u tests/golden/host/dyn_generic.out - || { echo "dyn_generic output differs"; exit 1; }
