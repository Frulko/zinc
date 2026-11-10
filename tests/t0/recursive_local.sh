#!/bin/sh
# Recursive declarations retain their self binding in nested callbacks without leaking a self cycle.
set -eu
cd "$(dirname "$0")/../.."
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
for engine in interp native quickjs; do
 case $engine in interp) set -- --interp;; native) set -- --native;; quickjs) set -- --engine quickjs;; esac
 timeout 20 env ZINC_STEPS=0 ZN_LEAK_CHECK=1 "$ZINC" run tests/golden/run/recursive_local.ts "$@" > "$t/out" 2> "$t/err" || { cat "$t/err"; exit 1; }
 diff tests/golden/run/recursive_local.out "$t/out"
 test ! -s "$t/err" || { cat "$t/err"; exit 1; }
done
echo 'recursive locals: construction, bounded callbacks, stale generations and restart pass without leaks'
