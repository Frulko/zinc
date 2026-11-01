#!/bin/sh
# Murdoku e-ink skin (ZN-934): with ZINC_EINK=1 the app draws the plan with patterns and line art, in the portrait layout (1620x2160, 1404x1872 mono) and the landscape
# one (2160x1620). Each frame must hold only greys (no tint, no colour) and equal its golden hash; the colour app (no ZINC_EINK) draws something else.
# ZN_UPDATE_GOLDEN=1 rewrites the hashes and keeps the PNGs in tests/golden/murdoku-eink/.
cd "$(dirname "$0")/../.." || exit 2
d=tests/golden/murdoku-eink
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT HUP INT TERM
for size in 1620x2160 2160x1620 1404x1872; do
  out=$(ZINC_EINK=1 ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=$size ZINC_FRAMES=8 ZINC_FRAMEHASH=last ZINC_SHOT="$tmp/$size.png" "$ZINC" run examples/murdoku 2>&1) || { echo "murdoku eink $size: $out"; exit 1; }
  h=$(echo "$out" | grep framehash)
  python3 - "$tmp/$size.png" <<'PY' || { echo "murdoku eink $size: the frame has a tint"; exit 1; }
import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB')
bad = sum(1 for r, g, b in im.getdata() if not (r == g == b))
sys.exit(1 if bad else 0)
PY
  if [ -n "${ZN_UPDATE_GOLDEN:-}" ]; then echo "$h" > "$d/$size.hash"; cp "$tmp/$size.png" "$d/$size.png"; continue; fi
  [ "$h" = "$(cat $d/$size.hash)" ] || { echo "murdoku eink $size: $h"; exit 1; }
done
c=$(ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=1620x2160 ZINC_FRAMES=8 ZINC_FRAMEHASH=last "$ZINC" run examples/murdoku 2>&1 | grep framehash)
[ "$c" != "$(cat $d/1620x2160.hash)" ] || { echo "murdoku eink: the colour frame equals the e-ink one"; exit 1; }
echo "murdoku eink: ok"
