#!/bin/sh
# Transitions on any animatable property and animate() on every style key (ZN-274): tests/golden/ui-transition samples 0, 50 and 100% on the engine
# clock (opacity, translate, rotate, colours, width), first styles, retargets, groups, every key of animate(), a state variant that moves with no layout,
# on the interpreter and QuickJS; under --profile esp32 the ninth tween at once and the tenth take their end at once (main.esp32.out).
cd "$(dirname "$0")/../.." || exit 2
d=tests/golden/ui-transition
run() { ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=320x200 ZINC_FRAMES=30 timeout 120 "$ZINC" run $d/main.ts "$@" 2>&1; }
run | diff - $d/main.out || { echo "ui-transition: values differ from main.out"; exit 1; }
run --engine quickjs | diff - $d/main.out || { echo "ui-transition: QuickJS differs from main.out"; exit 1; }
run --profile esp32 | diff - $d/main.esp32.out || { echo "ui-transition: --profile esp32 differs from main.esp32.out"; exit 1; }
echo "ui_transition: ok"
