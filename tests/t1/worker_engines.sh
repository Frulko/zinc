#!/bin/sh
# zinc:worker on the other engines: a compiled build (zinc build, AOT) compiles each worker into the binary and gives the interpreter's output
# (tests/t0/worker_basic.sh), and the typed wire program its output (tests/t0/worker_wire.sh); QuickJS says it has no workers yet.
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
timeout 300 "$ZINC" build tests/data/worker_basic/main.ts -o "$tmp/app" >/dev/null 2>&1 || { echo "zinc build of the worker program failed"; exit 1; }
ZINC_DETERMINISTIC=1 ZINC_HEADLESS=1 timeout 60 "$tmp/app" 2>/dev/null | diff -u tests/data/worker_basic/expected.out - || { echo "the compiled worker program's output differs"; fail=1; }
timeout 300 "$ZINC" build tests/data/worker_wire/main.ts -o "$tmp/wire" >/dev/null 2>&1 || { echo "zinc build of the typed wire program failed"; exit 1; }
ZINC_DETERMINISTIC=1 ZINC_HEADLESS=1 timeout 60 "$tmp/wire" 2>/dev/null | diff -u tests/data/worker_wire/expected.out - || { echo "the compiled typed wire program's output differs"; fail=1; }
ZINC_HEADLESS=1 timeout 60 "$ZINC" run tests/data/worker_basic/main.ts --engine quickjs 2>&1 | grep -q "QuickJS has no workers yet" || { echo "QuickJS does not say it has no workers"; fail=1; }
exit $fail
