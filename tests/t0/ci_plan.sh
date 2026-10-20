#!/bin/sh
cd "$(dirname "$0")/../.." || exit 2
python3 tests/data/ci_plan.py
