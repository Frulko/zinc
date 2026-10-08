#!/bin/sh
# Kickstart templates (ZN-317): every template of templates/ makes a project in a temporary directory that passes `zinc check` and `zinc test`
# (interpreter), and the graphical ones render a headless frame equal to their recorded hash (tests/golden/templates/frames.txt: template, size,
# frames, hash; a fresh zinc:storage file so saved state does not change the frame).
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
for d in ../templates/*/; do
  t=$(basename "$d")
  p="$tmp/$t"
  "$Z" new "$t" "$p" >/dev/null || { echo "zinc new $t failed"; fail=1; continue; }
  (cd "$p" && "$Z" check >"$tmp/check.$t" 2>&1) || { echo "$t: zinc check: $(head -3 "$tmp/check.$t")"; fail=1; }
  (cd "$p" && "$Z" test 2>&1 | tail -1 | grep -q ' 0 failure') || { echo "$t: zinc test fails"; fail=1; }
done
while read -r t size frames want; do
  got=$(cd "$tmp/$t" && ZINC_STORAGE="$tmp/storage.$t" ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=$size ZINC_FRAMES=$frames ZINC_FRAMEHASH=last "$Z" run . 2>&1 | grep framehash | awk '{print $5}')
  [ "$got" = "$want" ] || { echo "$t frame: $got, recorded $want"; fail=1; }
done < tests/golden/templates/frames.txt
[ $fail -eq 0 ] && echo "templates kickstart: ok"
exit $fail
