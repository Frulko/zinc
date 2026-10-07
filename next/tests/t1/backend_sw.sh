#!/bin/sh
# Software Backend (ZN-174): the scene of a live frame drawn through zn::gfx::Backend (1 and 4 band threads) hashes like the live frame (ZINC_FRAMEHASH), for hero and navigation.
cd "$(dirname "$0")/../.." || exit 2
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
fail=0
for app in ../examples/hero/src/main.tsx ../examples/maps/navigation/src/main.tsx; do
  live=$(ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=8 ZINC_FRAMEHASH=last ZINC_SCENE_DUMP="$t/s.scn" "$ZINC" run "$app" 2>&1 >/dev/null | sed -n 's/^zinc: framehash [0-9]* [0-9x]* //p')
  for th in 1 4; do
    got=$("$ZINC" capture --scene "$t/s.scn" "$app" --bench 1 $th | sed -n 's/.*hash=//p')
    [ -n "$live" ] && [ "$got" = "$live" ] || { echo "$app: backend hash '$got' x$th, live '$live'"; fail=1; }
  done
done
[ $fail -eq 0 ] && echo "backend_sw: ok"
exit $fail
