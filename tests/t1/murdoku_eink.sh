#!/bin/sh
# Murdoku e-ink skin (ZN-934): with ZINC_EINK=1 the app draws the plan with patterns and line art, in the portrait layout (1620x2160, 1404x1872 mono) and the landscape
# one (2160x1620). Each frame must hold only greys (no tint, no colour) and equal its golden hash; the colour app (no ZINC_EINK) draws something else.
# ZN_UPDATE_GOLDEN=1 rewrites the hashes and keeps the PNGs in tests/golden/murdoku-eink/.
cd "$(dirname "$0")/../.." || exit 2
d=tests/golden/murdoku-eink
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT HUP INT TERM
for size in 1620x2160 2160x1620 1404x1872 1080x810; do   # 1080x810: the Paper Pro landscape as the app sizes it (zinc.json), drawn at 2 physical pixels each
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
# the colour mode (a colour panel: ZINC_EINK_COLOUR=1): the colour art in the same layout, with the toggle; the store is a temporary file, never the player's
for size in 1080x810 1620x2160; do
  out=$(ZINC_STORAGE="$tmp/store" ZINC_EINK_COLOUR=1 ZINC_EINK=1 ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=$size ZINC_FRAMES=8 ZINC_FRAMEHASH=last ZINC_SHOT="$tmp/c$size.png" "$ZINC" run examples/murdoku 2>&1) || { echo "murdoku eink colour $size: $out"; exit 1; }
  h=$(echo "$out" | grep framehash)
  if [ -n "${ZN_UPDATE_GOLDEN:-}" ]; then echo "$h" > "$d/colour-$size.hash"; cp "$tmp/c$size.png" "$d/colour-$size.png"; continue; fi
  [ "$h" = "$(cat $d/colour-$size.hash)" ] || { echo "murdoku eink colour $size: $h"; exit 1; }
done
# the toggle at run time: from colour back to black and white (the scripted step is the button's handler); the choice is stored for the next launch
echo '{ "steps": [ { "colour": false } ] }' > "$tmp/toggle.json"
MURDOKU_PEN_REPLAY="$tmp/toggle.json" ZINC_STORAGE="$tmp/store2" ZINC_EINK_COLOUR=1 ZINC_EINK=1 ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=1080x810 ZINC_FRAMES=200 ZINC_SHOT="$tmp/toggle.png" "$ZINC" run examples/murdoku >/dev/null 2>&1 || { echo "murdoku eink toggle: run failed"; exit 1; }
python3 - "$tmp/toggle.png" "$tmp/c1080x810.png" <<'PY' || { echo "murdoku eink toggle: the frame after the switch is not black and white (or the colour frame is)"; exit 1; }
import sys
from PIL import Image
def tinted(f): return any(not (r == g == b) for r, g, b in Image.open(f).convert('RGB').getdata())
sys.exit(1 if tinted(sys.argv[1]) or not tinted(sys.argv[2]) else 0)
PY
grep -q '^colour.0' "$tmp"/store2* || { echo "murdoku eink toggle: the choice was not kept"; exit 1; }
c=$(ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=1620x2160 ZINC_FRAMES=8 ZINC_FRAMEHASH=last "$ZINC" run examples/murdoku 2>&1 | grep framehash)
[ "$c" != "$(cat $d/1620x2160.hash)" ] || { echo "murdoku eink: the colour frame equals the e-ink one"; exit 1; }
echo "murdoku eink: ok"
