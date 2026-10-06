#!/bin/sh
# Baked fonts and images (ZN-048): the blob the engine makes for tests/golden/res (text sizes in several notations, non-ASCII characters, a PNG and two SVGs)
# equals, glyph by glyph and pixel by pixel, what the old TypeScript tool produced (tests/golden/res/expected.json, made once with it).
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
"$ZINC" bake tests/golden/res/main.ts -o "$tmp/blob.bin" || { echo "zinc bake failed"; exit 1; }
python3 tests/t0/res_check.py "$tmp/blob.bin" tests/golden/res/expected.json > "$tmp/out" || { echo "the baked resources differ from the old tool's: $(grep -v '^fonts' "$tmp/out" | head -3)"; fail=1; }
grep -q "differences: 0" "$tmp/out" || fail=1
exit $fail
