#!/bin/sh
# Colour schemes (ZN-271): the switch restyles only the flagged nodes and re-renders nothing (tests/golden/ui-theme/main.out), and examples/ui/kit-gallery
# renders the dark scheme set by the environment (zinc.json "scheme") to the frame in dark.hash.
cd "$(dirname "$0")/../.." || exit 2
d=tests/golden/ui-theme
ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=320x240 ZINC_FRAMES=8 "$ZINC" run $d/main.tsx 2>&1 | diff - $d/main.out || { echo "ui-theme: counts differ from main.out"; exit 1; }
got=$(cd ../examples/ui/kit-gallery && ZINC_SCHEME=dark ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=480x320 ZINC_FRAMES=5 ZINC_FRAMEHASH=last "$ZINC" run src/main.tsx 2>&1 >/dev/null | sed -n 's/^zinc: framehash [0-9]* [0-9x]* //p')
[ "$got" = "$(cat $d/dark.hash)" ] || { echo "ui-theme: dark kit-gallery frame $got, golden $(cat $d/dark.hash)"; exit 1; }
echo "ui_theme: ok"
