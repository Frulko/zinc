#!/bin/sh
# An icon name inside an expression (`name={on ? 'heart' : 'star'}`) is compiled in, and <VirtualList aria-label role> compiles, on the interpreter and AOT (QuickJS reads the same icon module and JSX lowering).
cd "$(dirname "$0")/../.." || exit 2
export ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=3 ZINC_SIZE=320x120 ZINC_SCALE=1
fail=0
want="compiled icons: heart, star"
for mode in "--interp" "--native"; do
  # shellcheck disable=SC2086
  out=$("$ZINC" run $mode tests/golden/icons-expr 2>&1 | tail -1)
  [ "$out" = "$want" ] || { echo "icons_expr [$mode]: $out"; fail=1; }
done
[ $fail -eq 0 ] && echo "icons_expr: ok"
exit $fail
