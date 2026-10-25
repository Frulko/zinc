#!/bin/sh
cd "$(dirname "$0")/../.." || exit 2
ZINC_HEADLESS=1 "$ZINC" run tests/data/pinball_physics/core.ts
