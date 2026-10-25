#!/bin/sh
set -eu
python3 tests/data/scene-exchange/test_exchange.py
ZINC_HEADLESS=1 "$ZINC" run tests/data/scene-exchange/runtime.ts
