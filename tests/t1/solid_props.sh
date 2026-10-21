#!/bin/sh
# Solid props that read signals follow them: a click on "Notes" (ZINC_INPUT) moves the NavigationMenu's active item (built by
# `{renderNav()}`) and the DashboardNavbar's `title={page()}`, as in the desktop-app template.
cd "$(dirname "$0")/../.." || exit 2
want='before: active=Home title=Home page=-
after: active=Notes title=Notes page=Notes page'
for mode in "--interp"; do
got=$(ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_INPUT=tests/data/solid_props/click.input ZINC_FRAMES=24 "$ZINC" run $mode tests/data/solid_props/main.tsx 2>&1 | grep -E '^(before|after):')
[ "$got" = "$want" ] || { printf 'solid_props%s: differs\n%s\nwant:\n%s\n' "$mode" "$got" "$want"; exit 1; }
done
echo "solid_props: ok"
