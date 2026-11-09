#!/bin/sh
# A component that maps its props to child components (props.options.map((o, i) => <Pick on={props.value === o} .../>)) compiles and
# renders the same items on the interpreter and QuickJS (ZN-798).
cd "$(dirname "$0")/../.." || exit 2
want="Relay
Hold *
Follow"
fail=0
for e in --interp "--engine quickjs"; do
  got=$(ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=2 timeout 60 "$ZINC" run $e tests/data/jsx-map-props/main.tsx 2>/dev/null)
  [ "$got" = "$want" ] || { echo "jsx_map_props $e: got '$got'"; fail=1; }
done
exit $fail
