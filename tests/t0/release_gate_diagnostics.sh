#!/bin/sh
# Failing-check diagnostics with stub commands; no real suite, notification or process sampling.
cd "$(dirname "$0")/../.." || exit 2
python3 -B tests/data/release_gate_diagnostics.py
