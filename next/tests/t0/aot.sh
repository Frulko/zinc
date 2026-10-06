#!/bin/sh
# AOT emitter (ZN-022): the C++ of fib is the golden one and is valid C++ against the shared headers (syntax only: the full builds are T1).
cd "$(dirname "$0")/.." || exit 2
cd .. || exit 2
fail=0
"$ZINC" --emit=cpp ../tests/bench/kernels/fib.ts 2>&1 | diff -q - tests/golden/aot/fib.cpp >/dev/null || { echo "aot golden differs: fib"; fail=1; }
cxx=${CXX:-c++}
"$cxx" -std=c++20 -fsyntax-only -w -I include -I src tests/golden/aot/fib.cpp || { echo "the generated C++ of fib does not compile"; fail=1; }
exit $fail
