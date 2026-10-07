#!/bin/sh
# Render benchmark gate (ZN-171, wired to the T2 perf job of ZN-148): bench/render.csv is the baseline of the machine class that committed it; a median 25% worse (plus 400 us) fails.
cd "$(dirname "$0")/../.." || exit 2
tools/bench-render --check-regressions --tolerance 0.25 --runs 30 || exit 1
echo "bench_render: ok"
