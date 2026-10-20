#!/bin/sh
# zinc:ui/nuxt tokens (ZN-357.01): tests/golden/nuxt-theme checks every semantic token in light and dark against nuxt/ui 4.11.3's values (the table of
# docs/reports/nuxt-ui-research.md), the alias shades, a changed palette, the radius scale and the class helpers.
cd "$(dirname "$0")/../.." || exit 2
out=$("$ZINC" run tests/golden/nuxt-theme/main.ts 2>&1)
[ "$out" = "nuxt theme: ok" ] || { echo "$out" | head -8; exit 1; }
echo "nuxt theme: ok"
