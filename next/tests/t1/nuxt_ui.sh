#!/bin/sh
# zinc:ui/nuxt (ZN-357): examples/nuxt-ui renders to its frame hashes (tests/golden/nuxt-ui/hashes.txt: name, scheme, overlay open, page, dashboard section):
# the gallery of every component light and dark with the Modal, Slideover, menu and a toast open, the navigation page, and the dashboard app's sections.
# Scripted clicks and typing drive every control (inspect.tsx), each overlay opens and closes on Escape and a press outside, the navigation page's Tabs,
# Accordion, Table, Pagination and sidebar respond (inspect-nav.tsx), and the dashboard navigates, filters, adds a customer through its modal, switches the
# scheme and collapses its sidebar (inspect-dashboard.tsx). The app's text is Public Sans at 400 to 700 (ZN-379, inspect-font.tsx).
cd "$(dirname "$0")/../.." || exit 2
app=../examples/nuxt-ui
export ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1
fail=0
while read -r name scheme open page sect want; do
  s=''; [ "$scheme" = dark ] && s=dark
  o=''; [ "$open" != - ] && o=$open
  p=''; [ "$page" != - ] && p=$page
  c=''; [ "$sect" != - ] && c=$sect
  size=1100x900; [ "$p" = "" ] && size=1280x860
  got=$(cd $app && ZINC_FRAMES=8 ZINC_SIZE=$size NUXT_SCHEME=$s NUXT_OPEN=$o NUXT_PAGE=$p NUXT_SECTION=$c ZINC_FRAMEHASH=last "$ZINC" run . 2>&1 | grep framehash | awk '{print $5}')
  [ "$got" = "$want" ] || { echo "nuxt-ui $name $scheme: $got, recorded $want"; fail=1; }
done < tests/golden/nuxt-ui/hashes.txt
check() {   # check <entry> <frames> <size> <golden>
  out=$(cd $app && ZINC_FRAMES=$2 ZINC_SIZE=$3 "$ZINC" run src/$1 2>&1)
  [ "$out" = "$(cat tests/golden/nuxt-ui/$4)" ] || { echo "nuxt-ui $1: $(echo "$out" | diff - tests/golden/nuxt-ui/$4 | head -6)"; fail=1; }
}
check inspect.tsx 80 1100x1400 inspect.out
check inspect-nav.tsx 14 1100x900 inspect-nav.out
check inspect-dashboard.tsx 14 1280x860 inspect-dashboard.out
check inspect-font.tsx 4 400x300 inspect-font.out
[ $fail -eq 0 ] && echo "nuxt ui: ok"
exit $fail
