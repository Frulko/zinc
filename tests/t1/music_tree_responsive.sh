#!/bin/sh
# Real Music Tree nodes with static data and inert devices, at native screen sizes.
cd "$(dirname "$0")/../.." || exit 2
command -v python3 >/dev/null || exit 77
python3 tests/data/music-tree/test_responsive.py "$ZINC"
