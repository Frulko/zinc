#!/bin/sh
# The benchmark regression gate (ZN-148): the committed numbers pass, and a deliberate 20% slowdown of the interpreter and AOT times fails with exit 3.
cd "$(dirname "$0")/../.." || exit 2
tools/bench-gate >/dev/null || { echo "bench-gate failed on the unchanged engine"; tools/bench-gate; exit 1; }
tools/bench-gate --inject-slowdown 1.2 >/dev/null; rc=$?
[ "$rc" = 3 ] || { echo "bench-gate did not fail on a 20% slowdown (exit $rc)"; exit 1; }
echo "bench_gate: ok"
