#!/bin/sh
# zinc:ui/nuxt (ZN-357): examples/nuxt-ui's gallery of every component (variants, sizes, colours) renders to its frame hash in the light and the dark scheme,
# with the Modal, Slideover, menu and a toast open (ZN-357.03); scripted clicks and typing drive each control (Button, Checkbox, Switch, RadioGroup, Select,
# Input, Textarea) and each overlay opens and closes on Escape and on a press outside, the menu on a choice, the tooltip after 700 ms of hover.
cd "$(dirname "$0")/../.." || exit 2
app=../examples/nuxt-ui
export ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1
fail=0
while read -r page scheme open want; do
  s=''; [ "$scheme" = dark ] && s=dark
  o=''; [ "$open" != - ] && o=$open
  got=$(cd $app && ZINC_FRAMES=8 ZINC_SIZE=1100x900 ZINC_FRAMEHASH=last NUXT_SCHEME=$s NUXT_OPEN=$o "$ZINC" run . 2>&1 | grep framehash | awk '{print $5}')
  [ "$got" = "$want" ] || { echo "nuxt-ui $page $scheme: $got, recorded $want"; fail=1; }
done < tests/golden/nuxt-ui/hashes.txt
out=$(cd $app && ZINC_FRAMES=80 ZINC_SIZE=1100x1400 "$ZINC" run src/inspect.tsx 2>&1)
[ "$out" = "$(cat tests/golden/nuxt-ui/inspect.out)" ] || { echo "nuxt-ui controls: $(echo "$out" | diff - tests/golden/nuxt-ui/inspect.out | head -6)"; fail=1; }
[ $fail -eq 0 ] && echo "nuxt ui: ok"
exit $fail
