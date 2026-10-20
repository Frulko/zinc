#!/bin/sh
# zinc:react-native TextInput, Keyboard and KeyboardAvoidingView (ZN-367.02): tests/golden/react-native-input types into a controlled TextInput (onChangeText,
# maxLength, onSubmitEditing), checks the secure / numeric / read-only / multiline flags and autoFocus, shows the on-screen keyboard inset (Keyboard events,
# KeyboardAvoidingView padding and position) and dismisses it.
cd "$(dirname "$0")/../.." || exit 2
out=$(ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=20 ZINC_SIZE=360x640 ZINC_SCALE=1 "$ZINC" run tests/golden/react-native-input 2>&1)
[ "$out" = "$(cat tests/golden/react-native-input/main.out)" ] || { echo "react-native input: $(echo "$out" | diff - tests/golden/react-native-input/main.out | head -6)"; exit 1; }
echo "react native input: ok"
