#!/bin/sh
# Constants live only in include/zn: no constexpr or ZN_ macro is defined under src/, and both stubs include zn/limits.h.
cd "$(dirname "$0")/../.." || exit 2
bad=$(grep -rnE 'constexpr|#define +ZN_|enum +(class +)?Op\b' src)
[ -z "$bad" ] || { echo "constant defined outside include/zn:"; echo "$bad"; exit 1; }
grep -q 'zn/limits.h' src/zbc/zbc.h && grep -q 'zn/limits.h' src/vm/vm.h || { echo "stubs must include zn/limits.h"; exit 1; }
"$ZINC" --selftest
