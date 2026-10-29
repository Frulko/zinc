#!/bin/sh
# JSX lowering (ZN-028): a screen written in JSX, lowered against a recording stand-in for the zinc:ui helpers, builds the tree
# of the golden (host tags, attributes, text, components, fragments, &&, ?:, map, node-valued calls); bad JSX is reported with a Z0005 diagnostic.
cd "$(dirname "$0")/../.." || exit 2
fail=0
"$ZINC" run tests/golden/jsx/basic.tsx 2>&1 | diff -q - tests/golden/jsx/basic.out >/dev/null || { echo "jsx basic output differs"; fail=1; }
# a call that gives a node as a child is mounted, a number or String(x) stays text (ZN-689), interpreted and built
"$ZINC" run tests/golden/jsx/node_call.tsx 2>&1 | diff -q - tests/golden/jsx/node_call.out >/dev/null || { echo "jsx node_call output differs"; fail=1; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
if "$ZINC" build tests/golden/jsx/node_call.tsx -o "$tmp/nc" >/dev/null 2>&1; then "$tmp/nc" 2>&1 | diff -q - tests/golden/jsx/node_call.out >/dev/null || { echo "jsx node_call built output differs"; fail=1; }; else echo "jsx node_call build failed"; fail=1; fi
"$ZINC" run tests/golden/jsx/nested_cond.tsx 2>&1 | diff -q - tests/golden/jsx/nested_cond.out >/dev/null || { echo "jsx nested_cond output differs"; fail=1; }   # ZN-373.04
"$ZINC" run tests/golden/jsx/map_cond.tsx 2>&1 | diff -q - tests/golden/jsx/map_cond.out >/dev/null || { echo "jsx map_cond output differs"; fail=1; }   # .map of a conditional
# an app's own Button (components/Button.tsx) is a component, not the host button, on the three engines
for e in --interp "--engine quickjs"; do
  "$ZINC" run tests/golden/jsx/own_button.tsx $e 2>/dev/null | diff -q - tests/golden/jsx/own_button.out >/dev/null || { echo "jsx own_button output differs ($e)"; fail=1; }
done
if "$ZINC" build tests/golden/jsx/own_button.tsx -o "$tmp/ob" >/dev/null 2>&1; then "$tmp/ob" 2>&1 | diff -q - tests/golden/jsx/own_button.out >/dev/null || { echo "jsx own_button built output differs"; fail=1; }; else echo "jsx own_button build failed"; fail=1; fi
"$ZINC" run tests/golden/jsx/bad_attr.tsx 2>&1 | grep -q "Z0005.*unknown attribute 'zoom' on <View>" || { echo "unknown attribute not reported"; fail=1; }
"$ZINC" run tests/golden/jsx/bad_text.tsx 2>&1 | grep -q "Z0005.*can only contain text" || { echo "element inside <Text> not reported"; fail=1; }
"$ZINC" run tests/golden/jsx/bad_class.tsx 2>&1 | grep -q "Z0005.*unknown class .bogus-class." || { echo "unknown class not reported"; fail=1; }
exit $fail
