#!/bin/sh
# zinc:ui/nuxt (ZN-357): examples/nuxt-ui's gallery of every component (variants, sizes, colours) renders to its frame hash in the light and the dark scheme,
# and scripted clicks and typing drive each control (Button, disabled and loading buttons, Checkbox, Switch, RadioGroup, Select, Input, Textarea).
cd "$(dirname "$0")/../.." || exit 2
app=../examples/nuxt-ui
export ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=1100x900 ZINC_SCALE=1
fail=0
while read -r page scheme want; do
  s=''; [ "$scheme" = dark ] && s=dark
  got=$(cd $app && ZINC_FRAMES=3 ZINC_FRAMEHASH=last NUXT_SCHEME=$s "$ZINC" run . 2>&1 | grep framehash | awk '{print $5}')
  [ "$got" = "$want" ] || { echo "nuxt-ui $page $scheme: $got, recorded $want"; fail=1; }
done < tests/golden/nuxt-ui/hashes.txt
out=$(cd $app && ZINC_FRAMES=10 "$ZINC" run src/inspect.tsx 2>&1)
[ "$out" = "$(cat tests/golden/nuxt-ui/inspect.out)" ] || { echo "nuxt-ui controls: $(echo "$out" | diff - tests/golden/nuxt-ui/inspect.out | head -6)"; fail=1; }
[ $fail -eq 0 ] && echo "nuxt ui: ok"
exit $fail
