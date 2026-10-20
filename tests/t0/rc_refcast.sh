#!/bin/sh
# ZN-166: a cast of an owned local that is released at its last use must be retained (it was a use-after-free: a const arrow called 20M times took 66 s in the AOT build).
cd "$(dirname "$0")/../.." || exit 2
"$ZINC" --emit=ir-rc ../tests/bench/kernels/closure_call.ts 2>&1 | grep -A1 "= refcast %0" | grep -q "retain %1" || { echo "no retain after the refcast of the closure"; exit 1; }
[ "$("$ZINC" run ../tests/bench/kernels/closure_call.ts 2>&1)" = "20000000" ] || { echo "wrong result"; exit 1; }
