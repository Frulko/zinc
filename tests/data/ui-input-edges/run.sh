#!/bin/sh
# Runs the programs of this directory on one engine ($1: --interp, "--engine quickjs" or native) and prints their result lines.
cd "$(dirname "$0")" || exit 2
for f in touch.ts capture.ts keys.tsx prepend.tsx select.ts; do
  if [ "$1" = native ]; then ZINC_RUN=native ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=135 "$ZINC" run "$f" 2>&1
  else ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=135 "$ZINC" run "$f" $1 2>&1; fi | grep -E '^(touch|capture|keys|prepend|select) '
done
