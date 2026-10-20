#!/bin/sh
# zinc:sys allocations() / liveObjects() (ZN-192): real counters of the runtime allocator.
cd "$(dirname "$0")/../.." || exit 2
"$ZINC" run tests/golden/host/allocations.ts 2>&1 | diff -u tests/golden/host/allocations.out - || { echo "allocations output differs"; exit 1; }
