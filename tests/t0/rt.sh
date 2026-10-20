#!/bin/sh
# Shared runtime and operations: the operation semantics of include/zn/ops.h (unit test), and the interpreter, which now
# runs on them, still produces the run goldens (tests/t0/run.sh covers those): here only the structural rules.
cd "$(dirname "$0")/../.." || exit 2
fail=0
"$(dirname "$ZINC")/ops_test" >/dev/null || { echo "ops_test failed"; fail=1; }
# the dispatch loop must not define an operation of its own: every pure op comes from the shared list
grep -q "ZN_ARITH_OPS" src/vm/vm.cpp || { echo "vm.cpp does not use the shared operation list"; fail=1; }
grep -qE "ARITH\(|DIVLIKE\(" src/vm/vm.cpp && { echo "vm.cpp defines operations of its own"; fail=1; }
exit $fail
