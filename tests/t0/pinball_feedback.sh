#!/bin/sh
cd "$(dirname "$0")/../.." || exit 2
for engine in interp quickjs; do
  set -- --interp
  [ "$engine" = quickjs ] && set -- --engine quickjs
  ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=3 "$ZINC" run examples/n3ds-pinball/tools/feedback.ts "$@" || exit 1
done
