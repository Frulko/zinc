#!/bin/sh
# JSX lowering (ZN-028): a screen written in JSX, lowered against a recording stand-in for the zinc:ui helpers, builds the tree
# of the golden (host tags, attributes, text, components, fragments, &&, ?:, map); bad JSX is reported with a Z0005 diagnostic.
cd "$(dirname "$0")/../.." || exit 2
fail=0
"$ZINC" run tests/golden/jsx/basic.tsx 2>&1 | diff -q - tests/golden/jsx/basic.out >/dev/null || { echo "jsx basic output differs"; fail=1; }
"$ZINC" run tests/golden/jsx/bad_attr.tsx 2>&1 | grep -q "Z0005.*unknown attribute 'zoom' on <View>" || { echo "unknown attribute not reported"; fail=1; }
"$ZINC" run tests/golden/jsx/bad_text.tsx 2>&1 | grep -q "Z0005.*can only contain text" || { echo "element inside <Text> not reported"; fail=1; }
exit $fail
