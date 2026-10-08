#!/bin/sh
# Layout against a browser (ZN-253, ZN-254): 200 random flex trees per seed, laid out by zinc:ui and by headless Chrome, equal box by box within 1 px (Chrome rounded). Skipped without Chrome.
cd "$(dirname "$0")/../.." || exit 2
[ -n "$CHROME" ] || [ -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ] || command -v google-chrome chromium >/dev/null 2>&1 || { echo "layout_fuzz: no Chrome, skipped"; exit 0; }
fail=0
for seed in 1 2 5 6 7; do
  tools/layout-fuzz --cases 200 --seed $seed | tail -3 | grep -q "layout-fuzz: 0 of" || { echo "seed $seed differs:"; tools/layout-fuzz --cases 200 --seed $seed | tail -4; fail=1; }
done
[ $fail = 0 ] && echo "layout_fuzz: 1000 random trees match Chrome"
exit $fail
