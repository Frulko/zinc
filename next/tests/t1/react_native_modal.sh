#!/bin/sh
# zinc:react-native Modal and Alert (ZN-367.04): tests/golden/react-native-modal slides a Modal up as a modal layer, closes it on Escape through
# onRequestClose, and runs Alert.alert dialogs (a button closes and calls its onPress, Escape presses cancel, a one-button alert). Linking runs against the
# system plugin's simulator in tests/golden/system/linking (tests/t1/system_sim.sh).
cd "$(dirname "$0")/../.." || exit 2
out=$(ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=70 ZINC_SIZE=390x700 ZINC_SCALE=1 "$ZINC" run tests/golden/react-native-modal 2>&1)
[ "$out" = "$(cat tests/golden/react-native-modal/main.out)" ] || { echo "react-native modal: $(echo "$out" | diff - tests/golden/react-native-modal/main.out | head -6)"; exit 1; }
echo "react native modal: ok"
