#!/bin/sh
# Rounded pictures (zinc:gfx drawImage with a radius) skip the corner test for the pixels well inside the box (a cover of 280 px: 97% of
# its pixels, on a Raspberry Pi 3 about 8 ms of CPU a frame less). Their pixels must be those of the engine that tested every one: the frame's
# hash, recorded before the change, on the interpreter and on QuickJS.
cd "$(dirname "$0")/../.." || exit 2
want=2732fbfe76e1a785
h() { ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=680x460 ZINC_SCALE=1 ZINC_FRAMEHASH=last "$ZINC" run tests/data/rounded_image/main.ts $1 2>&1 | grep framehash; }
a=$(h --interp); b=$(h '--engine quickjs')
case "$a" in *"$want"*) ;; *) echo "rounded_image: the frame is $a, not $want"; exit 1 ;; esac
[ "$a" = "$b" ] || { echo "rounded_image: QuickJS draws another frame: $b"; exit 1; }
echo "rounded_image: ok"
