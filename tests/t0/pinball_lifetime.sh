#!/bin/sh
set -eu
cd "${ZINC_ROOT:-$(dirname "$0")/../..}"
for engine in interp native quickjs; do
  case $engine in interp) set -- --interp;; native) set -- --native;; quickjs) set -- --engine quickjs;; esac
  ZINC_NATIVE=real ZINC_HEADLESS=1 ZINC_BACKGROUND=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=2 timeout 40 "$ZINC" run tests/data/pinball_lifetime/main.ts "$@"
done
