#!/bin/sh
# Native-module ABI (ZN-096): the header is plain C99 and C++20 with no libuv or engine types, and the registry works against a module written in C.
BUILD=${BUILD:-build}
for std in "cc -std=c99 -x c" "c++ -std=c++20 -x c++"; do
  $std -Wall -Wextra -Werror -pedantic -fsyntax-only include/zn/native.h || { echo "native.h does not compile with: $std"; exit 1; }
done
if grep -nE 'uv_|zrt|#include <(uv|zn/rt)' include/zn/native.h; then echo "native.h leaks libuv or engine types"; exit 1; fi
"$BUILD/native_test" | grep -q 'all checks passed' || { "$BUILD/native_test"; exit 1; }
