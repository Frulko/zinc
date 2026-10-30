#!/bin/sh
# The runtime's state is per thread (D181, workers): one program run by four Machines on four threads at once prints what it prints alone
# (tests/unit/threads_test.cpp). The race check is the same test in a ThreadSanitizer build:
#   cmake -S . -B build-tsan -DCMAKE_BUILD_TYPE=RelWithDebInfo -DZN_TSAN=ON -DZN_WEBGL=OFF -DZN_WASM=OFF
#   BUILD_DIR=build-tsan tools/build zinc threads_test && ZINC=$PWD/build-tsan/zinc tests/run --only threads_two
cd "$(dirname "$0")/../.." || exit 2
BUILD=$(dirname "$ZINC")
[ -x "$BUILD/threads_test" ] || { echo "skipped: threads_test is not built (tools/build threads_test)"; exit 77; }
tmp=$(mktemp -d) && trap 'rm -rf "$tmp"' EXIT
"$ZINC" --emit=zbc-bin tests/data/threads_two.ts "$tmp/p.zbc" >/dev/null 2>&1 || { echo "threads_two: the program did not compile"; exit 1; }
out=$(TSAN_OPTIONS="halt_on_error=1 exitcode=66 ${TSAN_OPTIONS:-}" "$BUILD/threads_test" "$tmp/p.zbc" 4 2>&1)
rc=$?
[ $rc -eq 0 ] || { echo "threads_two: exit $rc"; echo "$out" | head -40; exit 1; }
[ "$out" = "total 21000 keys even,odd,t0,t1,t2,t3,t4,t5,t6" ] || { echo "threads_two: got '$out'"; exit 1; }
