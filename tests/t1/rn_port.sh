#!/bin/sh
# A React Native screen run unchanged apart from its imports (ZN-290): examples/rn-port (FlatList, nested flex, percent widths from `${n}%`, an absolute
# badge, numberOfLines, baseline alignment, StyleSheet.hairlineWidth, a TextInput, default export and index.tsx entry) renders to its frame hash in the
# react-native preset, and its layout facts and search filter match tests/golden/rn-port/inspect.out.
cd "$(dirname "$0")/../.." || exit 2
app=../examples/rn-port
export ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=390x844 ZINC_SCALE=1
fail=0
h=$(cd $app && ZINC_FRAMES=3 ZINC_FRAMEHASH=last "$ZINC" run . 2>&1 | grep framehash)
[ "$h" = "$(cat tests/golden/rn-port/frame.hash)" ] || { echo "rn-port frame: $h"; fail=1; }
out=$(cd $app && ZINC_FRAMES=10 "$ZINC" run src/inspect.tsx 2>&1)
[ "$out" = "$(cat tests/golden/rn-port/inspect.out)" ] || { echo "rn-port facts: $(echo "$out" | diff - tests/golden/rn-port/inspect.out | head -6)"; fail=1; }
[ $fail -eq 0 ] && echo "rn port: ok"
exit $fail
