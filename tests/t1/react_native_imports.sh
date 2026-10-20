#!/bin/sh
# React Native's imports under the react-native preset (ZN-367.05): tests/golden/react-native-imports imports React (default and named) from 'react' and
# View, Text, Button, an aliased Pressable, Animated, Easing, AppRegistry, Platform from 'react-native' and runs; without the preset 'react' stays an error
# (tests/t0/modules.sh); examples/rn-port runs with React Native's imports unchanged (tests/t1/rn_port.sh).
cd "$(dirname "$0")/../.." || exit 2
out=$(ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=30 "$ZINC" run tests/golden/react-native-imports 2>&1)
[ "$out" = "$(cat tests/golden/react-native-imports/main.out)" ] || { echo "react-native imports: $(echo "$out" | diff - tests/golden/react-native-imports/main.out | head -6)"; exit 1; }
echo "react native imports: ok"
