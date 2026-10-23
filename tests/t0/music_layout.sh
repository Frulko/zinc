#!/bin/sh
cd "$(dirname "$0")/../.." || exit 2
ZINC_HEADLESS=1 "$ZINC" run tests/data/music-tree/responsive_layout.ts
