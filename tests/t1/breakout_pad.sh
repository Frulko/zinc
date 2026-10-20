#!/bin/sh
# breakout's pad session (ZN-753, tests/golden/breakout/pad.input: serve, move, break bricks, lose a life, serve again) at each console's
# screen size and profile, 900 frames on the interpreter: the last frame's hash is the golden the console cores give in their emulators
# (tests/t2/console_emulators.sh), so a console draws this very frame. The Kenney sprites are part of it (baked from examples/breakout/assets).
cd "$(dirname "$0")/../.." || exit 2
here=$PWD
fail=0
while read -r profile size want console; do
  got=$(cd examples/breakout && ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=$size ZINC_INPUT="$here/tests/golden/breakout/pad.input" ZINC_FRAMES=900 \
    ZINC_FRAMEHASH=last "$ZINC" run --interp --profile "$profile" . 2>&1 | sed -n 's/^zinc: framehash [0-9]* [0-9x]* \([0-9a-f]*\)$/\1/p')
  [ "$got" = "$want" ] || { echo "breakout pad session, $profile $size: frame hash ${got:-none}, golden $want"; fail=1; }
done < tests/golden/breakout/pad.hashes
exit $fail
