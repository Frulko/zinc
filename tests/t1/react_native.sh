#!/bin/sh
# zinc:react-native, first slice (ZN-367.01): tests/golden/react-native, a React model screen with React Native's names in the rn layout mode. Scripted
# presses check Pressable (in, out, press, long press, disabled), TouchableOpacity's activeOpacity and TouchableHighlight's underlay while pressed, a controlled
# Switch, TouchableWithoutFeedback, and Platform, Dimensions, PixelRatio, StatusBar, processColor; the screen (spinner, switch, black default text) renders to
# its frame hash.
cd "$(dirname "$0")/../.." || exit 2
export ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=360x400 ZINC_SCALE=1
fail=0
out=$(ZINC_FRAMES=60 "$ZINC" run tests/golden/react-native 2>&1)
[ "$out" = "$(cat tests/golden/react-native/main.out)" ] || { echo "react-native: $(echo "$out" | diff - tests/golden/react-native/main.out | head -6)"; fail=1; }
h=$(ZINC_FRAMES=1 ZINC_FRAMEHASH=last "$ZINC" run tests/golden/react-native 2>&1 | grep framehash)
[ "$h" = "$(cat tests/golden/react-native/frame.hash)" ] || { echo "react-native frame: $h"; fail=1; }
[ $fail -eq 0 ] && echo "react native: ok"
exit $fail
