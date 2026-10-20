#!/bin/sh
# zinc:react-native FlatList, SectionList and RefreshControl (ZN-367.03): tests/golden/react-native-lists scrolls a 10 000 item FlatList (rows stay bounded,
# onEndReached once), pulls it to refresh (onRefresh, the spinner row while refreshing), packs a numColumns grid and scrolls a SectionList whose header
# sticks to the top until its section is pushed out.
cd "$(dirname "$0")/../.." || exit 2
out=$(ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=40 ZINC_SIZE=420x640 ZINC_SCALE=1 "$ZINC" run tests/golden/react-native-lists 2>&1)
[ "$out" = "$(cat tests/golden/react-native-lists/main.out)" ] || { echo "react-native lists: $(echo "$out" | diff - tests/golden/react-native-lists/main.out | head -6)"; exit 1; }
echo "react native lists: ok"
