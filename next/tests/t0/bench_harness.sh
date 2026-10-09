#!/bin/sh
# Test the gate's measurement contract without hardware timing or compiling kernels.
cd "$(dirname "$0")/../.." || exit 2
python3 tests/data/bench_harness.py
