#!/bin/sh
# Nuxt UI's tints (ZN-378): zinc:ui/nuxt's mix() of each case of tests/golden/oklab-tints/cases.txt (a tint over the page, a ring over the element's own tint)
# matches headless Chrome's color-mix(in oklab, ...) within 1 per channel. Skipped (77) without Chrome or Python's PIL.
cd "$(dirname "$0")/../.." || exit 2
python3 -c 'import PIL' 2>/dev/null || exit 77
python3 -c 'import sys; sys.path.insert(0, "tools"); from cdp import find_chrome; sys.exit(0 if find_chrome() else 1)' 2>/dev/null || exit 77
out=$(python3 tools/oklab-tints "$ZINC" 2>&1) || { echo "$out" | grep -v "diff [01]$" | head -5; exit 1; }
echo "oklab tints: ok ($(echo "$out" | tail -1))"
