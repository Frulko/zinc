#!/bin/sh
set -eu
cd "${ZINC_ROOT:-$(dirname "$0")/../..}"
python3 tests/native/gpu56301/package.py
