#!/bin/sh
# Box2D and the 2D cabinet together: launch, flip and render the same session on two engines.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
gold=$PWD/tests/golden/pinball
input=$PWD/tests/data/pinball_physics/play.input
for engine in interp quickjs; do
  set -- --interp
  [ "$engine" = quickjs ] && set -- --engine quickjs
  env ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=960x600 ZINC_SCALE=1 ZINC_INPUT="$input" ZINC_FRAMES=300 \
    ZINC_SHOT="$tmp/$engine.png" ZINC_SHOT_FRAMES=240 "$ZINC" run examples/pinball "$@" >"$tmp/$engine.log" 2>&1 \
    || { cat "$tmp/$engine.log"; exit 1; }
done
if [ "$UPDATE" = 1 ]; then mkdir -p "$gold"; cp "$tmp/interp-240.png" "$gold/playing-240.png"; fi
tools/pngdiff "$tmp/interp-240.png" "$gold/playing-240.png" --tol 1 --max-diff 64 || exit 1
tools/pngdiff "$tmp/quickjs-240.png" "$tmp/interp-240.png" --tol 1 --max-diff 64
