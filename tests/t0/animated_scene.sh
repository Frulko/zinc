#!/bin/sh
set -eu
ZINC_HEADLESS=1 "$ZINC" run tests/data/scene-exchange/animated_scene.ts -- "$PWD/examples/lantern-post/assets"
