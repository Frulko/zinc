#!/bin/sh
cd "$(dirname "$0")/../.." || exit 2
ZINC_HEADLESS=1 "$ZINC" run tests/data/pinball_physics/jolt.ts -- "$PWD/examples/pinball3d/assets/tables/tidal-lock"
