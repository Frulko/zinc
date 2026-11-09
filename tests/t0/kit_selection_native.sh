#!/bin/sh
# No-window native mixed checkbox round trip and ordinary checkbox/switch click cycles.
set -eu
cd "$(dirname "$0")/../.."
[ "$(uname)" = Darwin ] || { echo 'skipped: AppKit is macOS only'; exit 77; }
got=$(ZINC_HEADLESS=1 ZINC_FRAMES=12 timeout 20 "$ZINC" run tests/golden/kit-selection-native --interp 2>&1) || { echo "$got"; exit 1; }
echo "$got" | rg -q '^selection native: ok$' || { echo "$got"; exit 1; }
echo 'kit selection native: ok'
