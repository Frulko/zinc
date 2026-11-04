#!/bin/sh
# border-transparent keeps the border's width and draws nothing: the frame equals the same box with no border (it used to draw a white line).
cd "$(dirname "$0")/../.." || exit 2
export ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=3 ZINC_SCALE=1 ZINC_SIZE=320x120 ZINC_FRAMEHASH=last
a=$("$ZINC" run tests/data/border_transparent/transparent.tsx 2>&1 | grep framehash)
b=$("$ZINC" run tests/data/border_transparent/none.tsx 2>&1 | grep framehash)
[ -n "$a" ] && [ "$a" = "$b" ] || { echo "border-transparent draws: '$a' against '$b'"; exit 1; }
echo "border transparent: ok"
