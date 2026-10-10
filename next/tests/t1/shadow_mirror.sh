#!/bin/sh
# Shadows with mirrored rows and columns (ZN-589): 300 shadows of every shape (whole, half and fractional centres, radii under half the
# blur, clipped, tiny and huge blurs) give, at scales 1 and 2, the frames of the code before the mirrors (tests/data/shadow_mirror/golden.txt).
cd "$(dirname "$0")/../.." || exit 2
got=$(for k in 1 2; do ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=$k ZINC_SIZE=320x240 ZINC_FRAMES=1 ZINC_FRAMEHASH=all "$ZINC" run tests/data/shadow_mirror/main.ts 2>&1 | sed -n 's/^zinc: framehash //p'; done)
[ "$got" = "$(cat tests/data/shadow_mirror/golden.txt)" ] || { printf 'shadow_mirror: frames differ\n%s\nwant:\n%s\n' "$got" "$(cat tests/data/shadow_mirror/golden.txt)"; exit 1; }
echo "shadow_mirror: ok"
