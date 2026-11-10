#!/bin/sh
# Validate reports, provenance and timeout cleanup without running a benchmark.
cd "$(dirname "$0")/../.." || exit 2
exec python3 tests/data/cui_compare.py
