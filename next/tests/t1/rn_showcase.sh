#!/bin/sh
# The React Native style showcase (ZN-356): examples/rn-showcase uses no class string and no UI kit, runs in the rn layout mode, and its five states
# (discover, detail, stats, settings, sheet) render to the recorded frame hashes in the light and the dark scheme, and the feed scrolls (its content is a flex: 1
# scroll view: 600 px down shows the third card), and its sheet is dragged down by a PanResponder.
cd "$(dirname "$0")/../.." || exit 2
app=../examples/rn-showcase
fail=0
if grep -rnE 'class=|className=|zinc:ui/kit|std/kit|from .\./kit' $app/src >/dev/null; then echo "rn-showcase uses a class string or the kit: $(grep -rnE 'class=|className=|zinc:ui/kit|std/kit' $app/src | head -3)"; fail=1; fi
grep -q '"layout": "rn"' $app/zinc.json || { echo "rn-showcase is not in the rn layout mode"; fail=1; }
while read -r screen scheme want scroll; do
  got=$(cd $app && ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=20 ZINC_SCALE=1 ZINC_SIZE=420x860 ZINC_FRAMEHASH=last SHOWCASE_SCREEN=$screen SHOWCASE_SCHEME=$scheme SHOWCASE_SCROLL=${scroll:-} "$ZINC" run . 2>&1 | grep framehash | awk '{print $5}')
  [ "$got" = "$want" ] || { echo "rn-showcase $screen $scheme ${scroll:-}: $got, recorded $want"; fail=1; }
done < tests/golden/rn-showcase/hashes.txt
# the sheet follows a finger pulling it down (ZN-366): 30 px springs back open, 200 px closes it
for case in "30 0.92 1.00" "200 0.48 0.00"; do
  set -- $case
  got=$(cd $app && ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=45 ZINC_SCALE=1 ZINC_SIZE=420x860 SHOWCASE_SCREEN=sheet SHOWCASE_DRAG=$1 "$ZINC" run . 2>&1 | grep 'sheet' | tr '\n' ' ')
  [ "$got" = "frame 8: sheet $2 frame 40: sheet $3 " ] || { echo "rn-showcase sheet drag $1: $got"; fail=1; }
done
[ $fail -eq 0 ] && echo "rn showcase: ok"
exit $fail
