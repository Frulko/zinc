#!/bin/sh
# Zinc Atelier (ZN-050): the ESP32 (emulated) button runs the open file through `zinc run --target esp32 --qemu` and shows its output.
# Needs the emulator, downloaded and checked on first use (see esp32_qemu.sh).
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME="$PWD/build/tc-home"
g=tests/golden/atelier
ZINC_ATELIER_SYNC=1 ZINC_INPUT=$g/esp32.input ZINC_SIZE=1100x700 ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=16 ZINC_SCALE=1 ZINC_SHOT="$tmp/esp32.png" ZINC_SHOT_FRAMES=16 \
  "$ZINC" run app/atelier/main.tsx -- $g/proj >/dev/null 2>"$tmp/err" || { echo "atelier esp32 failed: $(head -c 300 "$tmp/err")"; exit 1; }
tools/pngdiff "$tmp/esp32-16.png" $g/esp32-16.png >/dev/null || { echo "atelier esp32: frame 16 differs from $g/esp32-16.png"; exit 1; }
