#!/bin/sh
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
PI_TEST_DIR="$tmp" ZINC_HEADLESS=1 "$ZINC" run tests/data/pi-image/presets.ts
