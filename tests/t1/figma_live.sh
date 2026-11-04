#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
export ZINC_HEADLESS=1 ZINC_FRAMES=2000000000 ZINC_BACKGROUND=1
export ZINC_ROOT="$PWD"
python3 tests/data/figma-live/test_live.py
