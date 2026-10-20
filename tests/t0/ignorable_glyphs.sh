#!/bin/sh
# Default-ignorable code points (bidi isolates, zero widths, variation selectors) draw nothing: not the '?' of a missing glyph, whose
# advance would show (Discord's notifications wrap names in U+2068/U+2069); the width comes from the glyph loop the raster draws with.
set -e
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cat > "$tmp/main.ts" <<'TS'
import { font, textWidth } from 'zinc:gfx';
const f = font('sans', 20), plain = 'Léa Test', wrapped = '⁨Léa​ Test⁩️';
console.log(textWidth(f, wrapped, 0) === textWidth(f, plain, 0) ? 'same width' : `widths ${textWidth(f, wrapped, 0)} ${textWidth(f, plain, 0)}`);
TS
out=$(ZINC_HEADLESS=1 "$ZINC" run "$tmp/main.ts" 2>&1)
echo "$out" | grep -q 'same width' || { echo "ignorable: $(echo "$out" | grep -m1 'widths\|error')"; exit 1; }
