#!/bin/sh
# The RNTester of zinc:react-native (ZN-386): examples/rn-tester's home and every page (Pressable, Switch, TextInput, FlatList, SectionList, Animated,
# gestures, LayoutAnimation, styles, Platform) render to their recorded frame hashes, three of them in the dark scheme too.
cd "$(dirname "$0")/../.." || exit 2
app=../examples/rn-tester
fail=0
while read -r page scheme want; do
  pg=$page; [ "$page" = home ] && pg=''
  sc=''; [ "$scheme" = dark ] && sc=dark
  got=$(cd $app && ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=20 ZINC_SIZE=420x860 ZINC_SCALE=1 ZINC_FRAMEHASH=last RN_TESTER_PAGE=$pg RN_TESTER_SCHEME=$sc "$ZINC" run . 2>&1 | grep framehash | awk '{print $5}')
  [ "$got" = "$want" ] || { echo "rn-tester $page $scheme: $got, recorded $want"; fail=1; }
done < tests/golden/rn-tester/hashes.txt
[ $fail -eq 0 ] && echo "rn tester: ok"
exit $fail
