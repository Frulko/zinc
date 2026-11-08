#!/bin/sh
# React Native parity (ZN-1017): tests/golden/rn-parity, an ImageBackground with its title over the image and an <Image source={{ uri }}>, render
# to the recorded frame hash (the interpreter and QuickJS agree); scripted presses show Pressable's hitSlop={20} taking a press 12 px beside the box
# (a plain Pressable misses it), pressRetentionOffset keeping a press released 40 px off, and delayLongPress={200} firing onLongPress at 283 ms.
cd "$(dirname "$0")/../.." || exit 2
export ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=360x400 ZINC_SCALE=1
fail=0
for engine in --interp "--engine quickjs"; do
  out=$(ZINC_FRAMES=30 "$ZINC" run tests/golden/rn-parity $engine 2>&1 | grep '^log ')
  [ "$out" = "log slop,kept,long" ] || { echo "rn-parity $engine: '$out'"; fail=1; }
  h=$(ZINC_FRAMES=2 ZINC_FRAMEHASH=last "$ZINC" run tests/golden/rn-parity $engine 2>&1 | grep framehash)
  [ "$h" = "$(cat tests/golden/rn-parity/frame.hash)" ] || { echo "rn-parity frame $engine: $h"; fail=1; }
done
exit $fail
