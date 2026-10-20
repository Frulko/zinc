#!/bin/sh
# The kit gallery laid out in full (480 x 2400): its sections, the overlays one included, do not overlap their neighbours (ZN-228); the frame is the golden (checked by eye when recorded).
cd "$(dirname "$0")/../.." || exit 2
got=$(cd ../examples/ui/kit-gallery && ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=3 ZINC_SIZE=480x2400 ZINC_FRAMEHASH=last "$ZINC" run src/main.tsx 2>&1 >/dev/null | sed -n 's/^zinc: framehash [0-9]* [0-9x]* //p')
[ "$got" = "$(cat tests/golden/ui-kit-sections/frame.hash)" ] || { echo "ui-kit-sections: frame $got differs from the golden"; exit 1; }
echo "ui_kit_sections: ok"
